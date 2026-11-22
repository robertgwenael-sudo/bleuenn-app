import { cn } from './cn'

export type Tone = 'neutral' | 'green' | 'amber' | 'rose' | 'violet' | 'blue' | 'red'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted',
  green: 'bg-primary-soft text-primary',
  amber: 'bg-warning-soft text-warning',
  rose: 'bg-accent-soft text-accent',
  violet: 'bg-violet-soft text-violet',
  blue: 'bg-info-soft text-info',
  red: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', dot, className, children, title }: {
  tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode; title?: string
}) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

const statusTone: Record<string, Tone> = {
  'À semer': 'rose', 'En germination': 'amber', 'Planté': 'green', 'En récolte': 'violet', 'Terminé': 'neutral',
}
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] || 'neutral'} dot>{status}</Badge>
}

export const TYPE_LABEL: Record<string, string> = { RR: 'Récolte répétitive', MP: 'Moyen producteur', RU: 'Récolte unique' }
const typeTone: Record<string, Tone> = { RR: 'green', MP: 'amber', RU: 'violet' }
export function TypeBadge({ type, className }: { type: string; className?: string }) {
  return <Badge tone={typeTone[type] || 'neutral'} title={TYPE_LABEL[type]} className={className}>{type}</Badge>
}

const qualityTone: Record<string, Tone> = { A: 'green', B: 'amber', C: 'violet' }
export function QualityBadge({ q }: { q: string }) {
  return <Badge tone={qualityTone[q] || 'neutral'} title={`Qualité ${q}`}>{q}</Badge>
}
