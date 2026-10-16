// Statut d'un mot du point de vue du joueur courant.
export function myWordStatus(word, results, userId) {
  if (word.author_id === userId) return { key: 'mine', label: 'Ton mot' }
  const mine = results?.find((r) => r.user_id === userId)
  if (!mine) return { key: 'todo', label: 'À deviner' }
  if (mine.status === 'solved') return { key: 'solved', label: 'Trouvé ✓' }
  if (mine.status === 'gave_up') return { key: 'gave_up', label: 'Abandonné' }
  return { key: 'playing', label: `En cours · ${mine.guesses} essai${mine.guesses > 1 ? 's' : ''}` }
}

export function isResolved(status) {
  return status.key === 'mine' || status.key === 'solved' || status.key === 'gave_up'
}
