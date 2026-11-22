// ============================================================
// Montants : tout calcul se fait en centimes entiers
// ============================================================
// 0,1 + 0,2 ≠ 0,3 en flottant. On convertit chaque montant `numeric(…, 2)`
// en centimes dès l'entrée, on additionne des entiers, et on ne repasse en
// euros qu'à l'affichage (`formatEuros`) ou à l'écriture en base
// (`centimesEnEuros`).
// ============================================================

import type { Centimes, EurosNumeric } from './types'

const RE_DECIMAL = /^([+-])?(\d*)(?:[.,](\d*))?$/

/**
 * Convertit un nombre décimal (nombre ou chaîne, virgule acceptée) en
 * centièmes entiers, arrondis au plus proche, moitié loin de zéro — comme
 * `round(x, 2)` de PostgreSQL. Lève une erreur sur une valeur illisible :
 * jamais de zéro silencieux.
 */
export function enCentiemes(valeur: EurosNumeric, contexte = 'montant'): number {
  const texte = typeof valeur === 'number' ? nombreEnTexte(valeur, contexte) : valeur.trim()
  const m = RE_DECIMAL.exec(texte)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) {
    throw new Error(`${contexte} illisible : « ${String(valeur)} »`)
  }
  const signe = m[1] === '-' ? -1 : 1
  const entier = Number(m[2] || '0')
  const dec = (m[3] ?? '').padEnd(3, '0')
  let c = entier * 100 + Number(dec.slice(0, 2))
  if (Number(dec[2]) >= 5) c += 1
  if (!Number.isSafeInteger(c)) throw new Error(`${contexte} hors limites : « ${String(valeur)} »`)
  return c === 0 ? 0 : signe * c
}

function nombreEnTexte(n: number, contexte: string): string {
  if (!Number.isFinite(n)) throw new Error(`${contexte} non fini : ${n}`)
  const s = String(n)
  if (!/e/i.test(s)) return s
  // Notation scientifique (1e-7, 1e21) : hors de tout montant réaliste.
  if (Math.abs(n) < 0.005) return '0'
  throw new Error(`${contexte} hors limites : ${s}`)
}

/** Euros (numeric) → centimes entiers. */
export function eurosEnCentimes(euros: EurosNumeric): Centimes {
  return enCentiemes(euros, 'Montant')
}

/** Centimes → euros, pour écrire une colonne `numeric(…, 2)`. */
export function centimesEnEuros(c: Centimes): number {
  verifierCentimes(c)
  return c / 100
}

export function verifierCentimes(c: Centimes): void {
  if (!Number.isSafeInteger(c)) throw new Error(`Montant en centimes non entier : ${c}`)
}

export function sommeCentimes(valeurs: Iterable<Centimes>): Centimes {
  let s = 0
  for (const v of valeurs) { verifierCentimes(v); s += v }
  return s
}

/**
 * Arrondi d'une division entière, moitié loin de zéro. Sert aux produits
 * quantité × prix calculés en centièmes × centimes.
 */
export function diviserArrondi(num: bigint, den: bigint): bigint {
  if (den === BigInt(0)) throw new Error('Division par zéro')
  const neg = (num < BigInt(0)) !== (den < BigInt(0))
  const n = num < BigInt(0) ? -num : num
  const d = den < BigInt(0) ? -den : den
  const q = (n * BigInt(2) + d) / (d * BigInt(2))
  return neg ? -q : q
}

/**
 * Montant d'une quantité (décimale) à un prix unitaire, en centimes :
 * `round(quantity * unit_price, 2)` comme la colonne générée `line_total`.
 */
export function produitCentimes(quantite: EurosNumeric, prixUnitaire: EurosNumeric): Centimes {
  const q = BigInt(enCentiemes(quantite, 'Quantité'))
  const p = BigInt(eurosEnCentimes(prixUnitaire))
  return Number(diviserArrondi(q * p, BigInt(100)))
}

/** Part entière d'un total (panier moyen…), arrondie au centime. */
export function moyenneCentimes(total: Centimes, n: number): Centimes | null {
  verifierCentimes(total)
  if (n <= 0) return null
  return Number(diviserArrondi(BigInt(total), BigInt(n)))
}

/**
 * « 1 234,50 € » avec espace fine insécable pour les milliers et espace
 * insécable avant le symbole, comme `Intl.NumberFormat('fr-FR')`, mais
 * sans flottant ni dépendance à l'Intl de la machine.
 */
export function formatEuros(c: Centimes): string {
  verifierCentimes(c)
  const neg = c < 0
  const abs = Math.abs(c)
  const euros = Math.floor(abs / 100)
  const cts = abs - euros * 100
  const milliers = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${neg ? '−' : ''}${milliers},${String(cts).padStart(2, '0')} €`
}

/** Répartit un entier en parts proportionnelles aux poids, sans perte (plus forts restes). */
export function repartirEntier(total: number, poids: number[]): number[] {
  if (!Number.isInteger(total)) throw new Error(`Total à répartir non entier : ${total}`)
  const somme = poids.reduce((s, p) => s + p, 0)
  if (poids.length === 0 || somme <= 0) {
    if (total === 0) return poids.map(() => 0)
    throw new Error('Répartition impossible : aucun poids positif')
  }
  const bruts = poids.map(p => (total * p) / somme)
  const parts = bruts.map(Math.floor)
  let reste = total - parts.reduce((s, p) => s + p, 0)
  const ordre = bruts
    .map((b, i) => ({ i, r: b - Math.floor(b) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
  for (let k = 0; reste > 0; k = (k + 1) % ordre.length, reste--) parts[ordre[k].i] += 1
  return parts
}
