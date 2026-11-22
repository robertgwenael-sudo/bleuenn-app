import { cn } from '@/components/ui/cn'

/** Monogramme Bleuenn : une fleur de bleuet stylisée. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <g transform="translate(16 16)" className="fill-primary-fg">
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <ellipse key={a} cx="0" cy="-6.4" rx="2.3" ry="4.4" transform={`rotate(${a})`} opacity={a % 90 === 0 ? 1 : 0.72} />
        ))}
        <circle r="2.6" className="fill-accent" />
      </g>
    </svg>
  )
}

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-serif text-[1.35rem] font-medium tracking-tight text-fg">Bleuenn</div>
          <div className="mt-0.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-fg-subtle">Ferme florale</div>
        </div>
      )}
    </div>
  )
}
