import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import {
  CULTURE_NON_ATTRIBUEE, caPrevu, joursDeRecoltePrevus, pertesParRaison, reelParCulture, reelParJardin,
  reelParPlantation, reelParSemaine, repartitionPrevue, type LossLite,
} from './reel'
import type { PlantingActual } from './types'
import type { VenteCalcul } from './ventes'

// Récolte du lundi 5 avril au dimanche 25 avril 2027 (21 jours, 3 semaines)
const periode = { date_recolte: '2027-04-05', date_fin: '2027-04-25', tiges_estimees: 100 }

describe('répartition du prévu selon le type', () => {
  it('RR : uniforme sur toute la période', () => {
    const r = repartitionPrevue(plantation({ ...periode, culture_type: 'RR' }))
    expect(r).toEqual([
      { lundi: '2027-04-05', tiges: 34 }, { lundi: '2027-04-12', tiges: 33 }, { lundi: '2027-04-19', tiges: 33 },
    ])
  })

  it('RU : tout la première semaine', () => {
    expect(repartitionPrevue(plantation({ ...periode, culture_type: 'RU' }))).toEqual([{ lundi: '2027-04-05', tiges: 100 }])
  })

  it('MP : uniforme sur la première moitié (11 jours sur 21)', () => {
    expect(joursDeRecoltePrevus(plantation({ ...periode, culture_type: 'MP' }))).toHaveLength(11)
    expect(repartitionPrevue(plantation({ ...periode, culture_type: 'MP' }))).toEqual([
      { lundi: '2027-04-05', tiges: 64 }, { lundi: '2027-04-12', tiges: 36 },
    ])
  })

  it('semis le 15/09/2026, récolte au printemps 2027 : le prévu tombe en 2027', () => {
    const renoncule = plantation({
      culture_type: 'MP', date_semis: '2026-09-15', date_plantation: '2026-10-15',
      date_recolte: '2027-03-14', date_fin: '2027-05-15', tiges_estimees: 600,
    })
    const r = repartitionPrevue(renoncule)
    expect(r[0].lundi).toBe('2027-03-08')
    expect(r.every(s => s.lundi.startsWith('2027'))).toBe(true)
    expect(r.reduce((s, x) => s + x.tiges, 0)).toBe(600)
  })

  it('récolte à cheval sur le nouvel an : semaine 53 de 2026', () => {
    const r = repartitionPrevue(plantation({ culture_type: 'RR', date_recolte: '2026-12-28', date_fin: '2027-01-10', tiges_estimees: 9 }))
    expect(r).toEqual([{ lundi: '2026-12-28', tiges: 5 }, { lundi: '2027-01-04', tiges: 4 }])
  })

  it('CA prévu en centimes', () => {
    expect(caPrevu(65, 0.8)).toBe(5200)
    expect(caPrevu(3, 0.35)).toBe(105)
  })
})

const cosmos = plantation({ id: 'p1', culture_id: 'cosmos', culture_name: 'Cosmos', garden_id: 'g1', garden_name: 'Jardin A',
  tiges_estimees: 200, prix_tige: 0.5, date_recolte: '2027-06-07', date_fin: '2027-06-20' })
const cosmos2 = plantation({ id: 'p2', culture_id: 'cosmos', culture_name: 'Cosmos', garden_id: 'g2', garden_name: 'Jardin B',
  tiges_estimees: 100, prix_tige: 0.5, date_recolte: '2027-06-07', date_fin: '2027-06-20' })
const dahlia = plantation({ id: 'p3', culture_id: 'dahlia', culture_name: 'Dahlia', garden_id: 'g1', garden_name: 'Jardin A',
  tiges_estimees: 50, prix_tige: 1.2, culture_type: 'RU', date_recolte: '2027-06-14', date_fin: '2027-06-20' })

const actual = (planting_id: string, rec: number, perd: number): PlantingActual => ({
  planting_id, season_id: 's2026', tiges_recoltees: rec, tiges_perdues: perd,
  nb_recoltes: 1, premiere_recolte: null, derniere_recolte: null,
})
const actuals = [actual('p1', 150, 15), actual('p2', 120, 0)]

