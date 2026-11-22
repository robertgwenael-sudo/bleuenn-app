// ============================================================
// Cycles de culture : annuelle, bisannuelle, vivace (migration 013)
// ============================================================
// Une vivace (achillée, ancolie, lupin, pivoine…) est plantée une fois et
// occupe sa planche d'une année sur l'autre, jusqu'à son arrachage. Elle
// fleurit chaque année dans la même fenêtre : on ne duplique pas la
// plantation, on répète sa fenêtre de récolte.
//
//  * `date_recolte` / `date_fin` : PREMIÈRE fenêtre de récolte (comme avant) ;
//  * fenêtre de l'année n : même jour, n années plus tard, même durée ;
//  * occupation : de la plantation à `arrachee_le` inclus ; sans
//    `arrachee_le`, une vivace est en place sans date de fin connue.
//
// Le JAM (« jours à maturité ») de la charte n'est utilisé nulle part : on
// garde jours en cellule, jours au champ, jours de récolte et 1ère date
// d'implantation possible.
// ============================================================

import { ajouterAnnees, ajouterJours, dateCivile, ecartJours, estBissextile, intervalle, minDate, type Intervalle } from './dates'
import type { ChampsCultureCycle, CycleCulture, DateISO } from './types'

export const LIBELLE_CYCLE: Record<CycleCulture, string> = {
  annuelle: 'Annuelle',
  bisannuelle: 'Bisannuelle',
  vivace: 'Vivace',
}

/** Une culture sans cycle renseigné (avant 013) est une annuelle. */
export function cycleDe(x: { cycle?: CycleCulture | null }): CycleCulture {
  return x.cycle ?? 'annuelle'
}

/**
 * Borne de fin d'une occupation sans fin connue (vivace en place). Choisie
 * pour que « lendemain » reste une date à 4 chiffres et se trie bien.
 */
export const EN_PLACE_SANS_FIN: DateISO = '9999-12-30'

export function estSansFin(d: DateISO): boolean {
  return d >= EN_PLACE_SANS_FIN
}

type PlantingCycle = {
  id: string
  date_fin: DateISO
  cycle?: CycleCulture | null
  arrachee_le?: DateISO | null
}

/** Vivace pas encore arrachée (à la date donnée, ou jamais si pas de date). */
export function vivaceEnPlace(p: PlantingCycle, jour?: DateISO): boolean {
  if (cycleDe(p) !== 'vivace') return false
  if (!p.arrachee_le) return true
  return jour !== undefined && p.arrachee_le >= jour
}

/**
 * Dernier jour d'occupation de la planche : `arrachee_le` s'il est connu,
 * sinon `EN_PLACE_SANS_FIN` pour une vivace, sinon `date_fin`.
 */
export function finOccupation(p: PlantingCycle): DateISO {
  if (p.arrachee_le) return p.arrachee_le
  if (cycleDe(p) === 'vivace') return EN_PLACE_SANS_FIN
  if (!p.date_fin) throw new Error(`Plantation ${p.id} : date de fin manquante, occupation non calculable`)
  return p.date_fin
}

/**
 * Fenêtres de récolte qui touchent `periode`. Annuelle et bisannuelle : une
 * seule, [date_recolte, date_fin]. Vivace : la même fenêtre chaque année,
 * tant qu'elle est en place. Une fenêtre est coupée à l'arrachage.
 */
export function fenetresRecolte(
  p: PlantingCycle & { date_recolte: DateISO },
  periode: Intervalle,
): Intervalle[] {
  if (!p.date_recolte || !p.date_fin) throw new Error(`Plantation ${p.id} : dates de récolte manquantes`)
  const duree = ecartJours(p.date_recolte, p.date_fin)
  if (duree < 0) throw new Error(`Plantation ${p.id} : fin de récolte avant le début`)
  const fin = p.arrachee_le ?? (cycleDe(p) === 'vivace' ? EN_PLACE_SANS_FIN : p.date_fin)
  const annees = cycleDe(p) === 'vivace' ? Math.max(0, Number(periode.fin.slice(0, 4)) - Number(p.date_recolte.slice(0, 4))) : 0
  const out: Intervalle[] = []
  for (let n = 0; n <= annees; n++) {
    const debut = ajouterAnnees(p.date_recolte, n)
    if (debut > fin) break
    const f = minDate(ajouterJours(debut, duree), fin)
    if (f >= periode.debut && debut <= periode.fin) out.push(intervalle(debut, f))
  }
  return out
}

/** La plantation est-elle en récolte ce jour-là (vivaces : chaque année) ? */
export function enRecolteLe(p: PlantingCycle & { date_recolte: DateISO }, jour: DateISO): boolean {
  return fenetresRecolte(p, { debut: jour, fin: jour }).length > 0
}

/**
 * Plantation « ancienne » : elle a quitté la planche avant `aujourdhui`.
 * Une vivace en place n'est jamais ancienne, quel que soit son âge.
 */
export function estAncienne(p: PlantingCycle, aujourdhui: DateISO): boolean {
  return finOccupation(p) < aujourdhui
}

// ------------------------------------------------------------
// 1ère date d'implantation possible (jj/mm)
// ------------------------------------------------------------
const RE_JJMM = /^(\d{2})\/(\d{2})$/

/** Lit « 21/05 » ; null si le format ou le jour est invalide (29/02 accepté). */
export function lireJourMois(s: string | null | undefined): { jour: number; mois: number } | null {
  const m = RE_JJMM.exec((s ?? '').trim())
  if (!m) return null
  const jour = Number(m[1]), mois = Number(m[2])
  if (mois < 1 || mois > 12 || jour < 1) return null
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1]
  return jour <= max ? { jour, mois } : null
}

