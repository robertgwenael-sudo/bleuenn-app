import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import {
  RAISONS, caParCulture, depensesParCategorie, depensesParCulture, depensesParMois, formatDuree, lireDuree,
  margesParCulture, montantCout, poidsSurface, repartirSelon, tauxHoraireCentimes, tempsParCulture, tempsParType,
  valoriserMinutes, type CoutCalcul, type MargeCulture, type TempsCalcul,
} from './couts'
import type { VenteCalcul } from './ventes'

// Deux cultures sur deux planches, même saison.
//  Zinnia : 6 m², plantation 01/05 → fin 30/06 = 61 jours  → 600 cm²… (6,00 m² × 61 j)
//  Dahlia : 12 m², plantation 01/05 → fin 29/09 = 152 jours
const zinnia = plantation({
  id: 'pz', culture_id: 'zin', culture_name: 'Zinnia', planche_id: 'pl1', surface_m2: 6,
  date_plantation: '2026-05-01', date_fin: '2026-06-30',
})
const dahlia = plantation({
  id: 'pd', culture_id: 'dah', culture_name: 'Dahlia', planche_id: 'pl2', surface_m2: 12,
  date_plantation: '2026-05-01', date_fin: '2026-09-29',
})

const cout = (c: Partial<CoutCalcul>): CoutCalcul =>
  ({ date: '2026-03-10', category: 'semences', amount: 10, culture_id: null, planche_id: null, ...c })
const temps = (t: Partial<TempsCalcul>): TempsCalcul =>
  ({ date: '2026-06-01', minutes: 60, kind: 'desherbage', culture_id: null, planche_id: null, ...t })
const vente = (lignes: { culture_id: string | null; quantity: number; unit_price: number }[], total = 0): VenteCalcul => ({
  id: 'v', date: '2026-07-01', channel: 'Marché', total, tiges: 0,
  lignes: lignes.map(l => ({ label: 'x', stems_per_unit: 1, ...l })),
})
const ligne = (s: { lignes: MargeCulture[] }, id: string) => s.lignes.find(l => l.culture_id === id)!

describe('montants et durées', () => {
  it('convertit sans flottant : 0,10 + 0,20 = 0,30 €', () => {
    const t = depensesParCategorie([cout({ amount: '0.10' }), cout({ amount: '0.20' })])
    expect(t).toEqual([{ categorie: 'semences', libelle: 'Semences', total: 30, nb: 2 }])
  })

  it('refuse une dépense nulle ou négative, une catégorie inconnue', () => {
    expect(() => montantCout({ amount: 0 })).toThrow()
    expect(() => montantCout({ amount: '-3' })).toThrow()
    expect(() => depensesParCategorie([cout({ category: 'bijoux' as never })])).toThrow(/inconnue/)
  })

  it('totaux par catégorie dans l’ordre fixe, par culture et par mois', () => {
    const cs = [
      cout({ category: 'materiel', amount: 100, date: '2026-04-02' }),
      cout({ category: 'semences', amount: 12.5, culture_id: 'zin', date: '2026-03-01' }),
      cout({ category: 'semences', amount: 7.5, date: '2026-04-20' }),
    ]
    expect(depensesParCategorie(cs).map(c => [c.categorie, c.total])).toEqual([['semences', 2000], ['materiel', 10000]])
    const pc = depensesParCulture(cs)
    expect(pc.get('zin')).toBe(1250)
    expect(pc.get(null)).toBe(10750)
    expect(depensesParMois(cs)).toEqual([{ mois: '2026-03', total: 1250, nb: 1 }, { mois: '2026-04', total: 10750, nb: 2 }])
  })

  it('temps par culture et par type, valorisé seulement avec un taux', () => {
    const ts = [temps({ minutes: 45, culture_id: 'zin' }), temps({ minutes: 30, kind: 'recolte' }), temps({ minutes: 15 })]
    expect(tempsParCulture(ts).get('zin')).toBe(45)
    expect(tempsParCulture(ts).get(null)).toBe(45)
    const sans = tempsParType(ts, null)
    expect(sans.map(x => [x.kind, x.minutes])).toEqual([['desherbage', 60], ['recolte', 30]])
    expect(sans[0].valorise).toEqual({ valeur: null, raison: RAISONS.tauxAbsent })
    expect(tempsParType(ts, '18.00')[0].valorise).toEqual({ valeur: 1800, raison: null })
  })

  it('valorisation : arrondi au centime, zéro minute vaut zéro même sans taux', () => {
    expect(valoriserMinutes(0, null)).toEqual({ valeur: 0, raison: null })
    expect(valoriserMinutes(7, 15)).toEqual({ valeur: 175, raison: null }) // 7/60 × 15 € = 1,75 €
    expect(valoriserMinutes(1, '13.33')).toEqual({ valeur: 22, raison: null }) // 0,2221… → 0,22
    expect(tauxHoraireCentimes('')).toBeNull()
    expect(() => tauxHoraireCentimes(0)).toThrow()
  })

  it('lit une durée saisie au pouce', () => {
    expect(lireDuree('45')).toBe(45)
    expect(lireDuree('45 min')).toBe(45)
    expect(lireDuree('1h30')).toBe(90)
    expect(lireDuree('1 h 05')).toBe(65)
    expect(lireDuree('2h')).toBe(120)
    expect(lireDuree('1,5 h')).toBe(90)
    expect(lireDuree('0')).toBeNull()
    expect(lireDuree('1h75')).toBeNull()
    expect(lireDuree('beaucoup')).toBeNull()
    expect(formatDuree(45)).toBe('45 min')
    expect(formatDuree(65)).toBe('1 h 05')
    expect(formatDuree(120)).toBe('2 h')
  })
})

