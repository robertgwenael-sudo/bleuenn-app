'use client'
// Affichage des résultats du domaine production : une valeur, ou la raison
// de son absence (« donnée manquante : … », « plant acheté »), jamais 0.
import { messageManquant, type Calcul, type Montant } from '@/lib/domain/production'
import { formatEuros as euros } from '@/lib/domain/montants'
import { cn } from '@/components/ui'

const FMT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
/** « 11 516 » (espace fine insécable). */
export const nb = (n: number) => FMT.format(n)
/** Euros arrondis à l'euro, comme le tableur : « 525 € ». */
export const eurosRonds = (c: number) => `${nb(Math.round(c / 100))} €`

export function CelluleCalcul({ c, className }: { c: Calcul; className?: string }) {
  if (c.etat === 'ok') return <span className={cn('num', className)}>{nb(c.valeur)}</span>
  if (c.etat === 'sans_objet') return <span className="text-xs text-fg-subtle">{c.raison}</span>
  return <Manquant champs={c.champs} />
}

export function CelluleMontant({ m, rond, className }: { m: Montant; rond?: boolean; className?: string }) {
  if (m.etat === 'ok') return <span className={cn('num', className)}>{rond ? eurosRonds(m.centimes) : euros(m.centimes)}</span>
  return <Manquant champs={m.champs} />
}

export function Manquant({ champs }: { champs: Parameters<typeof messageManquant>[0] }) {
  return <span className="whitespace-normal text-xs font-medium text-warning" title={messageManquant(champs)}>{messageManquant(champs)}</span>
}
