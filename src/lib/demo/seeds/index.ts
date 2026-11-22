import { type DemoDb, DEMO_USER_ID, DEMO_TEAMMATE_ID } from '../data'
import { seed_ferme } from './ferme'
import { seed_commercial } from './commercial'
import { seed_reel } from './reel'
import { seed_taches } from './taches'
import { seed_couts } from './couts'
import { seed_journal } from './journal'
import { seed_factures } from './factures'
import { seed_achats } from './achats'
import { seed_gestion } from './gestion'
import { seed_saisons } from './saisons'

/** Tables ajoutées par les migrations 005 et 006, vides par défaut. */
export function extendDemoDb(db: DemoDb) {
  const x = Object.assign(db, {
    farms: [] as any[], farm_members: [] as any[], clients: [] as any[], orders: [] as any[],
    order_lines: [] as any[], sale_lines: [] as any[], losses: [] as any[], tasks: [] as any[],
    costs: [] as any[], time_entries: [] as any[],
    journal_entries: [] as any[], treatments: [] as any[],
    farm_billing: [] as any[], invoice_counters: [] as any[], invoices: [] as any[], invoice_lines: [] as any[], payments: [] as any[],
    suppliers: [] as any[], purchase_orders: [] as any[], purchase_order_lines: [] as any[],
    // Migration 012 (gestion)
    receipts: [] as any[], receipt_pages: [] as any[], bank_accounts: [] as any[], bank_imports: [] as any[],
    bank_transactions: [] as any[], bank_matches: [] as any[],
  })
  // Migration 006 : une ferme permanente, saisons et jardins rattachés
  const FARM = '30000000-0000-4000-8000-000000000001'
  x.farms.push({ id: FARM, name: 'Les Jardins de Bleuenn', created_by: DEMO_USER_ID, created_at: '2025-01-03T09:00:00Z' })
  for (const m of [{ user_id: DEMO_USER_ID, role: 'owner' }, { user_id: DEMO_TEAMMATE_ID, role: 'member' }])
    x.farm_members.push({ id: `31000000-0000-4000-8000-${m.user_id.slice(-12)}`, farm_id: FARM, ...m, joined_at: '2025-01-03T09:00:00Z' })
  for (const s of x.seasons) s.farm_id = FARM
  for (const g of x.gardens) g.farm_id = FARM

  seed_ferme(x); seed_commercial(x); seed_reel(x); seed_taches(x); seed_couts(x); seed_journal(x); seed_factures(x); seed_achats(x); seed_gestion(x)
  seed_saisons(x) // 016 : en dernier, reclasse les plantations (et leurs tâches) par année de récolte
  return x
}
