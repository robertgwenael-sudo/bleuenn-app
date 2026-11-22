// ============================================================
// Données FICTIVES du mode démo (NEXT_PUBLIC_DEMO=1).
// Aucune de ces personnes ni fermes n'existe. Rien n'est écrit en base.
// ============================================================

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_TEAMMATE_ID = '00000000-0000-4000-8000-000000000002'
export const DEMO_EMAIL = 'demo@bleuenn.exemple'

export const SEASON_2026 = '10000000-0000-4000-8000-000000002026'
export const SEASON_2025 = '10000000-0000-4000-8000-000000002025'

type Row = Record<string, any>

let n = 0
const id = (prefix: string) => {
  n += 1
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
}

// [nom, type, j.cellule, j.champ, j.récolte, rendement/plant, prix/tige, t° germ., pincer, filet, couvre-sol, semis direct, espacement cm, rangs, graines/plant, notes]
type Cat = [string, 'RR' | 'MP' | 'RU', number, number, number, number, number, number | null, boolean, boolean, boolean, boolean, number, number, number, string | null]
const CATALOG: Cat[] = [
  // Vivaces (013) : jours au champ ignorés (0), la récolte suit le début de floraison (FLORAISON ci-dessous)
  ['Achillée', 'RR', 30, 0, 21, 5, 0.7, 20, false, false, true, false, 30, 3, 2, 'Vivace : récolter quand 80 % des fleurs sont ouvertes'],
  ['Ancolie', 'MP', 0, 0, 21, 3, 0.85, 20, false, false, true, false, 23, 5, 2, 'Vivace, stratification au froid avant semis'],
  ['Anémone', 'RR', 0, 120, 56, 3, 0.8, 10, false, false, false, false, 20, 5, 1, 'Griffes trempées, plantées début novembre sous abri'],
  ['Ammi majus', 'MP', 28, 80, 28, 5, 0.7, 18, true, true, false, false, 30, 3, 2, 'Supporte un semis d’automne sous voile'],
  ['Amarante queue-de-renard', 'MP', 21, 70, 28, 2, 0.9, 22, false, true, false, false, 30, 3, 2, null],
  ['Bleuet', 'RR', 21, 70, 35, 8, 0.4, 16, true, false, false, true, 20, 4, 1, 'Couper au stade bouton à peine ouvert'],
  ['Célosie à plumes', 'MP', 23, 72, 21, 2, 0.8, 22, true, false, true, false, 20, 5, 3, 'Pincer à 20 cm pour plus de tiges'],
  ['Chrysanthème d’automne', 'RU', 35, 150, 49, 3, 1.4, 20, true, true, false, false, 40, 2, 1, 'Boutures de mai, filet indispensable'],
  ['Cosmos', 'RR', 21, 65, 63, 12, 0.5, 21, true, true, false, false, 30, 3, 2, 'Couper au stade « soucoupe »'],
  ['Dahlia', 'RR', 30, 120, 84, 10, 1.2, 18, true, true, true, false, 45, 2, 1, 'Tubercules démarrés en caisse'],
  ['Eucalyptus', 'RU', 42, 160, 21, 4, 1.0, 22, false, false, false, false, 50, 2, 3, 'Feuillage de bouquet'],
  ['Gomphréna', 'MP', 28, 80, 49, 6, 0.6, 24, false, false, true, false, 25, 4, 2, 'Se sèche très bien'],
  ['Gueule-de-loup (muflier)', 'MP', 35, 90, 35, 3, 0.9, 20, true, true, false, false, 20, 5, 3, 'Variétés de groupe 2 et 3'],
  ['Lisianthus', 'RU', 60, 100, 28, 1, 1.8, 22, false, true, false, false, 15, 6, 2, 'Semis très lent, patience'],
  ['Nigelle', 'RU', 0, 85, 21, 2, 0.5, 15, false, false, false, true, 15, 6, 3, 'Capsules séchées en fin de saison'],
  ['Pois de senteur', 'MP', 28, 110, 42, 6, 0.8, 15, true, true, false, false, 15, 2, 1, 'Récolter tous les deux jours'],
  ['Renoncule', 'RU', 30, 120, 28, 4, 1.5, 12, false, false, false, false, 20, 4, 1, 'Griffes pré-germées'],
  ['Rudbeckia', 'RR', 28, 0, 49, 8, 0.6, 21, true, false, false, false, 35, 3, 2, null],
  ['Scabieuse', 'RR', 28, 80, 49, 8, 0.7, 20, false, false, false, false, 30, 3, 2, 'Les capsules se vendent aussi'],
  ['Statice', 'MP', 30, 80, 21, 3, 0.5, 20, false, false, true, false, 20, 5, 1, 'Sécher à l’envers après récolte'],
  ['Tournesol', 'RU', 0, 70, 14, 1, 1.0, 21, false, false, false, true, 20, 4, 1, 'Variétés sans pollen, semis échelonnés'],
  ['Verveine de Buenos Aires', 'RR', 42, 70, 70, 10, 0.4, 22, true, false, false, false, 40, 2, 2, null],
  ['Zinnia', 'RR', 21, 60, 56, 10, 0.6, 24, true, false, false, false, 30, 3, 2, 'Test du « tige qui ne plie pas »'],
  ['Feuillage de menthe', 'RR', 0, 60, 70, 8, 0.3, null, false, false, true, false, 30, 3, 1, 'Bouturage en godets'],
]

