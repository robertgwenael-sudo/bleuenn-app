import { describe, expect, it } from 'vitest'
import { fenetreGlissante } from './dates'
import { plantation } from './fixtures.test-utils'
import {
  JOURS_PINCAGE_APRES_PLANTATION, compterTaches, deplacerTache, fusionnerTaches, genererTachesPlan,
  grouperParEcheance, grouperParMois, grouperParSemaine, ligneCocherTache, lignesOrphelines,
  moisDeRattachement, tachesAAfficher, tachesDUnePlantation, type StoredTask,
} from './taches'

const AUJOURDHUI = '2026-11-22' // un dimanche

const zinnia = plantation({
  id: 'z1', culture_name: 'Zinnia', pincer: true, filet: false,
  date_semis: '2027-04-01', date_plantation: '2027-05-01', date_recolte: '2027-07-01', date_fin: '2027-09-30',
  season_id: 's2027',
})
// Renoncule semée le 15/09/2026, récoltée en 2027
const renoncule = plantation({
  id: 'r1', culture_name: 'Renoncule',
  date_semis: '2026-09-15', date_plantation: '2026-10-15', date_recolte: '2027-03-14', date_fin: '2027-05-15',
})
const nigelle = plantation({
  id: 'n1', culture_name: 'Nigelle', semis_direct: true, filet: true,
  date_semis: '2026-11-25', date_plantation: '2026-11-25', date_recolte: '2027-05-20', date_fin: '2027-06-20',
})

function stockee(t: Partial<StoredTask>): StoredTask {
  return {
    id: 't', season_id: 's2026', title: 'x', kind: 'autre', due_date: null, planting_id: null,
    planche_id: null, assigned_to: null, auto_key: null, done_at: null, done_by: null, notes: null, ...t,
  }
}

describe('génération des tâches du plan', () => {
  it('semis, plantation, pinçage 3 semaines après, début de récolte', () => {
    const t = tachesDUnePlantation(zinnia)
    expect(t.map(x => [x.auto_key, x.due_date])).toEqual([
      ['semis:z1', '2027-04-01'],
      ['plantation:z1', '2027-05-01'],
      ['pincage:z1', '2027-05-22'],
      ['recolte:z1', '2027-07-01'],
    ])
    expect(JOURS_PINCAGE_APRES_PLANTATION).toBe(21)
    expect(t[0].title).toBe('Semer Zinnia en cellules — PL 1')
  })

  it('semis direct : pas de semis en cellules, plantation = semis au champ, filet posé le même jour', () => {
    const t = tachesDUnePlantation(nigelle)
    expect(t.map(x => [x.kind, x.due_date])).toEqual([
      ['plantation', '2026-11-25'],
      ['tuteurage', '2026-11-25'],
      ['recolte', '2027-05-20'],
    ])
    expect(t[0].title).toContain('semis direct')
  })

  it('filtre sur la fenêtre glissante : la récolte 2027 d’un semis 2026 en fait partie', () => {
    const t = genererTachesPlan([renoncule, zinnia, nigelle], fenetreGlissante(AUJOURDHUI))
    expect(t.map(x => x.auto_key)).toContain('recolte:r1')
    expect(t.map(x => x.auto_key)).not.toContain('semis:r1') // 15/09/2026, avant la fenêtre
    expect(t[0].auto_key).toBe('plantation:n1') // trié par date
  })
})

