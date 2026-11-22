'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Intentions transmises par la palette de commandes ou les raccourcis aux
 * sections (ex. « nouveau jardin » ouvre la modale de la section Jardins).
 */
export type Intent = 'new-garden' | 'new-culture' | 'new-harvest' | 'new-sale' | 'focus-search'

type Ctx = {
  intent: { name: Intent; n: number } | null
  sendIntent: (name: Intent) => void
  clearIntent: () => void
  openTeam: () => void
  openPalette: () => void
  openShortcuts: () => void
}
const UICtx = createContext<Ctx | null>(null)

export function UIProvider({ children, openTeam, openPalette, openShortcuts }: {
  children: React.ReactNode; openTeam: () => void; openPalette: () => void; openShortcuts: () => void
}) {
  const [intent, setIntent] = useState<Ctx['intent']>(null)
  const sendIntent = useCallback((name: Intent) => setIntent({ name, n: Date.now() }), [])
  const clearIntent = useCallback(() => setIntent(null), [])
  return (
    <UICtx.Provider value={{ intent, sendIntent, clearIntent, openTeam, openPalette, openShortcuts }}>
      {children}
    </UICtx.Provider>
  )
}

export function useUI() {
  const c = useContext(UICtx)
  if (!c) throw new Error('useUI hors de <UIProvider>')
  return c
}

/** Exécute `fn` quand l'intention `name` arrive, puis la consomme. */
export function useIntent(name: Intent, fn: () => void) {
  const ui = useContext(UICtx)
  const current = ui?.intent
  useEffect(() => {
    if (current?.name === name) {
      // laisse la section finir son rendu (focus, ouverture de modale)
      setTimeout(() => { fn(); ui?.clearIntent() }, 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.n])
}
