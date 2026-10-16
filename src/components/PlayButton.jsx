import { PlayIcon, SpeakerIcon, StopIcon } from './icons'

export function PlayButton({ isPlaying, disabled, onPlay, label, variant = 'speaker' }) {
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <button
        type="button"
        className={`circle-btn is-play${isPlaying ? ' is-playing' : ''}`}
        disabled={disabled}
        onClick={onPlay}
        aria-label={isPlaying ? `Arrêter : ${label}` : label}
      >
        {isPlaying ? <StopIcon /> : variant === 'play' ? <PlayIcon /> : <SpeakerIcon />}
      </button>
      <p className="action-label">{label}</p>
    </div>
  )
}
