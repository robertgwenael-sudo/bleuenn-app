import type { DemoDb } from '../data'

// [culture, date de semis de la plantation, date, tiges, raison, notes]
// Une perte sans plantation (date de semis null) est rattachée à la culture seule.
const PERTES: [string, string | null, string, number, string, string | null][] = [
  ['Renoncule', '2026-01-15', '2026-05-14', 18, 'abime', 'Tiges cassées au transport'],
  ['Pois de senteur', '2026-01-10', '2026-05-31', 35, 'invendu', 'Reste du marché, trop ouverts'],
  ['Ammi majus', '2026-02-20', '2026-06-16', 25, 'meteo', 'Grêle du 15 juin'],
  ['Gueule-de-loup (muflier)', '2026-02-10', '2026-06-24', 30, 'maladie', 'Rouille sur la planche 2'],
  ['Bleuet', '2026-03-06', '2026-07-02', 40, 'invendu', 'Fin de marché, bleuets fanés'],
  ['Cosmos', '2026-04-03', '2026-07-15', 22, 'ravageur', 'Pucerons noirs sur les boutons'],
  ['Zinnia', '2026-04-10', '2026-07-26', 45, 'invendu', 'Commande fleuriste réduite'],
  ['Tournesol', '2026-05-04', '2026-08-01', 28, 'meteo', 'Orage : tiges couchées'],
  ['Dahlia', '2026-03-20', '2026-08-14', 15, 'ravageur', 'Perce-oreilles dans les capitules'],
  ['Zinnia', '2026-05-15', '2026-09-05', 20, 'abime', 'Tiges pliées au seau'],
  ['Dahlia', '2026-04-01', '2026-09-22', 24, 'invendu', null],
  ['Tournesol', '2026-07-20', '2026-10-07', 12, 'abime', 'Pétales marqués'],
  ['Chrysanthème d’automne', '2026-05-05', '2026-11-01', 30, 'invendu', 'Après la Toussaint'],
  ['Dahlia', '2026-03-20', '2026-11-05', 20, 'meteo', 'Première gelée'],
  ['Chrysanthème d’automne', '2026-05-05', '2026-11-21', 26, 'meteo', 'Gel blanc, boutons brûlés'],
  ['Eucalyptus', null, '2026-11-19', 10, 'autre', 'Feuillage trop court pour les couronnes'],
]

/** Données de démo : pertes (récoltes déjà dans data.ts). Modifie la base en place. */
export function seed_reel(db: DemoDb & Record<string, any[]>): void {
  PERTES.forEach(([culture, semis, date, tiges, reason, notes], i) => {
    const c = db.culture_catalog.find((x: any) => x.name === culture)
    if (!c) throw new Error(`Culture démo inconnue : ${culture}`)
    const p = semis ? db.plantings.find((x: any) => x.culture_id === c.id && x.date_semis === semis) : null
    if (semis && !p) throw new Error(`Plantation démo inconnue : ${culture} ${semis}`)
    db.losses.push({
      id: `c1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      season_id: p?.season_id ?? db.seasons.find((s: any) => s.is_active)?.id,
      planting_id: p?.id ?? null, culture_id: c.id, date, tiges, reason, notes,
      created_at: `${date}T18:00:00Z`,
    })
  })
}
