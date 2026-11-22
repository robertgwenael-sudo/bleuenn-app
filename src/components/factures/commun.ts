// Libellés, tons et petites conversions de l'écran Factures & paiements.
import type { Tone } from '@/components/ui'
import { eurosEnCentimes, type EurosNumeric, type InvoiceStatut } from '@/lib/domain'

export { lireMontant } from '@/components/couts/commun'

export const STATUT_TONE: Record<InvoiceStatut, Tone> = {
  a_payer: 'blue', partielle: 'amber', payee: 'green', en_retard: 'red', annulee: 'neutral', avoir: 'violet',
}

/** « 2026-11-22 » → « 22/11/2026 », sans fuseau. */
export function dateFr(d: string | null | undefined): string {
  if (!d) return '—'
  const [a, m, j] = d.slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}

/** Quantité numeric(10,2) → « 2,5 » ; entière sans décimales. */
export function quantiteFr(q: EurosNumeric): string {
  const c = eurosEnCentimes(q)
  const ent = Math.trunc(c / 100)
  const dec = Math.abs(c % 100)
  return dec === 0 ? ent.toLocaleString('fr-FR') : `${ent.toLocaleString('fr-FR')},${String(dec).padStart(2, '0').replace(/0$/, '')}`
}

export const UNITE_FACTURE: Record<string, string> = { tige: 'tige', botte: 'botte', bouquet: 'bouquet', seau: 'seau', autre: '' }

/** Formulations proposées comme exemples pour la mention d'absence de TVA : à confirmer par le comptable. */
export const EXEMPLES_MENTION_TVA = [
  'TVA non applicable, art. 293 B du CGI',
  'TVA non applicable, art. 298 bis du CGI',
  'TVA non applicable',
] as const
