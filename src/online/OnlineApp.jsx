import { useEffect, useState } from 'react'
import { isOnlineConfigured } from './supabase'
import { ensureSession } from './api'
import { useRoom } from './useRoom'
import { RoomContext } from './RoomContext'
import { TopBar } from './TopBar'
import { OnlineHome } from './OnlineHome'
import { JoinRoomPrompt } from './JoinRoomPrompt'
import { RoomScreen } from './RoomScreen'
import { NewWordScreen } from './NewWordScreen'
import { WordScreen } from './WordScreen'

function Message({ title, children, backTo = '/', backLabel = 'Accueil' }) {
  return (
    <>
      <TopBar backTo={backTo} backLabel={backLabel} />
      <div className="screen">
        <div className="stack" style={{ alignItems: 'center' }}>
          <h1 className="title">{title}</h1>
          {children}
        </div>
      </div>
    </>
  )
}

function RoomGate({ route, user }) {
  const room = useRoom(route.code)

  if (room.status === 'loading') {
    return (
      <Message title={`Room ${route.code}`} backTo="/online" backLabel="Mes rooms">
        <p className="hint">Chargement…</p>
      </Message>
    )
  }

  if (room.status === 'error') {
    return (
      <Message title="Oups" backTo="/online" backLabel="Mes rooms">
        <p className="subtitle">{room.error?.message ?? 'Impossible de charger la room.'}</p>
        <button type="button" className="btn btn-secondary" onClick={room.loadRoom}>
          Réessayer
        </button>
      </Message>
    )
  }

  if (room.status === 'not-member') {
    return <JoinRoomPrompt code={route.code} onJoined={room.loadRoom} />
  }

  const value = { ...room, user, code: route.code }
  return (
    <RoomContext.Provider value={value}>
      {route.name === 'new-word' && <NewWordScreen />}
      {route.name === 'word' && <WordScreen key={route.wordId} wordId={route.wordId} />}
      {route.name === 'room' && <RoomScreen />}
    </RoomContext.Provider>
  )
}

function ConnectedOnlineApp({ route }) {
  const [session, setSession] = useState({ status: 'loading', user: null, error: null })

  useEffect(() => {
    ensureSession()
      .then((user) => setSession({ status: 'ready', user, error: null }))
      .catch((error) => setSession({ status: 'error', user: null, error }))
  }, [])

  if (session.status === 'loading') {
    return (
      <Message title="Partie en ligne">
        <p className="hint">Connexion…</p>
      </Message>
    )
  }

  if (session.status === 'error') {
    return (
      <Message title="Connexion impossible">
        <p className="subtitle">
          {session.error?.message ?? 'Vérifie ta connexion internet puis réessaie.'}
        </p>
      </Message>
    )
  }

  if (route.name === 'online-home') return <OnlineHome user={session.user} />
  return <RoomGate key={route.code} route={route} user={session.user} />
}

export default function OnlineApp({ route }) {
  if (!isOnlineConfigured) {
    return (
      <Message title="Mode en ligne indisponible">
        <p className="subtitle">
          Le serveur de jeu n'est pas configuré (variables VITE_SUPABASE_URL et
          VITE_SUPABASE_ANON_KEY manquantes).
        </p>
      </Message>
    )
  }
  return <ConnectedOnlineApp route={route} />
}
