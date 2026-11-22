// ============================================================
// Tâches du plan de culture
// ============================================================
// Les tâches tirées du plan (semer, planter, pincer, poser le filet,
// récolter) ne sont PAS stockées : elles se recalculent depuis
// `plantings_full`, donc suivent toute modification du plan. On ne stocke
// une ligne `tasks` que lorsqu'on coche ou qu'on assigne une tâche ; elle
// est retrouvée par son `auto_key` stable `'<kind>:<planting_id>'`.
// Les tâches libres (sans auto_key) viennent telles quelles de `tasks`.
// ============================================================

import {
  ajouterJours, cleMois, cleSemaine, dansIntervalle, fenetreMensuelle, formatMois,
  lundiDeSemaine, lundiSemaineIso, lundisEntre, moisEntre, premierLundiDuMois, semaineIso, type Intervalle,
} from './dates'
import type { DateISO, PlantingFull, Task, TaskKind } from './types'

/**
 * Pinçage : environ 3 semaines après la mise en place au champ, quand le
 * plant a 3 ou 4 paires de feuilles (cosmos, zinnia, célosie, dahlia…).
 * Valeur moyenne à faire confirmer : selon la culture et la météo, 2 à
 * 4 semaines.
 */
export const JOURS_PINCAGE_APRES_PLANTATION = 21

/**
 * Filet de tuteurage (ou tuteurs) posé le jour de la plantation, tant que
 * les plants sont bas : posé plus tard, il casse des tiges.
 */
export const JOURS_FILET_APRES_PLANTATION = 0

/** Ordre d'affichage des tâches d'un même jour. */
const ORDRE_KIND: Record<TaskKind, number> = {
  semis: 0, repiquage: 1, plantation: 2, tuteurage: 3, pincage: 4, desherbage: 5,
  irrigation: 6, traitement: 7, recolte: 8, livraison: 9, autre: 10,
}

export type PlantingTaches = Pick<PlantingFull,
  'id' | 'season_id' | 'planche_id' | 'culture_name' | 'date_semis' | 'date_plantation' | 'date_recolte'
  | 'semis_direct' | 'pincer' | 'filet'
> & Partial<Pick<PlantingFull, 'planche_name' | 'garden_name' | 'season_name'>>

export type StoredTask = Pick<Task,
  'id' | 'season_id' | 'title' | 'kind' | 'due_date' | 'planting_id' | 'planche_id'
  | 'assigned_to' | 'auto_key' | 'done_at' | 'done_by' | 'notes'
>

export interface Tache {
  /** auto_key pour une tâche du plan, `libre:<id>` pour une tâche libre. */
  cle: string
  auto_key: string | null
  source: 'plan' | 'libre'
  kind: TaskKind
  title: string
  due_date: DateISO | null
  season_id: string
  planting_id: string | null
  planche_id: string | null
  culture_name: string | null
  planche_name: string | null
  garden_name: string | null
  /** Ligne `tasks` qui porte l'état, si elle existe. */
  task_id: string | null
  fait: boolean
  done_at: string | null
  done_by: string | null
  assigned_to: string | null
  notes: string | null
}

export function autoKey(kind: TaskKind, plantingId: string): string {
  return `${kind}:${plantingId}`
}

/** Date de mise en place au champ : la plantation, ou le semis pour un semis direct. */
export function dateMiseEnPlace(p: Pick<PlantingTaches, 'semis_direct' | 'date_semis' | 'date_plantation'>): DateISO {
  return p.semis_direct ? p.date_semis : p.date_plantation
}

