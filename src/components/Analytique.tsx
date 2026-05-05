'use client'
import { useState } from 'react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

// Répartition des tiges et du CA par semaine de récolte pour un planting
function distributeByWeek(p: PlantingFull): { week: number; tiges: number; ca: number }[] {
  if (!p.date_recolte || !p.date_fin) return []
  const wStart = getWeekNumber(new Date(p.date_recolte + 'T00:00:00'))
  const wEnd = getWeekNumber(new Date(p.date_fin + 'T00:00:00'))
  if (wStart > wEnd || wStart < 1) return []

  const nbWeeks = Math.max(1, wEnd - wStart + 1)
  const totalTiges = p.tiges_estimees || 0
  const prixTige = p.prix_tige || 0
  const tigesParSemaine = Math.round(totalTiges / nbWeeks)
  const caParSemaine = Math.round(tigesParSemaine * prixTige * 100) / 100

  const result: { week: number; tiges: number; ca: number }[] = []
  for (let w = wStart; w <= wEnd && w <= 52; w++) {
    result.push({ week: w, tiges: tigesParSemaine, ca: caParSemaine })
  }
  return result
}

interface WeekRow {
  week: number
  cultures: { name: string; type: string; tiges: number; ca: number }[]
  totalTiges: number
  totalCA: number
}

