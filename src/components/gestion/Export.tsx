'use client'
import { useMemo, useState } from 'react'
import { Archive, FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardHeader, Field, Input } from '@/components/ui'
import { ajouterJours, ajouterMois, estDateValide, eurosEnCentimes, premierDuMois, type DateISO } from '@/lib/domain'
import { genererCsv, nomFichierExport, type Tableau } from '@/lib/domain/exports'
import { MODE_PAIEMENT_LIBELLE } from '@/lib/domain/factures'
import {
  actif, dansPeriode, exportDepenses, exportMouvementsRapproches, exportRecettes, nomFichierJustificatif, type Recette,
} from '@/lib/domain/gestion'
import { telechargerTexte } from '@/components/exports/telecharger'
import type { useGestion } from '@/hooks/useGestion'
import { creerZip, type FichierZip } from './zip'
import type { DonneesGestion } from './donnees'

type G = ReturnType<typeof useGestion>

export function Export({ g, d, aujourdhui }: { g: G; d: DonneesGestion; aujourdhui: DateISO }) {
  const annee = Number(aujourdhui.slice(0, 4))
  const [du, setDu] = useState(`${annee}-01-01`)
  const [au, setAu] = useState(`${annee}-12-31`)
  const [busy, setBusy] = useState<string | null>(null)
  const invalide = !estDateValide(du) || !estDateValide(au) ? 'Saisissez les deux dates.' : au < du ? 'La date de fin précède la date de début.' : null

  const presets: { label: string; du: DateISO; au: DateISO }[] = useMemo(() => {
    const debutMois = premierDuMois(aujourdhui)
    const moisPrec = ajouterMois(debutMois, -1)
    const t = Math.floor((Number(aujourdhui.slice(5, 7)) - 1) / 3)
    const debutTrim = `${annee}-${String(t * 3 + 1).padStart(2, '0')}-01`
    const trimPrec = ajouterMois(debutTrim, -3)
    return [
      { label: `Année ${annee}`, du: `${annee}-01-01`, au: `${annee}-12-31` },
      { label: `Année ${annee - 1}`, du: `${annee - 1}-01-01`, au: `${annee - 1}-12-31` },
      { label: 'Trimestre précédent', du: trimPrec, au: ajouterJours(debutTrim, -1) },
      { label: 'Mois précédent', du: moisPrec, au: ajouterJours(debutMois, -1) },
    ]
  }, [aujourdhui, annee])

  // Contenu de la période
  const contenu = useMemo(() => {
    if (invalide) return null
    const recettes = d.recettes.filter(r => dansPeriode(r.date, du, au))
    const couts = g.costs.filter(c => dansPeriode(c.date, du, au)).sort((a, b) => a.date.localeCompare(b.date))
    const pagesDe = (receiptIds: Set<string>) => g.pages.filter(p => receiptIds.has(p.receipt_id))
    const recus = new Map(g.receipts.map(r => [r.id, r]))
    const nomsParCout = new Map<string, string[]>()
    for (const p of g.pages) {
      const r = recus.get(p.receipt_id)
      if (!r?.cost_id) continue
      nomsParCout.set(r.cost_id, [...(nomsParCout.get(r.cost_id) ?? []), nomFichierJustificatif(r, p)])
    }
    const rapprocheRecette = (r: Recette) => r.source === 'paiement' ? d.rapprochementDe('payment_id', r.id)
      : r.source === 'vente' ? d.rapprochementDe('sale_id', r.id)
        : (() => { const l = g.liens.find(x => x.id === r.id); const t = l && d.mouvementsParId.get(l.transaction_id); return t ? { date: t.date, compte: d.comptesParId.get(t.account_id)?.name ?? '' } : null })()
    const tRecettes = exportRecettes(recettes, rapprocheRecette, MODE_PAIEMENT_LIBELLE)
    const tDepenses = exportDepenses(couts, c => nomsParCout.get(c.id) ?? [], c => d.rapprochementDe('cost_id', c.id))
    const lignesMvt = g.liensActifs.flatMap(l => {
      const t = d.mouvementsParId.get(l.transaction_id)
      if (!t || !dansPeriode(t.date, du, au)) return []
      return [{ date: t.date, compte: d.comptesParId.get(t.account_id)?.name ?? '', label: t.label, montant: eurosEnCentimes(t.amount), kind: l.kind,
        piece: pieceDe(l), rapproche: eurosEnCentimes(l.amount) }]
    }).sort((a, b) => a.date.localeCompare(b.date))
    function pieceDe(l: (typeof g.liens)[number]): string {
      if (l.kind === 'paiement') { const p = g.payments.find(x => x.id === l.payment_id); return p ? `${d.facturesParId.get(p.invoice_id)?.numero ?? ''} ${d.facturesParId.get(p.invoice_id)?.client_nom ?? ''}`.trim() : '' }
      if (l.kind === 'depense') { const c = g.costs.find(x => x.id === l.cost_id); return c ? `${c.supplier ?? ''} ${c.date}`.trim() : '' }
      if (l.kind === 'vente') { const v = g.sales.find(x => x.id === l.sale_id); return v ? `${v.channel} ${v.client ?? ''} ${v.date}`.trim() : '' }
      return l.libelle ?? l.categorie ?? ''
    }
    const tMouvements = exportMouvementsRapproches(lignesMvt)
    // Justificatifs de la période : ceux des dépenses et des paiements exportés
    const ids = new Set(g.receipts.filter(r => (r.cost_id && couts.some(c => c.id === r.cost_id))
      || (r.payment_id && recettes.some(x => x.source === 'paiement' && x.id === r.payment_id))).map(r => r.id))
    const pages = pagesDe(ids)
    return { tRecettes, tDepenses, tMouvements, pages, recus, nbManquants: couts.filter(c => !nomsParCout.has(c.id)).length, nbCouts: couts.length }
  }, [invalide, du, au, d, g.costs, g.pages, g.receipts, g.liens, g.liensActifs, g.payments, g.sales])

  const csv = (cle: string, t: Tableau) => {
    try {
      telechargerTexte(nomFichierExport(cle, du, au), genererCsv(t))
    } catch (e) {
      console.error('[gestion] export', e)
      toast.error('Export impossible', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const zip = async () => {
    if (!contenu) return
    setBusy('zip')
    try {
      const enc = new TextEncoder()
      const fichiers: FichierZip[] = [
        { nom: nomFichierExport('recettes', du, au), donnees: enc.encode(genererCsv(contenu.tRecettes)) },
        { nom: nomFichierExport('depenses', du, au), donnees: enc.encode(genererCsv(contenu.tDepenses)) },
        { nom: nomFichierExport('mouvements-rapproches', du, au), donnees: enc.encode(genererCsv(contenu.tMouvements)) },
      ]
      for (const p of contenu.pages) {
        const r = contenu.recus.get(p.receipt_id)!
        fichiers.push({ nom: `justificatifs/${nomFichierJustificatif(r, p)}`, donnees: await g.telechargerPage(p) })
      }
      const maintenant = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', 'T')
      const archive = creerZip(fichiers, maintenant)
      const url = URL.createObjectURL(new Blob([archive.slice().buffer], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url; a.download = `bleuenn-comptable-${du}_${au}.zip`; a.style.display = 'none'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success(`Archive prête : 3 fichiers CSV et ${contenu.pages.length} justificatif${contenu.pages.length > 1 ? 's' : ''}`)
    } catch (e) {
      // Une page en échec a déjà été signalée par le hook ; les autres erreurs ici
      console.error('[gestion] archive ZIP', e)
      toast.error('Archive impossible', { description: e instanceof Error ? e.message : String(e), id: 'gestion-zip' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Période" description="Fichiers CSV lisibles par un tableur (point-virgule, virgule décimale), à transmettre au comptable" />
        <div className="space-y-4 px-4 pb-5 pt-2 sm:px-5">
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <Button key={p.label} size="sm" variant={p.du === du && p.au === au ? 'primary' : 'secondary'} onClick={() => { setDu(p.du); setAu(p.au) }}>{p.label}</Button>
            ))}
          </div>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Field label="Du"><Input type="date" value={du} onChange={e => setDu(e.target.value)} /></Field>
            <Field label="Au"><Input type="date" value={au} onChange={e => setAu(e.target.value)} /></Field>
          </div>
          {invalide && <p role="alert" className="text-sm text-danger">{invalide}</p>}
        </div>
      </Card>

      {contenu && (
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ['recettes', 'Recettes', contenu.tRecettes, 'Paiements de factures, ventes sans facture, recettes hors facture'],
            ['depenses', 'Dépenses', contenu.tDepenses, `Avec le nom du fichier justificatif${contenu.nbManquants ? ` · ${contenu.nbManquants} « MANQUANT »` : ''}`],
            ['mouvements-rapproches', 'Mouvements rapprochés', contenu.tMouvements, 'Ligne du relevé et pièce correspondante'],
          ] as const).map(([cle, titre, t, desc]) => (
            <Card key={cle} className="flex flex-col p-4">
              <p className="font-semibold text-fg">{titre}</p>
              <p className="mt-0.5 flex-1 text-xs text-fg-muted">{desc}</p>
              <p className="num mt-2 text-sm text-fg-muted">{t.lignes.length} ligne{t.lignes.length > 1 ? 's' : ''}</p>
              <Button className="mt-3" variant="secondary" onClick={() => csv(cle, t)}><FileDown className="h-4 w-4" aria-hidden /> Télécharger<span className="sr-only"> {titre.toLowerCase()}</span> (CSV)</Button>
            </Card>
          ))}
        </div>
      )}

      {contenu && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <Archive className="h-6 w-6 text-fg-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-fg">Tout en une archive ZIP</p>
            <p className="text-xs text-fg-muted">Les trois CSV et {contenu.pages.length} fichier{contenu.pages.length > 1 ? 's' : ''} justificatif{contenu.pages.length > 1 ? 's' : ''}, nommés comme dans le CSV des dépenses.</p>
          </div>
          <Button onClick={zip} loading={busy === 'zip'}>Télécharger l’archive</Button>
        </Card>
      )}
    </div>
  )
}
