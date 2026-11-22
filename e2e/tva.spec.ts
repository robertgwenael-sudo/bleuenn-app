import { test, expect, connexion, titre, toast } from './fixtures'

// Ferme de démo assujettie : taux de paramétrage « Fleur non travaillée » 10 %
// et « Fleur travaillée » 20 % (table farm_vat_rates, modifiables).

test('vente : variétés cliquées, TVA par ligne, total HT / TVA / TTC en direct', async ({ page }) => {
  await connexion(page, 'ventes')
  await expect(titre(page)).toHaveText('Ventes')

  await page.getByRole('radiogroup', { name: 'Canal de vente' }).getByRole('radio', { name: 'Marché' }).click()
  const varietes = page.getByRole('group', { name: 'Variétés du catalogue' })
  await varietes.getByRole('button', { name: /^Dahlia/ }).click()
  await expect(page.getByRole('combobox', { name: 'Culture de la ligne 1' })).toHaveValue(/.+/)
  // Marché, à la tige : fleur non travaillée par défaut
  await expect(page.getByRole('combobox', { name: 'TVA de la ligne 1' }).locator('option:checked')).toHaveText('Fleur non travaillée · 10 %')
  await page.getByRole('spinbutton', { name: 'Quantité de la ligne 1' }).fill('10')
  await page.getByRole('spinbutton', { name: 'Prix unitaire de la ligne 1' }).fill('1.5')

  const totaux = page.getByLabel('Totaux')
  await expect(totaux).toContainText(/Total HT\s*15,00\s€/)
  await expect(totaux).toContainText(/TVA 10 % sur 15,00\s€\s*1,50\s€/)
  await expect(totaux).toContainText(/Total TTC\s*16,50\s€/)

  // Une composition : bouquet → fleur travaillée proposée, à 20 %
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
  await page.getByRole('textbox', { name: 'Libellé de la ligne 2' }).fill('Bouquet composé')
  const ligne2 = page.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'Libellé de la ligne 2' }) })
  await ligne2.getByRole('combobox', { name: 'Unité' }).selectOption({ label: 'Bouquet' })
  await expect(page.getByRole('combobox', { name: 'TVA de la ligne 2' }).locator('option:checked')).toHaveText('Fleur travaillée · 20 %')
  await page.getByRole('spinbutton', { name: 'Quantité de la ligne 2' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Prix unitaire de la ligne 2' }).fill('25')
  // Mise à jour à chaque frappe : 15 + 50 HT ; TVA 1,50 + 10,00
  await expect(totaux).toContainText(/Total HT\s*65,00\s€/)
  await expect(totaux).toContainText(/TVA 20 % sur 50,00\s€\s*10,00\s€/)
  await expect(totaux).toContainText(/Total TTC\s*76,50\s€/)

  const enregistrer = page.getByRole('button', { name: /^Enregistrer la vente · / })
  await expect(enregistrer).toHaveText(/65,00\s€ HT · 76,50\s€ TTC/)
  await enregistrer.click()
  await expect(toast(page, 'Vente enregistrée')).toBeVisible()
})

