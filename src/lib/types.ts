// ============================================================
// Types Bleuenn SaaS
// ============================================================
import type { ChampsCultureCycle, ChampsPlantingCycle } from './domain/types'
import { enRecolteLe, vivaceEnPlace } from './domain/cultures'

export interface Profile {
  id: string
  email: string
  farm_name: string
  owner_name: string
}

export interface Season {
  id: string
  user_id: string
  name: string
  year: number
  revenue_goal: number
  is_active: boolean
  invite_token?: string
  invite_enabled?: boolean
  /** Migration 006 : la saison appartient à une ferme permanente. */
  farm_id: string
}

/** Ferme : unité permanente (jardins, planches, équipe). Migration 006. */
export interface Farm {
  id: string
  name: string
  created_by: string
  created_at: string
}

/** Membre de la ferme, tel que renvoyé par la RPC `farm_team(p_farm_id)`. */
export interface FarmMember {
  id: string            // farm_members.id
  farm_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  email?: string | null
  owner_name?: string | null
}

export interface TeamMember {
  id: string
  season_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  email?: string       // jointure profiles
  owner_name?: string  // jointure profiles
}

export interface CultureCatalog extends ChampsCultureCycle {
  id: string
  user_id: string | null
  name: string
  type: 'RR' | 'MP' | 'RU'
  jours_cellule: number
  jours_champ: number
  jours_recolte: number
  rendement_plant: number
  prix_tige: number
  temp_germination: number | null
  pincer: boolean
  filet: boolean
  couvre_sol: boolean
  semis_direct: boolean
  espacement_cm: number
  rangs_par_planche: number
  graines_par_plant: number
  notes: string | null
}

export interface Garden {
  id: string
  user_id: string
  /** Migration 006 : le jardin appartient à la ferme, pas à une saison. */
  farm_id: string
  /** Renseigné pour compatibilité, facultatif depuis 006. */
  season_id: string | null
  name: string
  surface_m2: number
  description: string | null
  sort_order: number
  planches?: Planche[]
}

export interface Planche {
  id: string
  garden_id: string
  name: string
  surface_m2: number
  sort_order: number
  plantings?: PlantingFull[]
}

export interface Planting extends ChampsPlantingCycle {
  id: string
  planche_id: string
  culture_id: string
  season_id: string
  surface_m2: number
  date_semis: string
  date_plantation: string
  date_recolte: string
  date_fin: string
  jours_cellule_override: number
  jours_champ_override: number | null
  jours_recolte_override: number | null
  rendement_override: number | null
  prix_override: number | null
  plants_count: number
  tiges_estimees: number
  revenu_estime: number
  graines_necessaires: number
  notes: string | null
}

export interface PlantingFull extends Planting {
  planting_m2: number
  planting_notes: string | null  // la vue renomme notes en planting_notes
  culture_name: string
  culture_type: 'RR' | 'MP' | 'RU'
  jours_cellule: number
  jours_champ: number
  jours_recolte: number
  rendement: number
  prix_tige: number
  temp_germination: number | null
  pincer: boolean
  filet: boolean
  couvre_sol: boolean
  semis_direct: boolean
  espacement_cm: number
  rangs_par_planche: number
  graines_par_plant: number
  planche_name: string
  planche_m2: number
  garden_name: string
  garden_id: string
  garden_m2: number
  // Migration 006 : ferme et saison exposées pour lire l'occupation par dates
  farm_id: string
  season_name: string
  season_year: number
}

export interface Harvest {
  id: string
  planting_id: string
  season_id: string
  date: string
  tiges: number
  quality: 'A' | 'B' | 'C'
  notes: string | null
}

export interface Sale {
  id: string
  season_id: string
  user_id: string
  date: string
  channel: string
  cultures_sold: string
  tiges: number
  prix_unitaire: number
  total: number
  client: string | null
}

export interface SeedOrder {
  id: string
  season_id: string
  culture_name: string
  graines_needed: number
  graines_ordered: number
  supplier: string
  bio: boolean
  received: boolean
}

// Helpers
export type PlantingStatus = 'À semer' | 'En germination' | 'Planté' | 'En récolte' | 'Terminé'

/** Date du jour à Paris, `YYYY-MM-DD` (l'appareil peut être dans un autre fuseau). */
export function aujourdhuiParisISO(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

/**
 * Statut d'une plantation au jour donné (Paris par défaut). Comparaison de
 * dates civiles `YYYY-MM-DD` : pas de décalage de fuseau, fin de récolte incluse.
 */
export function getPlantingStatus(p: PlantingFull, jour: string = aujourdhuiParisISO()): PlantingStatus {
  if (jour < p.date_semis) return 'À semer'
  if (jour < p.date_plantation && p.jours_cellule > 0) return 'En germination'
  if (p.arrachee_le && jour > p.arrachee_le) return 'Terminé'
  // 013 : vivace ou bisannuelle sans début de floraison, pas de récolte datée
  if (!p.date_recolte) return 'Planté'
  if (jour < p.date_recolte) return 'Planté'
  // Vivace en place (013) : en récolte chaque année dans sa fenêtre, plantée entre deux
  if (vivaceEnPlace(p, jour)) return enRecolteLe(p, jour) ? 'En récolte' : 'Planté'
  if (jour <= p.date_fin) return 'En récolte'
  return 'Terminé'
}

export function getWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)
}

export function formatDateFR(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

export function formatDateShort(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit'
  })
}

/**
 * Calcule la surface occupée sur une planche pendant une période donnée.
 * Deux cultures peuvent partager la même planche si leurs périodes ne se chevauchent pas.
 * Période d'occupation d'une culture = [date_semis, date_fin].
 * Chevauchement : A.start <= B.end AND B.start <= A.end
 */
export function getOverlappingM2(
  plantings: { surface_m2: number; date_semis: string; date_fin: string | null; id: string }[],
  dateSemis: string,
  dateFin: string | null,
  excludeId?: string
): number {
  const s1 = dateSemis
  const f1 = dateFin || '2099-12-31'
  return plantings
    .filter(p => excludeId ? p.id !== excludeId : true)
    .filter(p => {
      const s2 = p.date_semis
      const f2 = p.date_fin || '2099-12-31'
      // Chevauchement : les deux périodes se croisent
      return s1 <= f2 && s2 <= f1
    })
    .reduce((sum, p) => sum + (p.surface_m2 || 0), 0)
}
