import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, isIos, isPushConfigured, isStandalone } from './push'
import { setRoomNotifications } from './api'

export function PushSettings({ room, me, onChange }) {
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  if (!isPushConfigured() || state === 'loading') return null

  if (state === 'unsupported') {
    if (isIos() && !isStandalone()) {
      return (
        <p className="notice">
          🔔 Pour être notifié·e des nouveaux mots sur iPhone, ajoute Backwords à ton écran d'accueil
          (bouton Partager → « Sur l'écran d'accueil »), puis ouvre l'app depuis là.
        </p>
      )
    }
    return <p className="hint">Ce navigateur ne gère pas les notifications push.</p>
  }

  if (state === 'denied') {
    return (
      <p className="notice">
        🔕 Les notifications sont bloquées pour Backwords. Autorise-les dans les réglages de ton
        navigateur pour être prévenu·e des nouveaux mots.
      </p>
    )
  }

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'disabled') {
    return (
      <div className="stack">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => run(async () => setState(await enablePush()))}
        >
          🔔 Activer les notifications
        </button>
        <p className="hint">Nouveaux mots, mots trouvés et nouveaux joueurs.</p>
        {error && <p className="hint is-error">{error}</p>}
      </div>
    )
  }

  const enabledForRoom = me?.notifications ?? true

  return (
    <div className="stack">
      <label className="switch-row">
        <span>🔔 Notifications pour cette room</span>
        <input
          type="checkbox"
          className="switch"
          checked={enabledForRoom}
          disabled={busy}
          onChange={(e) =>
            run(async () => {
              await setRoomNotifications(room.id, e.target.checked)
              onChange()
            })
          }
        />
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        disabled={busy}
        onClick={() => run(async () => setState(await disablePush()))}
      >
        Désactiver les notifications sur cet appareil
      </button>
      {error && <p className="hint is-error">{error}</p>}
    </div>
  )
}
