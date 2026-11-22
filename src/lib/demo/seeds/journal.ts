import { type DemoDb, DEMO_USER_ID, DEMO_TEAMMATE_ID, SEASON_2026 } from '../data'

type Row = Record<string, any>

// ============================================================
// Données FICTIVES : journal de culture, photos et registre des
// traitements. Les produits et numéros d'AMM sont inventés (« DEMO-… ») :
// aucune valeur réglementaire réelle.
// ============================================================

/**
 * Photos de démonstration déjà « stockées » : chemin dans le bucket
 * `journal` → image publique de l'appli. Lues par le faux client Storage.
 */
export const OBJETS_JOURNAL_DEMO = new Map<string, string>()

// Planche : [jardin, n° de planche] ; null = ferme entière
type Pl = [string, number] | null

// [date, type, texte, planche, culture (via la plantation de la planche), photo]
const NOTES: [string, string, string, Pl, string | null, string | null][] = [
  ['2026-03-22', 'meteo', 'Gelée tardive (−3 °C au thermomètre de la serre). Voile P17 posé la veille, aucun dégât.', null, null, null],
  ['2026-05-28', 'observation', 'Premières fleurs de pois de senteur, parfum très présent. Tiges de 35 cm.', ['Serre froide', 4], 'Pois de senteur', 'semis-godets.jpg'],
  ['2026-06-12', 'maladie', 'Oïdium sur les feuilles basses des zinnias, côté haie. Feuilles atteintes retirées.', ['Jardin du Haut', 1], 'Zinnia', 'champ-coquelicots.jpg'],
  ['2026-06-20', 'irrigation', 'Goutte-à-goutte : deux goutteurs bouchés remplacés, 45 min par jour en fin d’après-midi.', ['Jardin du Haut', 2], 'Dahlia', null],
  ['2026-07-02', 'ravageur', 'Pucerons noirs sur les têtes de cosmos. Coccinelles déjà présentes, on surveille.', ['Jardin du Haut', 1], 'Cosmos', null],
  ['2026-07-24', 'recolte', 'Zinnias : tiges plus courtes que l’an dernier, récolter au stade « tige ferme » (test du balancement).', ['Jardin du Haut', 1], 'Zinnia', null],
  ['2026-08-30', 'fertilisation', 'Purin de consoude dilué à 10 % sur les dahlias en fin de floraison.', ['Jardin du Haut', 2], 'Dahlia', null],
  ['2026-10-06', 'observation', 'Chrysanthèmes : boutons bien formés, filet remonté d’un cran.', ['Serre froide', 3], 'Chrysanthème d’automne', 'champ-tournesols.jpg'],
  ['2026-11-20', 'meteo', 'Gel blanc la nuit dernière. Chrysanthèmes de la serre épargnés, eucalyptus marqué.', null, null, null],
]

// [date, produit, type, AMM, dose, unité, quantité, unité, m², culture, cible, type de cible, planche, DAR, récolte suivante, qui, vent, °C, notes]
type T = [string, string, string, string | null, string, string, string, string, number, string, string, string, Pl, number | null, string | null, 0 | 1, string | null, number | null, string | null]
const TRAITEMENTS: T[] = [
  ['2026-04-22', 'Anti-limaces phosphate ferrique (démo)', 'biocontrole', 'DEMO-0001', '5', 'kg/ha', '0.006', 'kg', 12, 'Dahlia', 'Limaces', 'ravageur', ['Jardin du Haut', 2], 0, null, 0, 'nul', 14, 'Granulés autour des jeunes pousses'],
  ['2026-06-13', 'Soufre mouillable 80 WG (démo)', 'fongicide', 'DEMO-0002', '7.5', 'kg/ha', '0.0045', 'kg', 6, 'Zinnia', 'Oïdium', 'maladie', ['Jardin du Haut', 1], 3, '2026-06-17', 0, 'faible', 19.5, 'Traitement en fin de journée'],
  ['2026-07-03', 'Savon potassique (démo)', 'insecticide', 'DEMO-0003', '1.5', 'L/hL', '0.15', 'L', 6, 'Cosmos', 'Pucerons noirs', 'ravageur', ['Jardin du Haut', 1], 1, '2026-07-03', 1, 'faible', 22, 'Récolte prévue le jour même : délai saisi non respecté (exemple)'],
  ['2026-09-15', 'Bacillus thuringiensis (démo)', 'biocontrole', 'DEMO-0004', '1', 'kg/ha', '0.0009', 'kg', 9, 'Chrysanthème d’automne', 'Chenilles (noctuelles)', 'ravageur', ['Serre froide', 3], 3, '2026-10-28', 1, null, 17, null],
]

