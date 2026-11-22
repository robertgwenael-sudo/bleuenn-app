'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import type {
  Season, Garden, Planche, CultureCatalog, PlantingFull,
  Harvest, Sale, SeedOrder, Profile, TeamMember, Farm, FarmMember
} from '@/lib/types'

const supabase = createClient()

/** Date du jour à Paris, `YYYY-MM-DD` (le domaine la prend toujours en paramètre). */
export function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

/**
 * Lire la base sans avaler les erreurs : `const { data } = await …` rend
 * `null` sur échec et l'écran afficherait « aucun élément ». Ici, toute
 * erreur est journalisée et signalée par un toast ; la valeur de repli
 * n'est utilisée qu'APRÈS avoir prévenu.
 */
function lire<T>(res: { data: any; error: any }, quoi: string, repli: T): T {
  if (res.error) {
    console.error(`Lecture impossible (${quoi}) :`, res.error)
    toast.error(`Impossible de charger ${quoi}`, { description: res.error.message || String(res.error), id: `lecture-${quoi}` })
    return repli
  }
  return (res.data ?? repli) as T
}

/** Même principe pour une écriture : renvoie `true` si elle a réussi. */
function ecrire(res: { error: any }, quoi: string): boolean {
  if (res.error) {
    console.error(`Échec (${quoi}) :`, res.error)
    toast.error(`Échec : ${quoi}`, { description: res.error.message || String(res.error) })
    return false
  }
  return true
}

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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  // Niveau ferme (migration 006)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [farmTeam, setFarmTeam] = useState<FarmMember[]>([])
  const [farmPlantings, setFarmPlantings] = useState<PlantingFull[]>([])
  const [today] = useState<string>(aujourdhuiParis)
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
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
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

    // Charger les saisons via team_members (inclut celles partagées)
    const [profRes, memberRes, catRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('team_members').select('season_id').eq('user_id', user.id),
      // RLS : catalogue système + celui de toute l'équipe
      supabase.from('culture_catalog').select('*').order('name'),
    ])

    setProfile(lire(profRes, 'votre profil', null))
    setCatalog(lire(catRes, 'le catalogue des cultures', [] as CultureCatalog[]))

    const memberSeasonIds = lire(memberRes, 'vos saisons', [] as any[]).map((m: any) => m.season_id)

    let allSeasons: Season[] = []
    if (memberSeasonIds.length > 0) {
      const r = await supabase.from('seasons').select('*').in('id', memberSeasonIds).order('year')
      allSeasons = lire(r, 'les saisons', [] as Season[])
    }
    // Fallback : saisons propres (au cas où team_members pas encore peuplé)
    if (allSeasons.length === 0) {
      const r = await supabase.from('seasons').select('*').eq('user_id', user.id).order('year')
      allSeasons = lire(r, 'les saisons', [] as Season[])
    }

    setSeasons(allSeasons)
    const active = allSeasons.find(s => s.is_active) || allSeasons[0] || null
    setActiveSeason(active)

    if (active) {
      await Promise.all([
        loadSeasonData(active.id, active.farm_id),
        loadTeamMembers(active.id),
        loadFarm(active.farm_id),
      ])
    } else {
      setFarm(null); setFarmTeam([]); setFarmPlantings([])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  /**
   * Données de la saison active ET de la ferme :
   *  - jardins et planches par ferme (permanents, toutes saisons) ;
   *  - `plantings` : saison active (inchangé pour les écrans existants) ;
   *  - `farmPlantings` : toute la ferme, toutes saisons, pour lire
   *    l'occupation des planches par dates.
   */
  const loadSeasonData = async (seasonId: string, farmId: string | null | undefined = activeSeason?.farm_id) => {
    const gardensQuery = farmId
      ? supabase.from('gardens').select('*, planches(*)').eq('farm_id', farmId).order('sort_order')
      : supabase.from('gardens').select('*, planches(*)').eq('season_id', seasonId).order('sort_order')
    const [garRes, plRes, farmPlRes, harRes, salRes, soRes] = await Promise.all([
      gardensQuery,
      supabase.from('plantings_full').select('*').eq('season_id', seasonId),
      farmId
        ? supabase.from('plantings_full').select('*').eq('farm_id', farmId).order('date_semis')
        : Promise.resolve({ data: null, error: null }),
      supabase.from('harvests').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
      supabase.from('sales').select('*').eq('season_id', seasonId).order('date', { ascending: false }),
      supabase.from('seed_orders').select('*').eq('season_id', seasonId).order('culture_name'),
    ])
    const seasonPlantings = lire(plRes, 'les plantations de la saison', [] as PlantingFull[])
    setGardens(lire(garRes, 'les jardins', [] as Garden[]))
    setPlantings(seasonPlantings)
    setFarmPlantings(farmId ? lire(farmPlRes, 'les plantations de la ferme', [] as PlantingFull[]) : seasonPlantings)
    setHarvests(lire(harRes, 'les récoltes', [] as Harvest[]))
    setSales(lire(salRes, 'les ventes', [] as Sale[]))
    setSeedOrders(lire(soRes, 'les commandes de graines', [] as SeedOrder[]))
  }

  /** Ferme et équipe de la ferme (RPC `farm_team`, emails compris). */
  const loadFarm = async (farmId: string | null | undefined) => {
    if (!farmId) { setFarm(null); setFarmTeam([]); return }
    const [farmRes, teamRes] = await Promise.all([
      supabase.from('farms').select('*').eq('id', farmId).maybeSingle(),
      supabase.rpc('farm_team', { p_farm_id: farmId }),
    ])
    setFarm(lire<Farm | null>(farmRes, 'la ferme', null))
    setFarmTeam(lire(teamRes, 'l’équipe de la ferme', [] as FarmMember[]))
  }

  const switchSeason = async (seasonId: string) => {
    // Déactiver toutes, activer celle-ci
    if (!user) return
    ecrire(await supabase.from('seasons').update({ is_active: false }).eq('user_id', user.id), 'changement de saison')
    ecrire(await supabase.from('seasons').update({ is_active: true }).eq('id', seasonId), 'changement de saison')
    await loadAll()
  }

  // ─── CRUD Saisons ──────────────────────
  const createSeason = async (name: string, year: number, goal: number) => {
    // Rattachée à la ferme courante si on en est owner ; sinon la base
    // rattache la saison à la ferme de son créateur (créée au besoin).
    const ownsFarm = !!farm && farmTeam.some(m => m.user_id === user.id && m.role === 'owner')
    const res = await supabase.from('seasons').insert({
      user_id: user.id, name, year, revenue_goal: goal, is_active: true,
      ...(ownsFarm ? { farm_id: farm!.id } : {}),
    }).select().single()
    const data = ecrire(res, 'création de la saison') ? res.data : null
    // Le créateur est inscrit owner par le trigger trg_add_season_owner
    if (data) await loadAll()
    return data
  }

  // ─── CRUD Jardins ──────────────────────
  const createGarden = async (name: string, m2: number, desc: string) => {
    if (!activeSeason) return null
    // Le jardin appartient à la ferme ; season_id reste renseigné pour compatibilité.
    const res = await supabase.from('gardens').insert({
      user_id: user.id, farm_id: activeSeason.farm_id, season_id: activeSeason.id,
      name, surface_m2: m2, description: desc, sort_order: gardens.length
    }).select().single()
    const data = ecrire(res, 'création du jardin') ? res.data : null
    if (data) await loadSeasonData(activeSeason.id)
    return data
  }

  const updateGarden = async (id: string, updates: Partial<Garden>) => {
    ecrire(await supabase.from('gardens').update(updates).eq('id', id), 'modification du jardin')
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  const deleteGarden = async (id: string) => {
    ecrire(await supabase.from('gardens').delete().eq('id', id), 'suppression du jardin')
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Planches ─────────────────────
  const createPlanche = async (gardenId: string, name: string, m2: number) => {
    const res = await supabase.from('planches').insert({
      garden_id: gardenId, name, surface_m2: m2
    }).select().single()
    const data = ecrire(res, 'création de la planche') ? res.data : null
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const updatePlanche = async (id: string, updates: Partial<Planche>) => {
    ecrire(await supabase.from('planches').update(updates).eq('id', id), 'modification de la planche')
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  const deletePlanche = async (id: string) => {
    ecrire(await supabase.from('planches').delete().eq('id', id), 'suppression de la planche')
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  // ─── CRUD Plantations ─────────────────
  const createPlanting = async (plancheId: string, cultureId: string, dateSemis: string, surfaceM2: number, overrides?: {
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
      surface_m2: surfaceM2,
      ...overrides
    }).select().single()
    ecrire({ error }, 'ajout de la plantation')
    if (data && activeSeason) await loadSeasonData(activeSeason.id)
    return data
  }

  const updatePlanting = async (id: string, updates: {
    date_semis?: string
    surface_m2?: number
    jours_cellule_override?: number
    jours_champ_override?: number
    jours_recolte_override?: number
    rendement_override?: number
    prix_override?: number
    notes?: string
  }) => {
    const { error } = await supabase.from('plantings').update(updates).eq('id', id)
    ecrire({ error }, 'modification de la plantation')
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  const deletePlanting = async (id: string) => {
    ecrire(await supabase.from('plantings').delete().eq('id', id), 'suppression de la plantation')
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

  const updateCulture = async (id: string, updates: Partial<CultureCatalog>) => {
    const { error } = await supabase.from('culture_catalog').update(updates).eq('id', id)
    if (error) { console.error('updateCulture error:', error); return }
    setCatalog(prev => prev.map(c => c.id === id ? { ...c, ...updates } as CultureCatalog : c))
    if (activeSeason) await loadSeasonData(activeSeason.id)
  }

  const deleteCulture = async (id: string) => {
    const { error } = await supabase.from('culture_catalog').delete().eq('id', id)
    if (error) { console.error('deleteCulture error:', error); return }
    setCatalog(prev => prev.filter(c => c.id !== id))
  }

  // ─── Profile ───────────────────────────
  const updateProfile = async (updates: Partial<Profile>) => {
    await supabase.from('profiles').update(updates).eq('id', user.id)
    setProfile(prev => prev ? { ...prev, ...updates } : prev)
  }

  // ─── Équipe ───────────────────────────
  const loadTeamMembers = async (seasonId: string) => {
    // profiles n'est lisible que par son propriétaire : un join renverrait
    // null pour les coéquipiers. season_team() n'expose que email et nom.
    const res = await supabase.rpc('season_team', { p_season_id: seasonId })
    setTeamMembers(lire(res, 'l’équipe de la saison', [] as TeamMember[]))
  }

  const enableInviteLink = async () => {
    if (!activeSeason) return null
    const { data } = await supabase
      .from('seasons')
      .update({ invite_enabled: true })
      .eq('id', activeSeason.id)
      .select('invite_token')
      .single()
    if (data) {
      setActiveSeason(prev => prev ? { ...prev, invite_enabled: true, invite_token: data.invite_token } : prev)
    }
    return data?.invite_token
  }

  const disableInviteLink = async () => {
    if (!activeSeason) return
    await supabase.from('seasons').update({ invite_enabled: false }).eq('id', activeSeason.id)
    setActiveSeason(prev => prev ? { ...prev, invite_enabled: false } : prev)
  }

  const regenerateInviteToken = async () => {
    if (!activeSeason) return null
    const newToken = crypto.randomUUID()
    const { data } = await supabase
      .from('seasons')
      .update({ invite_token: newToken, invite_enabled: true })
      .eq('id', activeSeason.id)
      .select('invite_token')
      .single()
    if (data) {
      setActiveSeason(prev => prev ? { ...prev, invite_token: data.invite_token, invite_enabled: true } : prev)
    }
    return data?.invite_token
  }

  const joinByToken = async (token: string) => {
    const { data, error } = await supabase.rpc('join_season_by_token', { p_token: token })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error }
    await loadAll()
    return { ok: true, seasonId: data.season_id, seasonName: data.season_name }
  }

  const inviteByEmail = async (email: string) => {
    if (!activeSeason) return { error: 'Pas de saison active' }
    const { data, error } = await supabase.rpc('invite_by_email', {
      p_season_id: activeSeason.id,
      p_email: email.trim().toLowerCase()
    })
    if (error) return { error: error.message }
    // Si ajouté directement, recharger les membres
    if (data?.status === 'added') {
      await Promise.all([loadTeamMembers(activeSeason.id), loadFarm(activeSeason.farm_id)])
    }
    return data
  }

  const getPendingInvites = async () => {
    if (!activeSeason) return []
    // Une invitation faite depuis n'importe quelle saison de la ferme fait
    // rejoindre la ferme entière : on les liste toutes.
    const farmSeasonIds = seasons.filter(s => s.farm_id === activeSeason.farm_id).map(s => s.id)
    const res = await supabase
      .from('pending_invites')
      .select('*')
      .in('season_id', farmSeasonIds.length ? farmSeasonIds : [activeSeason.id])
      .order('created_at')
    return lire(res, 'les invitations en attente', [] as any[])
  }

  const cancelInvite = async (inviteId: string) => {
    ecrire(await supabase.from('pending_invites').delete().eq('id', inviteId), 'annulation de l’invitation')
  }

  /**
   * Retire quelqu'un de la FERME (toutes ses saisons, jardins, plantations).
   * `farmMemberId` est l'`id` d'une ligne de `farmTeam` (farm_members).
   * Un owner ne peut pas se retirer lui-même (policy RLS).
   */
  const removeMember = async (farmMemberId: string) => {
    const target = farmTeam.find(m => m.id === farmMemberId)
    if (target && target.user_id === user?.id) {
      toast.error('Vous ne pouvez pas vous retirer vous-même de la ferme')
      return false
    }
    const res = await supabase.from('farm_members').delete().eq('id', farmMemberId)
    const ok = ecrire(res, 'retrait du membre')
    if (activeSeason) await Promise.all([loadFarm(activeSeason.farm_id), loadTeamMembers(activeSeason.id)])
    return ok
  }

  // ─── Plan de culture ─────────────────
  /**
   * Reprend le plan d'une saison l'année suivante (RPC duplicate_season_plan) :
   * nouvelle saison, mêmes plantations avec semis décalé de `shiftYears` ans.
   * Recharge puis renvoie l'id de la nouvelle saison (null en cas d'échec).
   */
  const duplicatePlan = async (sourceSeasonId: string, name: string, year: number, shiftYears = 1): Promise<string | null> => {
    const res = await supabase.rpc('duplicate_season_plan', {
      p_source_season: sourceSeasonId, p_name: name, p_year: year, p_shift_years: shiftYears,
    })
    if (!ecrire(res, 'reprise du plan')) return null
    await loadAll()
    return (res.data as string) ?? null
  }

  const isFarmOwner = farmTeam.some(m => m.user_id === user?.id && m.role === 'owner')
  const isOwner = isFarmOwner || teamMembers.some(m => m.user_id === user?.id && m.role === 'owner')

  return {
    user, profile, loading,
    signIn, signUp, signOut, resetPassword, updateProfile,
    seasons, activeSeason, switchSeason, createSeason,
    gardens, catalog, plantings, harvests, sales, seedOrders,
    createGarden, updateGarden, deleteGarden,
    createPlanche, updatePlanche, deletePlanche,
    createPlanting, updatePlanting, deletePlanting,
    createHarvest, deleteHarvest,
    createSale, deleteSale,
    upsertSeedOrder, addCulture, updateCulture, deleteCulture,
    teamMembers, isOwner,
    // Niveau ferme (migration 006)
    farm, farmTeam, farmPlantings, isFarmOwner, duplicatePlan, today,
    enableInviteLink, disableInviteLink, regenerateInviteToken,
    joinByToken, inviteByEmail, getPendingInvites, cancelInvite, removeMember,
    reload: loadAll,
  }
}
