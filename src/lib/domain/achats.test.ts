import { describe, expect, it } from 'vitest'
import {
  achatsParSaison, alertesConditions, besoinsAchat, categorieDepense, dateAttendue, depenseReception,
  etatReception, formatQuantite, formatQuantiteUnite, lireQuantite, proposerBrouillons, resteLigne, retardBon,
  texteEmailBon, totalLigne, totauxBon, type SeedOrderBesoin,
} from './achats'
import type { PurchaseOrder, PurchaseOrderLine } from './types'

const bon = (b: Partial<PurchaseOrder>): PurchaseOrder => ({
  id: 'b1', farm_id: 'f', season_id: 's26', supplier_id: 'semA', number_year: 2026, number_seq: 1, number: 'BC-2026-001',
  status: 'envoye', order_date: '2026-01-10', expected_date: null, received_date: null, shipping_amount: 0,
  shipping_expensed: false, notes: null, sent_at: null, cancelled_at: null, created_by: null, created_at: '2026-01-10T10:00:00Z', ...b,
})
const ligne = (l: Partial<PurchaseOrderLine>): PurchaseOrderLine => ({
  id: 'l', purchase_order_id: 'b1', farm_id: 'f', culture_id: null, variety: null, label: 'x', supplier_ref: null,
  unit: 'graines', quantity: 1, quantity_received: 0, unit_price: 1, organic: false, seed_order_id: null, sort_order: 0,
  created_at: '', ...l,
})

describe('montants d’un bon', () => {
  it('total de ligne arrondi comme la colonne générée, sans flottant', () => {
    expect(totalLigne({ quantity: 3, unit_price: '0.1' })).toBe(30)
    expect(totalLigne({ quantity: '2.5', unit_price: '3.35' })).toBe(838) // 8,375 → 8,38
    expect(totalLigne({ quantity: 500, unit_price: '0.03' })).toBe(1500)
    expect(totalLigne({ quantity: 1, unit_price: null })).toBeNull()
  })

  it('totaux : lignes, port, reçu, reste, prix manquants', () => {
    const t = totauxBon([
      ligne({ quantity: 500, unit_price: '0.03', quantity_received: 300 }),
      ligne({ quantity: 3, unit_price: '3.35' }),
      ligne({ quantity: 10, unit_price: null }),
    ], '6.90')
    expect(t).toEqual({ lignes: 2505, port: 690, total: 3195, recu: 900, resteARecevoir: 1605, prixManquants: 1 })
  })

  it('les dépenses successives d’une réception totalisent le total de la ligne', () => {
    const l = { quantity: 7, quantity_received: 0, unit_price: '0.15' } // 1,05 €
    const d1 = depenseReception(l, 3) // round(0,45) = 45
    const d2 = depenseReception({ ...l, quantity_received: 3 }, 7) // 105 − 45
    expect(d1 + d2).toBe(totalLigne(l))
    // Rejouer la même réception ne coûte rien
    expect(depenseReception({ ...l, quantity_received: 7 }, 7)).toBe(0)
  })

  it('catégorie de dépense selon l’unité, puis le type de fournisseur', () => {
    expect(categorieDepense('sachet', 'emballage')).toBe('semences')
    expect(categorieDepense('tubercules', 'semencier')).toBe('plants_bulbes')
    expect(categorieDepense('unite', 'emballage')).toBe('emballage')
    expect(categorieDepense('unite', 'fournitures')).toBe('materiel')
    expect(categorieDepense('unite', 'autre')).toBe('autre')
  })
})

describe('quantités', () => {
  it('affiche et lit sans flottant', () => {
    expect(formatQuantite(1250)).toBe('1 250')
    expect(formatQuantite('2.50')).toBe('2,5')
    expect(formatQuantite('0.25')).toBe('0,25')
    expect(formatQuantiteUnite(1, 'sachet')).toBe('1 sachet')
    expect(formatQuantiteUnite(250, 'grammes')).toBe('250 g')
    expect(formatQuantiteUnite(20, 'tubercules')).toBe('20 tubercules')
    expect(lireQuantite('2,5')).toBe(2.5)
    expect(lireQuantite(' 1 000 ')).toBe(1000)
    expect(lireQuantite('abc')).toBeNull()
    expect(lireQuantite('-1')).toBeNull()
    expect(lireQuantite('')).toBeNull()
  })

  it('reste à recevoir et état de réception', () => {
    expect(resteLigne({ quantity: '2.5', quantity_received: 1 })).toBe(150)
    expect(etatReception([ligne({ quantity: 2 }), ligne({ quantity: 1 })])).toBe('rien')
    expect(etatReception([ligne({ quantity: 2, quantity_received: 1 }), ligne({ quantity: 1 })])).toBe('partiel')
    expect(etatReception([ligne({ quantity: 2, quantity_received: 2 })])).toBe('complet')
  })
})

