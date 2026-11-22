'use client'
import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Camera, FlaskConical, History, NotebookPen } from 'lucide-react'
import { Button, Card, CardContent, EmptyState, PageHeader, Select, Skeleton, Tabs } from '@/components/ui'
import { JOURNAL_KINDS, type JournalEntry, type JournalKind } from '@/lib/domain'
import { LIBELLES_NOTES } from '@/lib/domain/journal'
import { aujourdhuiParis, type useBleuenn } from '@/hooks/useBleuenn'
import { useJournal } from '@/hooks/useJournal'
import { OptionsPlanches, type OptionCulture, type OptionPersonne, type OptionPlanche, type OptionPlantation } from '@/components/journal/commun'
import { SaisieNote } from '@/components/journal/SaisieNote'
import { SaisieTraitementDialog } from '@/components/journal/SaisieTraitement'
import { ListeNotes } from '@/components/journal/ListeNotes'
import { Registre } from '@/components/journal/Registre'
import { HistoriquePlanche } from '@/components/journal/HistoriquePlanche'

type Ctx = ReturnType<typeof useBleuenn>
type Onglet = 'journal' | 'registre'

export default function Journal({ ctx }: { ctx: Ctx }) {
  const j = useJournal({ farm: ctx.farm as any, activeSeason: ctx.activeSeason as any, user: ctx.user })
  const aujourdhui = ctx.today || aujourdhuiParis()
  const annee = Number(aujourdhui.slice(0, 4))
  const [onglet, setOnglet] = useState<Onglet>('journal')
  const [saisieNote, setSaisieNote] = useState(false)
  const [saisieTraitement, setSaisieTraitement] = useState(false)
  const [historique, setHistorique] = useState<string | null>(null)
  const [filtreType, setFiltreType] = useState<JournalKind | ''>('')
  const [filtrePlanche, setFiltrePlanche] = useState('')

  // ─── Listes de choix ───────────────────────────────────────
  const planches: (OptionPlanche & { surface_m2: number })[] = useMemo(() => (ctx.gardens || []).flatMap((g: any) =>
    (g.planches || []).map((p: any) => ({ id: p.id, garden_id: g.id, garden: g.name, name: p.name, label: `${g.name} · ${p.name}`, surface_m2: p.surface_m2 }))), [ctx.gardens])
  const jardins = useMemo(() => (ctx.gardens || []).map((g: any) => ({ id: g.id, name: g.name })), [ctx.gardens])
  const plantations: OptionPlantation[] = useMemo(() => (ctx.farmPlantings || []).map((p: any) => ({
    id: p.id, planche_id: p.planche_id, culture_id: p.culture_id, culture_name: p.culture_name,
    date_semis: p.date_semis, date_plantation: p.date_plantation ?? null, date_fin: p.date_fin ?? null, season_name: p.season_name ?? null,
  })), [ctx.farmPlantings])
  const cultures: OptionCulture[] = useMemo(() => (ctx.catalog || [])
    .map((c: any) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [ctx.catalog])
  const personnes: OptionPersonne[] = useMemo(() => {
    const l = (ctx.farmTeam || []).map((m: any) => ({ id: m.user_id, label: m.owner_name || m.email || 'Membre' }))
    if (ctx.user && !l.some(p => p.id === ctx.user!.id)) l.unshift({ id: ctx.user.id, label: 'Moi' })
    return l
  }, [ctx.farmTeam, ctx.user])

  const nomLieu = useCallback((e: JournalEntry) => {
    const pl = e.planche_id ? planches.find(p => p.id === e.planche_id)?.label ?? 'Planche supprimée' : null
    const cu = e.culture_id ? cultures.find(c => c.id === e.culture_id)?.name ?? null : null
    return [pl, cu].filter(Boolean).join(' · ') || null
  }, [planches, cultures])
  const nomAuteur = useCallback((id: string | null) => id ? personnes.find(p => p.id === id)?.label ?? 'Ancien membre' : null, [personnes])

  const notes = useMemo(() => j.entries.filter(e =>
    (!filtreType || e.kind === filtreType) && (!filtrePlanche || e.planche_id === filtrePlanche)), [j.entries, filtreType, filtrePlanche])

  if (!ctx.farm && !ctx.activeSeason) {
    return (
      <div className="space-y-6">
        <PageHeader title="Journal & traitements" description="Observations, photos, registre phytosanitaire" />
        <EmptyState icon={<NotebookPen className="h-6 w-6" aria-hidden />} title="Aucune ferme" description="Créez une saison pour commencer le journal." />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Journal & traitements" eyebrow={ctx.farm?.name}
        description="Notes datées et photos au champ, registre des traitements phytosanitaires."
        actions={
          <>
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setSaisieNote(true)}>
              <Camera className="h-5 w-5" aria-hidden />Nouvelle note
            </Button>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={() => setSaisieTraitement(true)}>
              <FlaskConical className="h-5 w-5" aria-hidden />Nouveau traitement
            </Button>
          </>
        } />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs<Onglet> label="Journal ou registre" value={onglet} onChange={setOnglet} className="flex-1"
          options={[
            { value: 'journal', label: <>Journal <span className="text-fg-subtle">{j.entries.length}</span></>, icon: <NotebookPen className="h-4 w-4" aria-hidden /> },
            { value: 'registre', label: <>Registre phyto <span className="text-fg-subtle">{j.treatments.length}</span></>, icon: <FlaskConical className="h-4 w-4" aria-hidden /> },
          ]} />
        <Button variant="ghost" size="sm" className="self-start sm:self-auto" disabled={!planches.length}
          onClick={() => setHistorique(filtrePlanche || planches[0]?.id || null)}>
          <History className="h-4 w-4" aria-hidden />Historique d’une planche
        </Button>
      </div>

      {j.error ? (
        <Card><CardContent>
          <EmptyState compact icon={<AlertTriangle className="h-6 w-6" aria-hidden />} title="Données indisponibles"
            description={`Le journal n’a pas pu être chargé : ${j.error}. Rien n’est affiché plutôt qu’un journal incomplet.`} />
        </CardContent></Card>
      ) : j.loading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : onglet === 'journal' ? (
        <section aria-label="Journal de culture" className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <Select aria-label="Type de note" value={filtreType} onChange={e => setFiltreType(e.target.value as JournalKind | '')} wrapperClassName="sm:w-52">
              <option value="">Tous types</option>
              {JOURNAL_KINDS.map(k => <option key={k} value={k}>{LIBELLES_NOTES[k]}</option>)}
            </Select>
            <Select aria-label="Planche" value={filtrePlanche} onChange={e => setFiltrePlanche(e.target.value)} wrapperClassName="sm:w-64">
              <option value="">Toutes planches</option>
              <OptionsPlanches planches={planches} />
            </Select>
          </div>
          {notes.length === 0 ? (
            <Card><EmptyState compact icon={<NotebookPen className="h-6 w-6" aria-hidden />}
              title={j.entries.length ? 'Aucune note pour ce filtre' : 'Journal vide'}
              description={j.entries.length ? 'Changez de type ou de planche.' : 'Notez une observation, une maladie, un arrosage… photo comprise.'}
              action={!j.entries.length ? <Button onClick={() => setSaisieNote(true)}><Camera className="h-4 w-4" aria-hidden />Première note</Button> : undefined} /></Card>
          ) : (
            <ListeNotes entries={notes} photosParNote={j.photosParNote} urls={j.urls} nomLieu={nomLieu} nomAuteur={nomAuteur}
              anneeCourante={annee} onHistorique={setHistorique} onDelete={j.deleteEntry} />
          )}
        </section>
      ) : (
        <section aria-label="Registre phytosanitaire">
          <Registre treatments={j.treatments} aujourdhui={aujourdhui} onDelete={j.deleteTreatment} />
        </section>
      )}

      <SaisieNote open={saisieNote} onOpenChange={setSaisieNote} aujourdhui={aujourdhui} planches={planches}
        plantations={plantations} cultures={cultures} plancheInitiale={filtrePlanche || null} onSave={j.addEntry} />
      <SaisieTraitementDialog open={saisieTraitement} onOpenChange={setSaisieTraitement} aujourdhui={aujourdhui}
        planches={planches} jardins={jardins} plantations={plantations} cultures={cultures} personnes={personnes}
        moi={ctx.user?.id ?? null} onSave={async t => { const ok = await j.addTreatment(t); if (ok) setOnglet('registre'); return ok }} />
      <HistoriquePlanche plancheId={historique} onChange={setHistorique} planches={planches} entries={j.entries}
        treatments={j.treatments} photosParNote={j.photosParNote} urls={j.urls} charger={j.plantationsDePlanche} anneeRef={annee} />
    </div>
  )
}
