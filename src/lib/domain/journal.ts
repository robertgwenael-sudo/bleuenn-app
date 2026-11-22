// ============================================================
// Journal de culture et registre des traitements phytosanitaires (009)
// ============================================================
// Logique pure : lecture des décimaux saisis, conversion m² → ha exacte,
// contrôle du délai avant récolte (délai SAISI par l'utilisatrice), retour
// d'une même culture sur une planche, frise d'une planche et export du
// registre au format CSV des exports comptables (exports.ts).
//
// Aucune valeur réglementaire ici : ni produit, ni dose maximale, ni délai.
// Les décimaux (doses, quantités, surfaces) ne passent jamais par un
// flottant : ils restent des chaînes décimales canoniques (`12.5`), comme
// `numeric` les accepte, et sont décalés en chaîne pour la conversion en ha.
// ============================================================

import { ajouterJours, comparerDates, ecartJours, estDateValide } from './dates'
import type { Colonne, Tableau } from './exports'
import {
  CIBLE_TYPES, DOSE_UNITES, LIEU_TYPES, PRODUIT_TYPES, QUANTITE_UNITES,
  type CibleType, type DateISO, type DoseUnite, type JournalEntry, type JournalKind, type LieuType,
  type ProduitType, type QuantiteUnite, type Treatment,
} from './types'

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------
export const LIBELLES_NOTES: Record<JournalKind, string> = {
  observation: 'Observation', maladie: 'Maladie', ravageur: 'Ravageur', irrigation: 'Irrigation',
  fertilisation: 'Fertilisation', meteo: 'Météo', recolte: 'Récolte (remarque)', autre: 'Autre',
}

export const LIBELLES_PRODUITS: Record<ProduitType, string> = {
  fongicide: 'Fongicide', insecticide: 'Insecticide', herbicide: 'Herbicide', acaricide: 'Acaricide',
  biocontrole: 'Biocontrôle', autre: 'Autre',
}

export const LIBELLES_CIBLES: Record<CibleType, string> = {
  maladie: 'Maladie', ravageur: 'Ravageur', adventice: 'Adventice', autre: 'Autre',
}

export const LIBELLES_LIEUX: Record<LieuType, string> = {
  planche: 'Planche', jardin: 'Jardin', serre: 'Serre', tunnel: 'Tunnel', autre: 'Autre lieu',
}

// ------------------------------------------------------------
// Décimaux sans flottant
// ------------------------------------------------------------
const CANONIQUE = /^-?(0|[1-9]\d*)(\.\d*[1-9])?$/

/**
 * Lit un nombre décimal saisi (« 1,5 », « 0.0009 », « 12 ») et renvoie sa
 * forme canonique à point (`1.5`), ou null si la saisie est illisible ou a
 * trop de décimales. Pas de séparateur de milliers : « 1 000 » est lu 1000.
 */
export function lireDecimal(saisie: string, maxDecimales = 4): string | null {
  const s = saisie.replace(/\s/g, '').replace(',', '.')
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m || (!m[2] && !m[3])) return null
  const frac = (m[3] ?? '').replace(/0+$/, '')
  if (frac.length > maxDecimales) return null
  const ent = (m[2] || '0').replace(/^0+(?=\d)/, '')
  const nul = ent === '0' && !frac
  return `${m[1] && !nul ? '-' : ''}${ent}${frac ? `.${frac}` : ''}`
}

/** Valeur `numeric` lue en base (nombre ou chaîne) → forme canonique. Lève sur toute valeur douteuse. */
export function versCanonique(v: number | string): string {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`Nombre invalide : ${v}`)
  const s = String(v).trim()
  if (/e/i.test(s)) throw new Error(`Nombre hors format décimal : ${s}`)
  const c = lireDecimal(s, 20)
  if (c === null || !CANONIQUE.test(c)) throw new Error(`Nombre invalide : « ${s} »`)
  return c
}

/** `1.5` → `1,5` (affichage et CSV en français). */
export function formatDecimalFr(v: number | string): string {
  return versCanonique(v).replace('.', ',')
}

