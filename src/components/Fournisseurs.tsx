'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Archive, ArchiveRestore, Clock, Coins, ExternalLink, Factory, Leaf, Mail, MapPin, Pencil, Phone, Plus, Printer, Truck, UserRound,
} from 'lucide-react'
import { formatEuros, SUPPLIER_KINDS, type Supplier, type SupplierKind } from '@/lib/domain'
import { achatsParSaison, LIBELLES_TYPES_FOURNISSEUR, retardBon, totauxBon } from '@/lib/domain/achats'
import {
  Badge, Button, Card, Dialog, EmptyState, PageHeader, SearchInput, Select, Skeleton, Stat, useConfirm, type Tone,
} from '@/components/ui'
import { useAchats, type Achats } from '@/hooks/useAchats'
import { FournisseurDialog } from '@/components/achats/FournisseurDialog'
import { BadgeRetard, dateCourte, euros, pluriel, StatutBon } from '@/components/achats/commun'

const kindTone: Record<SupplierKind, Tone> = {
  semencier: 'green', pepiniere: 'violet', bulbes: 'amber', fournitures: 'blue', emballage: 'rose', autre: 'neutral',
}

function Conditions({ f }: { f: Supplier }) {
  const items = [
    f.min_order_amount !== null ? `Minimum ${euros(f.min_order_amount)}` : null,
    f.free_shipping_threshold !== null ? `Franco ${euros(f.free_shipping_threshold)}` : null,
    f.lead_time_days !== null ? `Délai ${f.lead_time_days} j` : null,
  ].filter(Boolean)
  return items.length
    ? <span>{items.join(' · ')}</span>
    : <span className="italic text-fg-subtle">Conditions non renseignées</span>
}

