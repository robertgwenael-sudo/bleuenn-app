'use client'
import { Field, Select } from '@/components/ui'
import { phraseRattachement, saisonProposee, type SaisonLite } from '@/lib/domain/saisons'

/**
 * Saison de rattachement d'une nouvelle plantation (migration 016) :
 * proposée d'après l'année de la première récolte prévue, modifiable.
 * `value` vide = la proposition.
 */
export function ChoixSaison({ ctx, dateRecolte, value, onChange }: {
  ctx: any
  dateRecolte: string | null
  value: string
  onChange: (seasonId: string) => void
}) {
  const active: SaisonLite | null = ctx.activeSeason ?? null
  const saisons: SaisonLite[] = (ctx.seasons || []).filter((s: SaisonLite) => !active?.farm_id || !s.farm_id || s.farm_id === active.farm_id)
  if (!saisons.length) return null
  const proposition = saisonProposee(dateRecolte, saisons, active)
  const choisie = value || proposition.saison?.id || ''
  const hint = value && value !== proposition.saison?.id
    ? `Choix manuel. Proposition : ${proposition.saison?.name ?? 'saison active'} (année de la première récolte).`
    : phraseRattachement(proposition)
  return (
    <Field label="Saison" hint={hint}>
      <Select aria-label="Saison de la plantation" className="h-11" value={choisie} onChange={e => onChange(e.target.value)}>
        {[...saisons].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name, 'fr'))
          .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Field>
  )
}
