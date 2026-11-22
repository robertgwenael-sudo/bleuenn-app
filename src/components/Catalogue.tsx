'use client'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { ChevronRight, Plus, Star, Trash2 } from 'lucide-react'
import type { CultureCatalog } from '@/lib/types'
import {
  Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, SearchInput, Segmented, Select, SortHeader,
  TableContainer, TypeBadge, useConfirm,
} from '@/components/ui'
import { useIntent } from '@/components/shell/ui-context'
import { photos } from '@/lib/images'
import { CYCLES_CULTURE, LIBELLE_CYCLE, cycleDe, delaiAConfirmer, erreursFicheCycle, eurosEnCentimes, floraisonARenseigner, formatEuros, type CycleCulture } from '@/lib/domain'
import { CycleBadge } from '@/components/plantings/Cycle'

/** Prix par tige affiché sans arrondi flottant ; « non renseigné » si illisible. */
function prixTige(p: unknown): string {
  try { return formatEuros(eurosEnCentimes(p as number)) } catch { return 'prix non renseigné' }
}

/** Durée affichée : cycle complet pour une annuelle, floraison sinon (jours au champ ignorés). */
function dureeCycle(c: CultureCatalog): string {
  if (cycleDe(c) === 'annuelle') return `${(c.jours_cellule || 0) + c.jours_champ + c.jours_recolte} j`
  if (!c.debut_floraison) return cycleDe(c) === 'vivace' ? 'chaque année' : 'une fois'
  const delai = c.delai_premiere_floraison_jours != null ? `, au moins ${c.delai_premiere_floraison_jours} j après plantation` : ''
  return `floraison dès le ${c.debut_floraison}${delai}${cycleDe(c) === 'vivace' ? ', chaque année' : ''}`
}

/** Données de floraison manquantes, jamais devinées. */
function BadgesFloraison({ c }: { c: CultureCatalog }) {
  if (floraisonARenseigner(c)) return <span className="block font-medium text-warning" title="Sans début de floraison, les plantations n’ont pas de dates de récolte : hors prévisionnel de CA et hors disponibilités">floraison à renseigner</span>
  if (delaiAConfirmer(c)) return <span className="block font-medium text-warning" title="Calculé avec 0 jour : prochaine floraison après la plantation">délai avant 1re floraison à confirmer</span>
  return null
}

type SortKey = 'name' | 'type' | 'cycle' | 'premiere_implantation' | 'jours_cellule' | 'jours_champ' | 'jours_recolte' | 'rendement_plant' | 'prix_tige' | 'espacement_cm'
type SortDir = 'asc' | 'desc'

