import { describe, expect, it } from 'vitest'
import {
  controlerPaiement, controlerSelection, controlerSerie, correspondFiltre, dateEcheance, estClientProfessionnel,
  formatNumero, formatSiret, grouperAFacturer, lignesAFacturer, montantPaye, nettoyerSiret, paiementsContrepassables,
  reglagesManquants, situationFacture, siretBienForme, syntheseFactures, totalFacture, ventesFacturees,
  type VenteFacturable,
} from './factures'
import { totalVente } from './ventes'
import type { FarmBilling } from './types'

const reglages: Partial<FarmBilling> = {
  raison_sociale: 'Les Jardins de Bleuenn', adresse: '12 chemin du Moulin', siret: '12345678900011',
  mention_tva: 'Mention saisie par la productrice',
}

describe('numéro', () => {
  it('met en forme préfixe, année et rang', () => {
    expect(formatNumero('F', 2026, 7)).toBe('F2026-0007')
    expect(formatNumero('AV', 2026, 12345)).toBe('AV2026-12345')
  })
  it('refuse un rang ou un préfixe invalide', () => {
    expect(() => formatNumero('F', 2026, 0)).toThrow()
    expect(() => formatNumero('F/', 2026, 1)).toThrow()
    expect(() => formatNumero('F', 2026, 1.5)).toThrow()
  })
  it('détecte trous et doublons d’une série', () => {
    expect(controlerSerie([1, 2, 3])).toEqual({ manquants: [], doublons: [] })
    expect(controlerSerie([3, 1, 4, 4])).toEqual({ manquants: [2], doublons: [4] })
    expect(controlerSerie([])).toEqual({ manquants: [], doublons: [] })
  })
})

describe('réglages obligatoires', () => {
  it('liste tout ce qui manque sur des réglages vides', () => {
    expect(reglagesManquants(null).map(m => m.champ)).toEqual(['raison_sociale', 'adresse', 'siret', 'mention_tva'])
  })
  it('n’exige pénalités et indemnité que pour un professionnel', () => {
    expect(reglagesManquants(reglages)).toEqual([])
    expect(reglagesManquants(reglages, { professionnel: true }).map(m => m.champ)).toEqual(['penalites_retard', 'indemnite_recouvrement'])
    expect(reglagesManquants({ ...reglages, penalites_retard: 'x', indemnite_recouvrement: 'y' }, { professionnel: true })).toEqual([])
  })
  it('un champ blanc ou un SIRET mal formé compte comme manquant', () => {
    expect(reglagesManquants({ ...reglages, mention_tva: '   ' }).map(m => m.champ)).toEqual(['mention_tva'])
    expect(reglagesManquants({ ...reglages, siret: '1234' }).map(m => m.champ)).toEqual(['siret'])
  })
  it('SIREN / SIRET', () => {
    expect(nettoyerSiret('123 456 789 00011')).toBe('12345678900011')
    expect(siretBienForme('123456789')).toBe(true)
    expect(siretBienForme('12345678900011')).toBe(true)
    expect(siretBienForme('1234567890')).toBe(false)
    expect(formatSiret('12345678900011')).toBe('123 456 789 00011')
    expect(formatSiret('123456789')).toBe('123 456 789')
  })
  it('client professionnel par défaut selon son type', () => {
    expect(estClientProfessionnel('fleuriste')).toBe(true)
    expect(estClientProfessionnel('particulier')).toBe(false)
    expect(estClientProfessionnel(null)).toBe(false)
  })
})

