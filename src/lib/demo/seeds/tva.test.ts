// Données de démo (014) : la base de démo se construit, factures avec TVA
// ventilée et cohérente, bons de commande numérotés.
import { describe, expect, it } from 'vitest'
import { buildDemoDb } from '../data'
import { extendDemoDb } from './index'
import { eurosEnCentimes } from '../../domain'

describe('démo TVA', () => {
  const db = extendDemoDb(buildDemoDb()) as any

  it('deux taux de paramétrage, lignes catégorisées, bons numérotés', () => {
    expect(db.farm_vat_rates).toHaveLength(2)
    expect(db.sale_lines.every((l: any) => l.vat_rate_id && Number.isInteger(l.taux_tva_pb))).toBe(true)
    expect(db.orders.every((o: any) => /^BC\d{4}-\d{4}$/.test(o.numero))).toBe(true)
    expect(new Set(db.orders.map((o: any) => o.numero)).size).toBe(db.orders.length)
  })

  it('factures : total = HT + TVA, ventilation cohérente, avoir symétrique', () => {
    for (const f of db.invoices) {
      expect(f.assujettie_tva).toBe(true)
      expect(f.mention_tva).toBeNull()
      const tva = f.ventilation_tva.reduce((s: number, v: any) => s + eurosEnCentimes(v.tva), 0)
      expect(tva).toBe(eurosEnCentimes(f.total_tva))
      expect(eurosEnCentimes(f.total)).toBe(eurosEnCentimes(f.total_ht) + eurosEnCentimes(f.total_tva))
    }
    const mariage = db.invoices.find((f: any) => f.acheteur?.nom === 'Mariage Le Bris')
    expect(mariage.ventilation_tva.map((v: any) => v.taux_pb)).toEqual([1000, 2000])
    const avoir = db.invoices.find((f: any) => f.kind === 'avoir')
    const corrigee = db.invoices.find((f: any) => f.id === avoir.avoir_de)
    expect(eurosEnCentimes(avoir.total_tva)).toBe(-eurosEnCentimes(corrigee.total_tva))
  })
})
