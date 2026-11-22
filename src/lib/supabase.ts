import { createBrowserClient } from '@supabase/ssr'

/** Vrai si l'application tourne en mode démo (données fictives en mémoire). */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === '1'

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createClient(): ReturnType<typeof createSupabaseClient> {
  // Mode démo : faux client en mémoire, aucune requête vers Supabase.
  // Chargé à la demande : la condition étant connue au build, le code et les
  // données de démo ne partent pas dans le paquet de production.
  if (process.env.NEXT_PUBLIC_DEMO === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDemoClient } = require('@/lib/demo/client') as typeof import('@/lib/demo/client')
    return createDemoClient() as ReturnType<typeof createSupabaseClient>
  }
  return createSupabaseClient()
}
