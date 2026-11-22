'use client'
// ============================================================
// Données du « prévu / réel » : pertes, réel cumulé par plantation,
// lignes de vente, et (pour la disponibilité) tout le plan de la ferme.
// ------------------------------------------------------------
// Ce hook ne touche pas à useBleuenn : il reçoit le contexte (saison
// active, plantations, récoltes, ventes) et fait ses propres requêtes.
// Aucune erreur n'est avalée : chaque `error` Supabase part dans la
// console ET dans un toast, et l'écran affiche un état d'erreur plutôt
// qu'un tableau vide trompeur.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import type {
  DateISO, HarvestLite, Loss, LossReason, Order, OrderLine, PlantingActual, SaleLine,
} from '@/lib/domain'
import type { CommandeAvecLignes, LossLite, PlantingReel, VenteCalcul } from '@/lib/domain'
import { avecDatesDeRecolte, sansDatesDeRecolte } from '@/lib/domain/cultures'

const supabase = createClient()

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface ReelCtx {
  activeSeason: { id: string; farm_id?: string | null; name?: string; year?: number } | null
  user: { id: string } | null
  profile?: { farm_name?: string | null } | null
  plantings: any[]
  /** Toute la ferme, vivaces sans floraison comprises (013). */
  farmPlantingsTout?: any[]
  harvests: any[]
  sales: any[]
  catalog?: any[]
  reload?: () => unknown
}

/** Date du jour à Paris, `YYYY-MM-DD` (jamais l'UTC de `toISOString`). */
export function aujourdhuiParis(): DateISO {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

type Res<T> = { data: T | null; error: { message: string; code?: string } | null }

/** Lève sur erreur, après l'avoir signalée (console + toast). */
function verifier<T>(r: Res<T>, contexte: string): T {
  if (r.error) {
    console.error(`[réel] ${contexte}`, r.error)
    toast.error(`Lecture impossible : ${contexte}`, { description: r.error.message })
    throw new Error(`${contexte} : ${r.error.message}`)
  }
  return (r.data ?? []) as T
}

export interface NouvellePerte {
  planting_id: string
  date: DateISO
  tiges: number
  reason: LossReason
  notes?: string
}

// ------------------------------------------------------------
// Saison active : pertes, réel cumulé, lignes de vente
// ------------------------------------------------------------
export function useReel(ctx: ReelCtx) {
  const seasonId = ctx.activeSeason?.id ?? null
  const [losses, setLosses] = useState<Loss[]>([])
  const [actuals, setActuals] = useState<PlantingActual[]>([])
  const [saleLines, setSaleLines] = useState<SaleLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!seasonId) { setLoading(false); return }
    try {
      const [l, a, s] = await Promise.all([
        supabase.from('losses').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
        supabase.from('planting_actuals').select('*').eq('season_id', seasonId),
        supabase.from('sale_lines').select('*').eq('season_id', seasonId),
      ])
      setLosses(verifier<Loss[]>(l, 'pertes'))
      setActuals(verifier<PlantingActual[]>(a, 'réel par plantation'))
      setSaleLines(verifier<SaleLine[]>(s, 'lignes de vente'))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [seasonId])

  // Recharge aussi quand les récoltes changent : planting_actuals en dépend.
  useEffect(() => { load() }, [load, ctx.harvests])

  const addLoss = useCallback(async (p: NouvellePerte): Promise<boolean> => {
    if (!seasonId) { toast.error('Aucune saison active'); return false }
    const pl = ctx.plantings.find(x => x.id === p.planting_id)
    const { error: err } = await supabase.from('losses').insert({
      season_id: seasonId, planting_id: p.planting_id, culture_id: pl?.culture_id ?? null,
      date: p.date, tiges: p.tiges, reason: p.reason, notes: p.notes?.trim() || null,
    })
    if (err) {
      console.error('[réel] enregistrement de la perte', err)
      toast.error('La perte n’a pas été enregistrée', { description: err.message })
      return false
    }
    await load()
    return true
  }, [seasonId, ctx.plantings, load])

  const deleteLoss = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from('losses').delete().eq('id', id)
    if (err) {
      console.error('[réel] suppression de la perte', err)
      toast.error('La perte n’a pas été supprimée', { description: err.message })
      return false
    }
    await load()
    return true
  }, [load])

  /** Ventes de la saison avec leurs lignes, au format du domaine. */
  const ventes: VenteCalcul[] = useMemo(() => {
    const parVente = new Map<string, SaleLine[]>()
    for (const l of saleLines) {
      const t = parVente.get(l.sale_id) ?? []
      t.push(l)
      parVente.set(l.sale_id, t)
    }
    return (ctx.sales || []).map((s: any) => ({
      id: s.id, date: s.date, channel: s.channel, total: s.total, tiges: s.tiges,
      client_id: s.client_id ?? null, client: s.client ?? null, order_id: s.order_id ?? null, season_id: s.season_id,
      lignes: parVente.get(s.id) ?? [],
    }))
  }, [ctx.sales, saleLines])

  const pertes: LossLite[] = losses
  return { loading, error, losses, pertes, actuals, saleLines, ventes, addLoss, deleteLoss, reload: load }
}

