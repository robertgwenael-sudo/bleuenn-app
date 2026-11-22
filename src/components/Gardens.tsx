'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CornerDownRight, Fence, Pencil, Plus, Trash2, X } from 'lucide-react'
import { getPlantingStatus } from '@/lib/types'
import type { PlantingFull, Garden, CultureCatalog } from '@/lib/types'
import {
  Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, StatusBadge, cn, useConfirm,
} from '@/components/ui'
import { AddPlantingForm, EditPlantingForm } from '@/components/plantings/PlantingForms'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'

// ─── Formulaire ajout jardin ──────────────────────
function AddGardenForm({ ctx, onClose }: { ctx: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [m2, setM2] = useState(100)
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!name) return
    setLoading(true)
    await ctx.createGarden(name, m2, desc)
    setLoading(false)
    toast.success(`Jardin « ${name} » créé`)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nom du jardin" error={tried && !name ? 'Donnez un nom au jardin.' : undefined}>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jardin A" autoFocus />
      </Field>
      <Field label="Surface (m²)">
        <Input type="number" inputMode="decimal" value={m2} onChange={e => setM2(+e.target.value)} />
      </Field>
      <Field label="Description">
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Cultures principales, notes…" />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading}>Créer le jardin</Button>
      </div>
    </form>
  )
}

// ─── Formulaire ajout planche + cultures ─────────
type PlancheCultureRow = { cultureId: string; surfaceM2: number; dateSemis: string }

