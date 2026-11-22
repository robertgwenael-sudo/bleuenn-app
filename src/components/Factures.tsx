'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CircleAlert, FileText, Receipt, Settings, TriangleAlert } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton, Stat, Tabs } from '@/components/ui'
import { formatEuros } from '@/lib/domain'
import { reglagesManquants, situationFacture, syntheseFactures } from '@/lib/domain/factures'
import { grouperAFacturer } from '@/lib/domain/factures'
import { totalVente } from '@/lib/domain/ventes'
import { aujourdhuiParis, type useBleuenn } from '@/hooks/useBleuenn'
import { useFactures } from '@/hooks/useFactures'
import { AFacturer } from '@/components/factures/AFacturer'
import { ListeFactures, type LigneListe } from '@/components/factures/ListeFactures'
import { FicheFacture } from '@/components/factures/FicheFacture'
import { Reglages } from '@/components/factures/Reglages'

type Onglet = 'a-facturer' | 'factures' | 'reglages'

export default function Factures({ ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  const f = useFactures({ activeSeason: ctx.activeSeason as any, seasons: ctx.seasons as any, user: ctx.user })
  const aujourdhui = ctx.today || aujourdhuiParis()
  const [onglet, setOnglet] = useState<Onglet>('a-facturer')
  const [ouverte, setOuverte] = useState<string | null>(null)

  const lignes: LigneListe[] = useMemo(() => f.invoices.map(x => ({
    f: x, s: situationFacture(x, f.paiementsParFacture.get(x.id) ?? [], aujourdhui),
  })), [f.invoices, f.paiementsParFacture, aujourdhui])
  const synthese = useMemo(() => syntheseFactures(lignes.map(l => ({ kind: l.f.kind, s: l.s }))), [lignes])
  const nbAFacturer = useMemo(
    () => grouperAFacturer(f.ventes, f.liens, f.clients, v => totalVente(v)).reduce((n, g) => n + g.ventes.length, 0),
    [f.ventes, f.liens, f.clients])
  const manque = reglagesManquants(f.billing)
  const fiche = ouverte ? lignes.find(l => l.f.id === ouverte) ?? null : null

  if (!ctx.activeSeason) {
    return (
      <div>
        <PageHeader title="Factures & paiements" description="Factures numérotées, avoirs, encaissements" />
        <Card><EmptyState title="Aucune saison active" description="Créez ou choisissez une saison pour facturer." /></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Factures & paiements" description={f.billing?.assujettie_tva ? 'Factures numérotées avec TVA ventilée, avoirs, encaissements' : 'Factures numérotées, avoirs, encaissements, sans TVA facturée'} />

      {f.erreur ? (
        <Card role="alert" className="mb-6 flex items-start gap-3 border-danger/30 p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-fg">Les factures n’ont pas pu être lues</p>
            <p className="mt-0.5 text-fg-muted">{f.erreur}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => f.reload()}>Réessayer</Button>
          </div>
        </Card>
      ) : f.loading ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label="Restant dû" value={formatEuros(synthese.restantDu)} icon={<Receipt />} sub="factures non soldées" />
            <Stat label="En retard" value={formatEuros(synthese.enRetard)} icon={<TriangleAlert />}
              sub={synthese.nbEnRetard ? `${synthese.nbEnRetard} facture${synthese.nbEnRetard > 1 ? 's' : ''} échue${synthese.nbEnRetard > 1 ? 's' : ''}` : 'aucune échéance dépassée'}
              className={synthese.nbEnRetard ? 'border-danger/40' : undefined} />
            <Stat label="Facturé net" value={formatEuros(synthese.factureNet)} icon={<FileText />} sub="factures moins avoirs" />
            <Stat label="Encaissé" value={formatEuros(synthese.encaisse)} icon={<Banknote />} sub="paiements enregistrés" />
          </div>

          {manque.length > 0 && onglet !== 'reglages' && (
            <Card role="status" className="mb-5 flex flex-wrap items-center gap-3 border-danger/30 px-4 py-3 text-sm">
              <CircleAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
              <span className="min-w-0 flex-1 text-fg">
                <strong>Réglages incomplets :</strong> {manque.map(m => m.libelle.toLowerCase()).join(', ')}. Aucune facture ne peut être émise.
              </span>
              <Button size="sm" variant="secondary" onClick={() => setOnglet('reglages')}><Settings className="h-4 w-4" aria-hidden /> Compléter</Button>
            </Card>
          )}

          <Tabs label="Factures" value={onglet} onChange={setOnglet} className="mb-5 overflow-x-auto"
            options={[
              { value: 'a-facturer', label: `À facturer · ${nbAFacturer}` },
              { value: 'factures', label: `Factures · ${f.invoices.length}` },
              { value: 'reglages', label: 'Réglages de facturation', icon: manque.length ? <CircleAlert className="h-3.5 w-3.5 text-danger" aria-hidden /> : undefined },
            ]} />

          <div role="tabpanel">
            {onglet === 'a-facturer' && (
              <AFacturer f={f} versReglages={() => setOnglet('reglages')}
                onEmise={id => { setOnglet('factures'); setOuverte(id) }} />
            )}
            {onglet === 'factures' && <ListeFactures lignes={lignes} onOuvrir={setOuverte} />}
            {onglet === 'reglages' && <Reglages billing={f.billing} estOwner={!!ctx.isFarmOwner} onSave={f.saveBilling} taux={f.taux} onSaveTaux={f.saveTaux} />}
          </div>
        </>
      )}

      {fiche && (
        <FicheFacture key={fiche.f.id} f={f} facture={fiche.f} s={fiche.s} aujourdhui={aujourdhui}
          onClose={() => setOuverte(null)} onOuvrir={setOuverte} />
      )}
    </div>
  )
}