function Contact({ f, compact }: { f: Supplier; compact?: boolean }) {
  const lien = 'inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm text-fg hover:text-primary hover:underline'
  return (
    <div className={compact ? 'flex flex-wrap gap-x-4' : 'space-y-0.5'}>
      {f.contact_name && <p className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm text-fg-muted"><UserRound className="h-4 w-4" aria-hidden />{f.contact_name}</p>}
      {f.phone && <a className={lien} href={`tel:${f.phone.replace(/\s/g, '')}`}><Phone className="h-4 w-4" aria-hidden /><span className="num">{f.phone}</span></a>}
      {f.email && <a className={lien} href={`mailto:${f.email}`}><Mail className="h-4 w-4" aria-hidden />{f.email}</a>}
      {f.website && <a className={lien} href={f.website} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden />{f.website.replace(/^https?:\/\//, '')}</a>}
      {!compact && f.address && <p className="inline-flex min-h-[2.25rem] items-center gap-1.5 text-sm text-fg-muted"><MapPin className="h-4 w-4" aria-hidden />{f.address}</p>}
    </div>
  )
}

export default function Fournisseurs({ ctx }: { ctx: any }) {
  const achats = useAchats(ctx)
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<'' | SupplierKind>('')
  const [archives, setArchives] = useState(false)
  const [edit, setEdit] = useState<{ open: boolean; f: Supplier | null }>({ open: false, f: null })
  const [ficheId, setFicheId] = useState<string | null>(null)
  const seasonId: string | null = ctx.activeSeason?.id ?? null

  const parFournisseur = useMemo(() => {
    const m = new Map<string, { nbBons: number; saison: number; enCours: number; dernier: string | null }>()
    for (const f of achats.suppliers) {
      const bons = achats.bons.filter(b => b.supplier_id === f.id)
      const parSaison = achatsParSaison(bons, achats.lignes)
      m.set(f.id, {
        nbBons: bons.filter(b => b.status !== 'brouillon').length,
        saison: seasonId ? parSaison.get(seasonId) ?? 0 : 0,
        enCours: bons.filter(b => ['envoye', 'confirme', 'recu_partiel'].includes(b.status)).length,
        dernier: bons.map(b => b.order_date).filter((d): d is string => !!d).sort().at(-1) ?? null,
      })
    }
    return m
  }, [achats.suppliers, achats.bons, achats.lignes, seasonId])

  const actifs = achats.suppliers.filter(f => !f.archived_at)
  const nbArchives = achats.suppliers.length - actifs.length
  const achatsSaison = actifs.reduce((s, f) => s + (parFournisseur.get(f.id)?.saison ?? 0), 0)
  const enCours = actifs.reduce((s, f) => s + (parFournisseur.get(f.id)?.enCours ?? 0), 0)
  const q = search.trim().toLowerCase()
  const rows = achats.suppliers
    .filter(f => (archives ? !!f.archived_at : !f.archived_at) && (!kind || f.kind === kind)
      && (!q || [f.name, f.contact_name, f.email, f.phone, f.address, f.notes, f.customer_number].some(x => (x || '').toLowerCase().includes(q))))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const fiche = ficheId ? achats.suppliers.find(f => f.id === ficheId) ?? null : null
  const annee = Number(achats.aujourdhui.slice(0, 4))

  const archiver = async (f: Supplier) => {
    const archive = !f.archived_at
    if (archive && !(await confirm({
      title: `Archiver ${f.name} ?`,
      description: 'Il disparaît des listes de choix. Ses bons et ses dépenses restent intacts ; vous pourrez le réactiver.',
      confirmLabel: 'Archiver',
    }))) return
    if (await achats.archiveSupplier(f.id, archive)) toast.success(archive ? 'Fournisseur archivé' : 'Fournisseur réactivé', { description: f.name })
  }

  return (
    <div>
      <PageHeader title="Fournisseurs" description="Semenciers, pépinières, bulbes, fournitures : conditions et historique d’achats"
        actions={<Button size="lg" className="w-full sm:w-auto" onClick={() => setEdit({ open: true, f: null })}><Plus className="h-4 w-4" /> Nouveau fournisseur</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Fournisseurs actifs" value={achats.loading ? '…' : actifs.length} sub={nbArchives ? pluriel(nbArchives, 'archivé') : undefined} icon={<Factory />} />
        <Stat className="order-first col-span-2 sm:order-none sm:col-span-1" label="Acheté cette saison" value={achats.loading ? '…' : formatEuros(achatsSaison)}
          sub="bons envoyés, port compris" icon={<Coins />} />
        <Stat label="Bons en cours" value={achats.loading ? '…' : enCours} sub="en attente de livraison" icon={<Truck />} />
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <h2 className="font-sans text-base font-semibold sm:mr-auto">
          {archives ? 'Fournisseurs archivés' : 'Fichier fournisseurs'} <span className="num font-normal text-fg-subtle">· {rows.length}</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select aria-label="Filtrer par type" value={kind} onChange={e => setKind(e.target.value as SupplierKind | '')} wrapperClassName="sm:w-48">
            <option value="">Tous les types</option>
            {SUPPLIER_KINDS.map(k => <option key={k} value={k}>{LIBELLES_TYPES_FOURNISSEUR[k]}</option>)}
          </Select>
          <Button variant={archives ? 'primary' : 'secondary'} aria-pressed={archives} onClick={() => setArchives(a => !a)}>
            <Archive className="h-4 w-4" /> Archivés{nbArchives ? ` (${nbArchives})` : ''}
          </Button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Nom, contact, ville…" className="sm:w-64" label="Rechercher un fournisseur" />
      </div>

      {achats.loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : achats.error ? (
        <Card><EmptyState compact title="Fournisseurs indisponibles" description={achats.error}
          action={<Button variant="secondary" onClick={() => achats.reload()}>Réessayer</Button>} /></Card>
      ) : achats.suppliers.length === 0 ? (
        <Card><EmptyState icon={<Factory className="h-6 w-6" aria-hidden />} title="Aucun fournisseur pour l’instant"
          description="Ajoutez vos semenciers et pépinières : leurs conditions servent aux bons de commande."
          action={<Button onClick={() => setEdit({ open: true, f: null })}><Plus className="h-4 w-4" /> Ajouter un fournisseur</Button>} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState compact title="Aucun résultat" description={archives ? 'Aucun fournisseur archivé ne correspond.' : 'Aucun fournisseur ne correspond à ces filtres.'} /></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(f => {
            const s = parFournisseur.get(f.id)
            return (
              <li key={f.id} className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => setFicheId(f.id)}>
                    <span className="block truncate font-semibold text-fg hover:underline">{f.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={kindTone[f.kind]}>{LIBELLES_TYPES_FOURNISSEUR[f.kind]}</Badge>
                      {f.organic_certified && <Badge tone="green"><Leaf className="h-3 w-3" aria-hidden /> Bio</Badge>}
                      {f.archived_at && <Badge>Archivé</Badge>}
                    </span>
                  </button>
                  <span className="num shrink-0 text-right text-sm font-semibold text-fg" title="Acheté sur la saison active">
                    {formatEuros(s?.saison ?? 0)}<span className="block text-2xs font-normal text-fg-subtle">cette saison</span>
                  </span>
                </div>
                <div className="mt-2"><Contact f={f} compact /></div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted"><Clock className="h-3.5 w-3.5" aria-hidden /><Conditions f={f} /></p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-fg-muted">
                  <span>{pluriel(s?.nbBons ?? 0, 'bon')}{s?.dernier ? ` · dernier le ${dateCourte(s.dernier, annee)}` : ''}</span>
                  <Button size="sm" variant="secondary" onClick={() => setFicheId(f.id)}>Fiche</Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <FournisseurDialog open={edit.open} onOpenChange={o => setEdit(x => ({ ...x, open: o }))} fournisseur={edit.f} achats={achats} />
      <FicheFournisseur f={fiche} achats={achats} onClose={() => setFicheId(null)}
        onModifier={f => setEdit({ open: true, f })} onArchiver={archiver} />
    </div>
  )
}

function FicheFournisseur({ f, achats, onClose, onModifier, onArchiver }: {
  f: Supplier | null
  achats: Achats
  onClose: () => void
  onModifier: (f: Supplier) => void
  onArchiver: (f: Supplier) => void
}) {
  if (!f) return null
  const bons = achats.bons.filter(b => b.supplier_id === f.id)
    .sort((a, b) => (b.order_date ?? b.created_at).localeCompare(a.order_date ?? a.created_at))
  const parSaison = achatsParSaison(bons, achats.lignes)
  const annee = Number(achats.aujourdhui.slice(0, 4))
  return (
    <Dialog open={!!f} onOpenChange={o => { if (!o) onClose() }} size="lg"
      title={<span className="flex flex-wrap items-center gap-2">{f.name} <Badge tone={kindTone[f.kind]}>{LIBELLES_TYPES_FOURNISSEUR[f.kind]}</Badge>{f.organic_certified && <Badge tone="green">Bio</Badge>}</span>}
      description={f.customer_number ? `N° client : ${f.customer_number}` : undefined}
      footer={<>
        <Button variant="secondary" onClick={() => onArchiver(f)}>
          {f.archived_at ? <><ArchiveRestore className="h-4 w-4" /> Réactiver</> : <><Archive className="h-4 w-4" /> Archiver</>}
        </Button>
        <Button onClick={() => onModifier(f)}><Pencil className="h-4 w-4" /> Modifier</Button>
      </>}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label="Contact"><h3 className="mb-1 text-xs font-medium text-fg-muted">Contact</h3><Contact f={f} /></section>
          <section aria-label="Conditions">
            <h3 className="mb-1 text-xs font-medium text-fg-muted">Conditions</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-fg-muted">Minimum</dt><dd className="num">{f.min_order_amount !== null ? euros(f.min_order_amount) : <em className="text-fg-subtle">non renseigné</em>}</dd>
              <dt className="text-fg-muted">Franco</dt><dd className="num">{f.free_shipping_threshold !== null ? euros(f.free_shipping_threshold) : <em className="text-fg-subtle">non renseigné</em>}</dd>
              <dt className="text-fg-muted">Délai</dt><dd>{f.lead_time_days !== null ? `${f.lead_time_days} jours` : <em className="text-fg-subtle">non renseigné</em>}</dd>
            </dl>
          </section>
        </div>
        {f.notes && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">{f.notes}</p>}

        <section aria-labelledby="achats-saison">
          <h3 id="achats-saison" className="mb-1.5 font-sans text-sm font-semibold">Acheté par saison</h3>
          {parSaison.size === 0 ? <p className="text-sm text-fg-subtle">Aucun bon envoyé.</p> : (
            <ul className="flex flex-wrap gap-2">
              {achats.seasons.filter(s => parSaison.has(s.id)).map(s => (
                <li key={s.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="text-fg-muted">{s.name}</span> <span className="num ml-1 font-semibold">{formatEuros(parSaison.get(s.id)!)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="historique-bons">
          <h3 id="historique-bons" className="mb-1.5 font-sans text-sm font-semibold">Historique des bons ({bons.length})</h3>
          {bons.length === 0 ? <p className="text-sm text-fg-subtle">Aucun bon pour ce fournisseur.</p> : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {bons.map(b => {
                const t = totauxBon(achats.lignesParBon.get(b.id) ?? [], b.shipping_amount)
                return (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2"><span className="num font-semibold">{b.number ?? 'Brouillon'}</span><StatutBon status={b.status} /><BadgeRetard retard={retardBon(b, achats.aujourdhui)} /></p>
                      <p className="text-xs text-fg-muted">
                        {achats.seasons.find(s => s.id === b.season_id)?.name ?? ''}{b.order_date ? ` · ${dateCourte(b.order_date, annee)}` : ''}
                      </p>
                    </div>
                    <span className="num shrink-0 font-semibold">{formatEuros(t.total)}</span>
                    <Link href={`/bon-de-commande/${b.id}`} aria-label={`Imprimer ${b.number ?? 'le brouillon'}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg">
                      <Printer className="h-4 w-4" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          <a href="#commandes" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Gérer les bons dans Achats &amp; bons de commande</a>
        </section>
      </div>
    </Dialog>
  )
}
