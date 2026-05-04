'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type {
  Season, Garden, Planche, CultureCatalog, PlantingFull,
  Harvest, Sale, SeedOrder, Profile
} from '@/lib/types'

const supabase = createClient()

export function useBleuenn() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [gardens, setGardens] = useState<Garden[]>([])
  const [catalog, setCatalog] = useState<CultureCatalog[]>([])
  const [plantings, setPlantings] = useState<PlantingFull[]>([])
  const [harvests, setHarvests] = useState<Harvest[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [seedOrders, setSeedOrders] = useState<SeedOrder[]>([])
  const [loading, setLoading] = useState(true)

  // ─── Auth ───────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (!data.user) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return error
  }
  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // ─── Load all data when user changes ────
  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [profRes, seasRes, catRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('seasons').select('*').eq('user_id', user.id).order('year'),
      supabase.from('culture_catalog').select('*').or(`user_id.is.null,user_id.eq.${user.id}`).order('name'),
    ])

    setProfile(profRes.data)
    setCatalog(catRes.data || [])

    const allSeasons = seasRes.data || []
    setSeasons(allSeasons)
    const active = allSeasons.find(s => s.is_active) || allSeasons[0] || null
    setActiveSeason(active)

    if (active) await loadSeasonData(active.id)
    setLoading(false)
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  const loadSeasonData = async (seasonId: string) => {
    const [garRes, plRes, harRes, salRes, soRes] = await Promise.all([
      supabase.from('gardens').select('*, planches(*)').eq('season_id', seasonId).order('sort_order'),
      supabase.from('plantings_full').select('*').eq('season_id', seasonId),
      supabase.from('harvests').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
      supabase.from('sales').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
      supabase.from('seed_orders').select('*').eq('season_id', seasonId).order('culture_name'),
    ])
    setGardens(garRes.data || [])
    setPlantings(plRes.data || [])
    setHarvests(harRes.data || [])
    setSales(salRes.data || [])
    setSeedOrders(soRes.data || [])
  }

  const switchSeason = async (seasonId: string) => {
    // Déactiver toutes, activer celle-ci
    if (!user) return
    await supabase.from('seasons').update({ is_active: false }).eq('user_id', user.id)
    await supabase.from('seasons').update({ is_active: true }).eq('id', seasonId)
    await loadAll()
  }

  // ─── CRUD Saisons ──────────────────────
  const createSeason = async (name: string, year: number, goal: number) => {
    const { data } = await supabase.from('seasons').insert({
      user_id: user.id, name, year, revenue_goal: goal, is_active: true
    }).select().single()
    if (data) await loadAll()
    return data
  }

  // ─── CRUD Jardins ──────────────────────
  const createGarden = async (name: string, m2: number, desc: string) => {
    if (!activeSeason) return null
    const { data } = await supabase.from('gardens').insert({
      user_id: user.id, season_id: activeSeason.id, name, surface_m2: m2, description: desc,
      sort_order: gardens.length
    }).select().single()
    if (data) await loadSeasonData(activeSeason.id)
    return data
  }

  const updateGarden = async (id: string, updates: Partial<Garden>) => {
    await supabase.from('gardens').update(updates).eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  const deleteGarden = async (id: string) => {
    await supabase.from('gardens').delete().eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Planches ─────────────────────
  const createPlanche = async (gardenId: string, name: string, m2: number) => {
    const { data } = await supabase.from('planches').insert({
      garden_id: gardenId, name, surface_m2: m2
    }).select().single()
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const deletePlanche = async (id: string) => {
    await supabase.from('planches').delete().eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Plantations ─────────────────
  const createPlanting = async (plancheId: string, cultureId: string, dateSemis: string, overrides?: {
    jours_cellule_override?: number
    jours_champ_override?: number
    jours_recolte_override?: number
    rendement_override?: number
    prix_override?: number
    notes?: string
  }) => {
    if (!activeSeason) return null
    const { data, error } = await supabase.from('plantings').insert({
      planche_id: plancheId,
      culture_id: cultureId,
      season_id: activeSeason.id,
      date_semis: dateSemis,
      ...overrides
    }).select().single()
    if (error) console.error('createPlanting error:', error)
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const deletePlanting = async (id: string) => {
    await supabase.from('plantings').delete().eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Récoltes ─────────────────────
  const createHarvest = async (plantingId: string, date: string, tiges: number, quality: string, notes: string) => {
    if (!activeSeason) return null
    const { data } = await supabase.from('harvests').insert({
      planting_id: plantingId, season_id: activeSeason.id, date, tiges, quality, notes
    }).select().single()
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const deleteHarvest = async (id: string) => {
    await supabase.from('harvests').delete().eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Ventes ───────────────────────
  const createSale = async (date: string, channel: string, cultures: string, tiges: number, prix: number, client: string) => {
    if (!activeSeason) return null
    const { data } = await supabase.from('sales').insert({
      season_id: activeSeason.id, user_id: user.id, date, channel,
      cultures_sold: cultures, tiges, prix_unitaire: prix, client
    }).select().single()
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const deleteSale = async (id: string) => {
    await supabase.from('sales').delete().eq('id', id)
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Commandes ────────────────────
  const upsertSeedOrder = async (cultureName: string, updates: Partial<SeedOrder>) => {
    if (!activeSeason) return
    const existing = seedOrders.find(s => s.culture_name === cultureName)
    if (existing) {
      await supabase.from('seed_orders').update(updates).eq('id', existing.id)
    } else {
      await supabase.from('seed_orders').insert({
        season_id: activeSeason.id, user_id: user.id, culture_name: cultureName, ...updates
      })
    }
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── Catalogue custom ─────────────────
  const addCulture = async (culture: Partial<CultureCatalog>) => {
    const { data } = await supabase.from('culture_catalog').insert({
      ...culture, user_id: user.id
    }).select().single()
    if (data) {
      setCatalog(prev => [...prev, data as CultureCatalog].sort((a, b) => a.name.localeCompare(b.name)))
    }
    return data
  }

  // ─── Profile ───────────────────────────
  const updateProfile = async (updates: Partial<Profile>) => {
    await supabase.from('profiles').update(updates).eq('id', user.id)
    setProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  return {
    user, profile, loading,
    signIn, signUp, signOut, updateProfile,
    seasons, activeSeason, switchSeason, createSeason,
    gardens, catalog, plantings, harvests, sales, seedOrders,
    createGarden, updateGarden, deleteGarden,
    createPlanche, deletePlanche,
    createPlanting, deletePlanting,
    createHarvest, deleteHarvest,
    createSale, deleteSale,
    upsertSeedOrder, addCulture,
    reload: loadAll,
  }
}
