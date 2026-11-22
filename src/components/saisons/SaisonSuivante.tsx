'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight, CalendarPlus, Check, Repeat2 } from 'lucide-react'
import type { PlantingFull, Season } from '@/lib/types'
import {
  LIBELLES_RAISON_LAISSEE, apercuReprise, formatDateLongue, formatJourMois, plantationsARattacher, saisonDeLAnnee,
  type RaisonLaissee, type ResultatReprise,
} from '@/lib/domain'
import { Button, Card, Dialog, cn } from '@/components/ui'
import { versPreparation } from './preparation'

// ============================================================
// Passer à la saison suivante (migration 016)
// ============================================================
//  * « Passer cette saison en 2027 » : la saison-plan devient l'année
//    suivante (RPC basculer_saison) : aperçu, puis confirmation.
//  * « Préparer 2027 » : créer la saison 2027, y rattacher les plantations
//    dont la première récolte tombe en 2027, puis, en option, reprendre le
//    plan (RPC reclasser_plantations et reprendre_plan_dans_saison).
// ============================================================

interface LigneBascule {
  planting_id: string
  culture_name: string
  planche_name?: string | null
  garden_name?: string | null
  date_semis: string
  nouvelle_date_semis?: string
  date_recolte: string | null
  raison?: RaisonLaissee
}
interface ApercuBasculeRpc {
  saison: { ancien_nom: string; nouveau_nom: string; annee: number; date_debut: string; date_fin: string }
  decalees: LigneBascule[]
  laissees: LigneBascule[]
}

function Etape({ n, titre, fait, children }: { n: number; titre: string; fait?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={`Étape ${n} : ${titre}`}>
      <Card className="p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem]', fait ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-fg-muted')}>
            {fait ? <Check className="h-3 w-3" aria-hidden /> : n}
          </span>{titre}
        </h3>
        {children}
      </Card>
    </section>
  )
}

const lieu = (l: { garden_name?: string | null; planche_name?: string | null }) => [l.garden_name, l.planche_name].filter(Boolean).join(' · ')

