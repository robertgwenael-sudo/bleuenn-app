import { test, expect, connexion, titre, toast } from './fixtures'

// « Quoi semer » : bloc « Gestion de la production et du rendement » du
// tableur de Marine, sur les données de démo (catalogue aligné sur la charte).

test('par plantation : chaîne m² → plants → + 30 % → graines, totaux par jardin, donnée manquante', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await expect(titre(page)).toHaveText('Quoi semer')
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: '2026' })

  const tableau = page.getByRole('region', { name: 'Production par plantation' })
  // Statice semée le 01/03/2026, 5 m², 5 rangs, 20 cm, 1 graine par motte, 3 tiges, 0,50 € :
  // 125 plants, 163 avec pertes, 163 graines, 375 tiges, 263 nettes, 131 €.
  // (La saison 2026 a une 2e Statice, semée en février 2027 : seed 016.)
  const statice = tableau.getByTestId('ligne-semis-table').filter({ hasText: 'Statice' }).filter({ hasText: '01/03' })
  await expect(statice).toHaveCount(1)
  for (const v of ['125', '163', '375', '263', '131 €']) await expect(statice).toContainText(v)

  // Graines par motte vides dans la charte : jamais 0, la raison est affichée
  await expect(tableau.getByTestId('ligne-semis-table').filter({ hasText: 'Amarante' })).toContainText('donnée manquante : graines par motte')
  // Plant acheté : pas de graines (Chrysanthème du 05/05/2026 ; un 2e est prévu en 2027)
  await expect(tableau.getByTestId('ligne-semis-table').filter({ hasText: 'Chrysanthème' }).filter({ hasText: '05/05' })).toContainText('plant acheté')

  await expect(tableau.getByText('Total Parcelle du Verger')).toBeVisible()
  await expect(tableau.getByText('Total général')).toBeVisible()
})

test('graines à commander : graines à semer face aux commandes', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: '2026' })
  await page.getByRole('tab', { name: 'Graines à commander' }).click()
  const t = page.getByRole('region', { name: 'Graines à commander' })
  await expect(t.getByRole('columnheader', { name: 'Reste à commander' })).toBeVisible()
  await expect(t.getByTestId('besoin-graines-table').filter({ hasText: 'Cosmos' })).toBeVisible()
  await expect(t.getByTestId('besoin-graines-table').filter({ hasText: 'Chrysanthème' })).toContainText(/\d/)
})

test('calcul libre : Statice sur 20 m² donne 500 plants, 650 avec pertes, 650 graines', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await page.getByRole('tab', { name: 'Calcul libre' }).click()
  await page.getByTestId('calcul-culture').selectOption({ label: 'Statice' })
  await page.getByTestId('calcul-m2').fill('20')
  const r = page.getByTestId('calcul-resultat')
  await expect(r).toContainText('500')
  await expect(r).toContainText('650')
  await expect(r).toContainText(/1\s050/)
  await page.getByTestId('calcul-culture').selectOption({ label: 'Lisianthus' })
  await expect(r).toContainText('donnée manquante : graines par motte')
})

test('pépinière : capacité en plaques entières, chiffre du tableur en info, dépassement signalé', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await page.getByRole('tab', { name: /Pépinière/ }).click()
  const cap = page.getByTestId('capacite-pepiniere')
  // 2 tables 196 × 297, débord 10 cm, plaques 51,5 × 33,5 à 104 trous : 4 × 9 = 36 plaques par table
  await expect(cap).toContainText('72 plaques')
  await expect(cap).toContainText('4 × 9 plaques, débord 10 cm')
  await expect(cap).toContainText('33,74 plaques par table')

  // Une seule petite table : une plaque, la charge déborde (avertit sans bloquer)
  await page.getByRole('button', { name: 'Réglages' }).click()
  await page.getByTestId('reglage-table_semis_largeur_cm').fill('60')
  await page.getByTestId('reglage-table_semis_longueur_cm').fill('40')
  await page.getByTestId('reglage-table_semis_nombre').fill('1')
  await page.getByTestId('reglage-table_semis_debord_cm').fill('0')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cap).toContainText('1 plaque ·')

  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: 'Toutes les plantations' })
  await expect(page.getByTestId('alerte-pepiniere')).toBeVisible()
  await expect(page.getByTestId('alerte-pepiniere')).toContainText('dépasse')
  const rouge = page.locator('[data-testid="semaine-pepiniere"][data-depassement="oui"]').first()
  await expect(rouge).toContainText(/Dépasse la capacité des tables : \d+ plaques? manquantes? le/)
  await expect(rouge).toContainText('En cause')
  // Propositions du domaine : date, surface, plant acheté
  await expect(rouge.getByTestId('propositions-pepiniere')).toContainText('passer en plant acheté')
  await expect(toast(page, /Échec/)).toHaveCount(0)

  // Formulaire de semis : alerte non bloquante, l'enregistrement passe
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Jardins & planches', exact: true }).click()
  await page.getByRole('button', { name: 'Culture', exact: true }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Ajouter des cultures' })
  await dlg.getByRole('searchbox', { name: 'Filtrer les cultures' }).fill('Statice')
  await dlg.getByRole('checkbox', { name: 'Statice', exact: true }).check()
  await dlg.getByLabel('Date de semis : Statice').fill('2026-07-01')
  await dlg.getByLabel('Surface (m²) : Statice').fill('2')
  // 2 m² de statice = 65 mottes = 1 plaque : tient sur la table vide en juillet
  await expect(dlg.getByTestId('alerte-semis-pepiniere')).toHaveCount(0)
  await dlg.getByLabel('Surface (m²) : Statice').fill('10')
  // 10 m² = 325 mottes = 4 plaques pour 1 : alerte et propositions, sans blocage
  const alerte = dlg.getByTestId('alerte-semis-pepiniere')
  await expect(alerte).toContainText('Dépasse la capacité des tables')
  await expect(alerte).toContainText('enregistré quand même')
  await expect(alerte).toContainText('passer en plant acheté')
  await dlg.getByRole('button', { name: /^Planter/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(toast(page, /Statice : dépasse la capacité des tables/)).toBeVisible()
})

test('tableau : tiges par semaine en plage entière, semaines arrondies au supérieur', async ({ page }) => {
  await connexion(page, 'quoi-semer')
  await page.getByRole('combobox', { name: 'Période' }).selectOption({ label: '2026' })
  // Dahlia démo 8 m² : 2 rangs, 40 cm → 40 plants, 200 tiges, 140 nettes ; 84 j → 12 semaines → « 11 à 12 »
  const dahlia = page.getByRole('region', { name: 'Production par plantation' }).getByTestId('ligne-semis-table').filter({ hasText: 'Dahlia' }).first()
  await expect(dahlia).toContainText("11 à 12")
})

test('semis : graines exactes par semis, plants achetés distingués', async ({ page }) => {
  await connexion(page, 'semis')
  const t = page.getByRole('region', { name: 'Plantations' })
  await expect(t.getByRole('columnheader', { name: /Graines à semer/ })).toBeVisible()
  // Statice du 01/03/2026 (la 2e, semée en février 2027, vient du seed 016)
  const statice = t.getByTestId('semis-ligne').filter({ hasText: 'Statice' }).filter({ hasText: '01/03' })
  await expect(statice).toContainText('163')
  await expect(t.getByTestId('semis-ligne').filter({ hasText: 'Chrysanthème' }).filter({ hasText: '05/05' })).toContainText('Plant acheté')
})
