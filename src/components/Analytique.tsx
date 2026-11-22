'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, Coins, Flower, TrendingUp } from 'lucide-react'
import type { PlantingFull } from '@/lib/types'
import { Card, CardContent, CardHeader, EmptyState, PageHeader, Select, Stat, Tabs, TypeBadge, cn } from '@/components/ui'
import { WeeklyBarChart } from '@/components/charts/WeeklyBarChart'
import { WeeklyAreaChart } from '@/components/charts/WeeklyAreaChart'
import { Hypothese } from '@/components/reel/commun'
import { photos } from '@/lib/images'
import {
  anneesDesSaisons, bornesSaison, centimesEnEuros, fenetreGlissante, formatEuros, formatSemaine, lundiDeSemaine,
  moisDesSemaines, moyenneCentimes, previsionnelHebdo, semaineIso, type Intervalle, type PlantingPrevision,
} from '@/lib/domain'

// ============================================================
// Prévisionnel de CA par semaine de récolte
// ============================================================
// Calcul dans src/lib/domain/previsionnel.ts : semaines ISO datées (année
// comprise), répartition RR/MP/RU de reel.ts, centimes entiers. Lecture par
// dates sur toutes les plantations de la ferme, sur une année civile ou sur
// les 12 prochains mois.
// ============================================================

// Pastille de type (identité) : mêmes teintes que la palette graphique validée
const typeDot: Record<string, string> = { RR: 'bg-chart-1', MP: 'bg-chart-2', RU: 'bg-chart-3' }
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** Euros arrondis pour les cellules denses (affichage seulement ; le détail exact est en infobulle). */
const eurosArrondis = (c: number) => `${Math.round(c / 100).toLocaleString('fr-FR')} €`
const lib = (lundi: string) => { const { semaine } = semaineIso(lundi); return `S${semaine}` }

