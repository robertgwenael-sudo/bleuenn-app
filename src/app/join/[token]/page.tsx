'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'

const supabase = createClient()

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [status, setStatus] = useState<'loading' | 'needLogin' | 'joining' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [seasonName, setSeasonName] = useState('')

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setStatus('needLogin')
        return
      }
      // L'utilisateur est connecté, on rejoint
      setStatus('joining')
      const { data, error } = await supabase.rpc('join_season_by_token', { p_token: token })
      if (error) {
        setStatus('error')
        setMessage(error.message)
        return
      }
      if (data?.error) {
        setStatus('error')
        setMessage(data.error)
        return
      }
      setSeasonName(data.season_name || data.message || '')
      setStatus('success')
      // Rediriger vers l'app après 2s
      setTimeout(() => router.push('/'), 2000)
    }
    check()
  }, [token, router])

  return (
    <div className="flex items-center justify-center min-h-screen"
      style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #faf0f0 30%, #e9efe5 70%, #f5f0e8 100%)' }}>
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <span className="text-4xl block mb-3">&#x273F;</span>
        <h1 className="font-serif italic text-3xl mb-4" style={{ color: '#3d5a3a' }}>Bleuenn</h1>

        {status === 'loading' && (
          <p className="text-sm" style={{ color: '#8a7e6b' }}>Vérification…</p>
        )}

        {status === 'needLogin' && (
          <div>
            <p className="text-sm mb-4" style={{ color: '#8a7e6b' }}>
              Connectez-vous pour rejoindre cette saison.
            </p>
            <a
              href={`/?join=${token}`}
              className="inline-block px-6 py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #3d5a3a 0%, #5a7a56 100%)' }}
            >
              Se connecter
            </a>
          </div>
        )}

        {status === 'joining' && (
          <p className="text-sm" style={{ color: '#8a7e6b' }}>Vous rejoignez l'équipe…</p>
        )}

        {status === 'success' && (
          <div>
            <div className="text-2xl mb-2">✓</div>
            <p className="text-sm font-semibold" style={{ color: '#3d5a3a' }}>
              {seasonName ? `Bienvenue dans "${seasonName}" !` : 'Vous avez rejoint l\'équipe !'}
            </p>
            <p className="text-xs mt-2" style={{ color: '#8a7e6b' }}>Redirection…</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <p className="text-sm text-red-600 font-semibold mb-3">{message}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 rounded-xl text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #3d5a3a 0%, #5a7a56 100%)' }}
            >
              Retour à l'accueil
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
