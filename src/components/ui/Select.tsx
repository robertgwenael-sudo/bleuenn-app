import { ChevronDown } from 'lucide-react'
import { cn } from './cn'

/** Select natif stylé : le sélecteur système reste le meilleur au pouce. */
export function Select({ className, wrapperClassName, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string; ref?: React.Ref<HTMLSelectElement> }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select className={cn('field-control cursor-pointer appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  )
}
