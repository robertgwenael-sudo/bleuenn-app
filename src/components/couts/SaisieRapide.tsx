'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, Clock, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CardContent, Field, Input, Segmented, Select, Textarea, cn } from '@/components/ui'
import { COST_CATEGORIES, formatEuros, type CostCategory, type DateISO, type TimeKind } from '@/lib/domain'
import { LIBELLES_CATEGORIES, LIBELLES_TRAVAUX, formatDuree, lireDuree } from '@/lib/domain/couts'
import type { NouveauTemps, NouvelleDepense } from '@/hooks/useCouts'
import { lireMontant } from './commun'

export interface OptionCulture { id: string; name: string }
export interface OptionPlanche { id: string; label: string }
export interface OptionPersonne { id: string; label: string }

const DUREES = [15, 30, 45, 60, 90, 120, 180, 240]
/** Travaux proposés en un geste ; les autres sont dans « Plus d'options ». */
const TRAVAUX_RAPIDES: TimeKind[] = ['desherbage', 'recolte', 'plantation', 'semis', 'pincage', 'tuteurage', 'irrigation', 'vente', 'administratif']
const TOUS_TRAVAUX = Object.keys(LIBELLES_TRAVAUX) as TimeKind[]

type Mode = 'temps' | 'depense'

/** Puce tactile (44 px de haut), choix exclusif. */
function Puce({ actif, onClick, children, className }: { actif: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick}
      className={cn('inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        actif ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface text-fg hover:bg-surface-2',
        className)}>
      {children}
    </button>
  )
}

function Groupe({ titre, children, id }: { titre: string; children: React.ReactNode; id: string }) {
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-2 text-xs font-medium text-fg-muted">{titre}</p>
      {/* Défilement horizontal au pouce sur téléphone, retour à la ligne sur grand écran */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:max-h-[9.75rem] sm:flex-wrap sm:overflow-y-auto sm:px-0">{children}</div>
    </div>
  )
}

