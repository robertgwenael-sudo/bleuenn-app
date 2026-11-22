// Rejoue des lignes RÉELLES de l'onglet « Plan de culture année 2 » du
// tableur de Marine (lu le 22/11/2026) : mêmes entrées, mêmes résultats
// affichés. Les espacements 22,86 et 2,54 sont les valeurs exactes des
// cellules affichées « 23 » et « 3 » (9 pouces et 1 pouce).
import { describe, expect, it } from 'vitest'
import {
  besoinsGraines, calculerProduction, controlerSemis, ligneSemis, propositionsTexte, semainesDeRecolte, texteRepartition, calendrierCulture, capacitePepiniere, chargePepiniere, lignesQuoiSemer,
  messageManquant, occupationsCellule, parJardin, plaquesParTable, reglagesPepiniere, tauxDeLaFerme, textePlacement,
  totaliser, type Calcul, type DonneesProduction, type Montant, type Production, type Repartition,
} from './production'
import type { PlantingProduction } from './types'
import { repartitionPrevue } from './reel'
import { plantation } from './fixtures.test-utils'

const v = (c: Calcul) => (c.etat === 'ok' ? c.valeur : c.etat === 'manquant' ? messageManquant(c.champs) : c.raison)
/** Euros affichés par le tableur (format « 0 € »). */
const e = (m: Montant) => (m.etat === 'ok' ? Math.round(m.centimes / 100) : messageManquant(m.champs))

type L = [nom: string, E: number | null, F: number | null, G: number | null, H: number | null, I: number | null, prix: number | null, W: number | null]
const d = ([, E, F, G, H, I, prix, W]: L): DonneesProduction => ({
  surface_m2: E, graines_par_plant: F, rangs_par_planche: G, espacement_cm: H, rendement: I, prix_tige: prix, jours_recolte: W,
})
/** Moyenne par semaine arrondie, comme la cellule du tableur (P en tiges, S en euros). */
const moy = (r: Repartition, div = 1) => (r.etat === 'ok' ? Math.round(r.moyenne / div) : messageManquant(r.champs))
/** J, K, L, N, O, P, R €, S € tels qu'affichés par le tableur. */
const ligne = (p: Production) => [v(p.plants), v(p.plantsAvecPertes), v(p.graines), v(p.tiges), v(p.tigesNettes), moy(p.tigesParSemaine), e(p.revenu), moy(p.caParSemaine, 100)]
/** Ce qu'affiche l'appli : « 175 » ou « 31 à 32 ». */
const plage = (r: Repartition) => texteRepartition(r)