/** Toutes les tâches du plan d'une plantation, sans filtre de date. */
export function tachesDUnePlantation(p: PlantingTaches): Tache[] {
  const base = {
    source: 'plan' as const, season_id: p.season_id, planting_id: p.id, planche_id: p.planche_id,
    culture_name: p.culture_name, planche_name: p.planche_name ?? null, garden_name: p.garden_name ?? null,
    task_id: null, fait: false, done_at: null, done_by: null, assigned_to: null, notes: null,
  }
  const lieu = p.planche_name ? ` — ${p.planche_name}` : ''
  const mk = (kind: TaskKind, title: string, due: DateISO): Tache => ({
    ...base, kind, title: `${title}${lieu}`, due_date: due,
    cle: autoKey(kind, p.id), auto_key: autoKey(kind, p.id),
  })
  const miseEnPlace = dateMiseEnPlace(p)
  const out: Tache[] = []
  if (!p.semis_direct) out.push(mk('semis', `Semer ${p.culture_name} en cellules`, p.date_semis))
  out.push(mk('plantation',
    p.semis_direct ? `Semer ${p.culture_name} au champ (semis direct)` : `Planter ${p.culture_name}`,
    miseEnPlace))
  if (p.filet) out.push(mk('tuteurage', `Poser le filet de tuteurage : ${p.culture_name}`,
    ajouterJours(miseEnPlace, JOURS_FILET_APRES_PLANTATION)))
  if (p.pincer) out.push(mk('pincage', `Pincer ${p.culture_name}`,
    ajouterJours(miseEnPlace, JOURS_PINCAGE_APRES_PLANTATION)))
  out.push(mk('recolte', `Début de récolte : ${p.culture_name}`, p.date_recolte))
  return out
}

/** Tâches du plan dont l'échéance tombe dans la période. */
export function genererTachesPlan(plantings: PlantingTaches[], periode: Intervalle): Tache[] {
  return trierTaches(plantings.flatMap(tachesDUnePlantation)
    .filter(t => t.due_date !== null && dansIntervalle(t.due_date, periode)))
}

function depuisStockee(t: StoredTask): Tache {
  return {
    cle: t.auto_key ?? `libre:${t.id}`, auto_key: t.auto_key, source: 'libre', kind: t.kind,
    title: t.title, due_date: t.due_date, season_id: t.season_id,
    planting_id: t.planting_id, planche_id: t.planche_id,
    culture_name: null, planche_name: null, garden_name: null,
    task_id: t.id, fait: t.done_at !== null, done_at: t.done_at, done_by: t.done_by,
    assigned_to: t.assigned_to, notes: t.notes,
  }
}

/**
 * Fusionne les tâches générées avec les lignes `tasks` stockées :
 *  * une ligne de même auto_key apporte l'état (fait, assignée, notes) ;
 *    la date et le titre restent ceux du plan, qui fait foi ;
 *  * une tâche libre (auto_key null) est ajoutée telle quelle ;
 *  * une ligne à auto_key sans tâche générée correspondante (hors période,
 *    ou plan modifié) est ignorée — `lignesOrphelines` la retrouve.
 *  * l'auto_key contient l'id de la plantation : si la plantation a changé
 *    de saison (rattachement à l'année de récolte, migration 016), la ligne
 *    de l'ancienne saison est reprise faute de ligne dans la nouvelle, pour
 *    qu'une tâche faite ne réapparaisse pas « à faire ».
 */
export function fusionnerTaches(generees: Tache[], stockees: StoredTask[]): Tache[] {
  const parCle = new Map<string, StoredTask>()
  const parAutoKey = new Map<string, StoredTask>()
  for (const s of stockees) if (s.auto_key) {
    parCle.set(`${s.season_id}|${s.auto_key}`, s)
    if (!parAutoKey.has(s.auto_key)) parAutoKey.set(s.auto_key, s)
  }
  const fusion = generees.map(g => {
    const s = g.auto_key ? (parCle.get(`${g.season_id}|${g.auto_key}`) ?? parAutoKey.get(g.auto_key)) : undefined
    if (!s) return g
    return {
      ...g, task_id: s.id, fait: s.done_at !== null, done_at: s.done_at, done_by: s.done_by,
      assigned_to: s.assigned_to, notes: s.notes,
    }
  })
  const libres = stockees.filter(s => !s.auto_key).map(depuisStockee)
  return trierTaches([...fusion, ...libres])
}