// ------------------------------------------------------------
// Ferme entière : pour la disponibilité sur 12 mois glissants,
// qui déborde de la saison active (saison suivante, successions).
// ------------------------------------------------------------
export interface DonneesFerme {
  fermeNom: string
  plantings: PlantingReel[]
  /** Plantations sans date de récolte (floraison à renseigner, jours au champ manquants) : hors calcul, à signaler. */
  sansDates: PlantingReel[]
  recoltes: HarvestLite[]
  pertes: LossLite[]
  commandes: CommandeAvecLignes[]
}

export function useDisponibiliteFerme(ctx: ReelCtx) {
  const farmId = ctx.activeSeason?.farm_id ?? null
  const seasonId = ctx.activeSeason?.id ?? null
  const [data, setData] = useState<DonneesFerme | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!seasonId) { setLoading(false); return }
    try {
      // Saisons de la ferme ; à défaut de ferme, la seule saison active.
      let seasonIds = [seasonId]
      let fermeNom = ctx.profile?.farm_name || 'la ferme'
      if (farmId) {
        const [s, f] = await Promise.all([
          supabase.from('seasons').select('id').eq('farm_id', farmId),
          supabase.from('farms').select('name').eq('id', farmId).maybeSingle(),
        ])
        const ids = verifier<{ id: string }[]>(s, 'saisons de la ferme').map(x => x.id)
        if (ids.length) seasonIds = ids
        const ferme = verifier<{ name: string } | null>(f as Res<{ name: string } | null>, 'ferme')
        if (ferme && !Array.isArray(ferme) && ferme.name) fermeNom = ferme.name
      }
      const [p, h, l, o, ol] = await Promise.all([
        farmId
          ? supabase.from('plantings_full').select('*').eq('farm_id', farmId)
          : supabase.from('plantings_full').select('*').eq('season_id', seasonId),
        supabase.from('harvests').select('planting_id, date, tiges').in('season_id', seasonIds),
        supabase.from('losses').select('planting_id, culture_id, date, tiges, reason').in('season_id', seasonIds),
        supabase.from('orders').select('id, status, delivery_date').in('season_id', seasonIds),
        supabase.from('order_lines').select('order_id, culture_id, label, quantity, stems_per_unit').in('season_id', seasonIds),
      ])
      // 013 : sans début de floraison, pas de prévu ni de disponibilités, mais signalées à l'écran
      const toutes = verifier<PlantingReel[]>(p, 'plantations de la ferme')
      const plantings = avecDatesDeRecolte(toutes)
      const sansDates = sansDatesDeRecolte(toutes)
      const recoltes = verifier<HarvestLite[]>(h, 'récoltes de la ferme')
      const pertes = verifier<LossLite[]>(l, 'pertes de la ferme')
      const orders = verifier<Pick<Order, 'id' | 'status' | 'delivery_date'>[]>(o, 'commandes')
      const lines = verifier<(Pick<OrderLine, 'order_id' | 'culture_id' | 'label' | 'quantity' | 'stems_per_unit'>)[]>(ol, 'lignes de commande')
      const parCommande = new Map<string, typeof lines>()
      for (const x of lines) {
        const t = parCommande.get(x.order_id) ?? []
        t.push(x)
        parCommande.set(x.order_id, t)
      }
      setData({
        fermeNom, plantings, sansDates, recoltes, pertes,
        commandes: orders.map(order => ({ order, lignes: parCommande.get(order.id) ?? [] })),
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [farmId, seasonId, ctx.profile?.farm_name])

  useEffect(() => { load() }, [load, ctx.harvests, ctx.plantings])

  return { loading, error, data, reload: load }
}
