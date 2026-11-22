import type { Issue, ReponseEcriture } from './types'

// Statuts HTTP qui disent « réessayez plus tard », pas « c'est refusé ».
const STATUTS_TRANSITOIRES = new Set([0, 408, 425, 429, 502, 503, 504])

// Jeton expiré pendant une longue coupure : la session se rafraîchit au
// retour du réseau, l'envoi passera ensuite. Ce n'est pas un refus de droits.
const CODES_JETON = new Set(['PGRST301', 'PGRST303'])

// Échec de transport tel que le formulent fetch et postgrest-js
// (« TypeError: Failed to fetch », « Load failed » sur Safari,
// « NetworkError when attempting… » sur Firefox, abandon sur délai).
const MOTIF_RESEAU = /failed to fetch|load failed|networkerror|network request failed|fetcherror|aborterror|timeouterror|timed? ?out|the user aborted|err_internet_disconnected|réseau/i

/**
 * Classe la réponse d'une insertion.
 *
 * - `deja_envoyee` : collision sur la clé primaire (23505 + `_pkey`) — un
 *   envoi précédent est arrivé, seule la réponse s'était perdue ;
 * - `reseau` : rien n'a été jugé par la base, on réessaiera ;
 * - `rejet` : la base a refusé (RLS 42501, contrainte, validation…) :
 *   réessayer ne changerait rien.
 */
export function classerReponse(r: ReponseEcriture): Issue {
  const e = r.error
  if (!e) return 'envoyee'
  const code = e.code ?? ''
  const texte = `${e.message ?? ''} ${e.details ?? ''}`
  if (code === '23505' && /_pkey/.test(texte)) return 'deja_envoyee'
  if (CODES_JETON.has(code)) return 'reseau'
  if (r.status !== undefined && STATUTS_TRANSITOIRES.has(r.status)) return 'reseau'
  // Sans statut ni code SQL : erreur de transport levée avant toute réponse.
  if (!code && MOTIF_RESEAU.test(texte)) return 'reseau'
  return 'rejet'
}

/** Exception levée par l'envoi lui-même (jamais une réponse de la base). */
export function classerException(e: unknown): Issue {
  // Une exception n'est pas un verdict de la base : par prudence on garde
  // la saisie et on réessaiera, plutôt que de la perdre.
  void e
  return 'reseau'
}

export function messageErreur(r: ReponseEcriture | unknown): string {
  if (r && typeof r === 'object' && 'error' in r) {
    const e = (r as ReponseEcriture).error
    if (e) return e.message || e.code || 'Erreur inconnue'
  }
  if (r instanceof Error) return r.message
  return String(r)
}
