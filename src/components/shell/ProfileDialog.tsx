'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export function ProfileDialog({ open, onOpenChange, ctx }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: any }) {
  const [farm, setFarm] = useState('')
  const [owner, setOwner] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) { setFarm(ctx.profile?.farm_name || ''); setOwner(ctx.profile?.owner_name || '') }
  }, [open, ctx.profile])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await ctx.updateProfile({ farm_name: farm, owner_name: owner })
    setSaving(false)
    toast.success('Profil mis à jour')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Profil de la ferme" description={ctx.profile?.email || ctx.user?.email}>
      <form id="profile-form" onSubmit={save} className="space-y-4">
        <Field label="Nom de la ferme"><Input value={farm} onChange={e => setFarm(e.target.value)} autoComplete="organization" /></Field>
        <Field label="Votre nom"><Input value={owner} onChange={e => setOwner(e.target.value)} autoComplete="name" /></Field>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="submit" loading={saving}>Enregistrer</Button>
        </div>
      </form>
    </Dialog>
  )
}
