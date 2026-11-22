'use client'
import { Info } from 'lucide-react'
import { Badge, cn } from '@/components/ui'
import { formatEuros, type Centimes } from '@/lib/domain'

export const fmtTiges = (n: number) => n.toLocaleString('fr-FR')
const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })
export const fmtPct = (r: number | null) => (r === null ? '—' : PCT.format(r))
/** Euros arrondis à l'euro pour les axes, à partir de centimes entiers. */
export const eurosCompact = (c: number) => {
  const e = Math.round(c / 100)
  return Math.abs(e) >= 10000 ? `${Math.round(e / 1000)} k€` : `${e.toLocaleString('fr-FR')} €`
}
export const fmtSigne = (n: number) => (n > 0 ? `+${fmtTiges(n)}` : n < 0 ? `−${fmtTiges(-n)}` : '0')

/**
 * Seuils du code couleur (à valider) : réalisation ≥ 110 % du prévu à date
 * = en avance, 90 à 110 % = dans la cible, moins de 90 % = en retard.
 */
export const SEUIL_AVANCE = 1.1
export const SEUIL_RETARD = 0.9

export type Statut = 'avance' | 'cible' | 'retard' | 'na'
export function statut(taux: number | null): Statut {
  if (taux === null) return 'na'
  if (taux >= SEUIL_AVANCE) return 'avance'
  if (taux >= SEUIL_RETARD) return 'cible'
  return 'retard'
}
const STATUTS: Record<Exclude<Statut, 'na'>, { label: string; tone: 'blue' | 'green' | 'amber' }> = {
  avance: { label: 'En avance', tone: 'blue' },
  cible: { label: 'Dans la cible', tone: 'green' },
  retard: { label: 'En retard', tone: 'amber' },
}
export function StatutBadge({ taux }: { taux: number | null }) {
  const s = statut(taux)
  if (s === 'na') return <Badge tone="neutral">Pas de prévu</Badge>
  return <Badge tone={STATUTS[s].tone} dot>{STATUTS[s].label}</Badge>
}

/** CA réel : « non calculable » quand il n'est pas rattachable à ce niveau, jamais « 0 € ». */
export function CaReel({ c, className }: { c: Centimes | null; className?: string }) {
  if (c === null) {
    return (
      <span className={cn('text-xs italic text-fg-subtle', className)}
        title="Une vente est rattachée à une culture, jamais à une plantation ni à un jardin ; une vente saisie sans détail par culture ne peut être ventilée.">
        non calculable
      </span>
    )
  }
  return <span className={className}>{formatEuros(c)}</span>
}

/** Ligne discrète d'explication d'une hypothèse de calcul. */
export function Hypothese({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-fg-subtle', className)}>
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export const REPARTITION_PREVU =
  'Prévu réparti dans le temps : RR étalé uniformément sur toute la période de récolte, RU compté en une seule semaine (celle du début de récolte), MP étalé sur la première moitié de la période. Hypothèse à valider.'