describe('bloc « Gestion de la production et du rendement » : lignes réelles du plan année 2', () => {
  const CAS: [L, (number | string)[]][] = [
    [['helenium', 10, 1, 5, 20, 3, 0.3, 21], [250, 325, 325, 750, 525, 175, 158, 53]],
    [['Muflier', 10, 2, 5, 20, 1, 1, 21], [250, 325, 650, 250, 175, 58, 175, 58]],
    [['Nigelle', 10, 2, 5, 20, 1, 0.75, 21], [250, 325, 650, 250, 175, 58, 131, 44]],
    [['Nielle', 5, 2, 5, 20, 4, 0.6, 21], [125, 163, 325, 500, 350, 117, 210, 70]],
    [['Ammi', 5, 2, 3, 30, 3, 0.5, 21], [50, 65, 130, 150, 105, 35, 53, 18]],
    [['Didiscus', 5, 2, 5, 20, 5, 0.85, 21], [125, 163, 325, 625, 438, 146, 372, 124]],
    [['Pavot d’Islande', 5, 2, 5, 20, 6, 0.85, 21], [125, 163, 325, 750, 525, 175, 446, 149]],
    // Règle Marine (arrondi au supérieur) : 75 j = 11 semaines, le tableur en comptait 10 (35 tiges, 42 €)
    [['Dahlia', 20, 1, 2, 40, 5, 1.2, 75], [100, 130, 130, 500, 350, 32, 420, 38]],
    [['Anémone', 20, 1, 5, 20, 3, 0.8, 56], [500, 650, 650, 1500, 1050, 131, 840, 105]],
    [['Statice', 20, 1, 5, 20, 3, 0.5, 21], [500, 650, 650, 1500, 1050, 350, 525, 175]],
    [['Cresson', 5, 1, 45, 2.54, 1, 0.6, 21], [8858, 11516, 11516, 8858, 6201, 2067, 3720, 1240]],
    [['Tulipe', 20, 1, 11, 10, 1, 0.5, 56], [2200, 2860, 2860, 2200, 1540, 193, 770, 96]],
    [['Zinnia', 10, 3, 5, 20, 6, 0.7, 21], [250, 325, 975, 1500, 1050, 350, 735, 245]],
    [['Aster de Chine', 20, 3, 5, 20, 1, 0.5, 21], [500, 650, 1950, 500, 350, 117, 175, 58]],
    [['Cosmos', 10, 2, 3, 30, 4, 0.7, 21], [100, 130, 260, 400, 280, 93, 196, 65]],
    [['Ancolie', 10, 2, 5, 22.86, 3, 0.85, 21], [219, 284, 569, 656, 459, 153, 390, 130]],
  ]
  for (const [l, attendu] of CAS) {
    it(`${l[0]} ${l[1]} m²`, () => expect(ligne(calculerProduction(d(l)))).toEqual(attendu))
  }

  it('revenu au centime près : Ammi 105 tiges × 0,50 € = 52,50 € (le tableur affiche 53 €)', () => {
    expect(calculerProduction(d(['Ammi', 5, 2, 3, 30, 3, 0.5, 21])).revenu).toEqual({ etat: 'ok', centimes: 5250 })
  })

  it('Digitale : 109 / 142 / 284 / 77 tiges, 211 € ; 26 tiges par semaine en moyenne (le tableur affiche 77, cellule P isolée)', () => {
    const p = calculerProduction(d(['Digitale', 5, 2, 5, 22.86, 1, 2.75, 21]))
    expect(ligne(p)).toEqual([109, 142, 284, 109, 77, 26, 211, 70])
    expect(plage(p.tigesParSemaine)).toBe('25 à 26')
  })

  it('règle Marine : semaines de récolte arrondies au supérieur, au moins 1', () => {
    expect([semainesDeRecolte(75), semainesDeRecolte(21), semainesDeRecolte(56), semainesDeRecolte(3), semainesDeRecolte(22)]).toEqual([11, 3, 8, 1, 4])
  })

  it('tiges et CA par semaine : répartition entière dont la somme vaut EXACTEMENT O et R', () => {
    for (const [l] of CAS) {
      const p = calculerProduction(d(l))
      const o = p.tigesNettes, r = p.revenu, ts = p.tigesParSemaine, cs = p.caParSemaine
      if (o.etat !== 'ok' || r.etat !== 'ok' || ts.etat !== 'ok' || cs.etat !== 'ok') throw new Error(l[0])
      expect(ts.parts.reduce((a, b) => a + b, 0), l[0]).toBe(o.valeur)
      expect(cs.parts.reduce((a, b) => a + b, 0), l[0]).toBe(r.centimes)
      expect(ts.max - ts.min).toBeLessThanOrEqual(1)
    }
    const dahlia = calculerProduction(d(['Dahlia', 20, 1, 2, 40, 5, 1.2, 75]))
    expect(plage(dahlia.tigesParSemaine)).toBe('31 à 32')
    expect(dahlia.tigesParSemaine.etat === 'ok' && dahlia.tigesParSemaine.parts).toEqual([32, 32, 32, 32, 32, 32, 32, 32, 32, 31, 31])
    expect(dahlia.caParSemaine).toMatchObject({ total: 42000, min: 3818, max: 3819 })
    expect(plage(calculerProduction(d(['Statice', 20, 1, 5, 20, 3, 0.5, 21])).tigesParSemaine)).toBe('350')
  })

  it('véronique sans prix ni jours de récolte : donnée manquante, jamais #DIV/0! ni 0 €', () => {
    const p = calculerProduction(d(['véronique', 10, 1, 4, 30, 2, null, null]))
    expect(ligne(p)).toEqual([133, 173, 173, 267, 187,
      'donnée manquante : jours de récolte', 'donnée manquante : prix par tige', 'donnée manquante : prix par tige, jours de récolte'])
    expect(p.manquants.sort()).toEqual(['jours_recolte', 'prix'])
  })

  it('CHIA sans rendement : plants et graines calculés, tiges « donnée manquante » (le tableur affiche 0)', () => {
    const p = calculerProduction(d(['CHIA', 5, 1, 5, 20, null, null, null]))
    expect(ligne(p).slice(0, 4)).toEqual([125, 163, 163, 'donnée manquante : rendement par plant'])
  })

  it('Croix de Malte sans graines par motte : graines « donnée manquante » (le tableur affiche 0)', () => {
    const p = calculerProduction(d(['Croix de Malte', 10, null, 5, 20, 3, null, null]))
    expect(ligne(p).slice(0, 5)).toEqual([250, 325, 'donnée manquante : graines par motte', 750, 525])
  })

  it('Valériane sans espacement : toute la ligne est « donnée manquante : espacement »', () => {
    const p = calculerProduction(d(['Valériane', 10, 1, 4, null, 3, null, null]))
    expect(v(p.plants)).toBe('donnée manquante : espacement (cm)')
    expect(v(p.graines)).toBe('donnée manquante : espacement (cm)')
    expect(v(p.tiges)).toBe('donnée manquante : espacement (cm)')
  })

  it('0 et chaînes vides valent « manquant » ; numeric PostgREST en chaîne accepté', () => {
    expect(v(calculerProduction({ ...d(['x', 10, 1, 5, 20, 3, 0.5, 21]), espacement_cm: 0 }).plants)).toBe('donnée manquante : espacement (cm)')
    expect(v(calculerProduction({ ...d(['x', 10, 1, 5, 20, 3, 0.5, 21]), espacement_cm: '20', prix_tige: '0.50' }).plants)).toBe(250)
  })

  it('plant acheté : pas de graines, les plants + pertes restent à acheter', () => {
    const p = calculerProduction({ ...d(['Dahlia', 20, 1, 2, 40, 5, 1.2, 75]), achat_plant: true })
    expect(p.graines).toEqual({ etat: 'sans_objet', raison: 'plant acheté' })
    expect(v(p.plantsAvecPertes)).toBe(130)
    expect(p.manquants).toEqual([])
  })

  it('taux de pertes réglables (défaut 30 %), refus d’un taux absurde', () => {
    const p = calculerProduction(d(['Statice', 20, 1, 5, 20, 3, 0.5, 21]), { semis: 20, champ: 10 })
    expect([v(p.plantsAvecPertes), v(p.tigesNettes)]).toEqual([600, 1350])
    expect(tauxDeLaFerme(null)).toEqual({ semis: 30, champ: 30 })
    expect(tauxDeLaFerme({ taux_perte_semis: '25.00', taux_perte_champ: 40 })).toEqual({ semis: 25, champ: 40 })
    expect(() => calculerProduction(d(['x', 1, 1, 1, 1, 1, 1, 1]), { semis: 100, champ: 30 })).toThrow(/Taux/)
  })
})