function AddPlancheForm({ gardenId, ctx, onClose }: { gardenId: string; ctx: any; onClose: () => void }) {
  // Auto-numérotation PL
  const garden = (ctx.gardens || []).find((g: Garden) => g.id === gardenId)
  const existingPlanches = garden?.planches || []
  const nextNum = existingPlanches.length + 1
  const [num, setNum] = useState(nextNum)
  const [m2, setM2] = useState(10)
  const [cultures, setCultures] = useState<PlancheCultureRow[]>([])
  const [loading, setLoading] = useState(false)

  const catalog: CultureCatalog[] = ctx.catalog || []
  const plancheName = `PL ${num}`

  // Surface restante après les cultures ajoutées
  const usedM2 = cultures.reduce((s, c) => s + c.surfaceM2, 0)
  const availableM2 = Math.max(0, m2 - usedM2)

  const addCultureRow = () => {
    setCultures(prev => [...prev, { cultureId: '', surfaceM2: Math.min(1, availableM2), dateSemis: '' }])
  }

  const updateCultureRow = (idx: number, updates: Partial<PlancheCultureRow>) => {
    setCultures(prev => prev.map((c, i) => i === idx ? { ...c, ...updates } : c))
  }

  const removeCultureRow = (idx: number) => {
    setCultures(prev => prev.filter((_, i) => i !== idx))
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    // 1. Créer la planche
    const planche = await ctx.createPlanche(gardenId, plancheName, m2)
    let n = 0
    if (planche) {
      // 2. Créer les plantations associées
      for (const c of cultures) {
        if (c.cultureId && c.dateSemis && c.surfaceM2 > 0) {
          await ctx.createPlanting(planche.id, c.cultureId, c.dateSemis, c.surfaceM2)
          n++
        }
      }
      toast.success(`${plancheName} créée`, { description: n ? `${n} culture${n > 1 ? 's' : ''} plantée${n > 1 ? 's' : ''}` : garden?.name })
    }
    setLoading(false)
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Numéro">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg-muted">PL</span>
            <Input type="number" inputMode="numeric" min={1} value={num} onChange={e => setNum(+e.target.value)} aria-label="Numéro de planche" />
          </div>
        </Field>
        <Field label="Surface (m²)">
          <Input type="number" inputMode="decimal" min={1} step={0.5} value={m2} onChange={e => setM2(+e.target.value)} />
        </Field>
      </div>

      <div className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg-muted">
        Planche <strong className="text-fg">{plancheName}</strong> — {m2} m²
        {cultures.length > 0 && <> — <span className="num">{usedM2}/{m2} m² attribués</span></>}
      </div>

      {/* Cultures associées */}
      {cultures.length > 0 && (
        <div className="space-y-3">
          {cultures.map((row, idx) => {
            const sel = catalog.find(c => c.id === row.cultureId)
            // Preview dates
            let preview = ''
            if (sel && row.dateSemis) {
              const ds = new Date(row.dateSemis + 'T00:00:00')
              const dp = new Date(ds); dp.setDate(dp.getDate() + (sel.jours_cellule || 0))
              const dr = new Date(dp); dr.setDate(dr.getDate() + sel.jours_champ)
              preview = `Plantation ${dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — Récolte ${dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
            }
            return (
              <div key={idx} className="space-y-3 rounded-xl border border-border p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fg-muted">Culture {idx + 1}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeCultureRow(idx)} aria-label={`Retirer la culture ${idx + 1}`}><X className="h-4 w-4" /></Button>
                </div>
                <Select aria-label={`Culture ${idx + 1}`} value={row.cultureId} onChange={e => updateCultureRow(idx, { cultureId: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {catalog.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type}) — {c.prix_tige} €</option>
                  ))}
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Surface (m²)">
                    <Input type="number" inputMode="decimal" min={0.5} step={0.5} value={row.surfaceM2}
                      onChange={e => updateCultureRow(idx, { surfaceM2: +e.target.value })} />
                  </Field>
                  <Field label="Date de semis">
                    <Input type="date" value={row.dateSemis}
                      onChange={e => updateCultureRow(idx, { dateSemis: e.target.value })} />
                  </Field>
                </div>
                {preview && <p className="text-xs font-medium text-primary">{preview}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Jauge surface */}
      {cultures.length > 0 && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className={cn('h-full rounded-full transition-all', usedM2 > m2 ? 'bg-danger' : 'bg-primary')}
              style={{ width: `${Math.min(100, (usedM2 / m2) * 100)}%` }} />
          </div>
          {usedM2 > m2 && <p role="alert" className="mt-1.5 text-xs font-semibold text-danger">Dépassement ! {usedM2} m² attribués sur {m2} m²</p>}
        </div>
      )}

      <Button variant="secondary" className="w-full border-dashed" onClick={addCultureRow} disabled={availableM2 <= 0}>
        <Plus className="h-4 w-4" />Ajouter une culture à cette planche
      </Button>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={usedM2 > m2}>
          {cultures.length > 0 ? `Créer ${plancheName} + ${cultures.length} culture${cultures.length > 1 ? 's' : ''}` : `Créer ${plancheName}`}
        </Button>
      </div>
    </form>
  )
}

// ─── Nom éditable inline ──────────────────────────
function EditableName({ value, onSave, className, label }: { value: string; onSave: (v: string) => void; className?: string; label: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        type="button"
        className={cn('group inline-flex items-center gap-1.5 rounded text-left hover:underline hover:decoration-dotted hover:underline-offset-4', className)}
        onClick={() => { setDraft(value); setEditing(true) }}
        title="Cliquer pour renommer"
        aria-label={`Renommer ${label} « ${value} »`}
      >
        {value}
        <Pencil className="h-3 w-3 shrink-0 text-fg-subtle opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </button>
    )
  }

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) { onSave(trimmed); toast.success(`Renommé en « ${trimmed} »`) }
    setEditing(false)
  }

  return (
    <input
      className="field-control !min-h-0 h-8 w-auto min-w-[100px] px-2 py-1 text-sm"
      aria-label={`Nouveau nom pour ${label}`}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      autoFocus
    />
  )
}

function UsageBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}>
      <div className={cn('h-full rounded-full transition-all', pct > 90 ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ─── Composant principal ──────────────────────────
export default function Gardens({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
  const [modal, setModal] = useState<string | null>(null)
  const [selectedGardenId, setSelectedGardenId] = useState('')
  const [selectedPlancheId, setSelectedPlancheId] = useState('')
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)

  const gardens: Garden[] = ctx.gardens || []
  const plantings: PlantingFull[] = ctx.plantings || []
  const totalM2 = gardens.reduce((s, g) => s + g.surface_m2, 0)

  const getPlanchePlantings = (plancheId: string) =>
    plantings.filter(p => p.planche_id === plancheId)

  useIntent('new-garden', () => setModal('garden'))

  const deleteGarden = async (g: Garden) => {
    const ok = await confirm({
      title: `Supprimer ${g.name} ?`,
      description: 'Le jardin, toutes ses planches et leurs plantations seront supprimés.',
      confirmLabel: 'Supprimer le jardin',
      destructive: true,
    })
    if (ok) { await ctx.deleteGarden(g.id); toast.success(`${g.name} supprimé`) }
  }
  const deletePlanche = async (pl: any, g: Garden) => {
    const ok = await confirm({
      title: 'Supprimer cette planche ?',
      description: `${pl.name} (${g.name}) et ses plantations seront supprimées.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) { await ctx.deletePlanche(pl.id); toast.success(`${pl.name} supprimée`) }
  }

  const close = () => setModal(null)
  const selectedPlanche = gardens.flatMap(g => (g.planches || []).map((p: any) => ({ ...p, gardenName: g.name }))).find((p: any) => p.id === selectedPlancheId)
  const selectedGarden = gardens.find(g => g.id === selectedGardenId)

  return (
    <div>
      <PageHeader
        title="Jardins & planches"
        description={`${gardens.length} jardin${gardens.length > 1 ? 's' : ''} — ${totalM2} m² de surface totale`}
        image={photos.champCoucherSoleil}
        actions={<Button onClick={() => setModal('garden')}><Plus className="h-4 w-4" />Nouveau jardin</Button>}
      />

      {gardens.length === 0 ? (
        <Card>
          <EmptyState image={photos.champCoucherSoleil} title="Aucun jardin pour cette saison"
            description="Un jardin regroupe des planches. Chaque planche reçoit une ou plusieurs cultures, en même temps ou en succession."
            action={<Button onClick={() => setModal('garden')}><Fence className="h-4 w-4" />Créer mon premier jardin</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {gardens.map(g => {
            const planches = g.planches || []
            const usedM2 = planches.reduce((s: number, p: any) => s + p.surface_m2, 0)
            return (
              <Card key={g.id} className="flex flex-col overflow-hidden">
                <div className="border-b border-border p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-serif text-xl">
                        <EditableName value={g.name} label="le jardin" onSave={v => ctx.updateGarden(g.id, { name: v })} />
                      </h2>
                      <p className="mt-0.5 text-sm text-fg-muted">{g.surface_m2} m²{g.description ? ` — ${g.description}` : ''}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => deleteGarden(g)} aria-label={`Supprimer ${g.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <UsageBar pct={g.surface_m2 > 0 ? usedM2 / g.surface_m2 * 100 : 0} className="flex-1" />
                    <span className="num shrink-0 text-xs text-fg-muted">Planches : {usedM2} / {g.surface_m2} m²</span>
                  </div>
                </div>

                {/* Planches */}
                <ul className="flex-1 divide-y divide-border">
                  {planches.map((pl: any) => {
                    const plPlantings = getPlanchePlantings(pl.id)
                    const plUsedM2 = plPlantings.reduce((s: number, p: PlantingFull) => s + (p.surface_m2 || 0), 0)
                    const plPct = pl.surface_m2 > 0 ? (plUsedM2 / pl.surface_m2 * 100) : 0
                    const sorted = [...plPlantings].sort((a, b) => a.date_semis.localeCompare(b.date_semis))
                    const fmtShort = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })

                    // Détecter les successions : une culture dont le semis démarre après la fin d'une précédente
                    const isSuccession = (p: PlantingFull, idx: number): PlantingFull | null => {
                      if (idx === 0) return null
                      for (let j = idx - 1; j >= 0; j--) {
                        const prev = sorted[j]
                        if (prev.date_fin && p.date_semis >= prev.date_fin) return prev
                      }
                      return null
                    }

                    return (
                      <li key={pl.id} className="px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-2">
                          <EditableName value={pl.name} label="la planche" onSave={v => ctx.updatePlanche(pl.id, { name: v })} className="text-sm font-semibold text-fg" />
                          <span className="num text-xs text-fg-subtle">{plUsedM2}/{pl.surface_m2} m²</span>
                          <UsageBar pct={plPct} className="ml-1 hidden w-16 sm:block" />
                          <div className="ml-auto flex items-center gap-1">
                            <Button variant="secondary" size="sm" onClick={() => { setSelectedPlancheId(pl.id); setModal('planting') }}>
                              <Plus className="h-3.5 w-3.5" />Culture
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => deletePlanche(pl, g)} aria-label={`Supprimer ${pl.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {sorted.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {sorted.map((p: PlantingFull, idx: number) => {
                              const ds = new Date(p.date_semis + 'T00:00:00')
                              const dp = new Date(p.date_plantation + 'T00:00:00')
                              const succession = isSuccession(p, idx)
                              return (
                                <li key={p.id}>
                                  {succession && (
                                    <p className="flex items-center gap-1.5 px-2 py-0.5 text-[0.7rem] italic text-fg-subtle">
                                      <CornerDownRight className="h-3 w-3" aria-hidden />succession après {succession.culture_name}
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-transparent bg-surface-2/70 px-2.5 py-2 text-left text-xs transition hover:border-border hover:bg-surface-2"
                                    onClick={() => { setSelectedPlanting(p); setModal('editPlanting') }}
                                    title="Cliquer pour modifier ou supprimer"
                                  >
                                    <span className="min-w-[7rem] text-sm font-medium text-fg">{p.culture_name}</span>
                                    <span className="num text-fg-muted">{p.surface_m2} m²</span>
                                    <span className="num flex items-center gap-1 text-fg-muted">
                                      <span title="Entrée cellule">Semis {fmtShort(ds)}</span>
                                      <ArrowRight className="h-3 w-3 text-fg-subtle" aria-hidden />
                                      <span title="Date plantation">Plant. {fmtShort(dp)}</span>
                                    </span>
                                    <span className="ml-auto"><StatusBadge status={getPlantingStatus(p)} /></span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="border-t border-border p-3 sm:px-5">
                  <Button variant="ghost" className="w-full" onClick={() => { setSelectedGardenId(g.id); setModal('planche') }}>
                    <Plus className="h-4 w-4" />Ajouter une planche
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modales */}
      <Dialog open={modal === 'garden'} onOpenChange={o => !o && close()} title="Nouveau jardin" description="Une parcelle qui regroupera vos planches.">
        <AddGardenForm ctx={ctx} onClose={close} />
      </Dialog>
      <Dialog open={modal === 'planche'} onOpenChange={o => !o && close()} title="Nouvelle planche" description={selectedGarden?.name}>
        <AddPlancheForm key={selectedGardenId} gardenId={selectedGardenId} ctx={ctx} onClose={close} />
      </Dialog>
      <Dialog open={modal === 'planting'} onOpenChange={o => !o && close()} size="lg" title="Ajouter une culture"
        description={selectedPlanche ? `${selectedPlanche.gardenName} · ${selectedPlanche.name}` : undefined}>
        <AddPlantingForm key={selectedPlancheId} plancheId={selectedPlancheId} ctx={ctx} onClose={close} />
      </Dialog>
      <Dialog open={modal === 'editPlanting'} onOpenChange={o => !o && close()} size="lg"
        title={selectedPlanting ? `Modifier — ${selectedPlanting.culture_name}` : 'Modifier'}>
        {selectedPlanting && (
          <EditPlantingForm key={selectedPlanting.id} planting={selectedPlanting} ctx={ctx} onClose={close} />
        )}
      </Dialog>
    </div>
  )
}
