import { test, expect, connexion, titre, toast, type Page } from './fixtures'

// Saisons civiles (migration 016). La démo reproduit la prod : une seule
// saison-plan « 2026 » (plus l'historique 2025), qui contient déjà les bulbes
// plantés le 01/11/2026 et des semis de février 2027, et une vivace en place.
// Jour figé : 22/11/2026.

async function menuSaison(page: Page, action: RegExp) {
  await page.getByRole('button', { name: 'Menu de la saison' }).click()
  await page.getByRole('menuitem', { name: action }).click()
}
const saisonActive = (page: Page) => page.getByRole('combobox', { name: 'Saison', exact: true }).first()

test('disponibilité : l’aneth est là, sur 12 mois comme par année civile', async ({ page }) => {
  await connexion(page, 'disponibilite')
  await expect(titre(page)).toHaveText('Disponibilité des fleurs')

  const aVendre = page.getByRole('region', { name: 'Tiges disponibles par culture et par semaine' })
  await expect(aVendre.getByRole('rowheader', { name: 'Aneth' })).toBeVisible()
  await expect(aVendre.getByRole('rowheader', { name: 'Tulipe' })).toBeVisible()

  await page.getByRole('tab', { name: 'Calendrier de l’année' }).click()
  await expect(page.getByRole('combobox', { name: 'Année' })).toHaveValue('2026')
  const cal2026 = page.getByRole('region', { name: 'Récoltes par semaine en 2026' })
  await expect(cal2026.getByRole('rowheader', { name: /Aneth/ })).toBeVisible()
  await expect(cal2026.getByRole('rowheader', { name: /Tulipe/ })).toHaveCount(0) // fleurit en 2027

  await page.getByRole('combobox', { name: 'Année' }).selectOption('2027')
  const cal2027 = page.getByRole('region', { name: 'Récoltes par semaine en 2027' })
  for (const nom of ['Aneth', 'Anémone', 'Tulipe', 'Renoncule']) {
    await expect(cal2027.getByRole('rowheader', { name: new RegExp(nom) })).toBeVisible()
  }
  const aneth = cal2027.locator('tr', { has: page.getByRole('rowheader', { name: /Aneth/ }) })
  await expect(aneth.getByText('En récolte semaine 1 (du 4 au 10 janvier 2027)')).toBeAttached()
})

