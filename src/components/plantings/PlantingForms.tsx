'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CalendarCheck, Check, Trash2 } from 'lucide-react'
import { getOverlappingM2 } from '@/lib/types'
import type { PlantingFull, CultureCatalog } from '@/lib/types'
import { Badge, Button, Field, Input, SearchInput, TypeBadge, TYPE_LABEL, cn, useConfirm } from '@/components/ui'

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

function SurfaceGauge({ used, total, available }: { used: number; total: number; available: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const high = total > 0 && used / total > 0.9
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-fg">Surface de la planche</span>
        <span className="num text-fg-muted">
          {used} / {total} m² utilisés · <strong className={available > 0 ? 'text-primary' : 'text-danger'}>{available} m² disponibles</strong>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full transition-all', high ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
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

  // Surface disponible (calcul temporel, en excluant la culture en cours)
  const allPlantings: PlantingFull[] = ctx.plantings || []
  const samePlanchePlantings = allPlantings.filter((p: PlantingFull) => p.planche_id === planting.planche_id)

  let plancheM2 = 0
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === planting.planche_id) { plancheM2 = pl.surface_m2; break }
    }
  }

  // Preview dates
  const jc = planting.jours_cellule || 0
  const jch = planting.jours_champ || 0
  const jr = planting.jours_recolte || 21
  let previewPlantation = '', previewRecolte = '', previewFin = '', previewFinDate = ''
  if (dateSemis) {
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + jc)
    const dr = new Date(dp); dr.setDate(dr.getDate() + jch)
    const df = new Date(dr); df.setDate(df.getDate() + jr)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFinDate = df.toISOString().slice(0, 10)
  }

  // Calcul temporel : seules les cultures qui chevauchent comptent
  const usedM2 = dateSemis ? getOverlappingM2(samePlanchePlantings, dateSemis, previewFinDate || planting.date_fin, planting.id) : 0
  const availableM2 = Math.max(0, plancheM2 - usedM2)
  const isOverCapacity = surfaceM2 > availableM2

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!dateSemis || isOverCapacity || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.updatePlanting(planting.id, { date_semis: dateSemis, surface_m2: surfaceM2, notes: notes || null })
    setLoading(false)
    toast.success(`${planting.culture_name} mis à jour`, { description: `Semis le ${new Date(dateSemis + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` })
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
        <div><dt className="text-fg-subtle">Cycle (cellule / champ / récolte)</dt><dd className="num mt-0.5 font-medium text-fg">{jc} / {jch} / {jr} j</dd></div>
        <div><dt className="text-fg-subtle">Plants</dt><dd className="num mt-0.5 font-medium text-fg">{planting.plants_count}</dd></div>
        <div><dt className="text-fg-subtle">Tiges nettes</dt><dd className="num mt-0.5 font-medium text-fg">{planting.tiges_estimees}</dd></div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date de semis">
          <Input type="date" className="h-11" value={dateSemis} onChange={e => setDateSemis(e.target.value)} required />
        </Field>
        <Field label="Surface allouée (m²)"
          error={isOverCapacity ? `Capacité dépassée : ${availableM2} m² disponibles au maximum.` : undefined}
          hint={!isOverCapacity && surfaceM2 > 0 ? `Il restera ${(availableM2 - surfaceM2).toFixed(1)} m² disponibles.` : undefined}>
          <Input type="number" inputMode="decimal" className="h-11" min={0.5} max={plancheM2} step={0.5}
            value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)} />
        </Field>
      </div>

      {previewPlantation && <DatesPreview title="Dates recalculées" plantation={previewPlantation} recolte={previewRecolte} fin={previewFin} />}

      <Field label="Notes">
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles…" />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        <Button variant="danger-ghost" onClick={handleDelete} className="sm:mr-auto">
          <Trash2 className="h-4 w-4" />Supprimer de la planche
        </Button>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!dateSemis || isOverCapacity || surfaceM2 <= 0}>Enregistrer</Button>
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

  // Calcul de la surface disponible sur la planche (temporel)
  const allPlantings: PlantingFull[] = ctx.plantings || []
  const planchePlantings = allPlantings.filter((p: PlantingFull) => p.planche_id === plancheId)

  // Trouver la planche dans les jardins
  let plancheM2 = 0
  let plancheName = ''
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === plancheId) { plancheM2 = pl.surface_m2; plancheName = `${g.name} · ${pl.name}`; break }
    }
  }

  // Preview des dates calculées
  let previewPlantation = '', previewRecolte = '', previewFin = '', previewFinDate = ''
  if (selected && dateSemis) {
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + (selected.jours_cellule || 0))
    const dr = new Date(dp); dr.setDate(dr.getDate() + selected.jours_champ)
    const df = new Date(dr); df.setDate(df.getDate() + selected.jours_recolte)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFinDate = df.toISOString().slice(0, 10)
  }

  // Calcul temporel : seules les cultures qui chevauchent la période comptent
  const usedM2 = (dateSemis && previewFinDate)
    ? getOverlappingM2(planchePlantings, dateSemis, previewFinDate)
    : planchePlantings.reduce((s: number, p: PlantingFull) => s + (p.surface_m2 || 0), 0)
  const availableM2 = Math.max(0, plancheM2 - usedM2)
  const isOverCapacity = surfaceM2 > availableM2

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!cultureId || !dateSemis || isOverCapacity || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.createPlanting(plancheId, cultureId, dateSemis, surfaceM2)
    setLoading(false)
    toast.success(`${selected?.name} planté`, { description: plancheName })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <SurfaceGauge used={usedM2} total={plancheM2} available={availableM2} />
      {planchePlantings.length > 0 && (
        <p className="-mt-3 text-xs text-fg-muted">
          En place : {planchePlantings.map((p: PlantingFull) => `${p.culture_name} (${p.surface_m2} m²)`).join(', ')}
          {(!dateSemis || !previewFinDate) && <span className="text-fg-subtle"> — choisissez une culture et une date de semis pour le calcul sur la période.</span>}
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
        <Field label="Date de semis" hint="Le calendrier se calcule automatiquement à partir de cette date.">
          <Input type="date" className="h-11" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
        </Field>
        <Field label="Surface allouée (m²)"
          error={isOverCapacity ? `Capacité dépassée : seulement ${availableM2} m² disponibles sur cette planche.` : undefined}
          hint={!isOverCapacity && surfaceM2 > 0 ? `Il restera ${(availableM2 - surfaceM2).toFixed(1)} m² disponibles après cette culture.` : undefined}>
          <Input type="number" inputMode="decimal" className="h-11" min={0.5} max={plancheM2} step={0.5}
            value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)} />
        </Field>
      </div>

      {previewPlantation && <DatesPreview title="Dates calculées automatiquement" plantation={previewPlantation} recolte={previewRecolte} fin={previewFin} />}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!cultureId || !dateSemis || isOverCapacity || surfaceM2 <= 0}>Planter</Button>
      </div>
    </form>
  )
}
