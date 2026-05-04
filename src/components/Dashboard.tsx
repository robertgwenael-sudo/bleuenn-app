'use client'
import { getPlantingStatus, formatDateFR } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

function KPI({ icon, bg, label, value, sub }: { icon: string; bg: string; label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-2 ${bg}`}>{icon}</div>
      <p className="text-[0.7rem] uppercase tracking-widest text-terre font-semibold mb-1">{label}</p>
      <p className="font-serif text-2xl">{value}</p>
      <p className="text-xs text-sage mt-1">{sub}</p>
    </div>
  )
}

function BarChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-2 h-48 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1">
          <span className="text-[0.65rem] font-semibold text-brun mb-1">
            {d.value > 0 ? d.value.toLocaleString('fr-FR') : ''}
          </span>
          <div
            className="rounded-t w-full min-w-[24px] transition-all duration-500"
            style={{ height: `${(d.value / max) * 160}px`, background: colors[i % colors.length] }}
          />
          <span className="text-[0.6rem] text-terre mt-1.5 text-center leading-tight">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard({ ctx }: { ctx: any }) {
  const plantings: PlantingFull[] = ctx.plantings
  const sales = ctx.sales || []
  const season = ctx.activeSeason

  const totalTiges = plantings.reduce((s: number, p: PlantingFull) => s + (p.tiges_estimees || 0), 0)
  const totalCA = plantings.reduce((s: number, p: PlantingFull) => s + (p.revenu_estime || 0), 0)
  const totalM2 = (ctx.gardens || []).reduce((s: number, g: any) => s + (g.surface_m2 || 0), 0)
  const enRecolte = plantings.filter((p: PlantingFull) => getPlantingStatus(p) === 'En récolte').length
  const actives = plantings.filter((p: PlantingFull) => getPlantingStatus(p) !== 'Terminé').length

  const ventesTotal = sales.reduce((s: number, v: any) => s + (v.total || 0), 0)
  const goal = season?.revenue_goal || 15000
  const pct = Math.min(100, (ventesTotal / goal) * 100)

  // Alertes
  const now = new Date()
  const plantSoon = plantings.filter((p: PlantingFull) => {
    const dp = new Date(p.date_plantation + 'T00:00:00')
    const diff = (dp.getTime() - now.getTime()) / 86400000
    return diff > 0 && diff <= 7
  })
  const inRecolte = plantings.filter((p: PlantingFull) => getPlantingStatus(p) === 'En récolte')
  const toSow = plantings.filter((p: PlantingFull) => getPlantingStatus(p) === 'À semer').slice(0, 5)
  const toPlant = plantings.filter((p: PlantingFull) => getPlantingStatus(p) === 'En germination').slice(0, 5)

  const channels = ['Marché', 'Fleuriste', 'Abo.', 'Mariage', 'Deuil']
  const channelFull = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil']
  const channelCA = channelFull.map(c => sales.filter((v: any) => v.channel === c).reduce((s: number, v: any) => s + (v.total || 0), 0))
  const channelColors = ['#7a8c6e', '#8b6f5c', '#e8c4b0', '#a3b296', '#c9967a']

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Tableau de bord</h2>
      <p className="text-terre text-sm mb-7">{season?.name || 'Saison en cours'}</p>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-7">
        <KPI icon="🌿" bg="bg-sage-pale text-sage" label="Tiges potentielles" value={Math.round(totalTiges).toLocaleString('fr-FR')} sub="saison complète" />
        <KPI icon="💰" bg="bg-blush-light text-blush-dark" label="CA potentiel" value={`${totalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`} sub="sur toutes les cultures" />
        <KPI icon="📐" bg="bg-orange-50 text-terre" label="Surface totale" value={`${totalM2} m²`} sub={`${(ctx.gardens || []).length} jardins`} />
        <KPI icon="🌸" bg="bg-cream-dark text-brun" label="Cultures actives" value={String(actives)} sub={`${enRecolte} en récolte`} />
      </div>

      {/* Progress bar */}
      <div className="mb-7">
        <div className="flex justify-between text-sm text-terre mb-2">
          <span>Objectif CA : <strong>{goal.toLocaleString('fr-FR')} €</strong></span>
          <span>{pct.toFixed(1)}% — {ventesTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
        </div>
        <div className="h-3.5 bg-cream-dark rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-sage to-sage-light transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-7">
        <div className="card">
          <h4 className="font-serif text-base mb-4">CA réel par canal</h4>
          <BarChart
            data={channels.map((c, i) => ({ label: c, value: channelCA[i] }))}
            colors={channelColors}
          />
        </div>
        <div className="card">
          <h4 className="font-serif text-base mb-4">Cultures par type</h4>
          <BarChart
            data={[
              { label: 'RR — Répétitive', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RR').length },
              { label: 'MP — Moyen', value: plantings.filter((p: PlantingFull) => p.culture_type === 'MP').length },
              { label: 'RU — Unique', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RU').length },
            ]}
            colors={['#27ae60', '#e67e22', '#2980b9']}
          />
        </div>
      </div>

      {/* Alertes */}
      <h3 className="font-serif text-lg mb-3">Alertes de la semaine</h3>
      <div className="space-y-2 mb-7">
        {plantSoon.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
            <span className="text-sm"><strong>{p.culture_name}</strong> — Plantation prévue le {formatDateFR(p.date_plantation)} ({p.garden_name}, {p.planche_name})</span>
          </div>
        ))}
        {inRecolte.slice(0, 5).map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm"><strong>{p.culture_name}</strong> — En récolte ({p.garden_name}, {p.planche_name})</span>
          </div>
        ))}
        {plantSoon.length === 0 && inRecolte.length === 0 && (
          <div className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm">Aucune alerte cette semaine</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <h3 className="font-serif text-lg mb-3">Prochaines actions</h3>
      <div className="space-y-2">
        {toSow.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm">Semer <strong>{p.culture_name}</strong> — entrée cellule {formatDateFR(p.date_semis)} ({p.garden_name})</span>
          </div>
        ))}
        {toPlant.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
            <span className="text-sm">Planter <strong>{p.culture_name}</strong> — prévu {formatDateFR(p.date_plantation)} ({p.garden_name})</span>
          </div>
        ))}
        {toSow.length === 0 && toPlant.length === 0 && (
          <div className="card flex items-center gap-3 !p-3">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm">Toutes les actions sont à jour</span>
          </div>
        )}
      </div>
    </div>
  )
}
