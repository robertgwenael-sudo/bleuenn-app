'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, Coins, Flower, Scale, TrendingDown } from 'lucide-react'
import {
  Card, CardContent, CardHeader, EmptyState, PageHeader, Progress, Skeleton, Stat, Tabs,
} from '@/components/ui'
import {
  CULTURE_NON_ATTRIBUEE, ajouterJours, caPrevuPlantation, estDateValide, formatEuros, lundiDeSemaine, pertesParRaison,
  reelParCulture, reelParJardin, reelParSemaine, repartitionPrevueValorisee, semaineIso, totalVente,
  type Centimes, type PlantingReel,
} from '@/lib/domain'
import { aujourdhuiParis, useReel, type ReelCtx } from '@/hooks/useReel'
import { PrevuReelChart, type PointSemaine } from '@/components/reel/PrevuReelChart'
import { TableauBilan, type LigneBilan } from '@/components/reel/TableauBilan'
import { PertesParRaisonBarres } from '@/components/reel/PertesParRaison'
import {
  CaReel, Hypothese, REPARTITION_PREVU, SEUIL_AVANCE, SEUIL_RETARD, StatutBadge, eurosCompact, fmtPct, fmtTiges,
} from '@/components/reel/commun'
import { photos } from '@/lib/images'

type Vue = 'tiges' | 'ca'
type Groupe = 'culture' | 'jardin'

/** Une plantation n'entre dans le prévu que si ses dates de récolte sont connues. */
const plantationCalculable = (p: any): p is PlantingReel =>
  estDateValide(p?.date_recolte) && estDateValide(p?.date_fin) && Number.isFinite(Number(p?.tiges_estimees))