/** Date de l'année `annee` (29/02 ramené au 28 les années non bissextiles). */
function dansAnnee(jm: { jour: number; mois: number }, annee: number): DateISO {
  const jour = jm.mois === 2 && jm.jour === 29 && !estBissextile(annee) ? 28 : jm.jour
  return dateCivile(annee, jm.mois, jour)
}

/** Prochaine date (≥ `aujourdhui`) correspondant à un `jj/mm`. */
export function prochaineOccurrence(jjmm: string, aujourdhui: DateISO): DateISO {
  const jm = lireJourMois(jjmm)
  if (!jm) throw new Error(`Date jj/mm invalide : « ${jjmm} »`)
  const annee = Number(aujourdhui.slice(0, 4))
  const cetteAnnee = dansAnnee(jm, annee)
  return cetteAnnee >= aujourdhui ? cetteAnnee : dansAnnee(jm, annee + 1)
}

/**
 * Date à saisir par défaut pour une nouvelle plantation : semis (ou
 * plantation d'un plant acheté) tel que la mise au champ tombe à la
 * prochaine 1ère date d'implantation possible. Sans cette donnée, ou si
 * la date calculée est passée, on propose `aujourdhui` (jamais une date
 * devinée).
 */
export function dateSuggeree(
  c: { jours_cellule?: number | null; premiere_implantation?: string | null },
  aujourdhui: DateISO,
  achatPlant = false,
): DateISO {
  if (!lireJourMois(c.premiere_implantation)) return aujourdhui
  const implantation = prochaineOccurrence(c.premiere_implantation!, aujourdhui)
  const d = achatPlant ? implantation : ajouterJours(implantation, -(c.jours_cellule || 0))
  return d >= aujourdhui ? d : aujourdhui
}

/**
 * Première récolte (même calcul que le trigger 013) : plantation + jours au
 * champ + années ; pour une vivace ou une bisannuelle dont la floraison est
 * renseignée (jj/mm), la première occurrence de ce jour à partir de là. Sans
 * floraison renseignée : la méthode du tableur (jours au champ), et
 * `floraisonARenseigner` le signale à l'écran.
 */
export function premiereRecolte(
  c: { jours_champ: number; annees_avant_recolte?: number | null; cycle?: CycleCulture | null; floraison_debut?: string | null },
  plantation: DateISO,
): DateISO {
  const cycle = cycleDe(c)
  const base = ajouterAnnees(ajouterJours(plantation, c.jours_champ), cycle === 'vivace' ? c.annees_avant_recolte || 0 : 0)
  if (cycle !== 'annuelle' && lireJourMois(c.floraison_debut)) return prochaineOccurrence(c.floraison_debut!, base)
  return base
}

/** Vivace ou bisannuelle sans période de floraison : dates de récolte approximatives. */
export function floraisonARenseigner(c: { cycle?: CycleCulture | null; floraison_debut?: string | null }): boolean {
  return cycleDe(c) !== 'annuelle' && !lireJourMois(c.floraison_debut)
}

// ------------------------------------------------------------
// Contrôle d'une fiche du catalogue (même règle que la contrainte 013)
// ------------------------------------------------------------
export interface FicheCycle extends ChampsCultureCycle {
  jours_cellule: number
  jours_champ: number
  jours_recolte: number
}

/**
 * Erreurs bloquantes d'une fiche : délai avant floraison ≤ 365 j pour
 * tous, cycle complet ≤ 365 j pour une annuelle, fenêtre de récolte
 * ≤ 365 j, 1ère implantation au format jj/mm. Une vivace n'a plus besoin
 * d'un cycle « étiré » : elle reste en place jusqu'à son arrachage.
 */
export function erreursFicheCycle(f: FicheCycle): string[] {
  const out: string[] = []
  const nombres: [string, number][] = [['jours en cellule', f.jours_cellule], ['jours au champ', f.jours_champ], ['jours de récolte', f.jours_recolte]]
  for (const [nom, v] of nombres) {
    if (!Number.isInteger(v) || v < 0) out.push(`Les ${nom} doivent être un nombre entier positif.`)
  }
  if (out.length) return out
  const cycle = cycleDe(f)
  if (f.jours_cellule + f.jours_champ > 365) {
    out.push(cycle === 'vivace'
      ? 'Jours en cellule + jours au champ dépassent 365 : pour une floraison au-delà d’un an, indiquez les années avant la première récolte.'
      : 'Jours en cellule + jours au champ dépassent 365 j.')
  }
  if (f.jours_recolte > 365) out.push('La fenêtre de récolte dépasse 365 j.')
  if (cycle === 'annuelle' && f.jours_cellule + f.jours_champ + f.jours_recolte > 365) {
    out.push(`Cycle de ${f.jours_cellule + f.jours_champ + f.jours_recolte} j pour une annuelle (365 au plus) : s’il s’agit d’une vivace ou d’une bisannuelle, changez le cycle.`)
  }
  const annees = f.annees_avant_recolte ?? 0
  if (!Number.isInteger(annees) || annees < 0 || annees > 10) out.push('Années avant la première récolte : entre 0 et 10.')
  else if (annees > 0 && cycle !== 'vivace') out.push('Les années avant la première récolte ne concernent que les vivaces.')
  if (f.premiere_implantation && !lireJourMois(f.premiere_implantation)) {
    out.push('1ère implantation possible : format jj/mm attendu (par exemple 21/05).')
  }
  if (f.floraison_debut) {
    if (cycle === 'annuelle') out.push('Le début de floraison annuel ne concerne que les vivaces et les bisannuelles.')
    else if (!lireJourMois(f.floraison_debut)) out.push('Début de floraison : format jj/mm attendu (par exemple 15/06).')
  }
  return out
}
