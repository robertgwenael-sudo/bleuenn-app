'use client'
import { Fragment, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Coins, Receipt, Store, Tag, Trash2, Truck } from 'lucide-react'
import {
  canalDeVente, chiffreAffaires, eurosEnCentimes, formatEuros, moyenneCentimes, montantLigne, syntheseParCanal,
  syntheseParClient, tigesLigne, tigesVente, totalVente, type Sale, type SaleChannel, type SaleLine,
} from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'
import {
  Badge, Button, Card, CardContent, CardHeader, EmptyState, Field, Input, PageHeader, Progress, SearchInput, Segmented,
  Select, SortHeader, Stat, TableContainer, Tabs, useConfirm, useSort, useSorted,
} from '@/components/ui'
import { HBarChart } from '@/components/charts/HBarChart'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'
import { dejaAffichee, useCommercial } from '@/hooks/useCommercial'
import { useNumerosFactureParVente } from '@/hooks/useFactures'
import { LignesEditor, montantAffiche, useTotauxSaisie, type ContexteTva } from '@/components/commercial/LignesEditor'
import { FacturerDialog } from '@/components/commercial/FacturerDialog'
import {
  aujourdhuiParis, CANAUX, canalTone, jourLivraison, KIND_LABEL, nouvelleLigne, pluriel, libelleQuantite, type LigneSaisie,
} from '@/components/commercial/commun'

type V = Sale & { lignes: SaleLine[] }
type SortKey = 'date' | 'channel' | 'tiges' | 'total'

/** Euros arrondis à l'unité pour les graphiques ; le calcul reste en centimes. */
const eurosRonds = (c: number) => formatEuros(Math.round(c / 100) * 100).replace(/,00\s€$/, ' €')

