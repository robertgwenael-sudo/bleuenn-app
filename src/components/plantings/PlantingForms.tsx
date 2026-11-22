'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRight, CalendarCheck, Shovel, Trash2, Undo2, X } from 'lucide-react'
import type { PlantingFull, CultureCatalog } from '@/lib/types'
import { Badge, Button, Field, Input, SearchInput, TypeBadge, TYPE_LABEL, cn, useConfirm } from '@/components/ui'
import {
  ajouterJours, conflitsSiAjout, cycleDe, dateSuggeree, estDateValide, estSansFin, floraisonARenseigner, formatJourMois,
  libreAPartirDu, periodeOccupation, premiereRecolte, segmentsOccupation, dureeJours, type CycleCulture, type PlantingOccupation,
} from '@/lib/domain'
import { AvertissementSaisie, calculables, periodeSure } from './Occupation'
import { CycleBadge } from './Cycle'

// ─── Vérification d'occupation (toutes saisons, par dates) ──────────
// Le calcul vient du domaine (`conflitsSiAjout`, `libreAPartirDu`) et porte
// sur TOUTES les plantations de la planche, quelle que soit leur saison.
// Un conflit avertit mais n'empêche jamais d'enregistrer.
// 013 : une vivace occupe la planche jusqu'à son arrachage ; un plant
// acheté ne passe pas en cellule (la date saisie est la plantation).
type Cycle = { jc: number; jch: number; jr: number; annees: number; semisDirect: boolean; cycle: CycleCulture; floraison: string | null }

function cycleCulture(c: CultureCatalog): Cycle {
  return {
    jc: c.jours_cellule || 0, jch: c.jours_champ, jr: c.jours_recolte ?? 21,
    annees: cycleDe(c) === 'vivace' ? c.annees_avant_recolte || 0 : 0,
    semisDirect: !!c.semis_direct, cycle: cycleDe(c), floraison: c.floraison_debut ?? null,
  }
}

function datesProjet(date: string, c: Cycle, achatPlant: boolean) {
  const plantation = ajouterJours(date, achatPlant ? 0 : c.jc)
  const recolte = premiereRecolte({ jours_champ: c.jch, annees_avant_recolte: c.annees, cycle: c.cycle, floraison_debut: c.floraison }, plantation)
  const fin = ajouterJours(recolte, c.jr)
  return { plantation, recolte, fin }
}

type Projet = { id: string; dateSemis: string; surface: number; cycle: Cycle | null; cultureName: string; achatPlant: boolean; arracheeLe?: string | null }

function occupationProjet(ctx: any, projet: Projet): PlantingOccupation | null {
  if (!projet.cycle || !estDateValide(projet.dateSemis)) return null
  const dates = datesProjet(projet.dateSemis, projet.cycle, projet.achatPlant)
  return {
    id: projet.id, surface_m2: projet.surface, date_semis: projet.dateSemis, date_plantation: dates.plantation,
    date_fin: dates.fin, semis_direct: projet.cycle.semisDirect, culture_name: projet.cultureName,
    season_name: ctx.activeSeason?.name, season_year: ctx.activeSeason?.year,
    cycle: projet.cycle.cycle, arrachee_le: projet.arracheeLe ?? null,
  }
}

function infosPlanche(ctx: any, plancheId: string) {
  let plancheM2 = 0, plancheName = ''
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === plancheId) { plancheM2 = Number(pl.surface_m2); plancheName = `${g.name} · ${pl.name}` }
    }
  }
  const source: PlantingFull[] = ctx.farmPlantings?.length ? ctx.farmPlantings : (ctx.plantings || [])
  return { plancheM2, plancheName, voisines: calculables(source.filter(p => p.planche_id === plancheId)) }
}

/**
 * `autresProjets` : les autres cultures saisies en même temps (multi-sélection),
 * comptées comme si elles étaient déjà plantées.
 */
