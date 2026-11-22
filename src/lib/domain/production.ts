// ============================================================
// Semis et production : bloc « Gestion de la production et du rendement »
// du tableur de Marine (onglet « Plan de culture année 2 »), reproduit
// colonne par colonne, et capacité de la pépinière.
// ============================================================
// Colonnes du tableur (E à S) et leur équivalent ici :
//   E m² à saisir                          surface_m2 de la plantation
//   F nbre de graines à semer (par motte)  graines_par_plant (catalogue)
//   G rangs / planche de 20 × 1 m          rangs_par_planche (catalogue)
//   H MARINE espacement sur les plants     espacement_cm (catalogue)
//   I rendement par plant (tiges)          rendement (catalogue ou plantation)
//   J plants        = G × E / (H / 100)
//   K plants + 30 % = J × 0,3 + J          (pertes de levée, réglables)
//   L graines       = K × F
//   N tiges         = J × I                (sur les plants plantés, sans les + 30 %)
//   O tiges nettes  = N × 0,7              (pertes au champ, réglables)
//   P tiges/semaine = O réparti sur les semaines de récolte
//   R revenu        = O × prix/tige
//   S CA/semaine    = R réparti sur les semaines de récolte
//
// Arrondis, choisis pour retomber sur le tableur :
//  * les calculs enchaînent les valeurs EXACTES (K part de J non arrondi,
//    L de K non arrondi…), comme les cellules du tableur ;
//  * chaque nombre affiché est arrondi à l'entier le plus proche, moitié
//    vers le haut (format « 0 » du tableur) : 162,5 → 163 ;
//  * un total additionne les valeurs exactes puis arrondit (comme SOMME) ;
//  * RÈGLE MARINE (validée le 22/11/2026, s'écarte du tableur) : semaines
//    de récolte = jours de récolte / 7 arrondi AU SUPÉRIEUR, au moins 1
//    (dahlia 75 j → 11 semaines ; le tableur prenait 10) ;
//  * P et S ne sont plus une moyenne arrondie (dont le total recalculé peut
//    dépasser O) : O tiges nettes (arrondies) et R centimes sont RÉPARTIS en
//    entiers sur les semaines (repartirEntier, plus forts restes), la somme
//    des semaines vaut exactement O et R. Dahlia : 350 tiges sur 11
//    semaines = 32 × 9 + 31 × 2, affiché « 31 à 32 » ;
//  * revenu en centimes : O exact × prix en centimes, arrondi au centime le
//    plus proche (Ammi : 105 × 50 c = 52,50 €, affiché 53 € par le tableur).
//
// Une donnée absente ou nulle n'est JAMAIS remplacée par 0 : le résultat
// porte « donnée manquante : <champ> » là où le tableur affiche #DIV/0!,
// #N/A ou 0 €.
//
// Fonctions pures : la date du jour est un paramètre.
// ============================================================

import {
  ajouterJours, chevauche, cleSemaine, comparerDates, ecartJours, fenetreGlissante, lundiDeSemaine, semaineIso,
  type Intervalle, type SemaineIso,
} from './dates'
import { eurosEnCentimes, repartirEntier } from './montants'
import type { Centimes, DateISO, EurosNumeric, FarmProduction, PlantingProduction } from './types'

// ------------------------------------------------------------
// Paramètres
// ------------------------------------------------------------

/**
 * Pertes du tableur de Marine (« + 30 % perte », « moins 30 % de perte au
 * champ »). Valeurs PAR DÉFAUT seulement : la ferme les règle
 * (farms.taux_perte_semis / taux_perte_champ, migration 015).
 */
export const TAUX_PERTE_SEMIS_DEFAUT = 30
export const TAUX_PERTE_CHAMP_DEFAUT = 30

/** Taux en pourcentage, 0 ≤ taux < 100. */
export interface TauxPertes {
  semis: number
  champ: number
}

export const TAUX_PERTES_DEFAUT: TauxPertes = { semis: TAUX_PERTE_SEMIS_DEFAUT, champ: TAUX_PERTE_CHAMP_DEFAUT }

function verifierTaux(t: number, quoi: string): number {
  if (!Number.isFinite(t) || t < 0 || t >= 100) throw new Error(`Taux de ${quoi} invalide : ${t} % (attendu entre 0 et 99)`)
  return t
}

/** Taux de la ferme, défaut 30 % quand la colonne est absente (avant 015) ou vide. */
export function tauxDeLaFerme(farm: FarmProduction | null | undefined): TauxPertes {
  const lire = (v: EurosNumeric | null | undefined, defaut: number, quoi: string) =>
    v === null || v === undefined || v === '' ? defaut : verifierTaux(Number(v), quoi)
  return {
    semis: lire(farm?.taux_perte_semis, TAUX_PERTE_SEMIS_DEFAUT, 'pertes de levée'),
    champ: lire(farm?.taux_perte_champ, TAUX_PERTE_CHAMP_DEFAUT, 'pertes au champ'),
  }
}

// ------------------------------------------------------------
// Résultats : une valeur, une donnée manquante, ou sans objet
// ------------------------------------------------------------

export type ChampProduction =
  | 'surface' | 'rangs' | 'espacement' | 'graines_par_motte' | 'rendement' | 'prix' | 'jours_recolte'

