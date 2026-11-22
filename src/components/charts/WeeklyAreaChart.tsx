'use client'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './useChartTheme'
import { ChartTooltip, Legend } from './ChartTooltip'

const compact = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)} k` : v.toLocaleString('fr-FR'))

/**
 * Séries hebdomadaires (semaines 1 à 52) sur UN seul axe, même unité.
 * Lignes de 2 px, aire à ~10 %, réticule + infobulle au survol.
 */
export function WeeklyAreaChart({ data, series, format = v => v.toLocaleString('fr-FR'), height = 280, ariaLabel, tickLabel, tooltipLabel }: {
  data: Record<string, number>[]
  series: { key: string; label: string; color: 'c1' | 'c2' | 'c3' }[]
  format?: (v: number) => string
  height?: number
  ariaLabel: string
  /** Libellé de l'axe pour l'index `week` (semaines datées) ; défaut « S{n} » une sur quatre. */
  tickLabel?: (w: number) => string
  /** Libellé d'infobulle pour l'index `week` ; défaut « Semaine {n} ». */
  tooltipLabel?: (w: number) => string
}) {
  const t = useChartTheme()
  return (
    <div>
      {series.length > 1 && <div className="mb-3"><Legend items={series.map(s => ({ label: s.label, color: t[s.color] }))} /></div>}
      <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
            <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: t.grid }} interval={0}
              tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={tickLabel ?? ((w: number) => (w % 4 === 1 ? `S${w}` : ''))} />
            <YAxis width={48} tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={compact} allowDecimals={false} />
            <Tooltip cursor={{ stroke: t.axis, strokeWidth: 1 }} content={<ChartTooltip format={v => format(v)} labelFormat={tooltipLabel ?? ((w: number) => `Semaine ${w}`)} />} />
            {series.map(s => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={t[s.color]} strokeWidth={2}
                fill={t[s.color]} fillOpacity={0.1} isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface, fill: t[s.color] }} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
