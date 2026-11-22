import type { DemoDb } from '../data'
import { SEASON_2026 } from '../data'
import { apercuBascule, apercuReprise, bornesSaison, type PlantationPreparation } from '../../domain/saisons'
import { SEASON_2027 } from './ferme'

type Row = Record<string, any>

/** Colonnes générées de 016 (date_debut, date_fin), posées sur une ligne `seasons`. */
export function bornesSaisonDemo(row: Row): Row {
  const y = Number(row.year)
  if (Number.isInteger(y) && y >= 2000 && y <= 2100) {
    const b = bornesSaison(y)
    row.date_debut = b.debut
    row.date_fin = b.fin
  }
  return row
}

/** Trigger `season_une_par_annee` (016) : message d'erreur, ou null si l'année est libre. */
export function refusSaisonEnDouble(seasons: Row[], row: Row): { code: string; message: string } | null {
  if (!row.farm_id) return null
  const autre = seasons.find(s => s.farm_id === row.farm_id && Number(s.year) === Number(row.year) && s.id !== row.id)
  return autre ? { code: '23505', message: `La saison ${row.year} existe déjà dans cette ferme (« ${autre.name} »)` } : null
}

/**
 * Saisons civiles (migration 016) dans la démo, à l'image de la prod :
 *  - UNE saison-plan 2026 (plus l'historique 2025 des achats) : l'ébauche
 *    « Saison 2027 » des autres seeds y est fondue, comme en prod où les
 *    semis de février 2027 et les bulbes de novembre 2026 sont dans 2026 ;
 *    rien n'est reclassé ici : c'est le parcours « Passer en 2027 » ou
 *    « Préparer 2027 » qui le fait, à l'écran ;
 *  - libellé = l'année (« 2026 »), ancien nom dans nom_initial (016, C) ;
 *  - bornes 1er janvier / 31 décembre sur chaque saison ;
 *  - aneth (« l'aneth manque ») : printemps 2026, automne 2026 en récolte de
 *    décembre 2026 à janvier 2027 (à cheval sur deux années), printemps 2027 ;
 *  - bulbes (anémone, tulipe) plantés le 1er novembre 2026, récoltés au
 *    printemps 2027 ; un semis de février 2027 ; une vivace en place
 *    (pivoine, jamais dupliquée ni décalée).
 * Modifie la base en place. À appeler après les autres seeds.
 */
export function seed_saisons(db: DemoDb & Record<string, any[]>): void {
  const now = '2026-11-10T09:00:00Z'

  // ── Une seule saison-plan : l'ébauche 2027 rejoint 2026 ─────────────
  if (db.seasons.some(x => x.id === SEASON_2027)) {
    for (const rows of Object.values(db)) {
      if (!Array.isArray(rows)) continue
      for (const r of rows) if (r && typeof r === 'object' && r.season_id === SEASON_2027) r.season_id = SEASON_2026
    }
    const vus = new Set<string>() // une seule ligne d'équipe par (saison, membre)
    db.team_members = db.team_members.filter(m => { const k = `${m.season_id}|${m.user_id}`; if (vus.has(k)) return false; vus.add(k); return true })
    db.seasons = db.seasons.filter(x => x.id !== SEASON_2027)
  }

  // ── Libellé = l'année, bornes civiles (016, A et C) ─────────────────
  for (const x of db.seasons) {
    if (x.name !== String(x.year)) { x.nom_initial = x.name; x.name = String(x.year) } else x.nom_initial ??= null
    bornesSaisonDemo(x)
  }

  // ── Catalogue : trouver ou créer (un autre seed peut déjà les avoir) ─
  const culture = (name: string, def: Row) => {
    let c = db.culture_catalog.find(x => x.name === name)
    if (!c) {
      c = {
        id: `41000000-0000-4000-8000-${String(db.culture_catalog.length + 1).padStart(12, '0')}`, user_id: null, name,
        temp_germination: null, pincer: false, filet: false, couvre_sol: false, semis_direct: false,
        espacement_cm: 20, rangs_par_planche: 4, graines_par_plant: 1, notes: null, created_at: now, ...def,
      }
      db.culture_catalog.push(c)
    }
    if (def.cycle && !c.cycle) c.cycle = def.cycle
    return c.id as string
  }
  const ANETH = culture('Aneth', { type: 'MP', jours_cellule: 21, jours_champ: 70, jours_recolte: 28, rendement_plant: 3, prix_tige: 0.6, espacement_cm: 20, rangs_par_planche: 5, graines_par_plant: 2, notes: 'Ombelles légères, très demandées par les fleuristes' })
  // Bulbes et griffes : plantés directement au champ, 120 j au champ, 56 j de récolte (tableur de Marine)
  const ANEMONE = culture('Anémone', { type: 'MP', jours_cellule: 0, jours_champ: 120, jours_recolte: 56, rendement_plant: 6, prix_tige: 1.2, espacement_cm: 15, rangs_par_planche: 6, notes: 'Griffes trempées 4 h avant plantation' })
  const TULIPE = culture('Tulipe', { type: 'RU', jours_cellule: 0, jours_champ: 120, jours_recolte: 56, rendement_plant: 1, prix_tige: 0.9, espacement_cm: 10, rangs_par_planche: 11, notes: 'Bulbes plantés serrés, arrachés à la récolte' })
  const PIVOINE = culture('Pivoine', { type: 'RU', jours_cellule: 0, jours_champ: 60, jours_recolte: 21, rendement_plant: 5, prix_tige: 2.5, espacement_cm: 80, rangs_par_planche: 1, cycle: 'vivace', notes: 'Vivace : en place pour des années' })
  const STATICE = culture('Statice', { type: 'MP', jours_cellule: 30, jours_champ: 80, jours_recolte: 21, rendement_plant: 3, prix_tige: 0.5 })

  const planche = (gardenName: string, plancheName: string) => {
    const g = db.gardens.find(x => x.name === gardenName)
    const p = g && db.planches.find(x => x.garden_id === g.id && x.name === plancheName)
    if (!p) throw new Error(`Planche démo inconnue : ${gardenName} ${plancheName}`)
    return p.id as string
  }

  // [n°, jardin, planche, culture, semis, m²], tout dans la saison-plan 2026
  const P: [number, string, string, string, string, number][] = [
    [1, 'Parcelle du Verger', 'PL 5', ANETH, '2026-03-10', 3],
    [2, 'Parcelle du Verger', 'PL 5', ANETH, '2026-09-20', 3],   // récolte 20/12/2026 au 17/01/2027
    [3, 'Jardin du Haut', 'PL 5', ANETH, '2027-03-01', 4],
    [4, 'Jardin du Haut', 'PL 6', ANEMONE, '2026-11-01', 5],     // bulbes du 1er novembre 2026
    [5, 'Jardin du Haut', 'PL 6', TULIPE, '2026-11-01', 5],
    [6, 'Parcelle du Verger', 'PL 3', STATICE, '2027-02-15', 5], // semis de février 2027
    [7, 'Bordure du Ruisseau', 'PL 2', PIVOINE, '2026-03-05', 2], // vivace en place
  ]
  for (const [n, g, pl, c, ds, m2] of P) {
    db.plantings.push({
      id: `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`, planche_id: planche(g, pl), culture_id: c,
      season_id: SEASON_2026, surface_m2: m2, date_semis: ds,
      jours_cellule_override: 0, jours_champ_override: null, jours_recolte_override: null,
      rendement_override: null, prix_override: null, notes: null, arrachee_le: null, created_at: now,
    })
  }
}