describe('retards', () => {
  it('seulement pour un bon attendu dont la date prévue est passée', () => {
    expect(retardBon(bon({ expected_date: '2026-11-20' }), '2026-11-22')).toEqual({ jours: 2 })
    expect(retardBon(bon({ expected_date: '2026-11-22' }), '2026-11-22')).toBeNull()
    expect(retardBon(bon({ status: 'recu_partiel', expected_date: '2026-11-01' }), '2026-11-22')).toEqual({ jours: 21 })
    expect(retardBon(bon({ status: 'recu', expected_date: '2026-11-01' }), '2026-11-22')).toBeNull()
    expect(retardBon(bon({ status: 'brouillon', expected_date: '2026-11-01' }), '2026-11-22')).toBeNull()
    expect(retardBon(bon({ expected_date: null }), '2026-11-22')).toBeNull()
  })

  it('date attendue d’après le délai saisi, jamais devinée', () => {
    expect(dateAttendue('2026-11-25', 10)).toBe('2026-12-05')
    expect(dateAttendue('2026-11-25', null)).toBeNull()
    expect(dateAttendue(null, 10)).toBeNull()
  })
})

describe('conditions du fournisseur', () => {
  it('alerte minimum et franco d’après les seuils saisis', () => {
    const a = alertesConditions(2505, { min_order_amount: '30', free_shipping_threshold: 80 })
    expect(a.map(x => [x.type, x.manque])).toEqual([['minimum', 495], ['franco', 5495]])
    expect(a[0].message).toContain('Minimum de commande non atteint')
  })
  it('aucune alerte sans condition saisie ni une fois atteinte', () => {
    expect(alertesConditions(100, { min_order_amount: null, free_shipping_threshold: null })).toEqual([])
    expect(alertesConditions(8000, { min_order_amount: 30, free_shipping_threshold: 80 })).toEqual([])
    expect(alertesConditions(100, null)).toEqual([])
  })
})

describe('besoins et brouillons', () => {
  const catalog = [{ id: 'zin', name: 'Zinnia' }, { id: 'cos', name: 'Cosmos' }, { id: 'dah', name: 'Dahlia' }, { id: 'ble', name: 'Bleuet' }]
  const fournisseurs = [
    { id: 'semA', name: 'Semencerie A', archived_at: null },
    { id: 'bulB', name: 'Bulbes B', archived_at: null },
    { id: 'old', name: 'Ancien', archived_at: '2026-01-01T00:00:00Z' },
  ]
  const so = (s: Partial<SeedOrderBesoin>): SeedOrderBesoin =>
    ({ id: 'so', culture_name: 'x', graines_needed: 0, graines_ordered: 0, supplier: '', bio: false, ...s })
  const plantings = [
    { culture_id: 'zin', culture_name: 'Zinnia', graines_necessaires: 600 },
    { culture_id: 'zin', culture_name: 'Zinnia', graines_necessaires: 400 },
    { culture_id: 'cos', culture_name: 'Cosmos', graines_necessaires: 300 },
    { culture_id: 'dah', culture_name: 'Dahlia', graines_necessaires: 40 },
  ]
  // Historique : zinnia acheté chez A en 2025 (prix 0,03), dahlia chez « Ancien » (archivé)
  const bons = [
    bon({ id: 'h1', season_id: 's25', supplier_id: 'semA', order_date: '2025-01-10' }),
    bon({ id: 'h2', season_id: 's25', supplier_id: 'old', order_date: '2025-02-10' }),
    bon({ id: 'c1', season_id: 's26', supplier_id: 'semA', status: 'brouillon', order_date: null }),
    bon({ id: 'c2', season_id: 's26', supplier_id: 'semA', status: 'annule' }),
    bon({ id: 'c3', season_id: 's26', supplier_id: 'semA', status: 'envoye', order_date: '2026-01-05' }),
  ]
  const lignes = [
    ligne({ purchase_order_id: 'h1', culture_id: 'zin', unit: 'graines', quantity: 800, unit_price: '0.03', variety: 'Mélange' }),
    ligne({ purchase_order_id: 'h2', culture_id: 'dah', unit: 'tubercules', quantity: 30, unit_price: '2.4' }),
    ligne({ purchase_order_id: 'c1', culture_id: 'zin', unit: 'graines', quantity: 200 }),
    ligne({ purchase_order_id: 'c2', culture_id: 'zin', unit: 'graines', quantity: 5000 }), // annulé : ignoré
    ligne({ purchase_order_id: 'c3', culture_id: 'cos', unit: 'sachet', quantity: 2 }),
  ]
  const besoins = besoinsAchat({
    seasonId: 's26', plantings, catalog, bons, lignes, fournisseurs,
    seedOrders: [
      so({ id: 'soZ', culture_name: 'Zinnia', graines_ordered: 100, bio: true }),
      so({ id: 'soB', culture_name: ' bleuet ', graines_needed: 400, supplier: 'semencerie a' }),
      so({ id: 'soX', culture_name: 'Pivoine hors catalogue', graines_needed: 12 }),
    ],
  })
  const par = (n: string) => besoins.find(b => b.culture_name.trim().toLowerCase() === n.toLowerCase())!

  it('besoin = plantations, moins hors bon et bons de la saison (brouillons compris, annulés exclus)', () => {
    const z = par('Zinnia')
    expect([z.besoin, z.horsBon, z.enBons, z.reste]).toEqual([1000, 100, 200, 700])
    expect(z.seed_order_id).toBe('soZ')
    expect(z.bio).toBe(true)
  })

  it('fournisseur habituel : dernier bon envoyé, avec son prix et sa variété', () => {
    const z = par('Zinnia')
    expect(z.fournisseur).toEqual({ id: 'semA', name: 'Semencerie A' })
    expect(z.origineFournisseur).toBe('dernier_bon')
    expect([z.unite, z.prix, z.variete]).toEqual(['graines', '0.03', 'Mélange'])
  })

  it('fournisseur archivé : à choisir, mais unité et prix repris', () => {
    const d = par('Dahlia')
    expect(d.fournisseur).toBeNull()
    expect([d.unite, d.prix, d.reste]).toEqual(['tubercules', '2.4', 40])
  })

  it('repli sur le fournisseur texte de seed_orders, et sur graines_needed sans plantation', () => {
    const b = par('Bleuet')
    expect(b.besoin).toBe(400)
    expect(b.fournisseur?.id).toBe('semA')
    expect(b.origineFournisseur).toBe('seed_orders')
    expect(b.prix).toBeNull()
    const x = par('Pivoine hors catalogue')
    expect(x.culture_id).toBeNull()
    expect(x.reste).toBe(12)
  })

  it('une culture commandée en sachets n’est jamais reproposée (pas de conversion devinée)', () => {
    const c = par('Cosmos')
    expect(c.autresUnites).toEqual([{ unit: 'sachet', quantite: 2 }])
    expect(c.reste).toBe(300)
    const props = proposerBrouillons(besoins)
    expect(props.flatMap(p => p.lignes).some(l => l.culture_id === 'cos')).toBe(false)
  })

  it('brouillons groupés par fournisseur, « à choisir » en dernier', () => {
    const props = proposerBrouillons(besoins)
    expect(props.map(p => p.supplier_name)).toEqual(['Semencerie A', null])
    expect(props[0].lignes.map(l => [l.label.trim(), l.quantity, l.unit_price])).toEqual([[' bleuet '.trim(), 400, null], ['Zinnia', 700, '0.03']])
    expect(props[1].lignes.map(l => [l.label, l.unit, l.quantity])).toEqual([['Dahlia', 'tubercules', 40], ['Pivoine hors catalogue', 'graines', 12]])
  })

  it('rien à proposer quand tout est couvert', () => {
    const b = besoinsAchat({
      seasonId: 's26', plantings: [{ culture_id: 'zin', culture_name: 'Zinnia', graines_necessaires: 100 }],
      seedOrders: [so({ culture_name: 'Zinnia', graines_ordered: 150 })], catalog, bons: [], lignes: [], fournisseurs,
    })
    expect(b[0].reste).toBe(0)
    expect(proposerBrouillons(b)).toEqual([])
  })
})

