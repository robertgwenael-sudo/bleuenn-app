'use client'
import { Bug, CloudSun, Droplets, Eye, FlaskConical, Leaf, MoreHorizontal, Scissors, Sprout } from 'lucide-react'
import { cn, type Tone } from '@/components/ui'
import type { JournalKind } from '@/lib/domain'

export interface OptionPlanche { id: string; garden_id: string; garden: string; name: string; label: string }
export interface OptionCulture { id: string; name: string }
export interface OptionPersonne { id: string; label: string }
/** Plantation proposée dans la saisie (plantings_full de la ferme). */
export interface OptionPlantation {
  id: string; planche_id: string; culture_id: string; culture_name: string
  date_semis: string; date_plantation: string | null; date_fin: string | null; season_name?: string | null
}

export const ICONES_NOTES: Record<JournalKind, React.ComponentType<{ className?: string }>> = {
  observation: Eye, maladie: Leaf, ravageur: Bug, irrigation: Droplets, fertilisation: Sprout,
  meteo: CloudSun, recolte: Scissors, autre: MoreHorizontal,
}

export const TONS_NOTES: Record<JournalKind, Tone> = {
  observation: 'green', maladie: 'red', ravageur: 'amber', irrigation: 'blue', fertilisation: 'violet',
  meteo: 'neutral', recolte: 'rose', autre: 'neutral',
}

export const IconeTraitement = FlaskConical

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** `2026-11-20` → « nov. ». */
export const moisCourt = (d: string) => MOIS_COURTS[Number(d.slice(5, 7)) - 1] ?? ''

/** Puce tactile (44 px), choix exclusif. */
export function Puce({ actif, onClick, children, className, ...rest }: {
  actif: boolean; onClick: () => void; children: React.ReactNode; className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick} {...rest}
      className={cn('inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        actif ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg hover:bg-surface-2',
        className)}>
      {children}
    </button>
  )
}

/** Groupe de puces : défilement horizontal au pouce, retour à la ligne sur grand écran. */
export function Groupe({ titre, children, id }: { titre: React.ReactNode; children: React.ReactNode; id: string }) {
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-2 text-xs font-medium text-fg-muted">{titre}</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">{children}</div>
    </div>
  )
}

/** Encadré d'information neutre. */
export function Encadre({ children, className, tone = 'neutral' }: { children: React.ReactNode; className?: string; tone?: 'neutral' | 'amber' }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm',
      tone === 'amber' ? 'border-warning/30 bg-warning-soft text-fg' : 'border-border bg-surface-2/60 text-fg-muted', className)}>
      {children}
    </div>
  )
}

/** Options de planche groupées par jardin (<optgroup>). */
export function OptionsPlanches({ planches }: { planches: OptionPlanche[] }) {
  const jardins = [...new Map(planches.map(p => [p.garden_id, p.garden])).entries()]
  return (
    <>
      {jardins.map(([gid, nom]) => (
        <optgroup key={gid} label={nom}>
          {/* Libellé complet : le select fermé n'affiche que l'option, sans son groupe */}
          {planches.filter(p => p.garden_id === gid).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </optgroup>
      ))}
    </>
  )
}
