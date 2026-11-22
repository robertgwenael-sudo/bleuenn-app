'use client'
import { useState, Fragment } from 'react'
import { CalendarRange, Scissors } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PlantingFull, Season } from '@/lib/types'
import {
  ajouterJours, avecDatesDeRecolte, bornesSaison, chevauche, cycleDe, dureeJours, fenetreMensuelle, fenetresRecolte, finOccupation,
  formatJourMois, formatMois, intersection, lundiDeSemaine, lundisEntre, maxDate, minDate, periodeOccupation, recoltesDansPeriode,
  sansDatesDeRecolte, semaineIso, tigesPrevuesParSemaine, type Intervalle,
} from '@/lib/domain'
import { Badge, Card, CardContent, CardHeader, Dialog, EmptyState, PageHeader, Select, cn } from '@/components/ui'
import { EditPlantingForm } from '@/components/plantings/PlantingForms'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { ChartTooltip, Legend } from '@/components/charts/ChartTooltip'
import { photos } from '@/lib/images'

// ============================================================
// Calendrier de culture sur une période glissante
// ============================================================
// Les semaines sont des semaines ISO DATÉES (lundi) : la grille franchit le
// changement d'année (S47 2026 … S10 2027). Par défaut : le mois en cours et
// les 11 suivants, toutes saisons confondues ; ou une saison seule, en filtre
// de bilan.
// ============================================================

type Semaine = { lundi: string; num: number; annee: number; mois: number }
type Phase = 'cellule' | 'champ' | 'recolte' | null

const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function semainesDe(fenetre: Intervalle): Semaine[] {
  return lundisEntre(fenetre).map(lundi => {
    const { annee, semaine } = semaineIso(lundi)
    // le mois affiché est celui du jeudi (celui qui porte la semaine ISO)
    const jeudi = ajouterJours(lundi, 3)
    return { lundi, num: semaine, annee, mois: Number(jeudi.slice(5, 7)) }
  })
}

type Phases = { cellule: Intervalle | null; champ: Intervalle | null; recoltes: Intervalle[] }

/**
 * Phases d'une plantation, intervalles fermés, sur la fenêtre affichée ;
 * null si dates manquantes. Vivace (013) : au champ de la plantation à
 * l'arrachage (ou sans fin), en récolte à CHAQUE floraison de la fenêtre ;
 * sans début de floraison, au champ seulement (elle occupe sa planche).
 */
function phases(p: PlantingFull, fenetre: Intervalle): Phases | null {
  if (!p.date_semis || !p.date_plantation) return null
  const cellule = p.jours_cellule > 0 && p.date_plantation > p.date_semis
    ? { debut: p.date_semis, fin: ajouterJours(p.date_plantation, -1) } : null
  if (cycleDe(p) !== 'annuelle') {
    let fin: string
    try { fin = finOccupation(p) } catch { return null }
    const champ = fin >= p.date_plantation ? { debut: p.date_plantation, fin } : null
    return { cellule, champ, recoltes: p.date_recolte && p.date_fin ? fenetresRecolte(p, fenetre) : [] }
  }
  if (!p.date_recolte || !p.date_fin) return null
  const champ = p.date_recolte > p.date_plantation
    ? { debut: p.date_plantation, fin: ajouterJours(p.date_recolte, -1) } : null
  const recolte = p.date_fin >= p.date_recolte ? { debut: p.date_recolte, fin: p.date_fin } : null
  return { cellule, champ, recoltes: recolte ? [recolte] : [] }
}

/** Phase dominante de la semaine (celle qui y passe le plus de jours ; la récolte d'une vivace l'emporte sur « au champ »). */
function phaseSemaine(ph: Phases | null, lundi: string): Phase {
  if (!ph) return null
  const sem = { debut: lundi, fin: ajouterJours(lundi, 6) }
  const jours = (x: Intervalle | null) => { const i = x && intersection(x, sem); return i ? dureeJours(i) : 0 }
  const recolte = ph.recoltes.reduce((t, r) => t + jours(r), 0)
  const cellule = jours(ph.cellule)
  const champ = Math.max(0, jours(ph.champ) - recolte)
  let best: Phase = null, bestJours = 0
  for (const [k, j] of [['cellule', cellule], ['champ', champ], ['recolte', recolte]] as const) {
    if (j > bestJours) { best = k; bestJours = j }
  }
  return best
}

