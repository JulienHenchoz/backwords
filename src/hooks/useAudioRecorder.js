import { useCallback, useEffect, useRef, useState } from 'react'
import { prepareForRecording, resetAfterRecording } from './useAudioContext'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', '']

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of MIME_CANDIDATES) {
    if (type === '' || MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function useAudioRecorder({ maxDuration = 15000 } = {}) {
  const [status, setStatus] = useState('idle') // idle | requesting | recording | stopped | error
  const [error, setError] = useState(null)
  const [blob, setBlob] = useState(null)
  const [progress, setProgress] = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const maxDurationTimeoutRef = useRef(null)
  const startTimeRef = useRef(0)

  const stopRecording = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current)
      maxDurationTimeoutRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    setBlob(null)
    setProgress(0)
    setStatus('requesting')
    try {
      prepareForRecording()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
        setStatus('stopped')
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        resetAfterRecording()
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      startTimeRef.current = performance.now()
      setStatus('recording')

      // setTimeout keeps firing in a backgrounded tab, unlike rAF, so the
      // hard cutoff is reliable even if the screen isn't in the foreground.
      maxDurationTimeoutRef.current = setTimeout(stopRecording, maxDuration)

      const tick = () => {
        const elapsed = performance.now() - startTimeRef.current
        setProgress(Math.min(1, elapsed / maxDuration))
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      resetAfterRecording()
      setError(err)
      setStatus('error')
    }
  }, [maxDuration, stopRecording])

  const reset = useCallback(() => {
    setBlob(null)
    setError(null)
    setProgress(0)
    setStatus('idle')
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    }
  }, [])

  return {
    status,
    error,
    blob,
    progress,
    isRecording: status === 'recording',
    startRecording,
    stopRecording,
    reset,
  }
}
