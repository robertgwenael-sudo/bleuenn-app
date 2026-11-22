// ============================================================
// TVA (migration 014) : logique pure
// ============================================================
// Aucun taux n'est écrit ici. Les taux viennent de la table de paramétrage
// `farm_vat_rates` (une ligne par catégorie et par ferme, modifiable dans les
// réglages de facturation) et arrivent en paramètre, en POINTS DE BASE
// entiers : 1000 = 10 %, 550 = 5,5 %. Aucun flottant.
//
// Prix saisis HORS TAXE partout (lignes de vente, de commande, de facture).
// Méthode d'arrondi, identique à emettre_facture (014) :
//   1. chaque ligne : montant HT = round(quantité × prix unitaire HT, 2) ;
//   2. par taux : base HT = somme des montants HT des lignes à ce taux ;
//   3. TVA du taux = round(base HT × taux, 2), moitié loin de zéro ;
//   4. total TVA = somme des TVA par taux ; TTC = total HT + total TVA.
// C'est la méthode usuelle (TVA calculée sur le total HT de chaque taux,
// pas ligne par ligne) : elle évite les écarts d'un centime qui
// s'accumulent quand on arrondit la TVA de chaque ligne.
// ============================================================

import { diviserArrondi, enCentiemes, verifierCentimes } from './montants'
import type { Centimes, ClientKind, LineUnit, PointsDeBase, VatCategorie, VatRate } from './types'

const DIX_MILLE = BigInt(10000)

export const CATEGORIE_TVA_LIBELLE: Record<VatCategorie, string> = {
  non_travaillee: 'Fleur non travaillée',
  travaillee: 'Fleur travaillée',
  autre: 'Autre',
}

export function verifierTaux(pb: PointsDeBase): void {
  if (!Number.isInteger(pb) || pb < 0 || pb > 10000) throw new Error(`Taux de TVA invalide : ${pb} points de base`)
}

/** « 10 » ou « 5,5 » ou « 20 % » → points de base (1000, 550, 2000) ; null si illisible ou hors 0 à 100 %. */
export function lireTauxPb(saisie: string): PointsDeBase | null {
  const t = saisie.replace(/%/g, '').trim()
  if (!t) return null
  try {
    const pb = enCentiemes(t, 'Taux')
    return pb >= 0 && pb <= 10000 ? pb : null
  } catch {
    return null
  }
}

/** 1000 → « 10 % », 550 → « 5,5 % », 2000 → « 20 % ». */
export function formatTaux(pb: PointsDeBase): string {
  verifierTaux(pb)
  const ent = Math.floor(pb / 100)
  const dec = String(pb % 100).padStart(2, '0').replace(/0+$/, '')
  return `${ent}${dec ? `,${dec}` : ''} %`
}

/** TVA d'une base HT à un taux : arrondie au centime, moitié loin de zéro (comme `round()` de PostgreSQL). */
export function tvaSurBase(baseHt: Centimes, pb: PointsDeBase): Centimes {
  verifierCentimes(baseHt)
  verifierTaux(pb)
  return Number(diviserArrondi(BigInt(baseHt) * BigInt(pb), DIX_MILLE))
}

export interface LigneTva {
  montant_ht: Centimes
  /** null : catégorie non renseignée. */
  taux_pb: PointsDeBase | null
  libelle?: string | null
}

export interface TauxVentile {
  taux_pb: PointsDeBase
  /** Libellés des catégories à ce taux, séparés par « / ». */
  libelle: string
  base_ht: Centimes
  tva: Centimes
  ttc: Centimes
}

export interface TotauxTva {
  assujettie: boolean
  total_ht: Centimes
  total_tva: Centimes
  total_ttc: Centimes
  /** Vide pour une ferme non assujettie. Trié par taux croissant. */
  ventilation: TauxVentile[]
}

/**
 * Totaux HT, TVA, TTC et ventilation par taux. Ferme non assujettie :
 * TVA nulle, TTC = HT, pas de ventilation. Ferme assujettie : une ligne sans
 * taux lève une erreur (on ne devine pas sa catégorie).
 */
