'use client'
import { Menu, Moon, Search, Sun } from 'lucide-react'
import { sectionById } from './nav'
import { SeasonSelect } from './SeasonSelect'
import { UserMenu } from './UserMenu'
import { useTheme } from './theme'
import { LogoMark } from './Logo'

export function Topbar({ section, ctx, onMenu, onPalette, onProfile, onTeam, onShortcuts, onDuplicate }: {
  section: string; ctx: any; onMenu: () => void; onPalette: () => void; onProfile: () => void; onTeam: () => void; onShortcuts: () => void; onDuplicate?: () => void
}) {
  const s = sectionById(section)
  const { resolved, toggle } = useTheme()
  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5 lg:px-8">
      <button type="button" onClick={onMenu} aria-label="Ouvrir le menu"
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      <LogoMark className="h-7 w-7 lg:hidden" />
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden truncate text-fg-subtle sm:inline">{ctx.activeSeason?.name}</span>
        <span className="hidden text-border-strong sm:inline" aria-hidden>/</span>
        <span className="truncate font-semibold text-fg">{s.label}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={onPalette}
          className="hidden h-9 w-60 items-center whitespace-nowrap gap-2 rounded-btn border border-border bg-surface px-3 text-sm text-fg-subtle shadow-xs transition hover:border-border-strong md:flex">
          <Search className="h-4 w-4" aria-hidden />
          <span className="truncate">Rechercher…</span>
          <kbd className="ml-auto rounded border border-border bg-surface-2 px-1.5 font-sans text-[0.7rem] text-fg-muted">⌘K</kbd>
        </button>
        <button type="button" onClick={onPalette} aria-label="Palette de commandes"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 md:hidden">
          <Search className="h-5 w-5" />
        </button>
        <SeasonSelect ctx={ctx} compact onDuplicate={onDuplicate} className="hidden w-48 sm:flex" />
        <button type="button" onClick={toggle} aria-label={resolved === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg sm:flex">
          {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>
        <UserMenu ctx={ctx} onProfile={onProfile} onTeam={onTeam} onShortcuts={onShortcuts} />
      </div>
    </header>
  )
}
