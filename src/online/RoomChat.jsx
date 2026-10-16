import { useEffect, useRef, useState } from 'react'
import { CHAT_MAX_LENGTH, sendMessage } from './api'
import { formatRelative } from './format'
import { memberName } from './useRoom'
import { useRoomContext } from './RoomContext'

export function RoomChat() {
  const { room, user, messages, membersById, reload } = useRoomContext()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const listRef = useRef(null)

  // Reste collé au dernier message.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setError(null)
    try {
      await sendMessage(room.id, user.id, body)
      setDraft('')
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="stack">
      <h2 className="section-title">Chat</h2>
      <div className="chat panel">
        <ul className="chat-list" ref={listRef}>
          {messages.length === 0 && <li className="hint">Aucun message. Dis bonjour !</li>}
          {messages.map((message) => {
            const mine = message.user_id === user.id
            return (
              <li key={message.id} className={`chat-message${mine ? ' is-mine' : ''}`}>
                <span className="chat-meta">
                  {mine ? 'Toi' : memberName(membersById, message.user_id)} ·{' '}
                  {formatRelative(message.created_at)}
                </span>
                <span className="chat-body">{message.body}</span>
              </li>
            )
          })}
        </ul>
        <form className="player-form" onSubmit={handleSubmit}>
          <input
            className="text-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Écris un message…"
            maxLength={CHAT_MAX_LENGTH}
            enterKeyHint="send"
            aria-label="Message"
          />
          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0 var(--space-3)' }}
            disabled={sending || !draft.trim()}
          >
            Envoyer
          </button>
        </form>
        {error && <p className="hint is-error">{error}</p>}
      </div>
    </div>
  )
}
