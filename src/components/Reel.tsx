'use client'
import { Hammer } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/ui'
import type { useBleuenn } from '@/hooks/useBleuenn'

// Écran en construction : remplacé par l'agent « prévu/réel ».
export default function Reel({ ctx: _ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Prévu / réel" description="Récoltes, pertes et CA face au prévu" />
      <EmptyState icon={<Hammer className="h-6 w-6" aria-hidden />} title="Bientôt disponible" description="Cet écran est en cours de construction." />
    </div>
  )
}
