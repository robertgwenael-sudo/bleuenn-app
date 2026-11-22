// ============================================================
// Exports CSV pour le comptable (et la MSA)
// ============================================================
// Fichiers lisibles tels quels par Excel en français :
//   * BOM UTF-8 en tête (sinon Excel lit le fichier en Windows-1252) ;
//   * séparateur `;` (la virgule est le séparateur décimal) ;
//   * décimales à la virgule, sans séparateur de milliers ni symbole € ;
//   * dates `JJ/MM/AAAA` ;
//   * fin de ligne `\r\n`.
// Pas de ligne `sep=;` : avec elle, Excel ignore le BOM et casse les accents.
//
// Une cellule de texte qui commence par `=`, `+`, `-`, `@`, une tabulation ou
// un retour chariot est préfixée d'une apostrophe : sans cela, Excel
// l'exécuterait comme une formule (injection CSV). Les nombres, montants et
// dates sont produits par ce module et ne sont jamais préfixés.
//
// Les montants viennent des centimes du domaine (montants.ts) : aucun
// flottant entre la base et le fichier.
// ============================================================

import { cleMois, estDateValide } from './dates'
import { enCentiemes, eurosEnCentimes, verifierCentimes } from './montants'
import { LIBELLES_RAISONS } from './reel'
import {
  SALE_CHANNELS,
  type Centimes, type Client, type ClientKind, type DateISO, type EurosNumeric, type LigneBase, type LineUnit,
  type Loss, type Order, type OrderStatus, type Sale,
} from './types'
import { montantLigne, tigesLigne, totalVente, totauxLignes, tigesVente } from './ventes'

// ------------------------------------------------------------
// Tableau typé → CSV
// ------------------------------------------------------------
/**
 * Type d'une colonne, qui fixe la forme de la valeur attendue :
 *  * `texte`   : chaîne (ou null) ;
 *  * `date`    : date civile `AAAA-MM-JJ` (ou null) ;
 *  * `entier`  : nombre entier ;
 *  * `decimal` : nombre décimal exprimé en CENTIÈMES entiers (2,5 → 250) ;
 *  * `montant` : montant en CENTIMES entiers.
 */
export type TypeColonne = 'texte' | 'date' | 'entier' | 'decimal' | 'montant'

export interface Colonne {
  titre: string
  type: TypeColonne
}

export type Cellule = string | number | null

export interface Tableau {
  colonnes: Colonne[]
  lignes: Cellule[][]
}

/** Séparateur décimal et de colonnes d'Excel en français. */
export const SEPARATEUR = ';'
export const FIN_DE_LIGNE = '\r\n'
export const BOM = '﻿'

/** `2026-07-14` → `14/07/2026`. Lève sur une date invalide. */
export function formatDateCsv(d: DateISO): string {
  if (!estDateValide(d)) throw new Error(`Date invalide pour l'export : « ${String(d)} »`)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
}