// ------------------------------------------------------------
// Fonctions SQL de 016, rejouées en démo avec les règles du domaine
// ------------------------------------------------------------
type Res = { data: any; error: any }
const refus = (message: string, code = 'P0001'): Res => ({ data: null, error: { code, message } })

export interface OutilsDemo {
  plantingsFull: () => Row[]
  calcPlanting: (p: Row) => void
  uuid: () => string
  aujourdhui: string
}

/** Plantations d'une saison au format des aperçus (dates de plantings_full, cycle du catalogue, arrachee_le brut). */
function preparation(db: Row, outils: OutilsDemo, seasonId: string): PlantationPreparation[] {
  return outils.plantingsFull().filter(p => p.season_id === seasonId).map(p => {
    const brut = db.plantings.find((x: Row) => x.id === p.id)
    const cat = db.culture_catalog.find((x: Row) => x.id === p.culture_id)
    return {
      id: p.id, culture_id: p.culture_id, culture_name: p.culture_name, planche_id: p.planche_id, season_id: p.season_id,
      date_semis: p.date_semis, date_plantation: p.date_plantation, date_recolte: p.date_recolte,
      planche_name: p.planche_name, garden_name: p.garden_name,
      arrachee_le: brut?.arrachee_le ?? null, cycle: cat?.cycle ?? null,
    }
  })
}

function reprise(db: Row, outils: OutilsDemo, source: Row, cible: Row, n: number): Res {
  if (Number(cible.year) !== Number(source.year) + n) return refus(`Décalage incohérent : ${source.year} + ${n} ans ne donne pas ${cible.year}`)
  const a = apercuReprise({ source: preparation(db, outils, source.id), cible: preparation(db, outils, cible.id), anneeSource: Number(source.year), decalageAnnees: n })
  for (const p of a.copies) {
    const brut = db.plantings.find((x: Row) => x.id === p.id)
    const row: Row = { ...brut, id: outils.uuid(), season_id: cible.id, date_semis: p.date_semis_copie, arrachee_le: null, created_at: new Date().toISOString() }
    outils.calcPlanting(row)
    db.plantings.push(row)
  }
  return { data: { copiees: a.copies.length, vivaces_en_place: a.vivacesEnPlace.length, deja_prevues: a.dejaPrevues.length, hors_annee: a.horsAnnee.length }, error: null }
}

