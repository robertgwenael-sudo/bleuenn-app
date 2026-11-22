import { afterEach, describe, expect, it } from 'vitest'
import {
  ajouterAnnees, ajouterJours, cleMois, dernierDuMois, fenetreMensuelle, formatMois, moisEntre, premierLundiDuMois, ajouterMois, chevauche, cleSemaine, dureeJours, ecartJours,
  estDateValide, fenetreGlissante, formatDateLongue, formatJourMois, formatSemaine, intersection,
  jourSemaineIso, lundiDeSemaine, lundisEntre, lundiSemaineIso, semaineIso, semainesDansAnnee,
} from './dates'

describe('ajout de jours et de mois', () => {
  it('passe l’année', () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01')
    expect(ajouterJours('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('gère le 29 février', () => {
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29')
    expect(ajouterJours('2027-02-28', 1)).toBe('2027-03-01')
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29')
    expect(ajouterMois('2027-01-31', 1)).toBe('2027-02-28')
    expect(ajouterAnnees('2028-02-29', 1)).toBe('2029-02-28')
    expect(ajouterAnnees('2028-02-29', 4)).toBe('2032-02-29')
  })

  it('suit la chaîne semis → plantation → récolte → fin à travers l’hiver', () => {
    // Renoncule semée le 15 septembre 2026 : 30 j en cellule, 150 au champ, 62 de récolte
    const plantation = ajouterJours('2026-09-15', 30)
    const recolte = ajouterJours(plantation, 150)
    const fin = ajouterJours(recolte, 62)
    expect([plantation, recolte, fin]).toEqual(['2026-10-15', '2027-03-14', '2027-05-15'])
    expect(ecartJours('2026-09-15', fin)).toBe(242)
  })

  it('refuse une date inexistante ou mal formée', () => {
    expect(() => ajouterJours('2027-02-29', 1)).toThrow(/inexistante/)
    expect(() => ajouterJours('15/05/2027', 1)).toThrow(/invalide/)
    expect(estDateValide('2028-02-29')).toBe(true)
    expect(estDateValide('2100-02-29')).toBe(false)
    expect(estDateValide(null)).toBe(false)
  })

  it('ajoute des mois négatifs', () => {
    expect(ajouterMois('2027-03-31', -1)).toBe('2027-02-28')
    expect(ajouterMois('2027-01-15', -13)).toBe('2025-12-15')
  })
})

describe('semaines ISO', () => {
  it('2026 a 53 semaines : le 1er janvier 2027 est en semaine 53 de 2026', () => {
    expect(semainesDansAnnee(2026)).toBe(53)
    expect(semaineIso('2027-01-01')).toEqual({ annee: 2026, semaine: 53 })
    expect(semaineIso('2027-01-03')).toEqual({ annee: 2026, semaine: 53 })
    expect(semaineIso('2027-01-04')).toEqual({ annee: 2027, semaine: 1 })
    expect(cleSemaine('2027-01-01')).toBe('2026-W53')
  })

  it('le 30 décembre 2024 est en semaine 1 de 2025', () => {
    expect(semaineIso('2024-12-30')).toEqual({ annee: 2025, semaine: 1 })
    expect(semainesDansAnnee(2027)).toBe(52)
  })

  it('lundi de semaine et lundi d’une semaine numérotée', () => {
    expect(jourSemaineIso('2026-11-22')).toBe(7) // dimanche
    expect(lundiDeSemaine('2026-11-22')).toBe('2026-11-16')
    expect(lundiDeSemaine('2027-01-01')).toBe('2026-12-28')
    expect(lundiSemaineIso(2026, 53)).toBe('2026-12-28')
    expect(lundiSemaineIso(2027, 1)).toBe('2027-01-04')
    expect(lundiSemaineIso(2025, 1)).toBe('2024-12-30')
    expect(() => lundiSemaineIso(2027, 53)).toThrow(/pas de semaine 53/)
  })

  it('semaine contenant le 29 février', () => {
    expect(semaineIso('2028-02-29')).toEqual({ annee: 2028, semaine: 9 })
    expect(lundiDeSemaine('2028-02-29')).toBe('2028-02-28')
  })

  it('liste les lundis d’un intervalle à cheval sur deux années', () => {
    expect(lundisEntre({ debut: '2026-12-24', fin: '2027-01-12' }))
      .toEqual(['2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11'])
  })
})

describe('fenêtre glissante et intervalles', () => {
  it('par défaut, aujourd’hui → veille du même jour dans 12 mois', () => {
    expect(fenetreGlissante('2026-11-22')).toEqual({ debut: '2026-11-22', fin: '2027-11-21' })
    expect(fenetreGlissante('2026-11-22', 3)).toEqual({ debut: '2026-11-22', fin: '2027-02-21' })
    expect(dureeJours(fenetreGlissante('2027-03-01'))).toBe(366) // traverse le 29 février 2028
  })

  it('chevauchement d’intervalles fermés', () => {
    const a = { debut: '2026-10-15', fin: '2027-05-15' }
    expect(chevauche(a, { debut: '2027-05-15', fin: '2027-09-30' })).toBe(true)
    expect(chevauche(a, { debut: '2027-05-16', fin: '2027-09-30' })).toBe(false)
    expect(intersection(a, { debut: '2027-01-01', fin: '2027-12-31' })).toEqual({ debut: '2027-01-01', fin: '2027-05-15' })
    expect(intersection(a, { debut: '2028-01-01', fin: '2028-12-31' })).toBeNull()
  })
})

describe('affichage', () => {
  it('formate en français sans Intl', () => {
    expect(formatJourMois('2027-05-15')).toBe('15 mai')
    expect(formatJourMois('2027-06-01', 2027)).toBe('1er juin')
    expect(formatJourMois('2027-05-15', 2026)).toBe('15 mai 2027')
    expect(formatDateLongue('2028-02-29')).toBe('29 février 2028')
    expect(formatSemaine('2027-06-09')).toBe('semaine 23 (du 7 au 13 juin 2027)')
    expect(formatSemaine('2027-01-01')).toBe('semaine 53 (du 28 décembre 2026 au 3 janvier 2027)')
  })
})

describe('indépendance du fuseau horaire', () => {
  const tz = process.env.TZ
  afterEach(() => { process.env.TZ = tz })

  for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Europe/Paris']) {
    it(`donne les mêmes résultats en ${zone}`, () => {
      process.env.TZ = zone
      expect(ajouterJours('2026-06-01', 0)).toBe('2026-06-01')
      expect(ajouterJours('2026-03-28', 1)).toBe('2026-03-29') // passage à l'heure d'été
      expect(ajouterJours('2026-03-29', 1)).toBe('2026-03-30')
      expect(lundiDeSemaine('2027-01-01')).toBe('2026-12-28')
      expect(ecartJours('2026-03-01', '2026-11-01')).toBe(245)
    })
  }
})

describe('mois civils', () => {
  it('fenêtre mensuelle : mois en cours + 11 mois', () => {
    expect(fenetreMensuelle('2026-11-22')).toEqual({ debut: '2026-11-01', fin: '2027-10-31' })
    expect(fenetreMensuelle('2027-03-15', 12).fin).toBe('2028-02-29')
    expect(moisEntre(fenetreMensuelle('2026-11-22'))).toHaveLength(12)
  })

  it('clés, bornes et libellés', () => {
    expect(cleMois('2026-12-31')).toBe('2026-12')
    expect(dernierDuMois('2028-02-10')).toBe('2028-02-29')
    expect(formatMois('2026-11')).toBe('novembre 2026')
    expect(formatMois('2027-01-04')).toBe('janvier 2027')
    expect(moisEntre({ debut: '2026-12-15', fin: '2027-01-02' })).toEqual(['2026-12', '2027-01'])
    expect(premierLundiDuMois('2027-01')).toBe('2027-01-04')
    expect(premierLundiDuMois('2027-03')).toBe('2027-03-01')
  })
})
