'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AuthLayout } from '@/components/AuthLayout'
import { Button, Field, Input } from '@/components/ui'
import { photos } from '@/lib/images'

const supabase = createClient()

// Cible du lien « mot de passe oublié ». Le client Supabase échange le code
// présent dans l'URL contre une session de récupération, puis on fixe le
// nouveau mot de passe avec updateUser().
export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const timeout = setTimeout(() => setExpired(true), 8000)
    return () => { listener.subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('8 caractères minimum.')
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(error.message)
    setDone(true)
    setTimeout(() => router.push('/'), 1500)
  }

  return (
    <AuthLayout image={photos.champPavotsDores} alt="Pavots dorés sous un ciel bleu"
      quote={<>Un nouveau départ,<br />comme chaque printemps.</>}>
      <h1 className="text-[2rem] leading-tight">Nouveau mot de passe</h1>
      {done ? (
        <p role="status" className="mt-6 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-3 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Mot de passe mis à jour. Redirection…
        </p>
      ) : !ready ? (
        expired ? (
          <p role="alert" className="mt-6 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Lien invalide ou expiré. Redemandez un lien depuis l’écran de connexion, et ouvrez-le dans le même navigateur.
          </p>
        ) : (
          <p role="status" className="mt-6 flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Vérification du lien…
          </p>
        )
      ) : (
        <>
          <p className="mt-2 text-sm text-fg-muted">Choisissez un mot de passe d’au moins 8 caractères.</p>
          <form onSubmit={submit} className="mt-7 space-y-5">
            <Field label="Nouveau mot de passe">
              <Input className="h-11" type="password" autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </Field>
            <Field label="Confirmer le mot de passe">
              <Input className="h-11" type="password" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </Field>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={loading}>Enregistrer</Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}
