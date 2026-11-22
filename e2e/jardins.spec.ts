import { test, expect, connexion, toast } from './fixtures'

test('modifier la surface d’un jardin et d’une planche', async ({ page }) => {
  await connexion(page, 'jardins')

  // Jardin : nom, surface et description
  await page.getByRole('button', { name: /^Modifier Jardin du Haut/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Modifier le jardin' })
  await dlg.getByLabel('Surface (m²)').fill('250,5')
  await dlg.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(toast(page, 'Jardin mis à jour')).toBeVisible()
  await expect(page.getByText(/250,5 m²|250\.5 m²/).first()).toBeVisible()

  // Planche : surface invalide refusée, puis surface réduite avec avertissement non bloquant
  await page.getByRole('button', { name: /^Modifier PL 1 \(nom, surface\)/ }).first().click()
  const dp = page.getByRole('dialog', { name: 'Modifier la planche' })
  await dp.getByLabel('Surface (m²)').fill('abc')
  await expect(dp.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  await dp.getByLabel('Surface (m²)').fill('14')
  await dp.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(toast(page, 'Planche mise à jour')).toBeVisible()
})