/** Lignes à auto_key qui ne correspondent à aucune tâche générée sur toute la durée du plan. */
export function lignesOrphelines(plantings: PlantingTaches[], stockees: StoredTask[]): StoredTask[] {
  // auto_key = '<kind>:<planting_id>' : unique sur la ferme, quelle que soit la saison
  const cles = new Set(plantings.flatMap(tachesDUnePlantation).map(t => t.auto_key))
  return stockees.filter(s => s.auto_key && !cles.has(s.auto_key))
}

export function trierTaches(taches: Tache[]): Tache[] {
  return [...taches].sort((a, b) => {
    const da = a.due_date ?? '9999-12-31', db = b.due_date ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    if (a.kind !== b.kind) return ORDRE_KIND[a.kind] - ORDRE_KIND[b.kind]
    return a.title.localeCompare(b.title, 'fr')
  })
}

// ------------------------------------------------------------
// Vue courte (tableau de bord) : en retard / cette semaine / semaine prochaine / plus tard
// ------------------------------------------------------------
export interface GroupesTaches {
  /** Non faites, échéance passée. */
  en_retard: Tache[]
  /** Semaine ISO en cours, à partir d'aujourd'hui, plus celles faites cette semaine. */
  cette_semaine: Tache[]
  semaine_prochaine: Tache[]
  plus_tard: Tache[]
  /** Tâches libres sans échéance. */
  sans_date: Tache[]
}

/**
 * Vue courte pour le tableau de bord. Les tâches faites avant la
 * semaine en cours sont écartées (historique) ; celles faites plus tôt
 * dans la semaine restent visibles, cochées.
 */
export function grouperParEcheance(taches: Tache[], aujourdhui: DateISO): GroupesTaches {
  const lundi = lundiDeSemaine(aujourdhui)
  const lundiSuivant = ajouterJours(lundi, 7)
  const lundiApres = ajouterJours(lundi, 14)
  const g: GroupesTaches = { en_retard: [], cette_semaine: [], semaine_prochaine: [], plus_tard: [], sans_date: [] }
  for (const t of trierTaches(taches)) {
    if (t.due_date === null) { g.sans_date.push(t); continue }
    if (!t.fait && t.due_date < aujourdhui) g.en_retard.push(t)
    else if (t.due_date < lundi) continue
    else if (t.due_date < lundiSuivant) g.cette_semaine.push(t)
    else if (t.due_date < lundiApres) g.semaine_prochaine.push(t)
    else g.plus_tard.push(t)
  }
  return g
}

/** Tâches indexées par semaine ISO (`2027-W05`), pour un calendrier. */
export function grouperParSemaine(taches: Tache[]): Map<string, Tache[]> {
  const m = new Map<string, Tache[]>()
  for (const t of trierTaches(taches)) {
    if (!t.due_date) continue
    const k = cleSemaine(t.due_date)
    const l = m.get(k)
    if (l) l.push(t); else m.set(k, [t])
  }
  return m
}

// ------------------------------------------------------------
// Planning mensuel : vue principale de l'écran « Tâches »
// ------------------------------------------------------------
// Regroupement par MOIS civil, puis par semaine ISO à l'intérieur du mois.
//
// RÈGLE DE RATTACHEMENT : une semaine appartient au mois de son LUNDI.
// La semaine du lundi 30 novembre au dimanche 6 décembre 2026 est donc
// rangée en novembre, y compris ses tâches du 1er au 6 décembre ; la
// semaine 53 (28 décembre 2026 – 3 janvier 2027) est rangée en décembre
// 2026. Ainsi une semaine n'est jamais coupée en deux, et le mois affiché
// commence toujours par une semaine complète. Conséquence à connaître :
// une tâche datée du 2 avril peut apparaître sous « mars ».
//
// Le mois « en cours » est celui qui contient aujourd'hui ; la semaine
// « en cours » est la semaine ISO d'aujourd'hui, qui peut être rangée
// dans le mois précédent (cas du 1er au 6 décembre 2026 ci-dessus).
// ------------------------------------------------------------

export interface CompteurType {
  total: number
  faites: number
  a_faire: number
}

export interface CompteursTaches extends CompteurType {
  /** Charge par type de tâche (seuls les types présents figurent). */
  par_type: Partial<Record<TaskKind, CompteurType>>
}

