import { useCallback } from 'react'

let sharedContext = null

export function useAudioContext() {
  const getAudioContext = useCallback(async () => {
    if (!sharedContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      sharedContext = new AudioContextClass()
    }
    if (sharedContext.state !== 'running') {
      await sharedContext.resume()
    }
    return sharedContext
  }, [])

  return getAudioContext
}