export default function Ventes({ ctx }: { ctx: any }) {
  const com = useCommercial(ctx)
  const confirm = useConfirm()
  const catalog: CultureCatalog[] = ctx.catalog || []
  const today = aujourdhuiParis()

  const [date, setDate] = useState(today)
  const [channel, setChannel] = useState<SaleChannel>('Marché')
  const [clientId, setClientId] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()])
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [synth, setSynth] = useState<'canal' | 'client'>('canal')
  const [ouverte, setOuverte] = useState<string | null>(null)
  const sort = useSort<SortKey>('date', 'desc')
  const formRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLSelectElement>(null)
  const tva: ContexteTva = useMemo(() => ({
    taux: com.taux, assujettie: com.assujettie, channel,
    clientKind: clientId ? com.clientsParId.get(clientId)?.kind ?? null : null,
  }), [com.taux, com.assujettie, channel, clientId, com.clientsParId])
  const { ok, totaux, toutesValides } = useTotauxSaisie(lignes, tva)
  const [aFacturer, setAFacturer] = useState<V | null>(null)
  const facturees = useNumerosFactureParVente(ctx.activeSeason?.farm_id, com.sales)

  // Tant que le hook charge, on affiche les ventes du contexte (sans lignes)
  const ventes: V[] = useMemo(() => (com.loading && com.sales.length === 0
    ? (ctx.sales || []).map((v: Sale) => ({ ...v, client_id: v.client_id ?? null, order_id: v.order_id ?? null, lignes: [] }))
    : com.ventes) as V[], [com.loading, com.sales.length, com.ventes, ctx.sales])

  const nomClient = (v: V) => (v.client_id && com.clientsParId.get(v.client_id)?.name) || v.client || null

  const ca = chiffreAffaires(ventes)
  const totalTiges = ventes.reduce((s, v) => s + tigesVente(v), 0)
  const prixMoyen = moyenneCentimes(ca, totalTiges)
  const goal = eurosEnCentimes(ctx.activeSeason?.revenue_goal || 15000)
  const pct = Math.min(100, goal > 0 ? (ca / goal) * 100 : 0)

  const parCanal = useMemo(() => syntheseParCanal(ventes), [ventes])
  const parClient = useMemo(() => syntheseParClient(ventes, com.clients), [ventes, com.clients])

  useIntent('new-sale', () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    firstRef.current?.focus({ preventScroll: true })
  })

  const choisirClient = (id: string) => {
    setClientId(id)
    const c = com.clientsParId.get(id)
    if (!c) return
    try { setChannel(canalDeVente({ channel: null }, c)) } catch { /* canal non déductible : on garde le choix */ }
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!toutesValides || !date) return
    setLoading(true)
    try {
      const r = await com.createSale({ date, channel, client_id: clientId || null, notes: null }, ok)
      const nom = clientId ? com.clientsParId.get(clientId)?.name : null
      toast.success('Vente enregistrée', { description: `${channel}${nom ? ` · ${nom}` : ''} · ${pluriel(totaux.tiges, 'tige')} · ${formatEuros(r.total_centimes)}${com.assujettie ? ' HT' : ''}` })
      setLignes([nouvelleLigne()])
      setClientId('')
      setTried(false)
    } catch (err) {
      if (!dejaAffichee(err)) toast.error('Enregistrement impossible', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  const remove = async (v: V) => {
    const issue = com.orders.find(o => o.sale_id === v.id)
    const ok = await confirm({
      title: 'Supprimer cette vente ?',
      description: `${v.channel} du ${jourLivraison(v.date, today, false)} — ${formatEuros(totalVente(v))}.${issue ? ' La commande d’origine redeviendra « prête ».' : ''}`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    try {
      await com.deleteSale(v.id)
      toast.success('Vente supprimée')
    } catch (err) { if (!dejaAffichee(err)) toast.error(String(err)) }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ventes.filter(v =>
      (!filterChannel || v.channel === filterChannel) &&
      (!q || [v.cultures_sold, nomClient(v), v.channel, ...v.lignes.map(l => l.label)].some(x => (x || '').toLowerCase().includes(q))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventes, search, filterChannel, com.clients])
  const getter = useMemo(() => (v: V) =>
    sort.key === 'channel' ? v.channel : sort.key === 'tiges' ? tigesVente(v) : sort.key === 'total' ? totalVente(v) : v.date, [sort.key])
  const sorted = useSorted(rows, getter, sort.dir)

  const clientsChoix = com.clients.filter(c => !c.archived_at)

  const actionFacturer = (v: V) => (!facturees.get(v.id) && v.order_id ? (
    <Button variant="secondary" size="sm" onClick={() => setAFacturer(v)} aria-label={`Facturer la vente du ${jourLivraison(v.date, today, false)}`}>
      <Receipt className="h-4 w-4" /> Facturer
    </Button>
  ) : null)

  const detail = (v: V) => (
    v.lignes.length > 0 ? (
      <ul className="space-y-1">
        {v.lignes.map(l => (
          <li key={l.id} className="num flex items-baseline gap-3 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg">{libelleQuantite(l.unit, Number(l.quantity), l.label)}
              <span className="text-fg-subtle"> · {pluriel(tigesLigne(l), 'tige')} · {formatEuros(eurosEnCentimes(l.unit_price))} l’unité</span></span>
            <span className="font-semibold">{formatEuros(montantLigne(l))}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="num text-xs text-fg-muted">Vente saisie avant le détail en lignes : {pluriel(v.tiges, 'tige')} à {formatEuros(eurosEnCentimes(v.prix_unitaire))}.</p>
    )
  )

  return (
    <div>
      <PageHeader title="Ventes" description="Suivi des ventes par canal et par client" image={photos.boutiqueFleuriste} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={com.assujettie ? 'CA HT réel' : 'CA total réel'} value={eurosRonds(ca)} icon={<Coins />} />
        <Stat label="Tiges vendues" value={totalTiges.toLocaleString('fr-FR')} icon={<Tag />} />
        <Stat label="Prix moyen / tige" value={prixMoyen === null ? '—' : formatEuros(prixMoyen)} />
        <Stat label="Nombre de ventes" value={ventes.length} icon={<Receipt />} />
      </div>

      <Card className="mb-6 p-4 sm:p-5">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-fg-muted">Objectif CA : <strong className="num font-semibold text-fg">{eurosRonds(goal)}</strong></span>
          <span className="num font-semibold text-fg">{pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</span>
        </div>
        <Progress value={pct} label="Progression vers l’objectif de chiffre d’affaires" />
      </Card>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:items-start">
        <Card ref={formRef} className="scroll-mt-24">
          <CardHeader title="Nouvelle vente" icon={<Store className="h-4 w-4" />} />
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Canal</p>
                <Segmented label="Canal de vente" value={channel} onChange={setChannel} size="lg" className="grid grid-cols-3"
                  options={CANAUX.map(c => ({ value: c, label: c }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Client" hint="Optionnel">
                  <Select ref={firstRef} className="h-12 sm:h-11" value={clientId} onChange={e => choisirClient(e.target.value)}>
                    <option value="">Sans client</option>
                    {clientsChoix.map(c => <option key={c.id} value={c.id}>{c.name} · {KIND_LABEL[c.kind]}</option>)}
                  </Select>
                </Field>
                <Field label="Date" error={tried && !date ? 'Requise' : undefined}>
                  <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Lignes</p>
                <LignesEditor lignes={lignes} onChange={setLignes} catalog={catalog} tried={tried} compact tva={tva} />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                Enregistrer la vente · {montantAffiche(totaux, com.assujettie)}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Synthèse de la saison" description="Chiffre d’affaires réel, lignes comprises"
            action={<Tabs label="Synthèse" value={synth} onChange={setSynth} className="hidden border-b-0 sm:flex"
              options={[{ value: 'canal', label: 'Par canal' }, { value: 'client', label: 'Par client' }]} />} />
          <CardContent>
            <Segmented label="Synthèse" className="mb-4 sm:hidden" value={synth} onChange={setSynth}
              options={[{ value: 'canal', label: 'Par canal' }, { value: 'client', label: 'Par client' }]} />
            {ventes.length === 0 ? (
              <EmptyState compact icon={<Store className="h-5 w-5" />} title="Pas encore de vente" description="La synthèse se remplit à la première vente." />
            ) : synth === 'canal' ? (
              <>
                <HBarChart data={CANAUX.map(c => ({ label: c, value: parCanal.find(s => s.cle === c)?.total_centimes ?? 0 }))} format={eurosRonds} seriesName="CA" />
                <TableSynthese lignes={parCanal} titre="Canal" />
              </>
            ) : (
              <TableSynthese lignes={parClient.slice(0, 12)} titre="Client" barres
                pied={parClient.length > 12 ? `et ${pluriel(parClient.length - 12, 'autre client')}` : undefined} />
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="sales-title">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 id="sales-title" className="font-sans text-base font-semibold sm:mr-auto">Historique <span className="num font-normal text-fg-subtle">· {ventes.length}</span></h2>
          <Select aria-label="Filtrer par canal" value={filterChannel} onChange={e => setFilterChannel(e.target.value)} wrapperClassName="sm:w-44">
            <option value="">Tous les canaux</option>
            {CANAUX.map(c => <option key={c}>{c}</option>)}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Culture, client…" className="sm:w-64" label="Rechercher une vente" />
        </div>

        {ventes.length === 0 ? (
          <Card><EmptyState image={photos.boutiqueFleuriste} title="Aucune vente enregistrée"
            description="Marchés, fleuristes, abonnements, mariages : chaque vente alimente votre suivi d’objectif."
            action={<Button onClick={() => firstRef.current?.focus()}>Enregistrer une vente</Button>} /></Card>
        ) : sorted.length === 0 ? (
          <Card><EmptyState compact title="Aucun résultat" description="Aucune vente ne correspond à ces filtres." /></Card>
        ) : (
          <>
            <ul className="space-y-2 md:hidden">
              {sorted.map(v => {
                const open = ouverte === v.id
                return (
                  <li key={v.id} className="rounded-xl border border-border bg-surface shadow-xs">
                    <div className="flex items-center gap-2 p-3">
                      <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => setOuverte(open ? null : v.id)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={canalTone[v.channel] || 'neutral'}>{v.channel}</Badge>
                          <span className="text-xs text-fg-subtle">{jourLivraison(v.date, today, false)}</span>
                          {v.order_id && <Truck className="h-3.5 w-3.5 text-fg-subtle" aria-label="Issue d’une commande" />}
                          {facturees.get(v.id) && <Badge tone="green">Facturée n° {facturees.get(v.id)}</Badge>}
                        </div>
                        <p className="mt-1 truncate text-sm text-fg">{v.cultures_sold || '—'}</p>
                        <p className="num truncate text-xs text-fg-muted">
                          {pluriel(tigesVente(v), 'tige')}{v.lignes.length ? ` · ${pluriel(v.lignes.length, 'ligne')}` : ''}{nomClient(v) ? ` · ${nomClient(v)}` : ''}
                        </p>
                      </button>
                      <span className="num shrink-0 text-sm font-semibold text-fg">{formatEuros(totalVente(v))}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                    </div>
                    {open && (
                      <div className="border-t border-border px-3 pb-2 pt-2">
                        {detail(v)}
                        <div className="mt-2 flex justify-end gap-2">
                          {actionFacturer(v)}
                          <Button variant="danger-ghost" size="sm" onClick={() => remove(v)}><Trash2 className="h-4 w-4" /> Supprimer</Button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <TableContainer className="hidden md:block" label="Historique des ventes">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortHeader label="Date" active={sort.key === 'date'} dir={sort.dir} onClick={() => sort.toggle('date')} />
                    <SortHeader label="Canal" active={sort.key === 'channel'} dir={sort.dir} onClick={() => sort.toggle('channel')} />
                    <th>Cultures</th>
                    <SortHeader label="Tiges" align="right" className="!text-right" active={sort.key === 'tiges'} dir={sort.dir} onClick={() => sort.toggle('tiges')} />
                    <th className="!text-right">Prix/tige</th>
                    <SortHeader label="Total" align="right" className="!text-right" active={sort.key === 'total'} dir={sort.dir} onClick={() => sort.toggle('total')} />
                    <th>Client</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(v => {
                    const open = ouverte === v.id
                    const pm = moyenneCentimes(totalVente(v), tigesVente(v))
                    return (
                      <Fragment key={v.id}>
                        <tr>
                          <td className="whitespace-nowrap text-fg-muted">{jourLivraison(v.date, today, false)}</td>
                          <td><Badge tone={canalTone[v.channel] || 'neutral'}>{v.channel}</Badge></td>
                          <td className="max-w-[16rem]">
                            <button type="button" aria-expanded={open} onClick={() => setOuverte(open ? null : v.id)}
                              className="flex max-w-full items-center gap-1.5 text-left hover:text-fg" title={v.cultures_sold || ''}>
                              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                              <span className="truncate">{v.cultures_sold || '—'}</span>
                              {v.lignes.length > 0 && <span className="num shrink-0 text-xs text-fg-subtle">({v.lignes.length})</span>}
                            </button>
                          </td>
                          <td className="num text-right">{tigesVente(v).toLocaleString('fr-FR')}</td>
                          <td className="num text-right text-fg-muted">{pm === null ? '—' : formatEuros(pm)}</td>
                          <td className="num text-right font-semibold">{formatEuros(totalVente(v))}</td>
                          <td className="max-w-[12rem] text-fg-muted" title={nomClient(v) || ''}>
                            <span className="flex items-center gap-1.5">
                              <span className="truncate">{nomClient(v) || '—'}</span>
                              {v.order_id && <Truck className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-label="Issue d’une commande" />}
                              {facturees.get(v.id) && <Badge tone="green">Facturée n° {facturees.get(v.id)}</Badge>}
                            </span>
                          </td>
                          <td className="w-px text-right">
                            <Button variant="ghost" size="icon-sm" onClick={() => remove(v)} aria-label={`Supprimer la vente du ${jourLivraison(v.date, today, false)}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-surface-2/50">
                            <td /><td colSpan={7} className="py-2">{detail(v)}{actionFacturer(v) && <div className="mt-2">{actionFacturer(v)}</div>}</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TableContainer>
          </>
        )}
      </section>
      <FacturerDialog vente={aFacturer} com={com} onClose={() => setAFacturer(null)} />
    </div>
  )
}

function TableSynthese({ lignes, titre, barres, pied }: {
  lignes: ReturnType<typeof syntheseParCanal>; titre: string; barres?: boolean; pied?: string
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-fg-subtle">
            <th className="py-1.5 font-medium">{titre}</th>
            <th className="py-1.5 pl-2 text-right font-medium">Ventes</th>
            <th className="hidden py-1.5 text-right font-medium sm:table-cell">Panier moyen</th>
            <th className="py-1.5 text-right font-medium">CA</th>
            <th className="hidden py-1.5 text-right font-medium sm:table-cell">Part</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lignes.map(s => (
            <tr key={s.cle}>
              <td className="max-w-[8.5rem] py-2 pr-2 sm:max-w-[12rem]">
                <span className="block truncate text-fg">{s.libelle}</span>
                {barres && (
                  <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, s.part * 100)}%` }} />
                  </span>
                )}
              </td>
              <td className="num py-2 text-right text-fg-muted">{s.nb_ventes}</td>
              <td className="num hidden py-2 text-right text-fg-muted sm:table-cell">{s.panier_moyen_centimes === null ? '—' : formatEuros(s.panier_moyen_centimes)}</td>
              <td className="num whitespace-nowrap py-2 pl-3 text-right font-semibold">{formatEuros(s.total_centimes)}</td>
              <td className="num hidden py-2 text-right text-fg-muted sm:table-cell">{Math.round(s.part * 100)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pied && <p className="mt-2 text-xs text-fg-subtle">{pied}</p>}
    </div>
  )
}
