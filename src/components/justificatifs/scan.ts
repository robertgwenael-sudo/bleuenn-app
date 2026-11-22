// ============================================================
// « Scan » d'un justificatif dans le navigateur, par canvas, sans
// dépendance :
//  1. orientation EXIF appliquée (createImageBitmap `from-image`) ;
//  2. recadrage sur le papier quand il se détache d'un fond plus sombre ;
//  3. redressement simple : l'angle (± 6°) qui aligne le mieux les lignes
//     de texte (profil de projection), estimé sur une version réduite ;
//  4. rendu « document » : niveaux de gris, étirement des niveaux (1 % et
//     99 % des pixels), légère courbe qui blanchit le fond ;
//  5. grand côté à 1600 px au plus, JPEG qualité 0,8.
// Un PDF n'est pas traité : il est gardé tel quel.
// ============================================================
import { dimensionsReduites } from '@/lib/domain/journal'
import type { PagePreparee } from '@/hooks/useJustificatifs'

export const COTE_MAX = 1600
export const QUALITE_JPEG = 0.8
export const TAILLE_MAX_PDF = 15 * 1024 * 1024

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

function canvas(l: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(l)); c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('Canvas indisponible')
  g.imageSmoothingQuality = 'high'
  return { c, g }
}

/** Luminance 0–255 d'une image RGBA. */
function luminances(d: ImageData): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.width * d.height)
  const p = d.data
  for (let i = 0, j = 0; i < p.length; i += 4, j++) out[j] = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000
  return out
}

/** Seuil d'Otsu sur un histogramme de luminances. */
function otsu(lum: Uint8ClampedArray): number {
  const h = new Array<number>(256).fill(0)
  for (const v of lum) h[v]++
  let somme = 0
  for (let i = 0; i < 256; i++) somme += i * h[i]
  let sB = 0, wB = 0, best = 0, seuil = 127
  for (let t = 0; t < 256; t++) {
    wB += h[t]
    if (!wB) continue
    const wF = lum.length - wB
    if (!wF) break
    sB += t * h[t]
    const mB = sB / wB, mF = (somme - sB) / wF
    const v = wB * wF * (mB - mF) ** 2
    if (v > best) { best = v; seuil = t }
  }
  return seuil
}

/**
 * Cadre du papier (en fraction de l'image) : lignes et colonnes où plus
 * de 40 % des pixels sont clairs. null si le papier remplit déjà l'image
 * ou si rien de net ne se dégage.
 */
function cadrePapier(lum: Uint8ClampedArray, l: number, h: number): { x: number; y: number; l: number; h: number } | null {
  const seuil = otsu(lum)
  const clairL = new Array<number>(h).fill(0)
  const clairC = new Array<number>(l).fill(0)
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) if (lum[y * l + x] > seuil) { clairL[y]++; clairC[x]++ }
  const lignes = clairL.map(n => n / l > 0.4)
  const cols = clairC.map(n => n / h > 0.4)
  const y0 = lignes.indexOf(true), y1 = lignes.lastIndexOf(true)
  const x0 = cols.indexOf(true), x1 = cols.lastIndexOf(true)
  if (y0 < 0 || x0 < 0) return null
  const cadre = { x: x0 / l, y: y0 / h, l: (x1 - x0 + 1) / l, h: (y1 - y0 + 1) / h }
  if (cadre.l * cadre.h > 0.92 || cadre.l < 0.25 || cadre.h < 0.25) return null
  return cadre
}

/** Angle (degrés) qui maximise la variance du profil horizontal des pixels sombres. */
function angleTexte(lum: Uint8ClampedArray, l: number, h: number): number {
  const seuil = Math.min(otsu(lum), 160)
  const pts: [number, number][] = []
  for (let y = 0; y < h; y += 1) for (let x = 0; x < l; x += 1) if (lum[y * l + x] < seuil) pts.push([x - l / 2, y - h / 2])
  if (pts.length < 200 || pts.length > l * h * 0.5) return 0
  let best = 0, bestScore = -1
  for (let a = -6; a <= 6.001; a += 0.25) {
    const r = (a * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r)
    const prof = new Float64Array(h * 2)
    for (const [x, y] of pts) {
      const yy = Math.round(-x * s + y * c + h)
      if (yy >= 0 && yy < prof.length) prof[yy]++
    }
    let m = 0
    for (const v of prof) m += v
    m /= prof.length
    let v2 = 0
    for (const v of prof) v2 += (v - m) ** 2
    if (v2 > bestScore) { bestScore = v2; best = a }
  }
  return Math.abs(best) < 0.3 ? 0 : best
}

