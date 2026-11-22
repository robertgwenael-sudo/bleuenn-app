'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Download, Eye, FileSpreadsheet, Info, RefreshCw } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, PageHeader, Segmented, Select, Skeleton, Stat,
} from '@/components/ui'
import type { useBleuenn } from '@/hooks/useBleuenn'
import { useExports } from '@/hooks/useExports'
import { formatEuros } from '@/lib/domain'
import {
  EXPORTS, genererCsv, nomFichierExport, sommeColonne, type CleExport, type Tableau,
} from '@/lib/domain/exports'
import { aujourdhuiParisISO } from '@/lib/types'
import { compter, FICHES } from '@/components/exports/catalogue'
import { resoudrePeriode, type ChoixPeriode, type ModePeriode } from '@/components/exports/periode'
import { pause, telechargerTexte } from '@/components/exports/telecharger'
import { ApercuDialog } from '@/components/exports/ApercuDialog'

type Construit = { cle: CleExport; tableau: Tableau | null; erreur: string | null }

const formatJJMMAAAA = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export default function Exports({ ctx }: { ctx: ReturnType<typeof useBleuenn> }) {
  const aujourdhui = useMemo(() => aujourdhuiParisISO(), [])
  const anneeCourante = Number(aujourdhui.slice(0, 4))
  const farmId = ctx.activeSeason?.farm_id ?? null
  const saisonsFerme = useMemo(
    () => (ctx.seasons ?? []).filter(s => !farmId || s.farm_id === farmId).sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, 'fr')),
    [ctx.seasons, farmId],
  )

  const [choix, setChoix] = useState<ChoixPeriode>(() => ({
    mode: 'annee', annee: anneeCourante, seasonId: ctx.activeSeason?.id ?? '',
    du: `${anneeCourante}-01-01`, au: aujourdhui,
  }))
  const maj = (p: Partial<ChoixPeriode>) => setChoix(c => ({ ...c, ...p }))
  const periode = resoudrePeriode(choix, saisonsFerme)

  const annees = useMemo(() => {
    const min = Math.min(anneeCourante - 2, ...saisonsFerme.map(s => s.year))
    const max = Math.max(anneeCourante, ...saisonsFerme.map(s => s.year))
    return Array.from({ length: max - min + 1 }, (_, i) => max - i)
  }, [anneeCourante, saisonsFerme])

  const ex = useExports({
    farmId: periode.invalide ? null : farmId,
    du: periode.du, au: periode.au, seasonId: periode.seasonId,
  })

  const construits: Construit[] = useMemo(() => {
    if (!ex.donnees) return []
    return EXPORTS.map(e => {
      try { return { cle: e.cle, tableau: e.construire(ex.donnees!), erreur: null } }
      catch (err) { return { cle: e.cle, tableau: null, erreur: err instanceof Error ? err.message : String(err) } }
    })
  }, [ex.donnees])

  // Un export qui ne se construit pas est signalé, jamais remplacé par un fichier vide.
  useEffect(() => {
    for (const c of construits) {
      if (!c.erreur) continue
      console.error(`[exports] ${c.cle}`, c.erreur)
      toast.error(`Export « ${FICHES[c.cle].titre} » impossible`, { description: c.erreur })
    }
  }, [construits])

  const ventes = construits.find(c => c.cle === 'ventes-detaillees')?.tableau ?? null
  const ca = ventes ? sommeColonne(ventes, 'Montant (€)') : null
  const nbVentes = ex.donnees?.ventes.length ?? 0

  const [apercu, setApercu] = useState<CleExport | null>(null)
  const [enCours, setEnCours] = useState(false)

  const fichier = (cle: CleExport) => nomFichierExport(cle, periode.du, periode.au)

  const telecharger = (c: Construit) => {
    if (!c.tableau) return false
    try {
      telechargerTexte(fichier(c.cle), genererCsv(c.tableau))
      return true
    } catch (err) {
      console.error(`[exports] génération ${c.cle}`, err)
      toast.error(`Fichier « ${FICHES[c.cle].titre} » impossible`, { description: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  const toutTelecharger = async () => {
    const aFaire = construits.filter(c => c.tableau && c.tableau.lignes.length > 0)
    if (aFaire.length === 0) return
    setEnCours(true)
    let n = 0
    try {
      for (const c of aFaire) {
        if (telecharger(c)) n++
        // Un court délai : les navigateurs ignorent les téléchargements trop rapprochés.
        await pause(450)
      }
    } finally {
      setEnCours(false)
    }
    const vides = construits.length - aFaire.length
    toast.success(`${compter(n, ['fichier téléchargé', 'fichiers téléchargés'])}`, {
      description: vides > 0 ? `${compter(vides, ['export vide ignoré', 'exports vides ignorés'])}.` : undefined,
    })
  }

  const pret = !ex.loading && !ex.erreur && !periode.invalide && !!ex.donnees
  const nbTelechargeables = construits.filter(c => c.tableau && c.tableau.lignes.length > 0).length
  const cApercu = apercu ? construits.find(c => c.cle === apercu) ?? null : null

  if (!farmId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Exports" description="Fichiers CSV pour le comptable" />
        <EmptyState icon={<FileSpreadsheet className="h-6 w-6" aria-hidden />} title="Aucune saison active" description="Créez ou rejoignez une saison pour exporter ses chiffres." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Exports" description="Fichiers CSV pour le comptable ou la MSA, à ouvrir directement dans Excel"
        actions={
          <Button onClick={toutTelecharger} disabled={!pret || enCours || nbTelechargeables === 0} loading={enCours} className="w-full sm:w-auto">
            {!enCours && <Download className="h-4 w-4" aria-hidden />}Tout télécharger
          </Button>
        } />

      <div role="note" className="flex gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-medium">Ces fichiers sont des extraits de gestion, pas des factures.</p>
          <p className="mt-0.5 text-xs text-fg-muted">Ils reprennent ce qui est saisi dans Bleuenn. Les factures et la comptabilité restent celles transmises au comptable.</p>
        </div>
      </div>

      {/* Période */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="lg:w-[22rem]">
            <p id="periode-label" className="mb-1.5 text-sm font-medium text-fg">Période</p>
            <Segmented<ModePeriode> label="Type de période" value={choix.mode} onChange={mode => maj({ mode })} className="grid w-full grid-cols-3"
              options={[{ value: 'annee', label: 'Année civile' }, { value: 'saison', label: 'Saison' }, { value: 'dates', label: 'Dates libres' }]} />
          </div>
          <div className="flex-1">
            {choix.mode === 'annee' && (
              <Field label="Année">
                <Select value={String(choix.annee)} onChange={e => maj({ annee: Number(e.target.value) })} className="h-10">
                  {annees.map(a => <option key={a} value={a}>{a}{a === anneeCourante ? ' (en cours)' : ''}</option>)}
                </Select>
              </Field>
            )}
            {choix.mode === 'saison' && (
              <Field label="Saison" hint="Tout ce qui est rattaché à la saison, quelles que soient les dates.">
                <Select value={choix.seasonId} onChange={e => maj({ seasonId: e.target.value })} className="h-10">
                  {saisonsFerme.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === ctx.activeSeason?.id ? ' (active)' : ''}</option>)}
                </Select>
              </Field>
            )}
            {choix.mode === 'dates' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Du"><Input type="date" value={choix.du} max={choix.au || undefined} onChange={e => maj({ du: e.target.value })} /></Field>
                <Field label="Au"><Input type="date" value={choix.au} min={choix.du || undefined} onChange={e => maj({ au: e.target.value })} /></Field>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-muted" aria-live="polite">
          {periode.invalide
            ? <span className="text-danger">{periode.invalide}</span>
            : periode.seasonId
              ? <>{periode.libelle} : ventes, commandes, récoltes, pertes et plantations rattachées à cette saison.</>
              : <>Du {formatJJMMAAAA(periode.du)} au {formatJJMMAAAA(periode.au)}, toutes saisons de la ferme. Le plan de culture reprend les plantations en place sur la période.</>}
        </p>
      </Card>

      {/* Contrôle rapide */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat label="CA de la période" value={pret && ca !== null ? formatEuros(ca) : '…'}
          sub={pret ? compter(nbVentes, ['vente', 'ventes']) : ' '} />
        <Stat label="Fichiers prêts" value={pret ? `${nbTelechargeables} / ${EXPORTS.length}` : '…'}
          sub={pret ? (nbTelechargeables < EXPORTS.length ? 'Les exports vides ne sont pas téléchargés' : 'Tous les exports ont des lignes') : ' '} />
      </div>

      {ex.erreur && !periode.invalide ? (
        <Card>
          <EmptyState compact icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Lecture des données impossible"
            description={ex.erreur}
            action={<Button variant="secondary" onClick={() => void ex.reload()}><RefreshCw className="h-4 w-4" aria-hidden />Réessayer</Button>} />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={!pret}>
          {EXPORTS.map(({ cle }) => {
            const f = FICHES[cle]
            const c = construits.find(x => x.cle === cle)
            const n = c?.tableau?.lignes.length ?? 0
            return (
              <li key={cle}>
                <Card className="flex h-full flex-col p-4 sm:p-5" data-export={cle}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary" aria-hidden>{f.icone}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <h3 className="text-[0.95rem] font-semibold text-fg">{f.titre}</h3>
                        {!pret ? <Skeleton className="h-5 w-20" />
                          : c?.erreur ? <Badge tone="red">Erreur</Badge>
                          : <Badge tone={n > 0 ? 'green' : 'neutral'}><span className="num" data-lignes={n}>{compter(n, f.unite)}</span></Badge>}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{f.description}</p>
                    </div>
                  </div>
                  {c?.erreur && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{c.erreur}</p>}
                  <div className="mt-auto pt-4">
                    {!periode.invalide && <p className="mb-2 truncate font-mono text-[0.7rem] text-fg-subtle" title={fichier(cle)}>{fichier(cle)}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="md" disabled={!pret || !c?.tableau} onClick={() => setApercu(cle)}>
                        <Eye className="h-4 w-4" aria-hidden />Aperçu
                      </Button>
                      <Button size="md" disabled={!pret || !c?.tableau || n === 0} onClick={() => c && telecharger(c)} aria-label={`Télécharger ${f.titre}`}>
                        <Download className="h-4 w-4" aria-hidden />Télécharger
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-fg-subtle">
        Format : CSV séparé par des points-virgules, encodé en UTF-8, montants en euros à la virgule, dates JJ/MM/AAAA.
        Un double-clic l’ouvre dans Excel ; LibreOffice demande de confirmer le séparateur « ; ».
      </p>

      <ApercuDialog open={!!apercu} onOpenChange={o => { if (!o) setApercu(null) }}
        titre={apercu ? FICHES[apercu].titre : ''} nomFichier={apercu && !periode.invalide ? fichier(apercu) : ''}
        tableau={cApercu?.tableau ?? null} onTelecharger={() => { if (cApercu) telecharger(cApercu) }} />
    </div>
  )
}
