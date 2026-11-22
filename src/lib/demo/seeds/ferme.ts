import type { DemoDb } from '../data'
import { DEMO_USER_ID } from '../data'

export const SEASON_2027 = '10000000-0000-4000-8000-000000002027'
const MAELLE_ID = '00000000-0000-4000-8000-000000000003'

/**
 * Données de démo de la ferme permanente (migration 006).
 * La ferme, ses membres et le farm_id des saisons et jardins sont posés par
 * `extendDemoDb` ; on ajoute ici ce qui rend visible le chevauchement entre
 * saisons :
 *  - une « Saison 2027 » déjà ébauchée (non active), dont les plantations
 *    de printemps arrivent sur des planches encore occupées par les
 *    semis d'automne 2026 (renoncules, pois de senteur…) ;
 *  - AUCUN conflit de surface (retour de Marine : les conflits de la démo
 *    étaient faux) ; les lisianthus 2027 sont des plants achetés (plugs),
 *    plantés en mars à côté des renoncules d'automne ;
 *  - une troisième personne dans l'équipe de la ferme.
 * Modifie la base en place.
 */
export function seed_ferme(db: DemoDb & Record<string, any[]>): void {
  const farm = db.farms?.[0]
  if (!farm) return
  const now = '2026-11-10T09:00:00Z'

  // ── Équipe : une saisonnière déjà inscrite ───────────────────────
  db.profiles.push({ id: MAELLE_ID, email: 'maelle.le-gall@exemple.fr', farm_name: '', owner_name: 'Maëlle Le Gall', created_at: '2026-06-01T08:00:00Z' })
  db.farm_members.push({ id: '31000000-0000-4000-8000-000000000003', farm_id: farm.id, user_id: MAELLE_ID, role: 'member', joined_at: '2026-06-01T08:00:00Z' })
  for (const s of db.seasons) {
    if (s.farm_id === farm.id && !db.team_members.some(m => m.season_id === s.id && m.user_id === MAELLE_ID)) {
      db.team_members.push({ id: `32000000-0000-4000-8000-${s.id.slice(-12)}`, season_id: s.id, user_id: MAELLE_ID, role: 'member', joined_at: '2026-06-01T08:00:00Z' })
    }
  }

  // ── Saison 2027, ébauchée ────────────────────────────────────────
  db.seasons.push({
    id: SEASON_2027, user_id: DEMO_USER_ID, farm_id: farm.id, name: 'Saison 2027', year: 2027, revenue_goal: 21000,
    is_active: false, invite_token: '20000000-0000-4000-8000-000000000027', invite_enabled: false, created_at: now,
  })
  for (const [i, m] of db.farm_members.filter(x => x.farm_id === farm.id).entries()) {
    db.team_members.push({ id: `33000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, season_id: SEASON_2027, user_id: m.user_id, role: m.role, joined_at: now })
  }

  const garden = (name: string) => {
    const g = db.gardens.find(x => x.name === name)
    if (!g) throw new Error(`Jardin démo inconnu : ${name}`)
    return g
  }
  const planche = (gardenName: string, plancheName: string) => {
    const g = garden(gardenName)
    const p = db.planches.find(x => x.garden_id === g.id && x.name === plancheName)
    if (!p) throw new Error(`Planche démo inconnue : ${gardenName} ${plancheName}`)
    return p.id
  }
  const culture = (name: string) => {
    const c = db.culture_catalog.find(x => x.name === name)
    if (!c) throw new Error(`Culture démo inconnue : ${name}`)
    return c.id
  }

  // [jardin, planche, culture, semis (ou plantation d'un plant acheté), m², plant acheté]
  const P2027: [string, string, string, string, number, boolean?][] = [
    ['Jardin du Haut', 'PL 1', 'Cosmos', '2027-04-02', 6],
    ['Jardin du Haut', 'PL 1', 'Zinnia', '2027-04-12', 6],
    ['Jardin du Haut', 'PL 2', 'Dahlia', '2027-03-18', 12],
    ['Jardin du Haut', 'PL 4', 'Zinnia', '2027-05-14', 8],
    ['Parcelle du Verger', 'PL 4', 'Célosie à plumes', '2027-04-22', 5],
    // Serre froide PL 2 : 4 m² de renoncules d'automne jusqu'à fin mai 2027,
    // les plugs de lisianthus prennent les 5 m² restants
    ['Serre froide', 'PL 2', 'Lisianthus', '2027-03-15', 5, true],
    ['Serre froide', 'PL 3', 'Chrysanthème d’automne', '2027-05-06', 9],
    ['Bordure du Ruisseau', 'PL 4', 'Dahlia', '2027-04-02', 8],
  ]
  P2027.forEach(([g, pl, c, ds, m2, achat], i) => {
    db.plantings.push({
      id: `71000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, planche_id: planche(g, pl), culture_id: culture(c),
      season_id: SEASON_2027, surface_m2: m2, date_semis: ds, jours_cellule_override: 0, jours_champ_override: null,
      jours_recolte_override: null, rendement_override: null, prix_override: null, notes: null, created_at: now,
      achat_plant: !!achat, arrachee_le: null,
    })
  })
}
