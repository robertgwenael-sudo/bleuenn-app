// ============================================================
// Dates civiles `YYYY-MM-DD`, sans fuseau
// ============================================================
// `new Date('2026-06-01')` est interprété en UTC minuit et s'affiche le
// 31 mai à Montréal ; `new Date(2026, 5, 1)` dépend du fuseau de la machine.
// On travaille donc sur un compte de jours entier (jours depuis le
// 1970-01-01) obtenu par `Date.UTC`, qui ne dépend d'aucun fuseau.
//
// Règle : aucune fonction du domaine ne lit l'horloge. La date du jour est
// toujours un paramètre (`aujourdhui`), fourni par l'écran.
//
// Les intervalles sont FERMÉS : `{ debut, fin }` contient ses deux bornes.
// ============================================================

import type { DateISO } from './types'

export interface Intervalle {
  debut: DateISO
  fin: DateISO
}

export interface SemaineIso {
  annee: number
  semaine: number
}

const MS_JOUR = 86_400_000
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function decomposer(d: DateISO): [number, number, number] {
  const m = RE_DATE.exec(d)
  if (!m) throw new Error(`Date invalide : « ${d} » (format attendu AAAA-MM-JJ)`)
  const a = Number(m[1]), mo = Number(m[2]), j = Number(m[3])
  if (mo < 1 || mo > 12 || j < 1 || j > joursDansMois(a, mo)) {
    throw new Error(`Date inexistante : « ${d} »`)
  }
  return [a, mo, j]
}

function pad(n: number, l = 2): string {
  return String(n).padStart(l, '0')
}

export function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nombre de jours du mois (1 = janvier). */
export function joursDansMois(annee: number, mois: number): number {
  return [31, estBissextile(annee) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1]
}

export function estDateValide(d: unknown): d is DateISO {
  if (typeof d !== 'string') return false
  try { decomposer(d); return true } catch { return false }
}

/** Construit une date à partir de l'année, du mois (1-12) et du jour. */
export function dateCivile(annee: number, mois: number, jour: number): DateISO {
  const d = `${pad(annee, 4)}-${pad(mois)}-${pad(jour)}`
  decomposer(d)
  return d
}

/** Jours écoulés depuis le 1970-01-01. */
export function versNumeroJour(d: DateISO): number {
  const [a, m, j] = decomposer(d)
  return Math.round(Date.UTC(a, m - 1, j) / MS_JOUR)
}

