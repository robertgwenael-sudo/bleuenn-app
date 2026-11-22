'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Check, ClipboardList, Coins, FileText, Pencil, Plus, Receipt, Scissors, Trash2, Truck } from 'lucide-react'
import {
  ajouterJours, formatEuros, lundiDeSemaine, tigesLigne, totauxLignes, type Order, type OrderStatus,
} from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'
import {
  Badge, Button, Card, CardContent, CardHeader, EmptyState, PageHeader, Segmented, Skeleton, Stat, Tabs, cn,
  useConfirm,
} from '@/components/ui'
import { dejaAffichee, useCommercial, type Commercial } from '@/hooks/useCommercial'
import { CommandeDialog } from '@/components/commercial/CommandeDialog'
import { LivrerDialog } from '@/components/commercial/LivrerDialog'
import {
  aujourdhuiParis, jourLivraison, KIND_LABEL, kindTone, pluriel, STATUT_LABEL, STATUT_SUIVANT, statutTone, libelleQuantite,
} from '@/components/commercial/commun'
import { photos } from '@/lib/images'

type Vue = 'commandes' | 'preparer'
type Periode = 'a-venir' | 'historique'
const OUVERTES: OrderStatus[] = ['devis', 'confirmee', 'prete']
const A_COUPER: OrderStatus[] = ['confirmee', 'prete']

