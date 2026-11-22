// ============================================================
// Coûts, temps passé et marge par culture
// ============================================================
// Question posée : « le zinnia rapporte X € de marge par m², le dahlia Y €
// une fois le temps compté », pour décider quoi garder l'an prochain.
//
// Tout se calcule en centimes entiers (montants.ts) et en minutes entières.
// Aucune lecture de l'horloge : l'appelant fournit les lignes de LA saison
// de gestion étudiée (dépenses, temps, plantations, ventes).
//
// MARGE PAR CULTURE
//   CA réel          = Σ lignes de vente rattachées à la culture (sale_lines)
//   dépenses         = affectées à la culture (culture_id)
//                    + part des dépenses d'une planche (planche_id sans
//                      culture_id), réparties entre les cultures présentes
//                      sur cette planche pendant la saison, au prorata
//                      m² × jours d'occupation
//                    + part des dépenses non affectées (ni culture ni
//                      planche), au prorata de la CLÉ choisie (ci-dessous)
//   temps            = minutes affectées (culture, puis planche comme
//                      ci-dessus) + part du temps non affecté si l'option
//                      est active, même clé que les dépenses
//   temps valorisé   = heures × taux horaire de la ferme
//   marge hors temps = CA réel − dépenses
//   marge            = marge hors temps − temps valorisé
//   marge / m²       = marge ÷ m² cultivés (Σ surface des plantations de
//                      la culture dans la saison)
//   € / heure        = marge hors temps ÷ heures : ce que chaque heure
//                      passée sur la culture a rapporté, à comparer au
//                      taux horaire (indépendant du taux, donc toujours
//                      calculable dès qu'il y a du temps saisi)
//   CA / heure       = CA réel ÷ heures
//
// CLÉ DE RÉPARTITION des non affectés (choix de l'utilisateur, affiché) :
//   'surface' : m² × jours d'occupation de la planche (occupation.ts). Une
//               culture qui tient 10 m² pendant 200 jours porte plus de
//               frais généraux qu'une autre sur 10 m² pendant 60 jours ;
//   'ca'      : CA réel rattaché. Les cultures sans vente ne portent rien.
//
// NON CALCULABLE : jamais de zéro silencieux. Une grandeur qu'on ne peut pas
// établir vaut `null` avec sa raison : taux horaire non renseigné, aucune
// surface cultivée, aucune heure saisie, répartition impossible faute de
// poids (aucune plantation datée, aucun CA rattaché)…
//
// Limite assumée (comme reel.ts) : une vente saisie sans lignes, ou une
// ligne sans culture, n'est rattachée à aucune culture. Son montant est
// rendu à part (`ca_non_rattache`), jamais réparti en douce.
// ============================================================

import { dureeJours } from './dates'
import { diviserArrondi, enCentiemes, eurosEnCentimes, repartirEntier } from './montants'
import { periodeOccupation, type PlantingOccupation } from './occupation'
import { montantLigne, totalVente, type VenteCalcul } from './ventes'
import {
  COST_CATEGORIES, TIME_KINDS,
  type Centimes, type Cost, type CostCategory, type EurosNumeric, type PlantingFull, type TimeEntry, type TimeKind,
} from './types'

// ------------------------------------------------------------
// Grandeur éventuellement non calculable
// ------------------------------------------------------------
export type Grandeur = { valeur: number; raison: null } | { valeur: null; raison: string }

export const calculee = (valeur: number): Grandeur => ({ valeur, raison: null })
export const nonCalculable = (raison: string): Grandeur => ({ valeur: null, raison })

/** Combine deux grandeurs ; la première raison d'échec l'emporte. */
function combiner(a: Grandeur, b: Grandeur, f: (x: number, y: number) => number): Grandeur {
  if (a.valeur === null) return a
  if (b.valeur === null) return b
  return calculee(f(a.valeur, b.valeur))
}

export const RAISONS = {
  tauxAbsent: 'Taux horaire non renseigné : le temps n’est pas valorisé',
  sansSurface: 'Aucune surface cultivée cette saison',
  sansTemps: 'Aucun temps saisi',
  sansPoidsSurface: 'Répartition impossible : aucune plantation datée cette saison',
  sansPoidsCa: 'Répartition impossible : aucun CA rattaché à une culture',
} as const

