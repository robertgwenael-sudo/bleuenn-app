import { describe, expect, it } from 'vitest'
import { genererCsv } from './exports'
import {
  centiemes, cheminPhoto, controleDelaiRecolte, dimensionsReduites, exportRegistre, formatDecimalFr, frisePlanche,
  lireDecimal, m2EnHa, retoursDeCulture, traitementsDeLaPeriode, validerTraitement, versCanonique,
  type SaisieTraitement,
} from './journal'
import type { Treatment } from './types'

describe('décimaux sans flottant', () => {
  it('lit les saisies françaises et anglaises', () => {
    expect(lireDecimal('1,5')).toBe('1.5')
    expect(lireDecimal(' 0.0009 ')).toBe('0.0009')
    expect(lireDecimal('012,50')).toBe('12.5')
    expect(lireDecimal('1 000')).toBe('1000')
    expect(lireDecimal(',5')).toBe('0.5')
    expect(lireDecimal('-3,5', 1)).toBe('-3.5')
    expect(lireDecimal('-0')).toBe('0')
    expect(lireDecimal('0,000')).toBe('0')
  })
  it('refuse l’illisible et l’excès de décimales', () => {
    for (const s of ['', ',', 'abc', '1,2,3', '1e3', '1.5 L', '--1']) expect(lireDecimal(s)).toBeNull()
    expect(lireDecimal('0,00001')).toBeNull()
    expect(lireDecimal('1,234', 2)).toBeNull()
    expect(lireDecimal('1,230', 2)).toBe('1.23')
  })
  it('relit les valeurs numeric de PostgREST', () => {
    expect(versCanonique(0.1)).toBe('0.1')
    expect(versCanonique('1.5000')).toBe('1.5')
    expect(versCanonique(12)).toBe('12')
    expect(() => versCanonique(1e-7)).toThrow(/format décimal/)
    expect(() => versCanonique(Number.NaN)).toThrow()
    expect(formatDecimalFr('0.0009')).toBe('0,0009')
    expect(centiemes('18.5')).toBe(1850)
    expect(centiemes(-2)).toBe(-200)
    expect(() => centiemes('1.234')).toThrow(/deux décimales/)
  })
  it('convertit les m² en ha exactement', () => {
    expect(m2EnHa(6)).toBe('0.0006')
    expect(m2EnHa('12.5')).toBe('0.00125')
    expect(m2EnHa(10000)).toBe('1')
    expect(m2EnHa('25000.5')).toBe('2.50005')
    expect(m2EnHa('0.01')).toBe('0.000001')
    expect(m2EnHa(150000)).toBe('15')
  })
})

describe('délai avant récolte (saisi)', () => {
  it('non renseigné sans délai ou sans date de récolte', () => {
    expect(controleDelaiRecolte('2026-06-14', null, '2026-06-18')).toEqual({ etat: 'non_renseigne', dateMin: null })
    expect(controleDelaiRecolte('2026-06-14', 3, null)).toEqual({ etat: 'non_renseigne', dateMin: '2026-06-17' })
  })
  it('respecté ou non', () => {
    expect(controleDelaiRecolte('2026-06-14', 3, '2026-06-17')).toEqual({ etat: 'respecte', dateMin: '2026-06-17', margeJours: 0 })
    expect(controleDelaiRecolte('2026-06-28', 7, '2026-07-02')).toEqual({ etat: 'non_respecte', dateMin: '2026-07-05', manqueJours: 3 })
    expect(controleDelaiRecolte('2026-12-30', 5, '2027-01-04')).toMatchObject({ etat: 'respecte' })
  })
  it('lève sur une saisie incohérente', () => {
    expect(() => controleDelaiRecolte('2026-02-30', 3, null)).toThrow()
    expect(() => controleDelaiRecolte('2026-06-14', -1, null)).toThrow()
    expect(() => controleDelaiRecolte('2026-06-14', 1.5, null)).toThrow()
  })
})

const saisie = (x: Partial<SaisieTraitement> = {}): SaisieTraitement => ({
  date: '2026-06-14', produit: 'Produit fictif 50 WG', produit_type: 'fongicide', amm: '9999999', sans_amm: false,
  dose: '1,5', dose_unite: 'kg/ha', quantite_totale: '0,0009', quantite_unite: 'kg', surface_m2: '6',
  culture_id: 'c1', culture_libelle: '', cible: 'Oïdium', cible_type: 'maladie',
  lieu_type: 'planche', garden_id: null, planche_id: 'p1', lieu_libelle: '', ilot_pac: '',
  date_recolte_suivante: '2026-06-18', delai_avant_recolte_j: '3', operateur_id: 'u1', operateur_nom: '',
  vent: 'faible', temperature_c: '18,5', notes: '', ...x,
})

