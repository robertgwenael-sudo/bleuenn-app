// ============================================================
// Saisons en années civiles (migration 016)
// ============================================================
// Une saison est une ANNÉE CIVILE : « 2027 » va du 1er janvier au
// 31 décembre 2027. C'est l'unité de gestion (objectif de CA, bilan) ; la
// lecture des planches, du calendrier et des disponibilités reste par dates,
// toutes saisons confondues.
//
// Rattachement d'une plantation (règle de Marine, tableur « plan année 2 ») :
// une plantation appartient à la saison de l'année de sa PREMIÈRE RÉCOLTE
// prévue. Des renoncules plantées le 1er novembre 2026 et récoltées en
// mars 2027 relèvent de la saison 2027. La saison est PROPOSÉE à la
// création, jamais imposée : l'utilisatrice peut en choisir une autre.
// ============================================================

import { ajouterAnnees, ajouterJours, dateCivile, ecartJours, estDateValide, type Intervalle } from './dates'
import type { CycleCulture, DateISO } from './types'
import { cycleDe, premiereRecolte } from './cultures'

/** Bornes d'une saison civile : du 1er janvier au 31 décembre. */
export function bornesSaison(annee: number): Intervalle {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) throw new Error(`Année de saison invalide : ${annee}`)
  return { debut: dateCivile(annee, 1, 1), fin: dateCivile(annee, 12, 31) }
}

/** Libellé court d'une saison : son année (« 2027 »). */
export function libelleAnnee(s: { year: number }): string {
  return String(s.year)
}

/** Nom proposé pour une nouvelle saison : son année (« 2027 »). */
export function nomSaisonParDefaut(annee: number): string {
  return String(annee)
}

/** Champs du catalogue qui donnent la date de première récolte (013 compris). */
export interface CultureDatesRecolte {
  jours_cellule: number | null
  jours_champ: number | null
  cycle?: CycleCulture | null
  debut_floraison?: string | null
  delai_premiere_floraison_jours?: number | null
}

/**
 * Date de première récolte prévue, calculée comme la vue `plantings_full` :
 * semis + jours en cellule (override non nul, sinon catalogue, sinon 0 ;
 * plant acheté : 0) donne la plantation. Annuelle : + jours au champ
 * (override, sinon catalogue). Vivace ou bisannuelle (013) : premier début
 * de floraison à partir de plantation + délai. `null` si la donnée manque
 * (jours au champ, début de floraison) : on ne la devine pas.
 */
export function dateRecoltePrevue(
  dateSemis: DateISO,
  culture: CultureDatesRecolte,
  overrides?: { jours_cellule_override?: number | null; jours_champ_override?: number | null; achat_plant?: boolean | null },
): DateISO | null {
  if (!estDateValide(dateSemis)) return null
  const jc = overrides?.achat_plant ? 0 : overrides?.jours_cellule_override ? overrides.jours_cellule_override : (culture.jours_cellule ?? 0)
  const plantation = ajouterJours(dateSemis, Number(jc) || 0)
  if (cycleDe(culture) !== 'annuelle') return premiereRecolte({ ...culture, jours_champ: 0 }, plantation)
  const jch = overrides?.jours_champ_override ?? culture.jours_champ
  if (jch === null || jch === undefined || !Number.isFinite(Number(jch))) return null
  return ajouterJours(plantation, Number(jch))
}

/** Année de rattachement : celle de la première récolte prévue. */
export function anneeDeRattachement(dateRecolte: DateISO): number {
  if (!estDateValide(dateRecolte)) throw new Error(`Date de récolte invalide : ${String(dateRecolte)}`)
  return Number(dateRecolte.slice(0, 4))
}

export interface SaisonLite {
  id: string
  name: string
  year: number
  farm_id?: string | null
}

export type SaisonProposee =
  /** La ferme a une saison pour l'année de récolte. */
  | { statut: 'trouvee'; annee: number; saison: SaisonLite }
  /** Pas encore de saison pour cette année : repli sur la saison active, à signaler. */
  | { statut: 'manquante'; annee: number; saison: SaisonLite | null }
  /** Date de récolte non calculable : repli sur la saison active, à signaler. */
  | { statut: 'non_calculable'; annee: null; saison: SaisonLite | null }

/**
 * Saison proposée pour une plantation : celle de l'année de sa première
 * récolte dans la ferme ; à défaut, la saison active (`repli`), avec un
 * statut qui permet de le dire à l'écran plutôt que de le taire.
 */
export function saisonProposee(dateRecolte: DateISO | null, saisons: SaisonLite[], repli: SaisonLite | null): SaisonProposee {
  const ferme = repli?.farm_id ? saisons.filter(s => !s.farm_id || s.farm_id === repli.farm_id) : saisons
  if (!dateRecolte || !estDateValide(dateRecolte)) return { statut: 'non_calculable', annee: null, saison: repli }
  const annee = anneeDeRattachement(dateRecolte)
  // Deux saisons de la même année (données antérieures à 016) : la saison
  // active l'emporte, sinon la première par nom, pour rester déterministe.
  const candidates = ferme.filter(s => s.year === annee)
    .sort((a, b) => (a.id === repli?.id ? -1 : b.id === repli?.id ? 1 : a.name.localeCompare(b.name, 'fr')))
  if (candidates.length) return { statut: 'trouvee', annee, saison: candidates[0] }
  return { statut: 'manquante', annee, saison: repli }
}

