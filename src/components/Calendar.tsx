'use client'
import { useState, Fragment } from 'react'
import { getWeekNumber, getOverlappingM2 } from '@/lib/types'
import type { PlantingFull, Garden } from '@/lib/types'
import Modal from '@/components/Modal'

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

// Lignes sous-total (plants en cellule + tiges à récolter)
function SubtotalRows({ label, plantings, weeks, isGlobal }: {
  label: string; plantings: PlantingFull[]; weeks: number[]; isGlobal?: boolean
}) {
  const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(plantings)
  const maxCellule = Math.max(...plantsEnCellule)
  const maxTiges = Math.max(...tigesARecolter)
  const totalPlants = plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
  const totalTiges = plantings.reduce((s, p) => s + (p.tiges_estimees || 0), 0)

  const borderCls = isGlobal ? 'border-t-2 border-brun/30' : 'border-t border-sage/20'
  const bgCls = isGlobal ? 'bg-brun-dark/5' : 'bg-cream/40'
  const labelSize = isGlobal ? 'text-[0.6rem]' : 'text-[0.55rem]'
  const prefix = isGlobal ? '📊 TOTAL' : `↳ ${label}`

  return (
    <>
      {/* Ligne résumé avec totaux Plants / Tiges */}
      <tr className={bgCls}>
        <td className={`px-3 py-1.5 ${labelSize} font-bold text-brun ${borderCls} whitespace-nowrap`}>
          {prefix}
        </td>
        <td className={`text-center ${labelSize} font-bold text-brun ${borderCls}`}>{totalPlants}</td>
        <td className={`text-center ${labelSize} font-bold text-sage ${borderCls}`}>{totalTiges}</td>
        <td colSpan={52} className={`${borderCls}`} />
      </tr>
      {/* Plants en cellule par semaine */}
      <tr className={bgCls}>
        <td className={`px-3 py-1 ${labelSize} text-brun whitespace-nowrap`}>
          <span className="inline-block w-2.5 h-2 rounded mr-1 align-middle" style={{ backgroundColor: '#f5d98e' }} />
          Plants en cellule
        </td>
        <td />
        <td />
        {weeks.map((w, i) => {
          const v = plantsEnCellule[i]
          const pct = maxCellule > 0 ? v / maxCellule : 0
          return (
            <td key={w} className="!p-0.5 text-center">
              {v > 0 ? (
                <div className="flex flex-col items-center">
                  <span className="text-[0.45rem] font-bold text-brun leading-none">{v}</span>
                  <div className="w-[14px] mt-0.5 rounded-sm" style={{ height: `${Math.max(2, pct * 14)}px`, backgroundColor: '#f5d98e' }} />
                </div>
              ) : (
                <div className="h-[16px]" />
              )}
            </td>
          )
        })}
      </tr>
      {/* Tiges à récolter par semaine */}
      <tr className={bgCls}>
        <td className={`px-3 py-1 ${labelSize} text-feuille whitespace-nowrap`}>
          <span className="mr-1">✂️</span>
          Tiges à récolter
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
                  <span className="text-[0.45rem] font-bold text-feuille leading-none">{v}</span>
                  <div className="w-[14px] mt-0.5 rounded-sm" style={{ height: `${Math.max(2, pct * 14)}px`, backgroundColor: '#609c54' }} />
                </div>
              ) : (
                <div className="h-[16px]" />
              )}
            </td>
          )
        })}
      </tr>
    </>
  )
}

