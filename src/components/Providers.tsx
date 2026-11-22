'use client'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { ThemeProvider, useTheme } from '@/components/shell/theme'

function ThemedToaster() {
  const { resolved } = useTheme()
  // Sur téléphone, les notifications s'affichent en haut : en bas elles
  // masqueraient la barre de navigation et les boutons des feuilles de dialogue.
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setMobile(mq.matches)
    const on = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return (
    <Toaster
      theme={resolved}
      position={mobile ? 'top-center' : 'bottom-right'}
      closeButton
      richColors
      offset={16}
      mobileOffset={{ top: 'calc(0.75rem + env(safe-area-inset-top))', left: 12, right: 12 }}
      toastOptions={{ classNames: { toast: '!font-sans !rounded-xl !shadow-pop', title: '!font-semibold' } }}
    />
  )
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        {children}
        <ThemedToaster />
      </ConfirmProvider>
    </ThemeProvider>
  )
}