/** Phrase courte expliquant le rattachement proposé (sans tiret long). */
export function phraseRattachement(p: SaisonProposee): string {
  switch (p.statut) {
    case 'trouvee':
      return `Première récolte en ${p.annee} : rattachée à ${p.saison.name}.`
    case 'manquante':
      return `Première récolte en ${p.annee}, mais la ferme n'a pas encore de saison ${p.annee} : rattachée à ${p.saison?.name ?? 'la saison active'}. Créez la saison ${p.annee} pour l'y ranger.`
    case 'non_calculable':
      return `Date de récolte non calculable (jours au champ manquants) : rattachée à ${p.saison?.name ?? 'la saison active'}.`
  }
}

export interface PlantationARanger {
  id: string
  culture_name: string
  season_id: string
  season_year: number
  date_recolte: DateISO | null
}

export interface Reclassement {
  planting_id: string
  culture_name: string
  date_recolte: DateISO
  saison_actuelle: string
  /** null : aucune saison de la ferme pour l'année de récolte. */
  saison_cible: string | null
  annee_cible: number
}

/**
 * Plantations dont la saison n'est pas celle de l'année de première récolte
 * (miroir de `plantations_hors_annee_de_recolte`, migration 016). Ne
 * déplace rien : l'écran ou la fonction SQL explicite s'en chargent.
 */
export function plantationsAReclasser(plantings: PlantationARanger[], saisons: SaisonLite[]): Reclassement[] {
  const out: Reclassement[] = []
  for (const p of plantings) {
    if (!p.date_recolte || !estDateValide(p.date_recolte)) continue
    const annee = anneeDeRattachement(p.date_recolte)
    if (annee === p.season_year) continue
    const cible = saisons.filter(s => s.year === annee).sort((a, b) => a.name.localeCompare(b.name, 'fr'))[0] ?? null
    out.push({
      planting_id: p.id, culture_name: p.culture_name, date_recolte: p.date_recolte,
      saison_actuelle: p.season_id, saison_cible: cible?.id ?? null, annee_cible: annee,
    })
  }
  return out
}

/** Années civiles à proposer dans un filtre : celles des saisons, triées, sans doublon. */
export function anneesDesSaisons(saisons: { year: number }[], enPlus: number[] = []): number[] {
  return Array.from(new Set([...saisons.map(s => s.year), ...enPlus].filter(a => Number.isInteger(a)))).sort((a, b) => a - b)
}

/** Une saison de la même ferme existe-t-elle déjà pour cette année ? */
export function saisonDeLAnnee(saisons: SaisonLite[], annee: number, farmId?: string | null): SaisonLite | null {
  return saisons.find(s => s.year === annee && (!farmId || !s.farm_id || s.farm_id === farmId)) ?? null
}

// ------------------------------------------------------------
// Préparer la saison suivante (parcours « Préparer 2027 », 016)
// ------------------------------------------------------------
// Trois étapes, chacune optionnelle après la première :
//  a. créer la saison civile N+1 de la ferme ;
//  b. rattacher à N+1 les plantations de N dont la PREMIÈRE récolte tombe
//     en N+1 (bulbes de novembre, semis de février N+1…), au choix ;
//  c. reprendre le plan de N dans N+1, dates décalées d'un an, SANS les
//     vivaces en place (elles persistent d'une année sur l'autre), sans ce
//     qui est déjà prévu en N+1 au même endroit, et sans les plantations de
//     N dont la récolte n'est pas en N (elles relèvent d'une autre saison).
// Ces règles sont celles des fonctions SQL `reclasser_plantations` et
// `reprendre_plan_dans_saison` (migration 016) : l'aperçu dit exactement ce
// que la base fera.
// ------------------------------------------------------------

export type CycleVie = CycleCulture

export interface PlantationPreparation {
  id: string
  culture_id: string
  culture_name: string
  planche_id: string
  season_id: string
  date_semis: DateISO
  date_recolte: DateISO | null
  /** Migration 013 : dernier jour en place ; null = encore en place. */
  arrachee_le?: DateISO | null
  /** Migration 013 : cycle de la culture (catalogue) ; absent = annuelle. */
  cycle?: CycleVie | null
}

/** Écart maximal (jours) entre deux semis pour juger une plantation « déjà prévue ». */
export const TOLERANCE_DEJA_PREVUE_JOURS = 60

/** Vivace toujours en place : jamais dupliquée, elle refleurit d'elle-même. */
export function estVivaceEnPlace(p: Pick<PlantationPreparation, 'cycle' | 'arrachee_le'>): boolean {
  return p.cycle === 'vivace' && !p.arrachee_le
}

