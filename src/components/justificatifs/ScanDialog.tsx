'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, FileUp, Plus, ScanText, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Segmented, Textarea } from '@/components/ui'
import { formatEuros, type DateISO } from '@/lib/domain'
import { suggestionsOcr, type SuggestionsOcr } from '@/lib/domain/gestion'
import { lireMontant } from '@/components/couts/commun'
import type { PagePreparee, SaisieJustificatif } from '@/hooks/useJustificatifs'
import { preparerPage } from './scan'
import { lireTexte, TAILLE_OCR } from './ocr'
import { centimesEnSaisie, dateFr, Vignette } from './commun'

type Page = PagePreparee & { apercu: string; source: File; redresse: number }

/** Lecture automatique : bouton, progression, suggestions à confirmer une par une. */
export function LectureAuto({ image, aujourdhui, onTexte, onUtiliser }: {
  image: Blob | null
  aujourdhui: DateISO
  onTexte?: (t: string) => void
  onUtiliser: (champ: 'date' | 'montant' | 'fournisseur', valeur: string) => void
}) {
  const [etat, setEtat] = useState<{ etape: string; part: number } | null>(null)
  const [sugg, setSugg] = useState<SuggestionsOcr | null>(null)
  const [confiance, setConfiance] = useState<number | null>(null)

  const lire = async () => {
    if (!image) return
    setEtat({ etape: 'Chargement', part: 0 })
    try {
      const r = await lireTexte(image, p => setEtat(p))
      setSugg(suggestionsOcr(r.texte, aujourdhui))
      setConfiance(r.confiance)
      onTexte?.(r.texte)
    } catch (e) {
      console.error('[justificatifs] lecture automatique', e)
      toast.error('Lecture automatique impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setEtat(null)
    }
  }

  const puce = (champ: 'date' | 'montant' | 'fournisseur', libelle: string, affiche: string, valeur: string) => (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="min-w-0 text-sm"><span className="text-fg-muted">{libelle} : </span><strong className="num text-fg">{affiche}</strong></span>
      <Button size="sm" variant="secondary" onClick={() => onUtiliser(champ, valeur)} aria-label={`Utiliser ${libelle.toLowerCase()} ${affiche}`}>Utiliser</Button>
    </li>
  )

  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface-2/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={lire} loading={!!etat} disabled={!image}>
          <ScanText className="h-4 w-4" aria-hidden /> Lire automatiquement
        </Button>
        <p className="min-w-0 flex-1 text-xs text-fg-muted">
          {!image ? 'Lecture automatique indisponible pour un PDF.'
            : `Facultatif. La lecture automatique télécharge ${TAILLE_OCR} la première fois, puis fonctionne depuis le cache.`}
        </p>
      </div>
      {etat && (
        <p className="mt-2 text-xs text-fg-muted" role="status">{etat.etape}… {Math.round(etat.part * 100)} %</p>
      )}
      {sugg && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Suggestions à vérifier{confiance !== null ? ` (lecture fiable à ${confiance} %)` : ''} — rien n’est enregistré sans votre accord
          </p>
          {!sugg.date && !sugg.montant && !sugg.fournisseur
            ? <p className="text-sm text-fg-muted">Rien de lisible : saisissez les valeurs à la main.</p>
            : (
              <ul className="space-y-2" aria-label="Suggestions de la lecture automatique">
                {sugg.date && puce('date', 'Date', dateFr(sugg.date), sugg.date)}
                {sugg.montant && puce('montant', sugg.montant.confiance === 'mot-cle' ? 'Montant total' : 'Montant (plus grand lu, incertain)',
                  formatEuros(sugg.montant.centimes), centimesEnSaisie(sugg.montant.centimes))}
                {sugg.fournisseur && puce('fournisseur', 'Fournisseur', sugg.fournisseur, sugg.fournisseur)}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}

/** Dialogue de scan : pages (photo ou PDF), amélioration, lecture automatique facultative, saisie confirmée. */
export function ScanDialog({ open, onOpenChange, aujourdhui, titre = 'Scanner un justificatif', onEnregistrer }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  aujourdhui: DateISO
  titre?: string
  onEnregistrer: (pages: PagePreparee[], saisie: SaisieJustificatif) => Promise<boolean>
}) {
  const camera = useRef<HTMLInputElement>(null)
  const fichiers = useRef<HTMLInputElement>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [rendu, setRendu] = useState<'document' | 'couleur'>('document')
  const [prepa, setPrepa] = useState(false)
  const [busy, setBusy] = useState(false)
  const [date, setDate] = useState('')
  const [montant, setMontant] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [notes, setNotes] = useState('')
  const [texteOcr, setTexteOcr] = useState<string | null>(null)

  // Remise à zéro à la fermeture ; libère les aperçus
  useEffect(() => {
    if (open) return
    setPages(p => { p.forEach(x => x.apercu && URL.revokeObjectURL(x.apercu)); return [] })
    setDate(''); setMontant(''); setFournisseur(''); setNotes(''); setTexteOcr(null); setRendu('document')
  }, [open])

  const ajouter = async (liste: FileList | null) => {
    if (!liste?.length) return
    setPrepa(true)
    const nouvelles: Page[] = []
    for (const f of Array.from(liste)) {
      try {
        nouvelles.push({ ...(await preparerPage(f, { document: rendu === 'document' })), source: f })
      } catch (e) {
        console.error('[justificatifs] préparation de la page', e)
        toast.error(`Page ignorée : ${f.name}`, { description: e instanceof Error ? e.message : String(e) })
      }
    }
    setPages(p => [...p, ...nouvelles])
    setPrepa(false)
  }

  const changerRendu = async (r: 'document' | 'couleur') => {
    setRendu(r)
    if (!pages.length) return
    setPrepa(true)
    try {
      const refaites = await Promise.all(pages.map(async p => p.mime === 'application/pdf' ? p : { ...(await preparerPage(p.source, { document: r === 'document' })), source: p.source }))
      pages.forEach(p => p.apercu && URL.revokeObjectURL(p.apercu))
      setPages(refaites)
    } catch (e) {
      console.error('[justificatifs] nouveau rendu', e)
      toast.error('Rendu impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally { setPrepa(false) }
  }

  const retirer = (i: number) => setPages(p => {
    if (p[i]?.apercu) URL.revokeObjectURL(p[i].apercu)
    return p.filter((_, k) => k !== i)
  })

  const montantC = montant.trim() ? lireMontant(montant) : null
  const montantInvalide = montant.trim() !== '' && montantC === null
  const dateInvalide = date !== '' && date > aujourdhui

  const enregistrer = async () => {
    if (!pages.length || montantInvalide || dateInvalide) return
    setBusy(true)
    const ok = await onEnregistrer(pages, { date_piece: date || null, montant_centimes: montantC, fournisseur, notes, ocr_texte: texteOcr })
    setBusy(false)
    if (ok) onOpenChange(false)
  }

  const premiereImage = pages.find(p => p.mime === 'image/jpeg')?.blob ?? null
  const totalKo = Math.round(pages.reduce((s, p) => s + p.blob.size, 0) / 1024)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={titre} size="lg"
      description="Photo du ticket ou de la facture, ou PDF reçu par courriel. Plusieurs pages possibles."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button onClick={enregistrer} loading={busy} disabled={!pages.length || prepa || montantInvalide || dateInvalide}>
          Enregistrer le justificatif{pages.length > 1 ? ` (${pages.length} pages)` : ''}
        </Button>
      </>}>
      <input ref={camera} type="file" accept="image/*,application/pdf" capture="environment" multiple className="sr-only"
        aria-label="Photographier le justificatif" tabIndex={-1} onChange={e => { ajouter(e.target.files); e.target.value = '' }} />
      <input ref={fichiers} type="file" accept="image/*,application/pdf" multiple className="sr-only"
        aria-label="Choisir un fichier (image ou PDF)" tabIndex={-1} onChange={e => { ajouter(e.target.files); e.target.value = '' }} />

      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => camera.current?.click()} loading={prepa}>
            {pages.length ? <Plus className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
            {pages.length ? 'Ajouter une page' : 'Prendre en photo'}
          </Button>
          <Button variant="secondary" onClick={() => fichiers.current?.click()} disabled={prepa}>
            <FileUp className="h-4 w-4" aria-hidden /> Importer un fichier
          </Button>
          {pages.some(p => p.mime === 'image/jpeg') && (
            <Segmented size="sm" label="Rendu" value={rendu} onChange={changerRendu} className="ml-auto"
              options={[{ value: 'document', label: 'Document' }, { value: 'couleur', label: 'Couleur' }]} />
          )}
        </div>

        {pages.length > 0 && (
          <div>
            <ul className="flex gap-3 overflow-x-auto pb-1" aria-label="Pages du justificatif">
              {pages.map((p, i) => (
                <li key={i} className="relative shrink-0">
                  <Vignette url={p.apercu || null} pdf={p.mime === 'application/pdf'} alt={`Page ${i + 1}`} className="h-40 w-28 sm:h-48 sm:w-36" />
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 text-2xs font-semibold text-white">p. {i + 1}</span>
                  <Button size="icon-sm" variant="secondary" className="absolute right-1 top-1" aria-label={`Retirer la page ${i + 1}`} onClick={() => retirer(i)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-fg-subtle">
              {pages.length} page{pages.length > 1 ? 's' : ''} · {totalKo} Ko
              {pages.some(p => p.redresse) ? ` · redressée${pages.filter(p => p.redresse).length > 1 ? 's' : ''}` : ''}
              {pages.some(p => p.mime === 'application/pdf') ? ' · PDF conservé tel quel' : ''}
            </p>
          </div>
        )}

        {pages.length > 0 && (
          <LectureAuto image={premiereImage} aujourdhui={aujourdhui} onTexte={setTexteOcr}
            onUtiliser={(champ, v) => { if (champ === 'date') setDate(v); else if (champ === 'montant') setMontant(v); else setFournisseur(v) }} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date de la pièce" error={dateInvalide ? 'Date dans le futur' : undefined}>
            <Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Montant total (€)" error={montantInvalide ? 'Montant illisible' : undefined} hint="Montant payé, toutes taxes comprises">
            <Input inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Fournisseur" className="sm:col-span-2">
            <Input value={fournisseur} onChange={e => setFournisseur(e.target.value)} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
          </Field>
        </div>
      </div>
    </Dialog>
  )
}
