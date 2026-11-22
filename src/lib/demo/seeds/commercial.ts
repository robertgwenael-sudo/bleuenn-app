import { type DemoDb, DEMO_USER_ID, SEASON_2026 } from '../data'
import { centimesEnEuros, diviserArrondi, montantLigne, totauxLignes } from '../../domain'
import { venteSetTotauxDemo } from './tva'

type Row = Record<string, any>

// ─── Équivalents en mémoire des triggers de 005 (utilisés aussi par client.ts) ──

/** Colonne générée `line_total = round(quantity * unit_price, 2)`, calculée en centimes. */
export function totalLigneDemo(l: Row): number {
  return centimesEnEuros(montantLigne({ label: l.label, quantity: l.quantity, stems_per_unit: l.stems_per_unit, unit_price: l.unit_price }))
}

/** Trigger `sale_recompute()` : total, tiges, prix moyen et libellés tirés des lignes. */
export function recalculerVenteDemo(db: Row, saleId: string): void {
  const vente = (db.sales as Row[]).find(s => s.id === saleId)
  const lignes = (db.sale_lines as Row[] | undefined ?? []).filter(l => l.sale_id === saleId)
  if (!vente || lignes.length === 0) return
  const t = totauxLignes(lignes.map(l => ({ label: l.label, quantity: l.quantity, stems_per_unit: l.stems_per_unit, unit_price: l.unit_price, line_total: l.line_total })))
  vente.total = centimesEnEuros(t.total_centimes)
  vente.tiges = t.tiges
  // round(total / tiges, 4), comme en base (affichage seulement)
  vente.prix_unitaire = t.tiges > 0 ? Number(diviserArrondi(BigInt(t.total_centimes) * BigInt(100), BigInt(t.tiges))) / 10000 : 0
  vente.cultures_sold = t.libelles
  venteSetTotauxDemo(db, vente, false)  // 014 : HT, TVA, TTC
}

// ─── Données ───────────────────────────────────────────────────────

const cid = (n: number) => `c1000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const oid = (n: number) => `c2000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let nLigne = 0
const lid = (p: string) => `${p}-0000-4000-8000-${String(++nLigne).padStart(12, '0')}`