// Migration 013 : cycle (annuelle par défaut) et 1ère date d'implantation
// possible, reprises de la charte de culture quand elle les donne.
const CYCLE: Record<string, 'bisannuelle' | 'vivace'> = { 'Achillée': 'vivace', 'Ancolie': 'vivace', 'Rudbeckia': 'vivace' }
// DÉMO : début de floraison (jj/mm) et délai avant 1re floraison FICTIFS,
// plausibles mais absents de la charte de Marine. Achillée sans délai
// (« à confirmer »), Rudbeckia sans floraison (« à renseigner », hors
// prévisionnel) : les deux cas de données manquantes restent visibles.
const FLORAISON: Record<string, string> = { 'Achillée': '15/06', 'Ancolie': '15/05' }
const DELAI_FLORAISON: Record<string, number> = { 'Ancolie': 240 }
const IMPLANTATION: Record<string, string> = {
  'Ammi majus': '21/05', 'Amarante queue-de-renard': '28/05', 'Bleuet': '15/05', 'Célosie à plumes': '29/05',
  'Cosmos': '21/05', 'Dahlia': '15/05', 'Eucalyptus': '21/05', 'Gomphréna': '21/05', 'Gueule-de-loup (muflier)': '01/04',
  'Lisianthus': '21/05', 'Nigelle': '01/04', 'Pois de senteur': '15/04', 'Scabieuse': '01/04', 'Statice': '01/04',
  'Tournesol': '21/05', 'Zinnia': '21/05',
}

