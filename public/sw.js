/* Bleuenn — service worker écrit à la main, sans dépendance.
 *
 * Rôle : que l'appli s'ouvre au champ sans réseau.
 * - Coquille (HTML de navigation) : réseau d'abord, avec délai ; repli sur
 *   la dernière copie en cache, puis sur la page d'accueil en cache.
 * - Assets `/_next/static/*` (noms hachés, immuables) : cache d'abord,
 *   dans un cache versionné, purgé à l'activation d'une nouvelle version.
 * - Images (`/_next/image`, `/images`, `/icons`) : copie en cache servie
 *   tout de suite, rafraîchie en arrière-plan.
 * - JAMAIS les appels Supabase (`*.supabase.co`) ni aucune autre origine,
 *   ni aucune requête autre que GET : les données ne passent pas par ici.
 *   Les saisies hors ligne sont gérées par l'appli (file IndexedDB).
 *
 * Version : passée dans l'URL d'enregistrement (`/sw.js?v=…`), calculée
 * par la page à partir des noms hachés de ses scripts. Nouvelle version =
 * nouvelle installation, mise en attente jusqu'au clic sur « Recharger ».
 */
/* eslint-disable no-restricted-globals */
'use strict'

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE_COQUILLE = `bleuenn-coquille-${VERSION}`
const CACHE_STATIC = `bleuenn-static-${VERSION}`
const CACHE_IMAGES = 'bleuenn-images'
const CACHES_ACTUELS = [CACHE_COQUILLE, CACHE_STATIC, CACHE_IMAGES]
const MAX_IMAGES = 80
const DELAI_NAVIGATION_MS = 4000

const COQUILLE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

function estSupabase(url) {
  return /(^|\.)supabase\.(co|in)$/.test(url.hostname)
}

function cachable(reponse) {
  return reponse && reponse.ok && reponse.status === 200 && reponse.type === 'basic' && !reponse.redirected
}

/** URLs `/_next/static/...` citées par une page HTML (scripts, styles, polices préchargées). */
function assetsDe(html) {
  const out = new Set()
  const re = /["'(](\/_next\/static\/[^"'()\s\\]+)/g
  let m
  while ((m = re.exec(html))) out.add(m[1])
  return Array.from(out)
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const coquille = await caches.open(CACHE_COQUILLE)
    const statiques = await caches.open(CACHE_STATIC)
    // L'accueil est indispensable : sans lui, pas d'ouverture hors ligne.
    const accueil = await fetch('/', { cache: 'no-store', credentials: 'same-origin' })
    if (!cachable(accueil)) throw new Error(`accueil indisponible (${accueil.status})`)
    const html = await accueil.clone().text()
    await coquille.put('/', accueil)
    await Promise.allSettled(COQUILLE.slice(1).map(u => coquille.add(u)))
    await Promise.allSettled(assetsDe(html).map(u => statiques.add(u)))
  })())
  // Pas de skipWaiting ici : la nouvelle version attend le clic « Recharger ».
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const noms = await caches.keys()
    await Promise.all(noms.filter(n => n.startsWith('bleuenn-') && !CACHES_ACTUELS.includes(n)).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  const d = event.data || {}
  if (d.type === 'SKIP_WAITING') self.skipWaiting()
  if (d.type === 'PRECACHE' && Array.isArray(d.urls)) {
    // Ressources déjà chargées par la page avant que le SW ne la contrôle
    // (premier lancement, morceaux chargés à la demande).
    event.waitUntil((async () => {
      const c = await caches.open(CACHE_STATIC)
      const urls = d.urls.filter(u => {
        try {
          const x = new URL(u, self.location.origin)
          return x.origin === self.location.origin && x.pathname.startsWith('/_next/static/')
        } catch { return false }
      })
      await Promise.allSettled(urls.map(async u => { if (!(await c.match(u))) await c.add(u) }))
    })())
  }
})

async function cacheDabord(requete) {
  const c = await caches.open(CACHE_STATIC)
  const hit = await c.match(requete)
  if (hit) return hit
  const r = await fetch(requete)
  if (cachable(r)) c.put(requete, r.clone())
  return r
}

async function imagePuisRafraichir(event) {
  const c = await caches.open(CACHE_IMAGES)
  const hit = await c.match(event.request)
  const reseau = fetch(event.request).then(async r => {
    if (cachable(r)) {
      await c.put(event.request, r.clone())
      const cles = await c.keys()
      for (const k of cles.slice(0, Math.max(0, cles.length - MAX_IMAGES))) await c.delete(k)
    }
    return r
  })
  if (hit) {
    event.waitUntil(reseau.catch(() => {}))
    return hit
  }
  return reseau
}

async function navigation(event) {
  const req = event.request
  const url = new URL(req.url)
  const c = await caches.open(CACHE_COQUILLE)
  const reseau = fetch(req).then(r => {
    if (cachable(r)) c.put(url.pathname, r.clone())
    return r
  })
  // Réseau du champ : on n'attend pas indéfiniment une page qui ne vient pas.
  const delai = new Promise(ok => setTimeout(ok, DELAI_NAVIGATION_MS, null))
  try {
    const r = await Promise.race([reseau, delai])
    if (r) return r
  } catch { /* hors ligne : repli ci-dessous */ }
  const copie = (await c.match(url.pathname)) || (await c.match('/'))
  if (copie) {
    event.waitUntil(reseau.catch(() => {}))
    return copie
  }
  try {
    return await reseau
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Bleuenn — hors ligne</title><body style="font-family:system-ui;padding:2rem;background:#f8f6f1;color:#1f241e">' +
      '<h1 style="font-size:1.3rem">Hors ligne</h1><p>Bleuenn n’a pas encore été ouverte avec du réseau sur ce téléphone. ' +
      'Ouvrez-la une fois connectée pour pouvoir l’utiliser ensuite au champ.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (estSupabase(url)) return // jamais en cache : données et authentification
  if (url.origin !== self.location.origin) return
  // Flux React Server Components : laissés au réseau.
  if (req.headers.get('RSC') || url.searchParams.has('_rsc')) return

  if (req.mode === 'navigate') {
    event.respondWith(navigation(event))
    return
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheDabord(req))
    return
  }
  if (url.pathname.startsWith('/_next/image') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(imagePuisRafraichir(event))
    return
  }
  if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/manifest.webmanifest')) || Response.error()))
  }
})
