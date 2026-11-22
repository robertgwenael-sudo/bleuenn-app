'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, CopyPlus } from 'lucide-react'
import type { PlantingFull, Season } from '@/lib/types'
import {
  apercuReprise, conflitsDuplication, formatDateLongue, formatJourMois, maxDate, minDate, projeterDuplication,
  type ConflitDuplication,
} from '@/lib/domain'
import { Button, Dialog, Field, Input, Select, cn } from '@/components/ui'
import { calculables, nomAvecSaison, phraseConflit } from '@/components/plantings/Occupation'
import { versPreparation } from '@/components/saisons/preparation'

/**
 * « Reprendre ce plan l'année suivante » : aperçu de `projeterDuplication`
 * et conflits de `conflitsDuplication` (planches encore occupées, par
 * exemple par des renoncules semées à l'automne), puis RPC
 * `duplicate_season_plan` et bascule sur la nouvelle saison.
 * Réservé aux owners de la ferme.
 */
export function DuplicatePlanDialog({ ctx, open, onOpenChange }: { ctx: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const active: Season | null = ctx.activeSeason
  const farmSeasons: Season[] = (ctx.seasons || []).filter((s: Season) => !active?.farm_id || s.farm_id === active.farm_id)
  const [sourceId, setSourceId] = useState('')
  const [shift, setShift] = useState(1)
  const [name, setName] = useState('')
  const [year, setYear] = useState(0)
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)

  const source = farmSeasons.find(s => s.id === sourceId) || active
  // Réinitialise à l'ouverture : saison active, +1 an
  useEffect(() => {
    if (!open || !active) return
    setSourceId(active.id); setShift(1); setYear(active.year + 1); setName(String(active.year + 1))
    setTried(false)
  }, [open, active?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const changeSource = (id: string) => {
    const s = farmSeasons.find(x => x.id === id)
    setSourceId(id)
    if (s) { setYear(s.year + shift); setName(String(s.year + shift)) }
  }
  const changeShift = (n: number) => {
    setShift(n)
    if (source && Number.isInteger(n)) { setYear(source.year + n); setName(String(source.year + n)) }
  }

  const farmPlantings: PlantingFull[] = ctx.farmPlantings || []
  const planches = useMemo(() => (ctx.gardens || []).flatMap((g: any) => (g.planches || []).map((p: any) => ({ id: p.id, surface_m2: Number(p.surface_m2), name: p.name, gardenName: g.name }))), [ctx.gardens])
  const shiftOk = Number.isInteger(shift) && shift >= 1 && shift <= 10

  const apercu = useMemo(() => {
    if (!source || !shiftOk) return null
    // 016 : la base ne reprend ni les vivaces en place, ni les plantations récoltées hors de l'année source
    const tous = calculables(farmPlantings.filter(p => p.season_id === source.id))
    const reprise = apercuReprise({ source: tous.map(p => versPreparation(p, ctx.catalog)), cible: [], anneeSource: source.year, decalageAnnees: shift })
    const gardees = new Set(reprise.copies.map(c => c.id))
    const src = tous.filter(p => gardees.has(p.id))
    const exclues = { vivaces: reprise.vivacesEnPlace.length, horsAnnee: reprise.horsAnnee.length }
    const projets = projeterDuplication(src, shift, { name: name || String(year), year })
    let conflits: ConflitDuplication[] = []
    let erreur: string | null = null
    try {
      conflits = conflitsDuplication({ source: src, existantes: calculables(farmPlantings), planches, decalageAnnees: shift })
    } catch (e: any) {
      erreur = e?.message || String(e)
    }
    return { src, projets, conflits, erreur, exclues }
  }, [source, shift, shiftOk, farmPlantings, planches, name, year, ctx.catalog])

  const nameErr = tried && !name.trim() ? 'Donnez un nom à la nouvelle saison.' : undefined
  // Saison = année civile (016) : une seule saison par année dans la ferme.
  const anneePrise = farmSeasons.find(s => s.year === year)
  const yearErr = tried && (!Number.isInteger(year) || year < 2000 || year > 2100) ? 'Année invalide.'
    : tried && anneePrise ? `La saison ${year} existe déjà (« ${anneePrise.name} »).` : undefined
  const doublon = farmSeasons.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase())

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!source || !name.trim() || !shiftOk || !Number.isInteger(year) || anneePrise) return
    setLoading(true)
    const id = await ctx.duplicatePlan(source.id, name.trim(), year, shift)
    if (id) {
      await ctx.switchSeason(id)
      toast.success(`${name.trim()} créée`, { description: `${apercu?.projets.length ?? 0} plantations reprises de ${source.name}` })
      onOpenChange(false)
    }
    setLoading(false)
  }

  const anneeRef = year
  const plancheNom = (id: string) => {
    const p = planches.find((x: any) => x.id === id)
    return p ? `${p.gardenName} · ${p.name}` : 'Planche inconnue'
  }
  const projets = apercu?.projets || []
  const periode = projets.length
    ? { debut: minDate(...projets.map(p => p.date_semis)), fin: maxDate(...projets.map(p => p.date_fin)) }
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Reprendre ce plan l’année suivante"
      description="Une nouvelle saison est créée avec les mêmes plantations, semis décalés d’autant d’années. Jardins, planches et équipe restent ceux de la ferme."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={() => submit()} loading={loading} disabled={!projets.length && !!source}>
            <CopyPlus className="h-4 w-4" />{apercu?.conflits.length ? 'Créer malgré les conflits' : 'Créer la saison'}
          </Button>
        </>
      }>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan à reprendre">
            <Select value={source?.id || ''} onChange={e => changeSource(e.target.value)}>
              {farmSeasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Décalage (années)" error={!shiftOk ? 'Entre 1 et 10 ans.' : undefined}>
            <Input type="number" inputMode="numeric" min={1} max={10} step={1} value={shift} onChange={e => changeShift(Math.trunc(+e.target.value))} />
          </Field>
          <Field label="Nom de la nouvelle saison" error={nameErr} hint={!nameErr && doublon ? `Une saison « ${doublon.name} » existe déjà.` : undefined}>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Année civile" error={yearErr}
            hint={!yearErr ? (anneePrise ? `La saison ${year} existe déjà : choisissez une autre année.` : `Du 1er janvier au 31 décembre ${year || ''}.`) : undefined}>
            <Input type="number" inputMode="numeric" value={year || ''} onChange={e => setYear(Math.trunc(+e.target.value))} />
          </Field>
        </div>

        {/* Aperçu */}
        <section aria-label="Aperçu du plan">
          <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Aperçu</h3>
          {!projets.length ? (
            <p className="rounded-xl border border-dashed border-border-strong p-4 text-sm text-fg-muted">
              {source ? `${source.name} ne contient aucune plantation à reprendre.` : 'Choisissez une saison.'}
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-fg">
                <strong>{projets.length} plantation{projets.length > 1 ? 's' : ''}</strong>
                {periode && <> du {formatDateLongue(periode.debut)} au {formatDateLongue(periode.fin)}</>}
              </p>
              {apercu && (apercu.exclues.vivaces > 0 || apercu.exclues.horsAnnee > 0) && (
                <p className="mb-2 text-xs text-fg-muted">
                  Non reprises : {[
                    apercu.exclues.vivaces ? `${apercu.exclues.vivaces} vivace${apercu.exclues.vivaces > 1 ? 's' : ''} en place (elles refleurissent sans replantation)` : '',
                    apercu.exclues.horsAnnee ? `${apercu.exclues.horsAnnee} plantation${apercu.exclues.horsAnnee > 1 ? 's' : ''} dont la première récolte n’est pas en ${source?.year}` : '',
                  ].filter(Boolean).join(' ; ')}.
                </p>
              )}
              <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-xl border border-border text-xs">
                {[...projets].sort((a, b) => a.date_semis.localeCompare(b.date_semis)).map(p => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
                    <span className="min-w-[8rem] font-medium text-fg">{p.culture_name}</span>
                    <span className="text-fg-muted">{plancheNom(p.planche_id)}</span>
                    <span className="num ml-auto text-fg-muted">semis {formatJourMois(p.date_semis, anneeRef)} → fin {formatJourMois(p.date_fin, anneeRef)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Conflits */}
        {apercu?.erreur && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">Conflits non calculables : {apercu.erreur}</p>
        )}
        {projets.length > 0 && !apercu?.erreur && (
          apercu!.conflits.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-3.5 py-2.5 text-sm text-fg">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />Aucune planche encore occupée à ces dates.
            </p>
          ) : (
            <section role="alert" className="space-y-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {apercu!.conflits.length} plantation{apercu!.conflits.length > 1 ? 's' : ''} sur des planches encore occupées
              </p>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-fg">
                {apercu!.conflits.map(({ projet, conflits }) => {
                  const gene = Array.from(new Set(conflits.flatMap(c => c.plantings.filter(x => x.id !== projet.id)).map(x =>
                    String(x.id).startsWith('projet:') ? `${x.culture_name} (repris aussi)` : nomAvecSaison(x))))
                  return (
                    <li key={projet.id} className={cn('rounded-lg bg-surface/70 px-2.5 py-1.5')}>
                      <span className="font-semibold">{projet.culture_name}</span>
                      <span className="text-fg-muted"> — {plancheNom(projet.planche_id)}</span>
                      <span className="block num">{conflits.map(c => phraseConflit(c, anneeRef)).join(' ; ')}</span>
                      {gene.length > 0 && <span className="block text-fg-muted">Planche occupée par {gene.join(', ')}</span>}
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-fg-muted">La reprise reste possible : ces plantations seront signalées en conflit dans Jardins &amp; planches, où vous pourrez les décaler.</p>
            </section>
          )
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