// ─── Formulaire édition plantation ──────────────────
function EditPlantingForm({ planting, ctx, onClose }: { planting: PlantingFull; ctx: any; onClose: () => void }) {
  const [dateSemis, setDateSemis] = useState(planting.date_semis)
  const [surfaceM2, setSurfaceM2] = useState(planting.surface_m2)
  const [notes, setNotes] = useState(planting.notes || '')
  const [loading, setLoading] = useState(false)

  const allPlantings: PlantingFull[] = ctx.plantings || []
  const samePlanchePlantings = allPlantings.filter((p: PlantingFull) => p.planche_id === planting.planche_id)

  let plancheM2 = 0
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === planting.planche_id) { plancheM2 = pl.surface_m2; break }
    }
  }

  const jc = planting.jours_cellule || 0
  const jch = planting.jours_champ || 0
  const jr = planting.jours_recolte || 21
  let previewPlantation = '', previewRecolte = '', previewFin = '', previewFinDate = ''
  if (dateSemis) {
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + jc)
    const dr = new Date(dp); dr.setDate(dr.getDate() + jch)
    const df = new Date(dr); df.setDate(df.getDate() + jr)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFinDate = df.toISOString().slice(0, 10)
  }

  // Calcul temporel : seules les cultures dont la période chevauche comptent
  const usedM2 = dateSemis ? getOverlappingM2(samePlanchePlantings, dateSemis, previewFinDate || planting.date_fin, planting.id) : 0
  const availableM2 = Math.max(0, plancheM2 - usedM2)
  const isOverCapacity = surfaceM2 > availableM2

  const submit = async () => {
    if (!dateSemis || isOverCapacity || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.updatePlanting(planting.id, { date_semis: dateSemis, surface_m2: surfaceM2, notes: notes || null })
    setLoading(false)
    onClose()
  }

  const handleDelete = async () => {
    if (confirm(`Supprimer ${planting.culture_name} de cette planche ?`)) {
      await ctx.deletePlanting(planting.id)
      onClose()
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Modifier — {planting.culture_name}</h3>

      <div className="bg-sage-pale rounded-lg p-3 text-xs space-y-1">
        <p><strong>Type :</strong> {planting.culture_type === 'RR' ? 'Récolte Répétitive' : planting.culture_type === 'MP' ? 'Moyen Producteur' : 'Récolte Unique'}</p>
        <p><strong>Planche :</strong> {planting.planche_name} — <strong>Jardin :</strong> {planting.garden_name}</p>
        <p><strong>J. cellule :</strong> {jc} — <strong>J. champ :</strong> {jch} — <strong>J. récolte :</strong> {jr}</p>
        <p><strong>Plants :</strong> {planting.plants_count} — <strong>Tiges nettes :</strong> {planting.tiges_estimees}</p>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Surface allouée (m²)</label>
        <input
          className={`input ${isOverCapacity ? '!border-red-400 !bg-red-50' : ''}`}
          type="number" min={0.5} max={plancheM2} step={0.5}
          value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)}
        />
        {isOverCapacity && <p className="text-[0.7rem] text-red-600 mt-1 font-semibold">Max {availableM2} m² disponibles.</p>}
        {!isOverCapacity && surfaceM2 > 0 && <p className="text-[0.7rem] text-terre mt-1">Il restera {(availableM2 - surfaceM2).toFixed(1)} m² disponibles.</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Date de semis</label>
        <input className="input" type="date" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
      </div>

      {previewPlantation && (
        <div className="bg-cream-dark rounded-lg p-3 text-xs space-y-1">
          <p className="font-semibold text-brun">Dates recalculées :</p>
          <p>Plantation : <strong>{previewPlantation}</strong></p>
          <p>Début récolte : <strong>{previewRecolte}</strong></p>
          <p>Fin récolte : <strong>{previewFin}</strong></p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1">Notes</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles…" />
      </div>

      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit} disabled={loading || !dateSemis || isOverCapacity || surfaceM2 <= 0}>
          {loading ? '…' : 'Enregistrer'}
        </button>
      </div>
      <button className="btn btn-danger w-full text-xs" onClick={handleDelete}>
        Supprimer cette culture de la planche
      </button>
    </div>
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

      {/* Modal édition */}
      <Modal open={!!selectedPlanting} onClose={() => setSelectedPlanting(null)}>
        {selectedPlanting && <EditPlantingForm planting={selectedPlanting} ctx={ctx} onClose={() => setSelectedPlanting(null)} />}
      </Modal>

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
                      <tr key={p.id} className="hover:bg-sage-pale/30 cursor-pointer transition-colors" onClick={() => setSelectedPlanting(p)}>
                        <td className="table-cell !py-1.5 pl-4">
                          <span className="text-xs font-semibold text-feuille underline decoration-dotted underline-offset-2">{p.culture_name}</span>
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
                  {/* Sous-totaux par jardin */}
                  <SubtotalRows label={group.gardenName} plantings={group.plantings} weeks={weeks} />
                </Fragment>
              ))
            )}
          </tbody>

          {/* Total global */}
          {gardenGroups.length > 1 && (
            <tfoot>
              <SubtotalRows label="TOTAL" plantings={unique} weeks={weeks} isGlobal />
            </tfoot>
          )}
        </table>
      </div>
      {/* ─── Récap par jardin ─────────────────── */}
      {gardenGroups.length > 0 && (
        <div className="mt-8">
          <h3 className="font-serif text-xl mb-4">Récapitulatif par jardin</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {gardenGroups.map(group => {
              const totalPlants = group.plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
              const totalTiges = group.plantings.reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const totalRevenu = group.plantings.reduce((s, p) => s + (p.revenu_estime || 0), 0)
              return (
                <div key={group.gardenId} className="card !p-4">
                  <h4 className="font-serif text-base mb-2">{group.gardenName}</h4>
                  <div className="text-xs text-terre mb-1">{group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''}</div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-brun">{totalPlants}</div>
                      <div className="text-[0.6rem] text-terre">Plants</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-feuille">{totalTiges}</div>
                      <div className="text-[0.6rem] text-terre">Tiges nettes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-sage">{Math.round(totalRevenu)}€</div>
                      <div className="text-[0.6rem] text-terre">Revenu est.</div>
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Carte total global */}
            {gardenGroups.length > 1 && (() => {
              const gTotalPlants = unique.reduce((s, p) => s + (p.plants_count || 0), 0)
              const gTotalTiges = unique.reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const gTotalRevenu = unique.reduce((s, p) => s + (p.revenu_estime || 0), 0)
              return (
                <div className="card !p-4 border-t-4 border-brun">
                  <h4 className="font-serif text-base mb-2">📊 Total global</h4>
                  <div className="text-xs text-terre mb-1">{unique.length} cultures — {gardenGroups.length} jardins</div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="text-center">
                      <div className="text-xl font-bold text-brun">{gTotalPlants}</div>
                      <div className="text-[0.6rem] text-terre">Plants</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-feuille">{gTotalTiges}</div>
                      <div className="text-[0.6rem] text-terre">Tiges nettes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-sage">{Math.round(gTotalRevenu)}€</div>
                      <div className="text-[0.6rem] text-terre">Revenu est.</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ─── Graphe Plants / Tiges par semaine ──── */}
      {unique.length > 0 && (() => {
        const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(unique)
        const maxVal = Math.max(...plantsEnCellule, ...tigesARecolter, 1)

        const chartW = 900
        const chartH = 300
        const padL = 55
        const padR = 15
        const padT = 20
        const padB = 35
        const innerW = chartW - padL - padR
        const innerH = chartH - padT - padB

        const x = (i: number) => padL + (i / 51) * innerW
        const y = (v: number) => padT + innerH - (v / maxVal) * innerH

        // Area path pour plants en cellule
        const plantsPath = `M${x(0)},${y(0)} ` +
          plantsEnCellule.map((v, i) => `L${x(i)},${y(v)}`).join(' ') +
          ` L${x(51)},${y(0)} Z`
        const plantsLine = plantsEnCellule.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')

        // Area path pour tiges
        const tigesPath = `M${x(0)},${y(0)} ` +
          tigesARecolter.map((v, i) => `L${x(i)},${y(v)}`).join(' ') +
          ` L${x(51)},${y(0)} Z`
        const tigesLine = tigesARecolter.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')

        // Grille Y
        const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round(maxVal * p))

        return (
          <div className="mt-4">
            <h3 className="font-serif text-xl mb-4">Plants en cellule vs Tiges à récolter</h3>
            <div className="card !p-4 overflow-x-auto">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full max-w-[900px]" style={{ minWidth: '600px' }}>
                {/* Grille */}
                {yTicks.map(v => (
                  <g key={v}>
                    <line x1={padL} y1={y(v)} x2={chartW - padR} y2={y(v)} stroke="#e0dcd4" strokeWidth={0.5} />
                    <text x={padL - 6} y={y(v) + 3} textAnchor="end" className="text-[0.55rem]" fill="#8a7e6b">{v}</text>
                  </g>
                ))}

                {/* Axe X - semaines */}
                {weeks.filter(w => w % 4 === 1).map(w => (
                  <text key={w} x={x(w - 1)} y={chartH - 8} textAnchor="middle" className="text-[0.5rem]" fill="#8a7e6b">{w}</text>
                ))}

                {/* Area plants (rouge/rose) */}
                <path d={plantsPath} fill="rgba(220, 120, 120, 0.25)" />
                <path d={plantsLine} fill="none" stroke="#dc7878" strokeWidth={1.5} />

                {/* Area tiges (bleu) */}
                <path d={tigesPath} fill="rgba(100, 150, 220, 0.25)" />
                <path d={tigesLine} fill="none" stroke="#6496dc" strokeWidth={1.5} />

                {/* Légende */}
                <rect x={chartW / 2 - 120} y={2} width={10} height={10} rx={2} fill="rgba(220, 120, 120, 0.6)" />
                <text x={chartW / 2 - 106} y={11} className="text-[0.55rem]" fill="#8a7e6b">Plants en cellule</text>
                <rect x={chartW / 2 + 10} y={2} width={10} height={10} rx={2} fill="rgba(100, 150, 220, 0.6)" />
                <text x={chartW / 2 + 24} y={11} className="text-[0.55rem]" fill="#8a7e6b">Tiges à récolter</text>
              </svg>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
