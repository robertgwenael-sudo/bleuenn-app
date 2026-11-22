'use client'
import { useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, CloudUpload, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { synchroniserMaintenant } from '@/lib/offline'
import type { EtatHorsLigne } from './useHorsLigne'

type Ton = 'ok' | 'attente' | 'horsligne' | 'erreur' | 'envoi'

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

/** Résumé de l'état en une ligne. `null` = rien à signaler (tout est envoyé). */
export function resumer(e: EtatHorsLigne): { ton: Ton; texte: string } {
  const attente = e.enAttente > 0 ? pluriel(e.enAttente, 'saisie en attente', 'saisies en attente') : ''
  if (!e.enLigne) return { ton: 'horsligne', texte: attente ? `Hors ligne · ${attente}` : 'Hors ligne' }
  if (e.synchronisation) return { ton: 'envoi', texte: `Envoi en cours${attente ? ` · ${attente}` : '…'}` }
  if (e.rejetees > 0) return { ton: 'erreur', texte: pluriel(e.rejetees, 'saisie refusée', 'saisies refusées') + (attente ? ` · ${attente}` : '') }
  if (e.enAttente > 0) return { ton: 'attente', texte: attente }
  return { ton: 'ok', texte: 'Synchronisé' }
}

const styles: Record<Ton, string> = {
  ok: 'border-primary/20 bg-primary-soft text-primary',
  attente: 'border-warning/25 bg-warning-soft text-warning',
  horsligne: 'border-border-strong bg-surface-3 text-fg',
  erreur: 'border-danger/25 bg-danger-soft text-danger',
  envoi: 'border-info/25 bg-info-soft text-info',
}

function Icone({ ton, className }: { ton: Ton; className?: string }) {
  const c = cn('h-3.5 w-3.5 shrink-0', className)
  if (ton === 'horsligne') return <CloudOff className={c} aria-hidden />
  if (ton === 'erreur') return <AlertTriangle className={c} aria-hidden />
  if (ton === 'envoi') return <RefreshCw className={cn(c, 'animate-spin')} aria-hidden />
  if (ton === 'attente') return <CloudUpload className={c} aria-hidden />
  return <Check className={c} aria-hidden />
}

/**
 * Pastille pour la barre du haut : n'apparaît que s'il y a quelque chose à
 * dire (hors ligne, saisies en attente ou refusées), et « Synchronisé »
 * quelques secondes après un envoi réussi.
 */
export function PastilleHorsLigne({ etat, onClick }: { etat: EtatHorsLigne; onClick?: () => void }) {
  const r = resumer(etat)
  const [recent, setRecent] = useState(false)
  useEffect(() => {
    if (!etat.derniereSynchro) return
    setRecent(true)
    const t = window.setTimeout(() => setRecent(false), 5000)
    return () => window.clearTimeout(t)
  }, [etat.derniereSynchro])
  if (r.ton === 'ok' && !recent) return null
  const court = r.ton === 'horsligne' ? (etat.enAttente > 0 ? `Hors ligne · ${etat.enAttente}` : 'Hors ligne')
    : r.ton === 'attente' ? `${etat.enAttente} en attente`
    : r.ton === 'erreur' ? `${etat.rejetees} refusée${etat.rejetees > 1 ? 's' : ''}`
    : r.ton === 'envoi' ? 'Envoi…' : 'Synchronisé'
  return (
    <button type="button" onClick={onClick} title={r.texte} aria-label={r.texte}
      data-testid="pastille-horsligne"
      className={cn('flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold', styles[r.ton])}>
      <Icone ton={r.ton} />
      <span>{court}</span>
    </button>
  )
}

/** Bandeau complet pour l'écran Récoltes. */
export function BandeauHorsLigne({ etat, className }: { etat: EtatHorsLigne; className?: string }) {
  const r = resumer(etat)
  const detail =
    r.ton === 'horsligne' ? 'Les saisies sont gardées sur le téléphone et partiront au retour du réseau.'
    : r.ton === 'erreur' ? 'La base a refusé ces saisies : voir l’erreur dans l’historique ci-dessous.'
    : r.ton === 'attente' ? 'Le réseau semble revenu : envoi automatique, ou maintenant.'
    : r.ton === 'envoi' ? 'Envoi des saisies faites hors ligne.'
    : etat.derniereSynchro ? `Dernier envoi à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(etat.derniereSynchro))}.`
    : 'Toutes les saisies sont enregistrées en base.'
  return (
    <div role="status" aria-live="polite" data-testid="bandeau-horsligne" data-ton={r.ton}
      className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm', styles[r.ton], className)}>
      <Icone ton={r.ton} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{r.texte}</p>
        <p className="text-xs opacity-90">{detail}</p>
        {etat.chargee && !etat.persistant && (
          <p className="mt-1 text-xs font-medium text-danger">
            Ce navigateur refuse le stockage local (navigation privée ?) : une saisie hors ligne serait perdue à la fermeture de l’appli.
          </p>
        )}
      </div>
      {etat.enLigne && etat.enAttente > 0 && !etat.synchronisation && (
        <button type="button" onClick={() => { synchroniserMaintenant().catch(e => console.error('[hors ligne] synchronisation', e)) }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold underline underline-offset-2">
          Envoyer
        </button>
      )}
    </div>
  )
}