export default function Reel({ ctx }: { ctx: any }) {
  const c = ctx as ReelCtx
  const r = useReel(c)
  const [vue, setVue] = useState<Vue>('tiges')
  const [groupe, setGroupe] = useState<Groupe>('culture')
  const aujourdhui = aujourdhuiParis()
  const lundiCourant = lundiDeSemaine(aujourdhui)

  const calc = useMemo(() => {
    try {
      const tous: any[] = c.plantings || []
      const plantings = tous.filter(plantationCalculable)
      const ecartees = tous.length - plantings.length

      // Prévu « à date » : semaines dont le lundi est passé, semaine en cours incluse.
      const aDate = new Map<string, { tiges: number; ca: Centimes }>()
      for (const p of plantings) {
        let tiges = 0, ca = 0
        // CA réparti comme les tiges, sur le revenu estimé (somme exacte, 016)
        for (const s of repartitionPrevueValorisee(p, caPrevuPlantation(p))) {
          if (s.lundi > lundiCourant) continue
          tiges += s.tiges
          ca += s.centimes
        }
        aDate.set(p.id, { tiges, ca })
      }
      const somme = (filtre: (p: PlantingReel) => boolean) => {
        let tiges = 0, ca = 0
        for (const p of plantings) if (filtre(p)) { const a = aDate.get(p.id)!; tiges += a.tiges; ca += a.ca }
        return { tiges, ca }
      }

      // Pertes saisies sur une culture sans plantation : comptées au niveau culture.
      const pertesCultureSeule = new Map<string, number>()
      for (const l of r.losses) {
        if (l.planting_id || !l.culture_id) continue
        pertesCultureSeule.set(l.culture_id, (pertesCultureSeule.get(l.culture_id) ?? 0) + l.tiges)
      }

      // Sans aucune ligne de vente, le CA d'une culture n'est pas « 0 € » : il est inconnu.
      const ventile = r.saleLines.length > 0
      const cultures: LigneBilan[] = reelParCulture(plantings, r.actuals, r.ventes).map(g => {
        const a = somme(p => p.culture_id === g.cle)
        const horsPlan = g.nb_plantations === 0 || g.cle === CULTURE_NON_ATTRIBUEE
        return {
          cle: g.cle, libelle: g.libelle,
          sousTitre: g.nb_plantations ? `${g.nb_plantations} plantation${g.nb_plantations > 1 ? 's' : ''}` : undefined,
          prevu_date: a.tiges, prevu_saison: g.tiges_estimees,
          recolte: g.tiges_recoltees, perdu: g.tiges_perdues + (pertesCultureSeule.get(g.cle) ?? 0),
          ca_prevu_date: a.ca, ca_reel: ventile || horsPlan ? g.ca_reel_centimes : null,
          horsPlan,
        }
      })
      const jardins: LigneBilan[] = reelParJardin(plantings, r.actuals).map(g => {
        const a = somme(p => p.garden_id === g.cle)
        return {
          cle: g.cle, libelle: g.libelle,
          sousTitre: `${g.nb_plantations} plantation${g.nb_plantations > 1 ? 's' : ''}`,
          prevu_date: a.tiges, prevu_saison: g.tiges_estimees, recolte: g.tiges_recoltees, perdu: g.tiges_perdues,
          ca_prevu_date: a.ca, ca_reel: null,
        }
      })

      // Semaine par semaine, sans trou entre la première et la dernière semaine.
      const semaines = reelParSemaine({ plantings, recoltes: c.harvests || [], pertes: r.losses, ventes: r.ventes })
      const parLundi = new Map(semaines.map(s => [s.lundi, s]))
      const tiges: PointSemaine[] = []
      const ca: PointSemaine[] = []
      if (semaines.length) {
        for (let l = semaines[0].lundi; l <= semaines[semaines.length - 1].lundi; l = ajouterJours(l, 7)) {
          const s = parLundi.get(l)
          const futur = l > lundiCourant
          const semaine = semaineIso(l).semaine
          tiges.push({ semaine, lundi: l, prevu: s?.tiges_prevues ?? 0, reel: futur ? null : (s?.tiges_recoltees ?? 0) })
          ca.push({ semaine, lundi: l, prevu: s?.ca_prevu_centimes ?? 0, reel: futur ? null : (s?.ca_reel_centimes ?? 0) })
        }
      }

      const recolte = (c.harvests || []).reduce((s: number, h: any) => s + h.tiges, 0)
      const perdu = r.losses.reduce((s, l) => s + l.tiges, 0)
      const total = somme(() => true)
      return {
        ecartees, cultures, jardins, tiges, ca,
        prevuSaison: plantings.reduce((s, p) => s + Math.round(Number(p.tiges_estimees)), 0),
        caPrevuSaison: plantings.reduce((s, p) => s + caPrevuPlantation(p), 0),
        prevuDate: total.tiges, caPrevuDate: total.ca,
        recolte, perdu,
        caReel: r.ventes.reduce((s, v) => s + totalVente(v), 0),
        raisons: pertesParRaison(r.losses, recolte),
        erreur: null as string | null,
      }
    } catch (e) {
      console.error('[réel] calcul impossible', e)
      return { erreur: e instanceof Error ? e.message : String(e) } as const
    }
  }, [c.plantings, c.harvests, r.actuals, r.losses, r.ventes, r.saleLines, lundiCourant])

  const header = (
    <>
      <PageHeader title="Prévu / réel" image={photos.champTournesols}
        description={`${c.activeSeason?.name ?? 'Saison'} · récoltes, pertes et chiffre d’affaires face au plan de culture`} />
    </>
  )

  if (r.loading) {
    return (
      <div aria-busy="true">
        {header}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    )
  }

  if (r.error || calc.erreur) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Prévu / réel non calculable"
            description={r.error ?? calc.erreur ?? ''} />
        </Card>
      </div>
    )
  }
  const k = calc as Exclude<typeof calc, { erreur: string }>
  const tauxReal = k.prevuDate > 0 ? k.recolte / k.prevuDate : null
  const tauxPerte = k.recolte > 0 ? k.perdu / k.recolte : null

  if (!(c.plantings || []).length) {
    return (
      <div>
        {header}
        <Card><EmptyState image={photos.champTournesols} title="Aucune plantation cette saison"
          description="Le prévu se calcule à partir du plan de culture : ajoutez des plantations pour comparer au réel." /></Card>
      </div>
    )
  }

  return (
    <div>
      {header}

      {/* KPI */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Tiges récoltées" icon={<Flower />} value={fmtTiges(k.recolte)}
          sub={<>contre <span className="num">{fmtTiges(k.prevuDate)}</span> prévues à date · <span className="num">{fmtTiges(k.prevuSaison)}</span> sur la saison</>} />
        <Stat label="Taux de réalisation" icon={<Scale />} value={fmtPct(tauxReal)}
          sub={<StatutBadge taux={tauxReal} />}>
          {tauxReal !== null && <Progress className="mt-3" value={tauxReal * 100} tone={tauxReal < SEUIL_RETARD ? 'warning' : 'primary'} label="Taux de réalisation" />}
        </Stat>
        <Stat label="Tiges perdues" icon={<TrendingDown />} value={fmtTiges(k.perdu)}
          sub={<>taux de perte <span className="num font-semibold text-fg-muted">{fmtPct(tauxPerte)}</span> des tiges récoltées</>} />
        <Stat label="CA réel" icon={<Coins />} value={<CaReel c={k.caReel} />}
          sub={<>contre <span className="num">{formatEuros(k.caPrevuDate)}</span> prévus à date · <span className="num">{formatEuros(k.caPrevuSaison)}</span> sur la saison</>} />
      </div>
      <Hypothese className="mb-6">
        {REPARTITION_PREVU} Statut : en avance au-delà de {fmtPct(SEUIL_AVANCE)} du prévu à date, en retard sous {fmtPct(SEUIL_RETARD)}.
        {k.ecartees > 0 && ` ${k.ecartees} plantation${k.ecartees > 1 ? 's' : ''} sans dates de récolte ne compte${k.ecartees > 1 ? 'nt' : ''} pas dans le prévu.`}
      </Hypothese>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Semaine par semaine"
            description={vue === 'tiges' ? 'Tiges récoltées contre tiges prévues' : 'CA des ventes contre CA prévu (tiges prévues × prix à la tige)'}
            action={<Tabs label="Mesure" value={vue} onChange={setVue}
              options={[{ value: 'tiges', label: 'Tiges' }, { value: 'ca', label: 'CA' }]} />} />
          <CardContent>
            {vue === 'tiges'
              ? <PrevuReelChart data={k.tiges} format={v => `${fmtTiges(v)} tiges`} compact={v => fmtTiges(v)} libelleReel="Récolté"
                  semaineCourante={lundiCourant} ariaLabel="Tiges récoltées et prévues par semaine" />
              : <PrevuReelChart data={k.ca} format={v => formatEuros(v)} compact={eurosCompact} libelleReel="CA réel"
                  semaineCourante={lundiCourant} ariaLabel="Chiffre d’affaires réel et prévu par semaine" />}
            <p className="mt-2 text-xs text-fg-subtle">Ligne pointillée verticale : semaine en cours. Pas de réel affiché pour les semaines à venir.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Pertes par raison" icon={<TrendingDown className="h-4 w-4" />}
            description={`${fmtTiges(k.perdu)} tiges perdues · ${fmtPct(tauxPerte)} des récoltes`} />
          <CardContent>
            {k.perdu === 0
              ? <EmptyState compact title="Aucune perte saisie" description="Les pertes se saisissent depuis l’écran Récoltes." />
              : <PertesParRaisonBarres data={k.raisons} />}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="detail-title">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="detail-title" className="font-sans text-base font-semibold">Détail</h2>
          <Tabs label="Regrouper par" value={groupe} onChange={setGroupe}
            options={[{ value: 'culture', label: 'Par culture' }, { value: 'jardin', label: 'Par jardin' }]} />
        </div>
        {groupe === 'culture'
          ? <TableauBilan lignes={k.cultures} titreColonne="Culture" label="Prévu et réel par culture" />
          : <TableauBilan lignes={k.jardins} titreColonne="Jardin" label="Prévu et réel par jardin" />}
        {groupe === 'jardin' && (
          <Hypothese className="mt-2">CA réel non calculable par jardin : une vente est rattachée à une culture, pas à une planche.</Hypothese>
        )}
        {groupe === 'culture' && k.cultures.some(l => l.cle === CULTURE_NON_ATTRIBUEE) && (
          <Hypothese className="mt-2">Les ventes saisies sans détail par culture sont regroupées dans « Ventes non rattachées à une culture » : le CA total reste juste, le détail par culture est incomplet.</Hypothese>
        )}
      </section>
    </div>
  )
}
