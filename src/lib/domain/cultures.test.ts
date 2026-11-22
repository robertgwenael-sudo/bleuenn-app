import { describe, expect, it } from 'vitest'
import { plantation } from './fixtures.test-utils'
import {
  EN_PLACE_SANS_FIN, cycleDe, dateSuggeree, enRecolteLe, erreursFicheCycle, estAncienne, fenetresRecolte,
  avecDatesDeRecolte, delaiAConfirmer, finOccupation, floraisonARenseigner, lireJourMois, sansDatesDeRecolte, premiereRecolte, prochaineOccurrence, vivaceEnPlace,
} from './cultures'
import { conflitsSiAjout, libreAPartirDu, periodeOccupation, phraseOccupation, segmentsOccupation, surfaceOccupeeLe } from './occupation'
import { projeterDuplication } from './plan'

const planche = { surface_m2: 10 }

// Achillée de Marine : 30 j cellule, 335 j champ (première floraison un an
// après le semis), 15 j de récolte. Plantée en mai 2026, toujours en place.
const achillee = plantation({
  id: 'achillee', culture_name: 'Achillée', cycle: 'vivace', surface_m2: 5,
  date_semis: '2026-04-01', date_plantation: '2026-05-01', date_recolte: '2027-04-01', date_fin: '2027-04-16',
  arrachee_le: null,
})
const zinnia = plantation({
  id: 'zinnia', culture_name: 'Zinnia', surface_m2: 5,
  date_semis: '2027-04-01', date_plantation: '2027-04-24', date_recolte: '2027-06-30', date_fin: '2027-07-21',
})

describe('cycle d’une culture', () => {
  it('une culture sans cycle renseigné (avant 013) est une annuelle', () => {
    expect(cycleDe({})).toBe('annuelle')
    expect(cycleDe({ cycle: 'vivace' })).toBe('vivace')
  })
})

describe('occupation d’une vivace sur plusieurs années', () => {
  it('occupe la planche de la plantation à l’arrachage, sans date de fin tant qu’elle est en place', () => {
    expect(periodeOccupation(achillee)).toEqual({ debut: '2026-05-01', fin: EN_PLACE_SANS_FIN })
    expect(finOccupation(achillee)).toBe(EN_PLACE_SANS_FIN)
    expect(surfaceOccupeeLe([achillee], '2029-01-15')).toBe(5)
  })

  it('arrachée : libère la planche le lendemain de l’arrachage', () => {
    const arrachee = { ...achillee, arrachee_le: '2028-09-30' }
    expect(periodeOccupation(arrachee)).toEqual({ debut: '2026-05-01', fin: '2028-09-30' })
    expect(surfaceOccupeeLe([arrachee], '2028-10-01')).toBe(0)
    expect(vivaceEnPlace(arrachee, '2028-09-30')).toBe(true)
    expect(vivaceEnPlace(arrachee, '2028-10-01')).toBe(false)
  })

  it('une annuelle arrachée avant sa fin de récolte libère la planche plus tôt', () => {
    expect(periodeOccupation({ ...zinnia, arrachee_le: '2027-07-01' }).fin).toBe('2027-07-01')
  })

  it('plus de rotation possible tant qu’elle est en place : conflit chaque année', () => {
    const grande = { ...zinnia, surface_m2: 6 }
    const c = conflitsSiAjout(planche, [achillee], grande)
    expect(c).toHaveLength(1)
    expect(c[0].surface_occupee).toBe(11)
    // L'année suivante aussi
    const enCore = { ...grande, id: 'z2028', date_semis: '2028-04-01', date_plantation: '2028-04-24', date_recolte: '2028-06-30', date_fin: '2028-07-21' }
    expect(conflitsSiAjout(planche, [achillee], enCore)).toHaveLength(1)
  })

  it('la place restante à côté de la vivace reste utilisable', () => {
    expect(conflitsSiAjout(planche, [achillee], zinnia)).toEqual([])
  })

  it('« libre à partir du » : jamais pour la surface prise par une vivace en place', () => {
    expect(libreAPartirDu(planche, [achillee], 6, '2027-01-01', 60)).toBeNull()
    expect(libreAPartirDu(planche, [{ ...achillee, arrachee_le: '2027-08-31' }], 6, '2027-01-01', 60)).toBe('2027-09-01')
    expect(libreAPartirDu(planche, [achillee], 5, '2027-01-01', 60)).toBe('2027-01-01')
  })

  it('segments sans limite : la vivace court jusqu’à la borne « sans fin »', () => {
    const segs = segmentsOccupation([achillee, zinnia])
    expect(segs[segs.length - 1].fin).toBe(EN_PLACE_SANS_FIN)
    expect(segs.every(s => /^\d{4}-\d{2}-\d{2}$/.test(s.fin))).toBe(true)
  })

  it('phrase : une vivace est dite « en place », jamais « jusqu’au 30 décembre 9999 »', () => {
    const p = phraseOccupation(planche, [achillee], '2026-11-22')
    expect(p).toBe('Occupée à 5 m² sur 10 : Achillée (Saison 2026) (vivace en place)')
    expect(p).not.toMatch(/9999/)
    expect(phraseOccupation({ surface_m2: 5 }, [achillee], '2026-11-22')).toBe('Occupée par Achillée (Saison 2026) (vivace en place)')
  })
})

