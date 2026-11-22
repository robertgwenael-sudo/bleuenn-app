'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { formatEuros, PURCHASE_UNITS, type PurchaseOrder, type PurchaseOrderLine, type PurchaseUnit } from '@/lib/domain'
import { alertesConditions, LIBELLES_UNITES, lireQuantite, totauxBon } from '@/lib/domain/achats'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import type { Achats, LigneSaisie } from '@/hooks/useAchats'
import { lireEuros, versSaisie } from './commun'

interface LigneForm {
  cle: number
  culture_id: string
  label: string
  variety: string
  supplier_ref: string
  unit: PurchaseUnit
  quantity: string
  unit_price: string
  organic: boolean
  seed_order_id: string | null
}

let compteur = 0
const nouvelleLigne = (): LigneForm => ({
  cle: ++compteur, culture_id: '', label: '', variety: '', supplier_ref: '', unit: 'graines', quantity: '', unit_price: '', organic: false, seed_order_id: null,
})
const depuisLigne = (l: PurchaseOrderLine): LigneForm => ({
  cle: ++compteur, culture_id: l.culture_id ?? '', label: l.label, variety: l.variety ?? '', supplier_ref: l.supplier_ref ?? '',
  unit: l.unit, quantity: versSaisie(l.quantity), unit_price: versSaisie(l.unit_price), organic: l.organic, seed_order_id: l.seed_order_id,
})

