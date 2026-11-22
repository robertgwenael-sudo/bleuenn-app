// ============================================================
// Démo, migration 015 (semis et production) : données FICTIVES.
// ------------------------------------------------------------
// Les valeurs de production du catalogue de démo sont alignées sur la
// « Charte des cultures » du tableur de Marine : rangs par planche de
// 20 × 1 m, « MARINE espacement sur les plants (cm) », graines semées par
// motte, rendement (tiges par plant), prix par tige. Une case vide de la
// charte reste vide ici (Amarante, Lisianthus : graines par motte non
// renseignées) pour montrer « donnée manquante ».
// La pépinière de démo reprend le matériel décrit par Marine : 2 tables de
// 196 × 297 cm, débord de 10 cm, plaques de 51,5 × 33,5 cm à 104 trous.
// En production, ces réglages restent vides tant que la ferme ne les saisit pas.
// ============================================================
import type { DemoDb } from '../data'

type Row = Record<string, any>

// [rangs, espacement cm, graines par motte (null = vide dans la charte), rendement, prix €/tige]
const CHARTE: Record<string, [number, number, number | null, number, number]> = {
  'Achillée': [3, 30, 2, 5, 0.7],
  'Ammi majus': [3, 30, 2, 3, 0.5],
  'Amarante queue-de-renard': [5, 20, null, 3, 1.4],
  'Bleuet': [5, 20, 2, 3, 0.4],
  'Célosie à plumes': [5, 20, 2, 2, 0.8],
  'Chrysanthème d’automne': [5, 20, 2, 3, 0.5],
  'Cosmos': [3, 30, 2, 4, 0.7],
  'Dahlia': [2, 40, 1, 5, 1.2],
  'Eucalyptus': [5, 20, 1, 1, 1],
  'Gomphréna': [5, 20, 2, 3, 0.5],
  'Gueule-de-loup (muflier)': [5, 20, 2, 1, 1],
  'Lisianthus': [5, 20, null, 1, 3.45],
  'Nigelle': [5, 20, 2, 1, 0.75],
  'Pois de senteur': [3, 30, 1, 6, 0.8],
  'Renoncule': [5, 20, 1, 4, 0.8],
  'Rudbeckia': [5, 20, 1, 3, 1.05],
  'Scabieuse': [3, 30, 2, 4, 0.85],
  'Statice': [5, 20, 1, 3, 0.5],
  'Tournesol': [5, 20, 3, 1, 0.5],
  'Zinnia': [5, 20, 2, 6, 0.7],
  'Feuillage de menthe': [5, 20, 2, 3, 1.05],
}

export const PEPINIERE_DEMO = {
  table_semis_largeur_cm: 196, table_semis_longueur_cm: 297, table_semis_nombre: 2, table_semis_debord_cm: 10,
  plaque_largeur_cm: 51.5, plaque_longueur_cm: 33.5, plaque_trous: 104,
}

export function seed_production(db: DemoDb & { farms: Row[] }) {
  for (const c of db.culture_catalog) {
    const v = CHARTE[c.name]
    if (!v) continue
    ;[c.rangs_par_planche, c.espacement_cm, c.graines_par_plant, c.rendement_plant, c.prix_tige] = v
  }
  for (const f of db.farms) Object.assign(f, { taux_perte_semis: 30, taux_perte_champ: 30 }, PEPINIERE_DEMO)
  // Chrysanthèmes : boutures achetées en mai, pas de semis (plant acheté, 013)
  const chrysantheme = db.culture_catalog.find(c => c.name === 'Chrysanthème d’automne')
  for (const p of db.plantings) if (p.culture_id === chrysantheme?.id) p.achat_plant = true
}
