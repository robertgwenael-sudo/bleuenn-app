import { describe, expect, it } from 'vitest'
import {
  aEncaisser, appliquerMappage, avecEmpreintes, categorieSuggeree, cheminJustificatif, decoderReleve, dedoublonner,
  depensesSansJustificatif, detecterSeparateur, empreinte, exportDepenses, extraireDateOcr, extraireFournisseurOcr,
  extraireMontantOcr, lireCsv, lireDateReleve, lireMontantReleve, mappageCompatible, moisGlissants, montantsDansLigne,
  nomFichierJustificatif, normaliserLibelle, piecesRapprochees, propositions, proposerMappage, recettesEncaissees,
  caEtTvaParMois, ventesEncaisseNonCalculable,
  resteARapprocher, scoreRapprochement, soldeCompte, statutJustificatif, tresorerieParMois, ventesSansFacture,
  type Cible,
} from './gestion'
import { genererCsv } from './exports'

// ------------------------------------------------------------
// Relevés CSV (formats d'export courants des banques en ligne)
// ------------------------------------------------------------
const RELEVE_POINT_VIRGULE = [
  'Date;Libellé;Montant(EUROS)',
  '02/11/2026;CB GRAINETERIE DU LAC 31/10;-42,90',
  '03/11/2026;VIR ATELIER PETALE FACT F2026-0003;435,00',
  '05/11/2026;PRLV SEPA ASSURANCE RECOLTES;-1 234,56',
  '05/11/2026;FRAIS TENUE DE COMPTE;-3,00',
  '05/11/2026;FRAIS TENUE DE COMPTE;-3,00',
].join('\r\n')

// Préambule, débit et crédit séparés, débit en positif, point-virgule final
const RELEVE_DEBIT_CREDIT = [
  'Compte courant n° 00012345678',
  'Période du 01/10/2026 au 31/10/2026',
  '',
  'Date opération;Date valeur;Libellé;Débit;Crédit;',
  '06/10/2026;07/10/2026;"CB JARDINERIE, ROUTE DE QUIMPER";58,20;;',
  '10/10/2026;10/10/2026;REMISE CHEQUES 2 CHQ;;180,00;',
  '12/10/2026;12/10/2026;COTISATION CARTE;4,50;;',
  'Solde au 31/10/2026;;;;1 523,30;',
].join('\n')

// Virgule, guillemets, point décimal, dates ISO
const RELEVE_VIRGULE = [
  '"Date","Description","Amount","Currency"',
  '"2026-10-02","Card payment - Kraft & Co","-18.40","EUR"',
  '"2026-10-09","Transfer from ""Mairie""","1,250.00","EUR"',
  '"2026-10-11","Top-up","50","EUR"',
].join('\n')

