'use client'
import { useState } from 'react'

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)',
      }}
    >
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 20%, #d4a0a033 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, #6b7f5e22 0%, transparent 50%),
            radial-gradient(ellipse at 50% 0%, #c9a96e15 0%, transparent 40%)
          `,
        }}
      />

      <div className="relative z-10 max-w-md w-full">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/80 shadow-card mb-4 border border-rose/20">
            <span className="text-3xl">&#x273F;</span>
          </div>
          <h1 className="font-serif italic text-5xl text-feuille-dark tracking-wide">Bleuenn</h1>
          <div className="floral-divider mt-3 max-w-[200px] mx-auto">
            <span className="text-or text-[0.6rem]">Ferme Florale</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-card p-10 shadow-card-lg border border-white/60">
          <h2 className="font-serif text-xl text-center text-brun mb-6">
            {mode === 'login' ? 'Bienvenue' : mode === 'register' ? 'Créer un compte' : 'Mot de passe oublié'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest mb-1.5">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="marine@ferme.fr" />
            </div>
            {mode !== 'forgot' && (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-[0.7rem] font-bold text-terre uppercase tracking-widest">Mot de passe</label>
                {mode === 'login' && (
                  <button type="button" className="text-[0.7rem] text-pivoine hover:underline"
                    onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}>
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                placeholder="6 caractères minimum" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            )}

            {error && <p className="text-rose-deep text-sm bg-rose-pale rounded-btn px-3 py-2">{error}</p>}
            {success && <p className="text-feuille text-sm bg-sage-pale rounded-btn px-3 py-2">{success}</p>}

            <button className="btn btn-sage w-full text-base py-3" disabled={loading}>
              {loading ? '...' : mode === 'login' ? 'Se connecter' : mode === 'register' ? 'Créer mon compte' : 'Recevoir le lien'}
            </button>
          </form>

          <div className="floral-divider mt-6 mb-4">
            <span className="text-or/50 text-[0.55rem]">ou</span>
          </div>

          <p className="text-center text-sm text-terre">
            {mode === 'login' ? (
              <>Pas encore de compte ? <button className="text-pivoine font-bold hover:underline" onClick={() => setMode('register')}>S&apos;inscrire</button></>
            ) : (
              <>Déjà inscrit ? <button className="text-pivoine font-bold hover:underline" onClick={() => { setMode('login'); setError(''); setSuccess('') }}>Se connecter</button></>
            )}
          </p>
        </div>

        <p className="text-center text-[0.65rem] text-terre/40 mt-6 tracking-wider">
          Gestion de ferme florale — Calendrier automatique
        </p>
      </div>
    </div>
  )
}
