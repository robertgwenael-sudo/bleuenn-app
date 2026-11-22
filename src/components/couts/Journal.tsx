'use client'
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Select, Tabs, useConfirm } from '@/components/ui'
import {
  COST_CATEGORIES, eurosEnCentimes, formatEuros, formatJourMois, formatMois,
  type Cost, type TimeEntry, type TimeKind,
} from '@/lib/domain'
import { LIBELLES_CATEGORIES, LIBELLES_TRAVAUX, formatDuree } from '@/lib/domain/couts'

type Onglet = 'depenses' | 'temps'

/** Journal des dépenses et des temps de la saison, filtrable, avec suppression. */
export function Journal({ costs, temps, nomCulture, nomPlanche, nomPersonne, onDeleteCost, onDeleteTime }: {
  costs: Cost[]
  temps: TimeEntry[]
  nomCulture: (id: string | null) => string | null
  nomPlanche: (id: string | null) => string | null
  nomPersonne: (id: string) => string
  onDeleteCost: (id: string) => Promise<boolean>
  onDeleteTime: (id: string) => Promise<boolean>
}) {
  const confirm = useConfirm()
  const [onglet, setOnglet] = useState<Onglet>('depenses')
  const [type, setType] = useState('')
  const [culture, setCulture] = useState('')
  const [mois, setMois] = useState('')

  const lignes = onglet === 'depenses' ? costs : temps
  const moisDispo = useMemo(() => Array.from(new Set(lignes.map(l => l.date.slice(0, 7)))).sort().reverse(), [lignes])
  const culturesDispo = useMemo(() => {
    const ids = Array.from(new Set(lignes.map(l => l.culture_id).filter((x): x is string => !!x)))
    return ids.map(id => ({ id, name: nomCulture(id) ?? 'Culture inconnue' })).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [lignes, nomCulture])

  const garde = (l: Cost | TimeEntry) =>
    (!mois || l.date.startsWith(mois))
    && (!culture || (culture === '-' ? !l.culture_id : l.culture_id === culture))
  const dep = costs.filter(c => garde(c) && (!type || c.category === type))
  const tps = temps.filter(t => garde(t) && (!type || t.kind === type))
  const totalDep = dep.reduce((s, c) => s + eurosEnCentimes(c.amount), 0)
  const totalMin = tps.reduce((s, t) => s + t.minutes, 0)

  const changerOnglet = (o: Onglet) => { setOnglet(o); setType('') }
  const supprimer = async (quoi: string, f: () => Promise<boolean>) => {
    if (await confirm({ title: `Supprimer ${quoi} ?`, description: 'Le bilan de rentabilité sera recalculé.', confirmLabel: 'Supprimer', destructive: true })) await f()
  }

  return (
    <div className="space-y-3">
      <Tabs<Onglet> label="Journal" value={onglet} onChange={changerOnglet}
        options={[{ value: 'depenses', label: `Dépenses (${costs.length})` }, { value: 'temps', label: `Temps (${temps.length})` }]} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select aria-label={onglet === 'depenses' ? 'Filtrer par catégorie' : 'Filtrer par travail'} value={type} onChange={e => setType(e.target.value)}>
          <option value="">{onglet === 'depenses' ? 'Toutes catégories' : 'Tous travaux'}</option>
          {onglet === 'depenses'
            ? COST_CATEGORIES.map(c => <option key={c} value={c}>{LIBELLES_CATEGORIES[c]}</option>)
            : (Object.keys(LIBELLES_TRAVAUX) as TimeKind[]).map(k => <option key={k} value={k}>{LIBELLES_TRAVAUX[k]}</option>)}
        </Select>
        <Select aria-label="Filtrer par culture" value={culture} onChange={e => setCulture(e.target.value)}>
          <option value="">Toutes cultures</option>
          <option value="-">Sans culture (général)</option>
          {culturesDispo.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Filtrer par mois" value={mois} onChange={e => setMois(e.target.value)}>
          <option value="">Tous les mois</option>
          {moisDispo.map(m => <option key={m} value={m}>{formatMois(m)}</option>)}
        </Select>
      </div>

      <p className="text-xs text-fg-muted" aria-live="polite">
        {onglet === 'depenses'
          ? `${dep.length} dépense${dep.length > 1 ? 's' : ''} · ${formatEuros(totalDep)}`
          : `${tps.length} saisie${tps.length > 1 ? 's' : ''} · ${formatDuree(totalMin)}`}
      </p>

      {(onglet === 'depenses' ? dep : tps).length === 0 ? (
        <EmptyState compact title="Rien à afficher" description={lignes.length ? 'Aucune ligne ne correspond aux filtres.' : 'Aucune saisie pour cette saison.'} />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {onglet === 'depenses' ? dep.map(c => {
            const cu = nomCulture(c.culture_id), pl = nomPlanche(c.planche_id)
            return (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold text-fg">{formatEuros(eurosEnCentimes(c.amount))}</span>
                    <Badge>{LIBELLES_CATEGORIES[c.category] ?? c.category}</Badge>
                    {cu ? <Badge tone="green">{cu}</Badge> : <Badge tone="neutral">Général</Badge>}
                    {pl && <span className="text-xs text-fg-muted">{pl}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {formatJourMois(c.date)}{c.supplier ? ` · ${c.supplier}` : ''}{c.notes ? ` · ${c.notes}` : ''}
                  </p>
                </div>
                <Button variant="danger-ghost" size="icon-sm" aria-label={`Supprimer la dépense du ${formatJourMois(c.date)}`}
                  onClick={() => supprimer('cette dépense', () => onDeleteCost(c.id))}><Trash2 className="h-4 w-4" /></Button>
              </li>
            )
          }) : tps.map(t => {
            const cu = nomCulture(t.culture_id), pl = nomPlanche(t.planche_id)
            return (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold text-fg">{formatDuree(t.minutes)}</span>
                    <Badge>{LIBELLES_TRAVAUX[t.kind] ?? t.kind}</Badge>
                    {cu ? <Badge tone="green">{cu}</Badge> : <Badge tone="neutral">Général</Badge>}
                    {pl && <span className="text-xs text-fg-muted">{pl}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {formatJourMois(t.date)} · {nomPersonne(t.user_id)}{t.notes ? ` · ${t.notes}` : ''}
                  </p>
                </div>
                <Button variant="danger-ghost" size="icon-sm" aria-label={`Supprimer le temps du ${formatJourMois(t.date)}`}
                  onClick={() => supprimer('ce temps', () => onDeleteTime(t.id))}><Trash2 className="h-4 w-4" /></Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
