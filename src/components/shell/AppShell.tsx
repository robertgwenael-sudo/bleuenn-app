'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomNav } from './BottomNav'
import { MobileDrawer } from './MobileDrawer'
import { CommandPalette } from './CommandPalette'
import { ShortcutsDialog } from './ShortcutsDialog'
import { ProfileDialog } from './ProfileDialog'
import { DemoBanner } from './DemoBanner'
import { DuplicatePlanDialog } from './DuplicatePlanDialog'
import { FieldBackdrop } from './FieldBackdrop'
import { SECTIONS } from './nav'
import { UIProvider, useUI, type Intent } from './ui-context'
import TeamPanel from '@/components/TeamPanel'
import { cn } from '@/components/ui/cn'

const COLLAPSE_KEY = 'bleuenn-sidebar-collapsed'

const CREATE_KEYS: Record<string, [string, Intent]> = {
  r: ['recoltes', 'new-harvest'],
  v: ['ventes', 'new-sale'],
  j: ['jardins', 'new-garden'],
  c: ['catalogue', 'new-culture'],
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

function Shell({ ctx, section, onNav, children, palette, setPalette, setShortcuts, setTeam, setDuplicate }: {
  ctx: any; section: string; onNav: (id: string) => void; children: React.ReactNode
  palette: boolean; setPalette: (o: boolean) => void; setShortcuts: (o: boolean) => void; setTeam: (o: boolean) => void
  setDuplicate: (o: boolean) => void
}) {
  const ui = useUI()
  const reduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [profile, setProfile] = useState(false)
  const pending = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1') } catch {}
  }, [])
  const toggleCollapsed = useCallback(() => {
    setCollapsed(c => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch {}
      return !c
    })
  }, [])

  const goIntent = useCallback((id: string, intent: Intent) => {
    onNav(id)
    ui.sendIntent(intent)
  }, [onNav, ui])

  // Raccourcis clavier globaux
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!palette)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const k = e.key.toLowerCase()
      const prev = pending.current
      pending.current = null
      if (prev && Date.now() - prev.at < 1200) {
        if (prev.key === 'g') {
          const s = SECTIONS.find(x => x.key === k)
          if (s) { e.preventDefault(); onNav(s.id) }
          return
        }
        if (prev.key === 'n' && CREATE_KEYS[k]) {
          e.preventDefault()
          goIntent(...CREATE_KEYS[k])
          return
        }
      }
      if (k === 'g' || k === 'n') { pending.current = { key: k, at: Date.now() }; return }
      if (e.key === '?') { e.preventDefault(); setShortcuts(true); return }
      if (e.key === '[') { e.preventDefault(); toggleCollapsed() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, setPalette, setShortcuts, onNav, goIntent, toggleCollapsed])

  const nav = (id: string) => { onNav(id); setDrawer(false) }

  return (
    <div className="relative isolate min-h-screen">
      <FieldBackdrop section={section} />
      <a href="#contenu" className="sr-only z-[100] rounded-md bg-surface px-3 py-2 text-sm font-medium text-fg shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Aller au contenu
      </a>
      <Sidebar active={section} onNav={nav} collapsed={collapsed} onToggle={toggleCollapsed} ctx={ctx} onTeam={() => setTeam(true)} />
      <MobileDrawer open={drawer} onOpenChange={setDrawer} active={section} onNav={nav} ctx={ctx} onDuplicate={() => setDuplicate(true)} />

      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar')}>
        <DemoBanner />
        <Topbar section={section} ctx={ctx} onMenu={() => setDrawer(true)} onPalette={() => setPalette(true)}
          onProfile={() => setProfile(true)} onTeam={() => setTeam(true)} onShortcuts={() => setShortcuts(true)}
          onDuplicate={() => setDuplicate(true)} />
        <main id="contenu" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-6 sm:pt-7 lg:px-8 lg:pb-12">
          <motion.div
            key={section}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <BottomNav active={section} onNav={nav} onMore={() => setDrawer(true)} />
      <CommandPalette open={palette} onOpenChange={setPalette} onNav={onNav} onIntent={goIntent}
        onTeam={() => setTeam(true)} onShortcuts={() => setShortcuts(true)} onDuplicate={() => setDuplicate(true)} ctx={ctx} />
      <ProfileDialog open={profile} onOpenChange={setProfile} ctx={ctx} />
    </div>
  )
}

export function AppShell({ ctx, section, onNav, children }: { ctx: any; section: string; onNav: (id: string) => void; children: React.ReactNode }) {
  const [palette, setPalette] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)
  const [team, setTeam] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  return (
    <UIProvider openTeam={() => setTeam(true)} openPalette={() => setPalette(true)} openShortcuts={() => setShortcuts(true)}>
      <Shell ctx={ctx} section={section} onNav={onNav} palette={palette} setPalette={setPalette} setShortcuts={setShortcuts} setTeam={setTeam} setDuplicate={setDuplicate}>
        {children}
      </Shell>
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <TeamPanel ctx={ctx} open={team} onOpenChange={setTeam} />
      {ctx.isOwner && <DuplicatePlanDialog ctx={ctx} open={duplicate} onOpenChange={setDuplicate} />}
    </UIProvider>
  )
}