export interface OptionsScan { document: boolean }

/**
 * Prépare une page : image améliorée en JPEG, ou PDF gardé tel quel.
 * Lève avec un message clair si le fichier ne peut pas être lu.
 */
export async function preparerPage(fichier: File, opts: OptionsScan = { document: true }): Promise<PagePreparee & { apercu: string; redresse: number }> {
  if (fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name)) {
    if (fichier.size > TAILLE_MAX_PDF) throw new Error('PDF trop lourd (15 Mo au plus)')
    return { blob: fichier, mime: 'application/pdf', largeur: null, hauteur: null, nom: fichier.name, apercu: '', redresse: 0 }
  }
  if (!fichier.type.startsWith('image/') && fichier.type !== '') throw new Error('Ce fichier n’est ni une image ni un PDF')
  const img = await decoder(fichier)
  try {
    // Analyse sur une version réduite (400 px)
    const k = Math.min(1, 400 / Math.max(img.largeur, img.hauteur))
    const petit = canvas(img.largeur * k, img.hauteur * k)
    petit.g.drawImage(img.source, 0, 0, petit.c.width, petit.c.height)
    const lumPetit = luminances(petit.g.getImageData(0, 0, petit.c.width, petit.c.height))
    const cadre = opts.document ? cadrePapier(lumPetit, petit.c.width, petit.c.height) : null
    const angle = opts.document ? angleTexte(lumPetit, petit.c.width, petit.c.height) : 0

    // Recadrage (marge de 2 %) puis réduction à 1600 px
    const m = 0.02
    const sx = cadre ? Math.max(0, cadre.x - m) * img.largeur : 0
    const sy = cadre ? Math.max(0, cadre.y - m) * img.hauteur : 0
    const sl = cadre ? Math.min(img.largeur - sx, (cadre.l + 2 * m) * img.largeur) : img.largeur
    const sh = cadre ? Math.min(img.hauteur - sy, (cadre.h + 2 * m) * img.hauteur) : img.hauteur
    const { largeur, hauteur } = dimensionsReduites(Math.round(sl), Math.round(sh), COTE_MAX)
    const out = canvas(largeur, hauteur)
    out.g.fillStyle = '#fff'
    out.g.fillRect(0, 0, largeur, hauteur)
    if (angle) {
      out.g.translate(largeur / 2, hauteur / 2)
      out.g.rotate((-angle * Math.PI) / 180)
      out.g.translate(-largeur / 2, -hauteur / 2)
    }
    out.g.drawImage(img.source, sx, sy, sl, sh, 0, 0, largeur, hauteur)
    out.g.setTransform(1, 0, 0, 1, 0, 0)

    if (opts.document) {
      const d = out.g.getImageData(0, 0, largeur, hauteur)
      const lum = luminances(d)
      const hist = new Array<number>(256).fill(0)
      for (const v of lum) hist[v]++
      const percentile = (p: number) => { let n = 0; for (let i = 0; i < 256; i++) { n += hist[i]; if (n >= lum.length * p) return i } return 255 }
      const bas = percentile(0.01), haut = Math.max(bas + 1, percentile(0.99))
      const lut = new Uint8ClampedArray(256)
      for (let i = 0; i < 256; i++) {
        const t = Math.min(1, Math.max(0, (i - bas) / (haut - bas)))
        lut[i] = 255 * Math.pow(t, 1.35)   // fond blanchi, encre renforcée
      }
      const p = d.data
      for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = lut[lum[j]]; p[i] = v; p[i + 1] = v; p[i + 2] = v }
      out.g.putImageData(d, 0, 0)
    }
    const blob = await new Promise<Blob>((ok, ko) =>
      out.c.toBlob(b => (b ? ok(b) : ko(new Error('Encodage JPEG impossible'))), 'image/jpeg', QUALITE_JPEG))
    return { blob, mime: 'image/jpeg', largeur, hauteur, nom: fichier.name || 'scan.jpg', apercu: URL.createObjectURL(blob), redresse: angle }
  } finally {
    img.liberer()
  }
}
