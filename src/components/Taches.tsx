'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, CalendarCheck, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, ListChecks, Plus,
} from 'lucide-react'
import {
  compterTaches, lundiDeSemaine, moisDeRattachement,
  type MoisTaches, type PlanningMensuel, type SemaineTaches, type Tache, type TaskKind,
} from '@/lib/domain'
import { useTaches, type CtxTaches } from '@/hooks/useTaches'
import { Badge, Button, Card, EmptyState, PageHeader, Select, Skeleton, cn } from '@/components/ui'
import { BandeauMois, BarreCharge, Legende, aFaireParFamille } from '@/components/taches/BandeauMois'
import { TacheLigne } from '@/components/taches/TacheLigne'
import { TacheDialog } from '@/components/taches/TacheDialog'
import { NouvelleTacheDialog } from '@/components/taches/NouvelleTacheDialog'
import { FAMILLE_PAR_ID, ORDRE_TYPES, TYPES, moisLong, plageSemaine, pluriel } from '@/components/taches/meta'
import { photos } from '@/lib/images'

type Filtres = { type: TaskKind | ''; personne: string; aFaire: boolean }
const PERSONNE_TOUS = '', PERSONNE_PERSONNE = '__personne__'

/** Applique les filtres et recalcule les compteurs (le domaine compte, l'écran ne recompte pas à la main). */
function filtrerPlanning(p: PlanningMensuel, garder: (t: Tache) => boolean): PlanningMensuel {
  const en_retard = p.en_retard.taches.filter(garder)
  return {
    en_retard: { taches: en_retard, compteurs: compterTaches(en_retard) },
    sans_date: p.sans_date.filter(garder),
    mois: p.mois.map(m => {
      const semaines = m.semaines.map(s => { const taches = s.taches.filter(garder); return { ...s, taches, compteurs: compterTaches(taches) } })
      return { ...m, semaines, compteurs: compterTaches(semaines.flatMap(s => s.taches)) }
    }),
  }
}

