// Vivaces : la récolte revient chaque année, et chaque écran de prévision
// (calendrier, prévisionnel, disponibilités, tâches, prévu/réel) la compte
// pour l'année affichée, pas seulement la première floraison.
import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import { recoltesDansPeriode, recoltesDeLAnnee } from './cultures'
import { previsionnelHebdo } from './previsionnel'
import { calculerDisponibilites, calendrierRecolte } from './disponibilite'
import { reelParSemaine, tigesPrevuesParSemaine } from './reel'
import { cleRecolteRepetee, genererTachesPlan, lignesOrphelines } from './taches'

// Achillée plantée en 2025, fleurit chaque 15 juin pendant 3 semaines
const achillee = plantation({
  id: 'ach', culture_id: 'c-ach', culture_name: 'Achillée', culture_type: 'RR', cycle: 'vivace', arrachee_le: null,
  date_semis: '2025-03-01', date_plantation: '2025-03-31', date_recolte: '2025-06-15', date_fin: '2025-07-06',
  tiges_estimees: 300, revenu_estime: 150, prix_tige: 0.5, season_id: 's2025',
})
const zinnia = plantation({
  id: 'zin', culture_id: 'c-zin', culture_name: 'Zinnia', culture_type: 'RR',
  date_semis: '2026-04-01', date_plantation: '2026-04-24', date_recolte: '2026-06-30', date_fin: '2026-07-21',
  tiges_estimees: 210, revenu_estime: 105, prix_tige: 0.5, season_id: 's2026',
})
const an2026 = { debut: '2026-01-01', fin: '2026-12-31' }

describe('fenêtres de récolte par période', () => {
  it('une ligne par floraison qui touche la période ; annuelles inchangées', () => {
    const r = recoltesDansPeriode([achillee, zinnia], { debut: '2026-01-01', fin: '2027-12-31' })
    expect(r.map(p => [p.id, p.date_recolte, p.date_fin])).toEqual([
      ['ach', '2026-06-15', '2026-07-06'], ['ach', '2027-06-15', '2027-07-06'], ['zin', '2026-06-30', '2026-07-21'],
    ])
  })
  it('année civile : la floraison qui commence cette année-là, une seule', () => {
    expect(recoltesDeLAnnee([achillee], 2027)[0].date_recolte).toBe('2027-06-15')
    expect(recoltesDeLAnnee([{ ...achillee, arrachee_le: '2026-09-01' }], 2027)).toEqual([])
  })
})

describe('écrans de prévision', () => {
  it('prévisionnel 2026 : la vivace plantée en 2025 compte ses tiges et son CA de 2026', () => {
    const pv = previsionnelHebdo([achillee, zinnia], an2026)
    expect(pv.tiges).toBe(300 + 210)
    expect(pv.centimes).toBe(15000 + 10500)
    expect(pv.cultures.map(c => c.culture_name)).toEqual(['Achillée', 'Zinnia'])
  })
  it('calendrier de l’année et disponibilités : la vivace est en récolte en juin 2026', () => {
    const cal = calendrierRecolte([achillee], an2026)
    expect(cal.lignes.map(l => l.culture_name)).toEqual(['Achillée'])
    const d = calculerDisponibilites({ plantings: [achillee], commandes: [], recoltes: [], pertes: [], aujourdhui: '2026-01-05', fenetre: an2026 })
    expect(d.lignes.reduce((s, l) => s + l.prevu, 0)).toBe(300)
  })
  it('tiges par semaine (calendrier) et prévu/réel par semaine', () => {
    const lundis = ['2026-06-15', '2026-06-22', '2026-06-29']
    expect(tigesPrevuesParSemaine([achillee], lundis).reduce((a, b) => a + b, 0)).toBe(300)
    const sem = reelParSemaine({ plantings: [achillee], recoltes: [], pertes: [], ventes: [], periode: an2026 })
    expect(sem.reduce((s, x) => s + x.tiges_prevues, 0)).toBe(300)
  })
  it('tâches : un « début de récolte » chaque année, clé propre à l’année, jamais orpheline', () => {
    const t = genererTachesPlan([achillee], { debut: '2025-01-01', fin: '2027-12-31' }).filter(x => x.kind === 'recolte')
    expect(t.map(x => [x.due_date, x.auto_key])).toEqual([
      ['2025-06-15', 'recolte:ach'], ['2026-06-15', cleRecolteRepetee('ach', 2026)], ['2027-06-15', cleRecolteRepetee('ach', 2027)],
    ])
    const stockee = { id: 't1', season_id: 's2025', title: '', kind: 'recolte' as const, due_date: '2026-06-15', planting_id: 'ach', planche_id: null, assigned_to: null, auto_key: 'recolte-2026:ach', done_at: null, done_by: null, notes: null }
    expect(lignesOrphelines([achillee], [stockee])).toEqual([])
    expect(lignesOrphelines([{ ...achillee, cycle: 'annuelle' }], [stockee])).toHaveLength(1)
  })
})
