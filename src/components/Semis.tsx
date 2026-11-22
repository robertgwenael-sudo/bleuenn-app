'use client'
import { useMemo, useState } from 'react'
import { getPlantingStatus, formatDateShort } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import { ligneSemis, type LigneSemis } from '@/lib/domain/production'
import { useProduction } from '@/hooks/useProduction'
import {
  Badge, Card, EmptyState, PageHeader, SearchInput, Select, SortHeader, StatusBadge, TableContainer, TypeBadge, cn, useSort, useSorted,
} from '@/components/ui'
import { photos } from '@/lib/images'
import { CelluleCalcul } from './semis/format'

const STATUSES = ['À semer', 'En germination', 'Planté', 'En récolte', 'Terminé'] as const
type SortKey = 'culture_name' | 'garden_name' | 'planche_name' | 'surface_m2' | 'culture_type' | 'jours_cellule' | 'temp_germination' | 'date_semis' | 'date_plantation' | 'date_recolte' | 'status' | 'graines' | 'mottes'

type Row = PlantingFull & { l: LigneSemis | null; erreur: string | null }

/** Semis en cellule, semis direct ou plant acheté (pas de graines). */
function Origine({ r }: { r: Row }) {
  if (r.l?.achat) return <Badge tone="violet">Plant acheté</Badge>
  if (r.l?.direct || !r.jours_cellule) return <Badge tone="blue">Semis direct</Badge>
  return <Badge tone="green">En cellule</Badge>
}

const brut = (r: Row, k: 'graines' | 'plantsAvecPertes') => {
  const c = r.l?.production[k]
  return c && c.etat === 'ok' ? c.valeur : -1
}

