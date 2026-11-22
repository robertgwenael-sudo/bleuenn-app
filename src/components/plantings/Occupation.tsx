'use client'
// ============================================================
// Occupation d'une planche, toutes saisons confondues (affichage)
// ============================================================
// Le calcul est entièrement dans `@/lib/domain/occupation` ; ce module ne
// fait que le dessiner : frise sur une fenêtre de dates, alerte de conflit
// et avertissement à la saisie d'une plantation.
// ============================================================
import { AlertTriangle, CalendarClock } from 'lucide-react'
import {
  conflitsOccupation, dureeJours, ecartJours, formatJourMois, intersection,
  libelleSaison, moisEntre, periodeOccupation,
  type ConflitOccupation, type Intervalle, type PlantingOccupation,
} from '@/lib/domain'
import type { PlantingFull } from '@/lib/types'
import { Button, cn } from '@/components/ui'

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_INITIALE = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Période d'occupation, ou null si les dates sont incomplètes (jamais d'exception à l'écran). */
export function periodeSure(p: PlantingOccupation): Intervalle | null {
  try { return periodeOccupation(p) } catch { return null }
}

/** Plantations dont les dates permettent un calcul d'occupation. */
export function calculables<T extends PlantingOccupation>(ps: T[]): T[] {
  return ps.filter(p => periodeSure(p) !== null)
}

function fmtM2(x: number) {
  return String(Math.round(x * 100) / 100).replace('.', ',')
}

export function nomAvecSaison(p: PlantingOccupation) {
  const s = libelleSaison(p)
  return s ? `${p.culture_name} (${s})` : p.culture_name
}

/** Phrase courte d'un conflit : « du 13 mars au 4 juin 2027 : 13,5 m² pour 9 m² ». */
export function phraseConflit(c: ConflitOccupation, anneeRef: number) {
  return `du ${formatJourMois(c.debut, anneeRef)} au ${formatJourMois(c.fin, anneeRef)} : ${fmtM2(c.surface_occupee)} m² pour ${fmtM2(c.surface_planche)} m²`
}

// ------------------------------------------------------------
// Frise
// ------------------------------------------------------------
type Barre = { p: PlantingFull; i: Intervalle; lane: number; autre: boolean }

function rangerEnCouloirs(ps: PlantingFull[], fenetre: Intervalle, activeSeasonId?: string): { barres: Barre[]; couloirs: number } {
  const items = ps
    .map(p => ({ p, per: periodeSure(p) }))
    .map(x => ({ p: x.p, i: x.per ? intersection(x.per, fenetre) : null }))
    .filter((x): x is { p: PlantingFull; i: Intervalle } => x.i !== null)
    .sort((a, b) => (a.i.debut < b.i.debut ? -1 : a.i.debut > b.i.debut ? 1 : 0))
  const finCouloir: string[] = []
  const barres = items.map(({ p, i }) => {
    let lane = finCouloir.findIndex(f => f < i.debut)
    if (lane === -1) { lane = finCouloir.length; finCouloir.push(i.fin) } else finCouloir[lane] = i.fin
    return { p, i, lane, autre: !!activeSeasonId && p.season_id !== activeSeasonId }
  })
  return { barres, couloirs: Math.max(1, finCouloir.length) }
}

