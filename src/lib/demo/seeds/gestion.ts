import { type DemoDb, DEMO_USER_ID } from '../data'
import { ajouterJours, centimesEnEuros, encaisseVente, eurosEnCentimes } from '../../domain'
import { cheminJustificatif, empreinte, normaliserLibelle } from '../../domain/gestion'
import { ventesFacturees } from '../../domain/factures'

type Row = Record<string, any>
type Erreur = { message: string; code?: string }

// ============================================================
// Données FICTIVES : deux comptes (banque, caisse), un relevé importé
// d'une trentaine de lignes, des rapprochements, des justificatifs dont
// les « scans » sont des tickets dessinés en SVG. Plus les règles de la
// migration 012 rejouées en mémoire (farm_id recopié, immuabilité,
// rapprochement défait, fonctions importer_releve et creer_depense_liee).
// ============================================================

/** Fichiers de démonstration déjà « stockés » dans le bucket `justificatifs` : chemin → URL. */
export const OBJETS_JUSTIFICATIFS_DEMO = new Map<string, string>()

export const TABLES_GESTION = new Set(['receipts', 'receipt_pages', 'bank_accounts', 'bank_imports', 'bank_transactions', 'bank_matches'])

export const DEFAULTS_GESTION: Record<string, Row> = {
  receipts: { date_piece: null, montant: null, fournisseur: null, notes: null, ocr_texte: null, cost_id: null, payment_id: null, sans_objet_le: null, updated_at: null },
  receipt_pages: { taille: null, nom_origine: null, width: null, height: null },
  bank_accounts: { kind: 'banque', solde_initial: null, date_solde_initial: null, csv_mapping: null, archived_at: null },
  bank_imports: { date_min: null, date_max: null },
  bank_transactions: { import_id: null },
  bank_matches: { cost_id: null, payment_id: null, sale_id: null, categorie: null, libelle: null, annule_le: null, annule_par: null },
}

const uid = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID_COMPTE = uid('52000000', 1)
const ID_CAISSE = uid('52000000', 2)

