'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Flower, Scissors, Trash2 } from 'lucide-react'
import { formatDateFR, getWeekNumber, getPlantingStatus } from '@/lib/types'
import type { PlantingFull, Harvest } from '@/lib/types'
import {
  Button, Card, CardContent, CardHeader, EmptyState, Field, Input, NumberStepper, PageHeader, QualityBadge,
  SearchInput, Segmented, Select, SortHeader, Stat, TableContainer, useConfirm, useSort, useSorted,
} from '@/components/ui'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'

type SortKey = 'date' | 'culture' | 'tiges' | 'quality'

export default function Recoltes({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [plantingId, setPlantingId] = useState('')
  const [tiges, setTiges] = useState('')
  const [quality, setQuality] = useState('A')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)
  const [search, setSearch] = useState('')
  const sort = useSort<SortKey>('date', 'desc')
  const formRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  const plantings: PlantingFull[] = ctx.plantings || []
  const harvests: Harvest[] = ctx.harvests || []

  const now = new Date()
  const thisWeek = getWeekNumber(now)
  const thisMonth = now.getMonth()

  const totalSaison = harvests.reduce((s, h) => s + h.tiges, 0)
  const totalWeek = harvests.filter(h => getWeekNumber(new Date(h.date + 'T00:00:00')) === thisWeek).reduce((s, h) => s + h.tiges, 0)
  const totalMonth = harvests.filter(h => new Date(h.date + 'T00:00:00').getMonth() === thisMonth).reduce((s, h) => s + h.tiges, 0)

  // Mapping planting id -> name
  const plantingMap = Object.fromEntries(plantings.map(p => [p.id, p]))

  // Choix groupés par jardin (mêmes plantations que la liste d'origine)
  const byGarden = useMemo(() => {
    const m = new Map<string, PlantingFull[]>()
    for (const p of plantings) {
      if (!m.has(p.garden_name)) m.set(p.garden_name, [])
      m.get(p.garden_name)!.push(p)
    }
    return Array.from(m.entries())
  }, [plantings])

  useIntent('new-harvest', () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    selectRef.current?.focus({ preventScroll: true })
  })

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!plantingId || !tiges) return
    setLoading(true)
    await ctx.createHarvest(plantingId, date, parseInt(tiges), quality, notes)
    setLoading(false)
    const p = plantingMap[plantingId]
    toast.success(`${parseInt(tiges)} tiges enregistrées`, { description: p ? `${p.culture_name} — ${p.garden_name} ${p.planche_name}` : undefined })
    setTiges('')
    setNotes('')
    setTried(false)
  }

  const remove = async (h: Harvest) => {
    const p = plantingMap[h.planting_id]
    const ok = await confirm({
      title: 'Supprimer cette récolte ?',
      description: `${h.tiges} tiges de ${p?.culture_name || 'culture inconnue'} du ${formatDateFR(h.date)}.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    await ctx.deleteHarvest(h.id)
    toast.success('Récolte supprimée')
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return harvests.filter(h => {
      if (!q) return true
      const p = plantingMap[h.planting_id]
      return [p?.culture_name, p?.garden_name, p?.planche_name, h.notes, h.quality].some(x => (x || '').toLowerCase().includes(q))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harvests, search, plantings])
  const getter = useMemo(() => (h: Harvest) => {
    if (sort.key === 'culture') return plantingMap[h.planting_id]?.culture_name || ''
    if (sort.key === 'tiges') return h.tiges
    if (sort.key === 'quality') return h.quality
    return h.date
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort.key, plantings])
  const sorted = useSorted(rows, getter, sort.dir)

  return (
    <div>
      <PageHeader title="Récoltes" description="Saisie au champ et suivi des tiges coupées" image={photos.bouquetChampetre} />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Cette semaine" value={totalWeek.toLocaleString('fr-FR')} sub="tiges" icon={<CalendarDays />} />
        <Stat label="Ce mois" value={totalMonth.toLocaleString('fr-FR')} sub="tiges" />
        <Stat label="Total saison" value={totalSaison.toLocaleString('fr-FR')} sub="tiges récoltées" icon={<Flower />} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:items-start">
        {/* Formulaire — pensé pour le téléphone, au pouce */}
        <Card className="scroll-mt-24 xl:sticky xl:top-[5.5rem]" ref={formRef}>
          <CardHeader title="Nouvelle récolte" icon={<Scissors className="h-4 w-4" />} />
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Culture / planche" error={tried && !plantingId ? 'Choisissez la culture récoltée.' : undefined}>
                <Select ref={selectRef} className="h-12 text-base sm:h-11 sm:text-sm" value={plantingId} onChange={e => setPlantingId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {byGarden.map(([garden, list]) => (
                    <optgroup key={garden} label={garden}>
                      {list.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.culture_name} — {p.planche_name}{getPlantingStatus(p) === 'En récolte' ? ' · en récolte' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Tiges récoltées" error={tried && !tiges ? 'Indiquez le nombre de tiges.' : undefined}>
                <NumberStepper label="le nombre de tiges" value={tiges} onChange={setTiges} step={10} min={0} placeholder="0" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
                <div>
                  <p id="quality-label" className="mb-1.5 text-xs font-medium text-fg-muted">Qualité</p>
                  <Segmented label="Qualité" size="lg" value={quality} onChange={setQuality}
                    options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} />
                </div>
              </div>
              <Field label="Notes">
                <Input className="h-11" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel" />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>Enregistrer la récolte</Button>
            </form>
          </CardContent>
        </Card>

        {/* Historique */}
        <section aria-labelledby="hist-title">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="hist-title" className="font-sans text-base font-semibold">Historique <span className="num font-normal text-fg-subtle">· {harvests.length}</span></h2>
            <SearchInput value={search} onChange={setSearch} placeholder="Culture, jardin, note…" className="sm:w-72" label="Rechercher une récolte" />
          </div>

          {harvests.length === 0 ? (
            <Card><EmptyState image={photos.bouquetChampetre} title="Aucune récolte enregistrée"
              description="Vos premières tiges coupées apparaîtront ici, avec les cumuls de la semaine et du mois."
              action={<Button onClick={() => selectRef.current?.focus()}>Saisir une récolte</Button>} /></Card>
          ) : sorted.length === 0 ? (
            <Card><EmptyState compact title="Aucun résultat" description={`Aucune récolte ne correspond à « ${search} ».`} /></Card>
          ) : (
            <>
              {/* Mobile : cartes */}
              <ul className="space-y-2 md:hidden">
                {sorted.map(h => {
                  const pl = plantingMap[h.planting_id]
                  return (
                    <li key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs">
                      <div className="num flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <span className="text-base font-semibold leading-none">{h.tiges}</span>
                        <span className="text-[0.65rem]">tiges</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fg">{pl?.culture_name || '—'}</p>
                        <p className="truncate text-xs text-fg-muted">{formatDateFR(h.date)} · {pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}</p>
                        {h.notes && <p className="truncate text-xs text-fg-subtle">{h.notes}</p>}
                      </div>
                      <QualityBadge q={h.quality} />
                      <Button variant="ghost" size="icon" onClick={() => remove(h)} aria-label="Supprimer cette récolte"><Trash2 className="h-4 w-4" /></Button>
                    </li>
                  )
                })}
              </ul>

              {/* Bureau : tableau triable */}
              <TableContainer className="hidden md:block" label="Historique des récoltes">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortHeader label="Date" active={sort.key === 'date'} dir={sort.dir} onClick={() => sort.toggle('date')} />
                      <SortHeader label="Culture" active={sort.key === 'culture'} dir={sort.dir} onClick={() => sort.toggle('culture')} />
                      <SortHeader label="Tiges" align="right" className="!text-right" active={sort.key === 'tiges'} dir={sort.dir} onClick={() => sort.toggle('tiges')} />
                      <SortHeader label="Qualité" active={sort.key === 'quality'} dir={sort.dir} onClick={() => sort.toggle('quality')} />
                      <th>Notes</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(h => {
                      const pl = plantingMap[h.planting_id]
                      return (
                        <tr key={h.id}>
                          <td className="whitespace-nowrap text-fg-muted">{formatDateFR(h.date)}</td>
                          <td>
                            <div className="font-medium">{pl?.culture_name || '—'}</div>
                            <div className="whitespace-nowrap text-xs text-fg-muted">{pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}</div>
                          </td>
                          <td className="num text-right font-semibold">{h.tiges}</td>
                          <td><QualityBadge q={h.quality} /></td>
                          <td className="max-w-[14rem] truncate text-fg-muted" title={h.notes || ''}>{h.notes || '—'}</td>
                          <td className="w-px text-right">
                            <Button variant="ghost" size="icon-sm" onClick={() => remove(h)} aria-label={`Supprimer la récolte du ${formatDateFR(h.date)}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableContainer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
