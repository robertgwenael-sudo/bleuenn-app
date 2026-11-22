// ============================================================
// Factures, avoirs et paiements (migration 010) — logique pure
// ============================================================
// Tout en centimes. Les règles reprennent celles de la base (fonctions
// emettre_facture / emettre_avoir, trigger paiement_controler, vue
// invoices_status) pour que l'écran annonce ce que la base fera, et pour
// que le mode démo les rejoue à l'identique.
//
// Aucune valeur réglementaire n'est écrite ici : mention d'absence de TVA,
// pénalités de retard et indemnité de recouvrement sont des textes saisis
// dans les réglages. Ce module ne fait que vérifier qu'ils sont remplis.
// ============================================================

import { ajouterJours, ecartJours } from './dates'
import { eurosEnCentimes, formatEuros, sommeCentimes, verifierCentimes } from './montants'
import { montantLigne } from './ventes'
import type {
  Centimes, ClientKind, DateISO, EurosNumeric, FarmBilling, Invoice, InvoiceLine, InvoiceSale, InvoiceStatut,
  LineUnit, Payment, PaymentMode, Sale, SaleLine,
} from './types'

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------
export const STATUT_FACTURE_LIBELLE: Record<InvoiceStatut, string> = {
  a_payer: 'À payer', partielle: 'Partiellement payée', payee: 'Payée',
  en_retard: 'En retard', annulee: 'Annulée par avoir', avoir: 'Avoir',
}

export const MODE_PAIEMENT_LIBELLE: Record<PaymentMode, string> = {
  virement: 'Virement', cheque: 'Chèque', especes: 'Espèces', carte: 'Carte', autre: 'Autre',
}

// ------------------------------------------------------------
// Numéro
// ------------------------------------------------------------
/** « F2026-0007 » : préfixe, année d'émission, rang sur 4 chiffres au moins. */
export function formatNumero(prefixe: string, annee: number, sequence: number): string {
  if (!/^[A-Za-z0-9-]{1,10}$/.test(prefixe)) throw new Error(`Préfixe de numéro invalide : « ${prefixe} »`)
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2999) throw new Error(`Année invalide : ${annee}`)
  if (!Number.isInteger(sequence) || sequence <= 0) throw new Error(`Rang de numéro invalide : ${sequence}`)
  return `${prefixe}${annee}-${String(sequence).padStart(4, '0')}`
}

/**
 * Vérifie qu'une série de numéros (même nature, même année) est continue :
 * renvoie les rangs manquants et les doublons. Vide = série conforme.
 */
export function controlerSerie(sequences: number[]): { manquants: number[]; doublons: number[] } {
  const tries = [...sequences].sort((a, b) => a - b)
  const doublons = tries.filter((s, i) => i > 0 && tries[i - 1] === s)
  const presents = new Set(tries)
  const max = tries.length ? tries[tries.length - 1] : 0
  const manquants: number[] = []
  for (let i = 1; i <= max; i++) if (!presents.has(i)) manquants.push(i)
  return { manquants, doublons: Array.from(new Set(doublons)) }
}

// ------------------------------------------------------------
// Réglages obligatoires
// ------------------------------------------------------------
export type ChampReglage = keyof Pick<FarmBilling,
  'raison_sociale' | 'adresse' | 'siret' | 'mention_tva' | 'penalites_retard' | 'indemnite_recouvrement'>

export interface MentionManquante {
  champ: ChampReglage
  libelle: string
  /** Exigée seulement pour un client professionnel. */
  pourProfessionnel: boolean
}

const CHAMPS: MentionManquante[] = [
  { champ: 'raison_sociale', libelle: 'Nom ou raison sociale', pourProfessionnel: false },
  { champ: 'adresse', libelle: 'Adresse', pourProfessionnel: false },
  { champ: 'siret', libelle: 'SIREN ou SIRET', pourProfessionnel: false },
  { champ: 'mention_tva', libelle: 'Mention d’absence de TVA', pourProfessionnel: false },
  { champ: 'penalites_retard', libelle: 'Taux des pénalités de retard', pourProfessionnel: true },
  { champ: 'indemnite_recouvrement', libelle: 'Indemnité forfaitaire de recouvrement', pourProfessionnel: true },
]

const vide = (v: unknown) => typeof v !== 'string' || v.trim() === ''

/** Les mentions contrôlées, dans l'ordre d'affichage de la liste de contrôle. */
export const MENTIONS_CONTROLEES: readonly MentionManquante[] = CHAMPS

/**
 * Champs obligatoires non remplis. Sans `professionnel`, ne contrôle que
 * ce qu'exige toute facture ; avec, ajoute pénalités et indemnité.
 * Un SIREN/SIRET mal formé compte comme manquant.
 */