const touche = (i: Intervalle | null, lundi: string) => !!i && chevauche(i, { debut: lundi, fin: ajouterJours(lundi, 6) })

function calcWeeklyTotals(plantings: PlantingFull[], semaines: Semaine[]) {
  const plantsEnCellule = new Array(semaines.length).fill(0)
  const fenetre = semaines.length ? { debut: semaines[0].lundi, fin: ajouterJours(semaines[semaines.length - 1].lundi, 6) } : { debut: '2000-01-01', fin: '2000-01-01' }
  for (const p of plantings) {
    const ph = phases(p, fenetre)
    if (!ph) continue
    const plants = p.plants_count || 0
    semaines.forEach((s, i) => { if (touche(ph.cellule, s.lundi)) plantsEnCellule[i] += plants })
  }
  // Tiges : répartition commune de reel.ts (semaines = arrondi supérieur des
  // jours de récolte / 7, règle RR/MP/RU, entiers sans perte). La somme sur
  // toutes les semaines vaut exactement les tiges nettes ; une semaine hors
  // de la fenêtre affichée n'est simplement pas montrée.
  // Plantations sans date de récolte (vivace sans floraison) : hors prévision, signalées par l'écran
  const tigesARecolter = tigesPrevuesParSemaine(avecDatesDeRecolte(plantings), semaines.map(s => s.lundi))
  return { plantsEnCellule, tigesARecolter }
}

const stickyCol = 'sticky left-0 z-[1] bg-surface'
const libSemaine = (s: Semaine) => `S${s.num} ${s.annee}`

function SubtotalRows({ label, plantings, semaines, isGlobal }: {
  label: string; plantings: PlantingFull[]; semaines: Semaine[]; isGlobal?: boolean
}) {
  const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(plantings, semaines)
  const maxCellule = Math.max(0, ...plantsEnCellule)
  const maxTiges = Math.max(0, ...tigesARecolter)
  const totalPlants = plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
  const totalTiges = tigesARecolter.reduce((s, t) => s + t, 0)

  const bg = isGlobal ? 'bg-surface-3' : 'bg-surface-2'
  const border = isGlobal ? 'border-t-2 border-border-strong' : 'border-t border-border'

  // Fonction de rendu (et non composant) : un composant défini pendant le rendu
  // serait remonté à chaque rendu (react-hooks/static-components).
  const bars = (values: number[], max: number, colorClass: string) => (
    <>
      {semaines.map((s, i) => {
        const v = values[i]
        const pct = max > 0 ? v / max : 0
        return (
          <td key={s.lundi} className={cn('px-0 py-1 text-center align-bottom', bg)}>
            {v > 0 ? (
              <div className="flex flex-col items-center" title={`${libSemaine(s)} : ${v}`}>
                <span className="num text-[0.6rem] font-semibold leading-none text-fg">{v}</span>
                <div className={cn('mt-0.5 w-3.5 rounded-sm', colorClass)} style={{ height: `${Math.max(2, pct * 14)}px` }} />
              </div>
            ) : <div className="h-[18px]" />}
          </td>
        )
      })}
    </>
  )

  return (
    <>
      <tr>
        <td className={cn(stickyCol, bg, border, 'px-3 py-2 text-xs font-semibold text-fg')}>
          {isGlobal ? 'Total général' : <span className="text-fg-muted">Sous-total · {label}</span>}
        </td>
        <td className={cn(bg, border, 'num text-center text-xs font-semibold text-fg')}>{totalPlants}</td>
        <td className={cn(bg, border, 'num text-center text-xs font-semibold text-primary')}>{totalTiges}</td>
        <td colSpan={semaines.length} className={cn(bg, border)} />
      </tr>
      <tr>
        <td className={cn(stickyCol, bg, 'px-3 py-1 text-xs text-fg-muted')}>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-phase-cellule" aria-hidden />Plants en cellule</span>
        </td>
        <td className={bg} /><td className={bg} />
        {bars(plantsEnCellule, maxCellule, 'bg-phase-cellule')}
      </tr>
      <tr>
        <td className={cn(stickyCol, bg, 'px-3 py-1 text-xs text-fg-muted')}>
          <span className="inline-flex items-center gap-1.5"><Scissors className="h-3 w-3 text-primary" aria-hidden />Tiges à récolter</span>
        </td>
        <td className={bg} /><td className={bg} />
        {bars(tigesARecolter, maxTiges, 'bg-phase-recolte')}
      </tr>
    </>
  )
}

