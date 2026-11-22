import { type DemoDb, DEMO_USER_ID, DEMO_TEAMMATE_ID, SEASON_2025, SEASON_2026 } from '../data'
import { centimesEnEuros, eurosEnCentimes, produitCentimes } from '../../domain'
import { categorieDepense } from '../../domain/achats'
import { PURCHASE_UNITS, type PurchaseUnit, type SupplierKind } from '../../domain/types'

// ============================================================
// Données FICTIVES : fournisseurs et bons de commande (migration 011).
// Aucun de ces fournisseurs n'existe ; noms, adresses, numéros et sites
// sont inventés (domaines en .exemple, non résolus).
//
// Ce module porte aussi les équivalents démo des fonctions SQL de 011
// (enregistrer_bon, envoyer_bon, confirmer_bon, receptionner_bon,
// annuler_bon) et des triggers des bons, appelés depuis client.ts.
// ============================================================

type Row = Record<string, any>
type Db = DemoDb & Record<string, any[]>
type Erreur = { message: string; code?: string }
type Res = { data: any; error: Erreur | null }

const FARM = '30000000-0000-4000-8000-000000000001'
const sid = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const pid = (n: number) => `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const lid = (n: number) => `63000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const numeroBonDemo = (annee: number, n: number) => `BC-${annee}-${String(n).padStart(3, '0')}`

/** Colonne générée line_total : round(quantity × unit_price, 2), null sans prix. */
export function totalLigneAchatDemo(l: Row): number | null {
  if (l.unit_price === null || l.unit_price === undefined) return null
  return centimesEnEuros(produitCentimes(l.quantity, l.unit_price))
}

/** « 300 », « 2,5 » : comme replace(trim_scale(x)::text, '.', ',') en SQL. */
const quantiteTexte = (centiemes: number) => {
  const e = Math.floor(centiemes / 100), d = centiemes % 100
  return d === 0 ? String(e) : `${e},${String(d).padStart(2, '0').replace(/0$/, '')}`
}
/** Quantité numeric(12,2) en centièmes entiers (même lecture que les montants). */
const centiemes = (q: number | string) => eurosEnCentimes(q)

// [n°, nom, type, contact, email, téléphone, site, adresse, n° client, minimum €, franco €, délai j, bio, notes]
type F = [number, string, SupplierKind, string | null, string | null, string | null, string | null, string | null, string | null, number | null, number | null, number | null, boolean, string | null]
const FOURNISSEURS: F[] = [
  [1, 'Semencerie de Kerlann', 'semencier', 'Anaïg Le Floc’h', 'commandes@kerlann-semences.exemple', '02 98 00 11 22', 'https://kerlann-semences.exemple', 'Lieu-dit Kerlann, 29800 Plounéventer (fictif)', 'CL-0412', 30, 80, 10, true,
    'Graines bio. Commander avant fin janvier pour les zinnias.'],
  [2, 'Graines du Vallon Gris', 'semencier', 'Yann Moysan', 'yann@vallon-gris.exemple', '02 96 00 33 44', 'https://vallon-gris.exemple', '3 chemin du Vallon, 22200 Saint-Agathon (fictif)', null, 25, 60, 7, false, null],
  [3, 'Bulbes et Griffes de Penhoat', 'bulbes', 'Soazig Penhoat', 'soazig@penhoat-bulbes.exemple', '06 00 00 55 66', null, 'Penhoat, 29410 Pleyber-Christ (fictif)', 'P-77', 100, 150, 21, false,
    'Griffes de renoncules et anémones : précommande en août, livraison octobre-novembre.'],
  [4, 'Pépinière des Trois Chênes', 'pepiniere', 'Loïc Guéguen', 'loic@trois-chenes.exemple', '02 98 00 77 88', null, 'Route des Chênes, 29450 Commana (fictif)', null, null, null, 14, false, 'Boutures de chrysanthèmes en mai.'],
  [5, 'Emballages Stered', 'emballage', null, 'contact@stered-emballages.exemple', '02 98 00 99 00', 'https://stered-emballages.exemple', 'ZA de Lannuguy, 29400 Lampaul (fictif)', 'ST-2291', null, 120, 5, false, 'Kraft, manchons, élastiques.'],
]

