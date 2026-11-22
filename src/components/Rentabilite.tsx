'use client'
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Clock, Coins, NotebookPen, Receipt, Scale } from 'lucide-react'
import {
  Card, CardContent, CardHeader, EmptyState, PageHeader, Segmented, Skeleton, Stat,
} from '@/components/ui'
import { estDateValide, eurosEnCentimes, formatEuros } from '@/lib/domain'
import {
  LIBELLES_CLES, depensesParCategorie, formatDuree, margesParCulture, tempsParType,
  type CleRepartition, type PlantingCout, type SyntheseMarges,
} from '@/lib/domain/couts'
import { aujourdhuiParis, type useBleuenn } from '@/hooks/useBleuenn'
import { useCouts } from '@/hooks/useCouts'
import { SaisieRapide, type OptionCulture, type OptionPersonne, type OptionPlanche } from '@/components/couts/SaisieRapide'
import { Journal } from '@/components/couts/Journal'
import { TableauRentabilite, margeRetenue } from '@/components/couts/TableauRentabilite'
import { MargeChart } from '@/components/couts/MargeChart'
import { TauxHoraire } from '@/components/couts/TauxHoraire'
import { Valeur, eurosCompact } from '@/components/couts/commun'
import { Hypothese } from '@/components/reel/commun'

type Ctx = ReturnType<typeof useBleuenn>

/** Seules les plantations datées entrent dans la surface × jours. */
const plantationDatee = (p: any): p is PlantingCout =>
  estDateValide(p?.date_fin) && (estDateValide(p?.date_plantation) || (p?.semis_direct && estDateValide(p?.date_semis)))

