'use client'
// ============================================================
// « Quoi semer » : le bloc « Gestion de la production et du rendement »
// du tableur de Marine, sur toutes les plantations de la ferme.
// m² → plants (rangs, espacement) → plants + pertes → graines ; tiges,
// tiges nettes, revenu ; graines déjà commandées ; charge de la pépinière.
// Calculs : src/lib/domain/production.ts.
// ============================================================
import { useMemo, useState } from 'react'
import { Calculator, Flower2, PackageOpen, Settings2, Sprout, Table2, Warehouse } from 'lucide-react'
import {
  besoinsGraines, capacitePepiniere, chargePepiniere, lignesQuoiSemer, occupationsCellule, parJardin,
  type CapacitePepiniere, type PeriodeSemis,
} from '@/lib/domain/production'
import type { PlantingProduction } from '@/lib/domain'
import { fenetreGlissante } from '@/lib/domain/dates'
import { aujourdhuiParisISO } from '@/lib/types'
import { useAchats } from '@/hooks/useAchats'
import { useProduction } from '@/hooks/useProduction'
import { Button, Card, EmptyState, PageHeader, Select, Stat, Tabs } from '@/components/ui'
import { photos } from '@/lib/images'
import { TableauProduction } from './semis/TableauProduction'
import { BesoinsGrainesTable } from './semis/BesoinsGraines'
import { CapaciteCarte, ChargePepiniere } from './semis/ChargePepiniere'
import { CalculLibre } from './semis/CalculLibre'
import { ReglagesProduction } from './semis/ReglagesProduction'
import { eurosRonds, nb } from './semis/format'

type Onglet = 'plantations' | 'graines' | 'pepiniere' | 'calcul'

