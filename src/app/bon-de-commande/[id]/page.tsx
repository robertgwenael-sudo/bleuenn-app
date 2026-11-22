'use client'
// ============================================================
// Bon de commande imprimable (A4). Le PDF s'obtient par l'impression du
// navigateur (« Enregistrer en PDF »). Lecture seule : les actions restent
// dans l'écran Achats & bons de commande.
// ============================================================
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ClipboardCopy, Loader2, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatDateLongue, formatEuros, type PurchaseOrder, type PurchaseOrderLine, type Supplier } from '@/lib/domain'
import {
  alertesConditions, formatQuantiteUnite, LIBELLES_STATUTS_BON, texteEmailBon, totalLigne, totauxBon,
} from '@/lib/domain/achats'
import { Button } from '@/components/ui'
import { euros } from '@/components/achats/commun'
import { copier } from '@/components/achats/DetailBon'

const supabase = createClient()

type Donnees = { bon: PurchaseOrder; lignes: PurchaseOrderLine[]; fournisseur: Supplier; ferme: string }

function erreurLecture(quoi: string, e: { message: string } | null): never {
  console.error(`[bon de commande] lecture : ${quoi}`, e)
  throw new Error(`Lecture impossible (${quoi}) : ${e?.message ?? 'introuvable ou inaccessible'}`)
}