export function SaisieRapide({ aujourdhui, cultures, planches, personnes, moi, onTemps, onDepense }: {
  aujourdhui: DateISO
  cultures: OptionCulture[]
  planches: OptionPlanche[]
  personnes: OptionPersonne[]
  moi: string | null
  onTemps: (t: NouveauTemps) => Promise<boolean>
  onDepense: (d: NouvelleDepense) => Promise<boolean>
}) {
  const [mode, setMode] = useState<Mode>('temps')
  const [plus, setPlus] = useState(false)
  const [busy, setBusy] = useState(false)
  // Commun
  const [date, setDate] = useState<DateISO>(aujourdhui)
  const [culture, setCulture] = useState<string | null>(null)
  const [planche, setPlanche] = useState<string>('')
  const [notes, setNotes] = useState('')
  // Temps
  const [minutes, setMinutes] = useState<number | null>(null)
  const [dureeLibre, setDureeLibre] = useState('')
  const [kind, setKind] = useState<TimeKind | null>(null)
  const [qui, setQui] = useState<string>(moi ?? '')
  // Dépense
  const [montant, setMontant] = useState('')
  const [categorie, setCategorie] = useState<CostCategory | null>(null)
  const [fournisseur, setFournisseur] = useState('')

  const dureeSaisie = dureeLibre.trim() ? lireDuree(dureeLibre) : minutes
  const montantC = lireMontant(montant)
  const nomCulture = cultures.find(c => c.id === culture)?.name

  const resume = useMemo(() => {
    if (mode === 'temps') {
      if (!dureeSaisie || !kind) return null
      return `${formatDuree(dureeSaisie)} de ${LIBELLES_TRAVAUX[kind].toLowerCase()}${nomCulture ? ` sur ${nomCulture.toLowerCase()}` : ''}`
    }
    if (!montantC || !categorie) return null
    return `${formatEuros(montantC)} · ${LIBELLES_CATEGORIES[categorie]}${nomCulture ? ` · ${nomCulture}` : ''}`
  }, [mode, dureeSaisie, kind, nomCulture, montantC, categorie])

  const reinit = () => {
    setMinutes(null); setDureeLibre(''); setKind(null); setMontant(''); setCategorie(null)
    setFournisseur(''); setNotes(''); setCulture(null); setPlanche('')
  }

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (mode === 'temps') {
      if (!dureeSaisie) { toast.error('Indiquez une durée', { description: 'Par exemple 45, 1h30 ou 1,5 h.' }); return }
      if (!kind) { toast.error('Choisissez le type de travail'); return }
      if (!qui) { toast.error('Choisissez qui a travaillé'); return }
      setBusy(true)
      const ok = await onTemps({ date, minutes: dureeSaisie, kind, culture_id: culture, planche_id: planche || null, user_id: qui, notes })
      setBusy(false)
      if (ok) { toast.success('Temps enregistré', { description: resume ?? undefined }); reinit() }
    } else {
      if (!montantC) { toast.error('Indiquez un montant positif', { description: 'Par exemple 12,50.' }); return }
      if (!categorie) { toast.error('Choisissez une catégorie'); return }
      setBusy(true)
      const ok = await onDepense({ date, category: categorie, montant_centimes: montantC, culture_id: culture, planche_id: planche || null, supplier: fournisseur, notes })
      setBusy(false)
      if (ok) { toast.success('Dépense enregistrée', { description: resume ?? undefined }); reinit() }
    }
  }

  return (
    <Card>
      <form onSubmit={enregistrer} aria-label="Saisie rapide">
        <CardContent className="space-y-4">
          <Segmented<Mode> label="Type de saisie" size="lg" value={mode} onChange={m => { setMode(m); setPlus(false) }}
            options={[
              { value: 'temps', label: 'Temps passé', icon: <Clock className="h-4 w-4" aria-hidden /> },
              { value: 'depense', label: 'Dépense', icon: <Receipt className="h-4 w-4" aria-hidden /> },
            ]} />

          {mode === 'temps' ? (
            <>
              <Groupe titre="1. Combien de temps ?" id="g-duree">
                {DUREES.map(d => (
                  <Puce key={d} actif={!dureeLibre && minutes === d} onClick={() => { setMinutes(d); setDureeLibre('') }}>{formatDuree(d)}</Puce>
                ))}
              </Groupe>
              <Groupe titre="2. Quel travail ?" id="g-travail">
                {TRAVAUX_RAPIDES.map(k => <Puce key={k} actif={kind === k} onClick={() => setKind(k)}>{LIBELLES_TRAVAUX[k]}</Puce>)}
              </Groupe>
            </>
          ) : (
            <>
              <Field label="1. Montant (€)">
                <Input inputMode="decimal" placeholder="0,00" value={montant} onChange={e => setMontant(e.target.value)}
                  className="h-12 text-lg font-semibold" autoComplete="off"
                  aria-invalid={montant !== '' && !montantC ? true : undefined} />
              </Field>
              <Groupe titre="2. Catégorie" id="g-cat">
                {COST_CATEGORIES.map(c => <Puce key={c} actif={categorie === c} onClick={() => setCategorie(c)}>{LIBELLES_CATEGORIES[c]}</Puce>)}
              </Groupe>
            </>
          )}

          <Groupe titre="3. Sur quelle culture ? (facultatif)" id="g-culture">
            <Puce actif={culture === null} onClick={() => setCulture(null)}>Aucune / général</Puce>
            {cultures.map(c => <Puce key={c.id} actif={culture === c.id} onClick={() => setCulture(c.id)}>{c.name}</Puce>)}
          </Groupe>

          <button type="button" onClick={() => setPlus(p => !p)} aria-expanded={plus}
            className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
            <ChevronDown className={cn('h-4 w-4 transition-transform', plus && 'rotate-180')} aria-hidden />
            Plus d’options (date, planche{mode === 'temps' ? ', personne, autre durée' : ', fournisseur'}, notes)
          </button>
          {plus && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date"><Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value || aujourdhui)} /></Field>
              <Field label="Planche (facultatif)" hint="Sans culture, le montant est réparti entre les cultures de la planche.">
                <Select value={planche} onChange={e => setPlanche(e.target.value)}>
                  <option value="">Aucune</option>
                  {planches.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </Field>
              {mode === 'temps' ? (
                <>
                  <Field label="Autre durée" hint="45, 1h30, 1,5 h…" error={dureeLibre.trim() && !lireDuree(dureeLibre) ? 'Durée illisible' : undefined}>
                    <Input value={dureeLibre} onChange={e => setDureeLibre(e.target.value)} placeholder="ex. 1h15" autoComplete="off" />
                  </Field>
                  <Field label="Qui a travaillé">
                    <Select value={qui} onChange={e => setQui(e.target.value)}>
                      {personnes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Autre travail">
                    <Select value={kind ?? ''} onChange={e => setKind((e.target.value || null) as TimeKind | null)}>
                      <option value="">—</option>
                      {TOUS_TRAVAUX.map(k => <option key={k} value={k}>{LIBELLES_TRAVAUX[k]}</option>)}
                    </Select>
                  </Field>
                </>
              ) : (
                <Field label="Fournisseur"><Input value={fournisseur} onChange={e => setFournisseur(e.target.value)} autoComplete="off" /></Field>
              )}
              <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
            </div>
          )}

          <div>
            <Button type="submit" size="lg" className="h-auto min-h-12 w-full whitespace-normal py-2 sm:w-auto" loading={busy} disabled={!resume}>
              {resume ? `Enregistrer : ${resume}` : mode === 'temps' ? 'Choisissez une durée et un travail' : 'Indiquez un montant et une catégorie'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
