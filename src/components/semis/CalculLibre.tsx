'use client'
// Calcul libre : une culture, une surface, et la chaîne du tableur
// m² → plants (espacement) → plants + pertes → graines.
import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { CultureCatalog } from '@/lib/types'
import { calculerProduction, type Calcul, type TauxPertes } from '@/lib/domain/production'
import { Card, Field, Input, Select } from '@/components/ui'
import { CelluleCalcul, CelluleMontant } from './format'

function Etape({ label, c, accent }: { label: string; c: Calcul; accent?: boolean }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-3 text-center shadow-xs">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={accent ? 'mt-1 text-2xl font-semibold text-primary' : 'mt-1 text-2xl font-semibold'}><CelluleCalcul c={c} /></p>
    </div>
  )
}

export function CalculLibre({ catalog, taux }: { catalog: CultureCatalog[]; taux: TauxPertes }) {
  const tries = useMemo(() => [...catalog].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [catalog])
  const [cultureId, setCultureId] = useState('')
  const [m2, setM2] = useState('10')
  const [achat, setAchat] = useState(false)
  const c = tries.find(x => x.id === cultureId) ?? null
  const surface = Number(m2.replace(',', '.'))
  const surfaceOk = m2.trim() !== '' && Number.isFinite(surface) && surface > 0

  const p = useMemo(() => c && surfaceOk ? calculerProduction({
    surface_m2: surface, rangs_par_planche: c.rangs_par_planche, espacement_cm: c.espacement_cm,
    graines_par_plant: c.graines_par_plant, rendement: c.rendement_plant, prix_tige: c.prix_tige,
    jours_recolte: c.jours_recolte, achat_plant: achat,
  }, taux) : null, [c, surface, surfaceOk, achat, taux])

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Culture">
          <Select value={cultureId} onChange={e => setCultureId(e.target.value)} data-testid="calcul-culture">
            <option value="">Choisir une culture</option>
            {tries.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Surface (m²)" error={m2.trim() !== '' && !surfaceOk ? 'Surface invalide' : undefined}>
          <Input inputMode="decimal" value={m2} onChange={e => setM2(e.target.value)} data-testid="calcul-m2" />
        </Field>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={achat} onChange={e => setAchat(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary)]" />
          Plant acheté
        </label>
      </Card>

      {c && (
        <p className="num text-xs text-fg-muted">
          {c.name} : {c.rangs_par_planche ?? '?'} rangs par planche de 20 × 1 m, espacement {c.espacement_cm ?? '?'} cm,{' '}
          {c.graines_par_plant ?? '?'} graine{Number(c.graines_par_plant) > 1 ? 's' : ''} par motte, {c.rendement_plant ?? '?'} tiges par plant.
          Plants = rangs × m² / (espacement / 100).
        </p>
      )}

      {p ? (
        <div className="space-y-3" data-testid="calcul-resultat">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Etape label="Plants" c={p.plants} />
            <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-fg-subtle sm:rotate-0" aria-hidden />
            <Etape label={`Plants + ${taux.semis} % de pertes`} c={p.plantsAvecPertes} />
            <ArrowRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-fg-subtle sm:rotate-0" aria-hidden />
            <Etape label="Graines à semer" c={p.graines} accent />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-surface-2 px-2 py-2"><p className="text-xs text-fg-muted">Tiges</p><p className="font-semibold"><CelluleCalcul c={p.tiges} /></p></div>
            <div className="rounded-lg bg-surface-2 px-2 py-2"><p className="text-xs text-fg-muted">Tiges − {taux.champ} %</p><p className="font-semibold"><CelluleCalcul c={p.tigesNettes} /></p></div>
            <div className="rounded-lg bg-surface-2 px-2 py-2"><p className="text-xs text-fg-muted">Revenu</p><p className="font-semibold"><CelluleMontant m={p.revenu} /></p></div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">Choisissez une culture et une surface.</p>
      )}
    </div>
  )
}
