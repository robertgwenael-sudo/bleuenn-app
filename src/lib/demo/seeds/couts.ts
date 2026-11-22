import { type DemoDb, DEMO_USER_ID, DEMO_TEAMMATE_ID, SEASON_2026 } from '../data'
import { eurosEnCentimes } from '../../domain'
import { recalculerVenteDemo, totalLigneDemo } from './commercial'

type Row = Record<string, any>

// ============================================================
// Données FICTIVES : dépenses et temps passé de la saison 2026, taux
// horaire de la ferme, et détail par culture de quelques ventes
// historiques (pour que la marge par culture ait un CA à comparer).
// ============================================================

/** Taux horaire de démonstration (euros par heure). */
const TAUX_HORAIRE_DEMO = 15

// Planche : [jardin, n° de planche]
type Pl = [string, number] | null

// [date, catégorie, montant €, culture, planche, fournisseur, notes]
const DEPENSES: [string, string, number, string | null, Pl, string | null, string | null][] = [
  ['2026-01-08', 'semences', 48.6, 'Zinnia', null, 'Semences du Léon', 'Benary’s Giant, Queen Lime'],
  ['2026-01-08', 'semences', 32.4, 'Cosmos', null, 'Semences du Léon', 'Purity, Double Click'],
  ['2026-01-08', 'semences', 21.9, 'Bleuet', null, 'Semences du Léon', null],
  ['2026-01-12', 'semences', 64.0, 'Lisianthus', null, 'Graineterie des Monts', 'Graines enrobées'],
  ['2026-01-12', 'semences', 27.5, 'Gueule-de-loup (muflier)', null, 'Graineterie des Monts', null],
  ['2026-01-14', 'plants_bulbes', 186.0, 'Renoncule', null, 'Griffes d’Armor', '250 griffes Elegance'],
  ['2026-01-20', 'plants_bulbes', 312.0, 'Dahlia', null, 'Tubercules Ar Men', 'Café au lait, Labyrinth, Jowey Winnie'],
  ['2026-01-20', 'semences', 18.0, 'Pois de senteur', null, 'Graineterie des Monts', null],
  ['2026-02-03', 'terreau_substrat', 142.8, null, null, 'Coopérative de Landerneau', '6 sacs de terreau de semis'],
  ['2026-02-15', 'materiel', 89.0, null, ['Serre froide', 1], 'Agri-Bretagne', 'Voile P17 pour la serre'],
  ['2026-03-04', 'plants_bulbes', 96.0, 'Chrysanthème d’automne', null, 'Pépinière du Faou', 'Boutures racinées'],
  ['2026-03-18', 'engrais_traitements', 74.5, null, null, 'Coopérative de Landerneau', 'Compost et corne broyée'],
  ['2026-04-02', 'materiel', 168.0, null, null, 'Agri-Bretagne', 'Filet de palissage 2 rouleaux'],
  ['2026-04-10', 'semences', 22.0, 'Tournesol', null, 'Semences du Léon', 'ProCut sans pollen'],
  ['2026-04-22', 'engrais_traitements', 38.0, 'Dahlia', null, 'Coopérative de Landerneau', 'Anti-limaces ferramol'],
  ['2026-05-06', 'materiel', 59.9, null, ['Jardin du Haut', 2], 'Agri-Bretagne', 'Tuteurs pour les dahlias'],
  ['2026-05-20', 'emballage', 64.2, null, null, 'Emballages de l’Ouest', 'Kraft, élastiques, étiquettes'],
  ['2026-06-05', 'transport', 46.0, null, null, null, 'Carburant marchés de mai'],
  ['2026-06-12', 'engrais_traitements', 26.0, 'Zinnia', null, 'Coopérative de Landerneau', 'Purin d’ortie, oïdium'],
  ['2026-07-03', 'transport', 58.0, null, null, null, 'Carburant marchés de juin'],
  ['2026-07-10', 'autre', 120.0, null, null, 'Mairie de Landerneau', 'Place de marché, 2e trimestre'],
  ['2026-08-04', 'emballage', 42.0, null, null, 'Emballages de l’Ouest', 'Seaux et manchons'],
  ['2026-08-28', 'main_oeuvre_externe', 180.0, 'Dahlia', null, null, 'Aide à l’arrachage, 2 demi-journées'],
  ['2026-09-08', 'transport', 61.0, null, null, null, 'Carburant marchés d’été'],
  ['2026-10-02', 'autre', 120.0, null, null, 'Mairie de Landerneau', 'Place de marché, 3e trimestre'],
  ['2026-10-14', 'terreau_substrat', 54.0, null, ['Serre froide', 3], 'Coopérative de Landerneau', 'Paillage paille de lin'],
  ['2026-11-03', 'transport', 34.0, null, null, null, 'Livraisons Morlaix'],
]

