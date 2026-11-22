import { test as base, expect, type Page } from '@playwright/test'

/**
 * Jour figé à Paris : les données de démo commerciales sont datées par rapport
 * à aujourd'hui, les récoltes et plantations sont à dates fixes (saison 2026).
 * Seule l'horloge `Date` est figée ; les minuteries tournent normalement.
 */
export const AUJOURDHUI = new Date('2026-11-22T10:00:00+01:00')

type Fixtures = { erreursConsole: string[] }

/**
 * Chaque test échoue s'il a produit une erreur console ou une exception non
 * rattrapée : un écran qui « marche » en avalant une erreur reste un échec.
 */
export const test = base.extend<Fixtures>({
  erreursConsole: [async ({ page }, use) => {
    const erreurs: string[] = []
    page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()) })
    page.on('pageerror', e => erreurs.push(`exception : ${e.message}`))
    await page.clock.setFixedTime(AUJOURDHUI)
    await use(erreurs)
    expect(erreurs, 'erreurs console pendant le test').toEqual([])
  }, { auto: true }],
})

export { expect }
export type { Page } from '@playwright/test'

/** Connexion démo par l'écran de connexion (n'importe quels identifiants). */
export async function connexion(page: Page, section = '') {
  await page.goto(section ? `/#${section}` : '/')
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('marine@ferme.fr')
  await page.getByRole('textbox', { name: 'Mot de passe' }).fill('demo-demo')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('main')).toBeVisible()
}

/** Titre de l'écran courant. */
export const titre = (page: Page) => page.getByRole('main').getByRole('heading', { level: 1 })

/** Dernier toast affiché (sonner). */
export const toast = (page: Page, texte: string | RegExp) =>
  page.getByRole('region', { name: /Notifications/ }).getByText(texte).first()