/** Courbes hebdomadaires sur semaines datées (axe : S47 2026 … S10 2027). */
function CourbesSemaines({ data }: { data: { cle: string; label: string; plants: number; tiges: number }[] }) {
  const t = useChartTheme()
  const series = [
    { key: 'plants', label: 'Plants en cellule', color: t.c2 },
    { key: 'tiges', label: 'Tiges à récolter', color: t.c1 },
  ]
  return (
    <div>
      <div className="mb-3"><Legend items={series.map(s => ({ label: s.label, color: s.color }))} /></div>
      <div style={{ height: 280 }} className="w-full" role="img" aria-label="Plants en cellule et tiges à récolter par semaine, sur la période affichée">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
            <XAxis dataKey="cle" tickLine={false} axisLine={{ stroke: t.grid }} interval={0} tick={{ fill: t.axis, fontSize: 11 }}
              tickFormatter={(cle: string, i: number) => (i % 4 === 0 ? data[i]?.label.replace(/ \d{4}$/, '') ?? '' : '')} />
            <YAxis width={48} tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} allowDecimals={false}
              tickFormatter={(v: number) => v.toLocaleString('fr-FR')} />
            <Tooltip cursor={{ stroke: t.axis, strokeWidth: 1 }}
              content={<ChartTooltip format={v => v.toLocaleString('fr-FR')} labelFormat={(cle: string) => data.find(d => d.cle === cle)?.label ?? cle} />} />
            {series.map(s => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
                fill={s.color} fillOpacity={0.1} isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface, fill: s.color }} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Fenêtre d'une saison : son année civile (1er janvier au 31 décembre),
 * élargie aux plantations qui lui sont rattachées et qui en débordent
 * (bulbes plantés en novembre de l'année précédente, dahlias arrachés en
 * janvier suivant) : rien ne disparaît au passage d'année.
 */
function fenetreSaison(season: Season, ps: PlantingFull[]): Intervalle {
  const annee = bornesSaison(season.year)
  const dates = ps.filter(p => p.date_semis && p.date_fin)
  if (!dates.length) return annee
  return {
    debut: minDate(annee.debut, ...dates.map(p => p.date_semis)),
    fin: maxDate(annee.fin, ...dates.map(p => p.date_fin)),
  }
}

export default function Calendar({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [periode, setPeriode] = useState<string>('12m')
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)
  const today: string = ctx.today
  const seasons: Season[] = ctx.seasons || []
  const activeSeasonId: string | undefined = ctx.activeSeason?.id
  // Toutes les plantations de la ferme, y compris sans date de floraison : une vivace occupe sa planche (013)
  const farmPlantings: PlantingFull[] = ctx.farmPlantingsTout?.length ? ctx.farmPlantingsTout
    : ctx.farmPlantings?.length ? ctx.farmPlantings : (ctx.plantings || [])
  const occupe = (p: PlantingFull, f: Intervalle) => { try { return chevauche(periodeOccupation(p), f) } catch { return false } }

  // ─── Période et plantations concernées ───
  const saisonFiltre = periode === '12m' ? null : seasons.find(s => s.id === periode) || null
  let fenetre: Intervalle
  let data: PlantingFull[]
  if (saisonFiltre) {
    data = farmPlantings.filter(p => p.season_id === saisonFiltre.id)
    fenetre = fenetreSaison(saisonFiltre, data)
    // Vivaces d'une autre saison toujours en place : elles fleurissent aussi cette année
    data = [...data, ...farmPlantings.filter(p => p.season_id !== saisonFiltre.id && cycleDe(p) === 'vivace' && occupe(p, fenetre))]
  } else {
    fenetre = fenetreMensuelle(today, 12)
    data = farmPlantings.filter(p => p.date_semis && occupe(p, fenetre))
  }
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  const semaines = semainesDe(fenetre)
  const lundiCourant = lundiDeSemaine(today)
  const semCourante = semaines.find(s => s.lundi === lundiCourant)
  const autresSaisons = Array.from(new Set(data.filter(p => p.season_id !== activeSeasonId).map(p => p.season_name).filter(Boolean)))

  // Dédoublonnage culture + planche + date de semis
  const seen = new Set<string>()
  const unique = data.filter(p => {
    const k = `${p.culture_name}|${p.garden_id}|${p.planche_id}|${p.date_semis}|${p.season_id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // Regrouper par jardin
  const gardenMap = new Map<string, { gardenId: string; gardenName: string; plantings: PlantingFull[] }>()
  for (const p of unique) {
    if (!gardenMap.has(p.garden_id)) gardenMap.set(p.garden_id, { gardenId: p.garden_id, gardenName: p.garden_name, plantings: [] })
    gardenMap.get(p.garden_id)!.plantings.push(p)
  }
  const gardenGroups = Array.from(gardenMap.values()).sort((a, b) => a.gardenName.localeCompare(b.gardenName))
  for (const g of gardenGroups) {
    g.plantings.sort((a, b) => a.culture_name.localeCompare(b.culture_name) || a.date_semis.localeCompare(b.date_semis))
  }

  // En-têtes : regroupement des semaines par mois (colSpan)
  const groupesMois: { cle: string; mois: number; annee: number; n: number }[] = []
  for (const s of semaines) {
    const last = groupesMois[groupesMois.length - 1]
    const annee = Number(ajouterJours(s.lundi, 3).slice(0, 4))
    if (last && last.mois === s.mois && last.annee === annee) last.n++
    else groupesMois.push({ cle: `${annee}-${s.mois}`, mois: s.mois, annee, n: 1 })
  }
  const debutAnnee = (i: number) => i > 0 && semaines[i].num === 1
  const sansFloraison = sansDatesDeRecolte(unique)
  // Récapitulatif : chaque floraison de la période compte (vivaces), sans les plantations sans date de récolte
  const prevues = (ps: PlantingFull[]) => recoltesDansPeriode(avecDatesDeRecolte(ps), fenetre)

  const titrePeriode = saisonFiltre
    ? `${saisonFiltre.name} : du ${formatJourMois(fenetre.debut)} ${fenetre.debut.slice(0, 4)} au ${formatJourMois(fenetre.fin)} ${fenetre.fin.slice(0, 4)}`
    : `De ${formatMois(fenetre.debut)} à ${formatMois(fenetre.fin)}, toutes saisons`

  return (
    <div>
      <PageHeader title="Calendrier de culture" description={titrePeriode} image={photos.champTournesols}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select aria-label="Période affichée" value={periode} onChange={e => setPeriode(e.target.value)} wrapperClassName="w-full sm:w-52">
              <option value="12m">12 prochains mois</option>
              <optgroup label="Bilan d’une saison">
                {[...seasons].sort((a, b) => b.year - a.year).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            </Select>
            <Select aria-label="Filtrer par jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="w-full sm:w-52">
              <option value="">Tous les jardins</option>
              {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
        } />

      {/* Légende */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-cellule" aria-hidden />En cellule</li>
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-champ" aria-hidden />Au champ</li>
        <li className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-phase-recolte" aria-hidden />En récolte</li>
        {semCourante && <li className="flex items-center gap-2"><span className="h-3 w-0.5 bg-accent" aria-hidden />Semaine en cours ({libSemaine(semCourante)})</li>}
        {autresSaisons.length > 0 && (
          <li className="flex items-center gap-2"><Badge tone="violet">{autresSaisons.join(', ')}</Badge>Plantation d’une autre saison que {ctx.activeSeason?.name}</li>
        )}
        <li className="text-fg-subtle sm:ml-auto">Cliquez une ligne pour modifier la plantation.</li>
      </ul>

      {sansFloraison.length > 0 && (
        <p role="status" data-testid="calendrier-sans-floraison" className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-xs text-fg">
          {sansFloraison.length} plantation{sansFloraison.length > 1 ? 's' : ''} sans date de floraison ({Array.from(new Set(sansFloraison.map(p => p.culture_name))).join(', ')}) :
          {' '}affichée{sansFloraison.length > 1 ? 's' : ''} au champ, hors tiges et revenu prévus. Renseignez le début de floraison dans le Catalogue.
        </p>
      )}

      {unique.length === 0 ? (
        <Card>
          <EmptyState image={photos.champTournesols} title={saisonFiltre ? `Aucune plantation pour ${saisonFiltre.name}` : 'Rien de prévu sur les 12 prochains mois'}
            description="Ajoutez des cultures depuis Jardins & planches pour voir le calendrier se construire automatiquement." />
        </Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-13rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label="Calendrier hebdomadaire" tabIndex={0}>
          <table className="grid-table w-full" style={{ minWidth: 320 + semaines.length * 24 }}>
            <thead className="sticky top-0 z-[2]">
              <tr className="bg-surface-2">
                <th className={cn(stickyCol, 'z-[3] bg-surface-2')} />
                <th className="bg-surface-2" /><th className="bg-surface-2" />
                {groupesMois.map((m, i) => (
                  <th key={m.cle} colSpan={m.n}
                    className={cn('truncate bg-surface-2 px-1 pt-2 text-left text-[0.62rem] font-semibold uppercase tracking-wide text-fg-muted',
                      i > 0 && 'border-l border-border', m.mois === 1 && 'border-l-2 border-border-strong text-fg')}>
                    {/* une colonne seule (mois entamé) est trop étroite pour un libellé */}
                    {m.n >= 3 ? <>{MOIS_COURT[m.mois - 1]}{(m.mois === 1 || i === 0) ? ` ${m.annee}` : ''}</> : null}
                  </th>
                ))}
              </tr>
              <tr className="bg-surface-2">
                <th className={cn(stickyCol, 'z-[3] min-w-[150px] sm:min-w-[220px] border-b border-border bg-surface-2 px-3 pb-1.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted')}>Culture</th>
                <th className="min-w-[48px] border-b border-border bg-surface-2 px-1.5 pb-1.5 text-center text-2xs font-semibold uppercase text-fg-muted" title="Nombre de plants">Plants</th>
                <th className="min-w-[48px] border-b border-border bg-surface-2 px-1.5 pb-1.5 text-center text-2xs font-semibold uppercase text-fg-muted" title="Tiges nettes estimées">Tiges</th>
                {semaines.map((s, i) => (
                  <th key={s.lundi} title={`${libSemaine(s)} — semaine du ${formatJourMois(s.lundi)} ${s.lundi.slice(0, 4)}`}
                    className={cn('min-w-[22px] border-b border-border bg-surface-2 px-0 pb-1.5 text-center text-[0.62rem] font-semibold',
                      s.lundi === lundiCourant ? 'text-accent' : 'text-fg-muted', debutAnnee(i) && 'border-l-2 border-border-strong')}>
                    {s.num}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gardenGroups.map(group => (
                <Fragment key={group.gardenId}>
                  <tr>
                    <td className={cn(stickyCol, 'border-b border-t border-border bg-primary-soft px-3 py-2')}>
                      <span className="font-serif text-sm font-semibold text-fg">{group.gardenName}</span>
                      <span className="ml-2 text-xs text-fg-muted">{group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''}</span>
                    </td>
                    <td colSpan={2 + semaines.length} className="border-b border-t border-border bg-primary-soft" />
                  </tr>
                  {group.plantings.map(p => {
                    const ph = phases(p, fenetre)
                    const autre = p.season_id !== activeSeasonId
                    return (
                      <tr key={p.id} className="group cursor-pointer" onClick={() => setSelectedPlanting(p)}>
                        <td className={cn(stickyCol, 'border-b border-border/60 px-3 py-1.5 group-hover:bg-surface-2', autre && 'shadow-[inset_3px_0_0_rgb(var(--violet))]')}>
                          <button type="button" className="rounded text-left text-xs font-medium text-fg underline decoration-border-strong decoration-dotted underline-offset-4 group-hover:decoration-primary"
                            onClick={e => { e.stopPropagation(); setSelectedPlanting(p) }}>
                            {p.culture_name}
                          </button>
                          <span className="ml-2 text-[0.68rem] text-fg-subtle">{p.planche_name}</span>
                          {autre && <Badge tone="violet" className="ml-1.5">{p.season_name || 'Autre saison'}</Badge>}
                        </td>
                        <td className="num border-b border-border/60 text-center text-[0.68rem] font-medium text-fg group-hover:bg-surface-2">{p.plants_count || '—'}</td>
                        <td className="num border-b border-border/60 text-center text-[0.68rem] font-medium text-primary group-hover:bg-surface-2">{p.tiges_estimees || '—'}</td>
                        {semaines.map((s, i) => {
                          const phase = phaseSemaine(ph, s.lundi)
                          const cls = phase === 'cellule' ? 'bg-phase-cellule' : phase === 'champ' ? 'bg-phase-champ' : phase === 'recolte' ? 'bg-phase-recolte' : ''
                          return (
                            <td key={s.lundi} className={cn('border-b border-border/60 px-[1px] py-1 group-hover:bg-surface-2',
                              s.lundi === lundiCourant && 'bg-accent-soft/60', debutAnnee(i) && 'border-l-2 border-l-border-strong')}>
                              <div className={cn('mx-auto h-3.5 w-[18px] rounded-[3px]', cls, autre && phase && 'opacity-60 ring-1 ring-inset ring-violet/60')} />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  <SubtotalRows label={group.gardenName} plantings={group.plantings} semaines={semaines} />
                </Fragment>
              ))}
            </tbody>
            {gardenGroups.length > 1 && (
              <tfoot>
                <SubtotalRows label="TOTAL" plantings={unique} semaines={semaines} isGlobal />
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ─── Récap par jardin ─────────────────── */}
      {gardenGroups.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-xl">Récapitulatif par jardin</h2>
          <p className="mb-4 text-sm text-fg-muted">{saisonFiltre ? `Plantations de ${saisonFiltre.name}.` : 'Plantations qui occupent au moins un jour de la période, toutes saisons confondues.'}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {gardenGroups.map(group => {
              const totalPlants = group.plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
              const totalTiges = prevues(group.plantings).reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const totalRevenu = prevues(group.plantings).reduce((s, p) => s + (Number(p.revenu_estime) || 0), 0)
              return (
                <Card key={group.gardenId} className="p-4">
                  <h3 className="font-sans text-sm font-semibold">{group.gardenName}</h3>
                  <p className="text-xs text-fg-muted">{group.plantings.length} culture{group.plantings.length > 1 ? 's' : ''}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div><dt className="text-xs text-fg-subtle">Plants</dt><dd className="num text-lg font-semibold text-fg">{totalPlants}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Tiges nettes</dt><dd className="num text-lg font-semibold text-fg">{totalTiges}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Revenu est.</dt><dd className="num text-lg font-semibold text-primary">{Math.round(totalRevenu).toLocaleString('fr-FR')} €</dd></div>
                  </dl>
                </Card>
              )
            })}
            {gardenGroups.length > 1 && (() => {
              const gTotalPlants = unique.reduce((s, p) => s + (p.plants_count || 0), 0)
              const gTotalTiges = prevues(unique).reduce((s, p) => s + (p.tiges_estimees || 0), 0)
              const gTotalRevenu = prevues(unique).reduce((s, p) => s + (Number(p.revenu_estime) || 0), 0)
              return (
                <Card className="border-primary/40 bg-primary-soft/40 p-4">
                  <h3 className="font-sans text-sm font-semibold">Total général</h3>
                  <p className="text-xs text-fg-muted">{unique.length} cultures — {gardenGroups.length} jardins</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <div><dt className="text-xs text-fg-subtle">Plants</dt><dd className="num text-xl font-semibold text-fg">{gTotalPlants}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Tiges nettes</dt><dd className="num text-xl font-semibold text-fg">{gTotalTiges}</dd></div>
                    <div><dt className="text-xs text-fg-subtle">Revenu est.</dt><dd className="num text-xl font-semibold text-primary">{Math.round(gTotalRevenu).toLocaleString('fr-FR')} €</dd></div>
                  </dl>
                </Card>
              )
            })()}
          </div>
        </section>
      )}

      {/* ─── Graphe Plants / Tiges par semaine ──── */}
      {unique.length > 0 && (() => {
        const { plantsEnCellule, tigesARecolter } = calcWeeklyTotals(unique, semaines)
        const chartData = semaines.map((s, i) => ({ cle: s.lundi, label: libSemaine(s), plants: plantsEnCellule[i], tiges: tigesARecolter[i] }))
        return (
          <Card className="mt-8">
            <CardHeader title="Plants en cellule et tiges à récolter" description={`Par semaine, ${saisonFiltre ? saisonFiltre.name : 'sur les 12 prochains mois'}`}
              icon={<CalendarRange className="h-4 w-4" />} />
            <CardContent>
              <CourbesSemaines data={chartData} />
            </CardContent>
          </Card>
        )
      })()}

      <Dialog open={!!selectedPlanting} onOpenChange={o => !o && setSelectedPlanting(null)} size="lg"
        title={selectedPlanting ? `Modifier — ${selectedPlanting.culture_name}` : 'Modifier'}
        description={selectedPlanting ? `${selectedPlanting.garden_name} · ${selectedPlanting.planche_name} · ${selectedPlanting.season_name ?? ''}` : undefined}>
        {selectedPlanting && <EditPlantingForm key={selectedPlanting.id} planting={selectedPlanting} ctx={ctx} onClose={() => setSelectedPlanting(null)} />}
      </Dialog>
    </div>
  )
}