describe('lecture du relevé', () => {
  it('décode l’UTF-8 et repli Windows-1252', () => {
    const latin1 = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74])  // « Débit » en Windows-1252
    expect(decoderReleve(latin1)).toEqual({ texte: 'Débit', encodage: 'windows-1252' })
    const utf8 = new TextEncoder().encode('﻿Crédit')
    expect(decoderReleve(utf8)).toEqual({ texte: 'Crédit', encodage: 'utf-8' })
  })

  it('découpe un CSV avec guillemets, séparateur et guillemets doublés dans un champ', () => {
    expect(lireCsv('a;"b;c";"d ""e"""\r\n1;2;3', ';')).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']])
    expect(lireCsv('x,"multi\nligne",z', ',')).toEqual([['x', 'multi\nligne', 'z']])
  })

  it('détecte le séparateur', () => {
    expect(detecterSeparateur(RELEVE_POINT_VIRGULE)).toBe(';')
    expect(detecterSeparateur(RELEVE_DEBIT_CREDIT)).toBe(';')
    expect(detecterSeparateur(RELEVE_VIRGULE)).toBe(',')
    expect(detecterSeparateur('Date\tLibellé\tMontant\n01/10/2026\tX\t-1,00')).toBe('\t')
  })

  it('lit les montants en centimes, sans flottant', () => {
    expect(lireMontantReleve('-42,90', ',')).toBe(-4290)
    expect(lireMontantReleve('1 234,56', ',')).toBe(123456)
    expect(lireMontantReleve('1 234,56 €', ',')).toBe(123456)
    expect(lireMontantReleve('1.234,56', ',')).toBe(123456)
    expect(lireMontantReleve('+12,5', ',')).toBe(1250)
    expect(lireMontantReleve('(12,50)', ',')).toBe(-1250)
    expect(lireMontantReleve('12,50-', ',')).toBe(-1250)
    expect(lireMontantReleve('0,1', ',')).toBe(10)
    expect(lireMontantReleve('1,250.00', '.')).toBe(125000)
    expect(lireMontantReleve('-18.40', '.')).toBe(-1840)
    expect(lireMontantReleve('12.50', ',')).toBe(1250)        // point décimal dans un relevé « à virgule »
    expect(lireMontantReleve('1.234', ',')).toBe(123400)      // point de milliers
    expect(lireMontantReleve('', ',')).toBeNull()
    expect(() => lireMontantReleve('douze', ',')).toThrow(/illisible/)
    expect(() => lireMontantReleve('12,5,0', ',')).toThrow(/illisible/)
  })

  it('lit les dates selon le format, refuse les dates impossibles', () => {
    expect(lireDateReleve('02/11/2026', 'JJ/MM/AAAA')).toBe('2026-11-02')
    expect(lireDateReleve('2.11.2026', 'JJ/MM/AAAA')).toBe('2026-11-02')
    expect(lireDateReleve('02/11/26', 'JJ/MM/AA')).toBe('2026-11-02')
    expect(lireDateReleve('2026-11-02T00:00:00', 'AAAA-MM-JJ')).toBe('2026-11-02')
    expect(lireDateReleve('31/02/2026', 'JJ/MM/AAAA')).toBeNull()
    expect(lireDateReleve('Solde', 'JJ/MM/AAAA')).toBeNull()
  })
})

describe('mappage des colonnes', () => {
  it('relevé « Date ; Libellé ; Montant » : proposition et lecture', () => {
    const { mappage, lignes } = proposerMappage(RELEVE_POINT_VIRGULE)
    expect(mappage).toMatchObject({ separateur: ';', ligneEntete: 0, date: 0, libelle: [1], montant: { mode: 'unique', colonne: 2 }, formatDate: 'JJ/MM/AAAA', decimale: ',' })
    const { mouvements, rejets } = appliquerMappage(lignes, mappage)
    expect(rejets).toEqual([])
    expect(mouvements.map(m => [m.date, m.montant])).toEqual([
      ['2026-11-02', -4290], ['2026-11-03', 43500], ['2026-11-05', -123456], ['2026-11-05', -300], ['2026-11-05', -300],
    ])
  })

  it('relevé à préambule, débit et crédit séparés : la ligne de solde est rejetée avec sa raison', () => {
    const { mappage, lignes } = proposerMappage(RELEVE_DEBIT_CREDIT)
    expect(mappage.ligneEntete).toBe(2)  // lignes vides retirées
    expect(mappage).toMatchObject({ date: 0, libelle: [2], montant: { mode: 'debit_credit', debit: 3, credit: 4 } })
    const { mouvements, rejets } = appliquerMappage(lignes, mappage)
    expect(mouvements.map(m => [m.date, m.libelle, m.montant])).toEqual([
      ['2026-10-06', 'CB JARDINERIE, ROUTE DE QUIMPER', -5820],
      ['2026-10-10', 'REMISE CHEQUES 2 CHQ', 18000],
      ['2026-10-12', 'COTISATION CARTE', -450],
    ])
    expect(rejets).toHaveLength(1)
    expect(rejets[0].raison).toMatch(/date illisible/)
  })

  it('relevé à virgule, guillemets et point décimal', () => {
    const { mappage, lignes } = proposerMappage(RELEVE_VIRGULE)
    expect(mappage).toMatchObject({ separateur: ',', formatDate: 'AAAA-MM-JJ', decimale: '.', montant: { mode: 'unique', colonne: 2 }, libelle: [1] })
    const { mouvements } = appliquerMappage(lignes, mappage)
    expect(mouvements.map(m => m.montant)).toEqual([-1840, 125000, 5000])
    expect(mouvements[1].libelle).toBe('Transfer from "Mairie"')
  })

  it('débit déjà négatif dans sa colonne, ligne à débit et crédit refusée', () => {
    const t = 'Date;Libellé;Débit;Crédit\n01/10/2026;A;-12,50;\n02/10/2026;B;3,00;4,00\n03/10/2026;C;;'
    const { mappage, lignes } = proposerMappage(t)
    const r = appliquerMappage(lignes, mappage)
    expect(r.mouvements.map(m => m.montant)).toEqual([-1250])
    expect(r.rejets.map(x => x.raison)).toEqual(['débit et crédit remplis sur la même ligne', 'montant vide'])
  })

  it('mappage mémorisé : réutilisé si les en-têtes sont les mêmes', () => {
    const { mappage, lignes } = proposerMappage(RELEVE_POINT_VIRGULE)
    expect(mappageCompatible(mappage, lignes)).toBe(true)
    expect(mappageCompatible(mappage, lireCsv('Date;Libelle;Montant(EUROS)', ';'))).toBe(true)  // accents ignorés
    expect(mappageCompatible(mappage, lireCsv('Date;Montant;Libellé', ';'))).toBe(false)
    expect(mappageCompatible({ version: 2 }, lignes)).toBe(false)
    expect(mappageCompatible(JSON.parse(JSON.stringify(mappage)), lignes)).toBe(true)  // relu depuis jsonb
  })
})

