// ============================================================
// Prévu contre réel
// ============================================================
// Prévu : `tiges_estimees` de chaque plantation, valorisé à son
// `prix_tige`. Réel : récoltes (`harvests`), pertes (`losses`) et ventes.
//
// Limite assumée : une vente est rattachée à une CULTURE (sale_lines.
// culture_id), jamais à une plantation ni à une planche. Le CA réel n'est
// donc calculable que par culture, par semaine et au total ; par
// plantation et par jardin il vaut `null` (« non calculable »), plutôt
// qu'une répartition inventée.
// ============================================================

import { ajouterJours, cleSemaine, dansIntervalle, ecartJours, joursEntre, lundiDeSemaine, type Intervalle } from './dates'
import { eurosEnCentimes, produitCentimes, repartirEntier } from './montants'
import { montantLigne, totalVente, type VenteCalcul } from './ventes'
import type {
  Centimes, CultureType, DateISO, EurosNumeric, HarvestLite, Loss, LossReason, PlantingActual, PlantingFull,
} from './types'
import { LOSS_REASONS } from './types'
import { recoltesDansPeriode } from './cultures'

export type PlantingReel = Pick<PlantingFull,
  'id' | 'culture_id' | 'culture_name' | 'culture_type' | 'garden_id' | 'garden_name'
  | 'date_recolte' | 'date_fin' | 'tiges_estimees' | 'prix_tige'
> & Partial<Pick<PlantingFull, 'planche_name' | 'season_id' | 'cycle' | 'arrachee_le'>> & {
  /** Revenu estimé calculé en base (trigger) ; s'il est là, il fait foi pour le CA prévu. */
  revenu_estime?: EurosNumeric | null
}

export type LossLite = Pick<Loss, 'planting_id' | 'culture_id' | 'date' | 'tiges' | 'reason'>

// ------------------------------------------------------------
// Répartition du prévu dans le temps
// ------------------------------------------------------------
/**
 * Jours de récolte d'une plantation selon le type de culture (la
 * répartition par semaine, elle, passe par `semainesDeRecoltePrevues`) :
 *
 *  * RR (récolte répétitive : cosmos, zinnia, dahlia…) : production étalée
 *    UNIFORMÉMENT sur toute la période [date_recolte, date_fin]. En réalité
 *    la courbe monte, plafonne puis décroît ; l'uniforme surestime le début
 *    et la fin, mais ne demande aucun paramètre de plus.
 *  * RU (récolte unique : tournesol, giroflée…) : tout est compté la
 *    SEMAINE de date_recolte, même si la récolte s'étire de quelques jours.
 *  * MP (moyenne) : étalé uniformément sur la PREMIÈRE MOITIÉ de la
 *    période (arrondie au jour supérieur) : une ou deux grosses coupes puis
 *    des repousses plus faibles, approchées par zéro.
 *
 * Les bornes sont incluses, comme pour l'occupation. Le total réparti est
 * exactement `tiges_estimees` (arrondi à l'entier), sans perte d'arrondi.
 */
export function joursDeRecoltePrevus(p: Pick<PlantingReel, 'culture_type' | 'date_recolte' | 'date_fin'>): DateISO[] {
  const fin = p.date_fin < p.date_recolte ? p.date_recolte : p.date_fin
  const tous = joursEntre({ debut: p.date_recolte, fin })
  return selonType(p.culture_type, tous)
}

function selonType(type: CultureType, jours: DateISO[]): DateISO[] {
  switch (type) {
    case 'RR': return jours
    case 'RU': return [jours[0]]
    case 'MP': return jours.slice(0, Math.ceil(jours.length / 2))
    default: throw new Error(`Type de culture inconnu : ${String(type)}`)
  }
}

export function tigesEstimees(p: Pick<PlantingReel, 'id' | 'tiges_estimees'>): number {
  const n = Number(p.tiges_estimees)
  if (!Number.isFinite(n)) throw new Error(`Plantation ${p.id} : tiges estimées non renseignées`)
  return Math.round(n)
}

export interface PrevuSemaine {
  lundi: DateISO
  tiges: number
}

