import { useEffect, useRef, useState } from 'react'
import { navigate } from '../hooks/useHashRoute'
import { leaveRoom } from './api'
import { formatCode, formatExpiry, formatRelative } from './format'
import { memberName } from './useRoom'
import { useRoomContext } from './RoomContext'
import { myWordStatus } from './wordStatus'
import { TopBar } from './TopBar'
import { RetentionNotice } from './RetentionNotice'
import { PushSettings } from './PushSettings'
import { RoomChat } from './RoomChat'

function InviteButton({ code }) {
  const [copied, setCopied] = useState(false)

  const handleInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/online/${code}`
    const text = `Rejoins ma partie de Backwords ! Code de la room : ${code}`
    if (navigator.share) {
      navigator.share({ title: 'Backwords', text, url }).catch(() => {})
      return
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie ce lien :', url)
    }
  }

  return (
    <button type="button" className="btn btn-secondary btn-small" onClick={handleInvite}>
      {copied ? 'Lien copié ✓' : 'Inviter des joueurs'}
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
  const { room, code, members, words, user, membersById, reload } = useRoomContext()
  const me = membersById.get(user.id)

  return (
    <>
      <TopBar backTo="/online" backLabel="Mes rooms" />
      <div className="screen is-top">
        <div className="stack" style={{ alignItems: 'center' }}>
          <p className="hint">Code de la room</p>
          <h1 className="room-code">{formatCode(code)}</h1>
          <InviteButton code={code} />
        </div>

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
