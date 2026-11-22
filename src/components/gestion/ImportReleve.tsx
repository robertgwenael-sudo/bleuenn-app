'use client'
import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, Field, Select, Segmented } from '@/components/ui'
import { formatEuros, type BankAccount, type BankTransaction } from '@/lib/domain'
import {
  appliquerMappage, avecEmpreintes, decoderReleve, dedoublonner, FORMATS_DATE, lireCsv, mappageCompatible, proposerMappage,
  type FormatDate, type MappageReleve, type SeparateurCsv,
} from '@/lib/domain/gestion'
import type { ResultatImport, useGestion } from '@/hooks/useGestion'
import { dateFr } from '@/components/justificatifs/commun'

const LIB_SEP: Record<SeparateurCsv, string> = { ';': 'Point-virgule ;', ',': 'Virgule ,', '\t': 'Tabulation' }

/** Import d'un relevé CSV : mappage des colonnes (mémorisé par compte), aperçu, doublons écartés. */
export function ImportReleve({ compte, existants, open, onOpenChange, onImporter }: {
  compte: BankAccount
  existants: BankTransaction[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onImporter: ReturnType<typeof useGestion>['importer']
}) {
  const input = useRef<HTMLInputElement>(null)
  const [fichier, setFichier] = useState<{ nom: string; texte: string; encodage: string } | null>(null)
  const [m, setM] = useState<MappageReleve | null>(null)
  const [memorise, setMemorise] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultat, setResultat] = useState<ResultatImport | null>(null)

  const lignes = useMemo(() => (fichier && m ? lireCsv(fichier.texte, m.separateur).filter(l => l.some(c => c !== '')) : []), [fichier, m])
  const lu = useMemo(() => (m ? appliquerMappage(lignes, m) : null), [lignes, m])
  const prets = useMemo(() => (lu ? avecEmpreintes(lu.mouvements) : []), [lu])
  const tri = useMemo(() => dedoublonner(prets, existants.map(t => t.empreinte)), [prets, existants])
  const largeur = Math.max(0, ...lignes.map(l => l.length))
  const entetes = m && m.ligneEntete >= 0 ? lignes[m.ligneEntete] ?? [] : []
  const nomColonne = (i: number) => `${i + 1}. ${entetes[i] || `colonne ${i + 1}`}`
  const colonnes = Array.from({ length: largeur }, (_, i) => i)

  const choisir = async (f: File | undefined) => {
    if (!f) return
    try {
      const { texte, encodage } = decoderReleve(new Uint8Array(await f.arrayBuffer()))
      const p = proposerMappage(texte)
      const connu = compte.csv_mapping
      const reprise = connu && mappageCompatible(connu, lireCsv(texte, (connu as MappageReleve).separateur ?? ';').filter(l => l.some(c => c !== '')))
      setFichier({ nom: f.name, texte, encodage })
      setM(reprise ? (connu as MappageReleve) : p.mappage)
      setMemorise(!!reprise)
      setResultat(null)
    } catch (e) {
      console.error('[gestion] lecture du relevé', e)
      toast.error('Fichier illisible', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  const maj = (p: Partial<MappageReleve>) => {
    if (!m) return
    const n = { ...m, ...p }
    if (p.ligneEntete !== undefined || p.separateur !== undefined) {
      const l = lireCsv(fichier!.texte, n.separateur).filter(x => x.some(c => c !== ''))
      n.entetes = n.ligneEntete >= 0 ? l[n.ligneEntete] ?? [] : []
    }
    setM(n)
    setMemorise(false)
  }

  const importer = async () => {
    if (!m || !fichier || !prets.length) return
    setBusy(true)
    const r = await onImporter(compte.id, fichier.nom, { ...m, entetes }, prets)
    setBusy(false)
    if (r) setResultat(r)
  }

  const fermer = (o: boolean) => {
    if (!o) { setFichier(null); setM(null); setResultat(null) }
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={fermer} size="lg" title={`Importer un relevé · ${compte.name}`}
      description="Fichier CSV exporté depuis l’espace en ligne de la banque. Les lignes déjà importées sont reconnues et ignorées."
      footer={resultat ? <Button onClick={() => fermer(false)}>Terminer</Button> : <>
        <Button variant="secondary" onClick={() => fermer(false)}>Annuler</Button>
        <Button onClick={importer} loading={busy} disabled={!tri.nouveaux.length}>
          Importer {tri.nouveaux.length} mouvement{tri.nouveaux.length > 1 ? 's' : ''}
        </Button>
      </>}>
      <input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1}
        aria-label="Fichier du relevé (CSV)" onChange={e => { choisir(e.target.files?.[0]); e.target.value = '' }} />

      {resultat ? (
        <div role="status" className="space-y-2 text-sm">
          <p className="text-base font-semibold text-fg">{resultat.nouvelles} mouvement{resultat.nouvelles > 1 ? 's' : ''} importé{resultat.nouvelles > 1 ? 's' : ''}</p>
          {resultat.doublons > 0 && <p className="text-fg-muted">{resultat.doublons} ligne{resultat.doublons > 1 ? 's' : ''} déjà connue{resultat.doublons > 1 ? 's' : ''}, ignorée{resultat.doublons > 1 ? 's' : ''}.</p>}
          <p className="text-fg-muted">Le mappage des colonnes est mémorisé pour ce compte.</p>
        </div>
      ) : !fichier || !m ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-10 text-center">
          <FileSpreadsheet className="h-8 w-8 text-fg-subtle" aria-hidden />
          <p className="max-w-sm text-sm text-fg-muted">Dans l’espace en ligne de la banque, cherchez « Exporter » ou « Télécharger les opérations », format CSV (ou « Excel CSV »).</p>
          <Button onClick={() => input.current?.click()}>Choisir le fichier CSV</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">{fichier.nom}</strong> · {lignes.length} lignes · encodage {fichier.encodage}
            {memorise ? ' · mappage mémorisé de ce compte' : ' · colonnes proposées, à vérifier'}
            <Button size="sm" variant="ghost" className="ml-1" onClick={() => input.current?.click()}>Changer de fichier</Button>
          </p>

          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-semibold text-fg">Colonnes du fichier</legend>
            <Field label="Séparateur">
              <Select value={m.separateur} onChange={e => maj({ separateur: e.target.value as SeparateurCsv })}>
                {(Object.keys(LIB_SEP) as SeparateurCsv[]).map(s => <option key={s} value={s}>{LIB_SEP[s]}</option>)}
              </Select>
            </Field>
            <Field label="Ligne d’en-tête">
              <Select value={m.ligneEntete} onChange={e => maj({ ligneEntete: Number(e.target.value) })}>
                <option value={-1}>Aucune</option>
                {lignes.slice(0, 15).map((l, i) => <option key={i} value={i}>{`Ligne ${i + 1} : ${l.join(' | ').slice(0, 40)}`}</option>)}
              </Select>
            </Field>
            <Field label="Décimales">
              <Select value={m.decimale} onChange={e => maj({ decimale: e.target.value as ',' | '.' })}>
                <option value=",">Virgule (12,50)</option><option value=".">Point (12.50)</option>
              </Select>
            </Field>
            <Field label="Date">
              <Select value={m.date} onChange={e => maj({ date: Number(e.target.value) })}>
                {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
              </Select>
            </Field>
            <Field label="Format de date">
              <Select value={m.formatDate} onChange={e => maj({ formatDate: e.target.value as FormatDate })}>
                {FORMATS_DATE.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="Libellé">
              <Select value={m.libelle[0]} onChange={e => maj({ libelle: [Number(e.target.value), ...m.libelle.slice(1)] })}>
                {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
              </Select>
            </Field>
            <Field label="Complément de libellé">
              <Select value={m.libelle[1] ?? -1} onChange={e => maj({ libelle: Number(e.target.value) < 0 ? [m.libelle[0]] : [m.libelle[0], Number(e.target.value)] })}>
                <option value={-1}>Aucun</option>
                {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Montants</p>
              <Segmented size="sm" label="Montants" value={m.montant.mode}
                onChange={v => maj({ montant: v === 'unique' ? { mode: 'unique', colonne: m.montant.mode === 'unique' ? m.montant.colonne : m.montant.debit }
                  : { mode: 'debit_credit', debit: m.montant.mode === 'unique' ? m.montant.colonne : m.montant.debit, credit: m.montant.mode === 'debit_credit' ? m.montant.credit : Math.min(largeur - 1, (m.montant.mode === 'unique' ? m.montant.colonne : 0) + 1) } })}
                options={[{ value: 'unique', label: 'Une colonne signée' }, { value: 'debit_credit', label: 'Débit et crédit séparés' }]} />
            </div>
            {m.montant.mode === 'unique' ? (
              <Field label="Montant">
                <Select value={m.montant.colonne} onChange={e => maj({ montant: { mode: 'unique', colonne: Number(e.target.value) } })}>
                  {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
                </Select>
              </Field>
            ) : (
              <>
                <Field label="Débit">
                  <Select value={m.montant.debit} onChange={e => maj({ montant: { ...(m.montant as { mode: 'debit_credit'; debit: number; credit: number }), debit: Number(e.target.value) } })}>
                    {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
                  </Select>
                </Field>
                <Field label="Crédit">
                  <Select value={m.montant.credit} onChange={e => maj({ montant: { ...(m.montant as { mode: 'debit_credit'; debit: number; credit: number }), credit: Number(e.target.value) } })}>
                    {colonnes.map(i => <option key={i} value={i}>{nomColonne(i)}</option>)}
                  </Select>
                </Field>
              </>
            )}
          </fieldset>

          <section aria-labelledby="apercu-releve">
            <h3 id="apercu-releve" className="mb-2 text-sm font-semibold text-fg">
              Aperçu : {prets.length} mouvement{prets.length > 1 ? 's' : ''} lu{prets.length > 1 ? 's' : ''}
              {' · '}<span className="text-primary">{tri.nouveaux.length} nouveau{tri.nouveaux.length > 1 ? 'x' : ''}</span>
              {tri.doublons.length > 0 && <span className="text-fg-muted"> · {tri.doublons.length} déjà importé{tri.doublons.length > 1 ? 's' : ''}</span>}
            </h3>
            <div className="max-h-64 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted"><tr>
                  <th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Libellé</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Montant</th><th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">État</span></th>
                </tr></thead>
                <tbody>
                  {prets.slice(0, 60).map(p => {
                    const doublon = tri.doublons.includes(p)
                    return (
                      <tr key={p.empreinte} className={doublon ? 'text-fg-subtle' : undefined}>
                        <td className="whitespace-nowrap px-3 py-1.5">{dateFr(p.date)}</td>
                        <td className="max-w-[16rem] truncate px-3 py-1.5" title={p.libelle}>{p.libelle}</td>
                        <td className={`num whitespace-nowrap px-3 py-1.5 text-right ${p.montant > 0 ? 'text-primary' : ''}`}>{formatEuros(p.montant)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-xs">{doublon ? 'déjà importé' : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {lu && lu.rejets.length > 0 && (
              <details className="mt-3 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm">
                <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-fg">
                  <TriangleAlert className="h-4 w-4 text-warning" aria-hidden /> {lu.rejets.length} ligne{lu.rejets.length > 1 ? 's' : ''} non importée{lu.rejets.length > 1 ? 's' : ''}
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                  {lu.rejets.slice(0, 20).map(r => <li key={r.ligne}>Ligne {r.ligne} : {r.raison} — <span className="font-mono">{r.contenu.slice(0, 80)}</span></li>)}
                </ul>
                <p className="mt-2 text-xs text-fg-muted">Lignes de solde ou de total : c’est normal. Sinon, vérifiez les colonnes ci-dessus.</p>
              </details>
            )}
          </section>
        </div>
      )}
    </Dialog>
  )
}
