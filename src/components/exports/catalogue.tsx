// Présentation des exports à l'écran : titre, description, icône.
import { CalendarRange, ClipboardList, Contact, Flower2, ListOrdered, Sprout, TrendingDown } from 'lucide-react'
import type { CleExport } from '@/lib/domain/exports'

export interface FicheExport {
  titre: string
  description: string
  icone: React.ReactNode
  /** Unité comptée, au singulier et au pluriel. */
  unite: [string, string]
}

const ic = 'h-[18px] w-[18px]'

export const FICHES: Record<CleExport, FicheExport> = {
  'ventes-detaillees': {
    titre: 'Ventes détaillées',
    description: 'Une ligne par ligne de vente : date, client, canal, culture, unité, quantité, tiges, prix unitaire, montant. Les ventes saisies avant le détail en lignes tiennent sur une ligne.',
    icone: <ListOrdered className={ic} />, unite: ['ligne', 'lignes'],
  },
  'ventes-mois-canal': {
    titre: 'Ventes par mois et par canal',
    description: 'Synthèse mensuelle : nombre de ventes, tiges et chiffre d’affaires par canal (marché, fleuriste, abonnements…).',
    icone: <CalendarRange className={ic} />, unite: ['ligne', 'lignes'],
  },
  recoltes: {
    titre: 'Récoltes',
    description: 'Date, culture, jardin, planche, tiges récoltées, qualité et notes.',
    icone: <Flower2 className={ic} />, unite: ['récolte', 'récoltes'],
  },
  pertes: {
    titre: 'Pertes',
    description: 'Date, culture, plantation, tiges perdues, raison en clair et notes.',
    icone: <TrendingDown className={ic} />, unite: ['perte', 'pertes'],
  },
  commandes: {
    titre: 'Commandes clients',
    description: 'Date de livraison, client, statut, lignes commandées et montant. Les commandes annulées restent visibles avec leur statut.',
    icone: <ClipboardList className={ic} />, unite: ['commande', 'commandes'],
  },
  clients: {
    titre: 'Clients',
    description: 'Fiches clients (nom, type, contact, téléphone, email, adresse) et chiffre d’affaires de la période.',
    icone: <Contact className={ic} />, unite: ['client', 'clients'],
  },
  'plan-de-culture': {
    titre: 'Plan de culture',
    description: 'Plantations : culture, jardin, planche, surface, dates de semis, de plantation, de récolte et de fin, tiges et CA estimés, saison.',
    icone: <Sprout className={ic} />, unite: ['plantation', 'plantations'],
  },
}

export function compter(n: number, [un, plusieurs]: [string, string]) {
  return `${n.toLocaleString('fr-FR')} ${n >= 2 ? plusieurs : un}`
}
