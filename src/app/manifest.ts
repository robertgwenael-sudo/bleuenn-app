import type { MetadataRoute } from 'next'

// Couleurs de la marque (src/app/globals.css) : lin chaud en fond,
// vert feuillage pour la barre système.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Bleuenn — Ferme florale',
    short_name: 'Bleuenn',
    description: 'Gestion de la ferme florale : plan de culture, récoltes au champ, ventes.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8f6f1',
    theme_color: '#2e6538',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Saisir une récolte', short_name: 'Récolte', url: '/#recoltes', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
