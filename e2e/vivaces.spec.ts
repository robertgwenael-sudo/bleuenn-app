import { test, expect, connexion, toast } from './fixtures'

// Retours de Marine (22/11/2026) : plusieurs cultures d'un coup sur une
// planche, anciennes plantations affichées autrement, vivaces en place.

test('ajouter plusieurs cultures d’un coup sur une planche', async ({ page }) => {
  await connexion(page, 'jardins')
  const planche = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Renommer la planche « PL 6 »' }) })
  await planche.getByRole('button', { name: 'Culture', exact: true }).click()

  const dlg = page.getByRole('dialog', { name: 'Ajouter des cultures' })
  await dlg.getByRole('checkbox', { name: 'Zinnia', exact: true }).check()
  await dlg.getByRole('checkbox', { name: 'Cosmos', exact: true }).check()

  // Une ligne par culture, date et surface pré-remplies
  const lignes = dlg.getByRole('list', { name: 'Cultures à planter' }).locator(':scope > li')
  await expect(lignes).toHaveCount(2)
  await expect(dlg.getByLabel('Date de semis : Zinnia')).not.toHaveValue('')
  await expect(dlg.getByLabel('Date de semis : Cosmos')).not.toHaveValue('')
  await dlg.getByLabel('Surface (m²) : Zinnia').fill('5')
  await dlg.getByLabel('Surface (m²) : Cosmos').fill('5')

  // Plant acheté : la date devient une date de plantation
  await lignes.filter({ hasText: 'Cosmos' }).getByRole('checkbox', { name: 'Plant acheté' }).check()
  await expect(dlg.getByLabel('Date de plantation : Cosmos')).toBeVisible()

  await dlg.getByRole('button', { name: /^Planter 2 cultures/ }).click()
  await expect(toast(page, '2 cultures plantées')).toBeVisible()
  await expect(dlg).toBeHidden()
})

test('bascule « Aussi l’an dernier » : anciennes plantations grisées, vivaces jamais anciennes', async ({ page }) => {
  await connexion(page, 'jardins')
  const bascule = page.getByRole('radiogroup', { name: 'Plantations affichées' })
  await expect(bascule.getByRole('radio', { name: 'Plantations en cours' })).toHaveAttribute('aria-checked', 'true')

  // Vivace plantée en 2025 : en place, jamais « ancienne »
  const achillee = page.getByRole('button', { name: /^Achillée .*vivace, jusqu’à l’arrachage/ })
  await expect(achillee).toBeVisible()
  await expect(page.getByRole('button', { name: /\(ancienne plantation\)/ })).toHaveCount(0)

  await bascule.getByRole('radio', { name: 'Aussi l’an dernier' }).click()
  await expect(page.getByRole('button', { name: /\(ancienne plantation\)/ }).first()).toBeVisible()
  await expect(achillee).toBeVisible()
  await expect(achillee).not.toHaveAccessibleName(/ancienne/)
})
