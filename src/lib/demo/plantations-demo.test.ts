// Données de démo réalistes : aucune planche en conflit de surface, anémones
// seulement en serre, vivaces en place, un plant acheté (retours de Marine).
import { describe, expect, it } from 'vitest'
import { pourTestsDemo } from './client'
import { conflitsOccupation, estAncienne } from '../domain'

const pf = () => pourTestsDemo.plantingsFull()

describe('plantations de démonstration', () => {
  it('aucune planche n’est en conflit de surface, toutes saisons confondues', () => {
    const parPlanche = new Map<string, any[]>()
    for (const p of pf()) parPlanche.set(p.planche_id, [...(parPlanche.get(p.planche_id) || []), p])
    const conflits = [...parPlanche.values()].flatMap(ps =>
      conflitsOccupation({ surface_m2: Number(ps[0].planche_m2) }, ps).map(c =>
        `${ps[0].garden_name} ${ps[0].planche_name} du ${c.debut} au ${c.fin} : ${c.plantings.map(p => p.culture_name).join(', ')} (${c.surface_occupee}/${c.surface_planche} m²)`))
    expect(conflits).toEqual([])
  })
})

describe('vivaces, anémones et plant acheté de la démo', () => {
  const AUJOURDHUI = '2026-11-22'

  it('anémones seulement sous abri (serre froide), plantées début novembre', () => {
    const anemones = pf().filter(p => p.culture_name === 'Anémone')
    expect(anemones.length).toBeGreaterThan(0)
    for (const a of anemones) {
      expect(a.garden_name).toBe('Serre froide')
      expect(a.date_semis.slice(5, 7)).toBe('11')
    }
  })

  it('des vivaces en place depuis l’an dernier, jamais « anciennes »', () => {
    const vivaces = pf().filter(p => p.cycle === 'vivace' && p.date_plantation < '2026-01-01')
    expect(vivaces.map(p => p.culture_name).sort()).toEqual(['Achillée', 'Ancolie'])
    for (const v of vivaces) {
      expect(v.fin_occupation).toBeNull()
      expect(estAncienne(v as any, AUJOURDHUI)).toBe(false)
    }
  })

  it('les vivaces fleurissent dans leur fenêtre, pas « 335 jours plus tard »', () => {
    const r = (n: string) => pf().find(p => p.culture_name === n)!
    expect(r('Achillée').date_recolte).toBe('2026-06-15')
    expect(r('Ancolie').date_recolte).toBe('2026-05-15')
  })

  it('un plant acheté : planté à la date saisie, aucune graine', () => {
    const achats = pf().filter(p => p.achat_plant)
    expect(achats).toHaveLength(1)
    expect(achats[0].date_plantation).toBe(achats[0].date_semis)
    expect(achats[0].jours_cellule).toBe(0)
  })

  it('le catalogue respecte les contraintes de la migration 013', () => {
    const erreurs = pourTestsDemo.catalogue().map(c => [c.name, pourTestsDemo.contraintes013('culture_catalog', c)?.message]).filter(x => x[1])
    expect(erreurs).toEqual([])
  })

  it('aucune plantation de saison n’a disparu des jointures (jardin, planche, saison)', () => {
    expect(pf().length).toBeGreaterThan(40)
  })
})
