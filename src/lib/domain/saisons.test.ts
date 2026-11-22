import { describe, expect, it } from 'vitest'
import {
  anneeDeRattachement, bornesSaison, dateRecoltePrevue, phraseRattachement, plantationsAReclasser, saisonDeLAnnee, saisonProposee,
  type SaisonLite,
} from './saisons'

const S2026: SaisonLite = { id: 's2026', name: 'Saison 2026', year: 2026, farm_id: 'f1' }
const S2027: SaisonLite = { id: 's2027', name: 'Saison 2027', year: 2027, farm_id: 'f1' }
const AUTRE_FERME: SaisonLite = { id: 'x2028', name: 'Saison 2028', year: 2028, farm_id: 'f2' }

describe('saisons civiles', () => {
  it('une saison va du 1er janvier au 31 décembre', () => {
    expect(bornesSaison(2027)).toEqual({ debut: '2027-01-01', fin: '2027-12-31' })
    expect(() => bornesSaison(27)).toThrow(/invalide/)
  })

  it('date de récolte prévue : comme la vue plantings_full', () => {
    // Renoncule plantée le 1er novembre 2026 (griffes, pas de cellule), 120 j au champ
    expect(dateRecoltePrevue('2026-11-01', { jours_cellule: 0, jours_champ: 120 })).toBe('2027-03-01')
    // override de cellule à 0 = « pas d'override » (nullif), comme en SQL
    expect(dateRecoltePrevue('2026-03-01', { jours_cellule: 30, jours_champ: 60 }, { jours_cellule_override: 0 })).toBe('2026-05-30')
    expect(dateRecoltePrevue('2026-03-01', { jours_cellule: 30, jours_champ: 60 }, { jours_champ_override: 10 })).toBe('2026-04-10')
    // jours au champ manquants : non calculable, jamais deviné
    expect(dateRecoltePrevue('2026-03-01', { jours_cellule: 30, jours_champ: null })).toBeNull()
  })

  it('bulbes plantés en novembre 2026, récoltés en mars 2027 : saison 2027', () => {
    const p = saisonProposee('2027-03-01', [S2026, S2027], S2026)
    expect(p).toEqual({ statut: 'trouvee', annee: 2027, saison: S2027 })
    expect(phraseRattachement(p)).toBe('Première récolte en 2027 : rattachée à Saison 2027.')
  })

  it('récolte la même année : saison de l’année, pas la saison active', () => {
    expect(saisonProposee('2026-06-15', [S2026, S2027], S2027).saison).toEqual(S2026)
  })

  it('pas de saison pour l’année de récolte : repli sur la saison active, signalé', () => {
    const p = saisonProposee('2028-04-01', [S2026, S2027, AUTRE_FERME], S2026)
    expect(p).toEqual({ statut: 'manquante', annee: 2028, saison: S2026 })
    expect(phraseRattachement(p)).toMatch(/pas encore de saison 2028/)
  })

  it('date de récolte non calculable : repli signalé', () => {
    expect(saisonProposee(null, [S2026], S2026).statut).toBe('non_calculable')
  })

  it('année de rattachement : l’année de la première récolte', () => {
    expect(anneeDeRattachement('2027-01-02')).toBe(2027)
    expect(() => anneeDeRattachement('2027-13-02')).toThrow()
  })

  it('plantations à reclasser : sans rien déplacer', () => {
    const r = plantationsAReclasser([
      { id: 'tulipe', culture_name: 'Tulipe', season_id: 's2026', season_year: 2026, date_recolte: '2027-03-20' },
      { id: 'cosmos', culture_name: 'Cosmos', season_id: 's2026', season_year: 2026, date_recolte: '2026-07-01' },
      { id: 'pivoine', culture_name: 'Pivoine', season_id: 's2026', season_year: 2026, date_recolte: '2029-05-01' },
      { id: 'veronique', culture_name: 'Véronique', season_id: 's2026', season_year: 2026, date_recolte: null },
    ], [S2026, S2027])
    expect(r).toEqual([
      { planting_id: 'tulipe', culture_name: 'Tulipe', date_recolte: '2027-03-20', saison_actuelle: 's2026', saison_cible: 's2027', annee_cible: 2027 },
      { planting_id: 'pivoine', culture_name: 'Pivoine', date_recolte: '2029-05-01', saison_actuelle: 's2026', saison_cible: null, annee_cible: 2029 },
    ])
  })

  it('une seule saison par année et par ferme', () => {
    expect(saisonDeLAnnee([S2026, S2027, AUTRE_FERME], 2027, 'f1')).toEqual(S2027)
    expect(saisonDeLAnnee([S2026, AUTRE_FERME], 2028, 'f1')).toBeNull()
  })
})

// ------------------------------------------------------------
// Préparer 2027 : jeu reproduisant la prod (une saison 2026)
// ------------------------------------------------------------
import { apercuReprise, estVivaceEnPlace, plantationsARattacher, type PlantationPreparation } from './saisons'

