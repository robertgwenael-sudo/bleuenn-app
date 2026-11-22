'use client'
import { useMemo, useState } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import { Badge, Card, EmptyState, SearchInput, Select, TableContainer, cn } from '@/components/ui'
import { formatEuros, type Invoice } from '@/lib/domain'
import { STATUT_FACTURE_LIBELLE, correspondFiltre, type FiltreStatut, type SituationFacture } from '@/lib/domain/factures'
import { STATUT_TONE, dateFr } from './commun'

export type LigneListe = { f: Invoice; s: SituationFacture }

const FILTRES: { value: FiltreStatut; label: string }[] = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'impayees', label: 'Impayées' },
  { value: 'en_retard', label: 'En retard' },
  { value: 'partielle', label: 'Partiellement payées' },
  { value: 'a_payer', label: 'À payer' },
  { value: 'payee', label: 'Payées' },
  { value: 'annulee', label: 'Annulées par avoir' },
  { value: 'avoir', label: 'Avoirs' },
]

export function StatutBadge({ s }: { s: SituationFacture }) {
  return (
    <Badge tone={STATUT_TONE[s.statut]} dot>
      {STATUT_FACTURE_LIBELLE[s.statut]}{s.statut === 'en_retard' && s.joursRetard ? ` · ${s.joursRetard} j` : ''}
    </Badge>
  )
}

/** Liste des factures et avoirs : filtre par statut, reste dû, retards en évidence. */
export function ListeFactures({ lignes, onOuvrir }: { lignes: LigneListe[]; onOuvrir: (id: string) => void }) {
  const [filtre, setFiltre] = useState<FiltreStatut>('toutes')
  const [q, setQ] = useState('')
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return lignes.filter(({ f, s }) => correspondFiltre(s.statut, filtre)
      && (!t || [f.numero, f.acheteur?.nom].some(x => (x ?? '').toLowerCase().includes(t))))
  }, [lignes, filtre, q])
  const compte = (v: FiltreStatut) => lignes.filter(l => correspondFiltre(l.s.statut, v)).length

  if (lignes.length === 0) {
    return <Card><EmptyState icon={<FileText className="h-6 w-6" aria-hidden />} title="Aucune facture émise"
      description="Émettez une première facture depuis l’onglet « À facturer »." /></Card>
  }

  return (
    <section aria-label="Factures et avoirs" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select aria-label="Filtrer par statut" value={filtre} onChange={e => setFiltre(e.target.value as FiltreStatut)} wrapperClassName="sm:w-64">
          {FILTRES.map(o => <option key={o.value} value={o.value}>{o.label} ({compte(o.value)})</option>)}
        </Select>
        <SearchInput value={q} onChange={setQ} placeholder="Numéro, client…" className="sm:ml-auto sm:w-64" label="Rechercher une facture" />
      </div>

      {visibles.length === 0 ? (
        <Card><EmptyState compact title="Aucune facture" description="Aucune facture ne correspond à ce filtre." /></Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {visibles.map(({ f, s }) => (
              <li key={f.id}>
                <button type="button" onClick={() => onOuvrir(f.id)}
                  className={cn('flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left shadow-xs',
                    s.statut === 'en_retard' ? 'border-danger/40' : 'border-border')}>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="num text-sm font-semibold text-fg">{f.numero}</span>
                      <StatutBadge s={s} />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-fg">{f.acheteur?.nom || 'Client particulier'}</span>
                    <span className="block text-xs text-fg-muted">
                      {dateFr(f.date_emission)}{f.kind === 'facture' && !f.annulee_par ? ` · échéance ${dateFr(f.date_echeance)}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-semibold">{formatEuros(s.total)}</span>
                    {s.reste !== 0 && <span className={cn('num block text-xs', s.statut === 'en_retard' ? 'font-semibold text-danger' : 'text-fg-muted')}>
                      {s.reste > 0 ? `reste ${formatEuros(s.reste)}` : `à rembourser ${formatEuros(-s.reste)}`}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <TableContainer className="hidden md:block" label="Factures et avoirs">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Numéro</th><th>Client</th><th>Émise le</th><th>Échéance</th>
                  <th className="!text-right">Total</th><th className="!text-right">Payé</th><th className="!text-right">Reste dû</th><th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ f, s }) => (
                  <tr key={f.id} className={cn('cursor-pointer', s.statut === 'en_retard' && 'bg-danger-soft/40')} onClick={() => onOuvrir(f.id)}>
                    <td className="whitespace-nowrap">
                      <button type="button" className="num font-semibold text-fg hover:underline" onClick={e => { e.stopPropagation(); onOuvrir(f.id) }}>{f.numero}</button>
                    </td>
                    <td className="max-w-[14rem] truncate">{f.acheteur?.nom || 'Client particulier'}</td>
                    <td className="whitespace-nowrap text-fg-muted">{dateFr(f.date_emission)}</td>
                    <td className={cn('whitespace-nowrap', s.statut === 'en_retard' ? 'font-semibold text-danger' : 'text-fg-muted')}>
                      {f.kind === 'facture' ? dateFr(f.date_echeance) : '—'}
                    </td>
                    <td className="num text-right font-semibold">{formatEuros(s.total)}</td>
                    <td className="num text-right text-fg-muted">{f.kind === 'facture' ? formatEuros(s.paye) : '—'}</td>
                    <td className={cn('num text-right', s.statut === 'en_retard' ? 'font-semibold text-danger' : s.reste > 0 ? 'text-fg' : 'text-fg-subtle')}>
                      {f.kind === 'avoir' ? '—' : s.reste < 0 ? `${formatEuros(-s.reste)} à rembourser` : formatEuros(s.reste)}
                    </td>
                    <td><StatutBadge s={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}
    </section>
  )
}
