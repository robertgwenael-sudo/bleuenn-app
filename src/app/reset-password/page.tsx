'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)' }}>
      <div className="max-w-md w-full bg-white/90 rounded-card p-10 shadow-card-lg">
        <h1 className="font-serif text-2xl text-center text-brun mb-6">Nouveau mot de passe</h1>
        {done ? (
          <p className="text-feuille text-center">Mot de passe mis à jour. Redirection…</p>
        ) : !ready ? (
          <p className="text-terre text-center text-sm">
            {expired
              ? 'Lien invalide ou expiré. Redemandez un lien depuis l’écran de connexion, et ouvrez-le dans le même navigateur.'
              : 'Vérification du lien…'}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <input className="input" type="password" placeholder="Nouveau mot de passe" autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)} required />
            <input className="input" type="password" placeholder="Confirmer" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
            {error && <p className="text-rose-deep text-sm bg-rose-pale rounded-btn px-3 py-2">{error}</p>}
            <button className="btn btn-sage w-full py-3" disabled={loading}>{loading ? '…' : 'Enregistrer'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
