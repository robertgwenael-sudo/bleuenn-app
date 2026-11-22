import { SECTIONS } from '../src/components/shell/nav'
import { test, expect, connexion, titre } from './fixtures'

// Une section par test : une erreur console est rattachée à l'écran fautif.
for (const s of SECTIONS) {
  test(`section « ${s.label} » (#${s.id})`, async ({ page }) => {
    await connexion(page)
    const nav = page.getByRole('navigation', { name: 'Navigation principale' })
    await nav.getByRole('link', { name: s.label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#${s.id}$`))
    await expect(nav.getByRole('link', { name: s.label, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(titre(page)).toBeVisible()
    // Laisse aux chargements de l'écran (latence démo ~200 ms) le temps
    // d'aboutir ou d'échouer : une lecture refusée affiche un toast d'erreur.
    await page.waitForTimeout(800)
    await expect(page.getByText(/^Impossible de charger/)).toHaveCount(0)
  })
}
