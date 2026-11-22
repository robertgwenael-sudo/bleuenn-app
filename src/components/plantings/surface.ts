/** Lit une surface saisie « 12,5 » ou « 12.5 » ; null si vide ou invalide. Surface en m², pas un montant. */
export function lireSurface(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}
