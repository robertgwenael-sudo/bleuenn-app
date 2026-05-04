'use client'
import { useState, useMemo } from 'react'
import type { CultureCatalog } from '@/lib/types'
import Modal from '@/components/Modal'

type SortKey = 'name' | 'type' | 'jours_cellule' | 'jours_champ' | 'jours_recolte' | 'rendement_plant' | 'prix_tige' | 'espacement_cm'
type SortDir = 'asc' | 'desc'

// ─── Formulaire ajout / édition ──────────────
function CultureForm({ culture, ctx, onClose }: { culture: CultureCatalog | null; ctx: any; onClose: () => void }) {
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
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name) return
    setLoading(true)
    const data = {
      name, type,
      jours_cellule: joursCellule,
      jours_champ: joursChamp,
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
    } else {
      await ctx.addCulture(data)
    }
    setLoading(false)
    onClose()
  }

  const handleDelete = async () => {
    if (!culture) return
    if (confirm(`Supprimer "${culture.name}" du catalogue ? Cette action est irreversible.`)) {
      await ctx.deleteCulture(culture.id)
      onClose()
    }
  }

  // Calcul du cycle total
  const cycleTotal = joursCellule + joursChamp + joursRecolte

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">{isEdit ? `Modifier — ${culture?.name}` : 'Nouvelle culture'}</h3>

      {/* Cycle preview */}
      <div className="bg-lin rounded-btn p-3 text-xs text-terre">
        Cycle total : <strong className="text-brun">{cycleTotal} jours</strong> ({joursCellule}j cellule + {joursChamp}j champ + {joursRecolte}j recolte)
      </div>

      {/* Nom + Type */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Nom</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Cosmos" />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Type</label>
          <select className="input" value={type} onChange={e => setType(e.target.value as any)}>
            <option value="RR">RR — Repetitive</option>
            <option value="MP">MP — Moyen</option>
            <option value="RU">RU — Unique</option>
          </select>
        </div>
      </div>

      {/* Jours */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">J. cellule</label>
          <input className="input" type="number" min={0} value={joursCellule} onChange={e => setJoursCellule(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">J. champ</label>
          <input className="input" type="number" min={1} value={joursChamp} onChange={e => setJoursChamp(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">J. recolte</label>
          <input className="input" type="number" min={1} value={joursRecolte} onChange={e => setJoursRecolte(+e.target.value)} />
        </div>
      </div>

      {/* Rendement + Prix */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Rendement/plant</label>
          <input className="input" type="number" min={0} step={0.5} value={rendement} onChange={e => setRendement(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Prix/tige (€)</label>
          <input className="input" type="number" min={0} step={0.05} value={prix} onChange={e => setPrix(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Temp. germ. (°C)</label>
          <input className="input" type="number" value={tempGerm} onChange={e => setTempGerm(+e.target.value)} />
        </div>
      </div>

      {/* Espacement + Rangs + Graines */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Espacement (cm)</label>
          <input className="input" type="number" min={5} value={espacement} onChange={e => setEspacement(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Rangs/planche</label>
          <input className="input" type="number" min={1} value={rangs} onChange={e => setRangs(+e.target.value)} />
        </div>
        <div>
          <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Graines/plant</label>
          <input className="input" type="number" min={1} value={graines} onChange={e => setGraines(+e.target.value)} />
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-4 py-1">
        {[
          { label: 'Pincer', val: pincer, set: setPincer },
          { label: 'Filet', val: filet, set: setFilet },
          { label: 'Couvre-sol', val: couvreSol, set: setCouvreSol },
          { label: 'Semis direct', val: semisDirect, set: setSemisDirect },
        ].map(cb => (
          <label key={cb.label} className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={cb.val} onChange={e => cb.set(e.target.checked)}
              className="w-4 h-4 rounded border-lin-dark text-sage focus:ring-sage-pale" />
            {cb.label}
          </label>
        ))}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[0.65rem] font-bold text-terre uppercase tracking-widest mb-1">Notes</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Conseils, particularites..." />
      </div>

      <div className="flex gap-3 pt-2">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit} disabled={loading || !name}>
          {loading ? '...' : isEdit ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>

      {isEdit && culture && !culture.user_id && (
        <p className="text-[0.65rem] text-terre text-center">Culture systeme — les modifications s&apos;appliqueront a votre compte uniquement.</p>
      )}
      {isEdit && culture?.user_id && (
        <button className="btn btn-danger w-full text-xs mt-1" onClick={handleDelete}>
          Supprimer cette culture
        </button>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────
export default function Catalogue({ ctx }: { ctx: any }) {
  const catalog: CultureCatalog[] = ctx.catalog || []
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'' | 'RR' | 'MP' | 'RU'>('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editCulture, setEditCulture] = useState<CultureCatalog | null>(null)

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
    // Tri
    result.sort((a, b) => {
      const av = a[sortKey] as any
      const bv = b[sortKey] as any
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0)
    })
    return result
  }, [catalog, search, filterType, sortKey, sortDir])

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="text-terre/30 ml-0.5">&#x25B4;&#x25BE;</span>
    return <span className="text-pivoine ml-0.5">{sortDir === 'asc' ? '&#x25B4;' : '&#x25BE;'}</span>
  }

  const ThSort = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={`table-header cursor-pointer select-none hover:bg-sage-pale/50 transition ${className}`}
      onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-0.5">{children}<SortIcon k={k} /></span>
    </th>
  )

  const typeColors: Record<string, string> = {
    RR: 'badge-rr', MP: 'badge-mp', RU: 'badge-ru'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="font-serif text-4xl mb-1 font-medium">Catalogue des cultures</h2>
          <p className="text-terre text-sm">{catalog.length} varietes — le referentiel technique de votre ferme</p>
        </div>
        <button className="btn btn-sage" onClick={() => { setEditCulture(null); setModal('add') }}>+ Nouvelle culture</button>
      </div>

      {/* Barre recherche + filtres */}
      <div className="flex flex-wrap gap-3 my-5">
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-terre/40 text-sm">&#x1F50D;</span>
          <input
            className="input !pl-10"
            placeholder="Rechercher une culture, un type, une note..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-terre/40 hover:text-brun text-sm"
              onClick={() => setSearch('')}>&#x2715;</button>
          )}
        </div>
        <div className="flex gap-1.5">
          {(['', 'RR', 'MP', 'RU'] as const).map(t => (
            <button key={t}
              className={`btn btn-sm ${filterType === t ? 'btn-sage' : 'btn-outline'}`}
              onClick={() => setFilterType(t)}
            >
              {t || 'Tous'}
            </button>
          ))}
        </div>
        <div className="text-xs text-terre self-center">
          {filtered.length} resultat{filtered.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-card border border-lin-dark/60">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr>
              <ThSort k="name" className="!text-left min-w-[160px]">Culture</ThSort>
              <ThSort k="type">Type</ThSort>
              <ThSort k="jours_cellule">J. cellule</ThSort>
              <ThSort k="jours_champ">J. champ</ThSort>
              <ThSort k="jours_recolte">J. recolte</ThSort>
              <th className="table-header text-center">Cycle total</th>
              <ThSort k="rendement_plant">Rend./plant</ThSort>
              <ThSort k="prix_tige">Prix/tige</ThSort>
              <ThSort k="espacement_cm">Espac. (cm)</ThSort>
              <th className="table-header text-center">Rangs</th>
              <th className="table-header text-center">Options</th>
              <th className="table-header !text-left">Notes</th>
              <th className="table-header w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}
                className="border-b border-lin-dark/40 hover:bg-rose-pale/20 cursor-pointer transition-colors"
                onClick={() => { setEditCulture(c); setModal('edit') }}
              >
                <td className="table-cell !text-left font-semibold text-brun">
                  {c.name}
                  {!c.user_id && <span className="text-[0.55rem] text-or ml-1.5 font-normal" title="Culture systeme">&#x2605;</span>}
                </td>
                <td className="table-cell text-center">
                  <span className={`badge text-[0.55rem] ${typeColors[c.type]}`}>{c.type}</span>
                </td>
                <td className="table-cell text-center font-mono text-sm">{c.jours_cellule || '—'}</td>
                <td className="table-cell text-center font-mono text-sm">{c.jours_champ}</td>
                <td className="table-cell text-center font-mono text-sm">{c.jours_recolte}</td>
                <td className="table-cell text-center font-mono text-sm font-bold text-pivoine">
                  {(c.jours_cellule || 0) + c.jours_champ + c.jours_recolte}j
                </td>
                <td className="table-cell text-center">{c.rendement_plant}</td>
                <td className="table-cell text-center font-semibold text-sage-dark">{c.prix_tige.toFixed(2)}€</td>
                <td className="table-cell text-center">{c.espacement_cm}</td>
                <td className="table-cell text-center">{c.rangs_par_planche}</td>
                <td className="table-cell text-center">
                  <div className="flex justify-center gap-1 flex-wrap">
                    {c.pincer && <span className="badge badge-mp text-[0.5rem] !px-1.5 !py-0">Pincer</span>}
                    {c.filet && <span className="badge badge-ru text-[0.5rem] !px-1.5 !py-0">Filet</span>}
                    {c.couvre_sol && <span className="badge badge-rr text-[0.5rem] !px-1.5 !py-0">C-sol</span>}
                    {c.semis_direct && <span className="badge badge-semer text-[0.5rem] !px-1.5 !py-0">Direct</span>}
                  </div>
                </td>
                <td className="table-cell !text-left text-xs text-terre max-w-[200px] truncate" title={c.notes || ''}>
                  {c.notes || '—'}
                </td>
                <td className="table-cell text-center">
                  <span className="text-terre/40 text-xs">&#x270E;</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={13} className="table-cell text-center text-terre py-10">
                  {search ? `Aucune culture ne correspond a "${search}"` : 'Aucune culture dans le catalogue.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <Modal open={modal === 'add'} onClose={() => setModal(null)}>
        <CultureForm culture={null} ctx={ctx} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'edit'} onClose={() => setModal(null)}>
        {editCulture && <CultureForm culture={editCulture} ctx={ctx} onClose={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
