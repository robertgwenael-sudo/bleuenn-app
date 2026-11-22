// ============================================================
// Lecture automatique (OCR) d'un justificatif, FACULTATIVE.
// tesseract.js n'est chargé qu'au premier clic (import dynamique : jamais
// dans le paquet initial). Le moteur et les données de langue française
// viennent du CDN par défaut de tesseract.js (jsDelivr), une seule fois :
// le navigateur les garde ensuite en cache (IndexedDB pour la langue).
//
// Taille mesurée sur les fichiers publiés de tesseract.js 7.0.0 :
//   worker.min.js                       111 Ko (34 Ko compressé)
//   tesseract-core-simd-lstm.wasm.js    3,9 Mo (1,46 Mo compressé gzip)
//   fra.traineddata.gz (4.0.0_best_int) 0,71 Mo (déjà compressé)
//   → environ 2,2 Mo transférés quand le CDN compresse, 4,7 Mo sinon.
//
// Le texte lu ne sert qu'à PROPOSER date, montant et fournisseur : rien
// n'est enregistré sans confirmation.
// ============================================================

export const TAILLE_OCR = 'environ 2,2 Mo'

type Worker = { recognize: (img: Blob | string) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> }

let enCours: Promise<Worker> | null = null
let progression: ((p: { etape: string; part: number }) => void) | null = null

const ETAPES: Record<string, string> = {
  'loading tesseract core': 'Téléchargement du moteur',
  'initializing tesseract': 'Démarrage du moteur',
  'loading language traineddata': 'Téléchargement du français',
  'loading language traineddata (from cache)': 'Français (en cache)',
  'initializing api': 'Préparation',
  'recognizing text': 'Lecture du texte',
}

function worker(): Promise<Worker> {
  enCours ??= (async () => {
    const { createWorker } = await import('tesseract.js')
    const w = await createWorker('fra', 1, {
      logger: (m: { status: string; progress: number }) => progression?.({ etape: ETAPES[m.status] ?? m.status, part: m.progress }),
    })
    return w as unknown as Worker
  })().catch(e => { enCours = null; throw e })
  return enCours
}

/** Lit le texte d'une image. Lève (message clair) si le moteur ne peut pas être chargé. */
export async function lireTexte(image: Blob, onProgression?: (p: { etape: string; part: number }) => void): Promise<{ texte: string; confiance: number }> {
  progression = onProgression ?? null
  try {
    const w = await worker()
    const { data } = await w.recognize(image)
    return { texte: data.text, confiance: Math.round(data.confidence) }
  } catch (e) {
    throw new Error('La lecture automatique n’a pas pu démarrer (réseau ou navigateur). Saisissez les valeurs à la main.', { cause: e })
  } finally {
    progression = null
  }
}