describe('fusion avec les lignes stockées', () => {
  const generees = genererTachesPlan([zinnia, nigelle], fenetreGlissante(AUJOURDHUI))

  it('une auto_key cochée marque la tâche générée comme faite', () => {
    const fusion = fusionnerTaches(generees, [
      stockee({ id: 'row1', season_id: 's2027', auto_key: 'semis:z1', kind: 'semis', due_date: '2027-03-25',
        done_at: '2027-04-01T09:12:00+02:00', done_by: 'u2', assigned_to: 'u2' }),
    ])
    const semis = fusion.find(t => t.auto_key === 'semis:z1')
    expect(semis).toMatchObject({ fait: true, task_id: 'row1', done_by: 'u2', assigned_to: 'u2' })
    expect(semis?.due_date).toBe('2027-04-01') // la date du plan fait foi
    expect(fusion.filter(t => t.fait)).toHaveLength(1)
  })

  it('une auto_key d’une autre saison ne coche rien', () => {
    const fusion = fusionnerTaches(generees, [stockee({ season_id: 'autre', auto_key: 'semis:z1', done_at: 'x' })])
    expect(fusion.filter(t => t.fait)).toHaveLength(0)
  })

  it('ajoute les tâches libres', () => {
    const fusion = fusionnerTaches(generees, [
      stockee({ id: 'libre1', title: 'Réparer le goutte-à-goutte', kind: 'irrigation', due_date: '2026-11-24' }),
      stockee({ id: 'libre2', title: 'Commander les bulbes', due_date: null }),
    ])
    expect(fusion.find(t => t.cle === 'libre:libre1')).toMatchObject({ source: 'libre', fait: false })
    expect(fusion[fusion.length - 1].cle).toBe('libre:libre2') // sans date en dernier
  })

  it('repère les lignes orphelines', () => {
    const o = lignesOrphelines([zinnia], [
      stockee({ id: 'ok', season_id: 's2027', auto_key: 'semis:z1' }),
      stockee({ id: 'orph', season_id: 's2027', auto_key: 'pincage:supprimee' }),
      stockee({ id: 'libre' }),
    ])
    expect(o.map(x => x.id)).toEqual(['orph'])
  })
})

describe('regroupement par semaine', () => {
  const taches = fusionnerTaches(
    genererTachesPlan([nigelle, zinnia], { debut: '2026-11-01', fin: '2027-12-31' }),
    [
      stockee({ id: 'retard', title: 'Pailler', due_date: '2026-11-10' }),
      stockee({ id: 'faite', title: 'Arroser', due_date: '2026-11-18', done_at: '2026-11-18T10:00:00Z' }),
      stockee({ id: 'vieille', title: 'Ancienne', due_date: '2026-11-03', done_at: '2026-11-03T10:00:00Z' }),
      stockee({ id: 'auj', title: 'Désherber', kind: 'desherbage', due_date: '2026-11-22' }),
      stockee({ id: 'nd', title: 'Sans date' }),
    ])

  it('en retard, cette semaine, semaine prochaine, plus tard', () => {
    const g = grouperParEcheance(taches, AUJOURDHUI)
    expect(g.en_retard.map(t => t.cle)).toEqual(['libre:retard'])
    expect(g.cette_semaine.map(t => t.cle)).toEqual(['libre:faite', 'libre:auj'])
    expect(g.semaine_prochaine.map(t => t.cle)).toEqual(['plantation:n1', 'tuteurage:n1'])
    expect(g.plus_tard[0].cle).toBe('semis:z1')
    expect(g.sans_date.map(t => t.cle)).toEqual(['libre:nd'])
    // une tâche faite avant la semaine en cours n'apparaît plus
    expect(Object.values(g).flat().some(t => t.cle === 'libre:vieille')).toBe(false)
  })

  it('index par semaine ISO', () => {
    const m = grouperParSemaine(taches)
    expect(m.get('2026-W48')?.map(t => t.cle)).toEqual(['plantation:n1', 'tuteurage:n1'])
  })

})

describe('cocher une tâche', () => {
  it('produit la ligne à upserter, horodatage fourni par l’appelant', () => {
    const t = tachesDUnePlantation(zinnia)[0]
    expect(ligneCocherTache(t, true, 'u1', '2027-04-01T08:00:00Z')).toEqual({
      season_id: 's2027', auto_key: 'semis:z1', title: t.title, kind: 'semis', due_date: '2027-04-01',
      planting_id: 'z1', planche_id: 'pl1', done_at: '2027-04-01T08:00:00Z', done_by: 'u1',
    })
    expect(ligneCocherTache(t, false, 'u1', '2027-04-01T08:00:00Z')).toMatchObject({ done_at: null, done_by: null })
  })
})

