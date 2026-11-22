'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { DateISO, TaskKind } from '@/lib/domain'
import type { CtxTaches, MembreEquipe, NouvelleTache } from '@/hooks/useTaches'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'
import { ORDRE_TYPES, TYPES, dateCourte } from './meta'

/** Types proposés pour une tâche libre : ceux qui ne viennent pas du plan en premier. */
const TYPES_LIBRES: TaskKind[] = ['desherbage', 'irrigation', 'traitement', 'livraison', 'autre',
  ...ORDRE_TYPES.filter(k => !['desherbage', 'irrigation', 'traitement', 'livraison', 'autre'].includes(k))]

export function NouvelleTacheDialog({ open, onClose, onCreer, equipe, jardins, dateParDefaut }: {
  open: boolean
  onClose: () => void
  onCreer: (n: NouvelleTache) => Promise<boolean>
  equipe: MembreEquipe[]
  jardins: NonNullable<CtxTaches['gardens']>
  dateParDefaut: DateISO
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }} title="Nouvelle tâche"
      description="Une tâche libre : elle se déplace d’une semaine ou d’un mois à l’autre.">
      {open && <Formulaire key={dateParDefaut} onClose={onClose} onCreer={onCreer} equipe={equipe} jardins={jardins} dateParDefaut={dateParDefaut} />}
    </Dialog>
  )
}

function Formulaire({ onClose, onCreer, equipe, jardins, dateParDefaut }: {
  onClose: () => void
  onCreer: (n: NouvelleTache) => Promise<boolean>
  equipe: MembreEquipe[]
  jardins: NonNullable<CtxTaches['gardens']>
  dateParDefaut: DateISO
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('desherbage')
  const [date, setDate] = useState<string>(dateParDefaut)
  const [planche, setPlanche] = useState('')
  const [assigne, setAssigne] = useState('')
  const [notes, setNotes] = useState('')
  const [essai, setEssai] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault()
    setEssai(true)
    if (!title.trim()) return
    setEnvoi(true)
    const ok = await onCreer({
      title, kind, due_date: date || null, planche_id: planche || null, assigned_to: assigne || null, notes: notes || null,
    })
    setEnvoi(false)
    if (ok) {
      toast.success('Tâche créée', { description: `${title.trim()} · ${date ? dateCourte(date) : 'sans date'}` })
      onClose()
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-4">
      <Field label="Titre" error={essai && !title.trim() ? 'Donnez un titre à la tâche.' : undefined}>
        <Input className="h-11" value={title} onChange={e => setTitle(e.target.value)} placeholder="Désherber les allées, livrer Atelier Pétale…" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select className="h-11" value={kind} onChange={e => setKind(e.target.value as TaskKind)}>
            {TYPES_LIBRES.map(k => <option key={k} value={k}>{TYPES[k].label}</option>)}
          </Select>
        </Field>
        <Field label="Date" hint={date ? undefined : 'Sans date : rangée dans « À planifier ».'}>
          <Input className="h-11" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Planche (facultatif)">
        <Select className="h-11" value={planche} onChange={e => setPlanche(e.target.value)}>
          <option value="">Aucune planche</option>
          {jardins.map(g => (
            <optgroup key={g.id} label={g.name}>
              {(g.planches ?? []).map(p => <option key={p.id} value={p.id}>{g.name} · {p.name}</option>)}
            </optgroup>
          ))}
        </Select>
      </Field>
      <Field label="Assignée à">
        <Select className="h-11" value={assigne} onChange={e => setAssigne(e.target.value)}>
          <option value="">Personne</option>
          {equipe.map(m => <option key={m.user_id} value={m.user_id}>{m.moi ? `${m.nom} (moi)` : m.nom}</option>)}
        </Select>
      </Field>
      <Field label="Note">
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Facultatif" />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={envoi}>Créer la tâche</Button>
      </div>
    </form>
  )
}
