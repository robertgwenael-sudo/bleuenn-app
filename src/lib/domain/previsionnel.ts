// ============================================================
// Prévisionnel de chiffre d'affaires par semaine (écran Analytique)
// ============================================================
// Mêmes règles que le prévu de reel.ts : répartition RR/MP/RU par jours de
// récolte, semaines ISO DATÉES (lundi, année comprise), entiers sans perte.
// Le CA d'une plantation est son revenu estimé (`revenu_estime`, calculé
// en base) en centimes, réparti avec les mêmes poids que ses tiges : la
// somme des semaines d'une culture retombe exactement sur la somme des
// revenus estimés de ses plantations.
//
// Remplace l'ancien calcul de l'écran, qui (1) ne gardait que le numéro de
// semaine sans l'année : 2026 et 2027 se mélangeaient, et une récolte à
// cheval sur le 1er janvier disparaissait ; (2) répartissait en euros
// flottants avec un arrondi des tiges par semaine qui en perdait ou en
// ajoutait ; (3) ignorait la règle RR/MP/RU.
// ============================================================

import { ajouterJours, lundisEntre, type Intervalle } from './dates'
import { caPrevuPlantation, repartitionPrevueValorisee, type PlantingReel } from './reel'
import { recoltesDansPeriode } from './cultures'
import type { Centimes, CultureType, DateISO } from './types'

export type PlantingPrevision = PlantingReel

/** CA prévu d'une plantation : voir `caPrevuPlantation` (reel.ts), source unique. */
export const caPlantation = caPrevuPlantation

export interface CultureSemaine {
  culture_name: string
  culture_type: CultureType
  tiges: number
  centimes: Centimes
}

export interface SemainePrevision {
  lundi: DateISO
  tiges: number
  centimes: Centimes
  cultures: CultureSemaine[]
}

export interface CulturePrevision {
  culture_name: string
  culture_type: CultureType
  tiges: number
  centimes: Centimes
  parLundi: Map<DateISO, Centimes>
}

export interface PlantationNonCalculable {
  id: string
  culture_name: string
  raison: string
}

export interface Previsionnel {
  periode: Intervalle
  /** TOUTES les semaines de la période, contiguës, vides comprises. */
  semaines: SemainePrevision[]
  cultures: CulturePrevision[]
  tiges: number
  centimes: Centimes
  /** Semaines ayant au moins une tige prévue. */
  semainesDeVente: number
  non_calculables: PlantationNonCalculable[]
}

/**
 * Prévisionnel sur une période (année civile ou 12 mois glissants), lu par
 * dates sur les plantations fournies (toutes saisons). Une semaine compte
 * si son jeudi est dans la période (`semainesDeLaPeriode`) ; une plantation sans date de récolte ou
 * sans CA calculable est remontée dans `non_calculables`, pas ignorée.
 */
export function previsionnelHebdo(plantings: PlantingPrevision[], periode: Intervalle): Previsionnel {
  const lundis = semainesDeLaPeriode(periode)
  const index = new Map(lundis.map((l, i) => [l, i]))
  const semaines: SemainePrevision[] = lundis.map(lundi => ({ lundi, tiges: 0, centimes: 0, cultures: [] }))
  const parCulture = new Map<string, CulturePrevision>()
  const non_calculables: PlantationNonCalculable[] = []

  // Vivaces : chaque floraison qui touche la période compte (013)
  for (const p of recoltesDansPeriode(plantings, periode)) {
    let repartition
    try {
      if (!p.date_recolte || !p.date_fin) {
        throw new Error((p.cycle ?? 'annuelle') !== 'annuelle' ? 'début de floraison à renseigner' : 'date de récolte non calculable')
      }
      repartition = repartitionPrevueValorisee(p, caPlantation(p))
    } catch (e) {
      non_calculables.push({ id: p.id, culture_name: p.culture_name, raison: e instanceof Error ? e.message : String(e) })
      continue
    }
    for (const r of repartition) {
      const i = index.get(r.lundi)
      if (i === undefined) continue
      const s = semaines[i]
      s.tiges += r.tiges
      s.centimes += r.centimes
      let c = s.cultures.find(x => x.culture_name === p.culture_name)
      if (!c) { c = { culture_name: p.culture_name, culture_type: p.culture_type, tiges: 0, centimes: 0 }; s.cultures.push(c) }
      c.tiges += r.tiges
      c.centimes += r.centimes
      let pc = parCulture.get(p.culture_name)
      if (!pc) { pc = { culture_name: p.culture_name, culture_type: p.culture_type, tiges: 0, centimes: 0, parLundi: new Map() }; parCulture.set(p.culture_name, pc) }
      pc.tiges += r.tiges
      pc.centimes += r.centimes
      pc.parLundi.set(r.lundi, (pc.parLundi.get(r.lundi) ?? 0) + r.centimes)
    }
  }
  for (const s of semaines) s.cultures.sort((a, b) => b.centimes - a.centimes || a.culture_name.localeCompare(b.culture_name, 'fr'))
  const cultures = Array.from(parCulture.values()).sort((a, b) => a.culture_name.localeCompare(b.culture_name, 'fr'))
  return {
    periode, semaines, cultures,
    tiges: semaines.reduce((t, s) => t + s.tiges, 0),
    centimes: semaines.reduce((t, s) => t + s.centimes, 0),
    semainesDeVente: semaines.filter(s => s.tiges > 0).length,
    non_calculables,
  }
}

/**
 * Semaines ISO d'une période : celles dont le JEUDI y tombe (convention
 * ISO, la semaine du 1er janvier 2027 est la S53 de 2026). Ainsi une
 * semaine n'est jamais comptée dans deux années civiles.
 */
export function semainesDeLaPeriode(periode: Intervalle): DateISO[] {
  return lundisEntre({ debut: ajouterJours(periode.debut, -6), fin: periode.fin })
    .filter(l => { const j = ajouterJours(l, 3); return j >= periode.debut && j <= periode.fin })
}

/** Groupes de semaines contiguës par mois (mois du jeudi, qui porte la semaine ISO), pour l'en-tête. */
export function moisDesSemaines(lundis: DateISO[]): { cle: string; annee: number; mois: number; n: number }[] {
  const out: { cle: string; annee: number; mois: number; n: number }[] = []
  for (const l of lundis) {
    const jeudi = ajouterJours(l, 3)
    const annee = Number(jeudi.slice(0, 4)), mois = Number(jeudi.slice(5, 7))
    const last = out[out.length - 1]
    if (last && last.annee === annee && last.mois === mois) last.n++
    else out.push({ cle: `${annee}-${String(mois).padStart(2, '0')}`, annee, mois, n: 1 })
  }
  return out
}
