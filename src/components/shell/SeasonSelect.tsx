'use client'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { cn } from '@/components/ui/cn'

export function SeasonSelect({ ctx, className, compact }: { ctx: any; className?: string; compact?: boolean }) {
  if (!ctx.seasons?.length) return null
  return (
    <div className={cn('relative', className)}>
      <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <select
        aria-label="Saison"
        className={cn('field-control cursor-pointer appearance-none pl-8 pr-8 font-medium', compact && '!min-h-9 h-9 text-[0.8rem]')}
        value={ctx.activeSeason?.id || ''}
        onChange={e => ctx.switchSeason(e.target.value)}
      >
        {ctx.seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  )
}
