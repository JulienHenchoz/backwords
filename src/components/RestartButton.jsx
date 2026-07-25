import { useEffect, useRef, useState } from 'react'
import { useGame } from '../state/GameContext'

export function RestartButton() {
  const { restart } = useGame()
  const [confirming, setConfirming] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timeoutRef.current)
      restart()
      return
    }
    setConfirming(true)
    timeoutRef.current = setTimeout(() => setConfirming(false), 3000)
  }

  return (
    <button
      type="button"
      className={`restart-btn${confirming ? ' is-confirming' : ''}`}
      onClick={handleClick}
    >
      {confirming ? 'Confirmer ?' : 'Nouvelle partie'}
    </button>
  )
}
