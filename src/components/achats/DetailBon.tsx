'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle, Ban, CalendarCheck, ClipboardCopy, PackageCheck, Pencil, Printer, ReceiptText, Send, Trash2,
} from 'lucide-react'
import { eurosEnCentimes, formatEuros, type PurchaseOrder } from '@/lib/domain'
import {
  alertesConditions, formatQuantiteUnite, retardBon, texteEmailBon, totalLigne, totauxBon,
} from '@/lib/domain/achats'
import { LIBELLES_CATEGORIES } from '@/lib/domain/couts'
import { Badge, Button, Dialog, Field, Input, useConfirm } from '@/components/ui'
import type { Achats } from '@/hooks/useAchats'
import { BadgeRetard, dateCourte, euros, StatutBon } from './commun'

/** Copie un texte dans le presse-papiers ; signale l'échec au lieu de l'avaler. */
export async function copier(texte: string, quoi: string) {
  try {
    await navigator.clipboard.writeText(texte)
    toast.success(`${quoi} copié`, { description: 'Collez-le dans votre messagerie.' })
  } catch (e) {
    console.error('[achats] presse-papiers', e)
    toast.error('Copie impossible', { description: 'Le navigateur a refusé l’accès au presse-papiers.' })
  }
}

/** Fiche d'un bon : lignes, totaux, dépenses créées et actions selon le statut. */
export function DetailBon({ bon, onOpenChange, achats, nomFerme, onModifier, onReceptionner }: {
  bon: PurchaseOrder | null
  onOpenChange: (o: boolean) => void
  achats: Achats
  nomFerme: string
  onModifier: (b: PurchaseOrder) => void
  onReceptionner: (b: PurchaseOrder) => void
}) {
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  if (!bon) return null

  const f = achats.suppliers.find(s => s.id === bon.supplier_id) ?? null
  const lignes = achats.lignesParBon.get(bon.id) ?? []
  const t = totauxBon(lignes, bon.shipping_amount)
  const depenses = achats.depensesParBon.get(bon.id) ?? []
  const retard = retardBon(bon, achats.aujourdhui)
  const alertes = bon.status === 'brouillon' ? alertesConditions(t.lignes, f) : []
  const saison = achats.seasons.find(s => s.id === bon.season_id)
  const titre = bon.number ?? 'Brouillon'

  const action = async (nom: string, fn: () => Promise<unknown>) => {
    setBusy(nom)
    try { return await fn() } finally { setBusy(null) }
  }
  const envoyer = async () => {
    if (t.prixManquants) { toast.error('Prix à saisir', { description: 'Complétez les prix avant d’envoyer le bon.' }); return }
    const ok = await confirm({
      title: 'Envoyer ce bon ?',
      description: <>Il reçoit son numéro définitif et ne sera plus modifiable (lignes, quantités, prix, port).{alertes.length ? <><br /><strong>{alertes.map(a => a.message).join(' · ')}</strong></> : null}</>,
      confirmLabel: 'Envoyer',
    })
    if (!ok) return
    const r = await action('envoyer', () => achats.envoyer(bon.id)) as PurchaseOrder | null
    if (r) toast.success(`Bon ${r.number} envoyé`, { description: `${f?.name ?? ''} · imprimez-le ou copiez-le pour un email` })
  }
  const annuler = async () => {
    const ok = await confirm({ title: `Annuler ${titre} ?`, description: 'Le bon reste dans l’historique, marqué annulé. Son numéro n’est pas réutilisé.', confirmLabel: 'Annuler le bon', cancelLabel: 'Garder', destructive: true })
    if (!ok) return
    if (await action('annuler', () => achats.annuler(bon.id))) toast.success(`${titre} annulé`)
  }
  const supprimer = async () => {
    const ok = await confirm({ title: 'Supprimer ce brouillon ?', description: 'Il n’a jamais été envoyé : il disparaît définitivement.', confirmLabel: 'Supprimer', destructive: true })
    if (!ok) return
    if (await action('supprimer', () => achats.supprimerBrouillon(bon.id))) { toast.success('Brouillon supprimé'); onOpenChange(false) }
  }
  const confirmer = async () => {
    if (await action('confirmer', () => achats.confirmer(bon.id, confirmation || null))) { toast.success(`${titre} confirmé par le fournisseur`); setConfirmation(null) }
  }
  const email = () => f && copier(texteEmailBon({ ferme: nomFerme, bon, fournisseur: f, lignes }), 'Texte du bon')

  return (
    <Dialog open={!!bon} onOpenChange={onOpenChange} size="lg"
      title={<span className="flex flex-wrap items-center gap-2">{titre} <span className="flex flex-wrap gap-1.5 font-sans"><StatutBon status={bon.status} /><BadgeRetard retard={retard} /></span></span>}
      description={<>{f?.name ?? 'Fournisseur inconnu'} · {saison?.name ?? 'saison inconnue'}</>}
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Link href={`/bon-de-commande/${bon.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 text-sm font-medium text-fg shadow-xs hover:bg-surface-2">
          <Printer className="h-4 w-4" /> {bon.status === 'brouillon' ? 'Aperçu' : 'Imprimer'}
        </Link>
        {bon.status !== 'brouillon' && bon.status !== 'annule' && f && <Button variant="secondary" onClick={email}><ClipboardCopy className="h-4 w-4" /> Copier pour un email</Button>}
        {bon.status === 'brouillon' && <>
          <Button variant="danger-ghost" onClick={supprimer} loading={busy === 'supprimer'}><Trash2 className="h-4 w-4" /> Supprimer</Button>
          <Button variant="secondary" onClick={() => onModifier(bon)}><Pencil className="h-4 w-4" /> Modifier</Button>
          <Button onClick={envoyer} loading={busy === 'envoyer'}><Send className="h-4 w-4" /> Envoyer</Button>
        </>}
        {(bon.status === 'envoye' || bon.status === 'confirme') &&
          <Button variant="danger-ghost" onClick={annuler} loading={busy === 'annuler'}><Ban className="h-4 w-4" /> Annuler le bon</Button>}
        {bon.status === 'envoye' && <Button variant="secondary" onClick={() => setConfirmation(bon.expected_date ?? '')}><CalendarCheck className="h-4 w-4" /> Marquer confirmé</Button>}
        {(bon.status === 'envoye' || bon.status === 'confirme' || bon.status === 'recu_partiel') &&
          <Button onClick={() => onReceptionner(bon)}><PackageCheck className="h-4 w-4" /> Réceptionner</Button>}
      </div>}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-fg-muted">Commandé le</dt><dd>{dateCourte(bon.order_date, Number(achats.aujourdhui.slice(0, 4)))}</dd></div>
          <div><dt className="text-xs text-fg-muted">Livraison prévue</dt><dd>{dateCourte(bon.expected_date, Number(achats.aujourdhui.slice(0, 4)))}</dd></div>
          <div><dt className="text-xs text-fg-muted">Dernière réception</dt><dd>{dateCourte(bon.received_date, Number(achats.aujourdhui.slice(0, 4)))}</dd></div>
          <div><dt className="text-xs text-fg-muted">Total</dt><dd className="num font-semibold">{formatEuros(t.total)}{t.prixManquants ? ' + prix à saisir' : ''}</dd></div>
        </dl>

        {confirmation !== null && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/50 p-3 sm:flex-row sm:items-end">
            <Field label="Livraison annoncée par le fournisseur" className="sm:w-60">
              <Input type="date" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
            </Field>
            <Button onClick={confirmer} loading={busy === 'confirmer'}>Enregistrer la confirmation</Button>
            <Button variant="ghost" onClick={() => setConfirmation(null)}>Fermer</Button>
          </div>
        )}

        {alertes.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-warning-soft p-3">
            {alertes.map(a => <li key={a.type} className="flex items-start gap-1.5 text-xs font-medium text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{a.message}</li>)}
          </ul>
        )}

        <ul className="divide-y divide-border rounded-xl border border-border">
          {lignes.map(l => {
            const tl = totalLigne(l)
            return (
              <li key={l.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {l.label}{l.variety ? <span className="font-normal text-fg-muted"> « {l.variety} »</span> : null}
                    {l.organic ? <Badge tone="green" className="ml-1.5">Bio</Badge> : null}
                  </p>
                  <p className="num text-xs text-fg-muted">
                    {formatQuantiteUnite(l.quantity, l.unit)} × {l.unit_price === null ? 'prix à saisir' : euros(l.unit_price)}
                    {l.supplier_ref ? ` · réf. ${l.supplier_ref}` : ''}
                    {bon.status !== 'brouillon' && bon.status !== 'annule' ? ` · reçu ${formatQuantiteUnite(l.quantity_received, l.unit)}` : ''}
                  </p>
                </div>
                <span className="num shrink-0 font-semibold">{tl === null ? '—' : formatEuros(tl)}</span>
              </li>
            )
          })}
          {t.port > 0 && <li className="flex justify-between px-3 py-2.5 text-sm"><span className="text-fg-muted">Frais de port</span><span className="num font-semibold">{formatEuros(t.port)}</span></li>}
        </ul>

        {bon.notes && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">{bon.notes}</p>}

        {depenses.length > 0 && (
          <section aria-labelledby={`dep-${bon.id}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 id={`dep-${bon.id}`} className="font-sans text-sm font-semibold">Dépenses créées ({depenses.length})</h3>
              <a href="#rentabilite" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <ReceiptText className="h-3.5 w-3.5" aria-hidden /> Voir dans Coûts &amp; rentabilité
              </a>
            </div>
            <ul className="space-y-1 text-xs text-fg-muted">
              {depenses.map(d => (
                <li key={d.id} className="flex justify-between gap-2">
                  <span className="truncate">{dateCourte(d.date)} · {LIBELLES_CATEGORIES[d.category] ?? d.category} · {d.notes}</span>
                  <span className="num shrink-0 font-semibold text-fg">{formatEuros(eurosEnCentimes(d.amount))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  )
}