function verifierOccupation(ctx: any, plancheId: string, projet: Projet, autresProjets: PlantingOccupation[] = []) {
  const { plancheM2, plancheName, voisines } = infosPlanche(ctx, plancheId)
  const autres: PlantingOccupation[] = [...voisines.filter(p => p.id !== projet.id), ...autresProjets]
  const out = { plancheM2, plancheName, voisines, autres, conflits: [] as ReturnType<typeof conflitsSiAjout>,
    picAutres: 0, libre: null as string | null, semisSuggere: null as string | null, dates: null as ReturnType<typeof datesProjet> | null }
  const p = occupationProjet(ctx, projet)
  if (!p || !projet.cycle) return out
  out.dates = datesProjet(projet.dateSemis, projet.cycle, projet.achatPlant)
  const periode = periodeOccupation(p)
  out.picAutres = segmentsOccupation(autres, periode).reduce((m, s) => Math.max(m, s.surface_occupee), 0)
  if (projet.surface > 0) {
    out.conflits = conflitsSiAjout({ surface_m2: plancheM2 }, autres, p)
    if (out.conflits.length && !estSansFin(periode.fin)) {
      out.libre = libreAPartirDu({ surface_m2: plancheM2 }, autres, projet.surface, periode.debut, dureeJours(periode))
      out.semisSuggere = out.libre
        ? (projet.cycle.semisDirect || projet.achatPlant ? out.libre : ajouterJours(out.libre, -projet.cycle.jc))
        : null
    }
  }
  return out
}

const fmtM2 = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',')

/** « jusqu'au 15 mai » ou « vivace en place ». */
function jusquA(p: PlantingFull, anneeRef: number) {
  const per = periodeSure(p)
  if (!per) return 'dates incomplètes'
  return estSansFin(per.fin) ? 'vivace en place' : `jusqu’au ${formatJourMois(per.fin, anneeRef)}`
}