export function depuisNumeroJour(n: number): DateISO {
  const t = new Date(n * MS_JOUR)
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function ajouterJours(d: DateISO, jours: number): DateISO {
  if (!Number.isInteger(jours)) throw new Error(`Nombre de jours non entier : ${jours}`)
  return depuisNumeroJour(versNumeroJour(d) + jours)
}

/**
 * Ajoute des mois en gardant le jour, ramené au dernier jour du mois si
 * besoin : 31 janvier + 1 mois = 28 ou 29 février.
 */
export function ajouterMois(d: DateISO, mois: number): DateISO {
  if (!Number.isInteger(mois)) throw new Error(`Nombre de mois non entier : ${mois}`)
  const [a, m, j] = decomposer(d)
  const total = a * 12 + (m - 1) + mois
  const na = Math.floor(total / 12)
  const nm = total - na * 12 + 1
  return dateCivile(na, nm, Math.min(j, joursDansMois(na, nm)))
}

/** 29 février + 1 an = 28 février (comme `make_interval(years => 1)` en SQL). */
export function ajouterAnnees(d: DateISO, annees: number): DateISO {
  return ajouterMois(d, annees * 12)
}

/** `b − a` en jours (positif si b est après a). */
export function ecartJours(a: DateISO, b: DateISO): number {
  return versNumeroJour(b) - versNumeroJour(a)
}

export function comparerDates(a: DateISO, b: DateISO): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minDate(...ds: DateISO[]): DateISO {
  if (ds.length === 0) throw new Error('minDate : aucune date')
  return ds.reduce((m, d) => (d < m ? d : m))
}

export function maxDate(...ds: DateISO[]): DateISO {
  if (ds.length === 0) throw new Error('maxDate : aucune date')
  return ds.reduce((m, d) => (d > m ? d : m))
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function jourSemaineIso(d: DateISO): number {
  // Le 1970-01-01 était un jeudi (4).
  return ((((versNumeroJour(d) + 3) % 7) + 7) % 7) + 1
}

/** Lundi de la semaine ISO qui contient `d`. */
export function lundiDeSemaine(d: DateISO): DateISO {
  return ajouterJours(d, 1 - jourSemaineIso(d))
}

export function dimancheDeSemaine(d: DateISO): DateISO {
  return ajouterJours(lundiDeSemaine(d), 6)
}

/**
 * Semaine ISO 8601 : la semaine 1 est celle qui contient le premier jeudi
 * de l'année. Le 2027-01-01 (vendredi) est donc en semaine 53 de 2026.
 */
export function semaineIso(d: DateISO): SemaineIso {
  const jeudi = ajouterJours(d, 4 - jourSemaineIso(d))
  const annee = Number(jeudi.slice(0, 4))
  const semaine = Math.floor(ecartJours(dateCivile(annee, 1, 1), jeudi) / 7) + 1
  return { annee, semaine }
}

/** Clé triable `2026-W53`. */
export function cleSemaine(d: DateISO): string {
  const { annee, semaine } = semaineIso(d)
  return `${annee}-W${pad(semaine)}`
}

/** Nombre de semaines ISO de l'année (52 ou 53). */
export function semainesDansAnnee(annee: number): number {
  return semaineIso(dateCivile(annee, 12, 28)).semaine
}

/** Lundi de la semaine ISO `semaine` de l'année ISO `annee`. */
export function lundiSemaineIso(annee: number, semaine: number): DateISO {
  if (semaine < 1 || semaine > semainesDansAnnee(annee)) {
    throw new Error(`L'année ${annee} n'a pas de semaine ${semaine}`)
  }
  return ajouterJours(lundiDeSemaine(dateCivile(annee, 1, 4)), (semaine - 1) * 7)
}

/**
 * Période glissante affichée par défaut : d'aujourd'hui à la veille du même
 * jour dans `mois` mois (12 par défaut), bornes comprises.
 */
export function fenetreGlissante(aujourdhui: DateISO, mois = 12): Intervalle {
  if (!Number.isInteger(mois) || mois < 1) throw new Error(`Durée de fenêtre invalide : ${mois} mois`)
  return { debut: aujourdhui, fin: ajouterJours(ajouterMois(aujourdhui, mois), -1) }
}

export function intervalle(debut: DateISO, fin: DateISO): Intervalle {
  decomposer(debut); decomposer(fin)
  if (fin < debut) throw new Error(`Intervalle inversé : ${debut} → ${fin}`)
  return { debut, fin }
}

export function dansIntervalle(d: DateISO, i: Intervalle): boolean {
  return d >= i.debut && d <= i.fin
}

/** Deux intervalles fermés se chevauchent s'ils ont au moins un jour commun. */
export function chevauche(a: Intervalle, b: Intervalle): boolean {
  return a.debut <= b.fin && b.debut <= a.fin
}

export function intersection(a: Intervalle, b: Intervalle): Intervalle | null {
  if (!chevauche(a, b)) return null
  return { debut: maxDate(a.debut, b.debut), fin: minDate(a.fin, b.fin) }
}

/** Nombre de jours de l'intervalle, bornes comprises. */
export function dureeJours(i: Intervalle): number {
  return ecartJours(i.debut, i.fin) + 1
}

/** Tous les jours de l'intervalle, dans l'ordre. */
export function joursEntre(i: Intervalle): DateISO[] {
  const n0 = versNumeroJour(i.debut), n1 = versNumeroJour(i.fin)
  const out: DateISO[] = []
  for (let n = n0; n <= n1; n++) out.push(depuisNumeroJour(n))
  return out
}

/** Lundis de toutes les semaines qui touchent l'intervalle. */
export function lundisEntre(i: Intervalle): DateISO[] {
  const out: DateISO[] = []
  for (let l = lundiDeSemaine(i.debut); l <= i.fin; l = ajouterJours(l, 7)) out.push(l)
  return out
}

// ------------------------------------------------------------
// Affichage en français, sans dépendre de l'Intl de la machine
// ------------------------------------------------------------
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 15 mai », « 1er juin » ; l'année est ajoutée si elle diffère de `anneeDeReference`. */
export function formatJourMois(d: DateISO, anneeDeReference?: number): string {
  const [a, m, j] = decomposer(d)
  const jour = j === 1 ? '1er' : String(j)
  const base = `${jour} ${MOIS_FR[m - 1]}`
  return anneeDeReference === undefined || anneeDeReference === a ? base : `${base} ${a}`
}

/** « 15 mai 2027 ». */
export function formatDateLongue(d: DateISO): string {
  const [a] = decomposer(d)
  return `${formatJourMois(d)} ${a}`
}

/** « semaine 23 (du 7 au 13 juin 2027) ». */
export function formatSemaine(d: DateISO): string {
  const l = lundiDeSemaine(d), dim = ajouterJours(l, 6)
  const { semaine } = semaineIso(d)
  const debut = l.slice(0, 7) === dim.slice(0, 7)
    ? (Number(l.slice(8)) === 1 ? '1er' : String(Number(l.slice(8))))
    : formatJourMois(l, Number(dim.slice(0, 4)))
  return `semaine ${semaine} (du ${debut} au ${formatDateLongue(dim)})`
}

// ------------------------------------------------------------
// Mois civils
// ------------------------------------------------------------
/** Clé de mois `2026-11`. */
export function cleMois(d: DateISO): string {
  decomposer(d)
  return d.slice(0, 7)
}

export function premierDuMois(d: DateISO): DateISO {
  return `${cleMois(d)}-01`
}

export function dernierDuMois(d: DateISO): DateISO {
  const [a, m] = decomposer(d)
  return dateCivile(a, m, joursDansMois(a, m))
}

/** « novembre 2026 ». Accepte une date ou une clé `YYYY-MM`. */
export function formatMois(d: DateISO | string): string {
  const [a, m] = decomposer(d.length === 7 ? `${d}-01` : d)
  return `${MOIS_FR[m - 1]} ${a}`
}

/**
 * Fenêtre mensuelle glissante : du 1er du mois en cours au dernier jour du
 * `mois`-ième mois (12 par défaut : mois en cours + 11 mois).
 */
export function fenetreMensuelle(aujourdhui: DateISO, mois = 12): Intervalle {
  if (!Number.isInteger(mois) || mois < 1) throw new Error(`Durée de fenêtre invalide : ${mois} mois`)
  const debut = premierDuMois(aujourdhui)
  return { debut, fin: dernierDuMois(ajouterMois(debut, mois - 1)) }
}

/** Clés `YYYY-MM` de tous les mois qui touchent l'intervalle. */
export function moisEntre(i: Intervalle): string[] {
  const out: string[] = []
  for (let d = premierDuMois(i.debut); d <= i.fin; d = ajouterMois(d, 1)) out.push(cleMois(d))
  return out
}

/** Premier lundi d'un mois (`YYYY-MM` ou date du mois). */
export function premierLundiDuMois(d: DateISO | string): DateISO {
  const premier = d.length === 7 ? `${d}-01` : premierDuMois(d)
  const j = jourSemaineIso(premier)
  return ajouterJours(premier, j === 1 ? 0 : 8 - j)
}
