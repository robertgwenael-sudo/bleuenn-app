'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlarmClock, ClipboardList, FileText, PackageOpen, Plus, Sprout, Truck } from 'lucide-react'
import { formatEuros, type PurchaseOrder, type PurchaseOrderStatus } from '@/lib/domain'
import { retardBon, totauxBon, type BesoinCulture } from '@/lib/domain/achats'
import {
  Badge, Button, Card, EmptyState, PageHeader, SearchInput, Segmented, Select, Skeleton, Stat, TableContainer, Tabs,
} from '@/components/ui'
import { useAchats, type Achats } from '@/hooks/useAchats'
import { photos } from '@/lib/images'
import { BadgeRetard, dateCourte, pluriel, StatutBon } from '@/components/achats/commun'
import { DetailBon } from '@/components/achats/DetailBon'
import { EditeurBon } from '@/components/achats/EditeurBon'
import { PreparerBons } from '@/components/achats/PreparerBons'
import { ReceptionBon } from '@/components/achats/ReceptionBon'

type Onglet = 'besoins' | 'bons'
type Filtre = 'en_cours' | 'brouillon' | 'recu' | 'annule' | 'tous'

const FILTRES: Record<Filtre, PurchaseOrderStatus[] | null> = {
  en_cours: ['envoye', 'confirme', 'recu_partiel'], brouillon: ['brouillon'], recu: ['recu'], annule: ['annule'], tous: null,
}

const checkbox = 'h-5 w-5 cursor-pointer rounded border-border-strong accent-[rgb(var(--primary))]'

function StatutBesoin({ b }: { b: BesoinCulture }) {
  if (b.autresUnites.length > 0) return <Badge tone="amber" dot title="Commandé en sachets, grammes ou unités : pas de conversion en graines">À vérifier</Badge>
  if (b.besoin > 0 && b.reste === 0) return <Badge tone="green" dot>Couvert</Badge>
  if (b.horsBon + b.enBons > 0) return <Badge tone="amber" dot>Partiel</Badge>
  return <Badge tone="rose" dot>À commander</Badge>
}

const nb = (n: number) => n.toLocaleString('fr-FR')

