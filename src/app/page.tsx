'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBleuenn } from '@/hooks/useBleuenn'
import Sidebar from '@/components/Sidebar'
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
import OnboardingModal from '@/components/OnboardingModal'

const SECTIONS = [
  { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
  { id: 'jardins', label: 'Jardins & Planches', icon: '🌱' },
  { id: 'semis', label: 'Semis & Germination', icon: '🌾' },
  { id: 'calendrier', label: 'Calendrier de culture', icon: '📅' },
  { id: 'recoltes', label: 'Récoltes', icon: '✂️' },
  { id: 'ventes', label: 'Ventes', icon: '💰' },
  { id: 'commandes', label: 'Commandes de graines', icon: '📦' },
  { id: 'disponibilite', label: 'Disponibilité', icon: '🌸' },
  { id: 'catalogue', label: 'Catalogue cultures', icon: '🌻' },
  { id: 'verification', label: 'Verification', icon: '📋' },
] as const

const VALID_IDS = new Set(SECTIONS.map(s => s.id))

function getHashSection(): string {
  if (typeof window === 'undefined') return 'dashboard'
  const hash = window.location.hash.replace('#', '')
  return VALID_IDS.has(hash) ? hash : 'dashboard'
}

export default function Home() {
  const ctx = useBleuenn()
  const [section, setSectionState] = useState<string>('dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
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
  }, [])

  // Not logged in
  if (!ctx.user && !ctx.loading) {
    return <AuthScreen signIn={ctx.signIn} signUp={ctx.signUp} />
  }

  // Loading
  if (ctx.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)' }}>
        <div className="text-center animate-fade-in">
          <span className="text-4xl block mb-3">&#x273F;</span>
          <h1 className="font-serif italic text-3xl text-feuille-dark mb-2">Bleuenn</h1>
          <p className="text-terre text-sm tracking-wider">Chargement...</p>
        </div>
      </div>
    )
  }

  // No season yet → onboarding
  if (ctx.seasons.length === 0 && !showOnboarding) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)' }}>
        <div className="card max-w-md text-center p-10">
          <span className="text-3xl block mb-3">&#x273F;</span>
          <h1 className="font-serif italic text-3xl text-feuille-dark mb-2">Bleuenn</h1>
          <p className="text-terre mb-6">Bienvenue ! Creez votre premiere saison pour commencer.</p>
          <button className="btn btn-sage" onClick={() => setShowOnboarding(true)}>
            Creer ma premiere saison
          </button>
        </div>
      </div>
    )
  }

  if (showOnboarding || (ctx.seasons.length === 0)) {
    return <OnboardingModal ctx={ctx} onClose={() => setShowOnboarding(false)} />
  }

  const nav = (id: string) => { setSection(id); setMobileOpen(false) }

  return (
    <div className="flex min-h-screen">
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-feuille-dark text-white rounded-btn px-3 py-2 text-lg shadow-md"
        onClick={() => setMobileOpen(!mobileOpen)}
      >&#x2261;</button>

      <Sidebar
        sections={SECTIONS}
        activeSection={section}
        onNav={nav}
        ctx={ctx}
        mobileOpen={mobileOpen}
      />

      <main className="flex-1 lg:ml-64 p-6 lg:p-9 min-h-screen">
        <div className="animate-fade-in" key={section}>
          {section === 'dashboard' && <Dashboard ctx={ctx} />}
          {section === 'jardins' && <Gardens ctx={ctx} />}
          {section === 'semis' && <Semis ctx={ctx} />}
          {section === 'calendrier' && <Calendar ctx={ctx} />}
          {section === 'recoltes' && <Recoltes ctx={ctx} />}
          {section === 'ventes' && <Ventes ctx={ctx} />}
          {section === 'commandes' && <Commandes ctx={ctx} />}
          {section === 'disponibilite' && <Disponibilite ctx={ctx} />}
          {section === 'catalogue' && <Catalogue ctx={ctx} />}
          {section === 'verification' && <Verification ctx={ctx} />}
        </div>
      </main>
    </div>
  )
}
