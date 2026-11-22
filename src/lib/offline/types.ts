// ============================================================
// File d'attente des saisies hors ligne — types partagés.
// ------------------------------------------------------------
// Une saisie (récolte ou perte) est une ligne prête à insérer, avec
// son identifiant généré sur le téléphone. Cet `id` est passé tel quel
// à l'insertion : un renvoi ne crée jamais de doublon, la base répond
// « clé primaire déjà prise », ce qui vaut « déjà envoyée ».
// ============================================================

/** Tables que la file sait alimenter. Étendre ici pour d'autres saisies. */
export type TableFile = 'harvests' | 'losses'

/**
 * - `en_attente` : pas encore acceptée par la base (réseau absent, serveur
 *   indisponible). Renvoyée automatiquement.
 * - `rejetee` : refusée définitivement (droits, validation). Jamais renvoyée
 *   automatiquement, jamais effacée sans un geste de l'utilisatrice.
 */
export type EtatEntree = 'en_attente' | 'rejetee'

export interface EntreeFile {
  /** UUID client, identique à `ligne.id`. */
  id: string
  table: TableFile
  /** Ligne à insérer, `id` compris. */
  ligne: Record<string, unknown> & { id: string }
  etat: EtatEntree
  /** Horodatage de la saisie (ISO, pour l'ordre d'envoi). */
  creeLe: string
  /** Compte qui a saisi : on n'envoie jamais la saisie d'un autre compte. */
  userId: string | null
  tentatives: number
  derniereTentative?: string
  /** Message de la dernière erreur (réseau ou rejet). */
  erreur?: string
}

/** Réponse minimale d'une écriture Supabase (PostgREST). */
export interface ReponseEcriture {
  error: { message?: string; code?: string; details?: string; hint?: string } | null
  status?: number
}

/** Ce que la file fait d'une réponse. */
export type Issue = 'envoyee' | 'deja_envoyee' | 'reseau' | 'rejet'
