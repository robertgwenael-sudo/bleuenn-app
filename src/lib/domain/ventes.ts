// ============================================================
// Ventes et commandes en lignes
// ============================================================
// Tous les montants sont calculés en centimes entiers (voir montants.ts) ;
// la conversion en euros n'a lieu qu'à l'affichage ou à l'écriture.
// Les règles reprennent celles de la base (005) :
//   line_total = round(quantity * unit_price, 2)
//   tiges      = sum(quantity * stems_per_unit)::int
// ============================================================

import { diviserArrondi, enCentiemes, eurosEnCentimes, moyenneCentimes, produitCentimes, centimesEnEuros } from './montants'
import {
  SALE_CHANNELS,
  type Centimes, type Client, type ClientKind, type DateISO, type LigneBase, type Order,
  type OrderLine, type Sale, type SaleChannel,
} from './types'

export type LigneCalcul = Pick<LigneBase, 'label' | 'quantity' | 'stems_per_unit' | 'unit_price'>
  & Partial<Pick<LigneBase, 'line_total' | 'culture_id' | 'unit'>>

/** Montant d'une ligne en centimes ; reprend `line_total` s'il est déjà calculé par la base. */
export function montantLigne(l: LigneCalcul): Centimes {
  if (l.line_total !== undefined && l.line_total !== null) return eurosEnCentimes(l.line_total)
  return produitCentimes(l.quantity, l.unit_price)
}

/** Tiges d'une ligne : quantité × tiges par unité, arrondi à l'entier (comme `::int`). */
export function tigesLigne(l: Pick<LigneBase, 'quantity' | 'stems_per_unit'>): number {
  if (!Number.isInteger(l.stems_per_unit) || l.stems_per_unit <= 0) {
    throw new Error(`Tiges par unité invalide : ${l.stems_per_unit}`)
  }
  return Number(diviserArrondi(BigInt(enCentiemes(l.quantity, 'Quantité')) * BigInt(l.stems_per_unit), BigInt(100)))
}

export interface TotauxLignes {
  total_centimes: Centimes
  tiges: number
  nb_lignes: number
  /** Prix moyen à la tige, en centimes arrondis ; null sans tige. */
  prix_moyen_tige_centimes: Centimes | null
  /** Libellés distincts, comme `sales.cultures_sold`. */
  libelles: string
}

export function totauxLignes(lignes: LigneCalcul[]): TotauxLignes {
  let total = 0
  let tigesCentiemes = BigInt(0)
  for (const l of lignes) {
    total += montantLigne(l)
    tigesCentiemes += BigInt(enCentiemes(l.quantity, 'Quantité')) * BigInt(l.stems_per_unit)
  }
  const tiges = Number(diviserArrondi(tigesCentiemes, BigInt(100)))
  return {
    total_centimes: total,
    tiges,
    nb_lignes: lignes.length,
    prix_moyen_tige_centimes: moyenneCentimes(total, tiges),
    libelles: Array.from(new Set(lignes.map(l => l.label.trim()))).sort((a, b) => a.localeCompare(b, 'fr')).join(', '),
  }
}

// ------------------------------------------------------------
// Vente avec ses lignes (ou vente historique sans lignes)
// ------------------------------------------------------------
export type VenteCalcul = Pick<Sale, 'id' | 'date' | 'channel' | 'total' | 'tiges'>
  & Partial<Pick<Sale, 'client_id' | 'client' | 'order_id' | 'season_id'>>
  & { lignes?: LigneCalcul[] }

/** Total d'une vente : somme des lignes s'il y en a, sinon la colonne `total` historique. */
export function totalVente(v: VenteCalcul): Centimes {
  return v.lignes && v.lignes.length > 0 ? totauxLignes(v.lignes).total_centimes : eurosEnCentimes(v.total)
}

export function tigesVente(v: VenteCalcul): number {
  return v.lignes && v.lignes.length > 0 ? totauxLignes(v.lignes).tiges : v.tiges
}

// ------------------------------------------------------------
// Commande → vente
// ------------------------------------------------------------
const CANAL_PAR_KIND: Partial<Record<ClientKind, SaleChannel>> = {
  fleuriste: 'Fleuriste',
  mariage: 'Mariage',
  abonne: 'Abonnements',
}

export function estCanalVente(c: unknown): c is SaleChannel {
  return typeof c === 'string' && (SALE_CHANNELS as readonly string[]).includes(c)
}

/**
 * Canal de la vente issue d'une commande : celui choisi explicitement, sinon
 * celui de la commande s'il est valide, sinon déduit du type de client
 * (fleuriste, mariage, abonné). Autrement, erreur : on ne devine pas.
 */
export function canalDeVente(order: Pick<Order, 'channel'>, client?: Pick<Client, 'kind'> | null, choisi?: SaleChannel): SaleChannel {
  if (choisi) return choisi
  if (estCanalVente(order.channel)) return order.channel
  const deduit = client ? CANAL_PAR_KIND[client.kind] : undefined
  if (deduit) return deduit
  throw new Error('Canal de vente à choisir : la commande ne permet pas de le déduire')
}

