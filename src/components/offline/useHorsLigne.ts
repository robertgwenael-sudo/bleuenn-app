'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { demarrerSynchro, fileHorsLigne, type EtatFile, type TableFile } from '@/lib/offline'

function abonnerReseau(f: () => void) {
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f) }
}
const lireReseau = () => navigator.onLine !== false
const reseauServeur = () => true

export type EtatHorsLigne = EtatFile & { enLigne: boolean }

/**
 * État de la file hors ligne et du réseau. Passer `userId` (même `null`)
 * démarre la synchronisation automatique pour ce compte.
 */
export function useHorsLigne(userId?: string | null): EtatHorsLigne {
  const f = fileHorsLigne()
  const etat = useSyncExternalStore(f.abonner, f.etat, f.etat)
  const enLigne = useSyncExternalStore(abonnerReseau, lireReseau, reseauServeur)
  useEffect(() => {
    if (userId !== undefined) demarrerSynchro(userId)
  }, [userId])
  return { ...etat, enLigne }
}

/** Abonnement aux envois réussis (pour recharger les données affichées). */
export function useApresEnvoi(f: (tables: Set<TableFile>, n: number) => void) {
  const ref = useRef(f)
  useEffect(() => { ref.current = f })
  useEffect(() => fileHorsLigne().surEnvoi((t, n) => ref.current(t, n)), [])
}

/**
 * À monter une seule fois dans la coquille (barre du haut) : démarre la
 * synchro, recharge la saison après envoi et annonce le résultat.
 */
export function useSynchroGlobale(ctx: any): EtatHorsLigne {
  const etat = useHorsLigne(ctx?.user?.id ?? null)
  useApresEnvoi((_t, n) => {
    const recharger = ctx?.refreshSeason ?? ctx?.reload
    if (typeof recharger === 'function') Promise.resolve(recharger()).catch((e: unknown) => console.error('[hors ligne] rechargement', e))
    toast.success(n > 1 ? `${n} saisies envoyées` : 'Saisie envoyée', { description: 'Les saisies faites hors ligne sont arrivées.', id: 'horsligne-envoi' })
  })
  // Un rejet pendant la synchro ne doit jamais passer inaperçu.
  const rejetees = useRef(etat.rejetees)
  useEffect(() => {
    if (etat.rejetees > rejetees.current) {
      toast.error('Saisie refusée par la base', {
        id: 'horsligne-rejet',
        description: 'Une saisie faite hors ligne n’a pas été acceptée. Elle reste visible dans Récoltes, avec l’erreur.',
        duration: Infinity,
      })
    }
    rejetees.current = etat.rejetees
  }, [etat.rejetees])
  return etat
}
