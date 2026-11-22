'use client'
import { useState } from 'react'
import * as DM from '@radix-ui/react-dropdown-menu'
import { CalendarDays, CalendarPlus, ChevronDown, CopyPlus, EllipsisVertical, Repeat2 } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { BasculerSaisonDialog, PreparerSaisonDialog } from '@/components/saisons/SaisonSuivante'

const item = 'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-surface-2 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle'

/**
 * Sélecteur de saison + menu de saison, pour un owner de la ferme :
 * « Passer cette saison en N+1 » (saison-plan, 016), « Préparer N+1 »
 * (créer, rattacher, reprendre) et « Reprendre ce plan l'année suivante ».
 */
export function SeasonSelect({ ctx, className, compact, onDuplicate }: { ctx: any; className?: string; compact?: boolean; onDuplicate?: () => void }) {
  const [dialogue, setDialogue] = useState<'' | 'basculer' | 'preparer'>('')
  if (!ctx.seasons?.length) return null
  const canDuplicate = !!ctx.isOwner && !!ctx.activeSeason
  const suivante = (ctx.activeSeason?.year ?? 0) + 1
  const suivanteExiste = (ctx.seasons || []).some((s: any) => s.year === suivante && s.farm_id === ctx.activeSeason?.farm_id)
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="relative min-w-0 flex-1">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <select
          aria-label="Saison"
          className={cn('field-control w-full cursor-pointer appearance-none pl-8 pr-8 font-medium', compact && '!min-h-9 h-9 text-[0.8rem]')}
          value={ctx.activeSeason?.id || ''}
          onChange={e => ctx.switchSeason(e.target.value)}
        >
          {ctx.seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      </div>
      {canDuplicate && (
        <DM.Root>
          <DM.Trigger aria-label="Menu de la saison" title="Menu de la saison"
            className={cn('flex shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'h-9 w-8' : 'h-10 w-10')}>
            <EllipsisVertical className="h-4 w-4" />
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={6} className="z-[70] w-72 rounded-xl border border-border bg-surface p-1.5 shadow-pop data-[state=open]:animate-fade-in">
              <DM.Label className="px-2.5 pb-1 pt-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-fg-subtle">{ctx.activeSeason?.name}</DM.Label>
              {!suivanteExiste && (
                <DM.Item className={item} onSelect={() => setDialogue('basculer')}>
                  <Repeat2 />
                  <span>Passer cette saison en {suivante}<span className="block text-xs text-fg-muted">Le plan devient {suivante}, aperçu avant confirmation</span></span>
                </DM.Item>
              )}
              <DM.Item className={item} onSelect={() => setDialogue('preparer')}>
                <CalendarPlus />
                <span>Préparer {suivante}<span className="block text-xs text-fg-muted">Créer {suivante}, y ranger ce qui y fleurit</span></span>
              </DM.Item>
              {onDuplicate && (
                <DM.Item className={item} onSelect={() => onDuplicate()}>
                  <CopyPlus />
                  <span>Reprendre ce plan l’année suivante<span className="block text-xs text-fg-muted">Nouvelle saison, mêmes cultures, semis décalés</span></span>
                </DM.Item>
              )}
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      )}
      {canDuplicate && <BasculerSaisonDialog ctx={ctx} open={dialogue === 'basculer'} onOpenChange={o => setDialogue(o ? 'basculer' : '')} />}
      {canDuplicate && <PreparerSaisonDialog ctx={ctx} open={dialogue === 'preparer'} onOpenChange={o => setDialogue(o ? 'preparer' : '')} />}
    </div>
  )
}
