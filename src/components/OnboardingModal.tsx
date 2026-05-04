'use client'
import { useState } from 'react'

export default function OnboardingModal({ ctx, onClose }: { ctx: any; onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [farmName, setFarmName] = useState('Bleuenn')
  const [ownerName, setOwnerName] = useState('')
  const [seasonName, setSeasonName] = useState('Saison 1 — 2025')
  const [year, setYear] = useState(2025)
  const [goal, setGoal] = useState(15000)
  const [loading, setLoading] = useState(false)

  const handleFinish = async () => {
    setLoading(true)
    await ctx.updateProfile({ farm_name: farmName, owner_name: ownerName })
    await ctx.createSeason(seasonName, year, goal)
    setLoading(false)
    onClose()
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-lg w-full p-10">
        <h2 className="font-serif text-2xl mb-1">Configuration initiale</h2>
        <p className="text-terre text-sm mb-8">Étape {step} sur 2</p>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brun mb-1.5">Nom de votre ferme</label>
              <input className="input" value={farmName} onChange={e => setFarmName(e.target.value)} placeholder="Bleuenn" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brun mb-1.5">Votre nom</label>
              <input className="input" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Marine Gueguen" />
            </div>
            <button className="btn btn-sage w-full mt-4" onClick={() => setStep(2)}>Suivant</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brun mb-1.5">Nom de la saison</label>
              <input className="input" value={seasonName} onChange={e => setSeasonName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-brun mb-1.5">Année</label>
                <input className="input" type="number" value={year} onChange={e => setYear(+e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-brun mb-1.5">Objectif CA (€)</label>
                <input className="input" type="number" value={goal} onChange={e => setGoal(+e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-terre">
              Vous pourrez ensuite composer vos jardins, ajouter des planches, et y affecter des cultures.
              Le calendrier se calculera automatiquement à partir de la date de semis.
            </p>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-outline flex-1" onClick={() => setStep(1)}>Retour</button>
              <button className="btn btn-sage flex-1" onClick={handleFinish} disabled={loading}>
                {loading ? '…' : 'Commencer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
