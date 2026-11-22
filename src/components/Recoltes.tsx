'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, Flower, Scissors, Trash2, TrendingDown } from 'lucide-react'
import { formatDateFR, getPlantingStatus } from '@/lib/types'
import type { PlantingFull, Harvest } from '@/lib/types'
import {
  Badge, Button, Card, CardContent, CardHeader, EmptyState, Field, Input, NumberStepper, PageHeader, QualityBadge,
  SearchInput, Segmented, Select, SortHeader, Stat, TableContainer, Tabs, useConfirm, useSort, useSorted,
} from '@/components/ui'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'
import { LIBELLES_RAISONS, cleMois, cleSemaine, type Loss, type LossReason } from '@/lib/domain'
import { aujourdhuiParis, useReel, type ReelCtx } from '@/hooks/useReel'
import { ChoixRaison, CumulPlantation } from '@/components/reel/SaisieParts'
import { fmtPct, fmtTiges } from '@/components/reel/commun'
import { fileHorsLigne, uuidClient, type EntreeFile } from '@/lib/offline'
import { useApresEnvoi, useHorsLigne } from '@/components/offline/useHorsLigne'
import { BandeauHorsLigne } from '@/components/offline/IndicateurHorsLigne'
import { SaisiesLocales, type DescriptionSaisie } from '@/components/offline/SaisiesLocales'

type SortKey = 'date' | 'culture' | 'tiges' | 'quality'
type Mode = 'recolte' | 'perte'
type Histo = 'recoltes' | 'pertes'

const tonRaison: Record<LossReason, 'amber' | 'red' | 'blue' | 'violet' | 'rose' | 'neutral'> = {
  invendu: 'amber', abime: 'rose', meteo: 'blue', ravageur: 'violet', maladie: 'red', autre: 'neutral',
}

