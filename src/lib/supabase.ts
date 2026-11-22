import { createBrowserClient } from '@supabase/ssr'
import { createDemoClient } from '@/lib/demo/client'

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
  if (IS_DEMO) return createDemoClient() as ReturnType<typeof createSupabaseClient>
  return createSupabaseClient()
}