/** Date du jour à Paris (AAAA-MM-JJ) : les commandes de démo tombent toujours dans les semaines à venir. */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}
function plusJours(d: string, n: number): string {
  const x = new Date(d + 'T00:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

// [culture du catalogue ou null, libellé, unité, quantité, tiges/unité, prix unitaire]
type L = [string | null, string, string, number, number, number]

const CLIENTS: Row[] = [
  { n: 1, name: 'Atelier Pétale', kind: 'fleuriste', contact_name: 'Morgane Le Gall', phone: '02 98 00 41 12', email: 'atelier.petale@exemple.fr', address: '14 rue de Siam, 29200 Brest', notes: 'Livraison le mardi avant 9 h, entrée par la cour. Aime les teintes poudrées.' },
  { n: 2, name: 'Fleurs de Lin', kind: 'fleuriste', contact_name: 'Yann Abgrall', phone: '02 98 00 63 27', email: 'contact@fleursdelin.exemple', address: '3 place des Otages, 29600 Morlaix', notes: 'Paiement à 30 jours. Préfère les bottes de 10.' },
  { n: 3, name: 'L’Herbier de Landerneau', kind: 'fleuriste', contact_name: 'Anne Péron', phone: '02 98 00 18 90', email: 'herbier.landerneau@exemple.fr', address: '8 quai de Léon, 29800 Landerneau', notes: null },
  { n: 4, name: 'Épicerie Ty Bihan', kind: 'commerce', contact_name: 'Loïc Cozian', phone: '02 98 00 75 04', email: null, address: '2 rue de la Mairie, 29470 Plougastel-Daoulas', notes: 'Dépôt-vente de bouquets le vendredi, reprise des invendus le lundi.' },
  { n: 5, name: 'Mariage Le Bris', kind: 'mariage', contact_name: 'Claire Le Bris', phone: '06 00 00 12 34', email: 'claire.lebris@exemple.fr', address: 'Manoir de Kerazan, Loctudy', notes: 'Mariage du 4 juillet, palette blanc et pêche.', archived_at: '2026-09-01T08:00:00Z' },
  { n: 6, name: 'Mariage Kervella – Riou', kind: 'mariage', contact_name: 'Soizic Kervella', phone: '06 00 00 56 78', email: 'soizic.kervella@exemple.fr', address: 'Domaine de Lesquiffiou, Pleyber-Christ', notes: 'Mariage d’hiver : feuillages, chrysanthèmes blancs, pas de lys.' },
  { n: 7, name: 'Maëlle Caradec', kind: 'abonne', contact_name: null, phone: '06 00 00 90 11', email: 'maelle.caradec@exemple.fr', address: '27 route du Passage, 29470 Plougastel-Daoulas', notes: 'Abonnement « bouquet du vendredi », à déposer chez la voisine si absente.' },
  { n: 8, name: 'Pompes funèbres du Léon', kind: 'autre', contact_name: 'M. Guéguen', phone: '02 98 00 22 50', email: null, address: 'Zone de Kerhuel, 29400 Landivisiau', notes: 'Commandes souvent la veille : prévenir si pas de stock.' },
]

/** Ventes historiques (data.ts) rattachées à un client, par le texte libre `client`. */
const CLIENT_PAR_TEXTE: Record<string, number> = {
  'Atelier Pétale': 1, 'Fleurs de Lin, Morlaix': 2, 'Mariage Le Bris': 5, 'Pompes funèbres du Léon': 8,
}

/** Ventes historiques détaillées en lignes : [date, client (texte), lignes]. */
const VENTES_EN_LIGNES: [string, string | null, L[]][] = [
  ['2026-07-04', 'Mariage Le Bris', [
    [null, 'Bouquet de mariée', 'bouquet', 1, 30, 95],
    [null, 'Bouquets de demoiselles', 'bouquet', 4, 15, 38],
    ['Cosmos', 'Cosmos', 'botte', 10, 10, 9],
    ['Ammi majus', 'Ammi majus', 'botte', 8, 10, 9],
    ['Zinnia', 'Zinnia', 'seau', 2, 25, 30],
  ]],
  ['2026-10-31', 'Pompes funèbres du Léon', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'seau', 4, 25, 40],
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'tige', 60, 1, 1.8],
  ]],
  ['2026-11-07', 'Fleurs de Lin, Morlaix', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 10, 10, 14],
    ['Dahlia', 'Dahlia', 'tige', 80, 1, 1.6],
  ]],
  ['2026-11-21', 'Marché de Noël anticipé', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 6, 10, 12],
    ['Eucalyptus', 'Eucalyptus', 'botte', 5, 10, 8],
    [null, 'Bouquet d’hiver', 'bouquet', 4, 15, 18],
  ]],
]

/** Commandes : [n, client, décalage en jours depuis aujourd'hui, statut, canal, notes, lignes]. */
const COMMANDES: [number, number, number, string, string | null, string | null, L[]][] = [
  [2, 1, -1, 'prete', 'Fleuriste', 'Prête en chambre froide', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 8, 10, 13],
    ['Eucalyptus', 'Eucalyptus', 'botte', 6, 10, 8],
  ]],
  [3, 2, 2, 'confirmee', 'Fleuriste', null, [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 10, 10, 14],
    ['Eucalyptus', 'Eucalyptus', 'botte', 4, 10, 8],
    ['Statice', 'Statice', 'tige', 40, 1, 0.6],
  ]],
  [4, 8, 3, 'confirmee', 'Deuil', 'Couleurs claires demandées', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'seau', 3, 25, 40],
  ]],
  [5, 4, 5, 'confirmee', null, 'Dépôt-vente : facturer ce qui est vendu', [
    [null, 'Bouquet d’hiver', 'bouquet', 6, 15, 16],
  ]],
  [6, 7, 5, 'confirmee', 'Abonnements', null, [
    [null, 'Bouquet du vendredi', 'bouquet', 1, 20, 25],
  ]],
  [7, 1, 8, 'confirmee', 'Fleuriste', null, [
    ['Eucalyptus', 'Eucalyptus', 'botte', 10, 10, 8],
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 6, 10, 13],
    ['Gomphréna', 'Gomphréna séché', 'botte', 5, 20, 9],
  ]],
  [8, 3, 10, 'devis', 'Fleuriste', 'Couronnes de l’Avent, à confirmer avant le 1er décembre', [
    [null, 'Couronne de l’Avent', 'autre', 8, 30, 35],
    ['Eucalyptus', 'Eucalyptus', 'botte', 6, 10, 8],
  ]],
  [9, 7, 12, 'confirmee', 'Abonnements', null, [
    [null, 'Bouquet du vendredi', 'bouquet', 1, 20, 25],
  ]],
  [10, 6, 27, 'devis', 'Mariage', 'Devis envoyé, acompte de 30 % à la confirmation', [
    [null, 'Bouquet de mariée', 'bouquet', 1, 35, 120],
    [null, 'Boutonnières', 'autre', 6, 3, 6],
    [null, 'Centres de table', 'bouquet', 10, 20, 45],
    ['Eucalyptus', 'Eucalyptus', 'seau', 2, 25, 35],
  ]],
  [11, 3, -3, 'annulee', 'Fleuriste', 'Annulée : fermeture exceptionnelle de la boutique', [
    ['Chrysanthème d’automne', 'Chrysanthème d’automne', 'botte', 4, 10, 13],
  ]],
]

