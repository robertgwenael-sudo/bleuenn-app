'use client'
import { useEffect, useState } from 'react'
import { Lock, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardHeader, Field, Input } from '@/components/ui'
import { eurosEnCentimes, formatEuros, type EurosNumeric } from '@/lib/domain'
import { lireMontant } from './commun'

/** Centimes → « 15,50 » pour le champ de saisie. */
const enSaisie = (t: EurosNumeric | null) => {
  if (t === null) return ''
  const c = eurosEnCentimes(t)
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`
}

/** Taux horaire de la ferme : modifiable par un owner, lu par les membres. */
export function TauxHoraire({ taux, estOwner, onSave }: {
  taux: EurosNumeric | null
  estOwner: boolean
  onSave: (centimes: number | null) => Promise<boolean>
}) {
  const [saisie, setSaisie] = useState(enSaisie(taux))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSaisie(enSaisie(taux)) }, [taux])

  const c = lireMontant(saisie)
  const vide = saisie.trim() === ''
  const actuel = taux === null ? null : eurosEnCentimes(taux)
  const change = vide ? actuel !== null : c !== null && c !== actuel

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vide && c === null) { toast.error('Taux horaire illisible', { description: 'Par exemple 15 ou 16,50.' }); return }
    setBusy(true)
    const ok = await onSave(vide ? null : c)
    setBusy(false)
    if (ok) toast.success(vide ? 'Taux horaire effacé' : `Taux horaire : ${formatEuros(c!)} de l’heure`)
  }

  return (
    <Card>
      <CardHeader icon={<Timer className="h-4 w-4" />} title="Taux horaire"
        description="Valeur d’une heure de travail sur la ferme, pour compter le temps dans la marge." />
      <CardContent>
        {estOwner ? (
          <form onSubmit={enregistrer} className="flex items-end gap-2">
            <Field label="Euros par heure" className="flex-1"
              hint={actuel === null ? 'Non renseigné : la marge après temps est « non calculable ».' : 'Laisser vide pour ne plus valoriser le temps.'}
              error={!vide && c === null ? 'Montant illisible' : undefined}>
              <Input inputMode="decimal" value={saisie} onChange={e => setSaisie(e.target.value)} placeholder="ex. 15,00" autoComplete="off" />
            </Field>
            <Button type="submit" loading={busy} disabled={!change} className="mb-[1.375rem]">Enregistrer</Button>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4 text-fg-subtle" aria-hidden />
            {actuel === null
              ? <span className="text-fg-muted">Non renseigné. Seul un propriétaire de la ferme peut le fixer.</span>
              : <span><span className="num font-semibold">{formatEuros(actuel)}</span> de l’heure, fixé par un propriétaire de la ferme.</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