export default function Analytique({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')
  const plantings: PlantingFull[] = ctx.plantings || []

  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  if (filterType) data = data.filter(p => p.culture_type === filterType)

  // Construire les données par semaine
  const weekMap = new Map<number, WeekRow>()
  for (let w = 1; w <= 52; w++) {
    weekMap.set(w, { week: w, cultures: [], totalTiges: 0, totalCA: 0 })
  }

  // Pour chaque planting, répartir les tiges/CA sur ses semaines de récolte
  for (const p of data) {
    const distribution = distributeByWeek(p)
    for (const d of distribution) {
      const row = weekMap.get(d.week)
      if (!row) continue
      // Vérifier si cette culture est déjà dans la semaine (cumul si plusieurs plantings)
      const existing = row.cultures.find(c => c.name === p.culture_name)
      if (existing) {
        existing.tiges += d.tiges
        existing.ca += d.ca
      } else {
        row.cultures.push({ name: p.culture_name, type: p.culture_type, tiges: d.tiges, ca: d.ca })
      }
      row.totalTiges += d.tiges
      row.totalCA += d.ca
    }
  }

  const weeks = Array.from(weekMap.values())
  const activeWeeks = weeks.filter(w => w.totalTiges > 0)

  // Totaux cumulés
  const grandTotalTiges = activeWeeks.reduce((s, w) => s + w.totalTiges, 0)
  const grandTotalCA = activeWeeks.reduce((s, w) => s + w.totalCA, 0)

  // Toutes les cultures distinctes
  const allCultureNames = [...new Set(data.map(p => p.culture_name))].sort()

  // Données pour le graphe SVG
  const maxCA = Math.max(...weeks.map(w => w.totalCA), 1)
  const maxTiges = Math.max(...weeks.map(w => w.totalTiges), 1)

  // Matrice complète : pour chaque culture, CA par semaine
  const cultureWeeklyCA: Record<string, number[]> = {}
  for (const name of allCultureNames) {
    cultureWeeklyCA[name] = new Array(52).fill(0)
  }
  for (const p of data) {
    const distribution = distributeByWeek(p)
    for (const d of distribution) {
      if (cultureWeeklyCA[p.culture_name]) {
        cultureWeeklyCA[p.culture_name][d.week - 1] += d.ca
      }
    }
  }

  // Cumul progressif du CA
  let cumulCA = 0
  const cumulData = weeks.map(w => { cumulCA += w.totalCA; return cumulCA })

  // Chart dimensions
  const chartW = 920, chartH = 280
  const padL = 60, padR = 15, padT = 20, padB = 30
  const innerW = chartW - padL - padR
  const innerH = chartH - padT - padB
  const x = (i: number) => padL + (i / 51) * innerW
  const yCA = (v: number) => padT + innerH - (v / maxCA) * innerH
  const maxCumul = Math.max(...cumulData, 1)
  const yCumul = (v: number) => padT + innerH - (v / maxCumul) * innerH

  // Couleurs par type
  const typeColor: Record<string, string> = {
    'RR': '#8a9e7a', 'MP': '#c9a96e', 'RU': '#9b7cb8'
  }

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Analytique</h2>
      <p className="text-terre text-sm mb-5">Prévisionnel de chiffre d'affaires par semaine de récolte</p>

      {/* Filtres */}
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

      {/* Cartes résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card !p-4 text-center">
          <div className="text-2xl font-bold text-feuille">{grandTotalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€</div>
          <div className="text-[0.65rem] text-terre mt-1">CA prévisionnel total</div>
        </div>
        <div className="card !p-4 text-center">
          <div className="text-2xl font-bold text-brun">{grandTotalTiges.toLocaleString('fr-FR')}</div>
          <div className="text-[0.65rem] text-terre mt-1">Tiges à vendre</div>
        </div>
        <div className="card !p-4 text-center">
          <div className="text-2xl font-bold text-sage">{activeWeeks.length}</div>
          <div className="text-[0.65rem] text-terre mt-1">Semaines de vente</div>
        </div>
        <div className="card !p-4 text-center">
          <div className="text-2xl font-bold text-or-dark">
            {activeWeeks.length > 0 ? Math.round(grandTotalCA / activeWeeks.length).toLocaleString('fr-FR') : 0}€
          </div>
          <div className="text-[0.65rem] text-terre mt-1">CA moyen / semaine</div>
        </div>
      </div>

      {/* Graphe CA par semaine + cumul */}
      {activeWeeks.length > 0 && (
        <div className="card !p-4 mb-6">
          <h3 className="font-serif text-lg mb-3">CA prévisionnel par semaine</h3>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full max-w-[920px]" style={{ minWidth: '600px' }}>
              {/* Grille Y - CA barres */}
              {[0, 0.25, 0.5, 0.75, 1].map(p => {
                const v = Math.round(maxCA * p)
                return (
                  <g key={v}>
                    <line x1={padL} y1={yCA(v)} x2={chartW - padR} y2={yCA(v)} stroke="#e0dcd4" strokeWidth={0.5} />
                    <text x={padL - 6} y={yCA(v) + 3} textAnchor="end" className="text-[0.5rem]" fill="#8a7e6b">{v}€</text>
                  </g>
                )
              })}

              {/* Barres CA par semaine */}
              {weeks.map((w, i) => {
                if (w.totalCA === 0) return null
                const barW = Math.max(4, (innerW / 52) * 0.7)
                const barH = (w.totalCA / maxCA) * innerH
                return (
                  <rect
                    key={w.week}
                    x={x(i) - barW / 2}
                    y={padT + innerH - barH}
                    width={barW}
                    height={barH}
                    rx={2}
                    fill="#8a9e7a"
                    opacity={0.6}
                  />
                )
              })}

              {/* Ligne cumul */}
              <path
                d={cumulData.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yCumul(v)}`).join(' ')}
                fill="none"
                stroke="#c77d8a"
                strokeWidth={2}
                strokeDasharray="6 3"
              />

              {/* Axe X */}
              {weeks.filter(w => w.week % 4 === 1).map(w => (
                <text key={w.week} x={x(w.week - 1)} y={chartH - 8} textAnchor="middle" className="text-[0.5rem]" fill="#8a7e6b">
                  S{w.week}
                </text>
              ))}

              {/* Légende */}
              <rect x={chartW / 2 - 140} y={2} width={10} height={10} rx={2} fill="#8a9e7a" opacity={0.6} />
              <text x={chartW / 2 - 126} y={11} className="text-[0.5rem]" fill="#8a7e6b">CA hebdo</text>
              <line x1={chartW / 2 - 10} y1={7} x2={chartW / 2 + 30} y2={7} stroke="#c77d8a" strokeWidth={2} strokeDasharray="6 3" />
              <text x={chartW / 2 + 34} y={11} className="text-[0.5rem]" fill="#8a7e6b">CA cumulé</text>
            </svg>
          </div>
        </div>
      )}

      {/* Tableau détaillé par semaine */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="table-header text-left sticky left-0 bg-white z-10 min-w-[60px]">Sem.</th>
                <th className="table-header text-left min-w-[250px]">Cultures récoltées</th>
                <th className="table-header text-right min-w-[80px]">Tiges</th>
                <th className="table-header text-right min-w-[90px]">CA prévu</th>
                <th className="table-header text-right min-w-[90px]">CA cumulé</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cumul = 0
                return weeks.map(w => {
                  if (w.totalTiges === 0) return null
                  cumul += w.totalCA
                  return (
                    <tr key={w.week} className="hover:bg-cream/50">
                      <td className="table-cell !py-2 font-bold text-brun sticky left-0 bg-white z-10">
                        S{w.week}
                      </td>
                      <td className="table-cell !py-2">
                        <div className="flex flex-wrap gap-1">
                          {w.cultures.sort((a, b) => b.ca - a.ca).map(c => (
                            <span key={c.name} className="inline-flex items-center gap-1 bg-cream rounded-full px-2 py-0.5">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor[c.type] || '#888' }} />
                              <span className="font-medium">{c.name}</span>
                              <span className="text-terre/70">{c.tiges}t</span>
                              <span className="text-sage font-semibold">{Math.round(c.ca)}€</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="table-cell !py-2 text-right font-semibold text-brun">
                        {w.totalTiges.toLocaleString('fr-FR')}
                      </td>
                      <td className="table-cell !py-2 text-right font-bold text-feuille">
                        {Math.round(w.totalCA).toLocaleString('fr-FR')}€
                      </td>
                      <td className="table-cell !py-2 text-right text-terre">
                        {Math.round(cumul).toLocaleString('fr-FR')}€
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
            {activeWeeks.length > 0 && (
              <tfoot>
                <tr className="bg-cream/60">
                  <td className="px-3.5 py-3 font-bold text-[0.68rem] uppercase tracking-widest text-brun border-t-2 border-sage/20 sticky left-0 bg-cream/60 z-10">
                    Total
                  </td>
                  <td className="px-3.5 py-3 border-t-2 border-sage/20 text-[0.65rem] text-terre">
                    {allCultureNames.length} variétés sur {activeWeeks.length} semaines
                  </td>
                  <td className="px-3.5 py-3 text-right font-bold text-brun border-t-2 border-sage/20">
                    {grandTotalTiges.toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3.5 py-3 text-right font-bold text-feuille border-t-2 border-sage/20 text-sm">
                    {grandTotalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€
                  </td>
                  <td className="px-3.5 py-3 border-t-2 border-sage/20" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Tableau croisé : culture × semaine */}
      {allCultureNames.length > 0 && (
        <div className="mt-6">
          <h3 className="font-serif text-xl mb-3">Détail CA par culture et par semaine</h3>
          <div className="card !p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="table-header text-left min-w-[140px] sticky left-0 bg-white z-10">Culture</th>
                    <th className="table-header text-right min-w-[70px]">Total</th>
                    {activeWeeks.map(w => (
                      <th key={w.week} className="table-header text-center !px-1.5 min-w-[50px]">S{w.week}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCultureNames.map(name => {
                    const cultureData = cultureWeeklyCA[name]
                    const total = cultureData.reduce((s, v) => s + v, 0)
                    if (total === 0) return null
                    const cType = data.find(p => p.culture_name === name)?.culture_type || ''
                    return (
                      <tr key={name} className="hover:bg-cream/50">
                        <td className="table-cell !py-1.5 sticky left-0 bg-white z-10">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: typeColor[cType] || '#888' }} />
                            <strong>{name}</strong>
                            <span className={`badge text-[0.5rem] ${cType === 'RR' ? 'badge-rr' : cType === 'MP' ? 'badge-mp' : 'badge-ru'}`}>{cType}</span>
                          </div>
                        </td>
                        <td className="table-cell !py-1.5 text-right font-bold text-feuille">
                          {Math.round(total)}€
                        </td>
                        {activeWeeks.map(w => {
                          const v = cultureData[w.week - 1]
                          const pct = maxCA > 0 ? v / maxCA : 0
                          return (
                            <td key={w.week} className="table-cell !py-1.5 text-center !px-1">
                              {v > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span className="text-[0.55rem] font-semibold text-brun">{Math.round(v)}€</span>
                                  <div className="w-[16px] mt-0.5 rounded-sm" style={{
                                    height: `${Math.max(2, pct * 14)}px`,
                                    backgroundColor: typeColor[cType] || '#888',
                                    opacity: 0.5
                                  }} />
                                </div>
                              ) : (
                                <span className="text-terre/20">·</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-cream/60">
                    <td className="px-3.5 py-2 font-bold text-[0.6rem] uppercase tracking-widest text-brun border-t-2 border-sage/20 sticky left-0 bg-cream/60 z-10">
                      Total / semaine
                    </td>
                    <td className="px-3.5 py-2 text-right font-bold text-feuille border-t-2 border-sage/20">
                      {Math.round(grandTotalCA)}€
                    </td>
                    {activeWeeks.map(w => (
                      <td key={w.week} className="text-center px-1 py-2 border-t-2 border-sage/20 text-[0.6rem] font-bold text-feuille">
                        {Math.round(w.totalCA)}€
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeWeeks.length === 0 && (
        <div className="card text-center py-12 text-terre">
          <p>Aucune donnée de récolte prévue.</p>
          <p className="text-xs mt-2">Les ventes prévisionnelles se calculent automatiquement à partir de vos plantations.</p>
        </div>
      )}
    </div>
  )
}
