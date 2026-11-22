// ============================================================
// Calculateur de commande et de vente : logique pure
// ============================================================
// Deux usages :
//  * totaux en direct d'une saisie en lignes : HT, TVA ventilée, TTC ;
//  * « commande de 500 € de tiges » : à partir d'un budget, de variétés et
//    de proportions (ou d'une répartition égale), proposer des quantités
//    ENTIÈRES qui tiennent dans le budget, et l'écart restant.
// Tout en centimes entiers ; les taux arrivent en paramètre (points de base,
// voir tva.ts), jamais écrits ici.
// ============================================================

import { repartirEntier, verifierCentimes } from './montants'
import { ventilerTva, essayerVentiler, tvaSurBase, type TotauxTva } from './tva'
import { montantLigne, totauxLignes, type LigneCalcul, type TotauxLignes } from './ventes'
import type { Centimes, PointsDeBase } from './types'

// ------------------------------------------------------------
// Totaux d'une saisie
// ------------------------------------------------------------
export type LigneCalculTva = LigneCalcul & { taux_pb?: PointsDeBase | null; libelle_tva?: string | null }

export interface TotauxSaisie extends TotauxLignes {
  /** null si la TVA n'est pas calculable (ligne sans catégorie, ferme assujettie). */
  tva: TotauxTva | null
  erreurTva: string | null
}

/** Totaux d'une vente ou d'une commande en cours de saisie, TVA comprise selon le régime. */
export function totauxSaisie(lignes: LigneCalculTva[], assujettie: boolean): TotauxSaisie {
  const base = totauxLignes(lignes)
  const r = essayerVentiler(lignes.map(l => ({ montant_ht: montantLigne(l), taux_pb: l.taux_pb ?? null, libelle: l.libelle_tva ?? null })), assujettie)
  return { ...base, tva: r.ok ? r.t : null, erreurTva: r.ok ? null : r.erreur }
}

// ------------------------------------------------------------
// Budget → quantités
// ------------------------------------------------------------
export type BaseBudget = 'ht' | 'ttc'

export interface ArticleBudget {
  cle: string
  /** Prix HT d'une unité (une tige, une botte…), en centimes, > 0. */
  prix_ht: Centimes
  taux_pb: PointsDeBase | null
  /** Poids de la répartition (proportion) ; 1 partout = répartition égale. */
  poids: number
}

export interface PropositionBudget {
  quantites: { cle: string; quantite: number; montant_ht: Centimes }[]
  totaux: TotauxTva
  /** Total comparé au budget : HT ou TTC selon la base choisie. */
  total: Centimes
  /** Budget − total, toujours ≥ 0. */
  ecart: Centimes
}

function totalDans(articles: ArticleBudget[], q: number[], base: BaseBudget, assujettie: boolean): { t: TotauxTva; total: Centimes } {
  const t = ventilerTva(articles.map((a, i) => ({ montant_ht: a.prix_ht * q[i], taux_pb: a.taux_pb })), assujettie)
  return { t, total: base === 'ht' ? t.total_ht : t.total_ttc }
}

/**
 * Quantités entières par article qui tiennent dans le budget, au plus près
 * des proportions demandées :
 *  1. le budget est réparti entre articles selon les poids (plus forts restes) ;
 *  2. chaque article reçoit le plus grand nombre d'unités qui tient dans sa part ;
 *  3. le reliquat est complété unité par unité, en servant d'abord l'article
 *     le plus loin de sa part, tant que le total reste dans le budget.
 * Le total est recalculé exactement (TVA par taux) à chaque pas : le
 * résultat ne dépasse jamais le budget, même d'un centime d'arrondi.
 */
export function proposerQuantites(args: {
  budget: Centimes
  base: BaseBudget
  articles: ArticleBudget[]
  assujettie: boolean
}): PropositionBudget {
  const { budget, articles, assujettie } = args
  const base: BaseBudget = assujettie ? args.base : 'ht'
  verifierCentimes(budget)
  if (budget <= 0) throw new Error('Budget supérieur à zéro requis')
  if (articles.length === 0) throw new Error('Choisissez au moins une variété')
  for (const a of articles) {
    verifierCentimes(a.prix_ht)
    if (a.prix_ht <= 0) throw new Error(`Prix manquant pour « ${a.cle} » : impossible de calculer une quantité`)
    if (!Number.isFinite(a.poids) || a.poids < 0) throw new Error('Proportion invalide')
    if (assujettie && base === 'ttc' && (a.taux_pb === null || a.taux_pb === undefined)) {
      throw new Error('Catégorie de TVA manquante : budget TTC non calculable')
    }
  }
  if (articles.every(a => a.poids === 0)) throw new Error('Toutes les proportions sont nulles')

  // Prix d'une unité dans la base du budget (approximation pour le premier jet ;
  // le total exact est contrôlé ensuite).
  const unitaire = articles.map(a => (base === 'ttc' && assujettie ? a.prix_ht + tvaSurBase(a.prix_ht, a.taux_pb as number) : a.prix_ht))
  const parts = repartirEntier(budget, articles.map(a => a.poids))
  const q = articles.map((_, i) => Math.floor(parts[i] / unitaire[i]))

  let { t, total } = totalDans(articles, q, base, assujettie)
  // Arrondi de TVA : si le premier jet dépasse, on retire une unité à l'article le plus servi.
  while (total > budget) {
    let j = -1
    for (let i = 0; i < q.length; i++) if (q[i] > 0 && (j < 0 || q[i] * unitaire[i] - parts[i] > q[j] * unitaire[j] - parts[j])) j = i
    if (j < 0) break
    q[j] -= 1
    ;({ t, total } = totalDans(articles, q, base, assujettie))
  }
  // Complément : une unité à la fois, à l'article le plus loin de sa part.
  for (;;) {
    const ordre = articles
      .map((a, i) => ({ i, manque: parts[i] - q[i] * unitaire[i] }))
      .filter(x => articles[x.i].poids > 0)
      .sort((x, y) => y.manque - x.manque || x.i - y.i)
    let ajoute = false
    for (const { i } of ordre) {
      q[i] += 1
      const essai = totalDans(articles, q, base, assujettie)
      if (essai.total <= budget) { t = essai.t; total = essai.total; ajoute = true; break }
      q[i] -= 1
    }
    if (!ajoute) break
  }
  return {
    quantites: articles.map((a, i) => ({ cle: a.cle, quantite: q[i], montant_ht: a.prix_ht * q[i] })),
    totaux: t, total, ecart: budget - total,
  }
}
