'use client'
// Page d'impression d'une facture ou d'un avoir (A4). Le PDF s'obtient par
// l'impression du navigateur (« Enregistrer en PDF ») : rien n'est stocké
// côté serveur. La page ne lit que les instantanés figés à l'émission, par
// le client Supabase du navigateur : la RLS s'applique comme partout.
import { useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useFactureImprimable } from '@/hooks/useFactures'
import { DocumentFacture } from '@/components/factures/DocumentFacture'
import { dateFr } from '@/components/factures/commun'

const STYLE_IMPRESSION = `
@page { size: A4; margin: 0; }
.feuille-facture { width: 210mm; min-height: 297mm; padding: 16mm 15mm 14mm; box-sizing: border-box; }
@media screen {
  .ecran-facture { background: #e9e7e0; }
  .feuille-facture { box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 12px 32px rgb(0 0 0 / 0.10); }
}
@media screen and (max-width: 840px) {
  .feuille-facture { width: 100%; min-height: 0; padding: 7vw 5vw; font-size: 9.5pt; }
}
@media screen and (max-width: 640px) {
  .feuille-facture > header { flex-direction: column; gap: 1.25rem; }
  .feuille-facture > header > div:last-child { text-align: left; }
  .feuille-facture > header dl { justify-content: start; }
  .feuille-facture > section.grid { grid-template-columns: 1fr; }
  .feuille-facture .bloc-total { width: 100%; }
  .feuille-facture table th, .feuille-facture table td { padding-right: 0.4rem; }
}
@media print {
  html, body { background: #fff !important; }
  .sans-impression, [data-sonner-toaster], nextjs-portal { display: none !important; }
  .ecran-facture { background: #fff !important; padding: 0 !important; }
  .feuille-facture { box-shadow: none !important; margin: 0 !important; }
  tr { break-inside: avoid; }
}
`

export default function PageFacture() {
  const params = useParams<{ id: string }>()
  const id = typeof params?.id === 'string' ? params.id : null
  const { loading, erreur, facture, lignes, liee } = useFactureImprimable(id)

  // Titre = nom de fichier proposé par « Enregistrer en PDF »
  useEffect(() => {
    if (facture) document.title = `${facture.kind === 'avoir' ? 'Avoir' : 'Facture'} ${facture.numero}`
  }, [facture])

  return (
    <div className="ecran-facture min-h-screen px-3 pb-10 pt-4 sm:px-6">
      <style dangerouslySetInnerHTML={{ __html: STYLE_IMPRESSION }} />
      <nav className="sans-impression mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <Link href="/#factures" className="inline-flex h-10 items-center gap-2 rounded-btn px-3 text-sm font-medium text-[#3c4238] hover:bg-white/70">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux factures
        </Link>
        {facture && (
          <button type="button" onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-btn bg-[#2f4a2a] px-4 text-sm font-medium text-white shadow-xs hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f4a2a] focus-visible:ring-offset-2">
            <Printer className="h-4 w-4" aria-hidden /> Imprimer / Enregistrer en PDF
          </button>
        )}
      </nav>

      {facture?.annulee_par && (
        <p className="sans-impression mx-auto mb-3 max-w-[210mm] rounded-lg border border-[#e2c9a2] bg-[#fbf3e4] px-4 py-2.5 text-sm text-[#6b4a12]">
          Cette facture a été annulée par l’avoir n° {liee?.numero ?? '—'}{liee ? ` du ${dateFr(liee.date_emission)}` : ''}.
          Le document ci-dessous reste celui qui a été émis.
        </p>
      )}

      {loading ? (
        <p className="flex items-center justify-center gap-2 py-24 text-sm text-[#6b7266]" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de la facture…
        </p>
      ) : erreur || !facture ? (
        <div role="alert" className="mx-auto mt-10 max-w-md rounded-xl border border-[#e7c3bd] bg-white p-6 text-center text-[#1f231d]">
          <AlertCircle className="mx-auto h-6 w-6 text-[#b4412f]" aria-hidden />
          <p className="mt-2 font-semibold">{erreur ? 'Lecture de la facture impossible' : 'Facture introuvable ou inaccessible'}</p>
          <p className="mt-1 text-sm text-[#6b7266]">{erreur ?? 'Vérifiez que vous êtes connecté(e) avec un compte membre de la ferme.'}</p>
        </div>
      ) : (
        <DocumentFacture facture={facture} lignes={lignes} liee={liee} />
      )}
    </div>
  )
}
