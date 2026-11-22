// ============================================================
// Archive ZIP minimale, sans dépendance : fichiers STOCKÉS (méthode 0,
// sans compression — les justificatifs sont des JPEG et des PDF, déjà
// compressés), noms en UTF-8 (bit 11). Suffit pour remettre au comptable
// les justificatifs d'une période. Limites : 65 535 fichiers et 4 Go au
// plus (pas de ZIP64), largement au-delà d'une année de pièces.
// ============================================================

const TABLE_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(d: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < d.length; i++) c = TABLE_CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface FichierZip { nom: string; donnees: Uint8Array }

/** Date et heure DOS d'un instant `AAAA-MM-JJTHH:MM` (heure locale de l'appelant, sans fuseau). */
function dateDos(iso: string): { date: number; heure: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso)
  if (!m) throw new Error(`Date invalide pour le ZIP : ${iso}`)
  const [a, mo, j, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)]
  return { date: ((a - 1980) << 9) | (mo << 5) | j, heure: (h << 11) | (mi << 5) }
}

/** Construit l'archive. `quand` : horodatage des entrées (`AAAA-MM-JJTHH:MM`). */
export function creerZip(fichiers: FichierZip[], quand: string): Uint8Array {
  if (fichiers.length > 0xffff) throw new Error('Trop de fichiers pour une archive ZIP simple')
  const enc = new TextEncoder()
  const { date, heure } = dateDos(quand)
  const locaux: Uint8Array[] = []
  const centraux: Uint8Array[] = []
  let decalage = 0
  const noms = new Set<string>()
  for (const f of fichiers) {
    if (noms.has(f.nom)) throw new Error(`Nom en double dans l'archive : ${f.nom}`)
    noms.add(f.nom)
    const nom = enc.encode(f.nom)
    const crc = crc32(f.donnees)
    const taille = f.donnees.length
    if (decalage + 30 + nom.length + taille > 0xffffffff) throw new Error('Archive trop volumineuse (4 Go)')
    const l = new DataView(new ArrayBuffer(30))
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true); l.setUint16(8, 0, true)
    l.setUint16(10, heure, true); l.setUint16(12, date, true); l.setUint32(14, crc, true)
    l.setUint32(18, taille, true); l.setUint32(22, taille, true); l.setUint16(26, nom.length, true); l.setUint16(28, 0, true)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint16(10, 0, true); c.setUint16(12, heure, true); c.setUint16(14, date, true); c.setUint32(16, crc, true)
    c.setUint32(20, taille, true); c.setUint32(24, taille, true); c.setUint16(28, nom.length, true)
    c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true)
    c.setUint32(38, 0, true); c.setUint32(42, decalage, true)
    locaux.push(new Uint8Array(l.buffer), nom, f.donnees)
    centraux.push(new Uint8Array(c.buffer), nom)
    decalage += 30 + nom.length + taille
  }
  const tailleCentral = centraux.reduce((s, x) => s + x.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true)
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true)
  const morceaux = [...locaux, ...centraux, new Uint8Array(fin.buffer)]
  const out = new Uint8Array(morceaux.reduce((s, x) => s + x.length, 0))
  let p = 0
  for (const m of morceaux) { out.set(m, p); p += m.length }
  return out
}
