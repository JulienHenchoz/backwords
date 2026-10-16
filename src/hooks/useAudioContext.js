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

export function useAudioContext() {
  return useCallback(() => getRunningAudioContext(), [])
}
