'use client'
import { Check, ChevronRight, StickyNote, UserRound } from 'lucide-react'
import { ecartJours, type DateISO, type Tache } from '@/lib/domain'
import type { MembreEquipe } from '@/hooks/useTaches'
import { cn } from '@/components/ui'
import { IconeType, TYPES, dateCourte } from './meta'

/** Case à cocher large : 44 px de cible au pouce, 36 px à la souris. */
export function CaseACocher({ coche, onChange, libelle, className }: {
  coche: boolean; onChange: (v: boolean) => void; libelle: string; className?: string
}) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} aria-label={libelle} onClick={() => onChange(!coche)}
      className={cn('group flex h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors sm:h-5 sm:w-5',
        coche ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong bg-surface group-hover:border-primary')}>
        {coche && <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  )
}

export function Avatar({ membre, className }: { membre: MembreEquipe | undefined; className?: string }) {
  if (!membre) return (
    <span title="Non assignée" className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-fg-subtle', className)}>
      <UserRound className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Non assignée</span>
    </span>
  )
  return (
    <span title={membre.nom} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold',
      membre.moi ? 'bg-primary text-primary-fg' : 'bg-violet-soft text-violet', className)}>
      {membre.initiales.slice(0, 2)}
      <span className="sr-only">Assignée à {membre.nom}</span>
    </span>
  )
}

export function TacheLigne({ t, equipe, aujourdhui, onCocher, onAssigner, onOuvrir, compact }: {
  t: Tache
  equipe: MembreEquipe[]
  aujourdhui: DateISO
  onCocher: (t: Tache, fait: boolean) => void
  onAssigner?: (t: Tache, userId: string | null) => void
  onOuvrir?: (t: Tache) => void
  /** Ligne courte (tableau de bord) : pas de sélecteur d'assignation. */
  compact?: boolean
}) {
  const membre = equipe.find(m => m.user_id === t.assigned_to)
  const faitPar = t.done_by ? equipe.find(m => m.user_id === t.done_by) : undefined
  const annee = Number(aujourdhui.slice(0, 4))
  const retard = !t.fait && t.due_date && t.due_date < aujourdhui ? ecartJours(t.due_date, aujourdhui) : 0
  // Le titre du plan répète la planche (« — PL 1 ») : on l'affiche à part.
  const titre = t.source === 'plan' && t.planche_name ? t.title.replace(` — ${t.planche_name}`, '') : t.title
  const lieu = [t.garden_name, t.planche_name].filter(Boolean).join(' · ')
  const meta = [
    t.source === 'libre' && t.culture_name ? t.culture_name : null,
    lieu || null,
    t.due_date ? dateCourte(t.due_date, annee) : 'Sans date',
  ].filter(Boolean).join(' · ')

  const corps = (
    <>
      <IconeType kind={t.kind} className={cn(t.fait && 'opacity-60')} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium leading-snug text-fg sm:truncate', t.fait && 'text-fg-subtle line-through decoration-fg-subtle/60')}>
          {titre}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
          <span className="min-w-0 sm:truncate">{meta}</span>
          {retard > 0 && <span className="font-semibold text-danger">en retard de {retard} j</span>}
          {t.fait && t.done_at && (
            <span className="text-primary">fait{faitPar ? ` par ${faitPar.moi ? 'vous' : faitPar.nom.split(' ')[0]}` : ''}</span>
          )}
          {t.notes && (
            <span className="inline-flex min-w-0 items-center gap-1 text-fg-subtle" title={t.notes}>
              <StickyNote className="h-3 w-3 shrink-0" aria-hidden /><span className="max-w-[16rem] truncate">{t.notes}</span>
            </span>
          )}
        </span>
      </span>
    </>
  )

  return (
    <li className={cn('flex items-center gap-1.5 py-1.5 sm:gap-2', t.fait && 'bg-transparent')}>
      <CaseACocher coche={t.fait} onChange={v => onCocher(t, v)}
        libelle={`${t.fait ? 'Décocher' : 'Cocher'} « ${titre} »`} className="-ml-1.5 sm:-ml-1" />
      {onOuvrir ? (
        <button type="button" onClick={() => onOuvrir(t)} aria-label={`Détails de « ${titre} » (${TYPES[t.kind].label})`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {corps}
          <Avatar membre={membre} className={cn(!compact && onAssigner && 'md:hidden')} />
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-fg-subtle', !compact && onAssigner && 'md:hidden')} aria-hidden />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">{corps}<Avatar membre={membre} /></div>
      )}
      {!compact && onAssigner && (
        <label className="relative hidden shrink-0 md:block">
          <span className="sr-only">Assigner « {titre} »</span>
          <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2"><Avatar membre={membre} className="h-6 w-6" /></span>
          <select value={t.assigned_to ?? ''} onChange={e => onAssigner(t, e.target.value || null)}
            className="h-8 w-40 cursor-pointer appearance-none truncate rounded-full border border-border bg-surface pl-9 pr-3 text-xs text-fg-muted hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
            <option value="">Non assignée</option>
            {equipe.map(m => <option key={m.user_id} value={m.user_id}>{m.moi ? `${m.nom} (moi)` : m.nom}</option>)}
          </select>
        </label>
      )}
    </li>
  )
}
