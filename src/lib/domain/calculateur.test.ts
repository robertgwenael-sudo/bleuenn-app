import { describe, expect, it } from 'vitest'
import { proposerQuantites, totauxSaisie } from './calculateur'

const DIX = 1000
const VINGT = 2000

describe('totaux de saisie', () => {
  it('HT, TVA et TTC en direct', () => {
    const t = totauxSaisie([
      { label: 'Dahlia', quantity: 10, stems_per_unit: 1, unit_price: 1.5, taux_pb: DIX },
      { label: 'Arche', quantity: 1, stems_per_unit: 1, unit_price: 250, taux_pb: VINGT },
    ], true)
    expect(t.total_centimes).toBe(26500)
    expect(t.tva?.total_tva).toBe(150 + 5000)
    expect(t.tva?.total_ttc).toBe(31650)
    expect(t.erreurTva).toBeNull()
  })
  it('TVA non calculable signalée, sans lever', () => {
    const t = totauxSaisie([{ label: 'X', quantity: 1, stems_per_unit: 1, unit_price: 1 }], true)
    expect(t.tva).toBeNull()
    expect(t.erreurTva).toMatch(/sans catégorie/)
    expect(totauxSaisie([{ label: 'X', quantity: 1, stems_per_unit: 1, unit_price: 1 }], false).tva?.total_ttc).toBe(100)
  })
})

describe('budget → quantités', () => {
  it('500 € HT en répartition égale sur trois variétés', () => {
    const p = proposerQuantites({
      budget: 50000, base: 'ht', assujettie: true,
      articles: [
        { cle: 'dahlia', prix_ht: 150, taux_pb: DIX, poids: 1 },
        { cle: 'cosmos', prix_ht: 80, taux_pb: DIX, poids: 1 },
        { cle: 'zinnia', prix_ht: 70, taux_pb: DIX, poids: 1 },
      ],
    })
    expect(p.total).toBeLessThanOrEqual(50000)
    expect(p.ecart).toBe(50000 - p.total)
    // Reliquat plus petit que le prix le moins cher
    expect(p.ecart).toBeLessThan(70)
    for (const x of p.quantites) expect(Number.isInteger(x.quantite)).toBe(true)
    // Parts proches d'un tiers chacune
    for (const x of p.quantites) expect(Math.abs(x.montant_ht - 16667)).toBeLessThan(200)
  })

  it('budget TTC : jamais au-dessus, arrondis de TVA compris', () => {
    const p = proposerQuantites({
      budget: 50000, base: 'ttc', assujettie: true,
      articles: [
        { cle: 'renoncule', prix_ht: 123, taux_pb: DIX, poids: 3 },
        { cle: 'composition', prix_ht: 4567, taux_pb: VINGT, poids: 1 },
      ],
    })
    expect(p.totaux.total_ttc).toBe(p.total)
    expect(p.total).toBeLessThanOrEqual(50000)
    expect(p.ecart).toBeLessThan(136) // moins qu'une tige TTC
    expect(p.quantites[0].montant_ht).toBeGreaterThan(p.quantites[1].montant_ht)
  })

  it('proportions : poids nul = article non servi', () => {
    const p = proposerQuantites({
      budget: 1000, base: 'ht', assujettie: false,
      articles: [{ cle: 'a', prix_ht: 100, taux_pb: null, poids: 1 }, { cle: 'b', prix_ht: 100, taux_pb: null, poids: 0 }],
    })
    expect(p.quantites.map(q => q.quantite)).toEqual([10, 0])
    expect(p.ecart).toBe(0)
  })

  it('refuse ce qu’il ne peut pas calculer', () => {
    expect(() => proposerQuantites({ budget: 0, base: 'ht', assujettie: false, articles: [{ cle: 'a', prix_ht: 1, taux_pb: null, poids: 1 }] })).toThrow()
    expect(() => proposerQuantites({ budget: 100, base: 'ht', assujettie: false, articles: [] })).toThrow()
    expect(() => proposerQuantites({ budget: 100, base: 'ht', assujettie: false, articles: [{ cle: 'a', prix_ht: 0, taux_pb: null, poids: 1 }] })).toThrow(/Prix manquant/)
    expect(() => proposerQuantites({ budget: 100, base: 'ttc', assujettie: true, articles: [{ cle: 'a', prix_ht: 10, taux_pb: null, poids: 1 }] })).toThrow(/TVA/)
  })
})
