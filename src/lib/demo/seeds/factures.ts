import { type DemoDb, DEMO_USER_ID } from '../data'
import { ajouterJours, centimesEnEuros, eurosEnCentimes, type FarmBilling, type Invoice, type PaymentMode, type VendeurFige } from '../../domain'
import {
  controlerPaiement, dateEcheance, estClientProfessionnel, formatNumero, lignesAFacturer, reglagesManquants,
  situationFacture, ventesFacturees,
} from '../../domain/factures'

// ============================================================
// Factures en mode démo (migration 010) : réglages, factures, avoir et
// paiements, et les équivalents en mémoire des fonctions de la base
// (emettre_facture, emettre_avoir, enregistrer_paiement, vue
// invoices_status, triggers d'immuabilité). Utilisés par client.ts.
// Mêmes règles qu'en base, rejouées avec la logique pure du domaine.
// ============================================================

type Row = Record<string, any>
type Db = Record<string, any[]>
type Err = { message: string; code?: string }
type Res = { data: any; error: Err | null }

const uuid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

const refus = (message: string, code = 'P0001'): Res => ({ data: null, error: { code, message } })
const ok = (data: any): Res => ({ data, error: null })

/** Ferme d'une saison. */
const fermeDe = (db: Db, seasonId: string) => db.seasons.find(s => s.id === seasonId)?.farm_id as string | undefined
const mesFermes = (db: Db, userId: string) => new Set(db.farm_members.filter(m => m.user_id === userId).map(m => m.farm_id as string))

function prochainNumero(db: Db, farmId: string, kind: 'facture' | 'avoir', year: number): number {
  let c = db.invoice_counters.find(x => x.farm_id === farmId && x.kind === kind && x.year === year)
  if (!c) { c = { farm_id: farmId, kind, year, last_number: 0 }; db.invoice_counters.push(c) }
  c.last_number += 1
  return c.last_number
}

const vendeur = (b: Row): VendeurFige => Object.fromEntries(Object.entries({
  raison_sociale: b.raison_sociale?.trim(), adresse: b.adresse?.trim(), siret: b.siret,
  email: b.email?.trim() || undefined, telephone: b.telephone?.trim() || undefined,
  iban: b.iban?.trim() || undefined, bic: b.bic?.trim() || undefined, mentions_libres: b.mentions_libres?.trim() || undefined,
}).filter(([, v]) => v !== undefined && v !== null && v !== '')) as unknown as VendeurFige

