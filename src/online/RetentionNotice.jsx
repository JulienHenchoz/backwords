import { AUDIO_RETENTION_DAYS } from './api'

export function RetentionNotice({ compact = false }) {
  return (
    <p className="notice">
      🗓️ Les enregistrements sont supprimés automatiquement {AUDIO_RETENTION_DAYS} jours après la
      publication de chaque mot.
      {!compact && ' Pense à sauvegarder ceux que tu veux garder avec les boutons « Sauvegarder ».'}
    </p>
  )
}
