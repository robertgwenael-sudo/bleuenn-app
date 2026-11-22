'use client'
// ============================================================
// Tableau de vérification : toutes les plantations de la saison, façon
// tableur. Les estimations sont celles de « Quoi semer » (même fonction
// `ligneVerification` → `calculerProduction`, mêmes taux de la ferme) :
// une donnée manquante s'affiche « donnée manquante : … », jamais une
// valeur par défaut. Les dates sont celles de la base ; une vivace sans
// début de floraison garde sa ligne, « floraison à renseigner », hors totaux.
// ============================================================
import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { getWeekNumber, formatDateShort } from '@/lib/types'
import type { PlantingFull, Garden } from '@/lib/types'
import { ligneVerification, totaliser, type LigneVerification, type TotauxProduction } from '@/lib/domain/production'
import { eurosEnCentimes, formatEuros } from '@/lib/domain/montants'
import { useProduction } from '@/hooks/useProduction'
import { Button, Card, Dialog, EmptyState, PageHeader, TypeBadge, cn, useConfirm } from '@/components/ui'
import { AddPlantingForm, EditPlantingForm } from '@/components/plantings/PlantingForms'
import { CelluleCalcul, CelluleMontant, CelluleRepartition, eurosRonds, nb } from '@/components/semis/format'
import { photos } from '@/lib/images'

// Classes de cellules (tableau dense de type tableur)
const GH = 'border-b border-r border-border px-2 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wider'
const TH = 'border-b border-border bg-surface-2 px-2 py-2 text-center text-[0.62rem] font-semibold uppercase tracking-wide text-fg-muted'
const TD = 'border-b border-border/60 px-2 py-1.5 group-hover:bg-surface-2'
const ST = 'border-b border-border bg-surface-2 px-2 py-1.5'
const FT = 'border-t-2 border-border-strong bg-surface-3 px-2 py-2.5'
const SEP = 'border-r border-border'

type Ligne = LigneVerification & { p: PlantingFull }

/** Nombre saisi (catalogue ou plantation), ou « à renseigner » : jamais un défaut. */
function Saisie({ v }: { v: number | string | null | undefined }) {
  if (v === null || v === undefined || v === '') return <span className="text-2xs font-medium text-warning">à renseigner</span>
  return <>{nb(Number(v))}</>
}

/** Vivace (ou bisannuelle) sans début de floraison ; annuelle sans jours au champ. */
function RecolteInconnue({ p }: { p: PlantingFull }) {
  const vivace = p.cycle && p.cycle !== 'annuelle'
  return <span className="text-2xs font-medium text-warning">{vivace ? 'floraison à renseigner' : 'jours au champ à renseigner'}</span>
}

const semaine = (d: string | null | undefined) => (d ? getWeekNumber(new Date(d + 'T00:00:00')) : null)

/** Totaux : seulement les plantations datées, comme « Quoi semer ». */
const totaux = (ls: Ligne[]): TotauxProduction =>
  totaliser(ls.filter(l => l.recolteConnue).map(l => ({ production: l.production, planting: l.p })))

