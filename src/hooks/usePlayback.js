import { useCallback, useState } from 'react'
import { useAudioContext } from './useAudioContext'
import { playBuffer } from '../lib/audioReverse'

// Lecture d'un son à la fois. `getBuffer` peut être un AudioBuffer ou une
// fonction asynchrone qui le fournit (ex. téléchargement en ligne).
export function usePlayback() {
  const getAudioContext = useAudioContext()
  const [playingId, setPlayingId] = useState(null)
  const [error, setError] = useState(null)

  const play = useCallback(
    async (id, getBuffer) => {
      setError(null)
      setPlayingId(id)
      try {
        const ctx = await getAudioContext()
        const buffer = typeof getBuffer === 'function' ? await getBuffer(ctx) : getBuffer
        await playBuffer(buffer, ctx)
      } catch (err) {
        setError(err)
      } finally {
        setPlayingId(null)
      }
    },
    [getAudioContext]
  )

  const clearError = useCallback(() => setError(null), [])

  return { playingId, anyPlaying: playingId !== null, play, error, clearError }
}
