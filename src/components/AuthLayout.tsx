import Image, { type StaticImageData } from 'next/image'
import { Logo } from '@/components/shell/Logo'
import { photos } from '@/lib/images'
import { DemoBanner } from '@/components/shell/DemoBanner'

/**
 * Mise en page des écrans hors application (connexion, nouveau mot de passe,
 * invitation) : grande photo à gauche, formulaire à droite. Sur téléphone,
 * la photo devient un bandeau au-dessus du formulaire.
 */
export function AuthLayout({ children, image = photos.champCoquelicots, alt = 'Champ de coquelicots sous un ciel bleu', quote }: {
  children: React.ReactNode
  image?: StaticImageData
  alt?: string
  quote?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative h-48 overflow-hidden sm:h-64 lg:h-auto">
          <Image src={image} alt={alt} fill priority sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-[50%_70%]" placeholder="blur" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 hidden p-10 text-white lg:block xl:p-14">
            <p className="max-w-md font-serif text-[2rem] leading-snug [text-shadow:0_1px_12px_rgb(0_0_0/0.35)]">
              {quote || <>Du semis au bouquet,<br />toute votre ferme florale au même endroit.</>}
            </p>
            <p className="mt-4 text-sm text-white/85">Planches, calendrier de culture, récoltes et ventes — calculés automatiquement.</p>
          </div>
        </div>
        <div className="flex flex-col bg-background px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
          <Logo />
          <div className="flex flex-1 items-center">
            <div className="mx-auto w-full max-w-sm py-10">{children}</div>
          </div>
          <p className="text-center text-xs text-fg-subtle">© Bleuenn — gestion de ferme florale</p>
        </div>
      </div>
    </div>
  )
}
