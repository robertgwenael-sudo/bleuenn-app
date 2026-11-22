'use client'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Ban, Banknote, FileMinus, Printer, Undo2 } from 'lucide-react'
import { Button, Dialog, Field, Input, Select, Textarea, useConfirm, cn } from '@/components/ui'
import { eurosEnCentimes, formatEuros, formatTaux, PAYMENT_MODES, type Invoice, type PaymentMode } from '@/lib/domain'
import {
  MODE_PAIEMENT_LIBELLE, controlerPaiement, paiementsContrepassables, type SituationFacture,
} from '@/lib/domain/factures'
import { dejaAffichee, type Factures } from '@/hooks/useFactures'
import { StatutBadge } from './ListeFactures'
import { dateFr, lireMontant, quantiteFr } from './commun'

/** « 12,50 » pour pré-remplir un champ montant. */
const enSaisie = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`

/** Fiche d'une facture ou d'un avoir : lignes, paiements, avoir, impression. */
export function FicheFacture({ f, facture, s, aujourdhui, onClose, onOuvrir }: {
  f: Factures
  facture: Invoice
  s: SituationFacture
  aujourdhui: string
  onClose: () => void
  onOuvrir: (id: string) => void
}) {
  const confirm = useConfirm()
  const lignes = f.lignesParFacture.get(facture.id) ?? []
  const paiements = f.paiementsParFacture.get(facture.id) ?? []
  const liee = f.facturesParId.get(facture.annulee_par ?? facture.avoir_de ?? '') ?? null
  const contrepassables = new Set(paiementsContrepassables(paiements).map(p => p.id))
  const [saisie, setSaisie] = useState<null | 'paiement' | 'remboursement'>(null)
  const [avoir, setAvoir] = useState(false)
  const estFacture = facture.kind === 'facture'

  const contrepasser = async (pid: string) => {
    const p = paiements.find(x => x.id === pid)!
    const okc = await confirm({
      title: 'Contre-passer ce paiement ?',
      description: `${MODE_PAIEMENT_LIBELLE[p.mode]} du ${dateFr(p.date)} · ${formatEuros(eurosEnCentimes(p.amount))}. Un paiement ne se supprime pas : une écriture négative du même montant l’annule, et les deux restent visibles.`,
      confirmLabel: 'Contre-passer', destructive: true,
    })
    if (!okc) return
    try {
      await f.enregistrerPaiement(facture.id, {
        date: aujourdhui, montant_centimes: -eurosEnCentimes(p.amount), mode: p.mode,
        reference: p.reference ?? undefined, notes: 'Contre-passation', contrepasse_de: p.id,
      })
      toast.success('Paiement contre-passé')
    } catch (e) { if (!dejaAffichee(e)) toast.error(String(e)) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }} size="lg"
      title={<span className="flex flex-wrap items-center gap-2">{estFacture ? 'Facture' : 'Avoir'} <span className="num">{facture.numero}</span></span>}
      description={`${facture.acheteur?.nom || 'Client particulier'} · émise le ${dateFr(facture.date_emission)}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
        <Link href={`/facture/${facture.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 text-sm font-medium text-fg shadow-xs hover:bg-surface-2">
          <Printer className="h-4 w-4" aria-hidden /> Imprimer / PDF
        </Link>
      </>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatutBadge s={s} />
          {liee && (
            <button type="button" className="text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => onOuvrir(liee.id)}>
              {estFacture ? `Annulée par l’avoir ${liee.numero}` : `Avoir sur la facture ${liee.numero}`}
            </button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Chiffre label={facture.assujettie_tva ? 'Total TTC' : 'Total'} valeur={formatEuros(s.total)} />
          {estFacture && <Chiffre label="Payé" valeur={formatEuros(s.paye)} />}
          {estFacture && <Chiffre label={s.reste < 0 ? 'À rembourser' : 'Reste dû'} valeur={formatEuros(Math.abs(s.reste))} alerte={s.statut === 'en_retard'} />}
          {estFacture && <Chiffre label="Échéance" valeur={dateFr(facture.date_echeance)} alerte={s.statut === 'en_retard'} />}
        </dl>

        {facture.motif && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm"><span className="text-fg-muted">Motif de l’avoir : </span>{facture.motif}</p>}

        <section>
          <h3 className="mb-1.5 text-xs font-medium text-fg-muted">Lignes figées à l’émission</h3>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {lignes.map(l => (
              <li key={l.id} className="flex items-baseline gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{l.label}
                  <span className="text-xs text-fg-subtle"> · {quantiteFr(l.quantity)} × {formatEuros(eurosEnCentimes(l.unit_price))}</span></span>
                <span className="num font-semibold">{formatEuros(eurosEnCentimes(l.line_total))}{facture.assujettie_tva ? ` HT · ${l.taux_tva_pb === null ? '' : formatTaux(l.taux_tva_pb)}` : ''}</span>
              </li>
            ))}
          </ul>
          {facture.assujettie_tva ? (
            <dl className="num mt-2 space-y-0.5 text-sm" aria-label="Ventilation de la TVA">
              <div className="flex justify-between"><dt className="text-fg-muted">Total HT</dt><dd>{formatEuros(eurosEnCentimes(facture.total_ht))}</dd></div>
              {facture.ventilation_tva.map(v => (
                <div key={v.taux_pb} className="flex justify-between text-xs text-fg-muted">
                  <dt>TVA {formatTaux(v.taux_pb)} sur {formatEuros(eurosEnCentimes(v.base_ht))}</dt><dd>{formatEuros(eurosEnCentimes(v.tva))}</dd>
                </div>
              ))}
              <div className="flex justify-between font-semibold"><dt>Total TTC</dt><dd>{formatEuros(eurosEnCentimes(facture.total))}</dd></div>
            </dl>
          ) : (
            <p className="mt-1.5 text-xs text-fg-subtle">{facture.mention_tva}</p>
          )}
          {facture.commandes?.length > 0 && (
            <p className="mt-1.5 text-xs text-fg-muted">Bon{facture.commandes.length > 1 ? 's' : ''} de commande : {facture.commandes.map(c => c.numero ?? 'sans numéro').join(', ')}</p>
          )}
        </section>

        {estFacture && (
          <section aria-label="Paiements">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-fg-muted">Paiements</h3>
              {!facture.annulee_par && s.reste > 0 && !saisie && (
                <Button size="sm" onClick={() => setSaisie('paiement')}><Banknote className="h-4 w-4" aria-hidden /> Enregistrer un paiement</Button>
              )}
              {facture.annulee_par && s.reste < 0 && !saisie && (
                <Button size="sm" variant="secondary" onClick={() => setSaisie('remboursement')}><Undo2 className="h-4 w-4" aria-hidden /> Enregistrer le remboursement</Button>
              )}
            </div>
            {paiements.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-fg-muted">Aucun paiement enregistré.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {paiements.map(p => {
                  const m = eurosEnCentimes(p.amount)
                  const annule = paiements.some(x => x.contrepasse_de === p.id)
                  return (
                    <li key={p.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2', annule && 'text-fg-subtle line-through decoration-fg-subtle/60')}>
                      <span className="w-24 shrink-0 text-fg-muted">{dateFr(p.date)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {MODE_PAIEMENT_LIBELLE[p.mode]}{p.reference ? ` · ${p.reference}` : ''}
                        {p.contrepasse_de ? ' · contre-passation' : ''}{p.notes && !p.contrepasse_de ? ` · ${p.notes}` : ''}
                      </span>
                      <span className={cn('num font-semibold', m < 0 && 'text-danger')}>{formatEuros(m)}</span>
                      {contrepassables.has(p.id) && (
                        <Button variant="ghost" size="sm" onClick={() => contrepasser(p.id)} aria-label={`Contre-passer le paiement du ${dateFr(p.date)}`}>
                          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Contre-passer
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {saisie && (
              <SaisiePaiement f={f} facture={facture} s={s} remboursement={saisie === 'remboursement'} aujourdhui={aujourdhui}
                onDone={() => setSaisie(null)} />
            )}
          </section>
        )}

        {estFacture && !facture.annulee_par && (
          <section className="rounded-lg border border-danger/25 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-fg-muted">Une erreur ? La facture ne se modifie pas : un avoir l’annule en totalité et libère ses ventes pour une nouvelle facture.</p>
              {!avoir && <Button variant="danger-ghost" size="sm" onClick={() => setAvoir(true)}><FileMinus className="h-4 w-4" aria-hidden /> Émettre un avoir</Button>}
            </div>
            {avoir && <SaisieAvoir f={f} facture={facture} onDone={id => { setAvoir(false); if (id) onOuvrir(id) }} />}
          </section>
        )}
      </div>
    </Dialog>
  )
}

function Chiffre({ label, valeur, alerte }: { label: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className={cn('num mt-0.5 font-semibold', alerte ? 'text-danger' : 'text-fg')}>{valeur}</dd>
    </div>
  )
}

function SaisiePaiement({ f, facture, s, remboursement, aujourdhui, onDone }: {
  f: Factures; facture: Invoice; s: SituationFacture; remboursement: boolean; aujourdhui: string; onDone: () => void
}) {
  const [date, setDate] = useState(aujourdhui)
  const [montant, setMontant] = useState(enSaisie(Math.abs(s.reste)))
  const [mode, setMode] = useState<PaymentMode>('virement')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState(remboursement ? 'Remboursement après avoir' : '')
  const [busy, setBusy] = useState(false)
  const c = lireMontant(montant)
  const signe = remboursement ? -1 : 1
  const erreur = c === null ? 'Montant illisible'
    : controlerPaiement(facture, f.paiementsParFacture.get(facture.id) ?? [], { montant: signe * c, notes })

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (erreur || c === null || !date) return
    setBusy(true)
    try {
      await f.enregistrerPaiement(facture.id, { date, montant_centimes: signe * c, mode, reference, notes })
      toast.success(remboursement ? 'Remboursement enregistré' : 'Paiement enregistré', { description: `${facture.numero} · ${formatEuros(c)}` })
      onDone()
    } catch (err) {
      if (!dejaAffichee(err)) toast.error(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={enregistrer} className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2/50 p-3" aria-label={remboursement ? 'Remboursement' : 'Nouveau paiement'}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label={remboursement ? 'Montant remboursé' : 'Montant reçu'} error={montant.trim() && erreur ? erreur : undefined}>
          <Input inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={e => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{MODE_PAIEMENT_LIBELLE[m]}</option>)}
          </Select>
        </Field>
        <Field label="Référence" hint="N° de chèque…"><Input value={reference} onChange={e => setReference(e.target.value)} /></Field>
        <Field label="Notes" className="col-span-2 sm:col-span-4"><Textarea rows={1} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Annuler</Button>
        <Button type="submit" size="sm" loading={busy} disabled={!!erreur || !date}>
          {remboursement ? 'Enregistrer le remboursement' : 'Enregistrer le paiement'}{c ? ` · ${formatEuros(c)}` : ''}
        </Button>
      </div>
    </form>
  )
}

/** Avoir : motif obligatoire et confirmation nominative (recopier le numéro de la facture). */
function SaisieAvoir({ f, facture, onDone }: { f: Factures; facture: Invoice; onDone: (avoirId: string | null) => void }) {
  const [motif, setMotif] = useState('')
  const [numero, setNumero] = useState('')
  const [busy, setBusy] = useState(false)
  const confirme = numero.trim().toUpperCase() === facture.numero.toUpperCase()

  const emettre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirme || !motif.trim()) return
    setBusy(true)
    try {
      const r = await f.emettreAvoir(facture.id, motif.trim())
      toast.success(r.numero ? `Avoir ${r.numero} émis` : 'Avoir émis', { description: `Facture ${facture.numero} annulée, ses ventes sont à nouveau à facturer.` })
      onDone(r.id)
    } catch (err) {
      if (!dejaAffichee(err)) toast.error(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={emettre} className="mt-3 space-y-3" aria-label="Émettre un avoir">
      <p className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>L’avoir reçoit son propre numéro, au montant de {formatEuros(-eurosEnCentimes(facture.total))}. Il est définitif.</span>
      </p>
      <Field label="Motif de l’avoir">
        <Textarea rows={2} value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex. erreur de prix, vente annulée…" />
      </Field>
      <Field label={`Pour confirmer, recopiez le numéro ${facture.numero}`}>
        <Input value={numero} onChange={e => setNumero(e.target.value)} autoComplete="off" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDone(null)}>Annuler</Button>
        <Button type="submit" variant="danger" size="sm" loading={busy} disabled={!confirme || !motif.trim()}>
          Émettre l’avoir sur {facture.numero}
        </Button>
      </div>
    </form>
  )
}
