import Image, { type StaticImageData } from 'next/image'
import { cn } from './cn'

/**
 * En-tête de section. Avec `image`, une vignette photo discrète s'affiche
 * à droite du titre (masquée sur téléphone pour garder la place utile).
 */
export function PageHeader({ title, description, actions, image, eyebrow, className }: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  image?: StaticImageData
  eyebrow?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-4">
        {image && (
          <div className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-2xl shadow-card ring-1 ring-border md:block">
            <Image src={image} alt="" fill sizes="64px" className="object-cover" placeholder="blur" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium text-fg-subtle">{eyebrow}</div>}
          <h1 className="text-[1.75rem] leading-tight sm:text-[2rem]">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
