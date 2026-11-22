'use client'
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Link2, Link2Off, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea, useConfirm } from '@/components/ui'
import { COST_CATEGORIES, formatEuros, type CostCategory, type DateISO, type Receipt } from '@/lib/domain'
import { LIBELLES_CATEGORIES } from '@/lib/domain/couts'
import { MODE_PAIEMENT_LIBELLE } from '@/lib/domain/factures'
import { categorieSuggeree, depensesSansJustificatif, statutJustificatif } from '@/lib/domain/gestion'
import { lireMontant } from '@/components/couts/commun'
import { saisonPour, type useJustificatifs, type JustificatifsCtx } from '@/hooks/useJustificatifs'
import { BadgeStatut, centimesEnSaisie, centimesOuNull, dateFr, euros } from './commun'
import { LectureAuto } from './ScanDialog'

type J = ReturnType<typeof useJustificatifs>
type Traitement = 'creer' | 'depense' | 'paiement' | 'sans_objet'

/** Fiche d'un justificatif : pages, informations confirmées, traitement. */
export function FicheJustificatif({ j, r, ctx, aujourdhui, onClose }: {
  j: J
  r: Receipt
  ctx: JustificatifsCtx
  aujourdhui: DateISO
  onClose: () => void
}) {
  const confirm = useConfirm()
  const pages = useMemo(() => j.pagesParJustificatif.get(r.id) ?? [], [j.pagesParJustificatif, r.id])
  const [page, setPage] = useState(0)
  const p = pages[page]
  const url = p ? j.urls[p.id] : undefined
  const statut = statutJustificatif(r)
  const { demanderUrls } = j
  useEffect(() => { demanderUrls(pages) }, [pages, demanderUrls])

  // Informations confirmées
  const [date, setDate] = useState(r.date_piece ?? '')
  const [montant, setMontant] = useState(centimesEnSaisie(centimesOuNull(r.montant)))
  const [fournisseur, setFournisseur] = useState(r.fournisseur ?? '')
  const [notes, setNotes] = useState(r.notes ?? '')
  const [texteOcr, setTexteOcr] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const montantC = montant.trim() ? lireMontant(montant) : null
  const montantInvalide = montant.trim() !== '' && montantC === null
  const modifie = date !== (r.date_piece ?? '') || montant !== centimesEnSaisie(centimesOuNull(r.montant)) || fournisseur !== (r.fournisseur ?? '') || notes !== (r.notes ?? '') || texteOcr !== undefined

  // Image de la page affichée, pour la lecture automatique
  const [image, setImage] = useState<Blob | null>(null)
  useEffect(() => {
    setImage(null)
    if (!url || p?.mime === 'application/pdf') return
    let annule = false
    fetch(url).then(res => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(b => { if (!annule) setImage(b) })
      .catch(e => console.error('[justificatifs] image pour la lecture automatique', e))
    return () => { annule = true }
  }, [url, p?.mime])

  const enregistrerInfos = async () => {
    setBusy('infos')
    await j.enregistrer(r.id, { date_piece: date || null, montant_centimes: montantC, fournisseur, notes, ocr_texte: texteOcr })
    setTexteOcr(undefined)
    setBusy(null)
  }

  // Traitement
  const [traitement, setTraitement] = useState<Traitement>('creer')
  const [categorie, setCategorie] = useState<CostCategory>(() => categorieSuggeree(`${r.fournisseur ?? ''}\n${r.ocr_texte ?? ''}`) ?? 'autre')
  const saisons = (ctx.seasons ?? []).filter(s => s.farm_id === j.farmId)
  const [saison, setSaison] = useState<string>(() => saisonPour(r.date_piece ?? aujourdhui, ctx) ?? '')
  const libres = useMemo(() => {
    const sans = depensesSansJustificatif(j.costs, j.receipts)
    const cible = centimesOuNull(r.montant)
    return [...sans].sort((a, b) => Number(centimesOuNull(b.amount) === cible) - Number(centimesOuNull(a.amount) === cible) || b.date.localeCompare(a.date))
  }, [j.costs, j.receipts, r.montant])
  const [coutChoisi, setCoutChoisi] = useState('')
  const numeros = useMemo(() => new Map(j.factures.map(f => [f.id, f])), [j.factures])
  const paiements = useMemo(() => j.payments.filter(x => Number(x.amount) > 0 && !j.receipts.some(y => y.payment_id === x.id)), [j.payments, j.receipts])
  const [paiementChoisi, setPaiementChoisi] = useState('')

  const creer = async () => {
    if (!date) { toast.error('Indiquez la date de la pièce'); return }
    if (!montantC) { toast.error('Indiquez le montant de la pièce'); return }
    if (!saison) { toast.error('Choisissez la saison de gestion'); return }
    setBusy('creer')
    // Les informations saisies sont d'abord confirmées sur le justificatif
    if (modifie && !(await j.enregistrer(r.id, { date_piece: date, montant_centimes: montantC, fournisseur, notes, ocr_texte: texteOcr }))) { setBusy(null); return }
    const id = await j.creerDepense(r.id, { season_id: saison, date, category: categorie, montant_centimes: montantC, supplier: fournisseur, notes })
    setBusy(null)
    if (id) onClose()
  }
  const rattacher = async (cible: { cost_id?: string; payment_id?: string; sans_objet?: boolean }, message: string) => {
    setBusy('rattacher')
    const ok = await j.rattacher(r.id, cible, message)
    setBusy(null)
    if (ok) onClose()
  }
  const supprimer = async () => {
    if (!(await confirm({ title: 'Supprimer ce justificatif ?', description: 'Le fichier est supprimé définitivement.', confirmLabel: 'Supprimer', destructive: true }))) return
    if (await j.supprimer(r.id)) onClose()
  }

  const cout = r.cost_id ? j.costs.find(c => c.id === r.cost_id) : null
  const paiement = r.payment_id ? j.payments.find(x => x.id === r.payment_id) : null

  return (
    <Dialog open onOpenChange={o => !o && onClose()} size="lg"
      title={r.fournisseur || 'Justificatif'}
      description={<span className="flex flex-wrap items-center gap-2"><BadgeStatut statut={statut} /> {dateFr(r.date_piece)} · {euros(r.montant)}</span>}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr]">
        {/* Pages */}
        <div>
          <div className="overflow-hidden rounded-card border border-border bg-surface-2">
            {!p ? <p className="p-6 text-center text-sm text-fg-muted">Aucune page</p>
              : p.mime === 'application/pdf'
                ? <div className="p-6 text-center text-sm">
                    <p className="text-fg-muted">Document PDF</p>
                    {url && <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-medium text-primary underline">Ouvrir le PDF <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
                    {url === null && <p className="mt-2 text-danger">Fichier indisponible</p>}
                  </div>
                : url ? (
                  <a href={url} target="_blank" rel="noreferrer" title="Ouvrir en grand">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
                    <img src={url} alt={`Page ${page + 1} du justificatif`} className="max-h-[22rem] w-full object-contain" />
                  </a>
                ) : <p className="p-6 text-center text-sm text-fg-muted">{url === null ? 'Page indisponible' : 'Chargement…'}</p>}
          </div>
          {pages.length > 1 && (
            <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Page précédente</Button>
              <span>{page + 1} / {pages.length}</span>
              <Button size="sm" variant="ghost" disabled={page >= pages.length - 1} onClick={() => setPage(page + 1)}>Page suivante</Button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Informations */}
          <section aria-labelledby="infos-justif" className="space-y-3">
            <h3 id="infos-justif" className="text-sm font-semibold text-fg">Informations de la pièce</h3>
            {statut === 'a_traiter' && <LectureAuto image={image} aujourdhui={aujourdhui} onTexte={setTexteOcr}
              onUtiliser={(c, v) => { if (c === 'date') setDate(v); else if (c === 'montant') setMontant(v); else setFournisseur(v) }} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date de la pièce"><Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value)} /></Field>
              <Field label="Montant total (€)" error={montantInvalide ? 'Montant illisible' : undefined}>
                <Input inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Fournisseur" className="sm:col-span-2"><Input value={fournisseur} onChange={e => setFournisseur(e.target.value)} maxLength={200} /></Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} /></Field>
            </div>
            {modifie && statut !== 'a_traiter' && (
              <Button size="sm" variant="secondary" onClick={enregistrerInfos} loading={busy === 'infos'} disabled={montantInvalide}>Enregistrer les informations</Button>
            )}
            {modifie && statut === 'a_traiter' && (
              <Button size="sm" variant="ghost" onClick={enregistrerInfos} loading={busy === 'infos'} disabled={montantInvalide}>Enregistrer sans traiter</Button>
            )}
          </section>

          {/* Traitement */}
          <section aria-labelledby="traitement-justif" className="space-y-3 border-t border-border pt-4">
            <h3 id="traitement-justif" className="text-sm font-semibold text-fg">Traitement</h3>
            {statut === 'a_traiter' ? (
              <>
                <Segmented label="Que faire de ce justificatif ?" value={traitement} onChange={setTraitement} size="sm"
                  options={[{ value: 'creer', label: 'Créer la dépense' }, { value: 'depense', label: 'Dépense existante' },
                    { value: 'paiement', label: 'Paiement reçu' }, { value: 'sans_objet', label: 'Sans objet' }]} />
                {traitement === 'creer' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Catégorie">
                      <Select value={categorie} onChange={e => setCategorie(e.target.value as CostCategory)}>
                        {COST_CATEGORIES.map(c => <option key={c} value={c}>{LIBELLES_CATEGORIES[c]}</option>)}
                      </Select>
                    </Field>
                    <Field label="Saison de gestion">
                      <Select value={saison} onChange={e => setSaison(e.target.value)}>
                        {saisons.map(s => <option key={s.id} value={s.id}>{s.name ?? s.year}</option>)}
                      </Select>
                    </Field>
                    <Button className="sm:col-span-2" onClick={creer} loading={busy === 'creer'} disabled={!montantC || !date || montantInvalide}>
                      Créer la dépense{montantC ? ` · ${formatEuros(montantC)}` : ''}
                    </Button>
                  </div>
                )}
                {traitement === 'depense' && (
                  libres.length ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select aria-label="Dépense sans justificatif" value={coutChoisi} onChange={e => setCoutChoisi(e.target.value)} wrapperClassName="flex-1">
                        <option value="">Choisir une dépense sans justificatif…</option>
                        {libres.map(c => <option key={c.id} value={c.id}>{dateFr(c.date)} · {c.supplier || LIBELLES_CATEGORIES[c.category]} · {euros(c.amount)}</option>)}
                      </Select>
                      <Button disabled={!coutChoisi} loading={busy === 'rattacher'} onClick={() => rattacher({ cost_id: coutChoisi }, 'Justificatif rattaché à la dépense')}>
                        <Link2 className="h-4 w-4" aria-hidden /> Rattacher
                      </Button>
                    </div>
                  ) : <p className="text-sm text-fg-muted">Toutes les dépenses ont déjà un justificatif.</p>
                )}
                {traitement === 'paiement' && (
                  paiements.length ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select aria-label="Paiement de facture" value={paiementChoisi} onChange={e => setPaiementChoisi(e.target.value)} wrapperClassName="flex-1">
                        <option value="">Choisir un paiement de facture…</option>
                        {paiements.map(x => {
                          const f = numeros.get(x.invoice_id)
                          return <option key={x.id} value={x.id}>{dateFr(x.date)} · {f?.numero ?? 'facture'} {f?.client_nom ? `· ${f.client_nom}` : ''} · {euros(x.amount)} ({MODE_PAIEMENT_LIBELLE[x.mode]})</option>
                        })}
                      </Select>
                      <Button disabled={!paiementChoisi} loading={busy === 'rattacher'} onClick={() => rattacher({ payment_id: paiementChoisi }, 'Justificatif rattaché au paiement')}>
                        <Link2 className="h-4 w-4" aria-hidden /> Rattacher
                      </Button>
                    </div>
                  ) : <p className="text-sm text-fg-muted">Aucun paiement de facture sans justificatif.</p>
                )}
                {traitement === 'sans_objet' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-sm text-fg-muted">Pièce sans rapport avec la ferme, doublon, ticket personnel… Elle reste consultable.</p>
                    <Button variant="secondary" loading={busy === 'rattacher'} onClick={() => rattacher({ sans_objet: true }, 'Justificatif marqué sans objet')}>Marquer sans objet</Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  {cout && <>Dépense du {dateFr(cout.date)} · {LIBELLES_CATEGORIES[cout.category]} · <strong className="num">{euros(cout.amount)}</strong></>}
                  {paiement && <>Paiement du {dateFr(paiement.date)} · {numeros.get(paiement.invoice_id)?.numero ?? ''} · <strong className="num">{euros(paiement.amount)}</strong></>}
                  {statut === 'sans_objet' && 'Marqué sans objet.'}
                </span>
                <Button size="sm" variant="secondary" loading={busy === 'rattacher'}
                  onClick={() => rattacher({}, 'Justificatif remis à traiter')}>
                  <Link2Off className="h-4 w-4" aria-hidden /> {statut === 'sans_objet' ? 'Remettre à traiter' : 'Détacher'}
                </Button>
              </div>
            )}
          </section>

          {(statut === 'a_traiter' || statut === 'sans_objet') && (
            <div className="border-t border-border pt-3">
              <Button size="sm" variant="danger-ghost" onClick={supprimer}><Trash2 className="h-4 w-4" aria-hidden /> Supprimer le justificatif</Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