describe('situation d’une facture', () => {
  const f = { kind: 'facture' as const, total: '67.50', annulee_par: null, date_echeance: '2026-11-30' }
  it('à payer, partielle, payée', () => {
    expect(situationFacture(f, [], '2026-11-22')).toMatchObject({ total: 6750, paye: 0, reste: 6750, statut: 'a_payer' })
    expect(situationFacture(f, [{ amount: 20 }, { amount: '10.50' }], '2026-11-22')).toMatchObject({ paye: 3050, reste: 3700, statut: 'partielle' })
    expect(situationFacture(f, [{ amount: 67.5 }], '2026-12-31')).toMatchObject({ reste: 0, statut: 'payee' })
  })
  it('en retard le lendemain de l’échéance, pas le jour même', () => {
    expect(situationFacture(f, [], '2026-11-30').statut).toBe('a_payer')
    expect(situationFacture(f, [{ amount: 1 }], '2026-12-03')).toMatchObject({ statut: 'en_retard', joursRetard: 3, reste: 6650 })
  })
  it('annulée par avoir : reste négatif = trop-perçu à rembourser', () => {
    expect(situationFacture({ ...f, annulee_par: 'av' }, [{ amount: 20 }], '2026-12-31')).toMatchObject({ statut: 'annulee', reste: -2000 })
  })
  it('un avoir n’a pas de reste dû', () => {
    expect(situationFacture({ ...f, kind: 'avoir', total: '-67.50', date_echeance: null }, [], '2026-12-31'))
      .toMatchObject({ statut: 'avoir', total: -6750, reste: 0 })
  })
  it('une contre-passation annule le paiement', () => {
    expect(montantPaye([{ amount: 20 }, { amount: -20 }, { amount: '0.10' }])).toBe(10)
  })
  it('échéance : émission + délai, à réception par défaut', () => {
    expect(dateEcheance('2026-11-22', 30)).toBe('2026-12-22')
    expect(dateEcheance('2026-11-22', null)).toBe('2026-11-22')
    expect(() => dateEcheance('2026-11-22', -1)).toThrow()
  })
  it('total des lignes en centimes, sans flottant', () => {
    expect(totalFacture([{ line_total: '0.10' }, { line_total: 0.2 }])).toBe(30)
    expect(totalFacture([{ line_total: '-37.50' }, { line_total: '-30.00' }])).toBe(-6750)
  })
})

describe('contrôle d’un paiement (miroir du trigger)', () => {
  const f = { kind: 'facture' as const, total: '50.00', annulee_par: null, numero: 'F2026-0001' }
  const p1 = { id: 'p1', amount: 20, contrepasse_de: null }
  it('accepte un encaissement dans le reste dû', () => {
    expect(controlerPaiement(f, [p1], { montant: 3000 })).toBeNull()
  })
  it('refuse un dépassement, un montant nul, un avoir', () => {
    expect(controlerPaiement(f, [p1], { montant: 3001 })).toMatch(/dépasse le reste dû/)
    expect(controlerPaiement(f, [], { montant: 0 })).toMatch(/invalide/)
    expect(controlerPaiement({ ...f, kind: 'avoir' }, [], { montant: 100 })).toMatch(/avoir/)
  })
  it('contre-passation : exacte et unique', () => {
    expect(controlerPaiement(f, [p1], { montant: -2000, contrepasse_de: 'p1' })).toBeNull()
    expect(controlerPaiement(f, [p1], { montant: -1900, contrepasse_de: 'p1' })).toMatch(/exactement/)
    expect(controlerPaiement(f, [p1, { id: 'p2', amount: -20, contrepasse_de: 'p1' }], { montant: -2000, contrepasse_de: 'p1' })).toMatch(/déjà contre-passé/)
    expect(controlerPaiement(f, [p1], { montant: -500 })).toMatch(/contre-passe un paiement précis/)
  })
  it('facture annulée : pas d’encaissement, remboursement expliqué et borné', () => {
    const a = { ...f, annulee_par: 'av' }
    expect(controlerPaiement(a, [p1], { montant: 100 })).toMatch(/annulée/)
    expect(controlerPaiement(a, [p1], { montant: -2000 })).toMatch(/expliqué/)
    expect(controlerPaiement(a, [p1], { montant: -2000, notes: 'remboursé' })).toBeNull()
    expect(controlerPaiement(a, [p1], { montant: -2001, notes: 'remboursé' })).toMatch(/dépasse/)
  })
  it('liste les paiements encore contre-passables', () => {
    const ps = [p1, { id: 'p2', amount: 5, contrepasse_de: null }, { id: 'p3', amount: -20, contrepasse_de: 'p1' }]
    expect(paiementsContrepassables(ps).map(p => p.id)).toEqual(['p2'])
  })
})

const vente = (id: string, client_id: string | null, date: string, total: number, extra: Partial<VenteFacturable> = {}): VenteFacturable =>
  ({ id, client_id, client: client_id ? null : 'Passant', date, total, tiges: 10, prix_unitaire: total / 10, cultures_sold: 'Dahlia', ...extra })

