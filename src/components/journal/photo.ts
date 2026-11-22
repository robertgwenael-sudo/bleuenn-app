// Réduction d'une photo dans le navigateur avant l'envoi : grand côté à
// 1600 px au plus, JPEG qualité 0,8. Une photo de téléphone (3 à 8 Mo)
// passe ainsi sous 500 Ko environ, ce qui compte au champ avec un réseau
// faible. L'orientation EXIF est appliquée (createImageBitmap
// `imageOrientation: 'from-image'`, sinon <img> qui l'applique aussi).
import { dimensionsReduites } from '@/lib/domain/journal'
import type { PhotoPreparee } from '@/hooks/useJournal'

export const COTE_MAX = 1600
export const QUALITE_JPEG = 0.8

async function decoder(fichier: Blob): Promise<{ source: CanvasImageSource; largeur: number; hauteur: number; liberer: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
      return { source: b, largeur: b.width, hauteur: b.height, liberer: () => b.close() }
    } catch {
      // Format non pris en charge par createImageBitmap : repli sur <img>
    }
  }
  const url = URL.createObjectURL(fichier)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw new Error('Image illisible (format non pris en charge ?)', { cause: e })
  }
}

/** Réduit et réencode une photo. Lève si l'image ne peut pas être lue. */
export async function preparerPhoto(fichier: Blob): Promise<PhotoPreparee & { apercu: string }> {
  if (!fichier.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image')
  const img = await decoder(fichier)
  try {
    const { largeur, hauteur } = dimensionsReduites(img.largeur, img.hauteur, COTE_MAX)
    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    const c2d = canvas.getContext('2d')
    if (!c2d) throw new Error('Canvas indisponible')
    c2d.imageSmoothingQuality = 'high'
    c2d.drawImage(img.source, 0, 0, largeur, hauteur)
    const blob = await new Promise<Blob>((ok, ko) =>
      canvas.toBlob(b => (b ? ok(b) : ko(new Error('Encodage JPEG impossible'))), 'image/jpeg', QUALITE_JPEG))
    return { blob, largeur, hauteur, apercu: URL.createObjectURL(blob) }
  } finally {
    img.liberer()
  }
}
