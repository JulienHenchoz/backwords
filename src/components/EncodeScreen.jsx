import { useGame } from '../state/GameContext'
import { useRecordedBuffers } from '../hooks/useRecordedBuffers'
import { usePlayback } from '../hooks/usePlayback'
import { RecordButton } from './RecordButton'
import { PlayButton } from './PlayButton'
import { AudioErrors } from './AudioErrors'

export function EncodeScreen() {
  const { encoder, confirmEncoding } = useGame()
  const recording = useRecordedBuffers({ maxDuration: 15000 })
  const { status, progress, isRecording, startRecording, stopRecording, error, hasRecording, isReady } =
    recording
  const { playingId, anyPlaying, play, stop, error: playError, clearError } = usePlayback()

  const handleRetry = () => {
    stop()
    recording.reset()
    clearError()
  }

  const handleConfirm = () => {
    stop()
    confirmEncoding(recording.buffer, recording.reversedBuffer)
  }

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">À toi, {encoder?.name}</h1>
        <p className="subtitle">Choisis un mot en secret et enregistre-toi en train de le dire.</p>
      </div>

      <AudioErrors micError={status === 'error' ? error : null} audioError={recording.processError ?? playError} />

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

      {hasRecording && recording.isProcessing && <p className="hint">Préparation de l'écoute…</p>}

      {hasRecording && !recording.isProcessing && !isReady && (
        <button type="button" className="btn btn-secondary" onClick={handleRetry}>
          Recommencer l'enregistrement
        </button>
      )}

      {isReady && (
        <>
          <PlayButton
            isPlaying={playingId === 'original'}
            disabled={anyPlaying && playingId !== 'original'}
            onPlay={() => play('original', recording.buffer)}
            label="Réécouter mon enregistrement"
          />
          <PlayButton
            isPlaying={playingId === 'reversed'}
            disabled={anyPlaying && playingId !== 'reversed'}
            onPlay={() => play('reversed', recording.reversedBuffer)}
            label="Écouter à l'envers (ce que la personne suivante entendra)"
            variant="play"
          />
          <div className="stack">
            <button type="button" className="btn btn-primary" onClick={handleConfirm}>
              Valider ce mot
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleRetry}>
              Recommencer l'enregistrement
            </button>
          </div>
        </>
      )}
    </div>
  )
}
