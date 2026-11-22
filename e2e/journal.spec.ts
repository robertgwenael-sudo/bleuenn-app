import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { test, expect, connexion, titre, toast } from './fixtures'

/** Petite image PNG générée (dégradé 64×48), sans fichier de test. */
function pngDegrade(l = 64, h = 48): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t))
    return Buffer.concat([len, t, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const brut = Buffer.alloc((l * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
    const i = y * (l * 3 + 1) + 1 + x * 3
    brut[i] = 40 + x * 3; brut[i + 1] = 120 + y * 2; brut[i + 2] = 60
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0))])
}

test('journal : note avec photo, traitement, export du registre', async ({ page }) => {
  await connexion(page, 'journal')
  await expect(titre(page)).toHaveText('Journal & traitements')
  await expect(page.getByText('Oïdium sur les feuilles basses des zinnias')).toBeVisible()

  // 1. Note avec photo, réduite côté client puis envoyée au bucket privé
  await page.getByRole('button', { name: 'Nouvelle note' }).click()
  const note = page.getByRole('form', { name: 'Nouvelle note' })
  await note.getByRole('button', { name: 'Ravageur', exact: true }).click()
  await note.getByLabel('Prendre une photo').setInputFiles({ name: 'pucerons.png', mimeType: 'image/png', buffer: pngDegrade() })
  await expect(note.getByRole('img', { name: 'Photo 1 à joindre' })).toBeVisible()
  await note.getByRole('textbox', { name: 'Note' }).fill('Pucerons verts sur les boutons de dahlia (test e2e).')
  await note.getByLabel('Planche (facultatif)').selectOption({ label: 'Jardin du Haut · PL 2' })
  await note.getByRole('button', { name: 'Enregistrer la note' }).click()
  await expect(toast(page, 'Note enregistrée')).toBeVisible()
  const carte = page.getByRole('listitem').filter({ hasText: 'Pucerons verts sur les boutons de dahlia' })
  await expect(carte).toContainText('Jardin du Haut · PL 2')
  // La vignette s'affiche par URL signée
  await expect(carte.getByRole('button', { name: 'Agrandir la photo' }).locator('img')).toHaveJSProperty('complete', true)

  // 2. Traitement : un champ manquant est signalé, rien n'est deviné
  await page.getByRole('button', { name: 'Nouveau traitement' }).click()
  const tr = page.getByRole('form', { name: 'Nouveau traitement' })
  await tr.getByRole('button', { name: 'Ajouter au registre' }).click()
  await expect(tr.getByText('Nom commercial complet du produit requis')).toBeVisible()
  await expect(tr.getByText('Numéro d’AMM requis (ou cochez « sans AMM »)')).toBeVisible()
  await tr.getByLabel('Nom commercial complet').fill('Produit test e2e 10 SC')
  await tr.getByLabel('Type de produit').selectOption('insecticide')
  await tr.getByLabel('N° d’AMM').fill('E2E-0001')
  await tr.getByLabel('Dose', { exact: true }).fill('0,75')
  await tr.getByLabel('Unité').first().selectOption('L/ha')
  await tr.getByLabel('Quantité totale utilisée').fill('0,0009')
  await tr.getByLabel('Unité').nth(1).selectOption('L')
  await tr.getByLabel('Planche traitée').selectOption({ label: 'Jardin du Haut · PL 2' })
  await expect(tr.getByLabel('Surface traitée (m²)')).toHaveValue('12')
  await expect(tr.getByText('soit 0,0012 ha à l’export')).toBeVisible()
  await tr.getByLabel('Cible', { exact: true }).fill('Pucerons verts')
  await tr.getByRole('button', { name: 'Ravageur', exact: true }).click()
  await tr.getByRole('button', { name: 'Ajouter au registre' }).click()
  await expect(toast(page, 'Traitement ajouté au registre')).toBeVisible()

  // 3. Registre : la ligne est là, export CSV de l'année
  const registre = page.getByRole('region', { name: 'Registre des traitements' })
  await expect(registre.getByRole('row').filter({ hasText: 'Produit test e2e 10 SC' })).toContainText('AMM E2E-0001')
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exporter le registre (CSV)' }).click(),
  ])
  expect(telechargement.suggestedFilename()).toBe('bleuenn-registre-phytosanitaire-2026-01-01_2026-12-31.csv')
  const csv = readFileSync((await telechargement.path())!, 'utf8')
  expect(csv.startsWith('﻿Date du traitement;Produit (nom commercial);Type de produit;N° AMM;')).toBe(true)
  expect(csv).toContain('22/11/2026;Produit test e2e 10 SC;Insecticide;E2E-0001;0,75;L/ha;0,0009;L;0,0012;12;Dahlia;Pucerons verts;Ravageur;Planche;Jardin du Haut · PL 2;')
  expect(csv.trim().split('\r\n')).toHaveLength(1 + 5)
  await expect(toast(page, 'Registre exporté')).toBeVisible()

  // 4. Historique de la planche : la note et le traitement y figurent
  await page.getByRole('button', { name: 'Historique d’une planche' }).click()
  const hist = page.getByRole('dialog')
  await hist.getByLabel('Planche').selectOption({ label: 'Jardin du Haut · PL 2' })
  await expect(hist.getByText('Dahlia : 2026, 2027')).toBeVisible()
  await expect(hist.getByText('Pucerons verts sur les boutons de dahlia (test e2e).')).toBeVisible()
  await expect(hist.getByText('Produit test e2e 10 SC')).toBeVisible()
})
