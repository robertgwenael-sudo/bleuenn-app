// ============================================================
// Achats : fournisseurs et bons de commande (migration 011)
// ============================================================
// Fonctions pures. Montants en centimes entiers, quantités en centièmes
// entiers (une quantité est un numeric(12,2) : 2,5 sachets existent).
// La date du jour est toujours un paramètre.
//
// Choix à faire valider (repris dans le rapport) :
//  * besoin d'une culture = somme des `graines_necessaires` de ses
//    plantations de la saison ; à défaut, le `graines_needed` saisi dans
//    seed_orders ;
//  * déjà couvert = « commandées hors bon » (seed_orders.graines_ordered,
//    l'ancienne saisie manuelle) + lignes des bons de la saison, brouillons
//    compris, annulés exclus ;
//  * graines, plants, bulbes, tubercules et godets comptent 1 pour 1 dans
//    le besoin. Sachets, grammes et « unité » ne se convertissent pas : une
//    culture commandée ainsi n'est jamais reproposée, elle est signalée
//    « à vérifier » (aucune conversion devinée) ;
//  * fournisseur habituel = celui du dernier bon envoyé contenant la
//    culture, sinon le fournisseur texte de seed_orders s'il correspond à
//    un fournisseur du fichier, sinon « à choisir ». Prix et unité repris de
//    cette dernière ligne ; sans historique, prix « à saisir ».
// ============================================================

import { ajouterJours, ecartJours, formatDateLongue } from './dates'
import { enCentiemes, eurosEnCentimes, formatEuros, produitCentimes } from './montants'
import type {
  Centimes, CostCategory, CultureCatalog, DateISO, EurosNumeric, PurchaseOrder, PurchaseOrderLine,
  PurchaseOrderStatus, PurchaseUnit, SeedOrder, Supplier, SupplierKind,
} from './types'

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------
export const LIBELLES_STATUTS_BON: Record<PurchaseOrderStatus, string> = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé',
  confirme: 'Confirmé',
  recu_partiel: 'Reçu partiellement',
  recu: 'Reçu',
  annule: 'Annulé',
}

export const LIBELLES_TYPES_FOURNISSEUR: Record<SupplierKind, string> = {
  semencier: 'Semencier',
  pepiniere: 'Pépinière, plants',
  bulbes: 'Bulbes et tubercules',
  fournitures: 'Fournitures',
  emballage: 'Emballage',
  autre: 'Autre',
}

/** [singulier, pluriel] */
export const LIBELLES_UNITES: Record<PurchaseUnit, [string, string]> = {
  sachet: ['sachet', 'sachets'],
  graines: ['graine', 'graines'],
  grammes: ['g', 'g'],
  plants: ['plant', 'plants'],
  bulbes: ['bulbe', 'bulbes'],
  tubercules: ['tubercule', 'tubercules'],
  godets: ['godet', 'godets'],
  unite: ['unité', 'unités'],
}

/** Unités qui comptent un pour un dans un besoin exprimé en graines ou plants. */
export const UNITES_COMPTABLES: readonly PurchaseUnit[] = ['graines', 'plants', 'bulbes', 'tubercules', 'godets']

export const estUniteComptable = (u: PurchaseUnit) => UNITES_COMPTABLES.includes(u)

/** Statuts où une livraison est attendue. */
export const STATUTS_EN_COURS: readonly PurchaseOrderStatus[] = ['envoye', 'confirme', 'recu_partiel']

// ------------------------------------------------------------
// Quantités
// ------------------------------------------------------------
/** Quantité numeric(12,2) → centièmes entiers. */
export function quantiteCentiemes(q: EurosNumeric): number {
  return enCentiemes(q, 'Quantité')
}

/** Centièmes → quantité pour une colonne numeric(12,2). */
export function centiemesEnQuantite(c: number): number {
  if (!Number.isSafeInteger(c)) throw new Error(`Quantité en centièmes non entière : ${c}`)
  return c / 100
}