describe('empreinte et dédoublonnage', () => {
  it('normalise le libellé et numérote les lignes identiques', () => {
    expect(normaliserLibelle('  CB  Graineterie DU LAC | 31 ')).toBe('cb graineterie du lac / 31')
    expect(empreinte('2026-11-05', -300, 'FRAIS', 2)).toBe('2026-11-05|-300|frais|2')
    const { mappage, lignes } = proposerMappage(RELEVE_POINT_VIRGULE)
    const e = avecEmpreintes(appliquerMappage(lignes, mappage).mouvements)
    expect(e.slice(3).map(m => m.empreinte)).toEqual(['2026-11-05|-300|frais tenue de compte|1', '2026-11-05|-300|frais tenue de compte|2'])
  })

  it('un réimport chevauchant ne garde que les nouvelles lignes', () => {
    const a = avecEmpreintes(appliquerMappage(...(() => { const p = proposerMappage(RELEVE_POINT_VIRGULE); return [p.lignes, p.mappage] as const })()).mouvements)
    const second = RELEVE_POINT_VIRGULE + '\r\n06/11/2026;CB STATION;-61,02\r\n06/11/2026;FRAIS TENUE DE COMPTE;-3,00'
    const p2 = proposerMappage(second)
    const b = avecEmpreintes(appliquerMappage(p2.lignes, p2.mappage).mouvements)
    const r = dedoublonner(b, a.map(m => m.empreinte))
    expect(r.doublons).toHaveLength(5)
    expect(r.nouveaux.map(m => m.libelle)).toEqual(['CB STATION', 'FRAIS TENUE DE COMPTE'])
  })
})

