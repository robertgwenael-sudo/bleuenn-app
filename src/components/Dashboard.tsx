'use client'
import { useMemo } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import { CalendarClock, ChevronRight, Coins, Fence, Flower, Ruler, Scissors, Store, Target } from 'lucide-react'
import { getPlantingStatus } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import { grouperParEcheance, type Tache } from '@/lib/domain'
import { useTaches, type UseTaches } from '@/hooks/useTaches'
import { TacheLigne } from '@/components/taches/TacheLigne'
import { Button, Card, CardHeader, CardContent, EmptyState, Progress, Skeleton, Stat } from '@/components/ui'
import { HBarChart } from '@/components/charts/HBarChart'
import { SegmentedBar } from '@/components/charts/SegmentedBar'
import { useUI } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'

const eur = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`

/** Une section de la carte « Prochaines tâches ». */
function GroupeTaches({ titre, taches, ton, max, tk }: {
  titre: string; taches: Tache[]; ton?: 'danger'; max: number; tk: UseTaches
}) {
  if (taches.length === 0) return null
  const visibles = taches.slice(0, max)
  return (
    <section>
      <h4 className={`flex items-center gap-2 pt-3 font-sans text-2xs font-semibold uppercase tracking-wide ${ton === 'danger' ? 'text-danger' : 'text-fg-subtle'}`}>
        {titre}<span className="num font-normal normal-case tracking-normal">{taches.length}</span>
      </h4>
      <ul className="divide-y divide-border">
        {visibles.map(t => (
          <TacheLigne key={t.cle} t={t} equipe={tk.equipe} aujourdhui={tk.aujourdhui} compact
            onCocher={async (x, fait) => { if (await tk.cocher(x, fait) && fait) toast.success('Tâche faite', { description: x.title }) }} />
        ))}
      </ul>
      {taches.length > max && <p className="pb-1 text-xs text-fg-subtle">et {taches.length - max} autre{taches.length - max > 1 ? 's' : ''}…</p>}
    </section>
  )
}

export default function Dashboard({ ctx, onNav }: { ctx: any; onNav?: (id: string) => void }) {
  const ui = useUI()
  const tk = useTaches(ctx)
  const groupes = useMemo(() => grouperParEcheance(tk.taches, tk.aujourdhui), [tk.taches, tk.aujourdhui])
  const aFaireSemaine = groupes.cette_semaine.filter(t => !t.fait).length
  const plantings: PlantingFull[] = ctx.plantings
  const sales = ctx.sales || []
  const season = ctx.activeSeason

  const totalTiges = plantings.reduce((s: number, p: PlantingFull) => s + (p.tiges_estimees || 0), 0)
  const totalCA = plantings.reduce((s: number, p: PlantingFull) => s + (p.revenu_estime || 0), 0)
  const totalM2 = (ctx.gardens || []).reduce((s: number, g: any) => s + (g.surface_m2 || 0), 0)
  const enRecolte = plantings.filter((p: PlantingFull) => getPlantingStatus(p) === 'En récolte').length
  const actives = plantings.filter((p: PlantingFull) => getPlantingStatus(p) !== 'Terminé').length

  const ventesTotal = sales.reduce((s: number, v: any) => s + (v.total || 0), 0)
  const goal = season?.revenue_goal || 15000
  const pct = Math.min(100, (ventesTotal / goal) * 100)

  const now = new Date()

  const channels = ['Marché', 'Fleuriste', 'Abo.', 'Mariage', 'Deuil']
  const channelFull = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil']
  const channelCA = channelFull.map(c => sales.filter((v: any) => v.channel === c).reduce((s: number, v: any) => s + (v.total || 0), 0))

  const typeCounts = [
    { label: 'RR — Récolte répétitive', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RR').length, colorClass: 'bg-chart-1' },
    { label: 'MP — Moyen producteur', value: plantings.filter((p: PlantingFull) => p.culture_type === 'MP').length, colorClass: 'bg-chart-2' },
    { label: 'RU — Récolte unique', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RU').length, colorClass: 'bg-chart-3' },
  ]

  const firstName = (ctx.profile?.owner_name || '').trim().split(/\s+/)[0]
  const hour = now.getHours()
  const hello = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour'
  const today = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const go = (id: string, intent?: 'new-harvest' | 'new-sale' | 'new-garden') => {
    onNav?.(id)
    if (intent) ui.sendIntent(intent)
  }

  return (
    <div className="space-y-6">
      {/* Bandeau d'accueil */}
      <section className="relative overflow-hidden rounded-2xl shadow-card">
        <Image src={photos.champPavotsDores} alt="" fill priority sizes="(min-width: 1280px) 1200px, 100vw"
          className="object-cover object-[50%_60%]" placeholder="blur" />
        <div className="absolute inset-0 bg-gradient-to-r from-[rgb(18_28_16/0.86)] via-[rgb(18_28_16/0.6)] to-[rgb(18_28_16/0.05)]" />
        <div className="relative flex flex-col gap-5 px-5 py-7 text-white sm:px-8 sm:py-9 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-sm text-white/80 first-letter:uppercase">{today}</p>
            <h1 className="mt-1 text-[1.9rem] leading-tight text-white sm:text-[2.4rem]">
              {hello}{firstName ? ` ${firstName}` : ''}
            </h1>
            <p className="mt-2 text-sm text-white/85">
              {season?.name || 'Saison en cours'} · {actives} culture{actives > 1 ? 's' : ''} active{actives > 1 ? 's' : ''}
              {enRecolte > 0 && <> · {enRecolte} en récolte</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="md" className="!bg-white !text-[rgb(31_36_30)] hover:!bg-white/90" onClick={() => go('recoltes', 'new-harvest')}>
              <Scissors className="h-4 w-4" />Saisir une récolte
            </Button>
            <Button size="md" variant="ghost" className="!text-white ring-1 ring-white/40 hover:!bg-white/15" onClick={() => go('ventes', 'new-sale')}>
              <Store className="h-4 w-4" />Nouvelle vente
            </Button>
          </div>
        </div>
      </section>

      {plantings.length === 0 ? (
        <Card>
          <EmptyState image={photos.semisGodets} title="Votre saison est prête à être semée"
            description="Créez vos jardins et planches, puis affectez des cultures : le calendrier, les besoins en graines et le prévisionnel se calculent tout seuls."
            action={<Button onClick={() => go('jardins', 'new-garden')}><Fence className="h-4 w-4" />Créer un jardin</Button>} />
        </Card>
      ) : null}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat className="col-span-2 xl:col-span-1" label="CA réalisé" icon={<Target />}
          value={eur(ventesTotal)}
          sub={<>Objectif {goal.toLocaleString('fr-FR')} € · <strong className="font-semibold text-fg">{pct.toFixed(1)} %</strong></>}>
          <Progress value={pct} className="mt-3" label="Progression vers l’objectif de chiffre d’affaires" />
        </Stat>
        <Stat label="CA potentiel" icon={<Coins />} value={eur(totalCA)} sub="sur toutes les cultures" />
        <Stat label="Tiges potentielles" icon={<Flower />} value={Math.round(totalTiges).toLocaleString('fr-FR')} sub="saison complète" />
        <Stat className="col-span-2 sm:col-span-1" label="Surface totale" icon={<Ruler />} value={`${totalM2.toLocaleString('fr-FR')} m²`}
          sub={`${(ctx.gardens || []).length} jardins · ${actives} cultures actives`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Prochaines tâches */}
        <Card className="lg:col-span-3">
          <CardHeader title="Prochaines tâches"
            description={tk.loading ? 'Chargement…' : `${aFaireSemaine} à faire cette semaine${groupes.en_retard.length ? ` · ${groupes.en_retard.length} en retard` : ''}`}
            icon={<CalendarClock className="h-4 w-4" />}
            action={<a href="/#taches" onClick={e => { if (onNav) { e.preventDefault(); onNav('taches') } }}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-btn px-3 text-xs font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Voir le mois<ChevronRight className="h-3.5 w-3.5" aria-hidden /></a>} />
          <CardContent className="pt-1">
            {tk.loading ? (
              <div className="space-y-2 pt-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full" />)}</div>
            ) : groupes.en_retard.length + groupes.cette_semaine.length + groupes.semaine_prochaine.length === 0 ? (
              <EmptyState compact icon={<CalendarClock className="h-5 w-5" />} title="Rien à prévoir"
                description="Aucune tâche cette semaine ni la suivante." />
            ) : (
              <>
                <GroupeTaches titre="En retard" ton="danger" taches={groupes.en_retard} max={3} tk={tk} />
                <GroupeTaches titre="Cette semaine" taches={groupes.cette_semaine} max={6} tk={tk} />
                <GroupeTaches titre="Semaine prochaine" taches={groupes.semaine_prochaine} max={4} tk={tk} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Types de cultures */}
        <Card className="lg:col-span-2">
          <CardHeader title="Cultures par type" description={`${plantings.length} plantations sur la saison`} />
          <CardContent>
            <SegmentedBar items={typeCounts} unit="plantations" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="CA réel par canal" description={`${sales.length} ventes enregistrées · ${eur(ventesTotal)}`}
          action={<Button variant="ghost" size="sm" onClick={() => go('ventes')}>Ventes</Button>} />
        <CardContent>
          {sales.length > 0
            ? <HBarChart data={channels.map((c, i) => ({ label: c, value: channelCA[i] }))} format={eur} seriesName="CA réel" />
            : <EmptyState compact icon={<Store className="h-5 w-5" />} title="Aucune vente pour l’instant"
                action={<Button variant="secondary" size="sm" onClick={() => go('ventes', 'new-sale')}>Enregistrer une vente</Button>} />}
        </CardContent>
      </Card>
    </div>
  )
}
