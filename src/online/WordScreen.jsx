import { useEffect, useRef, useState } from 'react'
import { useRecordedBuffers } from '../hooks/useRecordedBuffers'
import { usePlayback } from '../hooks/usePlayback'
import { useAudioContext } from '../hooks/useAudioContext'
import { RecordButton } from '../components/RecordButton'
import { PlayButton } from '../components/PlayButton'
import { AudioErrors } from '../components/AudioErrors'
import { audioBufferToWavBlob, downloadBlob, slugify } from '../lib/wavExport'
import { getAnswer, giveUp, isAudioAvailable, shareAttempt, submitGuess, wordAudioPath } from './api'
import { getRemoteBlob, getRemoteBuffer } from './remoteAudio'
import { formatExpiry, formatRelative } from './format'
import { memberName } from './useRoom'
import { useRoomContext } from './RoomContext'
import { isResolved, myWordStatus } from './wordStatus'
import { TopBar } from './TopBar'
import { RetentionNotice } from './RetentionNotice'

function remote(path, version, options) {
  return (ctx) => getRemoteBuffer(path, version, ctx, options)
}

function GuessForm({ word, onResolved, reload }) {
  const [guess, setGuess] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [confirmGiveUp, setConfirmGiveUp] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!guess.trim()) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await submitGuess(word.id, guess)
      if (result.correct) {
        onResolved(result)
      } else {
        setFeedback({ type: 'wrong', text: `Raté ! Essaie encore (${result.guesses} essai${result.guesses > 1 ? 's' : ''}).` })
        setGuess('')
      }
      reload()
    } catch (err) {
      setFeedback({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const handleGiveUp = async () => {
    if (!confirmGiveUp) {
      setConfirmGiveUp(true)
      timeoutRef.current = setTimeout(() => setConfirmGiveUp(false), 3000)
      return
    }
    clearTimeout(timeoutRef.current)
    setBusy(true)
    try {
      const result = await giveUp(word.id)
      onResolved(result)
      reload()
    } catch (err) {
      setFeedback({ type: 'error', text: err.message })
      setBusy(false)
    }
  }

  return (
    <form className="stack panel" onSubmit={handleSubmit}>
      <h2 className="section-title">Ta réponse</h2>
      <div className="player-form">
        <input
          className="text-input"
          type="text"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="C'est quoi le mot ?"
          maxLength={60}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={busy}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0 var(--space-4)' }}
          disabled={busy || !guess.trim()}
        >
          Valider
        </button>
      </div>
      {feedback && <p className={`hint${feedback.type === 'error' ? ' is-error' : ' is-wrong'}`}>{feedback.text}</p>}
      <p className="hint">Les accents, majuscules et espaces ne comptent pas.</p>
      <button
        type="button"
        className={`btn btn-ghost btn-small${confirmGiveUp ? ' is-danger' : ''}`}
        onClick={handleGiveUp}
        disabled={busy}
      >
        {confirmGiveUp ? 'Confirmer : voir la réponse ?' : 'Je donne ma langue au chat'}
      </button>
    </form>
  )
}

function AttemptRecorder({ word, user, playback, onShared }) {
  const recording = useRecordedBuffers({ maxDuration: 15000 })
  const { status, progress, isRecording, startRecording, stopRecording, error, isProcessing, isReady } =
    recording
  const { playingId, anyPlaying, play } = playback
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState(false)
  const [shareError, setShareError] = useState(null)

  const handleRetry = () => {
    recording.reset()
    setShared(false)
    setShareError(null)
  }

  const handleShare = async () => {
    setSharing(true)
    setShareError(null)
    try {
      await shareAttempt({ word, userId: user.id, buffer: recording.buffer })
      setShared(true)
      onShared()
    } catch (err) {
      setShareError(err.message)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="stack panel">
      <h2 className="section-title">Imite-le</h2>
      <p className="hint">
        Répète ce que tu entends, puis écoute ta tentative à l'envers : le vrai mot devrait apparaître !
      </p>
      <AudioErrors micError={status === 'error' ? error : null} audioError={recording.processError} />

      {!isReady && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <RecordButton
            isRecording={isRecording}
            progress={progress}
            disabled={anyPlaying || isProcessing || status === 'requesting'}
            onStart={startRecording}
            onStop={stopRecording}
            label={isRecording ? 'Relâche quand tu as fini' : 'Enregistre ta tentative'}
          />
          {isProcessing && <p className="hint">Préparation de l'écoute…</p>}
        </div>
      )}

      {isReady && (
        <>
          <PlayButton
            isPlaying={playingId === 'my-attempt'}
            disabled={anyPlaying && playingId !== 'my-attempt'}
            onPlay={() => play('my-attempt', recording.reversedBuffer)}
            label="Écouter ma tentative à l'envers"
            variant="play"
          />
          {shareError && <p className="hint is-error">{shareError}</p>}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={anyPlaying || sharing || shared}
            onClick={handleShare}
          >
            {shared ? 'Tentative partagée ✓' : sharing ? 'Envoi…' : 'Partager ma tentative avec la room'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={anyPlaying}
            onClick={() =>
              downloadBlob(audioBufferToWavBlob(recording.reversedBuffer), 'backwords-ma-tentative-inverse.wav')
            }
          >
            Sauvegarder ma tentative inversée
          </button>
          <button type="button" className="btn btn-ghost" disabled={anyPlaying} onClick={handleRetry}>
            Réessayer
          </button>
        </>
      )}
    </div>
  )
}

function SmallPlay({ id, playback, getBuffer, children }) {
  const { playingId, anyPlaying, play } = playback
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-small${playingId === id ? ' is-playing' : ''}`}
      disabled={anyPlaying && playingId !== id}
      onClick={() => play(id, getBuffer)}
    >
      {playingId === id ? '♪ …' : `▶ ${children}`}
    </button>
  )
}

function AttemptsList({ attempts, playback, audioAvailable, onError }) {
  const { membersById, user } = useRoomContext()
  const getAudioContext = useAudioContext()

  if (attempts.length === 0) {
    return <p className="hint">Personne n'a encore partagé de tentative.</p>
  }

  const save = async (attempt, name) => {
    try {
      const ctx = await getAudioContext()
      const buffer = await getRemoteBuffer(attempt.audio_path, attempt.created_at, ctx, { reversed: true })
      downloadBlob(audioBufferToWavBlob(buffer), `backwords-tentative-${slugify(name)}-inverse.wav`)
    } catch (err) {
      onError(err)
    }
  }

  return (
    <ul className="card-list">
      {attempts.map((attempt) => {
        const name = attempt.user_id === user.id ? 'Toi' : memberName(membersById, attempt.user_id)
        const key = `attempt-${attempt.user_id}`
        return (
          <li key={attempt.user_id} className="card">
            <span className="card-row">
              <span className="card-title">{name}</span>
              <span className="card-meta">{formatRelative(attempt.created_at)}</span>
            </span>
            {audioAvailable ? (
              <span className="button-row">
                <SmallPlay
                  id={`${key}-rev`}
                  playback={playback}
                  getBuffer={remote(attempt.audio_path, attempt.created_at, { reversed: true })}
                >
                  À l'envers
                </SmallPlay>
                <SmallPlay id={key} playback={playback} getBuffer={remote(attempt.audio_path, attempt.created_at)}>
                  Brut
                </SmallPlay>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => save(attempt, name)}>
                  Sauvegarder
                </button>
              </span>
            ) : (
              <span className="card-meta">Audio supprimé</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ResultsList({ word, results }) {
  const { members, membersById, user } = useRoomContext()
  const players = members.filter((m) => m.user_id !== word.author_id)
  // Inclut aussi ceux qui ont joué puis quitté la room.
  const ids = [...new Set([...players.map((m) => m.user_id), ...results.map((r) => r.user_id)])]

  if (ids.length === 0) return <p className="hint">Personne d'autre dans la room pour l'instant.</p>

  return (
    <ul className="card-list">
      {ids.map((id) => {
        const result = results.find((r) => r.user_id === id)
        let label = 'Pas encore joué'
        let key = 'todo'
        if (result?.status === 'solved') {
          label = `Trouvé en ${result.guesses} essai${result.guesses > 1 ? 's' : ''}`
          key = 'solved'
        } else if (result?.status === 'gave_up') {
          label = 'Abandonné'
          key = 'gave_up'
        } else if (result) {
          label = `Cherche… (${result.guesses} essai${result.guesses > 1 ? 's' : ''})`
          key = 'playing'
        }
        return (
          <li key={id} className="card card-row">
            <span>{id === user.id ? 'Toi' : memberName(membersById, id)}</span>
            <span className={`badge is-${key}`}>{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function WordScreen({ wordId }) {
  const { words, code, user, membersById, resultsByWord, attemptsByWord, reload } = useRoomContext()
  const word = words.find((w) => w.id === wordId)
  const playback = usePlayback()
  const [answer, setAnswer] = useState(null)
  // Résultat juste obtenu, avant que le rechargement temps réel n'arrive.
  const [localStatus, setLocalStatus] = useState(null)
  const [hasListened, setHasListened] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const results = (word && resultsByWord.get(word.id)) ?? []
  const attempts = (word && attemptsByWord.get(word.id)) ?? []
  const status = word ? myWordStatus(word, results, user.id) : null
  const statusKey = localStatus ?? status?.key
  const resolved = status ? isResolved(status) || localStatus !== null : false
  const isAuthor = word?.author_id === user.id

  useEffect(() => {
    if (!word || !resolved || answer !== null) return
    let cancelled = false
    getAnswer(word.id)
      .then((value) => {
        if (!cancelled && value) setAnswer(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [word, resolved, answer])

  if (!word) {
    return (
      <>
        <TopBar backTo={`/online/${code}`} backLabel="Room" />
        <div className="screen">
          <h1 className="title">Mot introuvable</h1>
          <p className="subtitle">Il a peut-être été supprimé.</p>
        </div>
      </>
    )
  }

  const audioAvailable = isAudioAvailable(word)
  const authorName = isAuthor ? 'toi' : memberName(membersById, word.author_id)
  const reversedPath = wordAudioPath(word, 'reversed')
  const originalPath = wordAudioPath(word, 'original')

  const save = async (path, suffix) => {
    setSaveError(null)
    try {
      downloadBlob(await getRemoteBlob(path), `backwords-${slugify(answer ?? 'mot')}-${suffix}.wav`)
    } catch (err) {
      setSaveError(err)
    }
  }

  return (
    <>
      <TopBar backTo={`/online/${code}`} backLabel="Room" />
      <div className="screen is-top">
        <div className="stack" style={{ alignItems: 'center' }}>
          <h1 className="title">Mot de {authorName}</h1>
          <p className="hint">
            {formatRelative(word.created_at)} · {formatExpiry(word)}
          </p>
        </div>

        <AudioErrors audioError={playback.error ?? saveError} />

        {resolved && (
          <div className={`reveal-card is-${statusKey}`}>
            <p className="hint">
              {isAuthor ? 'Ton mot' : statusKey === 'gave_up' ? 'La réponse était' : '🎉 Bravo, c’était bien'}
            </p>
            <p className="reveal-answer">{answer ? `« ${answer} »` : '…'}</p>
          </div>
        )}

        {audioAvailable ? (
          <div className="stack">
            <div className="play-row">
              <PlayButton
                isPlaying={playback.playingId === 'reversed'}
                disabled={playback.anyPlaying && playback.playingId !== 'reversed'}
                onPlay={() => {
                  setHasListened(true)
                  playback.play('reversed', remote(reversedPath, ''))
                }}
                label="Le mot à l'envers"
              />
              {resolved && (
                <PlayButton
                  isPlaying={playback.playingId === 'original'}
                  disabled={playback.anyPlaying && playback.playingId !== 'original'}
                  onPlay={() => playback.play('original', remote(originalPath, ''))}
                  label="À l'endroit"
                  variant="play"
                />
              )}
            </div>
            <div className="button-row is-centered">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => save(reversedPath, 'inverse')}>
                Sauvegarder l'inversé
              </button>
              {resolved && (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => save(originalPath, 'original')}>
                  Sauvegarder l'original
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="notice">🗓️ Les enregistrements de ce mot ont été supprimés (plus de 7 jours).</p>
        )}

        {!isAuthor && audioAvailable && !resolved && !hasListened && (
          <p className="hint">Commence par écouter le mot à l'envers.</p>
        )}

        {!isAuthor && audioAvailable && (
          <AttemptRecorder word={word} user={user} playback={playback} onShared={reload} />
        )}

        {!resolved && <GuessForm
            word={word}
            reload={reload}
            onResolved={(result) => {
              setAnswer(result.answer)
              setLocalStatus(result.status)
            }}
          />}

        <div className="stack">
          <h2 className="section-title">Joueurs</h2>
          <ResultsList word={word} results={results} />
        </div>

        <div className="stack">
          <h2 className="section-title">Tentatives partagées</h2>
          <AttemptsList
            attempts={attempts}
            playback={playback}
            audioAvailable={audioAvailable}
            onError={setSaveError}
          />
        </div>

        {audioAvailable && <RetentionNotice />}
      </div>
    </>
  )
}
