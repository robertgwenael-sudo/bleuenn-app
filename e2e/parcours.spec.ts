import { test, expect, connexion, titre, toast } from './fixtures'

test('saisir une récolte', async ({ page }) => {
  await connexion(page, 'recoltes')
  await expect(titre(page)).toHaveText('Récoltes')
  const historique = page.getByRole('tablist', { name: 'Historique' })
  const onglet = historique.getByRole('tab', { name: /^Récoltes · \d+$/ })
  const avant = Number((await onglet.textContent())!.match(/(\d+)$/)![1])

  await page.getByRole('combobox', { name: 'Culture / planche' }).selectOption({ index: 1 })
  // Le champ avance par pas de 10 tiges (step=10)
  await page.getByRole('spinbutton', { name: 'Tiges récoltées' }).fill('40')
  await page.getByRole('radiogroup', { name: 'Qualité' }).getByRole('radio', { name: 'B' }).click()
  await page.getByRole('textbox', { name: 'Notes' }).fill('Saisie e2e')
  await page.getByRole('button', { name: 'Enregistrer la récolte' }).click()

  await expect(toast(page, '40 tiges enregistrées')).toBeVisible()
  await expect(historique.getByRole('tab', { name: `Récoltes · ${avant + 1}` })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Saisie e2e' })).toContainText('40')
})

test('créer une vente multi-lignes', async ({ page }) => {
  await connexion(page, 'ventes')
  await expect(titre(page)).toHaveText('Ventes')

  await page.getByRole('radiogroup', { name: 'Canal de vente' }).getByRole('radio', { name: 'Fleuriste' }).click()
  await page.getByRole('combobox', { name: 'Client' }).selectOption({ label: 'Atelier Pétale · Fleuriste' })

  // Ligne 1 : 10 tiges de dahlia à 1,50 €
  await page.getByRole('combobox', { name: 'Culture de la ligne 1' }).selectOption({ label: 'Dahlia' })
  await page.getByRole('spinbutton', { name: 'Quantité de la ligne 1' }).fill('10')
  await page.getByRole('spinbutton', { name: 'Prix unitaire de la ligne 1' }).fill('1.5')

  // Ligne 2 : 2 bottes de cosmos à 8 €
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click()
  await page.getByRole('combobox', { name: 'Culture de la ligne 2' }).selectOption({ label: 'Cosmos' })
  const ligne2 = page.getByRole('listitem').filter({ has: page.getByRole('combobox', { name: 'Culture de la ligne 2' }) })
  await ligne2.getByRole('combobox', { name: 'Unité' }).selectOption({ label: 'Botte' })
  await page.getByRole('spinbutton', { name: 'Quantité de la ligne 2' }).fill('2')
  await page.getByRole('spinbutton', { name: 'Prix unitaire de la ligne 2' }).fill('8')

  const enregistrer = page.getByRole('button', { name: /^Enregistrer la vente · / })
  await expect(enregistrer).toHaveText(/31,00\s€/)
  await enregistrer.click()

  await expect(toast(page, 'Vente enregistrée')).toBeVisible()
  await expect(toast(page, /Fleuriste · Atelier Pétale · .* · 31,00\s€/)).toBeVisible()
})

test('créer une commande, puis la livrer et la facturer', async ({ page }) => {
  await connexion(page, 'livraisons')
  await expect(titre(page)).toHaveText('Commandes clients')

  await page.getByRole('button', { name: 'Nouvelle commande' }).click()
  const dialogue = page.getByRole('dialog', { name: 'Nouvelle commande' })
  await dialogue.getByRole('combobox', { name: 'Client' }).selectOption({ label: 'Épicerie Ty Bihan · Commerce' })
  await dialogue.getByLabel('Livraison le').fill('2026-11-25')
  await dialogue.getByRole('combobox', { name: 'Culture de la ligne 1' }).selectOption({ label: 'Zinnia' })
  await dialogue.getByRole('spinbutton', { name: 'Quantité de la ligne 1' }).fill('25')
  await dialogue.getByRole('spinbutton', { name: 'Prix unitaire de la ligne 1' }).fill('0.8')
  await dialogue.getByRole('button', { name: /Enregistrer|Créer/ }).click()
  await expect(toast(page, 'Commande enregistrée')).toBeVisible()
  await expect(dialogue).toBeHidden()

  const commande = page.getByRole('listitem').filter({ hasText: 'Épicerie Ty Bihan' }).filter({ hasText: '25 tiges Zinnia' })
  await expect(commande).toContainText(/20,00\s€/)
  await commande.getByRole('button', { name: 'Livrer et facturer' }).click()

  const livrer = page.getByRole('dialog', { name: 'Livrer et facturer' })
  await expect(livrer).toContainText('Zinnia')
  // Client « Commerce » : le canal ne se déduit pas, la facturation l'exige.
  const facturer = livrer.getByRole('button', { name: /^Facturer 20,00\s€$/ })
  await expect(facturer).toBeDisabled()
  await livrer.getByRole('combobox', { name: 'Canal' }).selectOption('Fleuriste')
  await facturer.click()
  await expect(toast(page, 'Commande livrée et facturée')).toBeVisible()
  await expect(livrer).toBeHidden()

  // La commande quitte « À livrer » pour l'historique.
  await expect(commande).toHaveCount(0)
  await page.getByRole('radiogroup', { name: 'Période' }).getByRole('radio', { name: /^Historique/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Épicerie Ty Bihan' }).filter({ hasText: '25 tiges Zinnia' })).toBeVisible()
})

test('cocher une tâche', async ({ page }) => {
  await connexion(page, 'taches')
  await expect(titre(page)).toHaveText('Tâches')

  const aFaire = page.getByRole('main').getByRole('checkbox', { checked: false })
  await expect(aFaire.first()).toBeVisible()
  // Libellé « Cocher « Pincer Bleuet » », qui devient « Décocher « … » » une fois faite.
  const libelle = await aFaire.first().getAttribute('aria-label')
  const tache = libelle?.match(/« (.+) »/)?.[1]
  expect(tache, `libellé inattendu : ${libelle}`).toBeTruthy()
  await aFaire.first().click()

  await expect(toast(page, 'Tâche faite')).toBeVisible()
  // La tâche n'est plus à faire (elle quitte la liste ou passe cochée).
  await expect(page.getByRole('main').getByRole('checkbox', { name: `Cocher « ${tache} »`, exact: true })).toHaveCount(0)
})

test('ouvrir la reprise de plan', async ({ page }) => {
  await connexion(page)
  await page.getByRole('button', { name: 'Menu de la saison' }).click()
  await page.getByRole('menuitem', { name: /Reprendre ce plan l’année suivante/ }).click()

  const dialogue = page.getByRole('dialog', { name: 'Reprendre ce plan l’année suivante' })
  await expect(dialogue).toBeVisible()
  await expect(dialogue.getByRole('combobox', { name: 'Plan à reprendre' })).toHaveValue(/.+/)
  await expect(dialogue.getByRole('region', { name: 'Aperçu du plan' })).toBeVisible()
  await expect(dialogue.getByRole('button', { name: /Créer (la saison|malgré les conflits)/ })).toBeEnabled()

  await dialogue.getByRole('button', { name: 'Annuler' }).click()
  await expect(dialogue).toBeHidden()
})
