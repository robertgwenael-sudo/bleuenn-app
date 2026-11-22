// ============================================================
// Faux client Supabase en mémoire — mode démo uniquement.
// Reproduit ce qu'utilisent useBleuenn.ts et les pages :
//   auth.getUser / getSession / onAuthStateChange / signInWithPassword /
//   signUp / resetPasswordForEmail / updateUser / signOut
//   from(t).select/insert/update/delete + eq/neq/in/or/is/gte/lte/order/limit/range/single/maybeSingle
//   rpc('season_team' | 'join_season_by_token' | 'invite_by_email' | 'farm_team' | 'duplicate_season_plan')
//   storage.from('journal').upload / createSignedUrl / remove (images en blob: URL, migration 009)
//   storage.from('justificatifs') : idem (migration 012)
// ainsi que les triggers (calc_planting_dates, propagate_catalog_changes,
// add_season_owner, colonne générée sales.total) et la vue plantings_full
// (migration 002), avec les mêmes formules.
// Aucune requête réseau, aucune écriture hors de la mémoire du navigateur.
// ============================================================
import { extendDemoDb } from './seeds'
import { buildDemoDb, DEMO_USER_ID, DEMO_EMAIL, type DemoDb } from './data'
import { recalculerVenteDemo, totalLigneDemo } from './seeds/commercial'
import { OBJETS_JOURNAL_DEMO } from './seeds/journal'
import { emettreAvoirDemo, emettreFactureDemo, enregistrerPaiementDemo, invoicesStatusDemo, refusFacturesDemo } from './seeds/factures'
import { rpcAchatsDemo, refusSuppressionAchats } from './seeds/achats'
import { aujourdhuiParisISO } from '../types'
import {
  DEFAULTS_GESTION, OBJETS_JUSTIFICATIFS_DEMO, TABLES_GESTION, filtreFermeGestion, gestionApresSuppression, gestionAvantEcriture,
  gestionAvantSuppression, rpcGestionDemo,
} from './seeds/gestion'

type Row = Record<string, any>
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null; status?: number }

/** Réseau coupé dans le navigateur (mode démo seulement). */
function horsLigneDemo(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
const ERREUR_RESEAU_DEMO: Result = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 }

const SESSION_KEY = 'bleuenn-demo-session'
const LATENCY = 180

let db: DemoDb | null = null
const getDb = (): DemoDb => {
  if (!db) {
    db = extendDemoDb(buildDemoDb())
    // Les plantations de démonstration passent par le même « trigger » que les insertions
    db.plantings.forEach(calcPlanting)
  }
  return db
}

const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))

const wait = (ms = LATENCY) => new Promise(r => setTimeout(r, ms))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

// ─── Dates (type date PostgreSQL : AAAA-MM-JJ, sans fuseau) ─────
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const coalesce = (...v: any[]) => v.find(x => x !== null && x !== undefined) ?? null
const nullif0 = (v: any) => (v === 0 ? null : v)

// ─── Trigger calc_planting_dates (migration 002) ─────────────────
function calcPlanting(p: Row) {
  const d = getDb()
  const cat = d.culture_catalog.find(c => c.id === p.culture_id) || {}
  const jCellule = coalesce(nullif0(p.jours_cellule_override), cat.jours_cellule, 0)
  const jChamp = coalesce(p.jours_champ_override, cat.jours_champ)
  const jRecolte = coalesce(p.jours_recolte_override, cat.jours_recolte, 21)
  const rend = coalesce(p.rendement_override, cat.rendement_plant, 1)
  const prix = coalesce(p.prix_override, cat.prix_tige, 0.5)
  const surface = Number(p.surface_m2)
  const espacement = coalesce(cat.espacement_cm, 20)

  p.date_plantation = addDays(p.date_semis, jCellule)
  p.date_recolte = addDays(p.date_plantation, jChamp)
  p.date_fin = addDays(p.date_recolte, jRecolte)

  let plants = Math.max(1, Math.floor((surface * 10000) / (espacement * espacement)))
  if (plants > surface * 50) plants = Math.round(surface * 25)
  p.plants_count = plants
  p.tiges_estimees = Math.round(plants * rend * 0.7)
  p.revenu_estime = Math.round(p.tiges_estimees * prix * 100) / 100
  p.graines_necessaires = Math.ceil(plants * 1.3 * coalesce(cat.graines_par_plant, 1))
}

// ─── Vue plantings_full (dates recalculées depuis le catalogue) ──
function plantingsFull(): Row[] {
  const d = getDb()
  const out: Row[] = []
  for (const p of d.plantings) {
    const c = d.culture_catalog.find(x => x.id === p.culture_id)
    const pl = d.planches.find(x => x.id === p.planche_id)
    const g = pl && d.gardens.find(x => x.id === pl.garden_id)
    const s = d.seasons.find(x => x.id === p.season_id)
    if (!c || !pl || !g || !s) continue // jointures internes
    const jc = coalesce(nullif0(p.jours_cellule_override), c.jours_cellule, 0)
    const jch = coalesce(p.jours_champ_override, c.jours_champ)
    const jr = coalesce(p.jours_recolte_override, c.jours_recolte, 21)
    const datePlantation = addDays(p.date_semis, jc)
    const dateRecolte = addDays(datePlantation, jch)
    out.push({
      id: p.id, planche_id: p.planche_id, culture_id: p.culture_id, season_id: p.season_id,
      surface_m2: p.surface_m2, date_semis: p.date_semis,
      date_plantation: datePlantation, date_recolte: dateRecolte, date_fin: addDays(dateRecolte, jr),
      plants_count: p.plants_count, tiges_estimees: p.tiges_estimees, revenu_estime: p.revenu_estime,
      graines_necessaires: p.graines_necessaires,
      jours_cellule_override: p.jours_cellule_override, jours_champ_override: p.jours_champ_override,
      jours_recolte_override: p.jours_recolte_override, rendement_override: p.rendement_override,
      prix_override: p.prix_override,
      planting_m2: p.surface_m2, planting_notes: p.notes,
      culture_name: c.name, culture_type: c.type,
      jours_cellule: jc, jours_champ: jch, jours_recolte: jr,
      rendement: coalesce(p.rendement_override, c.rendement_plant),
      prix_tige: coalesce(p.prix_override, c.prix_tige),
      temp_germination: c.temp_germination, pincer: c.pincer, filet: c.filet, couvre_sol: c.couvre_sol,
      semis_direct: c.semis_direct, espacement_cm: c.espacement_cm, rangs_par_planche: c.rangs_par_planche,
      graines_par_plant: c.graines_par_plant,
      planche_name: pl.name, planche_m2: pl.surface_m2,
      garden_name: g.name, garden_id: g.id, garden_m2: g.surface_m2,
      user_id: s.user_id,
      farm_id: g.farm_id ?? s.farm_id, season_name: s.name, season_year: s.year,  // migration 006
    })
  }
  return out
}

