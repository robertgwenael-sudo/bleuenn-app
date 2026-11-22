'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SUPPLIER_KINDS, type Supplier, type SupplierKind } from '@/lib/domain'
import { LIBELLES_TYPES_FOURNISSEUR } from '@/lib/domain/achats'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import type { Achats, FicheFournisseur } from '@/hooks/useAchats'
import { lireEuros, versSaisie } from './commun'

const vide = {
  name: '', kind: 'semencier' as SupplierKind, contact_name: '', email: '', phone: '', website: '', address: '',
  customer_number: '', min_order_amount: '', free_shipping_threshold: '', lead_time_days: '', organic_certified: false, notes: '',
}
type Saisie = typeof vide
const nul = (s: string) => (s.trim() ? s.trim() : null)

/** Création ou modification d'une fiche fournisseur. */
export function FournisseurDialog({ open, onOpenChange, fournisseur, achats, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  fournisseur: Supplier | null
  achats: Achats
  onSaved?: (id: string) => void
}) {
  const [f, setF] = useState<Saisie>(vide)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTried(false)
    setF(fournisseur ? {
      name: fournisseur.name, kind: fournisseur.kind, contact_name: fournisseur.contact_name ?? '', email: fournisseur.email ?? '',
      phone: fournisseur.phone ?? '', website: fournisseur.website ?? '', address: fournisseur.address ?? '',
      customer_number: fournisseur.customer_number ?? '', min_order_amount: versSaisie(fournisseur.min_order_amount),
      free_shipping_threshold: versSaisie(fournisseur.free_shipping_threshold),
      lead_time_days: fournisseur.lead_time_days === null ? '' : String(fournisseur.lead_time_days),
      organic_certified: fournisseur.organic_certified, notes: fournisseur.notes ?? '',
    } : vide)
  }, [open, fournisseur])

  const set = (k: keyof Saisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF(x => ({ ...x, [k]: e.target.value }))

  const minimum = lireEuros(f.min_order_amount)
  const franco = lireEuros(f.free_shipping_threshold)
  const delai = f.lead_time_days.trim() === '' ? null : /^\d{1,3}$/.test(f.lead_time_days.trim()) ? Number(f.lead_time_days.trim()) : undefined
  const emailInvalide = f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())
  const erreurs = {
    name: !f.name.trim() ? 'Le nom est requis.' : undefined,
    email: emailInvalide ? 'Adresse e-mail invalide.' : undefined,
    min: minimum === undefined || minimum === 0 ? 'Montant invalide (laisser vide si aucun).' : undefined,
    franco: franco === undefined || franco === 0 ? 'Montant invalide (laisser vide si aucun).' : undefined,
    delai: delai === undefined || (delai !== null && delai > 365) ? 'Nombre de jours entier (0 à 365).' : undefined,
  }

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (Object.values(erreurs).some(Boolean)) return
    setSaving(true)
    let site = nul(f.website)
    if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`
    const fiche: FicheFournisseur = {
      name: f.name.trim(), kind: f.kind, contact_name: nul(f.contact_name), email: nul(f.email), phone: nul(f.phone),
      website: site, address: nul(f.address), customer_number: nul(f.customer_number),
      min_order_amount: minimum ?? null, free_shipping_threshold: franco ?? null, lead_time_days: delai ?? null,
      organic_certified: f.organic_certified, notes: nul(f.notes),
    }
    try {
      const id = await achats.saveSupplier(fournisseur?.id ?? null, fiche)
      if (id) {
        toast.success(fournisseur ? 'Fiche fournisseur mise à jour' : 'Fournisseur ajouté', { description: fiche.name })
        onSaved?.(id)
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const err = (k: keyof typeof erreurs) => (tried ? erreurs[k] : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={fournisseur ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="submit" form="fournisseur-form" loading={saving}>{fournisseur ? 'Enregistrer' : 'Ajouter le fournisseur'}</Button>
      </>}>
      <form id="fournisseur-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <Field label="Nom" error={err('name')}>
            <Input className="h-11" value={f.name} onChange={set('name')} placeholder="Semencerie, pépinière…" autoFocus />
          </Field>
          <Field label="Type">
            <Select className="h-11" value={f.kind} onChange={set('kind')}>
              {SUPPLIER_KINDS.map(k => <option key={k} value={k}>{LIBELLES_TYPES_FOURNISSEUR[k]}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact"><Input className="h-11" value={f.contact_name} onChange={set('contact_name')} autoComplete="off" /></Field>
          <Field label="N° client chez le fournisseur"><Input className="h-11" value={f.customer_number} onChange={set('customer_number')} /></Field>
          <Field label="E-mail" error={err('email')}><Input className="h-11" type="email" inputMode="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Téléphone"><Input className="h-11" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Site web"><Input className="h-11" inputMode="url" value={f.website} onChange={set('website')} placeholder="https://…" /></Field>
          <Field label="Adresse"><Input className="h-11" value={f.address} onChange={set('address')} /></Field>
        </div>
        <fieldset className="rounded-xl border border-border p-3">
          <legend className="px-1 text-xs font-medium text-fg-muted">Conditions (laisser vide si inconnues)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Minimum de commande (€)" error={err('min')} hint="Hors frais de port">
              <Input className="h-11" inputMode="decimal" value={f.min_order_amount} onChange={set('min_order_amount')} />
            </Field>
            <Field label="Franco de port (€)" error={err('franco')} hint="Port offert au-delà">
              <Input className="h-11" inputMode="decimal" value={f.free_shipping_threshold} onChange={set('free_shipping_threshold')} />
            </Field>
            <Field label="Délai habituel (jours)" error={err('delai')}>
              <Input className="h-11" inputMode="numeric" value={f.lead_time_days} onChange={set('lead_time_days')} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" className="h-5 w-5 rounded border-border-strong accent-[rgb(var(--primary))]" checked={f.organic_certified}
              onChange={e => setF(x => ({ ...x, organic_certified: e.target.checked }))} />
            Certifié agriculture biologique
          </label>
        </fieldset>
        <Field label="Notes"><Textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Dialog>
  )
}
