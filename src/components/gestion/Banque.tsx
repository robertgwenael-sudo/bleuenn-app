'use client'
import { useMemo, useState } from 'react'
import { Check, FilePlus2, Landmark, Link2, Plus, Undo2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, Segmented, Select, useConfirm } from '@/components/ui'
import { COST_CATEGORIES, HORS_FACTURE_CATEGORIES, eurosEnCentimes, formatEuros, type BankMatch, type CostCategory, type DateISO, type HorsFactureCategorie } from '@/lib/domain'
import { LIBELLES_CATEGORIES } from '@/lib/domain/couts'
import {
  categorieSuggeree, HORS_FACTURE_RECETTES, LIBELLES_HORS_FACTURE, LIBELLES_TYPE_RAPPROCHEMENT, propositions, statutJustificatif, type Cible,
} from '@/lib/domain/gestion'
import { lireMontant } from '@/components/couts/commun'
import { saisonPour } from '@/hooks/useJustificatifs'
import type { GestionCtx, useGestion } from '@/hooks/useGestion'
import { dateFr, euros } from '@/components/justificatifs/commun'
import { ImportReleve } from './ImportReleve'
import type { DonneesGestion, MouvementVu } from './donnees'

type G = ReturnType<typeof useGestion>
const TYPE_CIBLE: Record<Cible['type'], string> = { depense: 'Dépense', paiement: 'Paiement', vente: 'Vente' }

function Montant({ c }: { c: number }) {
  return <span className={`num font-semibold ${c > 0 ? 'text-primary' : 'text-fg'}`}>{c > 0 ? '+' : ''}{formatEuros(c)}</span>
}