describe('préparer 2027 à partir de la seule saison 2026', () => {
  const pl = (id: string, culture: string, planche: string, semis: string, recolte: string | null, extra: Partial<PlantationPreparation> = {}): PlantationPreparation =>
    ({ id, culture_id: culture, culture_name: culture, planche_id: planche, season_id: 's2026', date_semis: semis, date_recolte: recolte, ...extra })
  const saison2026 = [
    pl('anemone-25', 'Anémone', 'A1', '2025-11-01', '2026-03-01'),   // bulbes de l'an dernier
    pl('anemone-26', 'Anémone', 'A1', '2026-11-01', '2027-03-01'),   // bulbes de novembre 2026
    pl('tulipe-26', 'Tulipe', 'A2', '2026-11-01', '2027-03-01'),
    pl('ammi-27', 'Ammi', 'B1', '2027-02-10', '2027-05-08'),         // semis de février 2027
    pl('cosmos', 'Cosmos', 'B2', '2026-04-03', '2026-06-08'),
    pl('pivoine', 'Pivoine', 'C1', '2026-03-01', '2026-05-15', { cycle: 'vivace', arrachee_le: null }),
    pl('achillee-arr', 'Achillée', 'C2', '2026-03-01', '2026-06-01', { cycle: 'vivace', arrachee_le: '2026-10-01' }),
  ]

  it('b. à rattacher : les plantations dont la première récolte tombe en 2027', () => {
    expect(plantationsARattacher(saison2026, 's2026', 2027).map(p => p.id)).toEqual(['anemone-26', 'tulipe-26', 'ammi-27'])
  })

  it('c. reprise du plan : ni vivace en place, ni doublon des bulbes déjà rattachés, ni hors année', () => {
    const ids = new Set(plantationsARattacher(saison2026, 's2026', 2027).map(p => p.id))
    const reste2026 = saison2026.filter(p => !ids.has(p.id))
    const deja2027 = saison2026.filter(p => ids.has(p.id)).map(p => ({ ...p, season_id: 's2027' }))
    const a = apercuReprise({ source: reste2026, cible: deja2027, anneeSource: 2026 })
    expect(a.copies.map(p => `${p.id}@${p.date_semis_copie}`)).toEqual(['cosmos@2027-04-03', 'achillee-arr@2027-03-01'])
    expect(a.vivacesEnPlace.map(p => p.id)).toEqual(['pivoine'])
    expect(a.dejaPrevues.map(p => p.id)).toEqual(['anemone-25']) // donnerait les anémones du 01/11/2026, déjà là
    expect(a.horsAnnee).toEqual([])
  })

  it('c. sans l’étape b, les plantations récoltées en 2027 ne sont pas dupliquées en 2028', () => {
    const a = apercuReprise({ source: saison2026, cible: [], anneeSource: 2026 })
    expect(a.horsAnnee.map(p => p.id)).toEqual(['anemone-26', 'tulipe-26', 'ammi-27'])
  })

  it('vivace : en place tant qu’elle n’est pas arrachée', () => {
    expect(estVivaceEnPlace({ cycle: 'vivace', arrachee_le: null })).toBe(true)
    expect(estVivaceEnPlace({ cycle: 'vivace', arrachee_le: '2026-10-01' })).toBe(false)
    expect(estVivaceEnPlace({ cycle: 'annuelle' })).toBe(false)
  })
})

// ------------------------------------------------------------
// Basculer « 2026 » en « 2027 » (la saison de la prod est un plan)
// ------------------------------------------------------------
import { apercuBascule } from './saisons'

describe('basculer la saison-plan 2026 en 2027', () => {
  const pl = (id: string, semis: string, plantation: string, recolte: string | null, extra: Partial<PlantationPreparation> = {}) =>
    ({ id, culture_id: id, culture_name: id, planche_id: 'A1', season_id: 's2026', date_semis: semis, date_plantation: plantation, date_recolte: recolte, ...extra })
  const plan = [
    pl('cosmos', '2026-04-03', '2026-04-24', '2026-06-28'),                                  // annuelle de 2026
    pl('anemone', '2026-11-01', '2026-11-01', '2027-03-01'),                                 // bulbe de novembre
    pl('ammi', '2027-02-10', '2027-03-10', '2027-05-09'),                                    // semis de février 2027
    pl('pivoine', '2026-03-01', '2026-03-01', '2026-04-30', { cycle: 'vivace', arrachee_le: null }),
    pl('achillee', '2026-10-01', '2026-11-30', '2026-12-20', { cycle: 'vivace', arrachee_le: null }), // pas encore plantée
    pl('veronique', '2026-03-01', '2026-03-01', null),
    pl('lisianthus', '2028-02-29', '2028-03-30', '2028-06-01'),
  ]
  const a = apercuBascule({ plantings: plan, anneeSaison: 2026, anneeCible: 2027, aujourdhui: '2026-11-22' })

  it('annuelle de 2026 décalée d’un an', () => {
    expect(a.decalees.find(p => p.id === 'cosmos')?.nouvelle_date_semis).toBe('2027-04-03')
  })
  it('bulbe de novembre et semis de février 2027 non décalés', () => {
    expect(a.laissees.filter(p => p.raison === 'deja_annee_cible').map(p => p.id)).toEqual(['anemone', 'ammi', 'lisianthus'])
  })
  it('vivace en place non décalée ; vivace pas encore plantée décalée', () => {
    expect(a.laissees.find(p => p.id === 'pivoine')?.raison).toBe('vivace_en_place')
    expect(a.decalees.find(p => p.id === 'achillee')?.nouvelle_date_semis).toBe('2027-10-01')
  })
  it('récolte non calculable : laissée et listée, jamais devinée', () => {
    expect(a.laissees.find(p => p.id === 'veronique')?.raison).toBe('recolte_non_calculable')
    expect(a.decalees.map(p => p.id)).toEqual(['cosmos', 'achillee'])
  })
  it('l’année cible doit suivre', () => {
    expect(() => apercuBascule({ plantings: plan, anneeSaison: 2026, anneeCible: 2026, aujourdhui: '2026-11-22' })).toThrow(/doit suivre/)
  })
})
