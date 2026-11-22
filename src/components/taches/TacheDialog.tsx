'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarRange, Check, Lock, MoveRight } from 'lucide-react'
import {
  JOURS_FILET_APRES_PLANTATION, JOURS_PINCAGE_APRES_PLANTATION, ajouterJours, formatDateLongue, jourSemaineIso, lundiDeSemaine,
  moisDeRattachement, type DateISO, type PlanningMensuel, type PlantingFull, type Tache,
} from '@/lib/domain'
import type { MembreEquipe, UseTaches } from '@/hooks/useTaches'
import { Button, Dialog, Field, Select, Textarea } from '@/components/ui'
import { IconeType, JOURS_LONGS, TYPES, dateCourte, jourMoisCourt, moisLong, moisSuivant, plageSemaine } from './meta'

/** Pourquoi une tâche du plan tombe à cette date. */
function regleDuPlan(t: Tache, p: PlantingFull | undefined): string {
  const semis = p ? ` (semé le ${formatDateLongue(p.date_semis)})` : ''
  const c = t.culture_name ?? 'la culture'
  switch (t.kind) {
    case 'semis': return `C’est la date de semis de ${c} saisie dans le plan.`
    case 'plantation': return p?.semis_direct
      ? `${c} se sème directement au champ : c’est sa date de semis.`
      : `Date de semis de ${c}${semis} + ${p?.jours_cellule ?? '…'} jours en cellule.`
    case 'tuteurage': return `Le filet se pose ${JOURS_FILET_APRES_PLANTATION === 0 ? 'le jour de la plantation' : `${JOURS_FILET_APRES_PLANTATION} jours après la plantation`} de ${c}${semis}.`
    case 'pincage': return `${JOURS_PINCAGE_APRES_PLANTATION} jours après la mise en place au champ de ${c}${semis}.`
    case 'recolte': return `Mise en place de ${c} + ${p?.jours_champ ?? '…'} jours au champ${semis}.`
    default: return `Date calculée depuis la plantation de ${c}${semis}.`
  }
}