/** Équivalent de emettre_facture. `date` : date d'émission (aujourd'hui à Paris hors amorçage). */
export function emettreFactureDemo(db: Db, args: Row, userId: string, date = aujourdhuiParis()): Res {
  const ids: string[] = Array.from(new Set((args.p_sale_ids ?? []) as string[]))
  const opt: Row = args.p_options ?? {}
  if (ids.length === 0) return refus('Aucune vente à facturer')
  if (ids.length !== (args.p_sale_ids ?? []).length) return refus('Liste de ventes invalide (doublon ou identifiant vide)')
  const fermes = mesFermes(db, userId)
  const ventes = ids.map(id => db.sales.find(s => s.id === id))
  if (ventes.some(v => !v || !fermes.has(fermeDe(db, v.season_id) ?? ''))) return refus('Vente introuvable ou inaccessible', '42501')
  const farmIds = new Set(ventes.map(v => fermeDe(db, v!.season_id)))
  if (farmIds.size !== 1) return refus('Les ventes doivent appartenir à une même ferme')
  const farmId = Array.from(farmIds)[0]!
  if (ventes.length > 1 && ventes.some(v => !v!.client_id)) return refus('Une vente sans fiche client se facture seule')
  if (new Set(ventes.map(v => v!.client_id)).size > 1) return refus('Les ventes doivent être du même client')

  const deja = ventesFacturees(db.invoice_sales as any)
  const num = ids.filter(id => deja.has(id)).map(id => db.invoices.find(i => i.id === deja.get(id))?.numero)
  if (num.length) return refus(`Vente déjà facturée (facture n° ${Array.from(new Set(num)).join(', ')})`)

  const b = db.farm_billing.find(x => x.farm_id === farmId) as FarmBilling | undefined
  const clientId: string | null = ventes[0]!.client_id ?? null
  const c = clientId ? db.clients.find(x => x.id === clientId) : null
  const nom: string | null = c ? c.name : (ventes[0]!.client?.trim() || null)
  const adresse: string | null = c?.address?.trim() || null
  const pro: boolean = typeof opt.professionnel === 'boolean' ? opt.professionnel : estClientProfessionnel(c?.kind)
  const manque = reglagesManquants(b, { professionnel: pro }).map(m => m.libelle.toLowerCase())
  if (pro && (!nom || !adresse)) manque.push('nom et adresse du client (client professionnel)')
  if (manque.length) return refus(`Mentions obligatoires manquantes : ${manque.join(', ')}`)

  const delai = opt.delai_jours ?? b!.delai_paiement_jours ?? 0
  let echeance: string
  try { echeance = dateEcheance(date, delai) } catch (e) { return refus(e instanceof Error ? e.message : String(e)) }
  const annee = Number(date.slice(0, 4))
  const lignes = lignesAFacturer(ventes.map(v => ({ ...v!, lignes: db.sale_lines.filter(l => l.sale_id === v!.id) })))
  const total = lignes.reduce((s, l) => s + l.line_total, 0)
  const somme = ventes.reduce((s, v) => s + eurosEnCentimes(v!.total), 0)
  if (total !== somme) return refus(`Incohérence : lignes ${total} c pour des ventes à ${somme} c`)

  const seq = prochainNumero(db, farmId, 'facture', annee)
  const dates = ventes.map(v => v!.date as string).sort()
  const derniere = [...ventes].sort((a, b2) => b2!.date.localeCompare(a!.date))[0]!
  const id = uuid()
  const acheteur = Object.fromEntries(Object.entries({
    client_id: clientId ?? undefined, nom: nom ?? undefined, adresse: adresse ?? undefined, email: c?.email?.trim() || undefined,
    siren: opt.client_siren?.trim() || undefined, adresse_livraison: opt.adresse_livraison?.trim() || undefined, professionnel: pro,
  }).filter(([, v]) => v !== undefined))
  db.invoices.push({
    id, farm_id: farmId, season_id: derniere.season_id, client_id: clientId, kind: 'facture',
    numero: formatNumero(b!.prefixe_facture, annee, seq), annee, sequence: seq, date_emission: date,
    date_vente_debut: dates[0], date_vente_fin: dates[dates.length - 1], date_echeance: echeance,
    vendeur: vendeur(b!), acheteur, total: centimesEnEuros(total), mention_tva: b!.mention_tva!.trim(),
    conditions_paiement: b!.conditions_paiement?.trim() || null,
    penalites_retard: pro ? b!.penalites_retard!.trim() : null, indemnite_recouvrement: pro ? b!.indemnite_recouvrement!.trim() : null,
    notes: opt.notes?.trim() || null, avoir_de: null, motif: null, annulee_par: null,
    created_by: userId, created_at: `${date}T10:00:00Z`,
  } satisfies Invoice)
  for (const l of lignes) {
    db.invoice_lines.push({
      id: uuid(), invoice_id: id, farm_id: farmId, position: l.position, sale_id: l.sale_id, sale_date: l.sale_date,
      culture_id: l.culture_id, label: l.label, unit: l.unit, quantity: l.quantity, stems_per_unit: l.stems_per_unit,
      unit_price: centimesEnEuros(l.unit_price), line_total: centimesEnEuros(l.line_total),
    })
  }
  for (const sid of ids) db.invoice_sales.push({ id: uuid(), invoice_id: id, farm_id: farmId, sale_id: sid, liberee_par_avoir: null, created_at: `${date}T10:00:00Z` })
  return ok(id)
}

/** Équivalent de emettre_avoir : avoir total, montants négatifs, ventes libérées. */
export function emettreAvoirDemo(db: Db, args: Row, userId: string, date = aujourdhuiParis()): Res {
  const motif = String(args.p_motif ?? '').trim()
  if (!motif) return refus('Le motif de l’avoir est obligatoire')
  const f = db.invoices.find(i => i.id === args.p_invoice_id && mesFermes(db, userId).has(i.farm_id))
  if (!f) return refus('Facture introuvable ou inaccessible', '42501')
  if (f.kind !== 'facture') return refus('Un avoir ne se corrige pas par un avoir')
  if (f.annulee_par) return refus(`Facture ${f.numero} déjà annulée par l’avoir n° ${db.invoices.find(i => i.id === f.annulee_par)?.numero}`)
  const b = db.farm_billing.find(x => x.farm_id === f.farm_id) as FarmBilling | undefined
  const manque = reglagesManquants(b)
  if (manque.length) return refus(`Mentions obligatoires manquantes : ${manque.map(m => m.libelle.toLowerCase()).join(', ')}`)
  const annee = Number(date.slice(0, 4))
  const seq = prochainNumero(db, f.farm_id, 'avoir', annee)
  const id = uuid()
  db.invoices.push({
    id, farm_id: f.farm_id, season_id: f.season_id, client_id: f.client_id, kind: 'avoir',
    numero: formatNumero(b!.prefixe_avoir, annee, seq), annee, sequence: seq, date_emission: date,
    date_vente_debut: f.date_vente_debut, date_vente_fin: f.date_vente_fin, date_echeance: null,
    vendeur: vendeur(b!), acheteur: f.acheteur, total: centimesEnEuros(-eurosEnCentimes(f.total)), mention_tva: b!.mention_tva!.trim(),
    conditions_paiement: null, penalites_retard: null, indemnite_recouvrement: null, notes: null,
    avoir_de: f.id, motif, annulee_par: null, created_by: userId, created_at: `${date}T11:00:00Z`,
  } satisfies Invoice)
  for (const l of db.invoice_lines.filter(x => x.invoice_id === f.id)) {
    db.invoice_lines.push({ ...l, id: uuid(), invoice_id: id,
      unit_price: centimesEnEuros(-eurosEnCentimes(l.unit_price)), line_total: centimesEnEuros(-eurosEnCentimes(l.line_total)) })
  }
  f.annulee_par = id
  for (const x of db.invoice_sales) if (x.invoice_id === f.id && !x.liberee_par_avoir) x.liberee_par_avoir = id
  return ok(id)
}