// [date, minutes, type, culture, planche, qui (0 = Nolwenn, 1 = Erwan), notes]
const TEMPS: [string, number, string, string | null, Pl, 0 | 1, string | null][] = [
  ['2026-01-15', 180, 'plantation', 'Renoncule', null, 0, 'Trempage et mise en caisse'],
  ['2026-02-02', 240, 'administratif', null, null, 0, 'Plan de culture et commandes'],
  ['2026-02-20', 150, 'semis', null, null, 0, 'Semis de printemps en godets'],
  ['2026-03-20', 120, 'plantation', 'Dahlia', null, 0, null],
  ['2026-04-12', 90, 'semis', 'Zinnia', null, 1, null],
  ['2026-04-25', 150, 'desherbage', null, ['Jardin du Haut', 1], 1, null],
  ['2026-05-05', 120, 'plantation', 'Cosmos', null, 1, null],
  ['2026-05-12', 240, 'tuteurage', 'Dahlia', null, 0, 'Pose des tuteurs et du filet'],
  ['2026-05-16', 300, 'vente', null, null, 0, 'Marché de Landerneau'],
  ['2026-05-22', 60, 'pincage', 'Zinnia', null, 1, null],
  ['2026-06-03', 180, 'desherbage', 'Dahlia', null, 1, null],
  ['2026-06-10', 45, 'desherbage', 'Cosmos', null, 1, 'Binette entre les rangs'],
  ['2026-06-13', 300, 'vente', null, null, 0, 'Marché de Landerneau'],
  ['2026-06-18', 120, 'recolte', 'Ammi majus', null, 0, null],
  ['2026-06-30', 150, 'recolte', 'Bleuet', null, 1, null],
  ['2026-07-03', 300, 'recolte', 'Cosmos', null, 0, 'Mariage Le Bris'],
  ['2026-07-10', 240, 'recolte', 'Zinnia', null, 1, null],
  ['2026-07-14', 180, 'recolte', 'Cosmos', null, 1, null],
  ['2026-07-20', 120, 'irrigation', null, null, 1, 'Goutte-à-goutte, réparations'],
  ['2026-07-24', 180, 'recolte', 'Zinnia', null, 0, null],
  ['2026-08-02', 90, 'recolte', 'Tournesol', null, 1, null],
  ['2026-08-12', 360, 'recolte', 'Dahlia', null, 0, 'Récolte et ébourgeonnage'],
  ['2026-08-15', 300, 'vente', null, null, 0, 'Marché de Landerneau'],
  ['2026-08-26', 300, 'recolte', 'Dahlia', null, 1, null],
  ['2026-09-03', 150, 'recolte', 'Zinnia', null, 1, null],
  ['2026-09-12', 90, 'livraison', null, null, 0, 'Fleurs de Lin, Morlaix'],
  ['2026-09-20', 330, 'recolte', 'Dahlia', null, 0, null],
  ['2026-10-05', 180, 'administratif', null, null, 0, 'Factures et bilan d’été'],
  ['2026-10-28', 120, 'recolte', 'Chrysanthème d’automne', null, 1, null],
  ['2026-11-04', 240, 'recolte', 'Dahlia', null, 1, 'Dernière coupe et arrachage'],
  ['2026-11-12', 150, 'recolte', 'Chrysanthème d’automne', null, 0, null],
  ['2026-11-19', 60, 'recolte', 'Eucalyptus', null, 1, null],
]

