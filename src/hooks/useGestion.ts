'use client'
// ============================================================
// Gestion (migration 012) : comptes (banque, caisse), relevés importés en
// CSV, rapprochements, et les données de la ferme nécessaires au tableau
// de bord et aux exports (dépenses, ventes, paiements, factures,
// justificatifs).
// ------------------------------------------------------------
// Ne touche pas à useBleuenn. Aucune erreur avalée : console + toast, et
// une lecture refusée met l'écran en état d'erreur au lieu d'afficher des
// totaux à zéro trompeurs. Les écritures multi-tables passent par les
// fonctions de la base (importer_releve, creer_depense_liee). Rien ne se
// supprime : un rapprochement se défait (annule_le).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import {
  centimesEnEuros, eurosEnCentimes,
  type BankAccount, type BankAccountKind, type BankImport, type BankMatch, type BankTransaction, type Cost, type CostCategory,
  type DateISO, type HorsFactureCategorie, type InvoiceSale, type InvoiceStatusRow, type Payment, type Receipt, type ReceiptPage, type Sale,
} from '@/lib/domain'
import { actif, empreinte, type MappageReleve, type MouvementAImporter } from '@/lib/domain/gestion'

type Erreur = { message: string; code?: string } | null
type Res<T> = { data: T | null; error: Erreur }

class ErreurAffichee extends Error {}

function ok<T>(r: Res<T>, contexte: string): T {
  if (r.error) {
    console.error(`[gestion] ${contexte}`, r.error)
    toast.error(`Échec : ${contexte}`, { description: r.error.message, id: `gestion-${contexte}` })
    throw new ErreurAffichee(r.error.message)
  }
  return r.data as T
}

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface GestionCtx {
  farm: { id: string } | null
  activeSeason: { id: string; farm_id?: string | null } | null
  seasons?: { id: string; farm_id?: string | null; year?: number; name?: string }[]
  user: { id: string } | null
}

export interface NouveauCompte {
  name: string
  kind: BankAccountKind
  solde_initial_centimes: number | null
  date_solde_initial: DateISO | null
}

export interface ResultatImport { import_id: string; nouvelles: number; doublons: number }