// ------------------------------------------------------------
// Rapprochement
// ------------------------------------------------------------
describe('rapprochement', () => {
  const cibles: Cible[] = [
    { type: 'paiement', id: 'p1', date: '2026-11-01', montant: 43500, libelle: 'F2026-0003 Atelier Pétale' },
    { type: 'vente', id: 'v1', date: '2026-11-03', montant: 43500, libelle: 'Marché' },
    { type: 'vente', id: 'v2', date: '2026-10-20', montant: 43500, libelle: 'Marché' },
    { type: 'depense', id: 'c1', date: '2026-10-31', montant: -4290, libelle: 'Graineterie du Lac' },
    { type: 'depense', id: 'c2', date: '2026-09-01', montant: -4290, libelle: 'Autre' },
  ]

  it('même montant, même sens, dans la fenêtre ; bonus si le libellé concorde', () => {
    const mvt = { date: '2026-11-03', reste: 43500, label: 'VIR ATELIER PETALE FACT F2026-0003' }
    expect(scoreRapprochement(mvt, cibles[0])).toBe(100 - 12 + 15)
    expect(scoreRapprochement(mvt, cibles[1])).toBe(100)
    expect(scoreRapprochement(mvt, cibles[2])).toBeNull()                        // 14 jours
    expect(scoreRapprochement({ ...mvt, reste: 43400 }, cibles[0])).toBeNull()   // montant différent
    expect(scoreRapprochement(mvt, cibles[3])).toBeNull()                        // sens contraire
    expect(propositions(mvt, cibles, new Set()).map(p => p.cible.id)).toEqual(['p1', 'v1'])
    expect(propositions(mvt, cibles, new Set(['paiement:p1'])).map(p => p.cible.id)).toEqual(['v1'])
  })

  it('débit ↔ dépense jusqu’à 30 jours', () => {
    const mvt = { date: '2026-11-02', reste: -4290, label: 'CB GRAINETERIE DU LAC 31/10' }
    expect(propositions(mvt, cibles, new Set()).map(p => p.cible.id)).toEqual(['c1'])
  })

  it('reste à rapprocher et pièces prises ignorent les liens défaits', () => {
    const liens = [
      { transaction_id: 't', kind: 'paiement' as const, cost_id: null, payment_id: 'p1', sale_id: null, amount: '300.00', annule_le: null },
      { transaction_id: 't', kind: 'vente' as const, cost_id: null, payment_id: null, sale_id: 'v1', amount: 135, annule_le: '2026-11-04T10:00:00Z' },
    ]
    expect(resteARapprocher(43500, liens)).toBe(13500)
    expect([...piecesRapprochees(liens)]).toEqual(['paiement:p1'])
  })
})

