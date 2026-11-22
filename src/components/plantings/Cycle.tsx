'use client'
// Badge du cycle de culture (annuelle, bisannuelle, vivace), migration 013.
import { LIBELLE_CYCLE, cycleDe, type CycleCulture } from '@/lib/domain'
import { Badge, type Tone } from '@/components/ui'

const TON: Record<CycleCulture, Tone> = { annuelle: 'neutral', bisannuelle: 'blue', vivace: 'green' }
const TITRE: Record<CycleCulture, string> = {
  annuelle: 'Annuelle : un cycle complet dans l’année, puis la planche se libère',
  bisannuelle: 'Bisannuelle : semée une année, fleurit l’année suivante, puis la planche se libère',
  vivace: 'Vivace : reste en place d’une année sur l’autre jusqu’à son arrachage, fleurit chaque année',
}

export function CycleBadge({ cycle, className, masquerAnnuelle }: { cycle?: CycleCulture | null; className?: string; masquerAnnuelle?: boolean }) {
  const c = cycleDe({ cycle })
  if (masquerAnnuelle && c === 'annuelle') return null
  return <Badge tone={TON[c]} title={TITRE[c]} className={className}>{LIBELLE_CYCLE[c]}</Badge>
}