describe('planning mensuel', () => {
  // Renoncule : plantation le 1er avril 2027, semaine du 29 mars au 4 avril (lundi en mars)
  const renonculePrintemps = plantation({
    id: 'rp', culture_name: 'Renoncule', season_id: 's2027',
    date_semis: '2027-03-01', date_plantation: '2027-04-01', date_recolte: '2027-05-03', date_fin: '2027-06-01',
  })
  // Pivoine : semis le 2 janvier 2027 (semaine 53 de 2026, lundi 28 décembre)
  const hiver = plantation({
    id: 'h', culture_name: 'Pois de senteur', season_id: 's2027',
    date_semis: '2027-01-02', date_plantation: '2027-01-05', date_recolte: '2027-04-20', date_fin: '2027-06-01',
  })
  const libres = [
    stockee({ id: 'retard', title: 'Pailler', due_date: '2026-11-10' }),
    stockee({ id: 'faite-retard', title: 'Tailler', due_date: '2026-11-12', done_at: '2026-11-12T10:00:00Z' }),
    stockee({ id: 'auj', title: 'Désherber', kind: 'desherbage', due_date: '2026-11-22' }),
    stockee({ id: 'dec1', title: 'Inventaire', due_date: '2026-12-01' }),
    stockee({ id: 'nd', title: 'Sans date' }),
  ]

  function planning(aujourdhui = AUJOURDHUI) {
    return tachesAAfficher({ plantings: [renonculePrintemps, hiver], stockees: libres, aujourdhui })
  }

  it('fenêtre par défaut : mois en cours + 11 mois, en tête le groupe en retard', () => {
    const p = planning()
    expect(p.mois.map(m => m.cle)).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
      '2027-07', '2027-08', '2027-09', '2027-10',
    ])
    expect(p.mois[0]).toMatchObject({ libelle: 'novembre 2026', en_cours: true })
    expect(p.mois[1].en_cours).toBe(false)
    expect(p.en_retard.taches.map(t => t.cle)).toEqual(['libre:retard'])
    expect(p.en_retard.compteurs).toMatchObject({ total: 1, a_faire: 1 })
    expect(p.sans_date.map(t => t.cle)).toEqual(['libre:nd'])
  })

  it('semaine à cheval sur deux mois : rattachée au mois de son lundi', () => {
    const p = planning()
    const nov = p.mois[0]
    // Lundis de novembre 2026 : 2, 9, 16, 23, 30 — la semaine du 30/11 au 6/12 est en novembre
    expect(nov.semaines.map(s => [s.numero, s.lundi, s.dimanche])).toEqual([
      [45, '2026-11-02', '2026-11-08'], [46, '2026-11-09', '2026-11-15'], [47, '2026-11-16', '2026-11-22'],
      [48, '2026-11-23', '2026-11-29'], [49, '2026-11-30', '2026-12-06'],
    ])
    expect(nov.semaines[4].taches.map(t => t.cle)).toEqual(['libre:dec1']) // échéance au 1er décembre
    expect(p.mois[1].semaines[0].lundi).toBe('2026-12-07')
    expect(moisDeRattachement('2026-12-01')).toBe('2026-11')
    // plantation du 1er avril 2027 : semaine du 29 mars, donc en mars
    const mars = p.mois.find(m => m.cle === '2027-03')
    expect(mars?.semaines.flatMap(s => s.taches).map(t => t.cle)).toContain('plantation:rp')
  })

  it('passage décembre → janvier : la semaine 53 reste en décembre', () => {
    const p = planning()
    const dec = p.mois.find(m => m.cle === '2026-12')
    const jan = p.mois.find(m => m.cle === '2027-01')
    const s53 = dec?.semaines[dec.semaines.length - 1]
    expect(s53).toMatchObject({ cle: '2026-W53', numero: 53, lundi: '2026-12-28', dimanche: '2027-01-03' })
    expect(s53?.taches.map(t => t.cle)).toEqual(['semis:h']) // 2 janvier 2027
    expect(jan?.semaines[0]).toMatchObject({ cle: '2027-W01', lundi: '2027-01-04' })
    expect(jan?.semaines[0].taches.map(t => t.cle)).toEqual(['plantation:h'])
    expect(jan?.libelle).toBe('janvier 2027')
  })

  it('marque la semaine en cours, même rangée dans le mois précédent', () => {
    const p = planning('2026-12-02') // mercredi ; semaine du lundi 30 novembre
    expect(p.mois[0]).toMatchObject({ cle: '2026-11', en_cours: false })
    expect(p.mois[1]).toMatchObject({ cle: '2026-12', en_cours: true })
    const courantes = p.mois.flatMap(m => m.semaines).filter(s => s.en_cours)
    expect(courantes.map(s => s.lundi)).toEqual(['2026-11-30'])
  })

  it('compteurs de charge par mois, par semaine et par type', () => {
    const p = planning()
    const nov = p.mois[0]
    // faite-retard (12/11, faite) + auj (22/11) + dec1 (01/12)
    expect(nov.compteurs).toMatchObject({ total: 3, faites: 1, a_faire: 2 })
    expect(nov.compteurs.par_type.desherbage).toEqual({ total: 1, faites: 0, a_faire: 1 })
    expect(nov.semaines[3].compteurs.total).toBe(0)
    const avril = p.mois.find(m => m.cle === '2027-04')
    expect(avril?.compteurs.par_type.recolte?.total).toBe(1) // pois de senteur le 20/04
    expect(compterTaches([])).toEqual({ total: 0, faites: 0, a_faire: 0, par_type: {} })
  })

  it('reprend les retards du plan et les retire une fois cochés', () => {
    const p = tachesAAfficher({ plantings: [nigelle], stockees: [], aujourdhui: '2026-12-10' })
    expect(p.en_retard.taches.map(t => t.cle)).toEqual(['plantation:n1', 'tuteurage:n1'])
    const coche = tachesAAfficher({
      plantings: [nigelle], aujourdhui: '2026-12-10',
      stockees: [stockee({ season_id: 's2026', auto_key: 'plantation:n1', done_at: '2026-11-25T08:00:00Z' })],
    })
    expect(coche.en_retard.taches.map(t => t.cle)).toEqual(['tuteurage:n1'])
    // faite le 25/11, avant les mois affichés : sortie du planning (historique)
    expect(coche.mois[0].cle).toBe('2026-12')
    expect(coche.mois.reduce((n, m) => n + m.compteurs.faites, 0)).toBe(0)
  })

  it('grouperParMois accepte une fenêtre explicite', () => {
    const p = grouperParMois([], '2026-11-22', { debut: '2026-11-01', fin: '2027-01-31' })
    expect(p.mois.map(m => [m.cle, m.semaines.length])).toEqual([['2026-11', 5], ['2026-12', 4], ['2027-01', 4]])
  })
})