/** Données de démo : clients, commandes, lignes de commande et de vente. Modifie la base en place. */
export function seed_commercial(db: DemoDb & Record<string, any[]>): void {
  nLigne = 0
  const now = '2026-01-04T09:00:00Z'
  const cat = (name: string | null) => {
    if (!name) return null
    const c = db.culture_catalog.find(x => x.name === name)
    if (!c) throw new Error(`Culture démo inconnue : ${name}`)
    return c.id
  }
  const ligne = (l: L, parent: Row) => {
    const r: Row = {
      culture_id: cat(l[0]), label: l[1], unit: l[2], quantity: l[3], stems_per_unit: l[4], unit_price: l[5],
      season_id: parent.season_id, created_at: now,
    }
    r.line_total = totalLigneDemo(r)
    return r
  }

  for (const c of CLIENTS) {
    const { n, ...rest } = c
    db.clients.push({ id: cid(n), user_id: DEMO_USER_ID, archived_at: null, created_at: now, ...rest })
  }

  // Ventes historiques : rattachement au fichier clients
  for (const v of db.sales) {
    const n = v.client ? CLIENT_PAR_TEXTE[v.client] : undefined
    v.client_id = n ? cid(n) : null
    v.order_id = null
  }

  // Quelques ventes détaillées en lignes (le total est recalculé comme par trigger)
  for (const [date, client, lignes] of VENTES_EN_LIGNES) {
    const v = db.sales.find(s => s.date === date && s.client === client)
    if (!v) throw new Error(`Vente démo introuvable : ${date} ${client}`)
    for (const l of lignes) db.sale_lines.push({ id: lid('c3000000'), sale_id: v.id, ...ligne(l, v) })
    recalculerVenteDemo(db, v.id)
  }

  // Commande déjà livrée et facturée : la vente du 7 novembre chez Fleurs de Lin
  const venteLivree = db.sales.find(s => s.date === '2026-11-07' && s.client_id === cid(2))!
  const livree: Row = {
    id: oid(1), season_id: SEASON_2026, client_id: cid(2), delivery_date: '2026-11-07', status: 'livree',
    channel: 'Fleuriste', notes: null, sale_id: venteLivree.id, created_by: DEMO_USER_ID, created_at: '2026-11-02T08:00:00Z',
  }
  venteLivree.order_id = livree.id
  db.orders.push(livree)
  for (const l of VENTES_EN_LIGNES[2][2]) db.order_lines.push({ id: lid('c4000000'), order_id: livree.id, ...ligne(l, livree) })

  // Commandes à venir, datées à partir d'aujourd'hui
  const jour = aujourdhuiParis()
  for (const [n, client, decalage, status, channel, notes, lignes] of COMMANDES) {
    const o: Row = {
      id: oid(n), season_id: SEASON_2026, client_id: cid(client), delivery_date: plusJours(jour, decalage), status,
      channel, notes, sale_id: null, created_by: DEMO_USER_ID, created_at: now,
    }
    db.orders.push(o)
    for (const l of lignes) db.order_lines.push({ id: lid('c4000000'), order_id: o.id, ...ligne(l, o) })
  }
}