// Bons : [n°, saison, fournisseur, statut, année, n° BC, commande, prévue, réception, port €, notes]
type B = [number, string, number, string, number | null, number | null, string | null, string | null, string | null, number, string | null]
const BONS: B[] = [
  [1, SEASON_2025, 1, 'recu', 2025, 7, '2025-01-14', '2025-01-24', '2025-01-23', 6.9, null],
  [2, SEASON_2026, 3, 'recu_partiel', 2026, 1, '2026-08-20', '2026-10-15', '2026-10-17', 12.5, 'Anémones en rupture, livrées en deux fois.'],
  [3, SEASON_2026, 2, 'envoye', 2026, 2, '2026-11-04', '2026-11-18', null, 4.9, 'Pour les semis de février.'],
  [4, SEASON_2026, 5, 'brouillon', null, null, null, '2026-12-10', null, 0, 'Emballages pour le marché de Noël.'],
]

// Lignes : [bon, culture (catalogue) ou null, variété, libellé, réf., unité, qté, reçu, prix €, bio]
type L = [number, string | null, string | null, string, string | null, PurchaseUnit, number, number, number | null, boolean]
const LIGNES: L[] = [
  [1, 'Zinnia', 'Mélange géant', 'Zinnia', 'Z-210', 'graines', 1000, 1000, 0.03, true],
  [1, 'Cosmos', 'Blanc pur', 'Cosmos', 'C-034', 'graines', 800, 800, 0.03, true],
  [1, 'Bleuet', 'Bleu foncé', 'Bleuet', 'B-008', 'graines', 500, 500, 0.02, true],
  [1, 'Nigelle', null, 'Nigelle', 'N-101', 'sachet', 2, 2, 3.4, true],
  [2, 'Renoncule', 'Pastel mélange', 'Renoncule', 'R-5/6', 'bulbes', 250, 250, 0.42, false],
  [2, null, 'Rose de Caen', 'Anémone', 'A-12', 'bulbes', 200, 0, 0.35, false],
  [2, 'Dahlia', 'Café crème', 'Dahlia', 'D-CC', 'tubercules', 12, 12, 3.9, false],
  [3, 'Gueule-de-loup (muflier)', 'Groupe 2 mélange', 'Gueule-de-loup', 'M-220', 'graines', 400, 0, 0.04, false],
  [3, 'Lisianthus', 'Blanc double', 'Lisianthus', 'L-500', 'graines', 500, 0, 0.09, false],
  [3, 'Ammi majus', null, 'Ammi majus', 'AM-1', 'grammes', 10, 0, 1.8, false],
  [4, null, null, 'Papier kraft 50 cm', 'K-50', 'unite', 2, 0, 18.5, false],
  [4, null, null, 'Manchons bouquet 40 cm', 'MB-40', 'unite', 200, 0, 0.12, false],
]

