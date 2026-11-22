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
  /** 008 : taux horaire en euros (numeric(10,2)), null tant qu'il n'est pas renseigné. */
  taux_horaire?: EurosNumeric | null
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

// ------------------------------------------------------------
// Coûts et temps passé (008)
// ------------------------------------------------------------
/** Contrainte `costs.category` (008), dans l'ordre d'affichage. */
export const COST_CATEGORIES = [
  'semences', 'plants_bulbes', 'terreau_substrat', 'engrais_traitements', 'materiel',
  'emballage', 'transport', 'main_oeuvre_externe', 'autre',
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export interface Cost {
  id: string
  farm_id: string
  season_id: string
  date: DateISO
  category: CostCategory
  /** numeric(12,2) > 0, en euros. */
  amount: EurosNumeric
  culture_id: string | null
  planche_id: string | null
  supplier: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

/** Contrainte `time_entries.kind` (008) : les kinds de `tasks` (005), plus vente et administratif. */
export const TIME_KINDS = [
  'semis', 'repiquage', 'plantation', 'pincage', 'tuteurage', 'desherbage', 'recolte',
  'irrigation', 'traitement', 'livraison', 'vente', 'administratif', 'autre',
] as const
export type TimeKind = (typeof TIME_KINDS)[number]

export interface TimeEntry {
  id: string
  farm_id: string
  season_id: string
  date: DateISO
  /** Entier > 0. */
  minutes: number
  kind: TimeKind
  culture_id: string | null
  planche_id: string | null
  /** Qui a travaillé (membre de la ferme). */
  user_id: string
  notes: string | null
  created_by: string | null
  created_at: string
}

/** Colonne ajoutée à `farms` en 008 : euros par heure, null = non renseigné. */
export interface FarmTauxHoraire {
  taux_horaire: EurosNumeric | null
}

// ------------------------------------------------------------
// Journal de culture et registre des traitements (009)
// ------------------------------------------------------------
/** Contrainte `journal_entries.kind` (009), dans l'ordre d'affichage. */
export const JOURNAL_KINDS = [
  'observation', 'maladie', 'ravageur', 'irrigation', 'fertilisation', 'meteo', 'recolte', 'autre',
] as const
export type JournalKind = (typeof JOURNAL_KINDS)[number]

export interface JournalEntry {
  id: string
  farm_id: string
  /** Facultatif : une note peut concerner la ferme hors saison. */
  season_id: string | null
  date: DateISO
  kind: JournalKind
  body: string | null
  planche_id: string | null
  planting_id: string | null
  culture_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export interface JournalPhoto {
  id: string
  entry_id: string
  farm_id: string
  /** Chemin dans le bucket privé `journal` : `<farm_id>/<entry_id>/<fichier>`. */
  path: string
  width: number | null
  height: number | null
  created_by: string | null
  created_at: string
}

/** Contrainte `treatments.produit_type` (009). */
export const PRODUIT_TYPES = ['fongicide', 'insecticide', 'herbicide', 'acaricide', 'biocontrole', 'autre'] as const
export type ProduitType = (typeof PRODUIT_TYPES)[number]

/** Contrainte `treatments.dose_unite` (009) : par hectare ou par hectolitre de bouillie. */
export const DOSE_UNITES = ['g/ha', 'kg/ha', 'mL/ha', 'L/ha', 'g/hL', 'kg/hL', 'mL/hL', 'L/hL'] as const
export type DoseUnite = (typeof DOSE_UNITES)[number]

/** Contrainte `treatments.quantite_unite` (009). */
export const QUANTITE_UNITES = ['g', 'kg', 'mL', 'L'] as const
export type QuantiteUnite = (typeof QUANTITE_UNITES)[number]

/** Contrainte `treatments.cible_type` (009). */
export const CIBLE_TYPES = ['maladie', 'ravageur', 'adventice', 'autre'] as const
export type CibleType = (typeof CIBLE_TYPES)[number]

/** Contrainte `treatments.lieu_type` (009). */
export const LIEU_TYPES = ['planche', 'jardin', 'serre', 'tunnel', 'autre'] as const
export type LieuType = (typeof LIEU_TYPES)[number]

/**
 * Ligne du registre phytosanitaire. Les décimaux (`numeric`) arrivent de
 * PostgREST en `number` ou en `string` ; ils ne servent qu'à l'affichage
 * et à l'export, sans calcul flottant.
 */
export interface Treatment {
  id: string
  farm_id: string
  season_id: string | null
  date: DateISO
  produit: string
  produit_type: ProduitType
  /** Numéro d'autorisation de mise sur le marché ; null = non renseigné. */
  amm: string | null
  dose: number | string
  dose_unite: DoseUnite
  quantite_totale: number | string
  quantite_unite: QuantiteUnite
  surface_m2: number | string
  culture_id: string | null
  /** Libellé figé à la saisie. */
  culture_libelle: string
  cible: string
  cible_type: CibleType
  lieu_type: LieuType
  garden_id: string | null
  planche_id: string | null
  planting_id: string | null
  /** Libellé figé à la saisie (« Jardin du Haut · PL 2 », « Tunnel nord »). */
  lieu_libelle: string
  /** Référence d'îlot PAC ou coordonnées, texte libre. */
  ilot_pac: string | null
  date_recolte_suivante: DateISO | null
  /** Délai avant récolte en jours, saisi d'après l'étiquette du produit. */
  delai_avant_recolte_j: number | null
  operateur_id: string | null
  operateur_nom: string
  vent: string | null
  temperature_c: number | string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

// ------------------------------------------------------------
// Factures, avoirs, paiements (010)
// ------------------------------------------------------------
/** Réglages de facturation d'une ferme (`farm_billing`, une ligne par ferme). */
export interface FarmBilling {
  farm_id: string
  raison_sociale: string | null
  adresse: string | null
  /** SIREN (9 chiffres) ou SIRET (14 chiffres), chiffres seuls. */
  siret: string | null
  email: string | null
  telephone: string | null
  /** Mention d'absence de TVA, mot pour mot d'après le comptable. Jamais de valeur par défaut. */
  mention_tva: string | null
  /** Délai de paiement par défaut ; null ou 0 = à réception. */
  delai_paiement_jours: number | null
  conditions_paiement: string | null
  penalites_retard: string | null
  indemnite_recouvrement: string | null
  iban: string | null
  bic: string | null
  mentions_libres: string | null
  prefixe_facture: string
  prefixe_avoir: string
  updated_by?: string | null
  updated_at?: string
}

export type InvoiceKind = 'facture' | 'avoir'

/** Instantané du vendeur, figé à l'émission. */
export interface VendeurFige {
  raison_sociale: string
  adresse: string
  siret: string
  email?: string
  telephone?: string
  iban?: string
  bic?: string
  mentions_libres?: string
}

/** Instantané de l'acheteur, figé à l'émission. */
export interface AcheteurFige {
  client_id?: string
  nom?: string
  adresse?: string
  email?: string
  /** SIREN du client (facturation électronique 2027), facultatif. */
  siren?: string
  /** Adresse de livraison si différente, facultative. */
  adresse_livraison?: string
  professionnel?: boolean
}

export interface Invoice {
  id: string
  farm_id: string
  season_id: string
  client_id: string | null
  kind: InvoiceKind
  numero: string
  annee: number
  sequence: number
  date_emission: DateISO
  date_vente_debut: DateISO
  date_vente_fin: DateISO
  date_echeance: DateISO | null
  vendeur: VendeurFige
  acheteur: AcheteurFige
  /** numeric(12,2) ; négatif pour un avoir. */
  total: EurosNumeric
  mention_tva: string
  conditions_paiement: string | null
  penalites_retard: string | null
  indemnite_recouvrement: string | null
  notes: string | null
  /** Avoir : la facture corrigée. */
  avoir_de: string | null
  /** Avoir : motif obligatoire. */
  motif: string | null
  /** Facture : l'avoir qui l'annule. */
  annulee_par: string | null
  created_by: string
  created_at: string
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  farm_id: string
  position: number
  sale_id: string | null
  sale_date: DateISO | null
  culture_id: string | null
  label: string
  unit: LineUnit
  quantity: EurosNumeric
  stems_per_unit: number
  unit_price: EurosNumeric
  line_total: EurosNumeric
}

export interface InvoiceSale {
  id: string
  invoice_id: string
  farm_id: string
  sale_id: string | null
  /** Lien libéré par cet avoir : la vente redevient facturable. */
  liberee_par_avoir: string | null
  created_at: string
}

export const PAYMENT_MODES = ['virement', 'cheque', 'especes', 'carte', 'autre'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export interface Payment {
  id: string
  invoice_id: string
  farm_id: string
  date: DateISO
  /** > 0 encaissement ; < 0 contre-passation ou remboursement. */
  amount: EurosNumeric
  mode: PaymentMode
  reference: string | null
  notes: string | null
  contrepasse_de: string | null
  created_by: string | null
  created_at: string
}

export type InvoiceStatut = 'a_payer' | 'partielle' | 'payee' | 'en_retard' | 'annulee' | 'avoir'

/** Vue `invoices_status` (security_invoker), calculée à la lecture. */
export interface InvoiceStatusRow {
  id: string
  farm_id: string
  season_id: string
  client_id: string | null
  kind: InvoiceKind
  numero: string
  date_emission: DateISO
  date_echeance: DateISO | null
  total: EurosNumeric
  client_nom: string | null
  avoir_de: string | null
  annulee_par: string | null
  numero_lie: string | null
  paye: EurosNumeric
  reste_du: EurosNumeric
  statut: InvoiceStatut
  jours_de_retard: number | null
}

// ------------------------------------------------------------
// Fournisseurs et bons de commande (011)
// ------------------------------------------------------------
/** Contrainte `suppliers.kind` (011), dans l'ordre d'affichage. */
export const SUPPLIER_KINDS = ['semencier', 'pepiniere', 'bulbes', 'fournitures', 'emballage', 'autre'] as const
export type SupplierKind = (typeof SUPPLIER_KINDS)[number]

export interface Supplier {
  id: string
  farm_id: string
  name: string
  kind: SupplierKind
  contact_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  customer_number: string | null
  /** Minimum de commande hors port, en euros ; null = non renseigné. */
  min_order_amount: EurosNumeric | null
  /** Franco de port hors port, en euros ; null = non renseigné. */
  free_shipping_threshold: EurosNumeric | null
  lead_time_days: number | null
  organic_certified: boolean
  notes: string | null
  archived_at: string | null
  created_by: string | null
  created_at: string
}

/** Contrainte `purchase_orders.status` (011), dans l'ordre du cycle. */
export const PURCHASE_ORDER_STATUSES = ['brouillon', 'envoye', 'confirme', 'recu_partiel', 'recu', 'annule'] as const
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

export interface PurchaseOrder {
  id: string
  farm_id: string
  season_id: string
  supplier_id: string
  number_year: number | null
  number_seq: number | null
  /** Colonne générée « BC-2026-001 », null tant que le bon n'est pas envoyé. */
  number: string | null
  status: PurchaseOrderStatus
  order_date: DateISO | null
  expected_date: DateISO | null
  received_date: DateISO | null
  shipping_amount: EurosNumeric
  shipping_expensed: boolean
  notes: string | null
  sent_at: string | null
  cancelled_at: string | null
  created_by: string | null
  created_at: string
}

/** Contrainte `purchase_order_lines.unit` (011). */
export const PURCHASE_UNITS = ['sachet', 'graines', 'grammes', 'plants', 'bulbes', 'tubercules', 'godets', 'unite'] as const
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number]

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  farm_id: string
  culture_id: string | null
  variety: string | null
  label: string
  supplier_ref: string | null
  unit: PurchaseUnit
  /** numeric(12,2) > 0 */
  quantity: EurosNumeric
  /** Cumul reçu, écrit seulement par receptionner_bon(). */
  quantity_received: EurosNumeric
  /** Euros ; null = prix à saisir (le bon ne peut pas partir). */
  unit_price: EurosNumeric | null
  /** Colonne générée round(quantity × unit_price, 2), null sans prix. */
  line_total?: EurosNumeric | null
  organic: boolean
  seed_order_id: string | null
  sort_order: number
  created_at: string
}

/** Dépense (008) avec le lien vers le bon ajouté en 011. */
export interface CostAchat extends Cost {
  purchase_order_id?: string | null
  purchase_order_line_id?: string | null
}

// ------------------------------------------------------------
// Gestion : justificatifs, comptes, relevés, rapprochement (012)
// ------------------------------------------------------------
export interface Receipt {
  id: string
  farm_id: string
  /** Valeurs confirmées par l'utilisatrice (jamais l'OCR seul). */
  date_piece: DateISO | null
  montant: EurosNumeric | null
  fournisseur: string | null
  notes: string | null
  ocr_texte: string | null
  cost_id: string | null
  payment_id: string | null
  sans_objet_le: string | null
  created_by: string | null
  created_at: string
  updated_at: string | null
}

export const RECEIPT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type ReceiptMime = (typeof RECEIPT_MIMES)[number]

export interface ReceiptPage {
  id: string
  receipt_id: string
  farm_id: string
  page: number
  /** `<farm_id>/<receipt_id>/<fichier>` dans le bucket privé `justificatifs`. */
  path: string
  mime: ReceiptMime
  taille: number | null
  nom_origine: string | null
  width: number | null
  height: number | null
  created_by: string | null
  created_at: string
}

export type BankAccountKind = 'banque' | 'caisse'

export interface BankAccount {
  id: string
  farm_id: string
  name: string
  kind: BankAccountKind
  /** Solde au début de `date_solde_initial` ; null = non calculable. */
  solde_initial: EurosNumeric | null
  date_solde_initial: DateISO | null
  csv_mapping: unknown | null
  archived_at: string | null
  created_by: string | null
  created_at: string
}

export interface BankImport {
  id: string
  farm_id: string
  account_id: string
  fichier: string
  nb_lignes: number
  nb_nouvelles: number
  nb_doublons: number
  date_min: DateISO | null
  date_max: DateISO | null
  created_by: string | null
  created_at: string
}

export interface BankTransaction {
  id: string
  farm_id: string
  account_id: string
  import_id: string | null
  date: DateISO
  label: string
  /** < 0 débit, > 0 crédit. */
  amount: EurosNumeric
  empreinte: string
  created_by: string | null
  created_at: string
}

export type BankMatchKind = 'depense' | 'paiement' | 'vente' | 'hors_facture'

/** Contrainte `bank_matches.categorie` (012), opérations hors facture. */
export const HORS_FACTURE_CATEGORIES = [
  'vente_hors_facture', 'subvention_aide', 'remboursement', 'apport_personnel',
  'prelevement_personnel', 'virement_interne', 'emprunt', 'autre',
] as const
export type HorsFactureCategorie = (typeof HORS_FACTURE_CATEGORIES)[number]

export interface BankMatch {
  id: string
  farm_id: string
  transaction_id: string
  kind: BankMatchKind
  cost_id: string | null
  payment_id: string | null
  sale_id: string | null
  categorie: HorsFactureCategorie | null
  libelle: string | null
  /** Part du mouvement couverte, même signe que le mouvement. */
  amount: EurosNumeric
  annule_le: string | null
  annule_par: string | null
  created_by: string | null
  created_at: string
}

// ============================================================
// ▼▼▼ Cultures et catalogue : annuelles, bisannuelles, vivaces (013) ▼▼▼
// Section propre à la migration 013, à fusionner telle quelle.
// ============================================================
export const CYCLES_CULTURE = ['annuelle', 'bisannuelle', 'vivace'] as const
export type CycleCulture = (typeof CYCLES_CULTURE)[number]

/** Colonnes ajoutées à `culture_catalog` (facultatives tant que 013 n'est pas appliquée). */
export interface ChampsCultureCycle {
  /** Absent avant 013 : se lit « annuelle ». */
  cycle?: CycleCulture
  /** 1ère date d'implantation au champ possible, `jj/mm` (charte). */
  premiere_implantation?: string | null
  /** Vivace : années supplémentaires avant la première floraison (pivoine). */
  annees_avant_recolte?: number
  /** Vivace ou bisannuelle : début de la récolte chaque année, `jj/mm` (absent de la charte, à saisir). */
  floraison_debut?: string | null
}

/** Colonnes ajoutées à `plantings` et à la vue `plantings_full`. */
export interface ChampsPlantingCycle {
  /** OPTION PLANT : plant acheté, la date saisie est la date de plantation. */
  achat_plant?: boolean
  /** Dernier jour en place. Null : vivace toujours en place, annuelle jusqu'à `date_fin`. */
  arrachee_le?: DateISO | null
  /** Vue seulement : cycle de la culture. */
  cycle?: CycleCulture
  /** Vue seulement : null = vivace toujours en place. */
  fin_occupation?: DateISO | null
  annees_avant_recolte?: number
  premiere_implantation?: string | null
  floraison_debut?: string | null
}
// ▲▲▲ fin de la section 013 ▲▲▲
