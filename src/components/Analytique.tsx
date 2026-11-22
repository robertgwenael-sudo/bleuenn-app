'use client'
import { useState } from 'react'
import { CalendarRange, Coins, Flower, TrendingUp } from 'lucide-react'
import { getWeekNumber } from '@/lib/types'
import type { PlantingFull } from '@/lib/types'
import { Card, CardContent, CardHeader, EmptyState, PageHeader, Select, Stat, Tabs, TypeBadge, cn } from '@/components/ui'
import { WeeklyBarChart } from '@/components/charts/WeeklyBarChart'
import { WeeklyAreaChart } from '@/components/charts/WeeklyAreaChart'
import { photos } from '@/lib/images'

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

const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`
// Pastille de type (identité) : mêmes teintes que la palette graphique validée
const typeDot: Record<string, string> = { RR: 'bg-chart-1', MP: 'bg-chart-2', RU: 'bg-chart-3' }

export default function Analytique({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')
  const [view, setView] = useState<'semaine' | 'culture'>('semaine')
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

  // Échelle des mini-barres du tableau croisé
  const maxCA = Math.max(...weeks.map(w => w.totalCA), 1)

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
  const chartData = weeks.map((w, i) => ({ week: w.week, ca: Math.round(w.totalCA * 100) / 100, cumul: Math.round(cumulData[i]) }))

  const stickyCol = 'sticky left-0 z-[1] bg-surface'

  return (
    <div>
      <PageHeader title="Analytique" description="Prévisionnel de chiffre d’affaires par semaine de récolte" image={photos.champCoquelicots}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Select aria-label="Jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="sm:w-48">
              <option value="">Tous les jardins</option>
              {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} wrapperClassName="sm:w-36">
              <option value="">Tous les types</option>
              <option value="RR">RR</option><option value="MP">MP</option><option value="RU">RU</option>
            </Select>
          </div>
        } />

      {/* Cartes résumé */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="CA prévisionnel total" value={`${grandTotalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`} icon={<Coins />} />
        <Stat label="Tiges à vendre" value={grandTotalTiges.toLocaleString('fr-FR')} icon={<Flower />} />
        <Stat label="Semaines de vente" value={activeWeeks.length} icon={<CalendarRange />} />
        <Stat label="CA moyen / semaine" icon={<TrendingUp />}
          value={`${activeWeeks.length > 0 ? Math.round(grandTotalCA / activeWeeks.length).toLocaleString('fr-FR') : 0} €`} />
      </div>

      {activeWeeks.length === 0 ? (
        <Card>
          <EmptyState image={photos.champCoquelicots} title="Aucune donnée de récolte prévue"
            description="Les ventes prévisionnelles se calculent automatiquement à partir de vos plantations." />
        </Card>
      ) : (
        <>
          {/* Deux graphiques séparés plutôt qu'un double axe */}
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="CA prévisionnel par semaine" description="Somme des cultures en récolte chaque semaine" />
              <CardContent>
                <WeeklyBarChart data={chartData} dataKey="ca" label="CA hebdo" format={eur} ariaLabel="Chiffre d’affaires prévisionnel par semaine" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="CA cumulé" description={`Atteint ${eur(grandTotalCA)} en fin de saison`} />
              <CardContent>
                <WeeklyAreaChart data={chartData} series={[{ key: 'cumul', label: 'CA cumulé', color: 'c1' }]} format={eur} height={260}
                  ariaLabel="Chiffre d’affaires prévisionnel cumulé par semaine" />
              </CardContent>
            </Card>
          </div>

          <Tabs label="Détail" value={view} onChange={setView} className="mb-4"
            options={[{ value: 'semaine', label: 'Par semaine' }, { value: 'culture', label: 'Par culture et par semaine' }]} />

          {view === 'semaine' && (
            <div role="tabpanel" className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[11] w-16">Sem.</th>
                    <th className="min-w-[280px]">Cultures récoltées</th>
                    <th className="!text-right">Tiges</th>
                    <th className="!text-right">CA prévu</th>
                    <th className="!text-right">CA cumulé</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let cumul = 0
                    return weeks.map(w => {
                      if (w.totalTiges === 0) return null
                      cumul += w.totalCA
                      return (
                        <tr key={w.week}>
                          <td className={cn(stickyCol, 'num font-semibold')}>S{w.week}</td>
                          <td className="!whitespace-normal">
                            <div className="flex flex-wrap gap-1">
                              {w.cultures.sort((a, b) => b.ca - a.ca).map(c => (
                                <span key={c.name} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                                  <span className={cn('h-1.5 w-1.5 rounded-full', typeDot[c.type] || 'bg-fg-subtle')} aria-hidden />
                                  <span className="font-medium text-fg">{c.name}</span>
                                  <span className="num text-fg-subtle">{c.tiges} t.</span>
                                  <span className="num font-semibold text-fg">{Math.round(c.ca)} €</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="num text-right font-medium">{w.totalTiges.toLocaleString('fr-FR')}</td>
                          <td className="num text-right font-semibold">{Math.round(w.totalCA).toLocaleString('fr-FR')} €</td>
                          <td className="num text-right text-fg-muted">{Math.round(cumul).toLocaleString('fr-FR')} €</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-[11] text-2xs uppercase tracking-wider">Total</td>
                    <td className="text-xs font-normal text-fg-muted">{allCultureNames.length} variétés sur {activeWeeks.length} semaines</td>
                    <td className="num text-right">{grandTotalTiges.toLocaleString('fr-FR')}</td>
                    <td className="num text-right">{grandTotalCA.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {view === 'culture' && allCultureNames.length > 0 && (
            <div role="tabpanel" className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[11] min-w-[190px]">Culture</th>
                    <th className="!text-right">Total</th>
                    {activeWeeks.map(w => <th key={w.week} className="!px-1.5 !text-center">S{w.week}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {allCultureNames.map(name => {
                    const cultureData = cultureWeeklyCA[name]
                    const total = cultureData.reduce((s, v) => s + v, 0)
                    if (total === 0) return null
                    const cType = data.find(p => p.culture_name === name)?.culture_type || ''
                    return (
                      <tr key={name}>
                        <td className={stickyCol}>
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-fg">{name}</span>
                            <TypeBadge type={cType} className="ml-auto" />
                          </div>
                        </td>
                        <td className="num text-right font-semibold">{Math.round(total)} €</td>
                        {activeWeeks.map(w => {
                          const v = cultureData[w.week - 1]
                          const pct = maxCA > 0 ? v / maxCA : 0
                          return (
                            <td key={w.week} className="!px-1 text-center">
                              {v > 0 ? (
                                <div className="flex flex-col items-center">
                                  <span className="num text-[0.65rem] font-medium text-fg">{Math.round(v)} €</span>
                                  <div className={cn('mt-0.5 w-4 rounded-sm opacity-70', typeDot[cType] || 'bg-fg-subtle')}
                                    style={{ height: `${Math.max(2, pct * 14)}px` }} />
                                </div>
                              ) : <span className="text-fg-subtle/50">·</span>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-[11] text-2xs uppercase tracking-wider">Total / semaine</td>
                    <td className="num text-right">{Math.round(grandTotalCA)} €</td>
                    {activeWeeks.map(w => <td key={w.week} className="num !px-1 text-center text-[0.65rem]">{Math.round(w.totalCA)} €</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
