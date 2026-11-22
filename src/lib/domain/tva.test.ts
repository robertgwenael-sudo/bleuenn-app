import { describe, expect, it } from 'vitest'
import { controlerTaux, essayerVentiler, formatTaux, lireTauxPb, tauxParDefaut, tvaSurBase, ventilerTva } from './tva'
import type { VatRate } from './types'

// Taux de test : des paramètres, pas des constantes du code.
const DIX = 1000
const VINGT = 2000

describe('taux', () => {
  it('lit et formate les points de base', () => {
    expect(lireTauxPb('10')).toBe(1000)
    expect(lireTauxPb('5,5')).toBe(550)
    expect(lireTauxPb('20 %')).toBe(2000)
    expect(lireTauxPb('')).toBeNull()
    expect(lireTauxPb('abc')).toBeNull()
    expect(lireTauxPb('120')).toBeNull()
    expect(formatTaux(1000)).toBe('10 %')
    expect(formatTaux(550)).toBe('5,5 %')
    expect(formatTaux(2010)).toBe('20,1 %')
    expect(() => formatTaux(10001)).toThrow()
  })

  it('arrondit la TVA au centime, moitié loin de zéro', () => {
    expect(tvaSurBase(1005, DIX)).toBe(101) // 100,5 c → 101
    expect(tvaSurBase(1004, DIX)).toBe(100)
    expect(tvaSurBase(-1005, DIX)).toBe(-101) // avoir : symétrique
    expect(tvaSurBase(333, 550)).toBe(18) // 18,315
  })
})

describe('ventilation', () => {
  it('calcule la TVA sur le total HT de chaque taux, pas ligne par ligne', () => {
    // 3 lignes à 0,05 € HT à 10 % : ligne par ligne 3 × 0,01 = 0,03 ; sur le total 0,015 → 0,02
    const t = ventilerTva([
      { montant_ht: 5, taux_pb: DIX }, { montant_ht: 5, taux_pb: DIX }, { montant_ht: 5, taux_pb: DIX },
    ], true)
    expect(t.total_tva).toBe(2)
    expect(t.total_ttc).toBe(17)
  })

  it('ventile par taux, trié, avec libellés', () => {
    const t = ventilerTva([
      { montant_ht: 30000, taux_pb: VINGT, libelle: 'Fleur travaillée' },
      { montant_ht: 2500, taux_pb: DIX, libelle: 'Fleur non travaillée' },
      { montant_ht: 1650, taux_pb: DIX, libelle: 'Fleur non travaillée' },
    ], true)
    expect(t.ventilation).toEqual([
      { taux_pb: DIX, libelle: 'Fleur non travaillée', base_ht: 4150, tva: 415, ttc: 4565 },
      { taux_pb: VINGT, libelle: 'Fleur travaillée', base_ht: 30000, tva: 6000, ttc: 36000 },
    ])
    expect(t.total_ht).toBe(34150)
    expect(t.total_tva).toBe(6415)
    expect(t.total_ttc).toBe(40565)
  })

  it('sans assujettissement : pas de TVA, TTC = HT', () => {
    const t = ventilerTva([{ montant_ht: 1234, taux_pb: null }], false)
    expect(t).toEqual({ assujettie: false, total_ht: 1234, total_tva: 0, total_ttc: 1234, ventilation: [] })
  })

  it('refuse une ligne sans catégorie quand la ferme est assujettie', () => {
    expect(() => ventilerTva([{ montant_ht: 100, taux_pb: null }], true)).toThrow('1 ligne sans catégorie de TVA')
    const r = essayerVentiler([{ montant_ht: 100, taux_pb: null }, { montant_ht: 1, taux_pb: null }], true)
    expect(r).toEqual({ ok: false, erreur: '2 lignes sans catégorie de TVA' })
  })
})

describe('catégorie par défaut', () => {
  const taux: VatRate[] = [
    { id: 'a', farm_id: 'f', categorie: 'non_travaillee', libelle: 'Fleur non travaillée', taux_pb: DIX, actif: true, ordre: 1, created_at: '' },
    { id: 'b', farm_id: 'f', categorie: 'travaillee', libelle: 'Fleur travaillée', taux_pb: VINGT, actif: true, ordre: 2, created_at: '' },
  ]
  it('non travaillée par défaut, travaillée pour un mariage ou un bouquet', () => {
    expect(tauxParDefaut(taux, { unit: 'tige', channel: 'Marché' })?.id).toBe('a')
    expect(tauxParDefaut(taux, { unit: 'tige', channel: 'Mariage' })?.id).toBe('b')
    expect(tauxParDefaut(taux, { clientKind: 'mariage' })?.id).toBe('b')
    expect(tauxParDefaut(taux, { unit: 'bouquet' })?.id).toBe('b')
  })
  it('repli sur non travaillée si l’autre est désactivée, null sans taux', () => {
    expect(tauxParDefaut([taux[0], { ...taux[1], actif: false }], { channel: 'Mariage' })?.id).toBe('a')
    expect(tauxParDefaut([], {})).toBeNull()
  })
  it('contrôle des réglages', () => {
    expect(controlerTaux(taux)).toEqual([])
    expect(controlerTaux([...taux, { ...taux[0], libelle: 'Doublon' }])).toHaveLength(1)
    expect(controlerTaux([{ ...taux[0], libelle: ' ' }])).toEqual(['Chaque taux doit avoir un libellé'])
  })
})
