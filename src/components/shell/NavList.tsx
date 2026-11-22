'use client'
import { NAV_GROUPS, sectionById } from './nav'
import { cn } from '@/components/ui/cn'

export function NavList({ active, onNav, collapsed }: { active: string; onNav: (id: string) => void; collapsed?: boolean }) {
  return (
    <nav aria-label="Navigation principale" className="space-y-5">
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {collapsed
            ? <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden />
            : <div className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">{group.label}</div>}
          <ul className="space-y-0.5">
            {group.ids.map(id => {
              const s = sectionById(id)
              const Icon = s.icon
              const isActive = active === id
              return (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={e => { e.preventDefault(); onNav(id) }}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? s.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg text-sm transition-colors',
                      collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-9 px-3',
                      isActive ? 'bg-sidebar-active font-medium text-sidebar-fg' : 'text-sidebar-muted hover:bg-surface-2 hover:text-sidebar-fg',
                    )}
                  >
                    {isActive && !collapsed && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-primary' : 'text-sidebar-muted group-hover:text-sidebar-fg')} aria-hidden />
                    {collapsed ? <span className="sr-only">{s.label}</span> : <span className="truncate">{s.label}</span>}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
