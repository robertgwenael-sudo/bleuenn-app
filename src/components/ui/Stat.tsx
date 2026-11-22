import { cn } from './cn'

/** Tuile KPI : libellé, valeur, contexte, et éventuellement une jauge. */
export function Stat({ label, value, sub, icon, children, className }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-4 shadow-card sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon && <span className="text-fg-subtle [&_svg]:h-4 [&_svg]:w-4" aria-hidden>{icon}</span>}
      </div>
      <p className="num mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-[1.65rem]">{value}</p>
      {sub && <p className="mt-1 text-xs text-fg-subtle">{sub}</p>}
      {children}
    </div>
  )
}
