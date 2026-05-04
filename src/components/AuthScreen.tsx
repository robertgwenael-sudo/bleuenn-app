'use client'
import { useState } from 'react'

export default function AuthScreen({ signIn, signUp }: {
  signIn: (e: string, p: string) => Promise<any>
  signUp: (e: string, p: string) => Promise<any>
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
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
    const fn = mode === 'login' ? signIn : signUp
    const err = await fn(email, password)
    setLoading(false)
    if (err) setError(err.message)
    else if (mode === 'register') setSuccess('Compte créé ! Vérifiez vos emails.')
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-10">
        <div className="text-center mb-8">
          <h1 className="font-serif italic text-4xl text-blush-dark">Bleuenn</h1>
          <p className="text-terre text-sm mt-1">Ferme Florale — Gestion de culture</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-brun mb-1.5">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brun mb-1.5">Mot de passe</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {success && <p className="text-green-700 text-sm">{success}</p>}

          <button className="btn btn-sage w-full" disabled={loading}>
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>

        <p className="text-center text-sm text-terre mt-4">
          {mode === 'login' ? (
            <>Pas de compte ? <button className="text-sage font-semibold underline" onClick={() => setMode('register')}>S'inscrire</button></>
          ) : (
            <>Déjà inscrit ? <button className="text-sage font-semibold underline" onClick={() => setMode('login')}>Se connecter</button></>
          )}
        </p>
      </div>
    </div>
  )
}
