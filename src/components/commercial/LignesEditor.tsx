'use client'
// Saisie multi-lignes d'une commande ou d'une vente, en calculateur :
//  * on clique sur les variétés du catalogue (prix à la tige du catalogue),
//    on saisit les quantités, montants et totaux se remplissent seuls ;
//  * catégorie de TVA par ligne (proposée selon l'unité, le canal et le client) ;
//  * « commande au budget » : un montant, des variétés, une répartition égale
//    ou en proportions, et l'appli propose des quantités entières qui tiennent
//    dans le budget, avec l'écart.
// Tout se calcule en centimes par le domaine (calculateur.ts, tva.ts).
// Prix saisis HT ; le TTC s'affiche en direct si la ferme est assujettie.
import { useEffect, useMemo, useState } from 'react'
import { Calculator, Check, Plus, Trash2 } from 'lucide-react'
import {
  eurosEnCentimes, formatEuros, formatTaux, montantLigne, proposerQuantites, tauxParDefaut, tigesLigne, totauxSaisie,
  type BaseBudget, type ClientKind, type LineUnit, type VatRate,
} from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'
import { Button, Input, NumberStepper, Segmented, Select, cn } from '@/components/ui'
import {
  lireCentiemes, nouvelleLigne, pluriel, prixCatalogue, TIGES_PAR_DEFAUT, UNITE_LABEL, UNITES, validerLigne, type LigneSaisie,
} from './commun'

/** Ce que la saisie sait de la TVA : taux de la ferme, régime, et contexte du choix par défaut. */
export interface ContexteTva {
  taux: VatRate[]
  assujettie: boolean
  channel?: string | null
  clientKind?: ClientKind | null
}

export function useTotauxSaisie(lignes: LigneSaisie[], tva?: ContexteTva) {
  return useMemo(() => {
    const valides = lignes.map(validerLigne)
    const ok = valides.flatMap(v => ('ligne' in v ? [v.ligne] : []))
    const parId = new Map((tva?.taux ?? []).map(t => [t.id, t]))
    const totaux = totauxSaisie(ok.map(l => {
      const r = l.vat_rate_id ? parId.get(l.vat_rate_id) : undefined
      return { ...l, taux_pb: r?.taux_pb ?? null, libelle_tva: r?.libelle ?? null }
    }), !!tva?.assujettie)
    return { valides, ok, totaux, toutesValides: ok.length === lignes.length && lignes.length > 0 }
  }, [lignes, tva?.taux, tva?.assujettie])
}

/** Libellé court d'un montant selon le régime : « 31,00 € » ou « 34,10 € TTC ». */
export function montantAffiche(t: ReturnType<typeof useTotauxSaisie>['totaux'], assujettie: boolean): string {
  if (!assujettie) return formatEuros(t.total_centimes)
  return t.tva ? `${formatEuros(t.total_centimes)} HT · ${formatEuros(t.tva.total_ttc)} TTC` : `${formatEuros(t.total_centimes)} HT`
}

