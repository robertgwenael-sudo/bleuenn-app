'use client'
import { useState } from 'react'
import type { TeamMember } from '@/lib/types'
import Modal from '@/components/Modal'

export default function TeamPanel({ ctx }: { ctx: any }) {
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const members: TeamMember[] = ctx.teamMembers || []
  const isOwner: boolean = ctx.isOwner
  const season = ctx.activeSeason

  const inviteLink = season?.invite_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${season.invite_token}`
    : ''

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

  const handleRemove = async (member: TeamMember) => {
    if (member.role === 'owner') return
    if (confirm(`Retirer ${member.email || member.owner_name || 'ce membre'} de l'équipe ?`)) {
      await ctx.removeMember(member.id)
    }
  }

  return (
    <>
      {/* Bouton dans la sidebar */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-terre hover:bg-sage-pale/50 transition text-left"
        onClick={() => setShowModal(true)}
      >
        <span className="text-base">👥</span>
        <span>Équipe ({members.length})</span>
      </button>

      <Modal open={showModal} onClose={() => setShowModal(false)}>
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

          {/* Lien d'invitation (owner only) */}
          {isOwner && (
            <div className="border-t border-lin-dark pt-4">
              <p className="text-xs font-semibold text-brun mb-2">Lien d'invitation</p>

              {!season?.invite_enabled ? (
                <div>
                  <p className="text-[0.7rem] text-terre mb-2">
                    Activez le lien de partage pour inviter des membres à rejoindre cette saison.
                  </p>
                  <button className="btn btn-sage btn-sm" onClick={handleEnableLink} disabled={loading}>
                    {loading ? '…' : 'Activer le lien de partage'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[0.7rem] text-terre">
                    Partagez ce lien — toute personne connectée à Bleuenn pourra rejoindre cette saison.
                  </p>

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
                      Générer un nouveau lien
                    </button>
                    <button className="btn btn-danger btn-sm text-[0.6rem]" onClick={handleDisableLink}>
                      Désactiver
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn btn-outline w-full" onClick={() => setShowModal(false)}>Fermer</button>
        </div>
      </Modal>
    </>
  )
}
