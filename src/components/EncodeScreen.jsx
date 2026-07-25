import { useState } from 'react'
import { useGame } from '../state/GameContext'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { useAudioContext } from '../hooks/useAudioContext'
import { decodeToBuffer, reverseBuffer, playBuffer } from '../lib/audioReverse'
import { RecordButton } from './RecordButton'
import { PlayButton } from './PlayButton'

export function EncodeScreen() {
  const { encoder, confirmEncoding } = useGame()
  const { status, blob, progress, isRecording, startRecording, stopRecording, reset, error } =
    useAudioRecorder({ maxDuration: 6000 })
  const getAudioContext = useAudioContext()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const hasRecording = status === 'stopped' && blob

  const handlePlayback = async () => {
    const ctx = await getAudioContext()
    const buffer = await decodeToBuffer(blob, ctx)
    setIsPlaying(true)
    await playBuffer(buffer, ctx)
    setIsPlaying(false)
  }

  const handleConfirm = async () => {
    setIsSaving(true)
    const ctx = await getAudioContext()
    const originalBuffer = await decodeToBuffer(blob, ctx)
    const originalReversedBuffer = reverseBuffer(originalBuffer, ctx)
    confirmEncoding(originalBuffer, originalReversedBuffer)
  }

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">À toi, {encoder?.name}</h1>
        <p className="subtitle">Choisis un mot en secret et enregistre-toi en train de le dire.</p>
      </div>

      {status === 'error' && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Micro inaccessible{error?.message ? ` (${error.message})` : ''}. Vérifie les
          autorisations puis réessaie.
        </p>
      )}

      {!hasRecording && (
        <RecordButton
          isRecording={isRecording}
          progress={progress}
          disabled={status === 'requesting'}
          onStart={startRecording}
          onStop={stopRecording}
          label={isRecording ? 'Relâche quand tu as fini' : 'Appuie pour enregistrer'}
        />
      )}

      {hasRecording && (
        <>
          <PlayButton
            isPlaying={isPlaying}
            onPlay={handlePlayback}
            label="Réécouter mon enregistrement"
          />
          <div className="stack">
            <button type="button" className="btn btn-primary" disabled={isSaving} onClick={handleConfirm}>
              {isSaving ? 'Préparation…' : 'Valider ce mot'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={isSaving} onClick={reset}>
              Recommencer l'enregistrement
            </button>
          </div>
        </>
      )}
    </div>
  )
}