describe('validerTraitement', () => {
  it('accepte une saisie complète et normalise les nombres', () => {
    const r = validerTraitement(saisie(), '2026-11-22')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur).toMatchObject({ dose: '1.5', quantite_totale: '0.0009', surface_m2: '6', temperature_c: '18.5',
      delai_avant_recolte_j: 3, planche_id: 'p1', garden_id: null, amm: '9999999', operateur_nom: null, ilot_pac: null })
    expect(r.avertissements).toEqual([])
  })
  it('signale chaque champ manquant, sans valeur par défaut', () => {
    const r = validerTraitement(saisie({
      produit: ' ', produit_type: '', amm: '', dose: '0', dose_unite: '', quantite_totale: 'x', quantite_unite: '',
      surface_m2: '1,234', culture_id: null, cible: '', cible_type: '', planche_id: null, operateur_id: null,
      delai_avant_recolte_j: '2,5', temperature_c: '80',
    }), '2026-11-22')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.erreurs).sort()).toEqual([
      'amm', 'cible', 'cible_type', 'culture_libelle', 'delai_avant_recolte_j', 'dose', 'dose_unite', 'operateur_nom',
      'planche_id', 'produit', 'produit_type', 'quantite_totale', 'quantite_unite', 'surface_m2', 'temperature_c',
    ])
  })
  it('refuse une date future et une récolte avant le traitement', () => {
    const r = validerTraitement(saisie({ date: '2026-12-01', date_recolte_suivante: '2026-06-01' }), '2026-11-22')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreurs.date).toMatch(/futur/)
    const r2 = validerTraitement(saisie({ date_recolte_suivante: '2026-06-01' }), '2026-11-22')
    if (!r2.ok) expect(r2.erreurs.date_recolte_suivante).toMatch(/précède/)
  })
  it('lieu libre : tunnel nommé, culture et opérateur en texte', () => {
    const r = validerTraitement(saisie({ lieu_type: 'tunnel', planche_id: 'p1', lieu_libelle: 'Tunnel nord', culture_id: null,
      culture_libelle: 'Renoncule', operateur_id: null, operateur_nom: 'Prestataire Dupont', sans_amm: true, amm: '', produit_type: 'biocontrole' }), '2026-11-22')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur).toMatchObject({ planche_id: null, lieu_libelle: 'Tunnel nord', amm: null, operateur_nom: 'Prestataire Dupont' })
    expect(r.avertissements).toEqual([])
    const r2 = validerTraitement(saisie({ lieu_type: 'serre', planche_id: null, lieu_libelle: '' }), '2026-11-22')
    expect(r2.ok).toBe(false)
  })
  it('avertit sans bloquer : délai avant récolte non respecté, AMM absente', () => {
    const r = validerTraitement(saisie({ date_recolte_suivante: '2026-06-15', sans_amm: true, amm: '' }), '2026-11-22')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.avertissements).toHaveLength(2)
  })
})

describe('photos', () => {
  it('réduit le grand côté à 1600 px sans agrandir', () => {
    expect(dimensionsReduites(4032, 3024)).toEqual({ largeur: 1600, hauteur: 1200 })
    expect(dimensionsReduites(3024, 4032)).toEqual({ largeur: 1200, hauteur: 1600 })
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600 })
    expect(dimensionsReduites(10000, 3)).toEqual({ largeur: 1600, hauteur: 1 })
    expect(() => dimensionsReduites(0, 10)).toThrow()
  })
  it('construit un chemin <ferme>/<note>/<fichier> sûr', () => {
    const f = '30000000-0000-4000-8000-000000000001', e = 'e1000000-0000-4000-8000-000000000001'
    expect(cheminPhoto(f, e, 'a.jpg')).toBe(`${f}/${e}/a.jpg`)
    expect(() => cheminPhoto(f, e, '../a.jpg')).toThrow()
    expect(() => cheminPhoto(f, e, 'a/b.jpg')).toThrow()
    expect(() => cheminPhoto('ferme', e, 'a.jpg')).toThrow()
  })
})