export default function Livraisons({ ctx }: { ctx: any }) {
  const com = useCommercial(ctx)
  const confirm = useConfirm()
  const catalog: CultureCatalog[] = ctx.catalog || []
  const today = aujourdhuiParis()
  const [vue, setVue] = useState<Vue>('commandes')
  const [periode, setPeriode] = useState<Periode>('a-venir')
  const [edit, setEdit] = useState<{ open: boolean; order: Order | null }>({ open: false, order: null })
  const [aLivrer, setALivrer] = useState<Order | null>(null)

  // Bornes : semaine civile en cours (lundi → dimanche), puis la suivante
  const finSemaine = ajouterJours(lundiDeSemaine(today), 6)
  const finSemaineProchaine = ajouterJours(finSemaine, 7)
  const dans7jours = ajouterJours(today, 6)

  const totalCommande = (o: Order) => totauxLignes(com.lignesParCommande.get(o.id) ?? [])

  const ouvertes = com.orders.filter(o => OUVERTES.includes(o.status))
  const groupes = useMemo(() => {
    const g: { id: string; titre: string; sous?: string; tone?: 'danger'; items: Order[] }[] = [
      { id: 'retard', titre: 'En retard', sous: 'date passée, pas encore livrées', tone: 'danger', items: [] },
      { id: 'semaine', titre: 'Cette semaine', sous: `jusqu’au ${jourLivraison(finSemaine, today, false)}`, items: [] },
      { id: 'prochaine', titre: 'Semaine prochaine', items: [] },
      { id: 'plus-tard', titre: 'Plus tard', items: [] },
    ]
    for (const o of ouvertes) {
      const i = o.delivery_date < today ? 0 : o.delivery_date <= finSemaine ? 1 : o.delivery_date <= finSemaineProchaine ? 2 : 3
      g[i].items.push(o)
    }
    return g.filter(x => x.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [com.orders, today])
  const historique = useMemo(() => com.orders.filter(o => !OUVERTES.includes(o.status))
    .sort((a, b) => b.delivery_date.localeCompare(a.delivery_date)), [com.orders])

  // KPI
  const semaine = ouvertes.filter(o => o.delivery_date <= dans7jours)
  const enAttente = ouvertes.filter(o => o.status !== 'devis').reduce((s, o) => s + totalCommande(o).total_centimes, 0)
  const devis = ouvertes.filter(o => o.status === 'devis')

  // À préparer : tiges à couper pour les 7 prochains jours (retards compris), commandes fermes seulement
  const aPreparer = useMemo(() => {
    const cmds = com.orders.filter(o => A_COUPER.includes(o.status) && o.delivery_date <= dans7jours)
    const noms = new Map(catalog.map(c => [c.id, c.name]))
    const m = new Map<string, { nom: string; libre: boolean; tiges: number; detail: Map<string, number> }>()
    for (const o of cmds) {
      const client = (o.client_id && com.clientsParId.get(o.client_id)?.name) || 'Sans client'
      for (const l of com.lignesParCommande.get(o.id) ?? []) {
        const cle = l.culture_id ?? `libre:${l.label.trim().toLowerCase()}`
        const acc = m.get(cle) ?? { nom: (l.culture_id && noms.get(l.culture_id)) || l.label, libre: !l.culture_id, tiges: 0, detail: new Map() }
        const t = tigesLigne(l)
        acc.tiges += t
        acc.detail.set(client, (acc.detail.get(client) ?? 0) + t)
        m.set(cle, acc)
      }
    }
    const lignes = Array.from(m.values()).sort((a, b) => Number(a.libre) - Number(b.libre) || b.tiges - a.tiges)
    return { cmds, lignes, total: lignes.reduce((s, l) => s + l.tiges, 0), max: Math.max(1, ...lignes.map(l => l.tiges)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [com.orders, com.lignesParCommande, catalog, today])
  const devisSemaine = devis.filter(o => o.delivery_date <= dans7jours).length

  const changerStatut = async (o: Order, s: OrderStatus) => {
    if (s === 'annulee') {
      const ok = await confirm({ title: 'Annuler cette commande ?', description: 'Elle restera visible dans l’historique.', confirmLabel: 'Annuler la commande', cancelLabel: 'Garder', destructive: true })
      if (!ok) return
    }
    try {
      await com.setOrderStatus(o.id, s)
      toast.success(`Commande ${STATUT_LABEL[s].toLowerCase()}`, { description: com.clientsParId.get(o.client_id ?? '')?.name })
    } catch (e) { if (!dejaAffichee(e)) toast.error(String(e)) }
  }

  const supprimer = async (o: Order) => {
    const ok = await confirm({ title: 'Supprimer cette commande ?', description: 'La commande et ses lignes seront définitivement effacées. Pour garder une trace, annulez-la plutôt.', confirmLabel: 'Supprimer', destructive: true })
    if (!ok) return
    try { await com.deleteOrder(o.id); toast.success('Commande supprimée') } catch (e) { if (!dejaAffichee(e)) toast.error(String(e)) }
  }

  const nouvelle = () => setEdit({ open: true, order: null })

  return (
    <div>
      <PageHeader title="Commandes clients" description="À préparer, à livrer, à facturer" image={photos.bouquetChampetre}
        actions={<Button size="lg" className="w-full sm:w-auto" onClick={nouvelle}><Plus className="h-4 w-4" /> Nouvelle commande</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="À livrer sous 7 jours" value={com.loading ? '…' : semaine.length} sub={pluriel(semaine.filter(o => o.delivery_date < today).length, 'en retard', 'en retard')} icon={<Truck />} />
        <Stat className="order-first col-span-2 sm:order-none sm:col-span-1" label="Commandes fermes" value={com.loading ? '…' : formatEuros(enAttente)} sub="à facturer" icon={<Coins />} />
        <Stat label="Devis en cours" value={com.loading ? '…' : devis.length} sub={devis.length ? formatEuros(devis.reduce((s, o) => s + totalCommande(o).total_centimes, 0)) : 'aucun'} icon={<FileText />} />
      </div>

      <Tabs label="Vue" className="mb-5" value={vue} onChange={setVue}
        options={[
          { value: 'commandes', label: 'Commandes', icon: <ClipboardList className="h-4 w-4" /> },
          { value: 'preparer', label: 'À préparer', icon: <Scissors className="h-4 w-4" /> },
        ]} />

      {com.loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : com.erreur ? (
        <Card><EmptyState compact title="Commandes indisponibles" description={com.erreur}
          action={<Button variant="secondary" onClick={() => com.reload()}>Réessayer</Button>} /></Card>
      ) : vue === 'preparer' ? (
        <Card>
          <CardHeader title="Tiges à couper" icon={<Scissors className="h-4 w-4" />}
            description={`Commandes confirmées ou prêtes à livrer d’ici ${jourLivraison(dans7jours, today, false)}, retards compris${devisSemaine ? ` · ${pluriel(devisSemaine, 'devis non compté', 'devis non comptés')}` : ''}`} />
          <CardContent>
            {aPreparer.lignes.length === 0 ? (
              <EmptyState compact icon={<Scissors className="h-5 w-5" />} title="Rien à couper cette semaine" description="Aucune commande ferme dans les 7 prochains jours." />
            ) : (
              <>
                <p className="num mb-4 text-sm text-fg-muted">
                  <strong className="text-2xl font-semibold text-fg">{aPreparer.total.toLocaleString('fr-FR')}</strong> tiges pour {pluriel(aPreparer.cmds.length, 'commande')}
                </p>
                <ul className="space-y-3">
                  {aPreparer.lignes.map(l => (
                    <li key={l.nom}>
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-fg">{l.nom}{l.libre && <span className="ml-1.5 text-xs font-normal text-fg-subtle">(libellé libre)</span>}</span>
                        <span className="num font-semibold">{pluriel(l.tiges, 'tige')}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <div className={cn('h-full rounded-full', l.libre ? 'bg-fg-subtle' : 'bg-primary')} style={{ width: `${(l.tiges / aPreparer.max) * 100}%` }} />
                      </div>
                      <p className="num mt-1 text-xs text-fg-subtle">{Array.from(l.detail.entries()).map(([c, t]) => `${c} ${t}`).join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Segmented label="Période" className="mb-4 sm:w-80" value={periode} onChange={setPeriode}
            options={[{ value: 'a-venir', label: `À livrer (${ouvertes.length})` }, { value: 'historique', label: `Historique (${historique.length})` }]} />
          {periode === 'historique' ? (
            historique.length === 0
              ? <Card><EmptyState compact title="Pas encore d’historique" description="Les commandes livrées ou annulées s’affichent ici." /></Card>
              : <ul className="space-y-2">{historique.map(o => <CarteCommande key={o.id} o={o} com={com} today={today} onEdit={() => setEdit({ open: true, order: o })} onLivrer={() => setALivrer(o)} onStatut={s => changerStatut(o, s)} onDelete={() => supprimer(o)} />)}</ul>
          ) : groupes.length === 0 ? (
            <Card><EmptyState image={photos.bouquetChampetre} title="Aucune commande à livrer"
              description="Fleuristes, abonnements, mariages : saisissez les commandes pour préparer la coupe et facturer en un geste."
              action={<Button onClick={nouvelle}><Plus className="h-4 w-4" /> Nouvelle commande</Button>} /></Card>
          ) : (
            <div className="space-y-6">
              {groupes.map(g => (
                <section key={g.id} aria-labelledby={`g-${g.id}`}>
                  <h2 id={`g-${g.id}`} className={cn('mb-2 flex items-baseline gap-2 font-sans text-base font-semibold', g.tone === 'danger' && 'text-danger')}>
                    {g.titre}
                    <span className="num text-sm font-normal text-fg-subtle">· {g.items.length}{g.sous ? ` · ${g.sous}` : ''}</span>
                  </h2>
                  <ul className="space-y-2">
                    {g.items.map(o => <CarteCommande key={o.id} o={o} com={com} today={today} onEdit={() => setEdit({ open: true, order: o })} onLivrer={() => setALivrer(o)} onStatut={s => changerStatut(o, s)} onDelete={() => supprimer(o)} />)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <CommandeDialog open={edit.open} onOpenChange={o => setEdit(x => ({ ...x, open: o }))} order={edit.order} com={com} catalog={catalog} />
      <LivrerDialog order={aLivrer} com={com} onClose={() => setALivrer(null)} />
    </div>
  )
}

function CarteCommande({ o, com, today, onEdit, onLivrer, onStatut, onDelete }: {
  o: Order; com: Commercial; today: string
  onEdit: () => void; onLivrer: () => void; onStatut: (s: OrderStatus) => void; onDelete: () => void
}) {
  const client = o.client_id ? com.clientsParId.get(o.client_id) : undefined
  const lignes = com.lignesParCommande.get(o.id) ?? []
  const t = totauxLignes(lignes)
  const suivant = STATUT_SUIVANT[o.status]
  const ouverte = OUVERTES.includes(o.status)
  const enRetard = ouverte && o.delivery_date < today
  return (
    <li className={cn('rounded-xl border bg-surface p-3 shadow-xs sm:p-4', enRetard ? 'border-danger/50' : 'border-border', !ouverte && 'opacity-80')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className={cn('flex w-14 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 text-center', enRetard ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg')}>
            <span className="text-2xs font-medium uppercase">{jourLivraison(o.delivery_date, today, false).split(' ')[0].slice(0, 3)}.</span>
            <span className="num text-lg font-semibold leading-tight">{Number(o.delivery_date.slice(8))}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate font-semibold text-fg">{client?.name ?? 'Client inconnu'}</span>
              {client && <Badge tone={kindTone[client.kind]}>{KIND_LABEL[client.kind]}</Badge>}
              {!ouverte && <Badge tone={statutTone[o.status]} dot>{STATUT_LABEL[o.status]}</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-fg-muted">
              <CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
              {jourLivraison(o.delivery_date, today)}{o.channel ? ` · ${o.channel}` : ''}
            </p>
            <p className="num mt-1 text-sm text-fg">
              {lignes.map(l => libelleQuantite(l.unit, Number(l.quantity), l.label)).join(' · ') || <span className="text-danger">Aucune ligne</span>}
            </p>
            {o.notes && <p className="mt-0.5 truncate text-xs italic text-fg-subtle">{o.notes}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="num font-semibold text-fg">{formatEuros(t.total_centimes)}</p>
            <p className="num text-xs text-fg-subtle">{pluriel(t.tiges, 'tige')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 md:w-[27rem] md:shrink-0 md:flex-row md:items-center md:justify-end">
          {ouverte && (
            <div className="flex gap-2">
              {o.status === 'devis' && suivant && (
                <Button variant="secondary" className="h-12 flex-1 whitespace-nowrap md:h-9 md:flex-none" onClick={() => onStatut(suivant)}><Check className="h-4 w-4" /> Confirmer</Button>
              )}
              {o.status === 'confirmee' && (
                <Button variant="secondary" className="h-12 flex-1 whitespace-nowrap md:h-9 md:flex-none" onClick={() => onStatut('prete')}><Check className="h-4 w-4" /> Prête</Button>
              )}
              {o.status !== 'devis' && (
                <Button className="h-12 flex-[2] whitespace-nowrap md:h-9 md:flex-none" onClick={onLivrer} disabled={lignes.length === 0}><Receipt className="h-4 w-4" /> Livrer et facturer</Button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            {ouverte && (
              <select aria-label="Changer le statut" value={o.status} onChange={e => onStatut(e.target.value as OrderStatus)}
                className="field-control h-11 min-w-0 flex-1 cursor-pointer pr-2 text-sm md:h-9 md:w-auto md:flex-none">
                {(['devis', 'confirmee', 'prete', 'annulee'] as OrderStatus[]).map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
              </select>
            )}
            {o.status === 'livree' && <Badge tone="green">Facturée</Badge>}
            {o.status !== 'livree' && (
              <Button variant="ghost" size="icon" aria-label="Modifier la commande" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            )}
            {(o.status === 'devis' || o.status === 'annulee') && (
              <Button variant="ghost" size="icon" aria-label="Supprimer la commande" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
