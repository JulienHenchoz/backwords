import { PlayIcon, SpeakerIcon } from './icons'

export function PlayButton({ isPlaying, disabled, onPlay, label, variant = 'speaker' }) {
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <button
        type="button"
        className={`circle-btn is-play${isPlaying ? ' is-playing' : ''}`}
        disabled={disabled || isPlaying}
        onClick={onPlay}
        aria-label={label}
      >
        {variant === 'play' ? <PlayIcon /> : <SpeakerIcon />}
      </button>
      <p className="action-label">{label}</p>
    </div>
  )
}