// ------------------------------------------------------------
// Tableau de bord
// ------------------------------------------------------------
describe('trésorerie et soldes', () => {
  it('12 mois glissants jusqu’au mois en cours', () => {
    const m = moisGlissants('2026-11-22')
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2025-12')
    expect(m[11]).toBe('2026-11')
  })

  it('recettes : paiements, ventes sans facture, hors facture de type recette seulement', () => {
    const facturees = new Map([['v-fact', 'f1']])
    const ventes = ventesSansFacture([
      { id: 'v-fact', date: '2026-10-01', total: 100, channel: 'Fleuriste', client: 'A' },
      { id: 'v-marche', date: '2026-10-03', total: '45.50', channel: 'Marché', client: null },
    ], facturees)
    const r = recettesEncaissees({
      paiements: [{ id: 'p1', date: '2026-10-20', amount: '50.00', mode: 'virement', reference: null, numero: 'F2026-0001', client: 'A' },
        { id: 'p2', date: '2026-10-21', amount: -10, mode: 'virement', reference: 'contre-passation', numero: 'F2026-0001', client: 'A' }],
      ventes,
      horsFacture: [
        { id: 'h1', date: '2026-11-02', amount: 1250, categorie: 'subvention_aide', libelle: 'Aide région', label: 'VIR REGION' },
        { id: 'h2', date: '2026-11-03', amount: 500, categorie: 'apport_personnel', libelle: null, label: 'VIR PERSO' },
      ],
    })
    expect(r.map(x => [x.source, x.montant])).toEqual([['vente', 4550], ['paiement', 5000], ['paiement', -1000], ['hors_facture', 125000]])
    const t = tresorerieParMois(r, [{ date: '2026-10-05', montant: 4290 }, { date: '2024-01-01', montant: 999 }], moisGlissants('2026-11-22'))
    expect(t.find(l => l.mois === '2026-10')).toEqual({ mois: '2026-10', encaisse: 8550, depense: 4290, resultat: 4260 })
    expect(t.find(l => l.mois === '2026-11')).toEqual({ mois: '2026-11', encaisse: 125000, depense: 0, resultat: 125000 })
  })

  it('vente sans facture : encaissé = TTC (014) ; TVA non calculable signalée, jamais 0 €', () => {
    const ventes = [
      { id: 'a', date: '2026-10-03', total: '65.00', total_tva: '11.50', total_ttc: '76.50', channel: 'Marché', client: null },
      { id: 'b', date: '2026-10-04', total: 10, total_tva: null, total_ttc: null, channel: 'Marché', client: null },
      { id: 'c', date: '2026-10-05', total: 20, total_tva: 0, total_ttc: 20, channel: 'Marché', client: null },
    ]
    const r = recettesEncaissees({ paiements: [], ventes, horsFacture: [] })
    expect(r.map(x => [x.id, x.montant])).toEqual([['a', 7650], ['c', 2000]])
    expect(ventesEncaisseNonCalculable(ventes).map(v => v.id)).toEqual(['b'])
    const ca = caEtTvaParMois(ventes, ['2026-10', '2026-11'])
    expect(ca.lignes[0]).toEqual({ mois: '2026-10', ht: 9500, tva: 1150 })
    expect(ca.total).toEqual({ ht: 9500, tva: 1150 })
    expect(ca.tvaNonCalculables).toBe(1)
  })

  it('solde : non calculable sans solde initial, jamais 0 €', () => {
    const mvts = [{ date: '2026-09-30', amount: -100 }, { date: '2026-10-01', amount: '-42.90' }, { date: '2026-10-02', amount: 435 }]
    expect(soldeCompte({ solde_initial: null, date_solde_initial: null }, mvts)).toEqual({ valeur: null, raison: 'Solde initial non saisi' })
    expect(soldeCompte({ solde_initial: '1500.00', date_solde_initial: '2026-10-01' }, mvts)).toEqual({ valeur: 150000 - 4290 + 43500, raison: null })
    expect(soldeCompte({ solde_initial: 0, date_solde_initial: null }, mvts)).toEqual({ valeur: -10000 - 4290 + 43500, raison: null })
  })

  it('à encaisser : factures non soldées, retards', () => {
    const r = aEncaisser([
      { kind: 'facture', statut: 'a_payer', reste_du: '120.00', jours_de_retard: null },
      { kind: 'facture', statut: 'en_retard', reste_du: 80, jours_de_retard: 12 },
      { kind: 'facture', statut: 'en_retard', reste_du: '20.5', jours_de_retard: 40 },
      { kind: 'facture', statut: 'payee', reste_du: 0, jours_de_retard: null },
      { kind: 'avoir', statut: 'avoir', reste_du: 0, jours_de_retard: null },
      { kind: 'facture', statut: 'annulee', reste_du: -30, jours_de_retard: null },
    ])
    expect(r).toEqual({ total: 22050, nb: 3, enRetard: 10050, nbRetard: 2, plusAncienRetard: 40 })
  })

  it('justificatifs : statut et dépenses sans justificatif', () => {
    expect(statutJustificatif({ cost_id: null, payment_id: null, sans_objet_le: null })).toBe('a_traiter')
    expect(statutJustificatif({ cost_id: 'c', payment_id: null, sans_objet_le: null })).toBe('depense')
    expect(statutJustificatif({ cost_id: null, payment_id: null, sans_objet_le: '2026-11-01' })).toBe('sans_objet')
    expect(depensesSansJustificatif([{ id: 'a' }, { id: 'b' }], [{ cost_id: 'a' }, { cost_id: null }]).map(c => c.id)).toEqual(['b'])
  })
})

// ------------------------------------------------------------
// OCR (textes tels que rendus par la lecture automatique)
// ------------------------------------------------------------
const TICKET_JARDINERIE = `JARDINERIE DES QUATRE VENTS
ZA de Kerlann - 29000 QUIMPER
Tel 02 98 00 00 00
Ticket 0042 Caisse 2 le 14/11/2026 10:32
TERREAU HORTICOLE 70L   2 x 12,90   25,80
SECATEUR BYPASS              24,90
SOUS-TOTAL                   50,70
REMISE FIDELITE              -2,00
TOTAL TTC                    48,70 EUR
dont TVA 20%                  8,12
CB                           48,70
Merci de votre visite`