/** Strictement positif, sur la forme canonique. */
export function estStrictementPositif(canon: string): boolean {
  return !canon.startsWith('-') && canon !== '0'
}

/** Décale la virgule de `n` rangs vers la gauche (division exacte par 10ⁿ). */
function diviserPuissance10(canon: string, n: number): string {
  const neg = canon.startsWith('-')
  const [ent, frac = ''] = (neg ? canon.slice(1) : canon).split('.')
  const chiffres = ent + frac
  const rang = frac.length + n
  const complet = chiffres.padStart(rang + 1, '0')
  const e = complet.slice(0, complet.length - rang).replace(/^0+(?=\d)/, '')
  const f = complet.slice(complet.length - rang).replace(/0+$/, '')
  const r = f ? `${e}.${f}` : e
  return neg && r !== '0' ? `-${r}` : r
}

/** Valeur décimale (2 décimales au plus) → centièmes entiers, pour les colonnes `decimal` des exports. */
export function centiemes(v: number | string): number {
  const c = versCanonique(v)
  const neg = c.startsWith('-')
  const [ent, frac = ''] = (neg ? c.slice(1) : c).split('.')
  if (frac.length > 2) throw new Error(`Plus de deux décimales : ${c}`)
  const n = Number(ent + frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(n)) throw new Error(`Nombre trop grand : ${c}`)
  return neg ? -n : n
}

/** Surface en m² → hectares, exacte (forme canonique) : `6` → `0.0006`. */
export function m2EnHa(m2: number | string): string {
  return diviserPuissance10(versCanonique(m2), 4)
}

// ------------------------------------------------------------
// Délai avant récolte (saisi, jamais déduit d'une table)
// ------------------------------------------------------------
export type EtatDelai =
  | { etat: 'non_renseigne'; dateMin: DateISO | null }
  | { etat: 'respecte'; dateMin: DateISO; margeJours: number }
  | { etat: 'non_respecte'; dateMin: DateISO; manqueJours: number }

/**
 * Compare la date de récolte suivante au délai avant récolte saisi pour le
 * produit. Sans délai ou sans date de récolte : « non renseigné », jamais
 * « respecté » par défaut.
 */
export function controleDelaiRecolte(dateTraitement: DateISO, delaiJours: number | null, dateRecolte: DateISO | null): EtatDelai {
  if (!estDateValide(dateTraitement)) throw new Error(`Date de traitement invalide : « ${String(dateTraitement)} »`)
  if (delaiJours === null) return { etat: 'non_renseigne', dateMin: null }
  if (!Number.isInteger(delaiJours) || delaiJours < 0) throw new Error(`Délai avant récolte invalide : ${delaiJours}`)
  const dateMin = ajouterJours(dateTraitement, delaiJours)
  if (dateRecolte === null) return { etat: 'non_renseigne', dateMin }
  if (!estDateValide(dateRecolte)) throw new Error(`Date de récolte invalide : « ${String(dateRecolte)} »`)
  const e = ecartJours(dateMin, dateRecolte)
  return e >= 0 ? { etat: 'respecte', dateMin, margeJours: e } : { etat: 'non_respecte', dateMin, manqueJours: -e }
}

// ------------------------------------------------------------
// Saisie d'un traitement
// ------------------------------------------------------------
/** Formulaire tel que saisi (nombres en texte). */
export interface SaisieTraitement {
  date: string
  produit: string
  produit_type: ProduitType | ''
  amm: string
  /** Case « produit sans numéro d'AMM » (auxiliaires, par exemple). */
  sans_amm: boolean
  dose: string
  dose_unite: DoseUnite | ''
  quantite_totale: string
  quantite_unite: QuantiteUnite | ''
  surface_m2: string
  culture_id: string | null
  culture_libelle: string
  cible: string
  cible_type: CibleType | ''
  lieu_type: LieuType | ''
  garden_id: string | null
  planche_id: string | null
  lieu_libelle: string
  ilot_pac: string
  date_recolte_suivante: string
  delai_avant_recolte_j: string
  operateur_id: string | null
  operateur_nom: string
  vent: string
  temperature_c: string
  notes: string
}

