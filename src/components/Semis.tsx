'use client'
import { useState } from 'react'
import { getPlantingStatus, formatDateShort } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    'À semer': 'badge-semer', 'En germination': 'badge-germination',
    'Planté': 'badge-plante', 'En récolte': 'badge-recolte', 'Terminé': 'badge-termine'
  }
  return <span className={`badge ${cls[status] || 'badge-termine'}`}>{status}</span>
}

function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = { RR: 'badge-rr', MP: 'badge-mp', RU: 'badge-ru' }
  return <span className={`badge ${cls[type] || ''}`}>{type}</span>
}

export default function Semis({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')

  const plantings: PlantingFull[] = ctx.plantings || []
  const gardens = [...new Set(plantings.map(p => p.garden_id))]
  const gardenNames = Object.fromEntries(
    (ctx.gardens || []).map((g: any) => [g.id, g.name])
  )

  let filtered = plantings
  if (filterGarden) filtered = filtered.filter(p => p.garden_id === filterGarden)
  if (filterStatus) filtered = filtered.filter(p => getPlantingStatus(p) === filterStatus)
  if (filterType) filtered = filtered.filter(p => p.culture_type === filterType)

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Semis & Germination</h2>
      <p className="text-terre text-sm mb-7">Suivi de l'ensemble des cultures</p>

      <div className="flex gap-3 flex-wrap mb-5">
        <select className="input !w-auto" value={filterGarden} onChange={e => setFilterGarden(e.target.value)}>
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input !w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {['À semer', 'En germination', 'Planté', 'En récolte', 'Terminé'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <select className="input !w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous les types</option>
          <option value="RR">RR — Répétitive</option>
          <option value="MP">MP — Moyen</option>
          <option value="RU">RU — Unique</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Culture', 'Jardin', 'Planche', 'm²', 'Type', 'J. cellule', 'Temp°', 'Semis', 'Plantation', 'Récolte', 'Statut', 'Pinç.', 'Filet'].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-cream transition">
                <td className="table-cell font-semibold">{p.culture_name}</td>
                <td className="table-cell">{p.garden_name}</td>
                <td className="table-cell">{p.planche_name}</td>
                <td className="table-cell">{p.planche_m2}</td>
                <td className="table-cell"><TypeBadge type={p.culture_type} /></td>
                <td className="table-cell">{p.jours_cellule}</td>
                <td className="table-cell">{p.temp_germination || '—'}°C</td>
                <td className="table-cell">{formatDateShort(p.date_semis)}</td>
                <td className="table-cell">{formatDateShort(p.date_plantation)}</td>
                <td className="table-cell">{formatDateShort(p.date_recolte)}</td>
                <td className="table-cell"><StatusBadge status={getPlantingStatus(p)} /></td>
                <td className="table-cell">{p.pincer ? '✓' : '—'}</td>
                <td className="table-cell">{p.filet ? '✓' : '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="table-cell text-center text-terre py-8">Aucune plantation trouvée. Ajoutez des cultures depuis la section Jardins.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
