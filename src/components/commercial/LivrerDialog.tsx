'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CircleCheck, Receipt } from 'lucide-react'
import {
  canalDeVente, formatEuros, montantLigne, tigesLigne, totauxLignes, type Order, type SaleChannel,
} from '@/lib/domain'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'
import { dejaAffichee, type Commercial } from '@/hooks/useCommercial'
import { aujourdhuiParis, CANAUX, estCanal, jourLivraison, pluriel, uniteQuantite } from './commun'

/**
 * Confirmation de « Livrer et facturer » : récapitule la commande, fixe la
 * date et le canal de la vente, puis enchaîne vente → lignes → commande.
 */
export function LivrerDialog({ order, com, onClose }: { order: Order | null; com: Commercial; onClose: () => void }) {
  const today = aujourdhuiParis()
  const [date, setDate] = useState(today)
  const [canal, setCanal] = useState<SaleChannel | ''>('')
  const [saving, setSaving] = useState(false)

  const client = order?.client_id ? com.clientsParId.get(order.client_id) ?? null : null
  const lignes = useMemo(() => (order ? com.lignesParCommande.get(order.id) ?? [] : []), [order, com.lignesParCommande])
  const t = useMemo(() => totauxLignes(lignes), [lignes])

  useEffect(() => {
    if (!order) return
    // Livrée aujourd'hui, ou à la date prévue si elle est déjà passée et qu'on régularise
    setDate(order.delivery_date < today ? order.delivery_date : today)
    let c: SaleChannel | '' = ''
    try { c = canalDeVente(order, client) } catch { c = '' }
    setCanal(c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const go = async () => {
    if (!order || !canal || !estCanal(canal)) return
    setSaving(true)
    try {
      const r = await com.livrerEtFacturer(order, { date, canal })
      toast.success('Commande livrée et facturée', {
        description: `${client?.name ?? 'Client'} · vente de ${formatEuros(r.total_centimes)} enregistrée dans Ventes (${canal}).`,
        icon: <CircleCheck className="h-4 w-4" />,
      })
      onClose()
    } catch (e) {
      if (!dejaAffichee(e)) toast.error('Facturation impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!order} onOpenChange={o => { if (!o) onClose() }}
      title="Livrer et facturer"
      description={order ? `${client?.name ?? 'Client inconnu'} · prévue ${jourLivraison(order.delivery_date, today)}` : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button size="lg" onClick={go} loading={saving} disabled={!canal || lignes.length === 0 || !date}>
          <Receipt className="h-4 w-4" /> Facturer {formatEuros(t.total_centimes)}
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
                <span className="num block text-xs text-fg-subtle">{uniteQuantite(l.unit, Number(l.quantity))}{l.unit !== 'tige' ? ` · ${pluriel(tigesLigne(l), 'tige')}` : ''}</span>
              </span>
              <span className="num font-semibold">{formatEuros(montantLigne(l))}</span>
            </li>
          ))}
          <li className="num flex items-baseline justify-between bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className="text-fg-muted">{pluriel(t.tiges, 'tige')}</span>
            <span>Total <strong className="text-base">{formatEuros(t.total_centimes)}</strong></span>
          </li>
        </ul>
        {lignes.length === 0 && <p className="text-sm font-medium text-danger">Commande sans ligne : ajoutez-en avant de facturer.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de la vente">
            <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Canal" error={!canal ? 'À choisir : non déductible du client.' : undefined}>
            <Select className="h-12 sm:h-11" value={canal} onChange={e => setCanal(e.target.value as SaleChannel | '')}>
              <option value="">— Choisir —</option>
              {CANAUX.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
