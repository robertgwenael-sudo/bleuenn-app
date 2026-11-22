'use client'
import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from './cn'

/**
 * Dialogue accessible (focus piégé, Échap, retour du focus).
 * Sur téléphone il s'ouvre en feuille depuis le bas, plus facile au pouce.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const w = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size]
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-[60] bg-[rgb(20_22_18/0.45)] backdrop-blur-[2px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <RD.Content
          className={cn(
            'fixed z-[61] flex max-h-[92dvh] w-full flex-col border border-border bg-surface shadow-pop outline-none',
            'inset-x-0 bottom-0 rounded-t-2xl animate-sheet-in',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:animate-dialog-in',
            w, className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4 sm:px-6 sm:pt-5">
            <div className="min-w-0">
              <RD.Title className="font-serif text-xl font-medium text-fg">{title}</RD.Title>
              {description
                ? <RD.Description className="mt-1 text-sm text-fg-muted">{description}</RD.Description>
                : <RD.Description className="sr-only">{typeof title === 'string' ? title : 'Dialogue'}</RD.Description>}
            </div>
            <RD.Close aria-label="Fermer" className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-[18px] w-[18px]" />
            </RD.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 sm:px-6 sm:pb-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-2/50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:rounded-b-2xl sm:px-6">
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
