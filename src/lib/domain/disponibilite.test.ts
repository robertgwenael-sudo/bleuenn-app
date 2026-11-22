import { describe, expect, it } from 'vitest'
import { calculerDisponibilites, ficheDisponibiliteTexte, surventes, type CommandeAvecLignes } from './disponibilite'
import { plantation } from './fixtures.test-utils'

const AUJOURDHUI = '2026-11-22'

// Renoncule semée le 15/09/2026, récolte du lundi 3 au dimanche 16 mai 2027 (RR, 140 tiges)
const renoncule = plantation({
  id: 'r1', culture_id: 'renoncule', culture_name: 'Renoncule', culture_type: 'RR', prix_tige: 0.8,
  date_semis: '2026-09-15', date_plantation: '2026-10-15', date_recolte: '2027-05-03', date_fin: '2027-05-16',
  tiges_estimees: 140,
})
const anemone = plantation({
  id: 'a1', culture_id: 'anemone', culture_name: 'Anémone', culture_type: 'RU', prix_tige: 0.9,
  date_recolte: '2027-05-05', date_fin: '2027-05-20', tiges_estimees: 45,
})
const anemone2 = { ...anemone, id: 'a2', prix_tige: 1.1, tiges_estimees: 0 }

const commande = (id: string, status: CommandeAvecLignes['order']['status'], date: string, lignes: CommandeAvecLignes['lignes']): CommandeAvecLignes =>
  ({ order: { id, status, delivery_date: date }, lignes })

const commandes: CommandeAvecLignes[] = [
  commande('o1', 'confirmee', '2027-05-06', [
    { culture_id: 'renoncule', label: 'Renoncule', quantity: 3, stems_per_unit: 10 },
    { culture_id: null, label: 'Feuillage', quantity: 5, stems_per_unit: 1 },
  ]),
  commande('o2', 'devis', '2027-05-06', [{ culture_id: 'renoncule', label: 'Renoncule', quantity: 50, stems_per_unit: 1 }]),
  commande('o3', 'annulee', '2027-05-06', [{ culture_id: 'renoncule', label: 'Renoncule', quantity: 50, stems_per_unit: 1 }]),
  commande('o4', 'prete', '2027-05-12', [{ culture_id: 'renoncule', label: 'Renoncule', quantity: 8, stems_per_unit: 10 }]),
]

describe('disponibilités par culture et par semaine', () => {
  const d = calculerDisponibilites({
    plantings: [renoncule, anemone, anemone2], commandes, recoltes: [], pertes: [], aujourdhui: AUJOURDHUI,
  })

  it('prévu − commandes confirmées et prêtes ; devis et annulées ignorés', () => {
    expect(d.periode).toEqual({ debut: '2026-11-22', fin: '2027-11-21' })
    const r = d.lignes.filter(l => l.culture_id === 'renoncule')
    expect(r.map(l => [l.cle_semaine, l.prevu, l.engage, l.disponible, l.source])).toEqual([
      ['2027-W18', 70, 30, 40, 'prevu'],
      ['2027-W19', 70, 80, -10, 'prevu'],
    ])
    expect(surventes(d).map(l => l.cle_semaine)).toEqual(['2027-W19'])
  })

  it('remonte les lignes de commande sans culture', () => {
    expect(d.non_attribuees).toEqual([{ order_id: 'o1', lundi: '2027-05-03', label: 'Feuillage', tiges: 5 }])
  })

  it('prix le plus bas et prix multiples', () => {
    const a = d.lignes.find(l => l.culture_id === 'anemone')
    expect(a).toMatchObject({ prevu: 45, prix_tige_min_centimes: 90, prix_unique: false })
  })

  it('bascule sur le réel quand des récoltes sont saisies', () => {
    const reel = calculerDisponibilites({
      plantings: [renoncule], commandes, aujourdhui: '2027-05-04',
      recoltes: [{ planting_id: 'r1', date: '2027-05-03', tiges: 55 }, { planting_id: 'r1', date: '2027-05-04', tiges: 20 }],
      pertes: [{ planting_id: 'r1', culture_id: null, date: '2027-05-04', tiges: 5, reason: 'abime' }],
    })
    const w18 = reel.lignes.find(l => l.cle_semaine === '2027-W18')
    expect(w18).toMatchObject({ prevu: 70, recolte: 75, perdu: 5, engage: 30, disponible: 40, source: 'reel' })
    expect(reel.lignes.find(l => l.cle_semaine === '2027-W19')?.source).toBe('prevu')
  })

  it('ignore ce qui tombe hors de la fenêtre', () => {
    const court = calculerDisponibilites({
      plantings: [renoncule], commandes, recoltes: [], pertes: [], aujourdhui: AUJOURDHUI,
      fenetre: { debut: '2026-11-22', fin: '2027-05-05' },
    })
    expect(court.lignes.map(l => l.cle_semaine)).toEqual(['2027-W18'])
  })
})

