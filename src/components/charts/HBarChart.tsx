'use client'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from './useChartTheme'
import { ChartTooltip } from './ChartTooltip'

/**
 * Barres horizontales, une seule série (une seule couleur), valeur au bout
 * de la barre. Pour comparer des montants entre catégories nominales.
 */
export function HBarChart({ data, format, seriesName, height }: {
  data: { label: string; value: number }[]
  format: (v: number) => string
  seriesName: string
  height?: number
}) {
  const t = useChartTheme()
  const h = height ?? Math.max(140, data.length * 44)
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 76, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(max, 1)]} />
          <YAxis type="category" dataKey="label" width={96} tickLine={false} axisLine={false}
            tick={{ fill: t.muted, fontSize: 12 }} />
          <Tooltip cursor={{ fill: t.cursor }} content={<ChartTooltip format={v => format(v)} />} />
          <Bar dataKey="value" name={seriesName} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={t.c1} />)}
            <LabelList dataKey="value" content={(props: any) => {
              const { x = 0, y = 0, width = 0, height = 0, value } = props
              return (
                <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(height) / 2} dominantBaseline="central"
                  fill={t.text} fontSize={12} fontWeight={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Number(value) > 0 ? format(Number(value)) : '—'}
                </text>
              )
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
