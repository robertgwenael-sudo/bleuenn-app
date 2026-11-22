'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Archive, ArchiveRestore, Coins, Mail, MapPin, Pencil, Phone, Plus, Receipt, Trash2, Truck, UserRound, Users,
} from 'lucide-react'
import {
  formatEuros, syntheseParClient, totalVente, type Client, type ClientKind, type Order, type SyntheseVentes,
} from '@/lib/domain'
import {
  Badge, Button, Card, Dialog, EmptyState, PageHeader, SearchInput, Select, Skeleton, Stat, TableContainer,
  SortHeader, useConfirm, useSort, useSorted,
} from '@/components/ui'
import { dejaAffichee, useCommercial, type Commercial } from '@/hooks/useCommercial'
import { ClientDialog } from '@/components/commercial/ClientDialog'
import {
  aujourdhuiParis, canalTone, jourLivraison, KIND_LABEL, KINDS, kindTone, pluriel, STATUT_LABEL, statutTone,
} from '@/components/commercial/commun'
import { photos } from '@/lib/images'

type SortKey = 'name' | 'kind' | 'ca' | 'ventes' | 'derniere'

interface LigneClient {
  c: Client
  s: SyntheseVentes | undefined
  derniere: Order | undefined
  prochaine: Order | undefined
}