describe('récolte annuelle répétée', () => {
  it('une vivace fleurit chaque année dans la même fenêtre', () => {
    expect(fenetresRecolte(achillee, { debut: '2026-01-01', fin: '2029-12-31' })).toEqual([
      { debut: '2027-04-01', fin: '2027-04-16' },
      { debut: '2028-04-01', fin: '2028-04-16' },
      { debut: '2029-04-01', fin: '2029-04-16' },
    ])
    expect(enRecolteLe(achillee, '2028-04-10')).toBe(true)
    expect(enRecolteLe(achillee, '2028-05-10')).toBe(false)
  })

  it('plus aucune récolte après l’arrachage, fenêtre coupée à l’arrachage', () => {
    const arrachee = { ...achillee, arrachee_le: '2028-04-05' }
    expect(fenetresRecolte(arrachee, { debut: '2026-01-01', fin: '2030-12-31' })).toEqual([
      { debut: '2027-04-01', fin: '2027-04-16' },
      { debut: '2028-04-01', fin: '2028-04-05' },
    ])
  })

  it('une annuelle n’a qu’une fenêtre', () => {
    expect(fenetresRecolte(zinnia, { debut: '2027-01-01', fin: '2030-12-31' })).toEqual([{ debut: '2027-06-30', fin: '2027-07-21' }])
    expect(fenetresRecolte(zinnia, { debut: '2028-01-01', fin: '2028-12-31' })).toEqual([])
  })

  it('une bisannuelle (digitale) ne refleurit pas : une seule fenêtre, l’année suivante', () => {
    const digitale = plantation({ id: 'dig', cycle: 'bisannuelle', date_semis: '2026-06-01', date_plantation: '2026-07-16', date_recolte: '2027-06-01', date_fin: '2027-06-13' })
    expect(fenetresRecolte(digitale, { debut: '2026-01-01', fin: '2030-12-31' })).toEqual([{ debut: '2027-06-01', fin: '2027-06-13' }])
    expect(finOccupation(digitale)).toBe('2027-06-13')
  })
})

