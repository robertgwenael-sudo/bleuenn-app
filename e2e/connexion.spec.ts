import { test, expect, connexion, titre } from './fixtures'

test('connexion démo puis déconnexion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Mode démo : saisissez n’importe quelle adresse')).toBeVisible()
  await connexion(page)
  await expect(page.getByRole('status').filter({ hasText: 'Mode démo' })).toBeVisible()
  await expect(titre(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()

  await page.getByRole('button', { name: 'Menu utilisateur' }).click()
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
})
