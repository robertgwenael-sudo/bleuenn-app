'use client'
// Données des exports CSV, chargées pour une période choisie sur la ferme.
//
// Deux façons de filtrer :
//   * par saison : tout ce qui est rattaché à la saison (ventes, commandes,
//     récoltes, pertes, plantations), quelles que soient les dates ;
//   * par dates : toutes les saisons de la ferme, bornes comprises, sur la
//     date de vente, de livraison, de récolte ou de perte ; une plantation
//     entre dans le plan si son occupation [semis, fin] touche la période.
//
// Chaque table est lue par pages de 1 000 lignes (limite PostgREST) triées
// par id, pour ne jamais tronquer un export en silence. Aucune erreur n'est
// avalée : toast, console.error, et l'écran affiche l'échec.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import type {
  ClientExport, CommandeExport, DonneesExport, LigneExport, PerteExport, PlantationExport, RecolteExport, VenteExport,
} from '@/lib/domain/exports'
import type { OrderLine, Sale, SaleLine, Order } from '@/lib/domain'
import { avecDatesDeRecolte } from '@/lib/domain/cultures'

export interface PeriodeChargement {
  farmId: string | null
  du: string
  au: string
  /** Saison choisie : filtre par rattachement, sans borne de dates. */
  seasonId: string | null
}

export interface SaisonFerme { id: string; name: string; year: number; is_active?: boolean }

type Res<T> = { data: T | null; error: { message: string; code?: string } | null }

const PAGE = 1000

class ErreurLecture extends Error {}

function ok<T>(r: Res<T>, contexte: string): T | null {
  if (r.error) {
    console.error(`[exports] ${contexte}`, r.error)
    toast.error(`Échec : ${contexte}`, { description: r.error.message })
    throw new ErreurLecture(`${contexte} : ${r.error.message}`)
  }
  return r.data
}

export function useExports(p: PeriodeChargement) {
  const supabase = useMemo(() => createClient(), [])
  const [donnees, setDonnees] = useState<DonneesExport | null>(null)
  const [saisons, setSaisons] = useState<SaisonFerme[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const demande = useRef(0)

  const { farmId, du, au, seasonId } = p

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); setDonnees(null); return }
    const n = ++demande.current
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toutLire = async <T,>(fabrique: () => any, contexte: string): Promise<T[]> => {
      const out: T[] = []
      for (let debut = 0; ; debut += PAGE) {
        const r = await fabrique().order('id').range(debut, debut + PAGE - 1)
        const rows = ok<T[]>(r as Res<T[]>, contexte) ?? []
        out.push(...rows)
        if (rows.length < PAGE) return out
      }
    }

    try {
      const s = ok<SaisonFerme[]>(
        await supabase.from('seasons').select('id, name, year, is_active').eq('farm_id', farmId).order('year') as Res<SaisonFerme[]>,
        'lecture des saisons de la ferme',
      ) ?? []
      const ids = seasonId ? [seasonId] : s.map(x => x.id)
      if (seasonId && !s.some(x => x.id === seasonId)) throw new ErreurLecture('Saison introuvable sur cette ferme')
      const parDates = !seasonId

      // Requêtes filtrées par saison(s), puis par dates si la période est libre.
      const filtre = (table: string, colDate: string | null) => () => {
        let q = supabase.from(table).select('*').in('season_id', ids)
        if (parDates && colDate) q = q.gte(colDate, du).lte(colDate, au)
        return q
      }

      const vide = ids.length === 0
      const [ventes, lignesVente, commandes, lignesCommande, recoltes, pertes, plantations, clients, cultures] = await Promise.all([
        vide ? [] : toutLire<Sale>(filtre('sales', 'date'), 'lecture des ventes'),
        vide ? [] : toutLire<SaleLine>(filtre('sale_lines', null), 'lecture des lignes de vente'),
        vide ? [] : toutLire<Order>(filtre('orders', 'delivery_date'), 'lecture des commandes'),
        vide ? [] : toutLire<OrderLine>(filtre('order_lines', null), 'lecture des lignes de commande'),
        vide ? [] : toutLire<RecolteExport>(filtre('harvests', 'date'), 'lecture des récoltes'),
        vide ? [] : toutLire<PerteExport>(filtre('losses', 'date'), 'lecture des pertes'),
        toutLire<PlantationExport & { season_id: string }>(
          () => supabase.from('plantings_full')
            .select('id, season_id, culture_name, garden_name, planche_name, surface_m2, date_semis, date_plantation, date_recolte, date_fin, tiges_estimees, revenu_estime, season_name')
            .eq('farm_id', farmId),
          'lecture des plantations',
        ),
        toutLire<ClientExport>(() => supabase.from('clients').select('id, name, kind, contact_name, phone, email, address, archived_at'), 'lecture des clients'),
        toutLire<{ id: string; name: string }>(() => supabase.from('culture_catalog').select('id, name'), 'lecture du catalogue'),
      ])
      if (n !== demande.current) return

      const grouper = <L extends { [k: string]: unknown }>(lignes: L[], cle: keyof L) => {
        const m = new Map<string, LigneExport[]>()
        for (const l of lignes) {
          const k = String(l[cle])
          m.set(k, [...(m.get(k) ?? []), l as unknown as LigneExport])
        }
        return m
      }
      const lv = grouper(lignesVente as unknown as (SaleLine & { [k: string]: unknown })[], 'sale_id')
      const lc = grouper(lignesCommande as unknown as (OrderLine & { [k: string]: unknown })[], 'order_id')

      // 013 : une vivace sans début de floraison n'a ni dates de récolte ni prévisionnel exportable
      const plan = avecDatesDeRecolte(plantations).filter(x => seasonId ? x.season_id === seasonId : x.date_semis <= au && x.date_fin >= du)

      setSaisons(s)
      setDonnees({
        ventes: ventes.map(v => ({ ...v, lignes: lv.get(v.id) ?? [] })) as VenteExport[],
        commandes: commandes.map(o => ({ ...o, lignes: lc.get(o.id) ?? [] })) as CommandeExport[],
        recoltes, pertes, plan, plantations, clients, cultures,
      })
      setErreur(null)
    } catch (e) {
      if (n !== demande.current) return
      if (!(e instanceof ErreurLecture)) {
        console.error('[exports] chargement', e)
        toast.error('Chargement des exports impossible', { description: e instanceof Error ? e.message : String(e) })
      }
      setDonnees(null)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      if (n === demande.current) setLoading(false)
    }
  }, [supabase, farmId, du, au, seasonId])

  useEffect(() => { void load() }, [load])

  return { donnees, saisons, loading, erreur, reload: load }
}