// Ventes historiques saisies d'un bloc, détaillées par culture.
// [date, lignes [culture, unité, quantité, tiges/unité, prix unitaire €]].
// Le total de chaque vente est inchangé (vérifié ci-dessous).
type L = [string, string, number, number, number]
const DETAIL_VENTES: [string, L[]][] = [
  ['2026-05-16', [['Renoncule', 'tige', 100, 1, 1.8], ['Pois de senteur', 'tige', 80, 1, 1.35]]],
  ['2026-05-30', [['Pois de senteur', 'tige', 150, 1, 1.1]]],
  ['2026-06-13', [['Ammi majus', 'tige', 80, 1, 1.2], ['Bleuet', 'tige', 100, 1, 1], ['Gueule-de-loup (muflier)', 'tige', 80, 1, 1.45]]],
  ['2026-07-11', [['Cosmos', 'botte', 17, 10, 11], ['Zinnia', 'botte', 17, 10, 11]]],
  ['2026-07-18', [['Cosmos', 'tige', 180, 1, 1], ['Dahlia', 'tige', 200, 1, 1.95]]],
  ['2026-07-25', [['Zinnia', 'tige', 150, 1, 0.9], ['Cosmos', 'tige', 150, 1, 0.9]]],
  ['2026-08-15', [['Dahlia', 'botte', 16, 10, 14.5], ['Tournesol', 'tige', 120, 1, 1.1]]],
  ['2026-08-29', [['Dahlia', 'tige', 200, 1, 1.8], ['Zinnia', 'tige', 160, 1, 1.4], ['Amarante queue-de-renard', 'tige', 100, 1, 1.52]]],
  ['2026-09-12', [['Dahlia', 'tige', 240, 1, 1.4]]],
  ['2026-09-26', [['Zinnia', 'botte', 12, 10, 10], ['Dahlia', 'botte', 10, 10, 16], ['Célosie à plumes', 'tige', 80, 1, 1]]],
]

const uid = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Données de démo : dépenses (costs) et temps passé (time_entries). Modifie la base en place. */
export function seed_couts(db: DemoDb & Record<string, any[]>): void {
  const cat = (name: string | null) => {
    if (!name) return null
    const c = db.culture_catalog.find((x: Row) => x.name === name)
    if (!c) throw new Error(`Culture démo inconnue : ${name}`)
    return c.id as string
  }
  const planche = (p: Pl) => {
    if (!p) return null
    const g = db.gardens.find((x: Row) => x.name === p[0])
    const pl = g && db.planches.find((x: Row) => x.garden_id === g.id && x.name === `PL ${p[1]}`)
    if (!pl) throw new Error(`Planche démo inconnue : ${p[0]} PL ${p[1]}`)
    return pl.id as string
  }
  const saison = db.seasons.find((s: Row) => s.id === SEASON_2026)!
  for (const f of db.farms) if (f.id === saison.farm_id) f.taux_horaire = TAUX_HORAIRE_DEMO

  DEPENSES.forEach(([date, category, amount, culture, pl, supplier, notes], i) => {
    db.costs.push({
      id: uid('d1000000', i + 1), farm_id: saison.farm_id, season_id: SEASON_2026, date, category, amount,
      culture_id: cat(culture), planche_id: planche(pl), supplier, notes,
      created_by: DEMO_USER_ID, created_at: `${date}T19:00:00Z`,
    })
  })
  TEMPS.forEach(([date, minutes, kind, culture, pl, qui, notes], i) => {
    db.time_entries.push({
      id: uid('d2000000', i + 1), farm_id: saison.farm_id, season_id: SEASON_2026, date, minutes, kind,
      culture_id: cat(culture), planche_id: planche(pl), user_id: qui ? DEMO_TEAMMATE_ID : DEMO_USER_ID, notes,
      created_by: qui ? DEMO_TEAMMATE_ID : DEMO_USER_ID, created_at: `${date}T19:30:00Z`,
    })
  })

  let n = 0
  for (const [date, lignes] of DETAIL_VENTES) {
    const v = db.sales.find((s: Row) => s.date === date && !db.sale_lines.some((l: Row) => l.sale_id === s.id))
    if (!v) throw new Error(`Vente démo sans détail introuvable : ${date}`)
    const avant = eurosEnCentimes(v.total)
    for (const [culture, unit, quantity, stems_per_unit, unit_price] of lignes) {
      const r: Row = {
        id: uid('d3000000', ++n), sale_id: v.id, season_id: v.season_id, culture_id: cat(culture), label: culture,
        unit, quantity, stems_per_unit, unit_price, created_at: `${date}T18:00:00Z`,
      }
      r.line_total = totalLigneDemo(r)
      db.sale_lines.push(r)
    }
    recalculerVenteDemo(db, v.id)
    if (eurosEnCentimes(v.total) !== avant) throw new Error(`Détail de la vente du ${date} : total modifié`)
  }
}
