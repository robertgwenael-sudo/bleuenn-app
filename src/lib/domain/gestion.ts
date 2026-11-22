// ============================================================
// Gestion simple (012) : relevés bancaires CSV, empreintes de
// dédoublonnage, rapprochement, trésorerie mensuelle, lecture d'un
// texte OCR de justificatif, exports pour le comptable.
// ------------------------------------------------------------
// Pré-comptabilité, pas de partie double ni de TVA. Tout montant est en
// CENTIMES entiers. Aucune lecture de l'horloge : la date du jour est un
// paramètre. Un montant ou une date illisible lève (ou est rejeté avec sa
// raison), jamais de zéro silencieux.
// ============================================================

import { ajouterJours, ajouterMois, cleMois, dateCivile, ecartJours, estDateValide, moisEntre, premierDuMois } from './dates'
import { calculee, LIBELLES_CATEGORIES, montantCout, nonCalculable, type Grandeur } from './couts'
import type { Colonne, Tableau } from './exports'
import { enCentiemes, eurosEnCentimes, verifierCentimes } from './montants'
import type {
  BankAccount, BankMatch, BankMatchKind, Centimes, Cost, CostCategory, DateISO, EurosNumeric, HorsFactureCategorie,
  InvoiceStatusRow, Payment, PaymentMode, Receipt, ReceiptPage,
} from './types'

// ------------------------------------------------------------
// 1. Lecture du fichier
// ------------------------------------------------------------
/**
 * Décode un relevé : UTF-8 s'il est valide (BOM retiré), sinon
 * Windows-1252, encore courant dans les exports des banques françaises.
 */
export function decoderReleve(octets: Uint8Array): { texte: string; encodage: 'utf-8' | 'windows-1252' } {
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(octets)
    return { texte: t.replace(/^﻿/, ''), encodage: 'utf-8' }
  } catch {
    return { texte: new TextDecoder('windows-1252').decode(octets), encodage: 'windows-1252' }
  }
}

export type SeparateurCsv = ';' | ',' | '\t'
export const SEPARATEURS: SeparateurCsv[] = [';', ',', '\t']

/** Découpe un CSV (guillemets doublés, retours à la ligne dans un champ, CRLF). */
export function lireCsv(texte: string, sep: SeparateurCsv): string[][] {
  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let entreGuillemets = false
  const t = texte.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreGuillemets) {
      if (c === '"') {
        if (t[i + 1] === '"') { champ += '"'; i++ } else entreGuillemets = false
      } else champ += c
      continue
    }
    if (c === '"' && champ.trim() === '') { champ = ''; entreGuillemets = true }
    else if (c === sep) { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''
    } else champ += c
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes.map(l => l.map(x => x.trim()))
}

/** Séparateur le plus régulier sur les premières lignes non vides. */
export function detecterSeparateur(texte: string): SeparateurCsv {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()).slice(0, 30)
  let meilleur: SeparateurCsv = ';'
  let score = -1
  for (const sep of SEPARATEURS) {
    const nb = lignes.map(l => lireCsv(l, sep)[0]?.length ?? 1)
    // Lignes à 3 colonnes ou plus, de largeur la plus fréquente
    const freq = new Map<number, number>()
    for (const n of nb) if (n >= 3) freq.set(n, (freq.get(n) ?? 0) + 1)
    const s = Math.max(0, ...freq.values())
    if (s > score) { score = s; meilleur = sep }
  }
  return meilleur
}

// ------------------------------------------------------------
// 2. Mappage des colonnes, montants et dates du relevé
// ------------------------------------------------------------
export type FormatDate = 'JJ/MM/AAAA' | 'JJ/MM/AA' | 'AAAA-MM-JJ'
export const FORMATS_DATE: FormatDate[] = ['JJ/MM/AAAA', 'JJ/MM/AA', 'AAAA-MM-JJ']

export type ColonnesMontant =
  | { mode: 'unique'; colonne: number }
  | { mode: 'debit_credit'; debit: number; credit: number }

/** Mappage d'un relevé, mémorisé par compte (`bank_accounts.csv_mapping`). */
export interface MappageReleve {
  version: 1
  separateur: SeparateurCsv
  /** Index (base 0) de la ligne d'en-tête ; -1 = pas d'en-tête. */
  ligneEntete: number
  /** En-têtes au moment du mappage : sert à vérifier qu'un nouveau fichier a la même forme. */
  entetes: string[]
  date: number
  /** Une ou deux colonnes concaténées (libellé + complément). */
  libelle: number[]
  montant: ColonnesMontant
  formatDate: FormatDate
  decimale: ',' | '.'
}

/** Minuscules sans accents ni espaces superflus, pour comparer des en-têtes. */
export function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s  ]+/g, ' ').trim()
}

const RE_DATE_JJMMAAAA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/
const RE_DATE_JJMMAA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/
const RE_DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/