describe('totaux d’un jardin : JARDIN A du plan année 2', () => {
  // [culture, m², graines/motte, rangs, espacement, rendement, prix, jours de récolte]
  const A: L[] = [
    ['helenium', 10, 1, 5, 20, 3, 0.3, 21], ['veronique', 10, 1, 4, 30, 2, null, null],
    ['Muflier', 10, 2, 5, 20, 1, 1, 21], ['Nigelle', 10, 2, 5, 20, 1, 0.75, 21],
    ['Nielle', 5, 2, 5, 20, 4, 0.6, 21], ['Ammi', 5, 2, 3, 30, 3, 0.5, 21],
    ['Didiscus', 5, 2, 5, 20, 5, 0.85, 21], ['Delphinium', 5, 2, 5, 20, 1, 1, 21],
    ['Calendule', 5, 2, 5, 20, 3, 0.8, 21], ['Matricaire', 5, 2, 5, 20, 3, 0.8, 21],
    ['Centaurée', 5, 2, 5, 20, 3, 0.4, 21], ['Orlaya', 5, 2, 5, 20, 3, 0.7, 21],
    ['Godetie', 5, 1, 5, 20, 1, 0.5, 21], ['Pavot', 5, 2, 5, 20, 6, 0.85, 21],
    ['Digitale', 5, 2, 5, 22.86, 1, 2.75, 21],
    ...Array.from({ length: 4 }, (): L => ['Dahlia', 20, 1, 2, 40, 5, 1.2, 75]),
    ...Array.from({ length: 4 }, (): L => ['Anemone', 20, 1, 5, 20, 3, 0.8, 56]),
  ]
  // Le tableur affiche 175 m² : la somme des lignes « 1 » seulement (les anémones
  // « 2 » de novembre reprennent les mêmes planches). Ici, m² cultivés cumulés : 255.
  it('255 m² cultivés, plants 4 568, + 30 % 5 938, graines 8 095, tiges 13 401, nettes 9 381, revenu 7 635 €', () => {
    const t = totaliser(A.map(l => ({ production: calculerProduction(d(l)), planting: { surface_m2: l[1] ?? 0 } })))
    expect(t).toMatchObject({ surface_m2: 255, plants: 4568, plantsAvecPertes: 5938, graines: 8095, tiges: 13401, tigesNettes: 9381, incompletes: 1, lignes: 23 })
    expect(Math.round(t.revenuCentimes / 100)).toBe(7635)
  })
})