export function buildDemoDb() {
  n = 0
  const now = '2026-01-04T09:00:00Z'

  const profiles: Row[] = [
    { id: DEMO_USER_ID, email: DEMO_EMAIL, farm_name: 'Les Jardins de Bleuenn', owner_name: 'Nolwenn Kerjean', created_at: now },
    { id: DEMO_TEAMMATE_ID, email: 'erwan.tanguy@exemple.fr', farm_name: 'Ma Ferme Florale', owner_name: 'Erwan Tanguy', created_at: now },
  ]

  const seasons: Row[] = [
    { id: SEASON_2025, user_id: DEMO_USER_ID, name: 'Saison 2025', year: 2025, revenue_goal: 12000, is_active: false, invite_token: '20000000-0000-4000-8000-000000000025', invite_enabled: false, created_at: '2025-01-03T09:00:00Z' },
    { id: SEASON_2026, user_id: DEMO_USER_ID, name: 'Saison 2026', year: 2026, revenue_goal: 18000, is_active: true, invite_token: '20000000-0000-4000-8000-000000000026', invite_enabled: true, created_at: now },
  ]

  const team_members: Row[] = [
    { id: id('30000000'), season_id: SEASON_2025, user_id: DEMO_USER_ID, role: 'owner', joined_at: '2025-01-03T09:00:00Z' },
    { id: id('30000000'), season_id: SEASON_2026, user_id: DEMO_USER_ID, role: 'owner', joined_at: now },
    { id: id('30000000'), season_id: SEASON_2026, user_id: DEMO_TEAMMATE_ID, role: 'member', joined_at: '2026-02-12T10:30:00Z' },
  ]

  const culture_catalog: Row[] = CATALOG.map(c => ({
    id: id('40000000'), user_id: null, name: c[0], type: c[1], jours_cellule: c[2], jours_champ: c[3], jours_recolte: c[4],
    rendement_plant: c[5], prix_tige: c[6], temp_germination: c[7], pincer: c[8], filet: c[9], couvre_sol: c[10],
    semis_direct: c[11], espacement_cm: c[12], rangs_par_planche: c[13], graines_par_plant: c[14], notes: c[15], created_at: now,
    cycle: CYCLE[c[0]] ?? 'annuelle', premiere_implantation: IMPLANTATION[c[0]] ?? null,
    debut_floraison: FLORAISON[c[0]] ?? null, delai_premiere_floraison_jours: DELAI_FLORAISON[c[0]] ?? null,
  }))
  const cat = (name: string) => {
    const c = culture_catalog.find(x => x.name === name)
    if (!c) throw new Error(`Culture démo inconnue : ${name}`)
    return c.id
  }

  // Jardins et planches
  const GARDENS: [string, number, string, number[]][] = [
    ['Jardin du Haut', 220, 'Plein sud, sol limoneux — fleurs à récolte répétée', [12, 12, 12, 12, 10, 10]],
    ['Parcelle du Verger', 160, 'Entre les pommiers, mi-ombre l’après-midi', [10, 10, 10, 10, 8]],
    ['Serre froide', 90, 'Tunnel de 30 m, cultures précoces et d’automne', [9, 9, 9, 9]],
    ['Bordure du Ruisseau', 120, 'Sol frais, vivaces et feuillages', [10, 10, 8, 8, 8]],
  ]
  const gardens: Row[] = []
  const planches: Row[] = []
  GARDENS.forEach(([name, m2, description, pls], gi) => {
    const g = { id: id('50000000'), user_id: DEMO_USER_ID, season_id: SEASON_2026, name, surface_m2: m2, description, sort_order: gi, created_at: now }
    gardens.push(g)
    pls.forEach((pm2, pi) => {
      planches.push({ id: id('60000000'), garden_id: g.id, name: `PL ${pi + 1}`, surface_m2: pm2, sort_order: pi, created_at: now })
    })
  })
  const pl = (gi: number, pi: number) => planches.filter(p => p.garden_id === gardens[gi].id)[pi].id

  // [jardin, planche, culture, date de semis, surface m²]
  // Une date de semis antérieure à 2026 rattache la plantation à la saison 2025.
  // Surfaces vérifiées par plantations-demo.test.ts : aucune planche en conflit.
  const PLANTINGS: [number, number, string, string, number][] = [
    // Jardin du Haut
    [0, 0, 'Zinnia', '2026-04-10', 6], [0, 0, 'Cosmos', '2026-04-03', 6],
    [0, 1, 'Dahlia', '2026-03-20', 12],
    [0, 2, 'Cosmos', '2026-05-02', 6], [0, 2, 'Bleuet', '2026-03-06', 6],
    [0, 3, 'Zinnia', '2026-05-15', 8], [0, 3, 'Gomphréna', '2026-04-08', 4],
    [0, 4, 'Rudbeckia', '2026-03-28', 5], [0, 4, 'Scabieuse', '2026-03-20', 5],
    [0, 5, 'Tournesol', '2026-05-04', 5], [0, 5, 'Tournesol', '2026-07-20', 5],
    // Parcelle du Verger
    [1, 0, 'Ammi majus', '2026-02-20', 5], [1, 0, 'Ammi majus', '2026-10-30', 5],
    [1, 1, 'Gueule-de-loup (muflier)', '2026-02-10', 5], [1, 1, 'Gueule-de-loup (muflier)', '2026-09-18', 5],
    [1, 2, 'Statice', '2026-03-01', 5], [1, 2, 'Célosie à plumes', '2026-04-20', 5],
    [1, 3, 'Amarante queue-de-renard', '2026-04-15', 5], [1, 3, 'Verveine de Buenos Aires', '2026-02-25', 5],
    [1, 4, 'Nigelle', '2026-03-15', 4], [1, 4, 'Nigelle', '2026-12-02', 4],
    // Serre froide
    [2, 0, 'Renoncule', '2026-01-15', 4.5], [2, 0, 'Renoncule', '2026-12-08', 4.5],
    [2, 1, 'Lisianthus', '2026-01-20', 9],
    [2, 2, 'Chrysanthème d’automne', '2026-05-05', 9],
    [2, 3, 'Pois de senteur', '2026-01-10', 4.5], [2, 3, 'Pois de senteur', '2026-11-26', 4.5],
    // Anémones : griffes plantées début novembre sous abri, à côté des pois de senteur
    [2, 3, 'Anémone', '2026-11-01', 4.5],
    // Bordure du Ruisseau
    // Vivaces en place depuis 2025 : achillée (fleurit chaque juin), ancolie (chaque mai)
    [3, 0, 'Achillée', '2025-06-01', 5], [3, 0, 'Feuillage de menthe', '2026-04-01', 5],
    [3, 2, 'Ancolie', '2025-05-15', 4],
    [3, 1, 'Eucalyptus', '2026-02-05', 10],
    [3, 2, 'Scabieuse', '2026-04-12', 4], [3, 2, 'Bleuet', '2026-10-12', 4],
    [3, 3, 'Dahlia', '2026-04-01', 8],
    [3, 4, 'Cosmos', '2026-06-01', 4], [3, 4, 'Zinnia', '2026-06-10', 4],
    // Successions
    [0, 2, 'Bleuet', '2026-10-05', 6],
    [0, 4, 'Ammi majus', '2026-11-05', 4],
    [1, 2, 'Gueule-de-loup (muflier)', '2026-11-12', 5],
    [2, 1, 'Renoncule', '2026-11-30', 4],
  ]
  const plantings: Row[] = PLANTINGS.map(([gi, pi, c, ds, m2]) => ({
    id: id('70000000'), planche_id: pl(gi, pi), culture_id: cat(c), season_id: ds < '2026' ? SEASON_2025 : SEASON_2026,
    surface_m2: m2, date_semis: ds, jours_cellule_override: 0, jours_champ_override: null,
    jours_recolte_override: null, rendement_override: null, prix_override: null, notes: null, created_at: now,
    achat_plant: false, arrachee_le: null,
  }))
  const plantingOf = (culture: string, ds: string) => {
    const cid = cat(culture)
    const p = plantings.find(x => x.culture_id === cid && x.date_semis === ds)
    if (!p) throw new Error(`Plantation démo inconnue : ${culture} ${ds}`)
    return p.id
  }

  // Récoltes (dont quelques-unes cette semaine et ce mois-ci)
  const HARVESTS: [string, string, string, number, 'A' | 'B' | 'C', string | null][] = [
    ['Renoncule', '2026-01-15', '2026-05-12', 140, 'A', 'Premiers boutons, tiges longues'],
    ['Pois de senteur', '2026-01-10', '2026-05-28', 220, 'A', null],
    ['Ammi majus', '2026-02-20', '2026-06-18', 180, 'A', null],
    ['Gueule-de-loup (muflier)', '2026-02-10', '2026-06-22', 160, 'B', 'Quelques tiges courbées'],
    ['Bleuet', '2026-03-06', '2026-06-30', 260, 'A', null],
    ['Cosmos', '2026-04-03', '2026-07-14', 310, 'A', 'Mariage du 18 juillet'],
    ['Zinnia', '2026-04-10', '2026-07-24', 280, 'A', null],
    ['Dahlia', '2026-03-20', '2026-08-12', 120, 'A', 'Café au lait magnifiques'],
    ['Tournesol', '2026-05-04', '2026-08-02', 90, 'B', 'Orage de la veille'],
    ['Zinnia', '2026-05-15', '2026-09-03', 240, 'A', null],
    ['Dahlia', '2026-04-01', '2026-09-20', 150, 'A', null],
    ['Tournesol', '2026-07-20', '2026-10-06', 70, 'A', null],
    ['Chrysanthème d’automne', '2026-05-05', '2026-10-28', 95, 'A', 'Premiers pompons'],
    ['Dahlia', '2026-03-20', '2026-11-04', 85, 'B', 'Fin de floraison, tiges plus courtes'],
    ['Chrysanthème d’automne', '2026-05-05', '2026-11-12', 130, 'A', null],
    ['Chrysanthème d’automne', '2026-05-05', '2026-11-17', 110, 'A', 'Commande fleuriste Morlaix'],
    ['Eucalyptus', '2026-02-05', '2026-11-19', 60, 'B', 'Feuillage pour couronnes'],
    ['Chrysanthème d’automne', '2026-05-05', '2026-11-20', 75, 'C', 'Gel blanc la nuit précédente'],
  ]
  const harvests: Row[] = HARVESTS.map(([c, ds, date, tiges, quality, notes]) => ({
    id: id('80000000'), planting_id: plantingOf(c, ds), season_id: SEASON_2026, date, tiges, quality, notes, created_at: now,
  }))

  // Ventes
  const SALES: [string, string, string, number, number, string | null][] = [
    ['2026-05-16', 'Marché', 'Renoncule, Pois de senteur', 180, 1.6, 'Marché de Landerneau'],
    ['2026-05-30', 'Fleuriste', 'Pois de senteur', 150, 1.1, 'Atelier Pétale'],
    ['2026-06-13', 'Marché', 'Ammi, Bleuet, Muflier', 260, 1.2, 'Marché de Landerneau'],
    ['2026-06-20', 'Abonnements', 'Bouquets champêtres', 120, 1.5, '12 abonnés'],
    ['2026-07-04', 'Mariage', 'Cosmos, Ammi, Zinnia', 420, 1.4, 'Mariage Le Bris'],
    ['2026-07-11', 'Marché', 'Cosmos, Zinnia', 340, 1.1, 'Marché de Landerneau'],
    ['2026-07-18', 'Mariage', 'Cosmos, Dahlia', 380, 1.5, 'Mariage Quéré-Morvan'],
    ['2026-07-25', 'Fleuriste', 'Zinnia, Cosmos', 300, 0.9, 'Atelier Pétale'],
    ['2026-08-08', 'Abonnements', 'Bouquets d’été', 150, 1.5, '15 abonnés'],
    ['2026-08-15', 'Marché', 'Dahlia, Tournesol', 280, 1.3, 'Marché de Landerneau'],
    ['2026-08-29', 'Mariage', 'Dahlia, Zinnia, Amarante', 460, 1.6, 'Mariage Guivarc’h'],
    ['2026-09-12', 'Fleuriste', 'Dahlia', 240, 1.4, 'Fleurs de Lin, Morlaix'],
    ['2026-09-26', 'Marché', 'Zinnia, Dahlia, Célosie', 300, 1.2, 'Marché de Landerneau'],
    ['2026-10-10', 'Abonnements', 'Bouquets d’automne', 140, 1.6, '14 abonnés'],
    ['2026-10-31', 'Deuil', 'Chrysanthème', 160, 1.8, 'Pompes funèbres du Léon'],
    ['2026-11-07', 'Fleuriste', 'Chrysanthème, Dahlia', 180, 1.5, 'Fleurs de Lin, Morlaix'],
    ['2026-11-14', 'Deuil', 'Chrysanthème, Eucalyptus', 120, 1.9, null],
    ['2026-11-21', 'Marché', 'Chrysanthème, Eucalyptus', 140, 1.4, 'Marché de Noël anticipé'],
  ]
  const sales: Row[] = SALES.map(([date, channel, cultures_sold, tiges, prix_unitaire, client]) => ({
    id: id('90000000'), season_id: SEASON_2026, user_id: DEMO_USER_ID, date, channel, cultures_sold, tiges,
    prix_unitaire, total: Math.round(tiges * prix_unitaire * 100) / 100, client, notes: null, created_at: now,
  }))

  const seed_orders: Row[] = [
    ['Cosmos', 900, 1000, 'Semences du Léon', true, true],
    ['Zinnia', 1100, 1000, 'Semences du Léon', true, true],
    ['Dahlia', 0, 0, 'Tubercules Ar Men', false, false],
    ['Gueule-de-loup (muflier)', 600, 500, 'Graineterie des Monts', false, true],
    ['Lisianthus', 0, 800, 'Graineterie des Monts', false, false],
    ['Bleuet', 400, 0, '', true, false],
  ].map(([culture_name, graines_needed, graines_ordered, supplier, bio, received]) => ({
    id: id('a0000000'), season_id: SEASON_2026, user_id: DEMO_USER_ID, culture_name, graines_needed, graines_ordered,
    supplier, bio, received, created_at: now,
  }))

  const pending_invites: Row[] = [
    { id: id('b0000000'), season_id: SEASON_2026, email: 'gwen.saisonniere@exemple.fr', invited_by: DEMO_USER_ID, created_at: '2026-11-02T08:00:00Z' },
  ]

  return { profiles, seasons, team_members, culture_catalog, gardens, planches, plantings, harvests, sales, seed_orders, pending_invites }
}

export type DemoDb = ReturnType<typeof buildDemoDb>
export type DemoDbFull = ReturnType<typeof import('./seeds').extendDemoDb>
