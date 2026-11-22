'use client'
// Grandeurs dérivées des données de gestion, calculées par le domaine
// (src/lib/domain/gestion.ts), partagées par les onglets de l'écran.
import { useMemo } from 'react'
import { encaisseVente, eurosEnCentimes, type BankAccount, type BankMatch, type BankTransaction, type DateISO } from '@/lib/domain'
import { depensesParCategorie } from '@/lib/domain/couts'
import { ventesFacturees } from '@/lib/domain/factures'
import {
  aEncaisser, actif, caEtTvaParMois, depensesSansJustificatif, ventesEncaisseNonCalculable, fluxDepenses, moisGlissants, piecesRapprochees, recettesEncaissees,
  resteARapprocher, soldeCompte, totalTresorerie, tresorerieParMois, type Cible, type Rapprochement, type Recette,
} from '@/lib/domain/gestion'
import type { useGestion } from '@/hooks/useGestion'

type G = ReturnType<typeof useGestion>

export interface MouvementVu { t: BankTransaction; montant: number; reste: number; liens: BankMatch[]; compte: BankAccount | undefined }

export function useDonneesGestion(g: G, aujourdhui: DateISO) {
  return useMemo(() => {
    const comptesParId = new Map(g.comptes.map(c => [c.id, c]))
    const facturesParId = new Map(g.factures.map(f => [f.id, f]))
    const mouvementsParId = new Map(g.mouvements.map(t => [t.id, t]))
    const facturees = ventesFacturees(g.invoiceSales)
    const ventesSF = g.sales.filter(v => !facturees.has(v.id))

    const recettes: Recette[] = recettesEncaissees({
      paiements: g.payments.map(p => ({ ...p, numero: facturesParId.get(p.invoice_id)?.numero ?? null, client: facturesParId.get(p.invoice_id)?.client_nom ?? null })),
      // Encaissé d'une vente sans facture : son TTC (014)
      ventes: ventesSF.map(v => ({ id: v.id, date: v.date, total: v.total, total_ttc: v.total_ttc, total_tva: v.total_tva, channel: v.channel, client: v.client })),
      horsFacture: g.liensActifs.filter(l => l.kind === 'hors_facture').map(l => {
        const t = mouvementsParId.get(l.transaction_id)
        return { id: l.id, date: t?.date ?? l.created_at.slice(0, 10), amount: l.amount, categorie: l.categorie, libelle: l.libelle, label: t?.label ?? '' }
      }),
    })

    const mois = moisGlissants(aujourdhui)
    const debut = `${mois[0]}-01`
    const coutsFenetre = g.costs.filter(c => c.date >= debut && c.date <= aujourdhui)
    const tresorerie = tresorerieParMois(recettes, fluxDepenses(g.costs), mois)
    const total = totalTresorerie(tresorerie)
    const categories = depensesParCategorie(coutsFenetre)
    // CA présenté HT, TVA collectée à part (toutes les ventes, par mois de vente)
    const caTva = caEtTvaParMois(g.sales, mois)
    const encaisseInconnu = ventesEncaisseNonCalculable(ventesSF)

    const mouvements: MouvementVu[] = g.mouvements.map(t => {
      const liens = g.liensParMouvement.get(t.id) ?? []
      const montant = eurosEnCentimes(t.amount)
      return { t, montant, reste: resteARapprocher(montant, liens), liens, compte: comptesParId.get(t.account_id) }
    })
    const nonRapproches = mouvements.filter(m => m.reste !== 0)
    const soldes = g.comptes.map(c => ({ compte: c, solde: soldeCompte(c, g.mouvements.filter(t => t.account_id === c.id)),
      aRapprocher: nonRapproches.filter(m => m.t.account_id === c.id).length }))

    const prises = piecesRapprochees(g.liens)
    const cibles: Cible[] = [
      ...g.costs.map(c => ({ type: 'depense' as const, id: c.id, date: c.date, montant: -eurosEnCentimes(c.amount), libelle: [c.supplier, c.notes].filter(Boolean).join(' ') })),
      ...g.payments.map(p => {
        const f = facturesParId.get(p.invoice_id)
        return { type: 'paiement' as const, id: p.id, date: p.date, montant: eurosEnCentimes(p.amount), libelle: [f?.numero, f?.client_nom, p.reference].filter(Boolean).join(' ') }
      }),
      // Une vente se rapproche de son encaissé TTC ; TVA non calculable : pas proposée
      ...ventesSF.flatMap(v => {
        const m = encaisseVente(v)
        return m === null ? [] : [{ type: 'vente' as const, id: v.id, date: v.date, montant: m, libelle: [v.channel, v.client].filter(Boolean).join(' ') }]
      }),
    ]

    /** Rapprochement actif d'une pièce : date du mouvement et compte. */
    const rapprochementDe = (col: 'cost_id' | 'payment_id' | 'sale_id', id: string): Rapprochement | null => {
      const l = g.liens.find(x => actif(x) && x[col] === id)
      const t = l && mouvementsParId.get(l.transaction_id)
      return t ? { date: t.date, compte: comptesParId.get(t.account_id)?.name ?? '' } : null
    }

    return {
      comptesParId, facturesParId, mouvementsParId, recettes, mois, tresorerie, total, categories, caTva, encaisseInconnu,
      mouvements, nonRapproches, soldes, prises, cibles, rapprochementDe,
      aEncaisser: aEncaisser(g.factures),
      manquants: depensesSansJustificatif(g.costs, g.receipts),
    }
  }, [g.comptes, g.factures, g.mouvements, g.invoiceSales, g.sales, g.payments, g.liensActifs, g.costs, g.liensParMouvement, g.liens, g.receipts, aujourdhui])
}

export type DonneesGestion = ReturnType<typeof useDonneesGestion>
