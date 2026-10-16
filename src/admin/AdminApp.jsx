import { useCallback, useEffect, useMemo, useState } from 'react'
import { isOnlineConfigured } from '../online/supabase'
import { formatCode, formatRelative, roomTitle } from '../online/format'
import {
  encodeCredentials,
  fetchOverview,
  loadCredentials,
  saveCredentials,
  UnauthorizedError,
} from './api'

// Quota de stockage de l'offre gratuite Supabase.
const FREE_PLAN_STORAGE_BYTES = 1024 ** 3

const bytesFormat = new Intl.NumberFormat('fr', { maximumFractionDigits: 1 })

function formatBytes(bytes) {
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${bytesFormat.format(value)} ${units[unit]}`
}

function LoginForm({ onLogin, error, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  return (
    <form
      className="screen"
      onSubmit={(event) => {
        event.preventDefault()
        onLogin(encodeCredentials(username, password))
      }}
    >
      <h1 className="title">Admin Backwords</h1>
      <label className="stack field">
        <span className="field-label">Utilisateur</span>
        <input
          className="text-input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
          required
        />
      </label>
      <label className="stack field">
        <span className="field-label">Mot de passe</span>
        <input
          className="text-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className="hint is-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}

function Stat({ label, value, detail }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  )
}

function Dashboard({ data, onRefresh, onLogout, busy }) {
  const [query, setQuery] = useState('')
  const { storage, totals } = data
  const usage = Math.min(1, storage.bytes / FREE_PLAN_STORAGE_BYTES)

  const rooms = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return data.rooms
    return data.rooms.filter(
      (room) =>
        room.code.includes(q) ||
        room.name?.toLowerCase().includes(q) ||
        room.players.some((name) => name.toLowerCase().includes(q))
    )
  }, [data.rooms, query])

  return (
    <div className="screen is-top admin">
      <div className="card-row" style={{ width: '100%' }}>
        <h1 className="title">Admin</h1>
        <span className="button-row">
          <button type="button" className="btn btn-secondary btn-small" onClick={onRefresh} disabled={busy}>
            {busy ? '…' : 'Actualiser'}
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={onLogout}>
            Déconnexion
          </button>
        </span>
      </div>

      <div className="stack">
        <h2 className="section-title">Stockage des enregistrements</h2>
        <div className="panel stack">
          <span className="card-row">
            <span className="stat-value">{formatBytes(storage.bytes)}</span>
            <span className="card-meta">{storage.files} fichier{storage.files > 1 ? 's' : ''}</span>
          </span>
          <div
            className="meter"
            role="meter"
            aria-label="Stockage utilisé"
            aria-valuemin={0}
            aria-valuemax={FREE_PLAN_STORAGE_BYTES}
            aria-valuenow={storage.bytes}
          >
            <div className="meter-fill" style={{ width: `${Math.max(usage * 100, storage.bytes ? 1 : 0)}%` }} />
          </div>
          <span className="card-meta">
            {bytesFormat.format(usage * 100)} % du 1 Go de l'offre gratuite Supabase
          </span>
        </div>
      </div>

      <div className="stats">
        <Stat label="Rooms" value={totals.rooms} />
        <Stat label="Joueurs" value={totals.players} detail="appareils distincts" />
        <Stat label="Mots" value={totals.words} />
        <Stat label="Messages" value={totals.messages} />
      </div>

      <div className="stack">
        <h2 className="section-title">Rooms ({data.rooms.length})</h2>
        <input
          className="text-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom, code ou pseudo"
          aria-label="Filtrer les rooms"
        />
        {rooms.length === 0 ? (
          <p className="hint">Aucune room.</p>
        ) : (
          <ul className="card-list">
            {rooms.map((room) => (
              <li key={room.id} className="card">
                <span className="card-row">
                  <span className="card-title">{roomTitle(room)}</span>
                  {room.name && <span className="card-meta">{formatCode(room.code)}</span>}
                </span>
                <ul className="chips is-left" aria-label="Joueurs">
                  {room.players.map((name, index) => (
                    <li key={`${name}-${index}`} className="chip">
                      {name}
                    </li>
                  ))}
                  {room.players.length === 0 && <li className="card-meta">Aucun joueur</li>}
                </ul>
                <span className="card-meta">
                  {room.words} mot{room.words > 1 ? 's' : ''} · {room.messages} message
                  {room.messages > 1 ? 's' : ''} · {formatBytes(room.audio_bytes)} d'audio
                </span>
                <span className="card-meta">
                  Créée {formatRelative(room.created_at)} · activité {formatRelative(room.last_activity_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="hint">Données du {new Date(data.generated_at).toLocaleString('fr')}</p>
    </div>
  )
}

export default function AdminApp() {
  const [auth, setAuth] = useState(loadCredentials)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (credentials) => {
    setBusy(true)
    setError(null)
    try {
      setData(await fetchOverview(credentials))
      saveCredentials(credentials)
      setAuth(credentials)
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        saveCredentials(null)
        setAuth(null)
        setData(null)
      }
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const saved = loadCredentials()
    if (saved) load(saved)
  }, [load])

  const logout = () => {
    saveCredentials(null)
    setAuth(null)
    setData(null)
  }

  if (!isOnlineConfigured) {
    return (
      <div className="screen">
        <h1 className="title">Admin indisponible</h1>
        <p className="subtitle">Le mode en ligne n'est pas configuré.</p>
      </div>
    )
  }

  if (!auth || !data) {
    if (auth && busy) {
      return (
        <div className="screen">
          <p className="hint">Chargement…</p>
        </div>
      )
    }
    return <LoginForm onLogin={load} error={error} busy={busy} />
  }

  return (
    <>
      {error && <p className="hint is-error">{error}</p>}
      <Dashboard data={data} onRefresh={() => load(auth)} onLogout={logout} busy={busy} />
    </>
  )
}