test('commande au budget, livrée et facturée sans ressaisie, facture ventilée', async ({ page }) => {
  await connexion(page, 'livraisons')
  await expect(titre(page)).toHaveText('Commandes clients')

  await page.getByRole('button', { name: 'Nouvelle commande' }).click()
  const dialogue = page.getByRole('dialog', { name: 'Nouvelle commande' })
  await dialogue.getByRole('combobox', { name: 'Client' }).selectOption({ label: 'Atelier Pétale · Fleuriste' })
  await dialogue.getByLabel('Livraison le').fill('2026-11-26')
  const varietes = dialogue.getByRole('group', { name: 'Variétés du catalogue' })
  await varietes.getByRole('button', { name: /^Dahlia/ }).click()
  await varietes.getByRole('button', { name: /^Cosmos/ }).click()
  await expect(varietes.getByRole('button', { name: /^Cosmos/ })).toHaveAttribute('aria-pressed', 'true')

  // « 500 € de tiges », TTC, répartis à parts égales
  await dialogue.getByText('Commande au budget').click()
  await dialogue.getByRole('textbox', { name: 'Budget' }).fill('500')
  await dialogue.getByRole('button', { name: 'Proposer les quantités' }).click()
  const resultat = dialogue.getByRole('status').filter({ hasText: 'Total proposé' })
  await expect(resultat).toContainText(/pour un budget de 500,00\s€ : écart \d+,\d\d\s€/)
  const totaux = dialogue.getByLabel('Totaux')
  await expect(totaux).toContainText('Total TTC')
  const ttc = await totaux.getByText(/^Total TTC/).locator('..').textContent()
  const centimes = Number(ttc!.replace(/[^\d]/g, ''))
  expect(centimes).toBeGreaterThan(49000)
  expect(centimes).toBeLessThanOrEqual(50000)

  await dialogue.getByRole('button', { name: /^Enregistrer la commande/ }).click()
  await expect(toast(page, 'Commande enregistrée')).toBeVisible()
  await expect(dialogue).toBeHidden()

  const commande = page.getByRole('listitem').filter({ hasText: 'Atelier Pétale' }).filter({ hasText: 'Dahlia' }).filter({ hasText: 'Cosmos' })
  await expect(commande).toContainText(/BC2026-\d{4}/)
  const numeroBon = (await commande.textContent())!.match(/BC2026-\d{4}/)![0]
  await commande.getByRole('button', { name: 'Livrer et facturer' }).click()
  const livrer = page.getByRole('dialog', { name: 'Livrer et facturer' })
  await expect(livrer).toContainText('TVA 10 %')
  await livrer.getByRole('button', { name: /^Livrer et facturer · / }).click()
  await expect(toast(page, 'Commande livrée et facturée')).toBeVisible()
  await expect(toast(page, new RegExp(`facture F2026-\\d{4} émise \\(bon ${numeroBon}\\)`))).toBeVisible()

  // La commande livrée porte le numéro de sa facture
  await page.getByRole('radiogroup', { name: 'Période' }).getByRole('radio', { name: /^Historique/ }).click()
  const livree = page.getByRole('main').getByRole('listitem').filter({ hasText: numeroBon })
  await expect(livree).toContainText(/Facturée n° F2026-\d{4}/)

  // Facture : bon de commande cité, TVA ventilée
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Factures & paiements', exact: true }).click()
  await expect(titre(page)).toHaveText('Factures & paiements')
  await page.getByRole('tab', { name: /^Factures · / }).click()
  await page.getByRole('row').filter({ hasText: 'Atelier Pétale' }).filter({ hasText: 'À payer' }).first().click()
  const fiche = page.getByRole('dialog', { name: /Facture\s+F2026-/ })
  await expect(fiche).toContainText(`Bon de commande : ${numeroBon}`)
  await expect(fiche.getByLabel('Ventilation de la TVA')).toContainText('TVA 10 %')
  await expect(fiche).not.toContainText('TVA non applicable')

  await fiche.getByRole('link', { name: 'Imprimer / PDF' }).click()
  await page.waitForURL(/\/facture\//)
  const doc = page.getByRole('article', { name: /^Facture n° F2026-/ })
  await expect(doc).toContainText(`n° ${numeroBon}`)
  await expect(doc).toContainText('N° TVA intracommunautaire FR00123456789')
  await expect(doc).toContainText('Prix unitaire HT')
  await expect(doc.getByRole('table', { name: 'Récapitulatif de la TVA' })).toContainText('10 %')
  await expect(doc).toContainText('Total TTC')
  await expect(doc).not.toContainText('TVA non applicable')
})

test('facture de mariage déjà émise : TVA ventilée à 10 % et 20 %', async ({ page }) => {
  await connexion(page, 'factures')
  await page.getByRole('tab', { name: /^Factures · / }).click()
  await page.getByRole('row').filter({ hasText: 'Mariage Le Bris' }).first().click()
  const fiche = page.getByRole('dialog', { name: /Facture\s+F2026-0001/ })
  const ventilation = fiche.getByLabel('Ventilation de la TVA')
  await expect(ventilation).toContainText('TVA 10 %')
  await expect(ventilation).toContainText('TVA 20 %')
  await expect(ventilation).toContainText('Total TTC')
})

test('réglages : régime de TVA et taux modifiables', async ({ page }) => {
  await connexion(page, 'factures')
  await page.getByRole('tab', { name: 'Réglages de facturation' }).click()
  await expect(page.getByRole('checkbox', { name: /La ferme facture la TVA/ })).toBeChecked()
  const taux = page.getByRole('list', { name: 'Taux de TVA' })
  await expect(taux.getByRole('textbox', { name: 'Taux en % de Fleur non travaillée' })).toHaveValue('10')
  await expect(taux.getByRole('textbox', { name: 'Taux en % de Fleur travaillée' })).toHaveValue('20')
  // Pas de mention d'absence de TVA pour une ferme assujettie
  await expect(page.getByRole('textbox', { name: 'Mention imprimée sur les factures' })).toHaveCount(0)
  const controle = page.getByRole('list', { name: 'Liste de contrôle des mentions' })
  await expect(controle.getByText('Numéro de TVA intracommunautaire : renseigné')).toBeAttached()

  await taux.getByRole('textbox', { name: 'Taux en % de Fleur non travaillée' }).fill('5,5')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(toast(page, 'Réglages de facturation enregistrés')).toBeVisible()
  await expect(taux.getByRole('textbox', { name: 'Taux en % de Fleur non travaillée' })).toHaveValue('5,5')
})

test('commande déjà livrée : « Facturer » reprend les lignes de la vente', async ({ page }) => {
  await connexion(page, 'livraisons')
  await page.getByRole('radiogroup', { name: 'Période' }).getByRole('radio', { name: /^Historique/ }).click()
  const livree = page.getByRole('main').getByRole('listitem').filter({ hasText: 'Fleurs de Lin' }).filter({ hasText: 'Livrée' })
  await livree.getByRole('button', { name: 'Facturer' }).click()
  const dialogue = page.getByRole('dialog', { name: 'Facturer la vente' })
  await expect(dialogue).toContainText(/bon de commande BC2026-\d{4}/)
  await expect(dialogue.getByLabel('Totaux de la facture')).toContainText('Total TTC')
  await dialogue.getByRole('button', { name: /^Émettre la facture · .* TTC$/ }).click()
  await expect(toast(page, 'Facture F2026-0005 émise')).toBeVisible()
  await expect(livree).toContainText('Facturée n° F2026-0005')
})
