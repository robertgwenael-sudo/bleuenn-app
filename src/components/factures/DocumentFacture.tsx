import { eurosEnCentimes, formatEuros, formatTaux, type Invoice, type InvoiceLine } from '@/lib/domain'
import { formatSiret } from '@/lib/domain/factures'
import { dateFr, quantiteFr, UNITE_FACTURE } from './commun'

/**
 * Document imprimable d'une facture ou d'un avoir, au format A4.
 * Ne lit QUE les instantanés figés à l'émission (vendeur, acheteur, lignes,
 * mentions) : l'imprimer aujourd'hui ou dans cinq ans donne le même papier.
 * Couleurs fixes (pas les jetons du thème) : le document reste clair en mode
 * sombre et à l'impression.
 * Ferme non assujettie (régime figé sur la facture) : ni taux, ni montant,
 * ni « HT » / « TTC », un seul « Total » et la mention d'absence de TVA.
 * Ferme assujettie (014) : prix unitaires HT, taux par ligne, puis par taux
 * le total HT et la TVA, et le total TTC ; numéros de TVA du vendeur (et du
 * client s'il est connu).
 */
export function DocumentFacture({ facture: f, lignes, liee }: {
  facture: Invoice
  lignes: InvoiceLine[]
  liee: Pick<Invoice, 'numero' | 'date_emission'> | null
}) {
  const avoir = f.kind === 'avoir'
  const v = f.vendeur
  const a = f.acheteur
  const plusieursVentes = new Set(lignes.map(l => l.sale_id)).size > 1
  const periode = f.date_vente_debut === f.date_vente_fin
    ? dateFr(f.date_vente_debut)
    : `du ${dateFr(f.date_vente_debut)} au ${dateFr(f.date_vente_fin)}`
  const tva = !!f.assujettie_tva
  const e = (x: string | number) => formatEuros(eurosEnCentimes(x))
  const siren = v.siret ? `${v.siret.length === 14 ? 'SIRET' : 'SIREN'} ${formatSiret(v.siret)}` : null

  return (
    <article className="feuille-facture mx-auto flex flex-col bg-white font-sans text-[10.5pt] leading-snug text-[#1f231d]"
      aria-label={`${avoir ? 'Avoir' : 'Facture'} n° ${f.numero}`}>
      <header className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <p className="font-serif text-[17pt] font-medium leading-tight text-[#2f4a2a]">{v.raison_sociale}</p>
          <p className="mt-1 whitespace-pre-line text-[#3c4238]">{v.adresse}</p>
          {siren && <p className="mt-1 text-[#3c4238]">{siren}</p>}
          {tva && v.numero_tva && <p className="text-[#3c4238]">N° TVA intracommunautaire {v.numero_tva}</p>}
          {(v.email || v.telephone) && <p className="text-[#3c4238]">{[v.telephone, v.email].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="shrink-0 text-right">
          <h1 className="font-serif text-[22pt] font-medium uppercase leading-none tracking-wide text-[#2f4a2a]">{avoir ? 'Avoir' : 'Facture'}</h1>
          <p className="mt-2 text-[12pt] font-semibold">N° {f.numero}</p>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 gap-y-0.5 text-[9.5pt]">
            <dt className="text-[#6b7266]">Date d’émission</dt><dd>{dateFr(f.date_emission)}</dd>
            <dt className="text-[#6b7266]">{f.date_vente_debut === f.date_vente_fin ? 'Date de vente / livraison' : 'Ventes / livraisons'}</dt><dd>{periode}</dd>
            {!avoir && <><dt className="text-[#6b7266]">Échéance</dt><dd className="font-semibold">{dateFr(f.date_echeance)}</dd></>}
          </dl>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-6">
        <div className="rounded-md border border-[#d9dcd3] px-4 py-3">
          <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-[#6b7266]">{avoir ? 'Client' : 'Facturé à'}</p>
          <p className="mt-1 font-semibold">{a.nom || 'Client particulier'}</p>
          {a.adresse && <p className="whitespace-pre-line">{a.adresse}</p>}
          {a.siren && <p className="mt-1 text-[9.5pt]">SIREN {formatSiret(a.siren)}</p>}
          {tva && a.numero_tva && <p className="text-[9.5pt]">N° TVA {a.numero_tva}</p>}
        </div>
        {a.adresse_livraison ? (
          <div className="rounded-md border border-[#d9dcd3] px-4 py-3">
            <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-[#6b7266]">Adresse de livraison</p>
            <p className="mt-1 whitespace-pre-line">{a.adresse_livraison}</p>
          </div>
        ) : <div />}
      </section>

      {avoir && (
        <p className="mt-5 rounded-md bg-[#f3f1ea] px-4 py-2.5">
          Avoir sur la facture n° <strong>{liee?.numero ?? '—'}</strong>{liee ? ` du ${dateFr(liee.date_emission)}` : ''}, qu’il annule en totalité.
          {f.motif && <><br /><span className="text-[#3c4238]">Motif : {f.motif}</span></>}
        </p>
      )}

      {f.commandes?.length > 0 && (
        <p className="mt-5 text-[9.5pt] text-[#3c4238]">
          {f.commandes.length > 1 ? 'Bons de commande : ' : 'Bon de commande : '}
          {f.commandes.map(c => `n° ${c.numero ?? '(sans numéro)'} livré le ${dateFr(c.date_livraison)}`).join(' ; ')}
        </p>
      )}

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-[#2f4a2a] text-left text-[8.5pt] uppercase tracking-wider text-[#3c4238]">
            <th className="py-2 pr-3 font-semibold">Désignation</th>
            <th className="py-2 pr-3 text-right font-semibold">Quantité</th>
            <th className="py-2 pr-3 text-right font-semibold">{tva ? 'Prix unitaire HT' : 'Prix unitaire'}</th>
            {tva && <th className="py-2 pr-3 text-right font-semibold">TVA</th>}
            <th className="py-2 text-right font-semibold">{tva ? 'Total HT' : 'Total'}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            const unite = UNITE_FACTURE[l.unit] ?? ''
            const detail = [
              unite && l.unit !== 'tige' && l.stems_per_unit > 1 ? `${unite} de ${l.stems_per_unit} tiges` : '',
              plusieursVentes && l.sale_date ? `vente du ${dateFr(l.sale_date)}` : '',
            ].filter(Boolean).join(' · ')
            return (
              <tr key={l.id} className="border-b border-[#e6e8e1] align-top">
                <td className="py-2 pr-3">
                  <span className="font-medium">{l.label}</span>
                  {detail && <span className="block text-[9pt] text-[#6b7266]">{detail}</span>}
                </td>
                <td className="num whitespace-nowrap py-2 pr-3 text-right">{quantiteFr(l.quantity)}{unite ? ` ${unite}${eurosEnCentimes(l.quantity) > 100 ? 's' : ''}` : ''}</td>
                <td className="num whitespace-nowrap py-2 pr-3 text-right">{formatEuros(eurosEnCentimes(l.unit_price))}</td>
                {tva && <td className="num whitespace-nowrap py-2 pr-3 text-right">{l.taux_tva_pb === null ? '' : formatTaux(l.taux_tva_pb)}</td>}
                <td className="num whitespace-nowrap py-2 text-right">{formatEuros(eurosEnCentimes(l.line_total))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="bloc-total w-[48%]">
          {tva ? (
            <>
              <table className="w-full border-collapse text-[9.5pt]" aria-label="Récapitulatif de la TVA">
                <thead>
                  <tr className="border-b border-[#d9dcd3] text-[8.5pt] uppercase tracking-wider text-[#6b7266]">
                    <th className="py-1 pr-2 text-left font-semibold">Taux</th>
                    <th className="py-1 pr-2 text-right font-semibold">Base HT</th>
                    <th className="py-1 text-right font-semibold">TVA</th>
                  </tr>
                </thead>
                <tbody>
                  {f.ventilation_tva.map(x => (
                    <tr key={x.taux_pb} className="border-b border-[#e6e8e1]">
                      <td className="py-1 pr-2">{formatTaux(x.taux_pb)}{x.libelle ? <span className="text-[#6b7266]"> · {x.libelle}</span> : null}</td>
                      <td className="num py-1 pr-2 text-right">{e(x.base_ht)}</td>
                      <td className="num py-1 text-right">{e(x.tva)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex items-baseline justify-between py-1">
                <span>Total HT</span><span className="num">{e(f.total_ht)}</span>
              </div>
              <div className="flex items-baseline justify-between py-1">
                <span>Total TVA</span><span className="num">{e(f.total_tva)}</span>
              </div>
              <div className="flex items-baseline justify-between border-y-2 border-[#2f4a2a] py-2.5">
                <span className="text-[11pt] font-semibold">Total TTC</span>
                <span className="num text-[14pt] font-semibold">{e(f.total)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between border-y-2 border-[#2f4a2a] py-2.5">
                <span className="text-[11pt] font-semibold">Total</span>
                <span className="num text-[14pt] font-semibold">{formatEuros(eurosEnCentimes(f.total))}</span>
              </div>
              <p className="mt-2 text-right text-[9.5pt] font-medium">{f.mention_tva}</p>
            </>
          )}
        </div>
      </div>

      <section className="mt-8 space-y-1.5 text-[9.5pt] text-[#3c4238]">
        {!avoir && (
          <p>
            <strong className="text-[#1f231d]">Paiement :</strong>{' '}
            {f.date_echeance === f.date_emission ? 'à réception de facture' : `au plus tard le ${dateFr(f.date_echeance)}`}.
            {f.conditions_paiement ? ` ${f.conditions_paiement}` : ''}
          </p>
        )}
        {(v.iban || v.bic) && (
          <p><strong className="text-[#1f231d]">Coordonnées bancaires :</strong> {[v.iban && `IBAN ${v.iban}`, v.bic && `BIC ${v.bic}`].filter(Boolean).join(' · ')}</p>
        )}
        {f.penalites_retard && <p>{f.penalites_retard}</p>}
        {f.indemnite_recouvrement && <p>{f.indemnite_recouvrement}</p>}
        {f.notes && <p>{f.notes}</p>}
      </section>

      {v.mentions_libres && (
        <footer className="mt-auto whitespace-pre-line border-t border-[#e6e8e1] pt-3 text-center text-[8.5pt] text-[#6b7266]">
          {v.mentions_libres}
        </footer>
      )}
    </article>
  )
}
