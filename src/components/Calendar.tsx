'use client'
import { useState, Fragment } from 'react'
import { CalendarRange, Scissors } from 'lucide-react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import { Card, CardContent, CardHeader, Dialog, EmptyState, PageHeader, Select, cn } from '@/components/ui'
import { EditPlantingForm } from '@/components/plantings/PlantingForms'
import { WeeklyAreaChart } from '@/components/charts/WeeklyAreaChart'
import { photos } from '@/lib/images'

// Calcul des totaux par semaine pour une liste de plantings
function calcWeeklyTotals(plantings: PlantingFull[]) {
  const plantsEnCellule: number[] = new Array(52).fill(0)
  const tigesARecolter: number[] = new Array(52).fill(0)

  for (const p of plantings) {
    const wSemis = getWeekNumber(new Date(p.date_semis + 'T00:00:00'))
    const wPlant = getWeekNumber(new Date(p.date_plantation + 'T00:00:00'))
    const wRec = p.date_recolte ? getWeekNumber(new Date(p.date_recolte + 'T00:00:00')) : 99
    const wFin = p.date_fin ? getWeekNumber(new Date(p.date_fin + 'T00:00:00')) : 99
    const plants = p.plants_count || 0
    const tigesNettes = p.tiges_estimees || 0
    const semainesRecolte = Math.max(1, wFin - wRec + 1)
    const tigesParSemaine = Math.round(tigesNettes / semainesRecolte)

    for (let i = 0; i < 52; i++) {
      const w = i + 1
      if (p.jours_cellule > 0 && w >= wSemis && w < wPlant) {
        plantsEnCellule[i] += plants
      }
      if (w >= wRec && w <= wFin) {
        tigesARecolter[i] += tigesParSemaine
      }
    }
  }

  return { plantsEnCellule, tigesARecolter }
}

const stickyCol = 'sticky left-0 z-[1] bg-surface'

// Lignes sous-total (plants en cellule + tiges à récolter)
function SubtotalRows({ label, plantings, weeks, isGlobal }: {
  label: string; plantings: PlantingFull[]; weeks: number[]; isGlobal?: boolean
}) {
  const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(plantings)
  const maxCellule = Math.max(...plantsEnCellule)
  const maxTiges = Math.max(...tigesARecolter)
  const totalPlants = plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
  const totalTiges = plantings.reduce((s, p) => s + (p.tiges_estimees || 0), 0)

  const bg = isGlobal ? 'bg-surface-3' : 'bg-surface-2'
  const border = isGlobal ? 'border-t-2 border-border-strong' : 'border-t border-border'

  const Bars = ({ values, max, colorClass }: { values: number[]; max: number; colorClass: string }) => (
    <>
      {weeks.map((w, i) => {
        const v = values[i]
        const pct = max > 0 ? v / max : 0
        return (
          <td key={w} className={cn('px-0 py-1 text-center align-bottom', bg)}>
            {v > 0 ? (
              <div className="flex flex-col items-center" title={`S${w} : ${v}`}>
                <span className="num text-[0.6rem] font-semibold leading-none text-fg">{v}</span>
                <div className={cn('mt-0.5 w-3.5 rounded-sm', colorClass)} style={{ height: `${Math.max(2, pct * 14)}px` }} />
              </div>
            ) : <div className="h-[18px]" />}
          </td>
        )
      })}
    </>
  )

  return (
    <>
      <tr>
        <td className={cn(stickyCol, bg, border, 'px-3 py-2 text-xs font-semibold text-fg')}>
          {isGlobal ? 'Total général' : <span className="text-fg-muted">Sous-total · {label}</span>}
        </td>
        <td className={cn(bg, border, 'num text-center text-xs font-semibold text-fg')}>{totalPlants}</td>
        <td className={cn(bg, border, 'num text-center text-xs font-semibold text-primary')}>{totalTiges}</td>
        <td colSpan={52} className={cn(bg, border)} />
      </tr>
      <tr>
        <td className={cn(stickyCol, bg, 'px-3 py-1 text-xs text-fg-muted')}>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-phase-cellule" aria-hidden />Plants en cellule</span>
        </td>
        <td className={bg} /><td className={bg} />
        <Bars values={plantsEnCellule} max={maxCellule} colorClass="bg-phase-cellule" />
      </tr>
      <tr>
        <td className={cn(stickyCol, bg, 'px-3 py-1 text-xs text-fg-muted')}>
          <span className="inline-flex items-center gap-1.5"><Scissors className="h-3 w-3 text-primary" aria-hidden />Tiges à récolter</span>
        </td>
        <td className={bg} /><td className={bg} />
        <Bars values={tigesARecolter} max={maxTiges} colorClass="bg-phase-recolte" />
      </tr>
    </>
  )
}