/** Ligne prête à insérer (le trigger complète farm_id, jardin et libellés figés). */
export interface NouveauTraitement {
  date: DateISO
  produit: string
  produit_type: ProduitType
  amm: string | null
  dose: string
  dose_unite: DoseUnite
  quantite_totale: string
  quantite_unite: QuantiteUnite
  surface_m2: string
  culture_id: string | null
  culture_libelle: string
  cible: string
  cible_type: CibleType
  lieu_type: LieuType
  garden_id: string | null
  planche_id: string | null
  lieu_libelle: string | null
  ilot_pac: string | null
  date_recolte_suivante: DateISO | null
  delai_avant_recolte_j: number | null
  operateur_id: string | null
  operateur_nom: string | null
  vent: string | null
  temperature_c: string | null
  notes: string | null
}

export type ErreursTraitement = Partial<Record<keyof SaisieTraitement, string>>

export type ResultatValidation =
  | { ok: true; valeur: NouveauTraitement; avertissements: string[] }
  | { ok: false; erreurs: ErreursTraitement }

const texte = (s: string) => s.trim()
const ouNull = (s: string) => s.trim() || null

/**
 * Vérifie un traitement saisi. Les règles sont de forme (champ présent,
 * nombre lisible et positif, date cohérente) : aucune dose maximale ni
 * délai réglementaire n'est vérifié, faute de référentiel saisi.
 */
