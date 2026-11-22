'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CalendarCheck, Check, Trash2 } from 'lucide-react'
import type { PlantingFull, CultureCatalog } from '@/lib/types'
import { Badge, Button, Field, Input, SearchInput, TypeBadge, TYPE_LABEL, cn, useConfirm } from '@/components/ui'
import {
  ajouterJours, conflitsSiAjout, estDateValide, formatJourMois, libreAPartirDu, periodeOccupation,
  segmentsOccupation, dureeJours, type PlantingOccupation,
} from '@/lib/domain'
import { AvertissementSaisie, calculables } from './Occupation'

// ─── Vérification d'occupation (toutes saisons, par dates) ──────────
// Le calcul vient du domaine (`conflitsSiAjout`, `libreAPartirDu`) et porte
// sur TOUTES les plantations de la planche, quelle que soit leur saison.
// Un conflit avertit mais n'empêche jamais d'enregistrer.
type Cycle = { jc: number; jch: number; jr: number; semisDirect: boolean }

function datesProjet(dateSemis: string, c: Cycle) {
  const plantation = ajouterJours(dateSemis, c.jc)
  const recolte = ajouterJours(plantation, c.jch)
  const fin = ajouterJours(recolte, c.jr)
  return { plantation, recolte, fin }
}

function verifierOccupation(ctx: any, plancheId: string, projet: {
  id: string; dateSemis: string; surface: number; cycle: Cycle | null; cultureName: string
}) {
  let plancheM2 = 0, plancheName = ''
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === plancheId) { plancheM2 = Number(pl.surface_m2); plancheName = `${g.name} · ${pl.name}` }
    }
  }
  const source: PlantingFull[] = ctx.farmPlantings?.length ? ctx.farmPlantings : (ctx.plantings || [])
  const voisines = calculables(source.filter(p => p.planche_id === plancheId))
  const autres = voisines.filter(p => p.id !== projet.id)
  const out = { plancheM2, plancheName, voisines, autres, conflits: [] as ReturnType<typeof conflitsSiAjout>,
    picAutres: 0, libre: null as string | null, semisSuggere: null as string | null, dates: null as ReturnType<typeof datesProjet> | null }
  if (!projet.cycle || !estDateValide(projet.dateSemis)) return out
  const dates = datesProjet(projet.dateSemis, projet.cycle)
  out.dates = dates
  const p: PlantingOccupation = {
    id: projet.id, surface_m2: projet.surface, date_semis: projet.dateSemis, date_plantation: dates.plantation,
    date_fin: dates.fin, semis_direct: projet.cycle.semisDirect, culture_name: projet.cultureName,
    season_name: ctx.activeSeason?.name, season_year: ctx.activeSeason?.year,
  }
  const periode = periodeOccupation(p)
  out.picAutres = segmentsOccupation(autres, periode).reduce((m, s) => Math.max(m, s.surface_occupee), 0)
  if (projet.surface > 0) {
    out.conflits = conflitsSiAjout({ surface_m2: plancheM2 }, autres, p)
    if (out.conflits.length) {
      out.libre = libreAPartirDu({ surface_m2: plancheM2 }, autres, projet.surface, periode.debut, dureeJours(periode))
      out.semisSuggere = out.libre ? (projet.cycle.semisDirect ? out.libre : ajouterJours(out.libre, -projet.cycle.jc)) : null
    }
  }
  return out
}

const PROJET_ID = 'projet:nouvelle-plantation'
const fmtM2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