/** Centièmes entiers → `1234,5` / `2` / `-0,25` (zéros finaux retirés). */
export function formatCentiemesCsv(c: number): string {
  verifierEntier(c, 'Nombre décimal')
  const neg = c < 0
  const abs = Math.abs(c)
  const ent = Math.floor(abs / 100)
  const dec = String(abs - ent * 100).padStart(2, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${ent}${dec ? `,${dec}` : ''}`
}

/** Centimes → `1234,50` : toujours deux décimales, pas de séparateur de milliers ni de symbole. */
export function formatMontantCsv(c: Centimes): string {
  verifierCentimes(c)
  const neg = c < 0
  const abs = Math.abs(c)
  const ent = Math.floor(abs / 100)
  return `${neg ? '-' : ''}${ent},${String(abs - ent * 100).padStart(2, '0')}`
}

function verifierEntier(n: unknown, contexte: string): asserts n is number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new Error(`${contexte} non entier : ${String(n)}`)
}

/**
 * Texte d'une cellule tel qu'il s'affiche (aperçu à l'écran), avant la
 * protection contre les formules et l'échappement CSV. Lève sur toute
 * valeur qui ne correspond pas au type de la colonne : jamais de `NaN`,
 * de `undefined` ni de zéro silencieux dans un fichier.
 */
export function formaterCellule(type: TypeColonne, v: Cellule, titre = 'cellule'): string {
  if (v === null) return ''
  if (v === undefined) throw new Error(`Colonne « ${titre} » : valeur absente`)
  switch (type) {
    case 'texte':
      if (typeof v !== 'string') throw new Error(`Colonne « ${titre} » : texte attendu, reçu ${String(v)}`)
      return v
    case 'date':
      if (typeof v !== 'string') throw new Error(`Colonne « ${titre} » : date attendue, reçu ${String(v)}`)
      return formatDateCsv(v)
    case 'entier':
      verifierEntier(v, `Colonne « ${titre} »`)
      return String(v)
    case 'decimal':
      verifierEntier(v, `Colonne « ${titre} » (centièmes)`)
      return formatCentiemesCsv(v)
    case 'montant':
      verifierEntier(v, `Colonne « ${titre} » (centimes)`)
      return formatMontantCsv(v)
  }
}

const DEBUT_FORMULE = /^[=+\-@\t\r]/

/** Préfixe d'une apostrophe un texte qu'Excel prendrait pour une formule. */
export function neutraliserFormule(texte: string): string {
  return DEBUT_FORMULE.test(texte) ? `'${texte}` : texte
}

/** Entoure de guillemets (doublés à l'intérieur) un champ qui contient `;`, `"`, `\r` ou `\n`. */
export function echapperChamp(texte: string): string {
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

/** Cellule prête à écrire dans le fichier. */
export function celluleCsv(type: TypeColonne, v: Cellule, titre?: string): string {
  const t = formaterCellule(type, v, titre)
  return echapperChamp(type === 'texte' ? neutraliserFormule(t) : t)
}

/** Lignes formatées pour l'aperçu à l'écran (en-tête non compris). */
export function tableauFormate(t: Tableau, max = Infinity): string[][] {
  return t.lignes.slice(0, max).map(l => t.colonnes.map((c, i) => formaterCellule(c.type, l[i], c.titre)))
}

/** Contenu complet du fichier CSV, BOM compris. */
export function genererCsv(t: Tableau): string {
  const out: string[] = [t.colonnes.map(c => echapperChamp(neutraliserFormule(c.titre))).join(SEPARATEUR)]
  t.lignes.forEach((l, n) => {
    if (l.length !== t.colonnes.length) {
      throw new Error(`Ligne ${n + 1} : ${l.length} cellules pour ${t.colonnes.length} colonnes`)
    }
    out.push(t.colonnes.map((c, i) => celluleCsv(c.type, l[i], c.titre)).join(SEPARATEUR))
  })
  return BOM + out.join(FIN_DE_LIGNE) + FIN_DE_LIGNE
}

/** `bleuenn-ventes-detaillees-2026-01-01_2026-12-31.csv`. */
export function nomFichierExport(cle: string, du: DateISO, au: DateISO): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cle)) throw new Error(`Nom d'export invalide : « ${cle} »`)
  if (!estDateValide(du) || !estDateValide(au)) throw new Error(`Période invalide : ${du} → ${au}`)
  return `bleuenn-${cle}-${du}_${au}.csv`
}

// ------------------------------------------------------------
// Libellés
// ------------------------------------------------------------
export const LIBELLES_TYPE_CLIENT: Record<ClientKind, string> = {
  fleuriste: 'Fleuriste', particulier: 'Particulier', mariage: 'Mariage', abonne: 'Abonné',
  evenementiel: 'Événementiel', commerce: 'Commerce', autre: 'Autre',
}
export const LIBELLES_STATUT_COMMANDE: Record<OrderStatus, string> = {
  devis: 'Devis', confirmee: 'Confirmée', prete: 'Prête', livree: 'Livrée', annulee: 'Annulée',
}
export const LIBELLES_UNITE: Record<LineUnit, string> = {
  tige: 'Tige', botte: 'Botte', bouquet: 'Bouquet', seau: 'Seau', autre: 'Autre',
}

const texte = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

const parDate = <T>(d: (x: T) => string, ...suite: ((x: T) => string)[]) => (a: T, b: T) => {
  const c = d(a).localeCompare(d(b))
  if (c !== 0) return c
  for (const f of suite) { const s = f(a).localeCompare(f(b), 'fr'); if (s !== 0) return s }
  return 0
}

