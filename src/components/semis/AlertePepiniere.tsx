'use client'
// Bandeau d'alerte (non bloquant) d'un formulaire de semis qui fait dépasser
// la capacité des tables de semis.
import { AlertTriangle } from 'lucide-react'
import { formatDateShort } from '@/lib/types'
import { propositionsTexte, type ControlePepiniere } from '@/lib/domain/production'

export function AlertePepiniere({ controle, culture }: { controle: ControlePepiniere | null; culture: string }) {
  if (!controle || controle.etat !== 'depassement') return null
  const n = controle.maxManquantes
  return (
    <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="status" data-testid="alerte-semis-pepiniere">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Dépasse la capacité des tables : {n} plaque{n > 1 ? 's' : ''} manquante{n > 1 ? 's' : ''} à partir du {formatDateShort(controle.jours[0].jour)}
      </p>
      <p className="mt-1 text-xs">Le semis sera enregistré quand même. Propositions :</p>
      <ul className="mt-0.5 list-disc pl-5 text-xs">
        {propositionsTexte(controle, formatDateShort).map(t => <li key={t}>{culture ? `${culture} : ` : ''}{t}</li>)}
      </ul>
    </div>
  )
}