export default function Calendar({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)
  const plantings: PlantingFull[] = ctx.plantings || []

  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)

  // Deduplicate by culture+garden+planche
  const seen = new Set<string>()
  const unique = data.filter(p => {
    const k = `${p.culture_name}|${p.garden_id}|${p.planche_id}|${p.date_semis}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // Regrouper par jardin
  const gardenMap = new Map<string, { gardenId: string; gardenName: string; plantings: PlantingFull[] }>()
  for (const p of unique) {
    const gid = p.garden_id
    if (!gardenMap.has(gid)) {
      gardenMap.set(gid, { gardenId: gid, gardenName: p.garden_name, plantings: [] })
    }
    gardenMap.get(gid)!.plantings.push(p)
  }
  const gardenGroups = Array.from(gardenMap.values()).sort((a, b) => a.gardenName.localeCompare(b.gardenName))
  for (const g of gardenGroups) {
    g.plantings.sort((a, b) => a.culture_name.localeCompare(b.culture_name))
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
  const currentWeek = getWeekNumber(new Date())

  return (
    <div>
      <PageHeader title="Calendrier de culture" description="Vue hebdomadaire calculée automatiquement depuis les dates de semis" image={photos.champTournesols}
        actions={
          <Select aria-label="Filtrer par jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="w-full sm:w-52">
            <option value="">Tous les jardins</option>
            {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        } />

      {/* Légende */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-cellule" aria-hidden />En cellule</li>
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-champ" aria-hidden />Au champ</li>
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-recolte" aria-hidden />En récolte</li>
        <li className="flex items-center gap-2"><span className="h-3 w-0.5 bg-accent" aria-hidden />Semaine en cours (S{currentWeek})</li>
        <li className="text-fg-subtle sm:ml-auto">Cliquez une ligne pour modifier la plantation.</li>
      </ul>

      {unique.length === 0 ? (
        <Card>
          <EmptyState image={photos.champTournesols} title="Le calendrier est vide"
            description="Ajoutez des cultures pour voir le calendrier se construire automatiquement." />
        </Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-13rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label="Calendrier hebdomadaire" tabIndex={0}>
          <table className="grid-table min-w-[1320px] w-full">
            <thead className="sticky top-0 z-[2]">
              <tr className="bg-surface-2">
                <th className={cn(stickyCol, 'z-[3] min-w-[220px] bg-surface-2 px-3 pt-2 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted')}>Culture</th>
                <th className="min-w-[48px] bg-surface-2 px-1.5 pt-2 text-center text-2xs font-semibold uppercase text-fg-muted">Plants</th>
                <th className="min-w-[48px] bg-surface-2 px-1.5 pt-2 text-center text-2xs font-semibold uppercase text-fg-muted">Tiges</th>
                {weeks.map(w => (
                  <th key={w} className={cn('min-w-[22px] bg-surface-2 px-0 pt-2 text-center text-[0.62rem] font-semibold', w === currentWeek ? 'text-accent' : 'text-fg-muted')}>{w}</th>
                ))}
              </tr>
              <tr className="bg-surface-2">
                <th className={cn(stickyCol, 'z-[3] border-b border-border bg-surface-2')} />
                <th className="border-b border-border bg-surface-2 pb-1.5 text-center text-[0.6rem] font-normal text-fg-subtle">nb</th>
                <th className="border-b border-border bg-surface-2 pb-1.5 text-center text-[0.6rem] font-normal text-fg-subtle">nettes</th>
                {weeks.map(w => (
                  <th key={w} className="border-b border-border bg-surface-2 pb-1.5 text-center text-[0.58rem] font-normal text-fg-subtle">
                    {monthNames[Math.min(11, Math.floor((w - 1) / 4.33))]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gardenGroups.map(group => (
                <Fragment key={group.gardenId}>
                  {/* En-tête du jardin */}
                  <tr>
                    <td className={cn(stickyCol, 'border-b border-t border-border bg-primary-soft px-3 py-2')}>
                      <span className="font-serif text-sm font-semibold text-fg">{group.gardenName}</span>
                      <span className="ml-2 text-xs text-fg-muted">{group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''}</span>
                    </td>
                    <td colSpan={54} className="border-b border-t border-border bg-primary-soft" />
                  </tr>
                  {/* Une ligne par culture */}
                  {group.plantings.map(p => {
                    const wSemis = getWeekNumber(new Date(p.date_semis + 'T00:00:00'))
                    const wPlant = getWeekNumber(new Date(p.date_plantation + 'T00:00:00'))
                    const wRec = p.date_recolte ? getWeekNumber(new Date(p.date_recolte + 'T00:00:00')) : 99
                    const wFin = p.date_fin ? getWeekNumber(new Date(p.date_fin + 'T00:00:00')) : 99

                    return (
                      <tr key={p.id} className="group cursor-pointer" onClick={() => setSelectedPlanting(p)}>
                        <td className={cn(stickyCol, 'border-b border-border/60 px-3 py-1.5 group-hover:bg-surface-2')}>
                          <button type="button" className="rounded text-left text-xs font-medium text-fg underline decoration-border-strong decoration-dotted underline-offset-4 group-hover:decoration-primary"
                            onClick={e => { e.stopPropagation(); setSelectedPlanting(p) }}>
                            {p.culture_name}
                          </button>
                          <span className="ml-2 text-[0.68rem] text-fg-subtle">{p.planche_name}</span>
                        </td>
                        <td className="num border-b border-border/60 text-center text-[0.68rem] font-medium text-fg group-hover:bg-surface-2">{p.plants_count || '—'}</td>
                        <td className="num border-b border-border/60 text-center text-[0.68rem] font-medium text-primary group-hover:bg-surface-2">{p.tiges_estimees || '—'}</td>
                        {weeks.map(w => {
                          let cls = ''
                          if (p.jours_cellule > 0 && w >= wSemis && w < wPlant) cls = 'bg-phase-cellule'
                          else if (w >= wPlant && w < wRec) cls = 'bg-phase-champ'
                          else if (w >= wRec && w <= wFin) cls = 'bg-phase-recolte'
                          return (
                            <td key={w} className={cn('border-b border-border/60 px-[1px] py-1 group-hover:bg-surface-2', w === currentWeek && 'bg-accent-soft/60')}>
                              <div className={cn('mx-auto h-3.5 w-[18px] rounded-[3px]', cls)} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {/* Sous-totaux par jardin */}
                  <SubtotalRows label={group.gardenName} plantings={group.plantings} weeks={weeks} />
                </Fragment>
              ))}
            </tbody>

            {/* Total global */}
            {gardenGroups.length > 1 && (
              <tfoot>
                <SubtotalRows label="TOTAL" plantings={unique} weeks={weeks} isGlobal />
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ─── Récap par jardin ─────────────────── */}
      {gardenGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xl">Récapitulatif par jardin</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gardenGroups.map(group => {
              const totalPlants = group.plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
              const totalTiges = group.plantings.reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const totalRevenu = group.plantings.reduce((s, p) => s + (p.revenu_estime || 0), 0)
              return (
                <Card key={group.gardenId} className="p-4">
                  <h3 className="font-sans text-sm font-semibold">{group.gardenName}</h3>
                  <p className="text-xs text-fg-muted">{group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div><dt className="text-xs text-fg-subtle">Plants</dt><dd className="num text-lg font-semibold text-fg">{totalPlants}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Tiges nettes</dt><dd className="num text-lg font-semibold text-fg">{totalTiges}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Revenu est.</dt><dd className="num text-lg font-semibold text-primary">{Math.round(totalRevenu)} €</dd></div>
                  </dl>
                </Card>
              )
            })}
            {/* Carte total global */}
            {gardenGroups.length > 1 && (() => {
              const gTotalPlants = unique.reduce((s, p) => s + (p.plants_count || 0), 0)
              const gTotalTiges = unique.reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const gTotalRevenu = unique.reduce((s, p) => s + (p.revenu_estime || 0), 0)
              return (
                <Card className="border-primary/40 bg-primary-soft/40 p-4">
                  <h3 className="font-sans text-sm font-semibold">Total général</h3>
                  <p className="text-xs text-fg-muted">{unique.length} cultures — {gardenGroups.length} jardins</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div><dt className="text-xs text-fg-subtle">Plants</dt><dd className="num text-xl font-semibold text-fg">{gTotalPlants}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Tiges nettes</dt><dd className="num text-xl font-semibold text-fg">{gTotalTiges}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Revenu est.</dt><dd className="num text-xl font-semibold text-primary">{Math.round(gTotalRevenu)} €</dd></div>
                  </dl>
                </Card>
              )
            })()}
          </div>
        </section>
      )}

      {/* ─── Graphe Plants / Tiges par semaine ──── */}
      {unique.length > 0 && (() => {
        const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(unique)
        const chartData = weeks.map((w, i) => ({ week: w, plants: plantsEnCellule[i], tiges: tigesARecolter[i] }))
        return (
          <Card className="mt-8">
            <CardHeader title="Plants en cellule et tiges à récolter" description="Par semaine, sur toute la saison"
              icon={<CalendarRange className="h-4 w-4" />} />
            <CardContent>
              <WeeklyAreaChart data={chartData} ariaLabel="Plants en cellule et tiges à récolter par semaine"
                series={[{ key: 'plants', label: 'Plants en cellule', color: 'c2' }, { key: 'tiges', label: 'Tiges à récolter', color: 'c1' }]} />
            </CardContent>
          </Card>
        )
      })()}

      {/* Modale édition */}
      <Dialog open={!!selectedPlanting} onOpenChange={o => !o && setSelectedPlanting(null)} size="lg"
        title={selectedPlanting ? `Modifier — ${selectedPlanting.culture_name}` : 'Modifier'}>
        {selectedPlanting && <EditPlantingForm key={selectedPlanting.id} planting={selectedPlanting} ctx={ctx} onClose={() => setSelectedPlanting(null)} />}
      </Dialog>
    </div>
  )
}

