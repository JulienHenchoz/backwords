import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioContext } from './useAudioContext'
import { playBuffer } from '../lib/audioReverse'

// Lecture d'un son à la fois. `getBuffer` peut être un AudioBuffer ou une
// fonction asynchrone qui le fournit (ex. téléchargement en ligne).
// Rappeler `play` avec l'id en cours arrête la lecture.
export function usePlayback() {
  const getAudioContext = useAudioContext()
  const [playingId, setPlayingId] = useState(null)
  const [error, setError] = useState(null)
  const sourceRef = useRef(null)
  const playingRef = useRef(null)
  const tokenRef = useRef(0)

  const stop = useCallback(() => {
    tokenRef.current++
    try {
      sourceRef.current?.stop()
    } catch {
      // Déjà arrêtée.
    }
    sourceRef.current = null
    playingRef.current = null
    setPlayingId(null)
  }, [])

  const play = useCallback(
    async (id, getBuffer) => {
      if (playingRef.current === id) {
        stop()
        return
      }
      stop()
      const token = ++tokenRef.current
      playingRef.current = id
      setError(null)
      setPlayingId(id)
      try {
        const ctx = await getAudioContext()
        const buffer = typeof getBuffer === 'function' ? await getBuffer(ctx) : getBuffer
        if (token !== tokenRef.current) return
        await playBuffer(buffer, ctx, {
          onSource: (source) => {
            sourceRef.current = source
          },
        })
      } catch (err) {
        if (token === tokenRef.current) setError(err)
      } finally {
        // Une autre lecture a pu démarrer entre-temps : on ne l'écrase pas.
        if (token === tokenRef.current) {
          sourceRef.current = null
          playingRef.current = null
          setPlayingId(null)
        }
      }
    },
    [getAudioContext, stop]
  )

  useEffect(() => stop, [stop])

  const clearError = useCallback(() => setError(null), [])

  return { playingId, anyPlaying: playingId !== null, play, stop, error, clearError }
}
