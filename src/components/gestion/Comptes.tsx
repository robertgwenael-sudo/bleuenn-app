'use client'
import { useState } from 'react'
import { Landmark, Pencil, Plus, Wallet } from 'lucide-react'
import { Button, Card, Dialog, Field, Input, Segmented } from '@/components/ui'
import { type BankAccount, type BankAccountKind, type DateISO } from '@/lib/domain'
import { Valeur } from '@/components/couts/commun'
import type { NouveauCompte, useGestion } from '@/hooks/useGestion'
import { centimesEnSaisie, centimesOuNull, dateFr } from '@/components/justificatifs/commun'
import { enCentiemes } from '@/lib/domain'
import type { DonneesGestion } from './donnees'

/** Solde saisi : accepte le négatif (découvert) ; null si vide, undefined si illisible. */
function lireSolde(s: string): number | null | undefined {
  const t = s.replace(/[\s€]/g, '')
  if (!t) return null
  try { return enCentiemes(t, 'Solde') } catch { return undefined }
}

export function Comptes({ g, d, aujourdhui }: { g: ReturnType<typeof useGestion>; d: DonneesGestion; aujourdhui: DateISO }) {
  const [edition, setEdition] = useState<BankAccount | 'nouveau' | null>(null)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-fg-muted">Un compte par compte bancaire, et une caisse pour les espèces des marchés. Sans connexion à la banque : les mouvements viennent du relevé CSV.</p>
        <Button onClick={() => setEdition('nouveau')}><Plus className="h-4 w-4" aria-hidden /> Nouveau compte</Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Comptes">
        {d.soldes.map(({ compte, solde, aRapprocher }) => {
          const imp = g.imports.find(i => i.account_id === compte.id)
          return (
            <li key={compte.id}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    {compte.kind === 'caisse' ? <Wallet className="h-4 w-4" aria-hidden /> : <Landmark className="h-4 w-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-fg">{compte.name}</p>
                    <p className="text-xs text-fg-muted">
                      {compte.kind === 'caisse' ? 'Caisse' : 'Banque'} · solde initial {centimesOuNull(compte.solde_initial) === null ? 'non saisi' : `${centimesEnSaisie(centimesOuNull(compte.solde_initial))} €`}
                      {compte.date_solde_initial ? ` au ${dateFr(compte.date_solde_initial)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-fg-subtle">{imp ? `Dernier import : ${imp.fichier} (${dateFr(imp.created_at.slice(0, 10))})` : 'Aucun import'} · {aRapprocher} à rapprocher</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-fg-muted">Solde</p>
                    <p className="text-lg font-semibold"><Valeur g={solde} signe /></p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEdition(compte)} aria-label={`Modifier le compte ${compte.name}`}><Pencil className="h-4 w-4" aria-hidden /> Modifier</Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
      {edition && <EditionCompte compte={edition === 'nouveau' ? null : edition} aujourdhui={aujourdhui} onClose={() => setEdition(null)}
        onSave={async v => (edition === 'nouveau' ? !!(await g.creerCompte(v)) : g.majCompte(edition.id, v))} />}
    </div>
  )
}

function EditionCompte({ compte, aujourdhui, onClose, onSave }: {
  compte: BankAccount | null; aujourdhui: DateISO; onClose: () => void; onSave: (v: NouveauCompte) => Promise<boolean>
}) {
  const [name, setName] = useState(compte?.name ?? '')
  const [kind, setKind] = useState<BankAccountKind>(compte?.kind ?? 'banque')
  const [solde, setSolde] = useState(centimesEnSaisie(centimesOuNull(compte?.solde_initial)))
  const [date, setDate] = useState(compte?.date_solde_initial ?? '')
  const [busy, setBusy] = useState(false)
  const s = lireSolde(solde)
  const save = async () => {
    if (!name.trim() || s === undefined) return
    setBusy(true)
    const ok = await onSave({ name, kind, solde_initial_centimes: s, date_solde_initial: date || null })
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()} title={compte ? `Modifier · ${compte.name}` : 'Nouveau compte'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy} disabled={!name.trim() || s === undefined}>Enregistrer le compte</Button></>}>
      <div className="space-y-3">
        <Field label="Nom du compte"><Input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Compte courant pro" /></Field>
        <Segmented label="Type de compte" value={kind} onChange={setKind} options={[{ value: 'banque', label: 'Banque' }, { value: 'caisse', label: 'Caisse' }]} />
        <Field label="Solde initial (€)" error={s === undefined ? 'Montant illisible' : undefined}
          hint="Le solde au début de la date ci-dessous, lu sur un relevé. Vide : le solde du compte reste « non calculable ».">
          <Input inputMode="decimal" value={solde} onChange={e => setSolde(e.target.value)} placeholder="ex. 2 340,55" />
        </Field>
        <Field label="Date du solde initial" hint="Les mouvements antérieurs ne comptent pas dans le solde. Vide : tous les mouvements comptent.">
          <Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value)} disabled={s === null} />
        </Field>
      </div>
    </Dialog>
  )
}
