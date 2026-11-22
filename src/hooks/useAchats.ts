'use client'
// ============================================================
// Achats : fournisseurs, bons de commande, lignes et dépenses créées par
// les réceptions (migration 011).
// ------------------------------------------------------------
// Ne touche pas à useBleuenn : prend dans le contexte la saison active (et
// sa ferme), les plantations, le catalogue, les besoins seed_orders et
// l'utilisateur, et fait ses propres requêtes.
// Aucune erreur avalée : chaque `error` Supabase part dans la console ET
// dans un toast ; une lecture refusée met l'écran en état d'erreur plutôt
// que d'afficher une liste vide trompeuse.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { aujourdhuiParisISO } from '@/lib/types'
import {
  besoinsAchat, proposerBrouillons, type BesoinCulture, type BrouillonPropose,
} from '@/lib/domain/achats'
import type {
  CostAchat, DateISO, EurosNumeric, PurchaseOrder, PurchaseOrderLine, PurchaseUnit, Supplier, SupplierKind,
} from '@/lib/domain'

const supabase = createClient()

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface AchatsCtx {
  activeSeason: { id: string; farm_id?: string | null } | null
  plantings: any[]
  farmPlantings?: any[]
  catalog: any[]
  seedOrders: any[]
  user: { id: string } | null
  farm?: { id: string; name: string } | null
}

type Erreur = { message: string; code?: string } | null
type Res<T> = { data: T | null; error: Erreur }

function verifier<T>(r: Res<T>, contexte: string, repli: T): T {
  if (r.error) {
    console.error(`[achats] lecture : ${contexte}`, r.error)
    toast.error(`Lecture impossible : ${contexte}`, { description: r.error.message, id: `achats-${contexte}` })
    throw new Error(`${contexte} : ${r.error.message}`)
  }
  return (r.data ?? repli) as T
}

function echec(err: Erreur, quoi: string): boolean {
  if (!err) return false
  console.error(`[achats] ${quoi}`, err)
  toast.error(`Échec : ${quoi}`, { description: err.message })
  return true
}

export interface FicheFournisseur {
  name: string
  kind: SupplierKind
  contact_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  customer_number: string | null
  /** Euros (numeric) ou null si non renseigné. */
  min_order_amount: number | null
  free_shipping_threshold: number | null
  lead_time_days: number | null
  organic_certified: boolean
  notes: string | null
}

export interface LigneSaisie {
  culture_id: string | null
  variety: string | null
  label: string
  supplier_ref: string | null
  unit: PurchaseUnit
  quantity: number
  /** Euros, null = à saisir. */
  unit_price: number | string | null
  organic: boolean
  seed_order_id: string | null
}

export interface EnteteSaisie {
  supplier_id: string
  season_id?: string
  expected_date: DateISO | null
  /** Euros. */
  shipping_amount: number
  notes: string | null
}

export interface ResultatReception { id: string; status: string; depenses_creees: number; montant: EurosNumeric }

