'use client'
// ============================================================
// File hors ligne du navigateur : instance unique, branchée sur
// Supabase, et synchronisation automatique (démarrage, retour du
// réseau, retour au premier plan).
// ============================================================
import { createClient } from '@/lib/supabase'
import { FileSaisies } from './file'
import { choisirStockage, stockageMemoire, type StockageFile } from './stockage'
import type { EntreeFile, ReponseEcriture } from './types'

export { FileSaisies } from './file'
export type { EtatFile, ResultatSaisie, BilanSynchro } from './file'
export type { EntreeFile, TableFile } from './types'
export { uuidClient } from './uuid'

/** Au-delà, un envoi qui traîne est abandonné et la saisie reste en file. */
const DELAI_ENVOI_MS = 15_000
const NOM_BASE = process.env.NEXT_PUBLIC_DEMO === '1' ? 'bleuenn-horsligne-demo' : 'bleuenn-horsligne'

async function envoyer(e: EntreeFile): Promise<ReponseEcriture> {
  const supabase = createClient()
  let q: any = supabase.from(e.table).insert(e.ligne as never)
  // Réseau du champ : sans délai, une requête peut rester pendue des minutes.
  if (typeof q.abortSignal === 'function' && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    q = q.abortSignal(AbortSignal.timeout(DELAI_ENVOI_MS))
  }
  const r = await q
  return { error: r.error, status: r.status }
}

/** Stockage choisi au premier appel, partagé ensuite. */
let stockage: Promise<StockageFile> | null = null
function stockageNavigateur(): Promise<StockageFile> {
  return (stockage ??= typeof window === 'undefined' ? Promise.resolve(stockageMemoire()) : choisirStockage(NOM_BASE))
}

/** Stockage paresseux : la file existe tout de suite, le stockage s'ouvre à la première lecture. */
const stockageDiffere: StockageFile = {
  nom: 'indexeddb',
  persistant: true,
  tout: async () => (await stockageNavigateur()).tout(),
  mettre: async e => (await stockageNavigateur()).mettre(e),
  retirer: async id => (await stockageNavigateur()).retirer(id),
}

let file: FileSaisies | null = null
let utilisateur: string | null = null
let branchee = false

export function fileHorsLigne(): FileSaisies {
  if (!file) {
    file = new FileSaisies({
      stockage: stockageDiffere,
      envoyer,
      maintenant: () => new Date().toISOString(),
      enLigne: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    })
    // Le nom réel du stockage n'est connu qu'une fois ouvert : on republie.
    stockageNavigateur().then(s => {
      Object.assign(stockageDiffere, { nom: s.nom, persistant: s.persistant })
      file!.charger()
    })
  }
  return file
}

/** Synchronise au nom du compte connu (aucun envoi sans compte). */
export function synchroniserMaintenant() {
  if (!utilisateur) return Promise.resolve({ envoyees: 0, restantes: 0, rejetees: 0 })
  return fileHorsLigne().synchroniser(utilisateur)
}

/**
 * Déclare le compte connecté et branche (une seule fois) les écouteurs de
 * synchronisation. Appelé par l'écran dès que l'utilisateur est connu.
 */
export function demarrerSynchro(userId: string | null) {
  utilisateur = userId
  if (typeof window === 'undefined') return
  if (!branchee) {
    branchee = true
    const go = () => { synchroniserMaintenant().catch(e => console.error('[hors ligne] synchronisation', e)) }
    window.addEventListener('online', go)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go() })
    // Filet de sécurité : `online` ne se déclenche pas toujours (réseau qui
    // revient sans changer d'interface, captif…). Toutes les 60 s s'il reste
    // des saisies.
    window.setInterval(() => { if (fileHorsLigne().etat().enAttente > 0) go() }, 60_000)
  }
  if (userId) synchroniserMaintenant().catch(e => console.error('[hors ligne] synchronisation', e))
}