export default function Recoltes({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
  const reel = useReel(ctx as ReelCtx)
  const aujourdhui = aujourdhuiParis()
  const [mode, setMode] = useState<Mode>('recolte')
  const [histo, setHisto] = useState<Histo>('recoltes')
  const [date, setDate] = useState(aujourdhui)
  const [plantingId, setPlantingId] = useState('')
  const [tiges, setTiges] = useState('')
  const [quality, setQuality] = useState('A')
  const [raison, setRaison] = useState<LossReason | ''>('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)
  const [search, setSearch] = useState('')
  const sort = useSort<SortKey>('date', 'desc')
  const formRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  // File hors ligne : saisies posées sur le téléphone, envoyées au retour du réseau.
  const userId: string | null = ctx.user?.id ?? null
  const horsLigne = useHorsLigne(userId)
  const rechargerSaison = async () => {
    const f = ctx.refreshSeason ?? ctx.reload
    if (typeof f === 'function') await f()
  }
  // Pertes : useReel recharge déjà quand les récoltes changent, mais une
  // synchro de pertes seules ne touche pas aux récoltes.
  useApresEnvoi(tables => { if (tables.has('losses')) reel.reload() })

  const plantings: PlantingFull[] = ctx.plantings || []
  const harvests: Harvest[] = ctx.harvests || []
  const losses: Loss[] = reel.losses

  // Cumuls à l'heure de Paris (semaine ISO, mois civil)
  const semaine = cleSemaine(aujourdhui)
  const mois = cleMois(aujourdhui)
  const totalSaison = harvests.reduce((s, h) => s + h.tiges, 0)
  const totalWeek = harvests.filter(h => cleSemaine(h.date) === semaine).reduce((s, h) => s + h.tiges, 0)
  const totalMonth = harvests.filter(h => cleMois(h.date) === mois).reduce((s, h) => s + h.tiges, 0)
  const totalPertes = losses.reduce((s, l) => s + l.tiges, 0)

  const plantingMap = useMemo(() => Object.fromEntries(plantings.map(p => [p.id, p])), [plantings])
  const actualMap = useMemo(() => new Map(reel.actuals.map(a => [a.planting_id, a])), [reel.actuals])
  const cultureNom = useMemo(() => new Map<string, string>((ctx.catalog || []).map((c: any) => [c.id, c.name])), [ctx.catalog])

  // Choix groupés par jardin
  const byGarden = useMemo(() => {
    const m = new Map<string, PlantingFull[]>()
    for (const p of plantings) {
      if (!m.has(p.garden_name)) m.set(p.garden_name, [])
      m.get(p.garden_name)!.push(p)
    }
    return Array.from(m.entries())
  }, [plantings])

  useIntent('new-harvest', () => {
    setMode('recolte')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    selectRef.current?.focus({ preventScroll: true })
  })

  const n = Number(tiges)
  const tigesValides = tiges.trim() !== '' && Number.isInteger(n) && n > 0

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!plantingId || !tigesValides || (mode === 'perte' && !raison)) return
    const seasonId: string | undefined = ctx.activeSeason?.id
    if (!seasonId) { toast.error('Aucune saison active'); return }
    setLoading(true)
    const p = plantingMap[plantingId]
    const lieu = p ? `${p.culture_name} — ${p.garden_name} ${p.planche_name}` : undefined
    // Identifiant généré ici : un renvoi de la même saisie ne peut pas doublonner.
    const id = uuidClient()
    const note = notes.trim() || null
    const estRecolte = mode === 'recolte'
    const r = estRecolte
      ? await fileHorsLigne().enregistrer('harvests', { id, planting_id: plantingId, season_id: seasonId, date, tiges: n, quality, notes: note }, userId)
      : await fileHorsLigne().enregistrer('losses', {
          id, season_id: seasonId, planting_id: plantingId, culture_id: p?.culture_id ?? null,
          date, tiges: n, reason: raison as LossReason, notes: note,
        }, userId)
    setLoading(false)
    if (r.issue === 'rejet' || r.issue === 'echec') {
      console.error(`[récoltes] ${estRecolte ? 'récolte' : 'perte'} non enregistrée`, r.message)
      toast.error(estRecolte ? 'La récolte n’a pas été enregistrée' : 'La perte n’a pas été enregistrée', { description: r.message })
      return
    }
    const quoi = estRecolte ? `${fmtTiges(n)} tiges` : `${fmtTiges(n)} tiges perdues`
    const desc = estRecolte ? lieu : `${LIBELLES_RAISONS[raison as LossReason]} · ${lieu ?? ''}`
    if (r.issue === 'en_file') {
      toast.info('Enregistrée sur le téléphone, envoi au retour du réseau', { description: `${quoi} · ${desc ?? ''}` })
    } else {
      toast.success(`${quoi} enregistrées`, { description: desc })
      if (estRecolte) rechargerSaison().catch(e => console.error('[récoltes] rechargement', e))
      else reel.reload()
    }
    if (!estRecolte) { setHisto('pertes'); setRaison('') }
    setTiges('')
    setNotes('')
    setTried(false)
  }

  const removeHarvest = async (h: Harvest) => {
    const p = plantingMap[h.planting_id]
    const ok = await confirm({
      title: 'Supprimer cette récolte ?',
      description: `${h.tiges} tiges de ${p?.culture_name || 'culture inconnue'} du ${formatDateFR(h.date)}.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    await ctx.deleteHarvest(h.id)
    toast.success('Récolte supprimée')
  }

  const removeLoss = async (l: Loss) => {
    const ok = await confirm({
      title: 'Supprimer cette perte ?',
      description: `${l.tiges} tiges (${LIBELLES_RAISONS[l.reason]}) du ${formatDateFR(l.date)}.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    if (await reel.deleteLoss(l.id)) toast.success('Perte supprimée')
  }

  const nomPerte = (l: Loss) => {
    const p = l.planting_id ? plantingMap[l.planting_id] : undefined
    return {
      culture: p?.culture_name ?? (l.culture_id ? cultureNom.get(l.culture_id) : undefined) ?? '—',
      lieu: p ? `${p.garden_name} · ${p.planche_name}` : 'Sans plantation',
    }
  }

  const q = search.trim().toLowerCase()
  const rows = useMemo(() => harvests.filter(h => {
    if (!q) return true
    const p = plantingMap[h.planting_id]
    return [p?.culture_name, p?.garden_name, p?.planche_name, h.notes, h.quality].some(x => (x || '').toLowerCase().includes(q))
  }), [harvests, q, plantingMap])
  const getter = useMemo(() => (h: Harvest) => {
    if (sort.key === 'culture') return plantingMap[h.planting_id]?.culture_name || ''
    if (sort.key === 'tiges') return h.tiges
    if (sort.key === 'quality') return h.quality
    return h.date
  }, [sort.key, plantingMap])
  const sorted = useSorted(rows, getter, sort.dir)

  const lossRows = useMemo(() => losses.filter(l => {
    if (!q) return true
    const nm = nomPerte(l)
    return [nm.culture, nm.lieu, l.notes, LIBELLES_RAISONS[l.reason]].some(x => (x || '').toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [losses, q, plantingMap, cultureNom])
  const lossGetter = useMemo(() => (l: Loss) => {
    if (sort.key === 'culture') return nomPerte(l).culture
    if (sort.key === 'tiges') return l.tiges
    if (sort.key === 'quality') return LIBELLES_RAISONS[l.reason]
    return l.date
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort.key, plantingMap, cultureNom])
  const lossSorted = useSorted(lossRows, lossGetter, sort.dir)

  // Saisies encore sur le téléphone, pour l'onglet affiché.
  const locales = horsLigne.entrees.filter(e => e.table === (histo === 'recoltes' ? 'harvests' : 'losses'))
  const decrireLocale = (e: EntreeFile): DescriptionSaisie => {
    const l = e.ligne as any
    const pl = l.planting_id ? plantingMap[l.planting_id] : undefined
    return {
      titre: pl?.culture_name ?? (l.culture_id ? cultureNom.get(l.culture_id) : undefined) ?? '—',
      sousTitre: `${formatDateFR(l.date)} · ${pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}`,
      notes: l.notes,
      tiges: l.tiges,
      extra: e.table === 'harvests' ? <QualityBadge q={l.quality} /> : <Badge tone={tonRaison[l.reason as LossReason]}>{LIBELLES_RAISONS[l.reason as LossReason]}</Badge>,
    }
  }
  const supprimerLocale = async (e: EntreeFile) => {
    const rejetee = e.etat === 'rejetee'
    const ok = await confirm({
      title: rejetee ? 'Supprimer cette saisie refusée ?' : 'Supprimer cette saisie en attente ?',
      description: rejetee
        ? 'Elle a été refusée par la base et ne sera jamais envoyée. La supprimer l’efface du téléphone.'
        : 'Elle n’a pas encore été envoyée et ne le sera pas. Si un envoi était déjà en route, la saisie peut apparaître dans l’historique : supprimez-la alors là.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    try {
      await fileHorsLigne().supprimer(e.id)
      toast.success('Saisie supprimée du téléphone')
    } catch (err) {
      console.error('[récoltes] suppression de la saisie locale', err)
      toast.error('Suppression impossible', { description: err instanceof Error ? err.message : String(err) })
    }
  }
  const reessayerLocale = async (e: EntreeFile) => {
    const b = await fileHorsLigne().reessayer(e.id, userId)
    if (b.rejetees > 0) toast.error('Toujours refusée par la base')
  }

  const selected = plantingId ? plantingMap[plantingId] : undefined
  const estPerte = mode === 'perte'

  return (
    <div>
      <PageHeader title="Récoltes" description="Saisie au champ des tiges coupées et des pertes" image={photos.bouquetChampetre} />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Cette semaine" value={fmtTiges(totalWeek)} sub="tiges" icon={<CalendarDays />} />
        <Stat label="Ce mois" value={fmtTiges(totalMonth)} sub="tiges" />
        <Stat label="Total saison" value={fmtTiges(totalSaison)} sub="tiges récoltées" icon={<Flower />} />
        <Stat label="Pertes saison" value={fmtTiges(totalPertes)} icon={<TrendingDown />}
          sub={`tiges, ${fmtPct(totalSaison > 0 ? totalPertes / totalSaison : null)} des récoltes`} />
      </div>

      <BandeauHorsLigne etat={horsLigne} className="mb-4" />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:items-start">
        {/* Formulaire — pensé pour le téléphone, au pouce */}
        <Card className="scroll-mt-24 xl:sticky xl:top-[5.5rem]" ref={formRef}>
          <CardHeader title={estPerte ? 'Nouvelle perte' : 'Nouvelle récolte'}
            icon={estPerte ? <TrendingDown className="h-4 w-4" /> : <Scissors className="h-4 w-4" />} />
          <CardContent>
            <Segmented label="Type de saisie" size="lg" value={mode} onChange={m => { setMode(m); setTried(false) }} className="mb-4"
              options={[
                { value: 'recolte', label: 'Récolte', icon: <Scissors className="h-4 w-4" aria-hidden /> },
                { value: 'perte', label: 'Perte', icon: <TrendingDown className="h-4 w-4" aria-hidden /> },
              ]} />
            {/* noValidate : le pas du stepper (10 tiges, 5 pour une perte) n'est qu'un
                raccourci des boutons −/+. Sans lui, le navigateur refusait « 25 tiges »
                (« valeurs valides : 20 et 30 »). La validation est faite par `submit`. */}
            <form onSubmit={submit} noValidate className="space-y-4">
              <Field label="Culture / planche" error={tried && !plantingId ? (estPerte ? 'Choisissez la culture concernée.' : 'Choisissez la culture récoltée.') : undefined}>
                <Select ref={selectRef} className="h-12 text-base sm:h-11 sm:text-sm" value={plantingId} onChange={e => setPlantingId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {byGarden.map(([garden, list]) => (
                    <optgroup key={garden} label={garden}>
                      {list.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.culture_name} — {p.planche_name}{getPlantingStatus(p) === 'En récolte' ? ' · en récolte' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              {selected && <CumulPlantation planting={selected} actual={actualMap.get(selected.id)} aujourdhui={aujourdhui} />}
              <Field label={estPerte ? 'Tiges perdues' : 'Tiges récoltées'}
                error={tried && !tigesValides ? 'Indiquez un nombre entier de tiges, supérieur à zéro.' : undefined}>
                <NumberStepper label="le nombre de tiges" value={tiges} onChange={setTiges} step={estPerte ? 5 : 10} min={0} placeholder="0" />
              </Field>
              {estPerte ? (
                <>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-fg-muted">Raison</p>
                    <ChoixRaison value={raison} onChange={setRaison} invalide={tried && !raison} />
                    {tried && !raison && <p className="mt-1.5 text-xs text-danger" role="alert">Choisissez la raison de la perte.</p>}
                  </div>
                  <Field label="Date">
                    <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </Field>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date">
                    <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </Field>
                  <div>
                    <p id="quality-label" className="mb-1.5 text-xs font-medium text-fg-muted">Qualité</p>
                    <Segmented label="Qualité" size="lg" value={quality} onChange={setQuality}
                      options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }]} />
                  </div>
                </div>
              )}
              <Field label="Notes">
                <Input className="h-11" value={notes} onChange={e => setNotes(e.target.value)} placeholder={estPerte ? 'Ex. grêle de la nuit' : 'Optionnel'} />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                {estPerte ? 'Enregistrer la perte' : 'Enregistrer la récolte'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Historique */}
        <section aria-labelledby="hist-title">
          <h2 id="hist-title" className="sr-only">Historique</h2>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Tabs label="Historique" value={histo} onChange={setHisto}
              options={[
                { value: 'recoltes', label: <>Récoltes <span className="num font-normal text-fg-subtle">· {harvests.length}</span></> },
                { value: 'pertes', label: <>Pertes <span className="num font-normal text-fg-subtle">· {losses.length}</span></> },
              ]} />
            <SearchInput value={search} onChange={setSearch} placeholder="Culture, jardin, note…" className="sm:w-72"
              label={histo === 'recoltes' ? 'Rechercher une récolte' : 'Rechercher une perte'} />
          </div>

          <SaisiesLocales entrees={locales} decrire={decrireLocale} onSupprimer={supprimerLocale} onReessayer={reessayerLocale} />

          {histo === 'recoltes' ? (
            harvests.length === 0 ? (
              <Card><EmptyState image={photos.bouquetChampetre} title="Aucune récolte enregistrée"
                description="Vos premières tiges coupées apparaîtront ici, avec les cumuls de la semaine et du mois."
                action={<Button onClick={() => { setMode('recolte'); selectRef.current?.focus() }}>Saisir une récolte</Button>} /></Card>
            ) : sorted.length === 0 ? (
              <Card><EmptyState compact title="Aucun résultat" description={`Aucune récolte ne correspond à « ${search} ».`} /></Card>
            ) : (
              <>
                <ul className="space-y-2 md:hidden">
                  {sorted.map(h => {
                    const pl = plantingMap[h.planting_id]
                    return (
                      <li key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs">
                        <div className="num flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-soft text-primary">
                          <span className="text-base font-semibold leading-none">{h.tiges}</span>
                          <span className="text-[0.65rem]">tiges</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-fg">{pl?.culture_name || '—'}</p>
                          <p className="truncate text-xs text-fg-muted">{formatDateFR(h.date)} · {pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}</p>
                          {h.notes && <p className="truncate text-xs text-fg-subtle">{h.notes}</p>}
                        </div>
                        <QualityBadge q={h.quality} />
                        <Button variant="ghost" size="icon" onClick={() => removeHarvest(h)} aria-label="Supprimer cette récolte"><Trash2 className="h-4 w-4" /></Button>
                      </li>
                    )
                  })}
                </ul>
                <TableContainer className="hidden md:block" label="Historique des récoltes">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <SortHeader label="Date" active={sort.key === 'date'} dir={sort.dir} onClick={() => sort.toggle('date')} />
                        <SortHeader label="Culture" active={sort.key === 'culture'} dir={sort.dir} onClick={() => sort.toggle('culture')} />
                        <SortHeader label="Tiges" align="right" className="!text-right" active={sort.key === 'tiges'} dir={sort.dir} onClick={() => sort.toggle('tiges')} />
                        <SortHeader label="Qualité" active={sort.key === 'quality'} dir={sort.dir} onClick={() => sort.toggle('quality')} />
                        <th>Notes</th>
                        <th><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(h => {
                        const pl = plantingMap[h.planting_id]
                        return (
                          <tr key={h.id}>
                            <td className="whitespace-nowrap text-fg-muted">{formatDateFR(h.date)}</td>
                            <td>
                              <div className="font-medium">{pl?.culture_name || '—'}</div>
                              <div className="whitespace-nowrap text-xs text-fg-muted">{pl ? `${pl.garden_name} · ${pl.planche_name}` : '—'}</div>
                            </td>
                            <td className="num text-right font-semibold">{h.tiges}</td>
                            <td><QualityBadge q={h.quality} /></td>
                            <td className="max-w-[14rem] truncate text-fg-muted" title={h.notes || ''}>{h.notes || '—'}</td>
                            <td className="w-px text-right">
                              <Button variant="ghost" size="icon-sm" onClick={() => removeHarvest(h)} aria-label={`Supprimer la récolte du ${formatDateFR(h.date)}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableContainer>
              </>
            )
          ) : reel.error ? (
            <Card><EmptyState compact title="Pertes illisibles" description={reel.error} /></Card>
          ) : losses.length === 0 ? (
            <Card><EmptyState compact title="Aucune perte enregistrée"
              description="Invendus, tiges abîmées, dégâts de météo ou de ravageurs : les noter permet de suivre le taux de perte."
              action={<Button onClick={() => { setMode('perte'); selectRef.current?.focus() }}>Saisir une perte</Button>} /></Card>
          ) : lossSorted.length === 0 ? (
            <Card><EmptyState compact title="Aucun résultat" description={`Aucune perte ne correspond à « ${search} ».`} /></Card>
          ) : (
            <>
              <ul className="space-y-2 md:hidden">
                {lossSorted.map(l => {
                  const nm = nomPerte(l)
                  return (
                    <li key={l.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs">
                      <div className="num flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 text-fg">
                        <span className="text-base font-semibold leading-none">{l.tiges}</span>
                        <span className="text-[0.65rem] text-fg-muted">tiges</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-fg">{nm.culture}</p>
                        <p className="truncate text-xs text-fg-muted">{formatDateFR(l.date)} · {nm.lieu}</p>
                        {l.notes && <p className="truncate text-xs text-fg-subtle">{l.notes}</p>}
                      </div>
                      <Badge tone={tonRaison[l.reason]}>{LIBELLES_RAISONS[l.reason]}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => removeLoss(l)} aria-label="Supprimer cette perte"><Trash2 className="h-4 w-4" /></Button>
                    </li>
                  )
                })}
              </ul>
              <TableContainer className="hidden md:block" label="Historique des pertes">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortHeader label="Date" active={sort.key === 'date'} dir={sort.dir} onClick={() => sort.toggle('date')} />
                      <SortHeader label="Culture" active={sort.key === 'culture'} dir={sort.dir} onClick={() => sort.toggle('culture')} />
                      <SortHeader label="Tiges" align="right" className="!text-right" active={sort.key === 'tiges'} dir={sort.dir} onClick={() => sort.toggle('tiges')} />
                      <SortHeader label="Raison" active={sort.key === 'quality'} dir={sort.dir} onClick={() => sort.toggle('quality')} />
                      <th>Notes</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lossSorted.map(l => {
                      const nm = nomPerte(l)
                      return (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap text-fg-muted">{formatDateFR(l.date)}</td>
                          <td>
                            <div className="font-medium">{nm.culture}</div>
                            <div className="whitespace-nowrap text-xs text-fg-muted">{nm.lieu}</div>
                          </td>
                          <td className="num text-right font-semibold">{l.tiges}</td>
                          <td><Badge tone={tonRaison[l.reason]}>{LIBELLES_RAISONS[l.reason]}</Badge></td>
                          <td className="max-w-[14rem] truncate text-fg-muted" title={l.notes || ''}>{l.notes || '—'}</td>
                          <td className="w-px text-right">
                            <Button variant="ghost" size="icon-sm" onClick={() => removeLoss(l)} aria-label={`Supprimer la perte du ${formatDateFR(l.date)}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableContainer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
