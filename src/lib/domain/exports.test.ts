import { describe, expect, it } from 'vitest'
import {
  BOM, celluleCsv, echapperChamp, EXPORTS, exportClients, exportCommandes, exportPertes, exportPlanDeCulture,
  exportRecoltes, exportVentesDetaillees, exportVentesParMoisEtCanal, formatCentiemesCsv, formatDateCsv,
  formatMontantCsv, formaterCellule, genererCsv, libelleLigne, neutraliserFormule, nomFichierExport, sommeColonne,
  tableauFormate, type DonneesExport, type PlantationExport, type Tableau, type VenteExport,
} from './exports'
import { chiffreAffaires } from './ventes'

const C1 = '11111111-aaaa-4000-8000-000000000001'
const C2 = '22222222-bbbb-4000-8000-000000000002'

const ventes: VenteExport[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001', date: '2026-07-14', channel: 'Fleuriste', client_id: C1,
    total: 51.5, tiges: 0, prix_unitaire: 0,
    lignes: [
      { label: 'Dahlia', unit: 'botte', quantity: 3, stems_per_unit: 10, unit_price: 12, line_total: 36 },
      { label: 'Cosmos', unit: 'tige', quantity: '15', stems_per_unit: 1, unit_price: '0.70' },
      { label: 'Feuillage', unit: 'autre', quantity: 0.5, stems_per_unit: 4, unit_price: 9.99 },
    ],
  },
  // Vente historique, sans lignes : 0,1 × 3 en flottant donnerait 0,30000000000000004
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000002', date: '2026-07-02', channel: 'Marché', client: 'Marché de Landerneau',
    cultures_sold: 'Zinnia, Cosmos', total: 0.3, tiges: 3, prix_unitaire: 0.1, lignes: [],
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000003', date: '2026-08-01', channel: 'Marché', client_id: null,
    total: 20, tiges: 40, prix_unitaire: 0.5, cultures_sold: null, lignes: [],
  },
]
const clients = [
  { id: C1, name: 'Atelier "Rose"; Brest', kind: 'fleuriste' as const, contact_name: 'Anna', phone: '+33 6 12 34 56 78', email: 'a@x.fr', address: '1 rue\nBrest', archived_at: null },
  { id: C2, name: 'Bernard', kind: 'particulier' as const, contact_name: null, phone: null, email: null, address: null, archived_at: '2026-01-01T00:00:00Z' },
]

describe('formats de cellule', () => {
  it('dates JJ/MM/AAAA, et refus d’une date invalide', () => {
    expect(formatDateCsv('2026-07-04')).toBe('04/07/2026')
    expect(() => formatDateCsv('2026-02-30')).toThrow()
    expect(() => formatDateCsv('04/07/2026')).toThrow()
  })
  it('montants en centimes → virgule, deux décimales, sans milliers ni €', () => {
    expect(formatMontantCsv(123450)).toBe('1234,50')
    expect(formatMontantCsv(5)).toBe('0,05')
    expect(formatMontantCsv(-1250)).toBe('-12,50')
    expect(formatMontantCsv(0)).toBe('0,00')
    expect(() => formatMontantCsv(12.5)).toThrow()
  })
  it('décimaux en centièmes : zéros finaux retirés', () => {
    expect(formatCentiemesCsv(250)).toBe('2,5')
    expect(formatCentiemesCsv(200)).toBe('2')
    expect(formatCentiemesCsv(-25)).toBe('-0,25')
  })
  it('jamais de NaN ni d’undefined : la valeur incohérente lève', () => {
    expect(() => formaterCellule('montant', Number.NaN)).toThrow()
    expect(() => formaterCellule('entier', 1.5)).toThrow()
    expect(() => formaterCellule('texte', undefined as unknown as null)).toThrow()
    expect(() => formaterCellule('texte', 12)).toThrow()
    expect(formaterCellule('montant', null)).toBe('')
  })
})

describe('échappement et injection de formules', () => {
  it('guillemets, retours ligne et ; sont entourés de guillemets', () => {
    expect(echapperChamp('simple')).toBe('simple')
    expect(echapperChamp('a;b')).toBe('"a;b"')
    expect(echapperChamp('dit "bonjour"')).toBe('"dit ""bonjour"""')
    expect(echapperChamp('l1\nl2')).toBe('"l1\nl2"')
    expect(echapperChamp('l1\r\nl2')).toBe('"l1\r\nl2"')
  })
  it('préfixe d’une apostrophe les débuts de formule', () => {
    for (const s of ['=SOMME(A1)', '+33 6', '-2', '@cmd', '\tx', '\rx']) expect(neutraliserFormule(s)).toBe(`'${s}`)
    expect(neutraliserFormule('Dahlia = roi')).toBe('Dahlia = roi')
    expect(neutraliserFormule('')).toBe('')
  })
  it('la neutralisation précède l’échappement, et ne touche pas aux nombres', () => {
    expect(celluleCsv('texte', '=HYPERLINK("x";"y")')).toBe('"\'=HYPERLINK(""x"";""y"")"')
    expect(celluleCsv('montant', -1250)).toBe('-12,50')
    expect(celluleCsv('decimal', -50)).toBe('-0,5')
  })
})

