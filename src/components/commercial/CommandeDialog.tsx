'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { formatEuros, type Order, type OrderStatus } from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea } from '@/components/ui'
import { dejaAffichee, type Commercial } from '@/hooks/useCommercial'
import { LignesEditor, useTotauxSaisie } from './LignesEditor'
import {
  aujourdhuiParis, CANAUX, KIND_LABEL, nouvelleLigne, STATUT_LABEL, versSaisie, type LigneSaisie,
} from './commun'

const STATUTS_SAISIE: OrderStatus[] = ['devis', 'confirmee', 'prete']

/** Création ou modification d'une commande et de ses lignes. */
export function CommandeDialog({ open, onOpenChange, order, com, catalog }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  order: Order | null
  com: Commercial
  catalog: CultureCatalog[]
}) {
  const [clientId, setClientId] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<OrderStatus>('confirmee')
  const [channel, setChannel] = useState('')
  const [notes, setNotes] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const { ok, totaux, toutesValides } = useTotauxSaisie(lignes)

  useEffect(() => {
    if (!open) return
    setTried(false)
    if (order) {
      setClientId(order.client_id ?? '')
      setDate(order.delivery_date)
      setStatus(order.status)
      setChannel(order.channel ?? '')
      setNotes(order.notes ?? '')
      const ls = com.lignesParCommande.get(order.id) ?? []
      setLignes(ls.length ? ls.map(versSaisie) : [nouvelleLigne()])
    } else {
      setClientId(''); setDate(aujourdhuiParis()); setStatus('confirmee'); setChannel(''); setNotes('')
      setLignes([nouvelleLigne()])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order])

  const clientsChoix = com.clients.filter(c => !c.archived_at || c.id === clientId)
  const verrouillee = order?.status === 'livree'

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!clientId || !date || !toutesValides) return
    setSaving(true)
    const v = { client_id: clientId, delivery_date: date, status, channel: channel || null, notes: notes.trim() || null }
    try {
      if (order) await com.updateOrder(order.id, v, ok)
      else await com.createOrder(v, ok)
      const nom = com.clientsParId.get(clientId)?.name
      toast.success(order ? 'Commande modifiée' : 'Commande enregistrée', { description: `${nom} · ${formatEuros(totaux.total_centimes)}` })
      onOpenChange(false)
    } catch (err) {
      if (!dejaAffichee(err)) toast.error('Enregistrement impossible', { description: String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg"
      title={order ? 'Modifier la commande' : 'Nouvelle commande'}
      description={verrouillee ? 'Commande livrée et facturée : modifiez plutôt la vente.' : undefined}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="submit" form="commande-form" loading={saving} disabled={verrouillee}>
          {order ? 'Enregistrer' : 'Enregistrer la commande'} · {formatEuros(totaux.total_centimes)}
        </Button>
      </>}>
      <form id="commande-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client" error={tried && !clientId ? 'Choisissez le client.' : undefined}
            hint={clientsChoix.length === 0 ? 'Ajoutez d’abord un client dans l’écran Clients.' : undefined}>
            <Select className="h-12 text-base sm:h-11 sm:text-sm" value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">— Choisir —</option>
              {clientsChoix.map(c => <option key={c.id} value={c.id}>{c.name} · {KIND_LABEL[c.kind]}</option>)}
            </Select>
          </Field>
          <Field label="Livraison le" error={tried && !date ? 'Date requise.' : undefined}>
            <Input className="h-12 sm:h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Statut</p>
            <Segmented label="Statut de la commande" size="lg" value={status} onChange={setStatus}
              options={(verrouillee || order?.status === 'annulee' ? [...STATUTS_SAISIE, order!.status] : STATUTS_SAISIE).map(s => ({ value: s, label: STATUT_LABEL[s] }))} />
          </div>
          <Field label="Canal de vente" hint="Sinon déduit du type de client">
            <Select className="h-12 sm:h-11" value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="">Selon le client</option>
              {CANAUX.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Lignes</p>
          <LignesEditor lignes={lignes} onChange={setLignes} catalog={catalog} tried={tried} />
        </div>
        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Consignes de livraison, teintes…" />
        </Field>
      </form>
    </Dialog>
  )
}