/** Date d'une cellule du relevé ; null si illisible ou impossible (31/02). */
export function lireDateReleve(s: string, format: FormatDate): DateISO | null {
  const t = s.trim()
  let a: number, m: number, j: number
  let r: RegExpExecArray | null
  if (format === 'AAAA-MM-JJ' && (r = RE_DATE_ISO.exec(t))) [a, m, j] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if (format === 'JJ/MM/AAAA' && (r = RE_DATE_JJMMAAAA.exec(t))) [j, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if (format === 'JJ/MM/AA' && (r = RE_DATE_JJMMAA.exec(t))) [j, m, a] = [Number(r[1]), Number(r[2]), 2000 + Number(r[3])]
  else return null
  try {
    const d = dateCivile(a, m, j)
    return estDateValide(d) ? d : null
  } catch {
    return null
  }
}

/** Format de date le plus probable d'après des cellules exemples. */
export function detecterFormatDate(exemples: string[]): FormatDate {
  let best: FormatDate = 'JJ/MM/AAAA'
  let score = -1
  for (const f of FORMATS_DATE) {
    const s = exemples.filter(e => lireDateReleve(e, f) !== null).length
    if (s > score) { score = s; best = f }
  }
  return best
}

/**
 * Montant d'une cellule de relevé, en centimes signés. Accepte
 * `-1 234,56`, `1.234,56`, `+12,50 €`, `(12,50)`, `12,50-`, `1,234.56`.
 * Lève sur une cellule illisible. Une cellule vide vaut null.
 */
export function lireMontantReleve(cellule: string, decimale: ',' | '.'): Centimes | null {
  let s = cellule.replace(/[\s  ']/g, '').replace(/€|EUR/gi, '')
  if (s === '') return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1) }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  else if (s.startsWith('+')) s = s.slice(1)
  const millier = decimale === ',' ? '.' : ','
  if (s.includes(decimale) && s.includes(millier)) {
    s = s.split(millier).join('')
  } else if (!s.includes(decimale) && s.includes(millier)) {
    // Un seul séparateur, l'« autre » : décimal s'il est suivi d'un ou deux chiffres
    const parts = s.split(millier)
    s = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join('')
  }
  s = s.replace(decimale, '.')
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Montant illisible : « ${cellule} »`)
  const c = enCentiemes(s, 'Montant')
  return neg ? -c : c
}

const RE_ENTETE_DATE_PREFEREE = /^date( de l'?)?( d')?(operation|op|comptable|comptabilisation)?$/
const RE_ENTETE_LIBELLE = /libelle|description|intitule|detail|nature|operation|motif|reference|beneficiaire/
const RE_ENTETE_MONTANT = /^(montant|amount|somme|valeur)/
const RE_ENTETE_DEBIT = /debit/
const RE_ENTETE_CREDIT = /credit/

/** Index de la ligne d'en-tête : première ligne à 3 cellules ou plus dont l'une parle de date. */
export function detecterEntete(lignes: string[][]): number {
  for (let i = 0; i < Math.min(lignes.length, 20); i++) {
    const l = lignes[i].map(sansAccents)
    if (l.filter(Boolean).length >= 3 && l.some(c => /\bdate\b/.test(c)) && l.some(c => RE_ENTETE_LIBELLE.test(c) || RE_ENTETE_MONTANT.test(c) || RE_ENTETE_DEBIT.test(c))) {
      return i
    }
  }
  return -1
}

/**
 * Mappage proposé pour un premier import, d'après les en-têtes et les
 * valeurs. À faire confirmer à l'écran : c'est une proposition.
 */
export function proposerMappage(texte: string): { mappage: MappageReleve; lignes: string[][] } {
  const separateur = detecterSeparateur(texte)
  const lignes = lireCsv(texte, separateur).filter(l => l.some(c => c !== ''))
  const ligneEntete = detecterEntete(lignes)
  const entetes = ligneEntete >= 0 ? lignes[ligneEntete] : []
  const n = sansAccents
  const corps = lignes.slice(ligneEntete + 1).slice(0, 50)
  const largeur = Math.max(0, ...lignes.map(l => l.length))
  const idx = (pred: (h: string, i: number) => boolean) => entetes.findIndex((h, i) => pred(n(h), i))

  // Colonne de date : en-tête « date (d'opération) » de préférence à « date de valeur »
  let date = idx(h => RE_ENTETE_DATE_PREFEREE.test(h))
  if (date < 0) date = idx(h => /date/.test(h) && !/valeur/.test(h))
  if (date < 0) date = idx(h => /date/.test(h))
  if (date < 0) {
    // Sans en-tête : la colonne dont le plus de cellules sont des dates
    let best = -1
    for (let c = 0; c < largeur; c++) {
      const s = corps.filter(l => FORMATS_DATE.some(f => lireDateReleve(l[c] ?? '', f))).length
      if (s > best) { best = s; date = c }
    }
  }
  const debit = idx((h, i) => i !== date && RE_ENTETE_DEBIT.test(h))
  const credit = idx((h, i) => i !== date && RE_ENTETE_CREDIT.test(h))
  let montantCol = idx((h, i) => i !== date && RE_ENTETE_MONTANT.test(h))
  const pris = new Set([date, debit, credit, montantCol])
  let libelle = idx((h, i) => !pris.has(i) && /libelle|description|intitule/.test(h))
  if (libelle < 0) libelle = idx((h, i) => !pris.has(i) && RE_ENTETE_LIBELLE.test(h) && !/date/.test(h))
  if (libelle < 0) {
    // La colonne la plus « textuelle »
    let best = -1
    for (let c = 0; c < largeur; c++) {
      if (pris.has(c)) continue
      const s = corps.reduce((acc, l) => acc + ((l[c] ?? '').match(/[a-z]/gi)?.length ?? 0), 0)
      if (s > best) { best = s; libelle = c }
    }
  }
  if (montantCol < 0 && (debit < 0 || credit < 0)) {
    // La colonne la plus « numérique » hors date
    let best = -1
    for (let c = 0; c < largeur; c++) {
      if (c === date || c === libelle) continue
      const s = corps.filter(l => /^[-+(]?[\d\s., ]+\)?-?\s*(€|EUR)?$/i.test(l[c] ?? '') && /\d/.test(l[c] ?? '')).length
      if (s > best) { best = s; montantCol = c }
    }
  }
  const montant: ColonnesMontant = debit >= 0 && credit >= 0
    ? { mode: 'debit_credit', debit, credit }
    : { mode: 'unique', colonne: Math.max(0, montantCol) }
  const echantillons = corps.flatMap(l => montant.mode === 'unique' ? [l[montant.colonne] ?? ''] : [l[montant.debit] ?? '', l[montant.credit] ?? ''])
    .filter(Boolean)
  const virgule = echantillons.filter(s => /,\d{1,2}\s*(€|EUR)?-?\)?$/i.test(s.trim())).length
  const point = echantillons.filter(s => /\.\d{1,2}\s*(€|EUR)?-?\)?$/i.test(s.trim())).length
  const mappage: MappageReleve = {
    version: 1, separateur, ligneEntete, entetes,
    date: Math.max(0, date), libelle: [Math.max(0, libelle)], montant,
    formatDate: detecterFormatDate(corps.map(l => l[Math.max(0, date)] ?? '')),
    decimale: point > virgule ? '.' : ',',
  }
  return { mappage, lignes }
}

/** Un mappage mémorisé s'applique-t-il à ce fichier (mêmes en-têtes) ? */
export function mappageCompatible(m: unknown, lignes: string[][]): m is MappageReleve {
  if (!estMappage(m)) return false
  if (m.ligneEntete < 0) return true
  const l = lignes[m.ligneEntete]
  return !!l && l.length === m.entetes.length && l.every((h, i) => sansAccents(h) === sansAccents(m.entetes[i]))
}

export function estMappage(m: unknown): m is MappageReleve {
  const x = m as MappageReleve
  return !!x && typeof x === 'object' && x.version === 1 && SEPARATEURS.includes(x.separateur)
    && Number.isInteger(x.date) && Array.isArray(x.libelle) && !!x.montant && FORMATS_DATE.includes(x.formatDate)
    && (x.decimale === ',' || x.decimale === '.') && Number.isInteger(x.ligneEntete)
}

export interface MouvementLu {
  /** Numéro de ligne dans le fichier (base 1), pour les messages. */
  ligne: number
  date: DateISO
  libelle: string
  montant: Centimes
}

export interface LigneRejetee { ligne: number; raison: string; contenu: string }

/** Applique le mappage : mouvements lus et lignes rejetées avec leur raison. */
export function appliquerMappage(lignes: string[][], m: MappageReleve): { mouvements: MouvementLu[]; rejets: LigneRejetee[] } {
  const mouvements: MouvementLu[] = []
  const rejets: LigneRejetee[] = []
  lignes.forEach((l, i) => {
    if (i <= m.ligneEntete) return
    if (l.every(c => c === '')) return
    const contenu = l.join(' | ')
    const rejeter = (raison: string) => rejets.push({ ligne: i + 1, raison, contenu })
    const date = lireDateReleve(l[m.date] ?? '', m.formatDate)
    if (!date) return rejeter(`date illisible « ${l[m.date] ?? ''} »`)
    const libelle = m.libelle.map(c => l[c] ?? '').filter(Boolean).join(' ').replace(/[\s  ]+/g, ' ').trim()
    if (!libelle) return rejeter('libellé vide')
    let montant: Centimes | null
    try {
      if (m.montant.mode === 'unique') {
        montant = lireMontantReleve(l[m.montant.colonne] ?? '', m.decimale)
      } else {
        const d = lireMontantReleve(l[m.montant.debit] ?? '', m.decimale)
        const c = lireMontantReleve(l[m.montant.credit] ?? '', m.decimale)
        if (d !== null && d !== 0 && c !== null && c !== 0) return rejeter('débit et crédit remplis sur la même ligne')
        montant = d !== null && d !== 0 ? -Math.abs(d) : c !== null ? Math.abs(c) : d
      }
    } catch (e) {
      return rejeter(e instanceof Error ? e.message : String(e))
    }
    if (montant === null) return rejeter('montant vide')
    if (montant === 0) return rejeter('montant nul')
    mouvements.push({ ligne: i + 1, date, libelle: libelle.slice(0, 500), montant })
  })
  return { mouvements, rejets }
}

// ------------------------------------------------------------
// 3. Empreinte et dédoublonnage
// ------------------------------------------------------------
/** Libellé normalisé pour l'empreinte : espaces réduits, minuscules, sans « | ». */
export function normaliserLibelle(l: string): string {
  return l.normalize('NFC').replace(/[\s  ]+/g, ' ').trim().toLowerCase().replace(/\|/g, '/')
}

/**
 * `date|centimes|libellé normalisé|rang`. Le rang distingue des lignes
 * identiques d'un même fichier (deux frais de 3,00 € le même jour) ; la
 * base vérifie que date et centimes sont ceux de la ligne.
 */
export function empreinte(date: DateISO, montant: Centimes, libelle: string, rang: number | string): string {
  verifierCentimes(montant)
  if (!estDateValide(date)) throw new Error(`Date invalide : ${date}`)
  return `${date}|${montant}|${normaliserLibelle(libelle)}|${rang}`
}

export interface MouvementAImporter extends MouvementLu { rang: number; empreinte: string }

/** Rang de chaque ligne parmi les lignes identiques du fichier, dans l'ordre du fichier. */
export function avecEmpreintes(mvts: MouvementLu[]): MouvementAImporter[] {
  const vus = new Map<string, number>()
  return mvts.map(m => {
    const cle = `${m.date}|${m.montant}|${normaliserLibelle(m.libelle)}`
    const rang = (vus.get(cle) ?? 0) + 1
    vus.set(cle, rang)
    return { ...m, rang, empreinte: `${cle}|${rang}` }
  })
}

/** Sépare les nouveautés des lignes déjà importées sur ce compte. */
export function dedoublonner<T extends { empreinte: string }>(mvts: T[], existantes: Iterable<string>): { nouveaux: T[]; doublons: T[] } {
  const deja = new Set(existantes)
  const nouveaux: T[] = []
  const doublons: T[] = []
  for (const m of mvts) (deja.has(m.empreinte) ? doublons : nouveaux).push(m)
  return { nouveaux, doublons }
}

// ------------------------------------------------------------
// 4. Rapprochement
// ------------------------------------------------------------
export type TypeCible = Exclude<BankMatchKind, 'hors_facture'>

/** Pièce rapprochable, montant dans le SENS DE LA BANQUE (dépense < 0, encaissement > 0). */
export interface Cible {
  type: TypeCible
  id: string
  date: DateISO
  montant: Centimes
  libelle: string
}

export interface Proposition { cible: Cible; score: number; ecart: number }

/** Fenêtre de recherche, en jours, de part et d'autre du mouvement. */
export const FENETRE_JOURS: Record<TypeCible, number> = { paiement: 7, vente: 7, depense: 30 }

const motsSignificatifs = (s: string) => new Set(sansAccents(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4))

/**
 * Score d'une pièce pour un mouvement : null si elle ne peut pas lui
 * correspondre (sens, montant différent du reste à rapprocher, hors de la
 * fenêtre). Sinon de 100 (même jour) en décroissant avec l'écart, bonus
 * si un mot du libellé bancaire figure dans le libellé de la pièce.
 */
export function scoreRapprochement(mvt: { date: DateISO; reste: Centimes; label: string }, c: Cible): number | null {
  verifierCentimes(mvt.reste); verifierCentimes(c.montant)
  if (mvt.reste === 0 || c.montant !== mvt.reste) return null
  if (c.type === 'depense' && mvt.reste > 0) return null
  if (c.type === 'vente' && mvt.reste < 0) return null
  const ecart = Math.abs(ecartJours(mvt.date, c.date))
  if (ecart > FENETRE_JOURS[c.type]) return null
  const base = c.type === 'depense' ? 90 - 2 * ecart : 100 - 6 * ecart
  const mots = motsSignificatifs(mvt.label)
  const commun = [...motsSignificatifs(c.libelle)].some(w => mots.has(w))
  return Math.max(1, base + (commun ? 15 : 0))
}

/** Meilleures propositions pour un mouvement, pièces déjà rapprochées exclues. */
export function propositions(
  mvt: { date: DateISO; reste: Centimes; label: string }, cibles: Cible[], prises: Set<string>, max = 3,
): Proposition[] {
  const out: Proposition[] = []
  for (const c of cibles) {
    if (prises.has(`${c.type}:${c.id}`)) continue
    const score = scoreRapprochement(mvt, c)
    if (score !== null) out.push({ cible: c, score, ecart: Math.abs(ecartJours(mvt.date, c.date)) })
  }
  return out.sort((a, b) => b.score - a.score || a.ecart - b.ecart || a.cible.id.localeCompare(b.cible.id)).slice(0, max)
}

export type MatchCalcul = Pick<BankMatch, 'transaction_id' | 'kind' | 'cost_id' | 'payment_id' | 'sale_id' | 'amount' | 'annule_le'>

export const actif = (m: Pick<BankMatch, 'annule_le'>) => m.annule_le === null

/** Reste à rapprocher d'un mouvement (même signe que lui), liens annulés ignorés. */
export function resteARapprocher(montant: Centimes, liens: Pick<BankMatch, 'amount' | 'annule_le'>[]): Centimes {
  verifierCentimes(montant)
  const couvert = liens.filter(actif).reduce((s, l) => s + eurosEnCentimes(l.amount), 0)
  return montant - couvert
}

/** Clés `type:id` des pièces déjà rapprochées (liens actifs). */
export function piecesRapprochees(liens: MatchCalcul[]): Set<string> {
  const s = new Set<string>()
  for (const l of liens.filter(actif)) {
    if (l.cost_id) s.add(`depense:${l.cost_id}`)
    if (l.payment_id) s.add(`paiement:${l.payment_id}`)
    if (l.sale_id) s.add(`vente:${l.sale_id}`)
  }
  return s
}

export const LIBELLES_HORS_FACTURE: Record<HorsFactureCategorie, string> = {
  vente_hors_facture: 'Vente sans facture',
  subvention_aide: 'Subvention, aide',
  remboursement: 'Remboursement',
  apport_personnel: 'Apport personnel',
  prelevement_personnel: 'Prélèvement personnel',
  virement_interne: 'Virement entre comptes',
  emprunt: 'Emprunt',
  autre: 'Autre',
}

/** Opérations hors facture comptées comme RECETTES dans la trésorerie (les autres sont des mouvements de fonds). */
export const HORS_FACTURE_RECETTES: ReadonlySet<HorsFactureCategorie> = new Set(['vente_hors_facture', 'subvention_aide', 'remboursement'])

// ------------------------------------------------------------
// 5. Trésorerie, soldes, à encaisser
// ------------------------------------------------------------
/** Les `n` derniers mois civils jusqu'au mois en cours inclus (`YYYY-MM`). */
export function moisGlissants(aujourdhui: DateISO, n = 12): string[] {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Nombre de mois invalide : ${n}`)
  const fin = premierDuMois(aujourdhui)
  return moisEntre({ debut: ajouterMois(fin, -(n - 1)), fin })
}