export default function Commandes({ ctx }: { ctx: any }) {
  const achats = useAchats(ctx)
  const [onglet, setOnglet] = useState<Onglet>('besoins')
  const [preparer, setPreparer] = useState(false)
  const [editeur, setEditeur] = useState<{ open: boolean; bon: PurchaseOrder | null }>({ open: false, bon: null })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [reception, setReception] = useState<string | null>(null)

  const detail = detailId ? achats.bons.find(b => b.id === detailId) ?? null : null
  const aReceptionner = reception ? achats.bons.find(b => b.id === reception) ?? null : null
  const enCours = achats.bons.filter(b => FILTRES.en_cours!.includes(b.status) && b.season_id === ctx.activeSeason?.id)
  const enRetard = achats.bons.filter(b => retardBon(b, achats.aujourdhui))
  const nomFerme: string = ctx.farm?.name ?? 'Ma ferme'

  return (
    <div>
      <PageHeader title="Achats & bons de commande" description="Besoins en graines et plants, bons numérotés, réception et dépenses"
        image={photos.semisGodets}
        actions={<>
          <Button variant="secondary" size="lg" className="w-full sm:w-auto" onClick={() => setPreparer(true)} disabled={achats.loading || !!achats.error}>
            <ClipboardList className="h-4 w-4" /> Préparer les bons de commande
          </Button>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => setEditeur({ open: true, bon: null })} disabled={achats.loading || !!achats.error}>
            <Plus className="h-4 w-4" /> Nouveau bon
          </Button>
        </>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Besoin total" value={achats.loading ? '…' : nb(achats.besoins.reduce((s, b) => s + b.besoin, 0))} sub="graines et plants" icon={<Sprout />} />
        <Stat label="Reste à commander" value={achats.loading ? '…' : nb(achats.besoins.filter(b => !b.autresUnites.length).reduce((s, b) => s + b.reste, 0))}
          sub={`${pluriel(achats.besoins.filter(b => b.reste > 0 && !b.autresUnites.length).length, 'culture')}`} icon={<PackageOpen />} />
        <Stat label="Bons en cours" value={achats.loading ? '…' : enCours.length} sub="envoyés, confirmés, partiels" icon={<Truck />} />
        <Stat label="En retard" value={achats.loading ? '…' : enRetard.length} sub="date de livraison dépassée" icon={<AlarmClock />} />
      </div>

      <Tabs<Onglet> label="Achats" value={onglet} onChange={setOnglet} className="mb-4"
        options={[
          { value: 'besoins', label: 'Besoins', icon: <Sprout className="h-4 w-4" aria-hidden /> },
          { value: 'bons', label: `Bons de commande${achats.bons.length ? ` (${achats.bons.length})` : ''}`, icon: <FileText className="h-4 w-4" aria-hidden /> },
        ]} />

      {achats.loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : achats.error ? (
        <Card><EmptyState compact title="Achats indisponibles" description={achats.error}
          action={<Button variant="secondary" onClick={() => achats.reload()}>Réessayer</Button>} /></Card>
      ) : onglet === 'besoins' ? (
        <Besoins ctx={ctx} achats={achats} />
      ) : (
        <ListeBons achats={achats} seasonId={ctx.activeSeason?.id ?? null} onOuvrir={setDetailId}
          onNouveau={() => setEditeur({ open: true, bon: null })} />
      )}

      <PreparerBons open={preparer} onOpenChange={setPreparer} achats={achats} onCreated={() => setOnglet('bons')} />
      <EditeurBon open={editeur.open} onOpenChange={o => setEditeur(x => ({ ...x, open: o }))} bon={editeur.bon} achats={achats}
        catalog={ctx.catalog || []} seasonId={ctx.activeSeason?.id ?? null}
        onSaved={id => { setOnglet('bons'); setDetailId(id) }} />
      <DetailBon bon={detail} onOpenChange={o => { if (!o) setDetailId(null) }} achats={achats} nomFerme={nomFerme}
        onModifier={b => { setDetailId(null); setEditeur({ open: true, bon: b }) }}
        onReceptionner={b => { setDetailId(null); setReception(b.id) }} />
      <ReceptionBon open={!!aReceptionner} onOpenChange={o => { if (!o) { const id = reception; setReception(null); if (id) setDetailId(id) } }}
        bon={aReceptionner} achats={achats} />
    </div>
  )
}

