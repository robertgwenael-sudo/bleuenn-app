'use client'
import { PanelLeftClose, PanelLeftOpen, Users } from 'lucide-react'
import { Logo } from './Logo'
import { NavList } from './NavList'
import { cn } from '@/components/ui/cn'

export function Sidebar({ active, onNav, collapsed, onToggle, ctx, onTeam }: {
  active: string; onNav: (id: string) => void; collapsed: boolean; onToggle: () => void; ctx: any; onTeam: () => void
}) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      <div className={cn('flex h-topbar shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <Logo collapsed={collapsed} />
      </div>
      {!collapsed && ctx.profile?.farm_name && (
        <div className="mx-3 mb-3 truncate rounded-lg border border-sidebar-border bg-surface px-3 py-2 text-xs text-fg-muted">
          <span className="font-medium text-fg">{ctx.profile.farm_name}</span>
          {ctx.profile.owner_name ? <span> · {ctx.profile.owner_name}</span> : null}
        </div>
      )}
      <div className={cn('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2 pt-2' : 'px-3')}>
        <NavList active={active} onNav={onNav} collapsed={collapsed} />
      </div>
      <div className={cn('flex shrink-0 gap-1 border-t border-sidebar-border p-3', collapsed ? 'flex-col items-center' : 'items-center')}>
        <button type="button" onClick={onTeam} title="Équipe"
          className={cn('flex items-center gap-2.5 rounded-lg text-sm text-sidebar-muted hover:bg-surface-2 hover:text-sidebar-fg',
            collapsed ? 'h-10 w-10 justify-center' : 'h-9 flex-1 px-3')}>
          <Users className="h-[18px] w-[18px]" aria-hidden />
          {collapsed ? <span className="sr-only">Équipe</span> : <span>Équipe <span className="text-fg-subtle">· {(ctx.teamMembers || []).length}</span></span>}
        </button>
        <button type="button" onClick={onToggle}
          aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
          title={`${collapsed ? 'Déplier' : 'Replier'} ( [ )`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-surface-2 hover:text-sidebar-fg">
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </aside>
  )
}