describe('poids de répartition', () => {
  it('surface × jours d’occupation, en centièmes de m²', () => {
    const p = poidsSurface([zinnia, dahlia, plantation({ id: 'px', culture_id: 'x', date_fin: null as never })])
    expect(p.parCulture.get('zin')).toBe(600 * 61)
    expect(p.parCulture.get('dah')).toBe(1200 * 152)
    expect(p.surfaceParCulture.get('dah')).toBe(1200)
    expect(p.ignorees).toEqual(['px'])
  })

  it('CA par culture ; ventes sans lignes et lignes sans culture à part', () => {
    const r = caParCulture([
      vente([{ culture_id: 'zin', quantity: 10, unit_price: 0.6 }, { culture_id: null, quantity: 1, unit_price: 25 }]),
      { id: 'h', date: '2026-07-02', channel: 'Marché', total: 120, tiges: 100 },
    ])
    expect(r.parCulture.get('zin')).toBe(600)
    expect(r.nonRattache).toBe(2500 + 12000)
  })

  it('répartition exacte au centime, ou null sans poids', () => {
    const parts = repartirSelon(1000, new Map([['a', 1], ['b', 1], ['c', 1]]))!
    expect([...parts.values()].reduce((s, x) => s + x, 0)).toBe(1000)
    expect(repartirSelon(1000, new Map([['a', 0]]))).toBeNull()
    expect(repartirSelon(0, new Map())).toEqual(new Map())
  })
})

