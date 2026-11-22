'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { avecDatesDeRecolte } from '@/lib/domain/cultures'
import {
  deplacerTache, ligneCocherTache, tachesAAfficher,
  type CibleDeplacement, type DateISO, type PlanningMensuel, type PlantingFull, type PlantingTaches,
  type StoredTask, type Tache, type TaskKind,
} from '@/lib/domain'

const supabase = createClient()

/** Date civile du jour à Paris (`YYYY-MM-DD`), quel que soit le fuseau de l'appareil. */
export function aujourdhuiParis(): DateISO {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

export interface MembreEquipe {
  user_id: string
  nom: string
  initiales: string
  moi: boolean
}

/** Ce dont le hook a besoin du contexte global (fourni par useBleuenn). */
export interface CtxTaches {
  user: { id: string } | null
  activeSeason: { id: string; farm_id?: string | null } | null
  teamMembers?: { user_id: string; email?: string | null; owner_name?: string | null }[]
  farmTeam?: { user_id: string; email?: string | null; owner_name?: string | null }[]
  gardens?: { id: string; name: string; planches?: { id: string; name: string }[] }[]
}

export interface NouvelleTache {
  title: string
  kind: TaskKind
  due_date: DateISO | null
  planche_id: string | null
  assigned_to: string | null
  notes: string | null
}

const COLONNES_TACHE = 'id, season_id, title, kind, due_date, planting_id, planche_id, assigned_to, auto_key, done_at, done_by, notes'

function signaler(contexte: string, error: { message: string }) {
  console.error(`${contexte} :`, error)
  toast.error(contexte, { description: error.message })
}

function initiales(nom: string): string {
  const mots = nom.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((mots[0]?.[0] ?? '?') + (mots[1]?.[0] ?? '')).toUpperCase()
}

/**
 * Tâches de la ferme : plantations de TOUTES les saisons de la ferme (les
 * cultures chevauchent les saisons) et lignes `tasks` de ces saisons. La
 * logique (génération, fusion, regroupement) est dans `@/lib/domain`.
 */
export function useTaches(ctx: CtxTaches) {
  const farmId = ctx.activeSeason?.farm_id ?? null
  const activeSeasonId = ctx.activeSeason?.id ?? null
  const userId = ctx.user?.id ?? null

  const [plantings, setPlantings] = useState<PlantingFull[]>([])
  const [stockees, setStockees] = useState<StoredTask[]>([])
  const [saisons, setSaisons] = useState<{ id: string; year: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [aujourdhui, setAujourdhui] = useState<DateISO>(aujourdhuiParis)
  const stockeesRef = useRef(stockees)
  useEffect(() => { stockeesRef.current = stockees }, [stockees])

  // La date du jour change à minuit (Paris) : on la relit régulièrement.
  useEffect(() => {
    const t = setInterval(() => setAujourdhui(aujourdhuiParis()), 60_000)
    return () => clearInterval(t)
  }, [])

  const charger = useCallback(async () => {
    if (!userId || (!farmId && !activeSeasonId)) { setLoading(false); return }
    setLoading(true)
    setErreur(null)
    // Saisons de la ferme ; à défaut de farm_id (avant migration 006), la saison active seule.
    let ids: string[] = activeSeasonId ? [activeSeasonId] : []
    let ss: { id: string; year: number }[] = []
    if (farmId) {
      const r = await supabase.from('seasons').select('id, year').eq('farm_id', farmId)
      if (r.error) { signaler('Impossible de charger les saisons de la ferme', r.error); setErreur(r.error.message); setLoading(false); return }
      ss = (r.data ?? []) as { id: string; year: number }[]
      if (ss.length) ids = ss.map(s => s.id)
    }
    const [pl, tk] = await Promise.all([
      farmId
        ? supabase.from('plantings_full').select('*').eq('farm_id', farmId)
        : supabase.from('plantings_full').select('*').in('season_id', ids),
      supabase.from('tasks').select(COLONNES_TACHE).in('season_id', ids),
    ])
    if (pl.error) { signaler('Impossible de charger les plantations', pl.error); setErreur(pl.error.message) }
    if (tk.error) { signaler('Impossible de charger les tâches', tk.error); setErreur(tk.error.message) }
    // 013 : une vivace sans début de floraison n'a pas de dates de récolte
    if (!pl.error) setPlantings(avecDatesDeRecolte((pl.data ?? []) as PlantingFull[]))
    if (!tk.error) setStockees((tk.data ?? []) as StoredTask[])
    setSaisons(ss)
    setLoading(false)
  }, [userId, farmId, activeSeasonId])

  useEffect(() => { charger() }, [charger])

  // ─── Équipe ─────────────────────────────
  // Équipe de la ferme (RPC farm_team), repli sur l'équipe de la saison.
  const equipe: MembreEquipe[] = useMemo(() => {
    const vus = new Set<string>()
    const out: MembreEquipe[] = []
    for (const m of (ctx.farmTeam?.length ? ctx.farmTeam : ctx.teamMembers) ?? []) {
      if (vus.has(m.user_id)) continue
      vus.add(m.user_id)
      const nom = (m.owner_name || '').trim() || m.email || 'Membre de l’équipe'
      out.push({ user_id: m.user_id, nom, initiales: initiales(nom), moi: m.user_id === userId })
    }
    if (userId && !vus.has(userId)) out.unshift({ user_id: userId, nom: 'Moi', initiales: 'MOI', moi: true })
    return out.sort((a, b) => Number(b.moi) - Number(a.moi))
  }, [ctx.farmTeam, ctx.teamMembers, userId])

  // ─── Lieux : planches connues par les plantations et les jardins ─────
  const lieux = useMemo(() => {
    const parPlanche = new Map<string, { planche: string; jardin: string | null }>()
    for (const g of ctx.gardens ?? []) for (const p of g.planches ?? []) parPlanche.set(p.id, { planche: p.name, jardin: g.name })
    for (const p of plantings) if (!parPlanche.has(p.planche_id)) parPlanche.set(p.planche_id, { planche: p.planche_name, jardin: p.garden_name })
    return parPlanche
  }, [ctx.gardens, plantings])

  const plantingParId = useMemo(() => new Map(plantings.map(p => [p.id, p])), [plantings])

  const planning: PlanningMensuel = useMemo(() => {
    const brut = tachesAAfficher({ plantings: plantings as PlantingTaches[], stockees, aujourdhui })
    // Les tâches libres n'ont ni culture ni lieu : on les retrouve par planting_id / planche_id.
    const enrichir = (t: Tache): Tache => {
      const p = t.planting_id ? plantingParId.get(t.planting_id) : undefined
      const l = t.planche_id ? lieux.get(t.planche_id) : undefined
      const culture_name = t.culture_name ?? p?.culture_name ?? null
      const planche_name = t.planche_name ?? p?.planche_name ?? l?.planche ?? null
      const garden_name = t.garden_name ?? p?.garden_name ?? l?.jardin ?? null
      return { ...t, culture_name, planche_name, garden_name }
    }
    return {
      en_retard: { ...brut.en_retard, taches: brut.en_retard.taches.map(enrichir) },
      sans_date: brut.sans_date.map(enrichir),
      mois: brut.mois.map(m => ({ ...m, semaines: m.semaines.map(s => ({ ...s, taches: s.taches.map(enrichir) })) })),
    }
  }, [plantings, stockees, aujourdhui, plantingParId, lieux])

  /** Toutes les tâches affichables, à plat (pour la vue courte du tableau de bord). */
  const taches: Tache[] = useMemo(() => [
    ...planning.en_retard.taches,
    ...planning.mois.flatMap(m => m.semaines.flatMap(s => s.taches)),
    ...planning.sans_date,
  ], [planning])

  // ─── Écritures ──────────────────────────
  /** Remplace (ou ajoute) une ligne stockée dans l'état local. */
  const poser = (row: StoredTask) => setStockees(prev => {
    const i = prev.findIndex(r => r.id === row.id || (row.auto_key && r.auto_key === row.auto_key && r.season_id === row.season_id))
    if (i < 0) return [...prev, row]
    const next = prev.slice(); next[i] = row; return next
  })

  /**
   * Écrit l'état d'une tâche : mise à jour par id pour une tâche libre ou
   * déjà stockée, upsert sur (season_id, auto_key) pour une tâche du plan.
   * Mise à jour optimiste, annulée en cas d'erreur.
   */
  const ecrire = async (t: Tache, champs: Partial<StoredTask>, libelleErreur: string): Promise<boolean> => {
    const avant = stockeesRef.current
    const existante = t.task_id ? avant.find(r => r.id === t.task_id) : undefined
    const base: StoredTask = existante ?? {
      id: `tmp:${t.cle}`, season_id: t.season_id, title: t.title, kind: t.kind, due_date: t.due_date,
      planting_id: t.planting_id, planche_id: t.planche_id, assigned_to: t.assigned_to, auto_key: t.auto_key,
      done_at: t.done_at, done_by: t.done_by, notes: t.notes,
    }
    poser({ ...base, ...champs })
    let res
    if (t.task_id) {
      res = await supabase.from('tasks').update(champs).eq('id', t.task_id).select(COLONNES_TACHE).single()
    } else if (t.auto_key) {
      const ligne = {
        season_id: t.season_id, auto_key: t.auto_key, title: t.title, kind: t.kind, due_date: t.due_date,
        planting_id: t.planting_id, planche_id: t.planche_id, ...champs,
      }
      res = await supabase.from('tasks').upsert(ligne, { onConflict: 'season_id,auto_key' }).select(COLONNES_TACHE).single()
    } else {
      signaler(libelleErreur, { message: 'Tâche sans identifiant ni clé du plan.' })
      setStockees(avant); return false
    }
    if (res.error) { signaler(libelleErreur, res.error); setStockees(avant); return false }
    setStockees(prev => {
      const sans = prev.filter(r => r.id !== `tmp:${t.cle}`)
      const row = res.data as StoredTask
      const i = sans.findIndex(r => r.id === row.id)
      if (i < 0) return [...sans, row]
      const next = sans.slice(); next[i] = row; return next
    })
    return true
  }

  const cocher = async (t: Tache, fait: boolean) => {
    if (!userId) return false
    const maintenant = new Date().toISOString()
    const { done_at, done_by } = ligneCocherTache(t, fait, userId, maintenant)
    return ecrire(t, { done_at, done_by }, fait ? 'La tâche n’a pas pu être cochée' : 'La tâche n’a pas pu être décochée')
  }

  const assigner = (t: Tache, assigned_to: string | null) =>
    ecrire(t, { assigned_to }, 'L’assignation n’a pas été enregistrée')

  const noter = (t: Tache, notes: string | null) =>
    ecrire(t, { notes: notes?.trim() ? notes.trim() : null }, 'La note n’a pas été enregistrée')

  /** Lève (sans rien écrire) si la tâche vient du plan : l'appelant affiche le message. */
  const deplacer = async (t: Tache, cible: CibleDeplacement) => {
    const maj = deplacerTache(t, cible)
    const ok = await ecrire(t, { due_date: maj.due_date }, 'La tâche n’a pas pu être déplacée')
    return ok ? maj.due_date : null
  }

  const creer = async (n: NouvelleTache) => {
    if (!userId) return false
    // Saison de rattachement : celle de l'année de l'échéance si la ferme l'a, sinon la saison active.
    const annee = n.due_date ? Number(n.due_date.slice(0, 4)) : null
    const season_id = saisons.find(s => s.year === annee)?.id ?? activeSeasonId
    if (!season_id) { signaler('La tâche n’a pas été créée', { message: 'Aucune saison active.' }); return false }
    const r = await supabase.from('tasks').insert({
      season_id, title: n.title.trim(), kind: n.kind, due_date: n.due_date, planche_id: n.planche_id,
      assigned_to: n.assigned_to, notes: n.notes?.trim() || null, auto_key: null, planting_id: null,
      done_at: null, done_by: null, created_by: userId,
    }).select(COLONNES_TACHE).single()
    if (r.error) { signaler('La tâche n’a pas été créée', r.error); return false }
    setStockees(prev => [...prev, r.data as StoredTask])
    return true
  }

  return {
    loading, erreur, aujourdhui, planning, taches, equipe, plantings,
    cocher, assigner, noter, deplacer, creer, recharger: charger,
  }
}

export type UseTaches = ReturnType<typeof useTaches>
