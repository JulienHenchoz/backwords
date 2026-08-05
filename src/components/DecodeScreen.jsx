import { useEffect, useState } from 'react'
import { useGame } from '../state/GameContext'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useAudioContext } from '../hooks/useAudioContext'
import { decodeToBuffer, reverseBuffer, playBuffer } from '../lib/audioReverse'
import { audioBufferToWavBlob, downloadBlob } from '../lib/wavExport'
import { RecordButton } from './RecordButton'
import { PlayButton } from './PlayButton'

function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
}

export function DecodeScreen() {
  const { decoder, currentRound, confirmDecoding } = useGame()
  const getAudioContext = useAudioContext()

  const {
    status,
    blob,
    progress,
    isRecording,
    startRecording,
    stopRecording,
    reset: resetRecorder,
    error,
  } = useAudioRecorder({ maxDuration: 6000 })

  const [hasListenedOriginal, setHasListenedOriginal] = useState(false)
  const [attemptBuffer, setAttemptBuffer] = useState(null)
  const [attemptReversedBuffer, setAttemptReversedBuffer] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const [audioError, setAudioError] = useState(null)

  useEffect(() => {
    if (status !== 'stopped' || !blob) return
    let cancelled = false
    setAudioError(null)
    setIsProcessing(true)
    ;(async () => {
      try {
        const ctx = await getAudioContext()
        const buffer = await decodeToBuffer(blob, ctx)
        const reversed = reverseBuffer(buffer, ctx)
        if (cancelled) return
        setAttemptBuffer(buffer)
        setAttemptReversedBuffer(reversed)
      } catch (err) {
        if (!cancelled) setAudioError(err)
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, blob, getAudioContext])

  const play = async (id, buffer) => {
    setAudioError(null)
    try {
      const ctx = await getAudioContext()
      setPlayingId(id)
      await playBuffer(buffer, ctx)
    } catch (err) {
      setAudioError(err)
    } finally {
      setPlayingId(null)
    }
  }

  const handleListenOriginal = () => {
    setHasListenedOriginal(true)
    play('original-reversed', currentRound.originalReversedBuffer)
  }

  const handleRetry = () => {
    resetRecorder()
    setAttemptBuffer(null)
    setAttemptReversedBuffer(null)
  }

  const handleContinue = () => {
    confirmDecoding(attemptBuffer, attemptReversedBuffer)
  }

  const handleSave = () => {
    const blob = audioBufferToWavBlob(attemptReversedBuffer)
    downloadBlob(blob, `backwords-${slugify(decoder?.name ?? 'joueur')}-inverse.wav`)
  }

  const anyPlaying = playingId !== null
  const hasAttempt = status === 'stopped' && attemptReversedBuffer

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">À toi, {decoder?.name}</h1>
        <p className="subtitle">Écoute le mot à l'envers, puis essaie de le reproduire.</p>
      </div>

      {status === 'error' && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Micro inaccessible{error?.message ? ` (${error.message})` : ''}. Vérifie les
          autorisations puis réessaie.
        </p>
      )}

      {audioError && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Le son n'a pas pu être lu{audioError?.message ? ` (${audioError.message})` : ''}. Réessaie.
        </p>
      )}

      <PlayButton
        isPlaying={playingId === 'original-reversed'}
        disabled={anyPlaying && playingId !== 'original-reversed'}
        onPlay={handleListenOriginal}
        label="Écouter le mot inversé"
      />

      {!hasAttempt && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <RecordButton
            isRecording={isRecording}
            progress={progress}
            disabled={!hasListenedOriginal || anyPlaying || isProcessing}
            onStart={startRecording}
            onStop={stopRecording}
            label={
              !hasListenedOriginal
                ? "Écoute d'abord le mot inversé"
                : isRecording
                  ? 'Relâche quand tu as fini'
                  : 'Enregistre ta tentative'
            }
          />
          {isProcessing && <p className="hint">Préparation de l'écoute…</p>}
        </div>
      )}

      {hasAttempt && (
        <>
          <PlayButton
            isPlaying={playingId === 'attempt-reversed'}
            disabled={anyPlaying && playingId !== 'attempt-reversed'}
            onPlay={() => play('attempt-reversed', attemptReversedBuffer)}
            label="Écouter ma tentative inversée : c'est quoi le mot ?"
            variant="play"
          />

          <div className="stack">
            <button type="button" className="btn btn-primary" onClick={handleContinue} disabled={anyPlaying}>
              J'ai deviné, continuer
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleRetry} disabled={anyPlaying}>
              Réessayer mon enregistrement
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={anyPlaying}>
              Sauvegarder ma tentative inversée
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={anyPlaying}
              onClick={() => play('reveal', currentRound.originalBuffer)}
            >
              Révéler le mot original
            </button>
          </div>
        </>
      )}
    </div>
  )
}
