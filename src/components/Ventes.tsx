'use client'
import { useState } from 'react'
import { formatDateFR } from '@/lib/types'
import type { Sale } from '@/lib/types'

export default function Ventes({ ctx }: { ctx: any }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [channel, setChannel] = useState('Marché')
  const [cultures, setCultures] = useState('')
  const [tiges, setTiges] = useState('')
  const [prix, setPrix] = useState('')
  const [client, setClient] = useState('')
  const [loading, setLoading] = useState(false)

  const sales: Sale[] = ctx.sales || []
  const goal = ctx.activeSeason?.revenue_goal || 15000

  const totalCA = sales.reduce((s, v) => s + (v.total || 0), 0)
  const totalTiges = sales.reduce((s, v) => s + v.tiges, 0)
  const prixMoyen = totalTiges > 0 ? totalCA / totalTiges : 0
  const pct = Math.min(100, (totalCA / goal) * 100)

  const channels = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil']
  const channelCA = channels.map(c => sales.filter(v => v.channel === c).reduce((s, v) => s + (v.total || 0), 0))
  const channelColors = ['#8a9e7a', '#a08a72', '#e8c4b0', '#a8c0a0', '#c9967a']
  const maxCA = Math.max(...channelCA, 1)

  const submit = async () => {
    if (!tiges || !prix) return
    setLoading(true)
    await ctx.createSale(date, channel, cultures, parseInt(tiges), parseFloat(prix), client)
    setLoading(false)
    setTiges('')
    setPrix('')
    setCultures('')
    setClient('')
  }

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Ventes</h2>
      <p className="text-terre text-sm mb-7">Suivi des ventes par canal</p>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 mb-5">
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">CA total réel</p>
          <p className="font-serif text-2xl">{totalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
        </div>
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Tiges vendues</p>
          <p className="font-serif text-2xl">{totalTiges.toLocaleString('fr-FR')}</p>
        </div>
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Prix moyen/tige</p>
          <p className="font-serif text-2xl">{prixMoyen.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
        </div>
        <div className="card">
          <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">Nb. ventes</p>
          <p className="font-serif text-2xl">{sales.length}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-7">
        <div className="flex justify-between text-sm text-terre mb-2">
          <span>Objectif CA : <strong>{goal.toLocaleString('fr-FR')} €</strong></span>
          <span>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-3.5 bg-cream-dark rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-sage to-sage-light transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Chart */}
      <div className="card mb-7">
        <h4 className="font-serif text-base mb-4">CA par canal</h4>
        <div className="flex items-end gap-2 h-48 px-2">
          {channels.map((c, i) => (
            <div key={c} className="flex flex-col items-center flex-1">
              <span className="text-[0.65rem] font-semibold text-brun mb-1">
                {channelCA[i] > 0 ? `${channelCA[i].toLocaleString('fr-FR')}€` : ''}
              </span>
              <div
                className="rounded-t w-full min-w-[24px] transition-all duration-500"
                style={{ height: `${(channelCA[i] / maxCA) * 160}px`, background: channelColors[i] }}
              />
              <span className="text-[0.6rem] text-terre mt-1.5 text-center">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="card mb-7 !p-6">
        <h4 className="font-serif text-base mb-4">Nouvelle vente</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Date</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Canal</label>
            <select className="input" value={channel} onChange={e => setChannel(e.target.value)}>
              {channels.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Cultures vendues</label>
            <input className="input" value={cultures} onChange={e => setCultures(e.target.value)} placeholder="Zinnia, Cosmos…" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Tiges</label>
            <input className="input" type="number" value={tiges} onChange={e => setTiges(e.target.value)} min="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Prix unitaire €</label>
            <input className="input" type="number" value={prix} onChange={e => setPrix(e.target.value)} step="0.01" min="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Client</label>
            <input className="input" value={client} onChange={e => setClient(e.target.value)} placeholder="Optionnel" />
          </div>
        </div>
        <button className="btn btn-sage mt-4" onClick={submit} disabled={loading}>{loading ? '…' : 'Enregistrer'}</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Date', 'Canal', 'Cultures', 'Tiges', 'Prix/tige', 'Total €', 'Client', ''].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sales.map((v: Sale) => (
              <tr key={v.id} className="hover:bg-cream transition">
                <td className="table-cell">{formatDateFR(v.date)}</td>
                <td className="table-cell">{v.channel}</td>
                <td className="table-cell">{v.cultures_sold || '—'}</td>
                <td className="table-cell">{v.tiges}</td>
                <td className="table-cell">{v.prix_unitaire?.toFixed(2)} €</td>
                <td className="table-cell font-semibold">{v.total?.toFixed(2)} €</td>
                <td className="table-cell text-terre">{v.client || '—'}</td>
                <td className="table-cell">
                  <button className="btn btn-danger btn-sm" onClick={() => ctx.deleteSale(v.id)}>×</button>
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr><td colSpan={8} className="table-cell text-center text-terre py-8">Aucune vente enregistrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