/** Étape b : plantations de la saison source dont la première récolte tombe en `annee`. */
export function plantationsARattacher<T extends PlantationPreparation>(source: T[], sourceId: string, annee: number): T[] {
  return source
    .filter(p => p.season_id === sourceId && !!p.date_recolte && estDateValide(p.date_recolte) && anneeDeRattachement(p.date_recolte) === annee)
    .sort((a, b) => (a.date_recolte! < b.date_recolte! ? -1 : a.date_recolte! > b.date_recolte! ? 1 : a.culture_name.localeCompare(b.culture_name, 'fr')))
}

export interface ApercuReprise<T> {
  copies: (T & { date_semis_copie: DateISO })[]
  vivacesEnPlace: T[]
  dejaPrevues: T[]
  horsAnnee: T[]
}

/**
 * Étape c : ce que `reprendre_plan_dans_saison(source, cible, décalage)`
 * copiera ou laissera, plantation par plantation.
 *  * `source` : plantations de la saison source (après l'étape b) ;
 *  * `cible` : plantations déjà dans la saison cible.
 */
export function apercuReprise<T extends PlantationPreparation>(args: {
  source: T[]
  cible: PlantationPreparation[]
  anneeSource: number
  decalageAnnees?: number
}): ApercuReprise<T> {
  const n = args.decalageAnnees ?? 1
  const out: ApercuReprise<T> = { copies: [], vivacesEnPlace: [], dejaPrevues: [], horsAnnee: [] }
  for (const p of args.source) {
    if (estVivaceEnPlace(p)) { out.vivacesEnPlace.push(p); continue }
    if (!p.date_recolte || !estDateValide(p.date_recolte) || anneeDeRattachement(p.date_recolte) !== args.anneeSource) { out.horsAnnee.push(p); continue }
    const semis = ajouterAnnees(p.date_semis, n)
    const deja = args.cible.some(q => q.planche_id === p.planche_id && q.culture_id === p.culture_id
      && Math.abs(ecartJours(q.date_semis, semis)) <= TOLERANCE_DEJA_PREVUE_JOURS)
    if (deja) { out.dejaPrevues.push(p); continue }
    out.copies.push({ ...p, date_semis_copie: semis })
  }
  return out
}

// ------------------------------------------------------------
// Basculer une saison-plan sur l'année suivante (« 2026 » devient « 2027 »)
// ------------------------------------------------------------
// Miroir de `basculer_saison(saison, année, false)` (016) : même classement,
// pour l'aperçu à l'écran et les tests.
//  * 1re récolte AVANT l'année cible : semis décalé de (cible - année) ans ;
//  * 1re récolte déjà dans l'année cible (bulbes de novembre, semis de
//    février) : laissée ;
//  * vivace en place (non arrachée) déjà plantée au jour dit : laissée, elle
//    refleurit sans replantation ; pas encore plantée : décalée ;
//  * date de récolte non calculable : laissée, et listée.
// ------------------------------------------------------------

export type RaisonLaissee = 'deja_annee_cible' | 'vivace_en_place' | 'recolte_non_calculable'

export interface ApercuBascule<T> {
  decalees: (T & { nouvelle_date_semis: DateISO })[]
  laissees: (T & { raison: RaisonLaissee })[]
}

export function apercuBascule<T extends PlantationPreparation & { date_plantation?: DateISO | null }>(args: {
  plantings: T[]
  anneeSaison: number
  anneeCible: number
  /** Date du jour (Paris) : une vivace est « déjà plantée » si sa plantation est au plus tard ce jour. */
  aujourdhui: DateISO
}): ApercuBascule<T> {
  if (!Number.isInteger(args.anneeCible) || args.anneeCible <= args.anneeSaison) {
    throw new Error(`L'année cible (${args.anneeCible}) doit suivre l'année de la saison (${args.anneeSaison})`)
  }
  const n = args.anneeCible - args.anneeSaison
  const out: ApercuBascule<T> = { decalees: [], laissees: [] }
  const tri = (a: T, b: T) => (a.date_semis < b.date_semis ? -1 : a.date_semis > b.date_semis ? 1 : a.culture_name.localeCompare(b.culture_name, 'fr'))
  for (const p of [...args.plantings].sort(tri)) {
    const plantee = !!p.date_plantation && p.date_plantation <= args.aujourdhui
    if (estVivaceEnPlace(p) && plantee) out.laissees.push({ ...p, raison: 'vivace_en_place' })
    else if (!p.date_recolte || !estDateValide(p.date_recolte)) out.laissees.push({ ...p, raison: 'recolte_non_calculable' })
    else if (anneeDeRattachement(p.date_recolte) >= args.anneeCible) out.laissees.push({ ...p, raison: 'deja_annee_cible' })
    else out.decalees.push({ ...p, nouvelle_date_semis: ajouterAnnees(p.date_semis, n) })
  }
  return out
}

export const LIBELLES_RAISON_LAISSEE: Record<RaisonLaissee, string> = {
  deja_annee_cible: 'première récolte déjà dans l’année',
  vivace_en_place: 'vivace en place, refleurit sans replantation',
  recolte_non_calculable: 'date de récolte non calculable',
}