// ─── Onglet Besoins : la vue historique des besoins en graines ─────
function Besoins({ ctx, achats }: { ctx: any; achats: Achats }) {
  const [search, setSearch] = useState('')
  const besoins = achats.besoins
  const so = (b: BesoinCulture) => (ctx.seedOrders || []).find((o: any) => o.id === b.seed_order_id)

  const handleUpdate = (b: BesoinCulture, field: 'graines_ordered' | 'supplier' | 'bio' | 'received', value: string | boolean) => {
    const updates: Record<string, unknown> = { graines_needed: b.besoin }
    if (field === 'graines_ordered') {
      const n = Number(String(value).replace(/\s/g, ''))
      if (!Number.isInteger(n) || n < 0) { toast.error('Nombre de graines invalide'); return }
      updates.graines_ordered = n
    } else updates[field] = value
    ctx.upsertSeedOrder(b.culture_name, updates)
  }
  const onBlurSave = (b: BesoinCulture, field: 'graines_ordered' | 'supplier', before: string | number, e: React.FocusEvent<HTMLInputElement>) => {
    if (String(before) === e.target.value) return
    handleUpdate(b, field, e.target.value)
    toast.success(`${b.culture_name} : besoin mis à jour`)
  }

  const q = search.trim().toLowerCase()
  const visible = besoins.filter(b => !q || b.culture_name.toLowerCase().includes(q) || (b.fournisseur?.name ?? so(b)?.supplier ?? '').toLowerCase().includes(q))

  if (besoins.length === 0) {
    return (
      <Card>
        <EmptyState image={photos.semisGodets} title="Aucun besoin en graines"
          description="Les besoins se calculent automatiquement quand vous ajoutez des plantations à la saison." />
      </Card>
    )
  }

  const fournisseurCell = (b: BesoinCulture, className: string) => b.origineFournisseur === 'dernier_bon'
    ? <span className={className} title="Fournisseur du dernier bon envoyé pour cette culture">{b.fournisseur!.name}</span>
    : <input type="text" aria-label={`Fournisseur — ${b.culture_name}`} className={`field-control ${className}`} defaultValue={so(b)?.supplier || ''}
      placeholder="À choisir" onBlur={e => onBlurSave(b, 'supplier', so(b)?.supplier || '', e)} />

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Culture ou fournisseur…" className="sm:w-72" label="Rechercher un besoin" />
        <p className="text-xs text-fg-subtle sm:ml-auto">« Hors bon » : graines commandées sans bon (ancienne saisie). Les champs s’enregistrent quand vous les quittez.</p>
      </div>

      <ul className="space-y-2 md:hidden">
        {visible.map(b => (
          <li key={b.cle} className="rounded-xl border border-border bg-surface p-3.5 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-fg">{b.culture_name}</p>
                <p className="num text-xs text-fg-muted">{nb(b.besoin)} nécessaires · {nb(b.enBons)} en bons · reste {nb(b.reste)}</p>
              </div>
              <StatutBesoin b={b} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-fg-muted">Hors bon
                <input type="number" inputMode="numeric" className="field-control mt-1 h-11" defaultValue={b.horsBon} min={0}
                  onBlur={e => onBlurSave(b, 'graines_ordered', b.horsBon, e)} />
              </label>
              <div className="text-xs text-fg-muted">Fournisseur
                <div className="mt-1">{fournisseurCell(b, 'h-11 flex items-center text-sm text-fg')}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-5 text-sm text-fg">
              <label className="flex items-center gap-2"><input type="checkbox" className={checkbox} checked={so(b)?.bio || false}
                onChange={e => handleUpdate(b, 'bio', e.target.checked)} />Bio</label>
              <label className="flex items-center gap-2"><input type="checkbox" className={checkbox} checked={so(b)?.received || false}
                onChange={e => handleUpdate(b, 'received', e.target.checked)} />Reçu</label>
            </div>
          </li>
        ))}
      </ul>

      <TableContainer className="hidden md:block" label="Besoins en graines et plants">
        <table className="data-table">
          <thead>
            <tr>
              <th>Culture</th>
              <th className="!text-right">Nécessaires</th>
              <th>Hors bon</th>
              <th className="!text-right">En bons</th>
              <th className="!text-right">Reste</th>
              <th>Fournisseur</th>
              <th className="!text-center">Bio</th>
              <th>Statut</th>
              <th className="!text-center">Reçu</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(b => (
              <tr key={b.cle}>
                <td className="font-medium">{b.culture_name}</td>
                <td className="num text-right">{nb(b.besoin)}</td>
                <td>
                  <input type="number" aria-label={`Graines commandées hors bon — ${b.culture_name}`} className="field-control !min-h-0 h-8 w-24 text-right"
                    defaultValue={b.horsBon} min={0} onBlur={e => onBlurSave(b, 'graines_ordered', b.horsBon, e)} />
                </td>
                <td className="num text-right">
                  {nb(b.enBons)}
                  {b.autresUnites.length > 0 && <span className="block text-2xs text-warning">+ {b.autresUnites.map(a => `${a.quantite} ${a.unit}`).join(', ')}</span>}
                </td>
                <td className="num text-right font-semibold">{nb(b.reste)}</td>
                <td>{fournisseurCell(b, '!min-h-0 h-8 w-48 text-sm')}</td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`Bio — ${b.culture_name}`} className={checkbox} checked={so(b)?.bio || false}
                    onChange={e => handleUpdate(b, 'bio', e.target.checked)} />
                </td>
                <td><StatutBesoin b={b} /></td>
                <td className="text-center">
                  <input type="checkbox" aria-label={`Reçu — ${b.culture_name}`} className={checkbox} checked={so(b)?.received || false}
                    onChange={e => handleUpdate(b, 'received', e.target.checked)} />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-fg-muted">Aucune culture ne correspond à « {search} ».</td></tr>
            )}
          </tbody>
        </table>
      </TableContainer>
    </>
  )
}

