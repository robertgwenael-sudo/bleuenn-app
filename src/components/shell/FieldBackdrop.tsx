'use client'
import Image, { type StaticImageData } from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { photos } from '@/lib/images'
import { NAV_GROUPS } from './nav'

/**
 * Fond de champ en transparence, derrière le contenu de chaque écran.
 * Une photo par grand espace de l'appli, traitée en pastel (désaturée,
 * éclaircie, fondue vers la couleur de fond) pour habiller sans gêner la
 * lecture : les cartes restent sur fond plein.
 */
const PAR_GROUPE: Record<string, StaticImageData> = {
  Pilotage: photos.champPavotsDores,
  Cultures: photos.champCoquelicots,
  Commercial: photos.champTournesols,
  Référentiel: photos.champCoucherSoleil,
}

function photoDe(section: string): StaticImageData {
  const groupe = NAV_GROUPS.find(g => (g.ids as string[]).includes(section))?.label
  return (groupe && PAR_GROUPE[groupe]) || photos.champCoquelicots
}

export function FieldBackdrop({ section }: { section: string }) {
  const reduce = useReducedMotion()
  const src = photoDe(section)
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={src.src}
          className="field-backdrop absolute inset-0"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Image src={src} alt="" fill sizes="100vw" quality={55} placeholder="blur" className="object-cover object-bottom" />
        </motion.div>
      </AnimatePresence>
      {/* Voile pastel : fond de l'appli en haut, photo qui affleure vers le bas */}
      <div className="field-veil absolute inset-0" />
    </div>
  )
}