describe('calendrier (colonnes AA à AF)', () => {
  it('helenium : entrée 24 mars, plantation 18 avril, récolte 17 juin, fin 8 juillet, semaines 13 et 16', () => {
    const c = calendrierCulture({ date_entree: '2026-03-24', jours_cellule: 25, jours_champ: 60, jours_recolte: 21 })
    expect(c).toMatchObject({ plantation: '2026-04-18', recolte: '2026-06-17', fin: '2026-07-08' })
    expect([c.semaineEntree.semaine, c.semaineSortie.semaine]).toEqual([13, 16])
  })
  it('anémone plantée le 1er novembre : récolte 1er mars, fin 26 avril, semaine 44', () => {
    const c = calendrierCulture({ date_entree: '2026-11-01', jours_cellule: 0, jours_champ: 120, jours_recolte: 56 })
    expect(c).toMatchObject({ plantation: '2026-11-01', recolte: '2027-03-01', fin: '2027-04-26' })
    expect(c.semaineEntree.semaine).toBe(44)
  })
  it('plant acheté : plantation = date saisie, même avec des jours en cellule au catalogue', () => {
    const c = calendrierCulture({ date_entree: '2026-04-15', jours_cellule: 30, jours_champ: 90, jours_recolte: 75, achat_plant: true })
    expect(c).toMatchObject({ plantation: '2026-04-15', recolte: '2026-07-14', fin: '2026-09-27' })
  })
})

const P = (o: Partial<PlantingProduction>): PlantingProduction => ({
  id: 'p', culture_id: 'c', culture_name: 'Statice', season_id: 's', surface_m2: 20, date_semis: '2026-03-15',
  jours_cellule: 30, jours_champ: 80, jours_recolte: 21, rendement: 3, prix_tige: 0.5,
  espacement_cm: 20, rangs_par_planche: 5, graines_par_plant: 1, semis_direct: false,
  garden_id: 'gB', garden_name: 'JARDIN B', planche_id: 'pl8', planche_name: 'PL 8', achat_plant: false, ...o,
})