/** Ticket dessiné en SVG (data: URL), pour les vignettes de démonstration. */
function ticketSvg(lignes: string[], rotation = -1.5): string {
  const h = 70 + lignes.length * 30
  const texte = lignes.map((l, i) => {
    const esc = l.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const gras = i === 0 || /TOTAL|NET/i.test(l)
    return `<text x="28" y="${52 + i * 30}" font-family="DejaVu Sans Mono, Menlo, monospace" font-size="${gras ? 21 : 18}" font-weight="${gras ? 700 : 400}" fill="#222">${esc}</text>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${h + 60}" viewBox="0 0 560 ${h + 60}">`
    + `<rect width="560" height="${h + 60}" fill="#ececec"/>`
    + `<g transform="rotate(${rotation} 280 ${h / 2})"><rect x="20" y="20" width="520" height="${h}" fill="#fbfbf8" stroke="#ddd"/>${texte}</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Données de démo de la gestion. Modifie la base en place ; après seed_factures (paiements). */
export function seed_gestion(db: DemoDb & Record<string, any[]>): void {
  const x = db as unknown as Record<string, Row[]>
  for (const t of TABLES_GESTION) x[t] ??= []
  const farm = x.farms?.[0]
  if (!farm) return
  const F = farm.id as string
  const jour = aujourdhuiParis()
  const j = (n: number) => ajouterJours(jour, n)
  const cree = (d: string) => `${d}T09:00:00Z`

  // ─── Comptes ───
  x.bank_accounts.push(
    { id: ID_COMPTE, farm_id: F, name: 'Compte courant pro', kind: 'banque', solde_initial: 2340.55, date_solde_initial: '2026-09-01',
      csv_mapping: { version: 1, separateur: ';', ligneEntete: 0, entetes: ['Date', 'Libellé', 'Montant(EUROS)'], date: 0, libelle: [1],
        montant: { mode: 'unique', colonne: 2 }, formatDate: 'JJ/MM/AAAA', decimale: ',' },
      archived_at: null, created_by: DEMO_USER_ID, created_at: cree('2026-09-01') },
    { id: ID_CAISSE, farm_id: F, name: 'Caisse des marchés', kind: 'caisse', solde_initial: 80, date_solde_initial: '2026-09-01',
      csv_mapping: null, archived_at: null, created_by: DEMO_USER_ID, created_at: cree('2026-09-01') },
  )

  // ─── Pièces existantes ───
  const cout = (date: string, montant: number) => {
    const c = x.costs.find(r => r.date === date && eurosEnCentimes(r.amount) === Math.round(montant * 100))
    if (!c) throw new Error(`Dépense démo introuvable : ${date} ${montant}`)
    return c
  }
  const paiement = (reference: string) => {
    const p = x.payments.find(r => r.reference === reference)
    if (!p) throw new Error(`Paiement démo introuvable : ${reference}`)
    return p
  }
  const pLeBris = paiement('VIR LE BRIS MARIAGE')
  const pCheque = paiement('Chèque n° 0004521')
  const pLeon = paiement('VIR PF LEON')
  const facturees = ventesFacturees(x.invoice_sales as any)
  const marches = x.sales
    .filter(s => s.channel === 'Marché' && s.date >= '2026-08-15' && s.date <= jour && !facturees.has(s.id) && (encaisseVente(s as { total: number; total_ttc?: number | null }) ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-3)

  // ─── Relevé du compte courant (import CSV) ───
  // [date, libellé, montant €, rapprochement]
  type R = ['c', Row] | ['p', Row] | ['h', string, string] | null
  const releve: [string, string, number, R][] = [
    ['2026-09-02', 'PRLV SEPA MSA COTISATIONS', -312.00, null],
    ['2026-09-05', 'CB AGRI BRETAGNE LANDERNEAU', -23.40, null],
    ['2026-09-09', 'CB STATION DU PORT 08/09', -61.00, ['c', cout('2026-09-08', 61)]],
    ['2026-09-15', 'PRLV SEPA ASSURANCE RECOLTES', -38.90, null],
    ['2026-09-20', 'VIR SEPA REGION BRETAGNE AIDE INSTALLATION', 1500.00, ['h', 'subvention_aide', 'Aide à l’installation (région)']],
    ['2026-09-30', 'FRAIS TENUE DE COMPTE', -4.50, null],
    ['2026-09-30', 'COTISATION CARTE PRO', -4.00, null],
    [j(-69), 'VIR SEPA LE BRIS MARIAGE', Number(pLeBris.amount), ['p', pLeBris]],
    ['2026-10-02', 'PRLV MAIRIE DE LANDERNEAU PLACE MARCHE', -120.00, ['c', cout('2026-10-02', 120)]],
    ['2026-10-06', 'VIR VERS LIVRET', -500.00, ['h', 'virement_interne', 'Épargne de précaution']],
    ['2026-10-15', 'CB COOP LANDERNEAU 14/10', -54.00, ['c', cout('2026-10-14', 54)]],
    ['2026-10-15', 'PRLV SEPA ASSURANCE RECOLTES', -38.90, null],
    ['2026-10-18', 'CB EMBALLAGES DE L OUEST', -42.80, null],
    [j(-28), 'REMISE CHEQUE 0004521', Number(pCheque.amount), null],
    ['2026-10-31', 'FRAIS TENUE DE COMPTE', -4.50, null],
    ['2026-10-31', 'FRAIS TENUE DE COMPTE', -4.50, null],
    ['2026-11-02', 'PRLV SEPA MSA COTISATIONS', -312.00, null],
    ['2026-11-04', 'CB STATION DU PORT 03/11', -34.00, ['c', cout('2026-11-03', 34)]],
    ['2026-11-06', 'VIR PERSONNEL NOLWENN K', 400.00, ['h', 'apport_personnel', 'Apport pour le tunnel']],
    [j(-9), 'VIR SEPA PF LEON', Number(pLeon.amount), null],
    ['2026-11-15', 'PRLV SEPA ASSURANCE RECOLTES', -38.90, null],
    ['2026-11-18', 'CB GRAINETERIE DES MONTS', -27.50, null],
    ['2026-11-19', 'PRLV FREE PRO TELEPHONE', -19.99, null],
    ['2026-11-20', 'CB EMBALLAGES DE L OUEST', -42.80, null],
  ]
  // Remises d'espèces des marchés (ventes de marché récentes)
  marches.forEach((s, i) => releve.push([ajouterJours(s.date, 2), `VERSEMENT ESPECES AGENCE LANDERNEAU ${i + 1}`, centimesEnEuros(encaisseVente(s as { total: number; total_ttc?: number | null })!), i < 2 ? ['c', { ...s, __vente: true }] : null]))
  releve.sort((a, b) => a[0].localeCompare(b[0]))

  const ID_IMPORT = uid('53000000', 1)
  const avecDates = releve.filter(r => r[0] <= jour)
  x.bank_imports.push({ id: ID_IMPORT, farm_id: F, account_id: ID_COMPTE, fichier: 'releve-compte-pro-sept-nov-2026.csv',
    nb_lignes: avecDates.length, nb_nouvelles: avecDates.length, nb_doublons: 0,
    date_min: avecDates[0]?.[0] ?? null, date_max: avecDates.at(-1)?.[0] ?? null, created_by: DEMO_USER_ID, created_at: cree(jour) })
  const rangs = new Map<string, number>()
  let n = 0
  for (const [date, label, euros, r] of avecDates) {
    const c = Math.round(euros * 100)
    const cle = `${date}|${c}|${normaliserLibelle(label)}`
    const rang = (rangs.get(cle) ?? 0) + 1
    rangs.set(cle, rang)
    const id = uid('54000000', ++n)
    x.bank_transactions.push({ id, farm_id: F, account_id: ID_COMPTE, import_id: ID_IMPORT, date, label, amount: centimesEnEuros(c),
      empreinte: `${cle}|${rang}`, created_by: DEMO_USER_ID, created_at: cree(jour) })
    if (!r) continue
    const m: Row = { id: uid('55000000', n), farm_id: F, transaction_id: id, amount: centimesEnEuros(c), cost_id: null, payment_id: null, sale_id: null,
      categorie: null, libelle: null, annule_le: null, annule_par: null, created_by: DEMO_USER_ID, created_at: cree(jour) }
    if (r[0] === 'c' && r[1].__vente) Object.assign(m, { kind: 'vente', sale_id: r[1].id })
    else if (r[0] === 'c') Object.assign(m, { kind: 'depense', cost_id: r[1].id })
    else if (r[0] === 'p') Object.assign(m, { kind: 'paiement', payment_id: r[1].id })
    else Object.assign(m, { kind: 'hors_facture', categorie: r[1], libelle: r[2] })
    x.bank_matches.push(m)
  }

  // ─── Caisse : saisies à la main ───
  const caisse: [string, string, number][] = [
    ['2026-09-26', 'Achat de monnaie', 50],
    ['2026-10-10', 'Fond de caisse rendu à la banque', -50],
    ['2026-11-14', 'Marché : vente de bouquets (espèces)', 64],
  ]
  caisse.forEach(([date, label, euros], i) => x.bank_transactions.push({
    id: uid('54100000', i + 1), farm_id: F, account_id: ID_CAISSE, import_id: null, date, label, amount: euros,
    empreinte: empreinte(date, Math.round(euros * 100), label, `saisie-demo-${i + 1}`), created_by: DEMO_USER_ID, created_at: cree(date),
  }))

  // ─── Justificatifs ───
  const justif = (k: number, r: Partial<Row>, lignes: string[]) => {
    const id = uid('56000000', k)
    x.receipts.push({ id, farm_id: F, date_piece: null, montant: null, fournisseur: null, notes: null, ocr_texte: null,
      cost_id: null, payment_id: null, sans_objet_le: null, created_by: DEMO_USER_ID, created_at: cree(r.date_piece ?? jour), updated_at: null, ...r })
    const path = cheminJustificatif(F, id, 1, 'image/jpeg')
    OBJETS_JUSTIFICATIFS_DEMO.set(path, ticketSvg(lignes, k % 2 ? -1.4 : 1.1))
    x.receipt_pages.push({ id: uid('57000000', k), receipt_id: id, farm_id: F, page: 1, path, mime: 'image/jpeg', taille: null,
      nom_origine: `ticket-${k}.jpg`, width: 560, height: 70 + lignes.length * 30 + 60, created_by: DEMO_USER_ID, created_at: cree(r.date_piece ?? jour) })
  }
  justif(1, { date_piece: '2026-10-14', montant: 54, fournisseur: 'Coopérative de Landerneau', cost_id: cout('2026-10-14', 54).id },
    ['COOPERATIVE DE LANDERNEAU', 'Magasin libre-service', '14/10/2026  11:02', 'PAILLE DE LIN 20KG  3 x 18,00', '', 'TOTAL TTC          54,00 EUR', 'CB                 54,00'])
  justif(2, { date_piece: '2026-11-03', montant: 34, fournisseur: 'Station du Port', cost_id: cout('2026-11-03', 34).id },
    ['STATION DU PORT', 'CARBURANT GAZOLE', '03.11.26  17:48', 'VOLUME 19,44 L', 'MONTANT', '34,00', 'MERCI'])
  justif(3, { date_piece: j(-28), montant: Number(pCheque.amount), fournisseur: 'Bordereau de remise de chèque', payment_id: pCheque.id },
    ['BORDEREAU DE REMISE', 'DE CHEQUES', `Date ${j(-28).split('-').reverse().join('/')}`, '1 cheque', 'Fleurs de Lin, Morlaix', 'TOTAL  150,00'])
  justif(4, { date_piece: '2026-11-18', montant: null, fournisseur: null, ocr_texte: null },
    ['GRAINETERIE DES MONTS', 'Semences pour fleurs coupees', 'Ticket 0118  le 18/11/2026', 'GRAINES COSMOS PURITY   9,50', 'GRAINES ZINNIA MIX     18,00', '', 'TOTAL TTC          27,50 EUR', 'CB                 27,50'])
  justif(5, { date_piece: '2026-11-20', montant: 42.8, fournisseur: 'Emballages de l’Ouest' },
    ['EMBALLAGES DE L OUEST', 'Facture FA-88412', 'Date : 20/11/2026', 'Papier kraft 70 cm  1 rouleau', 'Elastiques 500 g', '', 'NET A PAYER        42,80 EUR'])
  justif(6, { date_piece: '2026-11-08', montant: 6.4, fournisseur: 'Boulangerie', notes: 'Ticket personnel scanné par erreur', sans_objet_le: cree('2026-11-09') },
    ['BOULANGERIE DU PONT', '08/11/2026', 'BAGUETTE TRADITION  2 x 1,30', 'KOUIGN AMANN        3,80', 'TOTAL               6,40'])
}

// ─── Règles de la migration 012, en mémoire ───────────────────────

/** Policy « farm_id in my_farm_ids() » des tables 012. */
export function filtreFermeGestion(d: Record<string, Row[]>, table: string, me: string | null | undefined): Row[] {
  const fermes = new Set(d.farm_members.filter(m => m.user_id === me).map(m => m.farm_id))
  return d[table].filter(r => fermes.has(r.farm_id))
}

/** Triggers gestion_set_farm et gestion_immuable (insert/update). `old` = null à l'insertion. */
export function gestionAvantEcriture(d: Record<string, Row[]>, t: string, row: Row, old: Row | null, me: string | null): Erreur | null {
  if (!TABLES_GESTION.has(t)) return null
  const err = (message: string, code = 'P0001') => ({ code, message })
  const fermes = new Set(d.farm_members.filter(m => m.user_id === me).map(m => m.farm_id))
  row.created_by ??= me
  if (old) {
    if (t === 'bank_imports' || t === 'bank_transactions') return err(`permission denied for table ${t}`, '42501')
    if (t === 'bank_matches') {
      const autres = Object.keys(row).filter(k => !['annule_le', 'annule_par'].includes(k) && JSON.stringify(row[k]) !== JSON.stringify(old[k]))
      if (old.annule_le || !row.annule_le || autres.length) return err('Rapprochement figé : il ne peut qu’être défait')
      row.annule_par = me
      return null
    }
    if (row.farm_id !== old.farm_id) return err('La ferme ne change pas')
  }
  if (t === 'receipts') {
    if ([row.cost_id, row.payment_id, row.sans_objet_le].filter(Boolean).length > 1) return err('new row for relation "receipts" violates check constraint "receipts_check"', '23514')
    if (row.cost_id && !d.costs.some(c => c.id === row.cost_id && c.farm_id === row.farm_id)) return err(`Dépense ${row.cost_id} hors de la ferme`)
    if (row.payment_id && !d.payments.some(p => p.id === row.payment_id && p.farm_id === row.farm_id)) return err(`Paiement ${row.payment_id} hors de la ferme`)
    if (old) row.updated_at = new Date().toISOString()
  } else if (t === 'receipt_pages') {
    const r = d.receipts.find(x => x.id === row.receipt_id)
    if (!r) return err(`Justificatif ${row.receipt_id} introuvable`)
    row.farm_id = r.farm_id
    const p = String(row.path)
    if (!p.startsWith(`${r.farm_id}/${r.id}/`) || p.includes('..') || p.split('/').length !== 3) return err(`Chemin de justificatif invalide : ${p}`)
    if (d.receipt_pages.some(x => x !== old && x.receipt_id === row.receipt_id && x.page === row.page)) return err('duplicate key value violates unique constraint "receipt_pages_receipt_id_page_key"', '23505')
  } else if (t === 'bank_imports' || t === 'bank_transactions') {
    const a = d.bank_accounts.find(x => x.id === row.account_id)
    if (!a) return err(`Compte ${row.account_id} introuvable`)
    row.farm_id = a.farm_id
    if (t === 'bank_transactions') {
      const [jj, cts] = String(row.empreinte).split('|')
      if (jj !== row.date || cts !== String(eurosEnCentimes(row.amount))) return err('new row for relation "bank_transactions" violates check constraint "bank_transactions_check"', '23514')
      if (d.bank_transactions.some(x => x.account_id === row.account_id && x.empreinte === row.empreinte)) return err('duplicate key value violates unique constraint "bank_transactions_account_id_empreinte_key"', '23505')
    }
  } else if (t === 'bank_matches') {
    const tx = d.bank_transactions.find(x => x.id === row.transaction_id)
    if (!tx) return err(`Mouvement ${row.transaction_id} introuvable`)
    row.farm_id = tx.farm_id; row.annule_le = null; row.annule_par = null
    const m = eurosEnCentimes(row.amount), mt = eurosEnCentimes(tx.amount)
    if (Math.sign(m) !== Math.sign(mt)) return err('Le rapprochement doit être de même sens que le mouvement')
    const couvert = d.bank_matches.filter(x => x.transaction_id === tx.id && !x.annule_le).reduce((s, x) => s + Math.abs(eurosEnCentimes(x.amount)), 0)
    if (couvert + Math.abs(m) > Math.abs(mt)) return err(`Rapprochement supérieur au reste du mouvement (reste ${centimesEnEuros(Math.abs(mt) - couvert)} €)`)
    const actifSur = (k: string) => row[k] && d.bank_matches.some(x => !x.annule_le && x[k] === row[k])
    if (actifSur('cost_id') || actifSur('payment_id') || actifSur('sale_id')) return err('duplicate key value violates unique constraint (pièce déjà rapprochée)', '23505')
    let montant: number | null = null
    if (row.kind === 'depense') {
      const c = d.costs.find(x => x.id === row.cost_id && x.farm_id === tx.farm_id)
      if (!c) return err(`Dépense ${row.cost_id} hors de la ferme`)
      if (mt > 0) return err('Une dépense se rapproche d’un débit')
      montant = eurosEnCentimes(c.amount)
    } else if (row.kind === 'paiement') {
      const p = d.payments.find(x => x.id === row.payment_id && x.farm_id === tx.farm_id)
      if (!p) return err(`Paiement ${row.payment_id} hors de la ferme`)
      montant = eurosEnCentimes(p.amount)
      if (Math.sign(montant) !== Math.sign(mt)) return err('Paiement et mouvement de sens contraires')
    } else if (row.kind === 'vente') {
      const s = d.sales.find(x => x.id === row.sale_id && d.seasons.some(se => se.id === x.season_id && se.farm_id === tx.farm_id))
      if (!s) return err(`Vente ${row.sale_id} hors de la ferme`)
      if (mt < 0) return err('Une vente se rapproche d’un crédit')
      // 014 : comparé à l'encaissé TTC de la vente
      montant = encaisseVente(s as { total: number; total_ttc?: number | null })
      if (montant === null) return err(`Vente ${row.sale_id} : TVA non calculable (catégorie manquante), montant encaissé inconnu`)
    } else if (!row.categorie) {
      return err('new row for relation "bank_matches" violates check constraint "bank_matches_check"', '23514')
    }
    if (montant !== null && Math.abs(m) > Math.abs(montant)) return err('Rapprochement supérieur au montant de la pièce')
  }
  if (!fermes.has(row.farm_id)) return err(`new row violates row-level security policy for table "${t}"`, '42501')
  return null
}

/** Suppressions refusées par 012 (droits retirés et triggers). */
export function gestionAvantSuppression(d: Record<string, Row[]>, t: string, rows: Row[]): Erreur | null {
  if (['bank_imports', 'bank_transactions', 'bank_matches'].includes(t) && rows.length) return { code: '42501', message: `permission denied for table ${t}` }
  if (t === 'receipts' && rows.some(r => r.cost_id || r.payment_id)) return { code: 'P0001', message: 'Justificatif rattaché : le détacher avant de le supprimer' }
  if (t === 'bank_accounts' && rows.some(r => d.bank_transactions.some(x => x.account_id === r.id))) {
    return { code: '23503', message: 'Ce compte porte des mouvements (on delete restrict)' }
  }
  if (t === 'costs' || t === 'sales') {
    const col = t === 'costs' ? 'cost_id' : 'sale_id'
    if (rows.some(r => d.bank_matches.some(m => !m.annule_le && m[col] === r.id))) {
      return { code: 'P0001', message: `${t === 'costs' ? 'Dépense' : 'Vente'} rapprochée d’un mouvement bancaire : défaire le rapprochement d’abord` }
    }
  }
  return null
}

/** on delete set null / cascade de 012 après une suppression. */
export function gestionApresSuppression(d: Record<string, Row[]>, t: string, rows: Row[]): void {
  const ids = new Set(rows.map(r => r.id))
  if (t === 'costs') {
    for (const r of d.receipts ?? []) if (ids.has(r.cost_id)) r.cost_id = null
    for (const m of d.bank_matches ?? []) if (ids.has(m.cost_id)) m.cost_id = null
  }
  if (t === 'sales') for (const m of d.bank_matches ?? []) if (ids.has(m.sale_id)) m.sale_id = null
  if (t === 'receipts') d.receipt_pages = d.receipt_pages.filter(p => !ids.has(p.receipt_id))
}

/** RPC de 012 : importer_releve et creer_depense_liee. `q(table)` = requête démo (policies et triggers appliqués). */
export async function rpcGestionDemo(
  fn: string, args: Row, d: Record<string, Row[]>, me: string, q: (t: string) => any,
): Promise<{ data: any; error: Erreur | null } | undefined> {
  if (fn === 'importer_releve') {
    const compte = filtreFermeGestion(d, 'bank_accounts', me).find(a => a.id === args.p_account_id)
    if (!compte) return { data: null, error: { code: 'P0001', message: `Compte ${args.p_account_id} introuvable ou inaccessible` } }
    const lignes: Row[] = args.p_lignes ?? []
    if (!lignes.length) return { data: null, error: { code: 'P0001', message: 'Relevé vide' } }
    if (new Set(lignes.map(l => l.empreinte)).size !== lignes.length) return { data: null, error: { code: 'P0001', message: 'Empreintes en double dans le fichier : rangs mal calculés' } }
    const connues = new Set(d.bank_transactions.filter(x => x.account_id === compte.id).map(x => x.empreinte))
    const nouvelles = lignes.filter(l => !connues.has(l.empreinte))
    const dates = lignes.map(l => l.date).sort()
    const imp = await q('bank_imports').insert({ account_id: compte.id, farm_id: compte.farm_id, fichier: String(args.p_fichier || 'relevé.csv').slice(0, 255),
      nb_lignes: lignes.length, nb_nouvelles: nouvelles.length, nb_doublons: lignes.length - nouvelles.length, date_min: dates[0], date_max: dates.at(-1) }).select().single()
    if (imp.error) return imp
    if (nouvelles.length) {
      const r = await q('bank_transactions').insert(nouvelles.map(l => ({ account_id: compte.id, farm_id: compte.farm_id, import_id: imp.data.id,
        date: l.date, label: String(l.label).trim(), amount: l.amount, empreinte: l.empreinte })))
      if (r.error) { d.bank_imports = d.bank_imports.filter(x => x.id !== imp.data.id); return r }
    }
    if (args.p_mappage) compte.csv_mapping = args.p_mappage
    return { data: { import_id: imp.data.id, nouvelles: nouvelles.length, doublons: lignes.length - nouvelles.length }, error: null }
  }
  if (fn === 'creer_depense_liee') {
    const c = args.p_cost ?? {}
    const r = await q('costs').insert({ season_id: c.season_id, date: c.date, category: c.category, amount: c.amount,
      supplier: c.supplier?.trim() || null, notes: c.notes?.trim() || null, culture_id: c.culture_id || null, planche_id: c.planche_id || null }).select().single()
    if (r.error) return r
    const annuler = () => { d.costs = d.costs.filter(x => x.id !== r.data.id) }
    if (args.p_receipt_id) {
      const rec = d.receipts.find(x => x.id === args.p_receipt_id && !x.payment_id)
      if (!rec) { annuler(); return { data: null, error: { code: 'P0001', message: `Justificatif ${args.p_receipt_id} introuvable ou déjà rattaché à un paiement` } } }
      const u = await q('receipts').update({ cost_id: r.data.id, sans_objet_le: null }).eq('id', rec.id)
      if (u.error) { annuler(); return u }
    }
    if (args.p_transaction_id) {
      const tx = d.bank_transactions.find(x => x.id === args.p_transaction_id)
      if (!tx) { annuler(); return { data: null, error: { code: 'P0001', message: `Mouvement ${args.p_transaction_id} introuvable` } } }
      const m = await q('bank_matches').insert({ transaction_id: tx.id, farm_id: tx.farm_id, kind: 'depense', cost_id: r.data.id,
        amount: -centimesEnEuros(Math.min(eurosEnCentimes(c.amount), Math.abs(eurosEnCentimes(tx.amount)))) })
      if (m.error) {
        annuler()
        for (const rec of d.receipts) if (rec.cost_id === r.data.id) rec.cost_id = null
        return m
      }
    }
    return { data: r.data.id, error: null }
  }
  return undefined
}
