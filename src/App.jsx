import { lazy, Suspense, useEffect } from 'react'
import { GameProvider, useGame } from './state/GameContext'
import { SetupScreen } from './components/SetupScreen'
import { PassScreen } from './components/PassScreen'
import { EncodeScreen } from './components/EncodeScreen'
import { DecodeScreen } from './components/DecodeScreen'
import { RestartButton } from './components/RestartButton'
import { navigate, useHashRoute } from './hooks/useHashRoute'

// Chargé à la demande : la partie locale n'embarque pas le client Supabase.
const OnlineApp = lazy(() => import('./online/OnlineApp'))
const AdminApp = lazy(() => import('./admin/AdminApp'))

const isAdminPage = window.location.pathname.replace(/\/+$/, '') === '/admin'

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

// Un clic sur une notification push demande à l'app déjà ouverte d'aller
// sur la bonne page (voir public/push-handler.js).
function useNotificationNavigation() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event) => {
      if (event.data?.type !== 'backwords:navigate') return
      const hash = new URL(event.data.url, window.location.origin).hash
      navigate(hash.replace(/^#/, '') || '/')
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
}

const footer = <footer className="app-footer">Version {__APP_VERSION__}</footer>

const loading = (
  <div className="screen">
    <p className="hint">Chargement…</p>
  </div>
)

function App() {
  const route = useHashRoute()
  useNotificationNavigation()

  if (isAdminPage) {
    return (
      <div className="app">
        <Suspense fallback={loading}>
          <AdminApp />
        </Suspense>
        {footer}
      </div>
    )
  }

  return (
    <div className="app">
      {route.name === 'local' ? (
        <GameProvider>
          <Game />
        </GameProvider>
      ) : (
        <Suspense fallback={loading}>
          <OnlineApp route={route} />
        </Suspense>
      )}
      {footer}
    </div>
  )
}

export default App
