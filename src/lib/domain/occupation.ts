// ============================================================
// Occupation d'une planche, toutes saisons confondues
// ============================================================
// La planche est permanente ; la saison n'est qu'une étiquette de gestion.
// Une renoncule semée en septembre 2026 (« Saison 2026 ») occupe encore la
// planche au printemps 2027 : on lit donc l'occupation par DATES RÉELLES,
// sur toutes les plantations de la planche, quelle que soit leur saison.
//
// Période d'occupation d'une plantation (intervalle fermé) :
//   début = date_plantation (mise en place au champ),
//           ou date_semis pour un semis direct ;
//   fin   = date_fin (dernier jour de récolte, arrachage compris).
// La planche est donc libre à partir du lendemain de date_fin. Le temps
// passé en cellule (semis en godets) n'occupe pas la planche.
// ============================================================

import {
  ajouterJours, chevauche, dansIntervalle, formatJourMois, intervalle, lundisEntre,
  maxDate, minDate, joursEntre, type Intervalle,
} from './dates'
import type { DateISO, PlantingFull } from './types'

/** Colonnes de `plantings_full` nécessaires au calcul. */
export type PlantingOccupation = Pick<PlantingFull,
  'id' | 'surface_m2' | 'date_semis' | 'date_plantation' | 'date_fin' | 'semis_direct' | 'culture_name'
> & Partial<Pick<PlantingFull, 'season_name' | 'season_year' | 'season_id'>>

export interface PlancheSurface {
  surface_m2: number
}

/** Tolérance sur les m² (les surfaces sont des `numeric` décimaux). */
const EPSILON_M2 = 1e-9

export function periodeOccupation(p: Pick<PlantingOccupation, 'id' | 'date_semis' | 'date_plantation' | 'date_fin' | 'semis_direct'>): Intervalle {
  const debut = p.semis_direct ? p.date_semis : p.date_plantation
  if (!debut || !p.date_fin) {
    throw new Error(`Plantation ${p.id} : dates incomplètes, occupation non calculable`)
  }
  return intervalle(debut, p.date_fin)
}

export function surfaceOccupeeLe(plantings: PlantingOccupation[], jour: DateISO): number {
  return plantings
    .filter(p => dansIntervalle(jour, periodeOccupation(p)))
    .reduce((s, p) => s + Number(p.surface_m2), 0)
}

// ------------------------------------------------------------
// Segments : périodes pendant lesquelles l'ensemble des plantations en
// place ne change pas. Toutes les autres vues en dérivent.
// ------------------------------------------------------------
export interface SegmentOccupation extends Intervalle {
  surface_occupee: number
  plantings: PlantingOccupation[]
}

/**
 * Découpe le temps en segments à occupation constante. Seuls les segments
 * où au moins une plantation est en place sont renvoyés, triés.
 * `limite` restreint le calcul à une période.
 */
export function segmentsOccupation(plantings: PlantingOccupation[], limite?: Intervalle): SegmentOccupation[] {
  const periodes = plantings.map(p => ({ p, i: periodeOccupation(p) }))
    .filter(x => !limite || chevauche(x.i, limite))
  const bornes = new Set<DateISO>()
  for (const { i } of periodes) {
    bornes.add(limite ? maxDate(i.debut, limite.debut) : i.debut)
    const apres = ajouterJours(i.fin, 1)
    if (!limite || apres <= limite.fin) bornes.add(apres)
  }
  const triees = Array.from(bornes).sort()
  const out: SegmentOccupation[] = []
  for (let k = 0; k < triees.length; k++) {
    const debut = triees[k]
    const fin = k + 1 < triees.length
      ? ajouterJours(triees[k + 1], -1)
      : (limite ? limite.fin : debut)
    const presentes = periodes.filter(x => x.i.debut <= debut && x.i.fin >= debut).map(x => x.p)
    if (presentes.length === 0) continue
    // Dernier segment sans borne suivante : il court jusqu'à la fin commune.
    const finReelle = k + 1 < triees.length ? fin : minDate(...presentes.map(p => periodeOccupation(p).fin))
    out.push({
      debut, fin: limite ? minDate(finReelle, limite.fin) : finReelle,
      surface_occupee: presentes.reduce((s, p) => s + Number(p.surface_m2), 0),
      plantings: presentes,
    })
  }
  return out
}

