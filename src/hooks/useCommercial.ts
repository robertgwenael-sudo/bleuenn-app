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
  const insererLignesCommande = async (orderId: string, lignes: LigneVenteAInserer[]) => {
    if (lignes.length === 0) return
    ok(await supabase.from('order_lines').insert(lignes.map(l => ({ ...l, order_id: orderId }))) as Res<null>, 'enregistrement des lignes de commande')
  }

  const createOrder = async (v: CommandeSaisie, lignes: LigneVenteAInserer[]) => {
    const { seasonId: sid } = exigerSaison()
    const r = await supabase.from('orders').insert({ ...v, season_id: sid }).select().single()
    const o = ok<Order>(r as Res<Order>, 'création de la commande')
    try {
      await insererLignesCommande(o.id, lignes)
    } catch (e) {
      // Pas de commande vide laissée derrière une erreur
      await supabase.from('orders').delete().eq('id', o.id)
      throw e
    } finally {
      await load()
    }
    return o
  }

  /** Remplace l'en-tête et les lignes (lignes supprimées puis réinsérées). */
  const updateOrder = async (id: string, v: CommandeSaisie, lignes: LigneVenteAInserer[]) => {
    try {
      ok(await supabase.from('orders').update(v).eq('id', id) as Res<null>, 'modification de la commande')
      ok(await supabase.from('order_lines').delete().eq('order_id', id) as Res<null>, 'remplacement des lignes de commande')
      await insererLignesCommande(id, lignes)
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
   * « Livrer et facturer » : la vente, puis ses lignes avec le `sale_id`,
   * puis la commande (sale_id, livrée). Si une étape échoue après la
   * création de la vente, la vente est retirée : pas de vente orpheline
   * ni de commande facturée deux fois.
   */
  const livrerEtFacturer = async (order: Order, opts: { date: string; canal?: SaleChannel }) => {
    const { userId: uid } = exigerSaison()
    const client = order.client_id ? clientsParId.get(order.client_id) ?? null : null
    const lignes = lignesParCommande.get(order.id) ?? []
    const prep = commandeVersVente({ order, lignes, userId: uid, client, date: opts.date, canal: opts.canal })
    const r = await supabase.from('sales').insert(prep.vente).select().single()
    const vente = ok<Sale>(r as Res<Sale>, 'création de la vente')
    try {
      ok(await supabase.from('sale_lines').insert(prep.lignes.map(l => ({ ...l, sale_id: vente.id }))) as Res<null>, 'enregistrement des lignes de vente')
      ok(await supabase.from('orders').update({ sale_id: vente.id, status: 'livree' }).eq('id', order.id) as Res<null>, 'passage de la commande en livrée')
    } catch (e) {
      const annul = await supabase.from('sales').delete().eq('id', vente.id)
      if (annul.error) {
        console.error('[commercial] vente orpheline à supprimer à la main', vente.id, annul.error)
        toast.error('Vente créée sans commande soldée', { description: 'Supprimez-la dans Ventes avant de réessayer.' })
      }
      throw e
    } finally {
      marquerPerime()
      await load()
    }
    return { vente, total_centimes: prep.total_centimes }
  }

  // ─── Ventes ──────────────────────────────────────────────
  const createSale = async (v: VenteSaisie, lignes: LigneVenteAInserer[]) => {
    const { seasonId: sid, userId: uid } = exigerSaison()
    if (lignes.length === 0) throw new Error('Vente sans ligne')
    const t = totauxLignes(lignes)
    const client = v.client_id ? clientsParId.get(v.client_id) : undefined
    const r = await supabase.from('sales').insert({
      season_id: sid, user_id: uid, date: v.date, channel: v.channel,
      client_id: v.client_id, client: client?.name ?? null, notes: v.notes,
      // Indicatifs : recalculés par sale_recompute() à l'insertion des lignes
      tiges: t.tiges, prix_unitaire: t.prix_moyen_tige_centimes === null ? 0 : centimesEnEuros(t.prix_moyen_tige_centimes),
      cultures_sold: t.libelles,
    }).select().single()
    const vente = ok<Sale>(r as Res<Sale>, 'création de la vente')
    try {
      ok(await supabase.from('sale_lines').insert(lignes.map(l => ({ ...l, sale_id: vente.id }))) as Res<null>, 'enregistrement des lignes de vente')
    } catch (e) {
      await supabase.from('sales').delete().eq('id', vente.id)
      throw e
    } finally {
      marquerPerime()
      await load()
    }
    return { vente, total_centimes: t.total_centimes }
  }

  const deleteSale = async (id: string) => {
    const commande = orders.find(o => o.sale_id === id)
    try {
      ok(await supabase.from('sales').delete().eq('id', id) as Res<null>, 'suppression de la vente')
      // La commande soldée par cette vente redevient « prête » (sale_id remis à null par la base)
      if (commande) ok(await supabase.from('orders').update({ status: 'prete', sale_id: null }).eq('id', commande.id) as Res<null>, 'retour de la commande en « prête »')
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
