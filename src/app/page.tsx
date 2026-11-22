'use client'
import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Sprout } from 'lucide-react'
import { useBleuenn } from '@/hooks/useBleuenn'
import AuthScreen from '@/components/AuthScreen'
import Dashboard from '@/components/Dashboard'
import Gardens from '@/components/Gardens'
import Semis from '@/components/Semis'
import Calendar from '@/components/Calendar'
import Recoltes from '@/components/Recoltes'
import Ventes from '@/components/Ventes'
import Commandes from '@/components/Commandes'
import Disponibilite from '@/components/Disponibilite'
import Verification from '@/components/Verification'
import Catalogue from '@/components/Catalogue'
import Analytique from '@/components/Analytique'
import OnboardingModal from '@/components/OnboardingModal'
import Taches from '@/components/Taches'
import Reel from '@/components/Reel'
import Clients from '@/components/Clients'
import Livraisons from '@/components/Livraisons'
import Rentabilite from '@/components/Rentabilite'
import Exports from '@/components/Exports'
import Journal from '@/components/Journal'
import Factures from '@/components/Factures'
import Fournisseurs from '@/components/Fournisseurs'
import Gestion from '@/components/Gestion'
import Justificatifs from '@/components/Justificatifs'
import { AppShell } from '@/components/shell/AppShell'
import { VALID_IDS } from '@/components/shell/nav'
import { LogoMark } from '@/components/shell/Logo'
import { Button, Skeleton } from '@/components/ui'
import { photos } from '@/lib/images'

function getHashSection(): string {
  if (typeof window === 'undefined') return 'dashboard'
  const hash = window.location.hash.replace('#', '')
  return VALID_IDS.has(hash) ? hash : 'dashboard'
}

/** Squelette de l'application pendant le chargement des données. */
function LoadingShell() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement de vos données…</span>
      <aside className="fixed inset-y-0 left-0 hidden w-sidebar flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5 lg:flex">
        <div className="flex items-center gap-2.5"><LogoMark /><Skeleton className="h-5 w-24" /></div>
        {[4, 4, 3, 2].map((n, g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ))}
      </aside>
      <div className="lg:pl-sidebar">
        <div className="flex h-topbar items-center gap-3 border-b border-border px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="ml-auto h-9 w-9 rounded-full" />
        </div>
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 pt-7 sm:px-6 lg:px-8">
          <Skeleton className="h-44 w-full rounded-card" />
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-card" />
            <Skeleton className="h-72 rounded-card" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const ctx = useBleuenn()
  const [section, setSectionState] = useState<string>('dashboard')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Lire le hash au montage
  useEffect(() => {
    setSectionState(getHashSection())
    const onHash = () => setSectionState(getHashSection())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Setter qui met à jour le hash ET le state
  const setSection = useCallback((id: string) => {
    window.location.hash = id
    setSectionState(id)
    window.scrollTo({ top: 0 })
  }, [])

  // Not logged in
  if (!ctx.user && !ctx.loading) {
    return <AuthScreen signIn={ctx.signIn} signUp={ctx.signUp} resetPassword={ctx.resetPassword} />
  }

  // Loading
  if (ctx.loading) return <LoadingShell />

  // No season yet → onboarding
  if (ctx.seasons.length === 0 && !showOnboarding) {
    return (
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <Image src={photos.champCoucherSoleil} alt="" fill priority sizes="100vw" className="object-cover" placeholder="blur" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/60" />
        <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface/95 p-8 text-center shadow-pop backdrop-blur sm:p-10">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Sprout className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-3xl">Bienvenue sur Bleuenn</h1>
          <p className="mt-2 text-sm text-fg-muted">Créez votre première saison pour commencer à planifier vos cultures.</p>
          <Button size="lg" className="mt-7 w-full" onClick={() => setShowOnboarding(true)}>
            Créer ma première saison
          </Button>
        </div>
      </div>
    )
  }

  if (showOnboarding || (ctx.seasons.length === 0)) {
    return <OnboardingModal ctx={ctx} onClose={() => setShowOnboarding(false)} />
  }

  return (
    <AppShell ctx={ctx} section={section} onNav={setSection}>
      {section === 'dashboard' && <Dashboard ctx={ctx} onNav={setSection} />}
      {section === 'jardins' && <Gardens ctx={ctx} />}
      {section === 'semis' && <Semis ctx={ctx} />}
      {section === 'calendrier' && <Calendar ctx={ctx} />}
      {section === 'recoltes' && <Recoltes ctx={ctx} />}
      {section === 'ventes' && <Ventes ctx={ctx} />}
      {section === 'commandes' && <Commandes ctx={ctx} />}
      {section === 'disponibilite' && <Disponibilite ctx={ctx} />}
      {section === 'analytique' && <Analytique ctx={ctx} />}
      {section === 'catalogue' && <Catalogue ctx={ctx} />}
      {section === 'verification' && <Verification ctx={ctx} />}
      {section === 'taches' && <Taches ctx={ctx} />}
      {section === 'reel' && <Reel ctx={ctx} />}
      {section === 'clients' && <Clients ctx={ctx} />}
      {section === 'livraisons' && <Livraisons ctx={ctx} />}
      {section === 'rentabilite' && <Rentabilite ctx={ctx} />}
      {section === 'exports' && <Exports ctx={ctx} />}
      {section === 'journal' && <Journal ctx={ctx} />}
      {section === 'factures' && <Factures ctx={ctx} />}
      {section === 'fournisseurs' && <Fournisseurs ctx={ctx} />}
      {section === 'gestion' && <Gestion ctx={ctx} onNav={setSection} />}
      {section === 'justificatifs' && <Justificatifs ctx={ctx} />}
    </AppShell>
  )
}
