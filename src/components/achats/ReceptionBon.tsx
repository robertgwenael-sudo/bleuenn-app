'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCheck, PackageCheck } from 'lucide-react'
import { eurosEnCentimes, formatEuros, type PurchaseOrder } from '@/lib/domain'
import {
  depenseReception, formatQuantiteUnite, lireQuantite, quantiteCentiemes, resteLigne,
} from '@/lib/domain/achats'
import { Button, Dialog, Field, Input, NumberStepper } from '@/components/ui'
import type { Achats } from '@/hooks/useAchats'
import { pluriel } from './commun'

/** Valeur brute pour le NumberStepper (point décimal). */
const brut = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/**
 * Réception d'un colis, pensée pour le téléphone : pour chaque ligne, la
 * quantité reçue EN TOUT (cumul, livraisons précédentes comprises).
 */
export function ReceptionBon({ open, onOpenChange, bon, achats }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  bon: PurchaseOrder | null
  achats: Achats
}) {
  const lignes = bon ? achats.lignesParBon.get(bon.id) ?? [] : []
  const [recus, setRecus] = useState<Record<string, string>>({})
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !bon) return
    setRecus(Object.fromEntries((achats.lignesParBon.get(bon.id) ?? []).map(l => [l.id, brut(l.quantity_received)])))
    setDate(achats.aujourdhui)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bon?.id])

  if (!bon) return null

  const lus = lignes.map(l => {
    const q = lireQuantite(recus[l.id] ?? '')
    const erreur = q === null ? 'Quantité invalide'
      : quantiteCentiemes(q) < quantiteCentiemes(l.quantity_received) ? 'Ne peut pas diminuer'
        : quantiteCentiemes(q) > quantiteCentiemes(l.quantity) ? 'Plus que commandé' : null
    return { l, q, erreur, depense: q !== null && !erreur ? depenseReception(l, q) : 0 }
  })
  const bouge = lus.some(x => x.q !== null && !x.erreur && quantiteCentiemes(x.q) !== quantiteCentiemes(x.l.quantity_received))
  const port = !bon.shipping_expensed && bouge ? eurosEnCentimes(bon.shipping_amount) : 0
  const totalDepenses = lus.reduce((s, x) => s + x.depense, 0) + port
  const invalide = lus.some(x => x.erreur) || !date || (bon.order_date !== null && date < bon.order_date)

  const toutRecu = () => setRecus(Object.fromEntries(lignes.map(l => [l.id, brut(l.quantity)])))

  const valider = async () => {
    if (invalide) { toast.error('Réception incomplète', { description: 'Vérifiez les quantités et la date.' }); return }
    if (!bouge) { toast.info('Rien de nouveau à réceptionner'); return }
    setSaving(true)
    try {
      const r = await achats.receptionner(bon.id, lus.map(x => ({ id: x.l.id, quantity_received: x.q as number })), date)
      if (r) {
        toast.success(r.status === 'recu' ? `${bon.number} entièrement reçu` : `${bon.number} reçu partiellement`, {
          description: r.depenses_creees > 0
            ? `${pluriel(r.depenses_creees, 'dépense créée', 'dépenses créées')} · ${formatEuros(eurosEnCentimes(r.montant))}`
            : 'Aucune dépense nouvelle',
        })
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg"
      title={`Réceptionner ${bon.number ?? ''}`}
      description="Indiquez pour chaque ligne la quantité reçue en tout, livraisons précédentes comprises."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button onClick={valider} loading={saving} disabled={!bouge}>
          <PackageCheck className="h-4 w-4" /> Valider la réception
        </Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Date de réception" className="sm:w-52">
            <Input className="h-11" type="date" value={date} min={bon.order_date ?? undefined} onChange={e => setDate(e.target.value)} />
          </Field>
          <Button variant="secondary" size="lg" className="sm:ml-auto" onClick={toutRecu}><CheckCheck className="h-4 w-4" /> Tout est arrivé</Button>
        </div>
        <ul className="space-y-2">
          {lus.map(({ l, erreur, depense }) => (
            <li key={l.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-fg">{l.label}{l.variety ? <span className="font-normal text-fg-muted"> « {l.variety} »</span> : null}</p>
                <p className="num text-xs text-fg-muted">
                  Commandé {formatQuantiteUnite(l.quantity, l.unit)} · déjà reçu {formatQuantiteUnite(l.quantity_received, l.unit)}
                  {resteLigne(l) === 0 ? ' · complet' : ''}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[16rem_auto_minmax(0,1fr)]">
                <div>
                  <label htmlFor={`recu-${l.id}`} className="mb-1 block text-xs font-medium text-fg-muted">Reçu en tout</label>
                  <NumberStepper id={`recu-${l.id}`} label={`reçu ${l.label}`} value={recus[l.id] ?? ''} min={0}
                    aria-invalid={erreur ? true : undefined}
                    onChange={v => setRecus(r => ({ ...r, [l.id]: v }))} />
                </div>
                <Button variant="ghost" size="lg" onClick={() => setRecus(r => ({ ...r, [l.id]: brut(l.quantity) }))}
                  aria-label={`Tout reçu pour ${l.label}`}>Tout</Button>
                <p className="col-span-2 text-xs sm:col-span-1 sm:text-right" aria-live="polite">
                  {erreur ? <span className="font-medium text-danger">{erreur}</span>
                    : depense > 0 ? <span className="text-fg-muted">Dépense créée : <span className="num font-semibold text-fg">{formatEuros(depense)}</span></span>
                      : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg-muted">
          {bouge
            ? <>Dépenses créées dans <strong className="text-fg">Coûts &amp; rentabilité</strong> : <span className="num font-semibold text-fg">{formatEuros(totalDepenses)}</span>
              {port > 0 ? <> dont {formatEuros(port)} de port</> : null}.</>
            : 'Rien de nouveau : aucune dépense ne sera créée.'}
        </p>
      </div>
    </Dialog>
  )
}
