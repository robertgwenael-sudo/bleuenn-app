'use client'
// Graines à semer par culture, face aux graines déjà commandées
// (seed_orders « hors bon » + bons de commande de la saison active).
import type { BesoinGraines } from '@/lib/domain/production'
import { messageManquant } from '@/lib/domain/production'
import { Badge, TableContainer } from '@/components/ui'
import { nb } from './format'

function Reste({ b }: { b: BesoinGraines }) {
  if (b.reste === null) return <span className="text-xs text-fg-subtle">commandes inconnues</span>
  if (b.reste === 0) return <Badge tone="green" dot>Couvert</Badge>
  return <span className="num font-semibold text-accent">{nb(b.reste)}</span>
}

function Incompletes({ b }: { b: BesoinGraines }) {
  if (b.incompletes.length === 0) return null
  const champs = [...new Set(b.incompletes.flatMap(i => i.champs))]
  return (
    <p className="mt-0.5 whitespace-normal text-xs font-medium text-warning">
      {b.incompletes.length} plantation{b.incompletes.length > 1 ? 's' : ''} non comptée{b.incompletes.length > 1 ? 's' : ''} : {messageManquant(champs)}
    </p>
  )
}

export function BesoinsGrainesTable({ besoins, saisonActive }: { besoins: BesoinGraines[]; saisonActive: string | null }) {
  return (
    <>
      <p className="mb-3 text-xs text-fg-subtle">
        Commandées : graines notées « hors bon » et lignes des bons de commande de la saison active
        {saisonActive ? ` (${saisonActive})` : ''}, en graines, plants, bulbes ou godets.
      </p>
      <ul className="space-y-2 md:hidden">
        {besoins.map(b => (
          <li key={b.culture_id} className="rounded-xl border border-border bg-surface p-3 shadow-xs" data-testid="besoin-graines">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{b.culture_name}</p>
              <Reste b={b} />
            </div>
            <p className="num mt-1 text-xs text-fg-muted">
              {nb(b.graines)} graines à semer
              {b.plantsAAcheter > 0 && <> · {nb(b.plantsAAcheter)} plants à acheter</>}
              {b.commandees !== null && <> · {nb(b.commandees)} commandées</>}
            </p>
            <Incompletes b={b} />
          </li>
        ))}
      </ul>
      <TableContainer className="hidden md:block" label="Graines à commander">
        <table className="data-table">
          <thead>
            <tr>
              <th>Culture</th>
              <th className="text-right !normal-case">Graines à semer</th>
              <th className="text-right !normal-case">Plants à acheter</th>
              <th className="text-right !normal-case">Déjà commandées</th>
              <th className="text-right !normal-case">Reste à commander</th>
            </tr>
          </thead>
          <tbody>
            {besoins.map(b => (
              <tr key={b.culture_id} data-testid="besoin-graines-table">
                <td className="font-medium">{b.culture_name}<Incompletes b={b} /></td>
                <td className="num text-right font-semibold text-primary">{nb(b.graines)}</td>
                <td className="num text-right">{b.plantsAAcheter > 0 ? nb(b.plantsAAcheter) : ''}</td>
                <td className="num text-right">{b.commandees === null ? '' : nb(b.commandees)}</td>
                <td className="text-right"><Reste b={b} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableContainer>
    </>
  )
}
