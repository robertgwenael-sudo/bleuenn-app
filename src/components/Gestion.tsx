'use client'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui'
import { aujourdhuiParis, type useBleuenn } from '@/hooks/useBleuenn'
import { useGestion, type GestionCtx } from '@/hooks/useGestion'
import { useDonneesGestion } from '@/components/gestion/donnees'
import { TableauDeBord } from '@/components/gestion/TableauDeBord'
import { Banque } from '@/components/gestion/Banque'
import { Comptes } from '@/components/gestion/Comptes'
import { Export } from '@/components/gestion/Export'

type Onglet = 'tableau' | 'banque' | 'comptes' | 'export'

export default function Gestion({ ctx, onNav }: { ctx: ReturnType<typeof useBleuenn>; onNav: (id: string) => void }) {
  const gctx: GestionCtx = { farm: ctx.farm as any, activeSeason: ctx.activeSeason as any, seasons: ctx.seasons as any, user: ctx.user }
  const g = useGestion(gctx)
  const aujourdhui = ctx.today || aujourdhuiParis()
  const d = useDonneesGestion(g, aujourdhui)
  const [onglet, setOnglet] = useState<Onglet>('tableau')

  if (!ctx.farm && !ctx.activeSeason) {
    return (
      <div>
        <PageHeader title="Gestion" description="Trésorerie, banque et export pour le comptable" />
        <Card><EmptyState title="Aucune ferme" description="Créez une saison pour commencer." /></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Gestion" description="Encaissements, dépenses, banque et export pour le comptable — sans TVA" />
      {g.erreur ? (
        <Card role="alert" className="flex items-start gap-3 border-danger/30 p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-fg">Les données de gestion n’ont pas pu être lues</p>
            <p className="mt-0.5 text-fg-muted">{g.erreur}</p>
            <p className="mt-0.5 text-fg-muted">Aucun total n’est affiché plutôt qu’un total faux.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => g.reload()}>Réessayer</Button>
          </div>
        </Card>
      ) : g.loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}</div>
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : (
        <>
          <Tabs label="Gestion" value={onglet} onChange={setOnglet} className="mb-5 overflow-x-auto"
            options={[
              { value: 'tableau', label: <span className="whitespace-nowrap">Tableau de bord</span> },
              { value: 'banque', label: <span className="whitespace-nowrap">Banque · {d.nonRapproches.length}<span className="hidden sm:inline"> à rapprocher</span></span> },
              { value: 'comptes', label: 'Comptes' },
              { value: 'export', label: <span className="whitespace-nowrap">Export<span className="hidden sm:inline"> comptable</span></span> },
            ]} />
          <div role="tabpanel">
            {onglet === 'tableau' && <TableauDeBord d={d} versBanque={() => setOnglet('banque')} versJustificatifs={() => onNav('justificatifs')} versComptes={() => setOnglet('comptes')} />}
            {onglet === 'banque' && <Banque g={g} d={d} ctx={gctx} aujourdhui={aujourdhui} versComptes={() => setOnglet('comptes')} />}
            {onglet === 'comptes' && <Comptes g={g} d={d} aujourdhui={aujourdhui} />}
            {onglet === 'export' && <Export g={g} d={d} aujourdhui={aujourdhui} />}
          </div>
        </>
      )}
    </div>
  )
}