export default function Clients({ ctx }: { ctx: any }) {
  const com = useCommercial(ctx)
  const confirm = useConfirm()
  const today = aujourdhuiParis()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'' | ClientKind>('')
  const [archives, setArchives] = useState(false)
  const [edit, setEdit] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null })
  const [ficheId, setFicheId] = useState<string | null>(null)
  const sort = useSort<SortKey>('ca', 'desc')

  const synthese = useMemo(() => new Map(syntheseParClient(com.ventes, com.clients).map(s => [s.cle, s])), [com.ventes, com.clients])

  const lignes: LigneClient[] = useMemo(() => com.clients.map(c => {
    const os = com.orders.filter(o => o.client_id === c.id && o.status !== 'annulee')
    const passees = os.filter(o => o.delivery_date <= today).sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))
    const futures = os.filter(o => o.delivery_date > today && o.status !== 'livree').sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    return { c, s: synthese.get(c.id), derniere: passees[0], prochaine: futures[0] }
  }), [com.clients, com.orders, synthese, today])

  const actifs = lignes.filter(l => !l.c.archived_at)
  const caClients = actifs.reduce((s, l) => s + (l.s?.total_centimes ?? 0), 0)
  const aVenir = com.orders.filter(o => o.delivery_date >= today && (o.status === 'confirmee' || o.status === 'prete' || o.status === 'devis')).length
  const nbArchives = lignes.length - actifs.length

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lignes.filter(l =>
      (archives ? !!l.c.archived_at : !l.c.archived_at) &&
      (!kind || l.c.kind === kind) &&
      (!q || [l.c.name, l.c.contact_name, l.c.email, l.c.phone, l.c.address, l.c.notes].some(x => (x || '').toLowerCase().includes(q))))
  }, [lignes, search, kind, archives])
  const getter = useMemo(() => (l: LigneClient) =>
    sort.key === 'name' ? l.c.name : sort.key === 'kind' ? KIND_LABEL[l.c.kind]
      : sort.key === 'ventes' ? (l.s?.nb_ventes ?? 0) : sort.key === 'derniere' ? (l.derniere?.delivery_date ?? '')
        : (l.s?.total_centimes ?? 0), [sort.key])
  const sorted = useSorted(rows, getter, sort.dir)

  const fiche = ficheId ? lignes.find(l => l.c.id === ficheId) ?? null : null

  const archiver = async (c: Client) => {
    const archive = !c.archived_at
    if (archive) {
      const ok = await confirm({
        title: `Archiver ${c.name} ?`,
        description: 'Le client disparaît des listes de choix. Ses ventes et commandes restent intactes ; vous pourrez le réactiver.',
        confirmLabel: 'Archiver',
      })
      if (!ok) return
    }
    try {
      await com.archiveClient(c.id, archive)
      toast.success(archive ? 'Client archivé' : 'Client réactivé', { description: c.name })
    } catch (e) { if (!dejaAffichee(e)) toast.error(String(e)) }
  }

  const supprimer = async (c: Client) => {
    const ok = await confirm({
      title: `Supprimer ${c.name} ?`,
      description: 'Ce client n’a ni vente ni commande. La fiche sera définitivement supprimée.',
      confirmLabel: 'Supprimer', destructive: true,
    })
    if (!ok) return
    try {
      if (await com.deleteClient(c.id)) { toast.success('Client supprimé'); setFicheId(null) }
    } catch (e) { if (!dejaAffichee(e)) toast.error(String(e)) }
  }

  return (
    <div>
      <PageHeader title="Clients" description="Fleuristes, particuliers, mariages : le fichier partagé de l’équipe"
        image={photos.boutiqueFleuriste}
        actions={<Button size="lg" className="w-full sm:w-auto" onClick={() => setEdit({ open: true, client: null })}><Plus className="h-4 w-4" /> Nouveau client</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Clients actifs" value={com.loading ? '…' : actifs.length} sub={nbArchives ? `${pluriel(nbArchives, 'archivé')}` : undefined} icon={<Users />} />
        <Stat className="order-first col-span-2 sm:order-none sm:col-span-1" label="CA clients (saison)" value={com.loading ? '…' : formatEuros(caClients)} sub="ventes rattachées à une fiche" icon={<Coins />} />
        <Stat label="Commandes à venir" value={com.loading ? '…' : aVenir} sub="devis compris" icon={<Truck />} />
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <h2 className="font-sans text-base font-semibold sm:mr-auto">
          {archives ? 'Clients archivés' : 'Fichier clients'} <span className="num font-normal text-fg-subtle">· {rows.length}</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select aria-label="Filtrer par type" value={kind} onChange={e => setKind(e.target.value as ClientKind | '')} wrapperClassName="sm:w-44">
            <option value="">Tous les types</option>
            {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <Button variant={archives ? 'primary' : 'secondary'} aria-pressed={archives} onClick={() => setArchives(a => !a)}>
            <Archive className="h-4 w-4" /> Archivés{nbArchives ? ` (${nbArchives})` : ''}
          </Button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Nom, contact, ville…" className="sm:w-64" label="Rechercher un client" />
      </div>

      {com.loading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : com.erreur ? (
        <Card><EmptyState compact title="Clients indisponibles" description={com.erreur}
          action={<Button variant="secondary" onClick={() => com.reload()}>Réessayer</Button>} /></Card>
      ) : com.clients.length === 0 ? (
        <Card><EmptyState image={photos.bouquetChampetre} title="Aucun client pour l’instant"
          description="Ajoutez vos fleuristes, abonnés et mariés pour suivre leurs commandes et leur chiffre d’affaires."
          action={<Button onClick={() => setEdit({ open: true, client: null })}><Plus className="h-4 w-4" /> Ajouter un client</Button>} /></Card>
      ) : sorted.length === 0 ? (
        <Card><EmptyState compact title="Aucun résultat" description={archives ? 'Aucun client archivé ne correspond.' : 'Aucun client ne correspond à ces filtres.'} /></Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {sorted.map(l => (
              <li key={l.c.id}>
                <button type="button" onClick={() => setFicheId(l.c.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left shadow-xs active:bg-surface-2">
                  <Avatar c={l.c} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{l.c.name}</span>
                      <Badge tone={kindTone[l.c.kind]}>{KIND_LABEL[l.c.kind]}</Badge>
                    </div>
                    <p className="truncate text-xs text-fg-muted">
                      {l.s ? pluriel(l.s.nb_ventes, 'vente') : 'Aucune vente'}
                      {l.prochaine ? ` · prochaine : ${jourLivraison(l.prochaine.delivery_date, today)}` : l.derniere ? ` · dernière : ${jourLivraison(l.derniere.delivery_date, today)}` : ''}
                    </p>
                  </div>
                  <span className="num shrink-0 text-sm font-semibold text-fg">{l.s ? formatEuros(l.s.total_centimes) : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
          <TableContainer className="hidden md:block" label="Fichier clients">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Client" active={sort.key === 'name'} dir={sort.dir} onClick={() => sort.toggle('name')} />
                  <SortHeader label="Type" active={sort.key === 'kind'} dir={sort.dir} onClick={() => sort.toggle('kind')} />
                  <th>Contact</th>
                  <SortHeader label="CA saison" align="right" className="!text-right" active={sort.key === 'ca'} dir={sort.dir} onClick={() => sort.toggle('ca')} />
                  <SortHeader label="Ventes" align="right" className="!text-right" active={sort.key === 'ventes'} dir={sort.dir} onClick={() => sort.toggle('ventes')} />
                  <SortHeader label="Dernière commande" active={sort.key === 'derniere'} dir={sort.dir} onClick={() => sort.toggle('derniere')} />
                  <th>Prochaine livraison</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(l => (
                  <tr key={l.c.id} className="cursor-pointer" onClick={() => setFicheId(l.c.id)}>
                    <td>
                      <button type="button" className="font-semibold text-fg hover:underline" onClick={e => { e.stopPropagation(); setFicheId(l.c.id) }}>{l.c.name}</button>
                    </td>
                    <td><Badge tone={kindTone[l.c.kind]}>{KIND_LABEL[l.c.kind]}</Badge></td>
                    <td className="max-w-[16rem] text-fg-muted">
                      <span className="block truncate">{l.c.contact_name || '—'}</span>
                      {l.c.phone && <a href={`tel:${l.c.phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()} className="num block truncate text-xs hover:text-fg hover:underline">{l.c.phone}</a>}
                    </td>
                    <td className="num text-right font-semibold">{l.s ? formatEuros(l.s.total_centimes) : '—'}</td>
                    <td className="num text-right text-fg-muted">{l.s?.nb_ventes ?? 0}</td>
                    <td className="whitespace-nowrap text-fg-muted">{l.derniere ? jourLivraison(l.derniere.delivery_date, today) : '—'}</td>
                    <td className="whitespace-nowrap">
                      {l.prochaine
                        ? <span className="flex items-center gap-2"><span className="text-fg">{jourLivraison(l.prochaine.delivery_date, today)}</span><Badge tone={statutTone[l.prochaine.status]}>{STATUT_LABEL[l.prochaine.status]}</Badge></span>
                        : <span className="text-fg-subtle">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}

      <ClientDialog open={edit.open} onOpenChange={o => setEdit(x => ({ ...x, open: o }))} client={edit.client} com={com}
        onSaved={c => { if (c) setFicheId(c.id) }} />

      {fiche && (
        <FicheClient l={fiche} com={com} today={today} onClose={() => setFicheId(null)}
          onEdit={() => setEdit({ open: true, client: fiche.c })}
          onArchive={() => archiver(fiche.c)} onDelete={() => supprimer(fiche.c)} />
      )}
    </div>
  )
}

function Avatar({ c }: { c: Client }) {
  const initiales = c.name.replace(/^(Mariage|Épicerie)\s+/i, '').split(/[\s–-]+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase()
  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
      {initiales || <UserRound className="h-4 w-4" />}
    </span>
  )
}

function FicheClient({ l, com, today, onClose, onEdit, onArchive, onDelete }: {
  l: LigneClient; com: Commercial; today: string
  onClose: () => void; onEdit: () => void; onArchive: () => void; onDelete: () => void
}) {
  const { c, s } = l
  const ventes = com.ventes.filter(v => v.client_id === c.id).slice(0, 6)
  const commandes = com.orders.filter(o => o.client_id === c.id).sort((a, b) => b.delivery_date.localeCompare(a.delivery_date)).slice(0, 6)
  const aDesVentes = (s?.nb_ventes ?? 0) > 0 || commandes.length > 0
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }} size="lg"
      title={<span className="flex flex-wrap items-center gap-2">{c.name} <Badge tone={kindTone[c.kind]}>{KIND_LABEL[c.kind]}</Badge>{c.archived_at && <Badge>Archivé</Badge>}</span>}
      description={c.contact_name ?? undefined}
      footer={<>
        {!aDesVentes && <Button variant="danger-ghost" onClick={onDelete} className="sm:mr-auto"><Trash2 className="h-4 w-4" /> Supprimer</Button>}
        <Button variant="secondary" onClick={onArchive}>
          {c.archived_at ? <><ArchiveRestore className="h-4 w-4" /> Réactiver</> : <><Archive className="h-4 w-4" /> Archiver</>}
        </Button>
        <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Modifier</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {c.phone
            ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="flex h-12 items-center gap-3 rounded-xl border border-border px-3 text-sm hover:bg-surface-2"><Phone className="h-4 w-4 text-primary" /><span className="num">{c.phone}</span></a>
            : <p className="flex h-12 items-center gap-3 rounded-xl border border-dashed border-border px-3 text-sm text-fg-subtle"><Phone className="h-4 w-4" />Pas de téléphone</p>}
          {c.email
            ? <a href={`mailto:${c.email}`} className="flex h-12 min-w-0 items-center gap-3 rounded-xl border border-border px-3 text-sm hover:bg-surface-2"><Mail className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{c.email}</span></a>
            : <p className="flex h-12 items-center gap-3 rounded-xl border border-dashed border-border px-3 text-sm text-fg-subtle"><Mail className="h-4 w-4" />Pas d’e-mail</p>}
          {c.address && (
            <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer"
              className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2 sm:col-span-2">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />{c.address}
            </a>
          )}
        </div>
        {c.notes && <p className="whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">{c.notes}</p>}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-border p-3">
            <p className="text-2xs font-medium text-fg-muted">CA de la saison</p>
            <p className="num mt-1 text-lg font-semibold">{s ? formatEuros(s.total_centimes) : '—'}</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-2xs font-medium text-fg-muted">Ventes</p>
            <p className="num mt-1 text-lg font-semibold">{s?.nb_ventes ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-2xs font-medium text-fg-muted">Dernière commande</p>
            <p className="mt-1 text-sm font-semibold">{l.derniere ? jourLivraison(l.derniere.delivery_date, today) : '—'}</p>
          </div>
        </div>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-fg-subtle" /> Commandes de la saison</h3>
          {commandes.length === 0 ? <p className="text-sm text-fg-subtle">Aucune commande cette saison.</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {commandes.map(o => {
                const t = (com.lignesParCommande.get(o.id) ?? [])
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="w-full shrink-0 text-xs text-fg-muted sm:w-36 sm:text-sm">{jourLivraison(o.delivery_date, today)}</span>
                    <span className="min-w-0 flex-1 truncate">{t.map(x => x.label).join(', ') || '—'}</span>
                    <Badge tone={statutTone[o.status]}>{STATUT_LABEL[o.status]}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Receipt className="h-4 w-4 text-fg-subtle" /> Dernières ventes</h3>
          {ventes.length === 0 ? <p className="text-sm text-fg-subtle">Aucune vente rattachée cette saison.</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {ventes.map(v => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="w-full shrink-0 text-xs text-fg-muted sm:w-36 sm:text-sm">{jourLivraison(v.date, today, false)}</span>
                  <Badge tone={canalTone[v.channel] || 'neutral'}>{v.channel}</Badge>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{v.cultures_sold || '—'}</span>
                  <span className="num font-semibold">{formatEuros(totalVente(v))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  )
}