const FACTURE_FOURNISSEUR = `Graineterie du Lac
12 rue des Semeurs 56000 Vannes
SIRET 123 456 789 00012
FACTURE N° FA-2026-1187
Date de facture : 3 novembre 2026
Echéance : 03/12/2026
Désignation            Qté   PU HT    Total HT
Graines Zinnia Benary    4    3,50     14,00
Bulbes Renoncule       100    0,42     42,00
Total HT                               56,00
TVA 5,5 %                               3,08
Total TTC                              59,08
Net à payer                            59,08 €`

const TICKET_STATION = `STATION DU PORT
CARBURANT GAZOLE
22.11.26  08:14
VOLUME 38,52 L
PRIX/L 1,749
MONTANT
67,37
MERCI`

const FACTURE_MILLIERS = `Serres et Tunnels de l'Ouest
Facture du 02/10/2026
Tunnel 8 x 30 m      1 OO0,00
Total ......... 1 250,00 €`

describe('lecture automatique (suggestions)', () => {
  it('montants d’une ligne, sans confondre une date ou une heure', () => {
    expect(montantsDansLigne('2 x 12,90   25,80')).toEqual([1290, 2580])
    expect(montantsDansLigne('le 12.10.2026 à 10:32')).toEqual([])
    expect(montantsDansLigne('Total 1 250,00 €')).toEqual([125000])
    expect(montantsDansLigne('Tunnel 1 OO0,00')).toEqual([100000])
  })

  it('ticket de jardinerie : total TTC, pas le sous-total ni la TVA', () => {
    expect(extraireMontantOcr(TICKET_JARDINERIE)).toMatchObject({ centimes: 4870, confiance: 'mot-cle' })
    expect(extraireDateOcr(TICKET_JARDINERIE, '2026-11-22')).toBe('2026-11-14')
    expect(extraireFournisseurOcr(TICKET_JARDINERIE)).toBe('JARDINERIE DES QUATRE VENTS')
    expect(categorieSuggeree(TICKET_JARDINERIE)).toBe('terreau_substrat')
  })

  it('facture fournisseur : net à payer, date en toutes lettres, pas l’échéance', () => {
    expect(extraireMontantOcr(FACTURE_FOURNISSEUR)?.centimes).toBe(5908)
    expect(extraireDateOcr(FACTURE_FOURNISSEUR, '2026-11-22')).toBe('2026-11-03')
    expect(extraireFournisseurOcr(FACTURE_FOURNISSEUR)).toBe('Graineterie du Lac')
    expect(categorieSuggeree(FACTURE_FOURNISSEUR)).toBe('semences')
  })

  it('ticket de station : montant sur la ligne suivant le mot-clé, date à deux chiffres', () => {
    expect(extraireMontantOcr(TICKET_STATION)?.centimes).toBe(6737)
    expect(extraireDateOcr(TICKET_STATION, '2026-11-22')).toBe('2026-11-22')
    expect(categorieSuggeree(TICKET_STATION)).toBe('transport')
  })

  it('milliers séparés par une espace, confusions O/0 de l’OCR', () => {
    expect(extraireMontantOcr(FACTURE_MILLIERS)?.centimes).toBe(125000)
    expect(extraireDateOcr(FACTURE_MILLIERS, '2026-11-22')).toBe('2026-10-02')
  })

  it('sans mot-clé : le plus grand montant, confiance faible ; rien lu : null', () => {
    expect(extraireMontantOcr('Bouquet 12,00\nVase 30,00')).toEqual({ centimes: 3000, ligne: 'Vase 30,00', confiance: 'plus-grand' })
    expect(extraireMontantOcr('illisible')).toBeNull()
    expect(extraireDateOcr('Date 01/01/2030', '2026-11-22')).toBeNull()   // date future écartée
  })
})