export default function Taches({ ctx }: { ctx: CtxTaches }) {
  const tk = useTaches(ctx)
  const { planning, equipe, aujourdhui, loading } = tk
  const [filtres, setFiltres] = useState<Filtres>({ type: '', personne: PERSONNE_TOUS, aFaire: false })
  const [choix, setChoix] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [creation, setCreation] = useState(false)
  const [replies, setReplies] = useState<Record<string, boolean>>({})

  const moisAujourdhui = moisDeRattachement(aujourdhui)
  const selection = choix && planning.mois.some(m => m.cle === choix) ? choix : moisAujourdhui

  const filtre = useMemo(() => filtrerPlanning(planning, t =>
    (!filtres.type || t.kind === filtres.type)
    && (filtres.personne === PERSONNE_TOUS || (filtres.personne === PERSONNE_PERSONNE ? !t.assigned_to : t.assigned_to === filtres.personne))
    && (!filtres.aFaire || !t.fait)), [planning, filtres])
  const filtresActifs = !!filtres.type || filtres.personne !== PERSONNE_TOUS || filtres.aFaire

  const iMois = filtre.mois.findIndex(m => m.cle === selection)
  const mois: MoisTaches | undefined = filtre.mois[iMois]
  const maxSemaine = Math.max(1, ...filtre.mois.flatMap(m => m.semaines.map(s => s.compteurs.a_faire)))
  const plantingParId = useMemo(() => new Map(tk.plantings.map(p => [p.id, p])), [tk.plantings])
  const tacheOuverte = ouverte ? tk.taches.find(t => t.cle === ouverte) ?? null : null

  const cocher = async (t: Tache, fait: boolean) => {
    const ok = await tk.cocher(t, fait)
    if (ok && fait) toast.success('Tâche faite', { description: t.title, action: { label: 'Annuler', onClick: () => { tk.cocher(t, false) } } })
  }
  const assigner = async (t: Tache, uid: string | null) => {
    if (await tk.assigner(t, uid)) {
      const m = equipe.find(x => x.user_id === uid)
      toast.success(m ? `Assignée à ${m.moi ? 'vous' : m.nom}` : 'Assignation retirée', { description: t.title })
    }
  }
  const ligne = (t: Tache) => (
    <TacheLigne key={t.cle} t={t} equipe={equipe} aujourdhui={aujourdhui}
      onCocher={cocher} onAssigner={assigner} onOuvrir={x => setOuverte(x.cle)} />
  )
  const estOuverte = (s: SemaineTaches) => replies[s.cle] ?? (s.taches.length > 0 && (s.compteurs.a_faire > 0 || s.en_cours))

  // Date proposée pour une nouvelle tâche : aujourd'hui dans le mois courant, sinon le premier lundi du mois choisi.
  const dateParDefaut = selection === moisAujourdhui ? aujourdhui : (mois?.semaines[0]?.lundi ?? aujourdhui)

  return (
    <div>
      <PageHeader title="Tâches" description="Le travail du mois, ordonné semaine par semaine" image={photos.semisGodets}
        actions={<Button onClick={() => setCreation(true)}><Plus className="h-4 w-4" />Nouvelle tâche</Button>} />

      {/* Charge de l'année */}
      <Card className="mb-4 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-sans text-sm font-semibold text-fg">Charge des 12 prochains mois <span className="font-normal text-fg-subtle">· tâches à faire</span></h2>
          <Legende className="hidden sm:flex" />
        </div>
        {loading ? <Skeleton className="h-[6.5rem] w-full" />
          : <BandeauMois mois={filtre.mois} selection={selection} onSelection={setChoix} />}
        <Legende className="mt-2 px-1 sm:hidden" />
      </Card>

      {/* Filtres */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select aria-label="Filtrer par type" wrapperClassName="min-w-0 sm:w-48" className="h-10"
          value={filtres.type} onChange={e => setFiltres(f => ({ ...f, type: e.target.value as TaskKind | '' }))}>
          <option value="">Tous les types</option>
          {ORDRE_TYPES.map(k => <option key={k} value={k}>{TYPES[k].label}</option>)}
        </Select>
        <Select aria-label="Filtrer par personne" wrapperClassName="min-w-0 sm:w-52" className="h-10"
          value={filtres.personne} onChange={e => setFiltres(f => ({ ...f, personne: e.target.value }))}>
          <option value={PERSONNE_TOUS}>Toute l’équipe</option>
          {equipe.map(m => <option key={m.user_id} value={m.user_id}>{m.moi ? `${m.nom} (moi)` : m.nom}</option>)}
          <option value={PERSONNE_PERSONNE}>Non assignées</option>
        </Select>
        <button type="button" aria-pressed={filtres.aFaire} onClick={() => setFiltres(f => ({ ...f, aFaire: !f.aFaire }))}
          className={cn('col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-btn border px-3 sm:justify-start text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            filtres.aFaire ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg-muted hover:text-fg')}>
          <ListChecks className="h-4 w-4" aria-hidden />À faire seulement
        </button>
        {filtresActifs && (
          <Button variant="ghost" size="sm" className="col-span-2" onClick={() => setFiltres({ type: '', personne: PERSONNE_TOUS, aFaire: false })}>Effacer les filtres</Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-16 w-full rounded-card" /><Skeleton className="h-64 w-full rounded-card" /></div>
      ) : tk.erreur && planning.mois.every(m => m.compteurs.total === 0) ? (
        <Card><EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Les tâches n’ont pas pu être chargées"
          description={tk.erreur} action={<Button variant="secondary" onClick={() => tk.recharger()}>Réessayer</Button>} /></Card>
      ) : (
        <div className="space-y-5">
          {/* En retard : toujours en tête */}
          {filtre.en_retard.taches.length > 0 && (
            <Card className="border-danger/30">
              <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-soft text-danger"><AlertTriangle className="h-4 w-4" aria-hidden /></span>
                <div>
                  <h2 className="font-sans text-[0.95rem] font-semibold text-fg">En retard</h2>
                  <p className="text-xs text-fg-muted">{pluriel(filtre.en_retard.taches.length, 'tâche')} dont l’échéance est passée</p>
                </div>
              </div>
              <ul className="divide-y divide-border px-3 pb-2 pt-1 sm:px-4">{filtre.en_retard.taches.map(ligne)}</ul>
            </Card>
          )}

          {/* Le mois choisi */}
          {mois && (
            <section aria-labelledby="mois-titre">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="icon" aria-label="Mois précédent" disabled={iMois <= 0} onClick={() => setChoix(filtre.mois[iMois - 1].cle)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" aria-label="Mois suivant" disabled={iMois >= filtre.mois.length - 1} onClick={() => setChoix(filtre.mois[iMois + 1].cle)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <h2 id="mois-titre" className="min-w-0 text-2xl leading-tight" aria-live="polite">{moisLong(mois.cle)}</h2>
                {mois.en_cours && <Badge tone="green">Mois en cours</Badge>}
                <Button variant="ghost" size="sm" className="ml-auto" disabled={selection === moisAujourdhui} onClick={() => setChoix(moisAujourdhui)}>
                  <CalendarCheck className="h-4 w-4" />Aujourd’hui
                </Button>
              </div>
              <ResumeMois mois={mois} />

              <div className="space-y-2.5">
                {mois.semaines.map(s => {
                  const open = estOuverte(s)
                  return (
                    <Card key={s.cle} className={cn('overflow-hidden', s.en_cours && 'border-primary/50 ring-1 ring-primary/30')}>
                      <h3 className="m-0">
                        <button type="button" aria-expanded={open} onClick={() => setReplies(r => ({ ...r, [s.cle]: !open }))}
                          className={cn('flex w-full items-center gap-3 px-4 py-3 text-left font-sans sm:px-5',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            s.en_cours ? 'bg-primary-soft/50' : 'hover:bg-surface-2/60')}>
                          <span className={cn('num flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                            s.en_cours ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg')}>S{s.numero}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 font-sans text-sm font-semibold text-fg">
                              {plageSemaine(s.lundi)}
                              {s.en_cours && <span className="text-xs font-semibold text-primary">Cette semaine</span>}
                            </span>
                            <span className="mt-0.5 block text-xs text-fg-muted">
                              {s.compteurs.total === 0 ? (filtresActifs ? 'Rien pour ces filtres' : 'Rien de prévu')
                                : <>{pluriel(s.compteurs.a_faire, 'à faire', 'à faire')}{s.compteurs.faites > 0 && <> · {pluriel(s.compteurs.faites, 'faite')}</>}</>}
                            </span>
                          </span>
                          <IconesSemaine s={s} />
                          <BarreCharge c={s.compteurs} max={maxSemaine} className="hidden w-24 md:flex" />
                          <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} aria-hidden />
                        </button>
                      </h3>
                      {open && (
                        s.taches.length > 0
                          ? <ul className="divide-y divide-border border-t border-border px-3 py-1 sm:px-4">{s.taches.map(ligne)}</ul>
                          : <p className="border-t border-border px-5 py-4 text-sm text-fg-subtle">Aucune tâche cette semaine.</p>
                      )}
                    </Card>
                  )
                })}
              </div>
              <p className="mt-2 px-1 text-2xs text-fg-subtle">
                Une semaine est rangée dans le mois de son lundi : la S{mois.semaines[mois.semaines.length - 1]?.numero} peut donc contenir des jours du mois suivant.
              </p>
            </section>
          )}

          {/* Sans date */}
          {filtre.sans_date.length > 0 && (
            <Card>
              <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-fg-muted"><CalendarClock className="h-4 w-4" aria-hidden /></span>
                <div>
                  <h2 className="font-sans text-[0.95rem] font-semibold text-fg">À planifier</h2>
                  <p className="text-xs text-fg-muted">Tâches libres sans date : ouvrez-en une pour la placer dans une semaine</p>
                </div>
              </div>
              <ul className="divide-y divide-border px-3 pb-2 pt-1 sm:px-4">{filtre.sans_date.map(ligne)}</ul>
            </Card>
          )}
        </div>
      )}

      <TacheDialog t={tacheOuverte} onClose={() => setOuverte(null)} taches={tk} planning={planning} equipe={equipe}
        plantings={plantingParId} aujourdhui={aujourdhui} />
      <NouvelleTacheDialog open={creation} onClose={() => setCreation(false)} equipe={equipe} jardins={ctx.gardens ?? []}
        dateParDefaut={dateParDefaut}
        onCreer={async n => {
          const ok = await tk.creer(n)
          if (ok && n.due_date) setChoix(moisDeRattachement(lundiDeSemaine(n.due_date)))
          return ok
        }} />
    </div>
  )
}

/** Résumé du mois : à faire, faites, et répartition par famille. */
function ResumeMois({ mois }: { mois: MoisTaches }) {
  const c = mois.compteurs
  const familles = aFaireParFamille(c)
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm">
      <span className="text-fg"><strong className="num font-semibold">{c.a_faire}</strong> <span className="text-fg-muted">à faire</span></span>
      {c.faites > 0 && <span className="text-fg-muted"><strong className="num font-semibold text-fg">{c.faites}</strong> {c.faites > 1 ? 'faites' : 'faite'}</span>}
      {familles.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Répartition par famille">
          {familles.map(f => (
            <li key={f.famille} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold', FAMILLE_PAR_ID[f.famille].pastille)}>
              {FAMILLE_PAR_ID[f.famille].label} <span className="num">{f.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Icônes des types présents dans la semaine (non faits), pour lire la semaine repliée. */
function IconesSemaine({ s }: { s: SemaineTaches }) {
  const types = ORDRE_TYPES.filter(k => (s.compteurs.par_type[k]?.a_faire ?? 0) > 0)
  if (types.length === 0) return null
  return (
    <span className="hidden items-center gap-1 sm:flex" aria-hidden>
      {types.slice(0, 5).map(k => {
        const Icon = TYPES[k].icon
        return (
          <span key={k} title={`${TYPES[k].label} : ${s.compteurs.par_type[k]!.a_faire}`}
            className={cn('inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-2xs font-semibold', FAMILLE_PAR_ID[TYPES[k].famille].pastille)}>
            <Icon className="h-3 w-3" />{s.compteurs.par_type[k]!.a_faire}
          </span>
        )
      })}
    </span>
  )
}
