// Téléchargement d'un fichier produit dans le navigateur, sans serveur.

/** Déclenche le téléchargement d'un texte (UTF-8, BOM compris s'il est dans le texte). */
export function telechargerTexte(nom: string, contenu: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenu], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Laisser au navigateur le temps de lire le blob avant de le libérer.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