export interface VenteAInserer {
  season_id: string
  user_id: string
  date: DateISO
  channel: SaleChannel
  client_id: string | null
  client: string | null
  order_id: string
  tiges: number
  /** Indicatif : recalculé par `sale_recompute()` dès l'insertion des lignes. */
  prix_unitaire: number
  cultures_sold: string
  notes: string | null
}

export type LigneVenteAInserer = Pick<LigneBase, 'culture_id' | 'label' | 'unit' | 'quantity' | 'stems_per_unit' | 'unit_price'>
  & Partial<Pick<LigneBase, 'vat_rate_id'>>

/**
 * Prépare la vente qui solde une commande : mêmes lignes, même client,
 * date de livraison par défaut. L'écran insère la vente, puis les lignes
 * avec le `sale_id` obtenu, puis met `orders.sale_id` et `status = 'livree'`.
 */
export function commandeVersVente(args: {
  order: Order
  lignes: (Pick<OrderLine, 'culture_id' | 'label' | 'unit' | 'quantity' | 'stems_per_unit' | 'unit_price'> & Partial<Pick<OrderLine, 'vat_rate_id'>>)[]
  userId: string
  client?: Pick<Client, 'kind' | 'name'> | null
  date?: DateISO
  canal?: SaleChannel
}): { vente: VenteAInserer; lignes: LigneVenteAInserer[]; total_centimes: Centimes } {
  const { order, lignes } = args
  if (order.status === 'annulee') throw new Error('Commande annulée : pas de vente')
  if (order.sale_id) throw new Error('Commande déjà transformée en vente')
  if (lignes.length === 0) throw new Error('Commande sans ligne : rien à vendre')
  const t = totauxLignes(lignes)
  return {
    vente: {
      season_id: order.season_id,
      user_id: args.userId,
      date: args.date ?? order.delivery_date,
      channel: canalDeVente(order, args.client, args.canal),
      client_id: order.client_id,
      client: args.client?.name ?? null,
      order_id: order.id,
      tiges: t.tiges,
      prix_unitaire: t.prix_moyen_tige_centimes === null ? 0 : centimesEnEuros(t.prix_moyen_tige_centimes),
      cultures_sold: t.libelles,
      notes: order.notes,
    },
    lignes: lignes.map(l => ({
      culture_id: l.culture_id, label: l.label, unit: l.unit,
      quantity: l.quantity, stems_per_unit: l.stems_per_unit, unit_price: l.unit_price, vat_rate_id: l.vat_rate_id ?? null,
    })),
    total_centimes: t.total_centimes,
  }
}

// ------------------------------------------------------------
// Synthèses
// ------------------------------------------------------------
export interface SyntheseVentes {
  cle: string
  libelle: string
  nb_ventes: number
  total_centimes: Centimes
  tiges: number
  panier_moyen_centimes: Centimes | null
  /** Part du CA total, entre 0 et 1. */
  part: number
}

function synthetiser(ventes: VenteCalcul[], cle: (v: VenteCalcul) => { cle: string; libelle: string }): SyntheseVentes[] {
  const m = new Map<string, { libelle: string; n: number; total: number; tiges: number }>()
  for (const v of ventes) {
    const k = cle(v)
    const acc = m.get(k.cle) ?? { libelle: k.libelle, n: 0, total: 0, tiges: 0 }
    acc.n += 1
    acc.total += totalVente(v)
    acc.tiges += tigesVente(v)
    m.set(k.cle, acc)
  }
  const ca = Array.from(m.values()).reduce((s, a) => s + a.total, 0)
  return Array.from(m.entries())
    .map(([k, a]) => ({
      cle: k, libelle: a.libelle, nb_ventes: a.n, total_centimes: a.total, tiges: a.tiges,
      panier_moyen_centimes: moyenneCentimes(a.total, a.n),
      part: ca > 0 ? a.total / ca : 0,
    }))
    .sort((a, b) => b.total_centimes - a.total_centimes || a.libelle.localeCompare(b.libelle, 'fr'))
}

/**
 * CA par client. Une vente sans `client_id` est rangée sous son texte
 * `client` historique s'il existe, sinon sous « Sans client ».
 */
export function syntheseParClient(ventes: VenteCalcul[], clients: Pick<Client, 'id' | 'name'>[]): SyntheseVentes[] {
  const noms = new Map(clients.map(c => [c.id, c.name]))
  return synthetiser(ventes, v => {
    if (v.client_id) return { cle: v.client_id, libelle: noms.get(v.client_id) ?? 'Client inconnu' }
    const libre = v.client?.trim()
    if (libre) return { cle: `libre:${libre.toLowerCase()}`, libelle: libre }
    return { cle: 'sans-client', libelle: 'Sans client' }
  })
}

export function syntheseParCanal(ventes: VenteCalcul[]): SyntheseVentes[] {
  return synthetiser(ventes, v => ({ cle: v.channel, libelle: v.channel }))
}

/** CA total d'une liste de ventes, en centimes. */
export function chiffreAffaires(ventes: VenteCalcul[]): Centimes {
  return ventes.reduce((s, v) => s + totalVente(v), 0)
}
