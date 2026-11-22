'use client'
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { ChartTooltip, Legend } from '@/components/charts/ChartTooltip'
import { eurosCompact } from './commun'

/**
 * Barres divergentes autour de zéro : une barre par culture, triées de la
 * plus rentable à la moins rentable. Vert (chart-1) au-dessus de zéro,
 * rose (chart-3) en dessous ; le sens de la barre et le signe de
 * l'étiquette portent aussi l'information (palette validée en clair et en
 * sombre, écart CVD dans la bande 6–8 en sombre, d'où ce double codage).
 */
export function MargeChart({ data, serie }: {
  data: { label: string; value: number }[]
  /** « Marge » ou « Marge hors temps » selon que le taux horaire est connu. */
  serie: string
}) {
  const t = useChartTheme()
  const h = Math.max(160, data.length * 34 + 16)
  const min = Math.min(0, ...data.map(d => d.value))
  const max = Math.max(0, ...data.map(d => d.value))
  return (
    <div className="space-y-2">
      <Legend items={[{ label: 'Rentable', color: t.c1 }, { label: 'Déficitaire', color: t.c3 }]} />
      <div style={{ height: h }} className="w-full" role="img"
        aria-label={`${serie} par culture : ${data.map(d => `${d.label} ${eurosCompact(d.value)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[min, max]} />
            <YAxis type="category" dataKey="label" width={112} tickLine={false} axisLine={false} interval={0}
              tick={{ fill: t.muted, fontSize: 12 }} />
            <ReferenceLine x={0} stroke={t.axis} strokeWidth={1} />
            <Tooltip cursor={{ fill: t.cursor }} content={<ChartTooltip format={v => eurosCompact(v)} />} />
            <Bar dataKey="value" name={serie} maxBarSize={18} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.value < 0 ? t.c3 : t.c1}
                  // bout de barre arrondi côté données, ancré à zéro
                  {...({ radius: d.value < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] } as object)} />
              ))}
              <LabelList dataKey="value" content={(props: any) => {
                const { x = 0, y = 0, width = 0, height = 0, value } = props
                const v = Number(value)
                // Étiquette toujours à droite : au bout d'une barre positive, juste
                // après le zéro pour une barre négative (width < 0 dans recharts),
                // pour ne jamais chevaucher les noms de cultures à gauche.
                const fin = Number(x) + Math.max(0, Number(width))
                return (
                  <text x={fin + 6} y={Number(y) + Number(height) / 2} dominantBaseline="central"
                    textAnchor="start" fill={t.text} fontSize={12} fontWeight={600}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {v > 0 ? '+' : ''}{eurosCompact(v)}
                  </text>
                )
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
