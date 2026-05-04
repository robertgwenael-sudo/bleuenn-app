'use client'
import { useState } from 'react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

export default function Disponibilite({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')

  const plantings: PlantingFull[] = ctx.plantings || []

  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  if (filterType) data = data.filter(p => p.culture_type === filterType)

  // Group by culture name
  const byName: Record<string, PlantingFull[]> = {}
  data.forEach(p => {
    if (!byName[p.culture_name]) byName[p.culture_name] = []
    byName[p.culture_name].push(p)
  })

  // All 52 weeks of the year
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)

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

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Disponibilité des fleurs</h2>
      <p className="text-terre text-sm mb-5">Vue annuelle — semaines 1 à 52</p>

      <div className="flex gap-3 flex-wrap mb-5">
        <select className="input !w-auto" value={filterGarden} onChange={e => setFilterGarden(e.target.value)}>
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input !w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous les types</option>
          <option value="RR">RR</option><option value="MP">MP</option><option value="RU">RU</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="table-header text-left min-w-[150px] sticky left-0 bg-white z-10">Culture</th>
              {weeks.map(w => (
                <th key={w} className="table-header text-center !px-1.5 !py-2 min-w-[36px]">
                  S{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(byName).sort(([a], [b]) => a.localeCompare(b)).map(([name, cults]) => (
              <tr key={name} className="hover:bg-cream/50">
                <td className="table-cell !py-1">
                  <strong>{name}</strong>
                  <span className={`badge ml-1.5 ${cults[0].culture_type === 'RR' ? 'badge-rr' : cults[0].culture_type === 'MP' ? 'badge-mp' : 'badge-ru'}`}>
                    {cults[0].culture_type}
                  </span>
                </td>
                {weeks.map(w => {
                  const avail = cults.some(c => {
                    if (!c.date_recolte || !c.date_fin) return false
                    const wr = getWeekNumber(new Date(c.date_recolte + 'T00:00:00'))
                    const wf = getWeekNumber(new Date(c.date_fin + 'T00:00:00'))
                    return w >= wr && w <= wf
                  })
                  return (
                    <td key={w} className={`table-cell text-center !px-1 !py-1 ${avail ? 'bg-sage-pale text-sage font-bold' : 'bg-cream-dark text-gray-300'}`}>
                      {avail ? '●' : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
            {Object.keys(byName).length === 0 && (
              <tr><td colSpan={53} className="table-cell text-center text-terre py-8">
                La disponibilité se calcule automatiquement depuis vos plantations.
              </td></tr>
            )}
          </tbody>
          {Object.keys(byName).length > 0 && (
            <tfoot>
              <tr className="bg-cream/60">
                <td className="px-3 py-2 text-[0.6rem] font-bold text-brun uppercase tracking-wider sticky left-0 bg-cream/60 z-10 border-t-2 border-sage/20">
                  Total variétés
                </td>
                {weeks.map((_, i) => (
                  <td key={i} className={`text-center px-1 py-2 border-t-2 border-sage/20 text-[0.6rem] font-bold ${availCount[i] > 0 ? 'text-sage-dark' : 'text-terre/30'}`}>
                    {availCount[i]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
