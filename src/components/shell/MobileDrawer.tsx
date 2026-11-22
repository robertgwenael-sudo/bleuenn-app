'use client'
import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Logo } from './Logo'
import { NavList } from './NavList'
import { SeasonSelect } from './SeasonSelect'

export function MobileDrawer({ open, onOpenChange, active, onNav, ctx }: {
  open: boolean; onOpenChange: (o: boolean) => void; active: string; onNav: (id: string) => void; ctx: any
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-[55] bg-[rgb(20_22_18/0.45)] data-[state=open]:animate-fade-in lg:hidden" />
        <RD.Content className="fixed inset-y-0 left-0 z-[56] flex w-[84vw] max-w-[320px] flex-col bg-sidebar shadow-pop outline-none animate-drawer-in lg:hidden">
          <RD.Title className="sr-only">Menu</RD.Title>
          <RD.Description className="sr-only">Navigation entre les sections de Bleuenn</RD.Description>
          <div className="flex h-topbar items-center justify-between px-4">
            <Logo />
            <RD.Close aria-label="Fermer le menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2">
              <X className="h-5 w-5" />
            </RD.Close>
          </div>
          <div className="px-4 pb-3">
            <SeasonSelect ctx={ctx} />
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <NavList active={active} onNav={onNav} />
          </div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
