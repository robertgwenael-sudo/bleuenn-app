// Libellés, tons et conversions partagés par les écrans Clients, Commandes et Ventes.
import {
  centimesEnEuros, ecartJours, enCentiemes, eurosEnCentimes, formatJourMois, jourSemaineIso, produitCentimes, SALE_CHANNELS,
  type ClientKind, type LigneVenteAInserer, type LineUnit, type OrderStatus, type SaleChannel,
} from '@/lib/domain'
import type { Tone } from '@/components/ui'
import type { CultureCatalog } from '@/lib/types'

export const CANAUX = SALE_CHANNELS
export const canalTone: Record<string, Tone> = { 'Marché': 'green', 'Fleuriste': 'blue', 'Abonnements': 'violet', 'Mariage': 'rose', 'Deuil': 'neutral' }

export const KINDS: ClientKind[] = ['fleuriste', 'particulier', 'mariage', 'abonne', 'evenementiel', 'commerce', 'autre']
export const KIND_LABEL: Record<ClientKind, string> = {
  fleuriste: 'Fleuriste', particulier: 'Particulier', mariage: 'Mariage', abonne: 'Abonné',
  evenementiel: 'Événementiel', commerce: 'Commerce', autre: 'Autre',
}
export const kindTone: Record<ClientKind, Tone> = {
  fleuriste: 'blue', particulier: 'neutral', mariage: 'rose', abonne: 'violet', evenementiel: 'amber', commerce: 'green', autre: 'neutral',
}

export const STATUTS: OrderStatus[] = ['devis', 'confirmee', 'prete', 'livree', 'annulee']
export const STATUT_LABEL: Record<OrderStatus, string> = {
  devis: 'Devis', confirmee: 'Confirmée', prete: 'Prête', livree: 'Livrée', annulee: 'Annulée',
}
export const statutTone: Record<OrderStatus, Tone> = {
  devis: 'neutral', confirmee: 'blue', prete: 'amber', livree: 'green', annulee: 'red',
}
/** Étape suivante du parcours d'une commande (null : livrer passe par « Livrer et facturer »). */
export const STATUT_SUIVANT: Partial<Record<OrderStatus, OrderStatus>> = { devis: 'confirmee', confirmee: 'prete' }

export const UNITES: LineUnit[] = ['tige', 'botte', 'bouquet', 'seau', 'autre']
export const UNITE_LABEL: Record<LineUnit, string> = { tige: 'Tige', botte: 'Botte', bouquet: 'Bouquet', seau: 'Seau', autre: 'Autre' }
/** Tiges par unité proposées par défaut ; modifiables ligne à ligne. */
export const TIGES_PAR_DEFAUT: Record<LineUnit, number> = { tige: 1, botte: 10, bouquet: 15, seau: 25, autre: 1 }

export function pluriel(n: number, mot: string, motPluriel = `${mot}s`) {
  return `${n.toLocaleString('fr-FR')} ${Math.abs(n) >= 2 ? motPluriel : mot}`
}
export function uniteQuantite(u: LineUnit, q: number) {
  if (u === 'autre') return q.toLocaleString('fr-FR')
  return pluriel(q, UNITE_LABEL[u].toLowerCase())
}

/** Date du jour à Paris, AAAA-MM-JJ : le domaine la prend toujours en paramètre. */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

// ------------------------------------------------------------
// Ligne en cours de saisie (commande ou vente)
// ------------------------------------------------------------
export interface LigneSaisie {
  key: string
  culture_id: string
  label: string
  unit: LineUnit
  quantity: string
  stems_per_unit: string
  unit_price: string
  /** Prix encore tiré du catalogue : il suit l'unité et les tiges par unité. */
  prixAuto: boolean
}

let k = 0
export const nouvelleLigne = (p: Partial<LigneSaisie> = {}): LigneSaisie => ({
  key: `l${++k}`, culture_id: '', label: '', unit: 'tige', quantity: '1', stems_per_unit: '1', unit_price: '', prixAuto: true, ...p,
})

/** Saisie décimale tolérante (virgule acceptée) ; null si vide ou illisible. */
export function lireCentiemes(v: string): number | null {
  if (!v.trim()) return null
  try { return enCentiemes(v.replace(',', '.'), 'valeur') } catch { return null }
}

/** Prix suggéré par le catalogue pour une unité : prix à la tige × tiges par unité. */
export function prixCatalogue(c: Pick<CultureCatalog, 'prix_tige'> | undefined, tigesParUnite: number): string {
  if (!c || !Number.isFinite(Number(c.prix_tige))) return ''
  return String(centimesEnEuros(produitCentimes(tigesParUnite, c.prix_tige)))
}

export type LigneValide = LigneVenteAInserer & { quantity: number; unit_price: number }

/** Contrôle une ligne : message d'erreur, ou la ligne prête à écrire (euros exacts au centime). */
export function validerLigne(l: LigneSaisie): { erreur: string } | { ligne: LigneValide } {
  const label = l.label.trim()
  if (!label) return { erreur: 'Choisissez une culture ou saisissez un libellé.' }
  const q = lireCentiemes(l.quantity)
  if (q === null || q <= 0) return { erreur: 'Quantité supérieure à zéro requise.' }
  const spu = Number(l.stems_per_unit)
  if (!Number.isInteger(spu) || spu <= 0) return { erreur: 'Tiges par unité : nombre entier positif.' }
  const p = lireCentiemes(l.unit_price)
  if (p === null || p < 0) return { erreur: 'Prix unitaire requis.' }
  return {
    ligne: {
      culture_id: l.culture_id || null, label, unit: l.unit,
      quantity: q / 100, // centièmes entiers → numeric(10,2) exact
      stems_per_unit: spu,
      unit_price: centimesEnEuros(p),
    },
  }
}

/** Ligne déjà enregistrée → ligne en saisie (modification d'une commande). */
export function versSaisie(l: LigneVenteAInserer): LigneSaisie {
  return nouvelleLigne({
    culture_id: l.culture_id ?? '', label: l.label, unit: l.unit,
    quantity: String(enCentiemes(l.quantity, 'Quantité') / 100),
    stems_per_unit: String(l.stems_per_unit),
    unit_price: String(centimesEnEuros(eurosEnCentimes(l.unit_price))),
    prixAuto: false,
  })
}

export const estCanal = (c: string): c is SaleChannel => (CANAUX as readonly string[]).includes(c)

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
/** « mardi 24 novembre » ; « aujourd'hui », « demain », « hier » près de la date du jour. */
export function jourLivraison(d: string, aujourdhui: string, relatif = true): string {
  if (relatif) {
    const e = ecartJours(aujourdhui, d)
    if (e === 0) return 'aujourd’hui'
    if (e === 1) return 'demain'
    if (e === -1) return 'hier'
  }
  return `${JOURS[jourSemaineIso(d) - 1]} ${formatJourMois(d, Number(aujourdhui.slice(0, 4)))}`
}

/** « 8 bottes Chrysanthème », mais « 6 × Bouquet d’hiver » quand le libellé nomme déjà l'unité. */
export function libelleQuantite(u: LineUnit, q: number, label: string): string {
  if (u === 'autre' || label.toLowerCase().startsWith(UNITE_LABEL[u].toLowerCase())) return `${q.toLocaleString('fr-FR')} × ${label}`
  return `${uniteQuantite(u, q)} ${label}`
}
