'use client'
import { useMemo } from 'react'
import { SortHeader, TableContainer, cn, useSort, useSorted } from '@/components/ui'
import { formatEuros, type Centimes } from '@/lib/domain'
import { CaReel, StatutBadge, fmtPct, fmtSigne, fmtTiges, statut } from './commun'

export interface LigneBilan {
  cle: string
  libelle: string
  sousTitre?: string
  /** Tiges prévues jusqu'à la semaine en cours incluse. */
  prevu_date: number
  prevu_saison: number
  recolte: number
  perdu: number
  ca_prevu_date: Centimes
  /** null = non calculable à ce niveau. */
  ca_reel: Centimes | null
  /** Ligne hors plan (ventes non rattachées…) : affichée à part, en fin de tableau. */
  horsPlan?: boolean
}

type Cle = 'libelle' | 'prevu' | 'recolte' | 'ecart' | 'taux' | 'perdu' | 'tauxPerte' | 'caReel'

const taux = (l: LigneBilan) => (l.prevu_date > 0 ? l.recolte / l.prevu_date : null)
const tauxPerte = (l: LigneBilan) => (l.recolte > 0 ? l.perdu / l.recolte : null)

const tonLigne: Record<string, string> = {
  avance: 'text-info', cible: 'text-primary', retard: 'text-warning', na: 'text-fg-subtle',
}

export function TableauBilan({ lignes, titreColonne, label }: { lignes: LigneBilan[]; titreColonne: string; label: string }) {
  const sort = useSort<Cle>('ecart', 'asc')
  const dansPlan = useMemo(() => lignes.filter(l => !l.horsPlan), [lignes])
  const horsPlan = useMemo(() => lignes.filter(l => l.horsPlan), [lignes])
  const getter = useMemo(() => (l: LigneBilan): string | number | null => {
    switch (sort.key) {
      case 'libelle': return l.libelle
      case 'prevu': return l.prevu_date
      case 'recolte': return l.recolte
      case 'ecart': return l.recolte - l.prevu_date
      case 'taux': return taux(l) ?? -1
      case 'perdu': return l.perdu
      case 'tauxPerte': return tauxPerte(l) ?? -1
      case 'caReel': return l.ca_reel ?? -1
    }
  }, [sort.key])
  const tri = useSorted(dansPlan, getter, sort.dir)
  const tout = [...tri, ...horsPlan]

  const h = (k: Cle, lib: string, right = true) => (
    <SortHeader label={lib} align={right ? 'right' : 'left'} className={right ? '!text-right' : undefined}
      active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} />
  )

  return (
    <>
      {/* Mobile : cartes */}
      <div className="mb-2 flex items-center gap-2 md:hidden">
        <label htmlFor={`tri-${label}`} className="text-xs text-fg-muted">Trier par</label>
        <select id={`tri-${label}`} value={`${sort.key}`} onChange={e => sort.toggle(e.target.value as Cle)}
          className="h-9 rounded-btn border border-border bg-surface px-2 text-sm">
          <option value="ecart">Écart</option><option value="taux">Taux de réalisation</option>
          <option value="recolte">Récolté</option><option value="perdu">Perdu</option>
          <option value="libelle">{titreColonne}</option><option value="caReel">CA réel</option>
        </select>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={label}>
        {tout.map(l => {
          const t = taux(l)
          return (
            <li key={l.cle} className="rounded-xl border border-border bg-surface p-3 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-fg">{l.libelle}</p>
                  {l.sousTitre && <p className="truncate text-xs text-fg-muted">{l.sousTitre}</p>}
                </div>
                {!l.horsPlan && <StatutBadge taux={t} />}
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-fg-subtle">Récolté</dt><dd className="num font-semibold text-fg">{fmtTiges(l.recolte)}</dd></div>
                <div><dt className="text-fg-subtle">Prévu à date</dt><dd className="num text-fg">{fmtTiges(l.prevu_date)}</dd></div>
                <div><dt className="text-fg-subtle">Réalisation</dt><dd className={cn('num font-semibold', tonLigne[statut(t)])}>{fmtPct(t)}</dd></div>
                <div><dt className="text-fg-subtle">Perdu</dt><dd className="num text-fg">{fmtTiges(l.perdu)} <span className="text-fg-subtle">· {fmtPct(tauxPerte(l))}</span></dd></div>
                <div className="col-span-2"><dt className="text-fg-subtle">CA réel / prévu à date</dt>
                  <dd className="num text-fg"><CaReel c={l.ca_reel} /> <span className="text-fg-subtle">/ {formatEuros(l.ca_prevu_date)}</span></dd></div>
              </dl>
            </li>
          )
        })}
      </ul>

      {/* Bureau : tableau triable */}
      <TableContainer className="hidden md:block" label={label} maxHeight="max-h-[34rem]">
        <table className="data-table">
          <thead>
            <tr>
              {h('libelle', titreColonne, false)}
              {h('prevu', 'Prévu à date')}
              {h('recolte', 'Récolté')}
              {h('ecart', 'Écart')}
              {h('taux', 'Réalisation')}
              {h('perdu', 'Perdu')}
              {h('tauxPerte', 'Taux perte')}
              {h('caReel', 'CA réel')}
            </tr>
          </thead>
          <tbody>
            {tout.map(l => {
              const t = taux(l)
              const ecart = l.recolte - l.prevu_date
              return (
                <tr key={l.cle} className={l.horsPlan ? 'text-fg-muted' : undefined}>
                  <td>
                    <div className={cn('font-medium', l.horsPlan && 'italic')}>{l.libelle}</div>
                    {l.sousTitre && <div className="whitespace-nowrap text-xs text-fg-muted">{l.sousTitre}</div>}
                  </td>
                  <td className="num text-right">{fmtTiges(l.prevu_date)}<div className="text-2xs text-fg-subtle">sur {fmtTiges(l.prevu_saison)}</div></td>
                  <td className="num text-right font-semibold">{fmtTiges(l.recolte)}</td>
                  <td className={cn('num text-right', l.horsPlan ? '' : tonLigne[statut(t)])}>{l.horsPlan ? '—' : fmtSigne(ecart)}</td>
                  <td className="text-right">
                    {l.horsPlan ? <span className="text-xs text-fg-subtle">Hors plan</span> : (
                      <div className="flex items-center justify-end gap-2">
                        <span className={cn('num font-semibold', tonLigne[statut(t)])}>{fmtPct(t)}</span>
                        <StatutBadge taux={t} />
                      </div>
                    )}
                  </td>
                  <td className="num text-right">{fmtTiges(l.perdu)}</td>
                  <td className="num text-right text-fg-muted">{fmtPct(tauxPerte(l))}</td>
                  <td className="num text-right">
                    <CaReel c={l.ca_reel} className="font-medium" />
                    <div className="text-2xs text-fg-subtle">prévu à date {formatEuros(l.ca_prevu_date)}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableContainer>
    </>
  )
}