// ------------------------------------------------------------
// Données d'entrée (formes minimales)
// ------------------------------------------------------------
export type LigneExport = Pick<LigneBase, 'label' | 'unit' | 'quantity' | 'stems_per_unit' | 'unit_price'>
  & Partial<Pick<LigneBase, 'culture_id' | 'line_total'>>

export type VenteExport = Pick<Sale, 'id' | 'date' | 'channel' | 'total' | 'tiges' | 'prix_unitaire'>
  & Partial<Pick<Sale, 'client_id' | 'client' | 'cultures_sold' | 'notes'>>
  & { lignes: LigneExport[] }

export type ClientExport = Pick<Client, 'id' | 'name' | 'kind' | 'contact_name' | 'phone' | 'email' | 'address' | 'archived_at'>

export type CommandeExport = Pick<Order, 'id' | 'delivery_date' | 'client_id' | 'status' | 'channel' | 'sale_id'>
  & { lignes: LigneExport[] }

export interface RecolteExport {
  id: string
  planting_id: string
  date: DateISO
  tiges: number
  quality: string | null
  notes: string | null
}

export type PerteExport = Pick<Loss, 'id' | 'date' | 'planting_id' | 'culture_id' | 'tiges' | 'reason' | 'notes'>

export interface PlantationExport {
  id: string
  culture_name: string
  garden_name: string
  planche_name: string
  surface_m2: EurosNumeric
  date_semis: DateISO
  date_plantation: DateISO
  date_recolte: DateISO
  date_fin: DateISO
  tiges_estimees: number
  revenu_estime: EurosNumeric
  season_name: string
}

/** Référence courte et stable d'un enregistrement (8 premiers caractères de l'uuid). */
export function reference(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function nomClient(v: { client_id?: string | null; client?: string | null }, clients: Map<string, string>): string | null {
  if (v.client_id) return clients.get(v.client_id) ?? 'Client inconnu'
  return texte(v.client)
}

/** « Jardin du haut · P3 · semis du 12/03/2026 », ou null si la plantation est inconnue. */
export function libellePlantation(p: Pick<PlantationExport, 'garden_name' | 'planche_name' | 'date_semis'> | undefined): string | null {
  if (!p) return null
  return `${p.garden_name} · ${p.planche_name} · semis du ${formatDateCsv(p.date_semis)}`
}

// ------------------------------------------------------------
// 1. Ventes détaillées
// ------------------------------------------------------------
export const COLONNES_VENTES_DETAILLEES: Colonne[] = [
  { titre: 'Date', type: 'date' },
  { titre: 'Réf. vente', type: 'texte' },
  { titre: 'Client', type: 'texte' },
  { titre: 'Canal', type: 'texte' },
  { titre: 'Culture ou libellé', type: 'texte' },
  { titre: 'Unité', type: 'texte' },
  { titre: 'Quantité', type: 'decimal' },
  { titre: 'Tiges', type: 'entier' },
  { titre: 'Prix unitaire (€)', type: 'montant' },
  { titre: 'Montant (€)', type: 'montant' },
]

/**
 * Une ligne par ligne de vente. Une vente saisie avant le détail en lignes
 * apparaît sur une seule ligne : unité « Tige », quantité = tiges, prix à la
 * tige et total historiques. La somme de la colonne Montant égale le CA.
 */
export function exportVentesDetaillees(ventes: VenteExport[], clients: Pick<Client, 'id' | 'name'>[]): Tableau {
  const noms = new Map(clients.map(c => [c.id, c.name]))
  const tri = [...ventes].sort(parDate(v => v.date, v => v.channel, v => v.id))
  const lignes: Cellule[][] = []
  for (const v of tri) {
    const client = nomClient(v, noms)
    const ref = reference(v.id)
    if (v.lignes.length === 0) {
      lignes.push([
        v.date, ref, client, v.channel, texte(v.cultures_sold), LIBELLES_UNITE.tige,
        v.tiges * 100, v.tiges, eurosEnCentimes(v.prix_unitaire), totalVente(v),
      ])
      continue
    }
    for (const l of v.lignes) {
      lignes.push([
        v.date, ref, client, v.channel, texte(l.label), LIBELLES_UNITE[l.unit] ?? l.unit,
        enCentiemes(l.quantity, 'Quantité'), tigesLigne(l), eurosEnCentimes(l.unit_price), montantLigne(l),
      ])
    }
  }
  return { colonnes: COLONNES_VENTES_DETAILLEES, lignes }
}

// ------------------------------------------------------------
// 2. Ventes par mois et par canal
// ------------------------------------------------------------
const MOIS_LIBELLES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
  'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export const COLONNES_VENTES_MOIS_CANAL: Colonne[] = [
  { titre: 'Année', type: 'entier' },
  { titre: 'N° mois', type: 'entier' },
  { titre: 'Mois', type: 'texte' },
  { titre: 'Canal', type: 'texte' },
  { titre: 'Nombre de ventes', type: 'entier' },
  { titre: 'Tiges', type: 'entier' },
  { titre: 'CA (€)', type: 'montant' },
]

