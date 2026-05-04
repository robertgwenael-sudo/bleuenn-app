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
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#f5d98e' }} /> En cellule
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#e8b06d' }} /> Au champ
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#9dc08b' }} /> En récolte
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
              <th className="table-header text-center !px-1.5 text-[0.55rem] min-w-[45px]">Plants</th>
              <th className="table-header text-center !px-1.5 text-[0.55rem] min-w-[45px]">Tiges</th>
              {weeks.map(w => (
                <th key={w} className="table-header text-center !px-0.5 !py-1 text-[0.55rem] min-w-[22px]">{w}</th>
              ))}
            </tr>
            <tr>
              <th className="table-header" />
              <th className="table-header text-center !px-1.5 !py-0.5 text-[0.45rem] text-terre font-normal">nb</th>
              <th className="table-header text-center !px-1.5 !py-0.5 text-[0.45rem] text-terre font-normal">nettes</th>
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
                <td colSpan={55} className="table-cell text-center text-terre py-8">
                  Ajoutez des cultures pour voir le calendrier se construire automatiquement.
                </td>
              </tr>
            ) : (
              gardenGroups.map(group => (
                <Fragment key={group.gardenId}>
                  {/* En-tête du jardin */}
                  <tr>
                    <td colSpan={55} className="bg-sage/10 border-b border-sage/20 px-3 py-2">
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
                        <td className="table-cell !py-1.5 text-center text-[0.6rem] font-semibold text-brun">{p.plants_count || '—'}</td>
                        <td className="table-cell !py-1.5 text-center text-[0.6rem] font-semibold text-sage">{p.tiges_estimees || '—'}</td>
                        {weeks.map(w => {
                          let cls = ''
                          if (p.jours_cellule > 0 && w >= wSemis && w < wPlant) cls = 'cal-cellule'
                          else if (w >= wPlant && w < wRec) cls = 'cal-champ'
                          else if (w >= wRec && w <= wFin) cls = 'cal-recolte'
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

          {/* ─── Ligne totaux dynamiques par semaine ─── */}
          {unique.length > 0 && (() => {
            // Calcul dynamique par semaine
            const plantsEnCellule: number[] = new Array(52).fill(0)
            const plantsAuChamp: number[] = new Array(52).fill(0)
            const plantsEnRecolte: number[] = new Array(52).fill(0)
            const tigesARecolter: number[] = new Array(52).fill(0)

            for (const p of unique) {
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
                } else if (w >= wPlant && w < wRec) {
                  plantsAuChamp[i] += plants
                } else if (w >= wRec && w <= wFin) {
                  plantsEnRecolte[i] += plants
                  tigesARecolter[i] += tigesParSemaine
                }
              }
            }

            const totalPlants = unique.reduce((s, p) => s + (p.plants_count || 0), 0)
            const totalTiges = unique.reduce((s, p) => s + (p.tiges_estimees || 0), 0)

            const maxCellule = Math.max(...plantsEnCellule)
            const maxChamp = Math.max(...plantsAuChamp)
            const maxRecolte = Math.max(...plantsEnRecolte)
            const maxTiges = Math.max(...tigesARecolter)

            return (
              <tfoot>
                {/* Plants en cellule */}
                <tr>
                  <td className="px-3 py-1.5 text-[0.6rem] font-bold text-brun border-t-2 border-brun/20 whitespace-nowrap">
                    <span className="inline-block w-3 h-2.5 rounded mr-1.5 align-middle" style={{ backgroundColor: '#f5d98e' }} />
                    Plants en cellule
                  </td>
                  <td className="text-center text-[0.6rem] font-bold text-brun border-t-2 border-brun/20">{totalPlants}</td>
                  <td className="text-center text-[0.6rem] font-bold text-sage border-t-2 border-brun/20">{totalTiges}</td>
                  {weeks.map((w, i) => {
                    const v = plantsEnCellule[i]
                    const pct = maxCellule > 0 ? v / maxCellule : 0
                    return (
                      <td key={w} className="!p-0.5 text-center border-t-2 border-brun/20">
                        {v > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="text-[0.5rem] font-bold text-brun leading-none">{v}</span>
                            <div className="w-[16px] mt-0.5 rounded-sm" style={{ height: `${Math.max(2, pct * 16)}px`, backgroundColor: '#f5d98e' }} />
                          </div>
                        ) : (
                          <div className="h-[20px]" />
                        )}
                      </td>
                    )
                  })}
                </tr>
                {/* Tiges à récolter par semaine */}
                <tr className="bg-sage/5">
                  <td className="px-3 py-1.5 text-[0.6rem] font-bold text-feuille whitespace-nowrap">
                    ✂️ Tiges à récolter
                  </td>
                  <td />
                  <td />
                  {weeks.map((w, i) => {
                    const v = tigesARecolter[i]
                    const pct = maxTiges > 0 ? v / maxTiges : 0
                    return (
                      <td key={w} className="!p-0.5 text-center">
                        {v > 0 ? (
                          <div className="flex flex-col items-center">
                            <span className="text-[0.5rem] font-bold text-feuille leading-none">{v}</span>
                            <div className="w-[16px] mt-0.5 rounded-sm" style={{ height: `${Math.max(2, pct * 16)}px`, backgroundColor: '#609c54' }} />
                          </div>
                        ) : (
                          <div className="h-[20px]" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
