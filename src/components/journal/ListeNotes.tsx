'use client'
import { useMemo, useState } from 'react'
import { History, ImageOff, MapPin, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Dialog, Skeleton, useConfirm } from '@/components/ui'
import { formatJourMois, formatMois, type JournalEntry, type JournalPhoto } from '@/lib/domain'
import { LIBELLES_NOTES } from '@/lib/domain/journal'
import type { UrlsPhotos } from '@/hooks/useJournal'
import { ICONES_NOTES, TONS_NOTES, moisCourt } from './commun'

export function Vignette({ photo, url, onOpen, taille = 'h-20 w-20' }: { photo: JournalPhoto; url: string | null | undefined; onOpen?: () => void; taille?: string }) {
  if (url === undefined) return <Skeleton className={`${taille} rounded-lg`} />
  if (url === null) {
    return (
      <div className={`${taille} flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-2xs text-fg-subtle`} title={photo.path}>
        <ImageOff className="h-4 w-4" aria-hidden />indisponible
      </div>
    )
  }
  return (
    <button type="button" onClick={onOpen} className={`${taille} overflow-hidden rounded-lg border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      aria-label="Agrandir la photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire, hors optimiseur d'images */}
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  )
}

export function ListeNotes({ entries, photosParNote, urls, nomLieu, nomAuteur, anneeCourante, onHistorique, onDelete }: {
  entries: JournalEntry[]
  photosParNote: Map<string, JournalPhoto[]>
  urls: UrlsPhotos
  nomLieu: (e: JournalEntry) => string | null
  nomAuteur: (id: string | null) => string | null
  anneeCourante: number
  onHistorique: (plancheId: string) => void
  onDelete: (id: string) => Promise<boolean>
}) {
  const confirm = useConfirm()
  const [grande, setGrande] = useState<{ url: string; legende: string } | null>(null)

  const parMois = useMemo(() => {
    const g: { mois: string; notes: JournalEntry[] }[] = []
    for (const e of entries) {
      const m = e.date.slice(0, 7)
      const last = g[g.length - 1]
      if (last && last.mois === m) last.notes.push(e)
      else g.push({ mois: m, notes: [e] })
    }
    return g
  }, [entries])

  const supprimer = async (e: JournalEntry) => {
    const n = photosParNote.get(e.id)?.length ?? 0
    const ok = await confirm({
      title: 'Supprimer cette note ?', destructive: true, confirmLabel: 'Supprimer',
      description: `Note du ${formatJourMois(e.date, anneeCourante)}${n ? ` et ses ${n} photo${n > 1 ? 's' : ''}` : ''}. Cette action est définitive.`,
    })
    if (ok) await onDelete(e.id)
  }

  return (
    <div className="space-y-6">
      {parMois.map(({ mois, notes }) => (
        <section key={mois} aria-label={formatMois(mois)}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{formatMois(mois)}</h3>
          <ol className="space-y-3">
            {notes.map(e => {
              const I = ICONES_NOTES[e.kind]
              const lieu = nomLieu(e)
              const auteur = nomAuteur(e.created_by)
              const ph = photosParNote.get(e.id) ?? []
              return (
                <li key={e.id}>
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1.5 text-center">
                        <span className="num text-lg font-semibold leading-none text-fg">{Number(e.date.slice(8, 10))}</span>
                        <span className="mt-0.5 text-2xs text-fg-muted">{moisCourt(e.date)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge tone={TONS_NOTES[e.kind]}><I className="h-3 w-3" aria-hidden />{LIBELLES_NOTES[e.kind]}</Badge>
                          {lieu && <span className="inline-flex min-w-0 items-center gap-1 text-xs text-fg-muted"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{lieu}</span></span>}
                        </div>
                        {e.body && <p className="mt-1.5 whitespace-pre-line text-sm text-fg">{e.body}</p>}
                        {ph.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {ph.map(p => (
                              <Vignette key={p.id} photo={p} url={urls[p.id]}
                                onOpen={() => urls[p.id] && setGrande({ url: urls[p.id]!, legende: `${LIBELLES_NOTES[e.kind]} · ${formatJourMois(e.date, anneeCourante)}${lieu ? ` · ${lieu}` : ''}` })} />
                            ))}
                          </div>
                        )}
                        {auteur && <p className="mt-1.5 text-2xs text-fg-subtle">par {auteur}</p>}
                      </div>
                      <div className="-mr-1 -mt-1 flex shrink-0 flex-col gap-1 sm:flex-row">
                        {e.planche_id && (
                          <Button variant="ghost" size="icon-sm" onClick={() => onHistorique(e.planche_id!)} aria-label="Historique de la planche" title="Historique de la planche">
                            <History className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => supprimer(e)} aria-label="Supprimer la note" title="Supprimer la note">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      <Dialog open={!!grande} onOpenChange={o => { if (!o) setGrande(null) }} title="Photo" description={grande?.legende} size="lg">
        {grande && (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire, hors optimiseur d'images
          <img src={grande.url} alt={grande.legende} className="max-h-[70dvh] w-full rounded-lg object-contain" />
        )}
      </Dialog>
    </div>
  )
}