/** Équivalent de enregistrer_paiement et du trigger paiement_controler. */
export function enregistrerPaiementDemo(db: Db, args: Row, userId: string): Res {
  const f = db.invoices.find(i => i.id === args.p_invoice_id && mesFermes(db, userId).has(i.farm_id))
  if (!f) return refus('Facture introuvable ou inaccessible', '42501')
  const p: Row = args.p_paiement ?? {}
  let montant: number
  try { montant = eurosEnCentimes(p.amount) } catch { return refus('Montant illisible') }
  const modes: PaymentMode[] = ['virement', 'cheque', 'especes', 'carte', 'autre']
  const mode = p.mode ?? 'autre'
  if (!modes.includes(mode)) return refus(`Mode de paiement inconnu : ${mode}`, '23514')
  const existants = db.payments.filter(x => x.invoice_id === f.id)
  const err = controlerPaiement(f as Invoice, existants as any, { montant, contrepasse_de: p.contrepasse_de || null, notes: p.notes })
  if (err) return refus(err)
  const id = uuid()
  db.payments.push({
    id, invoice_id: f.id, farm_id: f.farm_id, date: p.date || aujourdhuiParis(), amount: centimesEnEuros(montant), mode,
    reference: p.reference?.trim() || null, notes: p.notes?.trim() || null, contrepasse_de: p.contrepasse_de || null,
    created_by: userId, created_at: new Date().toISOString(),
  })
  return ok(id)
}

/** Vue invoices_status, à la date de Paris. */
export function invoicesStatusDemo(db: Db): Row[] {
  const jour = aujourdhuiParis()
  return db.invoices.map(i => {
    const s = situationFacture(i as Invoice, db.payments.filter(p => p.invoice_id === i.id), jour)
    const liee = db.invoices.find(x => x.id === (i.annulee_par ?? i.avoir_de))
    return {
      id: i.id, farm_id: i.farm_id, season_id: i.season_id, client_id: i.client_id, kind: i.kind, numero: i.numero,
      date_emission: i.date_emission, date_echeance: i.date_echeance, total: i.total, client_nom: i.acheteur?.nom ?? null,
      avoir_de: i.avoir_de, annulee_par: i.annulee_par, numero_lie: liee?.numero ?? null,
      paye: centimesEnEuros(s.paye), reste_du: centimesEnEuros(s.reste), statut: s.statut, jours_de_retard: s.joursRetard,
    }
  })
}

const FIGEES = new Set(['invoices', 'invoice_lines', 'invoice_sales', 'invoice_counters'])

/**
 * Droits et triggers de 010 pour les requêtes directes : écriture refusée
 * sur les documents émis, paiements ni modifiés ni supprimés, ventes
 * facturées protégées. Renvoie l'erreur à rendre, ou null.
 */
export function refusFacturesDemo(db: Db, table: string, op: 'insert' | 'update' | 'delete' | 'upsert', rows: Row[], payload?: Row): Err | null {
  if (FIGEES.has(table)) return { code: '42501', message: `permission denied for table ${table}` }
  if (table === 'payments' && op !== 'insert') return { code: '42501', message: 'permission denied for table payments' }
  if (table === 'farm_billing' && op === 'delete') return { code: '42501', message: 'permission denied for table farm_billing' }
  if (table === 'payments' && op === 'insert') return { code: '42501', message: 'Passer par enregistrer_paiement (mode démo)' }
  if (table === 'sales' || table === 'sale_lines') {
    const actives = ventesFacturees(db.invoice_sales as any)
    const touchees = rows.map(r => (table === 'sales' ? r.id : r.sale_id))
    if (table === 'sale_lines' && payload?.sale_id) touchees.push(payload.sale_id)
    if (table === 'sales' && op === 'update' && payload) {
      const cles = ['date', 'total', 'tiges', 'prix_unitaire', 'client_id', 'client', 'season_id', 'cultures_sold']
      if (!cles.some(k => k in payload)) return null
    }
    const hit = touchees.find(id => actives.has(id))
    if (hit) {
      const numero = db.invoices.find(i => i.id === actives.get(hit))?.numero
      return { code: 'P0001', message: `Vente facturée (facture n° ${numero}) : émettez un avoir avant de la modifier ou de la supprimer` }
    }
  }
  return null
}

