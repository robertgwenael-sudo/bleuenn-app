'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Loader2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { AuthLayout } from '@/components/AuthLayout'
import { photos } from '@/lib/images'

const supabase = createClient()

const linkBtn = 'inline-flex h-12 w-full items-center justify-center rounded-btn bg-primary px-5 text-base font-medium text-primary-fg shadow-xs transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

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
    <AuthLayout image={photos.champTournesols} alt="Grand tournesol dans un champ"
      quote={<>On cultive mieux<br />à plusieurs mains.</>}>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Users className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="text-[2rem] leading-tight">Rejoindre une équipe</h1>

      {(status === 'loading' || status === 'joining') && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {status === 'loading' ? 'Vérification…' : 'Vous rejoignez l’équipe…'}
        </p>
      )}

      {status === 'needLogin' && (
        <div className="mt-4">
          <p className="mb-7 text-sm text-fg-muted">Connectez-vous pour rejoindre cette saison.</p>
          <a href={`/?join=${token}`} className={linkBtn}>Se connecter</a>
        </div>
      )}

      {status === 'success' && (
        <div role="status" className="mt-5 rounded-xl bg-primary-soft p-4 text-primary">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            {seasonName ? `Bienvenue dans « ${seasonName} » !` : 'Vous avez rejoint l’équipe !'}
          </p>
          <p className="mt-1 pl-7 text-xs">Redirection…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-5">
          <p role="alert" className="mb-7 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{message}
          </p>
          <Link href="/" className={linkBtn}>Retour à l’accueil</Link>
        </div>
      )}
    </AuthLayout>
  )
}