/**
 * Synthèse : une ligne par mois et par canal ayant au moins une vente.
 * Pas de ligne de total, pour qu'une somme de colonne dans Excel reste juste.
 * Le mois est donné en année + numéro + nom : un libellé « juillet 2026 »
 * serait converti en date par Excel.
 */
export function exportVentesParMoisEtCanal(ventes: VenteExport[]): Tableau {
  const m = new Map<string, { mois: string; canal: string; n: number; tiges: number; total: Centimes }>()
  for (const v of ventes) {
    const mois = cleMois(v.date)
    const k = `${mois}|${v.channel}`
    const acc = m.get(k) ?? { mois, canal: v.channel, n: 0, tiges: 0, total: 0 }
    acc.n += 1
    acc.tiges += tigesVente(v)
    acc.total += totalVente(v)
    m.set(k, acc)
  }
  const rang = (c: string) => {
    const i = (SALE_CHANNELS as readonly string[]).indexOf(c)
    return i < 0 ? SALE_CHANNELS.length : i
  }
  const lignes = Array.from(m.values())
    .sort((a, b) => a.mois.localeCompare(b.mois) || rang(a.canal) - rang(b.canal) || a.canal.localeCompare(b.canal, 'fr'))
    .map(a => {
      const annee = Number(a.mois.slice(0, 4)), mois = Number(a.mois.slice(5, 7))
      return [annee, mois, MOIS_LIBELLES[mois - 1], a.canal, a.n, a.tiges, a.total] as Cellule[]
    })
  return { colonnes: COLONNES_VENTES_MOIS_CANAL, lignes }
}

// ------------------------------------------------------------
// 3. Récoltes
// ------------------------------------------------------------
export const COLONNES_RECOLTES: Colonne[] = [
  { titre: 'Date', type: 'date' },
  { titre: 'Culture', type: 'texte' },
  { titre: 'Jardin', type: 'texte' },
  { titre: 'Planche', type: 'texte' },
  { titre: 'Tiges', type: 'entier' },
  { titre: 'Qualité', type: 'texte' },
  { titre: 'Notes', type: 'texte' },
]

export function exportRecoltes(recoltes: RecolteExport[], plantations: Pick<PlantationExport, 'id' | 'culture_name' | 'garden_name' | 'planche_name'>[]): Tableau {
  const p = new Map(plantations.map(x => [x.id, x]))
  const lignes = recoltes
    .map(r => ({ r, pl: p.get(r.planting_id) }))
    .sort(parDate(x => x.r.date, x => x.pl?.culture_name ?? '', x => x.r.id))
    .map(({ r, pl }) => [
      r.date, pl?.culture_name ?? 'Plantation inconnue', pl?.garden_name ?? null, pl?.planche_name ?? null,
      r.tiges, texte(r.quality), texte(r.notes),
    ] as Cellule[])
  return { colonnes: COLONNES_RECOLTES, lignes }
}

// ------------------------------------------------------------
// 4. Pertes
// ------------------------------------------------------------
export const COLONNES_PERTES: Colonne[] = [
  { titre: 'Date', type: 'date' },
  { titre: 'Culture', type: 'texte' },
  { titre: 'Plantation', type: 'texte' },
  { titre: 'Tiges', type: 'entier' },
  { titre: 'Raison', type: 'texte' },
  { titre: 'Notes', type: 'texte' },
]

