// ============================================================
// Duplication d'un plan de culture (aperçu avant `duplicate_season_plan`)
// ============================================================
// La fonction SQL `duplicate_season_plan(source, nom, année, décalage)`
// recopie les plantations en décalant la date de semis de N années ; les
// autres dates en découlent (mêmes durées). Avant de l'appeler, l'écran
// peut montrer ce que donnera le plan et SURTOUT les planches encore
// occupées à ces dates — par exemple par des renoncules semées à
// l'automne précédent ou des dahlias restés en terre.
// ============================================================

import { ajouterAnnees, ajouterJours, ecartJours } from './dates'
import { cycleDe } from './cultures'
import { conflitsSiAjout, type ConflitOccupation, type PlancheSurface, type PlantingOccupation } from './occupation'
import type { PlantingFull } from './types'

export type PlantingDuplicable = PlantingOccupation & Pick<PlantingFull, 'planche_id' | 'date_recolte'>

/**
 * Plantations telles que la duplication les créera : semis décalé de
 * `decalageAnnees` (un 29 février devient un 28 février, comme
 * `make_interval` en SQL), autres dates décalées du même nombre de jours.
 * Les identifiants sont préfixés `projet:` pour les distinguer. Les
 * vivaces ne sont pas recopiées.
 */
export function projeterDuplication<T extends PlantingDuplicable>(source: T[], decalageAnnees = 1, saison?: { name: string; year: number }): T[] {
  // Une vivace reste en place d'une année sur l'autre : elle ne se replante
  // pas (comme `duplicate_season_plan` depuis 013).
  return source.filter(p => cycleDe(p) !== 'vivace').map(p => {
    const semis = ajouterAnnees(p.date_semis, decalageAnnees)
    const delta = ecartJours(p.date_semis, semis)
    return {
      ...p,
      id: `projet:${p.id}`,
      date_semis: semis,
      date_plantation: ajouterJours(p.date_plantation, delta),
      date_recolte: ajouterJours(p.date_recolte, delta),
      date_fin: ajouterJours(p.date_fin, delta),
      ...(saison ? { season_name: saison.name, season_year: saison.year } : {}),
    }
  })
}

export interface ConflitDuplication {
  projet: PlantingDuplicable
  conflits: ConflitOccupation[]
}

/**
 * Conflits que provoquerait la duplication, planche par planche, contre
 * TOUTES les plantations existantes (toutes saisons) et contre les autres
 * plantations projetées.
 */
export function conflitsDuplication(args: {
  source: PlantingDuplicable[]
  existantes: PlantingDuplicable[]
  planches: (PlancheSurface & { id: string })[]
  decalageAnnees?: number
}): ConflitDuplication[] {
  const projets = projeterDuplication(args.source, args.decalageAnnees ?? 1)
  const surfaces = new Map(args.planches.map(p => [p.id, p]))
  const out: ConflitDuplication[] = []
  for (const projet of projets) {
    const planche = surfaces.get(projet.planche_id)
    if (!planche) throw new Error(`Planche ${projet.planche_id} inconnue : surface non calculable`)
    const voisines = [...args.existantes, ...projets.filter(x => x.id !== projet.id)]
      .filter(x => x.planche_id === projet.planche_id)
    const conflits = conflitsSiAjout(planche, voisines, projet)
    if (conflits.length) out.push({ projet, conflits })
  }
  return out
}
