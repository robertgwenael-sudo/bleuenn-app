import type { DemoDb } from '../data'
import { seed_ferme } from './ferme'
import { seed_commercial } from './commercial'
import { seed_reel } from './reel'
import { seed_taches } from './taches'

/** Tables ajoutées par les migrations 005 et 006, vides par défaut. */
export function extendDemoDb(db: DemoDb) {
  const x = Object.assign(db, {
    farms: [] as any[], farm_members: [] as any[], clients: [] as any[], orders: [] as any[],
    order_lines: [] as any[], sale_lines: [] as any[], losses: [] as any[], tasks: [] as any[],
  })
  seed_ferme(x); seed_commercial(x); seed_reel(x); seed_taches(x)
  return x
}
