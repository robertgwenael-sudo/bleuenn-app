'use client'

type Item = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number; payload?: any }

/** Infobulle commune : texte en encre neutre, pastille de couleur pour l'identité. */
export function ChartTooltip({ active, payload, label, format, labelFormat }: {
  active?: boolean
  payload?: Item[]
  label?: string | number
  format?: (v: number, item: Item) => string
  labelFormat?: (l: any) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[9rem] rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1.5 font-semibold text-fg">{labelFormat ? labelFormat(label) : label}</p>}
      <ul className="space-y-1">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="text-fg-muted">{p.name}</span>
            <span className="num ml-auto pl-3 font-semibold text-fg">{format ? format(Number(p.value), p) : p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
      {items.map(i => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed
            ? <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} aria-hidden />
            : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />}
          {i.label}
        </li>
      ))}
    </ul>
  )
}