export function ventilerTva(lignes: LigneTva[], assujettie: boolean): TotauxTva {
  let totalHt = 0
  for (const l of lignes) { verifierCentimes(l.montant_ht); totalHt += l.montant_ht }
  if (!assujettie) return { assujettie, total_ht: totalHt, total_tva: 0, total_ttc: totalHt, ventilation: [] }

  const sansTaux = lignes.filter(l => l.taux_pb === null || l.taux_pb === undefined).length
  if (sansTaux > 0) {
    throw new Error(`${sansTaux} ligne${sansTaux > 1 ? 's' : ''} sans catégorie de TVA`)
  }
  const parTaux = new Map<number, { base: number; libelles: string[] }>()
  for (const l of lignes) {
    const pb = l.taux_pb as number
    verifierTaux(pb)
    const acc = parTaux.get(pb) ?? { base: 0, libelles: [] }
    acc.base += l.montant_ht
    const lib = l.libelle?.trim()
    if (lib && !acc.libelles.includes(lib)) acc.libelles.push(lib)
    parTaux.set(pb, acc)
  }
  const ventilation = Array.from(parTaux.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pb, a]) => {
      const tva = tvaSurBase(a.base, pb)
      return { taux_pb: pb, libelle: a.libelles.join(' / '), base_ht: a.base, tva, ttc: a.base + tva }
    })
  const totalTva = ventilation.reduce((s, v) => s + v.tva, 0)
  return { assujettie, total_ht: totalHt, total_tva: totalTva, total_ttc: totalHt + totalTva, ventilation }
}

/** Comme `ventilerTva`, sans lever : pour un total affiché en direct pendant la saisie. */
export function essayerVentiler(lignes: LigneTva[], assujettie: boolean): { ok: true; t: TotauxTva } | { ok: false; erreur: string } {
  try {
    return { ok: true, t: ventilerTva(lignes, assujettie) }
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) }
  }
}

/** Montant TTC d'un montant HT à un taux (affichage d'une ligne seule). */
export function ttcLigne(montantHt: Centimes, pb: PointsDeBase): Centimes {
  return montantHt + tvaSurBase(montantHt, pb)
}

// ------------------------------------------------------------
// Catégorie par défaut d'une ligne
// ------------------------------------------------------------

/**
 * Catégorie proposée pour une nouvelle ligne : « travaillée » pour un
 * mariage (canal ou client) ou un bouquet composé, « non travaillée »
 * sinon. Ce n'est qu'une proposition, modifiable ligne par ligne.
 */
export function categorieParDefaut(ctx: { unit?: LineUnit | null; channel?: string | null; clientKind?: ClientKind | null }): VatCategorie {
  if (ctx.channel === 'Mariage' || ctx.clientKind === 'mariage' || ctx.unit === 'bouquet') return 'travaillee'
  return 'non_travaillee'
}

/** Taux actif de la catégorie proposée (repli sur « non travaillée ») ; null si la ferme n'a aucun taux actif. */
export function tauxParDefaut<R extends Pick<VatRate, 'id' | 'categorie' | 'actif' | 'ordre'>>(
  taux: R[],
  ctx: { unit?: LineUnit | null; channel?: string | null; clientKind?: ClientKind | null },
): R | null {
  const actifs = taux.filter(t => t.actif).sort((a, b) => a.ordre - b.ordre)
  const voulue = categorieParDefaut(ctx)
  return actifs.find(t => t.categorie === voulue) ?? actifs.find(t => t.categorie === 'non_travaillee') ?? actifs[0] ?? null
}

/** Contrôle d'une liste de taux saisie dans les réglages : messages d'erreur, vide si conforme. */
export function controlerTaux(taux: Pick<VatRate, 'categorie' | 'libelle' | 'taux_pb' | 'actif'>[]): string[] {
  const erreurs: string[] = []
  for (const t of taux) {
    if (!t.libelle.trim()) erreurs.push('Chaque taux doit avoir un libellé')
    try { verifierTaux(t.taux_pb) } catch { erreurs.push(`Taux invalide pour « ${t.libelle} »`) }
  }
  for (const c of ['non_travaillee', 'travaillee'] as const) {
    if (taux.filter(t => t.actif && t.categorie === c).length > 1) erreurs.push(`Un seul taux actif par catégorie (${CATEGORIE_TVA_LIBELLE[c]})`)
  }
  return Array.from(new Set(erreurs))
}
