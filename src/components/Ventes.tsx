'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Coins, Receipt, Store, Tag, Trash2 } from 'lucide-react'
import { formatDateFR } from '@/lib/types'
import type { Sale } from '@/lib/types'
import {
  Badge, Button, Card, CardContent, CardHeader, EmptyState, Field, Input, NumberStepper, PageHeader, Progress,
  SearchInput, Segmented, Select, SortHeader, Stat, TableContainer, useConfirm, useSort, useSorted, type Tone,
} from '@/components/ui'
import { HBarChart } from '@/components/charts/HBarChart'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'

const eur0 = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
const channelTone: Record<string, Tone> = { 'Marché': 'green', 'Fleuriste': 'blue', 'Abonnements': 'violet', 'Mariage': 'rose', 'Deuil': 'neutral' }
type SortKey = 'date' | 'channel' | 'tiges' | 'total'

export default function Ventes({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [channel, setChannel] = useState('Marché')
  const [cultures, setCultures] = useState('')
  const [tiges, setTiges] = useState('')
  const [prix, setPrix] = useState('')
  const [client, setClient] = useState('')
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)
  const [search, setSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const sort = useSort<SortKey>('date', 'desc')
  const formRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  const sales: Sale[] = ctx.sales || []
  const goal = ctx.activeSeason?.revenue_goal || 15000

  const totalCA = sales.reduce((s, v) => s + (v.total || 0), 0)
  const totalTiges = sales.reduce((s, v) => s + v.tiges, 0)
  const prixMoyen = totalTiges > 0 ? totalCA / totalTiges : 0
  const pct = Math.min(100, (totalCA / goal) * 100)

  const channels = ['Marché', 'Fleuriste', 'Abonnements', 'Mariage', 'Deuil']
  const channelCA = channels.map(c => sales.filter(v => v.channel === c).reduce((s, v) => s + (v.total || 0), 0))

  useIntent('new-sale', () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    firstRef.current?.focus({ preventScroll: true })
  })

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!tiges || !prix) return
    setLoading(true)
    await ctx.createSale(date, channel, cultures, parseInt(tiges), parseFloat(prix), client)
    setLoading(false)
    toast.success('Vente enregistrée', { description: `${channel} · ${parseInt(tiges)} tiges à ${parseFloat(prix).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` })
    setTiges('')
    setPrix('')
    setCultures('')
    setClient('')
    setTried(false)
  }

  const remove = async (v: Sale) => {
    const ok = await confirm({
      title: 'Supprimer cette vente ?',
      description: `${v.channel} du ${formatDateFR(v.date)} — ${v.total?.toFixed(2)} €.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    await ctx.deleteSale(v.id)
    toast.success('Vente supprimée')
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sales.filter(v =>
      (!filterChannel || v.channel === filterChannel) &&
      (!q || [v.cultures_sold, v.client, v.channel].some(x => (x || '').toLowerCase().includes(q))))
  }, [sales, search, filterChannel])
  const getter = useMemo(() => (v: Sale) =>
    sort.key === 'channel' ? v.channel : sort.key === 'tiges' ? v.tiges : sort.key === 'total' ? v.total : v.date, [sort.key])
  const sorted = useSorted(rows, getter, sort.dir)

  return (
    <div>
      <PageHeader title="Ventes" description="Suivi des ventes par canal" image={photos.boutiqueFleuriste} />

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="CA total réel" value={eur0(totalCA)} icon={<Coins />} />
        <Stat label="Tiges vendues" value={totalTiges.toLocaleString('fr-FR')} icon={<Tag />} />
        <Stat label="Prix moyen / tige" value={`${prixMoyen.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} />
        <Stat label="Nombre de ventes" value={sales.length} icon={<Receipt />} />
      </div>

      {/* Objectif */}
      <Card className="mb-6 p-4 sm:p-5">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-fg-muted">Objectif CA : <strong className="num font-semibold text-fg">{goal.toLocaleString('fr-FR')} €</strong></span>
          <span className="num font-semibold text-fg">{pct.toFixed(1)} %</span>
        </div>
        <Progress value={pct} label="Progression vers l’objectif de chiffre d’affaires" />
      </Card>

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:items-start">
        {/* Formulaire */}
        <Card ref={formRef} className="scroll-mt-24">
          <CardHeader title="Nouvelle vente" icon={<Store className="h-4 w-4" />} />
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Canal</p>
                <Segmented label="Canal de vente" value={channel} onChange={setChannel} size="md"
                  className="grid grid-cols-3"
                  options={channels.map(c => ({ value: c, label: c }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tiges" error={tried && !tiges ? 'Requis' : undefined}>
                  <NumberStepper label="le nombre de tiges" value={tiges} onChange={setTiges} step={10} min={0} placeholder="0" />
                </Field>
                <Field label="Prix unitaire (€)" error={tried && !prix ? 'Requis' : undefined}>
                  <NumberStepper label="le prix unitaire" value={prix} onChange={setPrix} step={0.1} min={0} placeholder="0,00" inputMode="decimal" />
                </Field>
              </div>
              <Field label="Cultures vendues">
                <Input ref={firstRef} className="h-11" value={cultures} onChange={e => setCultures(e.target.value)} placeholder="Zinnia, Cosmos…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <Input className="h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
                <Field label="Client">
                  <Input className="h-11" value={client} onChange={e => setClient(e.target.value)} placeholder="Optionnel" />
                </Field>
              </div>
              {tiges && prix && (
                <p className="num rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted">
                  Total : <strong className="text-fg">{(parseInt(tiges) * parseFloat(prix) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" loading={loading}>Enregistrer la vente</Button>
            </form>
          </CardContent>
        </Card>

        {/* Graphique */}
        <Card>
          <CardHeader title="CA par canal" description="Chiffre d’affaires réel de la saison" />
          <CardContent>
            {sales.length > 0
              ? <HBarChart data={channels.map((c, i) => ({ label: c, value: channelCA[i] }))} format={eur0} seriesName="CA" />
              : <EmptyState compact icon={<Store className="h-5 w-5" />} title="Pas encore de vente" description="Le graphique se remplit à la première vente." />}
          </CardContent>
        </Card>
      </div>

      {/* Historique */}
      <section aria-labelledby="sales-title">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <h2 id="sales-title" className="font-sans text-base font-semibold sm:mr-auto">Historique <span className="num font-normal text-fg-subtle">· {sales.length}</span></h2>
          <Select aria-label="Filtrer par canal" value={filterChannel} onChange={e => setFilterChannel(e.target.value)} wrapperClassName="sm:w-44">
            <option value="">Tous les canaux</option>
            {channels.map(c => <option key={c}>{c}</option>)}
          </Select>
          <SearchInput value={search} onChange={setSearch} placeholder="Culture, client…" className="sm:w-64" label="Rechercher une vente" />
        </div>

        {sales.length === 0 ? (
          <Card><EmptyState image={photos.boutiqueFleuriste} title="Aucune vente enregistrée"
            description="Marchés, fleuristes, abonnements, mariages : chaque vente alimente votre suivi d’objectif."
            action={<Button onClick={() => firstRef.current?.focus()}>Enregistrer une vente</Button>} /></Card>
        ) : sorted.length === 0 ? (
          <Card><EmptyState compact title="Aucun résultat" description="Aucune vente ne correspond à ces filtres." /></Card>
        ) : (
          <>
            <ul className="space-y-2 md:hidden">
              {sorted.map(v => (
                <li key={v.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={channelTone[v.channel] || 'neutral'}>{v.channel}</Badge>
                      <span className="text-xs text-fg-subtle">{formatDateFR(v.date)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-fg">{v.cultures_sold || '—'}</p>
                    <p className="num truncate text-xs text-fg-muted">{v.tiges} tiges × {v.prix_unitaire?.toFixed(2)} €{v.client ? ` · ${v.client}` : ''}</p>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold text-fg">{v.total?.toFixed(2)} €</span>
                  <Button variant="ghost" size="icon" onClick={() => remove(v)} aria-label="Supprimer cette vente"><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
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
                  {sorted.map((v: Sale) => (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap text-fg-muted">{formatDateFR(v.date)}</td>
                      <td><Badge tone={channelTone[v.channel] || 'neutral'}>{v.channel}</Badge></td>
                      <td className="max-w-[14rem] truncate" title={v.cultures_sold || ''}>{v.cultures_sold || '—'}</td>
                      <td className="num text-right">{v.tiges}</td>
                      <td className="num text-right text-fg-muted">{v.prix_unitaire?.toFixed(2)} €</td>
                      <td className="num text-right font-semibold">{v.total?.toFixed(2)} €</td>
                      <td className="max-w-[12rem] truncate text-fg-muted" title={v.client || ''}>{v.client || '—'}</td>
                      <td className="w-px text-right">
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(v)} aria-label={`Supprimer la vente du ${formatDateFR(v.date)}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </>
        )}
      </section>
    </div>
  )
}
