'use client'
// Tableau « façon tableur » du bloc « Gestion de la production et du
// rendement » : une ligne par plantation, sous-total par jardin, total général.
import { Fragment } from 'react'
import { formatDateShort } from '@/lib/types'
import type { GroupeJardin, LigneSemis, TauxPertes, TotauxProduction } from '@/lib/domain/production'
import { Badge, TableContainer, cn } from '@/components/ui'
import { CelluleCalcul, CelluleMontant, eurosRonds, nb } from './format'

function Origine({ l }: { l: LigneSemis }) {
  if (l.achat) return <Badge tone="violet">Plant acheté</Badge>
  if (l.direct) return <Badge tone="blue">Semis direct</Badge>
  return null
}

function LigneTotal({ t, label, className }: { t: TotauxProduction; label: string; className?: string }) {
  return (
    <tr className={className}>
      <td colSpan={3} className="font-semibold">
        {label}
        {t.incompletes > 0 && <span className="ml-2 text-xs font-medium text-warning">{t.incompletes} ligne{t.incompletes > 1 ? 's' : ''} incomplète{t.incompletes > 1 ? 's' : ''}</span>}
      </td>
      <td className="num text-right">{nb(t.surface_m2)}</td>
      <td className="num text-right">{nb(t.plants)}</td>
      <td className="num text-right">{nb(t.plantsAvecPertes)}</td>
      <td className="num text-right">{nb(t.graines)}</td>
      <td className="num text-right">{nb(t.tiges)}</td>
      <td className="num text-right">{nb(t.tigesNettes)}</td>
      <td />
      <td className="num text-right">{eurosRonds(t.revenuCentimes)}</td>
      <td />
    </tr>
  )
}

export function TableauProduction({ jardins, total, taux }: { jardins: GroupeJardin[]; total: TotauxProduction; taux: TauxPertes }) {
  const R = 'text-right !normal-case'
  return (
    <>
      {/* Téléphone : cartes par jardin */}
      <div className="space-y-5 md:hidden">
        {jardins.map(g => (
          <section key={g.garden_id} aria-label={g.garden_name}>
            <h2 className="mb-2 text-base font-semibold">{g.garden_name}</h2>
            <ul className="space-y-2">
              {g.lignes.map(l => (
                <li key={l.planting.id} className="rounded-xl border border-border bg-surface p-3 shadow-xs" data-testid="ligne-semis">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg">{l.planting.culture_name}</p>
                      <p className="text-xs text-fg-muted">{l.planting.planche_name} · {nb(Number(l.planting.surface_m2))} m² · entrée {formatDateShort(l.calendrier.entree)}</p>
                    </div>
                    <Origine l={l} />
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
                    <div><dt className="text-fg-subtle">Plants</dt><dd className="font-semibold"><CelluleCalcul c={l.production.plants} /></dd></div>
                    <div><dt className="text-fg-subtle">+ {taux.semis} %</dt><dd className="font-semibold"><CelluleCalcul c={l.production.plantsAvecPertes} /></dd></div>
                    <div><dt className="text-fg-subtle">Graines</dt><dd className="font-semibold text-primary"><CelluleCalcul c={l.production.graines} /></dd></div>
                    <div><dt className="text-fg-subtle">Tiges</dt><dd><CelluleCalcul c={l.production.tiges} /></dd></div>
                    <div><dt className="text-fg-subtle">Nettes</dt><dd><CelluleCalcul c={l.production.tigesNettes} /></dd></div>
                    <div><dt className="text-fg-subtle">Revenu</dt><dd><CelluleMontant m={l.production.revenu} rond /></dd></div>
                  </dl>
                </li>
              ))}
            </ul>
            <p className="num mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs" data-testid="total-jardin">
              Total {g.garden_name} : <strong>{nb(g.totaux.plants)}</strong> plants, <strong>{nb(g.totaux.graines)}</strong> graines,{' '}
              <strong>{nb(g.totaux.tigesNettes)}</strong> tiges nettes, <strong>{eurosRonds(g.totaux.revenuCentimes)}</strong>
            </p>
          </section>
        ))}
        <p className="num rounded-xl border border-border bg-surface px-3 py-3 text-sm shadow-xs">
          Total général : <strong>{nb(total.plants)}</strong> plants, <strong>{nb(total.plantsAvecPertes)}</strong> avec pertes,{' '}
          <strong>{nb(total.graines)}</strong> graines, <strong>{nb(total.tigesNettes)}</strong> tiges nettes, <strong>{eurosRonds(total.revenuCentimes)}</strong>
        </p>
      </div>

      {/* Écran large : le tableur */}
      <TableContainer className="hidden md:block" label="Production par plantation">
        <table className="data-table">
          <thead>
            <tr>
              <th>Planche</th>
              <th>Culture</th>
              <th>Entrée cellule</th>
              <th className={R}>m²</th>
              <th className={R}>Plants</th>
              <th className={R}>Plants + {taux.semis} %</th>
              <th className={R}>Graines</th>
              <th className={R}>Tiges</th>
              <th className={R}>Tiges − {taux.champ} %</th>
              <th className={R}>Tiges / sem.</th>
              <th className={R}>Revenu</th>
              <th className={R}>CA / sem.</th>
            </tr>
          </thead>
          <tbody>
            {jardins.map(g => (
              <Fragment key={g.garden_id}>
                <tr><td colSpan={12} className="bg-surface-2/60 text-xs font-semibold uppercase tracking-wider text-fg-muted">{g.garden_name}</td></tr>
                {g.lignes.map(l => (
                  <tr key={l.planting.id} data-testid="ligne-semis-table">
                    <td className="text-fg-muted">{l.planting.planche_name}</td>
                    <td className="font-medium"><span className="mr-2">{l.planting.culture_name}</span><Origine l={l} /></td>
                    <td className="num text-fg-muted">{formatDateShort(l.calendrier.entree)} <span className="text-2xs text-fg-subtle">S{l.calendrier.semaineEntree.semaine}</span></td>
                    <td className="num text-right">{nb(Number(l.planting.surface_m2))}</td>
                    <td className="text-right"><CelluleCalcul c={l.production.plants} /></td>
                    <td className="text-right"><CelluleCalcul c={l.production.plantsAvecPertes} /></td>
                    <td className="text-right font-semibold text-primary"><CelluleCalcul c={l.production.graines} /></td>
                    <td className="text-right"><CelluleCalcul c={l.production.tiges} /></td>
                    <td className="text-right"><CelluleCalcul c={l.production.tigesNettes} /></td>
                    <td className="text-right"><CelluleCalcul c={l.production.tigesParSemaine} /></td>
                    <td className="text-right"><CelluleMontant m={l.production.revenu} rond /></td>
                    <td className="text-right"><CelluleMontant m={l.production.caParSemaine} rond /></td>
                  </tr>
                ))}
                <LigneTotal t={g.totaux} label={`Total ${g.garden_name}`} className={cn('[&>td]:bg-surface-2/40')} />
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <LigneTotal t={total} label="Total général" />
          </tfoot>
        </table>
      </TableContainer>
    </>
  )
}
