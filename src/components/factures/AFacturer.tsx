'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, FileText, Receipt, Settings } from 'lucide-react'
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Textarea, cn } from '@/components/ui'
import { formatEuros, type Client } from '@/lib/domain'
import { totalVente } from '@/lib/domain/ventes'
import {
  controlerSelection, estClientProfessionnel, grouperAFacturer, reglagesManquants, type GroupeAFacturer,
} from '@/lib/domain/factures'
import { dejaAffichee, type Factures, type VenteAvecLignes } from '@/hooks/useFactures'
import { KIND_LABEL, pluriel } from '@/components/commercial/commun'
import { dateFr } from './commun'

/** Ventes non facturées, groupées par client, à cocher puis facturer. */
export function AFacturer({ f, onEmise, versReglages }: {
  f: Factures
  onEmise: (invoiceId: string) => void
  versReglages: () => void
}) {
  const groupes = useMemo(
    () => grouperAFacturer(f.ventes, f.liens, f.clients, v => totalVente(v)),
    [f.ventes, f.liens, f.clients],
  )
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [dialogue, setDialogue] = useState<GroupeAFacturer<VenteAvecLignes> | null>(null)

  const basculer = (id: string) => setCoches(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toutGroupe = (g: GroupeAFacturer<VenteAvecLignes>, oui: boolean) =>
    setCoches(c => { const n = new Set(c); for (const v of g.ventes) if (oui) n.add(v.id); else n.delete(v.id); return n })

  const choisis = (g: GroupeAFacturer<VenteAvecLignes>) => g.ventes.filter(v => coches.has(v.id))

  const carte = (g: GroupeAFacturer<VenteAvecLignes>) => {
        const sel = choisis(g)
        const tous = sel.length === g.ventes.length
        const client = g.client_id ? f.clientsParId.get(g.client_id) : undefined
        const totalSel = sel.reduce((s, v) => s + totalVente(v), 0)
        return (
          <Card key={g.cle} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={tous}
                  ref={el => { if (el) el.indeterminate = sel.length > 0 && !tous }}
                  onChange={e => toutGroupe(g, e.target.checked)} aria-label={`Toutes les ventes de ${g.nom}`} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-fg">{g.nom}</span>
                  <span className="text-xs text-fg-muted">
                    {client ? KIND_LABEL[client.kind] : 'Sans fiche client'} · {pluriel(g.ventes.length, 'vente')} · {formatEuros(g.total)}
                  </span>
                </span>
              </label>
              <Button size="sm" disabled={sel.length === 0} onClick={() => setDialogue(g)}
                aria-label={`Émettre la facture pour ${g.nom}`}>
                <FileText className="h-4 w-4" aria-hidden /> Émettre la facture{sel.length > 0 ? ` · ${formatEuros(totalSel)}` : ''}
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {g.ventes.map(v => (
                <li key={v.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60 sm:px-5">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={coches.has(v.id)} onChange={() => basculer(v.id)}
                      aria-label={`Vente du ${dateFr(v.date)} · ${formatEuros(totalVente(v))}`} />
                    <span className="w-24 shrink-0 text-sm text-fg-muted">{dateFr(v.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{v.cultures_sold || '—'}</span>
                    <Badge tone="neutral" className="hidden sm:inline-flex">{v.channel}</Badge>
                    <span className="num w-24 shrink-0 text-right text-sm font-semibold">{formatEuros(totalVente(v))}</span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        )
  }
  const avecFiche = groupes.filter(g => g.client_id)
  const sansFiche = groupes.filter(g => !g.client_id)

  if (groupes.length === 0) {
    return <Card><EmptyState icon={<Receipt className="h-6 w-6" aria-hidden />} title="Tout est facturé"
      description="Chaque vente enregistrée est couverte par une facture. Les nouvelles ventes apparaîtront ici." /></Card>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Cochez les ventes d’un même client : elles iront sur une seule facture (par exemple la facture mensuelle d’un fleuriste).
        Une vente sans fiche client se facture seule.
      </p>
      {avecFiche.map(carte)}
      {avecFiche.length === 0 && <p className="text-sm text-fg-subtle">Aucune vente non facturée pour un client avec fiche.</p>}
      {sansFiche.length > 0 && (
        <details className="group rounded-card border border-border bg-surface-2/40 p-3 sm:p-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-fg">
            Ventes sans fiche client · {sansFiche.length}
            <span className="ml-2 font-normal text-fg-muted">marchés, abonnements… à facturer seulement sur demande, une par une</span>
          </summary>
          <div className="mt-3 space-y-3">{sansFiche.map(carte)}</div>
        </details>
      )}
      {dialogue && (
        <EmissionDialog f={f} groupe={dialogue} ventes={choisis(dialogue)} client={dialogue.client_id ? f.clientsParId.get(dialogue.client_id) ?? null : null}
          onClose={() => setDialogue(null)} versReglages={() => { setDialogue(null); versReglages() }}
          onEmise={id => { setCoches(new Set()); setDialogue(null); onEmise(id) }} />
      )}
    </div>
  )
}

function EmissionDialog({ f, groupe, ventes, client, onClose, onEmise, versReglages }: {
  f: Factures
  groupe: GroupeAFacturer<VenteAvecLignes>
  ventes: VenteAvecLignes[]
  client: Client | null
  onClose: () => void
  onEmise: (id: string) => void
  versReglages: () => void
}) {
  const [pro, setPro] = useState(estClientProfessionnel(client?.kind))
  const [delai, setDelai] = useState(f.billing?.delai_paiement_jours == null ? '' : String(f.billing.delai_paiement_jours))
  const [siren, setSiren] = useState('')
  const [livraison, setLivraison] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const total = ventes.reduce((s, v) => s + totalVente(v), 0)
  const manque = reglagesManquants(f.billing, { professionnel: pro })
  const sansAdresse = !client?.address?.trim()
  const bloque = (pro && (sansAdresse || !groupe.nom)) || manque.length > 0
  const nDelai = delai.trim() === '' ? null : Number(delai)
  const delaiOk = nDelai === null || (Number.isInteger(nDelai) && nDelai >= 0 && nDelai <= 365)
  const erreurSel = controlerSelection(ventes, f.factureDeVente)

  const emettre = async () => {
    if (erreurSel) { toast.error(erreurSel); return }
    setBusy(true)
    try {
      const { id, numero } = await f.emettreFacture(ventes.map(v => v.id), {
        professionnel: pro, delai_jours: nDelai, client_siren: siren.replace(/\s/g, ''), adresse_livraison: livraison, notes,
      })
      toast.success(numero ? `Facture ${numero} émise` : 'Facture émise', { description: `${groupe.nom} · ${formatEuros(total)}` })
      onEmise(id)
    } catch (e) {
      if (!dejaAffichee(e)) toast.error('Émission impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }} title="Émettre la facture" size="lg"
      description={`${groupe.nom} · ${pluriel(ventes.length, 'vente')} · ${formatEuros(total)}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={emettre} loading={busy} disabled={bloque || !delaiOk || !!erreurSel}>
          <FileText className="h-4 w-4" aria-hidden /> Émettre la facture · {formatEuros(total)}
        </Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          Une fois émise, la facture reçoit le numéro suivant et ne se modifie plus. Une erreur se corrige par un avoir.
        </p>

        {manque.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <p className="font-medium">Mentions obligatoires manquantes dans les réglages :</p>
            <ul className="mt-1 list-inside list-disc">{manque.map(m => <li key={m.champ}>{m.libelle}</li>)}</ul>
            <Button variant="secondary" size="sm" className="mt-2" onClick={versReglages}><Settings className="h-4 w-4" aria-hidden /> Compléter les réglages</Button>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={pro} onChange={e => setPro(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium text-fg">Client professionnel</span>
            <span className="block text-xs text-fg-muted">Ajoute les pénalités de retard et l’indemnité forfaitaire ; exige le nom et l’adresse du client.</span>
          </span>
        </label>

        {sansAdresse && (
          <p className={cn('flex gap-2 rounded-lg px-3 py-2 text-xs', pro ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Adresse du client inconnue{client ? ' (fiche client)' : ''}.{' '}
              {pro ? 'Obligatoire pour un client professionnel : complétez la fiche client.' : 'Facultative pour un particulier sous le seuil réglementaire (150 € à ce jour, à faire confirmer par votre comptable).'}
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Délai de paiement (jours)" hint="Vide ou 0 : à réception" error={!delaiOk ? 'Entre 0 et 365' : undefined}>
            <Input type="number" inputMode="numeric" min={0} max={365} value={delai} onChange={e => setDelai(e.target.value)} />
          </Field>
          <Field label="SIREN du client" hint="Facultatif (facturation électronique 2027)">
            <Input inputMode="numeric" value={siren} onChange={e => setSiren(e.target.value)} />
          </Field>
          <Field label="Adresse de livraison" hint="Facultative, si différente" className="sm:col-span-2">
            <Textarea rows={2} value={livraison} onChange={e => setLivraison(e.target.value)} />
          </Field>
          <Field label="Note sur la facture" hint="Facultative, par ex. « Commandes de novembre »" className="sm:col-span-2">
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Ventes facturées</p>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {ventes.map(v => (
              <li key={v.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 text-fg-muted">{dateFr(v.date)}</span>
                <span className="min-w-0 flex-1 truncate">{v.cultures_sold || '—'}</span>
                <span className="num font-semibold">{formatEuros(totalVente(v))}</span>
              </li>
            ))}
          </ul>
        </div>
        {ventes.length === 0 && <EmptyState compact title="Aucune vente cochée" />}
      </div>
    </Dialog>
  )
}
