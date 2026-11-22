'use client'
// ============================================================
// Factures & paiements (migration 010)
// ------------------------------------------------------------
// Réglages de facturation, factures et avoirs de la ferme, leurs lignes,
// liens vers les ventes et paiements ; ventes de la ferme (toutes saisons)
// pour l'onglet « À facturer ».
// Ne touche pas à useBleuenn : prend dans le contexte la saison active (et
// donc la ferme), les saisons et l'utilisateur.
// Aucune erreur avalée : chaque échec part dans la console ET dans un toast,
// puis est relancé ; une lecture refusée met l'écran en état d'erreur au
// lieu d'afficher une liste vide trompeuse.
// Les écritures passent par les fonctions de la base (emettre_facture,
// emettre_avoir, enregistrer_paiement) : numéro, instantanés et contrôles
// sont faits côté serveur, dans une seule transaction.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { centimesEnEuros, type Client, type FarmBilling, type Invoice, type InvoiceLine, type InvoiceSale,
  type Payment, type PaymentMode, type Sale, type SaleLine } from '@/lib/domain'
import { ventesFacturees, type VenteFacturable } from '@/lib/domain/factures'

type Erreur = { message: string; code?: string; details?: string; hint?: string } | null
type Res<T> = { data: T | null; error: Erreur }

class ErreurAffichee extends Error {}
/** Pour les écrans : une erreur déjà affichée n'a pas besoin d'un second toast. */
export function dejaAffichee(e: unknown) { return e instanceof ErreurAffichee }

/** Lève sur erreur, après l'avoir montrée ; `null` sans erreur reste légitime. */
function ok<T>(r: Res<T>, contexte: string): T {
  if (r.error) {
    console.error(`[factures] ${contexte}`, r.error)
    toast.error(`Échec : ${contexte}`, { description: r.error.message, id: `factures-${contexte}` })
    throw new ErreurAffichee(r.error.message)
  }
  return r.data as T
}

/** Contexte minimal attendu de useBleuenn (types volontairement souples). */
export interface FacturesCtx {
  activeSeason: { id: string; farm_id?: string | null } | null
  seasons?: { id: string; farm_id?: string | null }[]
  user: { id: string } | null
}

export type ReglagesSaisie = Omit<FarmBilling, 'farm_id' | 'updated_by' | 'updated_at'>

export interface OptionsEmission {
  professionnel: boolean
  delai_jours: number | null
  client_siren?: string
  adresse_livraison?: string
  notes?: string
}

export interface PaiementNouveau {
  date: string
  /** Centimes entiers ; négatif pour une contre-passation ou un remboursement. */
  montant_centimes: number
  mode: PaymentMode
  reference?: string
  notes?: string
  contrepasse_de?: string | null
}

export type VenteAvecLignes = Sale & VenteFacturable & { lignes: SaleLine[] }

