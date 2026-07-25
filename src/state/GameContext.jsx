import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import { gameReducer, initialState, getPlayerById } from './gameReducer'

const GameContext = createContext(null)

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)

  const startGame = useCallback((names) => dispatch({ type: 'START_GAME', names }), [])
  const continuePass = useCallback(() => dispatch({ type: 'CONTINUE_PASS' }), [])
  const confirmEncoding = useCallback(
    (originalBuffer, originalReversedBuffer) =>
      dispatch({ type: 'CONFIRM_ENCODING', originalBuffer, originalReversedBuffer }),
    []
  )
  const confirmDecoding = useCallback(
    (attemptBuffer, attemptReversedBuffer) =>
      dispatch({ type: 'CONFIRM_DECODING', attemptBuffer, attemptReversedBuffer }),
    []
  )
  const restart = useCallback(() => dispatch({ type: 'RESTART' }), [])

  const currentRound = state.round

  const value = useMemo(
    () => ({
      state,
      currentRound,
      encoder: currentRound ? getPlayerById(state, currentRound.encoderId) : null,
      decoder: currentRound ? getPlayerById(state, currentRound.decoderId) : null,
      startGame,
      continuePass,
      confirmEncoding,
      confirmDecoding,
      restart,
    }),
    [state, currentRound, startGame, continuePass, confirmEncoding, confirmDecoding, restart]
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame must be used within a GameProvider')
  return context
}