/** « 1 250 », « 2,5 » : quantité sans flottant affiché. */
export function formatQuantite(q: EurosNumeric): string {
  const c = quantiteCentiemes(q)
  const neg = c < 0
  const abs = Math.abs(c)
  const ent = Math.floor(abs / 100)
  const dec = abs - ent * 100
  const milliers = String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const decimales = dec === 0 ? '' : ',' + String(dec).padStart(2, '0').replace(/0$/, '')
  return `${neg ? '−' : ''}${milliers}${decimales}`
}

/** « 500 graines », « 1 sachet », « 250 g ». */
export function formatQuantiteUnite(q: EurosNumeric, u: PurchaseUnit): string {
  const [un, plusieurs] = LIBELLES_UNITES[u]
  return `${formatQuantite(q)} ${quantiteCentiemes(q) <= 100 ? un : plusieurs}`
}

/** Lit une quantité saisie (« 12 », « 2,5 ») ; null si illisible ou négative. */
export function lireQuantite(saisie: string): number | null {
  const s = saisie.replace(/\s/g, '')
  if (!s) return null
  try {
    const c = enCentiemes(s, 'Quantité')
    return c >= 0 ? centiemesEnQuantite(c) : null
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// Montants d'un bon
// ------------------------------------------------------------
type LigneMontant = Pick<PurchaseOrderLine, 'quantity' | 'unit_price'>
type LigneReception = Pick<PurchaseOrderLine, 'quantity' | 'quantity_received' | 'unit_price'>

/** round(quantité × prix, 2) en centimes, comme la colonne générée ; null sans prix. */
export function totalLigne(l: LigneMontant): Centimes | null {
  if (l.unit_price === null || l.unit_price === undefined || l.unit_price === '') return null
  return produitCentimes(l.quantity, l.unit_price)
}

export interface TotauxBon {
  /** Somme des lignes ayant un prix. */
  lignes: Centimes
  port: Centimes
  /** lignes + port. Incomplet si `prixManquants` > 0. */
  total: Centimes
  /** Valeur de ce qui est reçu (hors port). */
  recu: Centimes
  /** Valeur de ce qui reste à recevoir (hors port). */
  resteARecevoir: Centimes
  /** Nombre de lignes sans prix : le total n'est alors pas calculable. */
  prixManquants: number
}

export function totauxBon(lignes: LigneReception[], port: EurosNumeric | null | undefined): TotauxBon {
  let total = 0, recu = 0, manquants = 0
  for (const l of lignes) {
    const t = totalLigne(l)
    if (t === null) { manquants += 1; continue }
    total += t
    // Même formule que la base : round(reçu × prix, 2)
    recu += produitCentimes(l.quantity_received ?? 0, l.unit_price as EurosNumeric)
  }
  const p = port === null || port === undefined || port === '' ? 0 : eurosEnCentimes(port)
  return { lignes: total, port: p, total: total + p, recu, resteARecevoir: total - recu, prixManquants: manquants }
}

/** Reste à recevoir d'une ligne, en centièmes de son unité. */
export function resteLigne(l: Pick<PurchaseOrderLine, 'quantity' | 'quantity_received'>): number {
  return Math.max(0, quantiteCentiemes(l.quantity) - quantiteCentiemes(l.quantity_received ?? 0))
}

export type EtatReception = 'rien' | 'partiel' | 'complet'

export function etatReception(lignes: Pick<PurchaseOrderLine, 'quantity' | 'quantity_received'>[]): EtatReception {
  if (lignes.length === 0) return 'rien'
  const recus = lignes.filter(l => quantiteCentiemes(l.quantity_received ?? 0) > 0).length
  if (lignes.every(l => resteLigne(l) === 0)) return 'complet'
  return recus > 0 ? 'partiel' : 'rien'
}

/**
 * Dépense que créera une réception (miroir de receptionner_bon) :
 * round(après × prix) − round(avant × prix), en centimes.
 */
export function depenseReception(l: Pick<PurchaseOrderLine, 'quantity_received' | 'unit_price'>, recuApres: EurosNumeric): Centimes {
  if (l.unit_price === null || l.unit_price === undefined) return 0
  return produitCentimes(recuApres, l.unit_price) - produitCentimes(l.quantity_received ?? 0, l.unit_price)
}

/** Catégorie de dépense d'une ligne reçue (même règle que receptionner_bon). */
export function categorieDepense(unit: PurchaseUnit, kind: SupplierKind): CostCategory {
  if (unit === 'sachet' || unit === 'graines' || unit === 'grammes') return 'semences'
  if (unit === 'plants' || unit === 'bulbes' || unit === 'tubercules' || unit === 'godets') return 'plants_bulbes'
  switch (kind) {
    case 'emballage': return 'emballage'
    case 'fournitures': return 'materiel'
    case 'semencier': return 'semences'
    case 'pepiniere':
    case 'bulbes': return 'plants_bulbes'
    default: return 'autre'
  }
}

// ------------------------------------------------------------
// Retards
// ------------------------------------------------------------
export interface Retard { jours: number }

/** Retard d'un bon attendu dont la date prévue est passée ; null sinon (ou sans date prévue). */
export function retardBon(b: Pick<PurchaseOrder, 'status' | 'expected_date'>, aujourdhui: DateISO): Retard | null {
  if (!STATUTS_EN_COURS.includes(b.status) || !b.expected_date) return null
  const j = ecartJours(b.expected_date, aujourdhui)
  return j > 0 ? { jours: j } : null
}

/** Date de livraison attendue d'après le délai habituel saisi ; null si inconnu. */
export function dateAttendue(dateCommande: DateISO | null, delaiJours: number | null | undefined): DateISO | null {
  if (!dateCommande || delaiJours === null || delaiJours === undefined) return null
  return ajouterJours(dateCommande, delaiJours)
}

// ------------------------------------------------------------
// Conditions du fournisseur
// ------------------------------------------------------------
export interface AlerteCondition {
  type: 'minimum' | 'franco'
  seuil: Centimes
  /** Ce qu'il manque pour l'atteindre. */
  manque: Centimes
  message: string
}

/**
 * Compare le montant des lignes (hors port) aux conditions SAISIES du
 * fournisseur. Une condition non renseignée ne donne jamais d'alerte (et
 * jamais un seuil à 0 inventé).
 */
export function alertesConditions(
  montantLignes: Centimes,
  f: Pick<Supplier, 'min_order_amount' | 'free_shipping_threshold'> | null | undefined,
): AlerteCondition[] {
  if (!f) return []
  const out: AlerteCondition[] = []
  if (f.min_order_amount !== null && f.min_order_amount !== undefined && f.min_order_amount !== '') {
    const seuil = eurosEnCentimes(f.min_order_amount)
    if (montantLignes < seuil) out.push({
      type: 'minimum', seuil, manque: seuil - montantLignes,
      message: `Minimum de commande non atteint : ${formatEuros(seuil)}, il manque ${formatEuros(seuil - montantLignes)}`,
    })
  }
  if (f.free_shipping_threshold !== null && f.free_shipping_threshold !== undefined && f.free_shipping_threshold !== '') {
    const seuil = eurosEnCentimes(f.free_shipping_threshold)
    if (montantLignes < seuil) out.push({
      type: 'franco', seuil, manque: seuil - montantLignes,
      message: `Franco de port non atteint : ${formatEuros(seuil)}, il manque ${formatEuros(seuil - montantLignes)}`,
    })
  }
  return out
}

// ------------------------------------------------------------
// Besoins et brouillons
// ------------------------------------------------------------
export type PlantingBesoin = { culture_id: string; culture_name: string; graines_necessaires: number | null }
export type SeedOrderBesoin = Pick<SeedOrder, 'id' | 'culture_name' | 'graines_needed' | 'graines_ordered' | 'supplier' | 'bio'>
type CultureNom = Pick<CultureCatalog, 'id' | 'name'>
type BonHisto = Pick<PurchaseOrder, 'id' | 'season_id' | 'supplier_id' | 'status' | 'order_date' | 'created_at'>
type LigneHisto = Pick<PurchaseOrderLine, 'purchase_order_id' | 'culture_id' | 'unit' | 'quantity' | 'unit_price' | 'label' | 'variety'>
type FournisseurNom = Pick<Supplier, 'id' | 'name' | 'archived_at'>

export interface BesoinCulture {
  /** culture_id, ou « nom:… » pour un besoin seed_orders sans culture au catalogue. */
  cle: string
  culture_id: string | null
  culture_name: string
  /** Graines ou plants nécessaires (entier). */
  besoin: number
  /** seed_orders.graines_ordered : commandées hors bon (ancienne saisie). */
  horsBon: number
  /** Lignes des bons de la saison en unités comptables, brouillons compris. */
  enBons: number
  /** Lignes de la saison en sachets, grammes ou unités : non convertibles. */
  autresUnites: { unit: PurchaseUnit; quantite: number }[]
  /** max(0, besoin − horsBon − enBons). */
  reste: number
  seed_order_id: string | null
  bio: boolean
  fournisseur: { id: string; name: string } | null
  /** D'où vient le fournisseur proposé. */
  origineFournisseur: 'dernier_bon' | 'seed_orders' | null
  unite: PurchaseUnit
  /** Prix de la dernière ligne dans la même unité ; null = à saisir. */
  prix: EurosNumeric | null
  variete: string | null
}

const normaliser = (s: string) => s.trim().toLocaleLowerCase('fr')

export function besoinsAchat(args: {
  seasonId: string
  plantings: PlantingBesoin[]
  seedOrders: SeedOrderBesoin[]
  catalog: CultureNom[]
  /** Tous les bons de la ferme (historique). */
  bons: BonHisto[]
  lignes: LigneHisto[]
  fournisseurs: FournisseurNom[]
}): BesoinCulture[] {
  const { seasonId, plantings, seedOrders, catalog, bons, lignes, fournisseurs } = args
  const idParNom = new Map(catalog.map(c => [normaliser(c.name), c.id]))
  const bonParId = new Map(bons.map(b => [b.id, b]))
  const actifs = new Map(fournisseurs.filter(f => !f.archived_at).map(f => [f.id, f]))
  const fournisseurParNom = new Map(fournisseurs.filter(f => !f.archived_at).map(f => [normaliser(f.name), f]))

  type Acc = { culture_id: string | null; name: string; besoinPlants: number; so: SeedOrderBesoin | null }
  const acc = new Map<string, Acc>()
  for (const p of plantings) {
    const a = acc.get(p.culture_id) ?? { culture_id: p.culture_id, name: p.culture_name, besoinPlants: 0, so: null }
    a.besoinPlants += Math.max(0, Math.round(p.graines_necessaires ?? 0))
    acc.set(p.culture_id, a)
  }
  for (const so of seedOrders) {
    const cid = idParNom.get(normaliser(so.culture_name)) ?? null
    const cle = cid ?? `nom:${normaliser(so.culture_name)}`
    const a = acc.get(cle) ?? { culture_id: cid, name: so.culture_name, besoinPlants: 0, so: null }
    a.so = so
    acc.set(cle, a)
  }

  // Dernière ligne envoyée par culture (historique de la ferme)
  const rang = (b: BonHisto) => `${b.order_date ?? ''}|${b.created_at}`
  const derniere = new Map<string, { l: LigneHisto; b: BonHisto }>()
  for (const l of lignes) {
    const b = bonParId.get(l.purchase_order_id)
    if (!b || !l.culture_id || b.status === 'brouillon' || b.status === 'annule') continue
    const cur = derniere.get(l.culture_id)
    if (!cur || rang(b) > rang(cur.b)) derniere.set(l.culture_id, { l, b })
  }

  const out: BesoinCulture[] = []
  for (const [cle, a] of acc) {
    const besoin = a.besoinPlants > 0 ? a.besoinPlants : Math.max(0, a.so?.graines_needed ?? 0)
    const horsBon = Math.max(0, a.so?.graines_ordered ?? 0)
    let enBonsC = 0
    const autres = new Map<PurchaseUnit, number>()
    for (const l of lignes) {
      const b = bonParId.get(l.purchase_order_id)
      if (!b || b.season_id !== seasonId || b.status === 'annule') continue
      const memeCulture = a.culture_id ? l.culture_id === a.culture_id : !l.culture_id && normaliser(l.label) === normaliser(a.name)
      if (!memeCulture) continue
      const q = quantiteCentiemes(l.quantity)
      if (estUniteComptable(l.unit)) enBonsC += q
      else autres.set(l.unit, (autres.get(l.unit) ?? 0) + q)
    }
    const enBons = Math.ceil(enBonsC / 100)

    let fournisseur: BesoinCulture['fournisseur'] = null
    let origine: BesoinCulture['origineFournisseur'] = null
    let unite: PurchaseUnit = 'graines'
    let prix: EurosNumeric | null = null
    let variete: string | null = null
    const d = a.culture_id ? derniere.get(a.culture_id) : undefined
    if (d) {
      const f = actifs.get(d.b.supplier_id)
      if (f) { fournisseur = { id: f.id, name: f.name }; origine = 'dernier_bon' }
      if (estUniteComptable(d.l.unit)) {
        unite = d.l.unit
        prix = d.l.unit_price ?? null
        variete = d.l.variety ?? null
      }
    }
    if (!fournisseur && a.so?.supplier) {
      const f = fournisseurParNom.get(normaliser(a.so.supplier))
      if (f) { fournisseur = { id: f.id, name: f.name }; origine = 'seed_orders' }
    }

    out.push({
      cle, culture_id: a.culture_id, culture_name: a.name, besoin, horsBon, enBons,
      autresUnites: [...autres].map(([unit, c]) => ({ unit, quantite: centiemesEnQuantite(c) })),
      reste: Math.max(0, besoin - horsBon - enBons),
      seed_order_id: a.so?.id ?? null, bio: !!a.so?.bio,
      fournisseur, origineFournisseur: origine, unite, prix, variete,
    })
  }
  return out.sort((x, y) => x.culture_name.localeCompare(y.culture_name, 'fr'))
}

export interface LigneProposee {
  culture_id: string | null
  label: string
  variety: string | null
  unit: PurchaseUnit
  quantity: number
  unit_price: EurosNumeric | null
  organic: boolean
  seed_order_id: string | null
}

export interface BrouillonPropose {
  /** null : fournisseur « à choisir » avant création. */
  supplier_id: string | null
  supplier_name: string | null
  lignes: LigneProposee[]
}

/**
 * Brouillons de bons à partir des besoins : un par fournisseur habituel,
 * plus un groupe « à choisir ». Seules les cultures avec un reste positif et
 * sans ligne en unité non convertible sont proposées.
 */
export function proposerBrouillons(besoins: BesoinCulture[]): BrouillonPropose[] {
  const groupes = new Map<string, BrouillonPropose>()
  for (const b of besoins) {
    if (b.reste <= 0 || b.autresUnites.length > 0) continue
    const cle = b.fournisseur?.id ?? ''
    const g = groupes.get(cle) ?? { supplier_id: b.fournisseur?.id ?? null, supplier_name: b.fournisseur?.name ?? null, lignes: [] }
    g.lignes.push({
      culture_id: b.culture_id, label: b.culture_name, variety: b.variete, unit: b.unite,
      quantity: b.reste, unit_price: b.prix, organic: b.bio, seed_order_id: b.seed_order_id,
    })
    groupes.set(cle, g)
  }
  return [...groupes.values()].sort((a, b) => {
    if (a.supplier_name === null) return 1
    if (b.supplier_name === null) return -1
    return a.supplier_name.localeCompare(b.supplier_name, 'fr')
  })
}

// ------------------------------------------------------------
// Historique fournisseur
// ------------------------------------------------------------
/** Montant commandé (lignes + port) par saison, bons envoyés et suivants, annulés exclus. */
export function achatsParSaison(
  bons: Pick<PurchaseOrder, 'id' | 'season_id' | 'status' | 'shipping_amount'>[],
  lignes: (LigneMontant & Pick<PurchaseOrderLine, 'purchase_order_id'>)[],
): Map<string, Centimes> {
  const parBon = new Map<string, LigneMontant[]>()
  for (const l of lignes) {
    const t = parBon.get(l.purchase_order_id) ?? []
    t.push(l)
    parBon.set(l.purchase_order_id, t)
  }
  const out = new Map<string, Centimes>()
  for (const b of bons) {
    if (b.status === 'brouillon' || b.status === 'annule') continue
    const t = totauxBon((parBon.get(b.id) ?? []).map(l => ({ ...l, quantity_received: 0 })), b.shipping_amount)
    out.set(b.season_id, (out.get(b.season_id) ?? 0) + t.total)
  }
  return out
}

// ------------------------------------------------------------
// Texte d'email
// ------------------------------------------------------------
/** Texte prêt à coller dans un email au fournisseur. */
export function texteEmailBon(args: {
  ferme: string
  bon: Pick<PurchaseOrder, 'number' | 'order_date' | 'expected_date' | 'shipping_amount' | 'notes'>
  fournisseur: Pick<Supplier, 'name' | 'contact_name' | 'customer_number'>
  lignes: (LigneMontant & Pick<PurchaseOrderLine, 'label' | 'variety' | 'supplier_ref' | 'unit' | 'organic'>)[]
}): string {
  const { ferme, bon, fournisseur: f, lignes } = args
  const t = totauxBon(lignes.map(l => ({ ...l, quantity_received: 0 })), bon.shipping_amount)
  const ref = bon.number ?? 'brouillon (non numéroté)'
  const out: string[] = []
  out.push(`Objet : bon de commande ${ref} — ${ferme}`, '')
  out.push(`Bonjour${f.contact_name ? ` ${f.contact_name}` : ''},`, '')
  out.push(`Voici notre commande ${ref}${bon.order_date ? ` du ${formatDateLongue(bon.order_date)}` : ''} :`)
  if (f.customer_number) out.push(`Numéro client : ${f.customer_number}`)
  out.push('')
  for (const l of lignes) {
    const nom = [l.label, l.variety ? `« ${l.variety} »` : null, l.organic ? '(bio)' : null].filter(Boolean).join(' ')
    const refF = l.supplier_ref ? ` [réf. ${l.supplier_ref}]` : ''
    const tl = totalLigne(l)
    const prix = tl === null ? 'prix à confirmer' : `${formatEuros(eurosEnCentimes(l.unit_price as EurosNumeric))} l’unité = ${formatEuros(tl)}`
    out.push(`- ${nom}${refF} : ${formatQuantiteUnite(l.quantity, l.unit)}, ${prix}`)
  }
  out.push('')
  out.push(`Total des articles : ${formatEuros(t.lignes)}${t.prixManquants ? ' (hors lignes à prix à confirmer)' : ''}`)
  if (t.port > 0) out.push(`Frais de port : ${formatEuros(t.port)}`)
  out.push(`Total : ${formatEuros(t.total)}`)
  if (bon.expected_date) out.push('', `Livraison souhaitée : ${formatDateLongue(bon.expected_date)}`)
  if (bon.notes) out.push('', bon.notes)
  out.push('', 'Merci de nous confirmer la commande et la date de livraison.', '', 'Bien cordialement,', ferme)
  return out.join('\n')
}
