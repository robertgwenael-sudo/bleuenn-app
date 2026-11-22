'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Client, ClientKind } from '@/lib/domain'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { dejaAffichee, type Commercial } from '@/hooks/useCommercial'
import { KIND_LABEL, KINDS } from './commun'

const vide = { name: '', kind: 'fleuriste' as ClientKind, contact_name: '', email: '', phone: '', address: '', notes: '' }
const nul = (s: string) => (s.trim() ? s.trim() : null)

/** Création ou modification d'une fiche client. */
export function ClientDialog({ open, onOpenChange, client, com, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  client: Client | null
  com: Commercial
  onSaved?: (c: Client | null) => void
}) {
  const [f, setF] = useState(vide)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTried(false)
    setF(client ? {
      name: client.name, kind: client.kind, contact_name: client.contact_name ?? '', email: client.email ?? '',
      phone: client.phone ?? '', address: client.address ?? '', notes: client.notes ?? '',
    } : vide)
  }, [open, client])

  const set = (k: keyof typeof vide) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF(x => ({ ...x, [k]: e.target.value }))

  const emailInvalide = f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!f.name.trim() || emailInvalide) return
    setSaving(true)
    const v = {
      name: f.name.trim(), kind: f.kind, contact_name: nul(f.contact_name), email: nul(f.email),
      phone: nul(f.phone), address: nul(f.address), notes: nul(f.notes),
    }
    try {
      if (client) {
        await com.updateClient(client.id, v)
        toast.success('Fiche client mise à jour', { description: v.name })
        onSaved?.(null)
      } else {
        const c = await com.createClient(v)
        toast.success('Client ajouté', { description: v.name })
        onSaved?.(c)
      }
      onOpenChange(false)
    } catch (err) {
      if (!dejaAffichee(err)) toast.error('Enregistrement impossible', { description: String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={client ? 'Modifier le client' : 'Nouveau client'}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="submit" form="client-form" loading={saving}>{client ? 'Enregistrer' : 'Ajouter le client'}</Button>
      </>}>
      <form id="client-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <Field label="Nom" error={tried && !f.name.trim() ? 'Le nom est requis.' : undefined}>
            <Input className="h-11" value={f.name} onChange={set('name')} placeholder="Atelier Pétale, Mariage Le Bris…" autoFocus />
          </Field>
          <Field label="Type">
            <Select className="h-11" value={f.kind} onChange={set('kind')}>
              {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Contact">
          <Input className="h-11" value={f.contact_name} onChange={set('contact_name')} placeholder="Prénom Nom" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone">
            <Input className="h-11" type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="E-mail" error={tried && emailInvalide ? 'Adresse e-mail invalide.' : undefined}>
            <Input className="h-11" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={set('email')} />
          </Field>
        </div>
        <Field label="Adresse de livraison">
          <Input className="h-11" value={f.address} onChange={set('address')} />
        </Field>
        <Field label="Notes" hint="Jours de livraison, préférences, conditions de paiement…">
          <Textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </form>
    </Dialog>
  )
}