export default function QuoiSemer({ ctx }: { ctx: any }) {
  const prod = useProduction(ctx)
  const achats = useAchats(ctx)
  const [onglet, setOnglet] = useState<Onglet>('plantations')
  const [periode, setPeriode] = useState('glissant')
  const [jardin, setJardin] = useState('')
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const aujourdhui = aujourdhuiParisISO()

  const plantings: PlantingProduction[] = ctx.farmPlantings || ctx.plantings || []
  const seasons: { id: string; name: string }[] = ctx.seasons || []

  const p: PeriodeSemis = periode === 'glissant' ? { type: 'glissant', aujourdhui }
    : periode === 'tout' ? { type: 'tout' } : { type: 'saison', season_id: periode.slice('saison:'.length) }

  const calcul = useMemo(() => {
    try {
      const lignes = lignesQuoiSemer(plantings, p, prod.taux)
      return { lignes, erreur: null as string | null }
    } catch (e) {
      console.error('[quoi semer] calcul', e)
      return { lignes: [], erreur: e instanceof Error ? e.message : String(e) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantings, periode, aujourdhui, prod.taux])

  const lignes = useMemo(() => (jardin ? calcul.lignes.filter(l => l.planting.garden_id === jardin) : calcul.lignes), [calcul.lignes, jardin])
  const { jardins, total } = useMemo(() => parJardin(lignes), [lignes])

  const commandees = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of achats.besoins) if (b.culture_id) m.set(b.culture_id, b.horsBon + b.enBons)
    return m
  }, [achats.besoins])
  const besoins = useMemo(() => besoinsGraines(lignes, commandees), [lignes, commandees])

  const pep = useMemo(() => {
    let capacite: CapacitePepiniere | null = null
    let erreur: string | null = null
    if (prod.pepiniere.etat === 'ok') {
      try { capacite = capacitePepiniere(prod.pepiniere.tables, prod.pepiniere.plaque) } catch (e) {
        console.error('[quoi semer] capacité de la pépinière', e)
        erreur = e instanceof Error ? e.message : String(e)
      }
    }
    const trous = prod.pepiniere.etat === 'ok' ? prod.pepiniere.plaque.trous : prod.pepiniere.plaque?.trous ?? null
    const occ = occupationsCellule(calcul.lignes, trous)
    const bornes = periode === 'glissant' ? fenetreGlissante(aujourdhui) : undefined
    return { capacite, erreur, occ, semaines: chargePepiniere(occ.occupations, capacite, bornes) }
  }, [prod.pepiniere, calcul.lignes, periode, aujourdhui])
  const nbDepassements = pep.semaines.filter(s => s.depassement).length

  const saisonActive = seasons.find(s => s.id === ctx.activeSeason?.id)?.name ?? null
  const gardens: { id: string; name: string }[] = ctx.gardens || []

  return (
    <div>
      <PageHeader title="Quoi semer" image={photos.semisGodets}
        description="Du m² aux graines : plants, plants avec pertes, graines, tiges et revenu, comme dans votre tableur"
        actions={<Button variant="secondary" onClick={() => setReglagesOuverts(true)}><Settings2 className="h-4 w-4" aria-hidden />Réglages</Button>} />

      {!prod.migration015 && (
        <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
          Réglages de production indisponibles (migration 015 non appliquée) : pertes de 30 % comme dans le tableur, capacité de la pépinière non renseignée.
        </p>
      )}
      {(prod.error || calcul.erreur || pep.erreur) && (
        <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{prod.error || calcul.erreur || pep.erreur}</p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select aria-label="Période" value={periode} onChange={e => setPeriode(e.target.value)} wrapperClassName="col-span-2 sm:w-56" data-testid="periode-semis">
          <option value="glissant">12 mois glissants</option>
          {seasons.map(s => <option key={s.id} value={`saison:${s.id}`}>{s.name}</option>)}
          <option value="tout">Toutes les plantations</option>
        </Select>
        <Select aria-label="Jardin" value={jardin} onChange={e => setJardin(e.target.value)} wrapperClassName="col-span-2 sm:w-52">
          <option value="">Tous les jardins</option>
          {gardens.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <span className="col-span-2 text-xs text-fg-subtle sm:ml-auto">
          Pertes : levée {nb(prod.taux.semis)} %, champ {nb(prod.taux.champ)} %
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Graines à semer" value={nb(total.graines)} sub={`${lignes.length} plantation${lignes.length > 1 ? 's' : ''}`} icon={<Sprout />} />
        <Stat label={`Plants + ${nb(prod.taux.semis)} %`} value={nb(total.plantsAvecPertes)} sub={`${nb(total.plants)} plants en place`} icon={<Table2 />} />
        <Stat label="Tiges nettes" value={nb(total.tigesNettes)} sub={`${nb(total.tiges)} tiges brutes`} icon={<Flower2 />} />
        <Stat label="Revenu potentiel" value={eurosRonds(total.revenuCentimes)}
          sub={total.incompletes ? `${total.incompletes} ligne${total.incompletes > 1 ? 's' : ''} incomplète${total.incompletes > 1 ? 's' : ''}` : 'toutes lignes comptées'} icon={<PackageOpen />} />
      </div>

      <Tabs label="Vues" value={onglet} onChange={setOnglet} className="mb-4 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap" options={[
        { value: 'plantations', label: 'Par plantation', icon: <Table2 className="h-4 w-4" aria-hidden /> },
        { value: 'graines', label: 'Graines à commander', icon: <PackageOpen className="h-4 w-4" aria-hidden /> },
        { value: 'pepiniere', label: <>Pépinière{nbDepassements > 0 && <span className="ml-1 rounded-full bg-danger px-1.5 text-2xs text-white">{nbDepassements}</span>}</>, icon: <Warehouse className="h-4 w-4" aria-hidden /> },
        { value: 'calcul', label: 'Calcul libre', icon: <Calculator className="h-4 w-4" aria-hidden /> },
      ]} />

      {onglet === 'plantations' && (lignes.length === 0 ? (
        <Card><EmptyState image={photos.semisGodets} title="Aucune plantation sur la période"
          description="Changez de période ou ajoutez des cultures depuis Jardins & planches." /></Card>
      ) : <TableauProduction jardins={jardins} total={total} taux={prod.taux} />)}

      {onglet === 'graines' && (besoins.length === 0
        ? <Card><EmptyState image={photos.semisGodets} title="Rien à semer sur la période" /></Card>
        : <BesoinsGrainesTable besoins={besoins} saisonActive={saisonActive} />)}

      {onglet === 'pepiniere' && (
        <div className="space-y-4">
          <CapaciteCarte reglages={prod.pepiniere} capacite={pep.capacite} />
          <Card className="p-4">
            <h2 className="mb-1 text-base font-semibold">Charge par semaine</h2>
            <p className="mb-3 text-xs text-fg-muted">
              Chaque semis occupe ses mottes (plants + {nb(prod.taux.semis)} %) en plaques entières, de l’entrée en cellule à la plantation.
              Plants achetés et semis directs n’occupent rien. Jour le plus chargé de chaque semaine, toute la ferme.
            </p>
            <ChargePepiniere semaines={pep.semaines} capacite={pep.capacite} occupations={pep.occ} />
          </Card>
        </div>
      )}

      {onglet === 'calcul' && <CalculLibre catalog={ctx.catalog || []} taux={prod.taux} />}

      {reglagesOuverts && (
        <ReglagesProduction open={reglagesOuverts} onOpenChange={setReglagesOuverts} reglages={prod.reglages}
          modifiable={!!ctx.isFarmOwner} migration015={prod.migration015}
          onSave={async v => {
            const ok = await prod.enregistrer(v)
            // Les estimations stockées (trigger 015) changent avec les taux
            if (ok) await ctx.refreshSeason?.()
            return ok
          }} />
      )}
    </div>
  )
}