export function reglagesManquants(b: Partial<FarmBilling> | null | undefined, opts: { professionnel?: boolean } = {}): MentionManquante[] {
  return CHAMPS.filter(c => {
    if (c.pourProfessionnel && !opts.professionnel) return false
    const v = b?.[c.champ]
    if (c.champ === 'siret') return vide(v) || !siretBienForme(v as string)
    return vide(v)
  })
}

/** Ne garde que les chiffres d'un SIREN/SIRET saisi avec espaces. */
export function nettoyerSiret(saisie: string): string {
  return saisie.replace(/[\s.\-]/g, '')
}

/** 9 chiffres (SIREN) ou 14 (SIRET), comme la contrainte de `farm_billing.siret`. */
export function siretBienForme(s: string): boolean {
  return /^[0-9]{9}([0-9]{5})?$/.test(s)
}

/** « 123 456 789 00011 » pour l'affichage. */
export function formatSiret(s: string): string {
  if (/^[0-9]{14}$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`
  if (/^[0-9]{9}$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`
  return s
}

/**
 * Client professionnel par défaut selon son type (même règle que
 * emettre_facture) ; l'écran laisse corriger au cas par cas.
 */
export function estClientProfessionnel(kind: ClientKind | null | undefined): boolean {
  return kind === 'fleuriste' || kind === 'commerce' || kind === 'evenementiel'
}

// ------------------------------------------------------------
// Totaux et situation de paiement
// ------------------------------------------------------------
export function totalFacture(lignes: Pick<InvoiceLine, 'line_total'>[]): Centimes {
  return sommeCentimes(lignes.map(l => eurosEnCentimes(l.line_total)))
}

export function montantPaye(paiements: Pick<Payment, 'amount'>[]): Centimes {
  return sommeCentimes(paiements.map(p => eurosEnCentimes(p.amount)))
}

export interface SituationFacture {
  total: Centimes
  paye: Centimes
  /** Reste dû ; négatif = trop-perçu à rembourser (facture annulée déjà payée). 0 pour un avoir. */
  reste: Centimes
  statut: InvoiceStatut
  /** Jours depuis l'échéance, seulement si en retard. */
  joursRetard: number | null
}

/** Même calcul que la vue `invoices_status`, à la date (de Paris) donnée. */
export function situationFacture(
  f: Pick<Invoice, 'kind' | 'total' | 'annulee_par' | 'date_echeance'>,
  paiements: Pick<Payment, 'amount'>[],
  aujourdhui: DateISO,
): SituationFacture {
  const total = eurosEnCentimes(f.total)
  const paye = montantPaye(paiements)
  if (f.kind === 'avoir') return { total, paye, reste: 0, statut: 'avoir', joursRetard: null }
  if (f.annulee_par) return { total, paye, reste: -paye, statut: 'annulee', joursRetard: null }
  const reste = total - paye
  if (paye >= total) return { total, paye, reste, statut: 'payee', joursRetard: null }
  if (f.date_echeance && ecartJours(f.date_echeance, aujourdhui) > 0) {
    return { total, paye, reste, statut: 'en_retard', joursRetard: ecartJours(f.date_echeance, aujourdhui) }
  }
  return { total, paye, reste, statut: paye > 0 ? 'partielle' : 'a_payer', joursRetard: null }
}

/** Date d'échéance : émission + délai ; null ou 0 = à réception (même jour). */
export function dateEcheance(emission: DateISO, delaiJours: number | null | undefined): DateISO {
  const d = delaiJours ?? 0
  if (!Number.isInteger(d) || d < 0 || d > 365) throw new Error(`Délai de paiement invalide : ${delaiJours}`)
  return ajouterJours(emission, d)
}

// ------------------------------------------------------------
// Contrôle d'un paiement (miroir du trigger paiement_controler)
// ------------------------------------------------------------
export interface PaiementSaisi {
  montant: Centimes
  contrepasse_de?: string | null
  notes?: string | null
}

/** Message d'erreur si la base refusera ce paiement, sinon null. */
export function controlerPaiement(
  f: Pick<Invoice, 'kind' | 'total' | 'annulee_par' | 'numero'>,
  existants: Pick<Payment, 'id' | 'amount' | 'contrepasse_de'>[],
  p: PaiementSaisi,
): string | null {
  if (f.kind !== 'facture') return 'Un paiement s’enregistre sur une facture, pas sur un avoir'
  if (!Number.isSafeInteger(p.montant) || p.montant === 0) return 'Montant invalide'
  const total = eurosEnCentimes(f.total)
  const paye = montantPaye(existants)
  if (p.montant > 0) {
    if (p.contrepasse_de) return 'Une contre-passation est un montant négatif'
    if (f.annulee_par) return `Facture ${f.numero} annulée par avoir : aucun encaissement possible`
    if (paye + p.montant > total) return `Le paiement (${formatEuros(p.montant)}) dépasse le reste dû (${formatEuros(total - paye)})`
    return null
  }
  if (p.contrepasse_de) {
    const o = existants.find(x => x.id === p.contrepasse_de)
    if (!o) return 'Paiement à contre-passer introuvable sur cette facture'
    const montantO = eurosEnCentimes(o.amount)
    if (montantO <= 0) return 'On ne contre-passe qu’un encaissement'
    if (existants.some(x => x.contrepasse_de === o.id)) return 'Ce paiement est déjà contre-passé'
    if (p.montant !== -montantO) return 'Une contre-passation reprend exactement le montant du paiement'
  } else if (!f.annulee_par) {
    return 'Un montant négatif contre-passe un paiement précis (ou rembourse une facture annulée)'
  } else if (vide(p.notes)) {
    return 'Un remboursement doit être expliqué (notes)'
  }
  if (paye + p.montant < 0) return 'Le remboursement dépasse ce qui a été encaissé'
  return null
}

/** Paiements encore contre-passables : encaissements non déjà annulés. */
export function paiementsContrepassables<P extends Pick<Payment, 'id' | 'amount' | 'contrepasse_de'>>(paiements: P[]): P[] {
  const annules = new Set(paiements.map(p => p.contrepasse_de).filter(Boolean))
  return paiements.filter(p => eurosEnCentimes(p.amount) > 0 && !annules.has(p.id))
}

// ------------------------------------------------------------
// Ventes à facturer
// ------------------------------------------------------------
export type VenteFacturable = Pick<Sale, 'id' | 'date' | 'total' | 'tiges' | 'prix_unitaire' | 'cultures_sold' | 'client_id' | 'client'>
  & { season_id?: string; created_at?: string; lignes?: Pick<SaleLine, 'id' | 'label' | 'unit' | 'quantity' | 'stems_per_unit' | 'unit_price' | 'culture_id' | 'line_total' | 'created_at'>[] }

/** Ventes couvertes par une facture non annulée (lien non libéré). */
export function ventesFacturees(liens: Pick<InvoiceSale, 'sale_id' | 'liberee_par_avoir' | 'invoice_id'>[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const l of liens) if (l.sale_id && !l.liberee_par_avoir) m.set(l.sale_id, l.invoice_id)
  return m
}

export interface GroupeAFacturer<V> {
  /** client_id, ou `vente:<id>` pour une vente sans fiche client (facturée seule). */
  cle: string
  client_id: string | null
  nom: string
  ventes: V[]
  total: Centimes
}

/**
 * Ventes non facturées groupées par client. Une vente sans fiche client
 * forme son propre groupe : elle se facture seule (règle de la base).
 * Groupes triés par total décroissant, ventes par date.
 */
export function grouperAFacturer<V extends VenteFacturable>(
  ventes: V[],
  liens: Pick<InvoiceSale, 'sale_id' | 'liberee_par_avoir' | 'invoice_id'>[],
  clients: { id: string; name: string }[],
  totalDe: (v: V) => Centimes,
): GroupeAFacturer<V>[] {
  const factures = ventesFacturees(liens)
  const noms = new Map(clients.map(c => [c.id, c.name]))
  const groupes = new Map<string, GroupeAFacturer<V>>()
  for (const v of ventes) {
    if (factures.has(v.id)) continue
    const cle = v.client_id ?? `vente:${v.id}`
    const g = groupes.get(cle) ?? {
      cle, client_id: v.client_id ?? null,
      nom: (v.client_id && noms.get(v.client_id)) || v.client?.trim() || 'Sans client',
      ventes: [], total: 0,
    }
    g.ventes.push(v)
    const t = totalDe(v)
    verifierCentimes(t)
    g.total += t
    groupes.set(cle, g)
  }
  const out = Array.from(groupes.values())
  for (const g of out) g.ventes.sort((a, b) => a.date.localeCompare(b.date))
  return out.sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'))
}

/** Message d'erreur si ces ventes ne peuvent pas aller sur une même facture, sinon null. */
export function controlerSelection(ventes: Pick<VenteFacturable, 'id' | 'client_id'>[], dejaFacturees: Map<string, string>): string | null {
  if (ventes.length === 0) return 'Aucune vente à facturer'
  if (ventes.some(v => dejaFacturees.has(v.id))) return 'Vente déjà facturée'
  if (ventes.length > 1 && ventes.some(v => !v.client_id)) return 'Une vente sans fiche client se facture seule'
  if (new Set(ventes.map(v => v.client_id)).size > 1) return 'Les ventes doivent être du même client'
  return null
}

// ------------------------------------------------------------
// Lignes figées (miroir de _lignes_a_facturer)
// ------------------------------------------------------------
export interface LigneFigee {
  position: number
  sale_id: string
  sale_date: DateISO
  culture_id: string | null
  label: string
  unit: LineUnit
  /** Nombre décimal en texte (« 2.5 »), comme numeric(10,2). */
  quantity: number
  stems_per_unit: number
  unit_price: Centimes
  line_total: Centimes
}

/** Vrai si un prix en euros tombe pile au centime. */
function auCentime(prix: EurosNumeric): boolean {
  const s = String(prix).trim()
  const m = /^-?\d*(?:[.,](\d*))?$/.exec(s)
  if (!m) return false
  return (m[1] ?? '').replace(/0+$/, '').length <= 2
}

/**
 * Lignes d'une facture à partir des ventes : lignes de vente, ou une ligne
 * tirée de l'en-tête pour une vente ancienne sans lignes (tiges × prix si le
 * prix tombe au centime, sinon 1 × total, tiges rappelées dans le libellé).
 * Ordre : vente par vente (date, création), puis création et libellé.
 */
export function lignesAFacturer(ventes: VenteFacturable[]): LigneFigee[] {
  type Brute = Omit<LigneFigee, 'position'> & { k: string[] }
  const brutes: Brute[] = []
  for (const v of ventes) {
    const cv = v.created_at ?? ''
    if (v.lignes && v.lignes.length > 0) {
      for (const l of v.lignes) {
        brutes.push({
          sale_id: v.id, sale_date: v.date, culture_id: l.culture_id ?? null, label: l.label, unit: l.unit,
          quantity: Number(l.quantity), stems_per_unit: l.stems_per_unit,
          unit_price: eurosEnCentimes(l.unit_price), line_total: montantLigne(l),
          k: [v.date, cv, v.id, l.created_at ?? '', l.label, l.id],
        })
      }
    } else {
      const ok = auCentime(v.prix_unitaire) && v.tiges > 0
      const libelle = (v.cultures_sold ?? '').trim() || 'Fleurs coupées'
      brutes.push({
        sale_id: v.id, sale_date: v.date, culture_id: null,
        label: ok ? libelle : `${libelle} (${v.tiges} tiges)`,
        unit: ok ? 'tige' : 'autre', quantity: ok ? v.tiges : 1, stems_per_unit: 1,
        unit_price: ok ? eurosEnCentimes(v.prix_unitaire) : eurosEnCentimes(v.total),
        line_total: eurosEnCentimes(v.total),
        k: [v.date, cv, v.id, cv, libelle, ''],
      })
    }
  }
  brutes.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) { const c = a.k[i] < b.k[i] ? -1 : a.k[i] > b.k[i] ? 1 : 0; if (c) return c }
    return 0
  })
  return brutes.map(({ k: _k, ...l }, i) => ({ ...l, position: i + 1 }))
}

