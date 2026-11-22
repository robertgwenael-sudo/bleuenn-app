'use client'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy } from 'lucide-react'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'
import { ficheDisponibiliteTexte, type Disponibilites } from '@/lib/domain'

/** Dialogue : texte de la fiche disponibilités, réglable, à copier dans un email. */
export function FicheFleuristes({ open, onOpenChange, dispo, ferme, aujourdhui, nbSurventes }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  dispo: Disponibilites
  ferme: string
  aujourdhui: string
  nbSurventes: number
}) {
  const [semaines, setSemaines] = useState('4')
  const [prix, setPrix] = useState(true)
  const [minimum, setMinimum] = useState('20')
  const [multiple, setMultiple] = useState('10')
  const [copie, setCopie] = useState(false)
  const zone = useRef<HTMLTextAreaElement>(null)

  const texte = useMemo(() => ficheDisponibiliteTexte(dispo, {
    ferme, aujourdhui,
    semainesMax: semaines === 'toutes' ? undefined : Number(semaines),
    afficherPrix: prix,
    minimum: Math.max(1, Math.floor(Number(minimum) || 1)),
    multipleDe: Number(multiple),
  }), [dispo, ferme, aujourdhui, semaines, prix, minimum, multiple])

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte)
    } catch (e) {
      // Repli (contexte non sécurisé, permission refusée) : sélection + execCommand.
      console.error('[fiche] presse-papiers indisponible', e)
      const t = zone.current
      if (!t) { toast.error('Copie impossible'); return }
      t.focus(); t.select()
      if (!document.execCommand('copy')) { toast.error('Copie impossible', { description: 'Sélectionnez le texte et copiez-le à la main.' }); return }
    }
    setCopie(true)
    toast.success('Fiche copiée', { description: 'Collez-la dans votre email aux fleuristes.' })
    setTimeout(() => setCopie(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Fiche disponibilités fleuristes"
      description="Texte prêt à coller dans un email. Les quantités sont arrondies vers le bas, jamais vers le haut."
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Fermer</Button>
        <Button onClick={copier}>{copie ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}{copie ? 'Copié' : 'Copier'}</Button>
      </>}>
      {nbSurventes > 0 && (
        <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
          {nbSurventes} survente{nbSurventes > 1 ? 's' : ''} à régler : les commandes engagées dépassent ce qui est disponible ; la culture concernée est omise de la fiche pour cette semaine.
        </p>
      )}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Semaines">
          <Select value={semaines} onChange={e => setSemaines(e.target.value)}>
            <option value="2">2 prochaines</option><option value="4">4 prochaines</option>
            <option value="8">8 prochaines</option><option value="12">12 prochaines</option>
            <option value="toutes">Toutes</option>
          </Select>
        </Field>
        <Field label="Arrondi">
          <Select value={multiple} onChange={e => setMultiple(e.target.value)}>
            <option value="1">À la tige</option><option value="5">Par 5</option>
            <option value="10">Par botte de 10</option><option value="25">Par 25</option>
          </Select>
        </Field>
        <Field label="Minimum (tiges)">
          <Input type="number" inputMode="numeric" min={1} value={minimum} onChange={e => setMinimum(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Prix</p>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-btn border border-border px-3 text-sm">
            <input type="checkbox" checked={prix} onChange={e => setPrix(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            Afficher
          </label>
        </div>
      </div>
      <textarea ref={zone} readOnly value={texte} aria-label="Texte de la fiche"
        className="num h-72 w-full resize-y rounded-btn border border-border bg-surface-2/60 p-3 font-mono text-xs leading-relaxed text-fg" />
    </Dialog>
  )
}
