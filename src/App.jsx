import { GameProvider, useGame } from './state/GameContext'
import { SetupScreen } from './components/SetupScreen'
import { PassScreen } from './components/PassScreen'
import { EncodeScreen } from './components/EncodeScreen'
import { DecodeScreen } from './components/DecodeScreen'
import { RestartButton } from './components/RestartButton'

const SCREENS = {
  setup: SetupScreen,
  pass: PassScreen,
  encoding: EncodeScreen,
  decoding: DecodeScreen,
}

function Game() {
  const { state } = useGame()
  const Screen = SCREENS[state.screen] ?? SetupScreen
  return (
    <>
      {state.screen !== 'setup' && <RestartButton />}
      <Screen />
    </>
  )
}

function App() {
  return (
    <div className="app">
      <GameProvider>
        <Game />
      </GameProvider>
    </div>
  )
}

export default App
