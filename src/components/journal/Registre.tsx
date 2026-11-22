'use client'
import { useMemo, useState } from 'react'
import { Download, FlaskConical, Info, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, EmptyState, Field, Input, TableContainer, useConfirm } from '@/components/ui'
import { estDateValide, formatJourMois, type DateISO, type Treatment } from '@/lib/domain'
import { genererCsv, nomFichierExport } from '@/lib/domain/exports'
import {
  LIBELLES_CIBLES, LIBELLES_PRODUITS, controleDelaiRecolte, exportRegistre, formatDecimalFr, m2EnHa, traitementsDeLaPeriode,
} from '@/lib/domain/journal'
import { telechargerTexte } from '@/components/exports/telecharger'
import { Encadre } from './commun'

function Delai({ t }: { t: Treatment }) {
  let r: ReturnType<typeof controleDelaiRecolte> | null = null
  try { r = controleDelaiRecolte(t.date, t.delai_avant_recolte_j, t.date_recolte_suivante) } catch (e) { console.error('[registre] délai', t.id, e) }
  const dar = t.delai_avant_recolte_j === null ? 'DAR non saisi' : `DAR ${t.delai_avant_recolte_j} j`
  if (!r) return <span className="text-xs text-fg-subtle">{dar}</span>
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="text-xs text-fg-muted">{dar}{t.date_recolte_suivante ? ` · récolte ${formatJourMois(t.date_recolte_suivante)}` : ''}</span>
      {r.etat === 'non_respecte' && <Badge tone="red">{r.manqueJours} j trop tôt</Badge>}
      {r.etat === 'respecte' && <Badge tone="green">Délai respecté</Badge>}
    </span>
  )
}

const Amm = ({ t }: { t: Treatment }) => t.amm
  ? <span className="num text-xs text-fg-muted">AMM {t.amm}</span>
  : <Badge tone="amber">AMM non renseignée</Badge>

const surface = (t: Treatment) => `${formatDecimalFr(t.surface_m2)} m² (${formatDecimalFr(m2EnHa(t.surface_m2))} ha)`

