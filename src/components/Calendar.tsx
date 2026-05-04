'use client'
import { useState, Fragment } from 'react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

export default function Calendar({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
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
  // Trier les cultures par nom dans chaque jardin
  const gardenGroups = Array.from(gardenMap.values()).sort((a, b) => a.gardenName.localeCompare(b.gardenName))
  for (const g of gardenGroups) {
    g.plantings.sort((a, b) => a.culture_name.localeCompare(b.culture_name))
  }

  const weeks = Array.from({ length: 52 }, (_, i) => i + 1)
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Calendrier de culture</h2>
      <p className="text-terre text-sm mb-5">Vue hebdomadaire — calculé automatiquement depuis les dates de semis</p>

      {/* Legend */}
      <div className="flex gap-5 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-3 rounded bg-blush" /> En cellule
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-3 rounded bg-sage-light" /> Au champ
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-3 rounded bg-sage" /> En récolte
        </div>
      </div>

      <div className="flex gap-3 mb-5">
        <select className="input !w-auto" value={filterGarden} onChange={e => setFilterGarden(e.target.value)}>
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full">
          <thead>
            <tr>
              <th className="table-header text-left min-w-[220px]">Culture</th>
              {weeks.map(w => (
                <th key={w} className="table-header text-center !px-0.5 !py-1 text-[0.55rem] min-w-[22px]">{w}</th>
              ))}
            </tr>
            <tr>
              <th className="table-header" />
              {weeks.map(w => (
                <th key={w} className="table-header text-center !px-0.5 !py-0.5 text-[0.5rem] text-terre font-normal">
                  {monthNames[Math.min(11, Math.floor((w - 1) / 4.33))]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {unique.length === 0 ? (
              <tr>
                <td colSpan={53} className="table-cell text-center text-terre py-8">
                  Ajoutez des cultures pour voir le calendrier se construire automatiquement.
                </td>
              </tr>
            ) : (
              gardenGroups.map(group => (
                <Fragment key={group.gardenId}>
                  {/* En-tête du jardin */}
                  <tr>
                    <td colSpan={53} className="bg-sage/10 border-b border-sage/20 px-3 py-2">
                      <span className="font-serif font-semibold text-sm text-brun">{group.gardenName}</span>
                      <span className="text-[0.65rem] text-terre ml-2">({group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''})</span>
                    </td>
                  </tr>
                  {/* Une ligne par culture */}
                  {group.plantings.map(p => {
                    const wSemis = getWeekNumber(new Date(p.date_semis + 'T00:00:00'))
                    const wPlant = getWeekNumber(new Date(p.date_plantation + 'T00:00:00'))
                    const wRec = p.date_recolte ? getWeekNumber(new Date(p.date_recolte + 'T00:00:00')) : 99
                    const wFin = p.date_fin ? getWeekNumber(new Date(p.date_fin + 'T00:00:00')) : 99

                    return (
                      <tr key={p.id} className="hover:bg-cream/50">
                        <td className="table-cell !py-1.5 pl-4">
                          <span className="text-xs font-semibold text-brun">{p.culture_name}</span>
                          <span className="text-[0.6rem] text-terre ml-2">{p.planche_name}</span>
                        </td>
                        {weeks.map(w => {
                          let cls = ''
                          if (p.jours_cellule > 0 && w >= wSemis && w < wPlant) cls = 'bg-blush'
                          else if (w >= wPlant && w < wRec) cls = 'bg-sage-light'
                          else if (w >= wRec && w <= wFin) cls = 'bg-sage'
                          return (
                            <td key={w} className="!p-0.5 text-center">
                              <div className={`w-[18px] h-[14px] rounded-sm mx-auto ${cls}`} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