describe('genererCsv', () => {
  const t: Tableau = {
    colonnes: [{ titre: 'Date', type: 'date' }, { titre: 'Libellé', type: 'texte' }, { titre: 'Montant (€)', type: 'montant' }],
    lignes: [['2026-07-14', 'a;b', 1050], ['2026-07-15', null, 0]],
  }
  it('BOM, séparateur ;, CRLF, fin de fichier', () => {
    const csv = genererCsv(t)
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toBe(`${BOM}Date;Libellé;Montant (€)\r\n14/07/2026;"a;b";10,50\r\n15/07/2026;;0,00\r\n`)
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/\n/)
  })
  it('refuse une ligne de mauvaise largeur', () => {
    expect(() => genererCsv({ ...t, lignes: [['2026-07-14', 'x']] })).toThrow(/2 cellules pour 3/)
  })
  it('nom de fichier', () => {
    expect(nomFichierExport('ventes-detaillees', '2026-01-01', '2026-12-31')).toBe('bleuenn-ventes-detaillees-2026-01-01_2026-12-31.csv')
    expect(() => nomFichierExport('Ventes/x', '2026-01-01', '2026-12-31')).toThrow()
    expect(() => nomFichierExport('ventes', '2026-13-01', '2026-12-31')).toThrow()
  })
})

describe('ventes détaillées', () => {
  const t = exportVentesDetaillees(ventes, clients)
  it('une ligne par ligne de vente, une ligne par vente historique, triées par date', () => {
    expect(t.lignes).toHaveLength(5)
    expect(t.lignes.map(l => l[0])).toEqual(['2026-07-02', '2026-07-14', '2026-07-14', '2026-07-14', '2026-08-01'])
  })
  it('vente historique : tiges, prix et total d’origine, sans flottant', () => {
    expect(tableauFormate(t)[0]).toEqual(['02/07/2026', 'BBBBBBBB', 'Marché de Landerneau', 'Marché', 'Zinnia, Cosmos', 'Tige', '3', '3', '0,10', '0,30'])
    expect(tableauFormate(t)[4]).toEqual(['01/08/2026', 'CCCCCCCC', '', 'Marché', '', 'Tige', '40', '40', '0,50', '20,00'])
  })
  it('lignes : quantité décimale, tiges et montant arrondi comme la base', () => {
    const [, l1, l2, l3] = tableauFormate(t)
    expect(l1.slice(2)).toEqual(['Atelier "Rose"; Brest', 'Fleuriste', 'Dahlia', 'Botte', '3', '30', '12,00', '36,00'])
    expect(l2.slice(4)).toEqual(['Cosmos', 'Tige', '15', '15', '0,70', '10,50'])
    expect(l3.slice(4)).toEqual(['Feuillage', 'Autre', '0,5', '2', '9,99', '5,00']) // 4,995 → 5,00
  })
  it('la somme de la colonne Montant retombe sur le CA', () => {
    expect(sommeColonne(t, 'Montant (€)')).toBe(chiffreAffaires(ventes))
    expect(sommeColonne(t, 'Montant (€)')).toBe(30 + 5150 + 2000)
  })
})

describe('ventes par mois et par canal', () => {
  it('une ligne par mois × canal, canaux dans l’ordre de l’app, total = CA', () => {
    const t = exportVentesParMoisEtCanal(ventes)
    expect(tableauFormate(t)).toEqual([
      ['2026', '7', 'Juillet', 'Marché', '1', '3', '0,30'],
      ['2026', '7', 'Juillet', 'Fleuriste', '1', '47', '51,50'],
      ['2026', '8', 'Août', 'Marché', '1', '40', '20,00'],
    ])
    expect(sommeColonne(t, 'CA (€)')).toBe(chiffreAffaires(ventes))
  })
})

const plantations: PlantationExport[] = [{
  id: 'dddddddd-0000-4000-8000-000000000004', culture_name: 'Dahlia', garden_name: 'Jardin du haut', planche_name: 'P3',
  surface_m2: 7.5, date_semis: '2026-04-01', date_plantation: '2026-04-01', date_recolte: '2026-07-10', date_fin: '2026-10-15',
  tiges_estimees: 600, revenu_estime: '480.00', season_name: 'Saison 2026',
}]