describe('marge par culture', () => {
  const ventes = [vente([
    { culture_id: 'zin', quantity: 500, unit_price: 0.6 }, // 300 €
    { culture_id: 'dah', quantity: 400, unit_price: 1.2 }, // 480 €
  ])]
  const couts = [
    cout({ amount: 40, culture_id: 'zin' }),
    cout({ amount: 150, culture_id: 'dah', category: 'plants_bulbes' }),
    cout({ amount: 30, planche_id: 'pl2', category: 'engrais_traitements' }), // planche du dahlia seul
    cout({ amount: 100, category: 'materiel' }), // frais généraux
  ]
  const ts = [
    temps({ minutes: 600, culture_id: 'zin', kind: 'recolte' }),
    temps({ minutes: 1200, culture_id: 'dah', kind: 'recolte' }),
    temps({ minutes: 120, kind: 'administratif' }),
  ]
  const base = { couts, temps: ts, plantings: [zinnia, dahlia], ventes }

  it('clé surface : formule complète, centimes exacts', () => {
    const s = margesParCulture({ ...base, tauxHoraire: 15, options: { cle: 'surface' } })
    // poids : zinnia 36 600, dahlia 182 400 → 100 € répartis 16,71 / 83,29
    const z = ligne(s, 'zin'), d = ligne(s, 'dah')
    expect(z.depenses_reparties.valeur! + d.depenses_reparties.valeur!).toBe(10000)
    expect(z.depenses_reparties.valeur).toBe(1671)
    expect(d.depenses_planche).toBe(3000)
    expect(d.depenses).toEqual({ valeur: 15000 + 3000 + 8329, raison: null })
    // 120 min d'administratif : 20 / 100 min
    expect(z.minutes.valeur! + d.minutes.valeur!).toBe(1920)
    expect(z.minutes).toEqual({ valeur: 620, raison: null })
    expect(z.temps_valorise).toEqual({ valeur: 15500, raison: null }) // 620 min × 15 €/h
    expect(z.marge_hors_temps).toEqual({ valeur: 30000 - 4000 - 1671, raison: null })
    expect(z.marge).toEqual({ valeur: 24329 - 15500, raison: null })
    expect(z.marge_m2).toEqual({ valeur: Math.round(8829 / 6), raison: null })
    // € par heure : 243,29 € / (620/60) h = 23,54 €/h
    expect(z.marge_par_heure).toEqual({ valeur: 2354, raison: null })
    expect(z.ca_par_heure).toEqual({ valeur: 2903, raison: null })
    // Le total de la ferme ne dépend pas de la clé
    expect(s.depenses_total).toBe(32000)
    expect(s.depenses_non_affectees).toBe(10000)
    expect(s.marge_globale_hors_temps).toBe(78000 - 32000)
    expect(s.marge_globale).toEqual({ valeur: 46000 - 48000, raison: null })
    expect(s.repartition_impossible).toBeNull()
  })

  it('clé CA : les frais suivent le chiffre d’affaires', () => {
    const s = margesParCulture({ ...base, tauxHoraire: 15, options: { cle: 'ca' } })
    expect(ligne(s, 'zin').depenses_reparties.valeur).toBe(3846) // 300/780
    expect(ligne(s, 'dah').depenses_reparties.valeur).toBe(6154)
  })

  it('sans taux horaire : marge non calculable, marge hors temps et €/heure calculés', () => {
    const s = margesParCulture({ ...base, tauxHoraire: null, options: { cle: 'surface' } })
    const z = ligne(s, 'zin')
    expect(z.temps_valorise).toEqual({ valeur: null, raison: RAISONS.tauxAbsent })
    expect(z.marge).toEqual({ valeur: null, raison: RAISONS.tauxAbsent })
    expect(z.marge_m2.valeur).toBeNull()
    expect(z.marge_hors_temps.valeur).toBe(24329)
    expect(z.marge_par_heure.valeur).toBe(2354)
    expect(s.marge_globale.valeur).toBeNull()
  })

  it('culture vendue mais sans temps ni surface : grandeurs null avec leur raison, jamais 0', () => {
    const s = margesParCulture({
      ...base, couts: [], temps: [], tauxHoraire: 15, options: { cle: 'surface' },
      ventes: [vente([{ culture_id: 'euc', quantity: 10, unit_price: 1 }])],
      cultures: [{ id: 'euc', name: 'Eucalyptus' }],
    })
    const e = ligne(s, 'euc')
    expect(e.libelle).toBe('Eucalyptus')
    expect(e.marge).toEqual({ valeur: 1000, raison: null })
    expect(e.marge_m2).toEqual({ valeur: null, raison: RAISONS.sansSurface })
    expect(e.ca_par_heure).toEqual({ valeur: null, raison: RAISONS.sansTemps })
  })

  it('répartition impossible : null partout où elle intervient', () => {
    const s = margesParCulture({
      couts: [cout({ amount: 50 })], temps: [], plantings: [zinnia], ventes: [], tauxHoraire: 15,
      options: { cle: 'ca' },
    })
    expect(s.repartition_impossible).toBe(RAISONS.sansPoidsCa)
    expect(ligne(s, 'zin').depenses).toEqual({ valeur: null, raison: RAISONS.sansPoidsCa })
    expect(ligne(s, 'zin').marge.valeur).toBeNull()
    expect(s.marge_globale_hors_temps).toBe(-5000)
  })

  it('dépense sur une planche vide : reversée dans les frais généraux', () => {
    const s = margesParCulture({
      couts: [cout({ amount: 20, planche_id: 'pl-vide' })], temps: [temps({ minutes: 30, planche_id: 'pl1' })],
      plantings: [zinnia, dahlia], ventes: [], tauxHoraire: null, options: { cle: 'surface' },
    })
    expect(s.depenses_planche_reversees).toBe(2000)
    expect(ligne(s, 'zin').depenses_reparties.valeur! + ligne(s, 'dah').depenses_reparties.valeur!).toBe(2000)
    expect(ligne(s, 'zin').minutes_planche).toBe(30)
  })

  it('option : temps non affecté laissé hors des cultures', () => {
    const s = margesParCulture({ ...base, tauxHoraire: 15, options: { cle: 'surface', repartirTempsNonAffecte: false } })
    expect(ligne(s, 'zin').minutes.valeur).toBe(600)
    expect(s.minutes_non_affectees).toBe(120)
    expect(s.minutes_total).toBe(1920)
  })
})
