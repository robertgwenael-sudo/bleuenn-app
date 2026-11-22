'use client'
// ============================================================
// Coûts & rentabilité : dépenses (costs), temps passé (time_entries),
// lignes de vente de la saison et taux horaire de la ferme (008).
// ------------------------------------------------------------
// Ne touche pas à useBleuenn : prend dans le contexte la saison active,
// l'utilisateur et les ventes, et fait ses propres requêtes.
// Aucune erreur avalée : chaque `error` Supabase part dans la console ET
// dans un toast ; une lecture refusée met l'écran en état d'erreur plutôt
// que d'afficher un journal vide trompeur.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import {
  centimesEnEuros,
  type Cost, type CostCategory, type DateISO, type EurosNumeric, type SaleLine, type TimeEntry, type TimeKind,
} from '@/lib/domain'
import type { VenteCalcul } from '@/lib/domain/ventes'

const supabase = createClient()

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface CoutsCtx {
  activeSeason: { id: string; farm_id?: string | null } | null
  user: { id: string } | null
  sales: any[]
}

type Erreur = { message: string; code?: string } | null
type Res<T> = { data: T | null; error: Erreur }

function verifier<T>(r: Res<T>, contexte: string, repli: T): T {
  if (r.error) {
    console.error(`[coûts] lecture : ${contexte}`, r.error)
    toast.error(`Lecture impossible : ${contexte}`, { description: r.error.message, id: `couts-${contexte}` })
    throw new Error(`${contexte} : ${r.error.message}`)
  }
  return (r.data ?? repli) as T
}

function echec(err: Erreur, quoi: string): boolean {
  if (!err) return false
  console.error(`[coûts] ${quoi}`, err)
  toast.error(`Échec : ${quoi}`, { description: err.message })
  return true
}

export interface NouvelleDepense {
  date: DateISO
  category: CostCategory
  /** Montant en centimes entiers ; converti en euros à l'écriture. */
  montant_centimes: number
  culture_id: string | null
  planche_id: string | null
  supplier?: string
  notes?: string
}

export interface NouveauTemps {
  date: DateISO
  minutes: number
  kind: TimeKind
  culture_id: string | null
  planche_id: string | null
  user_id: string
  notes?: string
}

export function useCouts(ctx: CoutsCtx) {
  const seasonId = ctx.activeSeason?.id ?? null
  const farmId = ctx.activeSeason?.farm_id ?? null
  const [costs, setCosts] = useState<Cost[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [saleLines, setSaleLines] = useState<SaleLine[]>([])
  const [tauxHoraire, setTaux] = useState<EurosNumeric | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!seasonId) { setLoading(false); return }
    try {
      const [c, t, s, f] = await Promise.all([
        supabase.from('costs').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
        supabase.from('time_entries').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
        supabase.from('sale_lines').select('*').eq('season_id', seasonId),
        farmId
          ? supabase.from('farms').select('taux_horaire').eq('id', farmId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      setCosts(verifier<Cost[]>(c as Res<Cost[]>, 'dépenses', []))
      setTimeEntries(verifier<TimeEntry[]>(t as Res<TimeEntry[]>, 'temps passé', []))
      setSaleLines(verifier<SaleLine[]>(s as Res<SaleLine[]>, 'lignes de vente', []))
      const ferme = verifier<{ taux_horaire: EurosNumeric | null } | null>(f as Res<{ taux_horaire: EurosNumeric | null }>, 'taux horaire', null)
      setTaux(ferme?.taux_horaire ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [seasonId, farmId])

  // Recharge aussi quand les ventes changent (lignes de vente).
  useEffect(() => { load() }, [load, ctx.sales])

  const addCost = useCallback(async (d: NouvelleDepense): Promise<boolean> => {
    if (!seasonId) { toast.error('Aucune saison active'); return false }
    if (!Number.isSafeInteger(d.montant_centimes) || d.montant_centimes <= 0) {
      toast.error('Montant invalide'); return false
    }
    // farm_id n'est pas envoyé : le trigger le recopie de la saison.
    const { error: err } = await supabase.from('costs').insert({
      season_id: seasonId, date: d.date, category: d.category, amount: centimesEnEuros(d.montant_centimes),
      culture_id: d.culture_id, planche_id: d.planche_id,
      supplier: d.supplier?.trim() || null, notes: d.notes?.trim() || null,
    })
    if (echec(err, 'enregistrement de la dépense')) return false
    await load()
    return true
  }, [seasonId, load])

  const deleteCost = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from('costs').delete().eq('id', id)
    if (echec(err, 'suppression de la dépense')) return false
    await load()
    return true
  }, [load])

  const addTime = useCallback(async (t: NouveauTemps): Promise<boolean> => {
    if (!seasonId) { toast.error('Aucune saison active'); return false }
    if (!Number.isInteger(t.minutes) || t.minutes <= 0) { toast.error('Durée invalide'); return false }
    const { error: err } = await supabase.from('time_entries').insert({
      season_id: seasonId, date: t.date, minutes: t.minutes, kind: t.kind,
      culture_id: t.culture_id, planche_id: t.planche_id, user_id: t.user_id, notes: t.notes?.trim() || null,
    })
    if (echec(err, 'enregistrement du temps')) return false
    await load()
    return true
  }, [seasonId, load])

  const deleteTime = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from('time_entries').delete().eq('id', id)
    if (echec(err, 'suppression du temps')) return false
    await load()
    return true
  }, [load])

  /** Taux en centimes, ou null pour l'effacer. Réservé aux owners (RLS de `farms`). */
  const setTauxHoraire = useCallback(async (centimes: number | null): Promise<boolean> => {
    if (!farmId) { toast.error('Aucune ferme'); return false }
    if (centimes !== null && (!Number.isSafeInteger(centimes) || centimes <= 0)) {
      toast.error('Taux horaire invalide'); return false
    }
    // .select() : une mise à jour filtrée par la RLS ne renvoie pas d'erreur,
    // seulement zéro ligne. On le détecte pour ne pas annoncer un succès.
    const { data, error: err } = await supabase.from('farms')
      .update({ taux_horaire: centimes === null ? null : centimesEnEuros(centimes) })
      .eq('id', farmId).select('taux_horaire')
    if (echec(err, 'modification du taux horaire')) return false
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.error('[coûts] taux horaire : aucune ligne modifiée (droits insuffisants ?)')
      toast.error('Échec : seul un propriétaire de la ferme peut modifier le taux horaire')
      return false
    }
    await load()
    return true
  }, [farmId, load])

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
      season_id: s.season_id, lignes: parVente.get(s.id) ?? [],
    }))
  }, [ctx.sales, saleLines])

  return {
    loading, error, costs, timeEntries, saleLines, ventes, tauxHoraire,
    addCost, deleteCost, addTime, deleteTime, setTauxHoraire, reload: load,
  }
}
