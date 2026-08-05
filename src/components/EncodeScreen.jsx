import { useEffect, useState } from 'react'
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

  const [originalBuffer, setOriginalBuffer] = useState(null)
  const [reversedBuffer, setReversedBuffer] = useState(null)
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
        setOriginalBuffer(buffer)
        setReversedBuffer(reversed)
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

  const handleRetry = () => {
    reset()
    setOriginalBuffer(null)
    setReversedBuffer(null)
    setAudioError(null)
  }

  const handleConfirm = () => {
    confirmEncoding(originalBuffer, reversedBuffer)
  }

  const anyPlaying = playingId !== null
  const hasRecording = status === 'stopped' && blob
  const isReady = hasRecording && originalBuffer && reversedBuffer

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

      {audioError && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Le son n'a pas pu être lu{audioError?.message ? ` (${audioError.message})` : ''}. Réessaie.
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

      {hasRecording && isProcessing && <p className="hint">Préparation de l'écoute…</p>}

      {isReady && (
        <>
          <PlayButton
            isPlaying={playingId === 'original'}
            disabled={anyPlaying && playingId !== 'original'}
            onPlay={() => play('original', originalBuffer)}
            label="Réécouter mon enregistrement"
          />
          <PlayButton
            isPlaying={playingId === 'reversed'}
            disabled={anyPlaying && playingId !== 'reversed'}
            onPlay={() => play('reversed', reversedBuffer)}
            label="Écouter à l'envers (ce que la personne suivante entendra)"
            variant="play"
          />
          <div className="stack">
            <button type="button" className="btn btn-primary" disabled={anyPlaying} onClick={handleConfirm}>
              Valider ce mot
            </button>
            <button type="button" className="btn btn-ghost" disabled={anyPlaying} onClick={handleRetry}>
              Recommencer l'enregistrement
            </button>
          </div>
        </>
      )}
    </div>
  )
}
