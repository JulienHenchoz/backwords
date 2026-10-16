export function AudioErrors({ micError, audioError }) {
  return (
    <>
      {micError && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Micro inaccessible{micError.message ? ` (${micError.message})` : ''}. Vérifie les
          autorisations puis réessaie.
        </p>
      )}

      {audioError && (
        <p className="hint" style={{ color: 'var(--color-record)' }}>
          Le son n'a pas pu être lu{audioError.message ? ` (${audioError.message})` : ''}. Réessaie.
        </p>
      )}
    </>
  )
}
