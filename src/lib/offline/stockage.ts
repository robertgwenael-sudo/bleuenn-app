import type { EntreeFile } from './types'

// ============================================================
// Stockage persistant de la file, sans dépendance.
// IndexedDB d'abord ; repli localStorage si IndexedDB est absent ou
// refuse de s'ouvrir (navigation privée iOS, quotas, WebView bridée).
// La mémoire seule sert aux tests et au dernier recours : dans ce cas
// la file le signale (`persistant: false`) pour que l'écran prévienne.
// ============================================================

export interface StockageFile {
  readonly nom: 'indexeddb' | 'localstorage' | 'memoire'
  readonly persistant: boolean
  tout(): Promise<EntreeFile[]>
  mettre(e: EntreeFile): Promise<void>
  retirer(id: string): Promise<void>
}

export function stockageMemoire(initial: EntreeFile[] = []): StockageFile {
  const m = new Map(initial.map(e => [e.id, structuredClone(e)]))
  return {
    nom: 'memoire',
    persistant: false,
    async tout() { return Array.from(m.values()).map(e => structuredClone(e)) },
    async mettre(e) { m.set(e.id, structuredClone(e)) },
    async retirer(id) { m.delete(id) },
  }
}

/** Sous-ensemble de `Storage` utilisé (facilite le faux en test). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function stockageLocal(ls: StorageLike, cle: string): StockageFile {
  const lire = (): Record<string, EntreeFile> => {
    const brut = ls.getItem(cle)
    if (!brut) return {}
    try {
      const v = JSON.parse(brut)
      return v && typeof v === 'object' ? v : {}
    } catch (e) {
      // Contenu illisible : on ne l'écrase pas en silence, on le met de côté.
      console.error('[hors ligne] file localStorage illisible, mise de côté', e)
      ls.setItem(`${cle}:illisible:${brut.length}`, brut)
      return {}
    }
  }
  return {
    nom: 'localstorage',
    persistant: true,
    async tout() { return Object.values(lire()) },
    async mettre(e) {
      const t = lire()
      t[e.id] = e
      ls.setItem(cle, JSON.stringify(t)) // lève si quota dépassé : remonté à l'appelant
    },
    async retirer(id) {
      const t = lire()
      delete t[id]
      ls.setItem(cle, JSON.stringify(t))
    },
  }
}

const STORE = 'saisies'

function promesse<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((ok, ko) => {
    req.onsuccess = () => ok(req.result)
    req.onerror = () => ko(req.error)
  })
}

function ouvrir(idb: IDBFactory, nomBase: string): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    let req: IDBOpenDBRequest
    try { req = idb.open(nomBase, 1) } catch (e) { ko(e); return }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => ok(req.result)
    req.onerror = () => ko(req.error)
    req.onblocked = () => ko(new Error('IndexedDB bloquée'))
  })
}

export async function stockageIndexedDB(idb: IDBFactory, nomBase: string): Promise<StockageFile> {
  const db = await ouvrir(idb, nomBase)
  const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const t = db.transaction(STORE, mode)
    // Écouteurs posés avant toute attente : la fin de transaction ne doit
    // pas pouvoir survenir avant qu'on l'écoute.
    const fini = new Promise<void>((ok, ko) => {
      t.oncomplete = () => ok()
      t.onerror = () => ko(t.error)
      t.onabort = () => ko(t.error ?? new Error('transaction annulée'))
    })
    const req = promesse(f(t.objectStore(STORE)))
    // Attendre la validation de la transaction : la saisie est alors sur le disque.
    const [r] = await Promise.all([req, fini])
    return r
  }
  return {
    nom: 'indexeddb',
    persistant: true,
    async tout() { return tx('readonly', s => s.getAll() as IDBRequest<EntreeFile[]>) },
    async mettre(e) { await tx('readwrite', s => s.put(e)) },
    async retirer(id) { await tx('readwrite', s => s.delete(id)) },
  }
}

/**
 * Choisit le meilleur stockage disponible. Chaque candidat est essayé
 * pour de vrai (ouverture, écriture d'essai) : sur iOS en navigation
 * privée, `indexedDB` existe mais son ouverture échoue.
 */
export async function choisirStockage(nom: string): Promise<StockageFile> {
  if (typeof indexedDB !== 'undefined') {
    try {
      return await stockageIndexedDB(indexedDB, nom)
    } catch (e) {
      console.warn('[hors ligne] IndexedDB indisponible, repli localStorage', e)
    }
  }
  try {
    const ls = window.localStorage
    const essai = `${nom}:essai`
    ls.setItem(essai, '1')
    ls.removeItem(essai)
    return stockageLocal(ls, nom)
  } catch (e) {
    console.error('[hors ligne] ni IndexedDB ni localStorage : file en mémoire seulement', e)
    return stockageMemoire()
  }
}
