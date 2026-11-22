'use client'
import { Download } from 'lucide-react'
import { Button, Dialog } from '@/components/ui'
import { tableauFormate, type Tableau } from '@/lib/domain/exports'

const NB_APERCU = 5

/** Aperçu des premières lignes d'un export, tel qu'Excel les affichera. */
export function ApercuDialog({ open, onOpenChange, titre, nomFichier, tableau, onTelecharger }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  titre: string
  nomFichier: string
  tableau: Tableau | null
  onTelecharger: () => void
}) {
  const lignes = tableau ? tableauFormate(tableau, NB_APERCU) : []
  const total = tableau?.lignes.length ?? 0
  const alignDroite = (t: string) => t === 'montant' || t === 'entier' || t === 'decimal'
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={titre}
      description={<span className="break-all font-mono text-[0.7rem]">{nomFichier}</span>}
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Fermer</Button>
        <Button onClick={onTelecharger} disabled={total === 0}><Download className="h-4 w-4" aria-hidden />Télécharger</Button>
      </>}>
      {tableau && total > 0 ? (
        <>
          <p className="mb-3 text-xs text-fg-muted">
            {total <= NB_APERCU ? `Les ${total} lignes du fichier.` : `Les ${NB_APERCU} premières lignes sur ${total.toLocaleString('fr-FR')}.`}
            {' '}Montants en euros, à la virgule, comme dans Excel.
          </p>
          <div className="-mx-5 overflow-x-auto border-y border-border sm:mx-0 sm:rounded-lg sm:border" tabIndex={0} role="region" aria-label="Aperçu du fichier">
            <table className="w-max min-w-full text-left text-xs">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  {tableau.colonnes.map(c => (
                    <th key={c.titre} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${alignDroite(c.type) ? 'text-right' : ''}`}>{c.titre}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lignes.map((l, i) => (
                  <tr key={i}>
                    {l.map((v, j) => (
                      <td key={j} className={`max-w-[16rem] truncate px-3 py-2 text-fg ${alignDroite(tableau.colonnes[j].type) ? 'num text-right' : ''}`} title={v}>
                        {v || <span className="text-fg-subtle">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-fg-muted">Aucune ligne sur cette période : le fichier ne contiendrait que l’en-tête.</p>
      )}
    </Dialog>
  )
}