describe('plantations anciennes', () => {
  it('terminée avant aujourd’hui : ancienne ; en cours ou à venir : non', () => {
    const z2026 = { ...zinnia, date_fin: '2026-07-21' }
    expect(estAncienne(z2026, '2026-11-22')).toBe(true)
    expect(estAncienne(zinnia, '2026-11-22')).toBe(false)
  })

  it('une vivace en place n’est jamais ancienne, même plantée il y a des années', () => {
    const vieille = { ...achillee, date_semis: '2020-03-01', date_plantation: '2020-04-01', date_recolte: '2021-03-01', date_fin: '2021-03-16' }
    expect(estAncienne(vieille, '2026-11-22')).toBe(false)
    expect(estAncienne({ ...vieille, arrachee_le: '2025-10-01' }, '2026-11-22')).toBe(true)
  })
})

describe('duplication de plan', () => {
  it('ne recopie pas une vivace : elle est déjà en place l’année suivante', () => {
    const projets = projeterDuplication([achillee, { ...zinnia, date_semis: '2026-04-01' }], 1)
    expect(projets.map(p => p.culture_name)).toEqual(['Zinnia'])
  })
})

describe('1ère date d’implantation possible', () => {
  it('lit jj/mm et refuse un jour inexistant', () => {
    expect(lireJourMois('21/05')).toEqual({ jour: 21, mois: 5 })
    expect(lireJourMois('29/02')).toEqual({ jour: 29, mois: 2 })
    expect(lireJourMois('31/04')).toBeNull()
    expect(lireJourMois('21-05')).toBeNull()
    expect(lireJourMois('')).toBeNull()
  })

  it('prochaine occurrence : cette année si elle n’est pas passée, sinon l’an prochain', () => {
    expect(prochaineOccurrence('21/05', '2026-11-22')).toBe('2027-05-21')
    expect(prochaineOccurrence('21/05', '2027-03-01')).toBe('2027-05-21')
    expect(prochaineOccurrence('29/02', '2026-11-22')).toBe('2027-02-28')
  })

  it('date suggérée : semis tel que la mise au champ tombe à la 1ère implantation', () => {
    // Zinnia : 23 j de cellule, implantation au 21/05 → semis le 28 avril
    expect(dateSuggeree({ jours_cellule: 23, premiere_implantation: '21/05' }, '2026-11-22')).toBe('2027-04-28')
    // Plant acheté : planté directement le 21/05
    expect(dateSuggeree({ jours_cellule: 23, premiere_implantation: '21/05' }, '2026-11-22', true)).toBe('2027-05-21')
    // Sans donnée : aujourd'hui, jamais une date devinée
    expect(dateSuggeree({ jours_cellule: 23, premiere_implantation: null }, '2026-11-22')).toBe('2026-11-22')
    // Semis déjà en retard : aujourd'hui
    expect(dateSuggeree({ jours_cellule: 30, premiere_implantation: '21/05' }, '2027-05-01')).toBe('2027-05-01')
  })
})

describe('contrôle d’une fiche du catalogue', () => {
  it('Achillée 30/335/15 : refusée en annuelle (380 j), acceptée en vivace', () => {
    const fiche = { jours_cellule: 30, jours_champ: 335, jours_recolte: 15 }
    expect(erreursFicheCycle({ ...fiche, cycle: 'annuelle' })[0]).toMatch(/380 j pour une annuelle/)
    expect(erreursFicheCycle({ ...fiche, cycle: 'vivace' })).toEqual([])
  })

  it('vivace : jours au champ ignorés, délai avant 1re floraison borné', () => {
    expect(erreursFicheCycle({ jours_cellule: 0, jours_champ: 1095, jours_recolte: 21, cycle: 'vivace' })).toEqual([])
    expect(erreursFicheCycle({ jours_cellule: 0, jours_champ: 0, jours_recolte: 21, cycle: 'vivace', delai_premiere_floraison_jours: 1095 })).toEqual([])
    expect(erreursFicheCycle({ jours_cellule: 0, jours_champ: 0, jours_recolte: 21, cycle: 'vivace', delai_premiere_floraison_jours: -1 })).toHaveLength(1)
    expect(erreursFicheCycle({ jours_cellule: 0, jours_champ: 60, jours_recolte: 21, cycle: 'annuelle', delai_premiere_floraison_jours: 10 })).toHaveLength(1)
  })

  it('1ère implantation mal saisie : refusée', () => {
    expect(erreursFicheCycle({ jours_cellule: 0, jours_champ: 60, jours_recolte: 21, premiere_implantation: '32/05' })).toHaveLength(1)
  })
})

