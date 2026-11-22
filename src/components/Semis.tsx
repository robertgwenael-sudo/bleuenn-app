'use client'
import { useMemo, useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { getPlantingStatus, formatDateShort } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import {
  Card, EmptyState, PageHeader, SearchInput, Select, SortHeader, StatusBadge, TableContainer, TypeBadge, cn, useSort, useSorted,
} from '@/components/ui'
import { photos } from '@/lib/images'

const STATUSES = ['À semer', 'En germination', 'Planté', 'En récolte', 'Terminé'] as const
type SortKey = 'culture_name' | 'garden_name' | 'planche_name' | 'planche_m2' | 'culture_type' | 'jours_cellule' | 'temp_germination' | 'date_semis' | 'date_plantation' | 'date_recolte' | 'status'

const Bool = ({ v, label }: { v: boolean; label: string }) =>
  v ? <Check className="h-4 w-4 text-primary" aria-label={label} /> : <Minus className="h-4 w-4 text-fg-subtle/60" aria-label={`Sans ${label.toLowerCase()}`} />

export default function Semis({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const sort = useSort<SortKey>('date_semis')

  const plantings: PlantingFull[] = ctx.plantings || []

  let filtered = plantings
  if (filterGarden) filtered = filtered.filter(p => p.garden_id === filterGarden)
  if (filterStatus) filtered = filtered.filter(p => getPlantingStatus(p) === filterStatus)
  if (filterType) filtered = filtered.filter(p => p.culture_type === filterType)
  const q = search.trim().toLowerCase()
  if (q) filtered = filtered.filter(p => [p.culture_name, p.garden_name, p.planche_name].some(x => x.toLowerCase().includes(q)))

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, plantings.filter(p => getPlantingStatus(p) === s).length])), [plantings])
  const getter = useMemo(() => (p: PlantingFull) => sort.key === 'status' ? STATUSES.indexOf(getPlantingStatus(p)) : (p as any)[sort.key], [sort.key])
  const rows = useSorted(filtered, getter, sort.dir)

  const H = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) =>
    <SortHeader key={k} label={label} active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} align={right ? 'right' : 'left'} className={right ? '!text-right' : ''} />

  return (
    <div>
      <PageHeader title="Semis & germination" description="Suivi de l’ensemble des cultures, de la cellule à la récolte" image={photos.semisGodets} />

      {/* Répartition par statut (cliquable) */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrer par statut">
        {STATUSES.map(s => (
          <button key={s} type="button" aria-pressed={filterStatus === s}
            onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
              filterStatus === s ? 'border-primary bg-primary-soft text-fg' : 'border-border bg-surface text-fg-muted hover:border-border-strong')}>
            {s}<span className="num rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-fg">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Culture, jardin, planche…" className="col-span-2 sm:w-64" label="Rechercher une culture" />
        <Select aria-label="Jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="sm:w-48">
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select aria-label="Statut" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} wrapperClassName="sm:w-44">
          <option value="">Tous les statuts</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} wrapperClassName="col-span-2 sm:w-44">
          <option value="">Tous les types</option>
          <option value="RR">RR — Répétitive</option>
          <option value="MP">MP — Moyen</option>
          <option value="RU">RU — Unique</option>
        </Select>
        <span className="num col-span-2 self-center text-xs text-fg-subtle sm:ml-auto">{rows.length} plantation{rows.length > 1 ? 's' : ''}</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState image={photos.semisGodets} title="Aucune plantation trouvée"
            description={plantings.length ? 'Modifiez les filtres pour élargir la recherche.' : 'Ajoutez des cultures depuis la section Jardins.'} />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map(p => (
              <li key={p.id} className="rounded-xl border border-border bg-surface p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{p.culture_name}</p>
                    <p className="truncate text-xs text-fg-muted">{p.garden_name} · {p.planche_name} · {p.planche_m2} m²</p>
                  </div>
                  <StatusBadge status={getPlantingStatus(p)} />
                </div>
                <div className="num mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {[['Semis', p.date_semis], ['Plantation', p.date_plantation], ['Récolte', p.date_recolte]].map(([l, d]) => (
                    <div key={l} className="rounded-lg bg-surface-2 px-2 py-1.5">
                      <div className="text-fg-subtle">{l}</div>
                      <div className="font-semibold text-fg">{formatDateShort(d)}</div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <TableContainer className="hidden md:block" label="Plantations">
            <table className="data-table">
              <thead>
                <tr>
                  {H({ k: 'culture_name', label: 'Culture' })}
                  {H({ k: 'garden_name', label: 'Jardin' })}
                  {H({ k: 'planche_name', label: 'Planche' })}
                  {H({ k: 'planche_m2', label: 'm²', right: true })}
                  {H({ k: 'culture_type', label: 'Type' })}
                  {H({ k: 'jours_cellule', label: 'J. cellule', right: true })}
                  {H({ k: 'temp_germination', label: 'Temp.', right: true })}
                  {H({ k: 'date_semis', label: 'Semis' })}
                  {H({ k: 'date_plantation', label: 'Plantation' })}
                  {H({ k: 'date_recolte', label: 'Récolte' })}
                  {H({ k: 'status', label: 'Statut' })}
                  <th className="!text-center">Pinç.</th>
                  <th className="!text-center">Filet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.culture_name}</td>
                    <td className="text-fg-muted">{p.garden_name}</td>
                    <td className="text-fg-muted">{p.planche_name}</td>
                    <td className="num text-right">{p.planche_m2}</td>
                    <td><TypeBadge type={p.culture_type} /></td>
                    <td className="num text-right">{p.jours_cellule}</td>
                    <td className="num text-right">{p.temp_germination || '—'}°C</td>
                    <td className="num">{formatDateShort(p.date_semis)}</td>
                    <td className="num">{formatDateShort(p.date_plantation)}</td>
                    <td className="num">{formatDateShort(p.date_recolte)}</td>
                    <td><StatusBadge status={getPlantingStatus(p)} /></td>
                    <td><span className="flex justify-center"><Bool v={p.pincer} label="Pinçage" /></span></td>
                    <td><span className="flex justify-center"><Bool v={p.filet} label="Filet" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}
    </div>
  )
}
