'use client'
import { useRef } from 'react'
import { cn } from './cn'

type Opt<T extends string> = { value: T; label: React.ReactNode; icon?: React.ReactNode }

function useRoving<T extends string>(options: Opt<T>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const n = options.length
    let j = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = n - 1
    if (j >= 0) { e.preventDefault(); onChange(options[j].value); refs.current[j]?.focus() }
  }
  return { refs, onKeyDown, active: value }
}

/** Onglets (role=tablist). Les panneaux restent rendus par l'appelant. */
export function Tabs<T extends string>({ options, value, onChange, label, className }: {
  options: Opt<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string
}) {
  const { refs, onKeyDown } = useRoving(options, value, onChange)
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 border-b border-border', className)}>
      {options.map((o, i) => (
        <button key={o.value} ref={el => { refs.current[i] = el }} role="tab" type="button"
          aria-selected={value === o.value} tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)} onKeyDown={e => onKeyDown(e, i)}
          className={cn('-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === o.value ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

/** Choix exclusif compact (role=radiogroup), grandes cibles tactiles. */
export function Segmented<T extends string>({ options, value, onChange, label, className, size = 'md', id }: {
  options: Opt<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string; size?: 'sm' | 'md' | 'lg'; id?: string
}) {
  const { refs, onKeyDown } = useRoving(options, value, onChange)
  const h = { sm: 'h-8 text-xs', md: 'h-10 text-sm', lg: 'h-12 text-sm' }[size]
  return (
    <div id={id} role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-1 rounded-btn bg-surface-2 p-1', className)}>
      {options.map((o, i) => (
        <button key={o.value} ref={el => { refs.current[i] = el }} role="radio" type="button"
          aria-checked={value === o.value} tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)} onKeyDown={e => onKeyDown(e, i)}
          className={cn('inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.5rem] px-3 font-medium transition-all', h,
            value === o.value ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-fg-muted hover:text-fg')}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}
