import { useCallback, useEffect, useState } from 'react'
import { useAudioRecorder } from './useAudioRecorder'
import { useAudioContext } from './useAudioContext'
import { decodeToBuffer, reverseBuffer, withTimeout } from '../lib/audioReverse'

// Enregistre au micro puis décode l'enregistrement en AudioBuffer, à
// l'endroit et à l'envers.
export function useRecordedBuffers({ maxDuration = 15000 } = {}) {
  const recorder = useAudioRecorder({ maxDuration })
  const { status, blob, reset: resetRecorder } = recorder
  const getAudioContext = useAudioContext()

  const [buffer, setBuffer] = useState(null)
  const [reversedBuffer, setReversedBuffer] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processError, setProcessError] = useState(null)

  useEffect(() => {
    if (status !== 'stopped' || !blob) return
    let cancelled = false
    setProcessError(null)
    setIsProcessing(true)
    ;(async () => {
      try {
        const ctx = await getAudioContext()
        const decoded = await withTimeout(
          decodeToBuffer(blob, ctx),
          10000,
          "La lecture de l'enregistrement a pris trop de temps"
        )
        const reversed = reverseBuffer(decoded, ctx)
        if (cancelled) return
        setBuffer(decoded)
        setReversedBuffer(reversed)
      } catch (err) {
        if (!cancelled) setProcessError(err)
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, blob, getAudioContext])

  const reset = useCallback(() => {
    resetRecorder()
    setBuffer(null)
    setReversedBuffer(null)
    setProcessError(null)
  }, [resetRecorder])

  return {
    ...recorder,
    buffer,
    reversedBuffer,
    isProcessing,
    processError,
    hasRecording: status === 'stopped' && Boolean(blob),
    isReady: status === 'stopped' && Boolean(buffer && reversedBuffer),
    reset,
  }
}