/**
 * Semaines de récolte prévues d'une plantation (règle validée par Marine,
 * 22/11/2026, celle de son tableur : « tiges vendues par semaine = tiges
 * nettes / nombre de semaines de récolte ») :
 *  * nombre de semaines = ARRONDI SUPÉRIEUR de jours de récolte / 7 (au
 *    moins une), jours de récolte = date_fin − date_recolte ;
 *  * semaines ISO consécutives à partir de celle de date_recolte, DATÉES :
 *    une récolte à cheval sur le 1er janvier garde décembre puis janvier ;
 *  * puis la règle de type ci-dessus sur ces semaines : RR toutes, MP la
 *    première moitié (arrondie au supérieur), RU la première.
 * Chaque semaine retenue pèse autant ; `repartirEntier` fait tomber la somme
 * exactement sur les tiges nettes et sur le revenu.
 */
export function semainesDeRecoltePrevues(p: Pick<PlantingReel, 'culture_type' | 'date_recolte' | 'date_fin'>): DateISO[] {
  const jours = Math.max(0, ecartJours(p.date_recolte, p.date_fin))
  const n = Math.max(1, Math.ceil(jours / 7))
  const premier = lundiDeSemaine(p.date_recolte)
  return selonType(p.culture_type, Array.from({ length: n }, (_, i) => ajouterJours(premier, 7 * i)))
}

/** Poids des semaines de récolte (une part égale chacune), pour `repartirEntier`. */
export function joursDeRecolteParSemaine(p: Pick<PlantingReel, 'culture_type' | 'date_recolte' | 'date_fin'>): { lundi: DateISO; jours: number }[] {
  return semainesDeRecoltePrevues(p).map(lundi => ({ lundi, jours: 1 }))
}

/** Tiges prévues d'une plantation, par semaine ISO (lundi). */
export function repartitionPrevue(p: PlantingReel): PrevuSemaine[] {
  const semaines = joursDeRecolteParSemaine(p)
  const parts = repartirEntier(tigesEstimees(p), semaines.map(s => s.jours))
  return semaines.map((s, i) => ({ lundi: s.lundi, tiges: parts[i] }))
}

export interface PrevuSemaineValorise extends PrevuSemaine {
  centimes: Centimes
}

/**
 * Tiges ET chiffre d'affaires prévus d'une plantation, par semaine, en
 * centimes entiers. Le CA total (`caTotal`, en général le revenu estimé de
 * la plantation) est réparti avec les mêmes poids que les tiges, par plus
 * forts restes : la somme des semaines retombe exactement sur `caTotal`.
 */
export function repartitionPrevueValorisee(p: PlantingReel, caTotal: Centimes): PrevuSemaineValorise[] {
  const semaines = joursDeRecolteParSemaine(p)
  const poids = semaines.map(s => s.jours)
  const tiges = repartirEntier(tigesEstimees(p), poids)
  const centimes = repartirEntier(caTotal, poids)
  return semaines.map((s, i) => ({ lundi: s.lundi, tiges: tiges[i], centimes: centimes[i] }))
}

/**
 * CA prévu d'une plantation en centimes : son revenu estimé (calculé en
 * base) s'il est renseigné, sinon tiges estimées × prix à la tige. Lève une
 * erreur si aucun des deux n'est calculable (jamais de 0 € silencieux).
 * Source unique du CA prévu pour Analytique, Prévu/réel et Disponibilités.
 */
export function caPrevuPlantation(p: PlantingReel): Centimes {
  if (p.revenu_estime !== null && p.revenu_estime !== undefined && p.revenu_estime !== '') return eurosEnCentimes(p.revenu_estime)
  if (p.prix_tige === null || p.prix_tige === undefined || (p.prix_tige as unknown) === '') {
    throw new Error(`${p.culture_name} : prix à la tige manquant, CA non calculable`)
  }
  return caPrevu(tigesEstimees(p), p.prix_tige)
}

/**
 * Tiges prévues par semaine sur une liste de lundis (même ordre), toutes
 * plantations confondues ; une plantation sans dates ou sans tiges
 * estimées est ignorée ici et doit être signalée par l'écran.
 */
export function tigesPrevuesParSemaine(plantings: PlantingReel[], lundis: DateISO[]): number[] {
  const index = new Map(lundis.map((l, i) => [l, i]))
  const out = lundis.map(() => 0)
  if (!lundis.length) return out
  // Vivaces : une fenêtre de récolte par année affichée (013)
  const periode = { debut: lundis[0], fin: ajouterJours(lundis[lundis.length - 1], 6) }
  for (const p of recoltesDansPeriode(plantings, periode)) {
    if (!p.date_recolte || !p.date_fin || !Number.isFinite(Number(p.tiges_estimees))) continue
    for (const s of repartitionPrevue(p)) {
      const i = index.get(s.lundi)
      if (i !== undefined) out[i] += s.tiges
    }
  }
  return out
}

