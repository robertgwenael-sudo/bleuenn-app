'use client'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import type { EntreeFile } from '@/lib/offline'

export interface DescriptionSaisie {
  titre: string
  sousTitre: string
  notes?: string | null
  tiges: number
  extra?: React.ReactNode
}

/**
 * Saisies encore sur le téléphone, en tête de l'historique : badge
 * « En attente », ou « Refusée » avec l'erreur de la base et les boutons
 * « Réessayer » / « Supprimer ». Jamais masquées tant qu'elles existent.
 */
export function SaisiesLocales({ entrees, decrire, onSupprimer, onReessayer }: {
  entrees: EntreeFile[]
  decrire: (e: EntreeFile) => DescriptionSaisie
  onSupprimer: (e: EntreeFile) => void
  onReessayer: (e: EntreeFile) => void
}) {
  if (entrees.length === 0) return null
  return (
    <ul className="mb-3 space-y-2" aria-label="Saisies enregistrées sur le téléphone" data-testid="saisies-locales">
      {entrees.map(e => {
        const d = decrire(e)
        const rejetee = e.etat === 'rejetee'
        return (
          <li key={e.id} data-testid="saisie-locale" data-etat={e.etat}
            className={cn('rounded-xl border border-dashed p-3 shadow-xs',
              rejetee ? 'border-danger/50 bg-danger-soft/40' : 'border-warning/50 bg-warning-soft/40')}>
            <div className="flex items-center gap-3">
              <div className="num flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-fg">
                <span className="text-base font-semibold leading-none">{d.tiges}</span>
                <span className="text-[0.65rem] text-fg-muted">tiges</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{d.titre}</p>
                <p className="truncate text-xs text-fg-muted">{d.sousTitre}</p>
                {d.notes && <p className="truncate text-xs text-fg-subtle">{d.notes}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {rejetee ? <Badge tone="red" dot>Refusée</Badge> : <Badge tone="amber" dot>En attente</Badge>}
                {d.extra}
              </div>
              {!rejetee && (
                <Button variant="ghost" size="icon" onClick={() => onSupprimer(e)} aria-label="Supprimer cette saisie en attente">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {rejetee && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-danger/20 pt-2">
                <p className="min-w-0 flex-1 text-xs text-danger" role="alert">
                  Refusée par la base : {e.erreur || 'erreur inconnue'}
                </p>
                <Button variant="secondary" size="sm" onClick={() => onReessayer(e)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Réessayer
                </Button>
                <Button variant="danger" size="sm" onClick={() => onSupprimer(e)}>Supprimer</Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