describe('rotation', () => {
  const p = (id: string, culture: string, semis: string, plantation: string | null = null) =>
    ({ id, culture_id: culture, culture_name: culture.toUpperCase(), date_semis: semis, date_plantation: plantation })
  it('signale une culture qui revient l’année suivante', () => {
    expect(retoursDeCulture([p('1', 'zinnia', '2026-04-10', '2026-05-10'), p('2', 'zinnia', '2027-04-12', '2027-05-12'), p('3', 'cosmos', '2026-04-03')]))
      .toEqual([{ culture_id: 'zinnia', culture_name: 'ZINNIA', annees: [2026, 2027] }])
  })
  it('année de mise en place, pas de semis : un semis de décembre planté en janvier compte l’année suivante', () => {
    expect(retoursDeCulture([p('1', 'renoncule', '2026-01-15', '2026-02-20'), p('2', 'renoncule', '2026-12-08', '2027-01-20')]))
      .toEqual([{ culture_id: 'renoncule', culture_name: 'RENONCULE', annees: [2026, 2027] }])
    expect(retoursDeCulture([p('1', 'renoncule', '2026-01-15', '2026-02-20'), p('2', 'renoncule', '2026-09-08', '2026-10-20')])).toEqual([])
  })
  it('regroupe les années consécutives et ignore les écarts', () => {
    expect(retoursDeCulture([p('1', 'dahlia', '2024-04-01'), p('2', 'dahlia', '2025-04-01'), p('3', 'dahlia', '2026-04-01'), p('4', 'dahlia', '2028-04-01')]))
      .toEqual([{ culture_id: 'dahlia', culture_name: 'DAHLIA', annees: [2024, 2025, 2026] }])
    expect(retoursDeCulture([p('1', 'dahlia', '2024-04-01'), p('2', 'dahlia', '2026-04-01')])).toEqual([])
  })
})

describe('frise d’une planche', () => {
  it('mêle plantations, notes et traitements, du plus récent au plus ancien, par année', () => {
    const g = frisePlanche({
      plantations: [{ id: 'p1', culture_id: 'z', culture_name: 'Zinnia', date_semis: '2026-04-10', date_plantation: '2026-05-10' },
        { id: 'p2', culture_id: 'z', culture_name: 'Zinnia', date_semis: '2027-04-10', date_plantation: null }],
      notes: [{ id: 'n1', date: '2026-06-12', kind: 'maladie', body: 'Oïdium' }],
      traitements: [{ id: 't1', date: '2026-06-14', produit: 'P', cible: 'Oïdium', culture_libelle: 'Zinnia' }],
    })
    expect(g.map(x => x.annee)).toEqual([2027, 2026])
    expect(g[1].evenements.map(e => e.id)).toEqual(['t1', 'n1', 'p1'])
  })
})

const t = (x: Partial<Treatment>): Treatment => ({
  id: 't', farm_id: 'f', season_id: null, date: '2026-06-14', produit: 'Produit fictif 50 WG', produit_type: 'fongicide',
  amm: '9999999', dose: 1.5, dose_unite: 'kg/ha', quantite_totale: '0.0009', quantite_unite: 'kg', surface_m2: 6,
  culture_id: null, culture_libelle: 'Zinnia', cible: 'Oïdium', cible_type: 'maladie', lieu_type: 'planche',
  garden_id: null, planche_id: null, planting_id: null, lieu_libelle: 'Jardin du Haut · PL 1', ilot_pac: null,
  date_recolte_suivante: '2026-06-18', delai_avant_recolte_j: 3, operateur_id: null, operateur_nom: 'Nolwenn',
  vent: 'faible', temperature_c: -2.5, notes: '=cmd', created_by: null, created_at: '', updated_at: null, ...x,
})

describe('registre', () => {
  it('filtre la période, bornes comprises, et trie par date', () => {
    const l = [t({ id: 'b', date: '2026-07-01' }), t({ id: 'a', date: '2026-01-01' }), t({ id: 'c', date: '2027-01-01' })]
    expect(traitementsDeLaPeriode(l, '2026-01-01', '2026-12-31').map(x => x.id)).toEqual(['a', 'b'])
    expect(() => traitementsDeLaPeriode(l, '2026-12-31', '2026-01-01')).toThrow()
  })
  it('exporte un CSV Excel : ha exacts, AMM vide si absente, formule neutralisée', () => {
    const csv = genererCsv(exportRegistre([t({}), t({ id: 'u', date: '2026-05-02', amm: null, surface_m2: '30', temperature_c: null, notes: null })], '2026-01-01', '2026-12-31'))
    const lignes = csv.replace(/^﻿/, '').split('\r\n')
    expect(lignes[0].split(';')).toHaveLength(22)
    expect(lignes[0]).toContain('N° AMM')
    expect(lignes[1]).toBe('02/05/2026;Produit fictif 50 WG;Fongicide;;1,5;kg/ha;0,0009;kg;0,003;30;Zinnia;Oïdium;Maladie;Planche;Jardin du Haut · PL 1;;3;18/06/2026;Nolwenn;faible;;')
    expect(lignes[2]).toBe("14/06/2026;Produit fictif 50 WG;Fongicide;9999999;1,5;kg/ha;0,0009;kg;0,0006;6;Zinnia;Oïdium;Maladie;Planche;Jardin du Haut · PL 1;;3;18/06/2026;Nolwenn;faible;-2,5;'=cmd")
    expect(lignes[3]).toBe('')
  })
})
