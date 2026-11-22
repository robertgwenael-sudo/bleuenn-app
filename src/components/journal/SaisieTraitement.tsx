'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Input, Segmented, Select, Textarea, cn } from '@/components/ui'
import {
  CIBLE_TYPES, DOSE_UNITES, LIEU_TYPES, PRODUIT_TYPES, QUANTITE_UNITES, ajouterJours, comparerDates, estDateValide,
  formatDateLongue, type DateISO, type LieuType,
} from '@/lib/domain'
import {
  LIBELLES_CIBLES, LIBELLES_LIEUX, LIBELLES_PRODUITS, controleDelaiRecolte, formatDecimalFr, lireDecimal, m2EnHa,
  validerTraitement, type ErreursTraitement, type NouveauTraitement, type SaisieTraitement,
} from '@/lib/domain/journal'
import { Encadre, Groupe, OptionsPlanches, Puce, type OptionCulture, type OptionPersonne, type OptionPlanche, type OptionPlantation } from './commun'

const AUTRE = '__autre'

interface Props {
  aujourdhui: DateISO
  planches: (OptionPlanche & { surface_m2?: number | string })[]
  jardins: { id: string; name: string }[]
  plantations: OptionPlantation[]
  cultures: OptionCulture[]
  personnes: OptionPersonne[]
  moi: string | null
  onSave: (t: NouveauTraitement) => Promise<boolean>
}

export function SaisieTraitementDialog({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nouveau traitement" size="lg"
      description="Ligne du registre phytosanitaire. Toutes les valeurs (dose, délai avant récolte…) viennent de l’étiquette du produit : l’application n’en connaît aucune.">
      <Formulaire {...props} onClose={() => onOpenChange(false)} />
    </Dialog>
  )
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left mb-3 w-full text-sm font-semibold text-fg">{titre}</legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  )
}

