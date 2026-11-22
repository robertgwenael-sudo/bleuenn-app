'use client'
import { useEffect, useRef } from 'react'
import type { CompteursTaches, MoisTaches, TaskKind } from '@/lib/domain'
import { cn } from '@/components/ui'
import { FAMILLES, TYPES, moisCourt, pluriel, type Famille } from './meta'

/** Tâches à faire par famille, dans l'ordre de la légende. */
export function aFaireParFamille(c: CompteursTaches): { famille: Famille; n: number }[] {
  const par = new Map<Famille, number>()
  for (const [k, v] of Object.entries(c.par_type) as [TaskKind, { a_faire: number }][]) {
    const f = TYPES[k].famille
    par.set(f, (par.get(f) ?? 0) + v.a_faire)
  }
  return FAMILLES.map(f => ({ famille: f.id, n: par.get(f.id) ?? 0 })).filter(x => x.n > 0)
}

/** Barre empilée de la charge d'un mois ou d'une semaine. */
export function BarreCharge({ c, max, className, vertical }: { c: CompteursTaches; max: number; className?: string; vertical?: boolean }) {
  const parts = aFaireParFamille(c)
  const total = c.a_faire
  const remplissage = max > 0 ? Math.max(total > 0 ? 8 : 0, Math.round((total / max) * 100)) : 0
  return (
    <div className={cn('flex overflow-hidden rounded-[3px] bg-surface-3', vertical ? 'w-full flex-col-reverse' : 'h-1.5', className)} aria-hidden>
      <div className={cn('flex', vertical ? 'w-full flex-col-reverse' : 'h-full')} style={vertical ? { height: `${remplissage}%` } : { width: `${remplissage}%` }}>
        {parts.map(p => (
          <span key={p.famille} className={FAMILLES.find(f => f.id === p.famille)!.barre}
            style={vertical ? { height: `${(p.n / total) * 100}%` } : { width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Les 12 mois et leur charge : on voit d'un coup d'œil les mois chargés. */
export function BandeauMois({ mois, selection, onSelection }: {
  mois: MoisTaches[]
  selection: string
  onSelection: (cle: string) => void
}) {
  const max = Math.max(1, ...mois.map(m => m.compteurs.a_faire))
  const refs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => {
    refs.current.get(selection)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selection])

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0" role="group" aria-label="Charge des mois">
      <div className="flex min-w-max gap-1.5 sm:min-w-0">
        {mois.map((m, i) => {
          const actif = m.cle === selection
          const annee = i === 0 || m.cle.endsWith('-01')
          const desc = `${m.libelle} : ${pluriel(m.compteurs.a_faire, 'tâche')} à faire${m.compteurs.faites ? `, ${pluriel(m.compteurs.faites, 'faite')}` : ''}`
          return (
            <button key={m.cle} type="button" ref={el => { if (el) refs.current.set(m.cle, el); else refs.current.delete(m.cle) }}
              onClick={() => onSelection(m.cle)} aria-pressed={actif} aria-label={desc} title={desc}
              className={cn('group flex w-[4.75rem] shrink-0 flex-col items-stretch gap-1.5 rounded-xl border px-2 pb-2 pt-2 text-left transition-colors sm:w-auto sm:min-w-0 sm:flex-1',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                actif ? 'border-primary bg-primary-soft/60 shadow-xs' : 'border-transparent hover:border-border hover:bg-surface-2')}>
              <span className="flex items-baseline justify-between gap-1">
                <span className={cn('text-xs font-semibold capitalize', actif ? 'text-primary' : 'text-fg')}>{moisCourt(m.cle)}</span>
                {annee && <span className="num text-2xs text-fg-subtle">{m.cle.slice(0, 4)}</span>}
              </span>
              <BarreCharge c={m.compteurs} max={max} vertical className="h-14" />
              <span className="flex items-center justify-between gap-1">
                <span className={cn('num text-sm font-semibold', m.compteurs.a_faire ? 'text-fg' : 'text-fg-subtle')}>{m.compteurs.a_faire}</span>
                {m.en_cours && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Mois en cours" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Legende({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-2xs text-fg-muted', className)} aria-label="Légende des familles de tâches">
      {FAMILLES.map(f => (
        <li key={f.id} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-sm', f.barre)} aria-hidden />{f.label}</li>
      ))}
    </ul>
  )
}