// ─── Vue planting_actuals (migration 005) : réel cumulé par plantation ──
function plantingActuals(): Row[] {
  const d = getDb() as any
  return d.plantings.map((p: Row) => {
    const hs = d.harvests.filter((h: Row) => h.planting_id === p.id)
    const ls = (d.losses || []).filter((l: Row) => l.planting_id === p.id)
    const dates = hs.map((h: Row) => h.date).sort()
    return {
      planting_id: p.id, season_id: p.season_id,
      tiges_recoltees: hs.reduce((s: number, h: Row) => s + h.tiges, 0),
      tiges_perdues: ls.reduce((s: number, l: Row) => s + l.tiges, 0),
      nb_recoltes: hs.length ? hs.length : null,
      premiere_recolte: dates[0] ?? null, derniere_recolte: dates[dates.length - 1] ?? null,
    }
  })
}

// ─── Valeurs par défaut des tables (001_schema.sql) ──────────────
const DEFAULTS: Record<string, Row> = {
  seasons: { revenue_goal: 15000, is_active: false, invite_enabled: false },
  culture_catalog: { jours_cellule: 0, jours_recolte: 21, rendement_plant: 1, prix_tige: 0.5, pincer: false, filet: false, couvre_sol: false, semis_direct: false, espacement_cm: 20, rangs_par_planche: 5, graines_par_plant: 1, notes: null, temp_germination: null },
  gardens: { sort_order: 0, description: null },
  planches: { sort_order: 0 },
  plantings: { surface_m2: 1, jours_cellule_override: 0, jours_champ_override: null, jours_recolte_override: null, rendement_override: null, prix_override: null, notes: null },
  harvests: { quality: 'A', notes: null },
  sales: { client: null, notes: null },
  seed_orders: { graines_needed: 0, graines_ordered: 0, supplier: null, bio: false, received: false },
  team_members: { role: 'member' },
  // Migration 005 (commercial)
  clients: { kind: 'particulier', contact_name: null, email: null, phone: null, address: null, notes: null, archived_at: null },
  orders: { status: 'confirmee', channel: null, notes: null, sale_id: null, client_id: null },
  sale_lines: { culture_id: null, unit: 'tige', stems_per_unit: 1 },
  order_lines: { culture_id: null, unit: 'tige', stems_per_unit: 1 },
  // Migration 008 (coûts)
  costs: { culture_id: null, planche_id: null, supplier: null, notes: null, purchase_order_id: null, purchase_order_line_id: null },
  time_entries: { kind: 'autre', culture_id: null, planche_id: null, notes: null },
  // Migration 009 (journal et registre des traitements)
  journal_entries: { season_id: null, kind: 'observation', body: null, planche_id: null, planting_id: null, culture_id: null, updated_at: null },
  journal_photos: { width: null, height: null },
  treatments: { season_id: null, amm: null, culture_id: null, culture_libelle: null, cible_type: 'autre', garden_id: null, planche_id: null, planting_id: null,
    lieu_libelle: null, ilot_pac: null, date_recolte_suivante: null, delai_avant_recolte_j: null, operateur_id: null, operateur_nom: null,
    vent: null, temperature_c: null, notes: null, updated_at: null },
  // Migration 010 (factures)
  farm_billing: { prefixe_facture: 'F', prefixe_avoir: 'AV' },
  // Migration 011 (achats)
  suppliers: { kind: 'semencier', contact_name: null, email: null, phone: null, website: null, address: null, customer_number: null,
    min_order_amount: null, free_shipping_threshold: null, lead_time_days: null, organic_certified: false, notes: null, archived_at: null },
  // Migration 012 (gestion)
  ...DEFAULTS_GESTION,
}