function Formulaire({ aujourdhui, planches, jardins, plantations, cultures, personnes, moi, onSave, onClose }: Props & { onClose: () => void }) {
  const [s, setS] = useState<SaisieTraitement>({
    date: aujourdhui, produit: '', produit_type: '', amm: '', sans_amm: false,
    dose: '', dose_unite: '', quantite_totale: '', quantite_unite: '', surface_m2: '',
    culture_id: null, culture_libelle: '', cible: '', cible_type: '',
    lieu_type: 'planche', garden_id: null, planche_id: null, lieu_libelle: '', ilot_pac: '',
    date_recolte_suivante: '', delai_avant_recolte_j: '', operateur_id: moi, operateur_nom: '',
    vent: '', temperature_c: '', notes: '',
  })
  const [cultureLibre, setCultureLibre] = useState(false)
  const [erreurs, setErreurs] = useState<ErreursTraitement>({})
  const [avertis, setAvertis] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const maj = <K extends keyof SaisieTraitement>(k: K, v: SaisieTraitement[K]) => {
    setS(cur => ({ ...cur, [k]: v }))
    setAvertis(null)
    if (erreurs[k]) setErreurs(e => ({ ...e, [k]: undefined }))
  }

  const choisirPlanche = (id: string) => {
    const pl = planches.find(p => p.id === id)
    const enPlace = plantations.filter(p => p.planche_id === id && estDateValide(p.date_semis) && comparerDates(p.date_semis, s.date) <= 0
      && (!p.date_fin || comparerDates(s.date, ajouterJours(p.date_fin, 14)) <= 0))
    setS(cur => ({
      ...cur, planche_id: id || null,
      // Préremplissage, modifiable : surface de la planche, culture si une seule est en place
      surface_m2: cur.surface_m2 || (pl?.surface_m2 != null ? String(pl.surface_m2).replace('.', ',') : ''),
      culture_id: cur.culture_id ?? (enPlace.length === 1 ? enPlace[0].culture_id : null),
    }))
    setAvertis(null)
    // Les champs préremplis ne gardent pas l'erreur d'une tentative précédente
    setErreurs(e => ({ ...e, planche_id: undefined, surface_m2: undefined, culture_libelle: undefined }))
  }

  const surfaceHa = useMemo(() => {
    const c = lireDecimal(s.surface_m2, 2)
    return c && !c.startsWith('-') && c !== '0' ? formatDecimalFr(m2EnHa(c)) : null
  }, [s.surface_m2])

  const delai = useMemo(() => {
    const n = /^\d{1,4}$/.test(s.delai_avant_recolte_j.trim()) ? Number(s.delai_avant_recolte_j.trim()) : null
    if (!estDateValide(s.date)) return null
    try { return controleDelaiRecolte(s.date, n, estDateValide(s.date_recolte_suivante) ? s.date_recolte_suivante : null) } catch { return null }
  }, [s.date, s.delai_avant_recolte_j, s.date_recolte_suivante])

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const r = validerTraitement(cultureLibre ? { ...s, culture_id: null } : s, aujourdhui)
    if (!r.ok) {
      setErreurs(r.erreurs)
      toast.error('Registre incomplet', { description: `${Object.keys(r.erreurs).length} champ(s) à compléter.` })
      return
    }
    if (r.avertissements.length && avertis === null) {
      setAvertis(r.avertissements)
      return
    }
    setBusy(true)
    const ok = await onSave(r.valeur)
    setBusy(false)
    if (ok) {
      toast.success('Traitement ajouté au registre', { description: `${r.valeur.produit} · ${formatDateLongue(r.valeur.date)}` })
      onClose()
    }
  }

  const err = (k: keyof SaisieTraitement) => erreurs[k]

  return (
    <form onSubmit={enregistrer} aria-label="Nouveau traitement" className="space-y-5" noValidate>
      <Section titre="Produit">
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Date du traitement" error={err('date')}>
            <Input type="date" value={s.date} max={aujourdhui} onChange={e => maj('date', e.target.value)} />
          </Field>
          <Field label="Nom commercial complet" error={err('produit')}>
            <Input value={s.produit} onChange={e => maj('produit', e.target.value)} autoComplete="off" placeholder="Tel qu’écrit sur l’étiquette" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de produit" error={err('produit_type')}>
            <Select value={s.produit_type} onChange={e => maj('produit_type', e.target.value as SaisieTraitement['produit_type'])}>
              <option value="">—</option>
              {PRODUIT_TYPES.map(t => <option key={t} value={t}>{LIBELLES_PRODUITS[t]}</option>)}
            </Select>
          </Field>
          <div>
            <Field label="N° d’AMM" error={err('amm')}>
              <Input value={s.amm} onChange={e => maj('amm', e.target.value)} disabled={s.sans_amm} inputMode="numeric" autoComplete="off" />
            </Field>
            <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={s.sans_amm}
                onChange={e => { maj('sans_amm', e.target.checked); if (e.target.checked) maj('amm', '') }} />
              Produit sans numéro d’AMM (auxiliaires, substance de base…)
            </label>
          </div>
        </div>
      </Section>

      <Section titre="Dose et surface">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Dose" error={err('dose')}>
            <Input inputMode="decimal" value={s.dose} onChange={e => maj('dose', e.target.value)} placeholder="ex. 1,5" autoComplete="off" />
          </Field>
          <Field label="Unité" error={err('dose_unite')}>
            <Select value={s.dose_unite} onChange={e => maj('dose_unite', e.target.value as SaisieTraitement['dose_unite'])}>
              <option value="">—</option>
              {DOSE_UNITES.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Quantité totale utilisée" error={err('quantite_totale')}>
            <Input inputMode="decimal" value={s.quantite_totale} onChange={e => maj('quantite_totale', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Unité" error={err('quantite_unite')}>
            <Select value={s.quantite_unite} onChange={e => maj('quantite_unite', e.target.value as SaisieTraitement['quantite_unite'])}>
              <option value="">—</option>
              {QUANTITE_UNITES.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
      </Section>

      <Section titre="Où et sur quoi">
        <Segmented<LieuType> label="Type de lieu" value={s.lieu_type || 'planche'} size="sm"
          onChange={v => { maj('lieu_type', v); if (v !== 'planche') setS(cur => ({ ...cur, lieu_type: v, planche_id: null })) }}
          options={LIEU_TYPES.map(l => ({ value: l, label: LIBELLES_LIEUX[l] }))} />
        {s.lieu_type === 'planche' ? (
          <Field label="Planche traitée" error={err('planche_id')}>
            <Select value={s.planche_id ?? ''} onChange={e => choisirPlanche(e.target.value)}>
              <option value="">—</option>
              <OptionsPlanches planches={planches} />
            </Select>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={s.lieu_type === 'jardin' ? 'Jardin traité' : 'Jardin (facultatif)'} error={err('garden_id')}>
              <Select value={s.garden_id ?? ''} onChange={e => maj('garden_id', e.target.value || null)}>
                <option value="">—</option>
                {jardins.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </Select>
            </Field>
            <Field label="Nom du lieu" hint={s.garden_id ? 'Facultatif : le nom du jardin est repris.' : 'ex. Tunnel nord'} error={err('lieu_libelle')}>
              <Input value={s.lieu_libelle} onChange={e => maj('lieu_libelle', e.target.value)} autoComplete="off" />
            </Field>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Surface traitée (m²)" error={err('surface_m2')} hint={surfaceHa ? `soit ${surfaceHa} ha à l’export` : 'Convertie en hectares à l’export.'}>
            <Input inputMode="decimal" value={s.surface_m2} onChange={e => maj('surface_m2', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Îlot PAC ou coordonnées (facultatif)">
            <Input value={s.ilot_pac} onChange={e => maj('ilot_pac', e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cultureLibre ? (
            <Field label="Culture traitée" error={err('culture_libelle')} hint={<button type="button" className="underline" onClick={() => setCultureLibre(false)}>Choisir dans le catalogue</button>}>
              <Input value={s.culture_libelle} onChange={e => maj('culture_libelle', e.target.value)} autoComplete="off" />
            </Field>
          ) : (
            <Field label="Culture traitée" error={err('culture_libelle')} hint={<button type="button" className="underline" onClick={() => setCultureLibre(true)}>Culture hors catalogue</button>}>
              <Select value={s.culture_id ?? ''} onChange={e => maj('culture_id', e.target.value || null)}>
                <option value="">—</option>
                {cultures.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Cible" error={err('cible')}>
            <Input value={s.cible} onChange={e => maj('cible', e.target.value)} autoComplete="off" placeholder="ex. Oïdium, pucerons" />
          </Field>
        </div>
        <Groupe titre={<>Type de cible{err('cible_type') && <span className="ml-2 text-danger">{err('cible_type')}</span>}</>} id="g-cible">
          {CIBLE_TYPES.map(c => <Puce key={c} actif={s.cible_type === c} onClick={() => maj('cible_type', c)}>{LIBELLES_CIBLES[c]}</Puce>)}
        </Groupe>
      </Section>

      <Section titre="Récolte">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Délai avant récolte (jours)" error={err('delai_avant_recolte_j')} hint="Lu sur l’étiquette du produit.">
            <Input inputMode="numeric" value={s.delai_avant_recolte_j} onChange={e => maj('delai_avant_recolte_j', e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Date de récolte suivante" error={err('date_recolte_suivante')}>
            <Input type="date" value={s.date_recolte_suivante} min={s.date} onChange={e => maj('date_recolte_suivante', e.target.value)} />
          </Field>
        </div>
        {delai && delai.dateMin && (
          <p className={cn('text-xs', delai.etat === 'non_respecte' ? 'font-medium text-danger' : 'text-fg-muted')} role="status">
            {delai.etat === 'non_respecte'
              ? `Récolte prévue ${delai.manqueJours} j trop tôt : pas avant le ${formatDateLongue(delai.dateMin)} d’après le délai saisi.`
              : `Récolte possible à partir du ${formatDateLongue(delai.dateMin)} d’après le délai saisi.`}
          </p>
        )}
      </Section>

      <Section titre="Opérateur et conditions">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Opérateur" error={err('operateur_nom')}>
            <Select value={s.operateur_id ?? AUTRE} onChange={e => maj('operateur_id', e.target.value === AUTRE ? null : e.target.value)}>
              {personnes.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value={AUTRE}>Autre personne (prestataire…)</option>
            </Select>
          </Field>
          {s.operateur_id === null && (
            <Field label="Nom de l’opérateur" error={err('operateur_nom')}>
              <Input value={s.operateur_nom} onChange={e => maj('operateur_nom', e.target.value)} autoComplete="off" />
            </Field>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vent (facultatif)">
            <Input value={s.vent} onChange={e => maj('vent', e.target.value)} placeholder="ex. faible, 10 km/h" autoComplete="off" />
          </Field>
          <Field label="Température °C (facultatif)" error={err('temperature_c')}>
            <Input inputMode="decimal" value={s.temperature_c} onChange={e => maj('temperature_c', e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <Field label="Notes (facultatif)">
          <Textarea rows={2} value={s.notes} onChange={e => maj('notes', e.target.value)} />
        </Field>
      </Section>

      {avertis && (
        <Encadre tone="amber">
          <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />À vérifier avant d’enregistrer</p>
          <ul className="list-disc pl-5 text-fg-muted">{avertis.map(a => <li key={a}>{a}</li>)}</ul>
        </Encadre>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" size="lg" className="sm:h-10 sm:text-sm" loading={busy}>
          {avertis ? 'Enregistrer quand même' : 'Ajouter au registre'}
        </Button>
      </div>
    </form>
  )
}
