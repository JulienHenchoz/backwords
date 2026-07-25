export const initialState = {
  screen: 'setup',
  players: [],
  round: null,
  decoderIndex: -1,
  passTarget: null,
}

function makePlayers(names) {
  return names.map((name, index) => ({
    id: `player-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
  }))
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START_GAME': {
      const players = makePlayers(action.names)
      return {
        ...state,
        screen: 'pass',
        passTarget: 'encoder',
        players,
        decoderIndex: 1,
        round: { encoderId: players[0].id, decoderId: players[1].id },
      }
    }

    case 'CONTINUE_PASS': {
      return {
        ...state,
        screen: state.passTarget === 'encoder' ? 'encoding' : 'decoding',
      }
    }

    case 'CONFIRM_ENCODING': {
      return {
        ...state,
        round: {
          ...state.round,
          originalBuffer: action.originalBuffer,
          originalReversedBuffer: action.originalReversedBuffer,
        },
        screen: 'pass',
        passTarget: 'decoder',
      }
    }

    case 'CONFIRM_DECODING': {
      // Le décodeur devient l'encodeur du round suivant : il tient déjà le
      // téléphone, pas besoin de repasser par l'écran "pass". La rotation
      // boucle indéfiniment sur la liste de joueurs.
      const nextDecoderIndex = (state.decoderIndex + 1) % state.players.length
      return {
        ...state,
        decoderIndex: nextDecoderIndex,
        round: {
          encoderId: state.round.decoderId,
          decoderId: state.players[nextDecoderIndex].id,
        },
        screen: 'encoding',
      }
    }

    case 'RESTART':
      return initialState

    default:
      return state
  }
}

export function getPlayerById(state, id) {
  return state.players.find((player) => player.id === id) ?? null
}