// ------------------------------------------------------------
// Entrées
// ------------------------------------------------------------
export type CoutCalcul = Pick<Cost, 'date' | 'category' | 'amount' | 'culture_id' | 'planche_id'>
export type TempsCalcul = Pick<TimeEntry, 'date' | 'minutes' | 'kind' | 'culture_id' | 'planche_id'>
export type PlantingCout = PlantingOccupation & Pick<PlantingFull, 'culture_id' | 'planche_id'>

export type CleRepartition = 'surface' | 'ca'

export const LIBELLES_CLES: Record<CleRepartition, string> = {
  surface: 'au prorata de la surface cultivée (m² × jours d’occupation)',
  ca: 'au prorata du CA réel de chaque culture',
}

export const LIBELLES_CATEGORIES: Record<CostCategory, string> = {
  semences: 'Semences',
  plants_bulbes: 'Plants, bulbes, tubercules',
  terreau_substrat: 'Terreau, substrat',
  engrais_traitements: 'Engrais, traitements',
  materiel: 'Matériel',
  emballage: 'Emballage',
  transport: 'Transport',
  main_oeuvre_externe: 'Main-d’œuvre externe',
  autre: 'Autre',
}

export const LIBELLES_TRAVAUX: Record<TimeKind, string> = {
  semis: 'Semis', repiquage: 'Repiquage', plantation: 'Plantation', pincage: 'Pinçage',
  tuteurage: 'Tuteurage, filet', desherbage: 'Désherbage', recolte: 'Récolte', irrigation: 'Irrigation',
  traitement: 'Traitement', livraison: 'Livraison', vente: 'Vente', administratif: 'Administratif', autre: 'Autre',
}

export function estCategorie(c: unknown): c is CostCategory {
  return typeof c === 'string' && (COST_CATEGORIES as readonly string[]).includes(c)
}
export function estTypeTravail(k: unknown): k is TimeKind {
  return typeof k === 'string' && (TIME_KINDS as readonly string[]).includes(k)
}

/** Montant d'une dépense en centimes ; refuse un montant nul ou négatif (contrainte de la table). */
export function montantCout(c: Pick<Cost, 'amount'>): Centimes {
  const v = eurosEnCentimes(c.amount)
  if (v <= 0) throw new Error(`Dépense de montant invalide : ${String(c.amount)}`)
  return v
}

function minutesValides(t: Pick<TimeEntry, 'minutes'>): number {
  if (!Number.isInteger(t.minutes) || t.minutes <= 0) throw new Error(`Durée invalide : ${t.minutes} min`)
  return t.minutes
}

// ------------------------------------------------------------
// Totaux simples
// ------------------------------------------------------------
export interface TotalCategorie { categorie: CostCategory; libelle: string; total: Centimes; nb: number }

/** Dépenses par catégorie, dans l'ordre de COST_CATEGORIES, catégories vides omises. */
export function depensesParCategorie(couts: CoutCalcul[]): TotalCategorie[] {
  const m = new Map<CostCategory, { total: number; nb: number }>()
  for (const c of couts) {
    if (!estCategorie(c.category)) throw new Error(`Catégorie de dépense inconnue : ${String(c.category)}`)
    const x = m.get(c.category) ?? { total: 0, nb: 0 }
    m.set(c.category, { total: x.total + montantCout(c), nb: x.nb + 1 })
  }
  return COST_CATEGORIES.filter(k => m.has(k)).map(k => ({ categorie: k, libelle: LIBELLES_CATEGORIES[k], ...m.get(k)! }))
}

/** Dépenses affectées directement, par culture ; clé `null` = sans culture. */
export function depensesParCulture(couts: CoutCalcul[]): Map<string | null, Centimes> {
  const m = new Map<string | null, Centimes>()
  for (const c of couts) m.set(c.culture_id, (m.get(c.culture_id) ?? 0) + montantCout(c))
  return m
}

export interface TotalMois { mois: string; total: Centimes; nb: number }