/** Création ou modification d'un brouillon de bon, multi-lignes. */
export function EditeurBon({ open, onOpenChange, bon, achats, catalog, seasonId, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** null : nouveau brouillon. */
  bon: PurchaseOrder | null
  achats: Achats
  catalog: { id: string; name: string }[]
  seasonId: string | null
  onSaved?: (id: string) => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [season, setSeason] = useState('')
  const [prevue, setPrevue] = useState('')
  const [port, setPort] = useState('')
  const [notes, setNotes] = useState('')
  const [lignes, setLignes] = useState<LigneForm[]>([])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTried(false)
    setSupplierId(bon?.supplier_id ?? '')
    setSeason(bon?.season_id ?? seasonId ?? '')
    setPrevue(bon?.expected_date ?? '')
    setPort(bon ? versSaisie(bon.shipping_amount) : '')
    setNotes(bon?.notes ?? '')
    const ls = bon ? (achats.lignesParBon.get(bon.id) ?? []).map(depuisLigne) : []
    setLignes(ls.length ? ls : [nouvelleLigne()])
    // Ouverture seulement : ne pas réinitialiser pendant la saisie quand les données se rechargent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bon?.id])

  const fournisseurs = achats.suppliers.filter(f => !f.archived_at || f.id === bon?.supplier_id)
  const fournisseur = achats.suppliers.find(f => f.id === supplierId) ?? null

  const maj = (cle: number, champs: Partial<LigneForm>) => setLignes(ls => ls.map(l => l.cle === cle ? { ...l, ...champs } : l))
  const choisirCulture = (l: LigneForm, id: string) => {
    const nom = catalog.find(c => c.id === id)?.name ?? ''
    const ancien = catalog.find(c => c.id === l.culture_id)?.name ?? ''
    maj(l.cle, { culture_id: id, label: !l.label.trim() || l.label === ancien ? nom : l.label })
  }

  const lues = lignes.map(l => ({ l, q: lireQuantite(l.quantity), p: lireEuros(l.unit_price) }))
  const portLu = lireEuros(port)
  const totaux = useMemo(() => totauxBon(
    lues.filter(x => x.q && x.q > 0).map(x => ({ quantity: x.q as number, quantity_received: 0, unit_price: x.p === undefined ? null : x.p })),
    portLu ?? 0,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [lignes, port])
  const alertes = alertesConditions(totaux.lignes, fournisseur)

  const erreurLigne = (x: (typeof lues)[number]) => ({
    label: !x.l.label.trim() ? 'Libellé requis' : undefined,
    quantity: x.q === null || x.q <= 0 ? 'Quantité > 0' : undefined,
    unit_price: x.p === undefined ? 'Prix invalide' : undefined,
  })
  const erreurs = {
    supplier: !supplierId ? 'Choisissez un fournisseur.' : undefined,
    port: portLu === undefined ? 'Montant invalide.' : undefined,
    lignes: lignes.length === 0 ? 'Ajoutez au moins une ligne.' : undefined,
  }
  const invalide = Object.values(erreurs).some(Boolean) || lues.some(x => Object.values(erreurLigne(x)).some(Boolean))

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (invalide) { toast.error('Bon incomplet', { description: 'Vérifiez les champs signalés.' }); return }
    setSaving(true)
    try {
      const saisies: LigneSaisie[] = lues.map(({ l, q, p }) => ({
        culture_id: l.culture_id || null, variety: l.variety.trim() || null, label: l.label.trim(), supplier_ref: l.supplier_ref.trim() || null,
        unit: l.unit, quantity: q as number, unit_price: p ?? null, organic: l.organic, seed_order_id: l.seed_order_id,
      }))
      const id = await achats.saveBon(bon?.id ?? null, {
        supplier_id: supplierId, season_id: season || undefined, expected_date: prevue || null, shipping_amount: portLu ?? 0, notes: notes.trim() || null,
      }, saisies)
      if (id) {
        toast.success(bon ? 'Brouillon enregistré' : 'Brouillon créé', { description: fournisseur?.name })
        onSaved?.(id)
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg"
      title={bon ? 'Modifier le brouillon' : 'Nouveau bon de commande'}
      description="Le numéro est attribué à l’envoi. Un prix laissé vide reste « à saisir » : le bon ne pourra pas partir sans."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="submit" form="bon-form" loading={saving}>Enregistrer le brouillon</Button>
      </>}>
      <form id="bon-form" onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fournisseur" error={tried ? erreurs.supplier : undefined}>
            <Select className="h-11" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">Choisir…</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.name}{f.archived_at ? ' (archivé)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Saison d’imputation" hint="Les dépenses de la réception y seront comptées">
            <Select className="h-11" value={season} onChange={e => setSeason(e.target.value)}>
              {achats.seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Livraison prévue">
            <Input className="h-11" type="date" value={prevue} onChange={e => setPrevue(e.target.value)} />
          </Field>
          <Field label="Frais de port (€)" error={tried ? erreurs.port : undefined}>
            <Input className="h-11" inputMode="decimal" value={port} onChange={e => setPort(e.target.value)} placeholder="0" />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-sans text-sm font-semibold">Lignes</h3>
            <Button size="sm" variant="secondary" onClick={() => setLignes(ls => [...ls, nouvelleLigne()])}><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</Button>
          </div>
          {tried && erreurs.lignes && <p className="mb-2 text-xs font-medium text-danger">{erreurs.lignes}</p>}
          <ol className="space-y-2">
            {lues.map((x, i) => {
              const l = x.l
              const er = tried ? erreurLigne(x) : { label: undefined, quantity: undefined, unit_price: undefined }
              return (
                <li key={l.cle} className="rounded-xl border border-border bg-surface-2/40 p-3" aria-label={`Ligne ${i + 1}`}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                    <Field className="col-span-2 sm:col-span-4" label="Culture (facultatif)">
                      <Select value={l.culture_id} onChange={e => choisirCulture(l, e.target.value)}>
                        <option value="">—</option>
                        {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                    </Field>
                    <Field className="col-span-2 sm:col-span-4" label="Libellé" error={er.label}>
                      <Input value={l.label} onChange={e => maj(l.cle, { label: e.target.value })} />
                    </Field>
                    <Field className="col-span-1 sm:col-span-2" label="Variété">
                      <Input value={l.variety} onChange={e => maj(l.cle, { variety: e.target.value })} />
                    </Field>
                    <Field className="col-span-1 sm:col-span-2" label="Réf. fournisseur">
                      <Input value={l.supplier_ref} onChange={e => maj(l.cle, { supplier_ref: e.target.value })} />
                    </Field>
                    <Field className="col-span-1 sm:col-span-3" label="Quantité" error={er.quantity}>
                      <Input inputMode="decimal" value={l.quantity} onChange={e => maj(l.cle, { quantity: e.target.value })} />
                    </Field>
                    <Field className="col-span-1 sm:col-span-3" label="Unité">
                      <Select value={l.unit} onChange={e => maj(l.cle, { unit: e.target.value as PurchaseUnit })}>
                        {PURCHASE_UNITS.map(u => <option key={u} value={u}>{LIBELLES_UNITES[u][1]}</option>)}
                      </Select>
                    </Field>
                    <Field className="col-span-1 sm:col-span-3" label="Prix unitaire (€)" error={er.unit_price}>
                      <Input inputMode="decimal" value={l.unit_price} placeholder="à saisir" onChange={e => maj(l.cle, { unit_price: e.target.value })} />
                    </Field>
                    <div className="col-span-1 flex items-end justify-between gap-2 sm:col-span-3">
                      <label className="flex h-10 items-center gap-2 text-sm text-fg">
                        <input type="checkbox" className="h-5 w-5 rounded border-border-strong accent-[rgb(var(--primary))]" checked={l.organic}
                          onChange={e => maj(l.cle, { organic: e.target.checked })} /> Bio
                      </label>
                      <Button variant="danger-ghost" size="icon" aria-label={`Retirer la ligne ${i + 1}`}
                        onClick={() => setLignes(ls => ls.filter(y => y.cle !== l.cle))}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="rounded-xl border border-border p-3 text-sm">
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-fg-muted">Articles</dt><dd className="num text-right">{formatEuros(totaux.lignes)}</dd>
            <dt className="text-fg-muted">Frais de port</dt><dd className="num text-right">{formatEuros(totaux.port)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="num text-right font-semibold">{formatEuros(totaux.total)}{totaux.prixManquants ? ' + prix à saisir' : ''}</dd>
          </dl>
          {alertes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {alertes.map(a => (
                <li key={a.type} className="flex items-start gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{a.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Notes (imprimées sur le bon)"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </form>
    </Dialog>
  )
}
