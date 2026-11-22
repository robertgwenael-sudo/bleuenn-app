import { describe, expect, it } from 'vitest'
import { caPlantation, moisDesSemaines, previsionnelHebdo, semainesDeLaPeriode, type PlantingPrevision } from './previsionnel'
import { bornesSaison } from './saisons'
import { eurosEnCentimes } from './montants'
import { plantation } from './fixtures.test-utils'
import { getWeekNumber } from '../types'

const p = (x: Omit<Partial<PlantingPrevision>, 'revenu_estime'> & { revenu_estime?: unknown }): PlantingPrevision =>
  ({ ...plantation({}), ...x } as PlantingPrevision)

// Cosmos 2026 et anémones de novembre 2026 récoltées au printemps 2027 : mêmes numéros de semaine
const cosmos2026 = p({ id: 'cosmos', culture_name: 'Cosmos', culture_type: 'RR', date_recolte: '2026-03-02', date_fin: '2026-03-29', tiges_estimees: 400, prix_tige: 0.5, revenu_estime: 200 })
const anemone2027 = p({ id: 'anemone', culture_name: 'Anémone', culture_type: 'MP', date_recolte: '2027-03-01', date_fin: '2027-04-25', tiges_estimees: 105, prix_tige: 1.2, revenu_estime: '126.00' })
// Ammi semé à l'automne : récolte du 14/12/2026 au 24/01/2027 (à cheval sur le 1er janvier)
const ammiHiver = p({ id: 'ammi', culture_name: 'Ammi', culture_type: 'RR', date_recolte: '2026-12-14', date_fin: '2027-01-24', tiges_estimees: 105, prix_tige: 0.5, revenu_estime: '52.50' })

describe('reproduction du bug d’année de l’ancien Analytique', () => {
  // Copie de l'ancien distributeByWeek (numéro de semaine sans année, euros flottants)
  function ancien(x: PlantingPrevision) {
    const wStart = getWeekNumber(new Date(x.date_recolte + 'T00:00:00'))
    const wEnd = getWeekNumber(new Date(x.date_fin + 'T00:00:00'))
    if (wStart > wEnd || wStart < 1) return []
    const n = Math.max(1, wEnd - wStart + 1)
    const t = Math.round((x.tiges_estimees || 0) / n)
    const out: { week: number; tiges: number }[] = []
    for (let w = wStart; w <= wEnd && w <= 52; w++) out.push({ week: w, tiges: t })
    return out
  }
  it('2026 et 2027 tombaient dans les mêmes colonnes, la récolte à cheval disparaissait, les tiges ne retombaient pas', () => {
    expect(ancien(cosmos2026).map(d => d.week)).toEqual([10, 11, 12, 13])
    expect(ancien(anemone2027).map(d => d.week).slice(0, 4)).toEqual([9, 10, 11, 12])
    expect(ancien(ammiHiver)).toEqual([])
    expect(ancien(anemone2027).reduce((s, d) => s + d.tiges, 0)).not.toBe(105)
  })
})

describe('prévisionnel hebdomadaire', () => {
  it('les années civiles sont séparées : rien de 2027 dans 2026', () => {
    const a2026 = previsionnelHebdo([cosmos2026, anemone2027], bornesSaison(2026))
    const a2027 = previsionnelHebdo([cosmos2026, anemone2027], bornesSaison(2027))
    expect(a2026.cultures.map(c => c.culture_name)).toEqual(['Cosmos'])
    expect(a2027.cultures.map(c => c.culture_name)).toEqual(['Anémone'])
    expect(a2026.centimes).toBe(20000)
    expect(a2027.centimes).toBe(12600)
  })

  it('une récolte à cheval sur deux années est répartie entre elles, sans perte ni double compte', () => {
    const a2026 = previsionnelHebdo([ammiHiver], bornesSaison(2026))
    const a2027 = previsionnelHebdo([ammiHiver], bornesSaison(2027))
    expect(a2026.tiges).toBeGreaterThan(0)
    expect(a2027.tiges).toBeGreaterThan(0)
    expect(a2026.tiges + a2027.tiges).toBe(105)
    expect(a2026.centimes + a2027.centimes).toBe(5250)
    // La semaine du 28/12/2026 (jeudi 31/12) est la S53 de 2026 : comptée en 2026 seulement
    expect(a2026.semaines.at(-1)?.lundi).toBe('2026-12-28')
    expect(a2027.semaines[0].lundi).toBe('2027-01-04')
  })

  it('le total d’une culture retombe exactement sur la somme des revenus estimés de ses plantations', () => {
    const p1 = p({ id: 'z1', culture_name: 'Zinnia', culture_type: 'RR', date_recolte: '2026-06-03', date_fin: '2026-08-19', tiges_estimees: 733, prix_tige: 0.6, revenu_estime: '439.80' })
    const p2 = p({ id: 'z2', culture_name: 'Zinnia', culture_type: 'MP', date_recolte: '2026-07-01', date_fin: '2026-07-30', tiges_estimees: 101, prix_tige: 0.33, revenu_estime: '33.33' })
    const p3 = p({ id: 'z3', culture_name: 'Zinnia', culture_type: 'RU', date_recolte: '2026-09-10', date_fin: '2026-09-30', tiges_estimees: 7, prix_tige: 0.07, revenu_estime: 0.49 })
    const a = previsionnelHebdo([p1, p2, p3], bornesSaison(2026))
    const z = a.cultures.find(c => c.culture_name === 'Zinnia')!
    expect(z.centimes).toBe(eurosEnCentimes('439.80') + eurosEnCentimes('33.33') + eurosEnCentimes(0.49))
    expect(z.tiges).toBe(733 + 101 + 7)
    expect(Array.from(z.parLundi.values()).every(Number.isInteger)).toBe(true)
    expect(Array.from(z.parLundi.values()).reduce((s, v) => s + v, 0)).toBe(z.centimes)
    // RU : tout la semaine de la première récolte
    expect(a.semaines.find(s => s.lundi === '2026-09-07')?.cultures[0]).toMatchObject({ tiges: 7, centimes: 49 })
  })

  it('toutes les semaines sont affichées, vides comprises', () => {
    const a = previsionnelHebdo([cosmos2026], bornesSaison(2026))
    expect(a.semaines).toHaveLength(53) // 2026 compte 53 semaines ISO
    expect(a.semainesDeVente).toBe(4)
    expect(a.semaines.filter(s => s.tiges === 0)).toHaveLength(49)
  })

  it('une plantation sans CA calculable est remontée, jamais comptée à 0 €', () => {
    const sansPrix = p({ id: 'v', culture_name: 'Véronique', revenu_estime: null, prix_tige: null as unknown as number })
    const sansDates = p({ id: 'c', culture_name: 'Chia', date_recolte: null as unknown as string, date_fin: null as unknown as string })
    expect(() => caPlantation(sansPrix)).toThrow(/prix à la tige manquant/)
    const a = previsionnelHebdo([sansPrix, sansDates, cosmos2026], bornesSaison(2026))
    expect(a.non_calculables.map(x => x.culture_name)).toEqual(['Véronique', 'Chia'])
    expect(a.centimes).toBe(20000)
  })

  it('en-tête des mois et semaines d’une période glissante', () => {
    const lundis = semainesDeLaPeriode({ debut: '2026-11-16', fin: '2027-11-21' })
    expect(lundis[0]).toBe('2026-11-16')
    expect(moisDesSemaines(lundis.slice(0, 8)).map(m => `${m.cle}:${m.n}`)).toEqual(['2026-11:2', '2026-12:5', '2027-01:1'])
  })
})