describe('fiche texte pour les fleuristes', () => {
  const d = calculerDisponibilites({ plantings: [renoncule, anemone], commandes, recoltes: [], pertes: [], aujourdhui: AUJOURDHUI })

  it('prête à coller dans un email', () => {
    const t = ficheDisponibiliteTexte(d, { ferme: 'Ferme Bleuenn', aujourdhui: AUJOURDHUI, multipleDe: 10, afficherPrix: true })
    expect(t).toBe([
      'Disponibilités — Ferme Bleuenn',
      'Mise à jour du 22 novembre 2026',
      '',
      'Semaine 18 (du 3 au 9 mai 2027)',
      '  • Anémone : 40 tiges — 0,90 € la tige',
      '  • Renoncule : 40 tiges — 0,80 € la tige',
      '',
      'Quantités indicatives, confirmées à la commande.',
    ].join('\n'))
  })

  it('sans rien à proposer', () => {
    const t = ficheDisponibiliteTexte(d, { ferme: 'Ferme Bleuenn', aujourdhui: AUJOURDHUI, minimum: 1000 })
    expect(t).toContain('Aucune disponibilité sur la période.')
  })
})

// ------------------------------------------------------------
// « L'aneth manque » (retour de Marine, 22/11/2026)
// ------------------------------------------------------------
import { calendrierRecolte, plantationsSansRecolte } from './disponibilite'
import { bornesSaison } from './saisons'
import { getWeekNumber } from '../types'

describe('calendrier annuel de récolte : lecture par dates, toutes saisons', () => {
  // Aneth semé à l'automne 2026, en récolte du 14/12/2026 au 24/01/2027,
  // première récolte en 2026 : saison 2026.
  const anethHiver = plantation({
    id: 'aneth-h', culture_id: 'aneth', culture_name: 'Aneth', culture_type: 'RR', season_id: 's2026', season_name: 'Saison 2026',
    date_semis: '2026-09-01', date_plantation: '2026-10-01', date_recolte: '2026-12-14', date_fin: '2027-01-24',
  })
  // Aneth de printemps 2027, saison 2027 : invisible quand la saison active était 2026
  const anethPrintemps = plantation({
    id: 'aneth-p', culture_id: 'aneth', culture_name: 'Aneth', culture_type: 'RR', season_id: 's2027', season_name: 'Saison 2027',
    date_semis: '2027-03-01', date_plantation: '2027-03-29', date_recolte: '2027-05-24', date_fin: '2027-06-27',
  })
  const cosmos2026 = plantation({ id: 'cosmos', culture_name: 'Cosmos', date_recolte: '2026-06-01', date_fin: '2026-06-21' })

  it('reproduction : l’ancienne règle (n° de semaine sans année) perd une récolte à cheval sur le 1er janvier', () => {
    const ancienne = (p: typeof anethHiver, w: number) => {
      const wr = getWeekNumber(new Date(p.date_recolte + 'T00:00:00'))
      const wf = getWeekNumber(new Date(p.date_fin + 'T00:00:00'))
      return w >= wr && w <= wf
    }
    expect(Array.from({ length: 52 }, (_, i) => i + 1).some(w => ancienne(anethHiver, w))).toBe(false)
  })

  it('la récolte à cheval sur deux années apparaît dans les deux années civiles', () => {
    const c2026 = calendrierRecolte([anethHiver, cosmos2026], bornesSaison(2026))
    const c2027 = calendrierRecolte([anethHiver, cosmos2026], bornesSaison(2027))
    const aneth26 = c2026.lignes.find(l => l.culture_name === 'Aneth')!
    const aneth27 = c2027.lignes.find(l => l.culture_name === 'Aneth')!
    expect(Array.from(aneth26.lundis).sort()).toEqual(['2026-12-14', '2026-12-21', '2026-12-28'])
    expect(Array.from(aneth27.lundis).sort()).toEqual(['2026-12-28', '2027-01-04', '2027-01-11', '2027-01-18'])
    expect(c2027.lignes.map(l => l.culture_name)).toEqual(['Aneth'])
  })

  it('les plantations d’une autre saison sont lues par leurs dates', () => {
    const c = calendrierRecolte([anethHiver, anethPrintemps], bornesSaison(2027))
    const aneth = c.lignes.find(l => l.culture_name === 'Aneth')!
    expect(aneth.lundis.has('2027-05-24')).toBe(true)
    expect(aneth.lundis.has('2027-01-04')).toBe(true)
    expect(aneth.saisons).toEqual(['Saison 2026', 'Saison 2027'])
    expect(c.parSemaine[c.lundis.indexOf('2027-06-07')]).toBe(1)
  })

  it('les années ne se mélangent pas : une récolte 2027 n’apparaît pas en 2026', () => {
    const c = calendrierRecolte([anethPrintemps], bornesSaison(2026))
    expect(c.lignes).toEqual([])
  })

  it('« à vendre » : l’aneth de la saison suivante compte dans les 12 mois glissants', () => {
    const d = calculerDisponibilites({ plantings: [anethHiver, anethPrintemps], commandes: [], recoltes: [], pertes: [], aujourdhui: AUJOURDHUI })
    const semaines = d.lignes.filter(l => l.culture_name === 'Aneth').map(l => l.lundi)
    expect(semaines).toContain('2026-12-14')
    expect(semaines).toContain('2027-06-21')
  })

  it('une plantation sans date de récolte calculable est remontée, pas ignorée', () => {
    const sansDates = { ...anethPrintemps, id: 'x', date_recolte: null as unknown as string, date_fin: null as unknown as string }
    expect(plantationsSansRecolte([anethPrintemps, sansDates]).map(p => p.id)).toEqual(['x'])
  })
})
