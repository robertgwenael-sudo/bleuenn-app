'use client'
import { useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Info } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'
import { AuthLayout } from '@/components/AuthLayout'
import { IS_DEMO } from '@/lib/supabase'

export default function AuthScreen({ signIn, signUp, resetPassword }: {
  signIn: (e: string, p: string) => Promise<any>
  signUp: (e: string, p: string) => Promise<any>
  resetPassword: (e: string) => Promise<any>
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    if (mode === 'forgot') {
      const err = await resetPassword(email)
      setLoading(false)
      if (err) setError(err.message)
      else setSuccess('Si un compte existe pour cette adresse, un lien de réinitialisation vient de partir. Ouvrez-le dans ce même navigateur.')
      return
    }
    const fn = mode === 'login' ? signIn : signUp
    const err = await fn(email, password)
    setLoading(false)
    if (err) setError(err.message)
    else if (mode === 'register') setSuccess('Compte créé ! Vérifiez vos emails.')
  }

  const switchMode = (m: typeof mode) => { setMode(m); setError(''); setSuccess('') }

  const title = mode === 'login' ? 'Bon retour parmi les fleurs' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'
  const subtitle = mode === 'login'
    ? 'Connectez-vous pour retrouver vos planches, semis et récoltes.'
    : mode === 'register'
      ? 'Planifiez votre saison florale en quelques minutes.'
      : 'Indiquez votre adresse : nous vous envoyons un lien pour choisir un nouveau mot de passe.'

  return (
    <AuthLayout>
      {mode === 'forgot' && (
        <button type="button" onClick={() => switchMode('login')}
          className="-ml-1 mb-6 inline-flex items-center gap-1.5 rounded-md px-1 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden />Retour à la connexion
        </button>
      )}
      <h1 className="text-[2rem] leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-fg-muted">{subtitle}</p>

      {IS_DEMO && mode === 'login' && (
        <div className="mt-6 flex gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>Mode démo : saisissez n’importe quelle adresse et n’importe quel mot de passe.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate={false}>
        <Field label="Adresse e-mail">
          <Input className="h-11" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="marine@ferme.fr" autoComplete="email" inputMode="email" />
        </Field>
        {mode !== 'forgot' && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <label htmlFor="auth-password" className="text-xs font-medium text-fg-muted">Mot de passe</label>
              {mode === 'login' && (
                <button type="button" className="rounded text-xs font-medium text-accent hover:underline"
                  onClick={() => switchMode('forgot')}>
                  Mot de passe oublié ?
                </button>
              )}
            </div>
            <Input id="auth-password" className="h-11" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              placeholder="6 caractères minimum" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
          </p>
        )}
        {success && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{success}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Recevoir le lien'}
        </Button>
      </form>

      {mode !== 'forgot' && (
        <p className="mt-8 text-center text-sm text-fg-muted">
          {mode === 'login' ? (
            <>Pas encore de compte ? <button type="button" className="font-semibold text-accent hover:underline" onClick={() => switchMode('register')}>S’inscrire</button></>
          ) : (
            <>Déjà inscrit ? <button type="button" className="font-semibold text-accent hover:underline" onClick={() => switchMode('login')}>Se connecter</button></>
          )}
        </p>
      )}
    </AuthLayout>
  )
}