// ------------------------------------------------------------
// Vues par jour et par semaine
// ------------------------------------------------------------
export interface OccupationJour {
  jour: DateISO
  surface_occupee: number
  surface_libre: number
  /** Part de la planche occupée, 1 = pleine ; peut dépasser 1 en cas de conflit. */
  taux: number
  planting_ids: string[]
}

export function occupationParJour(planche: PlancheSurface, plantings: PlantingOccupation[], periode: Intervalle): OccupationJour[] {
  const segs = segmentsOccupation(plantings, periode)
  return joursEntre(periode).map(jour => {
    const s = segs.find(x => dansIntervalle(jour, x))
    const occ = s ? s.surface_occupee : 0
    return {
      jour,
      surface_occupee: occ,
      surface_libre: Math.max(0, planche.surface_m2 - occ),
      taux: planche.surface_m2 > 0 ? occ / planche.surface_m2 : 0,
      planting_ids: s ? s.plantings.map(p => p.id) : [],
    }
  })
}

export interface OccupationSemaine {
  /** Lundi de la semaine ISO. */
  lundi: DateISO
  /** Surface occupée au pic de la semaine. */
  surface_max: number
  surface_libre_min: number
  taux_max: number
  /** Plantations présentes au moins un jour de la semaine. */
  planting_ids: string[]
  conflit: boolean
}

export function occupationParSemaine(planche: PlancheSurface, plantings: PlantingOccupation[], periode: Intervalle): OccupationSemaine[] {
  const segs = segmentsOccupation(plantings, periode)
  return lundisEntre(periode).map(lundi => {
    const semaine: Intervalle = { debut: maxDate(lundi, periode.debut), fin: minDate(ajouterJours(lundi, 6), periode.fin) }
    const touches = segs.filter(s => chevauche(s, semaine))
    const max = touches.reduce((m, s) => Math.max(m, s.surface_occupee), 0)
    const ids = new Set<string>()
    touches.forEach(s => s.plantings.forEach(p => ids.add(p.id)))
    return {
      lundi,
      surface_max: max,
      surface_libre_min: Math.max(0, planche.surface_m2 - max),
      taux_max: planche.surface_m2 > 0 ? max / planche.surface_m2 : 0,
      planting_ids: Array.from(ids),
      conflit: max > planche.surface_m2 + EPSILON_M2,
    }
  })
}

// ------------------------------------------------------------
// Conflits
// ------------------------------------------------------------
export interface ConflitOccupation extends Intervalle {
  surface_occupee: number
  surface_planche: number
  depassement_m2: number
  plantings: PlantingOccupation[]
}

/**
 * Périodes où la somme des surfaces en place dépasse la surface de la
 * planche. Un conflit par période à ensemble de plantations constant :
 * l'écran sait ainsi exactement qui retirer ou décaler.
 */
export function conflitsOccupation(planche: PlancheSurface, plantings: PlantingOccupation[], limite?: Intervalle): ConflitOccupation[] {
  return segmentsOccupation(plantings, limite)
    .filter(s => s.surface_occupee > planche.surface_m2 + EPSILON_M2)
    .map(s => ({
      debut: s.debut, fin: s.fin,
      surface_occupee: s.surface_occupee,
      surface_planche: planche.surface_m2,
      depassement_m2: arrondiM2(s.surface_occupee - planche.surface_m2),
      plantings: s.plantings,
    }))
}

function arrondiM2(x: number): number {
  return Math.round(x * 1000) / 1000
}

/**
 * Vérifie une plantation projetée (création ou déplacement) avant de
 * l'enregistrer : renvoie les conflits qu'elle provoquerait. Une plantation
 * existante de même `id` est remplacée par le projet (cas d'une modification).
 */
export function conflitsSiAjout(
  planche: PlancheSurface, existantes: PlantingOccupation[], projet: PlantingOccupation,
): ConflitOccupation[] {
  const autres = existantes.filter(p => p.id !== projet.id)
  const periode = periodeOccupation(projet)
  return conflitsOccupation(planche, [...autres, projet], periode)
    .filter(c => c.plantings.some(p => p.id === projet.id))
}

// ------------------------------------------------------------
// Libre à partir du…
// ------------------------------------------------------------
/**
 * Premier jour, à partir de `aPartirDe`, où `surfaceDemandee` m² sont libres
 * sur la planche — pendant `dureeJours` jours consécutifs si précisé (durée
 * d'occupation de la culture qu'on veut y mettre).
 * Renvoie `null` si la planche est trop petite pour la demande.
 */
