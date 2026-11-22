'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CircleCheck, Receipt, Truck } from 'lucide-react'
import {
  canalDeVente, essayerVentiler, formatEuros, formatTaux, montantLigne, tigesLigne, totauxLignes, type Order, type SaleChannel,
} from '@/lib/domain'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'
import { dejaAffichee, type Commercial } from '@/hooks/useCommercial'
import { aujourdhuiParis, CANAUX, estCanal, jourLivraison, pluriel, uniteQuantite } from './commun'

/**
 * « Livrer et facturer » : récapitule la commande, fixe la date et le canal
 * de la vente. La base recopie les lignes de la commande dans la vente
 * (aucune ressaisie) et, si « Émettre la facture » est coché, émet la facture
 * dans la même transaction : la facture cite le bon de commande.
 */
export function LivrerDialog({ order, com, onClose }: { order: Order | null; com: Commercial; onClose: () => void }) {
  const today = aujourdhuiParis()
  const [date, setDate] = useState(today)
  const [canal, setCanal] = useState<SaleChannel | ''>('')
  const [facturer, setFacturer] = useState(true)
  const [saving, setSaving] = useState(false)

  const client = order?.client_id ? com.clientsParId.get(order.client_id) ?? null : null
  const lignes = useMemo(() => (order ? com.lignesParCommande.get(order.id) ?? [] : []), [order, com.lignesParCommande])
  const t = useMemo(() => totauxLignes(lignes), [lignes])
  const tva = useMemo(() => essayerVentiler(lignes.map(l => ({ montant_ht: montantLigne(l), taux_pb: l.taux_tva_pb ?? null })), com.assujettie), [lignes, com.assujettie])
  const montant = com.assujettie
    ? (tva.ok ? `${formatEuros(tva.t.total_ttc)} TTC` : `${formatEuros(t.total_centimes)} HT`)
    : formatEuros(t.total_centimes)
  const bloqueTva = facturer && com.assujettie && !tva.ok

  useEffect(() => {
    if (!order) return
    // Livrée aujourd'hui, ou à la date prévue si elle est déjà passée et qu'on régularise
    setDate(order.delivery_date < today ? order.delivery_date : today)
    let c: SaleChannel | '' = ''
    try { c = canalDeVente(order, client) } catch { c = '' }
    setCanal(c)
    setFacturer(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const go = async () => {
    if (!order || !canal || !estCanal(canal)) return
    setSaving(true)
    try {
      const r = await com.livrerEtFacturer(order, { date, canal, facturer })
      toast.success(r.facture ? 'Commande livrée et facturée' : 'Commande livrée', {
        description: r.facture
          ? `${client?.name ?? 'Client'} · facture ${r.facture.numero ?? ''} émise${order.numero ? ` (bon ${order.numero})` : ''}.`
          : `${client?.name ?? 'Client'} · vente de ${formatEuros(r.total_centimes)} enregistrée dans Ventes (${canal}), à facturer.`,
        icon: <CircleCheck className="h-4 w-4" />,
      })
      onClose()
    } catch (e) {
      if (!dejaAffichee(e)) toast.error(facturer ? 'Livraison et facturation impossibles' : 'Livraison impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={o => { if (!o) onClose() }}
      title="Livrer et facturer"
      description={order ? `${client?.name ?? 'Client inconnu'}${order.numero ? ` · bon ${order.numero}` : ''} · prévue ${jourLivraison(order.delivery_date, today)}` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button size="lg" onClick={go} loading={saving} disabled={!canal || lignes.length === 0 || !date || bloqueTva}>
          {facturer ? <Receipt className="h-4 w-4" /> : <Truck className="h-4 w-4" />} {facturer ? 'Livrer et facturer' : 'Livrer'} · {montant}
        </Button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          Une vente sera créée avec ces lignes, rattachée au client, et la commande passera en <strong className="text-fg">livrée</strong>.
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lignes.map(l => (
            <li key={l.id} className="flex items-baseline gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">{l.label}</span>
                <span className="num block text-xs text-fg-subtle">
                  {uniteQuantite(l.unit, Number(l.quantity))}{l.unit !== 'tige' ? ` · ${pluriel(tigesLigne(l), 'tige')}` : ''}
                  {com.assujettie ? ` · ${l.taux_tva_pb === null || l.taux_tva_pb === undefined ? 'TVA à choisir' : `TVA ${formatTaux(l.taux_tva_pb)}`}` : ''}
                </span>
              </span>
              <span className="num font-semibold">{formatEuros(montantLigne(l))}{com.assujettie ? ' HT' : ''}</span>
            </li>
          ))}
          <li className="num space-y-0.5 bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className="flex items-baseline justify-between">
              <span className="text-fg-muted">{pluriel(t.tiges, 'tige')}</span>
              <span>{com.assujettie ? 'Total HT' : 'Total'} <strong className="text-base">{formatEuros(t.total_centimes)}</strong></span>
            </span>
            {com.assujettie && tva.ok && tva.t.ventilation.map(v => (
              <span key={v.taux_pb} className="flex justify-between text-xs text-fg-muted"><span>TVA {formatTaux(v.taux_pb)}</span><span>{formatEuros(v.tva)}</span></span>
            ))}
            {com.assujettie && tva.ok && (
              <span className="flex justify-between font-semibold"><span>Total TTC</span><span>{formatEuros(tva.t.total_ttc)}</span></span>
            )}
          </li>
        </ul>
        {lignes.length === 0 && <p className="text-sm font-medium text-danger">Commande sans ligne : ajoutez-en avant de livrer.</p>}
        {bloqueTva && (
          <p className="text-sm font-medium text-danger">TVA non calculable ({!tva.ok ? tva.erreur : ''}) : modifiez la commande pour choisir la catégorie de chaque ligne, ou livrez sans facturer.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de la vente">
            <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Canal" error={!canal ? 'À choisir : non déductible du client.' : undefined}>
            <Select className="h-12 sm:h-11" value={canal} onChange={e => setCanal(e.target.value as SaleChannel | '')}>
              <option value="">Choisir…</option>
              {CANAUX.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={facturer} onChange={e => setFacturer(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium text-fg">Émettre la facture maintenant</span>
            <span className="block text-xs text-fg-muted">Facture numérotée, avec ces lignes et la référence du bon de commande. Sinon, la vente reste à facturer.</span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}
