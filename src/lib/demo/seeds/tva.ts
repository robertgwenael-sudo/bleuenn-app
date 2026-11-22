import { type DemoDb } from '../data'

// ============================================================
// TVA en mode démo (migration 014) : taux de la ferme, catégorie des
// lignes déjà saisies, numéros des bons de commande, et les équivalents en
// mémoire des triggers ligne_set_tva et order_set_numero (utilisés par client.ts).
// ============================================================

type Row = Record<string, any>
type Db = Record<string, any[]>
type Err = { message: string; code?: string }

const rid = (n: number) => `c5000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const TAUX_DEMO = { nonTravaillee: rid(1), travaillee: rid(2) }

const fermeDeSaison = (db: Db, seasonId: string) => db.seasons.find(s => s.id === seasonId)?.farm_id as string | undefined

/** Trigger ligne_set_tva : taux recopié de la catégorie, même ferme, catégorie active. */
export function ligneSetTvaDemo(db: Db, row: Row, ancienne: Row | null): Err | null {
  if (!row.vat_rate_id) { row.taux_tva_pb = null; return null }
  if (ancienne && ancienne.vat_rate_id === row.vat_rate_id) { row.taux_tva_pb = ancienne.taux_tva_pb; return null }
  const r = db.farm_vat_rates.find(x => x.id === row.vat_rate_id)
  if (!r || r.farm_id !== fermeDeSaison(db, row.season_id)) return { code: 'P0001', message: `Catégorie de TVA ${row.vat_rate_id} introuvable pour cette ferme` }
  if (!r.actif) return { code: 'P0001', message: `Catégorie de TVA « ${r.libelle} » désactivée` }
  row.taux_tva_pb = r.taux_pb
  return null
}

/** Trigger order_set_numero : « BC2026-0007 », par ferme et par année. */
export function numeroCommandeDemo(db: Db, row: Row, annee: number): void {
  const farm = fermeDeSaison(db, row.season_id)
  db.order_counters ??= []
  let c = db.order_counters.find(x => x.farm_id === farm && x.year === annee)
  if (!c) { c = { farm_id: farm, year: annee, last_number: 0 }; db.order_counters.push(c) }
  c.last_number += 1
  row.numero = `BC${annee}-${String(c.last_number).padStart(4, '0')}`
}

/**
 * Données : les deux taux pré-remplis par la migration (valeurs de
 * paramétrage, modifiables dans les réglages), une catégorie sur chaque
 * ligne existante (compositions et bouquets en « travaillée »), numéros de
 * bons de commande.
 */
export function seed_tva(db: DemoDb & Record<string, any[]>): void {
  const x = db as unknown as Db
  x.order_counters ??= []
  const farmId = x.farms[0]?.id
  if (!farmId) return
  x.farm_vat_rates.push(
    { id: TAUX_DEMO.nonTravaillee, farm_id: farmId, categorie: 'non_travaillee', libelle: 'Fleur non travaillée', taux_pb: 1000, actif: true, ordre: 1, created_at: '2026-01-04T09:00:00Z' },
    { id: TAUX_DEMO.travaillee, farm_id: farmId, categorie: 'travaillee', libelle: 'Fleur travaillée', taux_pb: 2000, actif: true, ordre: 2, created_at: '2026-01-04T09:00:00Z' },
  )
  const compose = (l: Row) => l.unit === 'bouquet' || (l.unit === 'autre' && !l.culture_id)
  for (const l of [...x.sale_lines, ...x.order_lines]) {
    l.vat_rate_id = compose(l) ? TAUX_DEMO.travaillee : TAUX_DEMO.nonTravaillee
    l.taux_tva_pb = compose(l) ? 2000 : 1000
  }
  const commandes = [...x.orders].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  for (const o of commandes) numeroCommandeDemo(x, o, Number(String(o.created_at).slice(0, 4)))
}