// Migration 009 : triggers journal_entries_set_farm, journal_photos_set_farm,
// treatments_set_farm (farm_id déduit des références, contrôle d'appartenance,
// libellés figés du registre) et policy « farm_id in my_farm_ids() ».
const TABLES_JOURNAL = new Set(['journal_entries', 'journal_photos', 'treatments'])
function journalSetFarm(t: string, row: Row, old: Row | null): { message: string; code?: string } | null {
  if (!TABLES_JOURNAL.has(t)) return null
  const d = getDb() as any
  const me = currentUser()?.id ?? null
  const err = (message: string, code = 'P0001') => ({ code, message })
  const mesFermes = new Set(d.farm_members.filter((m: Row) => m.user_id === me).map((m: Row) => m.farm_id))
  row.created_by ??= me
  if (t === 'journal_photos') {
    const e = d.journal_entries.find((x: Row) => x.id === row.entry_id)
    if (!e) return err(`Note ${row.entry_id} introuvable`)
    row.farm_id = e.farm_id
    if (!String(row.path).startsWith(`${e.farm_id}/${e.id}/`) || String(row.path).includes('..')) return err(`Chemin de photo invalide : ${row.path}`)
  } else {
    const change = (c: string) => !old || row[c] !== old[c]
    if (row.planting_id && change('planting_id')) {
      const p = d.plantings.find((x: Row) => x.id === row.planting_id)
      if (p) { row.planche_id ??= p.planche_id; row.culture_id ??= p.culture_id }
      if (p && (row.planche_id !== p.planche_id || row.culture_id !== p.culture_id)) return err(`La plantation ${row.planting_id} ne correspond pas à la planche ou à la culture indiquée`)
    }
    const planche = row.planche_id ? d.planches.find((x: Row) => x.id === row.planche_id) : null
    if (t === 'treatments' && planche) row.garden_id = planche.garden_id
    const fermeDeJardin = (gid: string | null) => d.gardens.find((g: Row) => g.id === gid)?.farm_id ?? null
    const ferme = d.seasons.find((s: Row) => s.id === row.season_id)?.farm_id
      ?? (planche ? fermeDeJardin(planche.garden_id) : null)
      ?? (row.planting_id ? d.seasons.find((s: Row) => s.id === d.plantings.find((p: Row) => p.id === row.planting_id)?.season_id)?.farm_id : null)
      ?? (t === 'treatments' ? fermeDeJardin(row.garden_id) : null)
    if (ferme) row.farm_id = ferme
    if (!row.farm_id) return err('Ferme introuvable : indiquez une saison, une planche ou la ferme')
    if (planche && fermeDeJardin(planche.garden_id) !== row.farm_id) return err(`Planche ${row.planche_id} hors de la ferme`)
    if (t === 'treatments') {
      const c = row.culture_id ? d.culture_catalog.find((x: Row) => x.id === row.culture_id) : null
      if (c && (!String(row.culture_libelle ?? '').trim() || (old && change('culture_id') && row.culture_libelle === old.culture_libelle))) row.culture_libelle = c.name
      if (!String(row.culture_libelle ?? '').trim()) return err('Culture traitée requise')
      const g = d.gardens.find((x: Row) => x.id === row.garden_id)
      if (g && (!String(row.lieu_libelle ?? '').trim() || (old && (change('planche_id') || change('garden_id')) && row.lieu_libelle === old.lieu_libelle))) {
        row.lieu_libelle = planche ? `${g.name} · ${planche.name}` : g.name
      }
      if (!String(row.lieu_libelle ?? '').trim()) return err('Localisation requise')
      if (row.operateur_id && change('operateur_id')) {
        if (!d.farm_members.some((m: Row) => m.farm_id === row.farm_id && m.user_id === row.operateur_id)) return err(`L'opérateur ${row.operateur_id} n'est pas membre de la ferme`)
        if (!String(row.operateur_nom ?? '').trim()) {
          const pr = d.profiles.find((x: Row) => x.id === row.operateur_id)
          row.operateur_nom = pr?.owner_name || pr?.email
        }
      }
      if (!String(row.operateur_nom ?? '').trim()) return err('Opérateur requis')
    }
    if (old) row.updated_at = new Date().toISOString()
  }
  if (!mesFermes.has(row.farm_id)) return err(`new row violates row-level security policy for table "${t}"`, '42501')
  return null
}

// Migration 011 : colonnes des bons réservées aux fonctions (privilèges de colonnes)
const COLONNES_BON_CLIENT = new Set(['season_id', 'supplier_id', 'expected_date', 'shipping_amount', 'notes'])

// Migration 008, trigger couts_set_farm : farm_id recopié de la saison, jamais du client
function coutsSetFarm(t: string, row: Row): { message: string; code?: string } | null {
  if (t !== 'costs' && t !== 'time_entries') return null
  const s = getDb().seasons.find(x => x.id === row.season_id)
  if (!s?.farm_id) return { code: 'P0001', message: `Saison ${row.season_id} introuvable` }
  row.farm_id = s.farm_id
  const me = currentUser()?.id ?? null
  row.created_by ??= me
  if (t === 'time_entries') row.user_id ??= me
  return null
}

function tableRows(table: string): Row[] {
  const d = getDb() as any
  if (table === 'plantings_full') return plantingsFull()
  if (table === 'planting_actuals') return plantingActuals()
  if (table === 'invoices_status') return invoicesStatusDemo(d)  // migration 010
  if (!d[table]) throw new Error(`Table inconnue en mode démo : ${table}`)
  if (TABLES_GESTION.has(table)) return filtreFermeGestion(d, table, currentUser()?.id)  // policies 012
  if (TABLES_JOURNAL.has(table)) {
    // Policy 009 : farm_id in my_farm_ids()
    const me = currentUser()?.id
    const fermes = new Set(d.farm_members.filter((m: Row) => m.user_id === me).map((m: Row) => m.farm_id))
    return d[table].filter((r: Row) => fermes.has(r.farm_id))
  }
  return d[table]
}

