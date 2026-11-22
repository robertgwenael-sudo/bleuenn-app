import type { PlantingFull } from '@/lib/types'
import type { CycleVie, PlantationPreparation } from '@/lib/domain/saisons'

/**
 * Plantation de `plantings_full` au format des aperçus de saison (016) :
 * cycle lu au catalogue et `arrachee_le` sur la plantation (colonnes de 013,
 * absentes tant que 013 n'est pas là : annuelle, en place).
 */
export function versPreparation(p: PlantingFull, catalog: { id: string; cycle?: CycleVie | null }[] = []): PlantationPreparation & PlantingFull {
  const extra = p as PlantingFull & { arrachee_le?: string | null; cycle?: CycleVie | null }
  return {
    ...p,
    date_recolte: p.date_recolte ?? null,
    arrachee_le: extra.arrachee_le ?? null,
    cycle: extra.cycle ?? catalog.find(c => c.id === p.culture_id)?.cycle ?? null,
  }
}