/** Dépenses par mois civil (`YYYY-MM`), triées. */
export function depensesParMois(couts: CoutCalcul[]): TotalMois[] {
  const m = new Map<string, { total: number; nb: number }>()
  for (const c of couts) {
    const k = c.date.slice(0, 7)
    const x = m.get(k) ?? { total: 0, nb: 0 }
    m.set(k, { total: x.total + montantCout(c), nb: x.nb + 1 })
  }
  return Array.from(m.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).map(([mois, x]) => ({ mois, ...x }))
}

/** Minutes par culture ; clé `null` = sans culture. */
export function tempsParCulture(temps: TempsCalcul[]): Map<string | null, number> {
  const m = new Map<string | null, number>()
  for (const t of temps) m.set(t.culture_id, (m.get(t.culture_id) ?? 0) + minutesValides(t))
  return m
}

export interface TotalTravail { kind: TimeKind; libelle: string; minutes: number; valorise: Grandeur }

/** Minutes par type de travail (ordre de TIME_KINDS), valorisées si un taux existe. */
export function tempsParType(temps: TempsCalcul[], tauxHoraire: EurosNumeric | null): TotalTravail[] {
  const m = new Map<TimeKind, number>()
  for (const t of temps) {
    if (!estTypeTravail(t.kind)) throw new Error(`Type de travail inconnu : ${String(t.kind)}`)
    m.set(t.kind, (m.get(t.kind) ?? 0) + minutesValides(t))
  }
  return TIME_KINDS.filter(k => m.has(k)).map(k => ({
    kind: k, libelle: LIBELLES_TRAVAUX[k], minutes: m.get(k)!, valorise: valoriserMinutes(m.get(k)!, tauxHoraire),
  }))
}

/** Taux horaire en centimes, ou null s'il n'est pas renseigné. Un taux ≤ 0 est une erreur. */
export function tauxHoraireCentimes(taux: EurosNumeric | null | undefined): Centimes | null {
  if (taux === null || taux === undefined || (typeof taux === 'string' && taux.trim() === '')) return null
  const c = eurosEnCentimes(taux)
  if (c <= 0) throw new Error(`Taux horaire invalide : ${String(taux)}`)
  return c
}

/**
 * Valeur de `minutes` au taux horaire, arrondie au centime. Zéro minute
 * vaut zéro même sans taux ; sinon, sans taux, « non calculable ».
 */
export function valoriserMinutes(minutes: number, taux: EurosNumeric | null | undefined): Grandeur {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`Durée invalide : ${minutes} min`)
  if (minutes === 0) return calculee(0)
  const t = tauxHoraireCentimes(taux)
  if (t === null) return nonCalculable(RAISONS.tauxAbsent)
  return calculee(Number(diviserArrondi(BigInt(minutes) * BigInt(t), BigInt(60))))
}

/** « 1 h 05 », « 45 min ». */
export function formatDuree(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  const s = minutes < 0 ? '−' : ''
  if (h === 0) return `${s}${m} min`
  return `${s}${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`
}

// ------------------------------------------------------------
// Poids de répartition
// ------------------------------------------------------------
/** m² en centièmes entiers (les surfaces sont des numeric décimaux : 4,5 m²). */
function m2Centiemes(surface: EurosNumeric): number {
  return enCentiemes(surface, 'Surface')
}

export interface PoidsSurface {
  /** Σ centièmes de m² × jours d'occupation, par culture. */
  parCulture: Map<string, number>
  /** Même chose par planche puis par culture. */
  parPlanche: Map<string, Map<string, number>>
  /** Σ surfaces en centièmes de m², par culture (pour la marge au m²). */
  surfaceParCulture: Map<string, number>
  /** Plantations écartées faute de dates (occupation non calculable). */
  ignorees: string[]
}

