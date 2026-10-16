import { useState } from 'react'
import { useGame } from '../state/GameContext'
import { useRecordedBuffers } from '../hooks/useRecordedBuffers'
import { usePlayback } from '../hooks/usePlayback'
import { audioBufferToWavBlob, downloadBlob, slugify } from '../lib/wavExport'
import { RecordButton } from './RecordButton'
import { PlayButton } from './PlayButton'
import { AudioErrors } from './AudioErrors'

export function DecodeScreen() {
  const { decoder, currentRound, confirmDecoding } = useGame()
  const recording = useRecordedBuffers({ maxDuration: 15000 })
  const { status, progress, isRecording, startRecording, stopRecording, error, isProcessing } = recording
  const { playingId, anyPlaying, play, error: playError, clearError } = usePlayback()

  const [hasListenedOriginal, setHasListenedOriginal] = useState(false)

  const handleListenOriginal = () => {
    setHasListenedOriginal(true)
    play('original-reversed', currentRound.originalReversedBuffer)
  }

  const handleRetry = () => {
    recording.reset()
    clearError()
  }

  const handleContinue = () => {
    confirmDecoding(recording.buffer, recording.reversedBuffer)
  }

  const handleSave = () => {
    const blob = audioBufferToWavBlob(recording.reversedBuffer)
    downloadBlob(blob, `backwords-${slugify(decoder?.name ?? 'joueur')}-inverse.wav`)
  }

  const hasAttempt = recording.isReady

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">À toi, {decoder?.name}</h1>
        <p className="subtitle">Écoute le mot à l'envers, puis essaie de le reproduire.</p>
      </div>

      <AudioErrors micError={status === 'error' ? error : null} audioError={recording.processError ?? playError} />

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
            onPlay={() => play('attempt-reversed', recording.reversedBuffer)}
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
