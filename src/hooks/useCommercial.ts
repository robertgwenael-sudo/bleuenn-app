'use client'
// Données commerciales : clients (partagés dans l'équipe), commandes et
// lignes de la saison, ventes de la saison avec leurs lignes.
// Ce hook fait ses propres requêtes et n'avale aucune erreur : chaque échec
// est affiché (toast) et journalisé, puis relancé pour que l'appelant
// n'enchaîne pas sur une étape à moitié faite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import {
  commandeVersVente, totauxLignes, centimesEnEuros,
  type Client, type ClientKind, type LigneVenteAInserer, type Order, type OrderLine, type OrderStatus,
  type Sale, type SaleChannel, type SaleLine,
} from '@/lib/domain'
import type { CultureCatalog } from '@/lib/types'

/** Ce dont le hook a besoin du contexte général (useBleuenn). */
export interface CtxCommercial {
  activeSeason: { id: string; revenue_goal?: number } | null
  user: { id: string } | null
  catalog: CultureCatalog[]
  sales: unknown[]
  reload: () => unknown
  refreshSeason?: () => Promise<unknown>
}

export type ClientSaisie = Pick<Client, 'name' | 'kind' | 'contact_name' | 'email' | 'phone' | 'address' | 'notes'>
export type CommandeSaisie = Pick<Order, 'client_id' | 'delivery_date' | 'status' | 'channel' | 'notes'>
export type VenteSaisie = { date: string; channel: SaleChannel; client_id: string | null; notes: string | null }

type Res<T> = { data: T | null; error: { message: string; code?: string } | null }

class ErreurAffichee extends Error {}

/** Lève sur erreur, après l'avoir montrée ; `null` sans erreur reste légitime. */
function ok<T>(r: Res<T>, contexte: string): T {
  if (r.error) {
    console.error(`[commercial] ${contexte}`, r.error)
    toast.error(`Échec : ${contexte}`, { description: r.error.message })
    throw new ErreurAffichee(r.error.message)
  }
  return r.data as T
}

/** Pour les écrans : une erreur déjà affichée n'a pas besoin d'un second toast. */
export function dejaAffichee(e: unknown) { return e instanceof ErreurAffichee }