export function useFactures(ctx: FacturesCtx) {
  const supabase = useMemo(() => createClient(), [])
  const farmId = ctx.activeSeason?.farm_id ?? null
  const seasonIds = useMemo(() => {
    const ids = (ctx.seasons ?? []).filter(s => farmId && s.farm_id === farmId).map(s => s.id)
    if (ctx.activeSeason && !ids.includes(ctx.activeSeason.id)) ids.push(ctx.activeSeason.id)
    return ids
  }, [ctx.seasons, ctx.activeSeason, farmId])
  const cleSaisons = seasonIds.join(',')

  const [billing, setBilling] = useState<FarmBilling | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [liens, setLiens] = useState<InvoiceSale[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [saleLines, setSaleLines] = useState<SaleLine[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!farmId) { setLoading(false); return }
    const ids = cleSaisons ? cleSaisons.split(',') : []
    try {
      const [b, i, l, li, p, s, sl, c] = await Promise.all([
        supabase.from('farm_billing').select('*').eq('farm_id', farmId).maybeSingle(),
        supabase.from('invoices').select('*').eq('farm_id', farmId).order('date_emission', { ascending: false }).order('numero', { ascending: false }),
        supabase.from('invoice_lines').select('*').eq('farm_id', farmId).order('position'),
        supabase.from('invoice_sales').select('*').eq('farm_id', farmId),
        supabase.from('payments').select('*').eq('farm_id', farmId).order('date').order('created_at'),
        supabase.from('sales').select('*').in('season_id', ids).order('date', { ascending: false }),
        supabase.from('sale_lines').select('*').in('season_id', ids).order('created_at'),
        supabase.from('clients').select('*').order('name'),
      ])
      setBilling(ok<FarmBilling | null>(b as Res<FarmBilling>, 'lecture des réglages de facturation'))
      setInvoices(ok<Invoice[]>(i as Res<Invoice[]>, 'lecture des factures') ?? [])
      setLines(ok<InvoiceLine[]>(l as Res<InvoiceLine[]>, 'lecture des lignes de facture') ?? [])
      setLiens(ok<InvoiceSale[]>(li as Res<InvoiceSale[]>, 'lecture des ventes facturées') ?? [])
      setPayments(ok<Payment[]>(p as Res<Payment[]>, 'lecture des paiements') ?? [])
      setSales(ok<Sale[]>(s as Res<Sale[]>, 'lecture des ventes') ?? [])
      setSaleLines(ok<SaleLine[]>(sl as Res<SaleLine[]>, 'lecture des lignes de vente') ?? [])
      setClients(ok<Client[]>(c as Res<Client[]>, 'lecture des clients') ?? [])
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [supabase, farmId, cleSaisons])

  useEffect(() => { setLoading(true); load() }, [load])

  // ─── Index ───────────────────────────────────────────────
  const lignesParFacture = useMemo(() => {
    const m = new Map<string, InvoiceLine[]>()
    for (const l of lines) m.set(l.invoice_id, [...(m.get(l.invoice_id) ?? []), l])
    return m
  }, [lines])
  const paiementsParFacture = useMemo(() => {
    const m = new Map<string, Payment[]>()
    for (const p of payments) m.set(p.invoice_id, [...(m.get(p.invoice_id) ?? []), p])
    return m
  }, [payments])
  const facturesParId = useMemo(() => new Map(invoices.map(f => [f.id, f])), [invoices])
  const clientsParId = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  /** sale_id → facture active qui la couvre. */
  const factureDeVente = useMemo(() => ventesFacturees(liens), [liens])
  const ventes: VenteAvecLignes[] = useMemo(() => {
    const m = new Map<string, SaleLine[]>()
    for (const l of saleLines) m.set(l.sale_id, [...(m.get(l.sale_id) ?? []), l])
    return sales.map(v => ({ ...v, lignes: m.get(v.id) ?? [] })) as VenteAvecLignes[]
  }, [sales, saleLines])

  // ─── Écritures ───────────────────────────────────────────
  const exigerFerme = () => {
    if (!farmId) {
      toast.error('Aucune ferme active')
      throw new ErreurAffichee('Aucune ferme active')
    }
    return farmId
  }

  /** Enregistre les réglages (owner seulement : la RLS refuse les autres). */
  const saveBilling = async (v: ReglagesSaisie) => {
    const fid = exigerFerme()
    try {
      // .select() : une mise à jour filtrée par la RLS ne renvoie pas
      // d'erreur, seulement zéro ligne. On le détecte.
      const r = await supabase.from('farm_billing').upsert({ ...v, farm_id: fid }, { onConflict: 'farm_id' }).select()
      const rows = ok<FarmBilling[]>(r as Res<FarmBilling[]>, 'enregistrement des réglages de facturation')
      if (!rows || rows.length === 0) {
        console.error('[factures] réglages : aucune ligne écrite (droits insuffisants ?)')
        toast.error('Échec : seul un propriétaire de la ferme peut modifier les réglages de facturation')
        throw new ErreurAffichee('Aucune ligne écrite')
      }
    } finally {
      await load()
    }
  }

  /** Numéro attribué par la base, relu après émission (pour l'annoncer). */
  const numeroDe = async (id: string) => {
    const r = await supabase.from('invoices').select('numero').eq('id', id).maybeSingle()
    return ok<{ numero: string } | null>(r as Res<{ numero: string }>, 'lecture du numéro attribué')?.numero ?? null
  }

  const emettreFacture = async (saleIds: string[], o: OptionsEmission): Promise<{ id: string; numero: string | null }> => {
    exigerFerme()
    try {
      const id = ok<string>(await supabase.rpc('emettre_facture', {
        p_sale_ids: saleIds,
        p_options: {
          professionnel: o.professionnel,
          ...(o.delai_jours === null ? {} : { delai_jours: o.delai_jours }),
          client_siren: o.client_siren?.trim() || null,
          adresse_livraison: o.adresse_livraison?.trim() || null,
          notes: o.notes?.trim() || null,
        },
      }) as Res<string>, 'émission de la facture')
      return { id, numero: await numeroDe(id) }
    } finally {
      await load()
    }
  }

  const emettreAvoir = async (invoiceId: string, motif: string): Promise<{ id: string; numero: string | null }> => {
    try {
      const id = ok<string>(await supabase.rpc('emettre_avoir', { p_invoice_id: invoiceId, p_motif: motif }) as Res<string>,
        'émission de l’avoir')
      return { id, numero: await numeroDe(id) }
    } finally {
      await load()
    }
  }

  const enregistrerPaiement = async (invoiceId: string, p: PaiementNouveau): Promise<string> => {
    if (!Number.isSafeInteger(p.montant_centimes) || p.montant_centimes === 0) {
      toast.error('Montant invalide')
      throw new ErreurAffichee('Montant invalide')
    }
    try {
      return ok<string>(await supabase.rpc('enregistrer_paiement', {
        p_invoice_id: invoiceId,
        p_paiement: {
          date: p.date, amount: centimesEnEuros(p.montant_centimes), mode: p.mode,
          reference: p.reference?.trim() || null, notes: p.notes?.trim() || null, contrepasse_de: p.contrepasse_de ?? null,
        },
      }) as Res<string>, p.montant_centimes < 0 ? 'contre-passation du paiement' : 'enregistrement du paiement')
    } finally {
      await load()
    }
  }

  return {
    loading, erreur, reload: load, farmId,
    billing, invoices, lines, liens, payments, ventes, clients,
    lignesParFacture, paiementsParFacture, facturesParId, clientsParId, factureDeVente,
    saveBilling, emettreFacture, emettreAvoir, enregistrerPaiement,
  }
}

export type Factures = ReturnType<typeof useFactures>

/**
 * Une facture et ses lignes, pour la page d'impression. Ne lit QUE les
 * instantanés figés (invoices, invoice_lines) et la facture liée (numéro de
 * la facture corrigée par un avoir) : jamais le client ni les réglages
 * vivants. Passe par le client du navigateur : la RLS s'applique.
 */
export function useFactureImprimable(id: string | null) {
  const supabase = useMemo(() => createClient(), [])
  const [etat, setEtat] = useState<{
    loading: boolean; erreur: string | null; facture: Invoice | null; lignes: InvoiceLine[]; liee: Pick<Invoice, 'id' | 'numero' | 'date_emission'> | null
  }>({ loading: true, erreur: null, facture: null, lignes: [], liee: null })

  useEffect(() => {
    if (!id) return
    let actif = true
    ;(async () => {
      try {
        const [f, l] = await Promise.all([
          supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
          supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
        ])
        const facture = ok<Invoice | null>(f as Res<Invoice>, 'lecture de la facture')
        const lignes = ok<InvoiceLine[]>(l as Res<InvoiceLine[]>, 'lecture des lignes de la facture') ?? []
        let liee: Pick<Invoice, 'id' | 'numero' | 'date_emission'> | null = null
        const lieeId = facture?.avoir_de ?? facture?.annulee_par ?? null
        if (lieeId) {
          const r = await supabase.from('invoices').select('id, numero, date_emission').eq('id', lieeId).maybeSingle()
          liee = ok<Pick<Invoice, 'id' | 'numero' | 'date_emission'> | null>(r as Res<Pick<Invoice, 'id' | 'numero' | 'date_emission'>>, 'lecture de la facture liée')
        }
        if (actif) setEtat({ loading: false, erreur: null, facture, lignes, liee })
      } catch (e) {
        if (actif) setEtat({ loading: false, erreur: e instanceof Error ? e.message : String(e), facture: null, lignes: [], liee: null })
      }
    })()
    return () => { actif = false }
  }, [supabase, id])

  return etat
}

/**
 * Ventes couvertes par une facture non annulée : sale_id → numéro de facture.
 * Pour le badge « Facturée n° … » de l'écran Ventes. Erreur affichée, jamais
 * avalée ; en cas d'échec la carte reste vide (pas de badge) et l'erreur est visible.
 */
export function useNumerosFactureParVente(farmId: string | null | undefined, cle?: unknown) {
  const supabase = useMemo(() => createClient(), [])
  const [m, setM] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!farmId) return
    let actif = true
    ;(async () => {
      try {
        const [l, i] = await Promise.all([
          supabase.from('invoice_sales').select('sale_id, invoice_id, liberee_par_avoir').eq('farm_id', farmId).is('liberee_par_avoir', null),
          supabase.from('invoices').select('id, numero').eq('farm_id', farmId).eq('kind', 'facture'),
        ])
        const liens = ok<Pick<InvoiceSale, 'sale_id' | 'invoice_id' | 'liberee_par_avoir'>[]>(l as Res<InvoiceSale[]>, 'lecture des ventes facturées') ?? []
        const nums = new Map((ok<{ id: string; numero: string }[]>(i as Res<{ id: string; numero: string }[]>, 'lecture des numéros de facture') ?? []).map(x => [x.id, x.numero]))
        const out = new Map<string, string>()
        for (const [sid, iid] of ventesFacturees(liens)) { const n = nums.get(iid); if (n) out.set(sid, n) }
        if (actif) setM(out)
      } catch { /* déjà affichée par ok() */ }
    })()
    return () => { actif = false }
  }, [supabase, farmId, cle])
  return m
}
