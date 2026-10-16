import { useState } from 'react'
import { navigate } from '../hooks/useHashRoute'
import { useRecordedBuffers } from '../hooks/useRecordedBuffers'
import { usePlayback } from '../hooks/usePlayback'
import { RecordButton } from '../components/RecordButton'
import { PlayButton } from '../components/PlayButton'
import { AudioErrors } from '../components/AudioErrors'
import { createWord } from './api'
import { useRoomContext } from './RoomContext'
import { TopBar } from './TopBar'
import { RetentionNotice } from './RetentionNotice'

export function NewWordScreen() {
  const { room, code, reload } = useRoomContext()
  const recording = useRecordedBuffers({ maxDuration: 15000 })
  const { status, progress, isRecording, startRecording, stopRecording, error, hasRecording, isReady } =
    recording
  const { playingId, anyPlaying, play, stop, error: playError, clearError } = usePlayback()

  const [answer, setAnswer] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)

  const handleRetry = () => {
    stop()
    recording.reset()
    clearError()
  }

  const handlePublish = async (event) => {
    event.preventDefault()
    if (!answer.trim()) {
      setPublishError('Écris le mot que tu as enregistré : il servira à vérifier les réponses.')
      return
    }
    stop()
    setPublishing(true)
    setPublishError(null)
    try {
      await createWord({
        roomId: room.id,
        answer: answer.trim(),
        buffer: recording.buffer,
        reversedBuffer: recording.reversedBuffer,
      })
      reload()
      navigate(`/online/${code}`)
    } catch (err) {
      setPublishError(err.message)
      setPublishing(false)
    }
  }

  return (
    <>
      <TopBar backTo={`/online/${code}`} backLabel="Room" />
      <div className="screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <h1 className="title">Proposer un mot</h1>
          <p className="subtitle">
            Choisis un mot, enregistre-toi en train de le dire : les autres l'entendront à l'envers.
          </p>
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
            <div className="play-row">
              <PlayButton
                isPlaying={playingId === 'original'}
                disabled={anyPlaying && playingId !== 'original'}
                onPlay={() => play('original', recording.buffer)}
                label="Mon enregistrement"
              />
              <PlayButton
                isPlaying={playingId === 'reversed'}
                disabled={anyPlaying && playingId !== 'reversed'}
                onPlay={() => play('reversed', recording.reversedBuffer)}
                label="À l'envers"
                variant="play"
              />
            </div>

            <form className="stack" onSubmit={handlePublish}>
              <label className="stack field">
                <span className="field-label">Quel mot as-tu dit ? (reste secret)</span>
                <input
                  className="text-input"
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="ex. éléphant"
                  maxLength={60}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              {publishError && <p className="hint is-error">{publishError}</p>}
              <button type="submit" className="btn btn-primary" disabled={publishing}>
                {publishing ? 'Publication…' : 'Publier le mot'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={publishing}
                onClick={handleRetry}
              >
                Recommencer l'enregistrement
              </button>
            </form>

            <RetentionNotice compact />
          </>
        )}
      </div>
    </>
  )
}
