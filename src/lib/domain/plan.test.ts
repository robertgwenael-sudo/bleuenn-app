import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import { conflitsDuplication, projeterDuplication } from './plan'

describe('duplication d’un plan sur l’année suivante', () => {
  it('semis 29 février → 28 février, durées conservées comme le recalcul SQL', () => {
    const p = plantation({ id: 'x', date_semis: '2028-02-29', date_plantation: '2028-03-30', date_recolte: '2028-05-30', date_fin: '2028-06-19' })
    const [d] = projeterDuplication([p], 1, { name: 'Saison 2029', year: 2029 })
    expect(d).toMatchObject({
      id: 'projet:x', date_semis: '2029-02-28', date_plantation: '2029-03-30', date_recolte: '2029-05-30', date_fin: '2029-06-19',
      season_name: 'Saison 2029', season_year: 2029,
    })
  })

  it('signale la planche encore occupée par une culture d’automne de la saison précédente', () => {
    const planches = [{ id: 'pl1', surface_m2: 10 }]
    // Plan 2026 : zinnia de mai à septembre sur toute la planche
    const zinnia = plantation({ id: 'z', planche_id: 'pl1', surface_m2: 10, culture_name: 'Zinnia',
      date_semis: '2026-04-01', date_plantation: '2026-05-01', date_recolte: '2026-07-01', date_fin: '2026-09-30' })
    // Renoncules semées en septembre 2026 sur la même planche, en place jusqu'au 15 mai 2027
    const renoncule = plantation({ id: 'r', planche_id: 'pl1', surface_m2: 10, culture_name: 'Renoncule',
      date_semis: '2026-09-15', date_plantation: '2026-10-15', date_recolte: '2027-03-14', date_fin: '2027-05-15' })

    const c = conflitsDuplication({ source: [zinnia], existantes: [zinnia, renoncule], planches })
    expect(c).toHaveLength(1)
    expect(c[0].projet.id).toBe('projet:z')
    expect(c[0].conflits[0]).toMatchObject({ debut: '2027-05-01', fin: '2027-05-15', depassement_m2: 10 })
  })

  it('refuse une planche inconnue', () => {
    expect(() => conflitsDuplication({ source: [plantation({ planche_id: 'zz' })], existantes: [], planches: [] })).toThrow(/inconnue/)
  })
})
