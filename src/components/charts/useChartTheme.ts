'use client'
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/shell/theme'

const read = (name: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return v ? `rgb(${v.split(/\s+/).join(',')})` : '#888'
}

export type ChartTheme = { c1: string; c2: string; c3: string; grid: string; axis: string; text: string; muted: string; surface: string; cursor: string }
const FALLBACK: ChartTheme = { c1: '#2f7d3a', c2: '#5b6fd0', c3: '#d0567f', grid: '#e5e0d5', axis: '#6b6e64', text: '#1f241e', muted: '#575c52', surface: '#ffffff', cursor: '#f4f1ea' }

/** Couleurs des graphiques lues dans les tokens CSS (suivent le thème). */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme()
  const [t, setT] = useState<ChartTheme>(FALLBACK)
  useEffect(() => {
    // laisse la classe .dark s'appliquer avant de lire les variables
    const id = requestAnimationFrame(() => setT({
      c1: read('chart-1'), c2: read('chart-2'), c3: read('chart-3'),
      grid: read('border'), axis: read('fg-subtle'), text: read('fg'), muted: read('fg-muted'),
      surface: read('surface'), cursor: read('surface-2'),
    }))
    return () => cancelAnimationFrame(id)
  }, [resolved])
  return t
}