export function useCommercial(ctx: CtxCommercial) {
  const supabase = useMemo(() => createClient(), [])
  const seasonId = ctx.activeSeason?.id ?? null
  const userId = ctx.user?.id ?? null

  const [clients, setClients] = useState<Client[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [saleLines, setSaleLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  // Les ventes du contexte général (tableau de bord…) sont rafraîchies au
  // départ de l'écran, pour ne pas le démonter à chaque enregistrement.
  const ctxPerime = useRef(false)
  const reloadCtx = useRef(ctx.reload)
  reloadCtx.current = ctx.reload
  useEffect(() => () => { if (ctxPerime.current) reloadCtx.current() }, [])
  // Si le contexte sait recharger la saison sans tout démonter, on le fait tout de suite.
  const refreshRef = useRef(ctx.refreshSeason)
  refreshRef.current = ctx.refreshSeason
  const marquerPerime = () => {
    if (refreshRef.current) { void refreshRef.current(); return }
    ctxPerime.current = true
  }

  const load = useCallback(async () => {
    if (!seasonId) { setLoading(false); return }
    try {
      const [c, o, ol, s, sl] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('orders').select('*').eq('season_id', seasonId).order('delivery_date'),
        supabase.from('order_lines').select('*').eq('season_id', seasonId).order('created_at'),
        supabase.from('sales').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
        supabase.from('sale_lines').select('*').eq('season_id', seasonId).order('created_at'),
      ])
      setClients(ok<Client[]>(c as Res<Client[]>, 'lecture des clients') ?? [])
      setOrders(ok<Order[]>(o as Res<Order[]>, 'lecture des commandes') ?? [])
      setOrderLines(ok<OrderLine[]>(ol as Res<OrderLine[]>, 'lecture des lignes de commande') ?? [])
      setSales(ok<Sale[]>(s as Res<Sale[]>, 'lecture des ventes') ?? [])
      setSaleLines(ok<SaleLine[]>(sl as Res<SaleLine[]>, 'lecture des lignes de vente') ?? [])
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, seasonId])

  useEffect(() => { setLoading(true); load() }, [load])

  // ─── Index ───────────────────────────────────────────────
  const clientsParId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const lignesParCommande = useMemo(() => {
    const m = new Map<string, OrderLine[]>()
    for (const l of orderLines) m.set(l.order_id, [...(m.get(l.order_id) ?? []), l])
    return m
  }, [orderLines])
  const lignesParVente = useMemo(() => {
    const m = new Map<string, SaleLine[]>()
    for (const l of saleLines) m.set(l.sale_id, [...(m.get(l.sale_id) ?? []), l])
    return m
  }, [saleLines])
  /** Ventes au format du domaine : lignes jointes, ventes historiques sans lignes conservées. */
  const ventes: (Sale & { lignes: SaleLine[] })[] = useMemo(
    () => sales.map(v => ({ ...v, lignes: lignesParVente.get(v.id) ?? [] })),
    [sales, lignesParVente],
  )

  const exigerSaison = () => {
    if (!seasonId || !userId) {
      toast.error('Aucune saison active')
      throw new ErreurAffichee('Aucune saison active')
    }
    return { seasonId, userId }
  }

  // ─── Clients ─────────────────────────────────────────────
  const createClientFiche = async (v: ClientSaisie) => {
    const r = await supabase.from('clients').insert(v).select().single()
    const c = ok<Client>(r as Res<Client>, 'création du client')
    await load()
    return c
  }
  const updateClient = async (id: string, v: Partial<ClientSaisie>) => {
    ok(await supabase.from('clients').update(v).eq('id', id) as Res<null>, 'modification du client')
    await load()
  }
  const archiveClient = async (id: string, archive: boolean) => {
    ok(await supabase.from('clients').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', id) as Res<null>,
      archive ? 'archivage du client' : 'réactivation du client')
    await load()
  }
  /** Suppression refusée dès qu'une vente ou une commande (toutes saisons) cite le client. */
  const deleteClient = async (id: string) => {
    const v = ok<{ id: string }[]>(await supabase.from('sales').select('id').eq('client_id', id).limit(1) as Res<{ id: string }[]>, 'vérification des ventes du client')
    const o = ok<{ id: string }[]>(await supabase.from('orders').select('id').eq('client_id', id).limit(1) as Res<{ id: string }[]>, 'vérification des commandes du client')
    if ((v?.length ?? 0) > 0 || (o?.length ?? 0) > 0) {
      toast.error('Suppression impossible', { description: 'Ce client a des ventes ou des commandes : archivez-le plutôt.' })
      return false
    }
    ok(await supabase.from('clients').delete().eq('id', id) as Res<null>, 'suppression du client')
    await load()
    return true
  }

  // ─── Commandes ───────────────────────────────────────────
  // Écritures atomiques côté base (migration 007) : en-tête et lignes passent
  // ensemble ou pas du tout, plus de suppression de secours depuis le navigateur.
  const lignesJson = (lignes: LigneVenteAInserer[]) => lignes.map(l => ({
    culture_id: l.culture_id ?? null, label: l.label, unit: l.unit, quantity: l.quantity,
    stems_per_unit: l.stems_per_unit, unit_price: l.unit_price,
  }))

  const createOrder = async (v: CommandeSaisie, lignes: LigneVenteAInserer[]) => {
    const { seasonId: sid } = exigerSaison()
    try {
      const id = ok<string>(await supabase.rpc('enregistrer_commande', {
        p_order_id: null, p_order: { ...v, season_id: sid }, p_lines: lignesJson(lignes),
      }) as Res<string>, 'création de la commande')
      return { ...v, id, season_id: sid } as unknown as Order
    } finally {
      await load()
    }
  }

  /** Remplace l'en-tête et les lignes, d'un bloc. */
  const updateOrder = async (id: string, v: CommandeSaisie, lignes: LigneVenteAInserer[]) => {
    try {
      ok(await supabase.rpc('enregistrer_commande', { p_order_id: id, p_order: v, p_lines: lignesJson(lignes) }) as Res<string>,
        'modification de la commande')
    } finally {
      await load()
    }
  }

  const setOrderStatus = async (id: string, status: OrderStatus) => {
    // Mise à jour optimiste : le geste doit paraître immédiat
    setOrders(os => os.map(o => (o.id === id ? { ...o, status } : o)))
    try {
      ok(await supabase.from('orders').update({ status }).eq('id', id) as Res<null>, 'changement de statut')
    } finally {
      await load()
    }
  }

  const deleteOrder = async (id: string) => {
    ok(await supabase.from('orders').delete().eq('id', id) as Res<null>, 'suppression de la commande')
    await load()
  }

  /**
   * « Livrer et facturer » : vente, lignes et commande soldée en une seule
   * transaction (livrer_commande). La base verrouille la commande : un double
   * clic ou deux téléphones ne peuvent pas facturer deux fois.
   */
  const livrerEtFacturer = async (order: Order, opts: { date: string; canal?: SaleChannel }) => {
    const { userId: uid } = exigerSaison()
    const client = order.client_id ? clientsParId.get(order.client_id) ?? null : null
    const lignes = lignesParCommande.get(order.id) ?? []
    const prep = commandeVersVente({ order, lignes, userId: uid, client, date: opts.date, canal: opts.canal })
    try {
      const id = ok<string>(await supabase.rpc('livrer_commande', {
        p_order_id: order.id,
        p_sale: { date: prep.vente.date, channel: prep.vente.channel, client: prep.vente.client, notes: prep.vente.notes },
        p_lines: lignesJson(prep.lignes),
      }) as Res<string>, 'livraison et facturation')
      return { vente: { ...prep.vente, id } as unknown as Sale, total_centimes: prep.total_centimes }
    } finally {
      marquerPerime()
      await load()
    }
  }

  // ─── Ventes ──────────────────────────────────────────────
  const createSale = async (v: VenteSaisie, lignes: LigneVenteAInserer[]) => {
    const { seasonId: sid } = exigerSaison()
    if (lignes.length === 0) throw new Error('Vente sans ligne')
    const t = totauxLignes(lignes)
    const client = v.client_id ? clientsParId.get(v.client_id) : undefined
    try {
      const id = ok<string>(await supabase.rpc('enregistrer_vente', {
        p_sale: { season_id: sid, date: v.date, channel: v.channel, client_id: v.client_id, client: client?.name ?? null, notes: v.notes },
        p_lines: lignesJson(lignes),
      }) as Res<string>, 'création de la vente')
      return { vente: { id, season_id: sid, ...v } as unknown as Sale, total_centimes: t.total_centimes }
    } finally {
      marquerPerime()
      await load()
    }
  }

  const deleteSale = async (id: string) => {
    const commande = orders.find(o => o.sale_id === id)
    try {
      // La commande soldée par cette vente redevient « prête » dans la même transaction
      ok(await supabase.rpc('supprimer_vente', { p_sale_id: id }) as Res<string | null>, 'suppression de la vente')
    } finally {
      marquerPerime()
      await load()
    }
    return { commande }
  }

  return {
    loading, erreur, reload: load,
    clients, clientsParId, orders, orderLines, lignesParCommande, sales, saleLines, lignesParVente, ventes,
    createClient: createClientFiche, updateClient, archiveClient, deleteClient,
    createOrder, updateOrder, setOrderStatus, deleteOrder, livrerEtFacturer,
    createSale, deleteSale,
  }
}

export type Commercial = ReturnType<typeof useCommercial>
export type { ClientKind }
