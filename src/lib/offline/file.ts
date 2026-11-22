import { classerException, classerReponse, messageErreur } from './erreurs'
import type { StockageFile } from './stockage'
import type { EntreeFile, Issue, ReponseEcriture, TableFile } from './types'

// ============================================================
// File d'attente des saisies : logique pure, stockage et envoi injectés.
// ------------------------------------------------------------
// Principe « écrire d'abord sur le téléphone » : toute saisie est posée
// dans le stockage AVANT la tentative d'envoi, et n'en sort qu'une fois
// acceptée par la base. Si l'appli est tuée en plein envoi, la saisie
// est toujours là et repart au prochain démarrage ; l'identifiant client
// garantit que ce renvoi ne fait pas de doublon.
// ============================================================

export interface OptionsFile {
  stockage: StockageFile
  /** Insère `e.ligne` dans `e.table`. Ne doit pas lever, mais c'est toléré. */
  envoyer: (e: EntreeFile) => Promise<ReponseEcriture>
  /** Horodatage ISO (injecté : testable, et le domaine ne lit pas l'horloge). */
  maintenant: () => string
  /** `navigator.onLine` en vrai ; faux = inutile d'essayer. */
  enLigne: () => boolean
}

export interface EtatFile {
  chargee: boolean
  entrees: EntreeFile[]
  enAttente: number
  rejetees: number
  synchronisation: boolean
  derniereSynchro: string | null
  persistant: boolean
  stockage: StockageFile['nom']
}

export type ResultatSaisie =
  | { issue: 'envoyee' }
  | { issue: 'en_file' }
  | { issue: 'rejet'; message: string }
  | { issue: 'echec'; message: string }

export interface BilanSynchro { envoyees: number; restantes: number; rejetees: number }

const parDate = (a: EntreeFile, b: EntreeFile) => a.creeLe.localeCompare(b.creeLe)

export class FileSaisies {
  private o: OptionsFile
  private entrees = new Map<string, EntreeFile>()
  private snap: EtatFile
  private abonnes = new Set<() => void>()
  private surEnvoiAbonnes = new Set<(tables: Set<TableFile>, n: number) => void>()
  private enCours: Promise<BilanSynchro> | null = null
  private chargement: Promise<void> | null = null

  constructor(o: OptionsFile) {
    this.o = o
    this.snap = this.calculer(false, false, null)
  }