// ─── Composant principal ────────────────────────────
export default function Verification({ ctx }: { ctx: any }) {
  const confirm = useConfirm()
  const prod = useProduction(ctx)
  const gardens: Garden[] = ctx.gardens || []
  // Saison active, y compris les plantations sans dates de récolte (013)
  const seasonId: string | undefined = ctx.activeSeason?.id
  const plantings: PlantingFull[] = useMemo(() => {
    const tout: PlantingFull[] | undefined = ctx.farmPlantingsTout
    return tout ? tout.filter(p => p.season_id === seasonId) : (ctx.plantings || [])
  }, [ctx.farmPlantingsTout, ctx.plantings, seasonId])
  const [modal, setModal] = useState<'edit' | 'add' | null>(null)
  const [selectedPlanting, setSelectedPlanting] = useState<PlantingFull | null>(null)
  const [selectedPlanche, setSelectedPlanche] = useState<{ id: string; m2: number } | null>(null)

  const calcul = useMemo(() => {
    try {
      const lignes = new Map<string, Ligne>()
      for (const p of plantings) lignes.set(p.id, { p, ...ligneVerification(p, prod.taux) })
      return { lignes, erreur: null as string | null }
    } catch (e) {
      console.error('[vérification] calcul', e)
      return { lignes: new Map<string, Ligne>(), erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [plantings, prod.taux])

  // Regrouper par jardin puis par planche
  type PlancheGroup = { plancheId: string; plancheName: string; plancheM2: number; lignes: Ligne[] }
  type GardenGroup = { garden: Garden; planches: PlancheGroup[] }

  const gardenGroups: GardenGroup[] = gardens.map(g => {
    const planches = (g.planches || []).map((pl: any) => {
      const lignes = plantings
        .filter(p => p.planche_id === pl.id)
        .sort((a, b) => a.culture_name.localeCompare(b.culture_name))
        .map(p => calcul.lignes.get(p.id))
        .filter((l): l is Ligne => !!l)
      return { plancheId: pl.id, plancheName: pl.name, plancheM2: pl.surface_m2, lignes }
    })
    return { garden: g, planches }
  })

  // Inclure les planches vides pour pouvoir ajouter des cultures
  const gardenGroupsVisible = gardenGroups.filter(gg => gg.planches.length > 0)
  const toutesLignes = gardenGroupsVisible.flatMap(gg => gg.planches.flatMap(pl => pl.lignes))
  const totalPlantings = toutesLignes.length
  const totalGeneral = totaux(toutesLignes)
  const sansRecolte = toutesLignes.filter(l => !l.recolteConnue)

  const openEdit = (p: PlantingFull) => {
    setSelectedPlanting(p)
    setModal('edit')
  }

  const openAdd = (plancheId: string, plancheM2: number) => {
    setSelectedPlanche({ id: plancheId, m2: plancheM2 })
    setModal('add')
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
        description={`Vue complète de la production : ${totalPlantings} cultures réparties sur ${gardens.length} jardins`}
        image={photos.champCoucherSoleil} />

      {sansRecolte.length > 0 && (
        <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="status" data-testid="verification-sans-floraison">
          {sansRecolte.length} plantation{sansRecolte.length > 1 ? 's' : ''} sans date de floraison ({Array.from(new Set(sansRecolte.map(l => l.p.culture_name))).join(', ')}) : affichée{sansRecolte.length > 1 ? 's' : ''} sans dates de récolte, hors totaux. Renseignez le début de floraison dans le Catalogue.
        </p>
      )}
      {!prod.migration015 && (
        <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
          Réglages de production indisponibles (migration 015 non appliquée) : pertes de 30 % comme dans le tableur.
        </p>
      )}
      {(prod.error || calcul.erreur) && (
        <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{prod.error || calcul.erreur}</p>
      )}

      {/* Modale édition */}
      <Dialog open={modal === 'edit' && !!selectedPlanting} onOpenChange={o => !o && setModal(null)} size="lg"
        title={selectedPlanting ? `Modifier : ${selectedPlanting.culture_name}` : 'Modifier'}>
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
                <th className={TH}>Plants + {nb(prod.taux.semis)} %</th>
                <th className={TH}>Graines néc.</th>
                <th className={TH}>Tiges brutes</th>
                <th className={TH}>Tiges − {nb(prod.taux.champ)} %</th>
                <th className={TH}>Tiges/sem.</th>
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
                const lignesJardin = gg.planches.flatMap(pl => pl.lignes)
                const tJardin = totaux(lignesJardin)

                return (
                  <Fragment key={gg.garden.id}>
                    <tr>
                      <td colSpan={3} className="sticky left-0 z-[1] border-y border-border bg-primary-soft px-3 py-2">
                        <span className="font-serif text-sm font-semibold text-fg">{gg.garden.name}</span>
                      </td>
                      <td colSpan={27} className="border-y border-border bg-primary-soft px-3 py-2 text-xs text-fg-muted">
                        {gg.garden.surface_m2} m² · {lignesJardin.length} cultures · {gg.planches.length} planches · Revenu estimé : <strong className="num text-fg" data-testid="verification-revenu-jardin">{eurosRonds(tJardin.revenuCentimes)}</strong>
                        {tJardin.incompletes > 0 && <span className="ml-2 font-medium text-warning">{tJardin.incompletes} ligne{tJardin.incompletes > 1 ? 's' : ''} incomplète{tJardin.incompletes > 1 ? 's' : ''}</span>}
                      </td>
                    </tr>

                    {gg.planches.map(plGroup => (
                      <Fragment key={plGroup.plancheId}>
                        {plGroup.lignes.map(l => {
                          const { p, production: pr, recolteConnue } = l
                          const prix = p.prix_tige === null || p.prix_tige === undefined || (p.prix_tige as unknown) === '' ? null : eurosEnCentimes(p.prix_tige)
                          return (
                            <tr key={p.id} className="group cursor-pointer" onClick={() => openEdit(p)} data-testid="ligne-verification">
                              <td className={cn(TD, 'sticky left-0 z-[1] bg-surface font-semibold text-fg')}>{plGroup.plancheName}</td>
                              <td className={cn(TD, 'sticky left-16 z-[1] bg-surface !text-left font-medium text-fg')}>
                                <span className="underline decoration-border-strong decoration-dotted underline-offset-4 group-hover:decoration-primary">{p.culture_name}</span>
                              </td>
                              <td className={cn(TD, SEP, 'num text-right font-semibold')}><Saisie v={p.surface_m2} /></td>

                              <td className={cn(TD, 'text-right')}><CelluleCalcul c={pr.plants} /></td>
                              <td className={cn(TD, 'text-right text-fg-muted')}><CelluleCalcul c={pr.plantsAvecPertes} /></td>
                              <td className={cn(TD, 'text-right')}><CelluleCalcul c={pr.graines} /></td>
                              <td className={cn(TD, 'text-right text-fg-muted')}><CelluleCalcul c={pr.tiges} /></td>
                              <td className={cn(TD, 'text-right font-semibold')}><CelluleCalcul c={pr.tigesNettes} /></td>
                              <td className={cn(TD, 'text-right')}>{recolteConnue ? <CelluleRepartition r={pr.tigesParSemaine} /> : <RecolteInconnue p={p} />}</td>
                              <td className={cn(TD, SEP, 'num text-right')}>{prix === null ? <Saisie v={null} /> : formatEuros(prix)}</td>

                              <td className={cn(TD, 'text-right font-semibold text-primary')}><CelluleMontant m={pr.revenu} rond /></td>
                              <td className={cn(TD, 'text-right')}>{recolteConnue ? <CelluleRepartition r={pr.caParSemaine} euros /> : <RecolteInconnue p={p} />}</td>
                              <td className={cn(TD, 'num text-right')}><Saisie v={p.rendement} /></td>
                              <td className={cn(TD, SEP, 'text-center')}><TypeBadge type={p.culture_type} /></td>

                              <td className={cn(TD, 'num text-center')}><Saisie v={p.achat_plant ? 0 : p.jours_cellule} /></td>
                              <td className={cn(TD, 'num text-center')}><Saisie v={p.jours_champ} /></td>
                              <td className={cn(TD, 'num text-center')}><Saisie v={p.jours_recolte} /></td>
                              <td className={cn(TD, 'num text-center')}><Saisie v={p.espacement_cm} /></td>
                              <td className={cn(TD, 'num text-center')}><Saisie v={p.rangs_par_planche} /></td>
                              <td className={cn(TD, 'num text-center')}>{p.achat_plant ? <span className="text-2xs text-fg-subtle">plant acheté</span> : <Saisie v={p.graines_par_plant} />}</td>
                              <td className={cn(TD, SEP, 'text-center')}>
                                <div className="flex flex-wrap justify-center gap-1 text-[0.65rem] font-semibold">
                                  {p.pincer && <abbr className="text-warning no-underline" title="Pincer">P</abbr>}
                                  {p.filet && <abbr className="text-violet no-underline" title="Filet">F</abbr>}
                                  {p.couvre_sol && <abbr className="text-primary no-underline" title="Couvre-sol">CS</abbr>}
                                  {p.semis_direct && <abbr className="text-accent no-underline" title="Semis direct">SD</abbr>}
                                </div>
                              </td>

                              <td className={cn(TD, 'num text-center')}>{formatDateShort(p.date_semis)}</td>
                              <td className={cn(TD, 'num text-center')}>{formatDateShort(p.date_plantation)}</td>
                              <td className={cn(TD, 'num text-center font-medium')}>{recolteConnue ? formatDateShort(p.date_recolte) : <RecolteInconnue p={p} />}</td>
                              <td className={cn(TD, 'num text-center')}>{recolteConnue ? formatDateShort(p.date_fin) : <RecolteInconnue p={p} />}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{semaine(p.date_semis) ?? '-'}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{semaine(p.date_plantation) ?? '-'}</td>
                              <td className={cn(TD, 'num text-center text-fg-muted')}>{recolteConnue ? semaine(p.date_recolte) : <RecolteInconnue p={p} />}</td>
                              <td className={cn(TD, SEP, 'num text-center text-fg-muted')}>{recolteConnue ? semaine(p.date_fin) : <RecolteInconnue p={p} />}</td>

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
                        {/* Sous-total planche (plantations datées, comme « Quoi semer ») */}
                        {plGroup.lignes.length > 1 && (() => {
                          const t = totaux(plGroup.lignes)
                          return (
                            <tr className="text-[0.68rem] font-semibold text-fg-muted">
                              <td colSpan={2} className={cn(ST, 'sticky left-0 z-[1] text-right')}>Sous-total {plGroup.plancheName}</td>
                              <td className={cn(ST, SEP, 'num text-right')}>{nb(t.surface_m2)}/{plGroup.plancheM2} m²</td>
                              <td className={cn(ST, 'num text-right text-fg')}>{nb(t.plants)}</td>
                              <td className={cn(ST, 'num text-right')}>{nb(t.plantsAvecPertes)}</td>
                              <td className={cn(ST, 'num text-right text-fg')}>{nb(t.graines)}</td>
                              <td className={cn(ST, 'num text-right')}>{nb(t.tiges)}</td>
                              <td className={cn(ST, 'num text-right text-fg')}>{nb(t.tigesNettes)}</td>
                              <td className={ST} />
                              <td className={cn(ST, SEP)} />
                              <td className={cn(ST, 'num text-right text-primary')}>{eurosRonds(t.revenuCentimes)}</td>
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
                  <td colSpan={2} className={cn(FT, 'sticky left-0 z-[4] text-right uppercase tracking-wider')}>
                    Totaux
                    {totalGeneral.incompletes > 0 && <span className="ml-2 text-2xs font-medium normal-case tracking-normal text-warning">{totalGeneral.incompletes} ligne{totalGeneral.incompletes > 1 ? 's' : ''} incomplète{totalGeneral.incompletes > 1 ? 's' : ''}</span>}
                  </td>
                  <td className={cn(FT, SEP, 'num text-right')}>{nb(totalGeneral.surface_m2)}</td>
                  <td className={cn(FT, 'num text-right')} data-testid="verification-total-plants">{nb(totalGeneral.plants)}</td>
                  <td className={cn(FT, 'num text-right')}>{nb(totalGeneral.plantsAvecPertes)}</td>
                  <td className={cn(FT, 'num text-right')} data-testid="verification-total-graines">{nb(totalGeneral.graines)}</td>
                  <td className={cn(FT, 'num text-right')}>{nb(totalGeneral.tiges)}</td>
                  <td className={cn(FT, 'num text-right')} data-testid="verification-total-tiges">{nb(totalGeneral.tigesNettes)}</td>
                  <td className={FT} />
                  <td className={cn(FT, SEP)} />
                  <td className={cn(FT, 'num text-right text-sm text-primary')} data-testid="verification-total-revenu">{eurosRonds(totalGeneral.revenuCentimes)}</td>
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