export function OccupationFrise({ plantings, planche, fenetre, today, activeSeasonId, onSelect, conflits }: {
  plantings: PlantingFull[]
  planche: { name: string; surface_m2: number }
  fenetre: Intervalle
  today: string
  activeSeasonId?: string
  onSelect?: (p: PlantingFull) => void
  conflits?: ConflitOccupation[]
}) {
  const total = dureeJours(fenetre)
  const x = (d: string) => (ecartJours(fenetre.debut, d) / total) * 100
  const w = (i: Intervalle) => (dureeJours(i) / total) * 100
  const { barres, couloirs } = rangerEnCouloirs(plantings, fenetre, activeSeasonId)
  const mois = moisEntre(fenetre)
  const anneeRef = Number(today.slice(0, 4))
  const H = 22, GAP = 3

  return (
    <div className="mt-2 select-none" role="group" aria-label={`Occupation de ${planche.name} sur 12 mois`}>
      {/* Axe des mois */}
      <div className="relative h-4 text-[0.62rem] leading-4 text-fg-subtle" aria-hidden>
        {mois.map(m => {
          const d = `${m}-01` < fenetre.debut ? fenetre.debut : `${m}-01`
          const mo = Number(m.slice(5, 7))
          const nouvelAn = mo === 1
          return (
            <span key={m} className={cn('absolute top-0 truncate pl-1', nouvelAn && 'font-semibold text-fg-muted')} style={{ left: `${x(d)}%` }}>
              {/* janvier : l'année tient lieu de libellé, pour marquer le passage d'année */}
              <span className="sm:hidden">{nouvelAn ? `’${m.slice(2, 4)}` : MOIS_INITIALE[mo - 1]}</span>
              <span className="hidden sm:inline">{nouvelAn ? m.slice(0, 4) : MOIS_COURT[mo - 1]}</span>
            </span>
          )
        })}
      </div>
      <div className="relative overflow-hidden rounded-md bg-surface-2 ring-1 ring-inset ring-border"
        style={{ height: couloirs * (H + GAP) + GAP + (conflits?.length ? 6 : 0) }}>
        {/* Séparations de mois */}
        {mois.slice(1).map(m => (
          <span key={m} className={cn('absolute inset-y-0 w-px', m.endsWith('-01') ? 'bg-border-strong' : 'bg-border/70')} style={{ left: `${x(`${m}-01`)}%` }} aria-hidden />
        ))}
        {/* Conflits : bande rouge en bas */}
        {conflits?.map((c, k) => {
          const i = intersection(c, fenetre)
          if (!i) return null
          return (
            <span key={k} className="absolute bottom-0 h-1.5 rounded-sm bg-danger"
              style={{ left: `${x(i.debut)}%`, width: `${Math.max(0.6, w(i))}%` }}
              title={`Conflit de surface ${phraseConflit(c, anneeRef)}`} aria-hidden />
          )
        })}
        {/* Plantations */}
        {barres.map(b => {
          const saison = libelleSaison(b.p)
          const per = periodeSure(b.p)!
          const titre = `${nomAvecSaison(b.p)} — ${fmtM2(Number(b.p.surface_m2))} m² — en place du ${formatJourMois(per.debut, anneeRef)} au ${formatJourMois(per.fin, anneeRef)}`
          const coupeAvant = per.debut < fenetre.debut
          const coupeApres = per.fin > fenetre.fin
          const Comp: any = onSelect ? 'button' : 'span'
          return (
            <Comp key={b.p.id} type={onSelect ? 'button' : undefined} onClick={onSelect ? () => onSelect(b.p) : undefined}
              title={titre} aria-label={titre}
              className={cn(
                'absolute flex items-center gap-1 overflow-hidden whitespace-nowrap px-1.5 text-left text-[0.68rem] font-medium leading-none transition',
                coupeAvant ? 'rounded-l-none' : 'rounded-l-[4px]', coupeApres ? 'rounded-r-none' : 'rounded-r-[4px]',
                b.autre
                  ? 'bg-violet-soft text-violet ring-1 ring-inset ring-violet/50'
                  : 'bg-primary text-primary-fg',
                onSelect && 'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              style={{ left: `${x(b.i.debut)}%`, width: `${w(b.i)}%`, top: GAP + b.lane * (H + GAP), height: H }}>
              {w(b.i) >= 5 && <>
                <span className="truncate">{b.p.culture_name}</span>
                {b.autre && saison && <span className="hidden shrink-0 rounded-sm bg-surface/70 px-1 py-px text-[0.6rem] font-semibold sm:inline">{saison}</span>}
                <span className="num hidden shrink-0 opacity-75 sm:inline">{fmtM2(Number(b.p.surface_m2))} m²</span>
              </>}
            </Comp>
          )
        })}
        {/* Aujourd'hui */}
        {today >= fenetre.debut && today <= fenetre.fin && (
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${x(today)}%` }} title="Aujourd’hui" aria-hidden />
        )}
      </div>
    </div>
  )
}

/** Légende commune des frises. */
export function LegendeFrise({ activeSeasonName }: { activeSeasonName?: string }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-[3px] bg-primary" aria-hidden />{activeSeasonName || 'Saison active'}</li>
      <li className="flex items-center gap-2"><span className="h-3 w-5 rounded-[3px] bg-violet-soft ring-1 ring-inset ring-violet/50" aria-hidden />Autre saison</li>
      <li className="flex items-center gap-2"><span className="h-3 w-0.5 bg-accent" aria-hidden />Aujourd’hui</li>
      <li className="flex items-center gap-2"><span className="h-1.5 w-5 rounded-sm bg-danger" aria-hidden /><AlertTriangle className="h-3 w-3 text-danger" aria-hidden />Conflit de surface</li>
    </ul>
  )
}

// ------------------------------------------------------------
// Alerte de conflit (planche)
// ------------------------------------------------------------
export function AlerteConflits({ conflits, today }: { conflits: ConflitOccupation[]; today: string }) {
  if (!conflits.length) return null
  const anneeRef = Number(today.slice(0, 4))
  return (
    <div role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-fg">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-danger">Conflit de surface{conflits.length > 1 ? ` (${conflits.length} périodes)` : ''}</p>
        {conflits.map((c, k) => (
          <p key={k}>
            <span className="num">{phraseConflit(c, anneeRef)}</span>
            <span className="text-fg-muted"> — {c.plantings.map(nomAvecSaison).join(', ')}</span>
          </p>
        ))}
      </div>
    </div>
  )
}

/** Conflits d'une planche sur une fenêtre, sans jamais lever d'exception à l'écran. */
export function conflitsPlanche(planche: { surface_m2: number }, ps: PlantingOccupation[], fenetre?: Intervalle): ConflitOccupation[] {
  try { return conflitsOccupation({ surface_m2: Number(planche.surface_m2) }, calculables(ps), fenetre) } catch { return [] }
}

// ------------------------------------------------------------
// Avertissement à la saisie (n'empêche pas d'enregistrer)
// ------------------------------------------------------------
export function AvertissementSaisie({ conflits, plancheM2, surface, libre, semisSuggere, dateSemis, onUseDate, today, projetId }: {
  projetId: string
  conflits: ConflitOccupation[]
  plancheM2: number
  surface: number
  libre: string | null
  semisSuggere: string | null
  dateSemis: string
  onUseDate: (d: string) => void
  today: string
}) {
  if (!conflits.length) return null
  const anneeRef = Number(today.slice(0, 4))
  const autres = Array.from(new Set(conflits.flatMap(c => c.plantings.filter(p => p.id !== projetId).map(nomAvecSaison))))
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-xs text-fg">
      <p className="flex items-center gap-1.5 font-semibold text-warning">
        <AlertTriangle className="h-4 w-4" aria-hidden />Planche déjà occupée sur cette période
      </p>
      <ul className="space-y-0.5">
        {conflits.map((c, k) => <li key={k} className="num">Surface dépassée {phraseConflit(c, anneeRef)}</li>)}
      </ul>
      {autres.length > 0 && <p className="text-fg-muted">En place : {autres.join(', ')}.</p>}
      {surface > plancheM2 ? (
        <p>La planche ne fait que {fmtM2(plancheM2)} m² : réduisez la surface demandée.</p>
      ) : libre ? (
        <div className="flex flex-wrap items-center gap-2">
          <span><CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-fg-muted" aria-hidden />Libre pour {fmtM2(surface)} m² à partir du <strong>{formatJourMois(libre, anneeRef)}</strong>
            {semisSuggere && semisSuggere !== libre && <> (semis vers le {formatJourMois(semisSuggere, anneeRef)})</>}.</span>
          {semisSuggere && semisSuggere !== dateSemis && (
            <Button size="sm" variant="secondary" onClick={() => onUseDate(semisSuggere)}>Semer le {formatJourMois(semisSuggere, anneeRef)}</Button>
          )}
        </div>
      ) : null}
      <p className="text-fg-subtle">Vous pouvez enregistrer quand même : la planche sera signalée en conflit.</p>
    </div>
  )
}