export const LIBELLE_CHAMP: Record<ChampProduction, string> = {
  surface: 'surface (m²)',
  rangs: 'rangs par planche',
  espacement: 'espacement (cm)',
  graines_par_motte: 'graines par motte',
  rendement: 'rendement par plant',
  prix: 'prix par tige',
  jours_recolte: 'jours de récolte',
}

export type Calcul =
  | { etat: 'ok'; brut: number; valeur: number }
  | { etat: 'manquant'; champs: ChampProduction[] }
  | { etat: 'sans_objet'; raison: string }

export type Montant =
  | { etat: 'ok'; centimes: Centimes }
  | { etat: 'manquant'; champs: ChampProduction[] }

/**
 * Un total entier (tiges, centimes) réparti sur les semaines de récolte :
 * `parts` somme EXACTEMENT `total`. `moyenne` (exacte) n'est qu'indicative.
 */
export type Repartition =
  | { etat: 'ok'; total: number; parts: number[]; min: number; max: number; moyenne: number }
  | { etat: 'manquant'; champs: ChampProduction[] }

/** Semaines de récolte, règle Marine : arrondi au supérieur, au moins 1. */
export function semainesDeRecolte(joursRecolte: number): number {
  if (!Number.isFinite(joursRecolte) || joursRecolte <= 0) throw new Error(`Jours de récolte invalides : ${joursRecolte}`)
  return Math.max(1, Math.ceil(Math.round((joursRecolte / 7) * 1e6) / 1e6))
}

/** Répartit un total entier sur n semaines égales ; somme exacte, jamais plus. */
export function repartirSurSemaines(total: number, semaines: number): Repartition {
  if (!Number.isInteger(total) || total < 0) throw new Error(`Total à répartir invalide : ${total}`)
  if (!Number.isInteger(semaines) || semaines < 1) throw new Error(`Nombre de semaines invalide : ${semaines}`)
  const parts = repartirEntier(total, Array.from({ length: semaines }, () => 1))
  return { etat: 'ok', total, parts, min: Math.min(...parts), max: Math.max(...parts), moyenne: total / semaines }
}

/** « 175 » ou « 31 à 32 ». */
export function texteRepartition(r: Repartition, format: (n: number) => string = n => String(n)): string {
  if (r.etat === 'manquant') return messageManquant(r.champs)
  return r.min === r.max ? format(r.min) : `${format(r.min)} à ${format(r.max)}`
}

/** « donnée manquante : espacement (cm), rendement par plant ». */
export function messageManquant(champs: readonly ChampProduction[]): string {
  return `donnée manquante : ${champs.map(c => LIBELLE_CHAMP[c]).join(', ')}`
}

/** Texte d'une cellule : la valeur, ou la raison de son absence. */
export function texteCalcul(c: Calcul | Montant, format: (n: number) => string = n => String(n)): string {
  if (c.etat === 'manquant') return messageManquant(c.champs)
  if (c.etat === 'sans_objet') return c.raison
  return 'centimes' in c ? format(c.centimes) : format(c.valeur)
}

/**
 * Arrondi d'affichage : entier le plus proche, moitié vers le haut.
 * Le pré-arrondi à 1e-6 efface le bruit flottant (125 × 1,3 = 162,49999…).
 */
export function arrondiEntier(x: number): number {
  if (!Number.isFinite(x)) throw new Error(`Valeur non finie : ${x}`)
  return Math.round(Math.round(x * 1e6) / 1e6)
}

const ok = (brut: number): Calcul => ({ etat: 'ok', brut, valeur: arrondiEntier(brut) })

function fusion(...cs: (Calcul | Montant | Repartition)[]): ChampProduction[] {
  const s = new Set<ChampProduction>()
  for (const c of cs) if (c.etat === 'manquant') c.champs.forEach(x => s.add(x))
  return [...s]
}