describe('historique et email', () => {
  it('achats par saison : envoyés et suivants, port compris, brouillons et annulés exclus', () => {
    const m = achatsParSaison(
      [bon({ id: 'a', season_id: 's25', shipping_amount: '5' }), bon({ id: 'b', season_id: 's26' }),
        bon({ id: 'c', season_id: 's26', status: 'brouillon' }), bon({ id: 'd', season_id: 's26', status: 'annule' })],
      [ligne({ purchase_order_id: 'a', quantity: 2, unit_price: '10' }), ligne({ purchase_order_id: 'b', quantity: 1, unit_price: '0.1' }),
        ligne({ purchase_order_id: 'c', quantity: 1, unit_price: '99' }), ligne({ purchase_order_id: 'd', quantity: 1, unit_price: '99' })],
    )
    expect(Object.fromEntries(m)).toEqual({ s25: 2500, s26: 10 })
  })

  it('texte prêt à coller', () => {
    const t = texteEmailBon({
      ferme: 'Les Jardins de Bleuenn',
      bon: { number: 'BC-2026-004', order_date: '2026-11-22', expected_date: '2026-12-05', shipping_amount: '6.9', notes: null },
      fournisseur: { name: 'Semencerie A', contact_name: 'Anne', customer_number: 'C-118' },
      lignes: [
        { label: 'Zinnia', variety: 'Mélange', supplier_ref: 'Z-12', unit: 'graines', quantity: 500, unit_price: '0.03', organic: true },
        { label: 'Cosmos', variety: null, supplier_ref: null, unit: 'sachet', quantity: 1, unit_price: null, organic: false },
      ],
    }).replace(/[\u00a0\u202f]/g, ' ')
    expect(t).toContain('Objet : bon de commande BC-2026-004 — Les Jardins de Bleuenn')
    expect(t).toContain('Bonjour Anne,')
    expect(t).toContain('Numéro client : C-118')
    expect(t).toContain('- Zinnia « Mélange » (bio) [réf. Z-12] : 500 graines, 0,03 € l’unité = 15,00 €')
    expect(t).toContain('- Cosmos : 1 sachet, prix à confirmer')
    expect(t).toContain('Frais de port : 6,90 €')
    expect(t).toContain('Total : 21,90 €')
    expect(t).toContain('Livraison souhaitée : 5 décembre 2026')
  })
})