// ------------------------------------------------------------
// Cohérence entre écrans : Analytique, Calendrier et Prévu/réel
// retombent sur la même somme des revenus estimés et des tiges nettes.
// ------------------------------------------------------------
import { reelParSemaine, repartitionPrevue, tigesPrevuesParSemaine } from './reel'
import { semainesDeLaPeriode as semaines } from './previsionnel'

describe('cohérence des totaux de prévision entre écrans', () => {
  const plantations = [
    p({ id: 'a', culture_name: 'Zinnia', culture_type: 'RR', date_recolte: '2026-06-03', date_fin: '2026-08-19', tiges_estimees: 733, prix_tige: 0.6, revenu_estime: '439.80' }),
    p({ id: 'b', culture_name: 'Statice', culture_type: 'MP', date_recolte: '2026-07-01', date_fin: '2026-07-30', tiges_estimees: 1050, prix_tige: 0.5, revenu_estime: '525.00' }),
    p({ id: 'c', culture_name: 'Ammi', culture_type: 'RR', date_recolte: '2026-12-14', date_fin: '2027-01-24', tiges_estimees: 105, prix_tige: 0.5, revenu_estime: '52.50' }),
    p({ id: 'd', culture_name: 'Tournesol', culture_type: 'RU', date_recolte: '2026-08-10', date_fin: '2026-08-24', tiges_estimees: 7, prix_tige: 0.33, revenu_estime: 2.31 }),
    p({ id: 'e', culture_name: 'Dahlia', culture_type: 'RR', date_recolte: '2026-08-01', date_fin: '2026-10-24', tiges_estimees: 350, prix_tige: 1.2, revenu_estime: '420.00' }),
  ]
  const revenus = plantations.reduce((s, x) => s + eurosEnCentimes(x.revenu_estime as string | number), 0)
  const tiges = plantations.reduce((s, x) => s + Number(x.tiges_estimees), 0)
  const toutesAnnees = { debut: '2026-01-01', fin: '2027-12-31' }

  it('Analytique : total = somme des revenus estimés et des tiges nettes', () => {
    const a = previsionnelHebdo(plantations, toutesAnnees)
    expect(a.centimes).toBe(revenus)
    expect(a.tiges).toBe(tiges)
    // et par année civile, sans double compte
    const a26 = previsionnelHebdo(plantations, bornesSaison(2026)), a27 = previsionnelHebdo(plantations, bornesSaison(2027))
    expect(a26.centimes + a27.centimes).toBe(revenus)
  })

  it('Prévu/réel : même total de CA prévu par semaine', () => {
    const r = reelParSemaine({ plantings: plantations, recoltes: [], pertes: [], ventes: [] })
    expect(r.reduce((s, x) => s + x.ca_prevu_centimes, 0)).toBe(revenus)
    expect(r.reduce((s, x) => s + x.tiges_prevues, 0)).toBe(tiges)
  })

  it('Calendrier : mêmes tiges par semaine que Prévu/réel et Analytique', () => {
    const lundis = semaines(toutesAnnees)
    const cal = tigesPrevuesParSemaine(plantations, lundis)
    expect(cal.reduce((s, x) => s + x, 0)).toBe(tiges)
    const a = previsionnelHebdo(plantations, toutesAnnees)
    expect(cal).toEqual(a.semaines.map(s => s.tiges))
    // l'ancien calcul (Math.round(tiges / semaines touchées)) dépassait les tiges nettes
    const ancien = plantations.reduce((s, x) => {
      const n = repartitionPrevue(x).length
      return s + Math.round(Number(x.tiges_estimees) / n) * n
    }, 0)
    expect(ancien).not.toBe(tiges)
  })
})
