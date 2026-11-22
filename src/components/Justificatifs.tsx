'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Camera, FileWarning, Inbox, Receipt as IconeRecu } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui'
import { formatEuros, type Cost } from '@/lib/domain'
import { LIBELLES_CATEGORIES } from '@/lib/domain/couts'
import { depensesSansJustificatif, statutJustificatif, type StatutJustificatif } from '@/lib/domain/gestion'
import { aujourdhuiParis, type useBleuenn } from '@/hooks/useBleuenn'
import { useJustificatifs, type JustificatifsCtx } from '@/hooks/useJustificatifs'
import { ScanDialog } from '@/components/justificatifs/ScanDialog'
import { FicheJustificatif } from '@/components/justificatifs/FicheJustificatif'
import { BadgeStatut, centimesOuNull, dateFr, euros, Vignette } from '@/components/justificatifs/commun'

type Onglet = 'a_traiter' | 'traites' | 'sans_objet' | 'manquants'

export default function Justificatifs({ ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  const jctx: JustificatifsCtx = { farm: ctx.farm as any, activeSeason: ctx.activeSeason as any, seasons: ctx.seasons as any, user: ctx.user }
  const j = useJustificatifs(jctx)
  const aujourdhui = ctx.today || aujourdhuiParis()
  const [onglet, setOnglet] = useState<Onglet>('a_traiter')
  const [scan, setScan] = useState<{ pour: Cost | null } | null>(null)
  const [ouvert, setOuvert] = useState<string | null>(null)

  const parStatut = useMemo(() => {
    const m: Record<StatutJustificatif, typeof j.receipts> = { a_traiter: [], depense: [], paiement: [], sans_objet: [] }
    for (const r of j.receipts) m[statutJustificatif(r)].push(r)
    return m
  }, [j.receipts])
  const manquants = useMemo(() => depensesSansJustificatif(j.costs, j.receipts), [j.costs, j.receipts])
  const liste = onglet === 'a_traiter' ? parStatut.a_traiter
    : onglet === 'traites' ? [...parStatut.depense, ...parStatut.paiement]
      : onglet === 'sans_objet' ? parStatut.sans_objet : []

  // Vignettes de la liste affichée
  const { demanderUrls, pagesParJustificatif } = j
  useEffect(() => {
    demanderUrls(liste.map(r => pagesParJustificatif.get(r.id)?.[0]).filter((p): p is NonNullable<typeof p> => !!p))
  }, [liste, pagesParJustificatif, demanderUrls])

  const fiche = ouvert ? j.receipts.find(r => r.id === ouvert) ?? null : null

  const enregistrerScan = async (pages: Parameters<typeof j.scanner>[0], saisie: Parameters<typeof j.scanner>[1]) => {
    const pour = scan?.pour ?? null
    const id = await j.scanner(pages, saisie)
    if (!id) return false
    if (pour) await j.rattacher(id, { cost_id: pour.id }, 'Justificatif rattaché à la dépense')
    else setOuvert(id)
    return true
  }

  if (!ctx.farm && !ctx.activeSeason) {
    return (
      <div>
        <PageHeader title="Justificatifs" description="Tickets et factures d’achat, scannés et rangés" />
        <Card><EmptyState title="Aucune ferme" description="Créez une saison pour commencer." /></Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Justificatifs" description="Tickets et factures d’achat, scannés puis rattachés aux dépenses"
        actions={<Button size="lg" onClick={() => setScan({ pour: null })}><Camera className="h-5 w-5" aria-hidden /> Scanner un justificatif</Button>} />

      {j.erreur ? (
        <Card role="alert" className="flex items-start gap-3 border-danger/30 p-5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          <div>
            <p className="font-semibold text-fg">Les justificatifs n’ont pas pu être lus</p>
            <p className="mt-0.5 text-fg-muted">{j.erreur}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => j.reload()}>Réessayer</Button>
          </div>
        </Card>
      ) : j.loading ? (
        <div className="space-y-3" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-card" />)}</div>
      ) : (
        <>
          <Tabs label="Justificatifs" value={onglet} onChange={setOnglet} className="mb-5 overflow-x-auto"
            options={[
              { value: 'a_traiter', label: <span className="whitespace-nowrap">À traiter · {parStatut.a_traiter.length}</span> },
              { value: 'traites', label: <span className="whitespace-nowrap">Rattachés · {parStatut.depense.length + parStatut.paiement.length}</span> },
              { value: 'sans_objet', label: <span className="whitespace-nowrap">Sans objet · {parStatut.sans_objet.length}</span> },
              { value: 'manquants', label: <span className="whitespace-nowrap">Sans justificatif · {manquants.length}</span>, icon: manquants.length ? <FileWarning className="h-3.5 w-3.5 text-warning" aria-hidden /> : undefined },
            ]} />

          <div role="tabpanel">
            {onglet !== 'manquants' ? (
              liste.length === 0 ? (
                <Card><EmptyState icon={<Inbox className="h-6 w-6" />} compact
                  title={onglet === 'a_traiter' ? 'Rien à traiter' : 'Aucun justificatif ici'}
                  description={onglet === 'a_traiter' ? 'Scannez un ticket ou une facture dès l’achat : il attendra ici d’être rattaché.' : undefined} /></Card>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-label="Liste des justificatifs">
                  {liste.map(r => {
                    const p0 = j.pagesParJustificatif.get(r.id)?.[0]
                    const nb = j.pagesParJustificatif.get(r.id)?.length ?? 0
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => setOuvert(r.id)}
                          aria-label={`Ouvrir le justificatif ${r.fournisseur ?? 'sans fournisseur'} du ${dateFr(r.date_piece ?? r.created_at.slice(0, 10))}`}
                          className="flex w-full items-center gap-3 rounded-card border border-border bg-surface p-3 text-left shadow-card transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Vignette url={p0 ? j.urls[p0.id] : null} pdf={p0?.mime === 'application/pdf'} alt="" className="h-16 w-12" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-fg">{r.fournisseur || 'Fournisseur à préciser'}</span>
                            <span className="mt-0.5 block text-xs text-fg-muted">
                              {r.date_piece ? dateFr(r.date_piece) : `scanné le ${dateFr(r.created_at.slice(0, 10))}`}{nb > 1 ? ` · ${nb} pages` : ''}
                            </span>
                            <span className="mt-1.5 block"><BadgeStatut statut={statutJustificatif(r)} /></span>
                          </span>
                          <span className="num shrink-0 text-right font-semibold text-fg">
                            {centimesOuNull(r.montant) === null ? <span className="text-xs font-normal italic text-fg-subtle">montant à saisir</span> : euros(r.montant)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            ) : manquants.length === 0 ? (
              <Card><EmptyState icon={<IconeRecu className="h-6 w-6" />} compact title="Toutes les dépenses ont leur justificatif" /></Card>
            ) : (
              <Card>
                <p className="border-b border-border px-4 py-3 text-sm text-fg-muted">
                  {manquants.length} dépense{manquants.length > 1 ? 's' : ''} sans justificatif, pour {formatEuros(manquants.reduce((s, c) => s + (centimesOuNull(c.amount) ?? 0), 0))}.
                  Le comptable vous les demandera.
                </p>
                <ul className="divide-y divide-border" aria-label="Dépenses sans justificatif">
                  {manquants.map(c => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-fg">{c.supplier || LIBELLES_CATEGORIES[c.category]}</span>
                        <span className="block text-xs text-fg-muted">{dateFr(c.date)} · {LIBELLES_CATEGORIES[c.category]}{c.notes ? ` · ${c.notes}` : ''}</span>
                      </span>
                      <span className="num font-semibold">{euros(c.amount)}</span>
                      <Button size="sm" variant="secondary" onClick={() => setScan({ pour: c })}
                        aria-label={`Scanner le justificatif de ${c.supplier || LIBELLES_CATEGORIES[c.category]} du ${dateFr(c.date)}`}>
                        <Camera className="h-4 w-4" aria-hidden /> Scanner
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}

      <ScanDialog open={!!scan} onOpenChange={o => !o && setScan(null)} aujourdhui={aujourdhui} onEnregistrer={enregistrerScan}
        titre={scan?.pour ? `Justificatif : ${scan.pour.supplier || LIBELLES_CATEGORIES[scan.pour.category]} (${euros(scan.pour.amount)})` : undefined} />
      {fiche && <FicheJustificatif key={fiche.id} j={j} r={fiche} ctx={jctx} aujourdhui={aujourdhui} onClose={() => setOuvert(null)} />}
    </div>
  )
}