export default function BonDeCommandePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [d, setD] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [connexion, setConnexion] = useState(false)

  useEffect(() => {
    let actif = true
    ;(async () => {
      try {
        const u = await supabase.auth.getUser()
        if (!u.data.user) { if (actif) setConnexion(true); return }
        const b = await supabase.from('purchase_orders').select('*').eq('id', id).maybeSingle()
        if (b.error || !b.data) erreurLecture('bon de commande', b.error)
        const bon = b.data as PurchaseOrder
        const [l, f, fm] = await Promise.all([
          supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', id).order('sort_order'),
          supabase.from('suppliers').select('*').eq('id', bon.supplier_id).maybeSingle(),
          supabase.from('farms').select('name').eq('id', bon.farm_id).maybeSingle(),
        ])
        if (l.error) erreurLecture('lignes', l.error)
        if (f.error || !f.data) erreurLecture('fournisseur', f.error)
        if (fm.error || !fm.data) erreurLecture('ferme', fm.error)
        if (actif) setD({ bon, lignes: (l.data ?? []) as PurchaseOrderLine[], fournisseur: f.data as Supplier, ferme: (fm.data as { name: string }).name })
      } catch (e) {
        if (actif) setErreur(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { actif = false }
  }, [id])

  useEffect(() => {
    if (d) document.title = `${d.bon.number ?? 'Brouillon'} — ${d.fournisseur.name}`
  }, [d])

  const retour = () => (window.history.length > 1 ? router.back() : router.push('/#commandes'))

  if (connexion || erreur || !d) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        {connexion ? (<>
          <p className="text-fg">Connectez-vous pour afficher ce bon de commande.</p>
          <Link href="/" className="text-sm font-medium text-primary hover:underline">Aller à la connexion</Link>
        </>) : erreur ? (<>
          <p role="alert" className="text-sm font-medium text-danger">{erreur}</p>
          <Link href="/#commandes" className="text-sm font-medium text-primary hover:underline">Retour aux bons de commande</Link>
        </>) : (
          <p role="status" className="flex items-center gap-2 text-sm text-fg-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du bon…</p>
        )}
      </main>
    )
  }

  const { bon, lignes, fournisseur: f, ferme } = d
  const t = totauxBon(lignes, bon.shipping_amount)
  const conditions = alertesConditions(t.lignes, f)
  const brouillon = bon.status === 'brouillon'

  return (
    <div className="min-h-screen bg-surface-2 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm 14mm 16mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <Button variant="ghost" onClick={retour}><ArrowLeft className="h-4 w-4" /> Retour</Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => copier(texteEmailBon({ ferme, bon, fournisseur: f, lignes }), 'Texte du bon')}>
            <ClipboardCopy className="h-4 w-4" /> Copier pour un email
          </Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimer / PDF</Button>
        </div>
      </div>

      <article aria-label={`Bon de commande ${bon.number ?? 'brouillon'}`}
        className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[14mm] text-[13px] leading-snug text-neutral-900 shadow-card print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        {brouillon && (
          <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            Brouillon : ce bon n’a pas encore de numéro et n’a pas été envoyé.
          </p>
        )}
        <header className="flex items-start justify-between gap-6 border-b border-neutral-300 pb-5">
          <div>
            <p className="font-serif text-2xl text-neutral-900">{ferme}</p>
            <p className="mt-1 text-xs text-neutral-500">Ferme florale</p>
          </div>
          <div className="text-right">
            <h1 className="font-serif text-xl text-neutral-900">Bon de commande</h1>
            <p className="num mt-1 text-lg font-semibold">{bon.number ?? 'Brouillon'}</p>
            {bon.order_date && <p className="text-xs text-neutral-600">du {formatDateLongue(bon.order_date)}</p>}
            {bon.status !== 'envoye' && !brouillon && <p className="mt-1 text-xs text-neutral-500">Statut : {LIBELLES_STATUTS_BON[bon.status]}</p>}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Fournisseur</h2>
            <p className="font-semibold">{f.name}</p>
            {f.contact_name && <p>À l’attention de {f.contact_name}</p>}
            {f.address && <p>{f.address}</p>}
            {f.email && <p>{f.email}</p>}
            {f.phone && <p className="num">{f.phone}</p>}
          </div>
          <div>
            <h2 className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Commande</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3">
              {f.customer_number && <><dt className="text-neutral-500">N° client</dt><dd className="num">{f.customer_number}</dd></>}
              <dt className="text-neutral-500">Livraison souhaitée</dt><dd>{bon.expected_date ? formatDateLongue(bon.expected_date) : '—'}</dd>
              <dt className="text-neutral-500">Livrer à</dt><dd>{ferme}</dd>
            </dl>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-[11px] uppercase tracking-wider text-neutral-600">
              <th className="py-2 pr-2 font-semibold">Réf.</th>
              <th className="py-2 pr-2 font-semibold">Désignation</th>
              <th className="py-2 pr-2 text-right font-semibold">Quantité</th>
              <th className="py-2 pr-2 text-right font-semibold">Prix unitaire</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(l => {
              const tl = totalLigne(l)
              return (
                <tr key={l.id} className="break-inside-avoid border-b border-neutral-200 align-top">
                  <td className="num py-2 pr-2 text-neutral-600">{l.supplier_ref ?? ''}</td>
                  <td className="py-2 pr-2">
                    {l.label}{l.variety ? ` « ${l.variety} »` : ''}{l.organic ? <span className="ml-1 text-[11px] font-semibold text-green-700">BIO</span> : null}
                  </td>
                  <td className="num whitespace-nowrap py-2 pr-2 text-right">{formatQuantiteUnite(l.quantity, l.unit)}</td>
                  <td className="num whitespace-nowrap py-2 pr-2 text-right">{l.unit_price === null ? 'à confirmer' : euros(l.unit_price)}</td>
                  <td className="num whitespace-nowrap py-2 text-right">{tl === null ? '—' : formatEuros(tl)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <dl className="grid w-64 grid-cols-2 gap-y-1 text-right">
            <dt className="text-left text-neutral-600">Articles</dt><dd className="num">{formatEuros(t.lignes)}</dd>
            <dt className="text-left text-neutral-600">Frais de port</dt><dd className="num">{formatEuros(t.port)}</dd>
            <dt className="border-t border-neutral-800 pt-1 text-left font-semibold">Total</dt>
            <dd className="num border-t border-neutral-800 pt-1 font-semibold">{formatEuros(t.total)}</dd>
          </dl>
        </div>
        {t.prixManquants > 0 && <p className="mt-2 text-right text-xs text-neutral-500">Total hors lignes à prix à confirmer.</p>}

        <section className="mt-8 break-inside-avoid border-t border-neutral-300 pt-4 text-xs text-neutral-700">
          <h2 className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Conditions</h2>
          <ul className="space-y-0.5">
            <li>Minimum de commande : {f.min_order_amount !== null ? euros(f.min_order_amount) : 'non renseigné'}</li>
            <li>Franco de port : {f.free_shipping_threshold !== null ? euros(f.free_shipping_threshold) : 'non renseigné'}</li>
            <li>Délai habituel : {f.lead_time_days !== null ? `${f.lead_time_days} jours` : 'non renseigné'}</li>
          </ul>
          {brouillon && conditions.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-medium text-amber-800 print:hidden">{conditions.map(a => <li key={a.type}>{a.message}</li>)}</ul>
          )}
          {bon.notes && <p className="mt-3 whitespace-pre-line text-neutral-800">{bon.notes}</p>}
          <p className="mt-4">Merci de confirmer la commande et la date de livraison.</p>
        </section>
      </article>
    </div>
  )
}