export function validerTraitement(s: SaisieTraitement, aujourdhui: DateISO): ResultatValidation {
  const e: ErreursTraitement = {}
  if (!estDateValide(s.date)) e.date = 'Date du traitement requise'
  else if (comparerDates(s.date, aujourdhui) > 0) e.date = 'La date du traitement est dans le futur'
  if (!texte(s.produit)) e.produit = 'Nom commercial complet du produit requis'
  if (!s.produit_type || !PRODUIT_TYPES.includes(s.produit_type)) e.produit_type = 'Type de produit requis'
  if (!s.sans_amm && !texte(s.amm)) e.amm = 'Numéro d’AMM requis (ou cochez « sans AMM »)'

  const dose = lireDecimal(s.dose)
  if (!dose || !estStrictementPositif(dose)) e.dose = 'Dose positive requise (ex. 1,5)'
  if (!s.dose_unite || !DOSE_UNITES.includes(s.dose_unite)) e.dose_unite = 'Unité de dose requise'
  const qte = lireDecimal(s.quantite_totale)
  if (!qte || !estStrictementPositif(qte)) e.quantite_totale = 'Quantité totale positive requise'
  if (!s.quantite_unite || !QUANTITE_UNITES.includes(s.quantite_unite)) e.quantite_unite = 'Unité requise'
  const surface = lireDecimal(s.surface_m2, 2)
  if (!surface || !estStrictementPositif(surface)) e.surface_m2 = 'Surface traitée en m² requise (2 décimales au plus)'

  if (!s.culture_id && !texte(s.culture_libelle)) e.culture_libelle = 'Culture traitée requise'
  if (!texte(s.cible)) e.cible = 'Cible requise (maladie, ravageur, adventice)'
  if (!s.cible_type || !CIBLE_TYPES.includes(s.cible_type)) e.cible_type = 'Type de cible requis'

  if (!s.lieu_type || !LIEU_TYPES.includes(s.lieu_type)) e.lieu_type = 'Type de lieu requis'
  else if (s.lieu_type === 'planche' && !s.planche_id) e.planche_id = 'Choisissez la planche'
  else if (s.lieu_type === 'jardin' && !s.garden_id) e.garden_id = 'Choisissez le jardin'
  else if (!s.planche_id && !s.garden_id && !texte(s.lieu_libelle)) e.lieu_libelle = 'Nommez le lieu (ex. Tunnel nord)'

  let recolte: DateISO | null = null
  if (texte(s.date_recolte_suivante)) {
    if (!estDateValide(s.date_recolte_suivante)) e.date_recolte_suivante = 'Date invalide'
    else if (estDateValide(s.date) && comparerDates(s.date_recolte_suivante, s.date) < 0) e.date_recolte_suivante = 'La récolte précède le traitement'
    else recolte = s.date_recolte_suivante
  }
  let dar: number | null = null
  if (texte(s.delai_avant_recolte_j)) {
    const n = Number(texte(s.delai_avant_recolte_j))
    if (!/^\d{1,4}$/.test(texte(s.delai_avant_recolte_j)) || !Number.isInteger(n)) e.delai_avant_recolte_j = 'Nombre de jours entier'
    else dar = n
  }
  if (!s.operateur_id && !texte(s.operateur_nom)) e.operateur_nom = 'Opérateur requis'

  let temperature: string | null = null
  if (texte(s.temperature_c)) {
    const t = lireDecimal(s.temperature_c, 1)
    const n = t === null ? NaN : Number(t)
    if (t === null || n < -40 || n > 60) e.temperature_c = 'Température en °C, une décimale (−40 à 60)'
    else temperature = t
  }

  if (Object.keys(e).length) return { ok: false, erreurs: e }

  const avertissements: string[] = []
  const delai = controleDelaiRecolte(s.date, dar, recolte)
  if (delai.etat === 'non_respecte') {
    avertissements.push(`Récolte prévue ${delai.manqueJours} j avant la fin du délai avant récolte saisi (${dar} j).`)
  }
  if (s.sans_amm && s.produit_type !== 'biocontrole') {
    avertissements.push('Produit enregistré sans numéro d’AMM : à vérifier.')
  }

  return {
    ok: true,
    avertissements,
    valeur: {
      date: s.date, produit: texte(s.produit), produit_type: s.produit_type as ProduitType,
      amm: s.sans_amm ? null : texte(s.amm),
      dose: dose!, dose_unite: s.dose_unite as DoseUnite,
      quantite_totale: qte!, quantite_unite: s.quantite_unite as QuantiteUnite,
      surface_m2: surface!,
      culture_id: s.culture_id, culture_libelle: texte(s.culture_libelle),
      cible: texte(s.cible), cible_type: s.cible_type as CibleType,
      lieu_type: s.lieu_type as LieuType,
      garden_id: s.lieu_type === 'planche' ? null : s.garden_id,
      planche_id: s.lieu_type === 'planche' ? s.planche_id : null,
      lieu_libelle: ouNull(s.lieu_libelle),
      ilot_pac: ouNull(s.ilot_pac),
      date_recolte_suivante: recolte, delai_avant_recolte_j: dar,
      operateur_id: s.operateur_id, operateur_nom: s.operateur_id ? null : texte(s.operateur_nom),
      vent: ouNull(s.vent), temperature_c: temperature, notes: ouNull(s.notes),
    },
  }
}

// ------------------------------------------------------------
// Photos
// ------------------------------------------------------------
/** Dimensions réduites pour que le grand côté ne dépasse pas `max` (jamais agrandies). */
export function dimensionsReduites(largeur: number, hauteur: number, max = 1600): { largeur: number; hauteur: number } {
  if (!(largeur > 0) || !(hauteur > 0)) throw new Error(`Dimensions d'image invalides : ${largeur}×${hauteur}`)
  const grand = Math.max(largeur, hauteur)
  if (grand <= max) return { largeur, hauteur }
  return {
    largeur: Math.max(1, Math.round((largeur * max) / grand)),
    hauteur: Math.max(1, Math.round((hauteur * max) / grand)),
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Chemin d'une photo dans le bucket `journal` : `<farm_id>/<entry_id>/<fichier>`. */
export function cheminPhoto(farmId: string, entryId: string, fichier: string): string {
  if (!UUID.test(farmId) || !UUID.test(entryId)) throw new Error('Identifiants de ferme ou de note invalides')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fichier) || fichier.includes('..')) throw new Error(`Nom de fichier invalide : « ${fichier} »`)
  return `${farmId}/${entryId}/${fichier}`
}

