'use client'
import { Hammer } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/ui'
import type { useBleuenn } from '@/hooks/useBleuenn'

// Écran en construction.
export default function Rentabilite({ ctx: _ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Coûts & rentabilité" description="Dépenses, temps passé et marge par culture" />
      <EmptyState icon={<Hammer className="h-6 w-6" aria-hidden />} title="Bientôt disponible" description="Cet écran est en cours de construction." />
    </div>
  )
}
