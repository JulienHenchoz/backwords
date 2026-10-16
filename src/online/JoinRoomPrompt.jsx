import { useState } from 'react'
import { joinRoom, loadPseudo, savePseudo } from './api'
import { formatCode } from './format'
import { TopBar } from './TopBar'
import { PseudoInput } from './PseudoInput'

export function JoinRoomPrompt({ code, onJoined }) {
  const [pseudo, setPseudo] = useState(loadPseudo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const handleJoin = async (event) => {
    event.preventDefault()
    const name = pseudo.trim()
    if (!name) {
      setError("Choisis d'abord un pseudo.")
      return
    }
    setBusy(true)
    setError(null)
    savePseudo(name)
    try {
      await joinRoom(code, name)
      onJoined()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar backTo="/online" backLabel="Partie en ligne" />
      <form className="screen" onSubmit={handleJoin}>
        <div className="stack" style={{ alignItems: 'center' }}>
          <h1 className="title">Room {formatCode(code)}</h1>
          <p className="subtitle">Tu as été invité·e à jouer. Choisis ton pseudo pour rejoindre la partie.</p>
        </div>
        <PseudoInput value={pseudo} onChange={setPseudo} />
        {error && <p className="hint is-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Connexion…' : 'Rejoindre la room'}
        </button>
      </form>
    </>
  )
}
