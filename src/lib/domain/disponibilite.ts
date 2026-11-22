// ============================================================
// Disponibilités par culture et par semaine
// ============================================================
// Pour la fiche envoyée aux fleuristes : ce qu'on peut encore leur
// proposer, semaine par semaine, sur la période glissante.
//
//   base       = tiges récoltées de la semaine s'il y a des récoltes saisies
//                pour cette culture cette semaine-là (source « reel »),
//                sinon tiges prévues (source « prevu », voir reel.ts) ;
//   perdu      = pertes saisies, retranchées seulement en source « reel » :
//                le prévu intègre déjà 30 % de perte (trigger 002) ;
//   engagé     = tiges des lignes de commandes confirmées, prêtes ou
//                livrées, à leur date de livraison ;
//   disponible = base − perdu − engagé (négatif = survente à signaler).
//
// Limites à faire valider : les ventes directes (marché) de la semaine ne
// sont pas retranchées ; une ligne de commande sans culture ne peut être
// imputée à aucune culture et est remontée à part.
// ============================================================

import { cleSemaine, dansIntervalle, fenetreGlissante, formatDateLongue, formatSemaine, lundiDeSemaine, lundisEntre, type Intervalle } from './dates'
import { eurosEnCentimes, formatEuros } from './montants'
import { repartitionPrevue, type LossLite, type PlantingReel } from './reel'
import { tigesLigne } from './ventes'
import type { Centimes, DateISO, HarvestLite, Order, OrderLine, OrderStatus } from './types'

export const STATUTS_ENGAGES: readonly OrderStatus[] = ['confirmee', 'prete', 'livree']

export interface CommandeAvecLignes {
  order: Pick<Order, 'id' | 'status' | 'delivery_date'>
  lignes: Pick<OrderLine, 'culture_id' | 'label' | 'quantity' | 'stems_per_unit'>[]
}

export interface DisponibiliteSemaine {
  culture_id: string
  culture_name: string
  lundi: DateISO
  cle_semaine: string
  prevu: number
  /** null tant qu'aucune récolte n'est saisie pour la culture cette semaine. */
  recolte: number | null
  perdu: number
  engage: number
  source: 'prevu' | 'reel'
  disponible: number
  /** Prix à la tige le plus bas parmi les plantations de la culture. */
  prix_tige_min_centimes: Centimes
  /** Vrai si toutes les plantations de la culture ont le même prix. */
  prix_unique: boolean
}

export interface LigneNonAttribuee {
  order_id: string
  lundi: DateISO
  label: string
  tiges: number
}

export interface Disponibilites {
  periode: Intervalle
  lignes: DisponibiliteSemaine[]
  non_attribuees: LigneNonAttribuee[]
}

/**
 * Disponibilités sur la fenêtre (par défaut la période glissante de 12 mois
 * à partir d'`aujourdhui`). Seules les cultures ayant du prévu, du réel ou
 * des commandes sur une semaine apparaissent pour cette semaine.
 */
