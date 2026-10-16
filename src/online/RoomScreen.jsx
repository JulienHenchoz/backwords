import { useEffect, useRef, useState } from 'react'
import { navigate } from '../hooks/useHashRoute'
import { leaveRoom, renameRoom } from './api'
import { formatCode, formatExpiry, formatRelative, roomInviteUrl } from './format'
import { memberName } from './useRoom'
import { useRoomContext } from './RoomContext'
import { myWordStatus } from './wordStatus'
import { TopBar } from './TopBar'
import { RetentionNotice } from './RetentionNotice'
import { PushSettings } from './PushSettings'
import { RoomChat } from './RoomChat'

function InviteLink({ code }) {
  const url = roomInviteUrl(code)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Presse-papiers indisponible : on sélectionne le lien pour un copier manuel.
      inputRef.current?.select()
      return
    }
    setCopied(true)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <label className="stack field">
      <span className="field-label">Lien pour rejoindre la room</span>
      <span className="player-form">
        <input
          ref={inputRef}
          className="text-input invite-input"
          type="text"
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
          aria-label="Lien d'invitation"
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0 var(--space-3)' }}
          onClick={handleCopy}
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
      </span>
    </label>
  )
}

function RoomName({ room, onRenamed }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const startEditing = () => {
    setDraft(room.name ?? '')
    setError(null)
    setEditing(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onRenamed(await renameRoom(room.id, draft.trim()))
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <form className="stack" onSubmit={handleSubmit}>
        <span className="player-form">
          <input
            className="text-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nom de la room"
            maxLength={40}
            autoFocus
            aria-label="Nom de la room"
          />
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: 'auto', padding: '0 var(--space-3)' }}
            disabled={busy}
          >
            OK
          </button>
        </span>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
          Annuler
        </button>
        {error && <p className="hint is-error">{error}</p>}
      </form>
    )
  }

  return (
    <button type="button" className="room-name" onClick={startEditing}>
      <span className="title">{room.name || 'Room sans nom'}</span>
      <span className="room-name-edit">✏️ {room.name ? 'Renommer' : 'Donner un nom'}</span>
    </button>
  )
}

function LeaveButton({ room, userId }) {
  const [confirming, setConfirming] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true)
      timeoutRef.current = setTimeout(() => setConfirming(false), 3000)
      return
    }
    clearTimeout(timeoutRef.current)
    await leaveRoom(room.id, userId).catch(() => {})
    navigate('/online')
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-small${confirming ? ' is-danger' : ''}`}
      onClick={handleClick}
    >
      {confirming ? 'Confirmer : quitter la room ?' : 'Quitter la room'}
    </button>
  )
}

function WordCard({ word }) {
  const { user, membersById, resultsByWord, members, code } = useRoomContext()
  const results = resultsByWord.get(word.id) ?? []
  const status = myWordStatus(word, results, user.id)
  const solvedCount = results.filter((r) => r.status === 'solved').length
  const others = members.filter((m) => m.user_id !== word.author_id).length

  return (
    <li>
      <button
        type="button"
        className={`card card-button word-card is-${status.key}`}
        onClick={() => navigate(`/online/${code}/word/${word.id}`)}
      >
        <span className="card-row">
          <span className="card-title">
            {word.author_id === user.id ? 'Toi' : memberName(membersById, word.author_id)}
          </span>
          <span className={`badge is-${status.key}`}>{status.label}</span>
        </span>
        <span className="card-meta">
          {formatRelative(word.created_at)} · trouvé par {solvedCount}/{others} · {formatExpiry(word)}
        </span>
      </button>
    </li>
  )
}

export function RoomScreen() {
  const { room, code, members, words, user, membersById, reload, setRoom } = useRoomContext()
  const me = membersById.get(user.id)

  return (
    <>
      <TopBar backTo="/online" backLabel="Mes rooms" />
      <div className="screen is-top">
        <div className="stack" style={{ alignItems: 'center' }}>
          <RoomName room={room} onRenamed={setRoom} />
          <p className="hint">Code de la room</p>
          <p className="room-code">{formatCode(code)}</p>
        </div>

        <InviteLink code={code} />

        <ul className="chips" aria-label="Joueurs">
          {members.map((member) => (
            <li key={member.user_id} className={`chip${member.user_id === user.id ? ' is-me' : ''}`}>
              {member.name}
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn-primary" onClick={() => navigate(`/online/${code}/new`)}>
          🎙️ Proposer un mot
        </button>

        <PushSettings room={room} me={me} onChange={reload} />

        <div className="stack">
          <h2 className="section-title">Mots ({words.length})</h2>
          {words.length === 0 ? (
            <p className="hint">Aucun mot pour l'instant. Lance-toi !</p>
          ) : (
            <ul className="card-list">
              {words.map((word) => (
                <WordCard key={word.id} word={word} />
              ))}
            </ul>
          )}
        </div>

        <RoomChat />

        <RetentionNotice />

        <LeaveButton room={room} userId={user.id} />
      </div>
    </>
  )
}
