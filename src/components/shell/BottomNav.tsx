'use client'
import { Menu } from 'lucide-react'
import { MOBILE_TABS, sectionById } from './nav'
import { cn } from '@/components/ui/cn'

export function BottomNav({ active, onNav, onMore }: { active: string; onNav: (id: string) => void; onMore: () => void }) {
  const inTabs = (MOBILE_TABS as string[]).includes(active)
  return (
    <nav aria-label="Navigation rapide"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid h-bottomnav grid-cols-5">
        {MOBILE_TABS.map(id => {
          const s = sectionById(id)
          const Icon = s.icon
          const isActive = active === id
          return (
            <li key={id}>
              <a href={`#${id}`} onClick={e => { e.preventDefault(); onNav(id) }} aria-current={isActive ? 'page' : undefined}
                className={cn('flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium', isActive ? 'text-primary' : 'text-fg-muted')}>
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary-soft')}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {s.short}
              </a>
            </li>
          )
        })}
        <li>
          <button type="button" onClick={onMore}
            className={cn('flex h-full w-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium', !inTabs ? 'text-primary' : 'text-fg-muted')}>
            <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', !inTabs && 'bg-primary-soft')}>
              <Menu className="h-5 w-5" aria-hidden />
            </span>
            {inTabs ? 'Plus' : sectionById(active).short}
          </button>
        </li>
      </ul>
    </nav>
  )
}