// ─── Données ───────────────────────────────────────────────────────

/** Données de démo : réglages remplis, 3 factures (payée, partielle, en retard), une facture annulée par avoir. */
export function seed_factures(db: DemoDb & Record<string, any[]>): void {
  const x = db as unknown as Db
  x.invoice_sales ??= []
  const farmId = x.farms[0]?.id
  if (!farmId) return
  x.farm_billing.push({
    farm_id: farmId,
    raison_sociale: 'Les Jardins de Bleuenn — Nolwenn Kerjean',
    adresse: 'Lieu-dit Kerbleuenn\n29470 Plougastel-Daoulas',
    siret: '12345678900018',
    email: 'bonjour@jardins-bleuenn.exemple',
    telephone: '06 00 00 00 00',
    mention_tva: 'TVA non applicable, art. 293 B du CGI (exemple de démonstration, à faire confirmer par votre comptable)',
    delai_paiement_jours: 30,
    conditions_paiement: 'Paiement par virement ou chèque. Pas d’escompte pour paiement anticipé.',
    penalites_retard: 'Pénalités de retard : trois fois le taux d’intérêt légal (exemple de démonstration)',
    indemnite_recouvrement: 'Indemnité forfaitaire pour frais de recouvrement due en cas de retard : 40 € (exemple de démonstration)',
    iban: 'FR76 0000 0000 0000 0000 0000 000',
    bic: 'DEMOFRPPXXX',
    mentions_libres: 'Fleurs cultivées sans pesticides de synthèse à Plougastel-Daoulas.',
    prefixe_facture: 'F', prefixe_avoir: 'AV', updated_by: DEMO_USER_ID, updated_at: '2026-09-01T08:00:00Z',
  } satisfies FarmBilling)

  const jour = aujourdhuiParis()
  const j = (n: number) => ajouterJours(jour, n)
  const vente = (date: string, client: string) => {
    const v = x.sales.find(s => s.date === date && s.client === client)
    if (!v) throw new Error(`Vente démo introuvable : ${date} ${client}`)
    return v.id as string
  }
  const emettre = (ids: string[], options: Row, date: string) => {
    const r = emettreFactureDemo(x, { p_sale_ids: ids, p_options: options }, DEMO_USER_ID, date)
    if (r.error) throw new Error(`Facture démo : ${r.error.message}`)
    return r.data as string
  }
  const payer = (id: string, amount: number | string, mode: PaymentMode, date: string, reference: string | null = null) => {
    const r = enregistrerPaiementDemo(x, { p_invoice_id: id, p_paiement: { amount, mode, date, reference } }, DEMO_USER_ID)
    if (r.error) throw new Error(`Paiement démo : ${r.error.message}`)
  }

  // 1. Mariage Le Bris (particulier) : réglée par virement → payée
  const f1 = emettre([vente('2026-07-04', 'Mariage Le Bris')], { delai_jours: 0 }, j(-75))
  payer(f1, x.invoices.find(i => i.id === f1)!.total, 'virement', j(-70), 'VIR LE BRIS MARIAGE')
  // 2. Atelier Pétale : prix erroné, annulée par avoir ; la vente redevient à facturer
  const f2 = emettre([vente('2026-07-25', 'Atelier Pétale')], {}, j(-50))
  const av = emettreAvoirDemo(x, { p_invoice_id: f2, p_motif: 'Remise fleuriste oubliée sur le prix à la tige' }, DEMO_USER_ID, j(-48))
  if (av.error) throw new Error(`Avoir démo : ${av.error.message}`)
  // 3. Fleurs de Lin : échéance dépassée, acompte par chèque → en retard
  const f3 = emettre([vente('2026-09-12', 'Fleurs de Lin, Morlaix')], { client_siren: '987654321' }, j(-45))
  payer(f3, 150, 'cheque', j(-30), 'Chèque n° 0004521')
  // 4. Pompes funèbres du Léon (professionnel) : échéance à venir, acompte → partiellement payée
  const f4 = emettre([vente('2026-10-31', 'Pompes funèbres du Léon')], { professionnel: true }, j(-20))
  payer(f4, 100, 'virement', j(-10), 'VIR PF LEON')
}
