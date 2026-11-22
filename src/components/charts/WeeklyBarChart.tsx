'use client'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './useChartTheme'
import { ChartTooltip } from './ChartTooltip'

const compact = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)} k€` : `${v.toLocaleString('fr-FR')} €`)

/** Colonnes hebdomadaires, une seule série, extrémité arrondie de 4 px. */
export function WeeklyBarChart({ data, dataKey, label, format, height = 260, ariaLabel, tickLabel, tooltipLabel }: {
  data: Record<string, number>[]
  dataKey: string
  label: string
  format: (v: number) => string
  height?: number
  ariaLabel: string
  /** Libellé de l'axe pour l'index `week` (semaines datées) ; défaut « S{n} » une sur quatre. */
  tickLabel?: (w: number) => string
  /** Libellé d'infobulle pour l'index `week` ; défaut « Semaine {n} ». */
  tooltipLabel?: (w: number) => string
}) {
  const t = useChartTheme()
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
          <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: t.grid }} interval={0}
            tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={tickLabel ?? ((w: number) => (w % 4 === 1 ? `S${w}` : ''))} />
          <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={compact} allowDecimals={false} />
          <Tooltip cursor={{ fill: t.cursor }} content={<ChartTooltip format={v => format(v)} labelFormat={tooltipLabel ?? ((w: number) => `Semaine ${w}`)} />} />
          <Bar dataKey={dataKey} name={label} fill={t.c1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
