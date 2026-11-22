'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Version de l'appli vue par la page : empreinte des noms (hachés) de ses
 * scripts `/_next/static`. Elle change à chaque déploiement qui modifie le
 * code, et elle est identique d'un serveur à l'autre pour un même build.
 */
function versionPage(): string {
  const srcs = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
    .map(s => s.getAttribute('src') || '')
    .filter(s => s.includes('/_next/static/'))
    .sort()
    .join('|')
  let h = 5381
  for (let i = 0; i < srcs.length; i++) h = ((h << 5) + h + srcs.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/**
 * Enregistre `public/sw.js`, en production seulement : jamais en dev
 * (rechargement à chaud cassé par le cache) ni en mode démo (données
 * fictives, rien ne doit survivre ni se mélanger à la vraie appli).
 */
export default function EnregistrementServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEMO === '1') return
    if (!('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker
    let rechargementDemande = false

    const annoncer = (reg: ServiceWorkerRegistration) => {
      toast('Nouvelle version disponible', {
        id: 'sw-nouvelle-version',
        description: 'Rechargez pour en profiter. Les saisies en attente sont conservées.',
        duration: Infinity,
        action: {
          label: 'Recharger',
          onClick: () => {
            rechargementDemande = true
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            else window.location.reload()
          },
        },
      })
    }
    const surChangement = () => { if (rechargementDemande) window.location.reload() }
    sw.addEventListener('controllerchange', surChangement)

    let reg: ServiceWorkerRegistration | null = null
    const verifier = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && reg) reg.update().catch(() => {})
    }
    sw.register(`/sw.js?v=${versionPage()}`, { scope: '/', updateViaCache: 'none' })
      .then(r => {
        reg = r
        // Une version attend déjà (installée lors d'une visite précédente).
        if (r.waiting && sw.controller) annoncer(r)
        r.addEventListener('updatefound', () => {
          const w = r.installing
          w?.addEventListener('statechange', () => {
            // `controller` nul = première installation : rien à annoncer.
            if (w.state === 'installed' && sw.controller) annoncer(r)
          })
        })
        // Ressources déjà chargées avant que le SW ne contrôle la page.
        const urls = performance.getEntriesByType('resource').map(e => e.name)
          .filter(u => u.startsWith(`${location.origin}/_next/static/`))
        sw.ready.then(ok => ok.active?.postMessage({ type: 'PRECACHE', urls }))
        document.addEventListener('visibilitychange', verifier)
      })
      .catch(e => console.error('[service worker] enregistrement impossible', e))

    return () => {
      sw.removeEventListener('controllerchange', surChangement)
      document.removeEventListener('visibilitychange', verifier)
    }
  }, [])
  return null
}
