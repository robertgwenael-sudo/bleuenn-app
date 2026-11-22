// Période des exports : année civile, saison, ou dates libres.
import { estDateValide } from '@/lib/domain'

export type ModePeriode = 'annee' | 'saison' | 'dates'

export interface ChoixPeriode {
  mode: ModePeriode
  annee: number
  seasonId: string
  du: string
  au: string
}

export interface PeriodeResolue {
  du: string
  au: string
  seasonId: string | null
  libelle: string
  /** Message à afficher si la période est inutilisable. */
  invalide: string | null
}

export function resoudrePeriode(c: ChoixPeriode, saisons: { id: string; name: string; year: number }[]): PeriodeResolue {
  if (c.mode === 'annee') {
    return { du: `${c.annee}-01-01`, au: `${c.annee}-12-31`, seasonId: null, libelle: `année ${c.annee}`, invalide: null }
  }
  if (c.mode === 'saison') {
    const s = saisons.find(x => x.id === c.seasonId)
    if (!s) return { du: '', au: '', seasonId: null, libelle: '', invalide: 'Choisissez une saison.' }
    // Le nom de fichier porte l'année de la saison ; le filtre, lui, suit le rattachement à la saison.
    return { du: `${s.year}-01-01`, au: `${s.year}-12-31`, seasonId: s.id, libelle: s.name, invalide: null }
  }
  if (!estDateValide(c.du) || !estDateValide(c.au)) {
    return { du: '', au: '', seasonId: null, libelle: '', invalide: 'Saisissez une date de début et une date de fin.' }
  }
  if (c.au < c.du) return { du: '', au: '', seasonId: null, libelle: '', invalide: 'La date de fin précède la date de début.' }
  return { du: c.du, au: c.au, seasonId: null, libelle: 'période choisie', invalide: null }
}
