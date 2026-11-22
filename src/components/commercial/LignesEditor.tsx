'use client'
// Saisie multi-lignes d'une commande ou d'une vente : culture du catalogue
// ou libellé libre, unité, quantité, tiges par unité, prix unitaire.
// Le total se calcule en direct, en centimes, par le domaine.
import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatEuros, montantLigne, tigesLigne, totauxLignes, type LineUnit } from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'
import { Button, Input, NumberStepper, Select, cn } from '@/components/ui'
import {
  nouvelleLigne, prixCatalogue, TIGES_PAR_DEFAUT, UNITE_LABEL, UNITES, validerLigne, pluriel, type LigneSaisie,
} from './commun'

export function useTotauxSaisie(lignes: LigneSaisie[]) {
  return useMemo(() => {
    const valides = lignes.map(validerLigne)
    const ok = valides.flatMap(v => ('ligne' in v ? [v.ligne] : []))
    return { valides, ok, totaux: totauxLignes(ok), toutesValides: ok.length === lignes.length && lignes.length > 0 }
  }, [lignes])
}

export function LignesEditor({ lignes, onChange, catalog, tried, compact }: {
  lignes: LigneSaisie[]
  onChange: (l: LigneSaisie[]) => void
  catalog: CultureCatalog[]
  /** Afficher les erreurs (après une tentative d'envoi). */
  tried?: boolean
  /** Colonne étroite (formulaire de vente) : grille resserrée. */
  compact?: boolean
}) {
  const { valides, totaux } = useTotauxSaisie(lignes)
  const parId = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog])

  const maj = (key: string, patch: Partial<LigneSaisie>) =>
    onChange(lignes.map(l => {
      if (l.key !== key) return l
      const n = { ...l, ...patch }
      // Prix suggéré par le catalogue tant qu'il n'a pas été retouché
      if (n.prixAuto && n.culture_id && ('culture_id' in patch || 'unit' in patch || 'stems_per_unit' in patch)) {
        n.unit_price = prixCatalogue(parId.get(n.culture_id), Number(n.stems_per_unit) || 1)
      }
      return n
    }))

  const choisirCulture = (l: LigneSaisie, id: string) => {
    const c = parId.get(id)
    const ancienLibelleAuto = !l.label || (l.culture_id && parId.get(l.culture_id)?.name === l.label)
    maj(l.key, { culture_id: id, label: c && ancienLibelleAuto ? c.name : l.label, prixAuto: true })
  }

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {lignes.map((l, i) => {
          const v = valides[i]
          const err = tried && 'erreur' in v ? v.erreur : null
          const montant = 'ligne' in v ? montantLigne(v.ligne) : null
          const tiges = 'ligne' in v ? tigesLigne(v.ligne) : null
          return (
            <li key={l.key} className={cn('rounded-xl border bg-surface-2/40 p-3', err ? 'border-danger' : 'border-border')}>
              <div className="mb-2 flex items-start gap-2">
                <span className="num mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-fg-muted">{i + 1}</span>
                <div className={cn('grid min-w-0 flex-1 gap-2', !compact && 'sm:grid-cols-2')}>
                  <Select aria-label={`Culture de la ligne ${i + 1}`} className="h-11" value={l.culture_id} onChange={e => choisirCulture(l, e.target.value)}>
                    <option value="">Libellé libre…</option>
                    {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Input aria-label={`Libellé de la ligne ${i + 1}`} className="h-11" value={l.label}
                    placeholder={l.culture_id ? 'Libellé' : 'Bouquet du vendredi, couronne…'}
                    onChange={e => maj(l.key, { label: e.target.value })} />
                </div>
                <Button variant="ghost" size="icon" className="mt-0.5" aria-label={`Retirer la ligne ${i + 1}`} disabled={lignes.length === 1}
                  onClick={() => onChange(lignes.filter(x => x.key !== l.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
                <label className="block">
                  <span className="mb-1 block text-2xs font-medium text-fg-muted">Unité</span>
                  <Select className="h-12 sm:h-10" value={l.unit}
                    onChange={e => {
                      const u = e.target.value as LineUnit
                      maj(l.key, { unit: u, stems_per_unit: String(TIGES_PAR_DEFAUT[u]) })
                    }}>
                    {UNITES.map(u => <option key={u} value={u}>{UNITE_LABEL[u]}</option>)}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-2xs font-medium text-fg-muted">Tiges / unité</span>
                  <Input className="num h-12 text-center sm:h-10" type="number" inputMode="numeric" min={1} step={1}
                    value={l.stems_per_unit} disabled={l.unit === 'tige'}
                    onChange={e => maj(l.key, { stems_per_unit: e.target.value })} />
                </label>
                <div>
                  <span className="mb-1 block text-2xs font-medium text-fg-muted">Quantité</span>
                  <NumberStepper size={compact ? 'lg' : 'md'} label={`la quantité de la ligne ${i + 1}`} value={l.quantity}
                    onChange={q => maj(l.key, { quantity: q })} step={1} min={0} aria-label={`Quantité de la ligne ${i + 1}`} />
                </div>
                <div>
                  <span className="mb-1 block text-2xs font-medium text-fg-muted">Prix / {UNITE_LABEL[l.unit].toLowerCase()} (€)</span>
                  <NumberStepper size={compact ? 'lg' : 'md'} label={`le prix unitaire de la ligne ${i + 1}`} value={l.unit_price}
                    onChange={p => maj(l.key, { unit_price: p, prixAuto: false })}
                    step={l.unit === 'tige' ? 0.1 : 1} min={0} inputMode="decimal" placeholder="0,00" aria-label={`Prix unitaire de la ligne ${i + 1}`} />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                {err
                  ? <span className="font-medium text-danger">{err}</span>
                  : <span className="num text-fg-subtle">{tiges !== null ? pluriel(tiges, 'tige') : '—'}</span>}
                <span className="num font-semibold text-fg">{montant !== null ? formatEuros(montant) : '—'}</span>
              </div>
            </li>
          )
        })}
      </ol>
      <Button variant="secondary" className="h-11 w-full" onClick={() => onChange([...lignes, nouvelleLigne()])}>
        <Plus className="h-4 w-4" /> Ajouter une ligne
      </Button>
      <div className="num flex items-baseline justify-between rounded-lg bg-primary-soft px-3 py-2.5 text-sm" aria-live="polite">
        <span className="text-fg-muted">{pluriel(totaux.nb_lignes, 'ligne')} · {pluriel(totaux.tiges, 'tige')}</span>
        <span>Total <strong className="text-base text-fg">{formatEuros(totaux.total_centimes)}</strong></span>
      </div>
    </div>
  )
}
