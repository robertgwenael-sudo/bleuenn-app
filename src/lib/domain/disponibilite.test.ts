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
