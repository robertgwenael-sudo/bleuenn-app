'use client'
import { Hammer } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/ui'
import type { useBleuenn } from '@/hooks/useBleuenn'

// Écran en construction.
export default function Exports({ ctx: _ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Exports" description="Fichiers CSV pour le comptable" />
      <EmptyState icon={<Hammer className="h-6 w-6" aria-hidden />} title="Bientôt disponible" description="Cet écran est en cours de construction." />
    </div>
  )
}