export function Banque({ g, d, ctx, aujourdhui, versComptes }: { g: G; d: DonneesGestion; ctx: GestionCtx; aujourdhui: DateISO; versComptes: () => void }) {
  const confirm = useConfirm()
  const actifs = g.comptes.filter(c => !c.archived_at)
  const [compteId, setCompteId] = useState<string>(() => actifs[0]?.id ?? '')
  const compte = actifs.find(c => c.id === compteId) ?? actifs[0]
  const [filtre, setFiltre] = useState<'a_rapprocher' | 'tous'>('a_rapprocher')
  const [importOuvert, setImportOuvert] = useState(false)
  const [saisie, setSaisie] = useState(false)
  const [creer, setCreer] = useState<MouvementVu | null>(null)
  const [horsFacture, setHorsFacture] = useState<MouvementVu | null>(null)
  const [choix, setChoix] = useState<MouvementVu | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const liste = useMemo(() => d.mouvements
    .filter(m => m.t.account_id === compte?.id && (filtre === 'tous' || m.reste !== 0)), [d.mouvements, compte, filtre])
  const aRapprocher = d.mouvements.filter(m => m.t.account_id === compte?.id && m.reste !== 0).length

  const libellePiece = (l: BankMatch): string => {
    if (l.kind === 'hors_facture') return `${LIBELLES_HORS_FACTURE[l.categorie ?? 'autre']}${l.libelle ? ` · ${l.libelle}` : ''}`
    if (l.kind === 'depense') {
      const c = g.costs.find(x => x.id === l.cost_id)
      return c ? `${c.supplier || LIBELLES_CATEGORIES[c.category]} · ${dateFr(c.date)}` : 'dépense supprimée'
    }
    if (l.kind === 'paiement') {
      const p = g.payments.find(x => x.id === l.payment_id)
      const f = p && d.facturesParId.get(p.invoice_id)
      return p ? `${f?.numero ?? 'facture'}${f?.client_nom ? ` · ${f.client_nom}` : ''} · ${dateFr(p.date)}` : 'paiement'
    }
    const v = g.sales.find(x => x.id === l.sale_id)
    return v ? `${v.channel}${v.client ? ` · ${v.client}` : ''} · ${dateFr(v.date)}` : 'vente supprimée'
  }

  const valider = async (m: MouvementVu, c: Cible) => {
    setBusy(m.t.id)
    const montant = Math.sign(m.reste) * Math.min(Math.abs(m.reste), Math.abs(c.montant))
    await g.rapprocher(m.t, { kind: c.type, id: c.id }, montant, `Rapproché : ${TYPE_CIBLE[c.type].toLowerCase()} de ${formatEuros(Math.abs(c.montant))}`)
    setBusy(null)
  }
  const defaire = async (l: BankMatch) => {
    if (!(await confirm({ title: 'Défaire ce rapprochement ?', description: 'Le lien reste dans l’historique, marqué « défait ». La pièce redevient disponible.', confirmLabel: 'Défaire' }))) return
    await g.defaire(l.id)
  }

  if (!actifs.length) {
    return (
      <Card><EmptyState icon={<Landmark className="h-6 w-6" />} title="Aucun compte"
        description="Créez le compte de la banque (et une caisse si vous encaissez en espèces), avec son solde initial."
        action={<Button onClick={versComptes}><Plus className="h-4 w-4" aria-hidden /> Créer un compte</Button>} /></Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Compte" value={compte.id} onChange={setCompteId} className="w-full sm:w-auto"
          options={actifs.map(c => ({ value: c.id, label: c.name }))} />
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Button className="flex-1 sm:flex-none" onClick={() => setImportOuvert(true)}><Upload className="h-4 w-4" aria-hidden /> Importer un relevé</Button>
          <Button className="flex-1 sm:flex-none" variant="secondary" onClick={() => setSaisie(true)}><Plus className="h-4 w-4" aria-hidden /> Saisir<span className="hidden sm:inline">&nbsp;un mouvement</span></Button>
        </div>
      </div>

      <Segmented size="sm" label="Filtre des mouvements" value={filtre} onChange={setFiltre} className="sm:w-80"
        options={[{ value: 'a_rapprocher', label: `À rapprocher · ${aRapprocher}` }, { value: 'tous', label: 'Tous' }]} />

      {liste.length === 0 ? (
        <Card><EmptyState compact icon={<Check className="h-6 w-6" />}
          title={filtre === 'a_rapprocher' ? 'Tout est rapproché' : 'Aucun mouvement'}
          description={filtre === 'tous' ? 'Importez le relevé CSV de la banque, ou saisissez les mouvements de la caisse.' : undefined} /></Card>
      ) : (
        <ul className="space-y-3" aria-label={`Mouvements de ${compte.name}`}>
          {liste.map(m => {
            const props = m.reste !== 0 ? propositions({ date: m.t.date, reste: m.reste, label: m.t.label }, d.cibles, d.prises) : []
            const actifsM = m.liens.filter(l => !l.annule_le)
            return (
              <li key={m.t.id}>
                <Card className="p-3 sm:p-4" aria-label={`${dateFr(m.t.date)} ${m.t.label} ${formatEuros(m.montant)}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-fg">{m.t.label}</p>
                      <p className="mt-0.5 text-xs text-fg-muted">{dateFr(m.t.date)}{m.t.import_id ? '' : ' · saisi à la main'}</p>
                    </div>
                    <div className="text-right">
                      <Montant c={m.montant} />
                      <div className="mt-1">{m.reste === 0 ? <Badge tone="green" dot>Rapproché</Badge>
                        : actifsM.length ? <Badge tone="amber" dot>Reste {formatEuros(Math.abs(m.reste))}</Badge>
                          : <Badge tone="amber" dot>À rapprocher</Badge>}</div>
                    </div>
                  </div>

                  {actifsM.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {actifsM.map(l => (
                        <li key={l.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                          <Link2 className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                          <span className="min-w-0 flex-1 truncate"><span className="text-fg-muted">{LIBELLES_TYPE_RAPPROCHEMENT[l.kind]} :</span> {libellePiece(l)}</span>
                          <span className="num text-xs">{euros(l.amount)}</span>
                          <Button size="icon-sm" variant="ghost" aria-label={`Défaire le rapprochement ${libellePiece(l)}`} onClick={() => defaire(l)}>
                            <Undo2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {m.reste !== 0 && (
                    <div className="mt-3 space-y-2">
                      {props.map(p => (
                        <div key={`${p.cible.type}:${p.cible.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{TYPE_CIBLE[p.cible.type]}</span> · {p.cible.libelle || 'sans libellé'} · {dateFr(p.cible.date)}
                            <span className="text-fg-muted"> ({p.ecart === 0 ? 'même jour' : `${p.ecart} j d’écart`})</span>
                          </span>
                          <Button size="sm" loading={busy === m.t.id} onClick={() => valider(m, p.cible)}
                            aria-label={`Valider le rapprochement avec ${TYPE_CIBLE[p.cible.type].toLowerCase()} ${p.cible.libelle} du ${dateFr(p.cible.date)}`}>
                            <Check className="h-4 w-4" aria-hidden /> Valider
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        {m.reste < 0 && (
                          <Button size="sm" variant={props.length ? 'ghost' : 'secondary'} onClick={() => setCreer(m)}>
                            <FilePlus2 className="h-4 w-4" aria-hidden /> Créer la dépense
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setHorsFacture(m)}>
                          {m.reste > 0 ? 'Recette hors facture' : 'Opération hors dépense'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setChoix(m)}>Choisir une pièce…</Button>
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <ImportReleve key={compte.id} compte={compte} existants={g.mouvements.filter(t => t.account_id === compte.id)}
        open={importOuvert} onOpenChange={setImportOuvert} onImporter={g.importer} />
      <SaisieMouvement open={saisie} onOpenChange={setSaisie} compte={compte.name} aujourdhui={aujourdhui}
        onSave={v => g.saisirMouvement(compte.id, v)} />
      {creer && <CreerDepense m={creer} g={g} ctx={ctx} onClose={() => setCreer(null)} />}
      {horsFacture && <HorsFacture m={horsFacture} g={g} onClose={() => setHorsFacture(null)} />}
      {choix && <ChoisirPiece m={choix} d={d} onClose={() => setChoix(null)} onValider={async c => { await valider(choix, c); setChoix(null) }} />}
    </div>
  )
}

function SaisieMouvement({ open, onOpenChange, compte, aujourdhui, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; compte: string; aujourdhui: DateISO
  onSave: (v: { date: DateISO; libelle: string; montant: number }) => Promise<boolean>
}) {
  const [sens, setSens] = useState<'entree' | 'sortie'>('entree')
  const [date, setDate] = useState(aujourdhui)
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')
  const [busy, setBusy] = useState(false)
  const c = lireMontant(montant)
  const save = async () => {
    if (!c || !libelle.trim()) return
    setBusy(true)
    const ok = await onSave({ date, libelle, montant: sens === 'entree' ? c : -c })
    setBusy(false)
    if (ok) { setLibelle(''); setMontant(''); onOpenChange(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Saisir un mouvement · ${compte}`} size="sm"
      description="Pour la caisse, ou une opération absente du relevé. Un mouvement enregistré ne se modifie plus : une erreur se corrige par un mouvement inverse."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
        <Button onClick={save} loading={busy} disabled={!c || !libelle.trim() || date > aujourdhui}>Enregistrer le mouvement</Button></>}>
      <div className="space-y-3">
        <Segmented label="Sens" value={sens} onChange={setSens} options={[{ value: 'entree', label: 'Entrée' }, { value: 'sortie', label: 'Sortie' }]} />
        <Field label="Date"><Input type="date" value={date} max={aujourdhui} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Libellé"><Input value={libelle} onChange={e => setLibelle(e.target.value)} maxLength={500} placeholder="Marché du samedi, espèces" /></Field>
        <Field label="Montant (€)" error={montant && !c ? 'Montant illisible' : undefined}><Input inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0,00" /></Field>
      </div>
    </Dialog>
  )
}

function CreerDepense({ m, g, ctx, onClose }: { m: MouvementVu; g: G; ctx: GestionCtx; onClose: () => void }) {
  const montant = -m.reste
  const [categorie, setCategorie] = useState<CostCategory>(() => categorieSuggeree(m.t.label) ?? 'autre')
  const [saison, setSaison] = useState(() => saisonPour(m.t.date, ctx) ?? '')
  const [date, setDate] = useState(m.t.date)
  const [fournisseur, setFournisseur] = useState(() => m.t.label.replace(/^(CB|PRLV( SEPA)?|VIR( SEPA)?|CARTE)\s+/i, '').replace(/\s+\d{2}\/\d{2}$/, '').slice(0, 80))
  const [notes, setNotes] = useState('')
  const recus = g.receipts.filter(r => statutJustificatif(r) === 'a_traiter')
  const [recu, setRecu] = useState(() => recus.find(r => r.montant !== null && eurosEnCentimes(r.montant) === montant)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const saisons = (ctx.seasons ?? []).filter(s => s.farm_id === g.farmId)
  const save = async () => {
    if (!saison) { toast.error('Choisissez la saison de gestion'); return }
    setBusy(true)
    const ok = await g.creerDepenseRapprochee(m.t, { season_id: saison, date, category: categorie, supplier: fournisseur, notes, receipt_id: recu || null })
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()} title="Créer la dépense" size="md"
      description={<>{m.t.label} · {dateFr(m.t.date)} · <strong className="num">{formatEuros(montant)}</strong></>}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button onClick={save} loading={busy}>Créer et rapprocher · {formatEuros(montant)}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Catégorie">
          <Select value={categorie} onChange={e => setCategorie(e.target.value as CostCategory)}>
            {COST_CATEGORIES.map(c => <option key={c} value={c}>{LIBELLES_CATEGORIES[c]}</option>)}
          </Select>
        </Field>
        <Field label="Saison de gestion">
          <Select value={saison} onChange={e => setSaison(e.target.value)}>
            {saisons.map(s => <option key={s.id} value={s.id}>{s.name ?? s.year}</option>)}
          </Select>
        </Field>
        <Field label="Date de la dépense"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Fournisseur"><Input value={fournisseur} onChange={e => setFournisseur(e.target.value)} maxLength={200} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <Field label="Justificatif à rattacher" className="sm:col-span-2" hint={recus.length ? undefined : 'Aucun justificatif à traiter. La dépense sera signalée « justificatif manquant ».'}>
          <Select value={recu} onChange={e => setRecu(e.target.value)}>
            <option value="">Aucun pour l’instant</option>
            {recus.map(r => <option key={r.id} value={r.id}>{r.fournisseur || 'Sans fournisseur'} · {dateFr(r.date_piece)} · {euros(r.montant)}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  )
}

function HorsFacture({ m, g, onClose }: { m: MouvementVu; g: G; onClose: () => void }) {
  const credit = m.reste > 0
  const options = HORS_FACTURE_CATEGORIES.filter(c => (credit ? c !== 'prelevement_personnel' : !HORS_FACTURE_RECETTES.has(c) || c === 'remboursement'))
  const [categorie, setCategorie] = useState<HorsFactureCategorie>(credit ? 'vente_hors_facture' : 'prelevement_personnel')
  const [libelle, setLibelle] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await g.rapprocher(m.t, { kind: 'hors_facture', categorie, libelle }, m.reste, 'Opération enregistrée')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={o => !o && onClose()} title={credit ? 'Recette hors facture' : 'Opération hors dépense'} size="sm"
      description={<>{m.t.label} · {dateFr(m.t.date)} · <strong className="num">{formatEuros(Math.abs(m.reste))}</strong></>}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Field label="Nature" hint={HORS_FACTURE_RECETTES.has(categorie) ? 'Comptée dans l’encaissé.' : 'Mouvement de fonds : ni recette ni dépense.'}>
          <Select value={categorie} onChange={e => setCategorie(e.target.value as HorsFactureCategorie)}>
            {options.map(c => <option key={c} value={c}>{LIBELLES_HORS_FACTURE[c]}</option>)}
          </Select>
        </Field>
        <Field label="Précision"><Input value={libelle} onChange={e => setLibelle(e.target.value)} maxLength={200} placeholder={credit ? 'Ventes du marché, aide PAC…' : 'Virement vers le livret…'} /></Field>
      </div>
    </Dialog>
  )
}

function ChoisirPiece({ m, d, onClose, onValider }: { m: MouvementVu; d: DonneesGestion; onClose: () => void; onValider: (c: Cible) => Promise<void> }) {
  const choix = useMemo(() => d.cibles
    .filter(c => !d.prises.has(`${c.type}:${c.id}`) && Math.sign(c.montant) === Math.sign(m.reste) && (c.type !== 'depense' || m.reste < 0) && (c.type !== 'vente' || m.reste > 0))
    .sort((a, b) => Math.abs(Math.abs(a.montant) - Math.abs(m.reste)) - Math.abs(Math.abs(b.montant) - Math.abs(m.reste)) || b.date.localeCompare(a.date))
    .slice(0, 80), [d.cibles, d.prises, m.reste])
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const c = choix.find(x => `${x.type}:${x.id}` === id)
  return (
    <Dialog open onOpenChange={o => !o && onClose()} title="Choisir une pièce" size="md"
      description={<>{m.t.label} · reste <strong className="num">{formatEuros(Math.abs(m.reste))}</strong>. Une pièce d’un autre montant couvre une partie du mouvement.</>}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button disabled={!c} loading={busy} onClick={async () => { if (!c) return; setBusy(true); await onValider(c); setBusy(false) }}>Rapprocher</Button></>}>
      {choix.length ? (
        <Select aria-label="Pièce" value={id} onChange={e => setId(e.target.value)}>
          <option value="">Choisir…</option>
          {choix.map(x => <option key={`${x.type}:${x.id}`} value={`${x.type}:${x.id}`}>{TYPE_CIBLE[x.type]} · {dateFr(x.date)} · {x.libelle || 'sans libellé'} · {formatEuros(Math.abs(x.montant))}</option>)}
        </Select>
      ) : <p className="text-sm text-fg-muted">Aucune pièce disponible dans ce sens.</p>}
    </Dialog>
  )
}
