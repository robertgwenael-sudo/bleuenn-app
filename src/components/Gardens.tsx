'use client'
import { useState } from 'react'
import { getPlantingStatus } from '@/lib/types'
import type { PlantingFull, Garden, CultureCatalog } from '@/lib/types'
import Modal from '@/components/Modal'

// ─── Formulaire ajout jardin ──────────────────────
function AddGardenForm({ ctx, onClose }: { ctx: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [m2, setM2] = useState(100)
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name) return
    setLoading(true)
    await ctx.createGarden(name, m2, desc)
    setLoading(false)
    onClose()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Nouveau jardin</h3>
      <div>
        <label className="block text-xs font-semibold mb-1">Nom du jardin</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Jardin A" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">Surface (m²)</label>
        <input className="input" type="number" value={m2} onChange={e => setM2(+e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">Description</label>
        <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Cultures principales, notes…" />
      </div>
      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit} disabled={loading}>{loading ? '…' : 'Créer'}</button>
      </div>
    </div>
  )
}

// ─── Formulaire ajout planche ─────────────────────
function AddPlancheForm({ gardenId, ctx, onClose }: { gardenId: string; ctx: any; onClose: () => void }) {
  const [name, setName] = useState('')
  const [m2, setM2] = useState(10)

  const submit = async () => {
    if (!name) return
    await ctx.createPlanche(gardenId, name, m2)
    onClose()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Nouvelle planche</h3>
      <div>
        <label className="block text-xs font-semibold mb-1">Nom</label>
        <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="PL 1" />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1">Surface (m²)</label>
        <input className="input" type="number" value={m2} onChange={e => setM2(+e.target.value)} />
      </div>
      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit}>Créer</button>
      </div>
    </div>
  )
}

