'use client'
import { useMemo } from 'react'
import { Badge, SortHeader, TableContainer, cn, useSort, useSorted } from '@/components/ui'
import { formatEuros } from '@/lib/domain'
import { formatDuree, type Grandeur, type MargeCulture } from '@/lib/domain/couts'
import { Valeur, parHeure, parM2 } from './commun'

type Cle = 'libelle' | 'ca' | 'depenses' | 'minutes' | 'marge' | 'margeM2' | 'parHeure'

const val = (g: Grandeur) => g.valeur

/** Marge retenue pour dire « déficitaire » : après temps si calculable, sinon hors temps. */
export function margeRetenue(l: MargeCulture): Grandeur {
  return l.marge.valeur !== null ? l.marge : l.marge_hors_temps
}
const margeM2Retenue = (l: MargeCulture): Grandeur => (l.marge.valeur !== null ? l.marge_m2 : l.marge_hors_temps_m2)

/**
 * Rentabilité par culture : tableau triable sur grand écran, cartes sur
 * téléphone. Une culture déficitaire est signalée par un badge et un filet
 * à gauche, sans repeindre toute la ligne.
 */
export function TableauRentabilite({ lignes, tauxRenseigne }: { lignes: MargeCulture[]; tauxRenseigne: boolean }) {
  const sort = useSort<Cle>('marge', 'desc')
  const getter = useMemo(() => (l: MargeCulture): string | number | null => {
    // Les non calculables vont en fin de tri, quel que soit le sens.
    const nc = sort.dir === 'desc' ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    switch (sort.key) {
      case 'libelle': return l.libelle
      case 'ca': return l.ca
      case 'depenses': return val(l.depenses) ?? nc
      case 'minutes': return val(l.minutes) ?? nc
      case 'marge': return val(margeRetenue(l)) ?? nc
      case 'margeM2': return val(margeM2Retenue(l)) ?? nc
      case 'parHeure': return val(l.marge_par_heure) ?? nc
    }
  }, [sort.key, sort.dir])
  const tri = useSorted(lignes, getter, sort.dir)

  const h = (k: Cle, lib: React.ReactNode, right = true) => (
    <SortHeader label={lib} align={right ? 'right' : 'left'} className={right ? '!text-right' : undefined}
      active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} />
  )
  const deficit = (l: MargeCulture) => (val(margeRetenue(l)) ?? 0) < 0

  return (
    <>
      {/* Téléphone : cartes */}
      <div className="mb-2 flex items-center gap-2 md:hidden">
        <label htmlFor="tri-rentabilite" className="text-xs text-fg-muted">Trier par</label>
        <select id="tri-rentabilite" value={sort.key} onChange={e => sort.toggle(e.target.value as Cle)}
          className="h-9 rounded-btn border border-border bg-surface px-2 text-sm">
          <option value="marge">Marge</option><option value="margeM2">Marge au m²</option>
          <option value="parHeure">€ par heure</option><option value="ca">CA</option>
          <option value="depenses">Dépenses</option><option value="minutes">Temps</option>
          <option value="libelle">Culture</option>
        </select>
      </div>
      <ul className="space-y-2 md:hidden" aria-label="Rentabilité par culture">
        {tri.map(l => (
          <li key={l.culture_id} className={cn('rounded-xl border border-border bg-surface p-3 shadow-xs', deficit(l) && 'border-l-4 border-l-danger')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">{l.libelle}</p>
                <p className="text-xs text-fg-muted">{l.surface_m2 ? `${l.surface_m2.toLocaleString('fr-FR')} m²` : 'hors plan'}</p>
              </div>
              <div className="text-right">
                <Valeur g={margeRetenue(l)} signe className="num text-base font-semibold" />
                <p className="text-2xs text-fg-subtle">{l.marge.valeur !== null ? 'marge' : 'marge hors temps'}</p>
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-fg-subtle">CA</dt><dd className="num text-fg">{formatEuros(l.ca)}</dd></div>
              <div><dt className="text-fg-subtle">Dépenses</dt><dd className="num text-fg"><Valeur g={l.depenses} /></dd></div>
              <div><dt className="text-fg-subtle">Temps</dt><dd className="num text-fg"><Valeur g={l.minutes} format={formatDuree} /></dd></div>
              <div><dt className="text-fg-subtle">Marge/m²</dt><dd className="num text-fg"><Valeur g={margeM2Retenue(l)} format={parM2} signe /></dd></div>
              <div><dt className="text-fg-subtle">€/heure</dt><dd className="num text-fg"><Valeur g={l.marge_par_heure} format={parHeure} signe /></dd></div>
              <div><dt className="text-fg-subtle">CA/heure</dt><dd className="num text-fg"><Valeur g={l.ca_par_heure} format={parHeure} /></dd></div>
            </dl>
            {deficit(l) && <Badge tone="red" className="mt-2">Déficitaire</Badge>}
          </li>
        ))}
      </ul>

      {/* Grand écran : tableau triable */}
      <TableContainer className="hidden md:block" label="Rentabilité par culture" maxHeight="max-h-[36rem]">
        <table className="data-table">
          <thead>
            <tr>
              {h('libelle', 'Culture', false)}
              {h('ca', 'CA réel')}
              {h('depenses', 'Dépenses')}
              {h('minutes', 'Temps')}
              {h('marge', tauxRenseigne ? 'Marge' : 'Marge hors temps')}
              {h('margeM2', 'Marge/m²')}
              {h('parHeure', '€/heure')}
              <th className="!text-right">CA/heure</th>
            </tr>
          </thead>
          <tbody>
            {tri.map(l => (
              <tr key={l.culture_id}>
                <td className={cn(deficit(l) && 'shadow-[inset_3px_0_0_rgb(var(--danger))]')}>
                  <div className="flex items-center gap-2 font-medium">
                    {l.libelle}
                    {deficit(l) && <Badge tone="red">Déficitaire</Badge>}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {l.nb_plantations ? `${l.surface_m2.toLocaleString('fr-FR')} m² · ${l.nb_plantations} plantation${l.nb_plantations > 1 ? 's' : ''}` : 'hors plan de la saison'}
                  </div>
                </td>
                <td className="num text-right">{formatEuros(l.ca)}</td>
                <td className="num text-right">
                  <Valeur g={l.depenses} />
                  {l.depenses_reparties.valeur !== null && l.depenses_reparties.valeur > 0 && (
                    <div className="text-2xs text-fg-subtle">dont {formatEuros(l.depenses_reparties.valeur)} de frais généraux</div>
                  )}
                </td>
                <td className="num text-right">
                  <Valeur g={l.minutes} format={formatDuree} />
                  {l.temps_valorise.valeur !== null && l.temps_valorise.valeur > 0 && (
                    <div className="text-2xs text-fg-subtle">{formatEuros(l.temps_valorise.valeur)}</div>
                  )}
                </td>
                <td className="num text-right font-semibold"><Valeur g={margeRetenue(l)} signe /></td>
                <td className="num text-right"><Valeur g={margeM2Retenue(l)} format={parM2} signe /></td>
                <td className="num text-right"><Valeur g={l.marge_par_heure} format={parHeure} signe /></td>
                <td className="num text-right text-fg-muted"><Valeur g={l.ca_par_heure} format={parHeure} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
    </>
  )
}
