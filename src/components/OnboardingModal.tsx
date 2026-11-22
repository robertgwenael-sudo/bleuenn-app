'use client'
import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, Field, Input, cn } from '@/components/ui'
import { AuthLayout } from '@/components/AuthLayout'
import { photos } from '@/lib/images'

export default function OnboardingModal({ ctx, onClose }: { ctx: any; onClose: () => void }) {
  const [step, setStep] = useState(1)
  const [farmName, setFarmName] = useState('Bleuenn')
  const [ownerName, setOwnerName] = useState('')
  const anneeCourante = Number((ctx.today || new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())).slice(0, 4))
  const [seasonName, setSeasonName] = useState(`Saison ${anneeCourante}`)
  const [year, setYear] = useState(anneeCourante)
  const [goal, setGoal] = useState(15000)
  const [loading, setLoading] = useState(false)

  const handleFinish = async () => {
    setLoading(true)
    await ctx.updateProfile({ farm_name: farmName, owner_name: ownerName })
    // La première saison crée la ferme (trigger season_set_farm), nommée comme le profil
    await ctx.createSeason(seasonName, year, goal)
    setLoading(false)
    onClose()
  }

  return (
    <AuthLayout image={photos.semisGodets} alt="Jeunes plants en godets vus de dessus"
      quote={<>Chaque saison commence<br />par un premier semis.</>}>
      <p className="mb-2 text-xs font-medium text-fg-subtle">Étape {step} sur 2</p>
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {[1, 2].map(i => <span key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-surface-3')} />)}
      </div>
      <h1 className="text-[2rem] leading-tight">{step === 1 ? 'Votre ferme' : 'Votre première saison'}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {step === 1
          ? 'Votre ferme est permanente : ses jardins, ses planches et son équipe restent d’une saison à l’autre.'
          : 'La saison sert au suivi (objectif de chiffre d’affaires, bilan). Composez ensuite vos jardins et planches : le calendrier se calculera à partir des dates de semis.'}
      </p>

      {step === 1 && (
        <form className="mt-7 space-y-5" onSubmit={e => { e.preventDefault(); setStep(2) }}>
          <Field label="Nom de votre ferme"><Input className="h-11" value={farmName} onChange={e => setFarmName(e.target.value)} placeholder="Bleuenn" /></Field>
          <Field label="Votre nom"><Input className="h-11" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Marine Gueguen" autoComplete="name" /></Field>
          <Button type="submit" size="lg" className="w-full">Suivant<ArrowRight className="h-4 w-4" /></Button>
        </form>
      )}

      {step === 2 && (
        <form className="mt-7 space-y-5" onSubmit={e => { e.preventDefault(); handleFinish() }}>
          <Field label="Nom de la saison"><Input className="h-11" value={seasonName} onChange={e => setSeasonName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Année"><Input className="h-11" type="number" inputMode="numeric" value={year} onChange={e => setYear(+e.target.value)} /></Field>
            <Field label="Objectif CA (€)"><Input className="h-11" type="number" inputMode="numeric" value={goal} onChange={e => setGoal(+e.target.value)} /></Field>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" size="lg" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" />Retour</Button>
            <Button type="submit" size="lg" className="flex-1" loading={loading}>Commencer</Button>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
