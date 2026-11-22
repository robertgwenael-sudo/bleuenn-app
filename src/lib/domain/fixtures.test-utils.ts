// Fabriques de données pour les tests du domaine (aucune logique métier).
import type { PlantingFull } from './types'

const BASE: PlantingFull = {
  id: 'p', planche_id: 'pl1', culture_id: 'c', season_id: 's2026', surface_m2: 5,
  date_semis: '2026-03-01', date_plantation: '2026-04-01', date_recolte: '2026-06-01', date_fin: '2026-06-21',
  jours_cellule_override: 0, jours_champ_override: null, jours_recolte_override: null,
  rendement_override: null, prix_override: null, plants_count: 100, tiges_estimees: 100,
  revenu_estime: 50, graines_necessaires: 130, notes: null,
  planting_m2: 5, culture_name: 'Cosmos', culture_type: 'RR',
  jours_cellule: 31, jours_champ: 61, jours_recolte: 20, rendement: 1, prix_tige: 0.5,
  temp_germination: null, pincer: false, filet: false, couvre_sol: false, semis_direct: false,
  espacement_cm: 20, rangs_par_planche: 5, graines_par_plant: 1,
  planche_name: 'PL 1', planche_m2: 10, garden_name: 'Jardin A', garden_id: 'g1', garden_m2: 100,
  farm_id: 'f1', season_name: 'Saison 2026', season_year: 2026, user_id: 'u1', planting_notes: null,
}

export function plantation(p: Partial<PlantingFull>): PlantingFull {
  return { ...BASE, ...p }
}
