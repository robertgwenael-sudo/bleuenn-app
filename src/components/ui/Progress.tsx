import { cn } from './cn'

export function Progress({ value, className, tone = 'primary', label }: {
  value: number; className?: string; tone?: 'primary' | 'accent' | 'danger' | 'warning'; label?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const bar = { primary: 'bg-primary', accent: 'bg-accent', danger: 'bg-danger', warning: 'bg-warning' }[tone]
  const track = { primary: 'bg-primary-soft', accent: 'bg-accent-soft', danger: 'bg-danger-soft', warning: 'bg-warning-soft' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full', track, className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', bar)} style={{ width: `${pct}%` }} />
    </div>
  )
}