export function BasculerSaisonDialog({ ctx, open, onOpenChange }: { ctx: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const active: Season | null = ctx.activeSeason
  const annee = (active?.year ?? 0) + 1
  const dejaPrise = active ? saisonDeLAnnee(ctx.seasons || [], annee, active.farm_id) : null
  const [apercu, setApercu] = useState<ApercuBasculeRpc | null>(null)
  const [chargement, setChargement] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!open || !active || dejaPrise) return
    let annule = false
    // Aperçu calculé par la base elle-même (p_appliquer = false) : l'écran montre ce qu'elle fera.
    Promise.resolve().then(() => { if (!annule) setChargement(true) })
      .then(() => ctx.basculerSaison(active.id, annee, false))
      .then((r: ApercuBasculeRpc | null) => { if (!annule) { setApercu(r); setChargement(false) } })
    return () => { annule = true }
  }, [open, active?.id, annee, dejaPrise]) // eslint-disable-line react-hooks/exhaustive-deps

  const idsDecales = new Set((apercu?.decalees ?? []).map(l => l.planting_id))
  const recoltesTouchees = (ctx.harvests || []).filter((h: any) => idsDecales.has(h.planting_id)).length

  const confirmer = async () => {
    if (!active) return
    setEnvoi(true)
    const r = await ctx.basculerSaison(active.id, annee, true)
    setEnvoi(false)
    if (r) {
      toast.success(`La saison est maintenant ${annee}`, { description: `${r.decalees.length} plantations décalées d’un an, ${r.laissees.length} laissées en place.` })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={`Passer cette saison en ${annee}`}
      description={active ? `« ${active.name} » devient « ${annee} », du 1er janvier au 31 décembre ${annee}. Ventes, commandes, récoltes et bons de commande ne sont pas modifiés.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={confirmer} loading={envoi} disabled={!apercu || !!dejaPrise}>
            <Repeat2 className="h-4 w-4" />Passer en {annee}
          </Button>
        </>
      }>
      {dejaPrise ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          La saison {annee} existe déjà (« {dejaPrise.name} ») : utilisez plutôt « Préparer {annee} ».
        </p>
      ) : chargement || !apercu ? (
        <p className="text-sm text-fg-muted" aria-busy="true">Calcul de l’aperçu…</p>
      ) : (
        <div className="space-y-4">
          {recoltesTouchees > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {recoltesTouchees} récolte{recoltesTouchees > 1 ? 's' : ''} déjà saisie{recoltesTouchees > 1 ? 's' : ''} sur des plantations qui seront décalées : elles gardent leur date. Si cette saison a un historique à garder, préférez « Préparer {annee} ».
            </p>
          )}
          <section aria-label={`Plantations décalées en ${annee}`}>
            <h3 className="mb-1.5 text-sm font-semibold text-fg">Décalées d’un an ({apercu.decalees.length})</h3>
            <p className="mb-2 text-xs text-fg-muted">Première récolte avant {annee} : la date de semis avance d’un an, les autres dates suivent.</p>
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border text-xs">
              {apercu.decalees.map(l => (
                <li key={l.planting_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
                  <span className="font-medium text-fg">{l.culture_name}</span>
                  <span className="text-fg-muted">{lieu(l)}</span>
                  <span className="num ml-auto text-fg-muted">semis {formatJourMois(l.date_semis, annee)} <ArrowRight className="inline h-3 w-3" aria-label="devient" /> {l.nouvelle_date_semis ? formatJourMois(l.nouvelle_date_semis, annee) : ''}</span>
                </li>
              ))}
              {apercu.decalees.length === 0 && <li className="px-3 py-2 text-fg-muted">Aucune.</li>}
            </ul>
          </section>
          <section aria-label="Plantations laissées en place">
            <h3 className="mb-1.5 text-sm font-semibold text-fg">Laissées en place ({apercu.laissees.length})</h3>
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border text-xs">
              {apercu.laissees.map(l => (
                <li key={l.planting_id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
                  <span className="font-medium text-fg">{l.culture_name}</span>
                  <span className="text-fg-muted">{lieu(l)}</span>
                  <span className="ml-auto text-fg-muted">{l.raison ? LIBELLES_RAISON_LAISSEE[l.raison] : ''}{l.date_recolte ? `, récolte ${formatJourMois(l.date_recolte, annee)}` : ''}</span>
                </li>
              ))}
              {apercu.laissees.length === 0 && <li className="px-3 py-2 text-fg-muted">Aucune.</li>}
            </ul>
          </section>
        </div>
      )}
    </Dialog>
  )
}

export function PreparerSaisonDialog({ ctx, open, onOpenChange }: { ctx: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const active: Season | null = ctx.activeSeason
  const annee = (active?.year ?? 0) + 1
  const cible = active ? (ctx.seasons || []).find((s: Season) => s.year === annee && s.farm_id === active.farm_id) as Season | undefined : undefined
  const farmPlantings: PlantingFull[] = ctx.farmPlantings || []
  const [decoches, setDecoches] = useState<Set<string>>(new Set())
  const [enCours, setEnCours] = useState<'' | 'creer' | 'rattacher' | 'reprendre'>('')
  const [faits, setFaits] = useState<{ rattachees?: number; reprise?: ResultatReprise }>({})

  const preparees = useMemo(() => farmPlantings.map(p => versPreparation(p, ctx.catalog)), [farmPlantings, ctx.catalog])
  const aRattacher = active ? plantationsARattacher(preparees, active.id, annee) : []
  const choisies = aRattacher.filter(p => !decoches.has(p.id))
  const reprise = active && cible ? apercuReprise({
    source: preparees.filter(p => p.season_id === active.id && !choisies.some(c => c.id === p.id)),
    cible: preparees.filter(p => p.season_id === cible.id || choisies.some(c => c.id === p.id)),
    anneeSource: active.year,
  }) : null

  const creer = async () => { setEnCours('creer'); await ctx.creerSaisonCivile(annee); setEnCours('') }
  const rattacher = async () => {
    if (!active || !cible) return
    setEnCours('rattacher')
    const n = await ctx.reclasserPlantations(active.id, cible.id, choisies.map(p => p.id))
    setEnCours('')
    if (n !== null) { setFaits(f => ({ ...f, rattachees: n })); toast.success(`${n} plantation${n > 1 ? 's' : ''} rattachée${n > 1 ? 's' : ''} à ${cible.name}`) }
  }
  const reprendre = async () => {
    if (!active || !cible) return
    setEnCours('reprendre')
    const r = await ctx.reprendrePlan(active.id, cible.id, 1)
    setEnCours('')
    if (r) { setFaits(f => ({ ...f, reprise: r })); toast.success(`${r.copiees} plantation${r.copiees > 1 ? 's' : ''} reprise${r.copiees > 1 ? 's' : ''} dans ${cible.name}`) }
  }
  const ouvrir = async () => { if (cible) { await ctx.switchSeason(cible.id); onOpenChange(false) } }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title={`Préparer ${annee}`}
      description={`Une saison est une année civile. La saison ${active?.name ?? ''} garde son historique ; ${annee} reçoit ce qui fleurit en ${annee}.`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={ouvrir} disabled={!cible}><CalendarPlus className="h-4 w-4" />Ouvrir {annee}</Button>
        </>
      }>
      <div className="space-y-3">
        <Etape n={1} titre={`Créer la saison ${annee}`} fait={!!cible}>
          {cible ? <p className="text-sm text-fg-muted">La saison « {cible.name} » existe, du 1er janvier au 31 décembre {annee}.</p> : (
            <Button onClick={creer} loading={enCours === 'creer'}><CalendarPlus className="h-4 w-4" />Créer la saison {annee}</Button>
          )}
        </Etape>

        <Etape n={2} titre={`Rattacher à ${annee} ce qui y fleurit`} fait={faits.rattachees !== undefined}>
          {faits.rattachees !== undefined ? <p className="text-sm text-fg-muted">{faits.rattachees} plantation{faits.rattachees > 1 ? 's' : ''} rattachée{faits.rattachees > 1 ? 's' : ''}.</p>
            : aRattacher.length === 0 ? <p className="text-sm text-fg-muted">Aucune plantation de {active?.name} n’a sa première récolte en {annee}.</p> : (
              <>
                <p className="mb-2 text-xs text-fg-muted">Plantations de {active?.name} dont la première récolte tombe en {annee} (bulbes de novembre, semis d’hiver…). Décochez celles à garder.</p>
                <ul className="mb-3 max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border text-xs" aria-label={`Plantations à rattacher à ${annee}`}>
                  {aRattacher.map(p => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!decoches.has(p.id)}
                          onChange={e => setDecoches(prev => { const n = new Set(prev); if (e.target.checked) n.delete(p.id); else n.add(p.id); return n })}
                          aria-label={`Rattacher ${p.culture_name} (${lieu(p)}) à ${annee}`} />
                        <span className="font-medium text-fg">{p.culture_name}</span>
                        <span className="text-fg-muted">{lieu(p)}</span>
                        <span className="num ml-auto text-fg-muted">semis {formatJourMois(p.date_semis, annee)}, 1re récolte {p.date_recolte ? formatDateLongue(p.date_recolte) : ''}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button onClick={rattacher} loading={enCours === 'rattacher'} disabled={!cible || choisies.length === 0}>
                  Rattacher {choisies.length} plantation{choisies.length > 1 ? 's' : ''} à {annee}
                </Button>
                {!cible && <p className="mt-1 text-xs text-fg-muted">Créez d’abord la saison {annee}.</p>}
              </>
            )}
        </Etape>

        <Etape n={3} titre={`En option : reprendre le plan de ${active?.name ?? ''}`} fait={!!faits.reprise}>
          {faits.reprise ? (
            <p className="text-sm text-fg-muted">{faits.reprise.copiees} plantation{faits.reprise.copiees > 1 ? 's' : ''} reprise{faits.reprise.copiees > 1 ? 's' : ''}, dates décalées d’un an.</p>
          ) : !reprise ? <p className="text-sm text-fg-muted">Créez d’abord la saison {annee}.</p> : (
            <>
              <p className="mb-2 text-xs text-fg-muted">
                {reprise.copies.length} plantation{reprise.copies.length > 1 ? 's' : ''} reprise{reprise.copies.length > 1 ? 's' : ''}, semis décalés d’un an.
                Non reprises : {reprise.vivacesEnPlace.length} vivace{reprise.vivacesEnPlace.length > 1 ? 's' : ''} en place (elles refleurissent sans replantation),
                {' '}{reprise.dejaPrevues.length} déjà prévue{reprise.dejaPrevues.length > 1 ? 's' : ''} en {annee},
                {' '}{reprise.horsAnnee.length} dont la première récolte n’est pas en {active?.year}.
              </p>
              <Button variant="secondary" onClick={reprendre} loading={enCours === 'reprendre'} disabled={reprise.copies.length === 0}>
                Reprendre {reprise.copies.length} plantation{reprise.copies.length > 1 ? 's' : ''}
              </Button>
            </>
          )}
        </Etape>
      </div>
    </Dialog>
  )
}

/**
 * Invitation à préparer l'année suivante, sur l'accueil : pour un owner, à
 * partir du 1er octobre de l'année de la saison active, tant que l'année
 * suivante n'existe pas dans la ferme.
 */
export function CarteSaisonSuivante({ ctx }: { ctx: any }) {
  const [dialogue, setDialogue] = useState<'' | 'basculer' | 'preparer'>('')
  const active: Season | null = ctx.activeSeason
  const today: string = ctx.today || ''
  if (!active || !ctx.isOwner || !today) return null
  const annee = active.year + 1
  const visible = today >= `${active.year}-10-01` && !saisonDeLAnnee(ctx.seasons || [], annee, active.farm_id)
  // Une fois 2027 créée, la carte disparaît, mais un dialogue ouvert reste monté.
  if (!visible && !dialogue) return null
  return (
    <section aria-label={`Préparer la saison ${annee}`}>
      {visible && <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-fg">Préparer {annee}</h2>
          <p className="text-sm text-fg-muted">
            Une saison est une année civile. Si « {active.name} » est votre plan pour {annee}, passez-la en {annee} ; si elle a un historique à garder, créez {annee} à côté.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => setDialogue('basculer')}><Repeat2 className="h-4 w-4" />Passer en {annee}</Button>
          <Button variant="secondary" onClick={() => setDialogue('preparer')}><CalendarPlus className="h-4 w-4" />Créer {annee}</Button>
        </div>
      </Card>}
      <BasculerSaisonDialog ctx={ctx} open={dialogue === 'basculer'} onOpenChange={o => setDialogue(o ? 'basculer' : '')} />
      <PreparerSaisonDialog ctx={ctx} open={dialogue === 'preparer'} onOpenChange={o => setDialogue(o ? 'preparer' : '')} />
    </section>
  )
}