export function TacheDialog({ t, onClose, taches, planning, equipe, plantings, aujourdhui }: {
  t: Tache | null
  onClose: () => void
  taches: Pick<UseTaches, 'cocher' | 'assigner' | 'noter' | 'deplacer'>
  planning: PlanningMensuel
  equipe: MembreEquipe[]
  plantings: Map<string, PlantingFull>
  aujourdhui: DateISO
}) {
  return (
    <Dialog open={t !== null} onOpenChange={o => { if (!o) onClose() }} size="md"
      title={t ? <span className="flex items-center gap-3"><IconeType kind={t.kind} />{t.source === 'plan' && t.planche_name ? t.title.replace(` — ${t.planche_name}`, '') : t.title}</span> : ''}
      description={t ? [TYPES[t.kind].label, t.due_date ? dateCourte(t.due_date, Number(aujourdhui.slice(0, 4))) : 'sans date', [t.garden_name, t.planche_name].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') : undefined}
      footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      {t && <Contenu key={t.cle} t={t} onClose={onClose} taches={taches} planning={planning} equipe={equipe} plantings={plantings} aujourdhui={aujourdhui} />}
    </Dialog>
  )
}

function Contenu({ t, onClose, taches, planning, equipe, plantings, aujourdhui }: {
  t: Tache
  onClose: () => void
  taches: Pick<UseTaches, 'cocher' | 'assigner' | 'noter' | 'deplacer'>
  planning: PlanningMensuel
  equipe: MembreEquipe[]
  plantings: Map<string, PlantingFull>
  aujourdhui: DateISO
}) {
  const [note, setNote] = useState(t.notes ?? '')
  const [enCours, setEnCours] = useState<string | null>(null)
  const lundiActuel = t.due_date ? lundiDeSemaine(t.due_date) : lundiDeSemaine(aujourdhui)
  const [semaine, setSemaine] = useState<DateISO>(lundiActuel)
  const [jour, setJour] = useState<number>(t.due_date ? jourSemaineIso(t.due_date) : 1)
  const faitPar = equipe.find(m => m.user_id === t.done_by)
  const moisTache = t.due_date ? moisDeRattachement(t.due_date) : moisDeRattachement(aujourdhui)

  const deplacer = async (cible: Parameters<UseTaches['deplacer']>[1], libelle: string) => {
    setEnCours(libelle)
    try {
      const d = await taches.deplacer(t, cible)
      if (d) { toast.success('Tâche déplacée', { description: `${t.title} : ${dateCourte(d)}` }); onClose() }
    } catch (e) {
      // deplacerTache lève pour une tâche du plan ; l'interface ne le propose pas, mais on n'avale rien.
      console.error('Déplacement refusé :', e)
      toast.error('Déplacement impossible', { description: e instanceof Error ? e.message : String(e) })
    } finally { setEnCours(null) }
  }

  return (
    <div className="space-y-5">
      {/* État */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
        <p className="text-sm text-fg-muted">
          {t.fait
            ? <>Faite{t.done_at ? ` le ${jourMoisCourt(t.done_at.slice(0, 10))}` : ''}{faitPar ? ` par ${faitPar.moi ? 'vous' : faitPar.nom}` : ''}.</>
            : 'À faire.'}
        </p>
        <Button size="md" variant={t.fait ? 'secondary' : 'primary'} onClick={() => taches.cocher(t, !t.fait)}>
          {t.fait ? 'Remettre à faire' : <><Check className="h-4 w-4" />Marquer comme faite</>}
        </Button>
      </div>

      <Field label="Assignée à">
        <Select className="h-11" value={t.assigned_to ?? ''} onChange={e => taches.assigner(t, e.target.value || null)}>
          <option value="">Personne</option>
          {equipe.map(m => <option key={m.user_id} value={m.user_id}>{m.moi ? `${m.nom} (moi)` : m.nom}</option>)}
        </Select>
      </Field>

      <div>
        <Field label="Note">
          <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Matériel, consigne, observation…" />
        </Field>
        {(note.trim() || null) !== (t.notes ?? null) && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={async () => { if (await taches.noter(t, note)) toast.success('Note enregistrée') }}>Enregistrer la note</Button>
          </div>
        )}
      </div>

      {/* Déplacer */}
      <section aria-labelledby="deplacer-titre" className="border-t border-border pt-4">
        <h3 id="deplacer-titre" className="mb-2 flex items-center gap-2 font-sans text-sm font-semibold text-fg">
          <CalendarRange className="h-4 w-4 text-fg-subtle" aria-hidden />Déplacer
        </h3>
        {t.source === 'plan' ? (
          <div className="flex gap-3 rounded-xl border border-border bg-surface-2/60 p-3 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium text-fg">Cette tâche vient du plan de culture : elle ne se déplace pas ici.</p>
              <p className="text-fg-muted">{regleDuPlan(t, t.planting_id ? plantings.get(t.planting_id) : undefined)}</p>
              <p className="text-fg-muted">Pour changer sa date, modifiez la plantation dans le plan (écran Semis) : toutes ses tâches suivront.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={enCours === 'semaine'} onClick={() => deplacer({ semaine: ajouterJours(lundiActuel, 7), jour }, 'semaine')}>
                Semaine suivante
              </Button>
              <Button variant="secondary" loading={enCours === 'mois'} onClick={() => deplacer({ mois: moisSuivant(moisTache) }, 'mois')}>
                <MoveRight className="h-4 w-4" />Mois suivant
              </Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
              <Field label="Vers la semaine">
                <Select className="h-11" value={semaine} onChange={e => setSemaine(e.target.value)}>
                  {planning.mois.map(m => (
                    <optgroup key={m.cle} label={moisLong(m.cle)}>
                      {m.semaines.map(s => (
                        <option key={s.lundi} value={s.lundi}>S{s.numero} · {plageSemaine(s.lundi)}{s.en_cours ? ' (cette semaine)' : ''}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Jour">
                <Select className="h-11" value={String(jour)} onChange={e => setJour(Number(e.target.value))}>
                  {JOURS_LONGS.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
                </Select>
              </Field>
            </div>
            <Button className="w-full" variant="secondary" loading={enCours === 'choix'} onClick={() => deplacer({ semaine, jour }, 'choix')}>
              Déplacer au {JOURS_LONGS[jour - 1]} de la S{planning.mois.flatMap(m => m.semaines).find(s => s.lundi === semaine)?.numero ?? '?'}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