/** Nombre strictement positif, sinon null (vide, 0, illisible). */
function positif(v: EurosNumeric | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

// ------------------------------------------------------------
// Calcul d'une ligne (colonnes J à S)
// ------------------------------------------------------------

export interface DonneesProduction {
  surface_m2: EurosNumeric | null | undefined
  rangs_par_planche: EurosNumeric | null | undefined
  espacement_cm: EurosNumeric | null | undefined
  /** Graines semées par motte (colonne F). */
  graines_par_plant: EurosNumeric | null | undefined
  /** Tiges par plant (colonne I). */
  rendement: EurosNumeric | null | undefined
  /** Euros par tige (numeric). */
  prix_tige: EurosNumeric | null | undefined
  jours_recolte: EurosNumeric | null | undefined
  /** Plant acheté : pas de graines à semer. */
  achat_plant?: boolean | null
}

export interface Production {
  /** J : plants pour la surface prévue. */
  plants: Calcul
  /** K : plants + pertes de levée (mottes à semer, ou plants à acheter). */
  plantsAvecPertes: Calcul
  /** L : graines à semer ; sans objet pour un plant acheté. */
  graines: Calcul
  /** N : tiges produites. */
  tiges: Calcul
  /** O : tiges nettes après pertes au champ. */
  tigesNettes: Calcul
  semainesRecolte: Calcul
  /** P : tiges nettes (arrondies) réparties sur les semaines, somme = O. */
  tigesParSemaine: Repartition
  /** R */
  revenu: Montant
  /** S : revenu en centimes réparti sur les semaines, somme = R. */
  caParSemaine: Repartition
  /** Toutes les données manquantes de la ligne. */
  manquants: ChampProduction[]
}

export function calculerProduction(d: DonneesProduction, taux: TauxPertes = TAUX_PERTES_DEFAUT): Production {
  const tSemis = verifierTaux(taux.semis, 'pertes de levée')
  const tChamp = verifierTaux(taux.champ, 'pertes au champ')

  const E = positif(d.surface_m2)
  const G = positif(d.rangs_par_planche)
  const H = positif(d.espacement_cm)
  const F = positif(d.graines_par_plant)
  const I = positif(d.rendement)
  const W = positif(d.jours_recolte)
  const prix = positif(d.prix_tige) === null ? null : eurosEnCentimes(d.prix_tige as EurosNumeric)

  const manque = (...m: [ChampProduction, unknown][]): ChampProduction[] => m.filter(([, v]) => v === null).map(([c]) => c)

  // J = G × E / (H / 100)
  const mJ = manque(['surface', E], ['rangs', G], ['espacement', H])
  const plants: Calcul = mJ.length ? { etat: 'manquant', champs: mJ } : ok((G! * E!) / (H! / 100))
  // K = J × taux + J
  const plantsAvecPertes: Calcul = plants.etat === 'ok' ? ok((plants.brut * (100 + tSemis)) / 100) : plants
  // L = K × F
  let graines: Calcul
  if (d.achat_plant) graines = { etat: 'sans_objet', raison: 'plant acheté' }
  else if (plantsAvecPertes.etat !== 'ok' || F === null) {
    graines = { etat: 'manquant', champs: [...fusion(plantsAvecPertes), ...manque(['graines_par_motte', F])] }
  } else graines = ok(plantsAvecPertes.brut * F)
  // N = J × I
  const tiges: Calcul = plants.etat !== 'ok' || I === null
    ? { etat: 'manquant', champs: [...fusion(plants), ...manque(['rendement', I])] }
    : ok(plants.brut * I)
  // O = N × (1 − taux)
  const tigesNettes: Calcul = tiges.etat === 'ok' ? ok((tiges.brut * (100 - tChamp)) / 100) : tiges
  const semainesRecolte: Calcul = W === null
    ? { etat: 'manquant', champs: ['jours_recolte'] }
    : { etat: 'ok', brut: semainesDeRecolte(W), valeur: semainesDeRecolte(W) }
  // P = O réparti sur les semaines
  const tigesParSemaine: Repartition = tigesNettes.etat === 'ok' && semainesRecolte.etat === 'ok'
    ? repartirSurSemaines(tigesNettes.valeur, semainesRecolte.valeur)
    : { etat: 'manquant', champs: fusion(tigesNettes, semainesRecolte) }
  // R = O × prix, au centime
  const revenu: Montant = tigesNettes.etat === 'ok' && prix !== null
    ? { etat: 'ok', centimes: arrondiEntier(tigesNettes.brut * prix) }
    : { etat: 'manquant', champs: [...fusion(tigesNettes), ...manque(['prix', prix])] }
  // S = R réparti sur les semaines, en centimes
  const caParSemaine: Repartition = revenu.etat === 'ok' && semainesRecolte.etat === 'ok'
    ? repartirSurSemaines(revenu.centimes, semainesRecolte.valeur)
    : { etat: 'manquant', champs: fusion(revenu, semainesRecolte) }

  return {
    plants, plantsAvecPertes, graines, tiges, tigesNettes, semainesRecolte, tigesParSemaine, revenu, caParSemaine,
    manquants: fusion(plants, graines, tiges, revenu, semainesRecolte),
  }
}

// ------------------------------------------------------------
// Calendrier (colonnes AA à AF)
// ------------------------------------------------------------

export interface Calendrier {
  /** AA : entrée en cellule (date saisie ; date d'achat du plant si plant acheté). */
  entree: DateISO
  /** AB : plantation = entrée + jours en cellule, sauf plant acheté (= date saisie). */
  plantation: DateISO
  /** AC : récolte = plantation + jours au champ. */
  recolte: DateISO
  /** AD : fin de récolte = récolte + jours de récolte. */
  fin: DateISO
  /** AE / AF : semaines ISO d'entrée et de sortie de cellule. */
  semaineEntree: SemaineIso
  semaineSortie: SemaineIso
}

export function calendrierCulture(e: {
  date_entree: DateISO
  jours_cellule: number | null | undefined
  jours_champ: number | null | undefined
  jours_recolte: number | null | undefined
  achat_plant?: boolean | null
}): Calendrier {
  const jours = (v: number | null | undefined, quoi: string, defaut: number | null) => {
    if (v === null || v === undefined) {
      if (defaut === null) throw new Error(`donnée manquante : ${quoi}`)
      return defaut
    }
    if (!Number.isInteger(v) || v < 0) throw new Error(`${quoi} invalide : ${v}`)
    return v
  }
  // Mêmes replis que la vue plantings_full : cellule 0, récolte 21 ; jours au champ obligatoires.
  const jc = e.achat_plant ? 0 : jours(e.jours_cellule, 'jours en cellule', 0)
  const plantation = ajouterJours(e.date_entree, jc)
  const recolte = ajouterJours(plantation, jours(e.jours_champ, 'jours au champ', null))
  const fin = ajouterJours(recolte, jours(e.jours_recolte, 'jours de récolte', 21))
  return {
    entree: e.date_entree, plantation, recolte, fin,
    semaineEntree: semaineIso(e.date_entree), semaineSortie: semaineIso(plantation),
  }
}

// ------------------------------------------------------------
// Lignes « Quoi semer » et totaux
// ------------------------------------------------------------

export interface LigneSemis {
  planting: PlantingProduction
  production: Production
  calendrier: Calendrier
  /** Plant acheté (pas de graines, pas de passage en cellule). */
  achat: boolean
  /**
   * Semis direct au champ : aucun jour en cellule (et pas un plant acheté).
   * Le drapeau `semis_direct` du catalogue dit seulement que la culture le
   * PERMET (Bleuet : 21 j en cellule, semis direct possible).
   */
  direct: boolean
  /** Le catalogue permet le semis direct. */
  semisDirectPossible: boolean
}

export function ligneSemis(p: PlantingProduction, taux: TauxPertes = TAUX_PERTES_DEFAUT): LigneSemis {
  const achat = !!p.achat_plant
  return {
    planting: p,
    production: calculerProduction({ ...p, achat_plant: achat }, taux),
    calendrier: calendrierCulture({
      date_entree: p.date_semis, jours_cellule: p.jours_cellule, jours_champ: p.jours_champ,
      jours_recolte: p.jours_recolte, achat_plant: achat,
    }),
    achat,
    direct: !achat && !(Number(p.jours_cellule) > 0),
    semisDirectPossible: !!p.semis_direct,
  }
}

/**
 * Ligne de l'écran « Vérification » : la MÊME production que « Quoi semer »
 * (même appel, mêmes taux de la ferme), sans recalcul du calendrier. Les
 * dates sont celles de la base (trigger calc_planting_dates) : une vivace
 * sans début de floraison n'a ni récolte ni fin, et rien n'est deviné.
 */
export interface LigneVerification {
  production: Production
  /** Dates de récolte et de fin connues ; sinon floraison (ou jours au champ) à renseigner. */
  recolteConnue: boolean
}

export function ligneVerification(
  p: DonneesProduction & { date_recolte?: DateISO | null; date_fin?: DateISO | null },
  taux: TauxPertes = TAUX_PERTES_DEFAUT,
): LigneVerification {
  return {
    production: calculerProduction({ ...p, achat_plant: !!p.achat_plant }, taux),
    recolteConnue: !!p.date_recolte && !!p.date_fin,
  }
}

/** Période « 12 mois glissants » (cycle qui touche la fenêtre) ou une saison. */
export type PeriodeSemis = { type: 'glissant'; aujourdhui: DateISO; mois?: number } | { type: 'saison'; season_id: string } | { type: 'tout' }

export function lignesQuoiSemer(plantings: PlantingProduction[], periode: PeriodeSemis, taux: TauxPertes = TAUX_PERTES_DEFAUT): LigneSemis[] {
  const fenetre: Intervalle | null = periode.type === 'glissant' ? fenetreGlissante(periode.aujourdhui, periode.mois ?? 12) : null
  return plantings
    .filter(p => periode.type !== 'saison' || p.season_id === periode.season_id)
    .map(p => ligneSemis(p, taux))
    .filter(l => !fenetre || chevauche({ debut: l.calendrier.entree, fin: l.calendrier.fin }, fenetre))
    .sort((a, b) =>
      a.planting.garden_name.localeCompare(b.planting.garden_name, 'fr', { numeric: true })
      || a.planting.planche_name.localeCompare(b.planting.planche_name, 'fr', { numeric: true })
      || comparerDates(a.calendrier.entree, b.calendrier.entree))
}

export interface TotauxProduction {
  surface_m2: number
  plants: number
  plantsAvecPertes: number
  graines: number
  tiges: number
  tigesNettes: number
  revenuCentimes: Centimes
  /** Lignes dont au moins une colonne n'a pas pu être comptée. */
  incompletes: number
  lignes: number
}

/** Somme des valeurs exactes, arrondie à la fin (comme SOMME du tableur). */
export function totaliser(lignes: { production: Production; planting: Pick<PlantingProduction, 'surface_m2'> }[]): TotauxProduction {
  let surface = 0, J = 0, K = 0, L = 0, N = 0, O = 0, R = 0, inc = 0
  const add = (c: Calcul) => (c.etat === 'ok' ? c.brut : 0)
  for (const { production: p, planting } of lignes) {
    surface += positif(planting.surface_m2) ?? 0
    J += add(p.plants); K += add(p.plantsAvecPertes); L += add(p.graines)
    N += add(p.tiges); O += add(p.tigesNettes)
    if (p.revenu.etat === 'ok') R += p.revenu.centimes
    if (p.manquants.length) inc += 1
  }
  return {
    surface_m2: Math.round(surface * 100) / 100,
    plants: arrondiEntier(J), plantsAvecPertes: arrondiEntier(K), graines: arrondiEntier(L),
    tiges: arrondiEntier(N), tigesNettes: arrondiEntier(O), revenuCentimes: R, incompletes: inc, lignes: lignes.length,
  }
}

export interface GroupeJardin {
  garden_id: string
  garden_name: string
  lignes: LigneSemis[]
  totaux: TotauxProduction
}

export function parJardin(lignes: LigneSemis[]): { jardins: GroupeJardin[]; total: TotauxProduction } {
  const m = new Map<string, GroupeJardin>()
  for (const l of lignes) {
    const g = m.get(l.planting.garden_id) ?? { garden_id: l.planting.garden_id, garden_name: l.planting.garden_name, lignes: [], totaux: totaliser([]) }
    g.lignes.push(l)
    m.set(l.planting.garden_id, g)
  }
  const jardins = [...m.values()]
    .map(g => ({ ...g, totaux: totaliser(g.lignes) }))
    .sort((a, b) => a.garden_name.localeCompare(b.garden_name, 'fr', { numeric: true }))
  return { jardins, total: totaliser(lignes) }
}

export interface BesoinGraines {
  culture_id: string
  culture_name: string
  /** Graines à semer, somme exacte arrondie. */
  graines: number
  /** Plants à acheter (plants achetés, + pertes de levée). */
  plantsAAcheter: number
  /** Déjà commandées (null : inconnu). */
  commandees: number | null
  /** max(0, graines − commandées) ; null si commandées inconnues. */
  reste: number | null
  /** Plantations dont les graines ne sont pas calculables. */
  incompletes: { planting_id: string; champs: ChampProduction[] }[]
}

/** Graines par culture face aux graines déjà commandées (seed_orders + bons de commande). */
export function besoinsGraines(lignes: LigneSemis[], commandees: ReadonlyMap<string, number>): BesoinGraines[] {
  type Acc = { culture_id: string; culture_name: string; g: number; pa: number; inc: BesoinGraines['incompletes'] }
  const m = new Map<string, Acc>()
  for (const l of lignes) {
    const p = l.planting
    const a = m.get(p.culture_id) ?? { culture_id: p.culture_id, culture_name: p.culture_name, g: 0, pa: 0, inc: [] }
    const gr = l.production.graines
    if (gr.etat === 'ok') a.g += gr.brut
    else if (gr.etat === 'manquant') a.inc.push({ planting_id: p.id, champs: gr.champs })
    else if (l.production.plantsAvecPertes.etat === 'ok') a.pa += l.production.plantsAvecPertes.brut
    else if (l.production.plantsAvecPertes.etat === 'manquant') a.inc.push({ planting_id: p.id, champs: l.production.plantsAvecPertes.champs })
    m.set(p.culture_id, a)
  }
  return [...m.values()].map(a => {
    const graines = arrondiEntier(a.g)
    const c = commandees.has(a.culture_id) ? commandees.get(a.culture_id)! : null
    return {
      culture_id: a.culture_id, culture_name: a.culture_name, graines, plantsAAcheter: arrondiEntier(a.pa),
      commandees: c, reste: c === null ? null : Math.max(0, graines - c), incompletes: a.inc,
    }
  }).sort((x, y) => x.culture_name.localeCompare(y.culture_name, 'fr'))
}

// ------------------------------------------------------------
// Pépinière : tables de semis, plaques, charge dans le temps
// ------------------------------------------------------------

/**
 * Table de semis. `debord_cm` : débord TOTAL admis, ajouté une fois à la
 * largeur ET une fois à la longueur (les plaques peuvent dépasser des bords ;
 * 10 cm = 5 cm de chaque côté, ou 10 cm d'un seul). 0 par défaut.
 */
export interface TableSemis { largeur_cm: number; longueur_cm: number; nombre: number; debord_cm?: number }
export interface PlaqueSemis { largeur_cm: number; longueur_cm: number; trous: number }

export interface PlacementPlaques {
  plaques: number
  debord_cm: number
  /** Plaques le long de la largeur puis de la longueur de la table. */
  colonnes: number
  rangees: number
  tournee: boolean
}

/**
 * Plaques ENTIÈRES qui tiennent sur une table, meilleure des deux
 * orientations, débord compris : floor((largeur + débord) / d1) ×
 * floor((longueur + débord) / d2).
 * Table 196 × 297, plaque 51,5 × 33,5, sans débord : 3 × 8 = 24 dans un
 * sens, 5 × 5 = 25 tournée, donc 25. Avec 10 cm de débord : 4 × 9 = 36
 * contre 6 × 5 = 30 tournée, donc 36.
 */
export function plaquesParTable(t: Pick<TableSemis, 'largeur_cm' | 'longueur_cm' | 'debord_cm'>, p: Pick<PlaqueSemis, 'largeur_cm' | 'longueur_cm'>): PlacementPlaques {
  for (const [v, q] of [[t.largeur_cm, 'largeur de table'], [t.longueur_cm, 'longueur de table'], [p.largeur_cm, 'largeur de plaque'], [p.longueur_cm, 'longueur de plaque']] as const) {
    if (!(v > 0)) throw new Error(`donnée manquante : ${q}`)
  }
  const debord = t.debord_cm ?? 0
  if (!Number.isFinite(debord) || debord < 0) throw new Error(`Débord invalide : ${debord} cm`)
  const larg = t.largeur_cm + debord, long = t.longueur_cm + debord
  const n = (a: number, b: number) => Math.floor(Math.round((a / b) * 1e6) / 1e6)
  const droite = { colonnes: n(larg, p.largeur_cm), rangees: n(long, p.longueur_cm), tournee: false }
  const tournee = { colonnes: n(larg, p.longueur_cm), rangees: n(long, p.largeur_cm), tournee: true }
  const best = tournee.colonnes * tournee.rangees > droite.colonnes * droite.rangees ? tournee : droite
  return { ...best, debord_cm: debord, plaques: best.colonnes * best.rangees }
}

/** « 4 × 9 plaques, débord 10 cm » (colonnes sur la largeur × rangées sur la longueur). */
export function textePlacement(pl: PlacementPlaques): string {
  const d = pl.debord_cm > 0 ? `débord ${String(pl.debord_cm).replace('.', ',')} cm` : 'sans débord'
  return `${pl.colonnes} × ${pl.rangees} plaques${pl.tournee ? ' (plaques tournées)' : ''}, ${d}`
}

export interface CapacitePepiniere {
  /** Plaques entières réellement posables, toutes tables. */
  plaques: number
  /** Trous (mottes) disponibles en même temps. */
  trous: number
  parTable: PlacementPlaques[]
  /** Calcul du tableur (surface table / surface plaque), pour information. */
  tableur: { plaquesParTable: number; trous: number }
}

export function capacitePepiniere(tables: TableSemis[], plaque: PlaqueSemis): CapacitePepiniere {
  if (!(plaque.trous > 0) || !Number.isInteger(plaque.trous)) throw new Error('donnée manquante : trous par plaque')
  if (tables.length === 0) throw new Error('donnée manquante : tables de semis')
  let plaques = 0, tableurPlaques = 0, tableurTrous = 0
  const parTable = tables.map(t => {
    if (!(t.nombre > 0) || !Number.isInteger(t.nombre)) throw new Error('donnée manquante : nombre de tables')
    const pl = plaquesParTable(t, plaque)
    plaques += pl.plaques * t.nombre
    const ratio = (t.largeur_cm * t.longueur_cm) / (plaque.largeur_cm * plaque.longueur_cm)
    tableurPlaques = ratio
    tableurTrous += ratio * plaque.trous * t.nombre
    return pl
  })
  return {
    plaques, trous: plaques * plaque.trous, parTable,
    tableur: { plaquesParTable: Math.round(tableurPlaques * 100) / 100, trous: arrondiEntier(tableurTrous) },
  }
}

export type ReglagesPepiniere =
  | { etat: 'ok'; tables: TableSemis[]; plaque: PlaqueSemis }
  | { etat: 'incomplet'; plaque: PlaqueSemis | null; manquants: string[] }

/** Lit les réglages de la ferme ; rien n'est supposé quand une valeur manque. */
export function reglagesPepiniere(farm: FarmProduction | null | undefined): ReglagesPepiniere {
  const v = (x: EurosNumeric | null | undefined) => positif(x)
  const tl = v(farm?.table_semis_largeur_cm), tL = v(farm?.table_semis_longueur_cm), tn = v(farm?.table_semis_nombre)
  // Débord : 0 tant qu'il n'est pas saisi (aucun débord supposé).
  const td = v(farm?.table_semis_debord_cm) ?? 0
  const pl = v(farm?.plaque_largeur_cm), pL = v(farm?.plaque_longueur_cm), pt = v(farm?.plaque_trous)
  const manquants: string[] = []
  if (tl === null) manquants.push('largeur des tables')
  if (tL === null) manquants.push('longueur des tables')
  if (tn === null) manquants.push('nombre de tables')
  if (pl === null) manquants.push('largeur des plaques')
  if (pL === null) manquants.push('longueur des plaques')
  if (pt === null) manquants.push('trous par plaque')
  const plaque = pl !== null && pL !== null && pt !== null ? { largeur_cm: pl, longueur_cm: pL, trous: pt } : null
  if (manquants.length || !plaque) return { etat: 'incomplet', plaque, manquants }
  return { etat: 'ok', tables: [{ largeur_cm: tl!, longueur_cm: tL!, nombre: tn!, debord_cm: td }], plaque }
}

export interface OccupationCellule {
  planting_id: string
  culture_name: string
  garden_name: string
  planche_name: string
  /** Entrée en cellule (incluse) et dernier jour avant plantation (inclus). */
  debut: DateISO
  fin: DateISO
  mottes: number
  /** ceil(mottes / trous) ; null si le format de plaque n'est pas renseigné. */
  plaques: number | null
}

export interface OccupationsCellule {
  occupations: OccupationCellule[]
  /** Semis en cellule dont les mottes ne sont pas calculables. */
  nonComptees: { planting_id: string; culture_name: string; champs: ChampProduction[] }[]
}

/**
 * Mottes en cellule par plantation : plants + pertes de levée, de l'entrée en
 * cellule à la veille de la plantation. Plant acheté, semis direct et
 * culture sans jours en cellule n'occupent rien.
 */
export function occupationsCellule(lignes: LigneSemis[], trousParPlaque: number | null): OccupationsCellule {
  const occupations: OccupationCellule[] = []
  const nonComptees: OccupationsCellule['nonComptees'] = []
  for (const l of lignes) {
    if (l.achat || l.direct) continue
    if (comparerDates(l.calendrier.plantation, l.calendrier.entree) <= 0) continue
    const k = l.production.plantsAvecPertes
    if (k.etat !== 'ok') {
      if (k.etat === 'manquant') nonComptees.push({ planting_id: l.planting.id, culture_name: l.planting.culture_name, champs: k.champs })
      continue
    }
    const mottes = Math.ceil(Math.round(k.brut * 1e6) / 1e6)
    occupations.push({
      planting_id: l.planting.id, culture_name: l.planting.culture_name,
      garden_name: l.planting.garden_name, planche_name: l.planting.planche_name,
      debut: l.calendrier.entree, fin: ajouterJours(l.calendrier.plantation, -1),
      mottes, plaques: trousParPlaque ? Math.ceil(mottes / trousParPlaque) : null,
    })
  }
  return { occupations, nonComptees }
}

export interface SemainePepiniere {
  cle: string
  lundi: DateISO
  semaine: SemaineIso
  /** Pic de la semaine (jour le plus chargé). */
  jourPic: DateISO
  mottes: number
  plaques: number | null
  /** Plantations en cellule le jour du pic. */
  cultures: OccupationCellule[]
  /** null si la capacité n'est pas renseignée. */
  capacitePlaques: number | null
  /** La charge dépasse la capacité des tables (alerte, jamais un refus). */
  depassement: boolean
  /** Plaques qui manquent le jour du pic (0 sans dépassement). */
  plaquesManquantes: number
}

/**
 * Charge de la pépinière semaine par semaine (lundi → dimanche), du premier
 * semis en cellule à la dernière plantation. Chaque semaine retient son
 * jour le plus chargé (en plaques si le format est connu, sinon en mottes).
 * Un dépassement avertit : il ne bloque rien.
 */
export function chargePepiniere(occupations: OccupationCellule[], capacite: Pick<CapacitePepiniere, 'plaques'> | null, bornes?: Intervalle): SemainePepiniere[] {
  const occ = bornes ? occupations.filter(o => chevauche({ debut: o.debut, fin: o.fin }, bornes)) : occupations
  if (occ.length === 0) return []
  let debut = occ.reduce((m, o) => (o.debut < m ? o.debut : m), occ[0].debut)
  let fin = occ.reduce((m, o) => (o.fin > m ? o.fin : m), occ[0].fin)
  if (bornes) {
    if (debut < bornes.debut) debut = bornes.debut
    if (fin > bornes.fin) fin = bornes.fin
  }
  const avecPlaques = occ.every(o => o.plaques !== null)
  const out: SemainePepiniere[] = []
  for (let lundi = lundiDeSemaine(debut); lundi <= fin; lundi = ajouterJours(lundi, 7)) {
    let pic: { jour: DateISO; mottes: number; plaques: number; cultures: OccupationCellule[] } | null = null
    for (let i = 0; i < 7; i++) {
      const jour = ajouterJours(lundi, i)
      const presentes = occ.filter(o => o.debut <= jour && jour <= o.fin)
      const mottes = presentes.reduce((s, o) => s + o.mottes, 0)
      const plaques = presentes.reduce((s, o) => s + (o.plaques ?? 0), 0)
      const mesure = avecPlaques ? plaques : mottes
      if (!pic || mesure > (avecPlaques ? pic.plaques : pic.mottes)) pic = { jour, mottes, plaques, cultures: presentes }
    }
    const p = pic!
    const cap = capacite ? capacite.plaques : null
    out.push({
      cle: cleSemaine(lundi), lundi, semaine: semaineIso(lundi), jourPic: p.jour,
      mottes: p.mottes, plaques: avecPlaques ? p.plaques : null, cultures: p.cultures,
      capacitePlaques: cap, depassement: cap !== null && avecPlaques && p.plaques > cap,
      plaquesManquantes: cap !== null && avecPlaques ? Math.max(0, p.plaques - cap) : 0,
    })
  }
  return out
}

// ------------------------------------------------------------
// Contrôle d'un semis face à la capacité des tables : ALERTE, jamais un
// refus (choix de Marine). L'enregistrement passe toujours ; l'écran
// avertit et propose : (a) la date d'entrée en cellule la plus proche où
// le semis tient, (b) la surface maximale qui tient à la date choisie,
// (c) plant acheté, ou semis direct si la culture le permet.
// ------------------------------------------------------------

export interface JourDepasse {
  jour: DateISO
  plaques: number
  capacite: number
  manquantes: number
  cultures: string[]
}

export type ControlePepiniere =
  | { etat: 'sans_capacite' }
  | { etat: 'hors_cellule'; raison: 'plant acheté' | 'semis direct' }
  | { etat: 'non_calculable'; champs: ChampProduction[] }
  | { etat: 'ok'; plaques: number }
  | {
      etat: 'depassement'
      plaques: number
      jours: JourDepasse[]
      maxManquantes: number
      /** (a) Entrée en cellule la plus proche (avant ou après) où le semis tient ; null si aucune dans le rayon. */
      dateProposee: DateISO | null
      decalageJours: number | null
      /** (b) Surface maximale (m², au dixième) qui tient à la date choisie ; 0 si aucune place. */
      surfaceMax: number
      /** (c) Autres solutions possibles. */
      alternatives: ('plant_achete' | 'semis_direct')[]
    }

/** Plaques occupées par les AUTRES semis, jour par jour, sur un intervalle. */
function chargeAutres(autres: OccupationCellule[], debut: DateISO, fin: DateISO, exclure?: string) {
  const out: { jour: DateISO; plaques: number; cultures: string[] }[] = []
  for (let j = debut; j <= fin; j = ajouterJours(j, 1)) {
    const pres = autres.filter(o => o.planting_id !== exclure && o.debut <= j && j <= o.fin)
    out.push({ jour: j, plaques: pres.reduce((s, o) => s + (o.plaques ?? 0), 0), cultures: pres.map(o => o.culture_name) })
  }
  return out
}

/**
 * Contrôle d'un semis (nouveau ou modifié) face aux autres semis en cellule.
 * `ligne` : le semis tel qu'il serait enregistré ; `autres` : occupations de la
 * ferme (le semis lui-même, s'il existe déjà, est ignoré par son id).
 */
export function controlerSemis(args: {
  ligne: LigneSemis
  autres: OccupationCellule[]
  capacite: Pick<CapacitePepiniere, 'plaques'> | null
  trousParPlaque: number | null
  taux?: TauxPertes
  /** Par défaut : `ligne.semisDirectPossible` (catalogue). */
  semisDirectPossible?: boolean
  /** Rayon de recherche d'une autre date, en jours (90 par défaut). */
  rayonJours?: number
}): ControlePepiniere {
  const { ligne, autres, capacite, trousParPlaque } = args
  if (!capacite || !trousParPlaque) return { etat: 'sans_capacite' }
  if (ligne.achat) return { etat: 'hors_cellule', raison: 'plant acheté' }
  const duree = ecartJoursCellule(ligne)
  if (ligne.direct || duree <= 0) return { etat: 'hors_cellule', raison: 'semis direct' }
  const k = ligne.production.plantsAvecPertes
  if (k.etat !== 'ok') return { etat: 'non_calculable', champs: k.etat === 'manquant' ? k.champs : [] }

  const plaques = Math.ceil(Math.ceil(Math.round(k.brut * 1e6) / 1e6) / trousParPlaque)
  const id = ligne.planting.id
  const tient = (debut: DateISO) => chargeAutres(autres, debut, ajouterJours(debut, duree - 1), id)
    .every(j => j.plaques + plaques <= capacite.plaques)

  const debut = ligne.calendrier.entree
  const charge = chargeAutres(autres, debut, ajouterJours(debut, duree - 1), id)
  const jours: JourDepasse[] = charge
    .filter(j => j.plaques + plaques > capacite.plaques)
    .map(j => ({ jour: j.jour, plaques: j.plaques + plaques, capacite: capacite.plaques, manquantes: j.plaques + plaques - capacite.plaques, cultures: [...j.cultures, ligne.planting.culture_name] }))
  if (jours.length === 0) return { etat: 'ok', plaques }

  // (a) date la plus proche, à égalité l'avance d'abord (semer plus tôt)
  let dateProposee: DateISO | null = null, decalage: number | null = null
  const rayon = args.rayonJours ?? 90
  for (let d = 1; d <= rayon && dateProposee === null; d++) {
    for (const s of [-d, d]) {
      const candidat = ajouterJours(debut, s)
      if (tient(candidat)) { dateProposee = candidat; decalage = s; break }
    }
  }

  // (b) surface maximale à la date choisie : plaques libres le jour le plus chargé
  const libres = Math.max(0, capacite.plaques - Math.max(...charge.map(j => j.plaques)))
  const m2 = positif(ligne.planting.surface_m2) ?? 0
  let surfaceMax = 0
  if (libres > 0 && m2 > 0) {
    const mottesParM2 = k.brut / m2
    surfaceMax = Math.floor(((libres * trousParPlaque) / mottesParM2) * 10) / 10
    const plaquesPour = (s: number) => Math.ceil(Math.ceil(Math.round(s * mottesParM2 * 1e6) / 1e6) / trousParPlaque)
    while (surfaceMax > 0 && plaquesPour(surfaceMax) > libres) surfaceMax = Math.round((surfaceMax - 0.1) * 10) / 10
    surfaceMax = Math.min(surfaceMax, m2)
  }

  return {
    etat: 'depassement', plaques, jours, maxManquantes: Math.max(...jours.map(j => j.manquantes)),
    dateProposee, decalageJours: decalage, surfaceMax,
    alternatives: (args.semisDirectPossible ?? ligne.semisDirectPossible) ? ['plant_achete', 'semis_direct'] : ['plant_achete'],
  }
}

function ecartJoursCellule(l: LigneSemis): number {
  return ecartJours(l.calendrier.entree, l.calendrier.plantation)
}

/** Phrases des propositions, pour une alerte ou une liste. */
export function propositionsTexte(c: Extract<ControlePepiniere, { etat: 'depassement' }>, formatDate: (d: DateISO) => string = d => d): string[] {
  const out: string[] = []
  if (c.dateProposee) {
    const n = Math.abs(c.decalageJours ?? 0)
    out.push(`entrer en cellule le ${formatDate(c.dateProposee)} (${n} jour${n > 1 ? 's' : ''} ${(c.decalageJours ?? 0) < 0 ? 'plus tôt' : 'plus tard'})`)
  } else out.push('aucune date proche ne libère assez de place')
  out.push(c.surfaceMax > 0 ? `réduire à ${String(c.surfaceMax).replace('.', ',')} m² à cette date` : 'aucune surface ne tient à cette date')
  out.push(c.alternatives.includes('semis_direct') ? 'passer en plant acheté ou en semis direct' : 'passer en plant acheté')
  return out
}
