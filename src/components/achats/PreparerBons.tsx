'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardList } from 'lucide-react'
import { eurosEnCentimes, formatEuros } from '@/lib/domain'
import { formatQuantiteUnite, totauxBon, type BrouillonPropose } from '@/lib/domain/achats'
import { Badge, Button, Dialog, EmptyState, Select } from '@/components/ui'
import type { Achats } from '@/hooks/useAchats'
import { pluriel } from './commun'

/**
 * Brouillons proposés à partir des besoins : un par fournisseur habituel.
 * Rien n'est créé sans validation ; le groupe « à choisir » attend un
 * fournisseur.
 */
export function PreparerBons({ open, onOpenChange, achats, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  achats: Achats
  onCreated?: () => void
}) {
  const props = achats.propositions
  const [choix, setChoix] = useState<{ supplier_id: string; inclus: boolean }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setChoix(achats.propositions.map(p => ({ supplier_id: p.supplier_id ?? '', inclus: true })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const actifs = achats.suppliers.filter(f => !f.archived_at)
  const retenus = props.map((p, i) => ({ p, c: choix[i] })).filter(x => x.c?.inclus)
  const sansFournisseur = retenus.filter(x => !x.c.supplier_id).length

  const creer = async () => {
    if (retenus.length === 0) return
    if (sansFournisseur) { toast.error('Fournisseur à choisir', { description: 'Choisissez un fournisseur pour chaque bon retenu, ou décochez-le.' }); return }
    setSaving(true)
    try {
      const n = await achats.creerBrouillons(retenus.map(({ p, c }) => ({
        ...p, supplier_id: c.supplier_id, supplier_name: achats.suppliers.find(f => f.id === c.supplier_id)?.name ?? null,
      })))
      if (n > 0) {
        toast.success(`${pluriel(n, 'brouillon créé', 'brouillons créés')}`, { description: 'Vérifiez les prix et envoyez-les depuis l’onglet Bons de commande.' })
        onCreated?.()
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const total = (p: BrouillonPropose) => totauxBon(p.lignes.map(l => ({ ...l, quantity_received: 0 })), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Préparer les bons de commande"
      description="Un brouillon par fournisseur habituel, pour ce qui reste à commander. Rien ne part sans votre validation."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Fermer</Button>
        {props.length > 0 && <Button onClick={creer} loading={saving} disabled={retenus.length === 0}>
          Créer {pluriel(retenus.length, 'brouillon')}
        </Button>}
      </>}>
      {props.length === 0 ? (
        <EmptyState compact icon={<ClipboardList className="h-6 w-6" aria-hidden />} title="Rien à commander"
          description="Les besoins de la saison sont couverts par les commandes et les bons existants (ou commandés en sachets, à vérifier)." />
      ) : (
        <ol className="space-y-3">
          {props.map((p, i) => {
            const c = choix[i] ?? { supplier_id: '', inclus: true }
            const t = total(p)
            const titre = p.supplier_name ?? 'Fournisseur à choisir'
            return (
              <li key={`${p.supplier_id ?? 'aucun'}-${i}`} className="rounded-xl border border-border p-3" aria-label={`Brouillon : ${titre}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex items-center gap-2 font-semibold text-fg">
                    <input type="checkbox" className="h-5 w-5 rounded border-border-strong accent-[rgb(var(--primary))]" checked={c.inclus}
                      onChange={e => setChoix(cs => cs.map((x, j) => j === i ? { ...x, inclus: e.target.checked } : x))} />
                    {titre}
                  </label>
                  {!p.supplier_id && <Badge tone="amber">Pas de fournisseur habituel</Badge>}
                  <Select aria-label={`Fournisseur pour ${titre}`} wrapperClassName="sm:ml-auto sm:w-64" value={c.supplier_id}
                    onChange={e => setChoix(cs => cs.map((x, j) => j === i ? { ...x, supplier_id: e.target.value } : x))}>
                    <option value="">Choisir un fournisseur…</option>
                    {actifs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </div>
                <ul className="mt-2 divide-y divide-border text-sm">
                  {p.lignes.map(l => (
                    <li key={l.label} className="flex justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate">{l.label}{l.variety ? <span className="text-fg-muted"> « {l.variety} »</span> : null}{l.organic ? ' · bio' : ''}</span>
                      <span className="num shrink-0 text-fg-muted">
                        {formatQuantiteUnite(l.quantity, l.unit)} · {l.unit_price === null ? <em>prix à saisir</em> : formatEuros(eurosEnCentimes(l.unit_price))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-right text-xs text-fg-muted">
                  Estimation : <span className="num font-semibold text-fg">{formatEuros(t.lignes)}</span>{t.prixManquants ? ` + ${pluriel(t.prixManquants, 'prix', 'prix')} à saisir` : ''}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </Dialog>
  )
}
