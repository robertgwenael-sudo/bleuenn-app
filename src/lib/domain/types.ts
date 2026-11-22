// ============================================================
// Types du domaine : tables et vues des migrations 005 et 006
// ============================================================
// Les types historiques restent dans `src/lib/types.ts` (lecture seule
// ici) ; ce module les étend sans les modifier.
//
// Conventions :
//  * une date civile est une chaîne `YYYY-MM-DD` (type `DateISO`) ;
//  * un horodatage (`timestamptz`) est une chaîne ISO 8601 complète ;
//  * les colonnes `numeric` arrivent de PostgREST en `number` (ou en
//    `string` pour les très grands nombres) : les montants sont convertis
//    en centimes entiers par `eurosEnCentimes` avant tout calcul.
// ============================================================

import type {
  Garden as GardenBase,
  Harvest,
  PlantingFull as PlantingFullBase,
  Sale as SaleBase,
  Season as SeasonBase,
} from '../types'

export type { CultureCatalog, Harvest, Planche, Planting, Profile, SeedOrder } from '../types'

/** Date civile `YYYY-MM-DD`, sans heure ni fuseau. */
export type DateISO = string

/** Montant en centimes d'euro, entier. */
export type Centimes = number

/** Euros tels que stockés en `numeric(…, 2)` et renvoyés par PostgREST. */
export type EurosNumeric = number | string

export type CultureType = 'RR' | 'MP' | 'RU'

// ------------------------------------------------------------
// Ferme (006)
// ------------------------------------------------------------
export interface Farm {
  id: string
  name: string
  created_by: string
  created_at: string
}

export type FarmRole = 'owner' | 'member'

export interface FarmMember {
  id: string
  farm_id: string
  user_id: string
  role: FarmRole
  joined_at: string
  /** Renseignés par la fonction `farm_team(p_farm_id)`, pas par la table. */
  email?: string | null
  owner_name?: string | null
}

export interface Season extends SeasonBase {
  farm_id: string
}

/** En 006, un jardin appartient à la ferme ; `season_id` devient facultatif. */
export interface Garden extends Omit<GardenBase, 'season_id'> {
  farm_id: string
  season_id: string | null
}

/** Vue `plantings_full` telle que redéfinie en 006. */
export interface PlantingFull extends PlantingFullBase {
  farm_id: string
  season_name: string
  season_year: number
  user_id: string
  planting_notes: string | null
}

// ------------------------------------------------------------
// Clients, commandes, ventes (005)
// ------------------------------------------------------------
export type ClientKind =
  | 'fleuriste' | 'particulier' | 'mariage' | 'abonne' | 'evenementiel' | 'commerce' | 'autre'

export interface Client {
  id: string
  user_id: string
  name: string
  kind: ClientKind
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  archived_at: string | null
  created_at: string
}

export type OrderStatus = 'devis' | 'confirmee' | 'prete' | 'livree' | 'annulee'

export interface Order {
  id: string
  season_id: string
  client_id: string | null
  delivery_date: DateISO
  status: OrderStatus
  /** Texte libre côté commande ; la vente, elle, exige un `SaleChannel`. */
  channel: string | null
  notes: string | null
  sale_id: string | null
  created_by: string | null
  created_at: string
}

export type LineUnit = 'tige' | 'botte' | 'bouquet' | 'seau' | 'autre'

/** Colonnes communes à `sale_lines` et `order_lines`. */
export interface LigneBase {
  culture_id: string | null
  label: string
  unit: LineUnit
  quantity: EurosNumeric // numeric(10,2) : une quantité peut être décimale
  stems_per_unit: number
  unit_price: EurosNumeric
  /** Colonne générée `round(quantity * unit_price, 2)`, absente avant insertion. */
  line_total?: EurosNumeric | null
}

export interface SaleLine extends LigneBase {
  id: string
  sale_id: string
  season_id: string
  created_at: string
}

export interface OrderLine extends LigneBase {
  id: string
  order_id: string
  season_id: string
  created_at: string
}

/** Contrainte `sales.channel` (001). */
export const SALE_CHANNELS = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil'] as const
export type SaleChannel = (typeof SALE_CHANNELS)[number]

export interface Sale extends Omit<SaleBase, 'total' | 'prix_unitaire' | 'cultures_sold'> {
  total: EurosNumeric
  prix_unitaire: EurosNumeric
  cultures_sold: string | null
  client_id: string | null
  order_id: string | null
  notes?: string | null
}

// ------------------------------------------------------------
// Pertes, tâches, réel (005)
// ------------------------------------------------------------
export type LossReason = 'invendu' | 'abime' | 'meteo' | 'ravageur' | 'maladie' | 'autre'
export const LOSS_REASONS: readonly LossReason[] = ['invendu', 'abime', 'meteo', 'ravageur', 'maladie', 'autre']

export interface Loss {
  id: string
  season_id: string
  planting_id: string | null
  culture_id: string | null
  date: DateISO
  tiges: number
  reason: LossReason
  notes: string | null
  created_at: string
}

export type TaskKind =
  | 'semis' | 'repiquage' | 'plantation' | 'pincage' | 'tuteurage' | 'desherbage'
  | 'recolte' | 'irrigation' | 'traitement' | 'livraison' | 'autre'

export interface Task {
  id: string
  season_id: string
  title: string
  kind: TaskKind
  due_date: DateISO | null
  planting_id: string | null
  planche_id: string | null
  assigned_to: string | null
  auto_key: string | null
  done_at: string | null
  done_by: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

/** Vue `planting_actuals`. */
export interface PlantingActual {
  planting_id: string
  season_id: string
  tiges_recoltees: number
  tiges_perdues: number
  nb_recoltes: number | null
  premiere_recolte: DateISO | null
  derniere_recolte: DateISO | null
}

/** Récolte réduite aux colonnes utiles aux calculs. */
export type HarvestLite = Pick<Harvest, 'planting_id' | 'date' | 'tiges'>