// ------------------------------------------------------------
// Liste et filtres
// ------------------------------------------------------------
export type FiltreStatut = 'toutes' | 'impayees' | InvoiceStatut

/** Filtre de la liste : « impayées » = à payer, partielle ou en retard. */
export function correspondFiltre(statut: InvoiceStatut, filtre: FiltreStatut): boolean {
  if (filtre === 'toutes') return true
  if (filtre === 'impayees') return statut === 'a_payer' || statut === 'partielle' || statut === 'en_retard'
  return statut === filtre
}

export interface SyntheseFactures {
  /** Reste dû des factures non annulées. */
  restantDu: Centimes
  enRetard: Centimes
  nbEnRetard: number
  /** Factures moins avoirs. */
  factureNet: Centimes
  encaisse: Centimes
}

export function syntheseFactures(situations: { kind: Invoice['kind']; s: SituationFacture }[]): SyntheseFactures {
  let restantDu = 0, enRetard = 0, nbEnRetard = 0, factureNet = 0, encaisse = 0
  for (const { s } of situations) {
    factureNet += s.total
    encaisse += s.paye
    if (s.statut === 'a_payer' || s.statut === 'partielle' || s.statut === 'en_retard') restantDu += s.reste
    if (s.statut === 'en_retard') { enRetard += s.reste; nbEnRetard++ }
  }
  return { restantDu, enRetard, nbEnRetard, factureNet, encaisse }
}
