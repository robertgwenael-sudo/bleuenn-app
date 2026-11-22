import { describe, expect, it } from 'vitest'
import { FileSaisies } from './file'
import { classerReponse } from './erreurs'
import { stockageLocal, stockageMemoire, type StockageFile } from './stockage'
import type { EntreeFile, ReponseEcriture } from './types'

// ─── Faux serveur : une table en mémoire avec clé primaire ───
function fauxServeur() {
  const lignes = new Map<string, Record<string, unknown>>()
  let mode: 'ok' | 'reseau' | 'refus' | 'reponse_perdue' = 'ok'
  let appels = 0
  const envoyer = async (e: EntreeFile): Promise<ReponseEcriture> => {
    appels++
    if (mode === 'reseau') return { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
    if (mode === 'refus') return { error: { message: 'new row violates row-level security policy for table "harvests"', code: '42501' }, status: 403 }
    if (lignes.has(e.ligne.id)) {
      return { error: { message: `duplicate key value violates unique constraint "${e.table}_pkey"`, code: '23505' }, status: 409 }
    }
    lignes.set(e.ligne.id, e.ligne)
    // La ligne est écrite mais la réponse ne revient pas au téléphone.
    if (mode === 'reponse_perdue') return { error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
    return { error: null, status: 201 }
  }
  return {
    lignes, envoyer,
    set mode(m: typeof mode) { mode = m },
    get appels() { return appels },
  }
}

function creer(opts: { stockage?: StockageFile; enLigne?: () => boolean } = {}) {
  const srv = fauxServeur()
  let t = 0
  const stockage = opts.stockage ?? stockageMemoire()
  let reseau = true
  const file = new FileSaisies({
    stockage,
    envoyer: srv.envoyer,
    maintenant: () => `2026-06-01T08:00:${String(t++).padStart(2, '0')}.000Z`,
    enLigne: opts.enLigne ?? (() => reseau),
  })
  return { file, srv, stockage, couper: () => { reseau = false }, retablir: () => { reseau = true } }
}

const recolte = (id: string, tiges = 30) => ({ id, planting_id: 'p1', season_id: 's1', date: '2026-06-01', tiges, quality: 'A', notes: null })

describe('file hors ligne : mise en file', () => {
  it('avec réseau, envoie directement et ne garde rien', async () => {
    const { file, srv, stockage } = creer()
    const r = await file.enregistrer('harvests', recolte('a'), 'u1')
    expect(r).toEqual({ issue: 'envoyee' })
    expect(srv.lignes.size).toBe(1)
    expect(await stockage.tout()).toEqual([])
    expect(file.etat().enAttente).toBe(0)
  })

  it('hors ligne, pose la saisie sur le téléphone sans tenter d’envoi', async () => {
    const { file, srv, stockage, couper } = creer()
    couper()
    const r = await file.enregistrer('harvests', recolte('a'), 'u1')
    expect(r).toEqual({ issue: 'en_file' })
    expect(srv.appels).toBe(0)
    const s = await stockage.tout()
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ id: 'a', table: 'harvests', etat: 'en_attente', userId: 'u1' })
    expect(file.etat().enAttente).toBe(1)
  })

  it('erreur réseau malgré navigator.onLine : la saisie reste en file', async () => {
    const { file, srv, stockage } = creer()
    srv.mode = 'reseau'
    const r = await file.enregistrer('losses', { ...recolte('a'), reason: 'meteo' }, 'u1')
    expect(r).toEqual({ issue: 'en_file' })
    const [e] = await stockage.tout()
    expect(e).toMatchObject({ etat: 'en_attente', tentatives: 1, erreur: 'TypeError: Failed to fetch' })
  })

  it('la file survit à un redémarrage (stockage relu)', async () => {
    const stockage = stockageMemoire()
    const a = creer({ stockage })
    a.couper()
    await a.file.enregistrer('harvests', recolte('a'), 'u1')
    await a.file.enregistrer('harvests', recolte('b'), 'u1')
    const b = creer({ stockage })
    await b.file.charger()
    expect(b.file.etat().entrees.map(e => e.id)).toEqual(['a', 'b'])
  })
})

describe('file hors ligne : renvoi idempotent', () => {
  it('synchronise dans l’ordre de saisie et vide la file', async () => {
    const { file, srv, couper, retablir } = creer()
    couper()
    await file.enregistrer('harvests', recolte('a', 10), 'u1')
    await file.enregistrer('harvests', recolte('b', 20), 'u1')
    await file.enregistrer('losses', { ...recolte('c', 5), reason: 'meteo' }, 'u1')
    retablir()
    const envois: string[] = []
    file.surEnvoi(t => envois.push(...t))
    const bilan = await file.synchroniser('u1')
    expect(bilan).toEqual({ envoyees: 3, restantes: 0, rejetees: 0 })
    expect(Array.from(srv.lignes.keys())).toEqual(['a', 'b', 'c'])
    expect(envois.sort()).toEqual(['harvests', 'losses'])
    expect(file.etat().derniereSynchro).not.toBeNull()
  })

  it('réponse perdue puis renvoi : collision de clé = déjà envoyée, aucun doublon', async () => {
    const { file, srv } = creer()
    srv.mode = 'reponse_perdue'
    expect(await file.enregistrer('harvests', recolte('a'), 'u1')).toEqual({ issue: 'en_file' })
    expect(srv.lignes.size).toBe(1) // arrivée côté serveur malgré l'erreur
    srv.mode = 'ok'
    const bilan = await file.synchroniser('u1')
    expect(bilan.envoyees).toBe(1)
    expect(srv.lignes.size).toBe(1)
    expect(file.etat().entrees).toEqual([])
  })

  it('deux synchronisations simultanées ne font qu’un passage', async () => {
    const { file, srv, couper, retablir } = creer()
    couper()
    await file.enregistrer('harvests', recolte('a'), 'u1')
    retablir()
    const [x, y] = await Promise.all([file.synchroniser('u1'), file.synchroniser('u1')])
    expect(x).toBe(y)
    expect(srv.appels).toBe(1)
  })

  it('s’arrête à la première erreur réseau et garde le reste', async () => {
    const { file, srv, couper, retablir } = creer()
    couper()
    await file.enregistrer('harvests', recolte('a'), 'u1')
    await file.enregistrer('harvests', recolte('b'), 'u1')
    retablir()
    srv.mode = 'reseau'
    const bilan = await file.synchroniser('u1')
    expect(bilan).toEqual({ envoyees: 0, restantes: 2, rejetees: 0 })
    expect(srv.appels).toBe(1)
    expect(file.etat().entrees.find(e => e.id === 'a')).toMatchObject({ tentatives: 1, etat: 'en_attente' })
  })

  it('n’envoie pas la saisie d’un autre compte', async () => {
    const { file, srv, couper, retablir } = creer()
    couper()
    await file.enregistrer('harvests', recolte('a'), 'u1')
    retablir()
    expect((await file.synchroniser('u2')).envoyees).toBe(0)
    expect(srv.appels).toBe(0)
  })
})