// ─── Aperçu des dates calculées ─────────────────────
function DatesPreview({ title, plantation, recolte, fin }: { title: string; plantation: string; recolte: string; fin: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" aria-hidden />{title}
      </p>
      <ol className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          { l: 'Plantation', v: plantation, c: 'bg-phase-champ' },
          { l: 'Début récolte', v: recolte, c: 'bg-phase-recolte' },
          { l: 'Fin récolte', v: fin, c: 'bg-phase-recolte/60' },
        ].map(x => (
          <li key={x.l} className="rounded-lg bg-surface px-2 py-2 ring-1 ring-border">
            <span className={cn('mx-auto mb-1.5 block h-1 w-6 rounded-full', x.c)} aria-hidden />
            <span className="block text-fg-subtle">{x.l}</span>
            <strong className="mt-0.5 block font-semibold text-fg">{x.v}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SurfaceGauge({ pic, total, periodeConnue }: { pic: number; total: number; periodeConnue: boolean }) {
  const pct = total > 0 ? Math.min(100, (pic / total) * 100) : 0
  const libre = Math.max(0, total - pic)
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-fg">{periodeConnue ? 'Surface de la planche sur la période' : 'Surface de la planche'}</span>
        <span className="num text-fg-muted">
          {periodeConnue
            ? <>{fmtM2(pic)} / {fmtM2(total)} m² pris par les autres cultures au plus chargé · <strong className={libre > 0 ? 'text-primary' : 'text-danger'}>{fmtM2(libre)} m² libres</strong></>
            : <>{fmtM2(total)} m² — choisissez une culture et une date de semis</>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full transition-all', libre <= 0 ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Formulaire modification plantation ──────────────
// (logique identique à celle des anciennes sections Jardins, Calendrier et Vérification)
export function EditPlantingForm({ planting, ctx, onClose }: { planting: PlantingFull; ctx: any; onClose: () => void }) {
  const confirm = useConfirm()
  const [dateSemis, setDateSemis] = useState(planting.date_semis)
  const [surfaceM2, setSurfaceM2] = useState(planting.surface_m2)
  const [notes, setNotes] = useState(planting.planting_notes ?? planting.notes ?? '')
  const [loading, setLoading] = useState(false)

  const jc = planting.jours_cellule || 0
  const jch = planting.jours_champ || 0
  const jr = planting.jours_recolte || 21
  const today: string = ctx.today
  const v = verifierOccupation(ctx, planting.planche_id, {
    id: planting.id, dateSemis, surface: surfaceM2, cultureName: planting.culture_name,
    cycle: { jc, jch, jr, semisDirect: !!planting.semis_direct },
  })
  const anneeRef = Number((today || dateSemis || '2000').slice(0, 4))

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!dateSemis || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.updatePlanting(planting.id, { date_semis: dateSemis, surface_m2: surfaceM2, notes: notes || null })
    setLoading(false)
    toast.success(`${planting.culture_name} mis à jour`, {
      description: v.conflits.length ? 'Attention : la planche est en conflit de surface sur cette période.' : `Semis le ${formatJourMois(dateSemis, anneeRef)}`,
    })
    onClose()
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Supprimer ${planting.culture_name} ?`,
      description: `La culture sera retirée de ${planting.planche_name} (${planting.garden_name}), avec ses récoltes enregistrées.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) {
      await ctx.deletePlanting(planting.id)
      toast.success(`${planting.culture_name} supprimé de la planche`)
      onClose()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-border bg-surface-2/60 p-3.5 text-xs sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1"><dt className="text-fg-subtle">Type</dt><dd className="mt-0.5 flex items-center gap-1.5 font-medium text-fg"><TypeBadge type={planting.culture_type} />{TYPE_LABEL[planting.culture_type]}</dd></div>
        <div><dt className="text-fg-subtle">Emplacement</dt><dd className="mt-0.5 font-medium text-fg">{planting.garden_name} · {planting.planche_name}</dd></div>
        {planting.season_name && <div><dt className="text-fg-subtle">Saison</dt><dd className="mt-0.5 font-medium text-fg">{planting.season_name}</dd></div>}
        <div><dt className="text-fg-subtle">Cycle (cellule / champ / récolte)</dt><dd className="num mt-0.5 font-medium text-fg">{jc} / {jch} / {jr} j</dd></div>
        <div><dt className="text-fg-subtle">Plants</dt><dd className="num mt-0.5 font-medium text-fg">{planting.plants_count}</dd></div>
        <div><dt className="text-fg-subtle">Tiges nettes</dt><dd className="num mt-0.5 font-medium text-fg">{planting.tiges_estimees}</dd></div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de semis">
          <Input type="date" className="h-11" value={dateSemis} onChange={e => setDateSemis(e.target.value)} required />
        </Field>
        <Field label="Surface allouée (m²)"
          hint={v.dates && surfaceM2 > 0 && !v.conflits.length ? `Il restera ${fmtM2(Math.max(0, v.plancheM2 - v.picAutres - surfaceM2))} m² libres au plus chargé.` : undefined}>
          <Input type="number" inputMode="decimal" className="h-11" min={0.5} step={0.5}
            value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)} />
        </Field>
      </div>

      <AvertissementSaisie projetId={planting.id} conflits={v.conflits} plancheM2={v.plancheM2} surface={surfaceM2} libre={v.libre}
        semisSuggere={v.semisSuggere} dateSemis={dateSemis} onUseDate={setDateSemis} today={today} />

      {v.dates && <DatesPreview title="Dates recalculées" plantation={formatJourMois(v.dates.plantation, anneeRef)} recolte={formatJourMois(v.dates.recolte, anneeRef)} fin={formatJourMois(v.dates.fin, anneeRef)} />}

      <Field label="Notes">
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles…" />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        <Button variant="danger-ghost" onClick={handleDelete} className="sm:mr-auto">
          <Trash2 className="h-4 w-4" />Supprimer de la planche
        </Button>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!dateSemis || surfaceM2 <= 0}>{v.conflits.length ? 'Enregistrer malgré le conflit' : 'Enregistrer'}</Button>
      </div>
    </form>
  )
}

// ─── Formulaire ajout d'une culture sur une planche ─────
// (fusion des anciens AddPlantingForm de Jardins et AddCultureForm de Vérification,
//  mêmes calculs de surface disponible et d'aperçu de dates)
export function AddPlantingForm({ plancheId, ctx, onClose }: { plancheId: string; ctx: any; onClose: () => void }) {
  const [cultureId, setCultureId] = useState('')
  const [dateSemis, setDateSemis] = useState('')
  const [surfaceM2, setSurfaceM2] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const catalog: CultureCatalog[] = ctx.catalog || []
  const selected = catalog.find(c => c.id === cultureId)
  const filtered = catalog.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name))

  const today: string = ctx.today
  const v = verifierOccupation(ctx, plancheId, {
    id: PROJET_ID, dateSemis, surface: surfaceM2, cultureName: selected?.name || '',
    cycle: selected ? { jc: selected.jours_cellule || 0, jch: selected.jours_champ, jr: selected.jours_recolte ?? 21, semisDirect: !!selected.semis_direct } : null,
  })
  const anneeRef = Number((today || dateSemis || '2000').slice(0, 4))
  const enPlace = v.voisines.filter(p => !today || p.date_fin >= today)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!cultureId || !dateSemis || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.createPlanting(plancheId, cultureId, dateSemis, surfaceM2)
    setLoading(false)
    toast.success(`${selected?.name} planté`, {
      description: v.conflits.length ? `${v.plancheName} — en conflit de surface sur la période` : v.plancheName,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <SurfaceGauge pic={v.picAutres} total={v.plancheM2} periodeConnue={!!v.dates} />
      {enPlace.length > 0 && (
        <p className="-mt-3 text-xs text-fg-muted">
          Prévu ou en place sur la planche (toutes saisons) : {enPlace.map(p => `${p.culture_name}${p.season_id !== ctx.activeSeason?.id && p.season_name ? ` (${p.season_name})` : ''} ${fmtM2(Number(p.surface_m2))} m², jusqu’au ${formatJourMois(p.date_fin, anneeRef)}`).join(' · ')}
        </p>
      )}

      <div>
        <p id="culture-picker-label" className="mb-1.5 text-xs font-medium text-fg-muted">Culture</p>
        <SearchInput value={search} onChange={setSearch} placeholder="Filtrer le catalogue…" label="Filtrer les cultures" />
        <div role="listbox" aria-labelledby="culture-picker-label" className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border p-1">
          {filtered.map(c => (
            <button key={c.id} type="button" role="option" aria-selected={cultureId === c.id}
              onClick={() => setCultureId(c.id)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                cultureId === c.id ? 'bg-primary-soft font-medium text-fg' : 'text-fg hover:bg-surface-2')}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', cultureId === c.id ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong')}>
                {cultureId === c.id && <Check className="h-3 w-3" aria-hidden />}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="num text-xs text-fg-subtle">{c.prix_tige} €/tige</span>
              <TypeBadge type={c.type} />
            </button>
          ))}
          {filtered.length === 0 && <p className="p-3 text-sm text-fg-muted">Aucune culture trouvée</p>}
        </div>
      </div>

      {selected && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-primary-soft/60 px-3.5 py-2.5 text-xs text-fg">
          <span><strong>{TYPE_LABEL[selected.type]}</strong></span>
          <span className="num">Cellule {selected.jours_cellule} j <ArrowRight className="inline h-3 w-3" /> champ {selected.jours_champ} j <ArrowRight className="inline h-3 w-3" /> récolte {selected.jours_recolte} j</span>
          <span className="num">{selected.rendement_plant} tiges/plant · {selected.prix_tige} €</span>
          {selected.pincer && <Badge tone="amber">Pinçage</Badge>}
          {selected.filet && <Badge tone="violet">Filet</Badge>}
          {selected.couvre_sol && <Badge tone="green">Couvre-sol</Badge>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de semis" hint={`Le calendrier se calcule à partir de cette date. Plantation rattachée à ${ctx.activeSeason?.name || 'la saison active'}.`}>
          <Input type="date" className="h-11" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
        </Field>
        <Field label="Surface allouée (m²)"
          hint={v.dates && surfaceM2 > 0 && !v.conflits.length ? `Il restera ${fmtM2(Math.max(0, v.plancheM2 - v.picAutres - surfaceM2))} m² libres au plus chargé.` : undefined}>
          <Input type="number" inputMode="decimal" className="h-11" min={0.5} step={0.5}
            value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)} />
        </Field>
      </div>

      <AvertissementSaisie projetId={PROJET_ID} conflits={v.conflits} plancheM2={v.plancheM2} surface={surfaceM2} libre={v.libre}
        semisSuggere={v.semisSuggere} dateSemis={dateSemis} onUseDate={setDateSemis} today={today} />

      {v.dates && <DatesPreview title="Dates calculées automatiquement" plantation={formatJourMois(v.dates.plantation, anneeRef)} recolte={formatJourMois(v.dates.recolte, anneeRef)} fin={formatJourMois(v.dates.fin, anneeRef)} />}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!cultureId || !dateSemis || surfaceM2 <= 0}>{v.conflits.length ? 'Planter malgré le conflit' : 'Planter'}</Button>
      </div>
    </form>
  )
}
