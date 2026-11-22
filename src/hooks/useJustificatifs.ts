'use client'
// ============================================================
// Justificatifs (migration 012) : pièces scannées ou importées, leurs
// pages dans le bucket PRIVÉ `justificatifs` (chemin
// `<farm_id>/<receipt_id>/<page>.<ext>`, URL signées d'une heure), et leur
// traitement : rattacher à une dépense (existante ou créée en un geste), à
// un paiement de facture, ou marquer « sans objet ».
// ------------------------------------------------------------
// Ne touche pas à useBleuenn : prend dans le contexte la ferme, les
// saisons et l'utilisateur. Aucune erreur avalée : console + toast, et une
// lecture refusée met l'écran en état d'erreur. L'ordre d'un scan est :
// ligne du justificatif, puis chaque fichier, puis la ligne de sa page ; un
// fichier qui n'est pas parti est signalé, jamais perdu en silence.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import {
  centimesEnEuros, type Cost, type CostCategory, type DateISO, type InvoiceStatusRow, type Payment, type Receipt, type ReceiptPage,
} from '@/lib/domain'
import { cheminJustificatif } from '@/lib/domain/gestion'

export const BUCKET_JUSTIFICATIFS = 'justificatifs'
const DUREE_URL_S = 3600

type Erreur = { message: string; code?: string } | null
type Res<T> = { data: T | null; error: Erreur }

class ErreurAffichee extends Error {}
export const dejaAffichee = (e: unknown) => e instanceof ErreurAffichee

function ok<T>(r: Res<T>, contexte: string): T {
  if (r.error) {
    console.error(`[justificatifs] ${contexte}`, r.error)
    toast.error(`Échec : ${contexte}`, { description: r.error.message, id: `justificatifs-${contexte}` })
    throw new ErreurAffichee(r.error.message)
  }
  return r.data as T
}

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface JustificatifsCtx {
  farm: { id: string } | null
  activeSeason: { id: string; farm_id?: string | null; year?: number } | null
  seasons?: { id: string; farm_id?: string | null; year?: number; name?: string }[]
  user: { id: string } | null
}

/** Fichier prêt à envoyer : image améliorée (JPEG) ou PDF tel quel. */
export interface PagePreparee {
  blob: Blob
  mime: 'image/jpeg' | 'application/pdf'
  largeur: number | null
  hauteur: number | null
  nom: string
}

/** Valeurs confirmées par l'utilisatrice. */
export interface SaisieJustificatif {
  date_piece: DateISO | null
  montant_centimes: number | null
  fournisseur: string
  notes: string
  ocr_texte?: string | null
}

export interface DepenseDepuisJustificatif {
  season_id: string
  date: DateISO
  category: CostCategory
  montant_centimes: number
  supplier: string
  notes: string
}

/** URL signée d'une page : chaîne, `null` = indisponible (erreur signalée). */
export type UrlsPages = Record<string, string | null>

/** Saison de gestion pour une date : celle de l'année de la date dans la ferme, sinon la saison active. */
export function saisonPour(date: DateISO, ctx: JustificatifsCtx): string | null {
  const farmId = ctx.farm?.id ?? ctx.activeSeason?.farm_id ?? null
  const annee = Number(date.slice(0, 4))
  const s = (ctx.seasons ?? []).find(x => x.farm_id === farmId && x.year === annee)
  return s?.id ?? ctx.activeSeason?.id ?? null
}

