import { test, expect, connexion, titre, toast, type Page } from './fixtures'

/**
 * Gestion simple : scanner un ticket, créer la dépense, importer un relevé
 * CSV (avec une ligne déjà connue), rapprocher, lire le tableau de bord.
 *
 * La lecture automatique (OCR) n'est PAS jouée ici : elle télécharge son
 * moteur et le français depuis un CDN, hors de portée d'un test hors
 * réseau. Sa logique d'extraction est testée sur des sorties réelles dans
 * src/lib/domain/gestion.test.ts.
 */

/** Photo de ticket générée dans le navigateur (papier clair sur fond sombre, légèrement tourné). */
async function ticketJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 900; c.height = 1300
    const g = c.getContext('2d')!
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, c.width, c.height)
    g.translate(450, 650); g.rotate(-0.03); g.translate(-450, -650)
    g.fillStyle = '#f4f2ec'; g.fillRect(160, 90, 580, 1100)
    g.fillStyle = '#2a2a2a'; g.font = 'bold 30px monospace'
    const lignes = ['JARDINERIE DES QUATRE VENTS', '', 'le 21/11/2026 10:32', 'TERREAU 70L  2 x 12,90  25,80', 'SECATEUR          24,90',
      'SOUS-TOTAL        50,70', 'REMISE            -2,00', 'TOTAL TTC   48,70 EUR', 'CB                48,70']
    lignes.forEach((l, i) => { g.font = `${i === 0 || l.startsWith('TOTAL') ? 'bold ' : ''}22px monospace`; g.fillText(l, 190, 160 + i * 52) })
    return c.toDataURL('image/jpeg', 0.85)
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

const RELEVE = [
  'Date;Libellé;Montant(EUROS)',
  '18/11/2026;CB GRAINETERIE DES MONTS;-27,50',      // déjà dans le relevé de démonstration
  '21/11/2026;CB JARDINERIE QUATRE VENTS;-48,70',
  '21/11/2026;VIR SEPA FLEURS DE LIN;210,00',
].join('\r\n')

