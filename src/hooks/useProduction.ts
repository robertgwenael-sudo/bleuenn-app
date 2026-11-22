'use client'
// ============================================================
// Semis et production (migration 015) : réglages de la ferme (taux de
// pertes, tables et plaques de semis) et lignes « Quoi semer ».
// ------------------------------------------------------------
// Ne touche pas à useBleuenn : prend dans le contexte la ferme, les
// plantations de la ferme, et fait sa propre lecture de `farms`.
// Aucune erreur avalée : toast + console.error. Si la migration 015 n'est
// pas appliquée (colonne inconnue), l'écran le DIT et calcule avec les taux
// du tableur (30 %) ; la capacité de la pépinière reste « non renseignée ».
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { reglagesPepiniere, tauxDeLaFerme, type ReglagesPepiniere, type TauxPertes } from '@/lib/domain/production'
import type { FarmProduction } from '@/lib/domain'

const supabase = createClient()

export interface ProductionCtx {
  activeSeason: { id: string; farm_id?: string | null } | null
  farm?: { id: string } | null
  isFarmOwner?: boolean
}

export const COLONNES_PRODUCTION = [
  'taux_perte_semis', 'taux_perte_champ', 'table_semis_largeur_cm', 'table_semis_longueur_cm', 'table_semis_nombre',
  'table_semis_debord_cm', 'plaque_largeur_cm', 'plaque_longueur_cm', 'plaque_trous',
] as const

/** Colonne ou table absente : la migration 015 n'est pas appliquée. */
const migrationAbsente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist/i.test(e.message ?? ''))

export function useProduction(ctx: ProductionCtx) {
  const farmId = ctx.farm?.id ?? ctx.activeSeason?.farm_id ?? null
  const [reglages, setReglages] = useState<FarmProduction | null>(null)
  const [migration015, setMigration015] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    const r = await supabase.from('farms')
      .select('taux_perte_semis, taux_perte_champ, table_semis_largeur_cm, table_semis_longueur_cm, table_semis_nombre, table_semis_debord_cm, plaque_largeur_cm, plaque_longueur_cm, plaque_trous')
      .eq('id', farmId).maybeSingle()
    if (r.error) {
      if (migrationAbsente(r.error)) {
        console.error('[production] réglages de la ferme : migration 015 non appliquée', r.error)
        setMigration015(false); setReglages(null); setError(null)
      } else {
        console.error('[production] lecture des réglages de la ferme', r.error)
        toast.error('Lecture impossible : réglages de production', { description: r.error.message, id: 'production-reglages' })
        setError(r.error.message)
      }
    } else {
      setMigration015(true)
      setReglages((r.data as FarmProduction | null) ?? null)
      setError(null)
    }
    setLoading(false)
  }, [farmId])

  useEffect(() => { load() }, [load])

  const taux: TauxPertes = useMemo(() => {
    try { return tauxDeLaFerme(reglages) } catch (e) {
      console.error('[production] taux de pertes illisibles', e)
      return tauxDeLaFerme(null)
    }
  }, [reglages])
  const pepiniere: ReglagesPepiniere = useMemo(() => reglagesPepiniere(reglages), [reglages])

  /** Enregistre les réglages (owner seulement, RLS de `farms`). */
  const enregistrer = useCallback(async (valeurs: Partial<Record<(typeof COLONNES_PRODUCTION)[number], number | null>>): Promise<boolean> => {
    if (!farmId) { toast.error('Aucune ferme'); return false }
    if (!migration015) { toast.error('Réglages indisponibles : la migration 015 n’est pas appliquée'); return false }
    // .select() : une mise à jour filtrée par la RLS renvoie zéro ligne, sans erreur.
    const { data, error: err } = await supabase.from('farms').update(valeurs).eq('id', farmId).select('id')
    if (err) {
      console.error('[production] enregistrement des réglages', err)
      toast.error('Échec : enregistrement des réglages', { description: err.message })
      return false
    }
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.error('[production] réglages : aucune ligne modifiée (droits insuffisants ?)')
      toast.error('Échec : seul un propriétaire de la ferme peut modifier ces réglages')
      return false
    }
    await load()
    return true
  }, [farmId, migration015, load])

  return { loading, error, reglages, migration015, taux, pepiniere, enregistrer, reload: load }
}

export type Production = ReturnType<typeof useProduction>
