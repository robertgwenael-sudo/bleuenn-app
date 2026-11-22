'use client'
// ============================================================
// Contrôle d'un semis face à la capacité des tables de semis, à appeler
// depuis un formulaire de plantation AVANT/APRÈS l'enregistrement.
// ALERTE SEULEMENT (choix de Marine) : l'enregistrement passe toujours ;
// si le semis fait dépasser, on avertit avec les propositions du domaine
// (date la plus proche qui tient, surface max, plant acheté / semis direct).
// Pas de contrôle en base : une limite qui ne bloque pas n'a pas sa place
// dans un trigger.
// ============================================================
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { formatDateShort } from '@/lib/types'
import {
  capacitePepiniere, controlerSemis, ligneSemis, occupationsCellule, propositionsTexte,
  type CapacitePepiniere, type ControlePepiniere, type LigneSemis,
} from '@/lib/domain/production'
import type { PlantingProduction } from '@/lib/domain'
import { useProduction, type ProductionCtx } from './useProduction'

export interface BrouillonSemis {
  /** Plantation modifiée (ignorée dans la charge des autres) ; absent pour une création. */
  id?: string
  culture_id: string
  date_semis: string
  surface_m2: number
  achat_plant?: boolean
  /** Valeurs résolues d'une plantation existante (overrides compris). */
  base?: Partial<PlantingProduction>
}

export function useControlePepiniere(ctx: ProductionCtx & { farmPlantings?: PlantingProduction[]; plantings?: PlantingProduction[]; catalog?: any[] }) {
  const prod = useProduction(ctx)
  const trous = prod.pepiniere.etat === 'ok' ? prod.pepiniere.plaque.trous : null
  const capacite: CapacitePepiniere | null = useMemo(() => {
    if (prod.pepiniere.etat !== 'ok') return null
    try { return capacitePepiniere(prod.pepiniere.tables, prod.pepiniere.plaque) } catch (e) {
      console.error('[pépinière] capacité', e)
      return null
    }
  }, [prod.pepiniere])

  const plantings = useMemo(() => ctx.farmPlantings || ctx.plantings || [], [ctx.farmPlantings, ctx.plantings])
  const autres = useMemo(() => {
    const lignes: LigneSemis[] = []
    for (const p of plantings) {
      try { lignes.push(ligneSemis(p, prod.taux)) } catch (e) { console.error('[pépinière] plantation illisible', p.id, e) }
    }
    return occupationsCellule(lignes, trous).occupations
  }, [plantings, prod.taux, trous])

  const controler = useCallback((b: BrouillonSemis): ControlePepiniere | null => {
    if (!b.culture_id || !b.date_semis || !(b.surface_m2 > 0)) return null
    const c = (ctx.catalog || []).find((x: any) => x.id === b.culture_id)
    if (!c && !b.base) return null
    const p: PlantingProduction = {
      id: b.id ?? 'brouillon', culture_id: b.culture_id, culture_name: c?.name ?? '', season_id: '',
      jours_cellule: c?.jours_cellule ?? 0, jours_champ: c?.jours_champ, jours_recolte: c?.jours_recolte,
      rendement: c?.rendement_plant, prix_tige: c?.prix_tige, espacement_cm: c?.espacement_cm,
      rangs_par_planche: c?.rangs_par_planche, graines_par_plant: c?.graines_par_plant, semis_direct: !!c?.semis_direct,
      garden_id: '', garden_name: '', planche_id: '', planche_name: '',
      ...b.base,
      surface_m2: b.surface_m2, date_semis: b.date_semis, achat_plant: b.achat_plant ?? b.base?.achat_plant ?? false,
    }
    try {
      return controlerSemis({ ligne: ligneSemis(p, prod.taux), autres, capacite, trousParPlaque: trous })
    } catch (e) {
      console.error('[pépinière] contrôle du semis', e)
      return null
    }
  }, [ctx.catalog, prod.taux, autres, capacite, trous])

  /** Toast d'alerte après enregistrement, si le semis fait dépasser. */
  const avertir = useCallback((c: ControlePepiniere | null, culture: string) => {
    if (!c || c.etat !== 'depassement') return
    toast.warning(`${culture} : dépasse la capacité des tables`, {
      description: `${c.maxManquantes} plaque${c.maxManquantes > 1 ? 's' : ''} manquante${c.maxManquantes > 1 ? 's' : ''} à partir du ${formatDateShort(c.jours[0].jour)}. Enregistré quand même. Propositions : ${propositionsTexte(c, formatDateShort).join(' ; ')}.`,
      duration: 12000,
    })
  }, [])

  return { controler, avertir, capacite }
}
