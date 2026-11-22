'use client'
// ============================================================
// Journal de culture, photos et registre des traitements (009).
// ------------------------------------------------------------
// Ne touche pas à useBleuenn : prend dans le contexte la ferme, la saison
// active et l'utilisateur, et fait ses propres requêtes, à l'échelle de la
// FERME (toutes saisons) : le journal et le registre durent d'une année sur
// l'autre.
//
// Aucune erreur avalée : chaque `error` Supabase part dans la console ET
// dans un toast ; une lecture refusée met l'écran en état d'erreur plutôt
// que d'afficher un journal vide trompeur.
//
// Photos : bucket PRIVÉ `journal`, chemin `<farm_id>/<entry_id>/<fichier>`,
// affichage par URL signée (valable une heure). La note est enregistrée
// d'abord ; une photo qui n'a pas pu partir est signalée, jamais perdue en
// silence.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import type { DateISO, JournalEntry, JournalKind, JournalPhoto, PlantingFull, Treatment } from '@/lib/domain'
import { cheminPhoto, type NouveauTraitement } from '@/lib/domain/journal'

const supabase = createClient()
const BUCKET = 'journal'
const DUREE_URL_S = 3600

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface JournalCtx {
  farm: { id: string } | null
  activeSeason: { id: string; farm_id?: string | null } | null
  user: { id: string } | null
}

type Erreur = { message: string; code?: string } | null
type Res<T> = { data: T | null; error: Erreur }

function verifier<T>(r: Res<T>, contexte: string, repli: T): T {
  if (r.error) {
    console.error(`[journal] lecture : ${contexte}`, r.error)
    toast.error(`Lecture impossible : ${contexte}`, { description: r.error.message, id: `journal-${contexte}` })
    throw new Error(`${contexte} : ${r.error.message}`)
  }
  return (r.data ?? repli) as T
}

function echec(err: Erreur, quoi: string): boolean {
  if (!err) return false
  console.error(`[journal] ${quoi}`, err)
  toast.error(`Échec : ${quoi}`, { description: err.message })
  return true
}

const nouvelId = () => crypto.randomUUID()

export interface NouvelleNote {
  date: DateISO
  kind: JournalKind
  body: string
  planche_id: string | null
  planting_id: string | null
  culture_id: string | null
}

/** Photo déjà réduite côté client (canvas, JPEG). */
export interface PhotoPreparee {
  blob: Blob
  largeur: number
  hauteur: number
}

/** URL signée d'une photo : chaîne, `null` = indisponible (erreur signalée). */
export type UrlsPhotos = Record<string, string | null>