// Suppressions en cascade (ON DELETE CASCADE du schéma)
function cascadeDelete(table: string, removed: Row[]) {
  const d = getDb()
  const ids = new Set(removed.map(r => r.id))
  const drop = (t: keyof DemoDb, pred: (r: Row) => boolean) => {
    const gone = (d[t] as Row[]).filter(pred)
    ;(d as any)[t] = (d[t] as Row[]).filter(r => !pred(r))
    if (gone.length) cascadeDelete(t, gone)
  }
  if (table === 'gardens') drop('planches', r => ids.has(r.garden_id))
  if (table === 'planches') drop('plantings', r => ids.has(r.planche_id))
  if (table === 'plantings') drop('harvests', r => ids.has(r.planting_id))
  // Migration 006, trg_farm_member_sync : quitter la ferme retire de toutes ses saisons
  if (table === 'farm_members') {
    for (const fm of removed) {
      const sids = new Set(d.seasons.filter(s => s.farm_id === fm.farm_id).map(s => s.id))
      drop('team_members', r => sids.has(r.season_id) && r.user_id === fm.user_id)
    }
  }
  if (table === 'seasons') {
    drop('gardens', r => ids.has(r.season_id)); drop('team_members', r => ids.has(r.season_id))
    drop('sales', r => ids.has(r.season_id)); drop('seed_orders', r => ids.has(r.season_id))
    drop('costs' as keyof DemoDb, r => ids.has(r.season_id)); drop('time_entries' as keyof DemoDb, r => ids.has(r.season_id))
  }
  // Migration 008 : planche supprimée → planche_id à null
  if (table === 'planches') for (const t of ['costs', 'time_entries']) for (const r of (d as any)[t]) if (ids.has(r.planche_id)) r.planche_id = null
  // Migration 009 : journal et registre survivent aux suppressions en amont (libellés figés)
  const dj = d as any
  if (table === 'journal_entries') drop('journal_photos' as keyof DemoDb, r => ids.has(r.entry_id))
  for (const [src, col] of [['planches', 'planche_id'], ['plantings', 'planting_id'], ['seasons', 'season_id'], ['culture_catalog', 'culture_id'], ['gardens', 'garden_id']] as const) {
    if (table === src) for (const t of ['journal_entries', 'treatments']) for (const r of dj[t] ?? []) if (ids.has(r[col])) r[col] = null
  }
  // Migration 005 (commercial) : cascades et « on delete set null »
  const dx = d as any
  if (table === 'sales') {
    drop('sale_lines' as keyof DemoDb, r => ids.has(r.sale_id))
    for (const o of dx.orders) if (ids.has(o.sale_id)) o.sale_id = null
  }
  if (table === 'orders') {
    drop('order_lines' as keyof DemoDb, r => ids.has(r.order_id))
    for (const v of dx.sales) if (ids.has(v.order_id)) v.order_id = null
  }
  if (table === 'clients') {
    for (const t of ['orders', 'sales']) for (const r of dx[t]) if (ids.has(r.client_id)) r.client_id = null
  }
  if (table === 'sale_lines') new Set(removed.map(r => r.sale_id)).forEach(sid => recalculerVenteDemo(dx, sid))
  // Migration 011 : bons et lignes en cascade ; dépense et ligne gardent leur trace (set null)
  if (table === 'seasons') drop('purchase_orders' as keyof DemoDb, r => ids.has(r.season_id))
  if (table === 'purchase_orders') {
    drop('purchase_order_lines' as keyof DemoDb, r => ids.has(r.purchase_order_id))
    for (const c of dx.costs) if (ids.has(c.purchase_order_id)) c.purchase_order_id = null
  }
  if (table === 'seed_orders') for (const l of dx.purchase_order_lines) if (ids.has(l.seed_order_id)) l.seed_order_id = null
}

type Filter = (r: Row) => boolean

function parseOr(expr: string): Filter {
  // Forme simple : "col.eq.val,col2.ilike.*x*"
  const parts = expr.split(',').map(p => {
    const [col, op, ...rest] = p.split('.')
    const val = rest.join('.')
    return (r: Row) => {
      const v = r[col]
      if (op === 'eq') return String(v) === val
      if (op === 'neq') return String(v) !== val
      if (op === 'is') return val === 'null' ? v == null : String(v) === val
      if (op === 'ilike' || op === 'like') {
        const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', op === 'ilike' ? 'i' : '')
        return re.test(String(v ?? ''))
      }
      return false
    }
  })
  return r => parts.some(f => f(r))
}

class DemoQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null
  private conflict: string[] = []
  private payload: any = null
  private filters: Filter[] = []
  private orders: { col: string; asc: boolean }[] = []
  private cols = '*'
  private returning = false
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private max: number | null = null
  private skip = 0

  constructor(private table: string) {}

  select(cols = '*') {
    if (this.op === null) this.op = 'select'
    else this.returning = true
    this.cols = cols
    return this
  }
  insert(v: Row | Row[]) { this.op = 'insert'; this.payload = v; return this }
  update(v: Row) { this.op = 'update'; this.payload = v; return this }
  delete() { this.op = 'delete'; return this }
  /** upsert(v, { onConflict: 'a,b' }) : comme en SQL, une valeur null ne crée jamais de conflit. */
  upsert(v: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'; this.payload = v
    this.conflict = (opts?.onConflict ?? 'id').split(',').map(c => c.trim()).filter(Boolean)
    return this
  }
  eq(col: string, v: any) { this.filters.push(r => r[col] === v); return this }
  neq(col: string, v: any) { this.filters.push(r => r[col] !== v); return this }
  in(col: string, vs: any[]) { this.filters.push(r => vs.includes(r[col])); return this }
  is(col: string, v: any) { this.filters.push(r => (v === null ? r[col] == null : r[col] === v)); return this }
  // Exports : bornes de dates (comparaison de chaînes AAAA-MM-JJ, comme le type date) et pagination
  gte(col: string, v: any) { this.filters.push(r => r[col] != null && r[col] >= v); return this }
  lte(col: string, v: any) { this.filters.push(r => r[col] != null && r[col] <= v); return this }
  range(from: number, to: number) { this.skip = from; this.max = to - from + 1; return this }
  or(expr: string) { this.filters.push(parseOr(expr)); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending !== false }); return this }
  limit(n: number) { this.max = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onOk, onErr)
  }

  private match(rows: Row[]) { return rows.filter(r => this.filters.every(f => f(r))) }

  private project(rows: Row[]): Row[] {
    const cols = this.cols.replace(/\s+/g, '')
    const embeds = [...cols.matchAll(/(\w+)\(([^)]*)\)/g)].map(m => m[1])
    const plain = cols.replace(/,?\w+\([^)]*\)/g, '').split(',').filter(Boolean)
    const parentKey = `${this.table.replace(/s$/, '')}_id` // gardens → garden_id
    return rows.map(r => {
      const base: Row = plain.includes('*') || plain.length === 0 ? { ...r } : Object.fromEntries(plain.map(c => [c, r[c]]))
      for (const e of embeds) {
        base[e] = tableRows(e)
          .filter(x => x[parentKey] === r.id)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map(x => ({ ...x }))
      }
      return base
    })
  }

  private finish(rows: Row[]): Result {
    let out = rows
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const av = a[o.col], bv = b[o.col]
        const c = typeof av === 'string' ? av.localeCompare(bv ?? '') : (av ?? 0) - (bv ?? 0)
        return o.asc ? c : -c
      })
    }
    if (this.skip > 0 || this.max !== null) out = out.slice(this.skip, this.max === null ? undefined : this.skip + this.max)
    const data = clone(this.project(out))
    if (this.mode === 'single') {
      if (data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } }
      return { data: data[0], error: null }
    }
    if (this.mode === 'maybe') return { data: data[0] ?? null, error: null }
    return { data, error: null }
  }

  private async run(): Promise<Result> {
    await wait(this.op === 'select' ? LATENCY : 90)
    // Hors ligne simulé (Playwright `context.setOffline(true)`) : même forme
    // d'erreur que postgrest-js quand fetch échoue, pour tester la file.
    if (horsLigneDemo()) return ERREUR_RESEAU_DEMO
    if (!currentUser()) return { data: null, error: { code: '42501', message: 'Connexion requise (mode démo)' } }
    try {
      const t = this.table
      const d = getDb() as any
      if (this.op === 'select' || this.op === null) return this.finish(this.match(tableRows(t)))

      if (this.op === 'insert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
        // Migration 010 : documents émis en lecture seule, ventes facturées protégées
        const refus010 = refusFacturesDemo(d, t, 'insert', list, list[0])
        if (refus010) return { data: null, error: refus010 }
        const inserted: Row[] = []
        for (const v of list) {
          // Clé primaire : un identifiant client déjà présent est refusé (23505),
          // comme en base — la file hors ligne s'en sert pour ne jamais doublonner.
          if (v.id && (d[t] as Row[]).some(r => r.id === v.id)) {
            return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${t}_pkey"` }, status: 409 }
          }
          const row: Row = { id: uuid(), created_at: new Date().toISOString(), ...DEFAULTS[t], ...v }
          if (t === 'plantings') calcPlanting(row)
          if (t === 'sales' && !d.sale_lines.some((l: Row) => l.sale_id === row.id)) row.total = Math.round(row.tiges * row.prix_unitaire * 100) / 100
          // Migration 005 : season_id recopié du parent, line_total généré
          if (t === 'sale_lines' || t === 'order_lines') {
            if ('line_total' in v) return { data: null, error: { code: '428C9', message: 'cannot insert a non-DEFAULT value into column "line_total" (colonne générée)' } }
            const parent = t === 'sale_lines' ? d.sales.find((x: Row) => x.id === row.sale_id) : (d as any).orders.find((x: Row) => x.id === row.order_id)
            if (!parent) return { data: null, error: { code: 'P0001', message: `${t === 'sale_lines' ? 'Vente' : 'Commande'} ${row.sale_id ?? row.order_id} introuvable` } }
            row.season_id = parent.season_id
            row.line_total = totalLigneDemo(row)
          }
          const errCout = coutsSetFarm(t, row)
          if (errCout) return { data: null, error: errCout }
          const errJournal = journalSetFarm(t, row, null)
          if (errJournal) return { data: null, error: errJournal }
          const errGestion = gestionAvantEcriture(d, t, row, null, currentUser()?.id ?? null)  // triggers 012
          if (errGestion) return { data: null, error: errGestion }
          if (t === 'seasons') row.invite_token ??= uuid()
          if (t === 'team_members') row.joined_at ??= new Date().toISOString()
          if (t === 'suppliers') {
            row.created_by ??= currentUser()?.id ?? null
            if ((d.suppliers as Row[]).some(f => f.farm_id === row.farm_id && f.name.trim().toLowerCase() === String(row.name ?? '').trim().toLowerCase()))
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "suppliers_farm_name_uidx"' }, status: 409 }
          }
          if (t === 'purchase_orders' && Object.keys(v).some(k => !COLONNES_BON_CLIENT.has(k)))
            return { data: null, error: { code: '42501', message: `permission denied for table ${t}` } }
          d[t].push(row)
          inserted.push(row)
          if (t === 'sale_lines') recalculerVenteDemo(d, row.sale_id)
          if (t === 'seasons') d.team_members.push({ id: uuid(), season_id: row.id, user_id: row.user_id, role: 'owner', joined_at: new Date().toISOString() })
        }
        return this.returning ? this.finish(inserted) : { data: null, error: null }
      }

      if (this.op === 'upsert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
        const refus010 = refusFacturesDemo(d, t, 'upsert', list)
        if (refus010) return { data: null, error: refus010 }
        const out: Row[] = []
        for (const v of list) {
          const hit = (d[t] as Row[]).find(r => this.conflict.every(c => v[c] != null && r[c] === v[c]))
          if (hit) { Object.assign(hit, v); out.push(hit); continue }
          const row: Row = { id: uuid(), created_at: new Date().toISOString(), ...DEFAULTS[t], ...v }
          d[t].push(row); out.push(row)
        }
        return this.returning ? this.finish(out) : { data: null, error: null }
      }

      if (this.op === 'update') {
        const rows = this.match(tableRows(t))
        const refus010 = refusFacturesDemo(d, t, 'update', rows, this.payload)
        if (refus010) return { data: null, error: refus010 }
        // Migration 011 : statut, numéro, quantités reçues ne s'écrivent que par les fonctions
        if ((t === 'purchase_orders' && Object.keys(this.payload).some(k => !COLONNES_BON_CLIENT.has(k)))
          || (t === 'purchase_order_lines' && 'quantity_received' in this.payload))
          return { data: null, error: { code: '42501', message: `permission denied for table ${t}` } }
        if (t === 'purchase_orders' && rows.some(r => r.status !== 'brouillon' && Object.keys(this.payload).some(k => !['expected_date', 'notes'].includes(k))))
          return { data: null, error: { code: 'P0001', message: 'Bon déjà envoyé : seuls la date de livraison prévue, les notes, la réception et l\'annulation restent possibles' } }
        for (const r of rows) {
          if (TABLES_JOURNAL.has(t)) {
            const copie = { ...r, ...this.payload }
            const errJournal = journalSetFarm(t, copie, r)
            if (errJournal) return { data: null, error: errJournal }
            Object.assign(r, copie)
            continue
          }
          if (TABLES_GESTION.has(t)) {
            const copie = { ...r, ...this.payload }
            const errGestion = gestionAvantEcriture(d, t, copie, r, currentUser()?.id ?? null)  // triggers 012
            if (errGestion) return { data: null, error: errGestion }
            Object.assign(r, copie)
            continue
          }
          Object.assign(r, this.payload)
          coutsSetFarm(t, r)
          if (t === 'plantings') calcPlanting(r)
          if (t === 'sales' && !d.sale_lines.some((l: Row) => l.sale_id === r.id)) r.total = Math.round(r.tiges * r.prix_unitaire * 100) / 100
          if (t === 'sale_lines' || t === 'order_lines') r.line_total = totalLigneDemo(r)
          if (t === 'sale_lines') recalculerVenteDemo(d, r.sale_id)
          if (t === 'culture_catalog') d.plantings.filter((p: Row) => p.culture_id === r.id).forEach(calcPlanting)
        }
        return this.returning ? this.finish(rows) : { data: null, error: null }
      }

      if (this.op === 'delete') {
        const rows = this.match(tableRows(t))
        const refus010 = refusFacturesDemo(d, t, 'delete', rows)
        if (refus010) return { data: null, error: refus010 }
        const refus012 = gestionAvantSuppression(d, t, rows)
        if (refus012) return { data: null, error: refus012 }
        if (t === 'culture_catalog' && rows.some(r => [...d.costs, ...d.time_entries].some((x: Row) => x.culture_id === r.id))) {
          return { data: null, error: { code: '23503', message: 'Cette culture porte des dépenses ou du temps saisi (on delete restrict).' } }
        }
        const refusAchats = refusSuppressionAchats(t, rows)
        if (refusAchats) return { data: null, error: refusAchats }
        if (t === 'suppliers' && rows.some(r => d.purchase_orders.some((b: Row) => b.supplier_id === r.id)))
          return { data: null, error: { code: '23503', message: 'Ce fournisseur a des bons de commande : archivez-le plutôt (on delete restrict).' } }
        if (t === 'culture_catalog' && rows.some(r => d.plantings.some((p: Row) => p.culture_id === r.id))) {
          return { data: null, error: { code: '23503', message: 'Cette culture est utilisée par des plantations (on delete restrict).' } }
        }
        d[t] = d[t].filter((r: Row) => !rows.includes(r))
        cascadeDelete(t, rows)
        gestionApresSuppression(d, t, rows)
        return this.returning ? this.finish(rows) : { data: null, error: null }
      }
      return { data: null, error: null }
    } catch (e: any) {
      return { data: null, error: { message: e?.message || String(e) } }
    }
  }
}