export function poidsSurface(plantings: PlantingCout[]): PoidsSurface {
  const parCulture = new Map<string, number>()
  const parPlanche = new Map<string, Map<string, number>>()
  const surfaceParCulture = new Map<string, number>()
  const ignorees: string[] = []
  for (const p of plantings) {
    const s = m2Centiemes(p.surface_m2)
    surfaceParCulture.set(p.culture_id, (surfaceParCulture.get(p.culture_id) ?? 0) + s)
    let jours: number
    try { jours = dureeJours(periodeOccupation(p)) } catch { ignorees.push(p.id); continue }
    const w = s * jours
    parCulture.set(p.culture_id, (parCulture.get(p.culture_id) ?? 0) + w)
    const pl = parPlanche.get(p.planche_id) ?? new Map<string, number>()
    pl.set(p.culture_id, (pl.get(p.culture_id) ?? 0) + w)
    parPlanche.set(p.planche_id, pl)
  }
  return { parCulture, parPlanche, surfaceParCulture, ignorees }
}

export interface CaCultures { parCulture: Map<string, Centimes>; nonRattache: Centimes }

/** CA réel par culture (lignes de vente) et CA non rattachable à une culture. */
export function caParCulture(ventes: VenteCalcul[]): CaCultures {
  const parCulture = new Map<string, Centimes>()
  let nonRattache = 0
  for (const v of ventes) {
    if (v.lignes && v.lignes.length > 0) {
      for (const l of v.lignes) {
        if (l.culture_id) parCulture.set(l.culture_id, (parCulture.get(l.culture_id) ?? 0) + montantLigne(l))
        else nonRattache += montantLigne(l)
      }
    } else {
      nonRattache += totalVente(v)
    }
  }
  return { parCulture, nonRattache }
}

/**
 * Répartit un entier (centimes ou minutes) au prorata de poids, sans perte
 * d'arrondi. `null` si aucun poids positif et un total non nul.
 */
export function repartirSelon(total: number, poids: Map<string, number>): Map<string, number> | null {
  const cles = Array.from(poids.keys()).filter(k => (poids.get(k) ?? 0) > 0).sort()
  if (total === 0) return new Map(cles.map(k => [k, 0]))
  if (cles.length === 0) return null
  const parts = repartirEntier(total, cles.map(k => poids.get(k)!))
  return new Map(cles.map((k, i) => [k, parts[i]]))
}

// ------------------------------------------------------------
// Marge par culture
// ------------------------------------------------------------
export interface OptionsMarge {
  cle: CleRepartition
  /** Répartir aussi le temps sans culture ni planche (vente, administratif…). Défaut : oui. */
  repartirTempsNonAffecte?: boolean
}

export interface MargeCulture {
  culture_id: string
  libelle: string
  /** Σ surfaces des plantations de la saison, en m². */
  surface_m2: number
  nb_plantations: number
  ca: Centimes
  depenses_directes: Centimes
  /** Part des dépenses saisies sur une planche sans culture. */
  depenses_planche: Centimes
  /** Part des dépenses non affectées (frais généraux). */
  depenses_reparties: Grandeur
  depenses: Grandeur
  minutes_directes: number
  minutes_planche: number
  minutes_reparties: Grandeur
  minutes: Grandeur
  temps_valorise: Grandeur
  marge_hors_temps: Grandeur
  marge: Grandeur
  marge_m2: Grandeur
  /** Marge hors temps ÷ m² : lisible même sans taux horaire. */
  marge_hors_temps_m2: Grandeur
  /** Marge hors temps ÷ heures : ce qu'a rapporté chaque heure passée. */
  marge_par_heure: Grandeur
  ca_par_heure: Grandeur
}

export interface SyntheseMarges {
  lignes: MargeCulture[]
  cle: CleRepartition
  ca_rattache: Centimes
  ca_non_rattache: Centimes
  depenses_total: Centimes
  /** Dépenses sans culture : sur une planche, et sans rien du tout. */
  depenses_planche: Centimes
  depenses_non_affectees: Centimes
  /** Dépenses de planche sans culture présente : reversées dans les non affectées. */
  depenses_planche_reversees: Centimes
  minutes_total: number
  minutes_non_affectees: number
  temps_valorise_total: Grandeur
  /** CA total (rattaché ou non) − dépenses − temps valorisé. */
  marge_globale: Grandeur
  marge_globale_hors_temps: Centimes
  /** Raison d'échec de la répartition des non affectés, s'il y en a une. */
  repartition_impossible: string | null
  plantations_ignorees: string[]
}

