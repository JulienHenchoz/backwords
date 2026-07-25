import { useGame } from '../state/GameContext'

export function PassScreen() {
  const { state, encoder, decoder, continuePass } = useGame()
  const target = state.passTarget === 'encoder' ? encoder : decoder

  return (
    <div className="screen">
      <div className="pass-card stack" style={{ alignItems: 'center' }}>
        <p className="subtitle">Passe le téléphone à</p>
        <h1 className="title" style={{ fontSize: '2rem' }}>
          {target?.name}
        </h1>
        {state.passTarget === 'decoder' && (
          <p className="hint">Les autres ne regardent pas l'écran pendant son tour !</p>
        )}
      </div>

      <button type="button" className="btn btn-primary" onClick={continuePass}>
        C'est moi, j'ai le téléphone
      </button>
    </div>
  )
}