// ─── Aperçu des dates calculées ─────────────────────
function DatesPreview({ title, plantation, recolte, fin, vivace, compact, floraisonManquante }: {
  title: string; plantation: string; recolte: string; fin: string; vivace?: boolean; compact?: boolean; floraisonManquante?: boolean
}) {
  const alerte = floraisonManquante && (
    <p className="text-xs font-medium text-warning">Début de floraison non renseigné au catalogue : récolte calculée avec les jours au champ, à vérifier.</p>
  )
  const items = [
    { l: 'Plantation', v: plantation, c: 'bg-phase-champ' },
    { l: vivace ? '1re récolte' : 'Début récolte', v: recolte, c: 'bg-phase-recolte' },
    { l: vivace ? 'Fin 1re récolte' : 'Fin récolte', v: fin, c: 'bg-phase-recolte/60' },
  ]
  if (compact) {
    return (
      <p className="num flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
        {items.map((x, i) => <span key={x.l}>{i > 0 && <ArrowRight className="mr-1.5 inline h-3 w-3 text-fg-subtle" aria-hidden />}{x.l} <strong className="text-fg">{x.v}</strong></span>)}
        {vivace && <span>, puis chaque année jusqu’à l’arrachage</span>}
        {alerte}
      </p>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-fg">
        <CalendarCheck className="h-3.5 w-3.5 text-primary" aria-hidden />{title}
      </p>
      <ol className="grid grid-cols-3 gap-2 text-center text-xs">
        {items.map(x => (
          <li key={x.l} className="rounded-lg bg-surface px-2 py-2 ring-1 ring-border">
            <span className={cn('mx-auto mb-1.5 block h-1 w-6 rounded-full', x.c)} aria-hidden />
            <span className="block text-fg-subtle">{x.l}</span>
            <strong className="mt-0.5 block font-semibold text-fg">{x.v}</strong>
          </li>
        ))}
      </ol>
      {vivace && <p className="mt-2 text-xs text-fg-muted">Vivace : la récolte revient chaque année aux mêmes dates, la planche reste occupée jusqu’à l’arrachage.</p>}
      {alerte}
    </div>
  )
}

function SurfaceGauge({ pic, total, periodeConnue }: { pic: number; total: number; periodeConnue: boolean }) {
  const pct = total > 0 ? Math.min(100, (pic / total) * 100) : 0
  const libre = Math.max(0, total - pic)
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-fg">{periodeConnue ? 'Surface de la planche sur la période' : 'Surface de la planche'}</span>
        <span className="num text-fg-muted">
          {periodeConnue
            ? <>{fmtM2(pic)} / {fmtM2(total)} m² pris par les autres cultures au plus chargé · <strong className={libre > 0 ? 'text-primary' : 'text-danger'}>{fmtM2(libre)} m² libres</strong></>
            : <>{fmtM2(total)} m², choisissez une ou plusieurs cultures</>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full transition-all', libre <= 0 ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CaseAchatPlant({ checked, onChange, label = 'Plant acheté' }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs text-fg" title="Pas de passage en cellule : la date saisie est la date de plantation">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
      {label}
    </label>
  )
}

// ─── Formulaire modification plantation ──────────────
// (logique identique à celle des anciennes sections Jardins, Calendrier et Vérification)
export function EditPlantingForm({ planting, ctx, onClose }: { planting: PlantingFull; ctx: any; onClose: () => void }) {
  const confirm = useConfirm()
  const today: string = ctx.today
  const [dateSemis, setDateSemis] = useState(planting.date_semis)
  const [surfaceM2, setSurfaceM2] = useState(planting.surface_m2)
  const [notes, setNotes] = useState(planting.planting_notes ?? planting.notes ?? '')
  const [achatPlant, setAchatPlant] = useState(!!planting.achat_plant)
  const [dateArrachage, setDateArrachage] = useState(planting.arrachee_le ?? (today >= planting.date_semis ? today : planting.date_semis))
  const [loading, setLoading] = useState(false)

  // Jours en cellule du catalogue : la vue renvoie 0 pour un plant acheté
  const cat: CultureCatalog | undefined = (ctx.catalog || []).find((c: CultureCatalog) => c.id === planting.culture_id)
  const jcCatalogue = planting.achat_plant ? (cat ? (planting.jours_cellule_override || cat.jours_cellule || 0) : 0) : (planting.jours_cellule || 0)
  const cycle: Cycle = {
    jc: jcCatalogue, jch: planting.jours_champ || 0, jr: planting.jours_recolte || 21,
    annees: planting.annees_avant_recolte || 0, semisDirect: !!planting.semis_direct, cycle: cycleDe(planting),
    floraison: planting.floraison_debut ?? null,
  }
  const vivace = cycle.cycle === 'vivace'
  const v = verifierOccupation(ctx, planting.planche_id, {
    id: planting.id, dateSemis, surface: surfaceM2, cultureName: planting.culture_name,
    cycle, achatPlant, arracheeLe: planting.arrachee_le,
  })
  const anneeRef = Number((today || dateSemis || '2000').slice(0, 4))

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!dateSemis || surfaceM2 <= 0) return
    setLoading(true)
    const ok = await ctx.updatePlanting(planting.id, { date_semis: dateSemis, surface_m2: surfaceM2, notes: notes || null, achat_plant: achatPlant })
    setLoading(false)
    if (ok === false) return
    toast.success(`${planting.culture_name} mis à jour`, {
      description: v.conflits.length ? 'Attention : la planche est en conflit de surface sur cette période.' : `${achatPlant ? 'Plantation' : 'Semis'} le ${formatJourMois(dateSemis, anneeRef)}`,
    })
    onClose()
  }

  const arracher = async (date: string | null) => {
    if (date && !estDateValide(date)) return
    setLoading(true)
    const ok = await ctx.updatePlanting(planting.id, { arrachee_le: date })
    setLoading(false)
    if (ok === false) return
    toast.success(date ? `${planting.culture_name} arrachée le ${formatJourMois(date, anneeRef)}` : `Arrachage de ${planting.culture_name} annulé`, {
      description: date ? `La planche se libère le ${formatJourMois(ajouterJours(date, 1), anneeRef)}.` : 'La vivace est de nouveau en place.',
    })
    onClose()
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Supprimer ${planting.culture_name} ?`,
      description: vivace
        ? `Supprimer efface aussi son historique sur ${planting.planche_name}. Pour une vivace retirée du champ, préférez « Arracher ».`
        : `La culture sera retirée de ${planting.planche_name} (${planting.garden_name}), avec ses récoltes enregistrées.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) {
      await ctx.deletePlanting(planting.id)
      toast.success(`${planting.culture_name} supprimé de la planche`)
      onClose()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-border bg-surface-2/60 p-3.5 text-xs sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1"><dt className="text-fg-subtle">Type</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1.5 font-medium text-fg"><TypeBadge type={planting.culture_type} />{TYPE_LABEL[planting.culture_type]}<CycleBadge cycle={planting.cycle} masquerAnnuelle /></dd></div>
        <div><dt className="text-fg-subtle">Emplacement</dt><dd className="mt-0.5 font-medium text-fg">{planting.garden_name} · {planting.planche_name}</dd></div>
        {planting.season_name && <div><dt className="text-fg-subtle">Saison</dt><dd className="mt-0.5 font-medium text-fg">{planting.season_name}</dd></div>}
        <div><dt className="text-fg-subtle">Cycle (cellule / champ / récolte)</dt><dd className="num mt-0.5 font-medium text-fg">{achatPlant ? 0 : cycle.jc} / {cycle.jch} / {cycle.jr} j</dd></div>
        <div><dt className="text-fg-subtle">Plants</dt><dd className="num mt-0.5 font-medium text-fg">{planting.plants_count}</dd></div>
        <div><dt className="text-fg-subtle">Tiges nettes{vivace ? ' par an' : ''}</dt><dd className="num mt-0.5 font-medium text-fg">{planting.tiges_estimees}</dd></div>
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={achatPlant ? 'Date de plantation' : 'Date de semis'}>
          <Input type="date" className="h-11" value={dateSemis} onChange={e => setDateSemis(e.target.value)} required />
        </Field>
        <Field label="Surface allouée (m²)"
          hint={v.dates && surfaceM2 > 0 && !v.conflits.length ? `Il restera ${fmtM2(Math.max(0, v.plancheM2 - v.picAutres - surfaceM2))} m² libres au plus chargé.` : undefined}>
          <Input type="number" inputMode="decimal" className="h-11" min={0.5} step={0.5}
            value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)} />
        </Field>
      </div>
      <CaseAchatPlant checked={achatPlant} onChange={setAchatPlant} label="Plant acheté (pas de passage en cellule)" />

      <AvertissementSaisie projetId={planting.id} conflits={v.conflits} plancheM2={v.plancheM2} surface={surfaceM2} libre={v.libre}
        semisSuggere={v.semisSuggere} dateSemis={dateSemis} onUseDate={setDateSemis} today={today} />

      {v.dates && <DatesPreview title="Dates recalculées" vivace={vivace} floraisonManquante={floraisonARenseigner(planting)} plantation={formatJourMois(v.dates.plantation, anneeRef)} recolte={formatJourMois(v.dates.recolte, anneeRef)} fin={formatJourMois(v.dates.fin, anneeRef)} />}

      {vivace && (
        <section aria-label="Arrachage" className="rounded-xl border border-border p-3.5">
          {planting.arrachee_le ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <p className="text-fg">Arrachée le <strong>{formatJourMois(planting.arrachee_le, anneeRef)}</strong> : la planche est libre depuis le lendemain.</p>
              <Button size="sm" variant="secondary" onClick={() => arracher(null)} disabled={loading} className="sm:ml-auto"><Undo2 className="h-3.5 w-3.5" />Annuler l’arrachage</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Date d’arrachage" className="min-w-[10rem] flex-1" hint="Dernier jour en place. La vivace ne fleurira plus après.">
                <Input type="date" className="h-11" value={dateArrachage} min={planting.date_semis} onChange={e => setDateArrachage(e.target.value)} />
              </Field>
              <Button variant="secondary" onClick={() => arracher(dateArrachage)} disabled={loading || !estDateValide(dateArrachage) || dateArrachage < planting.date_semis}>
                <Shovel className="h-4 w-4" />Arracher
              </Button>
            </div>
          )}
        </section>
      )}

      <Field label="Notes">
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles…" />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        <Button variant="danger-ghost" onClick={handleDelete} className="sm:mr-auto">
          <Trash2 className="h-4 w-4" />Supprimer de la planche
        </Button>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!dateSemis || surfaceM2 <= 0}>{v.conflits.length ? 'Enregistrer malgré le conflit' : 'Enregistrer'}</Button>
      </div>
    </form>
  )
}