export default function Analytique({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')
  const [view, setView] = useState<'semaine' | 'culture'>('semaine')
  const today: string = ctx.today
  const anneeCourante = Number(today.slice(0, 4))
  const [periodeChoix, setPeriodeChoix] = useState<string>(() => String(ctx.activeSeason?.year ?? anneeCourante))
  const annees = anneesDesSaisons(ctx.seasons || [], [anneeCourante, anneeCourante + 1])

  // Toutes les plantations de la ferme : une récolte se lit à sa date, quelle que soit sa saison.
  // Celles sans date de récolte (vivace sans floraison, 013) restent dans la liste pour être
  // signalées « hors prévisionnel » ; les vivaces comptent chaque floraison de la période.
  const plantings: PlantingFull[] = ctx.farmPlantingsTout?.length ? ctx.farmPlantingsTout
    : ctx.farmPlantings?.length ? ctx.farmPlantings : (ctx.plantings || [])
  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  if (filterType) data = data.filter(p => p.culture_type === filterType)

  const periode: Intervalle = periodeChoix === '12m'
    ? { debut: lundiDeSemaine(today), fin: fenetreGlissante(today).fin }
    : bornesSaison(Number(periodeChoix))
  const prev = useMemo(() => previsionnelHebdo(data as PlantingPrevision[], periode), [data, periode.debut, periode.fin]) // eslint-disable-line react-hooks/exhaustive-deps
  const lundis = prev.semaines.map(s => s.lundi)
  const mois = moisDesSemaines(lundis)
  const lundiCourant = lundiDeSemaine(today)

  const cumuls = prev.semaines.reduce<number[]>((acc, s) => [...acc, (acc.at(-1) ?? 0) + s.centimes], [])
  const chartData = prev.semaines.map((s, i) => ({ week: i, ca: centimesEnEuros(s.centimes), cumul: centimesEnEuros(cumuls[i]) }))
  // Un repère par mois : la première semaine de chaque mois (mois du jeudi)
  const debutsDeMois = new Map<number, string>()
  mois.reduce((i, m) => { debutsDeMois.set(i, `${MOIS_COURT[m.mois - 1]}${m.mois === 1 ? ` ${m.annee}` : ''}`); return i + m.n }, 0)
  const tickLabel = (i: number) => debutsDeMois.get(i) ?? ''
  const tooltipLabel = (i: number) => (lundis[i] ? formatSemaine(lundis[i]) : '')
  const maxCA = Math.max(1, ...prev.semaines.map(s => s.centimes))
  const libellePeriode = periodeChoix === '12m' ? 'les 12 prochains mois' : `l’année ${periodeChoix}`
  const stickyCol = 'sticky left-0 z-[1] bg-surface'

  return (
    <div>
      <PageHeader title="Analytique" description="Prévisionnel de chiffre d’affaires par semaine de récolte" image={photos.champCoquelicots}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Select aria-label="Période" value={periodeChoix} onChange={e => setPeriodeChoix(e.target.value)} wrapperClassName="col-span-2 sm:w-44">
              <option value="12m">12 prochains mois</option>
              {annees.map(a => <option key={a} value={String(a)}>Année {a}</option>)}
            </Select>
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="CA prévisionnel total" value={formatEuros(prev.centimes)} icon={<Coins />} />
        <Stat label="Tiges à vendre" value={prev.tiges.toLocaleString('fr-FR')} icon={<Flower />} />
        <Stat label="Semaines de vente" value={prev.semainesDeVente} icon={<CalendarRange />} />
        <Stat label="CA moyen / semaine de vente" icon={<TrendingUp />}
          value={prev.semainesDeVente > 0 ? formatEuros(moyenneCentimes(prev.centimes, prev.semainesDeVente) ?? 0) : 'non calculable'} />
      </div>

      {prev.non_calculables.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{prev.non_calculables.length} plantation{prev.non_calculables.length > 1 ? 's' : ''} hors prévisionnel, donnée manquante : {prev.non_calculables.map(x => `${x.culture_name} (${x.raison})`).join(', ')}.</span>
        </p>
      )}

      {prev.semainesDeVente === 0 ? (
        <Card>
          <EmptyState image={photos.champCoquelicots} title={`Aucune récolte prévue sur ${libellePeriode}`}
            description="Les ventes prévisionnelles se calculent automatiquement à partir de vos plantations." />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="CA prévisionnel par semaine" description="Somme des cultures en récolte chaque semaine" />
              <CardContent>
                <WeeklyBarChart data={chartData} dataKey="ca" label="CA hebdo" format={v => `${Math.round(v).toLocaleString('fr-FR')} €`}
                  tickLabel={tickLabel} tooltipLabel={tooltipLabel} ariaLabel="Chiffre d’affaires prévisionnel par semaine" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="CA cumulé" description={`Atteint ${formatEuros(prev.centimes)} sur ${libellePeriode}`} />
              <CardContent>
                <WeeklyAreaChart data={chartData} series={[{ key: 'cumul', label: 'CA cumulé', color: 'c1' }]} format={v => `${Math.round(v).toLocaleString('fr-FR')} €`}
                  height={260} tickLabel={tickLabel} tooltipLabel={tooltipLabel} ariaLabel="Chiffre d’affaires prévisionnel cumulé par semaine" />
              </CardContent>
            </Card>
          </div>

          <Tabs label="Détail" value={view} onChange={setView} className="mb-4"
            options={[{ value: 'semaine', label: 'Par semaine' }, { value: 'culture', label: 'Par culture et par semaine' }]} />

          {view === 'semaine' && (
            <div role="tabpanel" aria-label="Prévisionnel par semaine" className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[11] w-28">Semaine</th>
                    <th className="min-w-[280px]">Cultures récoltées</th>
                    <th className="!text-right">Tiges</th>
                    <th className="!text-right">CA prévu</th>
                    <th className="!text-right">CA cumulé</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    return prev.semaines.map((s, i) => {
                      const c = cumuls[i]
                      const nouveauMois = debutsDeMois.has(i)
                      return (
                        <tr key={s.lundi} className={cn(s.lundi === lundiCourant && 'bg-accent-soft/40')}>
                          <td className={cn(stickyCol, 'num whitespace-nowrap font-semibold', nouveauMois && 'border-t-2 border-border-strong')} title={formatSemaine(s.lundi)}>
                            {lib(s.lundi)} <span className="font-normal text-fg-subtle">{s.lundi.slice(8, 10)}/{s.lundi.slice(5, 7)}/{s.lundi.slice(2, 4)}</span>
                          </td>
                          <td className="!whitespace-normal">
                            {s.cultures.length === 0 ? <span className="text-fg-subtle">·</span> : (
                              <div className="flex flex-wrap gap-1">
                                {s.cultures.map(x => (
                                  <span key={x.culture_name} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                                    <span className={cn('h-1.5 w-1.5 rounded-full', typeDot[x.culture_type] || 'bg-fg-subtle')} aria-hidden />
                                    <span className="font-medium text-fg">{x.culture_name}</span>
                                    <span className="num text-fg-subtle">{x.tiges} t.</span>
                                    <span className="num font-semibold text-fg">{formatEuros(x.centimes)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="num text-right font-medium">{s.tiges.toLocaleString('fr-FR')}</td>
                          <td className="num text-right font-semibold">{formatEuros(s.centimes)}</td>
                          <td className="num text-right text-fg-muted">{formatEuros(c)}</td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-[11] text-2xs uppercase tracking-wider">Total</td>
                    <td className="text-xs font-normal text-fg-muted">{prev.cultures.length} variétés, {prev.semainesDeVente} semaines de vente sur {prev.semaines.length}</td>
                    <td className="num text-right">{prev.tiges.toLocaleString('fr-FR')}</td>
                    <td className="num text-right">{formatEuros(prev.centimes)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {view === 'culture' && (
            <div role="tabpanel" aria-label="Prévisionnel par culture et par semaine" className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[11]" />
                    <th />
                    {mois.map(m => (
                      <th key={m.cle} colSpan={m.n} className="!px-1 text-left text-[0.62rem] uppercase tracking-wide">
                        {m.n >= 2 ? `${MOIS_COURT[m.mois - 1]}${m.mois === 1 || m === mois[0] ? ` ${m.annee}` : ''}` : ''}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-[11] min-w-[190px]">Culture</th>
                    <th className="!text-right">Total</th>
                    {lundis.map(l => <th key={l} title={formatSemaine(l)} className={cn('!px-1.5 !text-center', l === lundiCourant && 'text-accent')}>{lib(l)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {prev.cultures.map(c => (
                    <tr key={c.culture_name}>
                      <td className={stickyCol}>
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-fg">{c.culture_name}</span>
                          <TypeBadge type={c.culture_type} className="ml-auto" />
                        </div>
                      </td>
                      <td className="num text-right font-semibold">{formatEuros(c.centimes)}</td>
                      {lundis.map(l => {
                        const v = c.parLundi.get(l) ?? 0
                        return (
                          <td key={l} className="!px-1 text-center" title={v > 0 ? `${c.culture_name}, ${formatSemaine(l)} : ${formatEuros(v)}` : undefined}>
                            {v > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="num text-[0.65rem] font-medium text-fg">{eurosArrondis(v)}</span>
                                <div className={cn('mt-0.5 w-4 rounded-sm opacity-70', typeDot[c.culture_type] || 'bg-fg-subtle')}
                                  style={{ height: `${Math.max(2, (v / maxCA) * 14)}px` }} />
                              </div>
                            ) : <span className="text-fg-subtle/50">·</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 z-[11] text-2xs uppercase tracking-wider">Total / semaine</td>
                    <td className="num text-right">{formatEuros(prev.centimes)}</td>
                    {prev.semaines.map(s => <td key={s.lundi} className="num !px-1 text-center text-[0.65rem]" title={formatEuros(s.centimes)}>{s.centimes ? eurosArrondis(s.centimes) : '·'}</td>)}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
      <div className="mt-4">
        <Hypothese>
          Sur {libellePeriode}, lu par dates sur toutes les saisons de la ferme ; une semaine compte dans l’année de son jeudi. Chaque plantation apporte son revenu estimé, réparti comme ses tiges : récolte répétée étalée, moyenne sur la première moitié, unique la première semaine.
        </Hypothese>
      </div>
    </div>
  )
}