export function useJustificatifs(ctx: JustificatifsCtx) {
  const supabase = useMemo(() => createClient(), [])
  const farmId = ctx.farm?.id ?? ctx.activeSeason?.farm_id ?? null
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [pages, setPages] = useState<ReceiptPage[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [factures, setFactures] = useState<InvoiceStatusRow[]>([])
  const [urls, setUrls] = useState<UrlsPages>({})
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    try {
      const [r, p, c, pa, f] = await Promise.all([
        supabase.from('receipts').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }),
        supabase.from('receipt_pages').select('*').eq('farm_id', farmId).order('page'),
        supabase.from('costs').select('*').eq('farm_id', farmId).order('date', { ascending: false }),
        supabase.from('payments').select('*').eq('farm_id', farmId).order('date', { ascending: false }),
        supabase.from('invoices_status').select('*').eq('farm_id', farmId),
      ])
      setReceipts(ok<Receipt[]>(r as Res<Receipt[]>, 'lecture des justificatifs') ?? [])
      setPages(ok<ReceiptPage[]>(p as Res<ReceiptPage[]>, 'lecture des pages de justificatifs') ?? [])
      setCosts(ok<Cost[]>(c as Res<Cost[]>, 'lecture des dépenses') ?? [])
      setPayments(ok<Payment[]>(pa as Res<Payment[]>, 'lecture des paiements') ?? [])
      setFactures(ok<InvoiceStatusRow[]>(f as Res<InvoiceStatusRow[]>, 'lecture des factures') ?? [])
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, farmId])

  useEffect(() => { load() }, [load])

  const pagesParJustificatif = useMemo(() => {
    const m = new Map<string, ReceiptPage[]>()
    for (const p of pages) m.set(p.receipt_id, [...(m.get(p.receipt_id) ?? []), p])
    return m
  }, [pages])

  /** Demande les URL signées des pages indiquées (vignettes, aperçu). */
  const demanderUrls = useCallback(async (liste: ReceiptPage[]) => {
    const manquantes = liste.filter(p => !(p.id in urls))
    if (!manquantes.length) return
    const res = await Promise.all(manquantes.map(async p => {
      const { data, error } = await supabase.storage.from(BUCKET_JUSTIFICATIFS).createSignedUrl(p.path, DUREE_URL_S)
      if (error || !data?.signedUrl) {
        console.error('[justificatifs] URL signée', p.path, error)
        return [p.id, null] as const
      }
      return [p.id, data.signedUrl as string] as const
    }))
    const ko = res.filter(([, u]) => u === null).length
    if (ko) toast.error(`${ko} page${ko > 1 ? 's' : ''} indisponible${ko > 1 ? 's' : ''}`, { id: 'justificatifs-urls', description: 'Le lien sécurisé n’a pas pu être obtenu.' })
    setUrls(u => ({ ...u, ...Object.fromEntries(res) }))
  }, [supabase, urls])

  /**
   * Crée un justificatif « à traiter » et envoie ses pages. Renvoie son id,
   * ou null s'il n'a pas pu être créé. Une page perdue est signalée.
   */
  const scanner = useCallback(async (fichiers: PagePreparee[], saisie?: Partial<SaisieJustificatif>): Promise<string | null> => {
    if (!farmId) { toast.error('Aucune ferme active'); return null }
    if (!fichiers.length) { toast.error('Aucune page à enregistrer'); return null }
    const id = crypto.randomUUID()
    try {
      ok(await supabase.from('receipts').insert({
        id, farm_id: farmId,
        date_piece: saisie?.date_piece ?? null,
        montant: saisie?.montant_centimes != null ? centimesEnEuros(saisie.montant_centimes) : null,
        fournisseur: saisie?.fournisseur?.trim() || null, notes: saisie?.notes?.trim() || null,
        ocr_texte: saisie?.ocr_texte ?? null,
      }) as Res<unknown>, 'enregistrement du justificatif')
    } catch { return null }

    let perdues = 0
    for (const [i, f] of fichiers.entries()) {
      const path = cheminJustificatif(farmId, id, i + 1, f.mime)
      const up = await supabase.storage.from(BUCKET_JUSTIFICATIFS).upload(path, f.blob, { contentType: f.mime, upsert: false })
      if (up.error) { console.error('[justificatifs] envoi de la page', path, up.error); perdues++; continue }
      const { error } = await supabase.from('receipt_pages').insert({
        receipt_id: id, page: i + 1, path, mime: f.mime, taille: f.blob.size || null,
        nom_origine: f.nom.slice(0, 255) || null, width: f.largeur, height: f.hauteur,
      })
      if (error) {
        console.error('[justificatifs] enregistrement de la page', error)
        perdues++
        const rm = await supabase.storage.from(BUCKET_JUSTIFICATIFS).remove([path])
        if (rm.error) console.error('[justificatifs] fichier orphelin', path, rm.error)
      }
    }
    if (perdues) {
      toast.error(`Justificatif enregistré, mais ${perdues} page${perdues > 1 ? 's n’ont' : ' n’a'} pas pu être envoyée${perdues > 1 ? 's' : ''}`,
        { description: 'Supprimez-le et scannez-le à nouveau quand le réseau le permet.' })
    } else {
      toast.success(fichiers.length > 1 ? `Justificatif enregistré (${fichiers.length} pages)` : 'Justificatif enregistré')
    }
    await load()
    return id
  }, [supabase, farmId, load])

  const enregistrer = useCallback(async (id: string, s: SaisieJustificatif): Promise<boolean> => {
    try {
      const r = await supabase.from('receipts').update({
        date_piece: s.date_piece, montant: s.montant_centimes != null ? centimesEnEuros(s.montant_centimes) : null,
        fournisseur: s.fournisseur.trim() || null, notes: s.notes.trim() || null,
        ...(s.ocr_texte !== undefined ? { ocr_texte: s.ocr_texte } : {}),
      }).eq('id', id).select()
      const rows = ok<Receipt[]>(r as Res<Receipt[]>, 'enregistrement du justificatif')
      if (!rows?.length) { toast.error('Justificatif introuvable ou non modifiable'); return false }
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  /** Crée la dépense et la rattache au justificatif, dans une seule transaction (creer_depense_liee). */
  const creerDepense = useCallback(async (receiptId: string, d: DepenseDepuisJustificatif): Promise<string | null> => {
    try {
      const r = await supabase.rpc('creer_depense_liee', {
        p_cost: { season_id: d.season_id, date: d.date, category: d.category, amount: centimesEnEuros(d.montant_centimes), supplier: d.supplier, notes: d.notes },
        p_receipt_id: receiptId, p_transaction_id: null,
      })
      const id = ok<string>(r as Res<string>, 'création de la dépense')
      toast.success('Dépense créée et justificatif rattaché')
      await load()
      return id
    } catch { return null }
  }, [supabase, load])

  /** Rattache à une dépense ou à un paiement existant, ou marque « sans objet » ; `null` partout = à traiter. */
  const rattacher = useCallback(async (id: string, cible: { cost_id?: string | null; payment_id?: string | null; sans_objet?: boolean }, message: string): Promise<boolean> => {
    try {
      const r = await supabase.from('receipts').update({
        cost_id: cible.cost_id ?? null, payment_id: cible.payment_id ?? null,
        sans_objet_le: cible.sans_objet ? new Date().toISOString() : null,
      }).eq('id', id).select()
      const rows = ok<Receipt[]>(r as Res<Receipt[]>, 'rattachement du justificatif')
      if (!rows?.length) { toast.error('Justificatif introuvable ou non modifiable'); return false }
      toast.success(message)
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  /** Supprime un justificatif à traiter ou sans objet : fichiers d'abord, puis la ligne (pages en cascade). */
  const supprimer = useCallback(async (id: string): Promise<boolean> => {
    const chemins = (pagesParJustificatif.get(id) ?? []).map(p => p.path)
    try {
      if (chemins.length) {
        const rm = await supabase.storage.from(BUCKET_JUSTIFICATIFS).remove(chemins)
        ok(rm as Res<unknown>, 'suppression des fichiers du justificatif')
      }
      ok(await supabase.from('receipts').delete().eq('id', id) as Res<unknown>, 'suppression du justificatif')
      toast.success('Justificatif supprimé')
      await load()
      return true
    } catch { return false }
  }, [supabase, pagesParJustificatif, load])

  /** Télécharge le contenu d'une page (export ZIP). Lève sur échec, après l'avoir signalé. */
  const telechargerPage = useCallback(async (p: ReceiptPage): Promise<Uint8Array> => {
    const r = await supabase.storage.from(BUCKET_JUSTIFICATIFS).createSignedUrl(p.path, 300)
    const url = ok<{ signedUrl: string }>(r as Res<{ signedUrl: string }>, `lien de ${p.path}`).signedUrl
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[justificatifs] téléchargement', p.path, res.status)
      toast.error('Téléchargement d’une page impossible', { description: `${p.path} : HTTP ${res.status}` })
      throw new ErreurAffichee(`HTTP ${res.status}`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }, [supabase])

  return {
    loading, erreur, farmId, receipts, pages, pagesParJustificatif, costs, payments, factures, urls,
    demanderUrls, scanner, enregistrer, creerDepense, rattacher, supprimer, telechargerPage, reload: load,
  }
}