export function compterTaches(taches: Tache[]): CompteursTaches {
  const c: CompteursTaches = { total: 0, faites: 0, a_faire: 0, par_type: {} }
  for (const t of taches) {
    const k = c.par_type[t.kind] ?? (c.par_type[t.kind] = { total: 0, faites: 0, a_faire: 0 })
    c.total++; k.total++
    if (t.fait) { c.faites++; k.faites++ } else { c.a_faire++; k.a_faire++ }
  }
  return c
}

export interface SemaineTaches {
  /** `2026-W53`. */
  cle: string
  annee_iso: number
  numero: number
  lundi: DateISO
  dimanche: DateISO
  en_cours: boolean
  taches: Tache[]
  compteurs: CompteursTaches
}

export interface MoisTaches {
  /** `2026-11`. */
  cle: string
  /** « novembre 2026 ». */
  libelle: string
  en_cours: boolean
  /** Semaines dont le lundi tombe dans ce mois, vides comprises. */
  semaines: SemaineTaches[]
  compteurs: CompteursTaches
}

export interface PlanningMensuel {
  /** Tâches non faites dont l'échéance est passée, toutes dates confondues. */
  en_retard: { taches: Tache[]; compteurs: CompteursTaches }
  mois: MoisTaches[]
  /** Tâches libres sans échéance. */
  sans_date: Tache[]
}

/** Mois de rattachement d'une date : celui du lundi de sa semaine. */
export function moisDeRattachement(d: DateISO): string {
  return cleMois(lundiDeSemaine(d))
}

/**
 * Range les tâches par mois puis par semaine. `fenetre` (par défaut le
 * mois en cours + 11 mois) fixe les mois affichés ; s'y ajoute, au besoin,
 * le mois de rattachement de la semaine en cours. Les tâches faites hors
 * de ces mois sont écartées (historique) ; les non faites passées vont
 * dans « En retard ».
 */
export function grouperParMois(taches: Tache[], aujourdhui: DateISO, fenetre?: Intervalle): PlanningMensuel {
  const f = fenetre ?? fenetreMensuelle(aujourdhui)
  const lundiAuj = lundiDeSemaine(aujourdhui)
  const debut = f.debut < lundiAuj ? f.debut : lundiAuj
  const cles = moisEntre({ debut, fin: f.fin })
  const lundiCourant = lundiAuj
  const moisCourant = cleMois(aujourdhui)

  const parSemaine = new Map<DateISO, Tache[]>()
  const en_retard: Tache[] = []
  const sans_date: Tache[] = []
  for (const t of trierTaches(taches)) {
    if (t.due_date === null) { sans_date.push(t); continue }
    if (!t.fait && t.due_date < aujourdhui) { en_retard.push(t); continue }
    const l = lundiDeSemaine(t.due_date)
    const liste = parSemaine.get(l)
    if (liste) liste.push(t); else parSemaine.set(l, [t])
  }

  const mois: MoisTaches[] = cles.map(cle => {
    const lundis = lundisEntre({ debut: `${cle}-01`, fin: ajouterJours(premierLundiDuMois(cle), 34) })
      .filter(l => cleMois(l) === cle)
    const semaines: SemaineTaches[] = lundis.map(lundi => {
      const st = parSemaine.get(lundi) ?? []
      const { annee, semaine } = semaineIso(lundi)
      return {
        cle: cleSemaine(lundi), annee_iso: annee, numero: semaine, lundi, dimanche: ajouterJours(lundi, 6),
        en_cours: lundi === lundiCourant, taches: st, compteurs: compterTaches(st),
      }
    })
    return {
      cle, libelle: formatMois(cle), en_cours: cle === moisCourant, semaines,
      compteurs: compterTaches(semaines.flatMap(s => s.taches)),
    }
  })
  return { en_retard: { taches: en_retard, compteurs: compterTaches(en_retard) }, mois, sans_date }
}

// ------------------------------------------------------------
// Cocher
// ------------------------------------------------------------
/**
 * Ligne à écrire (upsert sur `season_id, auto_key`) pour cocher ou
 * décocher une tâche du plan. `maintenant` est l'horodatage ISO fourni
 * par l'écran.
 */
