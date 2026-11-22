import {
  LayoutDashboard, Fence, Sprout, CalendarRange, Scissors, Store, PackageOpen,
  Flower2, ChartNoAxesCombined, BookOpen, TableProperties, ListChecks, Scale, Users, Truck, PiggyBank, FileDown, NotebookPen, ReceiptText, Factory, Landmark, ScanLine, type LucideIcon,
} from 'lucide-react'

export type SectionId =
  | 'dashboard' | 'jardins' | 'semis' | 'calendrier' | 'recoltes' | 'ventes'
  | 'commandes' | 'disponibilite' | 'analytique' | 'catalogue' | 'verification'
  | 'taches' | 'reel' | 'clients' | 'livraisons' | 'rentabilite' | 'exports' | 'journal' | 'factures' | 'fournisseurs'
  | 'gestion' | 'justificatifs'

export type Section = { id: SectionId; label: string; short: string; icon: LucideIcon; key: string; description: string }

export const SECTIONS: Section[] = [
  { id: 'dashboard', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard, key: 't', description: 'Vue d’ensemble de la saison' },
  { id: 'taches', label: 'Tâches', short: 'Tâches', icon: ListChecks, key: 'h', description: 'Travaux du mois, semaine par semaine' },
  { id: 'reel', label: 'Prévu / réel', short: 'Réel', icon: Scale, key: 'p', description: 'Récoltes, pertes et CA face au prévu' },
  { id: 'rentabilite', label: 'Coûts & rentabilité', short: 'Marge', icon: PiggyBank, key: 'm', description: 'Dépenses, temps passé et marge par culture' },
  { id: 'gestion', label: 'Gestion', short: 'Gestion', icon: Landmark, key: 'g', description: 'Trésorerie, banque, export comptable' },
  { id: 'justificatifs', label: 'Justificatifs', short: 'Justif.', icon: ScanLine, key: 'i', description: 'Tickets et factures d’achat scannés' },
  { id: 'analytique', label: 'Analytique', short: 'Analytique', icon: ChartNoAxesCombined, key: 'a', description: 'Prévisionnel de chiffre d’affaires' },
  { id: 'jardins', label: 'Jardins & planches', short: 'Jardins', icon: Fence, key: 'j', description: 'Parcelles, planches et plantations' },
  { id: 'semis', label: 'Semis & germination', short: 'Semis', icon: Sprout, key: 's', description: 'Suivi de toutes les cultures' },
  { id: 'calendrier', label: 'Calendrier de culture', short: 'Calendrier', icon: CalendarRange, key: 'c', description: 'Vue hebdomadaire des phases' },
  { id: 'journal', label: 'Journal & traitements', short: 'Journal', icon: NotebookPen, key: 'n', description: 'Observations, photos, registre phytosanitaire' },
  { id: 'disponibilite', label: 'Disponibilité', short: 'Dispo.', icon: Flower2, key: 'd', description: 'Fleurs disponibles par semaine' },
  { id: 'recoltes', label: 'Récoltes', short: 'Récoltes', icon: Scissors, key: 'r', description: 'Saisie et suivi des récoltes' },
  { id: 'livraisons', label: 'Commandes clients', short: 'Cdes', icon: Truck, key: 'b', description: 'Commandes à préparer et livrer' },
  { id: 'factures', label: 'Factures & paiements', short: 'Factures', icon: ReceiptText, key: 'f', description: 'Factures numérotées, avoirs, encaissements' },
  { id: 'clients', label: 'Clients', short: 'Clients', icon: Users, key: 'l', description: 'Fleuristes, particuliers, mariages' },
  { id: 'ventes', label: 'Ventes', short: 'Ventes', icon: Store, key: 'v', description: 'Ventes par canal' },
  { id: 'fournisseurs', label: 'Fournisseurs', short: 'Fourniss.', icon: Factory, key: 'u', description: 'Semenciers, pépinières, fournitures' },
  { id: 'commandes', label: 'Achats & bons de commande', short: 'Graines', icon: PackageOpen, key: 'o', description: 'Besoins et commandes de semences' },
  { id: 'catalogue', label: 'Catalogue des cultures', short: 'Catalogue', icon: BookOpen, key: 'k', description: 'Référentiel technique' },
  { id: 'exports', label: 'Exports', short: 'Exports', icon: FileDown, key: 'e', description: 'Fichiers CSV pour le comptable' },
  { id: 'verification', label: 'Vérification', short: 'Vérif.', icon: TableProperties, key: 'x', description: 'Tableau complet de production' },
]

export const NAV_GROUPS: { label: string; ids: SectionId[] }[] = [
  { label: 'Pilotage', ids: ['dashboard', 'taches', 'reel', 'rentabilite', 'gestion', 'justificatifs', 'analytique'] },
  { label: 'Cultures', ids: ['jardins', 'semis', 'calendrier', 'journal', 'disponibilite'] },
  { label: 'Commercial', ids: ['recoltes', 'livraisons', 'ventes', 'factures', 'clients'] },
  { label: 'Référentiel', ids: ['catalogue', 'commandes', 'fournisseurs', 'verification', 'exports'] },
]

/** Raccourcis de la barre basse mobile (le reste est dans le tiroir). */
export const MOBILE_TABS: SectionId[] = ['dashboard', 'recoltes', 'ventes', 'calendrier']

export const sectionById = (id: string) => SECTIONS.find(s => s.id === id) || SECTIONS[0]
export const VALID_IDS = new Set<string>(SECTIONS.map(s => s.id))