describe('première récolte calée sur la floraison', () => {
  // Retour de prod : achillée plantée le 31/03/2026 récoltée le 01/03/2027
  // (335 jours au champ, artifice du tableur). Les jours au champ sont
  // ignorés : la récolte suit le début de floraison et le délai.
  const achilleeCat = { cycle: 'vivace' as const, jours_champ: 335, debut_floraison: '15/06' }

  it('délai à confirmer (null) : prochaine floraison après la plantation, signalé', () => {
    expect(premiereRecolte(achilleeCat, '2026-03-31')).toBe('2026-06-15')
    expect(delaiAConfirmer(achilleeCat)).toBe(true)
  })

  it('délai connu : première floraison à partir de plantation + délai', () => {
    const ancolie = { cycle: 'vivace' as const, jours_champ: 0, debut_floraison: '10/05', delai_premiere_floraison_jours: 240 }
    expect(premiereRecolte(ancolie, '2026-03-01')).toBe('2027-05-10')
    expect(premiereRecolte({ ...ancolie, delai_premiere_floraison_jours: 60 }, '2026-03-01')).toBe('2026-05-10')
    expect(delaiAConfirmer(ancolie)).toBe(false)
  })

  it('sans début de floraison : aucune date de récolte, jamais devinée', () => {
    expect(premiereRecolte({ cycle: 'vivace', jours_champ: 335 }, '2026-03-31')).toBeNull()
    expect(floraisonARenseigner({ cycle: 'vivace' })).toBe(true)
    expect(floraisonARenseigner(achilleeCat)).toBe(false)
    expect(floraisonARenseigner({ cycle: 'annuelle' })).toBe(false)
    expect(delaiAConfirmer({ cycle: 'vivace' })).toBe(false)
  })

  it('une plantation sans floraison : en place, aucune fenêtre, hors prévisionnel', () => {
    const p = { ...achillee, date_recolte: null as unknown as string, date_fin: null as unknown as string }
    expect(fenetresRecolte(p, { debut: '2026-01-01', fin: '2030-12-31' })).toEqual([])
    expect(periodeOccupation(p)).toEqual({ debut: '2026-05-01', fin: EN_PLACE_SANS_FIN })
    expect(avecDatesDeRecolte([p, zinnia]).map(x => x.id)).toEqual(['zinnia'])
    expect(sansDatesDeRecolte([p, zinnia]).map(x => x.id)).toEqual(['achillee'])
    const bis = { ...p, id: 'lunaire', cycle: 'bisannuelle' as const }
    expect(periodeOccupation(bis).fin).toBe(EN_PLACE_SANS_FIN)
  })

  it('annuelle : plantation + jours au champ, floraison ignorée', () => {
    expect(premiereRecolte({ cycle: 'annuelle', jours_champ: 67, debut_floraison: '15/06' }, '2026-04-24')).toBe('2026-06-30')
  })

  it('fiche : floraison réservée aux vivaces et bisannuelles, au format jj/mm', () => {
    const f = { jours_cellule: 30, jours_champ: 0, jours_recolte: 21 }
    expect(erreursFicheCycle({ ...f, cycle: 'vivace', debut_floraison: '15/06' })).toEqual([])
    expect(erreursFicheCycle({ ...f, cycle: 'vivace', debut_floraison: '31/06' })).toHaveLength(1)
    expect(erreursFicheCycle({ jours_cellule: 23, jours_champ: 67, jours_recolte: 21, debut_floraison: '15/06' })).toHaveLength(1)
  })
})
