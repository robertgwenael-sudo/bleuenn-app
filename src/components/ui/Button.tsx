'use client'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost' | 'accent'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
  accent: 'bg-accent text-accent-fg shadow-xs hover:opacity-90',
  secondary: 'border border-border bg-surface text-fg shadow-xs hover:bg-surface-2 hover:border-border-strong',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white shadow-xs hover:opacity-90 dark:text-[rgb(40_10_10)]',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  ref?: React.Ref<HTMLButtonElement>
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-btn font-medium transition-[background-color,border-color,color,opacity,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
        variants[variant], sizes[size], className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