export function LignesEditor({ lignes, onChange, catalog, tried, compact, tva }: {
  lignes: LigneSaisie[]
  onChange: (l: LigneSaisie[]) => void
  catalog: CultureCatalog[]
  /** Afficher les erreurs (après une tentative d'envoi). */
  tried?: boolean
  /** Colonne étroite (formulaire de vente) : grille resserrée. */
  compact?: boolean
  tva?: ContexteTva
}) {
  const { valides, totaux } = useTotauxSaisie(lignes, tva)
  const parId = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog])
  const taux = useMemo(() => tva?.taux ?? [], [tva?.taux])
  const assujettie = !!tva?.assujettie
  const tauxParId = useMemo(() => new Map(taux.map(t => [t.id, t])), [taux])
  const defautPour = (unit: LineUnit) => tauxParDefaut(taux, { unit, channel: tva?.channel, clientKind: tva?.clientKind })?.id ?? ''

  // Catégorie proposée : suit l'unité, le canal et le client tant qu'elle n'a pas été choisie à la main
  useEffect(() => {
    if (taux.length === 0) return
    let change = false
    const maj = lignes.map(l => {
      if (!l.tvaAuto) return l
      const id = defautPour(l.unit)
      if (id === l.vat_rate_id) return l
      change = true
      return { ...l, vat_rate_id: id }
    })
    if (change) onChange(maj)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, taux, tva?.channel, tva?.clientKind])

  const maj = (key: string, patch: Partial<LigneSaisie>) =>
    onChange(lignes.map(l => {
      if (l.key !== key) return l
      const n = { ...l, ...patch }
      // Prix suggéré par le catalogue tant qu'il n'a pas été retouché
      if (n.prixAuto && n.culture_id && ('culture_id' in patch || 'unit' in patch || 'stems_per_unit' in patch)) {
        n.unit_price = prixCatalogue(parId.get(n.culture_id), Number(n.stems_per_unit) || 1)
      }
      if (n.tvaAuto && 'unit' in patch) n.vat_rate_id = defautPour(n.unit)
      return n
    }))

  const choisirCulture = (l: LigneSaisie, id: string) => {
    const c = parId.get(id)
    const ancienLibelleAuto = !l.label || (l.culture_id && parId.get(l.culture_id)?.name === l.label)
    maj(l.key, { culture_id: id, label: c && ancienLibelleAuto ? c.name : l.label, prixAuto: true })
  }

  // ─── Variétés cliquables ─────────────────────────────────
  const [filtre, setFiltre] = useState('')
  const choisies = new Set(lignes.map(l => l.culture_id).filter(Boolean))
  const basculerVariete = (c: CultureCatalog) => {
    if (choisies.has(c.id)) {
      const reste = lignes.filter(l => l.culture_id !== c.id)
      onChange(reste.length ? reste : [nouvelleLigne({ vat_rate_id: defautPour('tige') })])
      return
    }
    const nouvelle = nouvelleLigne({ culture_id: c.id, label: c.name, unit_price: prixCatalogue(c, 1), quantity: '', vat_rate_id: defautPour('tige') })
    const vide = lignes.findIndex(l => !l.culture_id && !l.label.trim())
    onChange(vide >= 0 ? lignes.map((l, i) => (i === vide ? { ...nouvelle, key: l.key } : l)) : [...lignes, nouvelle])
  }
  const visibles = catalog.filter(c => !filtre.trim() || c.name.toLowerCase().includes(filtre.trim().toLowerCase()))

  return (
    <div className="space-y-3">
      {catalog.length > 0 && (
        <div className="rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <p className="flex-1 text-2xs font-medium text-fg-muted">Variétés du catalogue : cliquez pour ajouter ou retirer</p>
            {catalog.length > 12 && (
              <Input aria-label="Filtrer les variétés" className="h-8 w-36 text-xs" placeholder="Filtrer…" value={filtre} onChange={e => setFiltre(e.target.value)} />
            )}
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" role="group" aria-label="Variétés du catalogue">
            {visibles.map(c => {
              const on = choisies.has(c.id)
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => basculerVariete(c)}
                  className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors',
                    on ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg')}>
                  {on && <Check className="h-3 w-3" aria-hidden />}{c.name}
                  <span className="num text-fg-subtle">{formatEuros(eurosEnCentimes(c.prix_tige ?? 0))}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {lignes.map((l, i) => {
          const v = valides[i]
          const err = tried && 'erreur' in v ? v.erreur : null
          const montant = 'ligne' in v ? montantLigne(v.ligne) : null
          const tiges = 'ligne' in v ? tigesLigne(v.ligne) : null
          const rate = l.vat_rate_id ? tauxParId.get(l.vat_rate_id) : undefined
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
                  <span className="mb-1 block text-2xs font-medium text-fg-muted">Prix / {UNITE_LABEL[l.unit].toLowerCase()}{assujettie ? ' HT' : ''} (€)</span>
                  <NumberStepper size={compact ? 'lg' : 'md'} label={`le prix unitaire de la ligne ${i + 1}`} value={l.unit_price}
                    onChange={p => maj(l.key, { unit_price: p, prixAuto: false })}
                    step={l.unit === 'tige' ? 0.1 : 1} min={0} inputMode="decimal" placeholder="0,00" aria-label={`Prix unitaire de la ligne ${i + 1}`} />
                </div>
                {assujettie && taux.length > 0 && (
                  <label className={cn('block', compact ? 'col-span-2' : 'col-span-2 sm:col-span-4')}>
                    <span className="mb-1 block text-2xs font-medium text-fg-muted">TVA</span>
                    <Select aria-label={`TVA de la ligne ${i + 1}`} className="h-11 sm:h-10" value={l.vat_rate_id}
                      onChange={e => maj(l.key, { vat_rate_id: e.target.value, tvaAuto: false })}>
                      <option value="">Catégorie à choisir…</option>
                      {taux.filter(t => t.actif || t.id === l.vat_rate_id).map(t => (
                        <option key={t.id} value={t.id}>{t.libelle} · {formatTaux(t.taux_pb)}{t.actif ? '' : ' (désactivé)'}</option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
                {err
                  ? <span className="font-medium text-danger">{err}</span>
                  : <span className="num text-fg-subtle">{tiges !== null ? pluriel(tiges, 'tige') : '-'}{assujettie && rate ? ` · TVA ${formatTaux(rate.taux_pb)}` : ''}</span>}
                <span className="num font-semibold text-fg">{montant !== null ? `${formatEuros(montant)}${assujettie ? ' HT' : ''}` : '-'}</span>
              </div>
            </li>
          )
        })}
      </ol>
      <Button variant="secondary" className="h-11 w-full" onClick={() => onChange([...lignes, nouvelleLigne({ vat_rate_id: defautPour('tige') })])}>
        <Plus className="h-4 w-4" /> Ajouter une ligne
      </Button>

      <Budget lignes={lignes} onChange={onChange} tva={tva} />

      <div className="num space-y-1 rounded-lg bg-primary-soft px-3 py-2.5 text-sm" aria-live="polite" aria-label="Totaux">
        <div className="flex items-baseline justify-between">
          <span className="text-fg-muted">{pluriel(totaux.nb_lignes, 'ligne')} · {pluriel(totaux.tiges, 'tige')}</span>
          <span>{assujettie ? 'Total HT' : 'Total'} <strong className={cn('text-fg', assujettie ? 'text-sm' : 'text-base')}>{formatEuros(totaux.total_centimes)}</strong></span>
        </div>
        {assujettie && totaux.tva && totaux.tva.ventilation.map(v => (
          <div key={v.taux_pb} className="flex items-baseline justify-between text-xs text-fg-muted">
            <span>TVA {formatTaux(v.taux_pb)} sur {formatEuros(v.base_ht)}</span>
            <span>{formatEuros(v.tva)}</span>
          </div>
        ))}
        {assujettie && (totaux.tva ? (
          <div className="flex items-baseline justify-between border-t border-primary/20 pt-1">
            <span className="text-fg-muted">Total TTC</span>
            <strong className="text-base text-fg">{formatEuros(totaux.tva.total_ttc)}</strong>
          </div>
        ) : totaux.erreurTva && totaux.nb_lignes > 0 ? (
          <p className="text-xs font-medium text-danger">TVA non calculable : {totaux.erreurTva}.</p>
        ) : null)}
      </div>
    </div>
  )
}

/** « Commande au budget » : quantités entières proposées pour tenir dans un montant. */
function Budget({ lignes, onChange, tva }: {
  lignes: LigneSaisie[]
  onChange: (l: LigneSaisie[]) => void
  tva?: ContexteTva
}) {
  const assujettie = !!tva?.assujettie
  const [budget, setBudget] = useState('')
  const [base, setBase] = useState<BaseBudget>('ttc')
  const [repartition, setRepartition] = useState<'egale' | 'proportions'>('egale')
  const [parts, setParts] = useState<Record<string, string>>({})
  const [resultat, setResultat] = useState<{ ok: true; texte: string } | { ok: false; texte: string } | null>(null)
  const tauxParId = new Map((tva?.taux ?? []).map(t => [t.id, t]))
  const baseEffective: BaseBudget = assujettie ? base : 'ht'
  // Lignes au prix connu : celles que le budget répartit
  const candidates = lignes.filter(l => l.label.trim() && (lireCentiemes(l.unit_price) ?? 0) > 0)

  const repartir = () => {
    const b = lireCentiemes(budget)
    if (b === null || b <= 0) { setResultat({ ok: false, texte: 'Saisissez un budget supérieur à zéro.' }); return }
    if (candidates.length === 0) { setResultat({ ok: false, texte: 'Choisissez des variétés avec un prix.' }); return }
    try {
      const p = proposerQuantites({
        budget: b, base: baseEffective, assujettie,
        articles: candidates.map(l => ({
          cle: l.key,
          prix_ht: lireCentiemes(l.unit_price) as number,
          taux_pb: l.vat_rate_id ? tauxParId.get(l.vat_rate_id)?.taux_pb ?? null : null,
          poids: repartition === 'egale' ? 1 : Math.max(0, (lireCentiemes(parts[l.key] ?? '') ?? 0)),
        })),
      })
      const q = new Map(p.quantites.map(x => [x.cle, x.quantite]))
      onChange(lignes.map(l => (q.has(l.key) ? { ...l, quantity: String(q.get(l.key)) } : l)))
      const zero = p.quantites.filter(x => x.quantite === 0).length
      setResultat({
        ok: true,
        texte: `Total proposé ${formatEuros(p.total)}${assujettie ? (baseEffective === 'ttc' ? ' TTC' : ' HT') : ''} pour un budget de ${formatEuros(b)} : écart ${formatEuros(p.ecart)}.`
          + (zero ? ` ${pluriel(zero, 'variété')} à 0 : budget trop juste pour ${zero > 1 ? 'elles' : 'elle'}.` : ''),
      })
    } catch (e) {
      setResultat({ ok: false, texte: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <details className="group rounded-xl border border-border bg-surface p-3">
      <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-fg">
        <Calculator className="h-4 w-4 text-fg-muted" aria-hidden /> Commande au budget
        <span className="font-normal text-fg-muted">ex. « 500 € de tiges »</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-fg-muted">Budget (€)</span>
            <Input aria-label="Budget" inputMode="decimal" className="num h-11" placeholder="500" value={budget} onChange={e => setBudget(e.target.value)} />
          </label>
          {assujettie && (
            <div>
              <span className="mb-1 block text-2xs font-medium text-fg-muted">Le budget s’entend</span>
              <Segmented label="Base du budget" value={base} onChange={setBase}
                options={[{ value: 'ttc', label: 'TTC' }, { value: 'ht', label: 'HT' }]} />
            </div>
          )}
        </div>
        <Segmented label="Répartition du budget" value={repartition} onChange={setRepartition}
          options={[{ value: 'egale', label: 'Répartition égale' }, { value: 'proportions', label: 'Proportions' }]} />
        {repartition === 'proportions' && (
          <ul className="space-y-1.5">
            {candidates.map(l => (
              <li key={l.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                <Input aria-label={`Part de ${l.label} (%)`} inputMode="decimal" className="num h-9 w-20 text-right" placeholder="%"
                  value={parts[l.key] ?? ''} onChange={e => setParts(p => ({ ...p, [l.key]: e.target.value }))} />
                <span className="text-xs text-fg-muted">%</span>
              </li>
            ))}
            {candidates.length === 0 && <li className="text-xs text-fg-subtle">Ajoutez des variétés avec un prix.</li>}
          </ul>
        )}
        <Button variant="secondary" className="w-full" onClick={repartir}>
          <Calculator className="h-4 w-4" aria-hidden /> Proposer les quantités
        </Button>
        {resultat && (
          <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', resultat.ok ? 'bg-surface-2 text-fg' : 'bg-danger-soft text-danger')}>{resultat.texte}</p>
        )}
        <p className="text-2xs text-fg-subtle">Quantités entières, prix unitaires des lignes ; le total ne dépasse jamais le budget.</p>
      </div>
    </details>
  )
}
