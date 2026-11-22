'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Dialog, Field, Input, Textarea } from '@/components/ui'
import { lireSurface } from './surface'

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/**
 * Modifier un jardin (nom, surface, description) ou une planche (nom, surface).
 * Les contrôles de cohérence avertissent sans bloquer : c'est l'agricultrice
 * qui connaît son terrain.
 */
export function EditerSurfaceDialog({ open, onOpenChange, type, initial, contexte, onSave }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  type: 'jardin' | 'planche'
  initial: { name: string; surface_m2: number; description?: string | null }
  /** jardin : somme des planches ; planche : surface du jardin, autres planches et occupation max à venir */
  contexte: { sommePlanches?: number; surfaceJardin?: number; autresPlanches?: number; occupationMax?: number }
  onSave: (v: { name: string; surface_m2: number; description?: string | null }) => Promise<unknown>
}) {
  const [name, setName] = useState(initial.name)
  const [surface, setSurface] = useState(fmt(initial.surface_m2))
  const [description, setDescription] = useState(initial.description ?? '')
  const [enCours, setEnCours] = useState(false)
  useEffect(() => {
    if (open) { setName(initial.name); setSurface(fmt(initial.surface_m2)); setDescription(initial.description ?? '') }
  }, [open, initial.name, initial.surface_m2, initial.description])

  const m2 = lireSurface(surface)
  const avertissements: string[] = []
  if (m2 !== null && type === 'jardin' && contexte.sommePlanches !== undefined && contexte.sommePlanches > m2)
    avertissements.push(`Les planches de ce jardin totalisent ${fmt(contexte.sommePlanches)} m², plus que ${fmt(m2)} m².`)
  if (m2 !== null && type === 'planche' && contexte.surfaceJardin !== undefined && contexte.autresPlanches !== undefined
    && contexte.autresPlanches + m2 > contexte.surfaceJardin)
    avertissements.push(`Avec cette surface, les planches du jardin totaliseraient ${fmt(contexte.autresPlanches + m2)} m² pour ${fmt(contexte.surfaceJardin)} m² de jardin.`)
  if (m2 !== null && type === 'planche' && contexte.occupationMax !== undefined && contexte.occupationMax > m2)
    avertissements.push(`Des cultures prévues occupent jusqu'à ${fmt(contexte.occupationMax)} m² de cette planche : elles seront signalées en conflit.`)

  const valide = name.trim().length > 0 && m2 !== null
  const enregistrer = async () => {
    if (!valide || m2 === null) return
    setEnCours(true)
    try {
      await onSave({ name: name.trim(), surface_m2: m2, ...(type === 'jardin' ? { description: description.trim() || null } : {}) })
      onOpenChange(false)
    } finally { setEnCours(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm"
      title={type === 'jardin' ? 'Modifier le jardin' : 'Modifier la planche'}
      description="La surface sert au contrôle d'occupation, aux quantités de plants et au calcul de marge au m²."
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button onClick={enregistrer} disabled={!valide || enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </>}>
      <form className="space-y-4" noValidate onSubmit={e => { e.preventDefault(); void enregistrer() }}>
        <Field label="Nom" htmlFor="es-nom">
          <Input id="es-nom" value={name} onChange={e => setName(e.target.value)} required />
        </Field>
        <Field label="Surface (m²)" htmlFor="es-surface"
          error={surface.trim() && m2 === null ? 'Surface en m², par exemple 12 ou 12,5' : undefined}>
          <Input id="es-surface" inputMode="decimal" value={surface} onChange={e => setSurface(e.target.value)} />
        </Field>
        {type === 'jardin' && (
          <Field label="Description" htmlFor="es-desc" hint="Exposition, sol, type de cultures…">
            <Textarea id="es-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
        )}
        {avertissements.length > 0 && (
          <div role="status" className="space-y-1 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-fg">
            {avertissements.map(a => (
              <p key={a} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />{a}</p>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  )
}
