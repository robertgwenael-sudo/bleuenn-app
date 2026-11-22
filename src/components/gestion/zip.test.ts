import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, creerZip } from './zip'

describe('archive ZIP sans dépendance', () => {
  it('CRC-32 de référence', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })

  it('archive lisible par un outil standard, noms accentués conservés', () => {
    const a = new TextEncoder().encode('bonjour')
    const b = new Uint8Array(70_000).map((_, i) => i % 251)
    const zip = creerZip([{ nom: 'justificatifs/reçu été.txt', donnees: a }, { nom: 'b.bin', donnees: b }], '2026-11-22T10:30')
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    writeFileSync(join(dir, 'a.zip'), zip)
    let python = true
    try { execFileSync('python3', ['--version']) } catch { python = false }
    if (!python) return
    const lu = execFileSync('python3', ['-I', '-c', [
      'import zipfile,sys,json', 'z=zipfile.ZipFile(sys.argv[1])', 'assert z.testzip() is None',
      'print(json.dumps([[i.filename,i.file_size,i.date_time[:5]] for i in z.infolist()]))',
    ].join('\n'), join(dir, 'a.zip')]).toString()
    expect(JSON.parse(lu)).toEqual([['justificatifs/reçu été.txt', 7, [2026, 11, 22, 10, 30]], ['b.bin', 70000, [2026, 11, 22, 10, 30]]])
    expect(readFileSync(join(dir, 'a.zip')).length).toBe(zip.length)
  })

  it('refuse un nom en double', () => {
    const d = new Uint8Array([1])
    expect(() => creerZip([{ nom: 'x', donnees: d }, { nom: 'x', donnees: d }], '2026-11-22')).toThrow(/double/)
  })
})
