import { test, expect, connexion, titre, toast, type Page } from './fixtures'

const sansDefilementHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test('mobile : barre du bas', async ({ page }) => {
  await connexion(page)
  const barre = page.getByRole('navigation', { name: 'Navigation rapide' })
  await expect(barre).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden()
  for (const nom of ['Accueil', 'Quoi semer', 'Ventes', 'Calendrier']) {
    await expect(barre.getByRole('link', { name: nom })).toBeVisible()
  }
  // Récoltes : hors barre basse, accessible par « Plus »
  await expect(barre.getByRole('link', { name: 'Récoltes' })).toHaveCount(0)

  await barre.getByRole('link', { name: 'Ventes' }).tap()
  await expect(titre(page)).toHaveText('Ventes')
  await expect(barre.getByRole('link', { name: 'Ventes' })).toHaveAttribute('aria-current', 'page')

  // « Plus » ouvre le tiroir avec le reste des sections.
  await barre.getByRole('button', { name: 'Plus' }).tap()
  const tiroir = page.getByRole('dialog')
  await expect(tiroir).toBeVisible()
  await tiroir.getByRole('link', { name: 'Tâches' }).tap()
  await expect(titre(page)).toHaveText('Tâches')
  await expect(tiroir).toBeHidden()
  expect(await sansDefilementHorizontal(page)).toBeLessThanOrEqual(0)
})

test('mobile : formulaire de récolte', async ({ page }) => {
  await connexion(page)
  await page.getByRole('navigation', { name: 'Navigation rapide' }).getByRole('button', { name: 'Plus' }).tap()
  await page.getByRole('dialog').getByRole('link', { name: 'Récoltes' }).tap()
  await expect(titre(page)).toHaveText('Récoltes')

  const culture = page.getByRole('combobox', { name: 'Culture / planche' })
  await culture.scrollIntoViewIfNeeded()
  // Cible tactile confortable au champ (h-12).
  expect((await culture.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await culture.selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Augmenter le nombre de tiges' }).tap()
  await page.getByRole('button', { name: 'Augmenter le nombre de tiges' }).tap()
  await expect(page.getByRole('spinbutton', { name: 'Tiges récoltées' })).toHaveValue('20')

  const enregistrer = page.getByRole('button', { name: 'Enregistrer la récolte' })
  await enregistrer.scrollIntoViewIfNeeded()
  // Le bouton n'est pas masqué par la barre du bas.
  const bouton = (await enregistrer.boundingBox())!
  const barre = (await page.getByRole('navigation', { name: 'Navigation rapide' }).boundingBox())!
  expect(bouton.y + bouton.height).toBeLessThanOrEqual(barre.y)
  await enregistrer.tap()

  await expect(toast(page, '20 tiges enregistrées')).toBeVisible()
  expect(await sansDefilementHorizontal(page)).toBeLessThanOrEqual(0)
})
