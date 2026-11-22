'use client'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { getWeekNumber, formatDateShort } from '@/lib/types'
import type { PlantingFull, Garden } from '@/lib/types'
import { Button, Card, Dialog, EmptyState, PageHeader, TypeBadge, cn, useConfirm } from '@/components/ui'
import { AddPlantingForm, EditPlantingForm } from '@/components/plantings/PlantingForms'
import { photos } from '@/lib/images'

// Classes de cellules (tableau dense de type tableur)
const GH = 'border-b border-r border-border px-2 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wider'
const TH = 'border-b border-border bg-surface-2 px-2 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-fg-muted'
const TD = 'border-b border-border/60 px-2 py-1.5 group-hover:bg-surface-2'
const ST = 'border-b border-border bg-surface-2 px-2 py-1.5'
const FT = 'border-t-2 border-border-strong bg-surface-3 px-2 py-2.5'
const SEP = 'border-r border-border'

// ─── Composant principal ────────────────────────────
export default function Verification({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
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

  const removePlanting = async (p: PlantingFull) => {
    const ok = await confirm({
      title: `Supprimer ${p.culture_name} ?`,
      description: `La culture sera retirée de ${p.planche_name} (${p.garden_name}).`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (ok) {
      await ctx.deletePlanting(p.id)
      toast.success(`${p.culture_name} supprimé`)
    }
  }

  return (
    <div>
      <PageHeader title="Tableau de vérification"
        description={`Vue complète de la production — ${totalPlantings} cultures réparties sur ${gardens.length} jardins`}
        image={photos.champCoucherSoleil} />

      {/* Modale édition */}
      <Dialog open={modal === 'edit' && !!selectedPlanting} onOpenChange={o => !o && setModal(null)} size="lg"
        title={selectedPlanting ? `Modifier — ${selectedPlanting.culture_name}` : 'Modifier'}>
        {selectedPlanting && <EditPlantingForm key={selectedPlanting.id} planting={selectedPlanting} ctx={ctx} onClose={() => setModal(null)} />}
      </Dialog>

      {/* Modale ajout */}
      <Dialog open={modal === 'add' && !!selectedPlanche} onOpenChange={o => !o && setModal(null)} size="lg" title="Ajouter une culture"
        description={selectedPlanche ? `${selectedPlanche.m2} m² sur cette planche` : undefined}>
        {selectedPlanche && <AddPlantingForm key={selectedPlanche.id} plancheId={selectedPlanche.id} ctx={ctx} onClose={() => setModal(null)} />}
      </Dialog>

      {totalPlantings === 0 && gardenGroupsVisible.length === 0 ? (
        <Card>
          <EmptyState image={photos.champCoucherSoleil} title="Aucune culture enregistrée"
            description="Ajoutez des cultures dans Jardins & planches pour voir le tableau de vérification." />
        </Card>
      ) : (
        <div className="relative max-h-[calc(100dvh-12rem)] overflow-auto rounded-card border border-border bg-surface shadow-card" role="region" aria-label="Tableau de vérification" tabIndex={0}>
          <table className="grid-table min-w-[2600px] w-full text-[0.72rem]">
            <thead className="sticky top-0 z-[3]">
              <tr className="text-fg">
                <th colSpan={3} className={cn(GH, 'sticky left-0 z-[4] bg-surface-3')}>Planche</th>
                <th colSpan={7} className={cn(GH, 'bg-info-soft')}>Gestion de la production et du rendement</th>
                <th colSpan={4} className={cn(GH, 'bg-warning-soft')}>Revenu</th>
                <th colSpan={7} className={cn(GH, 'bg-primary-soft')}>Principes de culture</th>
                <th colSpan={8} className={cn(GH, 'bg-violet-soft')}>Calendrier</th>
                <th className={cn(GH, 'bg-surface-3')}><span className="sr-only">Actions</span></th>
              </tr>
              <tr>
                <th className={cn(TH, 'sticky left-0 z-[4] w-16 min-w-16')}>Planche</th>
                <th className={cn(TH, 'sticky left-16 z-[4] min-w-[170px] !text-left')}>Culture</th>
                <th className={cn(TH, SEP)}>m²</th>

                <th className={TH}>Plants</th>
                <th className={TH}>Tiges brutes</th>
                <th className={TH}>−30 % perte</th>
                <th className={TH}>Tiges nettes</th>
                <th className={TH}>Tiges/sem.</th>
                <th className={TH}>Graines néc.</th>
                <th className={cn(TH, SEP)}>Prix/tige</th>

                <th className={TH}>Revenu pot.</th>
                <th className={TH}>CA/sem.</th>
                <th className={TH}>Rendement</th>
                <th className={cn(TH, SEP)}>Type</th>

                <th className={TH}>J. cellule</th>
                <th className={TH}>J. champ</th>
                <th className={TH}>J. récolte</th>
                <th className={TH}>Espac. cm</th>
                <th className={TH}>Rangs</th>
                <th className={TH}>Gr./plant</th>
                <th className={cn(TH, SEP)}>Options</th>

                <th className={TH}>Semis</th>
                <th className={TH}>Plantation</th>
                <th className={TH}>Récolte</th>
                <th className={TH}>Fin</th>
                <th className={TH}>S. entrée cell.</th>
                <th className={TH}>S. sortie cell.</th>
                <th className={TH}>S. récolte</th>
                <th className={cn(TH, SEP)}>S. fin réc.</th>

                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {gardenGroupsVisible.map(gg => {
                const gardenPlantingsCount = gg.planches.reduce((s, pl) => s + pl.plantings.length, 0)
                const gardenRevenu = gg.planches.reduce((s, pl) =>
                  s + pl.plantings.reduce((s2, p) => s2 + (p.revenu_estime || 0), 0), 0)

                return (
                  <Fragment key={gg.garden.id}>
                    <tr>
                      <td colSpan={3} className="sticky left-0 z-[1] border-y border-border bg-primary-soft px-3 py-2">
                        <span className="font-serif text-sm font-semibold text-fg">{gg.garden.name}</span>
                      </td>
                      <td colSpan={27} className="border-y border-border bg-primary-soft px-3 py-2 text-xs text-fg-muted">
                        {gg.garden.surface_m2} m² — {gardenPlantingsCount} cultures — {gg.planches.length} planches — Revenu estimé : <strong className="num text-fg">{Math.round(gardenRevenu)} €</strong>
                      </td>
                    </tr>

                    {gg.planches.map(plGroup => (
                      <Fragment key={plGroup.plancheId}>
                        {plGroup.plantings.map(p => {
                          const c = calc(p)
                          return (
                            <tr key={p.id} className="group cursor-pointer" onClick={() => openEdit(p)}>
                              <td className={cn(TD, 'sticky left-0 z-[1] bg-surface font-semibold text-fg')}>{plGroup.plancheName}</td>
                              <td className={cn(TD, 'sticky left-16 z-[1] bg-surface !text-left font-medium text-fg')}>
                                <span className="underline decoration-border-strong decoration-dotted underline-offset-4 group-hover:decoration-primary">{p.culture_name}</span>
                              </td>
                              <td className={cn(TD, SEP, 'num text-right font-semibold')}>{c.surface}</td>

                              <td className={cn(TD, 'num text-right')}>{c.plants}</td>
                              <td className={cn(TD, 'num text-right text-fg-muted')}>{c.tiges_brutes}</td>
                              <td className={cn(TD, 'num text-right text-danger')}>−30 %</td>
                              <td className={cn(TD, 'num text-right font-semibold')}>{c.tiges_nettes}</td>
                              <td className={cn(TD, 'num text-right')}>{c.tiges_par_semaine}</td>
                              <td className={cn(TD, 'num text-right')}>{c.graines}</td>
                              <td className={cn(TD, SEP, 'num text-right')}>{c.prix.toFixed(2)} €</td>

                              <td className={cn(TD, 'num text-right font-semibold text-primary')}>{Math.round(c.revenu)} €</td>
                              <td className={cn(TD, 'num text-right')}>{c.ca_semaine} €</td>
                              <td className={cn(TD, 'num text-right')}>{p.rendement || '—'}</td>
                              <td className={cn(TD, SEP, 'text-center')}><TypeBadge type={p.culture_type} /></td>

                              <td className={cn(TD, 'num text-center')}>{c.jc || '—'}</td>
                              <td className={cn(TD, 'num text-center')}>{c.jch}</td>
                              <td className={cn(TD, 'num text-center')}>{c.jr}</td>
                              <td className={cn(TD, 'num text-center')}>{c.espacement_cm}</td>
                              <td className={cn(TD, 'num text-center')}>{c.rangs}</td>
                              <td className={cn(TD, 'num text-center')}>{c.graines_par_plant}</td>
                              <td className={cn(TD, SEP, 'text-center')}>
                                <div className="flex flex-wrap justify-center gap-1 text-[0.65rem] font-semibold">
                                  {c.pincer && <abbr className="text-warning no-underline" title="Pincer">P</abbr>}
                                  {c.filet && <abbr className="text-violet no-underline" title="Filet">F</abbr>}
                                  {c.couvre_sol && <abbr className="text-primary no-underline" title="Couvre-sol">CS</abbr>}
                                  {c.semis_direct && <abbr className="text-accent no-underline" title="Semis direct">SD</abbr>}
                                </div>
                              </td>

                              <td className={cn(TD, 'num text-center')}>{c.date_semis}</td>
                              <td className={cn(TD, 'num text-center')}>{c.date_plantation}</td>
                              <td className={cn(TD, 'num text-center font-medium')}>{c.date_recolte}</td>
                              <td className={cn(TD, 'num text-center')}>{c.date_fin}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{c.week_semis}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{c.week_plantation}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{c.week_recolte ?? '—'}</td>
                              <td className={cn(TD, SEP, 'num text-center text-fg-muted')}>{c.week_fin ?? '—'}</td>

                              <td className={cn(TD, 'text-center')} onClick={e => e.stopPropagation()}>
                                <div className="flex justify-center gap-0.5">
                                  <Button variant="ghost" size="icon-sm" className="!h-7 !w-7" onClick={() => openEdit(p)} aria-label={`Modifier ${p.culture_name}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon-sm" className="!h-7 !w-7 hover:!text-danger" onClick={() => removePlanting(p)} aria-label={`Supprimer ${p.culture_name}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
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
                            <tr className="text-[0.68rem] font-semibold text-fg-muted">
                              <td colSpan={2} className={cn(ST, 'sticky left-0 z-[1] text-right')}>Sous-total {plGroup.plancheName}</td>
                              <td className={cn(ST, SEP, 'num text-right')}>{stSurface}/{plGroup.plancheM2} m²</td>
                              <td className={cn(ST, 'num text-right text-fg')}>{stPlants}</td>
                              <td className={ST} />
                              <td className={ST} />
                              <td className={cn(ST, 'num text-right text-fg')}>{stTiges}</td>
                              <td className={ST} />
                              <td className={cn(ST, 'num text-right text-fg')}>{stGraines}</td>
                              <td className={cn(ST, SEP)} />
                              <td className={cn(ST, 'num text-right text-primary')}>{Math.round(stRevenu)} €</td>
                              <td colSpan={19} className={ST} />
                            </tr>
                          )
                        })()}
                        {/* Ajouter une culture à cette planche */}
                        <tr>
                          <td colSpan={3} className="sticky left-0 z-[1] border-b border-border bg-surface px-2 py-1">
                            <Button variant="ghost" size="sm" className="!text-primary" onClick={() => openAdd(plGroup.plancheId, plGroup.plancheM2)}>
                              <Plus className="h-3.5 w-3.5" />Ajouter une culture sur {plGroup.plancheName}
                            </Button>
                          </td>
                          <td colSpan={27} className="border-b border-border" />
                        </tr>
                      </Fragment>
                    ))}
                  </Fragment>
                )
              })}

              {totalPlantings === 0 && (
                <tr>
                  <td colSpan={30} className="py-10 text-center text-fg-muted">
                    Aucune culture enregistrée. Ajoutez des cultures dans Jardins & planches pour voir le tableau de vérification.
                  </td>
                </tr>
              )}
            </tbody>

            {totalPlantings > 0 && (
              <tfoot className="sticky bottom-0 z-[3]">
                <tr className="font-semibold">
                  <td colSpan={3} className={cn(FT, 'sticky left-0 z-[4] text-right uppercase tracking-wider')}>Totaux</td>
                  <td className={cn(FT, 'num text-right')}>{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.plants_count || 0), 0), 0), 0)}</td>
                  <td className={FT} />
                  <td className={FT} />
                  <td className={cn(FT, 'num text-right')}>{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.tiges_estimees || 0), 0), 0), 0)}</td>
                  <td className={FT} />
                  <td className={cn(FT, 'num text-right')}>{gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.graines_necessaires || 0), 0), 0), 0)}</td>
                  <td className={cn(FT, SEP)} />
                  <td className={cn(FT, 'num text-right text-sm text-primary')}>
                    {Math.round(gardenGroupsVisible.reduce((s, gg) => s + gg.planches.reduce((s2, pl) => s2 + pl.plantings.reduce((s3, p) => s3 + (p.revenu_estime || 0), 0), 0), 0))} €
                  </td>
                  <td colSpan={19} className={FT} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
