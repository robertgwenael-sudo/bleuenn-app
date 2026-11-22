'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Clock, Copy, Link2, Mail, RefreshCw, UserMinus, X } from 'lucide-react'
import type { FarmMember } from '@/lib/types'
import { Dialog, Button, Input, Badge, useConfirm } from '@/components/ui'
import { initials } from '@/components/shell/UserMenu'

interface PendingInvite {
  id: string
  email: string
  created_at: string
}

/**
 * Équipe de la FERME (dialogue piloté par le shell). Depuis la migration 006,
 * on est membre d'une ferme, donc de toutes ses saisons : inviter ou retirer
 * quelqu'un vaut pour la ferme entière.
 */
export default function TeamPanel({ ctx, open, onOpenChange }: { ctx: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const confirm = useConfirm()
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  // Invitation par email
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error' | 'pending'; msg: string } | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])

  // farm_team() ; repli sur l'équipe de la saison si la ferme n'est pas chargée
  const members: FarmMember[] = ctx.farmTeam?.length ? ctx.farmTeam : (ctx.teamMembers || [])
  const isOwner: boolean = ctx.isOwner
  const season = ctx.activeSeason
  const farmName: string = ctx.farm?.name || ctx.profile?.farm_name || 'la ferme'
  const meId: string | undefined = ctx.user?.id
  const farmSeasons: string[] = (ctx.seasons || []).filter((s: any) => !season?.farm_id || s.farm_id === season.farm_id).map((s: any) => s.name)

  const inviteLink = season?.invite_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${season.invite_token}`
    : ''

  // Charger les invitations en attente quand la modale s'ouvre
  useEffect(() => {
    if (open && isOwner) {
      ctx.getPendingInvites().then((data: PendingInvite[]) => setPendingInvites(data))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isOwner, members.length])

  const close = () => { onOpenChange(false); setInviteStatus(null) }

  const handleEnableLink = async () => {
    setLoading(true)
    await ctx.enableInviteLink()
    setLoading(false)
    toast.success('Lien de partage activé')
  }

  const handleDisableLink = async () => {
    await ctx.disableInviteLink()
    toast('Lien de partage désactivé')
  }

  const handleRegenerate = async () => {
    setLoading(true)
    await ctx.regenerateInviteToken()
    setCopied(false)
    setLoading(false)
    toast.success('Nouveau lien généré', { description: 'L’ancien lien ne fonctionne plus.' })
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    toast.success('Lien copié dans le presse-papiers')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleInviteByEmail = async () => {
    if (!inviteEmail.trim()) return
    setInviteLoading(true)
    setInviteStatus(null)
    const result = await ctx.inviteByEmail(inviteEmail.trim())
    if (result?.error) {
      setInviteStatus({ type: 'error', msg: result.error })
    } else if (result?.status === 'added') {
      setInviteStatus({ type: 'success', msg: `${inviteEmail} ajouté(e) à l'équipe !` })
      toast.success(`${inviteEmail} ajouté(e) à l’équipe`)
      setInviteEmail('')
    } else if (result?.status === 'already_member') {
      setInviteStatus({ type: 'error', msg: 'Déjà membre de l\'équipe.' })
    } else if (result?.status === 'pending') {
      setInviteStatus({ type: 'pending', msg: `Invitation envoyée — ${inviteEmail} sera ajouté(e) automatiquement à son inscription.` })
      setInviteEmail('')
      ctx.getPendingInvites().then((data: PendingInvite[]) => setPendingInvites(data))
    }
    setInviteLoading(false)
  }

  const handleCancelInvite = async (invite: PendingInvite) => {
    await ctx.cancelInvite(invite.id)
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id))
    toast('Invitation annulée', { description: invite.email })
  }

  const handleRemove = async (member: FarmMember) => {
    // Un owner ne se retire jamais lui-même ; les owners ne se retirent pas d'ici
    if (member.role === 'owner' || member.user_id === meId) return
    const qui = member.email || member.owner_name || 'Ce membre'
    const ok = await confirm({
      title: `Retirer ${qui} de la ferme ?`,
      description: (
        <span className="block space-y-2">
          <span className="block"><strong className="text-fg">{qui}</strong>{member.owner_name && member.email ? ` (${member.owner_name})` : ''} perdra immédiatement l’accès à <strong className="text-fg">toute la ferme « {farmName} »</strong>, pas seulement à {season?.name || 'la saison affichée'}.</span>
          <span className="block">Cela comprend toutes les saisons{farmSeasons.length ? ` (${farmSeasons.join(', ')})` : ''}, les jardins, les planches, les plantations, les récoltes et les ventes.</span>
          <span className="block">Rien n’est supprimé : pour lui rendre l’accès, il faudra l’inviter à nouveau.</span>
        </span>
      ),
      confirmLabel: `Retirer ${member.email || 'ce membre'}`,
      destructive: true,
    })
    if (ok) {
      const done = await ctx.removeMember(member.id)
      if (done !== false) toast.success(`${qui} n’a plus accès à la ferme`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => (o ? onOpenChange(true) : close())} title="Équipe de la ferme"
      description={<>{farmName} — chaque membre a accès à toutes les saisons, jardins et planches de la ferme.</>} size="md"
      footer={<Button variant="secondary" onClick={close}>Fermer</Button>}>
      <div className="space-y-6">
        {/* Liste des membres */}
        <section>
          <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {members.length} membre{members.length > 1 ? 's' : ''}
          </h3>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {initials(m.owner_name, m.email)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg">{m.owner_name || 'Sans nom'}{m.user_id === meId && <span className="font-normal text-fg-subtle"> · vous</span>}</div>
                    <div className="truncate text-xs text-fg-muted">{m.email}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={m.role === 'owner' ? 'green' : 'neutral'}>{m.role === 'owner' ? 'Propriétaire' : 'Membre'}</Badge>
                  {isOwner && m.role !== 'owner' && m.user_id !== meId && (
                    <Button variant="danger-ghost" size="icon-sm" onClick={() => handleRemove(m)} aria-label={`Retirer ${m.email || m.owner_name || 'ce membre'} de la ferme`} title="Retirer de la ferme">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Invitation par email (owner only) */}
        {isOwner && (
          <section>
            <h3 className="mb-1 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Inviter par e-mail</h3>
            <p className="mb-2 text-xs text-fg-muted">La personne invitée rejoint la ferme entière, avec toutes ses saisons.</p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); handleInviteByEmail() }}>
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                <Input
                  className="pl-9"
                  type="email"
                  aria-label="Adresse e-mail à inviter"
                  placeholder="email@exemple.com"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteStatus(null) }}
                />
              </div>
              <Button type="submit" loading={inviteLoading} disabled={!inviteEmail.trim()}>Inviter</Button>
            </form>
            {inviteStatus && (
              <p role="status" className={`mt-2 flex items-start gap-1.5 text-xs font-medium ${
                inviteStatus.type === 'success' ? 'text-primary' :
                inviteStatus.type === 'pending' ? 'text-warning' :
                'text-danger'
              }`}>
                {inviteStatus.type === 'success' && <Check className="mt-px h-3.5 w-3.5 shrink-0" />}
                {inviteStatus.type === 'pending' && <Clock className="mt-px h-3.5 w-3.5 shrink-0" />}
                {inviteStatus.msg}
              </p>
            )}

            {/* Invitations en attente */}
            {pendingInvites.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-fg-muted">En attente d’inscription</p>
                <ul className="space-y-1">
                  {pendingInvites.map(inv => (
                    <li key={inv.id} className="flex items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-1.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                        <span className="truncate">{inv.email}</span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleCancelInvite(inv)} aria-label={`Annuler l’invitation de ${inv.email}`}>
                        <X className="h-3.5 w-3.5" />Annuler
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Lien d'invitation (owner only) */}
        {isOwner && (
          <section>
            <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Lien de partage</h3>
            {!season?.invite_enabled ? (
              <div className="rounded-xl border border-dashed border-border-strong p-4">
                <p className="mb-3 text-sm text-fg-muted">Activez le lien pour inviter par URL. Il donne accès à toute la ferme.</p>
                <Button variant="secondary" size="sm" onClick={handleEnableLink} loading={loading}>
                  <Link2 className="h-4 w-4" />Activer le lien de partage
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink} onClick={copyLink} aria-label="Lien d’invitation" className="flex-1 font-mono text-xs" />
                  <Button onClick={copyLink} aria-label="Copier le lien">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="hidden sm:inline">{copied ? 'Copié' : 'Copier'}</span>
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleRegenerate} disabled={loading}>
                    <RefreshCw className="h-3.5 w-3.5" />Nouveau lien
                  </Button>
                  <Button variant="danger-ghost" size="sm" onClick={handleDisableLink}>Désactiver</Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Dialog>
  )
}