/** CA prévu en centimes : tiges × prix à la tige. */
export function caPrevu(tiges: number, prixTige: PlantingReel['prix_tige']): Centimes {
  return produitCentimes(tiges, prixTige)
}

// ------------------------------------------------------------
// Bilans
// ------------------------------------------------------------
export interface BilanPrevuReel {
  tiges_estimees: number
  tiges_recoltees: number
  tiges_perdues: number
  /** Récoltées / estimées ; null si rien n'était prévu. */
  taux_realisation: number | null
  /** Perdues / récoltées ; null sans récolte. */
  taux_perte: number | null
  ca_prevu_centimes: Centimes
  /** null quand le réel n'est pas rattachable à ce niveau (plantation, jardin). */
  ca_reel_centimes: Centimes | null
}

function bilan(est: number, rec: number, perd: number, caP: Centimes, caR: Centimes | null): BilanPrevuReel {
  return {
    tiges_estimees: est, tiges_recoltees: rec, tiges_perdues: perd,
    taux_realisation: est > 0 ? rec / est : null,
    taux_perte: rec > 0 ? perd / rec : null,
    ca_prevu_centimes: caP, ca_reel_centimes: caR,
  }
}

export interface BilanPlantation extends BilanPrevuReel {
  planting_id: string
  culture_id: string
  culture_name: string
  garden_id: string
  garden_name: string
  planche_name: string | null
}

export function reelParPlantation(plantings: PlantingReel[], actuals: PlantingActual[]): BilanPlantation[] {
  const parId = new Map(actuals.map(a => [a.planting_id, a]))
  return plantings.map(p => {
    const a = parId.get(p.id)
    const est = tigesEstimees(p)
    return {
      planting_id: p.id, culture_id: p.culture_id, culture_name: p.culture_name,
      garden_id: p.garden_id, garden_name: p.garden_name, planche_name: p.planche_name ?? null,
      ...bilan(est, a?.tiges_recoltees ?? 0, a?.tiges_perdues ?? 0, caPrevuPlantation(p), null),
    }
  })
}

export interface BilanGroupe extends BilanPrevuReel {
  cle: string
  libelle: string
  nb_plantations: number
}

function agreger(lignes: BilanPlantation[], cle: (b: BilanPlantation) => { cle: string; libelle: string }): Map<string, BilanGroupe> {
  const m = new Map<string, BilanGroupe>()
  for (const b of lignes) {
    const k = cle(b)
    const g = m.get(k.cle) ?? { cle: k.cle, libelle: k.libelle, nb_plantations: 0, ...bilan(0, 0, 0, 0, null) }
    const n = bilan(g.tiges_estimees + b.tiges_estimees, g.tiges_recoltees + b.tiges_recoltees,
      g.tiges_perdues + b.tiges_perdues, g.ca_prevu_centimes + b.ca_prevu_centimes, null)
    m.set(k.cle, { ...g, ...n, nb_plantations: g.nb_plantations + 1 })
  }
  return m
}

/** Clé du groupe des ventes non rattachées à une culture. */
export const CULTURE_NON_ATTRIBUEE = 'non-attribue'

/**
 * Bilan par culture, avec le CA réel des lignes de vente de cette culture.
 * Les ventes sans culture (lignes sans culture_id, ventes historiques sans
 * lignes) forment un groupe `CULTURE_NON_ATTRIBUEE` : le total général
 * reste juste même si le détail est incomplet.
 */
export function reelParCulture(plantings: PlantingReel[], actuals: PlantingActual[], ventes: VenteCalcul[]): BilanGroupe[] {
  const m = agreger(reelParPlantation(plantings, actuals), b => ({ cle: b.culture_id, libelle: b.culture_name }))
  const caReel = new Map<string, Centimes>()
  for (const v of ventes) {
    if (v.lignes && v.lignes.length > 0) {
      for (const l of v.lignes) {
        const k = l.culture_id ?? CULTURE_NON_ATTRIBUEE
        caReel.set(k, (caReel.get(k) ?? 0) + montantLigne(l))
      }
    } else {
      caReel.set(CULTURE_NON_ATTRIBUEE, (caReel.get(CULTURE_NON_ATTRIBUEE) ?? 0) + totalVente(v))
    }
  }
  for (const g of m.values()) g.ca_reel_centimes = caReel.get(g.cle) ?? 0
  for (const [k, ca] of caReel) {
    if (m.has(k)) continue
    m.set(k, {
      cle: k, libelle: k === CULTURE_NON_ATTRIBUEE ? 'Ventes non rattachées à une culture' : 'Culture hors plan',
      nb_plantations: 0, ...bilan(0, 0, 0, 0, ca),
    })
  }
  return Array.from(m.values()).sort((a, b) => b.ca_prevu_centimes - a.ca_prevu_centimes || a.libelle.localeCompare(b.libelle, 'fr'))
}

