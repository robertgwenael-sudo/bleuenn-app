// ============================================================
// Faux client Supabase en mémoire — mode démo uniquement.
// Reproduit ce qu'utilisent useBleuenn.ts et les pages :
//   auth.getUser / getSession / onAuthStateChange / signInWithPassword /
//   signUp / resetPasswordForEmail / updateUser / signOut
//   from(t).select/insert/update/delete + eq/neq/in/or/is/order/limit/single/maybeSingle
//   rpc('season_team' | 'join_season_by_token' | 'invite_by_email')
// ainsi que les triggers (calc_planting_dates, propagate_catalog_changes,
// add_season_owner, colonne générée sales.total) et la vue plantings_full
// (migration 002), avec les mêmes formules.
// Aucune requête réseau, aucune écriture hors de la mémoire du navigateur.
// ============================================================
import { extendDemoDb } from './seeds'
import { buildDemoDb, DEMO_USER_ID, DEMO_EMAIL, type DemoDb } from './data'

type Row = Record<string, any>
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null }

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
}

function tableRows(table: string): Row[] {
  const d = getDb() as any
  if (table === 'plantings_full') return plantingsFull()
  if (!d[table]) throw new Error(`Table inconnue en mode démo : ${table}`)
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
  if (table === 'seasons') {
    drop('gardens', r => ids.has(r.season_id)); drop('team_members', r => ids.has(r.season_id))
    drop('sales', r => ids.has(r.season_id)); drop('seed_orders', r => ids.has(r.season_id))
  }
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
    if (this.max !== null) out = out.slice(0, this.max)
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
    if (!currentUser()) return { data: null, error: { code: '42501', message: 'Connexion requise (mode démo)' } }
    try {
      const t = this.table
      const d = getDb() as any
      if (this.op === 'select' || this.op === null) return this.finish(this.match(tableRows(t)))

      if (this.op === 'insert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted: Row[] = []
        for (const v of list) {
          const row: Row = { id: uuid(), created_at: new Date().toISOString(), ...DEFAULTS[t], ...v }
          if (t === 'plantings') calcPlanting(row)
          if (t === 'sales') row.total = Math.round(row.tiges * row.prix_unitaire * 100) / 100
          if (t === 'seasons') row.invite_token ??= uuid()
          if (t === 'team_members') row.joined_at ??= new Date().toISOString()
          d[t].push(row)
          inserted.push(row)
          if (t === 'seasons') d.team_members.push({ id: uuid(), season_id: row.id, user_id: row.user_id, role: 'owner', joined_at: new Date().toISOString() })
        }
        return this.returning ? this.finish(inserted) : { data: null, error: null }
      }

      if (this.op === 'upsert') {
        const list: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
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
        const rows = this.match(d[t])
        for (const r of rows) {
          Object.assign(r, this.payload)
          if (t === 'plantings') calcPlanting(r)
          if (t === 'sales') r.total = Math.round(r.tiges * r.prix_unitaire * 100) / 100
          if (t === 'culture_catalog') d.plantings.filter((p: Row) => p.culture_id === r.id).forEach(calcPlanting)
        }
        return this.returning ? this.finish(rows) : { data: null, error: null }
      }

      if (this.op === 'delete') {
        const rows = this.match(d[t])
        if (t === 'culture_catalog' && rows.some(r => d.plantings.some((p: Row) => p.culture_id === r.id))) {
          return { data: null, error: { code: '23503', message: 'Cette culture est utilisée par des plantations (on delete restrict).' } }
        }
        d[t] = d[t].filter((r: Row) => !rows.includes(r))
        cascadeDelete(t, rows)
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
  const d = getDb()
  const me = currentUser()
  if (!me) return { data: null, error: { message: 'Connexion requise' } }
  const isOwner = (sid: string) => d.team_members.some(m => m.season_id === sid && m.user_id === me.id && m.role === 'owner')

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
  if (fn === 'join_season_by_token') {
    const s = d.seasons.find(x => x.invite_token === args.p_token && x.invite_enabled)
    if (!s) return { data: { error: 'Lien invalide ou désactivé' }, error: null }
    if (d.team_members.some(m => m.season_id === s.id && m.user_id === me.id)) {
      return { data: { ok: true, season_id: s.id, season_name: s.name, message: 'Déjà membre' }, error: null }
    }
    d.team_members.push({ id: uuid(), season_id: s.id, user_id: me.id, role: 'member', joined_at: new Date().toISOString() })
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
      d.team_members.push({ id: uuid(), season_id: sid, user_id: target.id, role: 'member', joined_at: new Date().toISOString() })
      return { data: { status: 'added', message: 'Membre ajouté directement' }, error: null }
    }
    if (!d.pending_invites.some(i => i.season_id === sid && i.email === email)) {
      d.pending_invites.push({ id: uuid(), season_id: sid, email, invited_by: me.id, created_at: new Date().toISOString() })
    }
    return { data: { status: 'pending', message: 'Invitation enregistrée, elle sera activée à l’inscription' }, error: null }
  }
  return { data: null, error: { message: `Fonction inconnue en mode démo : ${fn}` } }
}

let client: any = null

/** Client unique (partagé par useBleuenn, /reset-password et /join). */
export function createDemoClient(): any {
  return (client ??= { auth, from: (t: string) => new DemoQuery(t), rpc })
}
