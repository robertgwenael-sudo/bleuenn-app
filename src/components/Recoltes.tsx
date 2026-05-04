'use client'
import { useState } from 'react'
import { formatDateFR, getWeekNumber } from '@/lib/types'
import type { PlantingFull, Harvest } from '@/lib/types'

export default function Recoltes({ ctx }: { ctx: any }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [plantingId, setPlantingId] = useState('')
  const [tiges, setTiges] = useState('')
  const [quality, setQuality] = useState('A')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const plantings: PlantingFull[] = ctx.plantings || []
  const harvests: Harvest[] = ctx.harvests || []

  const now = new Date()
  const thisWeek = getWeekNumber(now)
  const thisMonth = now.getMonth()

  const totalSaison = harvests.reduce((s, h) => s + h.tiges, 0)
  const totalWeek = harvests.filter(h => getWeekNumber(new Date(h.date + 'T00:00:00')) === thisWeek).reduce((s, h) => s + h.tiges, 0)
  const totalMonth = harvests.filter(h => new Date(h.date + 'T00:00:00').getMonth() === thisMonth).reduce((s, h) => s + h.tiges, 0)

  // Mapping planting id -> name
  const plantingMap = Object.fromEntries(plantings.map(p => [p.id, p]))

  const submit = async () => {
    if (!plantingId || !tiges) return
    setLoading(true)
    await ctx.createHarvest(plantingId, date, parseInt(tiges), quality, notes)
    setLoading(false)
    setTiges('')
    setNotes('')
  }

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Récoltes</h2>
      <p className="text-terre text-sm mb-7">Enregistrement et suivi</p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-7">
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Cette semaine</p>
          <p className="font-serif text-2xl">{totalWeek.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-sage">tiges</p>
        </div>
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Ce mois</p>
          <p className="font-serif text-2xl">{totalMonth.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-sage">tiges</p>
        </div>
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Total saison</p>
          <p className="font-serif text-2xl">{totalSaison.toLocaleString('fr-FR')}</p>
          <p className="text-xs text-sage">tiges récoltées</p>
        </div>
      </div>

      {/* Form */}
      <div className="card mb-7 !p-6">
        <h4 className="font-serif text-base mb-4">Nouvelle récolte</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Culture / Planche</label>
            <select className="input" value={plantingId} onChange={e => setPlantingId(e.target.value)}>
              <option value="">— Choisir —</option>
              {plantings.map(p => (
                <option key={p.id} value={p.id}>{p.culture_name} — {p.garden_name} {p.planche_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Tiges récoltées</label>
            <input className="input" type="number" value={tiges} onChange={e => setTiges(e.target.value)} min="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Qualité</label>
            <select className="input" value={quality} onChange={e => setQuality(e.target.value)}>
              <option>A</option><option>B</option><option>C</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Notes</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel" />
          </div>
          <div className="flex items-end">
            <button className="btn btn-sage w-full" onClick={submit} disabled={loading}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Date', 'Culture', 'Jardin / Planche', 'Tiges', 'Qualité', 'Notes', ''].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {harvests.map(h => {
              const pl = plantingMap[h.planting_id]
              return (
                <tr key={h.id} className="hover:bg-cream transition">
                  <td className="table-cell">{formatDateFR(h.date)}</td>
                  <td className="table-cell font-semibold">{pl?.culture_name || '—'}</td>
                  <td className="table-cell">{pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}</td>
                  <td className="table-cell font-semibold">{h.tiges}</td>
                  <td className="table-cell">
                    <span className={`badge ${h.quality === 'A' ? 'badge-rr' : h.quality === 'B' ? 'badge-mp' : 'badge-ru'}`}>{h.quality}</span>
                  </td>
                  <td className="table-cell text-terre">{h.notes || '—'}</td>
                  <td className="table-cell">
                    <button className="btn btn-danger btn-sm" onClick={() => ctx.deleteHarvest(h.id)}>×</button>
                  </td>
                </tr>
              )
            })}
            {harvests.length === 0 && (
              <tr><td colSpan={7} className="table-cell text-center text-terre py-8">Aucune récolte enregistrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