describe('« Quoi semer » : période, jardins, graines à commander', () => {
  const plantings = [
    P({ id: '1' }),
    P({ id: '2', planche_id: 'pl9', planche_name: 'PL 9' }),
    P({ id: '3', culture_id: 'd', culture_name: 'Dahlia', garden_id: 'gA', garden_name: 'JARDIN A', date_semis: '2026-04-15',
      jours_cellule: 0, jours_champ: 90, jours_recolte: 75, rangs_par_planche: 2, espacement_cm: 40, rendement: 5, prix_tige: 1.2, achat_plant: true }),
    P({ id: '4', season_id: 'autre', date_semis: '2027-09-01' }),
  ]
  it('12 mois glissants : cycles qui touchent la fenêtre ; saison : filtre simple', () => {
    expect(lignesQuoiSemer(plantings, { type: 'glissant', aujourdhui: '2026-07-01' }).map(l => l.planting.id)).toEqual(['3', '1', '2'])
    expect(lignesQuoiSemer(plantings, { type: 'glissant', aujourdhui: '2026-10-01' }).map(l => l.planting.id)).toEqual(['4'])
    expect(lignesQuoiSemer(plantings, { type: 'saison', season_id: 'autre' })).toHaveLength(1)
  })
  it('totaux par jardin et général', () => {
    const { jardins, total } = parJardin(lignesQuoiSemer(plantings, { type: 'saison', season_id: 's' }))
    expect(jardins.map(j => [j.garden_name, j.totaux.plants, j.totaux.revenuCentimes])).toEqual([['JARDIN A', 100, 42000], ['JARDIN B', 1000, 105000]])
    expect(total).toMatchObject({ plants: 1100, plantsAvecPertes: 1430, graines: 1300, revenuCentimes: 147000 })
  })
  it('graines par culture face aux commandes ; plant acheté compté en plants', () => {
    const b = besoinsGraines(lignesQuoiSemer(plantings, { type: 'saison', season_id: 's' }), new Map([['c', 1000]]))
    expect(b).toEqual([
      expect.objectContaining({ culture_name: 'Dahlia', graines: 0, plantsAAcheter: 130, commandees: null, reste: null }),
      expect.objectContaining({ culture_name: 'Statice', graines: 1300, commandees: 1000, reste: 300 }),
    ])
  })
})

describe('pépinière : capacité des tables de semis', () => {
  const table = { largeur_cm: 196, longueur_cm: 297, nombre: 2 }
  const plaque = { largeur_cm: 51.5, longueur_cm: 33.5, trous: 104 }

  it('sans débord : 3 × 8 = 24 ou tournée 5 × 5 = 25, donc 25 plaques et 2 600 trous par table', () => {
    const pl = plaquesParTable(table, plaque)
    expect(pl).toMatchObject({ plaques: 25, colonnes: 5, rangees: 5, tournee: true })
    const c = capacitePepiniere([table], plaque)
    expect([c.plaques, c.trous]).toEqual([50, 5200])
  })
  it('débord 10 cm : 4 × 9 = 36 (tournée 6 × 5 = 30), donc 36 plaques et 3 744 trous par table', () => {
    const pl = plaquesParTable({ ...table, debord_cm: 10 }, plaque)
    expect(pl).toMatchObject({ plaques: 36, colonnes: 4, rangees: 9, tournee: false })
    expect(textePlacement(pl)).toBe('4 × 9 plaques, débord 10 cm')
    expect(capacitePepiniere([{ ...table, debord_cm: 10 }], plaque).trous).toBe(7488)
  })
  it('chiffre du tableur (ratio de surfaces) donné pour information : 33,74 plaques, 7 018 trous pour 2 tables', () => {
    expect(capacitePepiniere([table], plaque).tableur).toEqual({ plaquesParTable: 33.74, trous: 7018 })
  })
  it('réglages absents : « incomplet », rien n’est supposé', () => {
    expect(reglagesPepiniere(null)).toMatchObject({ etat: 'incomplet', plaque: null })
    expect(reglagesPepiniere({ plaque_largeur_cm: 51.5, plaque_longueur_cm: 33.5, plaque_trous: 104 }))
      .toMatchObject({ etat: 'incomplet', plaque: { trous: 104 }, manquants: ['largeur des tables', 'longueur des tables', 'nombre de tables'] })
    const r = reglagesPepiniere({ table_semis_largeur_cm: '196', table_semis_longueur_cm: 297, table_semis_nombre: 2, table_semis_debord_cm: 10,
      plaque_largeur_cm: '51.5', plaque_longueur_cm: 33.5, plaque_trous: 104 })
    expect(r).toMatchObject({ etat: 'ok', tables: [{ largeur_cm: 196, debord_cm: 10, nombre: 2 }] })
  })
})

