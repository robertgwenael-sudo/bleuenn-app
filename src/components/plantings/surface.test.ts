import { describe, expect, it } from 'vitest'
import { lireSurface } from './surface'

describe('lireSurface', () => {
  it('accepte virgule et point, deux décimales au plus', () => {
    expect(lireSurface('12,5')).toBe(12.5)
    expect(lireSurface('12.25')).toBe(12.25)
    expect(lireSurface(' 1 200 ')).toBe(1200)
  })
  it('refuse vide, zéro, négatif, texte et trop de décimales', () => {
    for (const v of ['', '0', '-3', 'abc', '1,234', '12,5 m²']) expect(lireSurface(v)).toBeNull()
  })
})