// ─── Formulaire ajout plantation ──────────────────
function AddPlantingForm({ plancheId, ctx, onClose }: { plancheId: string; ctx: any; onClose: () => void }) {
  const [cultureId, setCultureId] = useState('')
  const [dateSemis, setDateSemis] = useState('')
  const [surfaceM2, setSurfaceM2] = useState(1)
  const [loading, setLoading] = useState(false)

  const catalog: CultureCatalog[] = ctx.catalog || []
  const selected = catalog.find(c => c.id === cultureId)

  // Calcul de la surface disponible sur la planche
  const allPlantings: PlantingFull[] = ctx.plantings || []
  const planchePlantings = allPlantings.filter((p: PlantingFull) => p.planche_id === plancheId)
  const usedM2 = planchePlantings.reduce((sum: number, p: PlantingFull) => sum + (p.surface_m2 || 0), 0)

  // Trouver la planche dans les jardins
  let plancheM2 = 0
  for (const g of (ctx.gardens || [])) {
    for (const pl of (g.planches || [])) {
      if (pl.id === plancheId) { plancheM2 = pl.surface_m2; break }
    }
  }
  const availableM2 = Math.max(0, plancheM2 - usedM2)
  const isOverCapacity = surfaceM2 > availableM2

  const submit = async () => {
    if (!cultureId || !dateSemis || isOverCapacity) return
    setLoading(true)
    await ctx.createPlanting(plancheId, cultureId, dateSemis, surfaceM2)
    setLoading(false)
    onClose()
  }

  // Preview des dates calculées
  let previewPlantation = '', previewRecolte = '', previewFin = ''
  if (selected && dateSemis) {
    const ds = new Date(dateSemis + 'T00:00:00')
    const dp = new Date(ds); dp.setDate(dp.getDate() + (selected.jours_cellule || 0))
    const dr = new Date(dp); dr.setDate(dr.getDate() + selected.jours_champ)
    const df = new Date(dr); df.setDate(df.getDate() + selected.jours_recolte)
    previewPlantation = dp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewRecolte = dr.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    previewFin = df.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  }

  return (
    <div className="space-y-4">
      <h3 className="font-serif text-xl">Ajouter une culture</h3>

      {/* Jauge de la planche */}
      <div className="bg-cream rounded-lg p-3">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-semibold text-brun">Surface de la planche</span>
          <span className="text-terre">{usedM2} / {plancheM2} m² utilisés — <strong className={availableM2 > 0 ? 'text-sage' : 'text-red-600'}>{availableM2} m² disponibles</strong></span>
        </div>
        <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${Math.min(100, (usedM2 / plancheM2) * 100)}%`,
            backgroundColor: usedM2 / plancheM2 > 0.9 ? '#e57373' : '#7a8c6e'
          }} />
        </div>
        {planchePlantings.length > 0 && (
          <div className="mt-2 text-[0.65rem] text-terre">
            Cultures en place : {planchePlantings.map((p: PlantingFull) => `${p.culture_name} (${p.surface_m2} m²)`).join(', ')}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Culture</label>
        <select className="input" value={cultureId} onChange={e => setCultureId(e.target.value)}>
          <option value="">— Choisir une culture —</option>
          {catalog.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.type}) — {c.prix_tige}/tige</option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="bg-sage-pale rounded-lg p-3 text-xs space-y-1">
          <p><strong>Type :</strong> {selected.type === 'RR' ? 'Récolte Répétitive' : selected.type === 'MP' ? 'Moyen Producteur' : 'Récolte Unique'}</p>
          <p><strong>Cellule :</strong> {selected.jours_cellule}j — <strong>Champ :</strong> {selected.jours_champ}j — <strong>Récolte :</strong> {selected.jours_recolte}j</p>
          <p><strong>Rendement :</strong> {selected.rendement_plant} tiges/plant — <strong>Prix :</strong> {selected.prix_tige}</p>
          {selected.pincer && <span className="badge badge-mp mr-1">Pinçage</span>}
          {selected.filet && <span className="badge badge-ru mr-1">Filet</span>}
          {selected.couvre_sol && <span className="badge badge-plante">Couvre-sol</span>}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold mb-1">Surface allouée (m²)</label>
        <input
          className={`input ${isOverCapacity ? '!border-red-400 !bg-red-50' : ''}`}
          type="number"
          min={0.5}
          max={plancheM2}
          step={0.5}
          value={surfaceM2}
          onChange={e => setSurfaceM2(+e.target.value)}
        />
        {isOverCapacity && (
          <p className="text-[0.7rem] text-red-600 mt-1 font-semibold">
            Capacité dépassée ! Seulement {availableM2} m² disponibles sur cette planche.
          </p>
        )}
        {!isOverCapacity && surfaceM2 > 0 && (
          <p className="text-[0.7rem] text-terre mt-1">
            Il restera {(availableM2 - surfaceM2).toFixed(1)} m² disponibles après cette culture.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">Date de semis</label>
        <input className="input" type="date" value={dateSemis} onChange={e => setDateSemis(e.target.value)} />
        <p className="text-[0.7rem] text-terre mt-1">
          Le calendrier se calcule automatiquement à partir de cette date.
        </p>
      </div>

      {previewPlantation && (
        <div className="bg-cream-dark rounded-lg p-3 text-xs space-y-1">
          <p className="font-semibold text-brun">Dates calculées automatiquement :</p>
          <p>Plantation : <strong>{previewPlantation}</strong></p>
          <p>Début récolte : <strong>{previewRecolte}</strong></p>
          <p>Fin récolte : <strong>{previewFin}</strong></p>
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn btn-outline flex-1" onClick={onClose}>Annuler</button>
        <button className="btn btn-sage flex-1" onClick={submit} disabled={loading || !cultureId || !dateSemis || isOverCapacity || surfaceM2 <= 0}>
          {loading ? '…' : 'Planter'}
        </button>
      </div>
    </div>
  )
}

// ─── Formulaire modification plantation ──────────────
function EditPlantingForm({ planting, ctx, onClose }: { planting: PlantingFull; ctx: any; onClose: () => void }) {
  const [dateSemis, setDateSemis] = useState(planting.date_semis)
  const [surfaceM2, setSurfaceM2] = useState(planting.surface_m2)
  const [notes, setNotes] = useState(planting.notes || '')
  const [loading, setLoading] = useState(false)

  // Surface disponible (en excluant la culture en cours de modification)
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

  // Preview dates
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

// ─── Status badge ──────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    'À semer': 'badge-semer', 'En germination': 'badge-germination',
    'Planté': 'badge-plante', 'En récolte': 'badge-recolte', 'Terminé': 'badge-termine'
  }
  return <span className={`badge ${cls[status] || 'badge-termine'}`}>{status}</span>
}

// ─── Composant principal ──────────────────────────
export default function Gardens({ ctx }: { ctx: any }) {
  const [modal, setModal] = useState<string | null>(null)
  const [selectedGardenId, setSelectedGardenId] = useState('')
  const [selectedPlancheId, setSelectedPlancheId] = useState('')
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)

  const gardens: Garden[] = ctx.gardens || []
  const plantings: PlantingFull[] = ctx.plantings || []
  const totalM2 = gardens.reduce((s, g) => s + g.surface_m2, 0)

  const getPlanchePlantings = (plancheId: string) =>
    plantings.filter(p => p.planche_id === plancheId)

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h2 className="font-serif text-3xl mb-1">Jardins & Planches</h2>
          <p className="text-terre text-sm">{gardens.length} jardins — {totalM2} m² de surface totale</p>
        </div>
        <button className="btn btn-sage" onClick={() => setModal('garden')}>+ Nouveau jardin</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {gardens.map(g => {
          const planches = g.planches || []
          const usedM2 = planches.reduce((s: number, p: any) => s + p.surface_m2, 0)
          return (
            <div key={g.id} className="card border-t-4 border-sage !p-5">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-serif text-lg">🌱 {g.name}</h3>
                <button className="btn btn-danger btn-sm" onClick={() => {
                  if (confirm(`Supprimer ${g.name} et toutes ses planches ?`)) ctx.deleteGarden(g.id)
                }}>×</button>
              </div>
              <p className="text-xs text-terre mb-3">{g.surface_m2} m² — {g.description || ''}</p>

              {/* Barre surface */}
              <div className="mb-3">
                <div className="text-[0.7rem] text-sage mb-1">Surface utilisée : {usedM2} / {g.surface_m2} m²</div>
                <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
                  <div className="h-full bg-sage-light rounded-full" style={{ width: `${Math.min(100, usedM2 / g.surface_m2 * 100)}%` }} />
                </div>
              </div>

              {/* Planches */}
              <div className="space-y-1.5 mb-3">
                {planches.map((pl: any) => {
                  const plPlantings = getPlanchePlantings(pl.id)
                  const plUsedM2 = plPlantings.reduce((s: number, p: PlantingFull) => s + (p.surface_m2 || 0), 0)
                  const plPct = pl.surface_m2 > 0 ? (plUsedM2 / pl.surface_m2 * 100) : 0
                  return (
                    <div key={pl.id} className="p-2.5 rounded-lg bg-cream hover:bg-sage-pale transition text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <strong>{pl.name}</strong>
                          <span className="text-terre text-xs ml-1">({plUsedM2}/{pl.surface_m2} m²)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => { setSelectedPlancheId(pl.id); setModal('planting') }}
                          >+ Culture</button>
                          <button className="text-terre hover:text-red-600 text-xs ml-1" onClick={() => {
                            if (confirm('Supprimer cette planche ?')) ctx.deletePlanche(pl.id)
                          }}>×</button>
                        </div>
                      </div>
                      {/* Barre d'occupation de la planche */}
                      <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden mt-1.5 mb-1">
                        <div className="h-full rounded-full transition-all" style={{
                          width: `${Math.min(100, plPct)}%`,
                          backgroundColor: plPct > 90 ? '#e57373' : '#7a8c6e'
                        }} />
                      </div>
                      {plPlantings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {plPlantings.map((p: PlantingFull) => (
                            <button
                              key={p.id}
                              className="flex items-center gap-1 text-xs bg-white/60 hover:bg-white rounded px-1.5 py-0.5 cursor-pointer transition border border-transparent hover:border-sage/30"
                              onClick={() => { setSelectedPlanting(p); setModal('editPlanting') }}
                              title="Cliquer pour modifier ou supprimer"
                            >
                              <span className="font-medium">{p.culture_name}</span>
                              <span className="text-terre">({p.surface_m2} m²)</span>
                              <StatusBadge status={getPlantingStatus(p)} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                className="btn btn-outline btn-sm w-full"
                onClick={() => { setSelectedGardenId(g.id); setModal('planche') }}
              >+ Ajouter une planche</button>
            </div>
          )
        })}

        {gardens.length === 0 && (
          <div className="card col-span-full text-center py-12">
            <p className="text-terre mb-4">Aucun jardin pour cette saison.</p>
            <button className="btn btn-sage" onClick={() => setModal('garden')}>Créer mon premier jardin</button>
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={modal === 'garden'} onClose={() => setModal(null)}>
        <AddGardenForm ctx={ctx} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'planche'} onClose={() => setModal(null)}>
        <AddPlancheForm gardenId={selectedGardenId} ctx={ctx} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'planting'} onClose={() => setModal(null)}>
        <AddPlantingForm plancheId={selectedPlancheId} ctx={ctx} onClose={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'editPlanting'} onClose={() => setModal(null)}>
        {selectedPlanting && (
          <EditPlantingForm planting={selectedPlanting} ctx={ctx} onClose={() => setModal(null)} />
        )}
      </Modal>
    </div>
  )
}