// ─── Formulaire ajout de cultures sur une planche (multi-sélection) ─────
// On coche une ou plusieurs cultures du catalogue ; chacune reçoit sa
// surface et sa date (pré-remplies : surface libre restante, date tirée de
// la 1ère implantation possible). Les conflits avertissent sans bloquer,
// en comptant aussi les autres cultures cochées. Une seule écriture.
type Ligne = { cultureId: string; dateSemis: string; surface: number; achatPlant: boolean }
const projetId = (cultureId: string) => `projet:${cultureId}`
const arrondiDemiM2 = (x: number) => Math.floor(x * 2) / 2

export function AddPlantingForm({ plancheId, ctx, onClose }: { plancheId: string; ctx: any; onClose: () => void }) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const today: string = ctx.today
  const catalog: CultureCatalog[] = ctx.catalog || []
  const parId = new Map(catalog.map(c => [c.id, c]))
  const filtered = catalog.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name))
  const anneeRef = Number((today || '2000').slice(0, 4))
  const planche = infosPlanche(ctx, plancheId)

  const projetDe = (l: Ligne): Projet => {
    const c = parId.get(l.cultureId)
    return { id: projetId(l.cultureId), dateSemis: l.dateSemis, surface: l.surface, cultureName: c?.name || '', cycle: c ? cycleCulture(c) : null, achatPlant: l.achatPlant }
  }
  const occupationDe = (l: Ligne) => occupationProjet(ctx, projetDe(l))
  const verifier = (l: Ligne) => verifierOccupation(ctx, plancheId, projetDe(l),
    lignes.filter(x => x.cultureId !== l.cultureId).map(occupationDe).filter((x): x is PlantingOccupation => x !== null))

  const basculer = (c: CultureCatalog) => {
    if (lignes.some(l => l.cultureId === c.id)) { setLignes(prev => prev.filter(l => l.cultureId !== c.id)); return }
    const dateSemis = dateSuggeree(c, today)
    // Surface libre sur la période de cette culture, déduction faite des autres cultures cochées
    const brouillon: Ligne = { cultureId: c.id, dateSemis, surface: 1, achatPlant: false }
    const pic = verifierOccupation(ctx, plancheId, projetDe(brouillon),
      lignes.map(occupationDe).filter((x): x is PlantingOccupation => x !== null)).picAutres
    const libre = arrondiDemiM2(planche.plancheM2 - pic)
    setLignes(prev => [...prev, { ...brouillon, surface: libre >= 0.5 ? libre : 0.5 }])
  }
  const maj = (cultureId: string, m: Partial<Ligne>) => setLignes(prev => prev.map(l => l.cultureId === cultureId ? { ...l, ...m } : l))

  const valides = lignes.filter(l => estDateValide(l.dateSemis) && l.surface > 0)
  const verifs = new Map(lignes.map(l => [l.cultureId, verifier(l)]))
  const enConflit = lignes.some(l => (verifs.get(l.cultureId)?.conflits.length ?? 0) > 0)
  const enPlace = planche.voisines.filter(p => { const per = periodeSure(p); return per ? per.fin >= today : false })
  const premiere = lignes[0] ? verifs.get(lignes[0].cultureId) : undefined

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!lignes.length || valides.length !== lignes.length) return
    setLoading(true)
    const n = await ctx.createPlantings(plancheId, lignes.map(l => ({
      culture_id: l.cultureId, date_semis: l.dateSemis, surface_m2: l.surface, achat_plant: l.achatPlant,
    })))
    setLoading(false)
    if (!n) return
    const noms = lignes.map(l => parId.get(l.cultureId)?.name).filter(Boolean)
    toast.success(n > 1 ? `${n} cultures plantées` : `${noms[0]} planté`, {
      description: `${planche.plancheName}${n > 1 ? ` : ${noms.join(', ')}` : ''}${enConflit ? ', en conflit de surface sur la période' : ''}`,
    })
    onClose()
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <SurfaceGauge pic={premiere?.picAutres ?? 0} total={planche.plancheM2} periodeConnue={lignes.length === 1 && !!premiere?.dates} />
      {enPlace.length > 0 && (
        <p className="-mt-3 text-xs text-fg-muted">
          Prévu ou en place sur la planche (toutes saisons) : {enPlace.map(p => `${p.culture_name}${p.season_id !== ctx.activeSeason?.id && p.season_name ? ` (${p.season_name})` : ''} ${fmtM2(Number(p.surface_m2))} m², ${jusquA(p, anneeRef)}`).join(' · ')}
        </p>
      )}

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Cultures (cochez-en une ou plusieurs)</legend>
        <SearchInput value={search} onChange={setSearch} placeholder="Filtrer le catalogue…" label="Filtrer les cultures" />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border p-1">
          {filtered.map(c => {
            const coche = lignes.some(l => l.cultureId === c.id)
            return (
              <label key={c.id}
                className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  coche ? 'bg-primary-soft font-medium text-fg' : 'text-fg hover:bg-surface-2')}>
                <input type="checkbox" checked={coche} onChange={() => basculer(c)} className="h-4 w-4 accent-[rgb(var(--primary))]" aria-label={c.name} />
                <span className="flex-1 truncate">{c.name}</span>
                <CycleBadge cycle={c.cycle} masquerAnnuelle />
                <span className="num hidden text-xs text-fg-subtle sm:inline">{c.jours_cellule || 0} / {c.jours_champ} / {c.jours_recolte} j</span>
                <TypeBadge type={c.type} />
              </label>
            )
          })}
          {filtered.length === 0 && <p className="p-3 text-sm text-fg-muted">Aucune culture trouvée</p>}
        </div>
      </fieldset>

      {lignes.length > 0 && (
        <ul className="space-y-3" aria-label="Cultures à planter">
          {lignes.map(l => {
            const c = parId.get(l.cultureId)
            if (!c) return null
            const v = verifs.get(l.cultureId)!
            const vivace = cycleDe(c) === 'vivace'
            return (
              <li key={l.cultureId} className="space-y-3 rounded-xl border border-border p-3.5" aria-label={c.name}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{c.name}</span>
                  <CycleBadge cycle={c.cycle} masquerAnnuelle />
                  {c.premiere_implantation && <span className="text-xs text-fg-subtle">implantation dès le {c.premiere_implantation}</span>}
                  {c.pincer && <Badge tone="amber">Pinçage</Badge>}
                  {c.filet && <Badge tone="violet">Filet</Badge>}
                  <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={() => basculer(c)} aria-label={`Retirer ${c.name}`}><X className="h-4 w-4" /></Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Field label={l.achatPlant ? 'Date de plantation' : 'Date de semis'}>
                    <Input type="date" className="h-11" value={l.dateSemis} aria-label={`${l.achatPlant ? 'Date de plantation' : 'Date de semis'} : ${c.name}`}
                      onChange={e => maj(l.cultureId, { dateSemis: e.target.value })} />
                  </Field>
                  <Field label="Surface (m²)"
                    hint={v.dates && l.surface > 0 && !v.conflits.length ? `Il restera ${fmtM2(Math.max(0, v.plancheM2 - v.picAutres - l.surface))} m² libres au plus chargé.` : undefined}>
                    <Input type="number" inputMode="decimal" className="h-11" min={0.5} step={0.5} value={l.surface} aria-label={`Surface (m²) : ${c.name}`}
                      onChange={e => maj(l.cultureId, { surface: +e.target.value })} />
                  </Field>
                  <div className="pb-3"><CaseAchatPlant checked={l.achatPlant} onChange={b => maj(l.cultureId, { achatPlant: b })} /></div>
                </div>
                {v.dates && <DatesPreview compact title="" vivace={vivace} floraisonManquante={floraisonARenseigner(c)} plantation={formatJourMois(v.dates.plantation, anneeRef)} recolte={formatJourMois(v.dates.recolte, anneeRef)} fin={formatJourMois(v.dates.fin, anneeRef)} />}
                <AvertissementSaisie projetId={projetId(l.cultureId)} conflits={v.conflits} plancheM2={v.plancheM2} surface={l.surface} libre={v.libre}
                  semisSuggere={v.semisSuggere} dateSemis={l.dateSemis} onUseDate={d => maj(l.cultureId, { dateSemis: d })} today={today} />
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-fg-subtle">Plantations rattachées à {ctx.activeSeason?.name || 'la saison active'}. Le calendrier se calcule à partir de la date saisie.</p>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!lignes.length || valides.length !== lignes.length}>
          {lignes.length > 1 ? `Planter ${lignes.length} cultures` : 'Planter'}{enConflit ? ' malgré le conflit' : ''}
        </Button>
      </div>
    </form>
  )
}
