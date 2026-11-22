'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, FlaskConical, Info, Sprout } from 'lucide-react'
import { Badge, Dialog, EmptyState, Field, Select, Skeleton } from '@/components/ui'
import { formatJourMois, type JournalEntry, type JournalPhoto, type PlantingFull, type Treatment } from '@/lib/domain'
import { LIBELLES_NOTES, frisePlanche, retoursDeCulture } from '@/lib/domain/journal'
import type { UrlsPhotos } from '@/hooks/useJournal'
import { Encadre, ICONES_NOTES, OptionsPlanches, TONS_NOTES, type OptionPlanche } from './commun'
import { Vignette } from './ListeNotes'

type Etat = { plancheId: string; plantations: PlantingFull[] | null; erreur: string | null }

/**
 * Historique d'une planche sur plusieurs années : toutes ses plantations
 * (vue plantings_full filtrée par planche, sans filtre de saison), les notes
 * du journal et les traitements, avec une alerte douce si une culture
 * revient d'une année sur l'autre.
 */
export function HistoriquePlanche({ plancheId, onChange, planches, entries, treatments, photosParNote, urls, charger, anneeRef }: {
  /** Année du jour (Paris) : les dates d'une autre année l'affichent. */
  anneeRef: number
  plancheId: string | null
  onChange: (id: string | null) => void
  planches: OptionPlanche[]
  entries: JournalEntry[]
  treatments: Treatment[]
  photosParNote: Map<string, JournalPhoto[]>
  urls: UrlsPhotos
  charger: (plancheId: string) => Promise<PlantingFull[]>
}) {
  const [etat, setEtat] = useState<Etat | null>(null)

  useEffect(() => {
    if (!plancheId) return
    let annule = false
    charger(plancheId)
      .then(p => { if (!annule) setEtat({ plancheId, plantations: p, erreur: null }) })
      .catch(e => { if (!annule) setEtat({ plancheId, plantations: null, erreur: e instanceof Error ? e.message : String(e) }) })
    return () => { annule = true }
  }, [plancheId, charger])

  const courant = etat && etat.plancheId === plancheId ? etat : null
  const planche = planches.find(p => p.id === plancheId)

  const vue = useMemo(() => {
    if (!plancheId || !courant?.plantations) return null
    const plantations = courant.plantations.map(p => ({
      id: p.id, culture_id: p.culture_id, culture_name: p.culture_name, date_semis: p.date_semis,
      date_plantation: p.date_plantation ?? null, date_fin: p.date_fin ?? null, season_name: p.season_name,
    }))
    const notes = entries.filter(e => e.planche_id === plancheId)
    const traitements = treatments.filter(t => t.planche_id === plancheId)
    try {
      return { retours: retoursDeCulture(plantations), frise: frisePlanche({ plantations, notes, traitements }), erreur: null }
    } catch (e) {
      console.error('[journal] historique de la planche', e)
      return { retours: [], frise: [], erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [plancheId, courant, entries, treatments])

  return (
    <Dialog open={!!plancheId} onOpenChange={o => { if (!o) onChange(null) }} size="lg"
      title={planche ? `Historique · ${planche.label}` : 'Historique de la planche'}
      description="Toutes les saisons : plantations, notes du journal et traitements.">
      <div className="space-y-4">
        <Field label="Planche">
          <Select value={plancheId ?? ''} onChange={e => onChange(e.target.value || null)}>
            <OptionsPlanches planches={planches} />
          </Select>
        </Field>

        {!courant ? (
          <div className="space-y-2" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
        ) : courant.erreur || vue?.erreur ? (
          <EmptyState compact icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Historique indisponible"
            description={courant.erreur ?? vue?.erreur ?? ''} />
        ) : vue && (
          <>
            {vue.retours.length > 0 ? (
              <Encadre tone="amber">
                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Même culture d’une année sur l’autre</p>
                <ul className="mt-1 list-disc pl-5 text-fg-muted">
                  {vue.retours.map(r => <li key={r.culture_id}><span className="text-fg">{r.culture_name}</span> : {r.annees.join(', ')}</li>)}
                </ul>
                <p className="mt-1.5 text-xs text-fg-subtle">Comparaison par culture seulement : les familles botaniques ne sont pas dans le catalogue.</p>
              </Encadre>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-fg-subtle"><Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                Aucune culture ne revient d’une année sur l’autre. Comparaison par culture seulement : les familles botaniques ne sont pas dans le catalogue.</p>
            )}

            {vue.frise.length === 0 ? (
              <EmptyState compact title="Rien sur cette planche" description="Aucune plantation, note ni traitement." />
            ) : vue.frise.map(g => (
              <section key={g.annee} aria-label={String(g.annee)}>
                <h3 className="mb-2 font-serif text-lg text-fg">{g.annee}</h3>
                <ol className="relative space-y-2 border-l border-border pl-4">
                  {g.evenements.map(ev => (
                    <li key={`${ev.type}-${ev.id}`} className="relative">
                      <span className="absolute -left-[1.3rem] top-2 h-2 w-2 rounded-full bg-border-strong" aria-hidden />
                      {ev.type === 'plantation' ? (
                        <div className="flex items-start gap-2 text-sm">
                          <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <div>
                            <p><span className="font-medium">{ev.plantation.culture_name}</span>
                              {ev.plantation.season_name && <span className="text-fg-subtle"> · {ev.plantation.season_name}</span>}</p>
                            <p className="text-xs text-fg-muted">
                              semis {formatJourMois(ev.plantation.date_semis, anneeRef)}
                              {ev.plantation.date_plantation && ev.plantation.date_plantation !== ev.plantation.date_semis && ` · plantation ${formatJourMois(ev.plantation.date_plantation, anneeRef)}`}
                              {ev.plantation.date_fin && ` · fin ${formatJourMois(ev.plantation.date_fin, anneeRef)}`}
                            </p>
                          </div>
                        </div>
                      ) : ev.type === 'note' ? (
                        <NoteFrise e={ev.note} photos={photosParNote.get(ev.note.id) ?? []} urls={urls} anneeRef={anneeRef} />
                      ) : (
                        <div className="flex items-start gap-2 text-sm">
                          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                          <div>
                            <p><span className="font-medium">{ev.traitement.produit}</span> <span className="text-fg-muted">sur {ev.traitement.culture_libelle}</span></p>
                            <p className="text-xs text-fg-muted">{formatJourMois(ev.date, anneeRef)} · {ev.traitement.cible}</p>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </Dialog>
  )
}

function NoteFrise({ e, photos, urls, anneeRef }: { e: Pick<JournalEntry, 'id' | 'date' | 'kind' | 'body'>; photos: JournalPhoto[]; urls: UrlsPhotos; anneeRef: number }) {
  const I = ICONES_NOTES[e.kind]
  return (
    <div className="text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={TONS_NOTES[e.kind]}><I className="h-3 w-3" aria-hidden />{LIBELLES_NOTES[e.kind]}</Badge>
        <span className="text-xs text-fg-muted">{formatJourMois(e.date, anneeRef)}</span>
      </p>
      {e.body && <p className="mt-1 text-fg">{e.body}</p>}
      {photos.length > 0 && <div className="mt-1.5 flex gap-2">{photos.map(p => <Vignette key={p.id} photo={p} url={urls[p.id]} taille="h-14 w-14" />)}</div>}
    </div>
  )
}