test('calendrier : le filtre saison couvre au moins l’année civile', async ({ page }) => {
  await connexion(page, 'calendrier')
  await page.getByRole('combobox', { name: 'Période affichée' }).selectOption({ label: '2026' })
  await expect(page.getByRole('main').getByText(/^2026 : du 1er janvier 2026 au .* 2027$/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Calendrier hebdomadaire' }).getByText('Tulipe').first()).toBeVisible()
})

test('passer la saison-plan 2026 en 2027, de bout en bout', async ({ page }) => {
  await connexion(page)
  await expect(saisonActive(page).locator('option:checked')).toHaveText('2026')
  await menuSaison(page, /Passer cette saison en 2027/)
  const dlg = page.getByRole('dialog', { name: 'Passer cette saison en 2027' })

  const decalees = dlg.getByRole('region', { name: 'Plantations décalées en 2027' })
  const laissees = dlg.getByRole('region', { name: 'Plantations laissées en place' })
  await expect(decalees.getByText('Cosmos').first()).toBeVisible()          // annuelle de 2026 : décalée
  await expect(laissees.getByText('Tulipe')).toBeVisible()                   // bulbe de novembre : non décalé
  await expect(laissees.locator('li', { hasText: 'Pivoine' })).toContainText('vivace en place')
  await expect(laissees.locator('li', { hasText: 'Statice' }).last()).toContainText('première récolte déjà dans l’année')

  await dlg.getByRole('button', { name: 'Passer en 2027' }).click()
  await expect(toast(page, 'La saison est maintenant 2027')).toBeVisible()
  await expect(dlg).toBeHidden()
  await expect(saisonActive(page).locator('option:checked')).toHaveText('2027')

  // Les bulbes et la vivace n'ont pas bougé, le reste du plan est en 2027
  await page.goto('/#calendrier')
  await page.getByRole('combobox', { name: 'Période affichée' }).selectOption({ label: '2027' })
  await expect(page.getByRole('main').getByText(/^2027 : du .* au .*/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Calendrier hebdomadaire' }).getByText('Tulipe').first()).toBeVisible()
})

test('préparer 2027 depuis l’accueil : créer, rattacher, reprendre', async ({ page }) => {
  await connexion(page)
  const carte = page.getByRole('region', { name: 'Préparer la saison 2027' })
  await carte.getByRole('button', { name: 'Créer 2027' }).click()
  const dlg = page.getByRole('dialog', { name: 'Préparer 2027' })

  await dlg.getByRole('button', { name: 'Créer la saison 2027' }).click()
  await expect(dlg.getByText('La saison « 2027 » existe, du 1er janvier au 31 décembre 2027.')).toBeVisible()

  const liste = dlg.getByRole('list', { name: 'Plantations à rattacher à 2027' })
  const cases = liste.getByRole('checkbox')
  await expect(cases).toHaveCount(23) // bulbes de novembre, semis d'hiver et de 2027…
  await expect(liste.getByRole('checkbox', { name: /^Rattacher Tulipe/ })).toBeChecked()
  await cases.first().uncheck()
  await dlg.getByRole('button', { name: 'Rattacher 22 plantations à 2027' }).click()
  await expect(toast(page, '22 plantations rattachées à 2027')).toBeVisible()

  const etape3 = dlg.getByRole('region', { name: /Étape 3/ })
  await expect(etape3).toContainText('2 vivaces en place') // pivoine (016) et rudbeckia sans floraison (013)
  await etape3.getByRole('button', { name: /^Reprendre \d+ plantations?$/ }).click()
  await expect(toast(page, /plantations? reprises? dans 2027/)).toBeVisible()

  await dlg.getByRole('button', { name: 'Ouvrir 2027' }).click()
  await expect(saisonActive(page).locator('option:checked')).toHaveText('2027')
})

test('nouvelle plantation : saison proposée = année de la première récolte, modifiable', async ({ page }) => {
  await connexion(page, 'jardins')
  await page.getByRole('button', { name: 'Culture', exact: true }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Ajouter des cultures' })
  await dlg.getByRole('checkbox', { name: 'Tulipe', exact: true }).check()
  await dlg.getByLabel('Date de semis : Tulipe', { exact: true }).fill('2026-11-01')
  // Pas encore de saison 2027 : repli sur la saison active, dit à l'écran
  await expect(dlg.getByText('Première récolte en 2027, mais la ferme n\'a pas encore de saison 2027 : rattachée à 2026. Créez la saison 2027 pour l\'y ranger.')).toBeVisible()
  await dlg.getByLabel('Date de semis : Tulipe', { exact: true }).fill('2026-03-01')
  await expect(dlg.getByText('Première récolte en 2026 : rattachée à 2026.')).toBeVisible()
  await expect(dlg.getByRole('combobox', { name: 'Saison de la plantation' }).locator('option:checked')).toHaveText('2026')
  await dlg.getByRole('button', { name: /^Planter/ }).click()
  await expect(toast(page, 'Tulipe planté')).toBeVisible()
})

test('analytique : semaines datées et contiguës, années séparées', async ({ page }) => {
  await connexion(page, 'analytique')
  await expect(titre(page)).toHaveText('Analytique')
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: 'Année 2027' })
  const parSemaine = page.getByRole('tabpanel', { name: 'Prévisionnel par semaine' })
  await expect(parSemaine.locator('tbody tr')).toHaveCount(52) // 2027 : 52 semaines ISO, vides comprises
  await expect(parSemaine.locator('tbody tr').first()).toContainText('S1')
  await expect(parSemaine.getByText('Tulipe').first()).toBeVisible()
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: 'Année 2026' })
  await expect(parSemaine.locator('tbody tr')).toHaveCount(53)
  await expect(parSemaine.getByText('Tulipe')).toHaveCount(0)
})

test('reprise de plan : une seule saison par année civile', async ({ page }) => {
  await connexion(page)
  await menuSaison(page, /Reprendre ce plan l’année suivante/)
  const dlg = page.getByRole('dialog', { name: 'Reprendre ce plan l’année suivante' })
  await dlg.getByLabel('Année civile').fill('2026')
  await dlg.getByRole('button', { name: /Créer (la saison|malgré les conflits)/ }).click()
  await expect(dlg.getByText('La saison 2026 existe déjà (« 2026 »).')).toBeVisible()
  await expect(dlg).toBeVisible()
})
