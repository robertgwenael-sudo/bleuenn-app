'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { JOURNAL_KINDS, comparerDates, ajouterJours, estDateValide, type DateISO, type JournalKind } from '@/lib/domain'
import { LIBELLES_NOTES } from '@/lib/domain/journal'
import type { NouvelleNote, PhotoPreparee } from '@/hooks/useJournal'
import { Groupe, ICONES_NOTES, OptionsPlanches, Puce, type OptionCulture, type OptionPlanche, type OptionPlantation } from './commun'
import { preparerPhoto } from './photo'

const MAX_PHOTOS = 4

type Photo = PhotoPreparee & { apercu: string; cle: string }

/** Plantation en place (de la date de semis à la fin de récolte) à la date de la note. */
function enPlace(p: OptionPlantation, date: DateISO): boolean {
  if (!estDateValide(date) || !estDateValide(p.date_semis)) return false
  const fin = p.date_fin && estDateValide(p.date_fin) ? ajouterJours(p.date_fin, 14) : p.date_semis
  return comparerDates(p.date_semis, date) <= 0 && comparerDates(date, fin) <= 0
}

interface Props {
  aujourdhui: DateISO
  planches: OptionPlanche[]
  plantations: OptionPlantation[]
  cultures: OptionCulture[]
  plancheInitiale?: string | null
  onSave: (n: NouvelleNote, photos: PhotoPreparee[]) => Promise<boolean>
}

/**
 * Saisie d'une note au champ. Le contenu du dialogue est démonté à la
 * fermeture : chaque ouverture repart d'un formulaire vierge.
 */
export function SaisieNote({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouvelle note" size="lg"
      description="Une observation datée, avec photo si besoin, rattachée à une planche.">
      <FormulaireNote {...props} onClose={() => onOpenChange(false)} />
    </Dialog>
  )
}