export function useAchats(ctx: AchatsCtx) {
  const seasonId = ctx.activeSeason?.id ?? null
  const farmId = ctx.activeSeason?.farm_id ?? null
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bons, setBons] = useState<PurchaseOrder[]>([])
  const [lignes, setLignes] = useState<PurchaseOrderLine[]>([])
  const [depenses, setDepenses] = useState<CostAchat[]>([])
  const [seasons, setSeasons] = useState<{ id: string; name: string; year: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    try {
      const [f, b, l, c, s] = await Promise.all([
        supabase.from('suppliers').select('*').eq('farm_id', farmId).order('name'),
        supabase.from('purchase_orders').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }),
        supabase.from('purchase_order_lines').select('*').eq('farm_id', farmId).order('sort_order'),
        supabase.from('costs').select('*').eq('farm_id', farmId).order('date', { ascending: false }),
        supabase.from('seasons').select('id, name, year').eq('farm_id', farmId).order('year', { ascending: false }),
      ])
      setSuppliers(verifier<Supplier[]>(f as Res<Supplier[]>, 'fournisseurs', []))
      setBons(verifier<PurchaseOrder[]>(b as Res<PurchaseOrder[]>, 'bons de commande', []))
      setLignes(verifier<PurchaseOrderLine[]>(l as Res<PurchaseOrderLine[]>, 'lignes des bons', []))
      setDepenses(verifier<CostAchat[]>(c as Res<CostAchat[]>, 'dépenses', []).filter(x => !!x.purchase_order_id))
      setSeasons(verifier(s as Res<{ id: string; name: string; year: number }[]>, 'saisons', []))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [farmId])

  useEffect(() => { load() }, [load])

  // ─── Fournisseurs ─────────────────────
  const saveSupplier = useCallback(async (id: string | null, fiche: FicheFournisseur): Promise<string | null> => {
    if (!farmId) { toast.error('Aucune ferme'); return null }
    if (!fiche.name.trim()) { toast.error('Le nom est obligatoire'); return null }
    const valeurs = { ...fiche, name: fiche.name.trim() }
    const r = id
      ? await supabase.from('suppliers').update(valeurs).eq('id', id).select('id')
      : await supabase.from('suppliers').insert({ ...valeurs, farm_id: farmId }).select('id')
    if (echec(r.error, id ? 'modification du fournisseur' : 'création du fournisseur')) return null
    const rows = (r.data ?? []) as { id: string }[]
    if (rows.length === 0) {
      console.error('[achats] fournisseur : aucune ligne écrite (droits insuffisants ?)')
      toast.error('Échec : fournisseur non enregistré (droits insuffisants ?)')
      return null
    }
    await load()
    return rows[0].id
  }, [farmId, load])

  const archiveSupplier = useCallback(async (id: string, archiver: boolean): Promise<boolean> => {
    const r = await supabase.from('suppliers').update({ archived_at: archiver ? new Date().toISOString() : null }).eq('id', id).select('id')
    if (echec(r.error, archiver ? 'archivage du fournisseur' : 'désarchivage du fournisseur')) return false
    await load()
    return true
  }, [load])

  // ─── Bons ──────────────────────────────
  const saveBon = useCallback(async (id: string | null, entete: EnteteSaisie, saisies: LigneSaisie[]): Promise<string | null> => {
    const season = entete.season_id ?? seasonId
    if (!season) { toast.error('Aucune saison active'); return null }
    const r = await supabase.rpc('enregistrer_bon', {
      p_id: id,
      p_bon: {
        season_id: season, supplier_id: entete.supplier_id, expected_date: entete.expected_date ?? '',
        shipping_amount: entete.shipping_amount, notes: entete.notes ?? '',
      },
      p_lignes: saisies.map(l => ({ ...l, label: l.label.trim() })),
    })
    if (echec(r.error, 'enregistrement du bon')) return null
    await load()
    return (r.data as string) ?? null
  }, [seasonId, load])

  const supprimerBrouillon = useCallback(async (id: string): Promise<boolean> => {
    const r = await supabase.from('purchase_orders').delete().eq('id', id).eq('status', 'brouillon').select('id')
    if (echec(r.error, 'suppression du brouillon')) return false
    if (!r.data || (r.data as unknown[]).length === 0) {
      toast.error('Échec : brouillon introuvable ou déjà envoyé')
      return false
    }
    await load()
    return true
  }, [load])

  const appel = useCallback(async <T,>(fn: string, args: Record<string, unknown>, quoi: string): Promise<T | null> => {
    const r = await supabase.rpc(fn, args)
    if (echec(r.error, quoi)) { await load(); return null }
    await load()
    return (r.data as T) ?? null
  }, [load])

  const envoyer = useCallback((id: string) => appel<PurchaseOrder>('envoyer_bon', { p_id: id }, 'envoi du bon'), [appel])
  const confirmer = useCallback((id: string, datePrevue: DateISO | null) =>
    appel<PurchaseOrder>('confirmer_bon', { p_id: id, p_date_prevue: datePrevue }, 'confirmation du bon'), [appel])
  const annuler = useCallback((id: string) => appel<PurchaseOrder>('annuler_bon', { p_id: id }, 'annulation du bon'), [appel])
  /** Quantités CUMULÉES reçues par ligne. */
  const receptionner = useCallback((id: string, recus: { id: string; quantity_received: number }[], date: DateISO) =>
    appel<ResultatReception>('receptionner_bon', { p_id: id, p_lignes: recus, p_date: date }, 'réception du bon'), [appel])

  const majNotes = useCallback(async (id: string, champs: { notes?: string | null; expected_date?: DateISO | null }): Promise<boolean> => {
    const r = await supabase.from('purchase_orders').update(champs).eq('id', id).select('id')
    if (echec(r.error, 'modification du bon')) return false
    await load()
    return true
  }, [load])

  // ─── Besoins ───────────────────────────
  const besoins: BesoinCulture[] = useMemo(() => {
    if (!seasonId) return []
    try {
      return besoinsAchat({
        seasonId,
        plantings: (ctx.plantings || []).filter((p: any) => p.season_id === seasonId),
        seedOrders: ctx.seedOrders || [],
        catalog: ctx.catalog || [],
        bons, lignes, fournisseurs: suppliers,
      })
    } catch (e) {
      console.error('[achats] calcul des besoins', e)
      return []
    }
  }, [seasonId, ctx.plantings, ctx.seedOrders, ctx.catalog, bons, lignes, suppliers])

  const propositions: BrouillonPropose[] = useMemo(() => proposerBrouillons(besoins), [besoins])

  /** Crée un brouillon par proposition (chacun atomique). Renvoie le nombre créé. */
  const creerBrouillons = useCallback(async (props: (BrouillonPropose & { supplier_id: string })[]): Promise<number> => {
    if (!seasonId) { toast.error('Aucune saison active'); return 0 }
    let n = 0
    for (const p of props) {
      const r = await supabase.rpc('enregistrer_bon', {
        p_id: null,
        p_bon: { season_id: seasonId, supplier_id: p.supplier_id, expected_date: '', shipping_amount: 0, notes: '' },
        p_lignes: p.lignes,
      })
      if (echec(r.error, `brouillon pour ${p.supplier_name ?? 'un fournisseur'}`)) break
      n += 1
    }
    await load()
    return n
  }, [seasonId, load])

  const lignesParBon = useMemo(() => {
    const m = new Map<string, PurchaseOrderLine[]>()
    for (const l of lignes) {
      const t = m.get(l.purchase_order_id) ?? []
      t.push(l)
      m.set(l.purchase_order_id, t)
    }
    for (const t of m.values()) t.sort((a, b) => a.sort_order - b.sort_order)
    return m
  }, [lignes])

  const depensesParBon = useMemo(() => {
    const m = new Map<string, CostAchat[]>()
    for (const c of depenses) {
      if (!c.purchase_order_id) continue
      const t = m.get(c.purchase_order_id) ?? []
      t.push(c)
      m.set(c.purchase_order_id, t)
    }
    return m
  }, [depenses])

  return {
    loading, error, suppliers, bons, lignes, lignesParBon, depenses, depensesParBon, seasons,
    besoins, propositions, aujourdhui: aujourdhuiParisISO(),
    saveSupplier, archiveSupplier, saveBon, supprimerBrouillon, envoyer, confirmer, annuler, receptionner, majNotes,
    creerBrouillons, reload: load,
  }
}

export type Achats = ReturnType<typeof useAchats>
