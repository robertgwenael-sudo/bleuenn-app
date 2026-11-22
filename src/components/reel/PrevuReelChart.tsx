'use client'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { ChartTooltip, Legend } from '@/components/charts/ChartTooltip'

export interface PointSemaine {
  semaine: number
  lundi: string
  prevu: number
  /** null pour une semaine future : pas encore de réel. */
  reel: number | null
}

/**
 * Prévu contre réel semaine par semaine, sur UN axe (même unité) :
 * le réel en colonnes, le prévu en ligne en escalier, pour lire l'écart
 * sans double échelle. Réticule et infobulle au survol.
 */
export function PrevuReelChart({ data, format, compact, semaineCourante, ariaLabel, libelleReel = 'Réel', height = 280 }: {
  data: PointSemaine[]
  format: (v: number) => string
  compact: (v: number) => string
  semaineCourante?: string
  ariaLabel: string
  libelleReel?: string
  height?: number
}) {
  const t = useChartTheme()
  return (
    <div>
      <div className="mb-3">
        <Legend items={[{ label: libelleReel, color: t.c1 }, { label: 'Prévu', color: t.c2, dashed: true }]} />
      </div>
      <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
            <XAxis dataKey="lundi" tickLine={false} axisLine={{ stroke: t.grid }} interval="preserveStartEnd" minTickGap={14}
              tick={{ fill: t.axis, fontSize: 11 }}
              tickFormatter={(l: string) => `S${data.find(d => d.lundi === l)?.semaine ?? ''}`} />
            <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={compact} allowDecimals={false} />
            {semaineCourante && <ReferenceLine x={semaineCourante} stroke={t.axis} strokeDasharray="2 3" />}
            <Tooltip cursor={{ fill: t.cursor }}
              content={<ChartTooltip format={v => format(v)}
                labelFormat={(l: string) => {
                  const d = data.find(x => x.lundi === l)
                  return d ? `Semaine ${d.semaine}${l === semaineCourante ? ' (en cours)' : ''}` : l
                }} />} />
            <Bar dataKey="reel" name={libelleReel} fill={t.c1} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Line dataKey="prevu" name="Prévu" type="stepAfter" stroke={t.c2} strokeWidth={2} strokeDasharray="5 3"
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface, fill: t.c2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
