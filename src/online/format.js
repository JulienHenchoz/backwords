import { audioExpiresAt } from './api'

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export function formatRelative(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000
  const abs = Math.abs(seconds)
  if (abs < 60) return 'à l’instant'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86400), 'day')
}

export function formatExpiry(word) {
  const ms = audioExpiresAt(word).getTime() - Date.now()
  if (word.audio_deleted_at || ms <= 0) return 'Audio supprimé'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `Audio supprimé dans ${days} j`
  const hours = Math.max(1, Math.floor(ms / 3600000))
  return `Audio supprimé dans ${hours} h`
}

export function formatCode(code) {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

export function roomTitle(room) {
  return room.name || `Room ${formatCode(room.code)}`
}

export function roomInviteUrl(code) {
  return `${window.location.origin}${window.location.pathname}#/online/${code}`
}
