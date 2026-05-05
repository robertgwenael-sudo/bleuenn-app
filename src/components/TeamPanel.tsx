'use client'
import { useState, useEffect } from 'react'
import type { TeamMember } from '@/lib/types'
import Modal from '@/components/Modal'

interface PendingInvite {
  id: string
  email: string
  created_at: string
}

export default function TeamPanel({ ctx }: { ctx: any }) {
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  // Invitation par email
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error' | 'pending'; msg: string } | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])

  const members: TeamMember[] = ctx.teamMembers || []
  const isOwner: boolean = ctx.isOwner
  const season = ctx.activeSeason

  const inviteLink = season?.invite_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${season.invite_token}`
    : ''

  // Charger les invitations en attente quand la modale s'ouvre
  useEffect(() => {
    if (showModal && isOwner) {
      ctx.getPendingInvites().then((data: PendingInvite[]) => setPendingInvites(data))
    }
  }, [showModal, isOwner, members.length])

  const handleEnableLink = async () => {
    setLoading(true)
    await ctx.enableInviteLink()
    setLoading(false)
  }

  const handleDisableLink = async () => {
    await ctx.disableInviteLink()
  }

  const handleRegenerate = async () => {
    setLoading(true)
    await ctx.regenerateInviteToken()
    setCopied(false)
    setLoading(false)
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
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
  }

  const handleRemove = async (member: TeamMember) => {
    if (member.role === 'owner') return
    if (confirm(`Retirer ${member.email || member.owner_name || 'ce membre'} de l'équipe ?`)) {
      await ctx.removeMember(member.id)
    }
  }

  return (
    <>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-terre hover:bg-sage-pale/50 transition text-left"
        onClick={() => setShowModal(true)}
      >
        <span className="text-base">👥</span>
        <span>Équipe ({members.length})</span>
      </button>

      <Modal open={showModal} onClose={() => { setShowModal(false); setInviteStatus(null) }}>
        <div className="space-y-5">
          <h3 className="font-serif text-xl">Équipe — {season?.name}</h3>

          {/* Liste des membres */}
          <div>
            <p className="text-xs font-semibold text-brun mb-2">{members.length} membre{members.length > 1 ? 's' : ''}</p>
            <div className="space-y-1.5">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-cream rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-sage-pale flex items-center justify-center text-xs font-bold text-sage-dark">
                      {(m.owner_name || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-brun">{m.owner_name || 'Sans nom'}</div>
                      <div className="text-[0.6rem] text-terre">{m.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-[0.5rem] ${m.role === 'owner' ? 'badge-rr' : 'badge-mp'}`}>
                      {m.role === 'owner' ? 'Propriétaire' : 'Membre'}
                    </span>
                    {isOwner && m.role !== 'owner' && (
                      <button
                        className="text-terre hover:text-red-600 text-xs"
                        onClick={() => handleRemove(m)}
                        title="Retirer de l'équipe"
                      >×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invitation par email (owner only) */}
          {isOwner && (
            <div className="border-t border-lin-dark pt-4">
              <p className="text-xs font-semibold text-brun mb-2">Inviter par email</p>
              <div className="flex gap-2">
                <input
                  className="input !py-1.5 flex-1"
                  type="email"
                  placeholder="email@exemple.com"
                  value={inviteEmail}
                  onChange={e => { setInviteEmail(e.target.value); setInviteStatus(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') handleInviteByEmail() }}
                />
                <button
                  className="btn btn-sage btn-sm whitespace-nowrap"
                  onClick={handleInviteByEmail}
                  disabled={inviteLoading || !inviteEmail.trim()}
                >
                  {inviteLoading ? '…' : 'Inviter'}
                </button>
              </div>
              {inviteStatus && (
                <p className={`text-[0.7rem] mt-1.5 font-medium ${
                  inviteStatus.type === 'success' ? 'text-sage-dark' :
                  inviteStatus.type === 'pending' ? 'text-or-dark' :
                  'text-red-600'
                }`}>
                  {inviteStatus.type === 'success' && '✓ '}{inviteStatus.type === 'pending' && '⏳ '}{inviteStatus.msg}
                </p>
              )}

              {/* Invitations en attente */}
              {pendingInvites.length > 0 && (
                <div className="mt-3">
                  <p className="text-[0.6rem] font-semibold text-terre uppercase tracking-wider mb-1.5">En attente d'inscription</p>
                  <div className="space-y-1">
                    {pendingInvites.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between bg-or-light/20 rounded-lg px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.6rem]">⏳</span>
                          <span className="text-xs text-terre">{inv.email}</span>
                        </div>
                        <button
                          className="text-terre hover:text-red-600 text-[0.6rem]"
                          onClick={() => handleCancelInvite(inv)}
                          title="Annuler l'invitation"
                        >annuler</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lien d'invitation (owner only) */}
          {isOwner && (
            <div className="border-t border-lin-dark pt-4">
              <p className="text-xs font-semibold text-brun mb-2">Lien de partage</p>

              {!season?.invite_enabled ? (
                <div>
                  <p className="text-[0.7rem] text-terre mb-2">
                    Activez le lien pour inviter par URL.
                  </p>
                  <button className="btn btn-outline btn-sm" onClick={handleEnableLink} disabled={loading}>
                    {loading ? '…' : 'Activer le lien de partage'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      className="input !text-[0.65rem] !py-1.5 flex-1"
                      readOnly
                      value={inviteLink}
                      onClick={copyLink}
                    />
                    <button className="btn btn-sage btn-sm whitespace-nowrap" onClick={copyLink}>
                      {copied ? '✓ Copié' : 'Copier'}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button className="btn btn-outline btn-sm text-[0.6rem]" onClick={handleRegenerate} disabled={loading}>
                      Nouveau lien
                    </button>
                    <button className="btn btn-danger btn-sm text-[0.6rem]" onClick={handleDisableLink}>
                      Désactiver
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn btn-outline w-full" onClick={() => { setShowModal(false); setInviteStatus(null) }}>Fermer</button>
        </div>
      </Modal>
    </>
  )
}
