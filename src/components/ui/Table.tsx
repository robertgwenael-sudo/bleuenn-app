'use client'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from './cn'

/**
 * Conteneur de tableau : défilement horizontal ET vertical interne,
 * pour que l'en-tête (sticky top) et la 1re colonne restent visibles.
 */
export function TableContainer({ children, className, maxHeight = true, label }: {
  children: React.ReactNode; className?: string; maxHeight?: boolean | string; label?: string
}) {
  const mh = maxHeight === true ? 'max-h-[calc(100dvh-14rem)]' : typeof maxHeight === 'string' ? maxHeight : ''
  return (
    <div role="region" aria-label={label} tabIndex={0}
      className={cn('relative overflow-auto rounded-card border border-border bg-surface shadow-card focus-visible:ring-2 focus-visible:ring-ring', mh, className)}>
      {children}
    </div>
  )
}

export type SortDir = 'asc' | 'desc'

export function useSort<K extends string>(initial: K, dir: SortDir = 'asc') {
  const [key, setKey] = useState<K>(initial)
  const [d, setD] = useState<SortDir>(dir)
  const toggle = (k: K) => {
    if (k === key) setD(x => (x === 'asc' ? 'desc' : 'asc'))
    else { setKey(k); setD('asc') }
  }
  return { key, dir: d, toggle }
}

export function useSorted<T>(rows: T[], get: (row: T) => string | number | null | undefined, dir: SortDir) {
  return useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const av = get(a), bv = get(b)
      let c: number
      if (typeof av === 'string' || typeof bv === 'string') c = String(av ?? '').localeCompare(String(bv ?? ''), 'fr')
      else c = ((av as number) || 0) - ((bv as number) || 0)
      return dir === 'asc' ? c : -c
    })
    return out
  }, [rows, get, dir])
}

export function SortHeader({ label, active, dir, onClick, align = 'left', className }: {
  label: React.ReactNode; active: boolean; dir: SortDir; onClick: () => void; align?: 'left' | 'right' | 'center'; className?: string
}) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={onClick}
        className={cn('inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-fg',
          align === 'right' && 'flex-row-reverse', active && 'text-fg')}>
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </th>
  )
}
