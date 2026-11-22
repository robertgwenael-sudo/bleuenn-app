import { cn } from '@/components/ui/cn'

/** Barre segmentée (partie d'un tout), légende chiffrée en dessous. */
export function SegmentedBar({ items, unit }: { items: { label: string; value: number; colorClass: string }[]; unit: string }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3" role="img"
        aria-label={items.map(i => `${i.label} : ${i.value} ${unit}`).join(', ')}>
        {total > 0 && items.filter(i => i.value > 0).map(i => (
          <div key={i.label} className={cn('h-full first:rounded-l-full last:rounded-r-full', i.colorClass)} style={{ width: `${(i.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map(i => (
          <li key={i.label} className="flex items-center gap-2.5 text-sm">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', i.colorClass)} aria-hidden />
            <span className="text-fg-muted">{i.label}</span>
            <span className="num ml-auto font-semibold text-fg">{i.value}</span>
            <span className="num w-12 text-right text-xs text-fg-subtle">{total > 0 ? Math.round((i.value / total) * 100) : 0} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
