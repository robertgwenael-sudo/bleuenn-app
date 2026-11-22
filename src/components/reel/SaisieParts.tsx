'use client'
import { Biohazard, Bug, CloudHail, HelpCircle, PackageX, ShieldAlert } from 'lucide-react'
import { cn, Progress } from '@/components/ui'
import { LIBELLES_RAISONS, LOSS_REASONS, lundiDeSemaine, repartitionPrevue, estDateValide, type LossReason, type PlantingActual } from '@/lib/domain'
import { fmtPct, fmtTiges, statut, StatutBadge } from './commun'

const ICONES: Record<LossReason, React.ReactNode> = {
  invendu: <PackageX className="h-5 w-5" />,
  abime: <ShieldAlert className="h-5 w-5" />,
  meteo: <CloudHail className="h-5 w-5" />,
  ravageur: <Bug className="h-5 w-5" />,
  maladie: <Biohazard className="h-5 w-5" />,
  autre: <HelpCircle className="h-5 w-5" />,
}

/** Raison de la perte : six gros boutons, au pouce (role=radiogroup). */
export function ChoixRaison({ value, onChange, invalide }: { value: LossReason | ''; onChange: (r: LossReason) => void; invalide?: boolean }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = LOSS_REASONS.length
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : -1
    if (j < 0) return
    e.preventDefault()
    onChange(LOSS_REASONS[j])
    ;(e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Raison de la perte" aria-invalid={invalide || undefined}
      className={cn('grid grid-cols-3 gap-2', invalide && 'rounded-btn ring-2 ring-danger/30')}>
      {LOSS_REASONS.map((r, i) => {
        const on = value === r
        return (
          <button key={r} type="button" role="radio" aria-checked={on}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(r)} onKeyDown={e => onKey(e, i)}
            className={cn('flex h-16 flex-col items-center justify-center gap-1 rounded-btn border text-xs font-medium transition-colors',
              on ? 'border-primary bg-primary-soft text-primary ring-1 ring-primary' : 'border-border bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg')}>
            <span aria-hidden>{ICONES[r]}</span>
            {LIBELLES_RAISONS[r]}
          </button>
        )
      })}
    </div>
  )
}

/** Réel cumulé d'une plantation face à son prévu (total et à date). */
export function CumulPlantation({ planting, actual, aujourdhui }: {
  planting: any
  actual: PlantingActual | undefined
  aujourdhui: string
}) {
  const recolte = actual?.tiges_recoltees ?? 0
  const perdu = actual?.tiges_perdues ?? 0
  const prevu = Math.round(Number(planting.tiges_estimees) || 0)
  let prevuDate: number | null = null
  if (estDateValide(planting.date_recolte) && estDateValide(planting.date_fin) && Number.isFinite(Number(planting.tiges_estimees))) {
    const l = lundiDeSemaine(aujourdhui)
    prevuDate = repartitionPrevue(planting).filter(s => s.lundi <= l).reduce((s, x) => s + x.tiges, 0)
  }
  const taux = prevuDate && prevuDate > 0 ? recolte / prevuDate : null
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">Cette plantation, à ce jour</p>
        {prevuDate !== null && prevuDate > 0 && <StatutBadge taux={taux} />}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-fg-subtle">Récolté</dt><dd className="num text-base font-semibold text-fg">{fmtTiges(recolte)}</dd></div>
        <div><dt className="text-fg-subtle">Prévu à date</dt><dd className="num text-base text-fg">{prevuDate === null ? '—' : fmtTiges(prevuDate)}</dd></div>
        <div><dt className="text-fg-subtle">Perdu</dt><dd className="num text-base text-fg">{fmtTiges(perdu)}</dd></div>
      </dl>
      {prevu > 0 && (
        <>
          <Progress className="mt-2.5" value={(recolte / prevu) * 100} tone={statut(taux) === 'retard' ? 'warning' : 'primary'}
            label="Récolté sur le prévu de la saison" />
          <p className="mt-1 text-2xs text-fg-subtle">
            <span className="num">{fmtTiges(recolte)}</span> sur <span className="num">{fmtTiges(prevu)}</span> tiges prévues sur la saison ({fmtPct(recolte / prevu)})
            {actual?.derniere_recolte ? ` · dernière récolte le ${actual.derniere_recolte.split('-').reverse().join('/')}` : ''}
          </p>
        </>
      )}
    </div>
  )
}
