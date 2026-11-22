'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CornerDownRight, Fence, Pencil, Plus, Trash2, X } from 'lucide-react'
import { getPlantingStatus } from '@/lib/types'
import type { PlantingFull, Garden, CultureCatalog } from '@/lib/types'
import {
  Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, StatusBadge, cn, useConfirm,
} from '@/components/ui'
import { AddPlantingForm, EditPlantingForm } from '@/components/plantings/PlantingForms'
import { EditerSurfaceDialog } from '@/components/plantings/EditerSurface'
import {
  AlerteConflits, LegendeFrise, OccupationFrise, calculables, conflitsPlanche, periodeSure,
} from '@/components/plantings/Occupation'
import { chevauche, fenetreMensuelle, formatJourMois, formatMois, phraseOccupation, segmentsOccupation, surfaceOccupeeLe } from '@/lib/domain'
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
  // Modifier nom et surface d'un jardin ou d'une planche
  const [editJardin, setEditJardin] = useState<any | null>(null)
  const [editPlanche, setEditPlanche] = useState<{ pl: any; g: any; occupationMax: number } | null>(null)
  const [selectedGardenId, setSelectedGardenId] = useState('')
  const [selectedPlancheId, setSelectedPlancheId] = useState('')
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)

  const gardens: Garden[] = ctx.gardens || []
  // Toutes les plantations de la ferme, toutes saisons : la planche est permanente
  const farmPlantings: PlantingFull[] = ctx.farmPlantings || ctx.plantings || []
  const activeSeasonId: string | undefined = ctx.activeSeason?.id
  const today: string = ctx.today
  const fenetre = fenetreMensuelle(today, 12)
  const anneeRef = Number(today.slice(0, 4))
  const totalM2 = gardens.reduce((s, g) => s + g.surface_m2, 0)

  const getPlanchePlantings = (plancheId: string) =>
    farmPlantings.filter(p => p.planche_id === plancheId)

  // Conflits de surface sur les 12 mois affichés, toutes planches
  const conflitsParPlanche = new Map<string, ReturnType<typeof conflitsPlanche>>()
  for (const g of gardens) for (const pl of (g.planches || [])) {
    const c = conflitsPlanche(pl, getPlanchePlantings(pl.id), fenetre)
    if (c.length) conflitsParPlanche.set(pl.id, c)
  }
  const nbPlanchesEnConflit = conflitsParPlanche.size

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
        description={`${gardens.length} jardin${gardens.length > 1 ? 's' : ''} — ${totalM2} m² · occupation lue par dates, toutes saisons confondues`}
        image={photos.champCoucherSoleil}
        actions={<Button onClick={() => setModal('garden')}><Plus className="h-4 w-4" />Nouveau jardin</Button>}
      />

      {gardens.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card lg:flex-row lg:items-center">
          <p className="text-sm text-fg">
            <span className="font-semibold">Frises de {formatMois(fenetre.debut)} à {formatMois(fenetre.fin)}</span>
            <span className="text-fg-muted"> — les jardins et planches durent d’une saison à l’autre.</span>
          </p>
          <div className="lg:ml-auto"><LegendeFrise activeSeasonName={ctx.activeSeason?.name} /></div>
        </div>
      )}
      {nbPlanchesEnConflit > 0 && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p><strong className="text-danger">{nbPlanchesEnConflit} planche{nbPlanchesEnConflit > 1 ? 's' : ''} en conflit de surface</strong> sur les 12 prochains mois : la somme des cultures en place dépasse la surface de la planche. Le détail est indiqué sous chaque planche concernée.</p>
        </div>
      )}

      {gardens.length === 0 ? (
        <Card>
          <EmptyState image={photos.champCoucherSoleil} title="Aucun jardin dans votre ferme"
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
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditJardin(g)} aria-label={`Modifier ${g.name} (nom, surface)`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => deleteGarden(g)} aria-label={`Supprimer ${g.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
                    const calc = calculables(plPlantings)
                    const conflits = conflitsParPlanche.get(pl.id) || []
                    let phrase = 'Libre'
                    try { phrase = phraseOccupation({ surface_m2: Number(pl.surface_m2) }, calc, today) } catch { phrase = 'Occupation non calculable (dates incomplètes)' }
                    const occupeAujourdhui = surfaceOccupeeLe(calc, today)
                    const plPct = pl.surface_m2 > 0 ? (occupeAujourdhui / pl.surface_m2 * 100) : 0
                    // Liste : la saison active + ce qui occupe la planche dans la fenêtre, quelle que soit la saison
                    const visibles = plPlantings.filter(p => {
                      if (p.season_id === activeSeasonId) return true
                      const per = periodeSure(p)
                      return per ? chevauche(per, fenetre) : false
                    })
                    const sorted = [...visibles].sort((a, b) => a.date_semis.localeCompare(b.date_semis))

                    // Détecter les successions : une culture dont le semis démarre après la fin d'une précédente
                    const isSuccession = (p: PlantingFull, idx: number): PlantingFull | null => {
                      if (idx === 0) return null
                      for (let j = idx - 1; j >= 0; j--) {
                        const prev = sorted[j]
                        if (prev.date_fin && p.date_semis >= prev.date_fin) return prev
                      }
                      return null
                    }
                    const editer = (p: PlantingFull) => { setSelectedPlanting(p); setModal('editPlanting') }

                    return (
                      <li key={pl.id} className={cn('px-4 py-3 sm:px-5', conflits.length > 0 && 'bg-danger-soft/30')}>
                        <div className="flex items-center gap-2">
                          <EditableName value={pl.name} label="la planche" onSave={v => ctx.updatePlanche(pl.id, { name: v })} className="text-sm font-semibold text-fg" />
                          <span className="num text-xs text-fg-subtle" title="Occupé aujourd’hui / surface de la planche">{Math.round(occupeAujourdhui * 100) / 100}/{pl.surface_m2} m²</span>
                          <UsageBar pct={plPct} className="ml-1 hidden w-16 sm:block" />
                          {conflits.length > 0 && <Badge tone="red"><AlertTriangle className="h-3 w-3" aria-hidden />Conflit</Badge>}
                          <div className="ml-auto flex items-center gap-1">
                            <Button variant="secondary" size="sm" onClick={() => { setSelectedPlancheId(pl.id); setModal('planting') }}>
                              <Plus className="h-3.5 w-3.5" />Culture
                            </Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${pl.name} (nom, surface)`}
                              onClick={() => {
                                const futurs = segmentsOccupation(calc).filter(sg => sg.fin >= today)
                                setEditPlanche({ pl, g, occupationMax: futurs.reduce((m, sg) => Math.max(m, sg.surface_occupee), 0) })
                              }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => deletePlanche(pl, g)} aria-label={`Supprimer ${pl.name}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className={cn('mt-1 text-xs', phrase === 'Libre' ? 'font-medium text-primary' : 'text-fg-muted')}>{phrase}</p>
                        <AlerteConflits conflits={conflits} today={today} />
                        <OccupationFrise plantings={plPlantings} planche={pl} fenetre={fenetre} today={today}
                          activeSeasonId={activeSeasonId} conflits={conflits} onSelect={editer} />
                        {sorted.length > 0 && (
                          <details className="group mt-2">
                            <summary className="cursor-pointer list-none text-xs font-medium text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                              <span className="inline-flex items-center gap-1"><ArrowRight className="h-3 w-3 transition group-open:rotate-90" aria-hidden />{sorted.length} plantation{sorted.length > 1 ? 's' : ''}</span>
                            </summary>
                          <ul className="mt-2 space-y-1">
                            {sorted.map((p: PlantingFull, idx: number) => {
                              const succession = isSuccession(p, idx)
                              const autre = p.season_id !== activeSeasonId
                              return (
                                <li key={p.id}>
                                  {succession && (
                                    <p className="flex items-center gap-1.5 px-2 py-0.5 text-[0.7rem] italic text-fg-subtle">
                                      <CornerDownRight className="h-3 w-3" aria-hidden />succession après {succession.culture_name}
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    className={cn('flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2.5 py-2 text-left text-xs transition hover:border-border hover:bg-surface-2',
                                      autre ? 'border-violet/30 bg-violet-soft/40' : 'border-transparent bg-surface-2/70')}
                                    onClick={() => editer(p)}
                                    title="Cliquer pour modifier ou supprimer"
                                  >
                                    <span className="min-w-[7rem] text-sm font-medium text-fg">{p.culture_name}</span>
                                    {autre && <Badge tone="violet">{p.season_name || 'Autre saison'}</Badge>}
                                    <span className="num text-fg-muted">{p.surface_m2} m²</span>
                                    <span className="num flex items-center gap-1 text-fg-muted">
                                      <span title="Entrée cellule">Semis {formatJourMois(p.date_semis, anneeRef)}</span>
                                      <ArrowRight className="h-3 w-3 text-fg-subtle" aria-hidden />
                                      <span title="Fin de récolte : la planche se libère le lendemain">fin {formatJourMois(p.date_fin, anneeRef)}</span>
                                    </span>
                                    <span className="ml-auto"><StatusBadge status={getPlantingStatus(p)} /></span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                          </details>
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

      {editJardin && (
        <EditerSurfaceDialog open onOpenChange={o => !o && setEditJardin(null)} type="jardin"
          initial={{ name: editJardin.name, surface_m2: Number(editJardin.surface_m2), description: editJardin.description }}
          contexte={{ sommePlanches: (editJardin.planches || []).reduce((t: number, p: any) => t + Number(p.surface_m2), 0) }}
          onSave={async v => { await ctx.updateGarden(editJardin.id, v); toast.success('Jardin mis à jour') }} />
      )}
      {editPlanche && (
        <EditerSurfaceDialog open onOpenChange={o => !o && setEditPlanche(null)} type="planche"
          initial={{ name: editPlanche.pl.name, surface_m2: Number(editPlanche.pl.surface_m2) }}
          contexte={{
            surfaceJardin: Number(editPlanche.g.surface_m2),
            autresPlanches: (editPlanche.g.planches || []).filter((p: any) => p.id !== editPlanche.pl.id).reduce((t: number, p: any) => t + Number(p.surface_m2), 0),
            occupationMax: editPlanche.occupationMax,
          }}
          onSave={async v => { await ctx.updatePlanche(editPlanche.pl.id, { name: v.name, surface_m2: v.surface_m2 }); toast.success('Planche mise à jour') }} />
      )}
    </div>
  )
}
