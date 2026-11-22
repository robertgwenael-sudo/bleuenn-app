import { describe, expect, it } from 'vitest'
import {
  centimesEnEuros, eurosEnCentimes, formatEuros, moyenneCentimes, produitCentimes, repartirEntier,
} from './montants'
import type { Order } from './types'
import {
  canalDeVente, chiffreAffaires, commandeVersVente, montantLigne, syntheseParCanal, syntheseParClient,
  tigesLigne, totalVente, totauxLignes, type LigneCalcul, type VenteCalcul,
} from './ventes'

const bottes: LigneCalcul = { label: 'Renoncule', unit: 'botte', quantity: 4, stems_per_unit: 10, unit_price: 6.5 }
const tiges: LigneCalcul = { label: 'Cosmos', unit: 'tige', quantity: 25, stems_per_unit: 1, unit_price: 0.8 }

describe('montants en centimes', () => {
  it('convertit sans erreur de flottant', () => {
    expect(eurosEnCentimes(6.5)).toBe(650)
    expect(eurosEnCentimes('6,50')).toBe(650)
    expect(eurosEnCentimes(0.29)).toBe(29) // 0.29 * 100 = 28.999999999999996
    expect(eurosEnCentimes(1.005)).toBe(101) // arrondi comme round(x, 2) en SQL
    expect(eurosEnCentimes('-2.5')).toBe(-250)
    expect(eurosEnCentimes(0)).toBe(0)
  })

  it('refuse une valeur illisible plutôt que d’y lire zéro', () => {
    expect(() => eurosEnCentimes('')).toThrow(/illisible/)
    expect(() => eurosEnCentimes('six euros')).toThrow(/illisible/)
    expect(() => eurosEnCentimes(Number.NaN)).toThrow()
  })

  it('produit quantité × prix arrondi au centime, moitié loin de zéro', () => {
    expect(produitCentimes(3, 0.1)).toBe(30)
    expect(produitCentimes(1.5, 2.99)).toBe(449) // 4,485 → 4,49
    expect(produitCentimes(0.5, 0.01)).toBe(1) // 0,005 → 0,01
  })

  it('formate en euros à la française', () => {
    expect(formatEuros(4600)).toBe('46,00 €')
    expect(formatEuros(123456789)).toBe('1 234 567,89 €')
    expect(formatEuros(-5)).toBe('−0,05 €')
    expect(() => formatEuros(46.5)).toThrow(/non entier/)
    expect(centimesEnEuros(4600)).toBe(46)
  })

  it('répartit un entier sans perte', () => {
    expect(repartirEntier(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(repartirEntier(10, [7, 4])).toEqual([6, 4])
    expect(moyenneCentimes(1000, 3)).toBe(333)
    expect(moyenneCentimes(1000, 0)).toBeNull()
  })
})

describe('totaux d’une vente multi-lignes', () => {
  it('4 bottes × 10 tiges à 6,50 € + 25 tiges à 0,80 € = 46,00 € et 65 tiges', () => {
    const t = totauxLignes([bottes, tiges])
    expect(t.total_centimes).toBe(4600)
    expect(t.tiges).toBe(65)
    expect(formatEuros(t.total_centimes)).toBe('46,00 €')
    expect(t.prix_moyen_tige_centimes).toBe(71) // 46 / 65 = 0,7077
    expect(t.libelles).toBe('Cosmos, Renoncule')
  })

  it('la somme de dix lignes à 0,10 € fait exactement 1,00 €', () => {
    const l: LigneCalcul = { label: 'Tige', quantity: 1, stems_per_unit: 1, unit_price: 0.1 }
    expect(totauxLignes(Array(10).fill(l)).total_centimes).toBe(100)
  })

  it('reprend line_total calculé par la base', () => {
    expect(montantLigne({ ...bottes, line_total: '26.00' })).toBe(2600)
    expect(montantLigne(bottes)).toBe(2600)
  })

  it('quantité décimale : tiges arrondies comme ::int', () => {
    expect(tigesLigne({ quantity: 2.5, stems_per_unit: 10 })).toBe(25)
    expect(tigesLigne({ quantity: '0.15', stems_per_unit: 10 })).toBe(2) // 1,5 → 2
    expect(() => tigesLigne({ quantity: 1, stems_per_unit: 0 })).toThrow()
  })

  it('vente historique sans lignes : total de la colonne', () => {
    const v: VenteCalcul = { id: 'v', date: '2026-07-04', channel: 'Marché', total: 37.4, tiges: 52 }
    expect(totalVente(v)).toBe(3740)
    expect(totalVente({ ...v, lignes: [bottes, tiges] })).toBe(4600)
  })
})

describe('commande → vente', () => {
  const order: Order = {
    id: 'o1', season_id: 's2027', client_id: 'cl1', delivery_date: '2027-05-12', status: 'confirmee',
    channel: null, notes: 'Livrer avant 9 h', sale_id: null, created_by: 'u1', created_at: '2027-04-30T10:00:00Z',
  }
  const lignes = [
    { culture_id: 'renoncule', label: 'Renoncule', unit: 'botte' as const, quantity: 4, stems_per_unit: 10, unit_price: 6.5 },
    { culture_id: 'cosmos', label: 'Cosmos', unit: 'tige' as const, quantity: 25, stems_per_unit: 1, unit_price: 0.8 },
  ]

  it('reprend les lignes, le client, la date de livraison ; canal déduit du fleuriste', () => {
    const r = commandeVersVente({ order, lignes, userId: 'u1', client: { kind: 'fleuriste', name: 'Atelier Pivoine' } })
    expect(r.total_centimes).toBe(4600)
    expect(r.vente).toMatchObject({
      season_id: 's2027', date: '2027-05-12', channel: 'Fleuriste', client_id: 'cl1', client: 'Atelier Pivoine',
      order_id: 'o1', tiges: 65, cultures_sold: 'Cosmos, Renoncule',
    })
    expect(r.lignes).toEqual(lignes)
  })

  it('refuse une commande annulée ou déjà vendue', () => {
    expect(() => commandeVersVente({ order: { ...order, status: 'annulee' }, lignes, userId: 'u1' })).toThrow(/annulée/)
    expect(() => commandeVersVente({ order: { ...order, sale_id: 'v9' }, lignes, userId: 'u1' })).toThrow(/déjà/)
    expect(() => commandeVersVente({ order, lignes: [], userId: 'u1' })).toThrow(/sans ligne/)
  })

  it('ne devine pas un canal : erreur, sauf choix explicite', () => {
    expect(() => canalDeVente({ channel: 'Instagram' }, { kind: 'particulier' })).toThrow(/Canal/)
    expect(canalDeVente({ channel: 'Instagram' }, { kind: 'particulier' }, 'Marché')).toBe('Marché')
    expect(canalDeVente({ channel: 'Deuil' }, { kind: 'particulier' })).toBe('Deuil')
    expect(canalDeVente({ channel: null }, { kind: 'abonne' })).toBe('Abonnements')
  })
})

describe('synthèses', () => {
  const ventes: VenteCalcul[] = [
    { id: 'v1', date: '2027-05-12', channel: 'Fleuriste', total: 0, tiges: 0, client_id: 'cl1', lignes: [bottes, tiges] },
    { id: 'v2', date: '2027-05-19', channel: 'Fleuriste', total: 30, tiges: 40, client_id: 'cl1' },
    { id: 'v3', date: '2027-05-15', channel: 'Marché', total: 12.1, tiges: 20, client: 'Mme Le Gall' },
    { id: 'v4', date: '2027-05-15', channel: 'Marché', total: 0.2, tiges: 1 },
  ]

  it('par client', () => {
    const s = syntheseParClient(ventes, [{ id: 'cl1', name: 'Atelier Pivoine' }])
    expect(s.map(x => [x.libelle, x.nb_ventes, x.total_centimes, x.tiges, x.panier_moyen_centimes])).toEqual([
      ['Atelier Pivoine', 2, 7600, 105, 3800],
      ['Mme Le Gall', 1, 1210, 20, 1210],
      ['Sans client', 1, 20, 1, 20],
    ])
  })

  it('par canal, parts du CA', () => {
    const s = syntheseParCanal(ventes)
    expect(s.map(x => [x.cle, x.total_centimes])).toEqual([['Fleuriste', 7600], ['Marché', 1230]])
    expect(s[0].part + s[1].part).toBeCloseTo(1)
    expect(chiffreAffaires(ventes)).toBe(8830)
  })
})