export default function Semis({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const sort = useSort<SortKey>('date_semis')

  const prod = useProduction(ctx)
  const plantings: PlantingFull[] = ctx.plantings || []
  // Même calcul que « Quoi semer » et que le tableur : graines exactes par semis.
  const lignes: Row[] = useMemo(() => plantings.map(p => {
    try { return { ...p, l: ligneSemis(p, prod.taux), erreur: null } } catch (e) {
      console.error('[semis] calcul', p.id, e)
      return { ...p, l: null, erreur: e instanceof Error ? e.message : String(e) }
    }
  }), [plantings, prod.taux])

  let filtered = lignes
  if (filterGarden) filtered = filtered.filter(p => p.garden_id === filterGarden)
  if (filterStatus) filtered = filtered.filter(p => getPlantingStatus(p) === filterStatus)
  if (filterType) filtered = filtered.filter(p => p.culture_type === filterType)
  const q = search.trim().toLowerCase()
  if (q) filtered = filtered.filter(p => [p.culture_name, p.garden_name, p.planche_name].some(x => x.toLowerCase().includes(q)))

  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, plantings.filter(p => getPlantingStatus(p) === s).length])), [plantings])
  const getter = useMemo(() => (p: Row) => sort.key === 'status' ? STATUSES.indexOf(getPlantingStatus(p))
    : sort.key === 'graines' ? brut(p, 'graines') : sort.key === 'mottes' ? brut(p, 'plantsAvecPertes')
    : sort.key === 'date_plantation' ? p.l?.calendrier.plantation ?? p.date_plantation
    : (p as any)[sort.key], [sort.key])
  const rows = useSorted(filtered, getter, sort.dir)

  const H = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) =>
    <SortHeader key={k} label={label} active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} align={right ? 'right' : 'left'} className={right ? '!text-right' : ''} />

  return (
    <div>
      <PageHeader title="Semis & germination" image={photos.semisGodets}
        description={`Graines à semer par semis (plants + ${prod.taux.semis} % de pertes × graines par motte), entrée en cellule et plantation`} />

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
          <option value="RR">RR : répétitive</option>
          <option value="MP">MP : moyen</option>
          <option value="RU">RU : unique</option>
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
              <li key={p.id} className="rounded-xl border border-border bg-surface p-3 shadow-xs" data-testid="semis-carte">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{p.culture_name}</p>
                    <p className="truncate text-xs text-fg-muted">{p.garden_name} · {p.planche_name} · {p.surface_m2} m²</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={getPlantingStatus(p)} /><Origine r={p} /></div>
                </div>
                {p.erreur && <p className="mt-2 text-xs font-medium text-danger">{p.erreur}</p>}
                {p.l && (
                  <div className="num mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-primary-soft px-2 py-1.5">
                      <div className="text-fg-subtle">Graines</div>
                      <div className="font-semibold text-primary"><CelluleCalcul c={p.l.production.graines} /></div>
                    </div>
                    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
                      <div className="text-fg-subtle">{p.l.achat ? 'Plants à acheter' : 'Mottes'}</div>
                      <div className="font-semibold text-fg"><CelluleCalcul c={p.l.production.plantsAvecPertes} /></div>
                    </div>
                    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
                      <div className="text-fg-subtle">{p.l.achat ? 'Plantation' : 'Entrée cellule'}</div>
                      <div className="font-semibold text-fg">{formatDateShort(p.l.calendrier.entree)} <span className="text-fg-subtle">S{p.l.calendrier.semaineEntree.semaine}</span></div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <TableContainer className="hidden md:block" label="Plantations">
            <table className="data-table">
              <thead>
                <tr>
                  {H({ k: 'culture_name', label: 'Culture' })}
                  <th>Origine</th>
                  {H({ k: 'date_semis', label: 'Entrée cellule' })}
                  {H({ k: 'graines', label: 'Graines à semer', right: true })}
                  {H({ k: 'mottes', label: `Mottes (+ ${prod.taux.semis} %)`, right: true })}
                  <th className="!text-right">Graines / motte</th>
                  {H({ k: 'jours_cellule', label: 'J. cellule', right: true })}
                  {H({ k: 'date_plantation', label: 'Plantation' })}
                  {H({ k: 'status', label: 'Statut' })}
                  {H({ k: 'garden_name', label: 'Jardin' })}
                  {H({ k: 'planche_name', label: 'Planche' })}
                  {H({ k: 'surface_m2', label: 'm²', right: true })}
                  {H({ k: 'temp_germination', label: 'Temp.', right: true })}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} data-testid="semis-ligne">
                    <td className="font-medium">{p.culture_name} <TypeBadge type={p.culture_type} /></td>
                    <td><Origine r={p} /></td>
                    <td className="num">{p.l ? <>{formatDateShort(p.l.calendrier.entree)} <span className="text-2xs text-fg-subtle">S{p.l.calendrier.semaineEntree.semaine}</span></> : formatDateShort(p.date_semis)}</td>
                    <td className="text-right font-semibold text-primary">{p.l ? <CelluleCalcul c={p.l.production.graines} /> : <span className="text-xs text-danger">{p.erreur}</span>}</td>
                    <td className="text-right">{p.l && <CelluleCalcul c={p.l.production.plantsAvecPertes} />}</td>
                    <td className="num text-right">{p.l?.achat ? '' : p.graines_par_plant ?? ''}</td>
                    <td className="num text-right">{p.l?.achat ? '' : p.jours_cellule}</td>
                    <td className="num">{p.l ? <>{formatDateShort(p.l.calendrier.plantation)} <span className="text-2xs text-fg-subtle">S{p.l.calendrier.semaineSortie.semaine}</span></> : formatDateShort(p.date_plantation)}</td>
                    <td><StatusBadge status={getPlantingStatus(p)} /></td>
                    <td className="text-fg-muted">{p.garden_name}</td>
                    <td className="text-fg-muted">{p.planche_name}</td>
                    <td className="num text-right">{p.surface_m2}</td>
                    <td className="num text-right">{p.temp_germination ? `${p.temp_germination}°C` : ''}</td>
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
