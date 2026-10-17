import { useCallback } from 'react'
import { withTimeout } from '../lib/audioReverse'

let sharedContext = null

function createContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  return new AudioContextClass()
}

// Sur iOS, après un enregistrement au micro ou un appel, le contexte peut
// rester "interrupted" : resume() ne se résout alors jamais. On abandonne au
// bout de quelques instants et on repart d'un contexte neuf (les AudioBuffer
// déjà décodés restent utilisables avec n'importe quel contexte).
export async function getRunningAudioContext() {
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = createContext()
  if (sharedContext.state === 'running') return sharedContext

  try {
    await withTimeout(sharedContext.resume(), 1500, 'Contexte audio bloqué')
    if (sharedContext.state === 'running') return sharedContext
  } catch {
    // On tente un contexte neuf ci-dessous.
  }

  const stale = sharedContext
  sharedContext = createContext()
  stale.close().catch(() => {})
  await withTimeout(
    sharedContext.resume(),
    3000,
    "Impossible d'activer le son. Vérifie que le téléphone n'est pas en mode silencieux, puis réessaie."
  )
  return sharedContext
}

// Contexte pour décoder / créer des buffers : pas besoin qu'il soit actif
// (resume() hors geste utilisateur peut ne jamais aboutir sur iOS).
export function getAudioContextForDecoding() {
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = createContext()
  return sharedContext
}

// Safari 16.4+ : catégorie de la session audio iOS. Pendant l'enregistrement
// le micro impose "play-and-record", qui envoie le son vers l'écouteur du haut
// (quasi inaudible) ; on repasse en "playback" pour le haut-parleur.
function setAudioSessionType(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type
  } catch {
    // API absente ou refusée : sans conséquence ailleurs que sur iOS.
  }
}

export function prepareForRecording() {
  setAudioSessionType('play-and-record')
}

// Après un enregistrement, un contexte créé avant l'ouverture du micro peut
// rester muet sur iOS (il "joue" sans aucun son) : on le jette, le prochain
// appel en recrée un propre. Les AudioBuffer existants restent valables.
export function resetAfterRecording() {
  setAudioSessionType('playback')
  const stale = sharedContext
  sharedContext = null
  stale?.close().catch(() => {})
}

export function useAudioContext() {
  return useCallback(() => getRunningAudioContext(), [])
}