// ─── Auth ─────────────────────────────────────────────────────────
type Listener = (event: string, session: any) => void
const listeners = new Set<Listener>()

const DEMO_USER = {
  id: DEMO_USER_ID, aud: 'authenticated', role: 'authenticated', email: DEMO_EMAIL,
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-04T09:00:00Z',
}
let session: any = null

function readSession() {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(SESSION_KEY) ? { access_token: 'demo', token_type: 'bearer', user: DEMO_USER } : null } catch { return null }
}
function currentUser() { return (session ??= readSession())?.user ?? null }
function emit(event: string) { listeners.forEach(l => l(event, session)) }

const auth = {
  async getUser() { await wait(60); return { data: { user: currentUser() }, error: null } },
  async getSession() { await wait(40); currentUser(); return { data: { session }, error: null } },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb)
    setTimeout(() => { currentUser(); cb('INITIAL_SESSION', session) }, 0)
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await wait(450)
    if (!email || !password) return { data: { user: null, session: null }, error: { message: 'Adresse e-mail et mot de passe requis.' } }
    session = { access_token: 'demo', token_type: 'bearer', user: DEMO_USER }
    try { localStorage.setItem(SESSION_KEY, '1') } catch {}
    emit('SIGNED_IN')
    return { data: { user: DEMO_USER, session }, error: null }
  },
  async signUp() { await wait(400); return { data: { user: null, session: null }, error: null } },
  async resetPasswordForEmail() { await wait(400); return { data: {}, error: null } },
  async updateUser() { await wait(300); return { data: { user: currentUser() }, error: null } },
  async signOut() {
    await wait(120)
    session = null
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    emit('SIGNED_OUT')
    return { error: null }
  },
}

