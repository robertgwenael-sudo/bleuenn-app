'use client'
import { Command } from 'cmdk'
import {
  BookOpen, CalendarDays, CopyPlus, Fence, Keyboard, LogOut, Monitor, Moon, Plus, Scissors, Store, Sun, Users,
} from 'lucide-react'
import { SECTIONS } from './nav'
import { useTheme } from './theme'
import type { Intent } from './ui-context'

const groupCls = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.68rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle'
const itemCls = 'flex h-11 cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-sm text-fg data-[selected=true]:bg-surface-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-fg-muted'

function Shortcut({ keys }: { keys: string[] }) {
  return (
    <span className="ml-auto hidden gap-1 sm:flex">
      {keys.map(k => <kbd key={k} className="min-w-[1.25rem] rounded border border-border bg-surface-2 px-1 text-center font-sans text-[0.7rem] text-fg-muted">{k}</kbd>)}
    </span>
  )
}

export function CommandPalette({ open, onOpenChange, onNav, onIntent, onTeam, onShortcuts, onDuplicate, ctx }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onNav: (id: string) => void
  onIntent: (section: string, intent: Intent) => void
  onTeam: () => void
  onShortcuts: () => void
  onDuplicate?: () => void
  ctx: any
}) {
  const { setTheme } = useTheme()
  const run = (fn: () => void) => { onOpenChange(false); setTimeout(fn, 0) }

  const actions: { label: string; icon: React.ReactNode; keys: string[]; section: string; intent: Intent; words: string }[] = [
    { label: 'Saisir une récolte', icon: <Scissors />, keys: ['N', 'R'], section: 'recoltes', intent: 'new-harvest', words: 'récolte tiges cueillette ajouter' },
    { label: 'Enregistrer une vente', icon: <Store />, keys: ['N', 'V'], section: 'ventes', intent: 'new-sale', words: 'vente marché fleuriste ajouter' },
    { label: 'Créer un jardin', icon: <Fence />, keys: ['N', 'J'], section: 'jardins', intent: 'new-garden', words: 'jardin parcelle ajouter' },
    { label: 'Ajouter une culture au catalogue', icon: <BookOpen />, keys: ['N', 'C'], section: 'catalogue', intent: 'new-culture', words: 'culture variété catalogue ajouter' },
  ]

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Palette de commandes"
      loop
      overlayClassName="fixed inset-0 z-[80] bg-[rgb(20_22_18/0.4)] backdrop-blur-[2px] data-[state=open]:animate-fade-in"
      contentClassName="fixed left-1/2 top-[12vh] z-[81] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop data-[state=open]:animate-fade-in"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Command.Input
          autoFocus
          placeholder="Rechercher une section ou une action…"
          className="h-14 w-full bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-subtle"
        />
        <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 text-[0.7rem] text-fg-muted sm:block">Échap</kbd>
      </div>
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="py-10 text-center text-sm text-fg-muted">Aucun résultat.</Command.Empty>

        <Command.Group heading="Actions" className={groupCls}>
          {actions.map(a => (
            <Command.Item key={a.intent} value={`${a.label} ${a.words}`} className={itemCls}
              onSelect={() => run(() => onIntent(a.section, a.intent))}>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft [&_svg]:!text-primary"><Plus /></span>
              {a.label}
              <Shortcut keys={a.keys} />
            </Command.Item>
          ))}
          <Command.Item value="Gérer l'équipe inviter membre" className={itemCls} onSelect={() => run(onTeam)}>
            <Users />Gérer l’équipe de la ferme
          </Command.Item>
          {onDuplicate && ctx.isOwner && ctx.activeSeason && (
            <Command.Item value="Reprendre ce plan l'année suivante dupliquer saison copier plan" className={itemCls} onSelect={() => run(onDuplicate)}>
              <CopyPlus />Reprendre le plan de {ctx.activeSeason.name} l’année suivante
            </Command.Item>
          )}
        </Command.Group>

        <Command.Group heading="Aller à" className={groupCls}>
          {SECTIONS.map(s => {
            const Icon = s.icon
            return (
              <Command.Item key={s.id} value={`${s.label} ${s.description}`} className={itemCls} onSelect={() => run(() => onNav(s.id))}>
                <Icon />
                <span>{s.label}</span>
                <span className="hidden truncate text-xs text-fg-subtle sm:inline">— {s.description}</span>
                <Shortcut keys={['G', s.key.toUpperCase()]} />
              </Command.Item>
            )
          })}
        </Command.Group>

        {(ctx.seasons || []).length > 1 && (
          <Command.Group heading="Saison" className={groupCls}>
            {ctx.seasons.map((s: any) => (
              <Command.Item key={s.id} value={`Basculer sur ${s.name}`} className={itemCls}
                disabled={s.id === ctx.activeSeason?.id}
                onSelect={() => run(() => ctx.switchSeason(s.id))}>
                <CalendarDays />Basculer sur {s.name}
                {s.id === ctx.activeSeason?.id && <span className="ml-auto text-xs text-fg-subtle">active</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Préférences" className={groupCls}>
          <Command.Item value="Thème clair" className={itemCls} onSelect={() => run(() => setTheme('light'))}><Sun />Thème clair</Command.Item>
          <Command.Item value="Thème sombre" className={itemCls} onSelect={() => run(() => setTheme('dark'))}><Moon />Thème sombre</Command.Item>
          <Command.Item value="Thème système" className={itemCls} onSelect={() => run(() => setTheme('system'))}><Monitor />Thème du système</Command.Item>
          <Command.Item value="Raccourcis clavier aide" className={itemCls} onSelect={() => run(onShortcuts)}><Keyboard />Raccourcis clavier<Shortcut keys={['?']} /></Command.Item>
          <Command.Item value="Se déconnecter déconnexion" className={itemCls} onSelect={() => run(() => ctx.signOut())}><LogOut />Se déconnecter</Command.Item>
        </Command.Group>
      </Command.List>
      <div className="hidden items-center gap-4 border-t border-border bg-surface-2/60 px-4 py-2 text-xs text-fg-subtle sm:flex">
        <span><kbd className="font-sans">↑↓</kbd> naviguer</span>
        <span><kbd className="font-sans">↵</kbd> valider</span>
        <span><kbd className="font-sans">Échap</kbd> fermer</span>
      </div>
    </Command.Dialog>
  )
}