export function Registre({ treatments, aujourdhui, onDelete }: {
  treatments: Treatment[]
  aujourdhui: DateISO
  onDelete: (id: string) => Promise<boolean>
}) {
  const confirm = useConfirm()
  const [du, setDu] = useState(`${aujourdhui.slice(0, 4)}-01-01`)
  const [au, setAu] = useState(`${aujourdhui.slice(0, 4)}-12-31`)

  const periodeInvalide = !estDateValide(du) || !estDateValide(au) ? 'Saisissez les deux dates.' : au < du ? 'La fin précède le début.' : null
  const lignes = useMemo(() => periodeInvalide ? [] : traitementsDeLaPeriode(treatments, du, au).reverse(), [treatments, du, au, periodeInvalide])

  const exporter = () => {
    if (periodeInvalide) { toast.error(periodeInvalide); return }
    try {
      const csv = genererCsv(exportRegistre(treatments, du, au))
      const nom = nomFichierExport('registre-phytosanitaire', du, au)
      telechargerTexte(nom, csv)
      toast.success('Registre exporté', { description: `${lignes.length} traitement${lignes.length > 1 ? 's' : ''} · ${nom}` })
    } catch (e) {
      console.error('[registre] export', e)
      toast.error('Export impossible', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const supprimer = async (t: Treatment) => {
    const ok = await confirm({
      title: 'Supprimer ce traitement du registre ?', destructive: true, confirmLabel: 'Supprimer',
      description: `${t.produit}, ${formatJourMois(t.date, Number(aujourdhui.slice(0, 4)))}. À réserver à une erreur de saisie : le registre doit être conservé.`,
    })
    if (ok) await onDelete(t.id)
  }

  return (
    <div className="space-y-4">
      <Encadre>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Registre numérique obligatoire au 1<sup>er</sup> janvier 2027 (arrêté du 24 décembre 2025). Le <strong className="font-medium text-fg">format
            d’échange officiel</strong> du registre numérique n’est pas encore pris en charge : l’export CSV en est une copie lisible.
            Durée de conservation : les sources consultées indiquent 3 ou 5 ans selon les cas ; l’application ne supprime rien d’elle-même.
          </span>
        </p>
      </Encadre>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Du" className="sm:w-44"><Input type="date" value={du} onChange={e => setDu(e.target.value)} /></Field>
          <Field label="Au" className="sm:w-44"><Input type="date" value={au} onChange={e => setAu(e.target.value)} /></Field>
          <Button onClick={exporter} disabled={!!periodeInvalide} className="sm:ml-auto">
            <Download className="h-4 w-4" aria-hidden />Exporter le registre (CSV)
          </Button>
        </div>
        {periodeInvalide && <p className="mt-2 text-xs text-danger">{periodeInvalide}</p>}
        {!periodeInvalide && <p className="mt-2 text-xs text-fg-subtle">{lignes.length} traitement{lignes.length > 1 ? 's' : ''} sur la période. Surfaces converties en hectares, sans arrondi.</p>}
      </Card>

      {lignes.length === 0 ? (
        <Card><EmptyState compact icon={<FlaskConical className="h-6 w-6" aria-hidden />} title="Aucun traitement sur la période"
          description="Ajoutez un traitement avec le bouton « Nouveau traitement »." /></Card>
      ) : (
        <>
          {/* Téléphone : cartes */}
          <ul className="space-y-3 md:hidden" aria-label="Traitements de la période">
            {lignes.map(t => (
              <li key={t.id}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-fg-muted">{formatJourMois(t.date, Number(aujourdhui.slice(0, 4)))} · {LIBELLES_PRODUITS[t.produit_type]}</p>
                      <p className="font-medium text-fg">{t.produit}</p>
                      <Amm t={t} />
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => supprimer(t)} aria-label={`Supprimer ${t.produit}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div><dt className="text-2xs text-fg-subtle">Culture · cible</dt><dd>{t.culture_libelle} · {t.cible}</dd></div>
                    <div><dt className="text-2xs text-fg-subtle">Lieu</dt><dd>{t.lieu_libelle}</dd></div>
                    <div><dt className="text-2xs text-fg-subtle">Dose</dt><dd className="num">{formatDecimalFr(t.dose)} {t.dose_unite}</dd></div>
                    <div><dt className="text-2xs text-fg-subtle">Quantité</dt><dd className="num">{formatDecimalFr(t.quantite_totale)} {t.quantite_unite}</dd></div>
                    <div className="col-span-2"><dt className="text-2xs text-fg-subtle">Surface</dt><dd className="num">{surface(t)}</dd></div>
                    <div className="col-span-2"><dt className="sr-only">Délai avant récolte</dt><dd><Delai t={t} /></dd></div>
                  </dl>
                  <p className="mt-2 text-2xs text-fg-subtle">Opérateur : {t.operateur_nom}{t.vent ? ` · vent ${t.vent}` : ''}{t.temperature_c !== null ? ` · ${formatDecimalFr(t.temperature_c)} °C` : ''}</p>
                </Card>
              </li>
            ))}
          </ul>

          {/* Bureau : tableau */}
          <TableContainer label="Registre des traitements" className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2 font-medium">Produit</th>
                  <th scope="col" className="px-3 py-2 font-medium">Culture · cible</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lieu</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Dose</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Quantité</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Surface</th>
                  <th scope="col" className="px-3 py-2 font-medium">Récolte</th>
                  <th scope="col" className="px-3 py-2 font-medium">Opérateur</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map(t => (
                  <tr key={t.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2.5">{formatJourMois(t.date, Number(aujourdhui.slice(0, 4)))}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-fg">{t.produit}</p>
                      <p className="text-xs text-fg-muted">{LIBELLES_PRODUITS[t.produit_type]}</p>
                      <Amm t={t} />
                    </td>
                    <td className="px-3 py-2.5">
                      <p>{t.culture_libelle}</p>
                      <p className="text-xs text-fg-muted">{t.cible} <span className="text-fg-subtle">({LIBELLES_CIBLES[t.cible_type].toLowerCase()})</span></p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p>{t.lieu_libelle}</p>
                      {t.ilot_pac && <p className="text-xs text-fg-subtle">{t.ilot_pac}</p>}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right">{formatDecimalFr(t.dose)} {t.dose_unite}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right">{formatDecimalFr(t.quantite_totale)} {t.quantite_unite}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5 text-right">
                      {formatDecimalFr(t.surface_m2)} m²<br /><span className="text-xs text-fg-subtle">{formatDecimalFr(m2EnHa(t.surface_m2))} ha</span>
                    </td>
                    <td className="px-3 py-2.5"><Delai t={t} /></td>
                    <td className="px-3 py-2.5">
                      <p>{t.operateur_nom}</p>
                      {(t.vent || t.temperature_c !== null) && (
                        <p className="text-xs text-fg-subtle">{[t.vent && `vent ${t.vent}`, t.temperature_c !== null && `${formatDecimalFr(t.temperature_c)} °C`].filter(Boolean).join(' · ')}</p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Button variant="ghost" size="icon-sm" onClick={() => supprimer(t)} aria-label={`Supprimer ${t.produit}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        </>
      )}
    </div>
  )
}