// ─── RPC ──────────────────────────────────────────────────────────
async function rpc(fn: string, args: Row = {}): Promise<Result> {
  await wait(120)
  if (horsLigneDemo()) return ERREUR_RESEAU_DEMO
  const d = getDb()
  const me = currentUser()
  if (!me) return { data: null, error: { message: 'Connexion requise' } }
  const isOwner = (sid: string) => d.team_members.some(m => m.season_id === sid && m.user_id === me.id && m.role === 'owner')

  // ─── Écritures atomiques (migration 007), rejouées avec les règles de la démo ──
  const q = (t: string) => new DemoQuery(t) as any
  const lignes = (sid: string, key: 'sale_id' | 'order_id', arr: Row[]) => (arr ?? []).map(l => ({
    [key]: sid, culture_id: l.culture_id ?? null, label: l.label, unit: l.unit ?? 'tige',
    quantity: l.quantity, stems_per_unit: l.stems_per_unit ?? 1, unit_price: l.unit_price,
  }))
  const venteAvecLignes = async (v: Row, arr: Row[]): Promise<Result> => {
    if (!arr?.length) return { data: null, error: { message: 'Une vente doit avoir au moins une ligne' } }
    const r = await q('sales').insert({
      season_id: v.season_id, user_id: me.id, date: v.date, channel: v.channel, client_id: v.client_id || null,
      client: v.client ?? null, notes: v.notes ?? null, order_id: v.order_id || null, tiges: 0, prix_unitaire: 0,
    }).select().single()
    if (r.error) return r
    const r2 = await q('sale_lines').insert(lignes(r.data.id, 'sale_id', arr))
    if (r2.error) { await q('sales').delete().eq('id', r.data.id); return r2 }
    return { data: r.data.id, error: null }
  }
  if (fn === 'enregistrer_vente') return venteAvecLignes(args.p_sale, args.p_lines)
  const rpc012 = await rpcGestionDemo(fn, args, d as any, me.id, q)  // migration 012
  if (rpc012) return rpc012
  if (fn === 'enregistrer_commande') {
    const o = args.p_order as Row
    let id = args.p_order_id as string | null
    if (!id) {
      const r = await q('orders').insert({ ...o, status: o.status ?? 'confirmee' }).select().single()
      if (r.error) return r
      id = r.data.id
    } else {
      const cur = (d as any).orders.find((x: Row) => x.id === id)
      if (!cur || cur.status === 'livree') return { data: null, error: { message: 'Commande introuvable, inaccessible ou déjà livrée' } }
      const { season_id: _s, ...maj } = o
      const r = await q('orders').update(maj).eq('id', id)
      if (r.error) return r
      await q('order_lines').delete().eq('order_id', id)
    }
    if (args.p_lines?.length) {
      const r = await q('order_lines').insert(lignes(id!, 'order_id', args.p_lines))
      if (r.error) return r
    }
    return { data: id, error: null }
  }
  if (fn === 'livrer_commande') {
    const o = (d as any).orders.find((x: Row) => x.id === args.p_order_id)
    if (!o) return { data: null, error: { message: 'Commande introuvable ou inaccessible' } }
    if (o.sale_id || o.status === 'livree') return { data: null, error: { message: 'Commande déjà livrée et facturée' } }
    if (o.status === 'annulee') return { data: null, error: { message: 'Commande annulée' } }
    const r = await venteAvecLignes({ ...args.p_sale, season_id: o.season_id, order_id: o.id, client_id: args.p_sale?.client_id ?? o.client_id }, args.p_lines)
    if (r.error) return r
    await q('orders').update({ sale_id: r.data, status: 'livree' }).eq('id', o.id)
    return r
  }
  // ─── Migration 010 : factures, avoirs, paiements ─────────────────
  if (fn === 'emettre_facture') return emettreFactureDemo(d as any, args, me.id)
  if (fn === 'emettre_avoir') return emettreAvoirDemo(d as any, args, me.id)
  if (fn === 'enregistrer_paiement') return enregistrerPaiementDemo(d as any, args, me.id)
  if (fn === 'supprimer_vente') {
    const refus010 = refusFacturesDemo(d as any, 'sales', 'delete', [{ id: args.p_sale_id }])
    if (refus010) return { data: null, error: refus010 }
    const o = (d as any).orders.find((x: Row) => x.sale_id === args.p_sale_id)
    if (o) await q('orders').update({ status: 'prete', sale_id: null }).eq('id', o.id)
    const r = await q('sales').delete().eq('id', args.p_sale_id)
    if (r.error) return r
    return { data: o?.id ?? null, error: null }
  }

  // ─── Migration 011 : fonctions des bons de commande ──
  const rAchats = await rpcAchatsDemo(fn, args, { db: d as any, me: me.id, q, aujourdhui: aujourdhuiParisISO(), uuid })
  if (rAchats) return rAchats

  if (fn === 'season_team') {
    const sid = args.p_season_id
    if (!d.team_members.some(m => m.season_id === sid && m.user_id === me.id)) return { data: [], error: null }
    const data = d.team_members
      .filter(m => m.season_id === sid)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map(m => {
        const p = d.profiles.find(x => x.id === m.user_id)
        return { id: m.id, season_id: m.season_id, user_id: m.user_id, role: m.role, joined_at: m.joined_at, email: p?.email ?? null, owner_name: p?.owner_name ?? null }
      })
    return { data, error: null }
  }
  // ─── Migration 006 : ferme ───────────────────────────────────────
  const farmOf = (sid: string) => d.seasons.find(s => s.id === sid)?.farm_id as string | undefined
  const fms = (): Row[] => (d as any).farm_members
  // Miroir de farm_member_sync : un membre de la ferme est membre de toutes ses saisons
  const addFarmMember = (farmId: string, userId: string, role = 'member') => {
    if (fms().some(m => m.farm_id === farmId && m.user_id === userId)) return
    const now = new Date().toISOString()
    fms().push({ id: uuid(), farm_id: farmId, user_id: userId, role, joined_at: now })
    for (const s of d.seasons.filter(x => x.farm_id === farmId)) {
      if (!d.team_members.some(m => m.season_id === s.id && m.user_id === userId))
        d.team_members.push({ id: uuid(), season_id: s.id, user_id: userId, role, joined_at: now })
    }
  }
  if (fn === 'farm_team') {
    const fid = args.p_farm_id
    if (!fms().some(m => m.farm_id === fid && m.user_id === me.id)) return { data: [], error: null }
    const data = fms()
      .filter(m => m.farm_id === fid)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map(m => {
        const p = d.profiles.find(x => x.id === m.user_id)
        return { id: m.id, farm_id: m.farm_id, user_id: m.user_id, role: m.role, joined_at: m.joined_at, email: p?.email ?? null, owner_name: p?.owner_name ?? null }
      })
    return { data, error: null }
  }
  if (fn === 'duplicate_season_plan') {
    const src = d.seasons.find(s => s.id === args.p_source_season)
    if (!src || !isOwner(src.id)) return { data: null, error: { code: 'P0001', message: 'Seul le propriétaire peut dupliquer un plan' } }
    const shift = Number(args.p_shift_years ?? 1)
    const now = new Date().toISOString()
    const nid = uuid()
    d.seasons.push({ id: nid, user_id: me.id, farm_id: src.farm_id, name: args.p_name, year: Number(args.p_year),
      revenue_goal: src.revenue_goal, is_active: false, invite_token: uuid(), invite_enabled: false, created_at: now })
    for (const m of fms().filter(x => x.farm_id === src.farm_id))
      d.team_members.push({ id: uuid(), season_id: nid, user_id: m.user_id, role: m.role, joined_at: now })
    // make_interval(years => n) : un 29 février devient un 28 février
    const shiftDate = (ds: string) => {
      const [y, mo, j] = ds.split('-').map(Number)
      const ny = y + shift
      const last = new Date(Date.UTC(ny, mo, 0)).getUTCDate()
      return `${String(ny).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(Math.min(j, last)).padStart(2, '0')}`
    }
    for (const p of d.plantings.filter(x => x.season_id === src.id)) {
      const row: Row = { ...p, id: uuid(), season_id: nid, date_semis: shiftDate(p.date_semis), created_at: now }
      calcPlanting(row)
      d.plantings.push(row)
    }
    return { data: nid, error: null }
  }
  if (fn === 'join_season_by_token') {
    const s = d.seasons.find(x => x.invite_token === args.p_token && x.invite_enabled)
    if (!s) return { data: { error: 'Lien invalide ou désactivé' }, error: null }
    if (d.team_members.some(m => m.season_id === s.id && m.user_id === me.id)) {
      return { data: { ok: true, season_id: s.id, season_name: s.name, message: 'Déjà membre' }, error: null }
    }
    if (s.farm_id) addFarmMember(s.farm_id, me.id)
    else d.team_members.push({ id: uuid(), season_id: s.id, user_id: me.id, role: 'member', joined_at: new Date().toISOString() })
    return { data: { ok: true, season_id: s.id, season_name: s.name }, error: null }
  }
  if (fn === 'invite_by_email') {
    const sid = args.p_season_id
    const email = String(args.p_email || '').trim().toLowerCase()
    if (!isOwner(sid)) return { data: { error: 'Seul le propriétaire peut inviter' }, error: null }
    const target = d.profiles.find(p => p.email.toLowerCase() === email)
    if (target) {
      if (d.team_members.some(m => m.season_id === sid && m.user_id === target.id)) {
        return { data: { status: 'already_member', message: 'Déjà membre de l’équipe' }, error: null }
      }
      const fid = farmOf(sid)
      if (fid) addFarmMember(fid, target.id)
      else d.team_members.push({ id: uuid(), season_id: sid, user_id: target.id, role: 'member', joined_at: new Date().toISOString() })
      return { data: { status: 'added', message: 'Membre ajouté directement' }, error: null }
    }
    if (!d.pending_invites.some(i => i.season_id === sid && i.email === email)) {
      d.pending_invites.push({ id: uuid(), season_id: sid, email, invited_by: me.id, created_at: new Date().toISOString() })
    }
    return { data: { status: 'pending', message: 'Invitation enregistrée, elle sera activée à l’inscription' }, error: null }
  }
  return { data: null, error: { message: `Fonction inconnue en mode démo : ${fn}` } }
}

