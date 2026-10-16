import { useEffect, useState } from 'react'
import { navigate } from '../hooks/useHashRoute'
import { createRoom, joinRoom, listMyRooms, loadPseudo, savePseudo } from './api'
import { formatCode, formatRelative, roomTitle } from './format'
import { TopBar } from './TopBar'
import { PseudoInput } from './PseudoInput'

export function OnlineHome({ user }) {
  const [pseudo, setPseudo] = useState(loadPseudo)
  const [roomName, setRoomName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [rooms, setRooms] = useState(null)

  useEffect(() => {
    listMyRooms(user.id)
      .then(setRooms)
      .catch(() => setRooms([]))
  }, [user.id])

  const name = pseudo.trim()

  const run = async (kind, action) => {
    if (!name) {
      setError("Choisis d'abord un pseudo.")
      return
    }
    setBusy(kind)
    setError(null)
    savePseudo(name)
    try {
      const room = await action()
      navigate(`/online/${room.code}`)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  const handleJoin = (event) => {
    event.preventDefault()
    if (code.length !== 6) {
      setError('Le code d’une room fait 6 chiffres.')
      return
    }
    run('join', () => joinRoom(code, name))
  }

  return (
    <>
      <TopBar backTo="/" backLabel="Partie locale" />
      <div className="screen is-top">
        <div className="stack" style={{ alignItems: 'center' }}>
          <h1 className="title">Partie en ligne</h1>
          <p className="subtitle">
            Propose des mots à l'envers et devine ceux des autres, chacun sur son téléphone, quand tu
            veux. La partie ne s'arrête jamais !
          </p>
        </div>

        <PseudoInput value={pseudo} onChange={setPseudo} />

        <label className="stack field">
          <span className="field-label">Nom de la nouvelle room (facultatif)</span>
          <input
            className="text-input"
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="ex. Soirée du vendredi"
            maxLength={40}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => run('create', () => createRoom(name, roomName.trim()))}
        >
          {busy === 'create' ? 'Création…' : 'Créer une room'}
        </button>

        <div className="divider">ou</div>

        <form className="player-form" onSubmit={handleJoin}>
          <input
            className="text-input code-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Code à 6 chiffres"
            aria-label="Code de la room"
          />
          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0 var(--space-4)' }}
            disabled={busy !== null}
          >
            {busy === 'join' ? '…' : 'Rejoindre'}
          </button>
        </form>

        {error && <p className="hint is-error">{error}</p>}

        {rooms && rooms.length > 0 && (
          <div className="stack">
            <h2 className="section-title">Mes rooms</h2>
            <ul className="card-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className="card card-button"
                    onClick={() => navigate(`/online/${room.code}`)}
                  >
                    <span className="card-title">{roomTitle(room)}</span>
                    <span className="card-meta">
                      {room.name && `${formatCode(room.code)} · `}
                      {room.myPseudo} · activité {formatRelative(room.last_activity_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
