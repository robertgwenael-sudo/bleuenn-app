'use client'
import { getPlantingStatus, formatDateFR } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'

function KPI({ icon, label, value, sub, accent }: { icon: string; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="card group relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-[0.04] -mr-6 -mt-6 transition-transform group-hover:scale-110"
        style={{ background: accent }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 border"
        style={{ borderColor: accent + '33', background: accent + '11' }}>
        {icon}
      </div>
      <p className="text-[0.65rem] uppercase tracking-[0.15em] text-terre font-bold mb-1">{label}</p>
      <p className="font-serif text-3xl font-medium" style={{ color: accent }}>{value}</p>
      <p className="text-xs text-terre-light mt-1.5">{sub}</p>
    </div>
  )
}

function BarChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex items-end gap-3 h-48 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1">
          <span className="text-[0.65rem] font-bold text-brun mb-1.5">
            {d.value > 0 ? d.value.toLocaleString('fr-FR') : ''}
          </span>
          <div
            className="rounded-t-lg w-full min-w-[28px] transition-all duration-700 ease-out"
            style={{
              height: `${Math.max(4, (d.value / max) * 160)}px`,
              background: `linear-gradient(180deg, ${colors[i % colors.length]}cc, ${colors[i % colors.length]})`,
            }}
          />
          <span className="text-[0.6rem] text-terre mt-2 text-center leading-tight font-medium">{d.label}</span>
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

  const channels = ['Marche', 'Fleuriste', 'Abo.', 'Mariage', 'Deuil']
  const channelFull = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil']
  const channelCA = channelFull.map(c => sales.filter((v: any) => v.channel === c).reduce((s: number, v: any) => s + (v.total || 0), 0))
  const channelColors = ['#3d5a3a', '#8b7355', '#c77d8a', '#6b7f5e', '#c9a96e']

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-serif text-4xl mb-1 font-medium">Tableau de bord</h2>
        <p className="text-terre text-sm">{season?.name || 'Saison en cours'}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <KPI icon="&#x273F;" accent="#6b7f5e" label="Tiges potentielles" value={Math.round(totalTiges).toLocaleString('fr-FR')} sub="saison complete" />
        <KPI icon="&#x2740;" accent="#c77d8a" label="CA potentiel" value={`${totalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`} sub="sur toutes les cultures" />
        <KPI icon="&#x25CB;" accent="#c9a96e" label="Surface totale" value={`${totalM2} m²`} sub={`${(ctx.gardens || []).length} jardins`} />
        <KPI icon="&#x2698;" accent="#3d5a3a" label="Cultures actives" value={String(actives)} sub={`${enRecolte} en recolte`} />
      </div>

      {/* Barre objectif */}
      <div className="card mb-8 !p-6">
        <div className="flex justify-between text-sm text-terre mb-3">
          <span className="font-serif text-base">Objectif : <strong className="text-brun">{goal.toLocaleString('fr-FR')} €</strong></span>
          <span className="font-bold text-pivoine">{pct.toFixed(1)}% — {ventesTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
        </div>
        <div className="h-4 bg-lin-dark rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #3d5a3a, #6b7f5e, #c77d8a)',
            }} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <div className="card">
          <h4 className="font-serif text-lg mb-5 font-medium">CA reel par canal</h4>
          <BarChart data={channels.map((c, i) => ({ label: c, value: channelCA[i] }))} colors={channelColors} />
        </div>
        <div className="card">
          <h4 className="font-serif text-lg mb-5 font-medium">Cultures par type</h4>
          <BarChart
            data={[
              { label: 'RR — Repetitive', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RR').length },
              { label: 'MP — Moyen', value: plantings.filter((p: PlantingFull) => p.culture_type === 'MP').length },
              { label: 'RU — Unique', value: plantings.filter((p: PlantingFull) => p.culture_type === 'RU').length },
            ]}
            colors={['#3d5a3a', '#c9a96e', '#9b8ec4']}
          />
        </div>
      </div>

      {/* Alertes */}
      <div className="floral-divider mb-4">
        <span>alertes de la semaine</span>
      </div>
      <div className="space-y-2 mb-8">
        {plantSoon.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-or">
            <span className="w-2.5 h-2.5 rounded-full bg-or shrink-0" />
            <span className="text-sm"><strong className="text-brun">{p.culture_name}</strong> — Plantation prevue le {formatDateFR(p.date_plantation)} <span className="text-terre">({p.garden_name}, {p.planche_name})</span></span>
          </div>
        ))}
        {inRecolte.slice(0, 5).map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-sage">
            <span className="w-2.5 h-2.5 rounded-full bg-sage shrink-0" />
            <span className="text-sm"><strong className="text-brun">{p.culture_name}</strong> — En recolte <span className="text-terre">({p.garden_name}, {p.planche_name})</span></span>
          </div>
        ))}
        {plantSoon.length === 0 && inRecolte.length === 0 && (
          <div className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-sage">
            <span className="w-2.5 h-2.5 rounded-full bg-sage shrink-0" />
            <span className="text-sm text-terre">Aucune alerte cette semaine</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="floral-divider mb-4">
        <span>prochaines actions</span>
      </div>
      <div className="space-y-2">
        {toSow.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-pivoine">
            <span className="w-2.5 h-2.5 rounded-full bg-pivoine shrink-0" />
            <span className="text-sm">Semer <strong className="text-brun">{p.culture_name}</strong> — entree cellule {formatDateFR(p.date_semis)} <span className="text-terre">({p.garden_name})</span></span>
          </div>
        ))}
        {toPlant.map((p: PlantingFull) => (
          <div key={p.id} className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-or">
            <span className="w-2.5 h-2.5 rounded-full bg-or shrink-0" />
            <span className="text-sm">Planter <strong className="text-brun">{p.culture_name}</strong> — prevu {formatDateFR(p.date_plantation)} <span className="text-terre">({p.garden_name})</span></span>
          </div>
        ))}
        {toSow.length === 0 && toPlant.length === 0 && (
          <div className="card flex items-center gap-3 !p-3.5 !border-l-[3px] !border-l-sage">
            <span className="w-2.5 h-2.5 rounded-full bg-sage shrink-0" />
            <span className="text-sm text-terre">Toutes les actions sont a jour</span>
          </div>
        )}
      </div>
    </div>
  )
}