describe('ventes à facturer', () => {
  const liens = [
    { sale_id: 'v1', invoice_id: 'f1', liberee_par_avoir: null },
    { sale_id: 'v2', invoice_id: 'f0', liberee_par_avoir: 'av0' }, // libérée par un avoir
  ]
  const ventes = [
    vente('v1', 'c1', '2026-10-01', 30), vente('v2', 'c1', '2026-10-20', 20), vente('v3', 'c1', '2026-10-05', 15),
    vente('v4', 'c2', '2026-10-02', 100), vente('v5', null, '2026-10-03', 8), vente('v6', null, '2026-10-04', 9),
  ]
  it('exclut les ventes facturées, garde celles libérées par un avoir', () => {
    expect(Array.from(ventesFacturees(liens).keys())).toEqual(['v1'])
  })
  it('groupe par client, une vente sans fiche par groupe', () => {
    const g = grouperAFacturer(ventes, liens, [{ id: 'c1', name: 'Atelier Pivoine' }, { id: 'c2', name: 'Fleurs & Co' }], v => totalVente(v as any))
    expect(g.map(x => [x.nom, x.ventes.map(v => v.id), x.total])).toEqual([
      ['Fleurs & Co', ['v4'], 10000],
      ['Atelier Pivoine', ['v3', 'v2'], 3500],
      ['Passant', ['v6'], 900],
      ['Passant', ['v5'], 800],
    ])
  })
  it('contrôle une sélection', () => {
    const f = ventesFacturees(liens)
    expect(controlerSelection([ventes[2], ventes[1]], f)).toBeNull()
    expect(controlerSelection([ventes[0]], f)).toMatch(/déjà facturée/)
    expect(controlerSelection([ventes[2], ventes[3]], f)).toMatch(/même client/)
    expect(controlerSelection([ventes[4], ventes[5]], f)).toMatch(/seule/)
    expect(controlerSelection([], f)).toMatch(/Aucune/)
  })
})

describe('lignes figées (miroir de _lignes_a_facturer)', () => {
  it('reprend les lignes de vente, vente par vente puis libellé', () => {
    const l = lignesAFacturer([
      vente('v2', 'c1', '2026-10-16', 16, { lignes: [{ id: 'l3', label: 'Zinnia', unit: 'botte', quantity: 2, stems_per_unit: 10, unit_price: 8, culture_id: null, line_total: 16, created_at: 't' }] }),
      vente('v1', 'c1', '2026-10-02', 51.5, { lignes: [
        { id: 'l1', label: 'Dahlia', unit: 'botte', quantity: 3, stems_per_unit: 10, unit_price: '12.50', culture_id: 'cu', line_total: '37.50', created_at: 't' },
        { id: 'l2', label: 'Cosmos', unit: 'tige', quantity: 40, stems_per_unit: 1, unit_price: '0.35', culture_id: null, line_total: '14.00', created_at: 't' },
      ] }),
    ])
    expect(l.map(x => [x.position, x.label, x.unit_price, x.line_total])).toEqual([
      [1, 'Cosmos', 35, 1400], [2, 'Dahlia', 1250, 3750], [3, 'Zinnia', 800, 1600],
    ])
  })
  it('vente ancienne sans lignes : tiges × prix si le prix tombe au centime', () => {
    const [l] = lignesAFacturer([vente('v', 'c', '2026-09-01', 8, { tiges: 10, prix_unitaire: '0.80', cultures_sold: 'Cosmos' })])
    expect(l).toMatchObject({ label: 'Cosmos', unit: 'tige', quantity: 10, unit_price: 80, line_total: 800 })
  })
  it('sinon 1 × total, tiges rappelées dans le libellé', () => {
    const [l] = lignesAFacturer([vente('v', 'c', '2026-09-01', 1, { tiges: 3, prix_unitaire: '0.333', cultures_sold: 'Bouquet champêtre' })])
    expect(l).toMatchObject({ label: 'Bouquet champêtre (3 tiges)', unit: 'autre', quantity: 1, unit_price: 100, line_total: 100 })
  })
})

describe('liste', () => {
  it('filtre « impayées »', () => {
    expect(correspondFiltre('en_retard', 'impayees')).toBe(true)
    expect(correspondFiltre('payee', 'impayees')).toBe(false)
    expect(correspondFiltre('annulee', 'annulee')).toBe(true)
    expect(correspondFiltre('avoir', 'toutes')).toBe(true)
  })
  it('synthèse : restant dû, retards, net facturé', () => {
    const s = syntheseFactures([
      { kind: 'facture', s: { total: 5000, paye: 2000, reste: 3000, statut: 'partielle', joursRetard: null } },
      { kind: 'facture', s: { total: 1000, paye: 0, reste: 1000, statut: 'en_retard', joursRetard: 4 } },
      { kind: 'facture', s: { total: 2000, paye: 2000, reste: 0, statut: 'annulee', joursRetard: null } },
      { kind: 'avoir', s: { total: -2000, paye: 0, reste: 0, statut: 'avoir', joursRetard: null } },
    ])
    expect(s).toEqual({ restantDu: 4000, enRetard: 1000, nbEnRetard: 1, factureNet: 6000, encaisse: 4000 })
  })
})
