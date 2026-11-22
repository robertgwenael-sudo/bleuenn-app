'use client'
import { useState } from 'react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import { Card, EmptyState, PageHeader, SearchInput, Select, TypeBadge, cn } from '@/components/ui'
import { photos } from '@/lib/images'

export default function Disponibilite({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')

  const plantings: PlantingFull[] = ctx.plantings || []

  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  if (filterType) data = data.filter(p => p.culture_type === filterType)
  if (search.trim()) data = data.filter(p => p.culture_name.toLowerCase().includes(search.trim().toLowerCase()))

  // Group by culture name
  const byName: Record<string, PlantingFull[]> = {}
  data.forEach(p => {
    if (!byName[p.culture_name]) byName[p.culture_name] = []
    byName[p.culture_name].push(p)
  })

  // All 52 weeks of the year
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  const currentWeek = getWeekNumber(new Date())

  // Count per week
  const availCount = weeks.map(cw => {
    return Object.values(byName).filter(cults =>
      cults.some(c => {
        if (!c.date_recolte || !c.date_fin) return false
        const wr = getWeekNumber(new Date(c.date_recolte + 'T00:00:00'))
        const wf = getWeekNumber(new Date(c.date_fin + 'T00:00:00'))
        return cw >= wr && cw <= wf
      })
    ).length
  })
  const maxCount = Math.max(1, ...availCount)
  const names = Object.keys(byName)

  return (
    <div>
      <PageHeader title="Disponibilité des fleurs" description="Vue annuelle des variétés en récolte, semaines 1 à 52" image={photos.tournesol} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une fleur…" className="col-span-2 sm:w-64" label="Rechercher une fleur" />
        <Select aria-label="Jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="sm:w-48">
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} wrapperClassName="sm:w-40">
          <option value="">Tous les types</option>
          <option value="RR">RR</option><option value="MP">MP</option><option value="RU">RU</option>
        </Select>
        <ul className="col-span-2 flex items-center gap-4 text-xs text-fg-muted sm:ml-auto">
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-phase-recolte" aria-hidden />Disponible</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-accent" aria-hidden />Semaine {currentWeek}</li>
        </ul>
      </div>

      {names.length === 0 ? (
        <Card>
          <EmptyState image={photos.tournesol} title="Aucune fleur à afficher"
            description={plantings.length ? 'Aucune variété ne correspond aux filtres.' : 'La disponibilité se calcule automatiquement depuis vos plantations.'} />
        </Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label="Disponibilité par semaine" tabIndex={0}>
          <table className="grid-table w-full">
            <thead className="sticky top-0 z-[2]">
              <tr>
                <th className="sticky left-0 z-[3] min-w-[190px] border-b border-border bg-surface-2 px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted">Culture</th>
                {weeks.map(w => (
                  <th key={w} scope="col" className={cn('min-w-[30px] border-b border-border bg-surface-2 px-0 py-2.5 text-center text-[0.62rem] font-semibold',
                    w === currentWeek ? 'text-accent' : 'text-fg-muted')}>
                    S{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(byName).sort(([a], [b]) => a.localeCompare(b)).map(([name, cults]) => (
                <tr key={name} className="group">
                  <th scope="row" className="sticky left-0 z-[1] border-b border-border/60 bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fg">{name}</span>
                      <TypeBadge type={cults[0].culture_type} />
                    </span>
                  </th>
                  {weeks.map(w => {
                    const avail = cults.some(c => {
                      if (!c.date_recolte || !c.date_fin) return false
                      const wr = getWeekNumber(new Date(c.date_recolte + 'T00:00:00'))
                      const wf = getWeekNumber(new Date(c.date_fin + 'T00:00:00'))
                      return w >= wr && w <= wf
                    })
                    return (
                      <td key={w} className={cn('border-b border-border/60 px-[2px] py-1.5 group-hover:bg-surface-2', w === currentWeek && 'bg-accent-soft/60')}>
                        <div className={cn('mx-auto h-4 w-[22px] rounded-[3px]', avail ? 'bg-phase-recolte' : 'bg-surface-3/70')}>
                          <span className="sr-only">{avail ? `Disponible semaine ${w}` : ''}</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-[2]">
              <tr>
                <th scope="row" className="sticky left-0 z-[3] border-t border-border bg-surface-2 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-fg">
                  Total variétés
                </th>
                {weeks.map((_, i) => (
                  <td key={i} className="border-t border-border bg-surface-2 px-0 py-1.5 text-center align-bottom">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-3.5 rounded-sm bg-primary/70" style={{ height: `${availCount[i] > 0 ? Math.max(2, (availCount[i] / maxCount) * 14) : 0}px` }} aria-hidden />
                      <span className={cn('num text-[0.65rem] font-semibold', availCount[i] > 0 ? 'text-fg' : 'text-fg-subtle/60')}>{availCount[i]}</span>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
