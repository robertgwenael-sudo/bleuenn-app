'use client'
// Réglages de production de la ferme (migration 015) : taux de pertes et
// matériel de pépinière. Réservé au propriétaire (RLS de `farms`).
import { useState } from 'react'
import type { FarmProduction } from '@/lib/domain'
import { Button, Dialog, Field, Input } from '@/components/ui'
import type { COLONNES_PRODUCTION } from '@/hooks/useProduction'

type Col = (typeof COLONNES_PRODUCTION)[number]

const CHAMPS: { col: Col; label: string; entier?: boolean; requis?: boolean; hint?: string }[] = [
  { col: 'taux_perte_semis', label: 'Pertes de levée (%)', requis: true, hint: 'Plants + x % (30 dans le tableur)' },
  { col: 'taux_perte_champ', label: 'Pertes au champ (%)', requis: true, hint: 'Tiges − x % (30 dans le tableur)' },
  { col: 'table_semis_largeur_cm', label: 'Largeur d’une table (cm)' },
  { col: 'table_semis_longueur_cm', label: 'Longueur d’une table (cm)' },
  { col: 'table_semis_nombre', label: 'Nombre de tables', entier: true },
  { col: 'table_semis_debord_cm', label: 'Débord possible (cm)', requis: true, hint: 'Total, ajouté à la largeur et à la longueur' },
  { col: 'plaque_largeur_cm', label: 'Largeur d’une plaque (cm)' },
  { col: 'plaque_longueur_cm', label: 'Longueur d’une plaque (cm)' },
  { col: 'plaque_trous', label: 'Trous par plaque', entier: true },
]

const texte = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace('.', ','))

export function ReglagesProduction({ open, onOpenChange, reglages, modifiable, migration015, onSave }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  reglages: FarmProduction | null
  modifiable: boolean
  migration015: boolean
  onSave: (v: Partial<Record<Col, number | null>>) => Promise<boolean>
}) {
  const [valeurs, setValeurs] = useState<Record<Col, string>>(() => Object.fromEntries(CHAMPS.map(c => {
    const v = reglages?.[c.col]
    const defaut = c.col === 'table_semis_debord_cm' ? '0' : c.requis ? '30' : ''
    return [c.col, v === null || v === undefined ? defaut : texte(v)]
  })) as Record<Col, string>)
  const [erreurs, setErreurs] = useState<Partial<Record<Col, string>>>({})
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const out: Partial<Record<Col, number | null>> = {}
    const err: Partial<Record<Col, string>> = {}
    for (const c of CHAMPS) {
      const s = valeurs[c.col].trim()
      if (s === '') {
        if (c.requis) err[c.col] = 'Requis'
        else out[c.col] = null
        continue
      }
      const n = Number(s.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) { err[c.col] = 'Nombre invalide'; continue }
      if (c.entier && (!Number.isInteger(n) || n <= 0)) { err[c.col] = 'Nombre entier positif'; continue }
      if (c.col.startsWith('taux') && n >= 100) { err[c.col] = 'Moins de 100 %'; continue }
      if (!c.requis && n === 0) { err[c.col] = 'Doit être positif'; continue }
      out[c.col] = n
    }
    setErreurs(err)
    if (Object.keys(err).length) return
    setSaving(true)
    const ok = await onSave(out)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Réglages de production"
      description={!migration015 ? 'Indisponible : la migration 015 n’est pas appliquée sur la base.' : !modifiable ? 'Seul un propriétaire de la ferme peut modifier ces réglages.' : 'Taux de pertes et matériel de la pépinière.'}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button type="submit" form="reglages-production" loading={saving} disabled={!modifiable || !migration015}>Enregistrer</Button>
      </>}>
      <form id="reglages-production" onSubmit={submit} className="grid grid-cols-2 gap-3">
        {CHAMPS.map(c => (
          <Field key={c.col} label={c.label} hint={c.hint} error={erreurs[c.col]} className={c.col.startsWith('taux') ? 'col-span-1' : undefined}>
            <Input inputMode="decimal" value={valeurs[c.col]} disabled={!modifiable || !migration015} data-testid={`reglage-${c.col}`}
              onChange={e => setValeurs(v => ({ ...v, [c.col]: e.target.value }))} />
          </Field>
        ))}
      </form>
    </Dialog>
  )
}