describe('déplacer une tâche libre', () => {
  const libre = { source: 'libre' as const, task_id: 'libre1', title: 'Réparer la serre' }

  it('vers une semaine : lundi par défaut, ou le jour demandé', () => {
    expect(deplacerTache(libre, { semaine: { annee: 2026, numero: 53 } })).toEqual({ id: 'libre1', due_date: '2026-12-28' })
    expect(deplacerTache(libre, { semaine: { annee: 2027, numero: 1 }, jour: 5 }).due_date).toBe('2027-01-08')
    expect(deplacerTache(libre, { semaine: '2027-01-01' }).due_date).toBe('2026-12-28')
  })

  it('vers un mois : premier lundi du mois, qui reste rattaché à ce mois', () => {
    expect(deplacerTache(libre, { mois: '2027-01' }).due_date).toBe('2027-01-04')
    expect(deplacerTache(libre, { mois: '2027-03' }).due_date).toBe('2027-03-01')
    expect(moisDeRattachement(deplacerTache(libre, { mois: '2026-12' }).due_date)).toBe('2026-12')
  })

  it('refuse de déplacer une tâche du plan', () => {
    const plan = tachesDUnePlantation(zinnia)[0]
    expect(() => deplacerTache(plan, { mois: '2027-05' })).toThrow(/plan de culture/)
    expect(() => deplacerTache(libre, { semaine: { annee: 2027, numero: 53 } })).toThrow(/semaine 53/)
    expect(() => deplacerTache(libre, { mois: '2027-5' })).toThrow(/Mois invalide/)
    expect(() => deplacerTache(libre, { mois: '2027-05', jour: 8 })).toThrow(/Jour/)
  })
})
