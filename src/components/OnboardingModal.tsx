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
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)' }}
    >
      <div className="bg-white/90 backdrop-blur-sm rounded-card max-w-lg w-full p-10 shadow-card-lg border border-white/60">
        <div className="text-center mb-2">
          <span className="text-3xl">&#x273F;</span>
        </div>
        <h2 className="font-serif text-2xl text-center mb-1">Configuration initiale</h2>
        <div className="floral-divider mb-6 max-w-[160px] mx-auto">
          <span className="text-[0.55rem]">etape {step} sur 2</span>
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Nom de votre ferme</label>
              <input className="input" value={farmName} onChange={e => setFarmName(e.target.value)} placeholder="Bleuenn" />
            </div>
            <div>
              <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Votre nom</label>
              <input className="input" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Marine Gueguen" />
            </div>
            <button className="btn btn-sage w-full mt-4" onClick={() => setStep(2)}>Suivant</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Nom de la saison</label>
              <input className="input" value={seasonName} onChange={e => setSeasonName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Annee</label>
                <input className="input" type="number" value={year} onChange={e => setYear(+e.target.value)} />
              </div>
              <div>
                <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Objectif CA</label>
                <input className="input" type="number" value={goal} onChange={e => setGoal(+e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-terre leading-relaxed">
              Composez vos jardins, ajoutez des planches et affectez des cultures.
              Le calendrier se calculera automatiquement a partir de la date de semis.
            </p>
            <div className="flex gap-3 mt-4">
              <button className="btn btn-outline flex-1" onClick={() => setStep(1)}>Retour</button>
              <button className="btn btn-sage flex-1" onClick={handleFinish} disabled={loading}>
                {loading ? '...' : 'Commencer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