export function useJournal(ctx: JournalCtx) {
  const farmId = ctx.farm?.id ?? ctx.activeSeason?.farm_id ?? null
  const seasonId = ctx.activeSeason?.id ?? null
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [photos, setPhotos] = useState<JournalPhoto[]>([])
  const [treatments, setTreatments] = useState<Treatment[]>([])
  const [urls, setUrls] = useState<UrlsPhotos>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    try {
      const [e, p, t] = await Promise.all([
        supabase.from('journal_entries').select('*').eq('farm_id', farmId).order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('journal_photos').select('*').eq('farm_id', farmId).order('created_at'),
        supabase.from('treatments').select('*').eq('farm_id', farmId).order('date', { ascending: false }),
      ])
      setEntries(verifier<JournalEntry[]>(e as Res<JournalEntry[]>, 'journal de culture', []))
      setPhotos(verifier<JournalPhoto[]>(p as Res<JournalPhoto[]>, 'photos du journal', []))
      setTreatments(verifier<Treatment[]>(t as Res<Treatment[]>, 'registre des traitements', []))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [farmId])

  useEffect(() => { load() }, [load])

  // URL signées des photos qui n'en ont pas encore
  useEffect(() => {
    const manquantes = photos.filter(p => !(p.id in urls))
    if (!manquantes.length) return
    let annule = false
    ;(async () => {
      const res = await Promise.all(manquantes.map(async p => {
        const { data, error: err } = await supabase.storage.from(BUCKET).createSignedUrl(p.path, DUREE_URL_S)
        if (err || !data?.signedUrl) {
          console.error('[journal] URL signée', p.path, err)
          return [p.id, null] as const
        }
        return [p.id, data.signedUrl] as const
      }))
      if (annule) return
      const ko = res.filter(([, u]) => u === null).length
      if (ko) toast.error(`${ko} photo${ko > 1 ? 's' : ''} indisponible${ko > 1 ? 's' : ''}`, { id: 'journal-urls', description: 'Le lien sécurisé n’a pas pu être obtenu.' })
      setUrls(u => ({ ...u, ...Object.fromEntries(res) }))
    })()
    return () => { annule = true }
  }, [photos, urls])

  const photosParNote = useMemo(() => {
    const m = new Map<string, JournalPhoto[]>()
    for (const p of photos) m.set(p.entry_id, [...(m.get(p.entry_id) ?? []), p])
    return m
  }, [photos])

  /** Enregistre la note, puis chaque photo (fichier, puis ligne). Renvoie false si la note n'a pas été créée. */
  const addEntry = useCallback(async (n: NouvelleNote, fichiers: PhotoPreparee[]): Promise<boolean> => {
    if (!farmId) { toast.error('Aucune ferme'); return false }
    const id = nouvelId()
    const { error: err } = await supabase.from('journal_entries').insert({
      id, farm_id: farmId, season_id: seasonId, date: n.date, kind: n.kind, body: n.body.trim() || null,
      planche_id: n.planche_id, planting_id: n.planting_id, culture_id: n.culture_id,
    })
    if (echec(err, 'enregistrement de la note')) return false

    let perdues = 0
    for (const f of fichiers) {
      const path = cheminPhoto(farmId, id, `${nouvelId()}.jpg`)
      const up = await supabase.storage.from(BUCKET).upload(path, f.blob, { contentType: 'image/jpeg', upsert: false })
      if (up.error) { console.error('[journal] envoi de la photo', up.error); perdues++; continue }
      const { error: e2 } = await supabase.from('journal_photos').insert({ entry_id: id, path, width: f.largeur, height: f.hauteur })
      if (e2) {
        console.error('[journal] enregistrement de la photo', e2)
        perdues++
        const rm = await supabase.storage.from(BUCKET).remove([path])
        if (rm.error) console.error('[journal] fichier orphelin', path, rm.error)
      }
    }
    if (perdues) {
      toast.error(`Note enregistrée, mais ${perdues} photo${perdues > 1 ? 's n’ont' : ' n’a'} pas pu être envoyée${perdues > 1 ? 's' : ''}`,
        { description: 'Rouvrez la note plus tard pour la reprendre.' })
    }
    await load()
    return true
  }, [farmId, seasonId, load])

  /** Supprime les fichiers de la note, puis la note (ses lignes de photos partent en cascade). */
  const deleteEntry = useCallback(async (id: string): Promise<boolean> => {
    const chemins = (photosParNote.get(id) ?? []).map(p => p.path)
    if (chemins.length) {
      const { error: err } = await supabase.storage.from(BUCKET).remove(chemins)
      if (echec(err as Erreur, 'suppression des photos')) return false
    }
    const { error: err } = await supabase.from('journal_entries').delete().eq('id', id)
    if (echec(err, 'suppression de la note')) return false
    await load()
    return true
  }, [photosParNote, load])

  const addTreatment = useCallback(async (t: NouveauTraitement): Promise<boolean> => {
    if (!farmId) { toast.error('Aucune ferme'); return false }
    // farm_id : le trigger le recopie de la saison ou du lieu ; fourni pour
    // un lieu libre (tunnel, îlot…) et contrôlé par la RLS.
    const { error: err } = await supabase.from('treatments').insert({ ...t, farm_id: farmId, season_id: seasonId })
    if (echec(err, 'enregistrement du traitement')) return false
    await load()
    return true
  }, [farmId, seasonId, load])

  const deleteTreatment = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await supabase.from('treatments').delete().eq('id', id)
    if (echec(err, 'suppression du traitement')) return false
    await load()
    return true
  }, [load])

  /** Toutes les plantations d'une planche, toutes saisons confondues (vue plantings_full). */
  const plantationsDePlanche = useCallback(async (plancheId: string): Promise<PlantingFull[]> => {
    const r = await supabase.from('plantings_full').select('*').eq('planche_id', plancheId).order('date_semis', { ascending: false })
    return verifier<PlantingFull[]>(r as Res<PlantingFull[]>, 'historique de la planche', [])
  }, [])

  return {
    loading, error, entries, photos, photosParNote, urls, treatments,
    addEntry, deleteEntry, addTreatment, deleteTreatment, plantationsDePlanche, reload: load,
  }
}