// ─── Formulaire ajout / édition ──────────────
function CultureForm({ culture, ctx, onClose }: { culture: CultureCatalog | null; ctx: any; onClose: () => void }) {
  const confirm = useConfirm()
  const isEdit = !!culture
  const [name, setName] = useState(culture?.name || '')
  const [type, setType] = useState<'RR' | 'MP' | 'RU'>(culture?.type || 'RR')
  const [joursCellule, setJoursCellule] = useState(culture?.jours_cellule ?? 0)
  const [joursChamp, setJoursChamp] = useState(culture?.jours_champ ?? 60)
  const [joursRecolte, setJoursRecolte] = useState(culture?.jours_recolte ?? 21)
  const [rendement, setRendement] = useState(culture?.rendement_plant ?? 1)
  const [prix, setPrix] = useState(culture?.prix_tige ?? 0.5)
  const [tempGerm, setTempGerm] = useState(culture?.temp_germination ?? 20)
  const [pincer, setPincer] = useState(culture?.pincer ?? false)
  const [filet, setFilet] = useState(culture?.filet ?? false)
  const [couvreSol, setCouvreSol] = useState(culture?.couvre_sol ?? false)
  const [semisDirect, setSemisDirect] = useState(culture?.semis_direct ?? false)
  const [espacement, setEspacement] = useState(culture?.espacement_cm ?? 20)
  const [rangs, setRangs] = useState(culture?.rangs_par_planche ?? 5)
  const [graines, setGraines] = useState(culture?.graines_par_plant ?? 1)
  const [notes, setNotes] = useState(culture?.notes || '')
  // 013 : cycle, 1ère implantation possible (jj/mm) ; vivace et bisannuelle :
  // début de floraison (jj/mm) et délai avant 1re floraison à la place des jours au champ
  const [cycle, setCycle] = useState<CycleCulture>(cycleDe(culture ?? {}))
  const [implantation, setImplantation] = useState(culture?.premiere_implantation ?? '')
  const [floraison, setFloraison] = useState(culture?.debut_floraison ?? '')
  const [delai, setDelai] = useState(culture?.delai_premiere_floraison_jours == null ? '' : String(culture.delai_premiere_floraison_jours))
  const annuelle = cycle === 'annuelle'
  const delaiNombre = delai.trim() === '' ? null : Number(delai.trim())
  const [loading, setLoading] = useState(false)
  const [tried, setTried] = useState(false)

  const erreurs = erreursFicheCycle({
    jours_cellule: joursCellule, jours_champ: annuelle ? joursChamp : 0, jours_recolte: joursRecolte,
    cycle, premiere_implantation: implantation.trim() || null,
    debut_floraison: annuelle ? null : floraison.trim() || null,
    delai_premiere_floraison_jours: annuelle ? null : delaiNombre,
  })

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (!name || erreurs.length) return
    setLoading(true)
    const data = {
      name, type,
      cycle,
      premiere_implantation: implantation.trim() || null,
      debut_floraison: annuelle ? null : floraison.trim() || null,
      delai_premiere_floraison_jours: annuelle ? null : delaiNombre,
      jours_cellule: joursCellule,
      // Vivace / bisannuelle : jours au champ ignorés, valeur neutre
      jours_champ: annuelle ? joursChamp : 0,
      jours_recolte: joursRecolte,
      rendement_plant: rendement,
      prix_tige: prix,
      temp_germination: tempGerm,
      pincer, filet, couvre_sol: couvreSol, semis_direct: semisDirect,
      espacement_cm: espacement,
      rangs_par_planche: rangs,
      graines_par_plant: graines,
      notes: notes || null,
    }
    if (isEdit && culture) {
      await ctx.updateCulture(culture.id, data)
      toast.success(`${name} mis à jour`, { description: 'Les dates des plantations concernées sont recalculées.' })
    } else {
      await ctx.addCulture(data)
      toast.success(`${name} ajouté au catalogue`)
    }
    setLoading(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!culture) return
    const ok = await confirm({
      title: `Supprimer « ${culture.name} » ?`,
      description: 'La culture sera retirée du catalogue. Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) {
      await ctx.deleteCulture(culture.id)
      toast.success(`${culture.name} supprimé du catalogue`)
      onClose()
    }
  }

  // Calcul du cycle total (jours en cellule, au champ, de récolte ; jamais le JAM)
  const cycleTotal = joursCellule + joursChamp + joursRecolte
  const num = (v: number, set: (n: number) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input type="number" inputMode="decimal" value={v} onChange={e => set(+e.target.value)} {...props} />
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Cycle preview */}
      <div className="rounded-xl border border-border bg-surface-2/60 p-3.5">
        {cycle === 'annuelle'
          ? <p className="text-xs text-fg-muted">Cycle total : <strong className="num text-fg">{cycleTotal} jours</strong></p>
          : <p className="text-xs text-fg-muted">
              {cycle === 'vivace' ? 'Vivace' : 'Bisannuelle'} : récolte à partir du <strong className="num text-fg">{floraison.trim() || 'début de floraison à renseigner'}</strong>
              {delaiNombre != null ? `, au moins ${delaiNombre} jours après la plantation` : floraison.trim() ? ' suivant la plantation (délai avant 1re floraison à confirmer)' : ''}
              {cycle === 'vivace' ? ', puis chaque année. Occupe sa planche jusqu’à son arrachage.' : ', une seule fois.'}
            </p>}
        {annuelle && <>
        <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {cycleTotal > 0 && <>
            <div className="bg-phase-cellule" style={{ width: `${joursCellule / cycleTotal * 100}%` }} />
            <div className="bg-phase-champ" style={{ width: `${joursChamp / cycleTotal * 100}%` }} />
            <div className="bg-phase-recolte" style={{ width: `${joursRecolte / cycleTotal * 100}%` }} />
          </>}
        </div>
        <p className="num mt-1.5 text-xs text-fg-subtle">{joursCellule} j cellule + {joursChamp} j champ + {joursRecolte} j récolte</p>
        </>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Nom" className="col-span-3 sm:col-span-2" error={!name && loading ? 'Requis' : undefined}>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Cosmos" autoFocus={!isEdit} />
        </Field>
        <Field label="Type" className="col-span-3 sm:col-span-1">
          <Select value={type} onChange={e => setType(e.target.value as any)}>
            <option value="RR">RR : répétitive</option>
            <option value="MP">MP : moyen</option>
            <option value="RU">RU : unique</option>
          </Select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Cycle</legend>
        <Segmented label="Cycle de la culture" value={cycle} onChange={setCycle} size="sm" className="mb-3"
          options={CYCLES_CULTURE.map(c => ({ value: c, label: LIBELLE_CYCLE[c] }))} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Jours en cellule">{num(joursCellule, setJoursCellule, { min: 0 })}</Field>
          {annuelle && <Field label="Jours au champ">{num(joursChamp, setJoursChamp, { min: 0 })}</Field>}
          {!annuelle && (
            <Field label="Début de floraison" hint={floraison.trim() ? 'jj/mm, chaque année' : 'jj/mm : sans lui, pas de dates de récolte'}>
              <Input value={floraison} onChange={e => setFloraison(e.target.value)} placeholder="15/06" inputMode="numeric" maxLength={5} />
            </Field>
          )}
          <Field label={cycle === 'vivace' ? 'Jours de récolte par an' : 'Jours de récolte'}>{num(joursRecolte, setJoursRecolte, { min: 1 })}</Field>
          {!annuelle && (
            <Field label="Délai avant 1re floraison (jours)" className="col-span-3 sm:col-span-1" hint={delai.trim() ? 'Après la plantation' : 'À confirmer : vide = 0 jour'}>
              <Input type="number" inputMode="numeric" min={0} max={3650} step={1} value={delai} onChange={e => setDelai(e.target.value)} placeholder="à confirmer" />
            </Field>
          )}
          <Field label="1ère implantation possible" className="col-span-3 sm:col-span-1" hint="jj/mm, par exemple 21/05">
            <Input value={implantation} onChange={e => setImplantation(e.target.value)} placeholder="21/05" inputMode="numeric" maxLength={5} />
          </Field>
        </div>
        {tried && erreurs.length > 0 && (
          <ul role="alert" className="mt-2 space-y-0.5 text-xs font-medium text-danger">
            {erreurs.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Production</legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Rendement/plant">{num(rendement, setRendement, { min: 0, step: 0.5 })}</Field>
          <Field label="Prix/tige (€)">{num(prix, setPrix, { min: 0, step: 0.05 })}</Field>
          <Field label="Temp. germ. (°C)">{num(tempGerm, setTempGerm)}</Field>
          <Field label="Espacement (cm)">{num(espacement, setEspacement, { min: 5 })}</Field>
          <Field label="Rangs/planche">{num(rangs, setRangs, { min: 1 })}</Field>
          <Field label="Graines/plant">{num(graines, setGraines, { min: 1 })}</Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">Conduite</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Pincer', val: pincer, set: setPincer },
            { label: 'Filet', val: filet, set: setFilet },
            { label: 'Couvre-sol', val: couvreSol, set: setCouvreSol },
            { label: 'Semis direct', val: semisDirect, set: setSemisDirect },
          ].map(cb => (
            <label key={cb.label} className="flex h-11 cursor-pointer select-none items-center gap-2.5 rounded-lg border border-border px-3 text-sm text-fg has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="checkbox" checked={cb.val} onChange={e => cb.set(e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--primary))]" />
              {cb.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Notes">
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Conseils, particularités…" />
      </Field>

      {isEdit && culture && !culture.user_id && (
        <p className="flex items-center gap-1.5 text-xs text-fg-muted"><Star className="h-3.5 w-3.5 text-warning" aria-hidden />Culture système : les modifications s’appliqueront à votre compte uniquement.</p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
        {isEdit && culture?.user_id && (
          <Button variant="danger-ghost" onClick={handleDelete} className="sm:mr-auto"><Trash2 className="h-4 w-4" />Supprimer cette culture</Button>
        )}
        <Button variant="secondary" onClick={onClose} className={isEdit && culture?.user_id ? '' : 'sm:ml-auto'}>Annuler</Button>
        <Button type="submit" loading={loading} disabled={!name || (tried && erreurs.length > 0)}>{isEdit ? 'Enregistrer' : 'Ajouter'}</Button>
      </div>
    </form>
  )
}

// ─── Composant principal ──────────────────────
export default function Catalogue({ ctx }: { ctx: any }) {
  const catalog: CultureCatalog[] = ctx.catalog || []
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'' | 'RR' | 'MP' | 'RU'>('')
  const [filterCycle, setFilterCycle] = useState<'' | CycleCulture>('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editCulture, setEditCulture] = useState<CultureCatalog | null>(null)

  useIntent('new-culture', () => { setEditCulture(null); setModal('add') })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let result = [...catalog]
    // Recherche
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      )
    }
    // Filtre type
    if (filterType) result = result.filter(c => c.type === filterType)
    if (filterCycle) result = result.filter(c => cycleDe(c) === filterCycle)
    // Tri
    result.sort((a, b) => {
      // jj/mm se trie par mois puis jour ; cycle absent = annuelle
      const cle = (c: CultureCatalog): any => sortKey === 'cycle' ? cycleDe(c)
        : sortKey === 'premiere_implantation' ? (c.premiere_implantation ? c.premiere_implantation.split('/').reverse().join('/') : '~')
        : c[sortKey]
      const av = cle(a)
      const bv = cle(b)
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0)
    })
    return result
  }, [catalog, search, filterType, filterCycle, sortKey, sortDir])

  const th = (k: SortKey, label: string, center = true) => (
    <SortHeader key={k} label={label} active={sortKey === k} dir={sortDir} onClick={() => toggleSort(k)} className={center ? '!text-center' : ''} />
  )
  const open = (c: CultureCatalog) => { setEditCulture(c); setModal('edit') }

  return (
    <div>
      <PageHeader
        title="Catalogue des cultures"
        description={`${catalog.length} variétés, le référentiel technique de votre ferme`}
        image={photos.bouquetTulipes}
        actions={<Button onClick={() => { setEditCulture(null); setModal('add') }}><Plus className="h-4 w-4" />Nouvelle culture</Button>}
      />

      {/* Barre recherche + filtres */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Rechercher une culture, un type, une note…" className="sm:w-80" label="Rechercher dans le catalogue" />
        <Segmented label="Filtrer par type" value={filterType} onChange={setFilterType} size="sm" className="sm:w-auto"
          options={[{ value: '', label: 'Tous' }, { value: 'RR', label: 'RR' }, { value: 'MP', label: 'MP' }, { value: 'RU', label: 'RU' }]} />
        <Segmented label="Filtrer par cycle" value={filterCycle} onChange={setFilterCycle} size="sm" className="sm:w-auto"
          options={[{ value: '', label: 'Tous cycles' }, ...CYCLES_CULTURE.map(c => ({ value: c, label: `${LIBELLE_CYCLE[c]}s` }))]} />
        <span className="num text-xs text-fg-subtle sm:ml-auto">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState image={photos.bouquetTulipes}
            title={search ? 'Aucune culture trouvée' : 'Catalogue vide'}
            description={search ? `Aucune culture ne correspond à « ${search} ».` : 'Ajoutez vos variétés pour calculer automatiquement les dates et rendements.'}
            action={<Button onClick={() => { setEditCulture(null); setModal('add') }}><Plus className="h-4 w-4" />Nouvelle culture</Button>} />
        </Card>
      ) : (
        <>
          {/* Mobile : liste */}
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card md:hidden">
            {filtered.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => open(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium text-fg">
                      {c.name}{!c.user_id && <Star className="h-3 w-3 shrink-0 fill-current text-warning" aria-label="Culture système" />}
                    </p>
                    <p className="num truncate text-xs text-fg-muted">
                      {cycleDe(c) === 'annuelle' ? `${c.jours_cellule || 0} / ${c.jours_champ} / ${c.jours_recolte} j` : `${c.jours_cellule || 0} j cellule, ${c.jours_recolte} j récolte`} · {dureeCycle(c)}{c.premiere_implantation ? ` · dès le ${c.premiere_implantation}` : ''} · {prixTige(c.prix_tige)}
                    </p>
                    <span className="text-xs"><BadgesFloraison c={c} /></span>
                  </div>
                  <CycleBadge cycle={c.cycle} masquerAnnuelle />
                  <TypeBadge type={c.type} />
                  <ChevronRight className="h-4 w-4 text-fg-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          {/* Bureau : tableau triable */}
          <TableContainer className="hidden md:block" label="Catalogue des cultures">
            <table className="data-table min-w-[1280px]">
              <thead>
                <tr>
                  {th('name', 'Culture', false)}
                  {th('type', 'Type')}
                  {th('cycle', 'Cycle')}
                  {th('jours_cellule', 'J. cellule')}
                  {th('jours_champ', 'J. champ')}
                  {th('jours_recolte', 'J. récolte')}
                  <th className="!text-center">Durée</th>
                  {th('premiere_implantation', '1re implant.')}
                  {th('rendement_plant', 'Rend./plant')}
                  {th('prix_tige', 'Prix/tige')}
                  {th('espacement_cm', 'Espac. (cm)')}
                  <th className="!text-center">Rangs</th>
                  <th className="!text-center">Options</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => open(c)}>
                    <td className="font-medium">
                      <button type="button" onClick={e => { e.stopPropagation(); open(c) }} className="inline-flex items-center gap-1.5 rounded text-left hover:underline">
                        {c.name}
                        {!c.user_id && <Star className="h-3 w-3 fill-current text-warning" aria-label="Culture système" />}
                      </button>
                    </td>
                    <td className="text-center"><TypeBadge type={c.type} /></td>
                    <td className="text-center"><CycleBadge cycle={c.cycle} /></td>
                    <td className="num text-center">{c.jours_cellule || 0}</td>
                    <td className="num text-center">{cycleDe(c) === 'annuelle' ? c.jours_champ : <span className="text-xs text-fg-subtle" title="Vivace ou bisannuelle : la récolte suit le début de floraison">sans objet</span>}</td>
                    <td className="num text-center">{c.jours_recolte}</td>
                    <td className="num text-center text-xs font-semibold">
                      {dureeCycle(c)}
                      <BadgesFloraison c={c} />
                    </td>
                    <td className="num text-center">{c.premiere_implantation || <span className="text-fg-subtle" title="Non renseignée dans la charte">non renseignée</span>}</td>
                    <td className="num text-center">{c.rendement_plant}</td>
                    <td className="num text-center font-medium">{prixTige(c.prix_tige)}</td>
                    <td className="num text-center">{c.espacement_cm}</td>
                    <td className="num text-center">{c.rangs_par_planche}</td>
                    <td>
                      <div className="flex justify-center gap-1">
                        {c.pincer && <Badge tone="amber">Pincer</Badge>}
                        {c.filet && <Badge tone="violet">Filet</Badge>}
                        {c.couvre_sol && <Badge tone="green">Couvre-sol</Badge>}
                        {c.semis_direct && <Badge tone="rose">Direct</Badge>}
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate text-xs text-fg-muted" title={c.notes || ''}>{c.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}

      {/* Modales */}
      <Dialog open={modal === 'add'} onOpenChange={o => !o && setModal(null)} size="lg" title="Nouvelle culture"
        description="Ajoutée à votre catalogue, disponible pour toutes vos planches.">
        <CultureForm culture={null} ctx={ctx} onClose={() => setModal(null)} />
      </Dialog>
      <Dialog open={modal === 'edit'} onOpenChange={o => !o && setModal(null)} size="lg"
        title={editCulture ? `Modifier ${editCulture.name}` : 'Modifier'}>
        {editCulture && <CultureForm key={editCulture.id} culture={editCulture} ctx={ctx} onClose={() => setModal(null)} />}
      </Dialog>
    </div>
  )
}