export function calculerDisponibilites(args: {
  plantings: PlantingReel[]
  commandes: CommandeAvecLignes[]
  recoltes: HarvestLite[]
  pertes: LossLite[]
  aujourdhui: DateISO
  fenetre?: Intervalle
  statutsEngages?: readonly OrderStatus[]
}): Disponibilites {
  const periode = args.fenetre ?? fenetreGlissante(args.aujourdhui)
  const lundis = new Set(lundisEntre(periode))
  const statuts = new Set(args.statutsEngages ?? STATUTS_ENGAGES)

  const cultureDePlantation = new Map(args.plantings.map(p => [p.id, p.culture_id]))
  const cultures = new Map<string, { nom: string; prix: Centimes[] }>()
  for (const p of args.plantings) {
    const c = cultures.get(p.culture_id) ?? { nom: p.culture_name, prix: [] }
    c.prix.push(eurosEnCentimes(p.prix_tige))
    cultures.set(p.culture_id, c)
  }

  type Acc = { prevu: number; recolte: number | null; perdu: number; engage: number }
  const m = new Map<string, Acc>() // `${culture_id}|${lundi}`
  const acc = (culture: string, lundi: DateISO): Acc | null => {
    if (!lundis.has(lundi)) return null
    const k = `${culture}|${lundi}`
    let a = m.get(k)
    if (!a) { a = { prevu: 0, recolte: null, perdu: 0, engage: 0 }; m.set(k, a) }
    return a
  }

  for (const p of args.plantings) {
    for (const s of repartitionPrevue(p)) {
      const a = acc(p.culture_id, s.lundi)
      if (a) a.prevu += s.tiges
    }
  }
  for (const h of args.recoltes) {
    const c = cultureDePlantation.get(h.planting_id)
    const a = c ? acc(c, lundiDeSemaine(h.date)) : null
    if (a) a.recolte = (a.recolte ?? 0) + h.tiges
  }
  for (const l of args.pertes) {
    const c = l.culture_id ?? (l.planting_id ? cultureDePlantation.get(l.planting_id) : undefined)
    const a = c ? acc(c, lundiDeSemaine(l.date)) : null
    if (a) a.perdu += l.tiges
  }
  const non_attribuees: LigneNonAttribuee[] = []
  for (const { order, lignes } of args.commandes) {
    if (!statuts.has(order.status) || !dansIntervalle(order.delivery_date, periode)) continue
    const lundi = lundiDeSemaine(order.delivery_date)
    for (const l of lignes) {
      const tiges = tigesLigne(l)
      const a = l.culture_id ? acc(l.culture_id, lundi) : null
      if (a) a.engage += tiges
      else non_attribuees.push({ order_id: order.id, lundi, label: l.label, tiges })
    }
  }

  const lignes: DisponibiliteSemaine[] = Array.from(m.entries()).map(([k, a]) => {
    const [culture_id, lundi] = k.split('|')
    const c = cultures.get(culture_id)
    const reel = a.recolte !== null
    const base = reel ? (a.recolte ?? 0) - a.perdu : a.prevu
    const prix = c ? c.prix : []
    return {
      culture_id,
      culture_name: c?.nom ?? 'Culture hors plan',
      lundi, cle_semaine: cleSemaine(lundi),
      prevu: a.prevu, recolte: a.recolte, perdu: a.perdu, engage: a.engage,
      source: reel ? 'reel' as const : 'prevu' as const,
      disponible: base - a.engage,
      prix_tige_min_centimes: prix.length ? Math.min(...prix) : 0,
      prix_unique: new Set(prix).size <= 1,
    }
  }).sort((a, b) => (a.lundi < b.lundi ? -1 : a.lundi > b.lundi ? 1 : a.culture_name.localeCompare(b.culture_name, 'fr')))

  return { periode, lignes, non_attribuees }
}

/** Cultures en survente (disponible < 0) : à traiter avant d'envoyer la fiche. */
export function surventes(d: Disponibilites): DisponibiliteSemaine[] {
  return d.lignes.filter(l => l.disponible < 0)
}

// ------------------------------------------------------------
// Fiche texte à coller dans un email
// ------------------------------------------------------------
export interface OptionsFiche {
  ferme: string
  /** Date d'édition, affichée en tête (la date du jour, fournie par l'écran). */
  aujourdhui: DateISO
  /** Arrondit les quantités au multiple inférieur (ex. 10 pour des bottes de 10). */
  multipleDe?: number
  /** N'affiche pas une culture en dessous de ce nombre de tiges. */
  minimum?: number
  afficherPrix?: boolean
  /** Limite le nombre de semaines affichées. */
  semainesMax?: number
}

export function ficheDisponibiliteTexte(d: Disponibilites, o: OptionsFiche): string {
  const multiple = o.multipleDe && o.multipleDe > 1 ? Math.floor(o.multipleDe) : 1
  const minimum = Math.max(1, o.minimum ?? 1)
  const parSemaine = new Map<DateISO, string[]>()
  for (const l of d.lignes) {
    const q = Math.floor(Math.max(0, l.disponible) / multiple) * multiple
    if (q < minimum) continue
    let ligne = `  • ${l.culture_name} : ${q} tiges`
    if (o.afficherPrix && l.prix_tige_min_centimes > 0) {
      ligne += ` — ${l.prix_unique ? '' : 'à partir de '}${formatEuros(l.prix_tige_min_centimes)} la tige`
    }
    const liste = parSemaine.get(l.lundi) ?? []
    liste.push(ligne)
    parSemaine.set(l.lundi, liste)
  }
  let semaines = Array.from(parSemaine.keys()).sort()
  if (o.semainesMax !== undefined) semaines = semaines.slice(0, Math.max(0, o.semainesMax))

  const tete = [`Disponibilités — ${o.ferme}`, `Mise à jour du ${formatDateLongue(o.aujourdhui)}`, '']
  if (semaines.length === 0) return [...tete, 'Aucune disponibilité sur la période.'].join('\n')
  const corps = semaines.flatMap(l => [majuscule(formatSemaine(l)), ...(parSemaine.get(l) ?? []), ''])
  const pied = ['Quantités indicatives, confirmées à la commande.']
  return [...tete, ...corps, ...pied].join('\n')
}

function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
