import { test, expect, connexion, titre, toast } from './fixtures'

test('facturer deux ventes, encaisser en partie, émettre un avoir, imprimer', async ({ page }) => {
  await connexion(page, 'factures')
  await expect(titre(page)).toHaveText('Factures & paiements')

  // ── Réglages : ferme non assujettie, la mention d'absence de TVA est obligatoire ──
  // (la ferme de démo applique la TVA : ce parcours vérifie le régime sans TVA)
  await page.getByRole('tab', { name: 'Réglages de facturation' }).click()
  await page.getByRole('checkbox', { name: /La ferme facture la TVA/ }).uncheck()
  const mention = page.getByRole('textbox', { name: 'Mention imprimée sur les factures' })
  await mention.fill('')
  const controle = page.getByRole('list', { name: 'Liste de contrôle des mentions' })
  await expect(controle.getByText('Mention d’absence de TVA : manquant')).toBeAttached()
  await page.getByRole('button', { name: 'TVA non applicable, art. 293 B du CGI' }).click()
  await expect(mention).toHaveValue('TVA non applicable, art. 293 B du CGI')
  await page.getByRole('textbox', { name: 'SIREN ou SIRET *' }).fill('123 456 789 00018')
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click()
  await expect(toast(page, 'Réglages de facturation enregistrés')).toBeVisible()
  await expect(controle.getByText('Mention d’absence de TVA : renseigné')).toBeAttached()

  // ── Émettre une facture sur deux ventes du même client ──
  await page.getByRole('tab', { name: /^À facturer · / }).click()
  await page.getByRole('checkbox', { name: 'Toutes les ventes de Atelier Pétale' }).check()
  await page.getByRole('button', { name: 'Émettre la facture pour Atelier Pétale' }).click()
  const emission = page.getByRole('dialog', { name: 'Émettre la facture' })
  await expect(emission).toContainText('2 ventes')
  await emission.getByRole('textbox', { name: 'SIREN du client' }).fill('987654321')
  await emission.getByRole('button', { name: /^Émettre la facture · 435,00\s€$/ }).click()
  await expect(toast(page, 'Facture F2026-0005 émise')).toBeVisible()

  // La fiche de la nouvelle facture s'ouvre
  const fiche = page.getByRole('dialog', { name: /Facture\s+F2026-0005/ })
  await expect(fiche).toContainText('À payer')
  await expect(fiche).toContainText('TVA non applicable, art. 293 B du CGI')

  // ── Paiement partiel ──
  await fiche.getByRole('button', { name: 'Enregistrer un paiement' }).click()
  await fiche.getByRole('textbox', { name: 'Montant reçu' }).fill('100')
  await fiche.getByRole('combobox', { name: 'Mode' }).selectOption({ label: 'Chèque' })
  await fiche.getByRole('textbox', { name: /^Référence/ }).fill('Chèque n° 1234567')
  await fiche.getByRole('button', { name: /^Enregistrer le paiement · 100,00\s€$/ }).click()
  await expect(toast(page, 'Paiement enregistré')).toBeVisible()
  await expect(fiche).toContainText('Partiellement payée')
  await expect(fiche).toContainText('335,00')

  // ── Avoir, avec confirmation nominative ──
  await fiche.getByRole('button', { name: 'Émettre un avoir' }).click()
  const valider = fiche.getByRole('button', { name: 'Émettre l’avoir sur F2026-0005' })
  await fiche.getByRole('textbox', { name: 'Motif de l’avoir' }).fill('Erreur de prix sur les pois de senteur')
  await expect(valider).toBeDisabled()
  await fiche.getByRole('textbox', { name: 'Pour confirmer, recopiez le numéro F2026-0005' }).fill('F2026-0005')
  await valider.click()
  await expect(toast(page, 'Avoir AV2026-0002 émis')).toBeVisible()
  const ficheAvoir = page.getByRole('dialog', { name: /Avoir\s+AV2026-0002/ })
  await expect(ficheAvoir).toContainText('Avoir sur la facture F2026-0005')
  await expect(ficheAvoir).toContainText('−435,00')

  // ── Page d'impression de l'avoir : instantanés figés ──
  await ficheAvoir.getByRole('link', { name: 'Imprimer / PDF' }).click()
  await page.waitForURL(/\/facture\//)
  const doc = page.getByRole('article', { name: 'Avoir n° AV2026-0002' })
  await expect(doc.getByRole('heading', { name: 'Avoir', exact: true })).toBeVisible()
  await expect(doc).toContainText('Avoir sur la facture n° F2026-0005')
  await expect(doc).toContainText('SIREN 987 654 321')
  await expect(doc).toContainText('TVA non applicable, art. 293 B du CGI')
  await expect(doc).not.toContainText('TTC')
  await expect(page.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeVisible()

  // ── Retour : les deux ventes sont de nouveau à facturer ──
  await page.getByRole('link', { name: 'Retour aux factures' }).click()
  await expect(titre(page)).toHaveText('Factures & paiements')
  await expect(page.getByRole('checkbox', { name: 'Toutes les ventes de Atelier Pétale' })).toBeVisible()
  await page.getByRole('tab', { name: /^Factures · / }).click()
  await expect(page.getByRole('row').filter({ hasText: 'F2026-0005' })).toContainText('Annulée par avoir')
})