export function exportPertes(
  pertes: PerteExport[],
  plantations: Pick<PlantationExport, 'id' | 'culture_name' | 'garden_name' | 'planche_name' | 'date_semis'>[],
  cultures: { id: string; name: string }[],
): Tableau {
  const p = new Map(plantations.map(x => [x.id, x]))
  const c = new Map(cultures.map(x => [x.id, x.name]))
  const lignes = pertes
    .map(l => {
      const pl = l.planting_id ? p.get(l.planting_id) : undefined
      const culture = (l.culture_id ? c.get(l.culture_id) : undefined) ?? pl?.culture_name ?? null
      return { l, pl, culture }
    })
    .sort(parDate(x => x.l.date, x => x.culture ?? '', x => x.l.id))
    .map(({ l, pl, culture }) => [
      l.date, culture,
      l.planting_id ? (libellePlantation(pl) ?? 'Plantation inconnue') : null,
      l.tiges, LIBELLES_RAISONS[l.reason] ?? l.reason, texte(l.notes),
    ] as Cellule[])
  return { colonnes: COLONNES_PERTES, lignes }
}

// ------------------------------------------------------------
// 5. Commandes clients
// ------------------------------------------------------------
export const COLONNES_COMMANDES: Colonne[] = [
  { titre: 'Date de livraison', type: 'date' },
  { titre: 'Réf. commande', type: 'texte' },
  { titre: 'Client', type: 'texte' },
  { titre: 'Statut', type: 'texte' },
  { titre: 'Canal', type: 'texte' },
  { titre: 'Facturée', type: 'texte' },
  { titre: 'Nombre de lignes', type: 'entier' },
  { titre: 'Lignes', type: 'texte' },
  { titre: 'Tiges', type: 'entier' },
  { titre: 'Montant (€)', type: 'montant' },
]

/** « 3 × Botte Dahlia à 12,00 € = 36,00 € » (espaces ordinaires) ; quantité et montants sans flottant. */
export function libelleLigne(l: LigneExport): string {
  const q = formatCentiemesCsv(enCentiemes(l.quantity, 'Quantité'))
  const unite = LIBELLES_UNITE[l.unit] ?? l.unit
  return `${q} × ${unite} ${l.label.trim()} à ${formatMontantCsv(eurosEnCentimes(l.unit_price))} € = ${formatMontantCsv(montantLigne(l))} €`
}

export function exportCommandes(commandes: CommandeExport[], clients: Pick<Client, 'id' | 'name'>[]): Tableau {
  const noms = new Map(clients.map(c => [c.id, c.name]))
  const lignes = [...commandes]
    .sort(parDate(o => o.delivery_date, o => (o.client_id && noms.get(o.client_id)) || '', o => o.id))
    .map(o => {
      const t = totauxLignes(o.lignes)
      return [
        o.delivery_date, reference(o.id), nomClient(o, noms),
        LIBELLES_STATUT_COMMANDE[o.status] ?? o.status, texte(o.channel),
        o.sale_id ? 'Oui' : 'Non', o.lignes.length,
        o.lignes.length ? o.lignes.map(libelleLigne).join(' | ') : null,
        t.tiges, t.total_centimes,
      ] as Cellule[]
    })
  return { colonnes: COLONNES_COMMANDES, lignes }
}

// ------------------------------------------------------------
// 6. Clients
// ------------------------------------------------------------
export const COLONNES_CLIENTS: Colonne[] = [
  { titre: 'Nom', type: 'texte' },
  { titre: 'Type', type: 'texte' },
  { titre: 'Contact', type: 'texte' },
  { titre: 'Téléphone', type: 'texte' },
  { titre: 'Email', type: 'texte' },
  { titre: 'Adresse', type: 'texte' },
  { titre: 'Archivé', type: 'texte' },
  { titre: 'Nombre de ventes', type: 'entier' },
  { titre: 'CA de la période (€)', type: 'montant' },
]

/**
 * Toutes les fiches clients, avec le CA des ventes de la période qui leur
 * sont rattachées. Les ventes à client saisi en texte libre (anciennes
 * ventes) ne sont rattachées à aucune fiche et n'apparaissent pas ici.
 */
