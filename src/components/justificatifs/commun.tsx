'use client'
import { FileText, ImageOff } from 'lucide-react'
import { Badge, cn, type Tone } from '@/components/ui'
import { formatEuros, type Centimes, type DateISO, type EurosNumeric, eurosEnCentimes } from '@/lib/domain'
import { LIBELLES_STATUT_JUSTIFICATIF, type StatutJustificatif } from '@/lib/domain/gestion'

/** `2026-11-03` → `03/11/2026`. */
export const dateFr = (d: DateISO | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—')

/** Centimes → texte de saisie « 12,50 ». */
export function centimesEnSaisie(c: Centimes | null | undefined): string {
  if (c === null || c === undefined) return ''
  const neg = c < 0, a = Math.abs(c)
  return `${neg ? '-' : ''}${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')}`
}

/** Montant euros (numeric) en centimes, null si vide. */
export const centimesOuNull = (v: EurosNumeric | null | undefined): Centimes | null =>
  v === null || v === undefined || v === '' ? null : eurosEnCentimes(v)

export const euros = (v: EurosNumeric | null | undefined) => {
  const c = centimesOuNull(v)
  return c === null ? 'montant non saisi' : formatEuros(c)
}

const TON_STATUT: Record<StatutJustificatif, Tone> = { a_traiter: 'amber', depense: 'green', paiement: 'blue', sans_objet: 'neutral' }

export function BadgeStatut({ statut }: { statut: StatutJustificatif }) {
  return <Badge tone={TON_STATUT[statut]} dot>{LIBELLES_STATUT_JUSTIFICATIF[statut]}</Badge>
}

/** Vignette d'une page : image (URL signée), icône PDF, ou « indisponible ». */
export function Vignette({ url, pdf, alt, className }: { url: string | null | undefined; pdf?: boolean; alt: string; className?: string }) {
  const base = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2', className)
  if (pdf) return <div className={base} role="img" aria-label={alt}><FileText className="h-6 w-6 text-fg-subtle" aria-hidden /></div>
  if (url === null) return <div className={base} role="img" aria-label={`${alt} (indisponible)`}><ImageOff className="h-5 w-5 text-fg-subtle" aria-hidden /></div>
  if (url === undefined) return <div className={cn(base, 'animate-pulse')} aria-hidden />
  // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire (ou blob:), hors du chargeur d'images
  return <div className={base}><img src={url} alt={alt} className="h-full w-full object-cover object-top" /></div>
}
