'use client'
import { AlarmClock } from 'lucide-react'
import { Badge, type Tone } from '@/components/ui'
import { centimesEnEuros, eurosEnCentimes, formatEuros, formatJourMois, type EurosNumeric, type PurchaseOrderStatus } from '@/lib/domain'
import { LIBELLES_STATUTS_BON, type Retard } from '@/lib/domain/achats'

export const statutTone: Record<PurchaseOrderStatus, Tone> = {
  brouillon: 'neutral', envoye: 'blue', confirme: 'violet', recu_partiel: 'amber', recu: 'green', annule: 'red',
}

export function StatutBon({ status }: { status: PurchaseOrderStatus }) {
  return <Badge tone={statutTone[status]} dot>{LIBELLES_STATUTS_BON[status]}</Badge>
}

export function BadgeRetard({ retard }: { retard: Retard | null }) {
  if (!retard) return null
  return (
    <Badge tone="red" title="Date de livraison prévue dépassée">
      <AlarmClock className="h-3 w-3" aria-hidden /> En retard de {retard.jours} j
    </Badge>
  )
}

/** Montant numeric en euros affiché, ou « — » s'il manque. */
export const euros = (v: EurosNumeric | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : formatEuros(eurosEnCentimes(v))

export const dateCourte = (d: string | null | undefined, annee?: number) => d ? formatJourMois(d, annee) : '—'

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`

/** Lit un montant en euros saisi (« 12,50 », « 12 € ») ; null si vide, undefined si illisible ou négatif. */
export function lireEuros(saisie: string): number | null | undefined {
  const s = saisie.replace(/\s|€/g, '')
  if (!s) return null
  try {
    const c = eurosEnCentimes(s)
    return c >= 0 ? centimesEnEuros(c) : undefined
  } catch {
    return undefined
  }
}

/** Valeur numeric → texte de saisie (« 12,5 »). */
export const versSaisie = (v: EurosNumeric | null | undefined) =>
  v === null || v === undefined || v === '' ? '' : String(v).replace('.', ',')