describe('file hors ligne : rejet définitif contre erreur réseau', () => {
  it('rejet immédiat (droits) : rendu à l’appelant, rien de gardé', async () => {
    const { file, srv, stockage } = creer()
    srv.mode = 'refus'
    const r = await file.enregistrer('harvests', recolte('a'), 'u1')
    expect(r.issue).toBe('rejet')
    expect(await stockage.tout()).toEqual([])
  })

  it('rejet pendant la synchro : la saisie reste visible avec son erreur, jusqu’à suppression', async () => {
    const { file, srv, couper, retablir } = creer()
    couper()
    await file.enregistrer('harvests', recolte('a'), 'u1')
    await file.enregistrer('harvests', recolte('b'), 'u1')
    retablir()
    srv.mode = 'refus'
    const bilan = await file.synchroniser('u1')
    // Un rejet n'arrête pas la synchro : chaque saisie est jugée.
    expect(bilan).toEqual({ envoyees: 0, restantes: 0, rejetees: 2 })
    const e = file.etat().entrees[0]
    expect(e.etat).toBe('rejetee')
    expect(e.erreur).toMatch(/row-level security/)
    // Jamais renvoyée automatiquement.
    srv.mode = 'ok'
    await file.synchroniser('u1')
    expect(srv.lignes.size).toBe(0)
    await file.supprimer('a')
    expect(file.etat().entrees.map(x => x.id)).toEqual(['b'])
    // « Réessayer » la remet en attente et l'envoie.
    await file.reessayer('b', 'u1')
    expect(srv.lignes.has('b')).toBe(true)
    expect(file.etat().entrees).toEqual([])
  })

  it('une exception levée par l’envoi garde la saisie', async () => {
    const stockage = stockageMemoire()
    const file = new FileSaisies({
      stockage, maintenant: () => '2026-06-01T08:00:00.000Z', enLigne: () => true,
      envoyer: async () => { throw new TypeError('Load failed') },
    })
    expect(await file.enregistrer('harvests', recolte('a'), 'u1')).toEqual({ issue: 'en_file' })
    expect(await stockage.tout()).toHaveLength(1)
  })
})

describe('classerReponse', () => {
  const cas: [ReponseEcriture, string][] = [
    [{ error: null, status: 201 }, 'envoyee'],
    [{ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }, 'reseau'],
    [{ error: { message: 'TypeError: Load failed', code: '' } }, 'reseau'],
    [{ error: { message: 'AbortError: signal timed out', code: '' }, status: 0 }, 'reseau'],
    [{ error: { message: 'Bad gateway', code: '' }, status: 502 }, 'reseau'],
    [{ error: { message: 'JWT expired', code: 'PGRST303' }, status: 401 }, 'reseau'],
    [{ error: { message: 'duplicate key value violates unique constraint "harvests_pkey"', code: '23505' }, status: 409 }, 'deja_envoyee'],
    [{ error: { message: 'duplicate key value violates unique constraint "autre_cle"', code: '23505' }, status: 409 }, 'rejet'],
    [{ error: { message: 'new row violates row-level security policy', code: '42501' }, status: 403 }, 'rejet'],
    [{ error: { message: 'new row violates check constraint "losses_tiges_check"', code: '23514' }, status: 400 }, 'rejet'],
    [{ error: { message: 'invalid input syntax for type uuid', code: '22P02' }, status: 400 }, 'rejet'],
  ]
  it.each(cas)('%j → %s', (r, attendu) => expect(classerReponse(r)).toBe(attendu))
})

describe('repli localStorage', () => {
  it('stocke, relit et retire', async () => {
    const m = new Map<string, string>()
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
    const s = stockageLocal(ls, 'file')
    const { file, couper } = creer({ stockage: s })
    couper()
    await file.enregistrer('harvests', recolte('a'), 'u1')
    expect(JSON.parse(m.get('file')!).a.ligne.tiges).toBe(30)
    await file.supprimer('a')
    expect(await s.tout()).toEqual([])
  })

  it('un contenu illisible est mis de côté, pas écrasé en silence', async () => {
    const m = new Map<string, string>([['file', '{pas du json']])
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
    const err = console.error
    console.error = () => {}
    try {
      expect(await stockageLocal(ls, 'file').tout()).toEqual([])
    } finally { console.error = err }
    expect(Array.from(m.keys()).some(k => k.startsWith('file:illisible'))).toBe(true)
  })
})
