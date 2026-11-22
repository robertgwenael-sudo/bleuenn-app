'use client'
import { cn } from '@/components/ui'
import { enCentiemes, formatEuros, type Centimes } from '@/lib/domain'
import { formatDuree, type Grandeur } from '@/lib/domain/couts'

/** Lit un montant saisi (« 12,50 », « 12.5 », « 12 € ») en centimes ; null si illisible ou ≤ 0. */
export function lireMontant(saisie: string): Centimes | null {
  const s = saisie.replace(/\s|€/g, '')
  if (!s) return null
  try {
    const c = enCentiemes(s, 'Montant')
    return c > 0 ? c : null
  } catch {
    return null
  }
}

/** Euros arrondis à l'euro, pour les axes et les valeurs compactes. */
export const eurosCompact = (c: number) => {
  const e = Math.round(c / 100)
  const s = Math.abs(e).toLocaleString('fr-FR')
  return `${e < 0 ? '−' : ''}${s} €`
}

export const heures = (minutes: number) => formatDuree(minutes)

/**
 * Affiche une grandeur peut-être non calculable : la valeur, ou
 * « non calculable » en italique avec sa raison en infobulle et en texte
 * pour les lecteurs d'écran. Jamais « 0 € » à la place.
 */
export function Valeur({ g, format = formatEuros, className, signe }: {
  g: Grandeur
  format?: (n: number) => string
  className?: string
  /** Colore les valeurs négatives (marges). */
  signe?: boolean
}) {
  if (g.valeur === null) {
    return (
      <span className={cn('text-xs italic text-fg-subtle', className)} title={g.raison}>
        non calculable<span className="sr-only"> : {g.raison}</span>
      </span>
    )
  }
  return <span className={cn(signe && g.valeur < 0 && 'text-danger', className)}>{format(g.valeur)}</span>
}

/** « 12,30 €/m² » */
export const parM2 = (c: number) => `${formatEuros(c)}/m²`
/** « 23,54 €/h » */
export const parHeure = (c: number) => `${formatEuros(c)}/h`