/**
 * Bilan de rentabilité par culture pour une saison. Les entrées doivent
 * toutes appartenir à la même saison de gestion.
 */
export function margesParCulture(args: {
  couts: CoutCalcul[]
  temps: TempsCalcul[]
  plantings: PlantingCout[]
  ventes: VenteCalcul[]
  /** Noms des cultures (catalogue) ; à défaut, celui des plantations. */
  cultures?: { id: string; name: string }[]
  tauxHoraire: EurosNumeric | null | undefined
  options: OptionsMarge
}): SyntheseMarges {
  const { couts, temps, plantings, ventes, tauxHoraire, options } = args
  const repartirTemps = options.repartirTempsNonAffecte !== false
  tauxHoraireCentimes(tauxHoraire) // valide le taux dès l'entrée

  const ps = poidsSurface(plantings)
  const ca = caParCulture(ventes)

  // 1. Affectation directe, puis par planche, le reste au pot commun.
  const depDirect = new Map<string, number>()
  const depPlanche = new Map<string, number>()
  const minDirect = new Map<string, number>()
  const minPlanche = new Map<string, number>()
  let potDepenses = 0, potMinutes = 0, depensesPlanche = 0, reversees = 0
  let depensesTotal = 0, minutesTotal = 0

  const ajouter = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  /** Une planche sans plantation datée cette saison ne peut rien recevoir : retour au pot. */
  const surPlanche = (plancheId: string, v: number, cible: Map<string, number>): boolean => {
    const poids = ps.parPlanche.get(plancheId)
    const parts = poids ? repartirSelon(v, poids) : null
    if (!parts) return false
    for (const [k, x] of parts) ajouter(cible, k, x)
    return true
  }

  for (const c of couts) {
    const v = montantCout(c)
    depensesTotal += v
    if (c.culture_id) ajouter(depDirect, c.culture_id, v)
    else if (c.planche_id) {
      depensesPlanche += v
      if (!surPlanche(c.planche_id, v, depPlanche)) { potDepenses += v; reversees += v }
    } else potDepenses += v
  }
  for (const t of temps) {
    const v = minutesValides(t)
    minutesTotal += v
    if (t.culture_id) ajouter(minDirect, t.culture_id, v)
    else if (t.planche_id && surPlanche(t.planche_id, v, minPlanche)) { /* réparti */ }
    else potMinutes += v
  }

  // 2. Répartition du pot commun selon la clé choisie.
  const poids = options.cle === 'surface' ? ps.parCulture : ca.parCulture
  const raisonPoids = options.cle === 'surface' ? RAISONS.sansPoidsSurface : RAISONS.sansPoidsCa
  const partsDep = repartirSelon(potDepenses, poids)
  const partsMin = repartirTemps ? repartirSelon(potMinutes, poids) : new Map<string, number>()

  // 3. Lignes : toute culture plantée, vendue, ou portant une dépense / un temps.
  const ids = new Set<string>([
    ...plantings.map(p => p.culture_id), ...ca.parCulture.keys(), ...depDirect.keys(), ...minDirect.keys(),
  ])
  const noms = new Map<string, string>()
  for (const p of plantings) noms.set(p.culture_id, p.culture_name)
  for (const c of args.cultures ?? []) noms.set(c.id, c.name)
  const nbPlantations = new Map<string, number>()
  for (const p of plantings) nbPlantations.set(p.culture_id, (nbPlantations.get(p.culture_id) ?? 0) + 1)

  const lignes: MargeCulture[] = Array.from(ids).map(id => {
    const caC = ca.parCulture.get(id) ?? 0
    const dd = depDirect.get(id) ?? 0
    const dp = depPlanche.get(id) ?? 0
    const dr: Grandeur = partsDep ? calculee(partsDep.get(id) ?? 0) : nonCalculable(raisonPoids)
    const depenses = combiner(calculee(dd + dp), dr, (a, b) => a + b)
    const md = minDirect.get(id) ?? 0
    const mp = minPlanche.get(id) ?? 0
    const mr: Grandeur = partsMin ? calculee(partsMin.get(id) ?? 0) : nonCalculable(raisonPoids)
    const minutes = combiner(calculee(md + mp), mr, (a, b) => a + b)
    const tempsValorise: Grandeur = minutes.valeur === null ? minutes : valoriserMinutes(minutes.valeur, tauxHoraire)
    const margeHT = combiner(calculee(caC), depenses, (a, b) => a - b)
    const marge = combiner(margeHT, tempsValorise, (a, b) => a - b)
    const surfC = ps.surfaceParCulture.get(id) ?? 0
    const parM2 = (g: Grandeur): Grandeur => {
      if (g.valeur === null) return g
      if (surfC <= 0) return nonCalculable(RAISONS.sansSurface)
      return calculee(Number(diviserArrondi(BigInt(g.valeur) * BigInt(100), BigInt(surfC))))
    }
    const parHeure = (g: Grandeur): Grandeur => {
      if (g.valeur === null) return g
      if (minutes.valeur === null) return minutes
      if (minutes.valeur <= 0) return nonCalculable(RAISONS.sansTemps)
      return calculee(Number(diviserArrondi(BigInt(g.valeur) * BigInt(60), BigInt(minutes.valeur))))
    }
    return {
      culture_id: id,
      libelle: noms.get(id) ?? 'Culture inconnue',
      surface_m2: surfC / 100,
      nb_plantations: nbPlantations.get(id) ?? 0,
      ca: caC,
      depenses_directes: dd, depenses_planche: dp, depenses_reparties: dr, depenses,
      minutes_directes: md, minutes_planche: mp, minutes_reparties: mr, minutes,
      temps_valorise: tempsValorise,
      marge_hors_temps: margeHT, marge, marge_m2: parM2(marge), marge_hors_temps_m2: parM2(margeHT),
      marge_par_heure: parHeure(margeHT), ca_par_heure: parHeure(calculee(caC)),
    }
  }).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))

  // 4. Totaux de la ferme : ils ne dépendent d'aucune répartition.
  const caTotal = sommeMap(ca.parCulture) + ca.nonRattache
  const tempsValoriseTotal = valoriserMinutes(minutesTotal, tauxHoraire)
  const margeGlobaleHT = caTotal - depensesTotal
  return {
    lignes,
    cle: options.cle,
    ca_rattache: sommeMap(ca.parCulture),
    ca_non_rattache: ca.nonRattache,
    depenses_total: depensesTotal,
    depenses_planche: depensesPlanche,
    depenses_non_affectees: potDepenses - reversees,
    depenses_planche_reversees: reversees,
    minutes_total: minutesTotal,
    minutes_non_affectees: potMinutes,
    temps_valorise_total: tempsValoriseTotal,
    marge_globale: combiner(calculee(margeGlobaleHT), tempsValoriseTotal, (a, b) => a - b),
    marge_globale_hors_temps: margeGlobaleHT,
    repartition_impossible: (partsDep && partsMin) ? null : raisonPoids,
    plantations_ignorees: ps.ignorees,
  }
}

function sommeMap(m: Map<string, number>): number {
  let s = 0
  for (const v of m.values()) s += v
  return s
}

// ------------------------------------------------------------
// Saisie
// ------------------------------------------------------------
/**
 * Lit une saisie de durée : « 45 », « 45 min », « 1h30 », « 1 h 30 »,
 * « 1,5 h ». Renvoie des minutes entières > 0, ou null si illisible.
 */
export function lireDuree(saisie: string): number | null {
  const s = saisie.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  let m = /^(\d+)(?:min|mn|m)?$/.exec(s)
  if (m) return positif(Number(m[1]))
  m = /^(\d+)h(\d{1,2})?(?:min|mn|m)?$/.exec(s)
  if (m) return Number(m[2] ?? 0) < 60 ? positif(Number(m[1]) * 60 + Number(m[2] ?? 0)) : null
  m = /^(\d+)[.,](\d+)h$/.exec(s)
  if (m) {
    // heures décimales, sans flottant : centièmes d'heure × 60 / 100
    const centiemes = enCentiemes(`${m[1]}.${m[2]}`, 'Durée')
    return positif(Number(diviserArrondi(BigInt(centiemes) * BigInt(60), BigInt(100))))
  }
  return null
}

function positif(n: number): number | null {
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
