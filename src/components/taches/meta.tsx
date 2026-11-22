import {
  ArrowRightLeft, CircleDot, Droplets, Grid3x3, Hand, Leaf, Scissors, Shovel, SprayCan, Sprout, Truck,
  type LucideIcon,
} from 'lucide-react'
import {
  ajouterJours, jourSemaineIso, type DateISO, type TaskKind,
} from '@/lib/domain'
import { cn } from '@/components/ui'

/** Familles de tâches : une couleur par famille pour la charge des mois. */
export type Famille = 'semis' | 'plantation' | 'entretien' | 'recolte' | 'livraison' | 'autre'

export const FAMILLES: { id: Famille; label: string; barre: string; pastille: string }[] = [
  { id: 'semis', label: 'Semis', barre: 'bg-chart-1', pastille: 'bg-primary-soft text-primary' },
  { id: 'plantation', label: 'Plantation', barre: 'bg-phase-champ', pastille: 'bg-warning-soft text-warning' },
  { id: 'entretien', label: 'Entretien', barre: 'bg-info', pastille: 'bg-info-soft text-info' },
  { id: 'recolte', label: 'Récolte', barre: 'bg-violet', pastille: 'bg-violet-soft text-violet' },
  { id: 'livraison', label: 'Livraison', barre: 'bg-accent', pastille: 'bg-accent-soft text-accent' },
  { id: 'autre', label: 'Autre', barre: 'bg-fg-subtle', pastille: 'bg-surface-3 text-fg-muted' },
]
export const FAMILLE_PAR_ID = Object.fromEntries(FAMILLES.map(f => [f.id, f])) as Record<Famille, (typeof FAMILLES)[number]>

export const TYPES: Record<TaskKind, { label: string; icon: LucideIcon; famille: Famille }> = {
  semis: { label: 'Semis', icon: Sprout, famille: 'semis' },
  repiquage: { label: 'Repiquage', icon: ArrowRightLeft, famille: 'semis' },
  plantation: { label: 'Plantation', icon: Shovel, famille: 'plantation' },
  tuteurage: { label: 'Tuteurage', icon: Grid3x3, famille: 'entretien' },
  pincage: { label: 'Pinçage', icon: Hand, famille: 'entretien' },
  desherbage: { label: 'Désherbage', icon: Leaf, famille: 'entretien' },
  irrigation: { label: 'Irrigation', icon: Droplets, famille: 'entretien' },
  traitement: { label: 'Traitement', icon: SprayCan, famille: 'entretien' },
  recolte: { label: 'Récolte', icon: Scissors, famille: 'recolte' },
  livraison: { label: 'Livraison', icon: Truck, famille: 'livraison' },
  autre: { label: 'Autre', icon: CircleDot, famille: 'autre' },
}
export const ORDRE_TYPES: TaskKind[] = [
  'semis', 'repiquage', 'plantation', 'tuteurage', 'pincage', 'desherbage', 'irrigation', 'traitement',
  'recolte', 'livraison', 'autre',
]

export function IconeType({ kind, className }: { kind: TaskKind; className?: string }) {
  const t = TYPES[kind]
  const Icon = t.icon
  return (
    <span title={t.label} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', FAMILLE_PAR_ID[t.famille].pastille, className)}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{t.label}</span>
    </span>
  )
}

// ------------------------------------------------------------
// Dates courtes, en français, sans dépendre de l'Intl de l'appareil
// ------------------------------------------------------------
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
export const JOURS_LONGS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const jourNum = (d: DateISO) => Number(d.slice(8, 10))
const moisNum = (d: DateISO) => Number(d.slice(5, 7))

/** « 24 nov. » */
export function jourMoisCourt(d: DateISO): string {
  return `${jourNum(d) === 1 ? '1er' : jourNum(d)} ${MOIS_COURTS[moisNum(d) - 1]}`
}

/** « mar. 24 nov. », avec l'année si elle diffère de `annee`. */
export function dateCourte(d: DateISO, annee?: number): string {
  const a = Number(d.slice(0, 4))
  return `${JOURS_COURTS[jourSemaineIso(d) - 1]} ${jourMoisCourt(d)}${annee !== undefined && annee !== a ? ` ${a}` : ''}`
}

/** « 23–29 nov. » ou « 30 nov.–6 déc. » */
export function plageSemaine(lundi: DateISO): string {
  const dim = ajouterJours(lundi, 6)
  if (moisNum(lundi) === moisNum(dim)) return `${jourNum(lundi)}–${jourNum(dim)} ${MOIS_COURTS[moisNum(dim) - 1]}`
  return `${jourMoisCourt(lundi)}–${jourMoisCourt(dim)}`
}

/** Clé `2026-11` → « nov. » (+ année courte si demandée). */
export function moisCourt(cle: string, avecAnnee = false): string {
  const m = Number(cle.slice(5, 7))
  return `${MOIS_COURTS[m - 1]}${avecAnnee ? ` ${cle.slice(2, 4)}` : ''}`
}

/** Clé `2026-11` → « Novembre 2026 ». */
export function moisLong(cle: string): string {
  const m = MOIS_LONGS[Number(cle.slice(5, 7)) - 1]
  return `${m[0].toUpperCase()}${m.slice(1)} ${cle.slice(0, 4)}`
}

export function moisSuivant(cle: string, n = 1): string {
  const a = Number(cle.slice(0, 4)), m = Number(cle.slice(5, 7)) - 1 + n
  const aa = a + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1
  return `${aa}-${String(mm).padStart(2, '0')}`
}

export const pluriel = (n: number, s: string, p = `${s}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? p : s}`
