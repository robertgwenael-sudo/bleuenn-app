import Image, { type StaticImageData } from 'next/image'
import { cn } from './cn'

export function EmptyState({ icon, image, title, description, action, className, compact }: {
  icon?: React.ReactNode
  image?: StaticImageData
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}>
      {image ? (
        <div className="relative mb-5 h-28 w-28 overflow-hidden rounded-full ring-4 ring-surface shadow-card">
          <Image src={image} alt="" fill sizes="112px" className="object-cover" placeholder="blur" />
        </div>
      ) : icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>
      ) : null}
      <p className="font-serif text-lg text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