export function exportClients(clients: ClientExport[], ventes: VenteExport[]): Tableau {
  const ca = new Map<string, { n: number; total: Centimes }>()
  for (const v of ventes) {
    if (!v.client_id) continue
    const acc = ca.get(v.client_id) ?? { n: 0, total: 0 }
    acc.n += 1
    acc.total += totalVente(v)
    ca.set(v.client_id, acc)
  }
  const lignes = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id))
    .map(c => {
      const a = ca.get(c.id) ?? { n: 0, total: 0 }
      return [
        c.name.trim(), LIBELLES_TYPE_CLIENT[c.kind] ?? c.kind, texte(c.contact_name), texte(c.phone),
        texte(c.email), texte(c.address), c.archived_at ? 'Oui' : 'Non', a.n, a.total,
      ] as Cellule[]
    })
  return { colonnes: COLONNES_CLIENTS, lignes }
}

// ------------------------------------------------------------
// 7. Plan de culture
// ------------------------------------------------------------
export const COLONNES_PLAN: Colonne[] = [
  { titre: 'Plantation', type: 'texte' },
  { titre: 'Culture', type: 'texte' },
  { titre: 'Jardin', type: 'texte' },
  { titre: 'Planche', type: 'texte' },
  { titre: 'Surface (m²)', type: 'decimal' },
  { titre: 'Semis', type: 'date' },
  { titre: 'Plantation (date)', type: 'date' },
  { titre: 'Début de récolte', type: 'date' },
  { titre: 'Fin de récolte', type: 'date' },
  { titre: 'Tiges estimées', type: 'entier' },
  { titre: 'CA estimé (€)', type: 'montant' },
  { titre: 'Saison', type: 'texte' },
]

export function exportPlanDeCulture(plantations: PlantationExport[]): Tableau {
  const lignes = [...plantations]
    .sort(parDate(p => p.date_semis, p => p.garden_name, p => p.planche_name, p => p.culture_name, p => p.id))
    .map(p => [
      reference(p.id), p.culture_name, p.garden_name, p.planche_name,
      enCentiemes(p.surface_m2, 'Surface'), p.date_semis, p.date_plantation, p.date_recolte, p.date_fin,
      Math.round(p.tiges_estimees), eurosEnCentimes(p.revenu_estime), p.season_name,
    ] as Cellule[])
  return { colonnes: COLONNES_PLAN, lignes }
}

// ------------------------------------------------------------
// Catalogue des exports
// ------------------------------------------------------------
export type CleExport =
  | 'ventes-detaillees' | 'ventes-mois-canal' | 'recoltes' | 'pertes' | 'commandes' | 'clients' | 'plan-de-culture'

export interface DonneesExport {
  ventes: VenteExport[]
  clients: ClientExport[]
  commandes: CommandeExport[]
  recoltes: RecolteExport[]
  pertes: PerteExport[]
  /** Plantations de la période (plan de culture). */
  plan: PlantationExport[]
  /** Toutes les plantations connues, pour nommer celles des récoltes et pertes. */
  plantations: PlantationExport[]
  cultures: { id: string; name: string }[]
}

export const EXPORTS: { cle: CleExport; construire: (d: DonneesExport) => Tableau }[] = [
  { cle: 'ventes-detaillees', construire: d => exportVentesDetaillees(d.ventes, d.clients) },
  { cle: 'ventes-mois-canal', construire: d => exportVentesParMoisEtCanal(d.ventes) },
  { cle: 'recoltes', construire: d => exportRecoltes(d.recoltes, d.plantations) },
  { cle: 'pertes', construire: d => exportPertes(d.pertes, d.plantations, d.cultures) },
  { cle: 'commandes', construire: d => exportCommandes(d.commandes, d.clients) },
  { cle: 'clients', construire: d => exportClients(d.clients, d.ventes) },
  { cle: 'plan-de-culture', construire: d => exportPlanDeCulture(d.plan) },
]

/** Somme d'une colonne de montants (contrôle : ventes détaillées = CA). */
export function sommeColonne(t: Tableau, titre: string): number {
  const i = t.colonnes.findIndex(c => c.titre === titre)
  if (i < 0) throw new Error(`Colonne « ${titre} » absente`)
  return t.lignes.reduce((s: number, l) => {
    const v = l[i]
    if (v === null) return s
    verifierEntier(v, `Colonne « ${titre} »`)
    return s + v
  }, 0)
}
