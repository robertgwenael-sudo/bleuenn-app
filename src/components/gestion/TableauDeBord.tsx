'use client'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownLeft, ArrowUpRight, FileWarning, Landmark, Scale, TriangleAlert, Wallet } from 'lucide-react'
import { Button, Card, CardHeader, Segmented, Stat, cn } from '@/components/ui'
import { formatEuros, formatMois } from '@/lib/domain'
import { useChartTheme } from '@/components/charts/useChartTheme'
import { ChartTooltip, Legend } from '@/components/charts/ChartTooltip'
import { HBarChart } from '@/components/charts/HBarChart'
import { Valeur, eurosCompact } from '@/components/couts/commun'
import { calculee } from '@/lib/domain/couts'
import type { DonneesGestion } from './donnees'

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
/** `2026-11` → « nov. 26 ». */
const moisCourt = (m: string) => `${MOIS_COURTS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

function Signe({ c, className }: { c: number; className?: string }) {
  return <span className={cn('num', c < 0 && 'text-danger', className)}>{formatEuros(c)}</span>
}

export function TableauDeBord({ d, versBanque, versJustificatifs, versComptes }: {
  d: DonneesGestion
  versBanque: () => void
  versJustificatifs: () => void
  versComptes: () => void
}) {
  const t = useChartTheme()
  const [vue, setVue] = useState<'graphique' | 'tableau'>('graphique')
  const donnees = d.tresorerie.map(l => ({ mois: l.mois, encaisse: l.encaisse, depense: l.depense }))
  const ae = d.aEncaisser

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Encaissé sur 12 mois" value={formatEuros(d.total.encaisse)} icon={<ArrowDownLeft />} sub="factures payées, ventes sans facture, aides" />
        <Stat label="Dépensé sur 12 mois" value={formatEuros(d.total.depense)} icon={<ArrowUpRight />} sub="dépenses saisies" />
        <Stat label="Résultat de trésorerie" value={<Signe c={d.total.resultat} />} icon={<Scale />} sub="encaissé − dépensé" />
        <Stat label="À encaisser" value={formatEuros(ae.total)} icon={<Wallet />}
          sub={ae.nb ? `${ae.nb} facture${ae.nb > 1 ? 's' : ''} non soldée${ae.nb > 1 ? 's' : ''}` : 'aucune facture en attente'}
          className={ae.nbRetard ? 'border-danger/40' : undefined}>
          {ae.nbRetard > 0 && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              dont {formatEuros(ae.enRetard)} en retard ({ae.nbRetard}{ae.plusAncienRetard ? `, jusqu’à ${ae.plusAncienRetard} j` : ''})
            </p>
          )}
        </Stat>
      </div>

      <Card>
        <CardHeader title="Encaissé et dépensé par mois" description="12 derniers mois, mois en cours compris"
          action={<Segmented size="sm" label="Affichage" value={vue} onChange={setVue}
            options={[{ value: 'graphique', label: 'Graphique' }, { value: 'tableau', label: 'Tableau' }]} />} />
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {vue === 'graphique' ? (
            <>
              <Legend items={[{ label: 'Encaissé', color: t.c1 }, { label: 'Dépensé', color: t.c2 }]} />
              <div className="mt-3 h-[260px] w-full" role="img"
                aria-label={`Encaissé et dépensé par mois. Total : ${formatEuros(d.total.encaisse)} encaissés, ${formatEuros(d.total.depense)} dépensés. Détail dans la vue Tableau.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={donnees} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2}>
                    <CartesianGrid vertical={false} stroke={t.grid} strokeWidth={1} />
                    <XAxis dataKey="mois" tickLine={false} axisLine={{ stroke: t.grid }} tick={{ fill: t.axis, fontSize: 11 }}
                      tickFormatter={moisCourt} interval="preserveStartEnd" minTickGap={6} />
                    <YAxis width={60} tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={eurosCompact} allowDecimals={false} />
                    <Tooltip cursor={{ fill: t.cursor }} content={<ChartTooltip format={v => formatEuros(v)} labelFormat={(m: string) => formatMois(m)} />} />
                    <Bar dataKey="encaisse" name="Encaissé" fill={t.c1} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                    <Bar dataKey="depense" name="Dépensé" fill={t.c2} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">Encaissé, dépensé et résultat de trésorerie par mois</caption>
                <thead><tr className="border-b border-border text-left text-xs text-fg-muted">
                  <th scope="col" className="py-2 font-medium">Mois</th>
                  <th scope="col" className="py-2 text-right font-medium">Encaissé</th>
                  <th scope="col" className="py-2 text-right font-medium">Dépensé</th>
                  <th scope="col" className="py-2 text-right font-medium">Résultat</th>
                </tr></thead>
                <tbody>
                  {d.tresorerie.map(l => (
                    <tr key={l.mois} className="border-b border-border/60">
                      <th scope="row" className="py-1.5 text-left font-normal capitalize">{formatMois(l.mois)}</th>
                      <td className="num py-1.5 text-right">{formatEuros(l.encaisse)}</td>
                      <td className="num py-1.5 text-right">{formatEuros(l.depense)}</td>
                      <td className="py-1.5 text-right"><Signe c={l.resultat} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="font-semibold">
                  <th scope="row" className="py-2 text-left">Total</th>
                  <td className="num py-2 text-right">{formatEuros(d.total.encaisse)}</td>
                  <td className="num py-2 text-right">{formatEuros(d.total.depense)}</td>
                  <td className="py-2 text-right"><Signe c={d.total.resultat} /></td>
                </tr></tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-fg-subtle">
            Trésorerie simple, sans TVA : paiements de factures à leur date, ventes sans facture le jour de la vente (supposées payées comptant),
            aides et remboursements rapprochés à la date du mouvement. Apports, prélèvements et virements internes ne comptent pas.
          </p>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Dépenses par catégorie" description="12 derniers mois" />
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            {d.categories.length
              ? <HBarChart data={d.categories.map(c => ({ label: c.libelle, value: c.total }))} format={formatEuros} seriesName="Dépensé" />
              : <p className="py-6 text-center text-sm text-fg-muted">Aucune dépense sur la période.</p>}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Solde des comptes" description="Solde initial + mouvements importés ou saisis"
              action={<Button size="sm" variant="ghost" onClick={versComptes}>Gérer</Button>} />
            <ul className="divide-y divide-border px-4 pb-2 sm:px-5" aria-label="Soldes par compte">
              {d.soldes.length === 0 && <li className="py-4 text-sm text-fg-muted">Aucun compte. Créez-en un pour importer un relevé.</li>}
              {d.soldes.map(({ compte, solde }) => (
                <li key={compte.id} className="flex items-center gap-3 py-3">
                  <Landmark className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{compte.name}<span className="ml-1.5 text-xs text-fg-subtle">{compte.kind === 'caisse' ? 'caisse' : 'banque'}</span></span>
                  <span className="text-right font-semibold"><Valeur g={solde} signe /></span>
                </li>
              ))}
              {d.soldes.length > 1 && d.soldes.every(s => s.solde.valeur !== null) && (
                <li className="flex items-center gap-3 py-3 font-semibold">
                  <span className="flex-1 text-sm">Total</span>
                  <Valeur g={calculee(d.soldes.reduce((s, x) => s + (x.solde.valeur ?? 0), 0))} signe />
                </li>
              )}
            </ul>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={versJustificatifs}
              className="rounded-card border border-border bg-surface p-4 text-left shadow-card hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center justify-between text-xs font-medium text-fg-muted">Justificatifs manquants <FileWarning className="h-4 w-4" aria-hidden /></span>
              <span className="num mt-2 block text-2xl font-semibold">{d.manquants.length}</span>
              <span className="mt-1 block text-xs text-fg-subtle">dépense{d.manquants.length > 1 ? 's' : ''} sans pièce · les scanner</span>
            </button>
            <button type="button" onClick={versBanque}
              className="rounded-card border border-border bg-surface p-4 text-left shadow-card hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center justify-between text-xs font-medium text-fg-muted">Mouvements à rapprocher <Landmark className="h-4 w-4" aria-hidden /></span>
              <span className="num mt-2 block text-2xl font-semibold">{d.nonRapproches.length}</span>
              <span className="mt-1 block text-xs text-fg-subtle">sur {d.mouvements.length} importés ou saisis · rapprocher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
