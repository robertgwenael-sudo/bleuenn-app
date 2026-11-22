'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
type Ctx = { theme: ThemeChoice; resolved: 'light' | 'dark'; setTheme: (t: ThemeChoice) => void; toggle: () => void }

const ThemeCtx = createContext<Ctx>({ theme: 'system', resolved: 'light', setTheme: () => {}, toggle: () => {} })
const KEY = 'bleuenn-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('system')
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    try { setThemeState((localStorage.getItem(KEY) as ThemeChoice) || 'system') } catch {}
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch {}
  }, [])
  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme])

  return <ThemeCtx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