export function reelParJardin(plantings: PlantingReel[], actuals: PlantingActual[]): BilanGroupe[] {
  return Array.from(agreger(reelParPlantation(plantings, actuals), b => ({ cle: b.garden_id, libelle: b.garden_name })).values())
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
}

export interface BilanSemaine extends BilanPrevuReel {
  lundi: DateISO
  cle_semaine: string
  tiges_prevues: number
}

/**
 * Prévu contre réel semaine par semaine : prévu réparti selon le type de
 * culture, récoltes et pertes à leur date, CA réel à la date de vente.
 * Avec `periode`, seules les semaines qui la touchent sont renvoyées.
 */
export function reelParSemaine(args: {
  plantings: PlantingReel[]
  recoltes: HarvestLite[]
  pertes: LossLite[]
  ventes: VenteCalcul[]
  periode?: Intervalle
}): BilanSemaine[] {
  type Acc = { prevu: number; caP: Centimes; rec: number; perd: number; caR: Centimes }
  const m = new Map<DateISO, Acc>()
  const acc = (d: DateISO) => {
    const l = lundiDeSemaine(d)
    let a = m.get(l)
    if (!a) { a = { prevu: 0, caP: 0, rec: 0, perd: 0, caR: 0 }; m.set(l, a) }
    return a
  }
  // Vivaces : avec une période, chaque floraison qui la touche compte (013)
  const plantings = args.periode ? recoltesDansPeriode(args.plantings, args.periode) : args.plantings
  for (const p of plantings) {
    // CA réparti comme les tiges : la somme des semaines retombe sur le revenu estimé
    for (const s of repartitionPrevueValorisee(p, caPrevuPlantation(p))) {
      const a = acc(s.lundi)
      a.prevu += s.tiges
      a.caP += s.centimes
    }
  }
  for (const h of args.recoltes) acc(h.date).rec += h.tiges
  for (const l of args.pertes) acc(l.date).perd += l.tiges
  for (const v of args.ventes) acc(v.date).caR += totalVente(v)

  const periode = args.periode
  return Array.from(m.entries())
    .filter(([lundi]) => !periode || (lundi <= periode.fin && ajouterJours(lundi, 6) >= periode.debut))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([lundi, a]) => ({
      lundi, cle_semaine: cleSemaine(lundi), tiges_prevues: a.prevu,
      ...bilan(a.prevu, a.rec, a.perd, a.caP, a.caR),
    }))
}

// ------------------------------------------------------------
// Pertes par raison
// ------------------------------------------------------------
export interface PerteParRaison {
  reason: LossReason
  tiges: number
  /** Part de cette raison dans l'ensemble des pertes (0 à 1). */
  part: number
  /** Tiges perdues / tiges récoltées ; null si `tigesRecoltees` absent ou nul. */
  taux: number | null
}

/** Toutes les raisons sont renvoyées, même à zéro, dans l'ordre du schéma. */
export function pertesParRaison(pertes: LossLite[], tigesRecoltees?: number, periode?: Intervalle): PerteParRaison[] {
  const retenues = periode ? pertes.filter(p => dansIntervalle(p.date, periode)) : pertes
  const total = retenues.reduce((s, p) => s + p.tiges, 0)
  return LOSS_REASONS.map(reason => {
    const tiges = retenues.filter(p => p.reason === reason).reduce((s, p) => s + p.tiges, 0)
    return {
      reason, tiges,
      part: total > 0 ? tiges / total : 0,
      taux: tigesRecoltees && tigesRecoltees > 0 ? tiges / tigesRecoltees : null,
    }
  })
}

export const LIBELLES_RAISONS: Record<LossReason, string> = {
  invendu: 'Invendu', abime: 'Abîmé', meteo: 'Météo', ravageur: 'Ravageur', maladie: 'Maladie', autre: 'Autre',
}
