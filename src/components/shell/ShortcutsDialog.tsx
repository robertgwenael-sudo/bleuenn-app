'use client'
import { Dialog } from '@/components/ui/Dialog'
import { SECTIONS } from './nav'

const Key = ({ k }: { k: string }) => (
  <kbd className="min-w-[1.6rem] rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-center font-sans text-xs font-medium text-fg-muted shadow-xs">{k}</kbd>
)

function Row({ label, keys, then }: { label: string; keys: string[]; then?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-fg">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && then && <span className="text-xs text-fg-subtle">puis</span>}
            <Key k={k} />
          </span>
        ))}
      </span>
    </div>
  )
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Raccourcis clavier" size="lg"
      description="Inactifs pendant la saisie dans un champ.">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Général</h3>
          <Row label="Palette de commandes" keys={['⌘ / Ctrl', 'K']} />
          <Row label="Cette aide" keys={['?']} />
          <Row label="Replier la barre latérale" keys={['[']} />
          <h3 className="mb-1 mt-4 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Créer</h3>
          <Row label="Nouvelle récolte" keys={['N', 'R']} then />
          <Row label="Nouvelle vente" keys={['N', 'V']} then />
          <Row label="Nouveau jardin" keys={['N', 'J']} then />
          <Row label="Nouvelle culture" keys={['N', 'C']} then />
        </section>
        <section>
          <h3 className="mb-1 font-sans text-xs font-semibold uppercase tracking-wider text-fg-subtle">Aller à</h3>
          {SECTIONS.map(s => <Row key={s.id} label={s.label} keys={['G', s.key.toUpperCase()]} then />)}
        </section>
      </div>
    </Dialog>
  )
}
