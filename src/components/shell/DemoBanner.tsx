import { FlaskConical } from 'lucide-react'
import { IS_DEMO } from '@/lib/supabase'

/** Bandeau discret affiché uniquement en mode démo. */
export function DemoBanner() {
  if (!IS_DEMO) return null
  return (
    <div role="status" className="relative z-[45] flex items-center justify-center gap-2 bg-warning-soft px-3 py-1.5 text-center text-xs font-medium text-warning">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Mode démo<span className="hidden sm:inline"> — données fictives en mémoire, rien n’est enregistré</span><span className="sm:hidden"> — données fictives</span></span>
    </div>
  )
}