export function useGestion(ctx: GestionCtx) {
  const supabase = useMemo(() => createClient(), [])
  const farmId = ctx.farm?.id ?? ctx.activeSeason?.farm_id ?? null
  const seasonIds = useMemo(() => {
    const ids = (ctx.seasons ?? []).filter(s => farmId && s.farm_id === farmId).map(s => s.id)
    if (ctx.activeSeason && !ids.includes(ctx.activeSeason.id)) ids.push(ctx.activeSeason.id)
    return ids
  }, [ctx.seasons, ctx.activeSeason, farmId])
  const cleSaisons = seasonIds.join(',')

  const [comptes, setComptes] = useState<BankAccount[]>([])
  const [imports, setImports] = useState<BankImport[]>([])
  const [mouvements, setMouvements] = useState<BankTransaction[]>([])
  const [liens, setLiens] = useState<BankMatch[]>([])
  const [costs, setCosts] = useState<Cost[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [invoiceSales, setInvoiceSales] = useState<InvoiceSale[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [factures, setFactures] = useState<InvoiceStatusRow[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [pages, setPages] = useState<ReceiptPage[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    const ids = cleSaisons ? cleSaisons.split(',') : []
    try {
      const [a, im, t, m, c, s, is, p, f, r, pg] = await Promise.all([
        supabase.from('bank_accounts').select('*').eq('farm_id', farmId).order('created_at'),
        supabase.from('bank_imports').select('*').eq('farm_id', farmId).order('created_at', { ascending: false }),
        supabase.from('bank_transactions').select('*').eq('farm_id', farmId).order('date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('bank_matches').select('*').eq('farm_id', farmId).order('created_at'),
        supabase.from('costs').select('*').eq('farm_id', farmId).order('date', { ascending: false }),
        supabase.from('sales').select('*').in('season_id', ids).order('date', { ascending: false }),
        supabase.from('invoice_sales').select('*').eq('farm_id', farmId),
        supabase.from('payments').select('*').eq('farm_id', farmId).order('date'),
        supabase.from('invoices_status').select('*').eq('farm_id', farmId),
        supabase.from('receipts').select('*').eq('farm_id', farmId),
        supabase.from('receipt_pages').select('*').eq('farm_id', farmId).order('page'),
      ])
      setComptes(ok<BankAccount[]>(a as Res<BankAccount[]>, 'lecture des comptes') ?? [])
      setImports(ok<BankImport[]>(im as Res<BankImport[]>, 'lecture des imports') ?? [])
      setMouvements(ok<BankTransaction[]>(t as Res<BankTransaction[]>, 'lecture des mouvements') ?? [])
      setLiens(ok<BankMatch[]>(m as Res<BankMatch[]>, 'lecture des rapprochements') ?? [])
      setCosts(ok<Cost[]>(c as Res<Cost[]>, 'lecture des dépenses') ?? [])
      setSales(ok<Sale[]>(s as Res<Sale[]>, 'lecture des ventes') ?? [])
      setInvoiceSales(ok<InvoiceSale[]>(is as Res<InvoiceSale[]>, 'lecture des ventes facturées') ?? [])
      setPayments(ok<Payment[]>(p as Res<Payment[]>, 'lecture des paiements') ?? [])
      setFactures(ok<InvoiceStatusRow[]>(f as Res<InvoiceStatusRow[]>, 'lecture des factures') ?? [])
      setReceipts(ok<Receipt[]>(r as Res<Receipt[]>, 'lecture des justificatifs') ?? [])
      setPages(ok<ReceiptPage[]>(pg as Res<ReceiptPage[]>, 'lecture des pages de justificatifs') ?? [])
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, farmId, cleSaisons])

  useEffect(() => { load() }, [load])

  const liensParMouvement = useMemo(() => {
    const m = new Map<string, BankMatch[]>()
    for (const l of liens) m.set(l.transaction_id, [...(m.get(l.transaction_id) ?? []), l])
    return m
  }, [liens])
  const liensActifs = useMemo(() => liens.filter(actif), [liens])

  // ─── Comptes ─────────────────────────────────────────────
  const creerCompte = useCallback(async (c: NouveauCompte): Promise<string | null> => {
    if (!farmId) { toast.error('Aucune ferme active'); return null }
    try {
      const r = await supabase.from('bank_accounts').insert({
        farm_id: farmId, name: c.name.trim(), kind: c.kind,
        solde_initial: c.solde_initial_centimes === null ? null : centimesEnEuros(c.solde_initial_centimes),
        date_solde_initial: c.solde_initial_centimes === null ? null : c.date_solde_initial,
      }).select().single()
      const row = ok<BankAccount>(r as Res<BankAccount>, 'création du compte')
      toast.success(`Compte « ${row.name} » créé`)
      await load()
      return row.id
    } catch { return null }
  }, [supabase, farmId, load])

  const majCompte = useCallback(async (id: string, c: NouveauCompte): Promise<boolean> => {
    try {
      const r = await supabase.from('bank_accounts').update({
        name: c.name.trim(), kind: c.kind,
        solde_initial: c.solde_initial_centimes === null ? null : centimesEnEuros(c.solde_initial_centimes),
        date_solde_initial: c.solde_initial_centimes === null ? null : c.date_solde_initial,
      }).eq('id', id).select()
      if (!ok<BankAccount[]>(r as Res<BankAccount[]>, 'modification du compte')?.length) { toast.error('Compte introuvable'); return false }
      toast.success('Compte enregistré')
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  // ─── Import et saisie ────────────────────────────────────
  const importer = useCallback(async (compteId: string, fichier: string, mappage: MappageReleve, lignes: MouvementAImporter[]): Promise<ResultatImport | null> => {
    try {
      const r = await supabase.rpc('importer_releve', {
        p_account_id: compteId, p_fichier: fichier, p_mappage: mappage,
        p_lignes: lignes.map(l => ({ date: l.date, label: l.libelle, amount: centimesEnEuros(l.montant), empreinte: l.empreinte })),
      })
      const res = ok<ResultatImport>(r as Res<ResultatImport>, 'import du relevé')
      toast.success(`${res.nouvelles} mouvement${res.nouvelles > 1 ? 's' : ''} importé${res.nouvelles > 1 ? 's' : ''}`,
        { description: res.doublons ? `${res.doublons} déjà connu${res.doublons > 1 ? 's' : ''}, ignoré${res.doublons > 1 ? 's' : ''}` : undefined })
      await load()
      return res
    } catch { return null }
  }, [supabase, load])

  /** Mouvement saisi à la main (caisse). Empreinte unique : la saisie n'est pas dédoublonnée. */
  const saisirMouvement = useCallback(async (compteId: string, m: { date: DateISO; libelle: string; montant: number }): Promise<boolean> => {
    if (!farmId) { toast.error('Aucune ferme active'); return false }
    try {
      ok(await supabase.from('bank_transactions').insert({
        account_id: compteId, farm_id: farmId, date: m.date, label: m.libelle.trim(), amount: centimesEnEuros(m.montant),
        empreinte: empreinte(m.date, m.montant, m.libelle, `saisie-${crypto.randomUUID()}`),
      }) as Res<unknown>, 'enregistrement du mouvement')
      toast.success('Mouvement enregistré')
      await load()
      return true
    } catch { return false }
  }, [supabase, farmId, load])

  // ─── Rapprochement ───────────────────────────────────────
  const rapprocher = useCallback(async (
    t: BankTransaction, cible: { kind: 'depense' | 'paiement' | 'vente'; id: string } | { kind: 'hors_facture'; categorie: HorsFactureCategorie; libelle: string },
    montantCentimes: number, message = 'Mouvement rapproché',
  ): Promise<boolean> => {
    try {
      ok(await supabase.from('bank_matches').insert({
        transaction_id: t.id, farm_id: t.farm_id, kind: cible.kind, amount: centimesEnEuros(montantCentimes),
        cost_id: cible.kind === 'depense' ? cible.id : null,
        payment_id: cible.kind === 'paiement' ? cible.id : null,
        sale_id: cible.kind === 'vente' ? cible.id : null,
        categorie: cible.kind === 'hors_facture' ? cible.categorie : null,
        libelle: cible.kind === 'hors_facture' ? cible.libelle.trim() || null : null,
      }) as Res<unknown>, 'rapprochement')
      toast.success(message)
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  /** Défait un rapprochement : la ligne reste, datée (annule_le). */
  const defaire = useCallback(async (id: string): Promise<boolean> => {
    try {
      const r = await supabase.from('bank_matches').update({ annule_le: new Date().toISOString() }).eq('id', id).select()
      if (!ok<BankMatch[]>(r as Res<BankMatch[]>, 'annulation du rapprochement')?.length) { toast.error('Rapprochement introuvable'); return false }
      toast.success('Rapprochement défait')
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  /** Crée la dépense d'un débit et la rapproche (creer_depense_liee, une transaction). */
  const creerDepenseRapprochee = useCallback(async (t: BankTransaction, d: {
    season_id: string; date: DateISO; category: CostCategory; supplier: string; notes: string; receipt_id?: string | null
  }): Promise<boolean> => {
    try {
      const montant = -eurosEnCentimes(t.amount)
      if (montant <= 0) { toast.error('Une dépense se rapproche d’un débit'); return false }
      ok(await supabase.rpc('creer_depense_liee', {
        p_cost: { season_id: d.season_id, date: d.date, category: d.category, amount: centimesEnEuros(montant), supplier: d.supplier, notes: d.notes },
        p_receipt_id: d.receipt_id ?? null, p_transaction_id: t.id,
      }) as Res<unknown>, 'création de la dépense')
      toast.success('Dépense créée et rapprochée')
      await load()
      return true
    } catch { return false }
  }, [supabase, load])

  /** Contenu d'une page de justificatif (export ZIP). Lève sur échec, après l'avoir signalé. */
  const telechargerPage = useCallback(async (p: ReceiptPage): Promise<Uint8Array> => {
    const r = await supabase.storage.from('justificatifs').createSignedUrl(p.path, 300)
    const url = ok<{ signedUrl: string }>(r as Res<{ signedUrl: string }>, `lien de ${p.path}`).signedUrl
    const res = await fetch(url)
    if (!res.ok) {
      console.error('[gestion] téléchargement', p.path, res.status)
      toast.error('Téléchargement d’un justificatif impossible', { description: `${p.path} : HTTP ${res.status}` })
      throw new ErreurAffichee(`HTTP ${res.status}`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }, [supabase])

  return {
    loading, erreur, farmId, comptes, imports, mouvements, liens, liensActifs, liensParMouvement,
    costs, sales, invoiceSales, payments, factures, receipts, pages,
    creerCompte, majCompte, importer, saisirMouvement, rapprocher, defaire, creerDepenseRapprochee, telechargerPage, reload: load,
  }
}