export function libreAPartirDu(
  planche: PlancheSurface, plantings: PlantingOccupation[], surfaceDemandee: number,
  aPartirDe: DateISO, dureeJours = 1,
): DateISO | null {
  if (surfaceDemandee > planche.surface_m2 + EPSILON_M2) return null
  if (!Number.isInteger(dureeJours) || dureeJours < 1) throw new Error(`Durée invalide : ${dureeJours}`)
  const periodes = plantings.map(periodeOccupation)
  // La place ne se libère qu'au lendemain d'une fin : seuls ces jours-là
  // (et le jour de départ) sont candidats.
  const candidats = [aPartirDe, ...periodes.map(i => ajouterJours(i.fin, 1)).filter(d => d > aPartirDe)]
  const uniques = Array.from(new Set(candidats)).sort()
  for (const c of uniques) {
    const fenetre: Intervalle = { debut: c, fin: ajouterJours(c, dureeJours - 1) }
    const pic = segmentsOccupation(plantings, fenetre).reduce((m, s) => Math.max(m, s.surface_occupee), 0)
    if (pic + surfaceDemandee <= planche.surface_m2 + EPSILON_M2) return c
  }
  return null // inatteignable : après la dernière fin, la planche est vide
}

// ------------------------------------------------------------
// Phrase d'affichage
// ------------------------------------------------------------
export function libelleSaison(p: Pick<PlantingOccupation, 'season_name' | 'season_year'>): string | null {
  if (p.season_name && p.season_name.trim()) return p.season_name.trim()
  if (p.season_year) return `Saison ${p.season_year}`
  return null
}

function nommer(p: PlantingOccupation): string {
  const s = libelleSaison(p)
  return s ? `${p.culture_name} (${s})` : p.culture_name
}

function enumerer(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

/**
 * Phrase d'état d'une planche à une date :
 *  « Occupée jusqu'au 15 mai 2027 par Renoncule (Saison 2026) »
 *  « Occupée à 6 m² sur 10 : Dahlia (Saison 2026) jusqu'au 30 octobre, … »
 *  « Libre jusqu'au 1er avril 2027, puis Dahlia (Saison 2027) »
 *  « Libre »
 * L'année n'est écrite que si elle diffère de celle de `jour`.
 */
export function phraseOccupation(planche: PlancheSurface, plantings: PlantingOccupation[], jour: DateISO): string {
  const annee = Number(jour.slice(0, 4))
  const enPlace = plantings
    .map(p => ({ p, i: periodeOccupation(p) }))
    .filter(x => dansIntervalle(jour, x.i))
    .sort((a, b) => (a.i.fin < b.i.fin ? -1 : a.i.fin > b.i.fin ? 1 : 0))

  if (enPlace.length === 0) {
    const prochaine = plantings
      .map(p => ({ p, i: periodeOccupation(p) }))
      .filter(x => x.i.debut > jour)
      .sort((a, b) => (a.i.debut < b.i.debut ? -1 : 1))[0]
    if (!prochaine) return 'Libre'
    return `Libre jusqu'au ${formatJourMois(ajouterJours(prochaine.i.debut, -1), annee)}, puis ${nommer(prochaine.p)}`
  }

  const occupee = enPlace.reduce((s, x) => s + Number(x.p.surface_m2), 0)
  const pleine = occupee >= planche.surface_m2 - EPSILON_M2
  const finMax = enPlace[enPlace.length - 1].i.fin
  const memeFin = enPlace.every(x => x.i.fin === finMax)

  if (pleine && memeFin) {
    return `Occupée jusqu'au ${formatJourMois(finMax, annee)} par ${enumerer(enPlace.map(x => nommer(x.p)))}`
  }
  const detail = enumerer(enPlace.map(x => `${nommer(x.p)} jusqu'au ${formatJourMois(x.i.fin, annee)}`))
  if (pleine) return `Occupée par ${detail}`
  return `Occupée à ${formatM2(occupee)} m² sur ${formatM2(planche.surface_m2)} : ${detail}`
}

function formatM2(x: number): string {
  return String(Math.round(x * 100) / 100).replace('.', ',')
}
