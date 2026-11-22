// Garde-fou : la couche métier reste pure. Ce test parcourt
// src/lib/domain/**/*.ts (hors tests) et échoue s'il y trouve une lecture
// de l'horloge, un accès réseau ou base, ou un arrondi flottant de montant.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RACINE = __dirname

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const p = join(dir, nom)
    if (statSync(p).isDirectory()) return fichiers(p)
    return /\.ts$/.test(nom) && !/\.test\.ts$/.test(nom) && !/\.test-utils\.ts$/.test(nom) ? [p] : []
  })
}

/** Retire commentaires et contenu des chaînes, pour ne juger que le code. */
export function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
}

const INTERDITS: { motif: RegExp; raison: string }[] = [
  { motif: /Date\.now\s*\(/, raison: 'lit l’horloge : la date du jour doit être un paramètre' },
  { motif: /new\s+Date\s*\(\s*\)/, raison: 'new Date() sans argument lit l’horloge' },
  { motif: /\bfetch\s*\(/, raison: 'accès réseau' },
  { motif: /supabase/i, raison: 'accès base : le domaine ne connaît pas Supabase' },
  { motif: /\.toFixed\s*\(/, raison: 'arrondi flottant : passer par les centimes (montants.ts)' },
  { motif: /\bparseFloat\s*\(/, raison: 'lecture flottante d’un montant : passer par eurosEnCentimes' },
]

export function violations(source: string): string[] {
  const code = codeSeul(source)
  return INTERDITS.filter(i => i.motif.test(code)).map(i => i.raison)
}

describe('garde-fou de pureté du domaine', () => {
  const liste = fichiers(RACINE)

  it('trouve les modules du domaine', () => {
    const noms = liste.map(f => relative(RACINE, f))
    for (const m of ['dates.ts', 'occupation.ts', 'taches.ts', 'reel.ts', 'ventes.ts', 'disponibilite.ts', 'montants.ts', 'types.ts', 'index.ts']) {
      expect(noms).toContain(m)
    }
  })

  for (const f of fichiers(RACINE)) {
    it(`${relative(RACINE, f)} est pur`, () => {
      expect(violations(readFileSync(f, 'utf8'))).toEqual([])
    })
  }

  it('le détecteur attrape bien les cas interdits', () => {
    expect(violations('const t = Date.now()')).toHaveLength(1)
    expect(violations('const d = new Date()')).toHaveLength(1)
    expect(violations('const d = new Date( )')).toHaveLength(1)
    expect(violations('await fetch(url)')).toHaveLength(1)
    expect(violations("import { supabase } from '../supabase'")).toHaveLength(1)
    expect(violations('const s = (prix * q).toFixed(2)')).toHaveLength(1)
    expect(violations('const p = parseFloat(x)')).toHaveLength(1)
  })

  it('le détecteur laisse passer le légitime', () => {
    expect(violations('const t = new Date(n * MS_JOUR)')).toEqual([])
    expect(violations('// jamais new Date() ni Date.now() ici')).toEqual([])
    expect(violations("throw new Error('fetch( interdit')")).toEqual([])
  })
})