test('scanner un ticket, créer la dépense, importer le relevé, rapprocher, tableau de bord', async ({ page }) => {
  await connexion(page, 'gestion')
  await expect(titre(page)).toHaveText('Gestion')
  const stat = (nom: string) => page.getByText(nom, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
  await expect(stat('Dépensé sur 12 mois')).toContainText('2 370,10') // dépenses de démo : coûts + bons de commande reçus (achats)
  await expect(page.getByRole('button', { name: /^Mouvements à rapprocher/ })).toContainText('19')

  // ── 1. Scanner le justificatif ──
  await page.evaluate(() => { location.hash = 'justificatifs' })
  await expect(titre(page)).toHaveText('Justificatifs')
  await page.getByRole('button', { name: 'Scanner un justificatif' }).click()
  const scan = page.getByRole('dialog', { name: 'Scanner un justificatif' })
  await scan.getByLabel('Photographier le justificatif').setInputFiles({ name: 'ticket.jpg', mimeType: 'image/jpeg', buffer: await ticketJpeg(page) })
  await expect(scan.getByRole('img', { name: 'Page 1' })).toBeVisible()
  await expect(scan).toContainText('télécharge environ 2,2 Mo la première fois')
  await scan.getByLabel('Date de la pièce').fill('2026-11-21')
  await scan.getByRole('textbox', { name: /^Montant total/ }).fill('48,70')
  await scan.getByRole('textbox', { name: 'Fournisseur' }).fill('Jardinerie des Quatre Vents')
  await scan.getByRole('button', { name: 'Enregistrer le justificatif' }).click()
  await expect(toast(page, 'Justificatif enregistré')).toBeVisible()

  // ── 2. Créer la dépense depuis le justificatif (la fiche s'ouvre) ──
  const fiche = page.getByRole('dialog', { name: 'Jardinerie des Quatre Vents' })
  await expect(fiche).toContainText('À traiter')
  await fiche.getByRole('combobox', { name: 'Catégorie' }).selectOption({ label: 'Terreau, substrat' })
  await fiche.getByRole('button', { name: /^Créer la dépense · 48,70\s€$/ }).click()
  await expect(toast(page, 'Dépense créée et justificatif rattaché')).toBeVisible()
  await page.getByRole('tab', { name: /^Rattachés/ }).click()
  await expect(page.getByRole('button', { name: /Ouvrir le justificatif Jardinerie des Quatre Vents/ })).toContainText('Rattaché à une dépense')

  // ── 3. Importer le relevé CSV (mappage mémorisé, une ligne déjà connue) ──
  await page.evaluate(() => { location.hash = 'gestion' })
  await expect(titre(page)).toHaveText('Gestion')
  await page.getByRole('tab', { name: /^Banque/ }).click()
  await page.getByRole('button', { name: 'Importer un relevé' }).click()
  const imp = page.getByRole('dialog', { name: /^Importer un relevé/ })
  await imp.getByLabel('Fichier du relevé (CSV)').setInputFiles({ name: 'releve-novembre.csv', mimeType: 'text/csv', buffer: Buffer.from(RELEVE, 'latin1') })
  await expect(imp).toContainText('mappage mémorisé de ce compte')
  await expect(imp).toContainText('encodage windows-1252')
  await expect(imp.getByRole('heading', { name: /Aperçu/ })).toContainText('2 nouveaux · 1 déjà importé')
  await imp.getByRole('button', { name: 'Importer 2 mouvements' }).click()
  await expect(imp.getByRole('status')).toContainText('2 mouvements importés')
  await expect(imp.getByRole('status')).toContainText('1 ligne déjà connue, ignorée')
  await imp.getByRole('button', { name: 'Terminer' }).click()

  // ── 4. Rapprocher : la dépense créée est proposée, validée en un geste ──
  const mvt = page.getByRole('listitem').filter({ hasText: 'CB JARDINERIE QUATRE VENTS' })
  await expect(mvt).toContainText('Jardinerie des Quatre Vents')
  await mvt.getByRole('button', { name: /^Valider le rapprochement avec dépense/ }).click()
  await expect(toast(page, 'Rapproché : dépense de 48,70')).toBeVisible()
  await expect(mvt).toHaveCount(0)   // filtre « À rapprocher »
  await page.getByRole('radio', { name: 'Tous' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'CB JARDINERIE QUATRE VENTS' })).toContainText('Rapproché')
  // Le crédit sans pièce reste à rapprocher
  await expect(page.getByRole('listitem').filter({ hasText: 'VIR SEPA FLEURS DE LIN' })).toContainText('À rapprocher')

  // ── 5. Tableau de bord ──
  await page.getByRole('tab', { name: 'Tableau de bord' }).click()
  await expect(stat('Dépensé sur 12 mois')).toContainText('2 418,80') // idem + ticket scanné
  // CA présenté HT, TVA collectée à part (ferme de démo assujettie, 014)
  const ca = page.getByLabel('Chiffre d’affaires et TVA collectée', { exact: true })
  await expect(ca).toContainText('CA HT')
  await expect(ca).toContainText(/TVA collectée\s*[1-9][\d\s\u202f]*,\d\d\s€/)
  await expect(page.getByText(/montants réellement encaissés \(TVA comprise\)/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Mouvements à rapprocher/ })).toContainText('20')
  await expect(page.getByRole('button', { name: /^Justificatifs manquants/ })).toContainText('33') // + 8 dépenses de démo issues des bons de commande, sans pièce
  await expect(page.getByRole('list', { name: 'Soldes par compte' })).toContainText('Compte courant pro')
  await expect(page.getByRole('list', { name: 'Soldes par compte' })).not.toContainText('non calculable')
  await page.getByRole('radio', { name: 'Tableau', exact: true }).click()
  const novembre = page.getByRole('row', { name: /novembre 2026/ })
  await expect(novembre).toContainText('82,70')   // 34,00 € (démo) + 48,70 €
})