// ------------------------------------------------------------
// Chemins et exports
// ------------------------------------------------------------
describe('fichiers et exports', () => {
  const farm = '30000000-0000-4000-8000-000000000001'
  const rec = 'a1b2c3d4-0000-4000-8000-000000000001'
  it('chemin Storage à deux niveaux de dossier', () => {
    expect(cheminJustificatif(farm, rec, 2, 'image/jpeg')).toBe(`${farm}/${rec}/2.jpg`)
    expect(cheminJustificatif(farm, rec, 1, 'application/pdf')).toBe(`${farm}/${rec}/1.pdf`)
    expect(() => cheminJustificatif('../x', rec, 1, 'image/jpeg')).toThrow()
  })

  it('nom de fichier lisible pour le comptable', () => {
    expect(nomFichierJustificatif({ id: rec, date_piece: '2026-11-03', fournisseur: 'Graineterie du Lac', montant: '59.08', created_at: '2026-11-04T08:00:00Z' },
      { page: 1, mime: 'image/jpeg' })).toBe('2026-11-03_graineterie-du-lac_59-08_00000001_p1.jpg')
    expect(nomFichierJustificatif({ id: rec, date_piece: null, fournisseur: null, montant: null, created_at: '2026-11-04T08:00:00Z' },
      { page: 2, mime: 'application/pdf' })).toBe('2026-11-04_sans-fournisseur_sans-montant_00000001_p2.pdf')
  })

  it('CSV des dépenses : justificatif manquant signalé', () => {
    const t = exportDepenses(
      [{ id: 'c1', date: '2026-11-03', category: 'semences', amount: '59.08', supplier: 'Graineterie du Lac', notes: null },
        { id: 'c2', date: '2026-11-05', category: 'autre', amount: 3, supplier: '=FRAIS', notes: null }],
      c => (c.id === 'c1' ? ['a.jpg', 'b.pdf'] : []),
      c => (c.id === 'c1' ? { date: '2026-11-05', compte: 'Compte courant' } : null))
    const csv = genererCsv(t)
    expect(csv).toContain('03/11/2026;Semences;Graineterie du Lac;;59,08;a.jpg + b.pdf;05/11/2026;Compte courant')
    expect(csv).toContain("05/11/2026;Autre;'=FRAIS;;3,00;MANQUANT;;")
  })
})

// Sorties RÉELLES de tesseract.js 7 (fra, best_int) sur des photos de tickets générées
// (papier tourné, flou, bruit) : scratchpad gestion/ocr.
const OCR_REEL: Record<string, string> = {
  "jardinerie": "JARDINERIE DES QUATRE VENTS\nZA de Kerlann 29000 QUIMPER\n\nTel 02 98 00 06 00\n\nTicket 0042 Caisse 2\n\nle 14/11/2026 10:32\n\nTERREAU 70L 2 x 12,90 25,80\nSECATEUR BYPASS 24,90\nSOUS - TOTAL 50,70\nREMISE FIDELITE -2,00\nTOTAL TTC 48,70 EUR\ndont TVA 20% 8,12\ncB 48,70\nMerci de votre visite\n",
  "graineterie": "Graineterie du Lac\n\n12 rue des Semeurs 56000 Vannes\nSIRET 123 456 789 00612\n\nFACTURE N FA-2026-1187\n\nDate de facture : 3 novembre 2026\nEcheance : 03/12/2026\n\nGraines Zinnia 4 3,50 14,00\nBulbes Renoncule 100 6,42 42,00\nTotal HT 56,00\nTVA 5,5 % 3,08\nTotal TTC 59,08\nNet a payer 59,08 EUR\n",
  "station": "STATION DU PORT\nCARBURANT GAZOLE\n22.11.26 08:14\nVOLUME 38,52 L\nPRIX/L 1,749\nMONTANT\n\n67,37\n\nMERCI\n"
}

describe('lecture automatique sur sorties réelles de l’OCR', () => {
  it('jardinerie, graineterie, station', () => {
    const s = (k: string) => [extraireMontantOcr(OCR_REEL[k])?.centimes, extraireDateOcr(OCR_REEL[k], '2026-11-22'), extraireFournisseurOcr(OCR_REEL[k])]
    expect(s('jardinerie')).toEqual([4870, '2026-11-14', 'JARDINERIE DES QUATRE VENTS'])
    expect(s('graineterie')).toEqual([5908, '2026-11-03', 'Graineterie du Lac'])
    expect(s('station')).toEqual([6737, '2026-11-22', 'STATION DU PORT'])
  })
})
