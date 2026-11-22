import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import {
  conflitsOccupation, conflitsSiAjout, libreAPartirDu, occupationParJour, occupationParSemaine,
  periodeOccupation, phraseOccupation, segmentsOccupation, surfaceOccupeeLe,
} from './occupation'

const planche = { surface_m2: 10 }

// Renoncule semée le 15/09/2026 (Saison 2026), récoltée au printemps 2027
const renoncule = plantation({
  id: 'renoncule', culture_name: 'Renoncule', culture_type: 'MP', surface_m2: 6,
  date_semis: '2026-09-15', date_plantation: '2026-10-15', date_recolte: '2027-03-14', date_fin: '2027-05-15',
  season_id: 's2026', season_name: 'Saison 2026', season_year: 2026,
})
// Dahlia de la saison suivante, sur la même planche
const dahlia = plantation({
  id: 'dahlia', culture_name: 'Dahlia', surface_m2: 6,
  date_semis: '2027-04-01', date_plantation: '2027-05-01', date_recolte: '2027-07-15', date_fin: '2027-10-31',
  season_id: 's2027', season_name: 'Saison 2027', season_year: 2027,
})

describe('période d’occupation', () => {
  it('commence à la plantation, pas au semis en cellule', () => {
    expect(periodeOccupation(renoncule)).toEqual({ debut: '2026-10-15', fin: '2027-05-15' })
  })

  it('commence au semis pour un semis direct', () => {
    const nigelle = plantation({
      id: 'nigelle', semis_direct: true, date_semis: '2026-09-20', date_plantation: '2026-09-20', date_fin: '2027-06-10',
    })
    expect(periodeOccupation(nigelle)).toEqual({ debut: '2026-09-20', fin: '2027-06-10' })
  })

  it('refuse une plantation sans date de fin plutôt que de deviner', () => {
    expect(() => periodeOccupation({ ...renoncule, date_fin: null as unknown as string })).toThrow(/non calculable/)
  })
})

describe('chevauchement de deux saisons sur une même planche', () => {
  it('la planche 2027 sait qu’elle porte encore des renoncules 2026', () => {
    expect(surfaceOccupeeLe([renoncule, dahlia], '2027-03-01')).toBe(6)
    expect(surfaceOccupeeLe([renoncule, dahlia], '2027-05-10')).toBe(12)
    expect(surfaceOccupeeLe([renoncule, dahlia], '2027-05-16')).toBe(6)
  })

  it('signale le conflit du 1er au 15 mai 2027 avec les deux plantations', () => {
    const c = conflitsOccupation(planche, [renoncule, dahlia])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ debut: '2027-05-01', fin: '2027-05-15', surface_occupee: 12, depassement_m2: 2 })
    expect(c[0].plantings.map(p => p.id).sort()).toEqual(['dahlia', 'renoncule'])
  })

  it('n’en signale plus si le dahlia est planté après la fin des renoncules', () => {
    const tard = { ...dahlia, date_plantation: '2027-05-16' }
    expect(conflitsOccupation(planche, [renoncule, tard])).toEqual([])
  })

  it('segments à occupation constante', () => {
    const s = segmentsOccupation([renoncule, dahlia])
    expect(s.map(x => [x.debut, x.fin, x.surface_occupee])).toEqual([
      ['2026-10-15', '2027-04-30', 6],
      ['2027-05-01', '2027-05-15', 12],
      ['2027-05-16', '2027-10-31', 6],
    ])
  })

  it('segments bornés à une période', () => {
    const s = segmentsOccupation([renoncule, dahlia], { debut: '2027-01-01', fin: '2027-05-05' })
    expect(s.map(x => [x.debut, x.fin, x.surface_occupee])).toEqual([
      ['2027-01-01', '2027-04-30', 6],
      ['2027-05-01', '2027-05-05', 12],
    ])
  })
})