describe('pépinière : charge semaine par semaine', () => {
  const plantings = [
    // 650 mottes = 7 plaques, en cellule du 15 mars au 13 avril
    P({ id: 'st', culture_name: 'Statice' }),
    // 325 mottes = 4 plaques, du 30 mars au 23 avril
    P({ id: 'zi', culture_name: 'Zinnia', surface_m2: 10, date_semis: '2026-03-30', jours_cellule: 25 }),
    // n'occupent rien : plant acheté, semis direct (0 jour en cellule)
    P({ id: 'da', culture_name: 'Dahlia', achat_plant: true, date_semis: '2026-03-20' }),
    P({ id: 'to', culture_name: 'Tournesol', semis_direct: true, jours_cellule: 0, date_semis: '2026-03-20' }),
    P({ id: 'ni', culture_name: 'Nigelle', jours_cellule: 0, date_semis: '2026-03-20' }),
    // semis direct POSSIBLE au catalogue, mais 30 j en cellule au plan : occupe
    P({ id: 'bl', culture_name: 'Bleuet', semis_direct: true, surface_m2: 1, date_semis: '2027-01-04' }),
  ]
  const lignes = lignesQuoiSemer(plantings, { type: 'tout' })
  const { occupations } = occupationsCellule(lignes, 104)

  it('seuls les semis en cellule occupent la pépinière, en plaques entières', () => {
    expect(occupations.map(o => [o.culture_name, o.debut, o.fin, o.mottes, o.plaques])).toEqual([
      ['Statice', '2026-03-15', '2026-04-13', 650, 7],
      ['Zinnia', '2026-03-30', '2026-04-23', 325, 4],
      ['Bleuet', '2027-01-04', '2027-02-02', 33, 1],
    ])
  })
  it('dépassement signalé avec les cultures responsables, sans bloquer', () => {
    const s = chargePepiniere(occupations, { plaques: 10 })
    const avril = s.find(x => x.lundi === '2026-03-30')!
    expect([avril.plaques, avril.mottes, avril.depassement]).toEqual([11, 975, true])
    expect(avril.cultures.map(c => c.culture_name)).toEqual(['Statice', 'Zinnia'])
    expect(s.find(x => x.lundi === '2026-04-20')).toMatchObject({ plaques: 4, depassement: false })
    expect(s[0].lundi).toBe('2026-03-09')
  })
  it('capacité non renseignée : charge affichée, aucun dépassement déclaré', () => {
    expect(chargePepiniere(occupations, null).every(x => !x.depassement && x.capacitePlaques === null)).toBe(true)
  })
  it('format de plaque inconnu : charge en mottes', () => {
    const o = occupationsCellule(lignes, null).occupations
    expect(chargePepiniere(o, { plaques: 10 }).find(x => x.lundi === '2026-03-30')).toMatchObject({ plaques: null, mottes: 975, depassement: false })
  })
})

describe('cohérence avec reel.ts : le prévu réparti par lundi ne dépasse jamais les tiges nettes', () => {
  it('dahlia RR, 75 j de récolte : somme des semaines = tiges estimées', () => {
    const p = plantation({ id: 'd', culture_type: 'RR', date_recolte: '2026-07-14', date_fin: '2026-09-27', tiges_estimees: 350 })
    const r = repartitionPrevue(p)
    expect(r.reduce((s, x) => s + x.tiges, 0)).toBe(350)
    // reel.ts répartit par semaines CIVILES touchées (S29 à S39 : 11), règle compatible : somme exacte
    expect(r).toHaveLength(11)
  })
})