export function seed_achats(db: Db): void {
  db.purchase_order_counters ??= []
  const cat = (name: string | null) => name ? db.culture_catalog.find(c => c.name === name)?.id ?? null : null
  const at = '2025-01-05T09:00:00Z'

  for (const [n, name, kind, contact_name, email, phone, website, address, customer_number, min, franco, delai, bio, notes] of FOURNISSEURS) {
    db.suppliers.push({
      id: sid(n), farm_id: FARM, name, kind, contact_name, email, phone, website, address, customer_number,
      min_order_amount: min, free_shipping_threshold: franco, lead_time_days: delai, organic_certified: bio, notes,
      archived_at: null, created_by: DEMO_USER_ID, created_at: at,
    })
  }
  // Un ancien fournisseur archivé, pour montrer l'archivage
  db.suppliers.push({
    id: sid(6), farm_id: FARM, name: 'Jardinerie du Pont-Neuf', kind: 'fournitures', contact_name: null, email: null,
    phone: '02 98 00 12 34', website: null, address: null, customer_number: null, min_order_amount: null,
    free_shipping_threshold: null, lead_time_days: null, organic_certified: false, notes: 'Plus de rayon horticole.',
    archived_at: '2026-02-01T10:00:00Z', created_by: DEMO_USER_ID, created_at: at,
  })

  for (const [n, season_id, f, status, annee, seq, order_date, expected_date, received_date, port, notes] of BONS) {
    db.purchase_orders.push({
      id: pid(n), farm_id: FARM, season_id, supplier_id: sid(f), number_year: annee, number_seq: seq,
      number: annee && seq ? numeroBonDemo(annee, seq) : null, status, order_date, expected_date, received_date,
      shipping_amount: port, shipping_expensed: status === 'recu' || status === 'recu_partiel', notes,
      sent_at: order_date ? `${order_date}T09:30:00Z` : null, cancelled_at: null,
      created_by: n === 3 ? DEMO_TEAMMATE_ID : DEMO_USER_ID, created_at: `${order_date ?? '2026-11-15'}T09:00:00Z`,
    })
  }
  db.purchase_order_counters.push({ farm_id: FARM, year: 2025, last_number: 7 }, { farm_id: FARM, year: 2026, last_number: 2 })

  LIGNES.forEach(([b, culture, variety, label, ref, unit, quantity, recu, prix, bio], i) => {
    const row: Row = {
      id: lid(i + 1), purchase_order_id: pid(b), farm_id: FARM, culture_id: cat(culture), variety, label, supplier_ref: ref,
      unit, quantity, quantity_received: recu, unit_price: prix, organic: bio, seed_order_id: null, sort_order: i,
      created_at: '2026-01-04T09:00:00Z',
    }
    row.line_total = totalLigneAchatDemo(row)
    db.purchase_order_lines.push(row)
  })

  // Dépenses déjà créées par les réceptions des bons 1 et 2 (même calcul que receptionner_bon)
  for (const bon of db.purchase_orders.filter(b => b.status === 'recu' || b.status === 'recu_partiel')) {
    const f = db.suppliers.find(s => s.id === bon.supplier_id)!
    for (const l of db.purchase_order_lines.filter(x => x.purchase_order_id === bon.id && x.quantity_received > 0)) {
      db.costs.push({
        id: `64000000-0000-4000-8000-${l.id.slice(-12)}`, farm_id: FARM, season_id: bon.season_id, date: bon.received_date,
        category: categorieDepense(l.unit, f.kind), amount: centimesEnEuros(produitCentimes(l.quantity_received, l.unit_price)),
        culture_id: l.culture_id, planche_id: null, supplier: f.name,
        notes: `${bon.number} · ${l.label}${l.variety ? ` « ${l.variety} »` : ''} · reçu ${quantiteTexte(centiemes(l.quantity_received))} ${l.unit}`,
        purchase_order_id: bon.id, purchase_order_line_id: l.id, created_by: DEMO_USER_ID, created_at: `${bon.received_date}T12:00:00Z`,
      })
    }
    db.costs.push({
      id: `64100000-0000-4000-8000-${bon.id.slice(-12)}`, farm_id: FARM, season_id: bon.season_id, date: bon.received_date,
      category: 'transport', amount: bon.shipping_amount, culture_id: null, planche_id: null, supplier: f.name,
      notes: `${bon.number} · frais de port`, purchase_order_id: bon.id, purchase_order_line_id: null,
      created_by: DEMO_USER_ID, created_at: `${bon.received_date}T12:00:00Z`,
    })
  }
}

// ============================================================
// Équivalents démo des triggers et fonctions de 011
// ============================================================
const err = (message: string, code = 'P0001'): Res => ({ data: null, error: { message, code } })
const ok = (data: any): Res => ({ data, error: null })

/** Trigger achats_bon_suppression : un bon envoyé ne se supprime pas. */
export function refusSuppressionAchats(table: string, rows: Row[]): Erreur | null {
  if (table === 'purchase_orders') {
    const b = rows.find(r => r.status !== 'brouillon')
    if (b) return { code: 'P0001', message: `Bon ${b.number} déjà envoyé : il ne se supprime pas, il s'annule` }
  }
  if (table === 'suppliers') {
    return null
  }
  if (table === 'purchase_order_lines') {
    return { code: '42501', message: 'Les lignes passent par enregistrer_bon (mode démo)' }
  }
  return null
}

export interface ContexteRpcAchats {
  db: Db
  me: string
  /** Fabrique de requêtes du faux client : les dépenses passent par l'équivalent du trigger couts_set_farm. */
  q: (t: string) => any
  aujourdhui: string
  uuid: () => string
}

const FNS = new Set(['enregistrer_bon', 'envoyer_bon', 'confirmer_bon', 'receptionner_bon', 'annuler_bon'])

