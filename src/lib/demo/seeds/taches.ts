import { type DemoDb, DEMO_USER_ID, DEMO_TEAMMATE_ID, SEASON_2026 } from '../data'
import { ajouterJours } from '../../domain/dates'
import { tachesDUnePlantation, type PlantingTaches } from '../../domain/taches'
import type { TaskKind } from '../../domain/types'

/**
 * Données de démo : tâches stockées. Les tâches du plan ne sont pas
 * stockées : on n'écrit que leur état (cochée, assignée, note), retrouvé
 * par `auto_key`. S'y ajoutent des tâches libres (désherbage, irrigation,
 * livraisons…). Les dates sont fixes, autour de novembre 2026, comme le
 * reste des données de démo. Modifie la base en place.
 */
export function seed_taches(db: DemoDb & Record<string, any[]>): void {
  let n = 0
  const id = () => `c0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const tasks = db.tasks
  const ts = (d: string, h = '08:30') => `${d}T${h}:00+01:00`

  // Plantations telles que la vue plantings_full les présente (dates recalculées)
  const plantings: PlantingTaches[] = db.plantings.flatMap(p => {
    const c = db.culture_catalog.find(x => x.id === p.culture_id)
    const pl = db.planches.find(x => x.id === p.planche_id)
    if (!c || !pl) return []
    const jc = p.jours_cellule_override || c.jours_cellule || 0
    const date_plantation = ajouterJours(p.date_semis, jc)
    return [{
      id: p.id, season_id: p.season_id, planche_id: p.planche_id, culture_name: c.name,
      date_semis: p.date_semis, date_plantation,
      date_recolte: ajouterJours(date_plantation, p.jours_champ_override ?? c.jours_champ),
      semis_direct: c.semis_direct, pincer: c.pincer, filet: c.filet, planche_name: pl.name,
    }]
  })
  const plan = plantings.flatMap(tachesDUnePlantation)
    .filter(t => t.due_date !== null && t.due_date >= '2026-09-21' && t.due_date <= '2027-06-30')
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : a.cle.localeCompare(b.cle)))

  const etat = (cle: string, e: { fait?: string; par?: string; assigne?: string; notes?: string }) => {
    const t = plan.find(x => x.cle === cle)
    if (!t) return
    tasks.push({
      id: id(), season_id: t.season_id, title: t.title, kind: t.kind, due_date: t.due_date,
      planting_id: t.planting_id, planche_id: t.planche_id, auto_key: t.auto_key,
      assigned_to: e.assigne ?? null, done_at: e.fait ? ts(e.fait) : null,
      done_by: e.fait ? (e.par ?? DEMO_USER_ID) : null, notes: e.notes ?? null,
      created_by: DEMO_USER_ID, created_at: ts(e.fait ?? '2026-11-02'),
    })
  }

  // Passé : presque tout est fait, deux tâches restent en retard pour la démo
  const passees = plan.filter(t => t.due_date! < '2026-11-16')
  const enRetard = new Set(passees.filter(t => t.kind === 'pincage' || t.kind === 'tuteurage').slice(-2).map(t => t.cle))
  passees.forEach((t, i) => {
    if (enRetard.has(t.cle)) return
    etat(t.cle, { fait: t.due_date!, par: i % 3 === 1 ? DEMO_TEAMMATE_ID : DEMO_USER_ID, assigne: i % 3 === 1 ? DEMO_TEAMMATE_ID : undefined })
  })
  for (const cle of enRetard) etat(cle, { assigne: DEMO_TEAMMATE_ID, notes: 'Attendre une journée sèche' })

  // Cette semaine et la suivante : une faite par le coéquipier, d'autres assignées
  const proches = plan.filter(t => t.due_date! >= '2026-11-16' && t.due_date! <= '2026-12-13')
  proches.forEach((t, i) => {
    if (t.due_date! <= '2026-11-20') etat(t.cle, { fait: t.due_date!, par: DEMO_TEAMMATE_ID, assigne: DEMO_TEAMMATE_ID })
    else if (i % 2 === 0) etat(t.cle, { assigne: DEMO_TEAMMATE_ID })
    else if (t.kind === 'semis') etat(t.cle, { assigne: DEMO_USER_ID, notes: 'Terreau de semis en réserve sous la serre' })
  })
  // Plus loin : quelques assignations au coéquipier
  plan.filter(t => t.due_date! > '2026-12-13' && (t.kind === 'plantation' || t.kind === 'tuteurage'))
    .forEach((t, i) => { if (i % 2 === 0) etat(t.cle, { assigne: DEMO_TEAMMATE_ID }) })

  // Tâches libres
  const planche = (jardin: string, nom: string) => {
    const g = db.gardens.find(x => x.name === jardin)
    return db.planches.find(x => x.garden_id === g?.id && x.name === nom)?.id ?? null
  }
  const libre = (title: string, kind: TaskKind, due: string | null, o: {
    planche?: string | null; assigne?: string; fait?: string; par?: string; notes?: string
  } = {}) => {
    tasks.push({
      id: id(), season_id: SEASON_2026, title, kind, due_date: due, planting_id: null,
      planche_id: o.planche ?? null, auto_key: null, assigned_to: o.assigne ?? null,
      done_at: o.fait ? ts(o.fait, '17:10') : null, done_by: o.fait ? (o.par ?? DEMO_USER_ID) : null,
      notes: o.notes ?? null, created_by: DEMO_USER_ID, created_at: ts('2026-11-02'),
    })
  }
  const T = DEMO_TEAMMATE_ID, U = DEMO_USER_ID
  // Novembre
  libre('Désherber les allées du Jardin du Haut', 'desherbage', '2026-11-12', { assigne: T })
  libre('Vidanger le goutte-à-goutte avant les gelées', 'irrigation', '2026-11-17', { planche: planche('Jardin du Haut', 'PL 1'), fait: '2026-11-17', par: T, assigne: T })
  libre('Livraison Fleurs de Lin, Morlaix', 'livraison', '2026-11-20', { fait: '2026-11-20', notes: '3 seaux de chrysanthèmes' })
  libre('Pailler les dahlias laissés en terre', 'autre', '2026-11-24', { planche: planche('Bordure du Ruisseau', 'PL 4'), assigne: T })
  libre('Livraison Atelier Pétale', 'livraison', '2026-11-27', { assigne: U, notes: 'Feuillage d’eucalyptus pour les couronnes' })
  libre('Désherber la serre froide', 'desherbage', '2026-11-26', { planche: planche('Serre froide', 'PL 2') })
  // Décembre – mars
  libre('Livraison couronnes de l’Avent', 'livraison', '2026-12-04', { assigne: U })
  libre('Contrôler les griffes de renoncules en stockage', 'autre', '2026-12-15')
  libre('Bâcher les planches libres du Verger', 'desherbage', '2027-01-12', { planche: planche('Parcelle du Verger', 'PL 3'), assigne: T })
  libre('Réviser le programmateur d’arrosage', 'irrigation', '2027-02-16')
  libre('Traitement au purin d’ortie : pois de senteur', 'traitement', '2027-03-18', { planche: planche('Serre froide', 'PL 4') })
  // Avril – mai : la grosse période
  libre('Installer le goutte-à-goutte au Jardin du Haut', 'irrigation', '2027-04-06', { assigne: T, notes: 'Prévoir 6 lignes de 12 m' })
  libre('Désherber au râteau les planches de printemps', 'desherbage', '2027-04-08', { assigne: T })
  libre('Livraison Atelier Pétale', 'livraison', '2027-04-16', { assigne: U })
  libre('Traitement préventif contre les pucerons', 'traitement', '2027-04-21', { planche: planche('Serre froide', 'PL 1') })
  libre('Désherber la Bordure du Ruisseau', 'desherbage', '2027-04-27', { assigne: T })
  libre('Livraison Fleurs de Lin, Morlaix', 'livraison', '2027-04-30')
  libre('Vérifier les filets des pois de senteur', 'tuteurage', '2027-05-04', { planche: planche('Serre froide', 'PL 4') })
  libre('Livraison abonnés : bouquets de mai', 'livraison', '2027-05-07', { assigne: U })
  libre('Désherber les allées avant le marché', 'desherbage', '2027-05-11', { assigne: T })
  libre('Contrôler l’irrigation de la serre', 'irrigation', '2027-05-18')
  libre('Livraison mariage Le Gall', 'livraison', '2027-05-22', { assigne: U, notes: '450 tiges, palette blanc et pêche' })
  libre('Livraisons fête des mères', 'livraison', '2027-05-28', { assigne: U })
  // Sans date
  libre('Commander les tubercules de dahlia', 'autre', null, { notes: 'Café au lait, Labyrinth, Wizard of Oz' })
}