// ------------------------------------------------------------
// Rotation : retour d'une même culture sur une planche
// ------------------------------------------------------------
export interface PlantationRotation {
  id: string
  culture_id: string
  culture_name: string
  date_semis: DateISO
  date_plantation: DateISO | null
  season_name?: string | null
}

export interface RetourCulture {
  culture_id: string
  culture_name: string
  /** Années consécutives où la culture occupe la planche (≥ 2). */
  annees: number[]
}

/** Année d'occupation : celle de la mise en place (plantation, ou semis direct). */
export function anneeOccupation(p: Pick<PlantationRotation, 'date_semis' | 'date_plantation'>): number {
  const d = p.date_plantation && estDateValide(p.date_plantation) ? p.date_plantation : p.date_semis
  if (!estDateValide(d)) throw new Error(`Plantation sans date valide : « ${String(d)} »`)
  return Number(d.slice(0, 4))
}

/**
 * Cultures qui reviennent sur la planche d'une année sur l'autre. La
 * comparaison se fait par CULTURE : le catalogue ne connaît pas les familles
 * botaniques, deux cultures d'une même famille ne sont donc pas signalées.
 */
export function retoursDeCulture(plantations: PlantationRotation[]): RetourCulture[] {
  const parCulture = new Map<string, { nom: string; annees: Set<number> }>()
  for (const p of plantations) {
    const c = parCulture.get(p.culture_id) ?? { nom: p.culture_name, annees: new Set<number>() }
    c.annees.add(anneeOccupation(p))
    parCulture.set(p.culture_id, c)
  }
  const out: RetourCulture[] = []
  for (const [culture_id, { nom, annees }] of parCulture) {
    const triees = [...annees].sort((a, b) => a - b)
    let suite: number[] = []
    const clore = () => { if (suite.length >= 2) out.push({ culture_id, culture_name: nom, annees: suite }); suite = [] }
    for (const a of triees) {
      if (suite.length && a !== suite[suite.length - 1] + 1) clore()
      suite.push(a)
    }
    clore()
  }
  return out.sort((a, b) => b.annees[b.annees.length - 1] - a.annees[a.annees.length - 1] || a.culture_name.localeCompare(b.culture_name, 'fr'))
}

// ------------------------------------------------------------
// Frise d'une planche : plantations, notes et traitements mêlés
// ------------------------------------------------------------
export type EvenementPlanche =
  | { type: 'plantation'; date: DateISO; id: string; plantation: PlantationRotation & { date_fin?: DateISO | null } }
  | { type: 'note'; date: DateISO; id: string; note: Pick<JournalEntry, 'id' | 'date' | 'kind' | 'body'> }
  | { type: 'traitement'; date: DateISO; id: string; traitement: Pick<Treatment, 'id' | 'date' | 'produit' | 'cible' | 'culture_libelle'> }

