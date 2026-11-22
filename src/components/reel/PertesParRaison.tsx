'use client'
import { LIBELLES_RAISONS, type PerteParRaison } from '@/lib/domain'
import { fmtPct, fmtTiges } from './commun'

/**
 * Répartition des pertes par raison : barres horizontales d'une seule
 * teinte (une seule série), triées, valeur et part écrites en clair.
 * Toutes les raisons restent listées, même à zéro.
 */
export function PertesParRaisonBarres({ data }: { data: PerteParRaison[] }) {
  const tri = [...data].sort((a, b) => b.tiges - a.tiges)
  const max = Math.max(1, ...tri.map(d => d.tiges))
  return (
    <ul className="space-y-2.5" aria-label="Pertes par raison">
      {tri.map(d => (
        <li key={d.reason} className="group grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
          title={`${LIBELLES_RAISONS[d.reason]} : ${fmtTiges(d.tiges)} tiges, ${fmtPct(d.part)} des pertes${d.taux !== null ? `, ${fmtPct(d.taux)} des récoltes` : ''}`}>
          <span className="truncate text-fg-muted">{LIBELLES_RAISONS[d.reason]}</span>
          <span className="relative h-3 rounded-sm bg-surface-2" aria-hidden>
            {d.tiges > 0 && (
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                style={{ width: `${Math.max(1.5, (d.tiges / max) * 100)}%` }} />
            )}
          </span>
          <span className="num w-[7.5rem] text-right">
            <span className="font-semibold text-fg">{fmtTiges(d.tiges)}</span>
            <span className="text-xs text-fg-subtle"> tiges · {fmtPct(d.part)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