export default function Rentabilite({ ctx }: { ctx: Ctx }) {
  const c = useCouts({ activeSeason: ctx.activeSeason as any, user: ctx.user, sales: ctx.sales })
  const [cle, setCle] = useState<CleRepartition>('surface')
  const [repartirTemps, setRepartirTemps] = useState(true)
  const aujourdhui = ctx.today || aujourdhuiParis()

  // ─── Listes de choix ───────────────────────────────────────
  const cultures: OptionCulture[] = useMemo(() => {
    // Cultures du plan de la saison d'abord : ce sont elles qu'on saisit au champ.
    const ids = new Set((ctx.plantings || []).map((p: any) => p.culture_id))
    return (ctx.catalog || []).filter((x: any) => ids.has(x.id))
      .map((x: any) => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [ctx.plantings, ctx.catalog])
  const planches: OptionPlanche[] = useMemo(() => (ctx.gardens || []).flatMap((g: any) =>
    (g.planches || []).map((p: any) => ({ id: p.id, label: `${g.name} · ${p.name}` }))), [ctx.gardens])
  const personnes: OptionPersonne[] = useMemo(() => {
    const l = (ctx.farmTeam || []).map((m: any) => ({ id: m.user_id, label: m.owner_name || m.email || 'Membre' }))
    if (ctx.user && !l.some(p => p.id === ctx.user.id)) l.unshift({ id: ctx.user.id, label: 'Moi' })
    return l
  }, [ctx.farmTeam, ctx.user])

  const nomCulture = useCallback((id: string | null) => (id ? (ctx.catalog || []).find((x: any) => x.id === id)?.name ?? 'Culture inconnue' : null), [ctx.catalog])
  const nomPlanche = useCallback((id: string | null) => (id ? planches.find(p => p.id === id)?.label ?? 'Planche supprimée' : null), [planches])
  const nomPersonne = useCallback((id: string) => personnes.find(p => p.id === id)?.label ?? 'Ancien membre', [personnes])

  // ─── Calcul ────────────────────────────────────────────────
  const calc = useMemo((): { s: SyntheseMarges; erreur: null } | { s: null; erreur: string } => {
    try {
      const plantings = (ctx.plantings || []).filter(plantationDatee)
      const s = margesParCulture({
        couts: c.costs, temps: c.timeEntries, plantings, ventes: c.ventes,
        cultures: (ctx.catalog || []).map((x: any) => ({ id: x.id, name: x.name })),
        tauxHoraire: c.tauxHoraire, options: { cle, repartirTempsNonAffecte: repartirTemps },
      })
      return { s, erreur: null }
    } catch (e) {
      console.error('[coûts] calcul de la rentabilité', e)
      return { s: null, erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [ctx.plantings, ctx.catalog, c.costs, c.timeEntries, c.ventes, c.tauxHoraire, cle, repartirTemps])

  const categories = useMemo(() => { try { return depensesParCategorie(c.costs) } catch (e) { console.error('[coûts] dépenses par catégorie', e); return null } }, [c.costs])
  const travaux = useMemo(() => { try { return tempsParType(c.timeEntries, c.tauxHoraire) } catch (e) { console.error('[coûts] temps par travail', e); return null } }, [c.timeEntries, c.tauxHoraire])

  const tauxRenseigne = c.tauxHoraire !== null
  const serie = tauxRenseigne ? 'Marge' : 'Marge hors temps'
  const graphe = useMemo(() => !calc.s ? [] : calc.s.lignes
    .filter(l => l.ca > 0 || (l.depenses.valeur ?? 0) > 0)
    .map(l => ({ label: l.libelle, value: margeRetenue(l).valeur }))
    .filter((d): d is { label: string; value: number } => d.value !== null)
    .sort((a, b) => b.value - a.value), [calc.s])

  if (!ctx.activeSeason) {
    return (
      <div className="space-y-6">
        <PageHeader title="Coûts & rentabilité" description="Dépenses, temps passé et marge par culture" />
        <EmptyState icon={<Scale className="h-6 w-6" aria-hidden />} title="Aucune saison" description="Créez une saison pour saisir dépenses et temps passé." />
      </div>
    )
  }

  const s = calc.s
  return (
    <div className="space-y-6">
      <PageHeader title="Coûts & rentabilité" eyebrow={ctx.activeSeason.name}
        description="Ce que chaque culture rapporte une fois les dépenses et le temps comptés." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <section aria-labelledby="titre-saisie" className="min-w-0 space-y-4">
          <h2 id="titre-saisie" className="sr-only">Saisie rapide</h2>
          <SaisieRapide aujourdhui={aujourdhui} cultures={cultures} planches={planches} personnes={personnes}
            moi={ctx.user?.id ?? null} onTemps={c.addTime} onDepense={c.addCost} />
          <TauxHoraire taux={c.tauxHoraire} estOwner={!!ctx.isFarmOwner} onSave={c.setTauxHoraire} />
        </section>

        <section aria-labelledby="titre-bilan" className="min-w-0 space-y-4">
          <h2 id="titre-bilan" className="sr-only">Bilan de la saison</h2>
          {c.error ? (
            <Card><CardContent>
              <EmptyState compact icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Données indisponibles"
                description={`Les coûts n’ont pas pu être chargés : ${c.error}. Rien n’est affiché plutôt qu’un bilan faux.`} />
            </CardContent></Card>
          ) : c.loading ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>
          ) : !s ? (
            <Card><CardContent>
              <EmptyState compact icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Bilan non calculable" description={calc.erreur ?? ''} />
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat label="CA de la saison" icon={<Coins />} value={formatEuros(s.ca_rattache + s.ca_non_rattache)}
                sub={s.ca_non_rattache ? `dont ${eurosCompact(s.ca_non_rattache)} non rattachés` : 'tout rattaché à une culture'} />
              <Stat label="Dépenses" icon={<Receipt />} value={formatEuros(s.depenses_total)}
                sub={`dont ${eurosCompact(s.depenses_non_affectees + s.depenses_planche)} sans culture`} />
              <Stat label="Temps passé" icon={<Clock />} value={formatDuree(s.minutes_total)}
                sub={<Valeur g={s.temps_valorise_total} className="not-italic" />} />
              <Stat label={tauxRenseigne ? 'Marge de la saison' : 'Marge hors temps'} icon={<Scale />}
                value={tauxRenseigne ? <Valeur g={s.marge_globale} signe /> : <span className={s.marge_globale_hors_temps < 0 ? 'text-danger' : undefined}>{formatEuros(s.marge_globale_hors_temps)}</span>}
                sub={tauxRenseigne ? `hors temps : ${eurosCompact(s.marge_globale_hors_temps)}` : 'taux horaire non renseigné'} />
            </div>
          )}

          {s && (
            <Card>
              <CardHeader icon={<BarChart3 className="h-4 w-4" />} title={`${serie} par culture`}
                description={tauxRenseigne ? 'CA réel − dépenses − temps valorisé' : 'CA réel − dépenses. Renseignez le taux horaire pour compter le temps.'} />
              <CardContent>
                {graphe.length === 0
                  ? <EmptyState compact title="Pas encore de chiffres" description="Saisissez des dépenses, ou détaillez vos ventes par culture." />
                  : <MargeChart data={graphe} serie={serie} />}
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      {s && (
        <section aria-labelledby="titre-tableau" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="titre-tableau" className="text-xl">Rentabilité par culture</h2>
              <p className="text-sm text-fg-muted">Triez par marge au m² ou par euro de l’heure pour choisir quoi garder l’an prochain.</p>
            </div>
            <div className="w-full sm:w-auto">
              <p id="cle-label" className="mb-1 text-xs font-medium text-fg-muted">Frais généraux répartis selon</p>
              <Segmented<CleRepartition> label="Clé de répartition des frais généraux" value={cle} onChange={setCle} size="sm"
                options={[{ value: 'surface', label: 'Surface × durée' }, { value: 'ca', label: 'Chiffre d’affaires' }]} />
            </div>
          </div>
          {s.lignes.length === 0
            ? <Card><CardContent><EmptyState compact title="Aucune culture cette saison" /></CardContent></Card>
            : <TableauRentabilite lignes={s.lignes} tauxRenseigne={tauxRenseigne} />}

          <Card>
            <CardHeader icon={<NotebookPen className="h-4 w-4" />} title="Hypothèses de calcul" description="À garder en tête avant de trancher." />
            <CardContent className="space-y-2">
              <Hypothese>Frais généraux (dépenses sans culture ni planche : {formatEuros(s.depenses_non_affectees)}) répartis {LIBELLES_CLES[cle]}.{cle === 'ca' ? ' Une culture sans vente rattachée ne porte aucun frais général.' : ' Une culture qui occupe longtemps sa planche en porte davantage.'}</Hypothese>
              {s.depenses_planche > 0 && <Hypothese>Dépenses saisies sur une planche sans culture ({formatEuros(s.depenses_planche)}) : réparties entre les cultures de cette planche, au prorata m² × jours d’occupation{s.depenses_planche_reversees > 0 ? ` ; ${formatEuros(s.depenses_planche_reversees)} sur des planches vides cette saison, reversés aux frais généraux` : ''}.</Hypothese>}
              <Hypothese>
                Temps sans culture (vente, administratif… : {formatDuree(s.minutes_non_affectees)}) :{' '}
                <label className="inline-flex items-center gap-1.5 align-middle">
                  <input type="checkbox" checked={repartirTemps} onChange={e => setRepartirTemps(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
                  réparti entre les cultures avec la même clé
                </label>
                {repartirTemps ? '' : ', sinon compté seulement dans le total de la ferme'}.
              </Hypothese>
              <Hypothese>{tauxRenseigne
                ? <>Temps valorisé au taux horaire de la ferme ({formatEuros(eurosEnCentimes(c.tauxHoraire!))} / h), le même pour toute l’équipe.</>
                : <>Taux horaire non renseigné : la marge après temps est non calculable. Le tableau montre la marge hors temps.</>}</Hypothese>
              <Hypothese>« €/heure » = marge hors temps ÷ heures passées sur la culture : ce que chaque heure a rapporté, à comparer au taux horaire.</Hypothese>
              <Hypothese>Marge au m² : sur la surface cumulée des plantations de la culture dans la saison, sans tenir compte de leur durée.</Hypothese>
              <Hypothese>CA réel : seules les ventes détaillées par culture comptent. {s.ca_non_rattache > 0 ? `${formatEuros(s.ca_non_rattache)} de ventes sans détail (bouquets mélangés, ventes saisies d’un bloc) ne sont attribués à aucune culture : les marges par culture sont donc sous-estimées d’autant.` : 'Toutes les ventes de la saison sont détaillées.'}</Hypothese>
              <Hypothese>Une dépense ou un temps compte dans la saison choisie à la saisie (saison active), même si la culture déborde sur l’année suivante.</Hypothese>
              {s.plantations_ignorees.length > 0 && <Hypothese>{s.plantations_ignorees.length} plantation(s) sans dates complètes, exclues de la surface × durée.</Hypothese>}
              {s.repartition_impossible && <Hypothese className="text-warning">{s.repartition_impossible}.</Hypothese>}
            </CardContent>
          </Card>
        </section>
      )}

      {!c.loading && !c.error && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <section aria-labelledby="titre-journal">
            <h2 id="titre-journal" className="mb-3 text-xl">Journal</h2>
            <Journal costs={c.costs} temps={c.timeEntries} nomCulture={nomCulture} nomPlanche={nomPlanche} nomPersonne={nomPersonne}
              onDeleteCost={c.deleteCost} onDeleteTime={c.deleteTime} />
          </section>
          <section aria-labelledby="titre-repartition" className="space-y-4">
            <h2 id="titre-repartition" className="text-xl">Répartition</h2>
            <Card>
              <CardHeader title="Dépenses par catégorie" />
              <CardContent>
                {categories === null ? <p className="text-sm text-danger">Non calculable : une dépense est illisible.</p> : categories.length === 0 ? <p className="text-sm text-fg-muted">Aucune dépense.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {categories.map(x => (
                      <li key={x.categorie} className="flex justify-between gap-2"><span className="text-fg-muted">{x.libelle}</span><span className="num font-medium">{formatEuros(x.total)}</span></li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Temps par travail" />
              <CardContent>
                {travaux === null ? <p className="text-sm text-danger">Non calculable : un temps est illisible.</p> : travaux.length === 0 ? <p className="text-sm text-fg-muted">Aucun temps saisi.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {travaux.map(x => (
                      <li key={x.kind} className="flex justify-between gap-2">
                        <span className="text-fg-muted">{x.libelle}</span>
                        <span className="num font-medium">{formatDuree(x.minutes)}{x.valorise.valeur !== null && <span className="ml-2 text-xs font-normal text-fg-subtle">{eurosCompact(x.valorise.valeur)}</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  )
}