// ─── Onglet Bons de commande ────────────────────────────────
function ListeBons({ achats, seasonId, onOuvrir, onNouveau }: {
  achats: Achats
  seasonId: string | null
  onOuvrir: (id: string) => void
  onNouveau: () => void
}) {
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [saison, setSaison] = useState<string>(seasonId ?? '')
  const annee = Number(achats.aujourdhui.slice(0, 4))

  const liste = useMemo(() => {
    const st = FILTRES[filtre]
    return achats.bons
      .filter(b => (!saison || b.season_id === saison) && (!st || st.includes(b.status)))
      .map(b => ({ b, retard: retardBon(b, achats.aujourdhui), t: totauxBon(achats.lignesParBon.get(b.id) ?? [], b.shipping_amount) }))
      .sort((x, y) => (y.retard ? 1 : 0) - (x.retard ? 1 : 0)
        || (x.b.status === 'brouillon' ? -1 : 0) - (y.b.status === 'brouillon' ? -1 : 0)
        || (y.b.order_date ?? y.b.created_at).localeCompare(x.b.order_date ?? x.b.created_at))
  }, [achats.bons, achats.lignesParBon, achats.aujourdhui, filtre, saison])

  const compte = (f: Filtre) => achats.bons.filter(b => (!saison || b.season_id === saison) && (!FILTRES[f] || FILTRES[f]!.includes(b.status))).length

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Segmented<Filtre> label="Filtrer par statut" value={filtre} onChange={setFiltre} size="sm" className="lg:w-auto"
          options={(['tous', 'en_cours', 'brouillon', 'recu', 'annule'] as Filtre[]).map(f => ({
            value: f, label: `${{ tous: 'Tous', en_cours: 'En cours', brouillon: 'Brouillons', recu: 'Reçus', annule: 'Annulés' }[f]} (${compte(f)})`,
          }))} />
        <Select aria-label="Saison d’imputation" value={saison} onChange={e => setSaison(e.target.value)} wrapperClassName="lg:ml-auto lg:w-56">
          <option value="">Toutes les saisons</option>
          {achats.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      {liste.length === 0 ? (
        <Card><EmptyState compact icon={<FileText className="h-6 w-6" aria-hidden />} title="Aucun bon"
          description="Préparez les bons depuis les besoins, ou créez-en un à la main."
          action={<Button onClick={onNouveau}><Plus className="h-4 w-4" /> Nouveau bon</Button>} /></Card>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {liste.map(({ b, retard, t }) => {
            const f = achats.suppliers.find(s => s.id === b.supplier_id)
            const n = (achats.lignesParBon.get(b.id) ?? []).length
            return (
              <li key={b.id}>
                <button type="button" onClick={() => onOuvrir(b.id)} aria-label={`${b.number ?? 'Brouillon'} — ${f?.name ?? ''}`}
                  className="flex h-full w-full flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 text-left shadow-xs transition hover:border-border-strong active:bg-surface-2">
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="num font-semibold text-fg">{b.number ?? 'Brouillon'}</p>
                      <p className="truncate text-sm text-fg-muted">{f?.name ?? 'Fournisseur inconnu'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1"><StatutBon status={b.status} /><BadgeRetard retard={retard} /></div>
                  </div>
                  <div className="flex w-full items-end justify-between gap-2 text-xs text-fg-muted">
                    <span>
                      {pluriel(n, 'ligne')}
                      {b.order_date ? ` · commandé le ${dateCourte(b.order_date, annee)}` : ''}
                      {b.expected_date && b.status !== 'recu' && b.status !== 'annule' ? ` · prévu le ${dateCourte(b.expected_date, annee)}` : ''}
                      {b.status === 'recu' && b.received_date ? ` · reçu le ${dateCourte(b.received_date, annee)}` : ''}
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-fg">{formatEuros(t.total)}{t.prixManquants ? ' *' : ''}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {liste.some(x => x.t.prixManquants) && <p className="mt-2 text-xs text-fg-subtle">* total incomplet : prix à saisir sur certaines lignes.</p>}
    </>
  )
}