  // ─── Observation (compatible useSyncExternalStore) ───
  etat = (): EtatFile => this.snap
  abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f) } }
  /** Appelé après tout envoi réussi d'au moins une saisie (pour recharger l'écran). */
  surEnvoi(f: (tables: Set<TableFile>, n: number) => void): () => void {
    this.surEnvoiAbonnes.add(f)
    return () => { this.surEnvoiAbonnes.delete(f) }
  }

  private calculer(chargee: boolean, sync: boolean, derniere: string | null): EtatFile {
    const entrees = Array.from(this.entrees.values()).sort(parDate)
    return {
      chargee, entrees, synchronisation: sync, derniereSynchro: derniere,
      enAttente: entrees.filter(e => e.etat === 'en_attente').length,
      rejetees: entrees.filter(e => e.etat === 'rejetee').length,
      persistant: this.o.stockage.persistant, stockage: this.o.stockage.nom,
    }
  }
  private publier(p: Partial<Pick<EtatFile, 'chargee' | 'synchronisation' | 'derniereSynchro'>> = {}) {
    this.snap = this.calculer(p.chargee ?? this.snap.chargee, p.synchronisation ?? this.snap.synchronisation,
      p.derniereSynchro !== undefined ? p.derniereSynchro : this.snap.derniereSynchro)
    this.abonnes.forEach(f => f())
  }

  /** Relit le stockage (idempotent). */
  charger(): Promise<void> {
    return (this.chargement ??= (async () => {
      try {
        for (const e of await this.o.stockage.tout()) this.entrees.set(e.id, e)
      } catch (e) {
        console.error('[hors ligne] lecture de la file impossible', e)
      }
      this.publier({ chargee: true })
    })())
  }

  private async poser(e: EntreeFile) {
    await this.o.stockage.mettre(e)
    this.entrees.set(e.id, e)
    this.publier()
  }
  private async oter(id: string) {
    await this.o.stockage.retirer(id)
    this.entrees.delete(id)
    this.publier()
  }

  private async tenter(e: EntreeFile): Promise<{ issue: Issue; message?: string }> {
    try {
      const r = await this.o.envoyer(e)
      const issue = classerReponse(r)
      return { issue, message: issue === 'envoyee' || issue === 'deja_envoyee' ? undefined : messageErreur(r) }
    } catch (err) {
      return { issue: classerException(err), message: messageErreur(err) }
    }
  }

  /**
   * Enregistre une saisie : posée sur le téléphone, puis envoyée si le
   * réseau est là. Un rejet immédiat (droits, validation) est rendu à
   * l'appelant, qui l'affiche dans le formulaire ; la saisie n'est pas
   * gardée, puisque la personne a encore le formulaire sous les yeux.
   */
  async enregistrer(table: TableFile, ligne: EntreeFile['ligne'], userId: string | null): Promise<ResultatSaisie> {
    await this.charger()
    const e: EntreeFile = { id: ligne.id, table, ligne, etat: 'en_attente', creeLe: this.o.maintenant(), userId, tentatives: 0 }
    let posee = true
    try {
      await this.poser(e)
    } catch (err) {
      posee = false
      console.error('[hors ligne] impossible d’écrire la saisie sur le téléphone', err)
    }

    if (!this.o.enLigne()) {
      return posee ? { issue: 'en_file' } : { issue: 'echec', message: 'Hors ligne, et le téléphone refuse de stocker la saisie (espace plein ?).' }
    }

    const t = await this.tenter(e)
    if (t.issue === 'envoyee' || t.issue === 'deja_envoyee') {
      if (posee) await this.oter(e.id).catch(err => console.error('[hors ligne] retrait de la file', err))
      return { issue: 'envoyee' }
    }
    if (t.issue === 'rejet') {
      if (posee) await this.oter(e.id).catch(err => console.error('[hors ligne] retrait de la file', err))
      return { issue: 'rejet', message: t.message ?? 'Refusée par la base' }
    }
    // Réseau : la saisie reste en file.
    if (!posee) return { issue: 'echec', message: `Envoi impossible (${t.message}) et le téléphone refuse de stocker la saisie.` }
    await this.poser({ ...e, tentatives: 1, derniereTentative: this.o.maintenant(), erreur: t.message })
      .catch(err => console.error('[hors ligne] mise à jour de la file', err))
    return { issue: 'en_file' }
  }

  /**
   * Envoie les saisies en attente du compte `userId`, dans l'ordre de
   * saisie. S'arrête à la première erreur réseau (inutile d'insister).
   * Un seul passage à la fois : un appel concurrent attend le même.
   */
  synchroniser(userId: string | null): Promise<BilanSynchro> {
    if (this.enCours) return this.enCours
    this.enCours = (async () => {
      await this.charger()
      let envoyees = 0
      const tables = new Set<TableFile>()
      const aEnvoyer = Array.from(this.entrees.values())
        .filter(e => e.etat === 'en_attente' && (e.userId === userId || e.userId === null))
        .sort(parDate)
      if (aEnvoyer.length && this.o.enLigne()) {
        this.publier({ synchronisation: true })
        for (const e of aEnvoyer) {
          const t = await this.tenter(e)
          if (t.issue === 'envoyee' || t.issue === 'deja_envoyee') {
            await this.oter(e.id).catch(err => console.error('[hors ligne] retrait de la file', err))
            envoyees++
            tables.add(e.table)
            continue
          }
          const maj: EntreeFile = { ...e, tentatives: e.tentatives + 1, derniereTentative: this.o.maintenant(), erreur: t.message }
          if (t.issue === 'rejet') maj.etat = 'rejetee'
          await this.poser(maj).catch(err => console.error('[hors ligne] mise à jour de la file', err))
          if (t.issue === 'reseau') break
        }
      }
      const fin = this.calculer(true, false, envoyees > 0 ? this.o.maintenant() : this.snap.derniereSynchro)
      this.snap = fin
      this.abonnes.forEach(f => f())
      if (tables.size) this.surEnvoiAbonnes.forEach(f => f(tables, envoyees))
      return { envoyees, restantes: fin.enAttente, rejetees: fin.rejetees }
    })().finally(() => { this.enCours = null })
    return this.enCours
  }

  /** Suppression explicite d'une saisie (bouton « Supprimer »). */
  async supprimer(id: string): Promise<void> {
    await this.oter(id)
  }

  /** Remet une saisie rejetée en attente (après correction des droits, par exemple). */
  async reessayer(id: string, userId: string | null): Promise<BilanSynchro> {
    const e = this.entrees.get(id)
    if (e && e.etat === 'rejetee') await this.poser({ ...e, etat: 'en_attente', userId: e.userId ?? userId })
    return this.synchroniser(userId)
  }
}
