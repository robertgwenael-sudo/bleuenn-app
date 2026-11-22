'use client'
import * as DM from '@radix-ui/react-dropdown-menu'
import { Check, Keyboard, LogOut, Monitor, Moon, Sun, UserRound, Users } from 'lucide-react'
import { useTheme, type ThemeChoice } from './theme'
import { cn } from '@/components/ui/cn'

const item = 'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-sm text-fg outline-none data-[highlighted]:bg-surface-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-fg-subtle'

export function initials(name?: string | null, email?: string | null) {
  const src = (name || '').trim() || (email || '?')
  const parts = src.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (name && parts[1] ? parts[1][0] : '')).toUpperCase()
}

export function UserMenu({ ctx, onProfile, onTeam, onShortcuts }: { ctx: any; onProfile: () => void; onTeam: () => void; onShortcuts: () => void }) {
  const { theme, setTheme } = useTheme()
  const name = ctx.profile?.owner_name
  const email = ctx.profile?.email || ctx.user?.email
  const themes: { v: ThemeChoice; label: string; icon: React.ReactNode }[] = [
    { v: 'light', label: 'Clair', icon: <Sun /> },
    { v: 'dark', label: 'Sombre', icon: <Moon /> },
    { v: 'system', label: 'Système', icon: <Monitor /> },
  ]
  return (
    <DM.Root>
      <DM.Trigger aria-label="Menu utilisateur"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent ring-1 ring-border transition hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {initials(name, email)}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8}
          className="z-[70] w-64 rounded-xl border border-border bg-surface p-1.5 shadow-pop data-[state=open]:animate-fade-in">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-fg">{name || 'Mon compte'}</p>
            <p className="truncate text-xs text-fg-muted">{email}</p>
            {ctx.profile?.farm_name && <p className="mt-1 truncate text-xs text-fg-subtle">{ctx.profile.farm_name}</p>}
          </div>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item className={item} onSelect={onProfile}><UserRound />Profil de la ferme</DM.Item>
          <DM.Item className={item} onSelect={onTeam}><Users />Équipe</DM.Item>
          <DM.Item className={item} onSelect={onShortcuts}><Keyboard />Raccourcis clavier<kbd className="ml-auto text-xs text-fg-subtle">?</kbd></DM.Item>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Label className="px-2.5 pb-1 pt-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">Thème</DM.Label>
          <DM.RadioGroup value={theme} onValueChange={v => setTheme(v as ThemeChoice)}>
            {themes.map(t => (
              <DM.RadioItem key={t.v} value={t.v} className={item}>
                {t.icon}{t.label}
                <DM.ItemIndicator className="ml-auto"><Check className="!text-primary" /></DM.ItemIndicator>
              </DM.RadioItem>
            ))}
          </DM.RadioGroup>
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item className={cn(item, 'text-danger [&_svg]:text-danger')} onSelect={() => ctx.signOut()}><LogOut />Se déconnecter</DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