describe('récoltes, pertes, plan', () => {
  it('récoltes avec jardin et planche, notes protégées', () => {
    const t = exportRecoltes([
      { id: 'r2', planting_id: plantations[0].id, date: '2026-07-20', tiges: 40, quality: 'A', notes: '=1+1' },
      { id: 'r1', planting_id: 'inconnue', date: '2026-07-12', tiges: 10, quality: 'B', notes: null },
    ], plantations)
    expect(tableauFormate(t)).toEqual([
      ['12/07/2026', 'Plantation inconnue', '', '', '10', 'B', ''],
      ['20/07/2026', 'Dahlia', 'Jardin du haut', 'P3', '40', 'A', '=1+1'],
    ])
    expect(genererCsv(t)).toContain(";'=1+1\r\n")
  })
  it('pertes : raison en clair, culture du catalogue ou de la plantation', () => {
    const t = exportPertes([
      { id: 'l1', date: '2026-07-21', planting_id: plantations[0].id, culture_id: null, tiges: 12, reason: 'meteo', notes: 'Grêle' },
      { id: 'l2', date: '2026-07-22', planting_id: null, culture_id: 'cu1', tiges: 5, reason: 'invendu', notes: null },
    ], plantations, [{ id: 'cu1', name: 'Cosmos' }])
    expect(tableauFormate(t)).toEqual([
      ['21/07/2026', 'Dahlia', 'Jardin du haut · P3 · semis du 01/04/2026', '12', 'Météo', 'Grêle'],
      ['22/07/2026', 'Cosmos', '', '5', 'Invendu', ''],
    ])
  })
  it('plan de culture : surface décimale, dates et CA estimé', () => {
    expect(tableauFormate(exportPlanDeCulture(plantations))).toEqual([[
      'DDDDDDDD', 'Dahlia', 'Jardin du haut', 'P3', '7,5', '01/04/2026', '01/04/2026', '10/07/2026', '15/10/2026', '600', '480,00', 'Saison 2026',
    ]])
  })
})

describe('commandes et clients', () => {
  it('commande : lignes en clair, tiges et montant', () => {
    const t = exportCommandes([{
      id: 'eeeeeeee-0000-4000-8000-000000000005', delivery_date: '2026-09-04', client_id: C1, status: 'livree',
      channel: 'Fleuriste', sale_id: 'x',
      lignes: [
        { label: 'Dahlia', unit: 'botte', quantity: 2, stems_per_unit: 10, unit_price: 12 },
        { label: 'Cosmos', unit: 'tige', quantity: 1.5, stems_per_unit: 1, unit_price: 0.7 },
      ],
    }], clients)
    const [l] = tableauFormate(t)
    expect(l[3]).toBe('Livrée')
    expect(l[5]).toBe('Oui')
    expect(l[7]).toBe(`${libelleLigne({ label: 'Dahlia', unit: 'botte', quantity: 2, stems_per_unit: 10, unit_price: 12 })} | 1,5 × Tige Cosmos à 0,70 € = 1,05 €`)
    expect(l.slice(8)).toEqual(['22', '25,05'])
  })
  it('clients : CA de la période par fiche, téléphone protégé', () => {
    const t = exportClients(clients, ventes)
    expect(tableauFormate(t)).toEqual([
      ['Atelier "Rose"; Brest', 'Fleuriste', 'Anna', '+33 6 12 34 56 78', 'a@x.fr', '1 rue\nBrest', 'Non', '1', '51,50'],
      ['Bernard', 'Particulier', '', '', '', '', 'Oui', '0', '0,00'],
    ])
    const csv = genererCsv(t)
    expect(csv).toContain(`"Atelier ""Rose""; Brest";Fleuriste;Anna;'+33 6 12 34 56 78;a@x.fr;"1 rue\nBrest";Non;1;51,50\r\n`)
  })
})

describe('catalogue', () => {
  it('chaque export se construit et se sérialise sur des données vides', () => {
    const vide: DonneesExport = { ventes: [], clients: [], commandes: [], recoltes: [], pertes: [], plan: [], plantations: [], cultures: [] }
    for (const e of EXPORTS) {
      const csv = genererCsv(e.construire(vide))
      expect(csv.startsWith(BOM)).toBe(true)
      expect(csv.split('\r\n')).toHaveLength(2)
    }
    expect(new Set(EXPORTS.map(e => e.cle)).size).toBe(7)
  })
})