function FormulaireNote({ aujourdhui, planches, plantations, cultures, plancheInitiale, onSave, onClose }: Props & { onClose: () => void }) {
  const [kind, setKind] = useState<JournalKind>('observation')
  const [body, setBody] = useState('')
  const [date, setDate] = useState<DateISO>(aujourdhui)
  const [planche, setPlanche] = useState(plancheInitiale ?? '')
  /** 'auto' : la plantation en place si elle est seule, sinon aucune. */
  const [choix, setChoix] = useState<string | null | 'auto'>('auto')
  const [culture, setCulture] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [traitement, setTraitement] = useState(0)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const apercus = useRef(new Set<string>())

  // Libère les aperçus restants à la fermeture
  useEffect(() => {
    const set = apercus.current
    return () => set.forEach(u => URL.revokeObjectURL(u))
  }, [])

  const candidates = useMemo(() => planche
    ? plantations.filter(p => p.planche_id === planche && enPlace(p, date))
      .sort((a, b) => comparerDates(b.date_semis, a.date_semis))
    : [], [plantations, planche, date])
  const plantation = choix === 'auto'
    ? (candidates.length === 1 ? candidates[0].id : null)
    : (choix && candidates.some(c => c.id === choix) ? choix : null)

  const ajouterPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const liste = [...files].slice(0, MAX_PHOTOS - photos.length)
    if (liste.length < files.length) toast.warning(`${MAX_PHOTOS} photos au plus par note`)
    setTraitement(n => n + liste.length)
    for (const f of liste) {
      try {
        const p = await preparerPhoto(f)
        apercus.current.add(p.apercu)
        setPhotos(cur => [...cur, { ...p, cle: crypto.randomUUID() }])
      } catch (e) {
        console.error('[journal] préparation de la photo', e)
        toast.error('Photo illisible', { description: e instanceof Error ? e.message : String(e) })
      } finally {
        setTraitement(n => n - 1)
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const retirer = (cle: string) => setPhotos(cur => {
    const p = cur.find(x => x.cle === cle)
    if (p) { URL.revokeObjectURL(p.apercu); apercus.current.delete(p.apercu) }
    return cur.filter(x => x.cle !== cle)
  })

  const vide = !body.trim() && photos.length === 0
  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || traitement > 0) return
    if (vide) { toast.error('Écrivez quelques mots ou ajoutez une photo'); return }
    if (!estDateValide(date)) { toast.error('Date invalide'); return }
    const p = plantations.find(x => x.id === plantation)
    setBusy(true)
    const ok = await onSave({
      date, kind, body,
      planche_id: planche || null,
      planting_id: p?.id ?? null,
      culture_id: p?.culture_id ?? (culture || null),
    }, photos)
    setBusy(false)
    if (ok) {
      toast.success('Note enregistrée', { description: `${LIBELLES_NOTES[kind]}${photos.length ? ` · ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}` })
      onClose()
    }
  }

  return (
  <form onSubmit={enregistrer} aria-label="Nouvelle note" className="space-y-5">
      <Groupe titre="Type de note" id="g-type-note">
        {JOURNAL_KINDS.map(k => {
          const I = ICONES_NOTES[k]
          return <Puce key={k} actif={kind === k} onClick={() => setKind(k)}><I className="h-4 w-4" aria-hidden />{LIBELLES_NOTES[k]}</Puce>
        })}
      </Groupe>

      <div>
        <p className="mb-2 text-xs font-medium text-fg-muted">Photos ({photos.length}/{MAX_PHOTOS})</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.cle} className="relative h-24 w-24 overflow-hidden rounded-xl border border-border bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), hors optimiseur d'images */}
              <img src={p.apercu} alt={`Photo ${i + 1} à joindre`} className="h-full w-full object-cover" />
              <button type="button" onClick={() => retirer(p.cle)} aria-label={`Retirer la photo ${i + 1}`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(20_22_18/0.6)] text-white hover:bg-[rgb(20_22_18/0.8)]">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
          {traitement > 0 && (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-border text-fg-subtle" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /><span className="sr-only">Préparation de la photo…</span>
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-24 min-w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/40 px-3 text-sm font-medium text-primary hover:bg-primary-soft focus-within:ring-2 focus-within:ring-ring">
              {photos.length ? <ImagePlus className="h-6 w-6" aria-hidden /> : <Camera className="h-6 w-6" aria-hidden />}
              <span>{photos.length ? 'Ajouter' : 'Prendre une photo'}</span>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only"
                aria-label="Prendre une photo" onChange={e => ajouterPhotos(e.target.files)} />
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-fg-subtle">Réduite à 1600 px avant l’envoi. Stockée dans un espace privé de la ferme.</p>
      </div>

      <Field label="Note">
        <Textarea rows={3} value={body} onChange={e => setBody(e.target.value)} maxLength={4000}
          placeholder="Ce que vous avez vu, fait ou décidé…" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Planche (facultatif)">
          <Select value={planche} onChange={e => { setPlanche(e.target.value); setChoix('auto') }}>
            <option value="">Aucune / toute la ferme</option>
            <OptionsPlanches planches={planches} />
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value || aujourdhui)} />
        </Field>
      </div>

      {planche && candidates.length > 0 && (
        <Groupe titre="Plantation concernée" id="g-plantation-note">
          <Puce actif={plantation === null} onClick={() => setChoix(null)}>Toute la planche</Puce>
          {candidates.map(c => (
            <Puce key={c.id} actif={plantation === c.id} onClick={() => setChoix(c.id)}>
              {c.culture_name}{c.season_name ? <span className="text-xs opacity-75">· {c.season_name}</span> : null}
            </Puce>
          ))}
        </Groupe>
      )}
      {!plantation && (
        <Field label="Culture (facultatif)" hint={planche && candidates.length === 0 ? 'Aucune plantation en place sur cette planche à cette date.' : undefined}>
          <Select value={culture} onChange={e => setCulture(e.target.value)}>
            <option value="">Aucune</option>
            {cultures.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" size="lg" className="sm:h-10 sm:text-sm" loading={busy} disabled={vide || traitement > 0}>
          Enregistrer la note
        </Button>
      </div>
    </form>
  )
}
