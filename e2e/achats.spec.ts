import { test, expect, connexion, titre, toast } from './fixtures'

// Parcours complet d'un achat, en mode démo (jour figé au 22/11/2026) :
// besoins → brouillons → envoi (numéro BC-2026-003, les seeds en ont deux)
// → réception partielle → réception totale → dépenses dans Coûts & rentabilité.
test('préparer, envoyer et réceptionner un bon de commande', async ({ page }) => {
  await connexion(page, 'commandes')
  await expect(titre(page)).toHaveText('Achats & bons de commande')
  await expect(page.getByRole('region', { name: 'Besoins en graines et plants' })).toBeVisible()

  // 1. Brouillons depuis les besoins
  await page.getByRole('button', { name: 'Préparer les bons de commande' }).click()
  const preparer = page.getByRole('dialog', { name: 'Préparer les bons de commande' })
  const kerlann = preparer.getByRole('listitem', { name: 'Brouillon : Semencerie de Kerlann' })
  await expect(kerlann).toContainText('Bleuet')
  // Le groupe sans fournisseur habituel attend un choix : on le décoche.
  const aChoisir = preparer.getByRole('listitem', { name: 'Brouillon : Fournisseur à choisir' })
  if (await aChoisir.count()) await aChoisir.getByRole('checkbox').uncheck()
  await preparer.getByRole('button', { name: /^Créer \d+ brouillons?$/ }).click()
  await expect(toast(page, /brouillons? créés?/)).toBeVisible()
  await expect(preparer).toBeHidden()

  // 2. Le brouillon : compléter les prix à saisir, puis envoyer
  await expect(page.getByRole('tab', { name: /^Bons de commande/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('radiogroup', { name: 'Filtrer par statut' }).getByRole('radio', { name: /^Brouillons/ }).click()
  await page.getByRole('button', { name: 'Brouillon — Semencerie de Kerlann' }).click()
  let detail = page.getByRole('dialog', { name: /^Brouillon/ })
  await detail.getByRole('button', { name: 'Modifier' }).click()
  const editeur = page.getByRole('dialog', { name: 'Modifier le brouillon' })
  const prix = editeur.getByPlaceholder('à saisir')
  for (let i = await prix.count(); i > 0; i--) {
    const champ = prix.nth(i - 1)
    if (!(await champ.inputValue())) await champ.fill('0,05')
  }
  await editeur.getByRole('textbox', { name: 'Frais de port (€)' }).fill('4,90')
  await editeur.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
  await expect(toast(page, 'Brouillon enregistré')).toBeVisible()

  detail = page.getByRole('dialog', { name: /^Brouillon/ })
  await detail.getByRole('button', { name: 'Envoyer' }).click()
  await page.getByRole('dialog', { name: 'Envoyer ce bon ?' }).getByRole('button', { name: 'Envoyer' }).click()
  await expect(toast(page, 'Bon BC-2026-003 envoyé')).toBeVisible()
  detail = page.getByRole('dialog', { name: /^BC-2026-003/ })
  await expect(detail).toContainText('Envoyé')
  // Envoyé : plus de modification possible
  await expect(detail.getByRole('button', { name: 'Modifier' })).toHaveCount(0)

  // 3. Réception partielle : la première ligne seulement, à moitié
  await detail.getByRole('button', { name: 'Réceptionner' }).click()
  let reception = page.getByRole('dialog', { name: 'Réceptionner BC-2026-003' })
  const premier = reception.getByRole('spinbutton').first()
  await premier.fill('10')
  await expect(reception).toContainText('Dépenses créées dans Coûts & rentabilité')
  await reception.getByRole('button', { name: 'Valider la réception' }).click()
  await expect(toast(page, 'BC-2026-003 reçu partiellement')).toBeVisible()
  await expect(toast(page, /2 dépenses créées/)).toBeVisible() // ligne + port
  detail = page.getByRole('dialog', { name: /^BC-2026-003/ })
  await expect(detail).toContainText('Reçu partiellement')

  // 4. Réception totale : le reste, sans redoubler le port
  await detail.getByRole('button', { name: 'Réceptionner' }).click()
  reception = page.getByRole('dialog', { name: 'Réceptionner BC-2026-003' })
  await reception.getByRole('button', { name: 'Tout est arrivé' }).click()
  await expect(reception).not.toContainText('dont')
  await reception.getByRole('button', { name: 'Valider la réception' }).click()
  await expect(toast(page, 'BC-2026-003 entièrement reçu')).toBeVisible()
  detail = page.getByRole('dialog', { name: /^BC-2026-003/ })
  await expect(detail).toContainText('Reçu')
  await expect(detail.getByRole('button', { name: 'Réceptionner' })).toHaveCount(0)
  await expect(detail.getByRole('heading', { name: /^Dépenses créées \(\d+\)$/ })).toBeVisible()
  await expect(detail.getByText('BC-2026-003 · frais de port')).toHaveCount(1)

  // 5. Les dépenses sont dans Coûts & rentabilité
  await detail.getByRole('link', { name: 'Voir dans Coûts & rentabilité' }).click()
  await expect(titre(page)).toHaveText('Coûts & rentabilité')
  await expect(page.getByText(/BC-2026-003 · frais de port/)).toBeVisible()
  await expect(page.getByText(/BC-2026-003 · Bleuet/).first()).toBeVisible()
})

test('fiche fournisseur et page d’impression du bon', async ({ page }) => {
  await connexion(page, 'fournisseurs')
  await expect(titre(page)).toHaveText('Fournisseurs')
  await page.getByRole('button', { name: /^Semencerie de Kerlann/ }).click()
  const fiche = page.getByRole('dialog', { name: /Semencerie de Kerlann/ })
  await expect(fiche.getByRole('link', { name: 'commandes@kerlann-semences.exemple' })).toHaveAttribute('href', 'mailto:commandes@kerlann-semences.exemple')
  await expect(fiche).toContainText('2025') // 016 : la saison porte le nom de son année
  await fiche.getByRole('link', { name: 'Imprimer BC-2025-007' }).click()

  await expect(page.getByRole('heading', { name: 'Bon de commande', level: 1 })).toBeVisible()
  const bon = page.getByRole('article', { name: 'Bon de commande BC-2025-007' })
  await expect(bon).toContainText('Les Jardins de Bleuenn')
  await expect(bon).toContainText('Semencerie de Kerlann')
  await expect(bon).toContainText(/Total\s*77,70\s€/)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Copier pour un email' }).click()
  await expect(toast(page, 'Texte du bon copié')).toBeVisible()
  const texte = await page.evaluate(() => navigator.clipboard.readText())
  expect(texte).toContain('Objet : bon de commande BC-2025-007 — Les Jardins de Bleuenn')
})

test('archiver un fournisseur', async ({ page }) => {
  await connexion(page, 'fournisseurs')
  await page.getByRole('button', { name: /^Emballages Stered/ }).click()
  await page.getByRole('dialog', { name: /Emballages Stered/ }).getByRole('button', { name: 'Archiver' }).click()
  await page.getByRole('dialog', { name: 'Archiver Emballages Stered ?' }).getByRole('button', { name: 'Archiver' }).click()
  await expect(toast(page, 'Fournisseur archivé')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Archivés/ }).click()
  await expect(page.getByRole('button', { name: /^Emballages Stered/ })).toBeVisible()
})