/** null si `fn` n'est pas une fonction des achats. */
export async function rpcAchatsDemo(fn: string, args: Row, c: ContexteRpcAchats): Promise<Res | null> {
  if (!FNS.has(fn)) return null
  const { db, me } = c
  const membre = (farmId: string) => db.farm_members.some(m => m.farm_id === farmId && m.user_id === me)
  const verrouiller = (id: string): Row | null => {
    const b = db.purchase_orders.find(x => x.id === id)
    return b && membre(b.farm_id) ? b : null
  }
  const lignesDe = (id: string) => db.purchase_order_lines.filter(l => l.purchase_order_id === id).sort((a, b) => a.sort_order - b.sort_order)

  if (fn === 'enregistrer_bon') {
    const p = (args.p_bon ?? {}) as Row
    const lignes = (args.p_lignes ?? []) as Row[]
    let b: Row | null = null
    if (args.p_id) {
      b = verrouiller(args.p_id)
      if (!b || b.status !== 'brouillon') return err('Brouillon introuvable, inaccessible ou déjà envoyé')
    }
    const seasonId = p.season_id || b?.season_id
    const s = db.seasons.find(x => x.id === seasonId)
    if (!s || !membre(s.farm_id)) return err('new row violates row-level security policy for table "purchase_orders"', '42501')
    if (b && s.farm_id !== b.farm_id) return err('Un bon de commande ne change pas de ferme')
    const supplierId = p.supplier_id || b?.supplier_id
    if (!db.suppliers.some(f => f.id === supplierId && f.farm_id === s.farm_id)) return err(`Fournisseur ${supplierId} hors de la ferme`)
    for (const l of lignes) {
      if (!l.label || !String(l.label).trim()) return err('new row for relation "purchase_order_lines" violates check constraint (libellé)', '23514')
      if (!(Number(l.quantity) > 0)) return err('new row for relation "purchase_order_lines" violates check constraint (quantité)', '23514')
      if (l.unit && !(PURCHASE_UNITS as readonly string[]).includes(l.unit)) return err('unité inconnue', '23514')
      if (l.unit_price !== null && l.unit_price !== undefined && Number(l.unit_price) < 0) return err('prix négatif', '23514')
    }
    const port = p.shipping_amount === '' || p.shipping_amount === null || p.shipping_amount === undefined ? 0 : Number(p.shipping_amount)
    if (!(port >= 0)) return err('frais de port négatifs', '23514')
    if (!b) {
      b = {
        id: c.uuid(), farm_id: s.farm_id, season_id: s.id, supplier_id: supplierId, number_year: null, number_seq: null, number: null,
        status: 'brouillon', order_date: null, expected_date: p.expected_date || null, received_date: null,
        shipping_amount: port, shipping_expensed: false, notes: p.notes || null, sent_at: null, cancelled_at: null,
        created_by: me, created_at: new Date().toISOString(),
      }
      db.purchase_orders.push(b)
    } else {
      Object.assign(b, { season_id: s.id, supplier_id: supplierId, expected_date: p.expected_date || null, shipping_amount: port, notes: p.notes || null })
      db.purchase_order_lines = db.purchase_order_lines.filter(l => l.purchase_order_id !== b!.id)
    }
    lignes.forEach((l, i) => {
      const row: Row = {
        id: c.uuid(), purchase_order_id: b!.id, farm_id: b!.farm_id, culture_id: l.culture_id ?? null,
        variety: l.variety?.trim() || null, label: l.label, supplier_ref: l.supplier_ref?.trim() || null, unit: l.unit ?? 'graines',
        quantity: Number(l.quantity), quantity_received: 0,
        unit_price: l.unit_price === null || l.unit_price === undefined || l.unit_price === '' ? null : Number(l.unit_price),
        organic: !!l.organic, seed_order_id: l.seed_order_id ?? null, sort_order: i, created_at: new Date().toISOString(),
      }
      row.line_total = totalLigneAchatDemo(row)
      db.purchase_order_lines.push(row)
    })
    return ok(b.id)
  }

  const b = verrouiller(args.p_id)
  if (!b) return err('Bon de commande introuvable ou inaccessible', 'P0002')

  if (fn === 'envoyer_bon') {
    if (b.status !== 'brouillon') return err(`Bon ${b.number} déjà envoyé`)
    const lignes = lignesDe(b.id)
    if (lignes.length === 0) return err('Un bon de commande doit avoir au moins une ligne')
    if (lignes.some(l => l.unit_price === null)) return err('Prix unitaire à saisir sur au moins une ligne')
    if (db.suppliers.find(f => f.id === b.supplier_id)?.archived_at) return err('Fournisseur archivé : désarchivez-le ou choisissez-en un autre')
    const annee = Number(c.aujourdhui.slice(0, 4))
    let cpt = db.purchase_order_counters.find(x => x.farm_id === b.farm_id && x.year === annee)
    if (!cpt) { cpt = { farm_id: b.farm_id, year: annee, last_number: 0 }; db.purchase_order_counters.push(cpt) }
    cpt.last_number += 1
    Object.assign(b, {
      status: 'envoye', number_year: annee, number_seq: cpt.last_number, number: numeroBonDemo(annee, cpt.last_number),
      order_date: c.aujourdhui, sent_at: new Date().toISOString(),
    })
    return ok({ ...b })
  }

  if (fn === 'confirmer_bon') {
    if (b.status !== 'envoye') return err(`Seul un bon envoyé se confirme (statut : ${b.status})`)
    Object.assign(b, { status: 'confirme', expected_date: args.p_date_prevue || b.expected_date })
    return ok({ ...b })
  }

  if (fn === 'annuler_bon') {
    if (!['brouillon', 'envoye', 'confirme'].includes(b.status)) return err(`Ce bon ne peut plus être annulé (statut : ${b.status})`)
    if (lignesDe(b.id).some(l => Number(l.quantity_received) > 0)) return err('Une partie du bon est déjà reçue : il ne s\'annule plus')
    Object.assign(b, { status: 'annule', cancelled_at: new Date().toISOString() })
    return ok({ ...b })
  }

  // receptionner_bon
  if (!['envoye', 'confirme', 'recu_partiel'].includes(b.status)) return err(`Ce bon ne peut pas être réceptionné (statut : ${b.status})`)
  const date = args.p_date as string | null
  if (!date) return err('Date de réception requise')
  if (date < b.order_date) return err(`Réception (${date}) antérieure à la commande (${b.order_date})`)
  const saisies = (args.p_lignes ?? []) as { id: string; quantity_received: number | string }[]
  if (!Array.isArray(saisies)) return err('Lignes de réception attendues en tableau')
  const lignes = lignesDe(b.id)
  if (saisies.some(s => !lignes.some(l => l.id === s.id))) return err('Ligne inconnue pour ce bon')
  if (new Set(saisies.map(s => s.id)).size !== saisies.length) return err('Ligne présente deux fois')
  // Validation complète avant toute écriture (la fonction SQL est atomique)
  const maj: { l: Row; q: number }[] = []
  for (const s of saisies) {
    const l = lignes.find(x => x.id === s.id)!
    if (s.quantity_received === null || s.quantity_received === undefined || Number(s.quantity_received) < 0) return err(`Quantité reçue invalide (${l.label})`)
    const q = centiemes(s.quantity_received)
    const avant = centiemes(l.quantity_received)
    if (q < avant) return err(`La quantité reçue ne peut pas diminuer (${l.label} : ${l.quantity_received} → ${q / 100})`)
    if (q > centiemes(l.quantity)) return err(`Quantité reçue supérieure à la commandée (${l.label} : ${q / 100} > ${l.quantity})`)
    if (q !== avant) maj.push({ l, q })
  }
  if (maj.length === 0) return ok({ id: b.id, status: b.status, depenses_creees: 0, montant: 0 })
  const f = db.suppliers.find(x => x.id === b.supplier_id)!
  const depenses: Row[] = []
  for (const { l, q } of maj) {
    const montant = produitCentimes(q / 100, l.unit_price) - produitCentimes(l.quantity_received, l.unit_price)
    if (montant > 0) depenses.push({
      season_id: b.season_id, date, category: categorieDepense(l.unit, f.kind as SupplierKind), amount: centimesEnEuros(montant),
      culture_id: l.culture_id, supplier: f.name,
      notes: `${b.number} · ${l.label}${l.variety ? ` « ${l.variety} »` : ''} · reçu ${quantiteTexte(q - centiemes(l.quantity_received))} ${l.unit}`,
      purchase_order_id: b.id, purchase_order_line_id: l.id,
    })
  }
  if (Number(b.shipping_amount) > 0 && !b.shipping_expensed) depenses.push({
    season_id: b.season_id, date, category: 'transport', amount: Number(b.shipping_amount), culture_id: null, supplier: f.name,
    notes: `${b.number} · frais de port`, purchase_order_id: b.id, purchase_order_line_id: null,
  })
  if (depenses.length) {
    const r = await c.q('costs').insert(depenses)
    if (r.error) return r
  }
  for (const { l, q } of maj) l.quantity_received = q / 100
  const tout = lignes.every(l => centiemes(l.quantity_received) >= centiemes(l.quantity))
  Object.assign(b, { status: tout ? 'recu' : 'recu_partiel', received_date: date, shipping_expensed: b.shipping_expensed || Number(b.shipping_amount) > 0 })
  const total = depenses.reduce((s, d) => s + eurosEnCentimes(d.amount), 0)
  return ok({ id: b.id, status: b.status, depenses_creees: depenses.length, montant: centimesEnEuros(total) })
}

