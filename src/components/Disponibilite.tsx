'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, Store } from 'lucide-react'
import type { PlantingFull } from '@/lib/types'
import {
  Button, Card, CardContent, CardHeader, EmptyState, PageHeader, SearchInput, Select, Skeleton, Tabs, TypeBadge, cn,
} from '@/components/ui'
import { photos } from '@/lib/images'
import {
  anneesDesSaisons, bornesSaison, calculerDisponibilites, calendrierRecolte, estDateValide, formatDateLongue, formatSemaine,
  lundiDeSemaine, plantationsSansRecolte, semaineIso, surventes,
  type DisponibiliteSemaine, type Disponibilites,
} from '@/lib/domain'
import { aujourdhuiParis, useDisponibiliteFerme, type ReelCtx } from '@/hooks/useReel'
import { FicheFleuristes } from '@/components/reel/FicheFleuristes'
import { Hypothese, REPARTITION_PREVU, fmtTiges } from '@/components/reel/commun'

type Vue = 'vendre' | 'annuel'

export default function Disponibilite({ ctx }: { ctx: any }) {
  const [vue, setVue] = useState<Vue>('vendre')
  const [fiche, setFiche] = useState(false)
  const aujourdhui = aujourdhuiParis()
  const ferme = useDisponibiliteFerme(ctx as ReelCtx)

  const calc = useMemo((): { dispo: Disponibilites; erreur: null } | { dispo: null; erreur: string } | null => {
    if (!ferme.data) return null
    try {
      // Plantations sans dates de récolte : hors calcul (elles ne produisent rien de datable).
      const plantings = ferme.data.plantings.filter(p => estDateValide(p.date_recolte) && estDateValide(p.date_fin))
      // …mais nommées à l'écran (AvertissementSansDates), jamais ignorées en silence.
      return {
        dispo: calculerDisponibilites({ plantings, commandes: ferme.data.commandes, recoltes: ferme.data.recoltes, pertes: ferme.data.pertes, aujourdhui }),
        erreur: null,
      }
    } catch (e) {
      console.error('[disponibilité] calcul impossible', e)
      return { dispo: null, erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [ferme.data, aujourdhui])

  const dispo = calc?.dispo ?? null
  const ventesEnTrop = useMemo(() => (dispo ? surventes(dispo) : []), [dispo])

  return (
    <div>
      <PageHeader title="Disponibilité des fleurs" image={photos.tournesol}
        description="Ce qui reste à proposer, semaine par semaine, sur les 12 prochains mois"
        actions={
          <Button onClick={() => setFiche(true)} disabled={!dispo} className="w-full sm:w-auto">
            <Store className="h-4 w-4" aria-hidden />Fiche disponibilités fleuristes
          </Button>
        } />

      <Tabs label="Vue" value={vue} onChange={setVue} className="mb-4"
        options={[{ value: 'vendre', label: 'À vendre · 12 mois' }, { value: 'annuel', label: 'Calendrier de l’année' }]} />

      {vue === 'annuel' ? <VueAnnuelle ctx={ctx} /> : (
        ferme.loading ? (
          <div aria-busy="true" className="space-y-4"><Skeleton className="h-24 rounded-card" /><Skeleton className="h-96 rounded-card" /></div>
        ) : ferme.error || calc?.erreur ? (
          <Card><EmptyState icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Disponibilités non calculables"
            description={ferme.error ?? calc?.erreur ?? ''} /></Card>
        ) : dispo ? (
          <>
            {ferme.data && ferme.data.sansDates.length > 0 && (
              <AvertissementSansDates plantings={ferme.data.sansDates as PlantingFull[]} />
            )}
            <VueAVendre dispo={dispo} ventesEnTrop={ventesEnTrop} />
          </>
        ) : null
      )}

      {dispo && ferme.data && (
        <FicheFleuristes open={fiche} onOpenChange={setFiche} dispo={dispo} ferme={ferme.data.fermeNom}
          aujourdhui={aujourdhui} nbSurventes={ventesEnTrop.length} />
      )}
    </div>
  )
}

// ------------------------------------------------------------
// À vendre : disponible = base − engagé, culture × semaine
// ------------------------------------------------------------
function VueAVendre({ dispo, ventesEnTrop }: { dispo: Disponibilites; ventesEnTrop: DisponibiliteSemaine[] }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const lignes = useMemo(() => dispo.lignes.filter(l => !q || l.culture_name.toLowerCase().includes(q)), [dispo, q])
  const lundis = useMemo(() => Array.from(new Set(lignes.map(l => l.lundi))).sort(), [lignes])
  const cultures = useMemo(() => Array.from(new Set(lignes.map(l => l.culture_name))).sort((a, b) => a.localeCompare(b, 'fr')), [lignes])
  const cellule = useMemo(() => new Map(lignes.map(l => [`${l.culture_name}|${l.lundi}`, l])), [lignes])
  const totalSemaine = (lundi: string) => lignes.filter(l => l.lundi === lundi).reduce((s, l) => s + Math.max(0, l.disponible), 0)

  return (
    <div className="space-y-4">
      {ventesEnTrop.length > 0 && (
        <Card className="border-danger/40">
          <CardHeader title={`${ventesEnTrop.length} survente${ventesEnTrop.length > 1 ? 's' : ''} à régler`}
            icon={<AlertTriangle className="h-4 w-4 text-danger" />}
            description="Les commandes confirmées dépassent ce qui est disponible : à traiter avant d’envoyer la fiche." />
          <CardContent className="pt-3">
            <ul className="divide-y divide-border text-sm">
              {ventesEnTrop.map(l => (
                <li key={`${l.culture_id}|${l.lundi}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <span><span className="font-semibold text-fg">{l.culture_name}</span> <span className="text-fg-muted">· {formatSemaine(l.lundi)}</span></span>
                  <span className="num text-xs text-fg-muted">
                    {l.source === 'reel' ? `récolté ${fmtTiges(l.recolte ?? 0)} − perdu ${fmtTiges(l.perdu)}` : `prévu ${fmtTiges(l.prevu)}`} − engagé {fmtTiges(l.engage)} =
                    <span className="ml-1 font-semibold text-danger">{fmtTiges(l.disponible)} tiges</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {dispo.non_attribuees.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {dispo.non_attribuees.length} ligne{dispo.non_attribuees.length > 1 ? 's' : ''} de commande sans culture ({fmtTiges(dispo.non_attribuees.reduce((s, l) => s + l.tiges, 0))} tiges) : non retranchée{dispo.non_attribuees.length > 1 ? 's' : ''} des disponibilités.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une fleur…" className="sm:w-64" label="Rechercher une fleur" />
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted sm:ml-auto">
          <li className="flex items-center gap-1.5"><span className="num rounded bg-primary-soft px-1 font-semibold text-primary">120</span>Réel (récolté − perdu − engagé)</li>
          <li className="flex items-center gap-1.5"><span className="num rounded px-1 text-fg">120</span>Prévu − engagé</li>
          <li className="flex items-center gap-1.5"><span className="num rounded bg-danger-soft px-1 font-semibold text-danger">−30</span>Survente</li>
        </ul>
      </div>

      {cultures.length === 0 ? (
        <Card><EmptyState image={photos.tournesol} title="Rien à proposer sur la période"
          description={q ? 'Aucune fleur ne correspond à la recherche.' : `Aucune récolte prévue du ${formatDateLongue(dispo.periode.debut)} au ${formatDateLongue(dispo.periode.fin)}.`} /></Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-16rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label="Tiges disponibles par culture et par semaine" tabIndex={0}>
          <table className="grid-table w-full">
            <thead className="sticky top-0 z-[2]">
              <tr>
                <th className="sticky left-0 z-[3] min-w-[150px] border-b border-border bg-surface-2 px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted sm:min-w-[190px]">Culture</th>
                {lundis.map(l => (
                  <th key={l} scope="col" title={formatSemaine(l)}
                    className="min-w-[46px] border-b border-border bg-surface-2 px-1 py-2.5 text-center text-[0.65rem] font-semibold text-fg-muted">
                    S{semaineIso(l).semaine}
                    <span className="block font-normal text-fg-subtle">{l.slice(8, 10)}/{l.slice(5, 7)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cultures.map(nom => (
                <tr key={nom} className="group">
                  <th scope="row" className="sticky left-0 z-[1] border-b border-border/60 bg-surface px-3 py-1.5 text-left text-sm font-medium text-fg group-hover:bg-surface-2">
                    <span className="block max-w-[140px] truncate sm:max-w-[180px]">{nom}</span>
                  </th>
                  {lundis.map(l => {
                    const c = cellule.get(`${nom}|${l}`)
                    if (!c || (c.disponible === 0 && c.engage === 0 && c.prevu === 0 && c.recolte === null)) {
                      return <td key={l} className="border-b border-border/60 text-center text-fg-subtle/50 group-hover:bg-surface-2">·</td>
                    }
                    const detail = `${nom}, ${formatSemaine(l)} : ${c.source === 'reel'
                      ? `récolté ${c.recolte ?? 0}, perdu ${c.perdu}`
                      : `prévu ${c.prevu}`}, engagé ${c.engage}, disponible ${c.disponible}`
                    return (
                      <td key={l} className="border-b border-border/60 px-0.5 py-1 text-center group-hover:bg-surface-2" title={detail}>
                        <span className={cn('num inline-block min-w-[2.5rem] rounded px-1 py-0.5 text-xs',
                          c.disponible < 0 ? 'bg-danger-soft font-semibold text-danger'
                            : c.source === 'reel' ? 'bg-primary-soft font-semibold text-primary'
                              : c.disponible === 0 ? 'text-fg-subtle' : 'text-fg')}>
                          {c.disponible < 0 ? `−${fmtTiges(-c.disponible)}` : fmtTiges(c.disponible)}
                        </span>
                        <span className="sr-only">{detail}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-[2]">
              <tr>
                <th scope="row" className="sticky left-0 z-[3] border-t border-border bg-surface-2 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-fg">Total disponible</th>
                {lundis.map(l => (
                  <td key={l} className="num border-t border-border bg-surface-2 px-0.5 py-2 text-center text-[0.68rem] font-semibold text-fg">{fmtTiges(totalSemaine(l))}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="space-y-1">
        <Hypothese>
          Du {formatDateLongue(dispo.periode.debut)} au {formatDateLongue(dispo.periode.fin)}, toutes saisons de la ferme. Disponible = prévu − commandes confirmées, prêtes ou livrées ; dès qu’une récolte est saisie pour la semaine, le réel (récolté − perdu) remplace le prévu. Les ventes directes au marché ne sont pas retranchées.
        </Hypothese>
        <Hypothese>{REPARTITION_PREVU}</Hypothese>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Calendrier de l'année civile, lu par dates, toutes saisons de la ferme
// ------------------------------------------------------------
function VueAnnuelle({ ctx }: { ctx: any }) {
  const [filterGarden, setFilterGarden] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const aujourdhui = aujourdhuiParis()
  const anneeCourante = Number(aujourdhui.slice(0, 4))
  const [annee, setAnnee] = useState<number>(() => Number(ctx.activeSeason?.year) || anneeCourante)

  // Toutes les plantations de la ferme, toutes saisons : une récolte se lit à sa date. Celles
  // sans date de récolte (vivace sans floraison) sont gardées pour être signalées (013).
  const plantings: PlantingFull[] = ctx.farmPlantingsTout?.length ? ctx.farmPlantingsTout
    : ctx.farmPlantings?.length ? ctx.farmPlantings : (ctx.plantings || [])
  const annees = anneesDesSaisons(ctx.seasons || [], [anneeCourante, anneeCourante + 1, annee])
  const periode = bornesSaison(annee)

  let data = plantings
  if (filterGarden) data = data.filter(p => p.garden_id === filterGarden)
  if (filterType) data = data.filter(p => p.culture_type === filterType)
  if (search.trim()) data = data.filter(p => p.culture_name.toLowerCase().includes(search.trim().toLowerCase()))
  const cal = calendrierRecolte(data, periode)
  const sansDates = plantationsSansRecolte(data)
  const lundiCourant = lundiDeSemaine(aujourdhui)
  const maxCount = Math.max(1, ...cal.parSemaine)

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une fleur…" className="col-span-2 sm:w-64" label="Rechercher une fleur" />
        <Select aria-label="Année" value={String(annee)} onChange={e => setAnnee(Number(e.target.value))} wrapperClassName="sm:w-32">
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select aria-label="Jardin" value={filterGarden} onChange={e => setFilterGarden(e.target.value)} wrapperClassName="sm:w-48">
          <option value="">Tous les jardins</option>
          {(ctx.gardens || []).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Select aria-label="Type" value={filterType} onChange={e => setFilterType(e.target.value)} wrapperClassName="sm:w-40">
          <option value="">Tous les types</option>
          <option value="RR">RR</option><option value="MP">MP</option><option value="RU">RU</option>
        </Select>
        <ul className="col-span-2 flex items-center gap-4 text-xs text-fg-muted sm:ml-auto">
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-phase-recolte" aria-hidden />En récolte</li>
          {cal.lundis.includes(lundiCourant) && <li className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-accent" aria-hidden />Semaine en cours</li>}
        </ul>
      </div>

      {sansDates.length > 0 && <AvertissementSansDates plantings={sansDates} />}

      {cal.lignes.length === 0 ? (
        <Card>
          <EmptyState image={photos.tournesol} title={`Aucune récolte prévue en ${annee}`}
            description={plantings.length ? 'Aucune variété ne correspond aux filtres pour cette année.' : 'La disponibilité se calcule automatiquement depuis vos plantations.'} />
        </Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-14rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label={`Récoltes par semaine en ${annee}`} tabIndex={0}>
          <table className="grid-table w-full">
            <thead className="sticky top-0 z-[2]">
              <tr>
                <th className="sticky left-0 z-[3] min-w-[190px] border-b border-border bg-surface-2 px-3 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-muted">Culture</th>
                {cal.lundis.map(l => (
                  <th key={l} scope="col" title={formatSemaine(l)} className={cn('min-w-[30px] border-b border-border bg-surface-2 px-0 py-2.5 text-center text-[0.62rem] font-semibold',
                    l === lundiCourant ? 'text-accent' : 'text-fg-muted')}>
                    S{semaineIso(l).semaine}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cal.lignes.map(ligne => (
                <tr key={ligne.culture_name} className="group">
                  <th scope="row" className="sticky left-0 z-[1] border-b border-border/60 bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-surface-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-fg" title={ligne.saisons.length ? `Plantations : ${ligne.saisons.join(', ')}` : undefined}>{ligne.culture_name}</span>
                      <TypeBadge type={ligne.culture_type} />
                    </span>
                  </th>
                  {cal.lundis.map(l => {
                    const avail = ligne.lundis.has(l)
                    return (
                      <td key={l} className={cn('border-b border-border/60 px-[2px] py-1.5 group-hover:bg-surface-2', l === lundiCourant && 'bg-accent-soft/60')}>
                        <div className={cn('mx-auto h-4 w-[22px] rounded-[3px]', avail ? 'bg-phase-recolte' : 'bg-surface-3/70')}>
                          <span className="sr-only">{avail ? `En récolte ${formatSemaine(l)}` : ''}</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-[2]">
              <tr>
                <th scope="row" className="sticky left-0 z-[3] border-t border-border bg-surface-2 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-fg">
                  Total variétés
                </th>
                {cal.parSemaine.map((n, i) => (
                  <td key={cal.lundis[i]} className="border-t border-border bg-surface-2 px-0 py-1.5 text-center align-bottom">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-3.5 rounded-sm bg-primary/70" style={{ height: `${n > 0 ? Math.max(2, (n / maxCount) * 14) : 0}px` }} aria-hidden />
                      <span className={cn('num text-[0.65rem] font-semibold', n > 0 ? 'text-fg' : 'text-fg-subtle/60')}>{n}</span>
                    </div>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="mt-3">
        <Hypothese>Année civile {annee}, du 1er janvier au 31 décembre, lue par dates sur toutes les saisons de la ferme : une récolte à cheval sur deux années apparaît dans les deux.</Hypothese>
      </div>
    </div>
  )
}

/** Plantations hors calcul faute de date de récolte : on les nomme au lieu de les taire. */
function AvertissementSansDates({ plantings }: { plantings: Pick<PlantingFull, 'id' | 'culture_name' | 'planche_name' | 'garden_name'>[] }) {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {plantings.length} plantation{plantings.length > 1 ? 's' : ''} sans date de récolte calculable (début de floraison d’une vivace à renseigner, ou jours au champ manquants au catalogue), donc hors disponibilités : {plantings.map(p => `${p.culture_name}${p.planche_name ? ` (${p.garden_name ?? ''} ${p.planche_name})` : ''}`).join(', ')}.
      </span>
    </p>
  )
}