/** Événements d'une planche, du plus récent au plus ancien, groupés par année. */
export function frisePlanche(d: {
  plantations: (PlantationRotation & { date_fin?: DateISO | null })[]
  notes: Pick<JournalEntry, 'id' | 'date' | 'kind' | 'body'>[]
  traitements: Pick<Treatment, 'id' | 'date' | 'produit' | 'cible' | 'culture_libelle'>[]
}): { annee: number; evenements: EvenementPlanche[] }[] {
  const ev: EvenementPlanche[] = [
    ...d.plantations.map(p => ({ type: 'plantation' as const, date: p.date_plantation && estDateValide(p.date_plantation) ? p.date_plantation : p.date_semis, id: p.id, plantation: p })),
    ...d.notes.map(n => ({ type: 'note' as const, date: n.date, id: n.id, note: n })),
    ...d.traitements.map(t => ({ type: 'traitement' as const, date: t.date, id: t.id, traitement: t })),
  ]
  for (const x of ev) if (!estDateValide(x.date)) throw new Error(`Événement sans date valide (${x.type} ${x.id})`)
  ev.sort((a, b) => comparerDates(b.date, a.date) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
  const groupes: { annee: number; evenements: EvenementPlanche[] }[] = []
  for (const x of ev) {
    const annee = Number(x.date.slice(0, 4))
    const g = groupes[groupes.length - 1]
    if (g && g.annee === annee) g.evenements.push(x)
    else groupes.push({ annee, evenements: [x] })
  }
  return groupes
}

// ------------------------------------------------------------
// Registre : période et export CSV
// ------------------------------------------------------------
/** Traitements dont la date est dans [du, au], du plus ancien au plus récent. */
export function traitementsDeLaPeriode<T extends Pick<Treatment, 'date' | 'id'>>(traitements: T[], du: DateISO, au: DateISO): T[] {
  if (!estDateValide(du) || !estDateValide(au)) throw new Error(`Période invalide : ${du} → ${au}`)
  if (comparerDates(au, du) < 0) throw new Error('La fin de la période précède son début')
  return traitements
    .filter(t => comparerDates(t.date, du) >= 0 && comparerDates(t.date, au) <= 0)
    .sort((a, b) => comparerDates(a.date, b.date) || a.id.localeCompare(b.id))
}

export const COLONNES_REGISTRE: Colonne[] = [
  { titre: 'Date du traitement', type: 'date' },
  { titre: 'Produit (nom commercial)', type: 'texte' },
  { titre: 'Type de produit', type: 'texte' },
  { titre: 'N° AMM', type: 'texte' },
  { titre: 'Dose', type: 'texte' },
  { titre: 'Unité de dose', type: 'texte' },
  { titre: 'Quantité totale', type: 'texte' },
  { titre: 'Unité de quantité', type: 'texte' },
  { titre: 'Surface traitée (ha)', type: 'texte' },
  { titre: 'Surface traitée (m²)', type: 'texte' },
  { titre: 'Culture', type: 'texte' },
  { titre: 'Cible', type: 'texte' },
  { titre: 'Type de cible', type: 'texte' },
  { titre: 'Type de lieu', type: 'texte' },
  { titre: 'Localisation', type: 'texte' },
  { titre: 'Îlot PAC / coordonnées', type: 'texte' },
  { titre: 'Délai avant récolte (j)', type: 'entier' },
  { titre: 'Date de récolte suivante', type: 'date' },
  { titre: 'Opérateur', type: 'texte' },
  { titre: 'Vent', type: 'texte' },
  { titre: 'Température (°C)', type: 'decimal' },
  { titre: 'Notes', type: 'texte' },
]

/**
 * Registre des traitements d'une période, au format des exports CSV
 * (`genererCsv`). Les décimaux sont écrits en texte à la virgule, sans
 * arrondi : 6 m² donnent 0,0006 ha. Une AMM absente reste une cellule vide.
 */
export function exportRegistre(traitements: Treatment[], du: DateISO, au: DateISO): Tableau {
  return {
    colonnes: COLONNES_REGISTRE,
    lignes: traitementsDeLaPeriode(traitements, du, au).map(t => [
      t.date,
      t.produit,
      LIBELLES_PRODUITS[t.produit_type] ?? t.produit_type,
      t.amm,
      formatDecimalFr(t.dose),
      t.dose_unite,
      formatDecimalFr(t.quantite_totale),
      t.quantite_unite,
      m2EnHa(t.surface_m2).replace('.', ','),
      formatDecimalFr(t.surface_m2),
      t.culture_libelle,
      t.cible,
      LIBELLES_CIBLES[t.cible_type] ?? t.cible_type,
      LIBELLES_LIEUX[t.lieu_type] ?? t.lieu_type,
      t.lieu_libelle,
      t.ilot_pac,
      t.delai_avant_recolte_j,
      t.date_recolte_suivante,
      t.operateur_nom,
      t.vent,
      t.temperature_c === null ? null : centiemes(t.temperature_c),
      t.notes,
    ]),
  }
}