// ─── Storage (migration 009 : bucket privé `journal`) ─────────────
// Les fichiers déposés restent en mémoire sous forme de blob: URL ; une « URL
// signée » est cette blob: URL (ou l'image publique d'une photo de démo).
// Mêmes règles que les policies : premier dossier = une ferme de l'appelant.
const objetsStorage = new Map<string, string>()
const erreurStorage = (message: string, statusCode = '400') => ({ data: null, error: { name: 'StorageApiError', message, statusCode } })
function dossierAutorise(path: string): boolean {
  const me = currentUser()?.id
  const parties = path.split('/')
  const d = getDb() as any
  return parties.length === 3 && !path.includes('..') && d.farm_members.some((m: Row) => m.user_id === me && m.farm_id === parties[0])
}
const BUCKETS_DEMO = new Set(['journal', 'justificatifs'])
function objetStorage(bucket: string, path: string): string | undefined {
  if (!BUCKETS_DEMO.has(bucket)) return undefined
  const cle = `${bucket}:${path}`
  return objetsStorage.get(cle) ?? (bucket === 'journal' ? OBJETS_JOURNAL_DEMO.get(path) : OBJETS_JUSTIFICATIFS_DEMO.get(path))
}
const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: Blob, opts?: { upsert?: boolean; contentType?: string }) {
        await wait(250)
        if (horsLigneDemo()) return erreurStorage('Failed to fetch', '0')
        if (!BUCKETS_DEMO.has(bucket)) return erreurStorage('Bucket not found', '404')
        if (!currentUser() || !dossierAutorise(path)) return erreurStorage('new row violates row-level security policy', '403')
        if (objetStorage(bucket, path) && !opts?.upsert) return erreurStorage('The resource already exists', '409')
        objetsStorage.set(`${bucket}:${path}`, URL.createObjectURL(file))
        return { data: { path, id: uuid(), fullPath: `${bucket}/${path}` }, error: null }
      },
      async createSignedUrl(path: string) {
        await wait(60)
        if (horsLigneDemo()) return erreurStorage('Failed to fetch', '0')
        const url = objetStorage(bucket, path)
        if (!currentUser() || !url || path.split('/')[0] === '' || !dossierAutorise(path)) return erreurStorage('Object not found', '404')
        return { data: { signedUrl: url }, error: null }
      },
      async remove(paths: string[]) {
        await wait(90)
        if (horsLigneDemo()) return erreurStorage('Failed to fetch', '0')
        const out: Row[] = []
        for (const p of paths) {
          if (!dossierAutorise(p)) continue // filtré par la policy, sans erreur
          const url = objetsStorage.get(`${bucket}:${p}`)
          if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
          const demo = bucket === 'journal' ? OBJETS_JOURNAL_DEMO : OBJETS_JUSTIFICATIFS_DEMO
          if (objetsStorage.delete(`${bucket}:${p}`) || demo.delete(p)) out.push({ name: p, bucket_id: bucket })
        }
        return { data: out, error: null }
      },
    }
  },
}

let client: any = null

/** Client unique (partagé par useBleuenn, /reset-password et /join). */
export function createDemoClient(): any {
  return (client ??= { auth, from: (t: string) => new DemoQuery(t), rpc, storage })
}