describe('planche saturée', () => {
  const a = plantation({ id: 'a', culture_name: 'Zinnia', surface_m2: 4, date_plantation: '2027-05-10', date_fin: '2027-09-30' })
  const b = plantation({ id: 'b', culture_name: 'Cosmos', surface_m2: 4, date_plantation: '2027-05-20', date_fin: '2027-09-15' })
  const c = plantation({ id: 'c', culture_name: 'Célosie', surface_m2: 4, date_plantation: '2027-06-01', date_fin: '2027-08-31' })

  it('dépassement de 2 m² du 1er juin au 31 août avec les trois plantations', () => {
    const conflits = conflitsOccupation(planche, [a, b, c])
    expect(conflits).toHaveLength(1)
    expect(conflits[0]).toMatchObject({ debut: '2027-06-01', fin: '2027-08-31', depassement_m2: 2 })
    expect(conflits[0].plantings.map(p => p.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('conflitsSiAjout ne remonte que les conflits de la plantation projetée', () => {
    expect(conflitsSiAjout(planche, [a, b], c)).toHaveLength(1)
    expect(conflitsSiAjout(planche, [a, b], { ...c, surface_m2: 2 })).toEqual([])
    // modification d'une plantation existante : elle se remplace elle-même
    expect(conflitsSiAjout(planche, [a, b, c], { ...c, surface_m2: 2 })).toEqual([])
  })

  it('libre à partir du…', () => {
    // 4 m² demandés le 1er juillet : a + b + c = 12 m² jusqu'au 31 août, a + b jusqu'au 15 sept.
    expect(libreAPartirDu(planche, [a, b, c], 2, '2027-07-01')).toBe('2027-09-01')
    expect(libreAPartirDu(planche, [a, b, c], 4, '2027-07-01')).toBe('2027-09-16')
    expect(libreAPartirDu(planche, [a, b, c], 10, '2027-07-01')).toBe('2027-10-01')
    expect(libreAPartirDu(planche, [a, b, c], 6, '2027-04-01')).toBe('2027-04-01')
    expect(libreAPartirDu(planche, [a, b, c], 11, '2027-04-01')).toBeNull()
  })

  it('libre à partir du… pendant une durée donnée', () => {
    // 6 m² pendant 60 jours à partir du 1er avril : a arrive le 10 mai, b le 20 mai → impossible avant le 16 sept.
    expect(libreAPartirDu(planche, [a, b, c], 6, '2027-04-01', 30)).toBe('2027-04-01')
    expect(libreAPartirDu(planche, [a, b, c], 6, '2027-04-01', 60)).toBe('2027-09-16')
  })

  it('occupation par semaine : pic et conflit', () => {
    const semaines = occupationParSemaine(planche, [a, b, c], { debut: '2027-05-24', fin: '2027-06-06' })
    expect(semaines.map(s => [s.lundi, s.surface_max, s.conflit])).toEqual([
      ['2027-05-24', 8, false],
      ['2027-05-31', 12, true],
    ])
    expect(semaines[1].planting_ids.sort()).toEqual(['a', 'b', 'c'])
  })

  it('occupation par jour', () => {
    const jours = occupationParJour(planche, [a, b, c], { debut: '2027-05-19', fin: '2027-05-21' })
    expect(jours.map(j => [j.jour, j.surface_occupee, j.surface_libre])).toEqual([
      ['2027-05-19', 4, 6], ['2027-05-20', 8, 2], ['2027-05-21', 8, 2],
    ])
    expect(jours[1].taux).toBeCloseTo(0.8)
  })
})

describe('phrase d’affichage', () => {
  const pleine = { ...renoncule, surface_m2: 10 }

  it('occupée jusqu’au 15 mai par Renoncule (Saison 2026)', () => {
    expect(phraseOccupation(planche, [pleine], '2027-03-01')).toBe('Occupée jusqu\'au 15 mai par Renoncule (Saison 2026)')
  })

  it('écrit l’année quand elle diffère', () => {
    expect(phraseOccupation(planche, [pleine], '2026-12-01')).toBe('Occupée jusqu\'au 15 mai 2027 par Renoncule (Saison 2026)')
  })

  it('occupation partielle et plantations multiples', () => {
    expect(phraseOccupation(planche, [renoncule, dahlia], '2027-03-01'))
      .toBe('Occupée à 6 m² sur 10 : Renoncule (Saison 2026) jusqu\'au 15 mai')
    expect(phraseOccupation(planche, [renoncule, dahlia], '2027-05-10'))
      .toBe('Occupée par Renoncule (Saison 2026) jusqu\'au 15 mai et Dahlia (Saison 2027) jusqu\'au 31 octobre')
  })

  it('libre, avec la prochaine plantation', () => {
    expect(phraseOccupation(planche, [renoncule, dahlia], '2026-09-30'))
      .toBe('Libre jusqu\'au 14 octobre, puis Renoncule (Saison 2026)')
    expect(phraseOccupation(planche, [renoncule, dahlia], '2027-11-02')).toBe('Libre')
  })
})