describe('contrôle d’un semis face aux tables : alerte et propositions, jamais un refus', () => {
  // Capacité 10 plaques de 104 trous. Statice 20 m² = 650 mottes = 7 plaques, du 15/03 au 13/04.
  const statice = P({ id: 'st', culture_name: 'Statice' })
  const occ = occupationsCellule([ligneSemis(statice)], 104).occupations
  const cap = { plaques: 10 }
  const zinnia = (o: Partial<PlantingProduction> = {}) => ligneSemis(P({ id: 'zi', culture_id: 'z', culture_name: 'Zinnia', surface_m2: 10, date_semis: '2026-03-30', jours_cellule: 25, ...o }))

  it('qui tient : ok, avec le nombre de plaques', () => {
    expect(controlerSemis({ ligne: zinnia({ surface_m2: 5 }), autres: occ, capacite: cap, trousParPlaque: 104, semisDirectPossible: false }))
      .toEqual({ etat: 'ok', plaques: 2 })
  })

  it('qui dépasse : jours en cause, plaques manquantes, date la plus proche, surface max, alternatives', () => {
    // Zinnia 10 m² = 325 mottes = 4 plaques ; 7 + 4 = 11 > 10 du 30/03 au 13/04
    const c = controlerSemis({ ligne: zinnia(), autres: occ, capacite: cap, trousParPlaque: 104, semisDirectPossible: true })
    if (c.etat !== 'depassement') throw new Error(c.etat)
    expect(c.jours[0]).toEqual({ jour: '2026-03-30', plaques: 11, capacite: 10, manquantes: 1, cultures: ['Statice', 'Zinnia'] })
    expect(c.jours.at(-1)!.jour).toBe('2026-04-13')
    expect(c.maxManquantes).toBe(1)
    // (a) 25 jours en cellule : plus tôt il faudrait finir avant le 15/03 (entrée le 18/02, 40 j plus tôt) ;
    // plus tard, entrer le 14/04 (15 j plus tard) : le plus proche gagne.
    expect([c.dateProposee, c.decalageJours]).toEqual(['2026-04-14', 15])
    // (b) 3 plaques libres = 312 mottes ; 32,5 mottes par m² → 9,6 m²
    expect(c.surfaceMax).toBe(9.6)
    expect(c.alternatives).toEqual(['plant_achete', 'semis_direct'])
    expect(propositionsTexte(c)).toEqual([
      'entrer en cellule le 2026-04-14 (15 jours plus tard)', 'réduire à 9,6 m² à cette date', 'passer en plant acheté ou en semis direct',
    ])
  })

  it('un semis modifié ne se compte pas deux fois', () => {
    const occ2 = occupationsCellule([ligneSemis(statice), zinnia()], 104).occupations
    expect(controlerSemis({ ligne: zinnia({ surface_m2: 5 }), autres: occ2, capacite: cap, trousParPlaque: 104, semisDirectPossible: false }).etat).toBe('ok')
  })

  it('sans capacité, plant acheté ou semis direct : aucune limite', () => {
    expect(controlerSemis({ ligne: zinnia(), autres: occ, capacite: null, trousParPlaque: 104, semisDirectPossible: false }).etat).toBe('sans_capacite')
    expect(controlerSemis({ ligne: zinnia({ achat_plant: true }), autres: occ, capacite: cap, trousParPlaque: 104, semisDirectPossible: false }))
      .toEqual({ etat: 'hors_cellule', raison: 'plant acheté' })
    expect(controlerSemis({ ligne: zinnia({ semis_direct: true, jours_cellule: 0 }), autres: occ, capacite: cap, trousParPlaque: 104 }))
      .toEqual({ etat: 'hors_cellule', raison: 'semis direct' })
  })

  it('plaques manquantes dans la charge par semaine', () => {
    const o = occupationsCellule([ligneSemis(statice), zinnia()], 104).occupations
    expect(chargePepiniere(o, cap).find(x => x.lundi === '2026-03-30')).toMatchObject({ depassement: true, plaquesManquantes: 1 })
  })
})
