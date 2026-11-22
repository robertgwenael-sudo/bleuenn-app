import { test, expect, connexion, titre, type Page } from './fixtures'

// « Vérification » affiche les mêmes estimations que « Quoi semer » pour les
// mêmes plantations (calculerProduction, taux de la ferme), une donnée
// manquante au lieu d'une valeur par défaut, et garde les vivaces sans
// floraison avec « floraison à renseigner ».

/** Culture + plants, + pertes, graines, tiges, nettes, tiges/sem., revenu, CA/sem. */
async function lignes(page: Page, selecteur: string, colonnes: number[]): Promise<string[]> {
  const rows = page.locator(selecteur)
  await expect(rows.first()).toBeVisible()
  return (await rows.evaluateAll((trs, cols) => trs.map(tr => {
    const tds = Array.from(tr.querySelectorAll('td'))
    const culture = tds[1].querySelector('span')?.textContent?.trim() ?? ''
    return [culture, ...cols.map(i => (tds[i].textContent ?? '').replace(/\s+/g, ' ').trim())].join(' | ')
  }), colonnes)).sort()
}

test('mêmes chiffres que « Quoi semer » pour les plantations de la saison', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: '2026' })
  // Quoi semer : planche, culture, entrée, m², J, K, L, N, O, P, R, S
  const semer = await lignes(page, '[data-testid="ligne-semis-table"]', [4, 5, 6, 7, 8, 9, 10, 11])
  const totalSemer = (await page.getByRole('region', { name: 'Production par plantation' }).locator('tfoot tr').innerText()).replace(/\s+/g, ' ')

  await page.goto('/#verification')
  await expect(titre(page)).toHaveText('Tableau de vérification')
  // Vérification : planche, culture, m², J, K, L, N, O, P, prix, R, S
  const verif = await lignes(page, '[data-testid="ligne-verification"]', [3, 4, 5, 6, 7, 8, 10, 11])
  // Lignes datées seulement : Quoi semer ne liste pas les vivaces sans floraison
  const datees = verif.filter(l => !l.includes('floraison à renseigner'))
  expect(datees).toEqual(semer)

  const nb = (t: string) => t.replace(/\s+/g, ' ')
  for (const id of ['plants', 'graines', 'tiges', 'revenu']) {
    const v = nb(await page.getByTestId(`verification-total-${id}`).innerText())
    expect(totalSemer, `total ${id}`).toContain(v)
  }
})

test('donnée manquante affichée, jamais de valeur par défaut ; vivace sans floraison gardée', async ({ page }) => {
  await connexion(page, 'verification')
  const t = page.getByRole('region', { name: 'Tableau de vérification' })
  // Statice, 5 m², 5 rangs, 20 cm : 125 plants, 163 avec pertes, 375 tiges, 263 nettes, 131 €
  const statice = t.getByTestId('ligne-verification').filter({ hasText: 'Statice' }).first()
  for (const v of ['125', '163', '375', '263', '131 €']) await expect(statice).toContainText(v)
  await expect(t.getByTestId('ligne-verification').filter({ hasText: 'Amarante' }).first()).toContainText('donnée manquante : graines par motte')

  const rudbeckia = t.getByTestId('ligne-verification').filter({ hasText: 'Rudbeckia' })
  await expect(rudbeckia).toHaveCount(1)
  await expect(rudbeckia).toContainText('floraison à renseigner')
  await expect(page.getByTestId('verification-sans-floraison')).toContainText('Rudbeckia')
  // Plus de « −30 % perte » en dur ni de tiret cadratin
  await expect(t.getByRole('columnheader', { name: 'Tiges − 30 %' })).toBeVisible()
  await expect(page.getByRole('main')).not.toContainText('—')
})