export type SourceRecette = 'paiement' | 'vente' | 'hors_facture'
export const LIBELLES_SOURCE_RECETTE: Record<SourceRecette, string> = {
  paiement: 'Paiement de facture', vente: 'Vente sans facture', hors_facture: 'Recette hors facture',
}

export interface Flux { date: DateISO; montant: Centimes }
export interface Recette extends Flux { source: SourceRecette; id: string; libelle: string; mode: PaymentMode | null; piece: string | null }

/** Ventes que ne couvre aucune facture active (supposées payées comptant le jour de la vente). */
export function ventesSansFacture<V extends { id: string }>(ventes: V[], facturees: Map<string, string>): V[] {
  return ventes.filter(v => !facturees.has(v.id))
}

/**
 * Recettes encaissées : paiements de factures (à leur date ; contre-
 * passations et remboursements en négatif), ventes sans facture (date de
 * la vente) et opérations hors facture de type recette (date du mouvement).
 */
export function recettesEncaissees(args: {
  paiements: (Pick<Payment, 'id' | 'date' | 'amount' | 'mode' | 'reference'> & { numero?: string | null; client?: string | null })[]
  ventes: { id: string; date: DateISO; total: EurosNumeric; channel: string; client: string | null }[]
  horsFacture: { id: string; date: DateISO; amount: EurosNumeric; categorie: HorsFactureCategorie | null; libelle: string | null; label: string }[]
}): Recette[] {
  const out: Recette[] = []
  for (const p of args.paiements) {
    out.push({ source: 'paiement', id: p.id, date: p.date, montant: eurosEnCentimes(p.amount), mode: p.mode,
      piece: p.numero ?? null, libelle: [p.client, p.reference].filter(Boolean).join(' · ') || 'Paiement' })
  }
  for (const v of args.ventes) {
    const m = eurosEnCentimes(v.total)
    if (m === 0) continue
    out.push({ source: 'vente', id: v.id, date: v.date, montant: m, mode: null, piece: null,
      libelle: [v.channel, v.client].filter(Boolean).join(' · ') })
  }
  for (const h of args.horsFacture) {
    if (!h.categorie || !HORS_FACTURE_RECETTES.has(h.categorie)) continue
    out.push({ source: 'hors_facture', id: h.id, date: h.date, montant: eurosEnCentimes(h.amount), mode: 'virement', piece: null,
      libelle: `${LIBELLES_HORS_FACTURE[h.categorie]} · ${h.libelle || h.label}` })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

export interface LigneTresorerie { mois: string; encaisse: Centimes; depense: Centimes; resultat: Centimes }

/** Encaissé, dépensé et résultat de trésorerie par mois. Les flux hors des mois demandés sont ignorés. */
export function tresorerieParMois(recettes: Flux[], depenses: Flux[], mois: string[]): LigneTresorerie[] {
  const idx = new Map(mois.map((m, i) => [m, i]))
  const lignes = mois.map(m => ({ mois: m, encaisse: 0, depense: 0, resultat: 0 }))
  for (const r of recettes) { verifierCentimes(r.montant); const i = idx.get(cleMois(r.date)); if (i !== undefined) lignes[i].encaisse += r.montant }
  for (const d of depenses) { verifierCentimes(d.montant); const i = idx.get(cleMois(d.date)); if (i !== undefined) lignes[i].depense += d.montant }
  for (const l of lignes) l.resultat = l.encaisse - l.depense
  return lignes
}

export function totalTresorerie(lignes: LigneTresorerie[]): Omit<LigneTresorerie, 'mois'> {
  return lignes.reduce((t, l) => ({ encaisse: t.encaisse + l.encaisse, depense: t.depense + l.depense, resultat: t.resultat + l.resultat }),
    { encaisse: 0, depense: 0, resultat: 0 })
}

/** Dépenses (costs) en flux positifs. */
export function fluxDepenses(couts: Pick<Cost, 'date' | 'amount'>[]): Flux[] {
  return couts.map(c => ({ date: c.date, montant: montantCout(c) }))
}

export const RAISON_SOLDE_INITIAL = 'Solde initial non saisi'

/** Solde d'un compte : solde initial + mouvements depuis sa date. Non calculable sans solde initial. */
export function soldeCompte(
  compte: Pick<BankAccount, 'solde_initial' | 'date_solde_initial'>, mouvements: { date: DateISO; amount: EurosNumeric }[],
): Grandeur {
  if (compte.solde_initial === null || compte.solde_initial === undefined || compte.solde_initial === '') return nonCalculable(RAISON_SOLDE_INITIAL)
  let s = eurosEnCentimes(compte.solde_initial)
  for (const m of mouvements) {
    if (compte.date_solde_initial && m.date < compte.date_solde_initial) continue
    s += eurosEnCentimes(m.amount)
  }
  return calculee(s)
}

export interface AEncaisser { total: Centimes; nb: number; enRetard: Centimes; nbRetard: number; plusAncienRetard: number | null }

/** Factures émises non soldées (vue invoices_status), retards compris. */
export function aEncaisser(rows: Pick<InvoiceStatusRow, 'kind' | 'statut' | 'reste_du' | 'jours_de_retard'>[]): AEncaisser {
  const r: AEncaisser = { total: 0, nb: 0, enRetard: 0, nbRetard: 0, plusAncienRetard: null }
  for (const f of rows) {
    if (f.kind !== 'facture' || !['a_payer', 'partielle', 'en_retard'].includes(f.statut)) continue
    const reste = eurosEnCentimes(f.reste_du)
    if (reste <= 0) continue
    r.total += reste; r.nb++
    if (f.statut === 'en_retard') {
      r.enRetard += reste; r.nbRetard++
      if (f.jours_de_retard !== null) r.plusAncienRetard = Math.max(r.plusAncienRetard ?? 0, f.jours_de_retard)
    }
  }
  return r
}

// ------------------------------------------------------------
// 6. Justificatifs
// ------------------------------------------------------------
export type StatutJustificatif = 'a_traiter' | 'depense' | 'paiement' | 'sans_objet'
export const LIBELLES_STATUT_JUSTIFICATIF: Record<StatutJustificatif, string> = {
  a_traiter: 'À traiter', depense: 'Rattaché à une dépense', paiement: 'Rattaché à un paiement', sans_objet: 'Sans objet',
}

export function statutJustificatif(r: Pick<Receipt, 'cost_id' | 'payment_id' | 'sans_objet_le'>): StatutJustificatif {
  if (r.cost_id) return 'depense'
  if (r.payment_id) return 'paiement'
  if (r.sans_objet_le) return 'sans_objet'
  return 'a_traiter'
}

/** Dépenses sans aucun justificatif rattaché. */
export function depensesSansJustificatif<C extends Pick<Cost, 'id'>>(couts: C[], justificatifs: Pick<Receipt, 'cost_id'>[]): C[] {
  const avec = new Set(justificatifs.map(r => r.cost_id).filter(Boolean))
  return couts.filter(c => !avec.has(c.id))
}

/** Chemin Storage d'une page : `<farm_id>/<receipt_id>/<page>.<ext>`. */
export function cheminJustificatif(farmId: string, receiptId: string, page: number, mime: string): string {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  if (!Number.isInteger(page) || page < 1) throw new Error(`Numéro de page invalide : ${page}`)
  if (!/^[0-9a-f-]{36}$/i.test(farmId) || !/^[0-9a-f-]{36}$/i.test(receiptId)) throw new Error('Identifiant invalide pour le chemin du justificatif')
  return `${farmId}/${receiptId}/${page}.${ext}`
}

/** « Graineterie du Lac » → « graineterie-du-lac ». */
export function slug(s: string, max = 40): string {
  return sansAccents(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || 'sans-nom'
}

/**
 * Nom du fichier d'une page de justificatif dans l'export (ZIP et colonne
 * du CSV des dépenses) : `2026-10-05_graineterie-du-lac_42-90_ab12cd34_p1.jpg`.
 */
export function nomFichierJustificatif(
  r: Pick<Receipt, 'id' | 'date_piece' | 'fournisseur' | 'montant' | 'created_at'>, p: Pick<ReceiptPage, 'page' | 'mime'>,
): string {
  const date = r.date_piece ?? r.created_at.slice(0, 10)
  const montant = r.montant !== null && r.montant !== undefined && r.montant !== '' ? (() => {
    const c = eurosEnCentimes(r.montant!)
    return `${Math.floor(c / 100)}-${String(c % 100).padStart(2, '0')}`
  })() : 'sans-montant'
  const ext = p.mime === 'application/pdf' ? 'pdf' : p.mime === 'image/png' ? 'png' : p.mime === 'image/webp' ? 'webp' : 'jpg'
  return `${date}_${slug(r.fournisseur ?? 'sans-fournisseur')}_${montant}_${r.id.replace(/-/g, '').slice(-8)}_p${p.page}.${ext}`
}

// ------------------------------------------------------------
// 7. Lecture d'un texte OCR (suggestions à confirmer, jamais enregistrées seules)
// ------------------------------------------------------------
// Montant : groupes de milliers séparés par espace ou point, deux décimales.
// Pas de chiffre, de virgule ou de point juste avant ; pas de chiffre (ni
// « .AAAA » d'une date) juste après.
const RE_MONTANT_OCR = /(?<![\d.,/])(\d{1,3}(?:[ .  ]\d{3})+|\d+)\s?[,.]\s?(\d{2})(?![\d]|[.,/]\d)/g

/** Montants (centimes) trouvés dans une ligne, dans l'ordre. */
export function montantsDansLigne(ligne: string): Centimes[] {
  const out: Centimes[] = []
  // Confusions fréquentes de l'OCR dans les nombres : O → 0, l/I → 1
  const t = ligne.split(/(\s+)/).map(m => (/^[\dOolI.,]+$/.test(m) && /\d/.test(m) ? m.replace(/[Oo]/g, '0').replace(/[lI]/g, '1') : m)).join('')
  for (const m of t.matchAll(RE_MONTANT_OCR)) {
    const entier = m[1].replace(/[ .  ]/g, '')
    out.push(enCentiemes(`${entier}.${m[2]}`, 'Montant'))
  }
  return out
}

/** Niveaux de mots-clés, du plus sûr au moins sûr. */
const MOTS_TOTAL: RegExp[] = [
  /net a payer|montant a payer|total a payer|reste a payer|somme a payer|a regler/,
  /total ttc|montant ttc|\bttc\b/,
  /\btotal\b|\bmontant\b/,
]
const EXCLUS_TOTAL = /sous\s*-?\s*total|total h\.?t|\bht\b|\btva\b|remise|rendu|monnaie|economis|fidelite|points?\b/

export interface SuggestionMontant { centimes: Centimes; ligne: string; confiance: 'mot-cle' | 'plus-grand' }

/**
 * Montant total d'un ticket ou d'une facture : le plus grand montant des
 * lignes du mot-clé le plus sûr (« Net à payer », puis « Total TTC », puis
 * « Total »), lu sur la ligne ou la suivante. À défaut, le plus grand
 * montant du texte (confiance faible).
 */
export function extraireMontantOcr(texte: string): SuggestionMontant | null {
  const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const re of MOTS_TOTAL) {
    let best: SuggestionMontant | null = null
    lignes.forEach((l, i) => {
      const n = sansAccents(l)
      if (!re.test(n) || EXCLUS_TOTAL.test(n)) return
      let ms = montantsDansLigne(l)
      let source = l
      if (!ms.length && lignes[i + 1]) { ms = montantsDansLigne(lignes[i + 1]); source = `${l} ${lignes[i + 1]}` }
      for (const c of ms) if (c > 0 && (!best || c > best.centimes)) best = { centimes: c, ligne: source, confiance: 'mot-cle' }
    })
    if (best) return best
  }
  let best: SuggestionMontant | null = null
  for (const l of lignes) {
    if (EXCLUS_TOTAL.test(sansAccents(l))) continue
    for (const c of montantsDansLigne(l)) if (c > 0 && (!best || c > best.centimes)) best = { centimes: c, ligne: l, confiance: 'plus-grand' }
  }
  return best
}

const MOIS_OCR: [RegExp, number][] = [
  [/^janv/, 1], [/^fevr|^fev/, 2], [/^mars/, 3], [/^avr/, 4], [/^mai/, 5], [/^juin/, 6],
  [/^juil/, 7], [/^aout/, 8], [/^sept/, 9], [/^oct/, 10], [/^nov/, 11], [/^dec/, 12],
]

/** Dates d'une ligne (formats numériques et « 12 mars 2026 »). */
export function datesDansLigne(ligne: string): DateISO[] {
  const out: DateISO[] = []
  const essai = (a: number, m: number, j: number) => {
    try { const d = dateCivile(a < 100 ? 2000 + a : a, m, j); if (estDateValide(d)) out.push(d) } catch { /* date impossible : ignorée */ }
  }
  for (const r of ligne.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) essai(Number(r[1]), Number(r[2]), Number(r[3]))
  for (const r of ligne.matchAll(/(?<![\d.,])(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?![\d,]|\.\d)/g)) essai(Number(r[3]), Number(r[2]), Number(r[1]))
  for (const r of sansAccents(ligne).matchAll(/(?<!\d)(\d{1,2})(?:er)?\s+([a-z]{3,9})\.?\s+(\d{4}|\d{2})(?!\d)/g)) {
    const m = MOIS_OCR.find(([re]) => re.test(r[2]))
    if (m) essai(Number(r[3]), m[1], Number(r[1]))
  }
  return out
}

/**
 * Date de la pièce : une date plausible (ni future, ni de plus de 3 ans),
 * de préférence sur une ligne « date », « facture », « le » ; jamais une
 * date d'échéance ou de validité.
 */
export function extraireDateOcr(texte: string, aujourdhui: DateISO): DateISO | null {
  const min = ajouterJours(aujourdhui, -3 * 366)
  const candidates: { d: DateISO; prio: number; rang: number }[] = []
  texte.split(/\r?\n/).forEach((l, rang) => {
    const n = sansAccents(l)
    if (/echeance|valable|validite|expir|limite|avant le|garantie/.test(n)) return
    const prio = /\bdate\b|facture|ticket|\ble\b|emis/.test(n) ? 0 : 1
    for (const d of datesDansLigne(l)) if (d <= aujourdhui && d >= min) candidates.push({ d, prio, rang })
  })
  candidates.sort((a, b) => a.prio - b.prio || a.rang - b.rang)
  return candidates[0]?.d ?? null
}

const NON_FOURNISSEUR = /facture|ticket|recu|date|tel\b|telephone|siret|siren|tva|www|@|total|caisse|bienvenue|merci|client|n°|page|devis|bon de/

/** Fournisseur : première ligne « nominale » du haut de la pièce. */
export function extraireFournisseurOcr(texte: string): string | null {
  const lignes = texte.split(/\r?\n/).map(l => l.replace(/[\s ]+/g, ' ').trim()).filter(Boolean).slice(0, 8)
  for (const l of lignes) {
    const lettres = l.match(/\p{L}/gu)?.length ?? 0
    if (lettres < 3 || lettres / l.replace(/ /g, '').length < 0.6) continue
    if (NON_FOURNISSEUR.test(sansAccents(l))) continue
    if (datesDansLigne(l).length || montantsDansLigne(l).length) continue
    return l.replace(/^[^\p{L}\d]+|[^\p{L}\d)]+$/gu, '').slice(0, 80) || null
  }
  return null
}

const MOTS_CATEGORIES: [RegExp, CostCategory][] = [
  [/graine|semence|semis/, 'semences'],
  [/bulbe|tubercule|plant\b|plants|griffe|pepiniere|godet/, 'plants_bulbes'],
  [/terreau|substrat|tourbe|compost|paillage|paillis/, 'terreau_substrat'],
  [/engrais|fertilis|purin|amendement|traitement|insecticide|fongicide|anti-?limace/, 'engrais_traitements'],
  [/outil|secateur|filet|bache|voile|irrigation|goutte|tuyau|quincaill|materiel|brico/, 'materiel'],
  [/kraft|emballage|papier|ruban|seau|carton|sachet|elastique|manchon/, 'emballage'],
  [/carburant|gazole|gasoil|essence|sp95|sp98|peage|parking|station/, 'transport'],
]

/** Catégorie probable d'après le fournisseur et le texte ; null si rien de net. */
export function categorieSuggeree(texte: string): CostCategory | null {
  const n = sansAccents(texte)
  return MOTS_CATEGORIES.find(([re]) => re.test(n))?.[1] ?? null
}

export interface SuggestionsOcr {
  date: DateISO | null
  montant: SuggestionMontant | null
  fournisseur: string | null
  categorie: CostCategory | null
}

export function suggestionsOcr(texte: string, aujourdhui: DateISO): SuggestionsOcr {
  const fournisseur = extraireFournisseurOcr(texte)
  return {
    date: extraireDateOcr(texte, aujourdhui),
    montant: extraireMontantOcr(texte),
    fournisseur,
    categorie: categorieSuggeree(texte),
  }
}

// ------------------------------------------------------------
// 8. Exports pour le comptable (tableaux pour exports.genererCsv)
// ------------------------------------------------------------
export function dansPeriode(d: DateISO, du: DateISO, au: DateISO): boolean {
  return d >= du && d <= au
}

export const COLONNES_RECETTES: Colonne[] = [
  { titre: 'Date', type: 'date' }, { titre: 'Nature', type: 'texte' }, { titre: 'Pièce', type: 'texte' },
  { titre: 'Libellé', type: 'texte' }, { titre: 'Mode', type: 'texte' }, { titre: 'Montant (€)', type: 'montant' },
  { titre: 'Rapproché le', type: 'date' }, { titre: 'Compte', type: 'texte' },
]

export interface Rapprochement { date: DateISO; compte: string }

export function exportRecettes(recettes: Recette[], rapproche: (r: Recette) => Rapprochement | null, modes: Record<PaymentMode, string>): Tableau {
  return {
    colonnes: COLONNES_RECETTES,
    lignes: recettes.map(r => {
      const x = rapproche(r)
      return [r.date, LIBELLES_SOURCE_RECETTE[r.source], r.piece, r.libelle, r.mode ? modes[r.mode] : null, r.montant, x?.date ?? null, x?.compte ?? null]
    }),
  }
}

export const COLONNES_DEPENSES: Colonne[] = [
  { titre: 'Date', type: 'date' }, { titre: 'Catégorie', type: 'texte' }, { titre: 'Fournisseur', type: 'texte' },
  { titre: 'Notes', type: 'texte' }, { titre: 'Montant (€)', type: 'montant' }, { titre: 'Justificatif', type: 'texte' },
  { titre: 'Rapprochée le', type: 'date' }, { titre: 'Compte', type: 'texte' },
]

export function exportDepenses(
  couts: Pick<Cost, 'id' | 'date' | 'category' | 'amount' | 'supplier' | 'notes'>[],
  fichiers: (c: { id: string }) => string[],
  rapproche: (c: { id: string }) => Rapprochement | null,
): Tableau {
  return {
    colonnes: COLONNES_DEPENSES,
    lignes: couts.map(c => {
      const f = fichiers(c)
      const x = rapproche(c)
      return [c.date, LIBELLES_CATEGORIES[c.category], c.supplier, c.notes, montantCout(c),
        f.length ? f.join(' + ') : 'MANQUANT', x?.date ?? null, x?.compte ?? null]
    }),
  }
}

export const COLONNES_MOUVEMENTS: Colonne[] = [
  { titre: 'Date', type: 'date' }, { titre: 'Compte', type: 'texte' }, { titre: 'Libellé bancaire', type: 'texte' },
  { titre: 'Montant du mouvement (€)', type: 'montant' }, { titre: 'Rapproché avec', type: 'texte' },
  { titre: 'Pièce', type: 'texte' }, { titre: 'Montant rapproché (€)', type: 'montant' },
]

export const LIBELLES_TYPE_RAPPROCHEMENT: Record<BankMatchKind, string> = {
  depense: 'Dépense', paiement: 'Paiement de facture', vente: 'Vente', hors_facture: 'Hors facture',
}

export function exportMouvementsRapproches(
  lignes: { date: DateISO; compte: string; label: string; montant: Centimes; kind: BankMatchKind; piece: string; rapproche: Centimes }[],
): Tableau {
  return {
    colonnes: COLONNES_MOUVEMENTS,
    lignes: lignes.map(l => [l.date, l.compte, l.label, l.montant, LIBELLES_TYPE_RAPPROCHEMENT[l.kind], l.piece, l.rapproche]),
  }
}