const ventes: VenteCalcul[] = [
  { id: 'v1', date: '2027-06-09', channel: 'Fleuriste', total: 0, tiges: 0, lignes: [
    { label: 'Cosmos', culture_id: 'cosmos', quantity: 10, stems_per_unit: 10, unit_price: 6 },
    { label: 'Verdure', culture_id: null, quantity: 1, stems_per_unit: 1, unit_price: 3.5 },
  ] },
  { id: 'v2', date: '2027-06-16', channel: 'Marché', total: 22.4, tiges: 28 },
]

describe('bilans prévu / réel', () => {
  it('par plantation : taux de réalisation, CA réel non calculable', () => {
    const b = reelParPlantation([cosmos, dahlia], actuals)
    expect(b[0]).toMatchObject({ tiges_estimees: 200, tiges_recoltees: 150, tiges_perdues: 15, ca_prevu_centimes: 10000, ca_reel_centimes: null })
    expect(b[0].taux_realisation).toBeCloseTo(0.75)
    expect(b[0].taux_perte).toBeCloseTo(0.1)
    expect(b[1]).toMatchObject({ tiges_recoltees: 0, taux_realisation: 0, taux_perte: null })
  })

  it('par culture, avec les ventes non rattachées à part', () => {
    const b = reelParCulture([cosmos, cosmos2, dahlia], actuals, ventes)
    const c = b.find(x => x.cle === 'cosmos')
    expect(c).toMatchObject({ nb_plantations: 2, tiges_estimees: 300, tiges_recoltees: 270, ca_prevu_centimes: 15000, ca_reel_centimes: 6000 })
    expect(c?.taux_realisation).toBeCloseTo(0.9)
    expect(b.find(x => x.cle === 'dahlia')?.ca_reel_centimes).toBe(0)
    expect(b.find(x => x.cle === CULTURE_NON_ATTRIBUEE)?.ca_reel_centimes).toBe(350 + 2240)
  })

  it('par jardin', () => {
    const b = reelParJardin([cosmos, cosmos2, dahlia], actuals)
    expect(b.map(x => [x.libelle, x.tiges_estimees, x.ca_prevu_centimes, x.ca_reel_centimes])).toEqual([
      ['Jardin A', 250, 16000, null], ['Jardin B', 100, 5000, null],
    ])
  })

  it('par semaine', () => {
    const s = reelParSemaine({
      plantings: [cosmos, dahlia],
      recoltes: [{ planting_id: 'p1', date: '2027-06-08', tiges: 90 }, { planting_id: 'p1', date: '2027-06-15', tiges: 60 }],
      pertes: [{ planting_id: 'p1', culture_id: null, date: '2027-06-15', tiges: 15, reason: 'invendu' }],
      ventes,
    })
    expect(s.map(x => [x.cle_semaine, x.tiges_prevues, x.tiges_recoltees, x.tiges_perdues, x.ca_prevu_centimes, x.ca_reel_centimes])).toEqual([
      ['2027-W23', 100, 90, 0, 5000, 6350],
      ['2027-W24', 150, 60, 15, 5000 + 6000, 2240],
    ])
    expect(reelParSemaine({ plantings: [cosmos], recoltes: [], pertes: [], ventes: [], periode: { debut: '2027-06-14', fin: '2027-06-30' } }))
      .toHaveLength(1)
  })
})

describe('pertes par raison', () => {
  const pertes: LossLite[] = [
    { planting_id: 'p1', culture_id: null, date: '2027-06-10', tiges: 30, reason: 'invendu' },
    { planting_id: null, culture_id: 'cosmos', date: '2027-06-12', tiges: 10, reason: 'meteo' },
    { planting_id: null, culture_id: 'cosmos', date: '2027-08-12', tiges: 60, reason: 'maladie' },
  ]

  it('toutes les raisons, parts et taux', () => {
    const r = pertesParRaison(pertes, 400)
    expect(r.map(x => x.reason)).toEqual(['invendu', 'abime', 'meteo', 'ravageur', 'maladie', 'autre'])
    expect(r[0]).toMatchObject({ tiges: 30, part: 0.3, taux: 0.075 })
    expect(r[1]).toMatchObject({ tiges: 0, part: 0 })
  })

  it('filtrées sur une période, taux non calculable sans récolte', () => {
    const r = pertesParRaison(pertes, undefined, { debut: '2027-06-01', fin: '2027-06-30' })
    expect(r.find(x => x.reason === 'maladie')?.tiges).toBe(0)
    expect(r[0]).toMatchObject({ part: 0.75, taux: null })
  })
})