export function ligneCocherTache(t: Tache, fait: boolean, userId: string, maintenant: string): {
  season_id: string; auto_key: string | null; title: string; kind: TaskKind; due_date: DateISO | null
  planting_id: string | null; planche_id: string | null; done_at: string | null; done_by: string | null
} {
  return {
    season_id: t.season_id, auto_key: t.auto_key, title: t.title, kind: t.kind, due_date: t.due_date,
    planting_id: t.planting_id, planche_id: t.planche_id,
    done_at: fait ? maintenant : null, done_by: fait ? userId : null,
  }
}

/** Retard rattrapé par défaut : au-delà, une tâche du plan non faite n'est plus proposée. */
export const JOURS_RETARD_AFFICHES = 60

/**
 * Point d'entrée de l'écran « Tâches » : génère les tâches du plan sur la
 * fenêtre mensuelle (plus `retardJours` jours en arrière pour les retards),
 * fusionne l'état stocké et range par mois puis par semaine.
 */
export function tachesAAfficher(args: {
  plantings: PlantingTaches[]
  stockees: StoredTask[]
  aujourdhui: DateISO
  /** Par défaut : mois en cours + 11 mois. */
  fenetre?: Intervalle
  retardJours?: number
}): PlanningMensuel {
  const fenetre = args.fenetre ?? fenetreMensuelle(args.aujourdhui)
  const retard = ajouterJours(args.aujourdhui, -(args.retardJours ?? JOURS_RETARD_AFFICHES))
  const debut = [retard, fenetre.debut, lundiDeSemaine(args.aujourdhui)].sort()[0]
  const periode = { debut, fin: fenetre.fin }
  const horsFenetre = (t: StoredTask) => !t.auto_key && t.due_date !== null && t.due_date > periode.fin
  const fusion = fusionnerTaches(genererTachesPlan(args.plantings, periode),
    args.stockees.filter(t => !horsFenetre(t)))
  return grouperParMois(fusion, args.aujourdhui, fenetre)
}

// ------------------------------------------------------------
// Déplacer une tâche libre
// ------------------------------------------------------------
export type CibleDeplacement =
  /** Semaine ISO cible ; `jour` 1 = lundi (défaut) … 7 = dimanche. */
  | { semaine: { annee: number; numero: number } | DateISO; jour?: number }
  /** Mois cible `YYYY-MM` : premier lundi du mois, donc 1re semaine qui lui est rattachée. */
  | { mois: string; jour?: number }

/**
 * Nouvelle échéance d'une tâche libre déplacée vers une autre semaine ou un
 * autre mois. Par défaut le lundi de la semaine cible. Une tâche générée
 * par le plan ne se déplace pas : sa date vient du plan de culture, c'est
 * la plantation qu'il faut modifier.
 * Renvoie la mise à jour à appliquer sur `tasks` (`id`, `due_date`).
 */
export function deplacerTache(t: Pick<Tache, 'source' | 'task_id' | 'title'>, cible: CibleDeplacement): { id: string; due_date: DateISO } {
  if (t.source !== 'libre' || !t.task_id) {
    throw new Error(`« ${t.title} » vient du plan de culture : modifiez la plantation pour changer sa date`)
  }
  const jour = cible.jour ?? 1
  if (!Number.isInteger(jour) || jour < 1 || jour > 7) throw new Error(`Jour de semaine invalide : ${jour}`)
  let lundi: DateISO
  if ('mois' in cible) {
    if (!/^\d{4}-\d{2}$/.test(cible.mois)) throw new Error(`Mois invalide : « ${cible.mois} »`)
    lundi = premierLundiDuMois(cible.mois)
  } else if (typeof cible.semaine === 'string') {
    lundi = lundiDeSemaine(cible.semaine)
  } else {
    lundi = lundiSemaineIso(cible.semaine.annee, cible.semaine.numero)
  }
  return { id: t.task_id, due_date: ajouterJours(lundi, jour - 1) }
}