export function rpcSaisonsDemo(fn: string, args: Row, db: Row, isOwner: (sid: string) => boolean, outils: OutilsDemo): Res | null {
  const saison = (id: string) => db.seasons.find((s: Row) => s.id === id)

  if (fn === 'plantations_hors_annee_de_recolte') {
    const ids = new Set(db.seasons.filter((s: Row) => s.farm_id === args.p_farm_id).map((s: Row) => s.id))
    const rows = outils.plantingsFull().filter(p => ids.has(p.season_id) && p.date_recolte && Number(p.date_recolte.slice(0, 4)) !== Number(p.season_year))
      .map(p => {
        const annee = Number(p.date_recolte.slice(0, 4))
        const cible = db.seasons.find((s: Row) => s.farm_id === args.p_farm_id && Number(s.year) === annee)
        return { planting_id: p.id, culture_name: p.culture_name, date_recolte: p.date_recolte, saison_actuelle: p.season_id, annee_actuelle: p.season_year, saison_cible: cible?.id ?? null, annee_cible: annee }
      })
    return { data: rows, error: null }
  }

  if (fn === 'reclasser_plantations') {
    const from = saison(args.p_from), to = saison(args.p_to)
    if (!from || !to || !isOwner(from.id) || !isOwner(to.id)) return refus('Seul un propriétaire de la ferme peut rattacher des plantations à une autre saison', '42501')
    if (from.id === to.id) return refus('Saisons source et cible identiques')
    if (from.farm_id !== to.farm_id) return refus('Les deux saisons doivent appartenir à la même ferme')
    const ids: string[] = Array.from(new Set<string>((args.p_ids ?? []).filter(Boolean)))
    const lignes = ids.map(id => db.plantings.find((p: Row) => p.id === id && p.season_id === from.id))
    if (lignes.some(l => !l)) return refus(`Une plantation demandée n'est pas (ou plus) dans la saison ${from.name}`)
    const taches = (db.tasks ?? []).filter((t: Row) => t.season_id === from.id && t.auto_key && ids.some(id => String(t.auto_key).endsWith(`:${id}`)))
    if (taches.some((t: Row) => db.tasks.some((u: Row) => u.season_id === to.id && u.auto_key === t.auto_key)))
      return refus(`La saison ${to.name} a déjà une tâche du plan pour une de ces plantations : rien n'a été déplacé`)
    for (const t of taches) t.season_id = to.id
    for (const l of lignes) l.season_id = to.id
    return { data: ids.length, error: null }
  }

  if (fn === 'reprendre_plan_dans_saison') {
    const source = saison(args.p_source), cible = saison(args.p_cible)
    if (!source || !cible || !isOwner(source.id) || !isOwner(cible.id)) return refus('Seul le propriétaire peut reprendre un plan', '42501')
    if (source.farm_id !== cible.farm_id) return refus('Les deux saisons doivent appartenir à la même ferme')
    return reprise(db, outils, source, cible, Number(args.p_shift_years ?? 1))
  }

  if (fn === 'basculer_saison') {
    const s = saison(args.p_season)
    if (!s || !isOwner(s.id)) return refus('Seul un propriétaire de la ferme peut changer l\'année d\'une saison', '42501')
    const annee = Number(args.p_annee)
    let a
    try {
      a = apercuBascule({ plantings: preparation(db, outils, s.id), anneeSaison: Number(s.year), anneeCible: annee, aujourdhui: outils.aujourdhui })
    } catch (e) { return refus(e instanceof Error ? e.message : String(e)) }
    const ancienNom = s.name, ancienneAnnee = s.year
    if (args.p_appliquer) {
      const doublon = refusSaisonEnDouble(db.seasons, { ...s, year: annee })
      if (doublon) return { data: null, error: doublon }
      s.nom_initial = s.nom_initial ?? (s.name !== String(annee) ? s.name : null)
      s.name = String(annee); s.year = annee
      bornesSaisonDemo(s)
      for (const p of a.decalees) {
        const brut = db.plantings.find((x: Row) => x.id === p.id)
        brut.date_semis = p.nouvelle_date_semis
        outils.calcPlanting(brut)
      }
    }
    const b = bornesSaison(annee)
    return {
      data: {
        applique: !!args.p_appliquer,
        saison: { id: s.id, ancien_nom: ancienNom, ancienne_annee: ancienneAnnee, nouveau_nom: String(annee), annee, date_debut: b.debut, date_fin: b.fin },
        decalees: a.decalees.map(p => ({ planting_id: p.id, culture_name: p.culture_name, planche_name: (p as Row).planche_name, garden_name: (p as Row).garden_name, date_semis: p.date_semis, nouvelle_date_semis: p.nouvelle_date_semis, date_recolte: p.date_recolte })),
        laissees: a.laissees.map(p => ({ planting_id: p.id, culture_name: p.culture_name, planche_name: (p as Row).planche_name, garden_name: (p as Row).garden_name, date_semis: p.date_semis, date_recolte: p.date_recolte, raison: p.raison })),
      },
      error: null,
    }
  }
  return null
}

/** `duplicate_season_plan` réécrite sur la reprise (016) : appelée après création de la saison. */
export function repriseApresDuplication(db: Row, outils: OutilsDemo, sourceId: string, cibleId: string, n: number): Res {
  return reprise(db, outils, db.seasons.find((s: Row) => s.id === sourceId), db.seasons.find((s: Row) => s.id === cibleId), n)
}