const uid = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Données de démo : journal de culture, photos et registre des traitements. Modifie la base en place. */
export function seed_journal(db: DemoDb & Record<string, any[]>): void {
  db.journal_photos ??= []
  const farm = db.farms?.[0]
  if (!farm) return

  const planche = (p: Pl) => {
    if (!p) return null
    const g = db.gardens.find((x: Row) => x.name === p[0])
    const pl = g && db.planches.find((x: Row) => x.garden_id === g.id && x.name === `PL ${p[1]}`)
    if (!pl) throw new Error(`Planche démo inconnue : ${p[0]} PL ${p[1]}`)
    return { id: pl.id as string, garden_id: g.id as string, libelle: `${g.name} · ${pl.name}` }
  }
  const culture = (name: string) => {
    const c = db.culture_catalog.find((x: Row) => x.name === name)
    if (!c) throw new Error(`Culture démo inconnue : ${name}`)
    return c.id as string
  }
  const plantation = (plancheId: string, cultureId: string) =>
    db.plantings.find((x: Row) => x.planche_id === plancheId && x.culture_id === cultureId && x.season_id === SEASON_2026)?.id ?? null

  NOTES.forEach(([date, kind, body, p, c, photo], i) => {
    const pl = planche(p)
    const cid = c ? culture(c) : null
    const id = uid('e1000000', i + 1)
    db.journal_entries.push({
      id, farm_id: farm.id, season_id: SEASON_2026, date, kind, body,
      planche_id: pl?.id ?? null, planting_id: pl && cid ? plantation(pl.id, cid) : null, culture_id: cid,
      created_by: i % 3 === 1 ? DEMO_TEAMMATE_ID : DEMO_USER_ID, created_at: `${date}T18:00:00Z`, updated_at: null,
    })
    if (photo) {
      const path = `${farm.id}/${id}/demo-${i + 1}.jpg`
      OBJETS_JOURNAL_DEMO.set(path, `/images/${photo}`)
      db.journal_photos.push({ id: uid('e2000000', i + 1), entry_id: id, farm_id: farm.id, path, width: 1600, height: 1067,
        created_by: DEMO_USER_ID, created_at: `${date}T18:00:05Z` })
    }
  })

  const noms = [
    { id: DEMO_USER_ID, nom: 'Nolwenn Kerjean' },
    { id: DEMO_TEAMMATE_ID, nom: 'Erwan Tanguy' },
  ]
  TRAITEMENTS.forEach(([date, produit, produit_type, amm, dose, dose_unite, qte, qte_unite, m2, c, cible, cible_type, p, dar, recolte, qui, vent, temp, notes], i) => {
    const pl = planche(p)
    const cid = culture(c)
    db.treatments.push({
      id: uid('e3000000', i + 1), farm_id: farm.id, season_id: SEASON_2026, date, produit, produit_type, amm,
      dose, dose_unite, quantite_totale: qte, quantite_unite: qte_unite, surface_m2: m2,
      culture_id: cid, culture_libelle: c, cible, cible_type,
      lieu_type: pl ? 'planche' : 'autre', garden_id: pl?.garden_id ?? null, planche_id: pl?.id ?? null,
      planting_id: pl ? plantation(pl.id, cid) : null, lieu_libelle: pl?.libelle ?? 'Ferme', ilot_pac: null,
      date_recolte_suivante: recolte, delai_avant_recolte_j: dar,
      operateur_id: noms[qui].id, operateur_nom: noms[qui].nom, vent, temperature_c: temp, notes,
      created_by: noms[qui].id, created_at: `${date}T19:00:00Z`, updated_at: null,
    })
  })
}
