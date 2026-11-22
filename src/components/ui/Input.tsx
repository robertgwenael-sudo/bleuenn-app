'use client'
import { useId, cloneElement, isValidElement } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cn } from './cn'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }

export function Input({ className, ...props }: InputProps) {
  return <input className={cn('field-control', className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('field-control py-2', className)} {...props} />
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-medium text-fg-muted', className)} {...props} />
}

/** Champ de formulaire : relie libellé, aide et erreur au contrôle enfant. */
export function Field({ label, hint, error, children, className, htmlFor }: {
  label: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  children: React.ReactElement<any>
  className?: string
  htmlFor?: string
}) {
  const auto = useId()
  const id = htmlFor || (children.props as any).id || auto
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error && <p id={errId} className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
      {!error && hint && <p id={hintId} className="mt-1.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, className, label = 'Rechercher' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        className="field-control pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Effacer la recherche" onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** Saisie numérique au pouce : − [valeur] + (cibles de 44 px). */
export function NumberStepper({ value, onChange, step = 1, min = 0, id, label, size = 'lg', ...rest }: {
  value: string
  onChange: (v: string) => void
  step?: number
  min?: number
  id?: string
  label: string
  size?: 'md' | 'lg'
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>) {
  const n = parseFloat(value) || 0
  const set = (x: number) => onChange(String(Math.max(min, Math.round(x * 100) / 100)))
  const h = size === 'lg' ? 'h-12' : 'h-10'
  return (
    <div className={cn('flex items-stretch overflow-hidden rounded-btn border border-border bg-surface shadow-xs focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20', h)}>
      <button type="button" aria-label={`Diminuer ${label}`} onClick={() => set(n - step)}
        className="flex w-12 shrink-0 items-center justify-center border-r border-border text-fg-muted hover:bg-surface-2 active:bg-surface-3">
        <Minus className="h-4 w-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="num w-0 min-w-0 flex-1 bg-transparent text-center text-base font-semibold text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        step={step}
        onChange={e => onChange(e.target.value)}
        {...rest}
      />
      <button type="button" aria-label={`Augmenter ${label}`} onClick={() => set(n + step)}
        className="flex w-12 shrink-0 items-center justify-center border-l border-border text-fg-muted hover:bg-surface-2 active:bg-surface-3">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
