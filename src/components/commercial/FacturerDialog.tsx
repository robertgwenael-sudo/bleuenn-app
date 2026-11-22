'use client'
// « Facturer » une vente issue d'une commande livrée : la facture reprend
// les lignes de la vente telles quelles (aucune ressaisie), cite le bon de
// commande d'origine, et la TVA est ventilée par la base (emettre_facture).
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import {
  essayerVentiler, formatEuros, formatTaux, montantLigne, type Sale, type SaleLine,
} from '@/lib/domain'
import { estClientProfessionnel } from '@/lib/domain/factures'
import { Button, Dialog, Field, Select } from '@/components/ui'
import { dejaAffichee, type Commercial } from '@/hooks/useCommercial'
import { libelleQuantite } from './commun'

export function FacturerDialog({ vente, com, onClose, onEmise }: {
  vente: (Sale & { lignes: SaleLine[] }) | null
  com: Commercial
  onClose: () => void
  onEmise?: (numero: string | null) => void
}) {
  const client = vente?.client_id ? com.clientsParId.get(vente.client_id) ?? null : null
  const commande = vente ? com.orders.find(o => o.id === vente.order_id || o.sale_id === vente.id) ?? null : null
  const [pro, setPro] = useState(false)
  const [defaut, setDefaut] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (vente) { setPro(estClientProfessionnel(client?.kind)); setDefaut('') } }, [vente, client?.kind])

  const lignes = useMemo(() => vente?.lignes ?? [], [vente])
  const sansTaux = com.assujettie ? (lignes.length === 0 ? 1 : lignes.filter(l => l.taux_tva_pb === null || l.taux_tva_pb === undefined).length) : 0
  const tauxDefaut = com.taux.find(t => t.id === defaut)
  const parId = new Map(com.taux.map(t => [t.id, t]))
  const calc = essayerVentiler(lignes.map(l => {
    const t = l.taux_tva_pb ?? tauxDefaut?.taux_pb ?? null
    return { montant_ht: montantLigne(l), taux_pb: t, libelle: (l.vat_rate_id && parId.get(l.vat_rate_id)?.libelle) || tauxDefaut?.libelle || null }
  }), com.assujettie)

  const emettre = async () => {
    if (!vente) return
    setBusy(true)
    try {
      const r = await com.facturerVente(vente.id, { professionnel: pro, vat_rate_id: sansTaux > 0 ? defaut || null : null })
      toast.success(r.numero ? `Facture ${r.numero} émise` : 'Facture émise', {
        description: `${client?.name ?? vente.client ?? 'Client'}${commande?.numero ? ` · bon ${commande.numero}` : ''}`,
      })
      onEmise?.(r.numero)
      onClose()
    } catch (e) {
      if (!dejaAffichee(e)) toast.error('Émission impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const total = calc.ok ? (com.assujettie ? calc.t.total_ttc : calc.t.total_ht) : null
  return (
    <Dialog open={!!vente} onOpenChange={o => { if (!o) onClose() }} title="Facturer la vente"
      description={vente ? `${client?.name ?? vente.client ?? 'Sans client'}${commande?.numero ? ` · bon de commande ${commande.numero}` : ''}` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={emettre} loading={busy} disabled={!calc.ok}>
          <FileText className="h-4 w-4" aria-hidden /> Émettre la facture{total !== null ? ` · ${formatEuros(total)}${com.assujettie ? ' TTC' : ''}` : ''}
        </Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
          Les lignes de la vente sont reprises telles quelles. Une fois émise, la facture reçoit le numéro suivant et ne se modifie plus.
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {lignes.map(l => (
            <li key={l.id} className="flex items-baseline gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">{libelleQuantite(l.unit, Number(l.quantity), l.label)}
                {com.assujettie && <span className="block text-xs text-fg-subtle">{l.taux_tva_pb === null || l.taux_tva_pb === undefined ? 'Catégorie de TVA à choisir' : `TVA ${formatTaux(l.taux_tva_pb)}`}</span>}</span>
              <span className="num font-semibold">{formatEuros(montantLigne(l))}{com.assujettie ? ' HT' : ''}</span>
            </li>
          ))}
        </ul>
        {calc.ok && com.assujettie && (
          <dl className="num space-y-1 rounded-lg bg-primary-soft px-3 py-2 text-sm" aria-label="Totaux de la facture">
            <div className="flex justify-between"><dt className="text-fg-muted">Total HT</dt><dd>{formatEuros(calc.t.total_ht)}</dd></div>
            {calc.t.ventilation.map(v => (
              <div key={v.taux_pb} className="flex justify-between text-xs text-fg-muted"><dt>TVA {formatTaux(v.taux_pb)}</dt><dd>{formatEuros(v.tva)}</dd></div>
            ))}
            <div className="flex justify-between font-semibold"><dt>Total TTC</dt><dd>{formatEuros(calc.t.total_ttc)}</dd></div>
          </dl>
        )}
        {sansTaux > 0 && (
          <Field label="Catégorie de TVA des lignes sans catégorie" hint="Vente saisie avant la TVA : choisissez explicitement la catégorie à appliquer.">
            <Select value={defaut} onChange={e => setDefaut(e.target.value)}>
              <option value="">Choisir…</option>
              {com.taux.filter(t => t.actif).map(t => <option key={t.id} value={t.id}>{t.libelle} · {formatTaux(t.taux_pb)}</option>)}
            </Select>
          </Field>
        )}
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={pro} onChange={e => setPro(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium text-fg">Client professionnel</span>
            <span className="block text-xs text-fg-muted">Ajoute les pénalités de retard et l’indemnité forfaitaire ; exige le nom et l’adresse du client.</span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}
