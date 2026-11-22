'use client'
// Charge de la pépinière semaine par semaine : plaques occupées face aux
// plaques qui tiennent sur les tables. Un dépassement avertit, sans bloquer.
import { AlertTriangle } from 'lucide-react'
import { formatDateShort } from '@/lib/types'
import {
  messageManquant, propositionsTexte, textePlacement, type CapacitePepiniere, type ControlePepiniere, type OccupationsCellule,
  type ReglagesPepiniere, type SemainePepiniere,
} from '@/lib/domain/production'
import { Card, cn } from '@/components/ui'
import { nb } from './format'

export function CapaciteCarte({ reglages, capacite }: { reglages: ReglagesPepiniere; capacite: CapacitePepiniere | null }) {
  if (reglages.etat !== 'ok' || !capacite) {
    return (
      <Card className="p-4" data-testid="capacite-pepiniere">
        <p className="font-semibold text-warning">Capacité non renseignée</p>
        <p className="mt-1 text-sm text-fg-muted">
          Manque : {reglages.etat === 'incomplet' ? reglages.manquants.join(', ') : 'réglages'}. Saisissez les tables et plaques
          de semis dans les réglages pour comparer la charge à la place disponible.
        </p>
      </Card>
    )
  }
  const t = reglages.tables[0]
  const pl = capacite.parTable[0]
  return (
    <Card className="p-4" data-testid="capacite-pepiniere">
      <p className="text-sm text-fg-muted">Capacité de la pépinière</p>
      <p className="num mt-1 text-2xl font-semibold">{nb(capacite.plaques)} plaque{capacite.plaques > 1 ? 's' : ''} · {nb(capacite.trous)} trous</p>
      <p className="mt-1 text-sm text-fg-muted">
        {t.nombre} table{t.nombre > 1 ? 's' : ''} de {nb(t.largeur_cm)} × {nb(t.longueur_cm)} cm : {textePlacement(pl)} par table,
        plaques de {String(reglages.plaque.largeur_cm).replace('.', ',')} × {String(reglages.plaque.longueur_cm).replace('.', ',')} cm à {reglages.plaque.trous} trous.
      </p>
      <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        Pour information, le tableur divise les surfaces : {String(capacite.tableur.plaquesParTable).replace('.', ',')} plaques par table,
        soit {nb(capacite.tableur.trous)} trous. Ce chiffre compte des morceaux de plaques et ignore le débord ; ici, seules les plaques
        entières qui tiennent réellement sont comptées (meilleure des deux orientations).
      </p>
    </Card>
  )
}

export type PropositionSemaine = { culture: string; planche: string; controle: ControlePepiniere }

/** Propositions du domaine pour un semis qui fait dépasser : date, surface, plant acheté ou semis direct. */
export function Propositions({ controle, culture }: { controle: ControlePepiniere; culture: string }) {
  if (controle.etat !== 'depassement') return null
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs" data-testid="propositions-pepiniere">
      {propositionsTexte(controle, formatDateShort).map(t => <li key={t}>{culture} : {t}</li>)}
    </ul>
  )
}

export function ChargePepiniere({ semaines, capacite, occupations, propositions }: {
  semaines: SemainePepiniere[]; capacite: CapacitePepiniere | null; occupations: OccupationsCellule
  propositions?: Map<string, PropositionSemaine>
}) {
  const enPlaques = semaines.some(s => s.plaques !== null)
  const valeur = (s: SemainePepiniere) => (enPlaques ? s.plaques ?? 0 : s.mottes)
  const max = Math.max(1, capacite && enPlaques ? capacite.plaques : 0, ...semaines.map(valeur))
  const depassements = semaines.filter(s => s.depassement)

  return (
    <div className="space-y-3">
      {depassements.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="status" data-testid="alerte-pepiniere">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {depassements.length} semaine{depassements.length > 1 ? 's' : ''} dépasse{depassements.length > 1 ? 'nt' : ''} la capacité des tables.
          Les semis restent enregistrés : décalez un semis, réduisez sa surface ou passez-le en plant acheté.
        </p>
      )}
      {occupations.nonComptees.length > 0 && (
        <p className="text-xs font-medium text-warning">
          Non comptés : {occupations.nonComptees.map(n => `${n.culture_name} (${messageManquant(n.champs)})`).join(' ; ')}
        </p>
      )}
      {semaines.length === 0 ? (
        <p className="text-sm text-fg-muted">Aucun semis en cellule sur la période.</p>
      ) : (
        <ol className="space-y-1.5" aria-label="Charge de la pépinière par semaine">
          {semaines.map(s => (
            <li key={s.cle} data-testid="semaine-pepiniere" data-depassement={s.depassement ? 'oui' : 'non'}
              className={cn('rounded-lg px-2 py-1.5', s.depassement && 'bg-danger-soft')}>
              <div className="flex items-center gap-2 text-xs">
                <span className="num w-24 shrink-0 text-fg-muted">S{s.semaine.semaine} · {formatDateShort(s.lundi)}</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className={cn('h-full rounded-full', s.depassement ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, (valeur(s) / max) * 100)}%` }} />
                  {capacite && enPlaques && <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${Math.min(100, (capacite.plaques / max) * 100)}%` }} />}
                </div>
                <span className={cn('num w-28 shrink-0 text-right', s.depassement ? 'font-semibold text-danger' : 'text-fg')}>
                  {enPlaques ? `${nb(s.plaques ?? 0)}${capacite ? ` / ${nb(capacite.plaques)}` : ''} plaques` : `${nb(s.mottes)} mottes`}
                </span>
              </div>
              {s.depassement && (
                <div className="mt-1 text-danger sm:pl-[6.5rem]">
                  <p className="text-xs font-semibold">
                    Dépasse la capacité des tables : {s.plaquesManquantes} plaque{s.plaquesManquantes > 1 ? 's' : ''} manquante{s.plaquesManquantes > 1 ? 's' : ''} le {formatDateShort(s.jourPic)}
                  </p>
                  <p className="text-xs">En cause : {s.cultures.map(c => `${c.culture_name} ${c.plaques ?? ''} pl. (${c.planche_name})`).join(', ')}</p>
                  {propositions?.get(s.cle) && <Propositions controle={propositions.get(s.cle)!.controle} culture={propositions.get(s.cle)!.culture} />}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
