import { useState } from 'react'
import { useGame } from '../state/GameContext'
import { navigate } from '../hooks/useHashRoute'

export function SetupScreen() {
  const { startGame } = useGame()
  const [names, setNames] = useState([])
  const [draft, setDraft] = useState('')

  const addPlayer = (event) => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    setNames((prev) => [...prev, trimmed])
    setDraft('')
  }

  const removePlayer = (index) => {
    setNames((prev) => prev.filter((_, i) => i !== index))
  }

  const canStart = names.length >= 2

  return (
    <div className="screen">
      <div className="stack" style={{ alignItems: 'center' }}>
        <h1 className="title">Backwords</h1>
        <p className="subtitle">
          Enregistre un mot, écoute-le à l'envers, devine-le. Ajoute au moins deux joueurs pour
          commencer.
        </p>
      </div>

      <form className="player-form" onSubmit={addPlayer}>
        <input
          className="text-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Prénom du joueur"
          maxLength={20}
        />
        <button type="submit" className="btn btn-secondary" style={{ width: 'auto', padding: '0 var(--space-4)' }}>
          Ajouter
        </button>
      </form>

      {names.length > 0 && (
        <ul className="player-list">
          {names.map((name, index) => (
            <li className="player-row" key={`${name}-${index}`}>
              <span>
                <span className="player-row-index">{index + 1}.</span>
                {name}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => removePlayer(index)}
                aria-label={`Retirer ${name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={!canStart}
        onClick={() => startGame(names)}
      >
        {canStart ? 'Commencer la partie' : 'Ajoute au moins 2 joueurs'}
      </button>

      <div className="divider">ou</div>

      <button type="button" className="btn btn-secondary" onClick={() => navigate('/online')}>
        🌐 Partie en ligne
      </button>
    </div>
  )
}
