'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, CircleAlert, Info, Lock, Save } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, Field, Input, Textarea, cn } from '@/components/ui'
import type { FarmBilling } from '@/lib/domain'
import { MENTIONS_CONTROLEES, nettoyerSiret, reglagesManquants, siretBienForme } from '@/lib/domain/factures'
import { dejaAffichee, type ReglagesSaisie } from '@/hooks/useFactures'
import { EXEMPLES_MENTION_TVA } from './commun'

type Saisie = Record<keyof ReglagesSaisie, string>

const VIDE: Saisie = {
  raison_sociale: '', adresse: '', siret: '', email: '', telephone: '', mention_tva: '', delai_paiement_jours: '',
  conditions_paiement: '', penalites_retard: '', indemnite_recouvrement: '', iban: '', bic: '', mentions_libres: '',
  prefixe_facture: 'F', prefixe_avoir: 'AV',
}

function depuis(b: FarmBilling | null): Saisie {
  if (!b) return VIDE
  const s = { ...VIDE }
  for (const k of Object.keys(VIDE) as (keyof Saisie)[]) {
    const v = (b as unknown as Record<string, unknown>)[k]
    s[k] = v === null || v === undefined ? VIDE[k] : String(v)
  }
  return s
}

/** Réglages de facturation : identité du vendeur et mentions, avec la liste de contrôle des mentions obligatoires. */
export function Reglages({ billing, estOwner, onSave }: {
  billing: FarmBilling | null
  estOwner: boolean
  onSave: (v: ReglagesSaisie) => Promise<void>
}) {
  const [s, setS] = useState<Saisie>(() => depuis(billing))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setS(depuis(billing)) }, [billing])
  const set = (k: keyof Saisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS(x => ({ ...x, [k]: e.target.value }))

  const siret = nettoyerSiret(s.siret)
  const delai = s.delai_paiement_jours.trim() === '' ? null : Number(s.delai_paiement_jours)
  const delaiOk = delai === null || (Number.isInteger(delai) && delai >= 0 && delai <= 365)
  const prefixeOk = (p: string) => /^[A-Za-z0-9-]{1,10}$/.test(p)
  const prefixesOk = prefixeOk(s.prefixe_facture) && prefixeOk(s.prefixe_avoir) && s.prefixe_facture.toUpperCase() !== s.prefixe_avoir.toUpperCase()

  // Liste de contrôle sur la saisie en cours (ce qui sera enregistré)
  const enCours: Partial<FarmBilling> = { ...s, siret, delai_paiement_jours: delai } as unknown as Partial<FarmBilling>
  const manquantes = useMemo(() => new Set(reglagesManquants(enCours, { professionnel: true }).map(m => m.champ)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s])
  const manqueEnregistre = reglagesManquants(billing)

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (s.siret.trim() && !siretBienForme(siret)) { toast.error('SIREN ou SIRET mal formé', { description: '9 chiffres (SIREN) ou 14 chiffres (SIRET).' }); return }
    if (!delaiOk) { toast.error('Délai de paiement invalide', { description: 'Un nombre de jours entre 0 et 365, ou vide.' }); return }
    if (!prefixesOk) { toast.error('Préfixes invalides', { description: 'Lettres, chiffres ou tirets, et différents pour factures et avoirs.' }); return }
    const n = (v: string) => (v.trim() === '' ? null : v.trim())
    setBusy(true)
    try {
      await onSave({
        raison_sociale: n(s.raison_sociale), adresse: n(s.adresse), siret: n(siret), email: n(s.email), telephone: n(s.telephone),
        mention_tva: n(s.mention_tva), delai_paiement_jours: delai, conditions_paiement: n(s.conditions_paiement),
        penalites_retard: n(s.penalites_retard), indemnite_recouvrement: n(s.indemnite_recouvrement),
        iban: n(s.iban), bic: n(s.bic), mentions_libres: n(s.mentions_libres),
        prefixe_facture: s.prefixe_facture.trim(), prefixe_avoir: s.prefixe_avoir.trim(),
      })
      toast.success('Réglages de facturation enregistrés')
    } catch (err) {
      if (!dejaAffichee(err)) toast.error('Enregistrement impossible', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const lecture = !estOwner

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] xl:items-start">
      <form onSubmit={enregistrer} className="space-y-6" aria-label="Réglages de facturation">
        {lecture && (
          <p className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg-muted">
            <Lock className="h-4 w-4 shrink-0" aria-hidden /> Seul un propriétaire de la ferme peut modifier ces réglages.
          </p>
        )}
        <fieldset disabled={lecture || busy} className="space-y-6">
          <Card>
            <CardHeader title="Vendeur" description="Telles qu’elles apparaîtront sur chaque facture émise." />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom ou raison sociale *" className="sm:col-span-2">
                <Input value={s.raison_sociale} onChange={set('raison_sociale')} autoComplete="organization" />
              </Field>
              <Field label="Adresse *" className="sm:col-span-2">
                <Textarea rows={2} value={s.adresse} onChange={set('adresse')} autoComplete="street-address" />
              </Field>
              <Field label="SIREN ou SIRET *" hint="9 ou 14 chiffres, espaces acceptés"
                error={s.siret.trim() && !siretBienForme(siret) ? '9 chiffres (SIREN) ou 14 chiffres (SIRET)' : undefined}>
                <Input inputMode="numeric" value={s.siret} onChange={set('siret')} />
              </Field>
              <Field label="Téléphone">
                <Input type="tel" value={s.telephone} onChange={set('telephone')} autoComplete="tel" />
              </Field>
              <Field label="E-mail" className="sm:col-span-2">
                <Input type="email" value={s.email} onChange={set('email')} autoComplete="email" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Mention d’absence de TVA *" description="Vous ne facturez pas de TVA : la facture porte un seul « Total » et cette mention." />
            <CardContent className="space-y-3">
              <p className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>La formulation dépend de votre régime : <strong>à faire confirmer par votre comptable</strong>, puis à recopier mot pour mot.</span>
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Exemples (cliquer pour reprendre, puis vérifier)</p>
                <div className="flex flex-wrap gap-2">
                  {EXEMPLES_MENTION_TVA.map(x => (
                    <button key={x} type="button" onClick={() => setS(v => ({ ...v, mention_tva: x }))}
                      className={cn('rounded-full border px-3 py-1 text-xs transition-colors',
                        s.mention_tva === x ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg-muted hover:border-border-strong hover:text-fg')}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Mention imprimée sur les factures">
                <Textarea rows={2} value={s.mention_tva} onChange={set('mention_tva')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Paiement" description="Conditions par défaut ; le délai se choisit aussi facture par facture." />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Délai de paiement (jours)" hint="Vide ou 0 : paiement à réception"
                error={!delaiOk ? 'Entre 0 et 365 jours' : undefined}>
                <Input type="number" inputMode="numeric" min={0} max={365} value={s.delai_paiement_jours} onChange={set('delai_paiement_jours')} />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Conditions de paiement" className="sm:col-span-2" hint="Modes acceptés, escompte éventuel…">
                <Textarea rows={2} value={s.conditions_paiement} onChange={set('conditions_paiement')} />
              </Field>
              <Field label="Taux des pénalités de retard (client professionnel)" className="sm:col-span-2" hint="Texte imprimé tel quel, d’après votre comptable ou vos CGV">
                <Textarea rows={2} value={s.penalites_retard} onChange={set('penalites_retard')} />
              </Field>
              <Field label="Indemnité forfaitaire de recouvrement (client professionnel)" className="sm:col-span-2" hint="Texte imprimé tel quel, montant compris">
                <Textarea rows={2} value={s.indemnite_recouvrement} onChange={set('indemnite_recouvrement')} />
              </Field>
              <Field label="IBAN"><Input value={s.iban} onChange={set('iban')} autoComplete="off" /></Field>
              <Field label="BIC"><Input value={s.bic} onChange={set('bic')} autoComplete="off" /></Field>
              <Field label="Mentions libres (pied de page)" className="sm:col-span-2" hint="CGV, mention bio, etc.">
                <Textarea rows={2} value={s.mentions_libres} onChange={set('mentions_libres')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Numérotation" description="Numéros continus par année : F2026-0001, F2026-0002… et AV2026-0001 pour les avoirs." />
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Préfixe des factures" error={!prefixeOk(s.prefixe_facture) ? 'Lettres, chiffres ou tirets' : undefined}>
                <Input value={s.prefixe_facture} onChange={set('prefixe_facture')} maxLength={10} />
              </Field>
              <Field label="Préfixe des avoirs" error={!prefixeOk(s.prefixe_avoir) || s.prefixe_facture.toUpperCase() === s.prefixe_avoir.toUpperCase() ? 'Lettres, chiffres ou tirets, différent des factures' : undefined}>
                <Input value={s.prefixe_avoir} onChange={set('prefixe_avoir')} maxLength={10} />
              </Field>
              <p className="text-xs text-fg-subtle sm:col-span-2">Évitez de changer de préfixe en cours d’année : la série reste continue, mais deux formats de numéro cohabiteraient.</p>
            </CardContent>
          </Card>
        </fieldset>
        {estOwner && (
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-end lg:bottom-4">
            <Button type="submit" size="lg" loading={busy} className="shadow-pop"><Save className="h-4 w-4" aria-hidden /> Enregistrer les réglages</Button>
          </div>
        )}
      </form>

      <aside className="space-y-4 xl:sticky xl:top-24">
        <Card>
          <CardHeader title="Mentions obligatoires" description={manqueEnregistre.length === 0 ? 'Réglages enregistrés : complets pour émettre.' : 'Tant qu’une mention manque, aucune facture ne peut être émise.'} />
          <CardContent>
            <ul className="space-y-2 text-sm" aria-label="Liste de contrôle des mentions">
              {MENTIONS_CONTROLEES.map(m => {
                const manque = manquantes.has(m.champ)
                return (
                  <li key={m.champ} className={cn('flex items-start gap-2', manque && !m.pourProfessionnel && 'font-medium text-danger', manque && m.pourProfessionnel && 'text-warning')}>
                    {manque ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    <span>
                      {m.libelle}
                      {m.pourProfessionnel && <span className="text-xs font-normal text-fg-subtle"> · client professionnel</span>}
                      <span className="sr-only">{manque ? ' : manquant' : ' : renseigné'}</span>
                    </span>
                  </li>
                )
              })}
              <li className="flex items-start gap-2 text-fg-muted"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Numéro, dates, acheteur, lignes, total : remplis à l’émission</li>
            </ul>
          </CardContent>
        </Card>
        <p className="flex gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs text-fg-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span><strong className="text-fg">Facturation électronique 2027 : à confirmer avec votre comptable.</strong> Le SIREN du client et l’adresse de livraison peuvent déjà être ajoutés à l’émission d’une facture.</span>
        </p>
      </aside>
    </div>
  )
}
