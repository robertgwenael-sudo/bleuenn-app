'use client'
import { Fragment } from 'react'
import { getWeekNumber, formatDateShort } from '@/lib/types'
import type { PlantingFull, Garden } from '@/lib/types'

export default function Verification({ ctx }: { ctx: any }) {
  const gardens: Garden[] = ctx.gardens || []
  const plantings: PlantingFull[] = ctx.plantings || []

  // Regrouper par jardin puis par planche
  type PlancheGroup = { plancheId: string; plancheName: string; plancheM2: number; plantings: PlantingFull[] }
  type GardenGroup = { garden: Garden; planches: PlancheGroup[] }

  const gardenGroups: GardenGroup[] = gardens.map(g => {
    const planches = (g.planches || []).map((pl: any) => {
      const plPlantings = plantings
        .filter(p => p.planche_id === pl.id)
        .sort((a, b) => a.culture_name.localeCompare(b.culture_name))
      return { plancheId: pl.id, plancheName: pl.name, plancheM2: pl.surface_m2, plantings: plPlantings }
    }).filter((pl: PlancheGroup) => pl.plantings.length > 0)
    return { garden: g, planches }
  }).filter(gg => gg.planches.length > 0)

  const totalPlantings = gardenGroups.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.length, 0), 0)

  // Calculs dérivés — tout vient de PlantingFull (= vue SQL = catalogue)
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

    // Plants estimés (même formule que le trigger SQL)
    let plants = Math.max(1, Math.floor(surface * 10000 / (espacement_cm * espacement_cm)))
    if (plants > surface * 50) plants = Math.floor(surface * 25)

    const tiges_brutes = Math.round(plants * rendement)
    const tiges_nettes = Math.round(tiges_brutes * 0.7) // -30%
    const revenu = Math.round(tiges_nettes * prix * 100) / 100
    const graines = Math.ceil(plants * 1.3 * graines_par_plant)

    // Semaines de récolte
    const semaines_recolte = Math.max(1, Math.round(jr / 7))
    const tiges_par_semaine = Math.round(tiges_nettes / semaines_recolte)
    const ca_semaine = Math.round(tiges_par_semaine * prix * 100) / 100

    // Dates
    const ds = new Date(p.date_semis + 'T00:00:00')
    const dp = new Date(p.date_plantation + 'T00:00:00')
    const dr = p.date_recolte ? new Date(p.date_recolte + 'T00:00:00') : null
    const df = p.date_fin ? new Date(p.date_fin + 'T00:00:00') : null

    return {
      surface,
      espacement_cm,
      rangs,
      graines_par_plant,
      plants: p.plants_count || plants,
      graines: p.graines_necessaires || graines,
      tiges_brutes,
      tiges_nettes: p.tiges_estimees || tiges_nettes,
      tiges_par_semaine,
      rendement,
      prix,
      revenu: p.revenu_estime || revenu,
      ca_semaine,
      jc,
      jch,
      jr,
      pincer: p.pincer,
      filet: p.filet,
      couvre_sol: p.couvre_sol,
      semis_direct: p.semis_direct,
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

      <div className="overflow-x-auto">
        <table className="min-w-[2600px] w-full text-[0.68rem] border-collapse">
          <thead>
            {/* Groupe d'en-têtes */}
            <tr className="bg-brun-dark text-cream">
              <th colSpan={3} className="thv border-r border-white/20">PLANCHE</th>
              <th colSpan={7} className="thv border-r border-white/20 bg-blue-900/40">GESTION DE LA PRODUCTION ET DU RENDEMENT</th>
              <th colSpan={4} className="thv border-r border-white/20 bg-amber-900/40">REVENU</th>
              <th colSpan={7} className="thv border-r border-white/20 bg-green-900/40">PRINCIPES DE CULTURE</th>
              <th colSpan={6} className="thv bg-teal-900/40">CALENDRIER</th>
            </tr>
            {/* Sous-en-têtes */}
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
              <th className="thv">Recolte</th>
              <th className="thv">Fin</th>
              <th className="thv">S. semis</th>
              <th className="thv">S. fin</th>
            </tr>
          </thead>
          <tbody>
            {gardenGroups.map(gg => {
              const gardenPlantingsCount = gg.planches.reduce((s, pl) => s + pl.plantings.length, 0)
              const gardenRevenu = gg.planches.reduce((s, pl) =>
                s + pl.plantings.reduce((s2, p) => s2 + (p.revenu_estime || 0), 0), 0)

              return (
                <Fragment key={gg.garden.id}>
                  {/* En-tête du jardin */}
                  <tr className="bg-sage/15">
                    <td colSpan={27} className="px-3 py-2 font-serif font-bold text-sm text-brun border-b-2 border-sage/30">
                      {gg.garden.name}
                      <span className="font-sans font-normal text-terre text-[0.65rem] ml-3">
                        {gg.garden.surface_m2} m² — {gardenPlantingsCount} cultures — {gg.planches.length} planches — Revenu estimé : {Math.round(gardenRevenu)}€
                      </span>
                    </td>
                  </tr>

                  {gg.planches.map(plGroup =>
                    plGroup.plantings.map((p, idx) => {
                      const c = calc(p)
                      const isFirst = idx === 0
                      return (
                        <tr key={p.id} className={`border-b border-cream-dark hover:bg-cream/50 ${isFirst ? 'border-t border-sage/20' : ''}`}>
                          {/* PLANCHE */}
                          <td className="tdv font-semibold text-brun">{plGroup.plancheName}</td>
                          <td className="tdv font-medium">{p.culture_name}</td>
                          <td className="tdv text-right border-r border-cream-dark font-semibold bg-yellow-50/50">{c.surface}</td>

                          {/* PRODUCTION */}
                          <td className="tdv text-right">{c.plants}</td>
                          <td className="tdv text-right text-terre">{c.tiges_brutes}</td>
                          <td className="tdv text-right text-red-500">-30%</td>
                          <td className="tdv text-right font-semibold">{c.tiges_nettes}</td>
                          <td className="tdv text-right">{c.tiges_par_semaine}</td>
                          <td className="tdv text-right">{c.graines}</td>
                          <td className="tdv text-right border-r border-cream-dark">{c.prix.toFixed(2)}€</td>

                          {/* REVENU */}
                          <td className="tdv text-right font-semibold text-sage">{Math.round(c.revenu)}€</td>
                          <td className="tdv text-right">{c.ca_semaine}€</td>
                          <td className="tdv text-right">{p.rendement || '—'}</td>
                          <td className="tdv text-center border-r border-cream-dark">
                            <span className={`badge text-[0.55rem] ${
                              p.culture_type === 'RR' ? 'badge-recolte' :
                              p.culture_type === 'MP' ? 'badge-mp' : 'badge-ru'
                            }`}>{p.culture_type}</span>
                          </td>

                          {/* PRINCIPES CULTURE */}
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

                          {/* CALENDRIER */}
                          <td className="tdv text-center bg-blush/10">{c.date_semis}</td>
                          <td className="tdv text-center">{c.date_plantation}</td>
                          <td className="tdv text-center bg-sage/10">{c.date_recolte}</td>
                          <td className="tdv text-center">{c.date_fin}</td>
                          <td className="tdv text-center font-mono text-terre">{c.week_semis}</td>
                          <td className="tdv text-center font-mono text-terre">{c.week_fin ?? '—'}</td>
                        </tr>
                      )
                    })
                  )}
                </Fragment>
              )
            })}

            {totalPlantings === 0 && (
              <tr>
                <td colSpan={27} className="text-center text-terre py-10">
                  Aucune culture enregistrée. Ajoutez des cultures dans Jardins & Planches pour voir le tableau de vérification.
                </td>
              </tr>
            )}
          </tbody>

          {/* TOTAUX */}
          {totalPlantings > 0 && (
            <tfoot>
              <tr className="bg-brun-dark/5 font-semibold border-t-2 border-brun/30">
                <td colSpan={3} className="tdv text-right text-brun">TOTAUX</td>
                <td className="tdv text-right">{gardenGroups.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.plants_count || 0), 0), 0), 0)}</td>
                <td className="tdv" />
                <td className="tdv" />
                <td className="tdv text-right font-bold">{gardenGroups.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.tiges_estimees || 0), 0), 0), 0)}</td>
                <td className="tdv" />
                <td className="tdv text-right">{gardenGroups.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.graines_necessaires || 0), 0), 0), 0)}</td>
                <td className="tdv border-r border-cream-dark" />
                <td className="tdv text-right font-bold text-sage text-sm">
                  {Math.round(gardenGroups.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.revenu_estime || 0), 0), 0), 0))}€
                </td>
                <td colSpan={16} className="tdv" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
