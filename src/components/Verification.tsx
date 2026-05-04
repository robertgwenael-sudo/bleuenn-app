'use client'
import { Fragment, useState } from 'react'
import { getWeekNumber, formatDateShort } from '@/lib/types'
import type { PlantingFull, Garden, CultureCatalog } from '@/lib/types'
import Modal from '@/components/Modal'

// ─── Formulaire édition plantation ──────────────────
function EditPlantingForm({ planting, ctx, onClose }: { planting: PlantingFull; ctx: any; onClose: () => void }) {
  const [dateSemis, setDateSemis] = useState(planting.date_semis)
  const [surfaceM2, setSurfaceM2] = useState(planting.surface_m2)
  const [notes, setNotes] = useState(planting.notes || '')
  const [loading, setLoading] = useState(false)

  const allPlantings: PlantingFull[] = ctx.plantings || []
  const otherPlantings = allPlantings.filter((p: PlantingFull) => p.planche_id === planting.planche_id && p.id !== planting.id)
  const usedM2 = otherPlantings.reduce((sum: number, p: PlantingFull) => sum + (p.surface_m2 || 0), 0)

  let plancheM2 = 0
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === planting.planche_id) { plancheM2 = pl.surface_m2; break }
    }
  }
  const availableM2 = Math.max(0, plancheM2 - usedM2)
  const isOverCapacity = surfaceM2 > availableM2

  // Preview dates dynamiques
  const jc = planting.jours_cellule || 0
  const jch = planting.jours_champ || 0
  const jr = planting.jours_recolte || 21
  let previewPlantation = '', previewRecolte = '', previewFin = ''
  if (dateSemis) {
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + jc)
    const dr = new Date(dp); dr.setDate(dr.getDate() + jch)
    const df = new Date(dr); df.setDate(df.getDate() + jr)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  const submit = async () => {
    if (!dateSemis || isOverCapacity || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.updatePlanting(planting.id, { date_semis: dateSemis, surface_m2: surfaceM2, notes: notes || null })
    setLoading(false)
    onClose()
  }

  const handleDelete = async () => {
    if (confirm(`Supprimer ${planting.culture_name} de cette planche ?`)) {
      await ctx.deletePlanting(planting.id)
      onClose()
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Modifier — {planting.culture_name}</h3>

      <div className="bg-sage-pale rounded-lg p-3 text-xs space-y-1">
        <p><strong>Type :</strong> {planting.culture_type === 'RR' ? 'Récolte Répétitive' : planting.culture_type === 'MP' ? 'Moyen Producteur' : 'Récolte Unique'}</p>
        <p><strong>Planche :</strong> {planting.planche_name} — <strong>Jardin :</strong> {planting.garden_name}</p>
        <p><strong>J. cellule :</strong> {jc} — <strong>J. champ :</strong> {jch} — <strong>J. récolte :</strong> {jr}</p>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Surface allouée (m²)</label>
        <input
          className={`input ${isOverCapacity ? '!border-red-400 !bg-red-50' : ''}`}
          type="number" min={0.5} max={plancheM2} step={0.5}
          value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)}
        />
        {isOverCapacity && (
          <p className="text-[0.7rem] text-red-600 mt-1 font-semibold">
            Capacité dépassée ! Max {availableM2} m² disponibles.
          </p>
        )}
        {!isOverCapacity && surfaceM2 > 0 && (
          <p className="text-[0.7rem] text-terre mt-1">
            Il restera {(availableM2 - surfaceM2).toFixed(1)} m² disponibles.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Date de semis</label>
        <input className="input" type="date" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
      </div>

      {previewPlantation && (
        <div className="bg-cream-dark rounded-lg p-3 text-xs space-y-1">
          <p className="font-semibold text-brun">Dates recalculées :</p>
          <p>Plantation : <strong>{previewPlantation}</strong></p>
          <p>Début récolte : <strong>{previewRecolte}</strong></p>
          <p>Fin récolte : <strong>{previewFin}</strong></p>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1">Notes</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes optionnelles…" />
      </div>

      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit} disabled={loading || !dateSemis || isOverCapacity || surfaceM2 <= 0}>
          {loading ? '…' : 'Enregistrer'}
        </button>
      </div>
      <button className="btn btn-danger w-full text-xs" onClick={handleDelete}>
        Supprimer cette culture de la planche
      </button>
    </div>
  )
}

// ─── Formulaire ajout rapide culture sur planche ────
function AddCultureForm({ plancheId, plancheM2, ctx, onClose }: {
  plancheId: string; plancheM2: number; ctx: any; onClose: () => void
}) {
  const catalog: CultureCatalog[] = ctx.catalog || []
  const allPlantings: PlantingFull[] = ctx.plantings || []
  const usedM2 = allPlantings
    .filter((p: PlantingFull) => p.planche_id === plancheId)
    .reduce((sum: number, p: PlantingFull) => sum + (p.surface_m2 || 0), 0)
  const availableM2 = Math.max(0, plancheM2 - usedM2)

  const [cultureId, setCultureId] = useState('')
  const [surfaceM2, setSurfaceM2] = useState(Math.min(1, availableM2))
  const [dateSemis, setDateSemis] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const filtered = catalog.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name))

  const selected = catalog.find(c => c.id === cultureId)
  const isOverCapacity = surfaceM2 > availableM2

  // Preview dates
  let previewPlantation = '', previewRecolte = '', previewFin = ''
  if (dateSemis && selected) {
    const jc = selected.jours_cellule || 0
    const jch = selected.jours_champ || 0
    const jr = selected.jours_recolte || 21
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + jc)
    const dr = new Date(dp); dr.setDate(dr.getDate() + jch)
    const df = new Date(dr); df.setDate(df.getDate() + jr)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  const submit = async () => {
    if (!cultureId || !dateSemis || isOverCapacity || surfaceM2 <= 0) return
    setLoading(true)
    await ctx.createPlanting(plancheId, cultureId, dateSemis, surfaceM2)
    setLoading(false)
    onClose()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Ajouter une culture</h3>
      <p className="text-xs text-terre">{availableM2.toFixed(1)} m² disponibles sur cette planche</p>

      <div>
        <label className="block text-xs font-semibold mb-1">Rechercher une culture</label>
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tapez pour filtrer…" />
      </div>

      <div className="max-h-40 overflow-y-auto border border-cream-dark rounded-lg">
        {filtered.map(c => (
          <button
            key={c.id}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-cream/50 flex items-center justify-between ${cultureId === c.id ? 'bg-sage-pale font-semibold' : ''}`}
            onClick={() => setCultureId(c.id)}
          >
            <span>{c.name}</span>
            <span className={`badge text-[0.5rem] ${c.type === 'RR' ? 'badge-recolte' : c.type === 'MP' ? 'badge-mp' : 'badge-ru'}`}>{c.type}</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-xs text-terre p-3">Aucune culture trouvée</p>}
      </div>

      {selected && (
        <div className="bg-sage-pale rounded-lg p-2 text-xs">
          <strong>{selected.name}</strong> — J.cell: {selected.jours_cellule} / J.champ: {selected.jours_champ} / J.réc: {selected.jours_recolte}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1">Surface (m²)</label>
        <input
          className={`input ${isOverCapacity ? '!border-red-400 !bg-red-50' : ''}`}
          type="number" min={0.5} max={plancheM2} step={0.5}
          value={surfaceM2} onChange={e => setSurfaceM2(+e.target.value)}
        />
        {isOverCapacity && (
          <p className="text-[0.7rem] text-red-600 mt-1 font-semibold">Max {availableM2} m² disponibles.</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Date de semis</label>
        <input className="input" type="date" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
      </div>

      {previewPlantation && (
        <div className="bg-cream-dark rounded-lg p-3 text-xs space-y-1">
          <p className="font-semibold text-brun">Dates calculées :</p>
          <p>Plantation : <strong>{previewPlantation}</strong></p>
          <p>Début récolte : <strong>{previewRecolte}</strong></p>
          <p>Fin récolte : <strong>{previewFin}</strong></p>
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit}
          disabled={loading || !cultureId || !dateSemis || isOverCapacity || surfaceM2 <= 0}>
          {loading ? '…' : 'Ajouter'}
        </button>
      </div>
    </div>
  )
}

// ─── Composant principal ────────────────────────────
export default function Verification({ ctx }: { ctx: any }) {
  const gardens: Garden[] = ctx.gardens || []
  const plantings: PlantingFull[] = ctx.plantings || []
  const [modal, setModal] = useState<'edit' | 'add' | null>(null)
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)
  const [selectedPlanche, setSelectedPlanche] = useState<{ id: string; m2: number } | null>(null)

  // Regrouper par jardin puis par planche
  type PlancheGroup = { plancheId: string; plancheName: string; plancheM2: number; plantings: PlantingFull[] }
  type GardenGroup = { garden: Garden; planches: PlancheGroup[] }

  const allPlanches: PlancheGroup[] = []
  const gardenGroups: GardenGroup[] = gardens.map(g => {
    const planches = (g.planches || []).map((pl: any) => {
      const plPlantings = plantings
        .filter(p => p.planche_id === pl.id)
        .sort((a, b) => a.culture_name.localeCompare(b.culture_name))
      const group = { plancheId: pl.id, plancheName: pl.name, plancheM2: pl.surface_m2, plantings: plPlantings }
      allPlanches.push(group)
      return group
    })
    return { garden: g, planches }
  })

  // Inclure les planches vides pour pouvoir ajouter des cultures
  const gardenGroupsVisible = gardenGroups.filter(gg => gg.planches.length > 0)
  const totalPlantings = gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.length, 0), 0)

  const openEdit = (p: PlantingFull) => {
    setSelectedPlanting(p)
    setModal('edit')
  }

  const openAdd = (plancheId: string, plancheM2: number) => {
    setSelectedPlanche({ id: plancheId, m2: plancheM2 })
    setModal('add')
  }

  // Calculs dérivés
  const calc = (p: PlantingFull) => {
    const surface = p.surface_m2 || p.planche_m2 || 1
    const espacement_cm = p.espacement_cm || 20
    const rangs = p.rangs_par_planche || 5
    const graines_par_plant = p.graines_par_plant || 1
    const rendement = p.rendement || 1
    const prix = p.prix_tige || 0.5
    const jc = p.jours_cellule || 0
    const jch = p.jours_champ || 0
    const jr = p.jours_recolte || 21

    let plants = Math.max(1, Math.floor(surface * 10000 / (espacement_cm * espacement_cm)))
    if (plants > surface * 50) plants = Math.floor(surface * 25)

    const tiges_brutes = Math.round(plants * rendement)
    const tiges_nettes = Math.round(tiges_brutes * 0.7)
    const revenu = Math.round(tiges_nettes * prix * 100) / 100
    const graines = Math.ceil(plants * 1.3 * graines_par_plant)

    const semaines_recolte = Math.max(1, Math.round(jr / 7))
    const tiges_par_semaine = Math.round(tiges_nettes / semaines_recolte)
    const ca_semaine = Math.round(tiges_par_semaine * prix * 100) / 100

    const ds = new Date(p.date_semis + 'T00:00:00')
    const dp = new Date(p.date_plantation + 'T00:00:00')
    const dr = p.date_recolte ? new Date(p.date_recolte + 'T00:00:00') : null
    const df = p.date_fin ? new Date(p.date_fin + 'T00:00:00') : null

    return {
      surface, espacement_cm, rangs, graines_par_plant,
      plants: p.plants_count || plants,
      graines: p.graines_necessaires || graines,
      tiges_brutes,
      tiges_nettes: p.tiges_estimees || tiges_nettes,
      tiges_par_semaine, rendement, prix,
      revenu: p.revenu_estime || revenu,
      ca_semaine, jc, jch, jr,
      pincer: p.pincer, filet: p.filet, couvre_sol: p.couvre_sol, semis_direct: p.semis_direct,
      temp_germination: p.temp_germination,
      date_semis: formatDateShort(p.date_semis),
      date_plantation: formatDateShort(p.date_plantation),
      date_recolte: formatDateShort(p.date_recolte),
      date_fin: formatDateShort(p.date_fin),
      week_semis: getWeekNumber(ds),
      week_plantation: getWeekNumber(dp),
      week_recolte: dr ? getWeekNumber(dr) : null,
      week_fin: df ? getWeekNumber(df) : null,
    }
  }

  return (
    <div>
      <h2 className="font-serif text-3xl mb-1">Tableau de vérification</h2>
      <p className="text-terre text-sm mb-5">Vue complète de la production — {totalPlantings} cultures réparties sur {gardens.length} jardins</p>

      {/* Modal édition */}
      <Modal open={modal === 'edit' && !!selectedPlanting} onClose={() => setModal(null)}>
        {selectedPlanting && <EditPlantingForm planting={selectedPlanting} ctx={ctx} onClose={() => setModal(null)} />}
      </Modal>

      {/* Modal ajout */}
      <Modal open={modal === 'add' && !!selectedPlanche} onClose={() => setModal(null)}>
        {selectedPlanche && <AddCultureForm plancheId={selectedPlanche.id} plancheM2={selectedPlanche.m2} ctx={ctx} onClose={() => setModal(null)} />}
      </Modal>

      <div className="overflow-x-auto">
        <table className="min-w-[2800px] w-full text-[0.68rem] border-collapse">
          <thead>
            <tr className="bg-brun-dark text-cream">
              <th colSpan={3} className="thv border-r border-white/20">PLANCHE</th>
              <th colSpan={7} className="thv border-r border-white/20 bg-blue-900/40">GESTION DE LA PRODUCTION ET DU RENDEMENT</th>
              <th colSpan={4} className="thv border-r border-white/20 bg-amber-900/40">REVENU</th>
              <th colSpan={7} className="thv border-r border-white/20 bg-green-900/40">PRINCIPES DE CULTURE</th>
              <th colSpan={8} className="thv border-r border-white/20 bg-teal-900/40">CALENDRIER</th>
              <th className="thv bg-red-900/30">⚡</th>
            </tr>
            <tr className="bg-brun text-cream/90">
              <th className="thv">Planche</th>
              <th className="thv">Culture</th>
              <th className="thv border-r border-white/20">m²</th>

              <th className="thv">Plants</th>
              <th className="thv">Tiges brutes</th>
              <th className="thv">-30% perte</th>
              <th className="thv">Tiges nettes</th>
              <th className="thv">Tiges/sem.</th>
              <th className="thv">Graines nec.</th>
              <th className="thv border-r border-white/20">Prix/tige</th>

              <th className="thv">Revenu pot.</th>
              <th className="thv">CA/sem.</th>
              <th className="thv">Rendement</th>
              <th className="thv border-r border-white/20">Type</th>

              <th className="thv">J. cellule</th>
              <th className="thv">J. champ</th>
              <th className="thv">J. recolte</th>
              <th className="thv">Espac. cm</th>
              <th className="thv">Rangs</th>
              <th className="thv">Gr./plant</th>
              <th className="thv border-r border-white/20">Options</th>

              <th className="thv">Semis</th>
              <th className="thv">Plantation</th>
              <th className="thv">Récolte</th>
              <th className="thv">Fin</th>
              <th className="thv">W. entrée cell.</th>
              <th className="thv">W. sortie cell.</th>
              <th className="thv">W. récolte</th>
              <th className="thv border-r border-white/20">W. fin réc.</th>

              <th className="thv">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gardenGroupsVisible.map(gg => {
              const gardenPlantingsCount = gg.planches.reduce((s, pl) => s + pl.plantings.length, 0)
              const gardenRevenu = gg.planches.reduce((s, pl) =>
                s + pl.plantings.reduce((s2, p) => s2 + (p.revenu_estime || 0), 0), 0)

              return (
                <Fragment key={gg.garden.id}>
                  <tr className="bg-sage/15">
                    <td colSpan={30} className="px-3 py-2 font-serif font-bold text-sm text-brun border-b-2 border-sage/30">
                      {gg.garden.name}
                      <span className="font-sans font-normal text-terre text-[0.65rem] ml-3">
                        {gg.garden.surface_m2} m² — {gardenPlantingsCount} cultures — {gg.planches.length} planches — Revenu estimé : {Math.round(gardenRevenu)}€
                      </span>
                    </td>
                  </tr>

                  {gg.planches.map(plGroup => (
                    <Fragment key={plGroup.plancheId}>
                      {plGroup.plantings.map((p, idx) => {
                        const c = calc(p)
                        const isFirst = idx === 0
                        const isLast = idx === plGroup.plantings.length - 1
                        return (
                          <tr key={p.id} className={`border-b border-cream-dark hover:bg-sage-pale/30 cursor-pointer transition-colors ${isFirst ? 'border-t border-sage/20' : ''}`}
                            onClick={() => openEdit(p)}>
                            <td className="tdv font-semibold text-brun">{plGroup.plancheName}</td>
                            <td className="tdv font-medium text-feuille underline decoration-dotted underline-offset-2">{p.culture_name}</td>
                            <td className="tdv text-right border-r border-cream-dark font-semibold bg-yellow-50/50">{c.surface}</td>

                            <td className="tdv text-right">{c.plants}</td>
                            <td className="tdv text-right text-terre">{c.tiges_brutes}</td>
                            <td className="tdv text-right text-red-500">-30%</td>
                            <td className="tdv text-right font-semibold">{c.tiges_nettes}</td>
                            <td className="tdv text-right">{c.tiges_par_semaine}</td>
                            <td className="tdv text-right">{c.graines}</td>
                            <td className="tdv text-right border-r border-cream-dark">{c.prix.toFixed(2)}€</td>

                            <td className="tdv text-right font-semibold text-sage">{Math.round(c.revenu)}€</td>
                            <td className="tdv text-right">{c.ca_semaine}€</td>
                            <td className="tdv text-right">{p.rendement || '—'}</td>
                            <td className="tdv text-center border-r border-cream-dark">
                              <span className={`badge text-[0.55rem] ${
                                p.culture_type === 'RR' ? 'badge-recolte' :
                                p.culture_type === 'MP' ? 'badge-mp' : 'badge-ru'
                              }`}>{p.culture_type}</span>
                            </td>

                            <td className="tdv text-center">{c.jc || '—'}</td>
                            <td className="tdv text-center">{c.jch}</td>
                            <td className="tdv text-center">{c.jr}</td>
                            <td className="tdv text-center">{c.espacement_cm}</td>
                            <td className="tdv text-center">{c.rangs}</td>
                            <td className="tdv text-center">{c.graines_par_plant}</td>
                            <td className="tdv text-center border-r border-cream-dark">
                              <div className="flex justify-center gap-0.5 flex-wrap">
                                {c.pincer && <span className="text-[0.5rem] text-or-dark" title="Pincer">P</span>}
                                {c.filet && <span className="text-[0.5rem] text-lavande" title="Filet">F</span>}
                                {c.couvre_sol && <span className="text-[0.5rem] text-sage" title="Couvre-sol">CS</span>}
                                {c.semis_direct && <span className="text-[0.5rem] text-rose-deep" title="Semis direct">SD</span>}
                              </div>
                            </td>

                            <td className="tdv text-center bg-blush/10">{c.date_semis}</td>
                            <td className="tdv text-center">{c.date_plantation}</td>
                            <td className="tdv text-center bg-sage/10">{c.date_recolte}</td>
                            <td className="tdv text-center">{c.date_fin}</td>
                            <td className="tdv text-center font-mono text-terre">{c.week_semis}</td>
                            <td className="tdv text-center font-mono text-terre">{c.week_plantation}</td>
                            <td className="tdv text-center font-mono text-terre">{c.week_recolte ?? '—'}</td>
                            <td className="tdv text-center font-mono text-terre border-r border-cream-dark">{c.week_fin ?? '—'}</td>

                            <td className="tdv text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1 justify-center">
                                <button
                                  className="text-sage hover:text-feuille text-sm"
                                  title="Modifier"
                                  onClick={() => openEdit(p)}
                                >✏️</button>
                                <button
                                  className="text-red-400 hover:text-red-600 text-sm"
                                  title="Supprimer"
                                  onClick={async () => {
                                    if (confirm(`Supprimer ${p.culture_name} ?`)) {
                                      await ctx.deletePlanting(p.id)
                                    }
                                  }}
                                >🗑</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {/* Sous-total planche */}
                      {plGroup.plantings.length > 1 && (() => {
                        const stPlants = plGroup.plantings.reduce((s, p) => s + (p.plants_count || 0), 0)
                        const stTiges = plGroup.plantings.reduce((s, p) => s + (p.tiges_estimees || 0), 0)
                        const stGraines = plGroup.plantings.reduce((s, p) => s + (p.graines_necessaires || 0), 0)
                        const stRevenu = plGroup.plantings.reduce((s, p) => s + (p.revenu_estime || 0), 0)
                        const stSurface = plGroup.plantings.reduce((s, p) => s + (p.surface_m2 || 0), 0)
                        return (
                          <tr className="bg-cream/60 border-b border-sage/20">
                            <td className="tdv text-right text-[0.6rem] font-bold text-terre" colSpan={2}>↳ {plGroup.plancheName}</td>
                            <td className="tdv text-right border-r border-cream-dark text-[0.6rem] font-bold text-terre">{stSurface}</td>
                            <td className="tdv text-right text-[0.6rem] font-bold">{stPlants}</td>
                            <td className="tdv" />
                            <td className="tdv" />
                            <td className="tdv text-right text-[0.6rem] font-bold">{stTiges}</td>
                            <td className="tdv" />
                            <td className="tdv text-right text-[0.6rem] font-bold">{stGraines}</td>
                            <td className="tdv border-r border-cream-dark" />
                            <td className="tdv text-right text-[0.6rem] font-bold text-sage">{Math.round(stRevenu)}€</td>
                            <td colSpan={19} className="tdv" />
                          </tr>
                        )
                      })()}
                      {/* Bouton ajouter une culture à cette planche */}
                      <tr className="border-b border-cream-dark/50">
                        <td colSpan={30} className="px-3 py-1">
                          <button
                            className="text-[0.65rem] text-sage hover:text-feuille font-medium hover:underline"
                            onClick={() => openAdd(plGroup.plancheId, plGroup.plancheM2)}
                          >
                            + Ajouter une culture sur {plGroup.plancheName}
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </Fragment>
              )
            })}

            {totalPlantings === 0 && (
              <tr>
                <td colSpan={30} className="text-center text-terre py-10">
                  Aucune culture enregistrée. Ajoutez des cultures dans Jardins & Planches pour voir le tableau de vérification.
                </td>
              </tr>
            )}
          </tbody>

          {totalPlantings > 0 && (
            <tfoot>
              <tr className="bg-brun-dark/5 font-semibold border-t-2 border-brun/30">
                <td colSpan={3} className="tdv text-right text-brun">TOTAUX</td>
                <td className="tdv text-right">{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.plants_count || 0), 0), 0), 0)}</td>
                <td className="tdv" />
                <td className="tdv" />
                <td className="tdv text-right font-bold">{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.tiges_estimees || 0), 0), 0), 0)}</td>
                <td className="tdv" />
                <td className="tdv text-right">{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.graines_necessaires || 0), 0), 0), 0)}</td>
                <td className="tdv border-r border-cream-dark" />
                <td className="tdv text-right font-bold text-sage text-sm">
                  {Math.round(gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.revenu_estime || 0), 0), 0), 0))}€
                </td>
                <td colSpan={19} className="tdv" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
