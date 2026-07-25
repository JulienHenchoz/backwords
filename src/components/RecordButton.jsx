import { MicIcon, StopIcon } from './icons'

const RADIUS = 78
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function RecordButton({ isRecording, progress = 0, disabled, onStart, onStop, label }) {
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <div className="circle-btn-wrap">
        {isRecording && (
          <svg className="progress-ring" viewBox="0 0 168 168">
            <circle
              cx="84"
              cy="84"
              r={RADIUS}
              fill="none"
              stroke="var(--color-record)"
              strokeWidth="4"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
        )}
        <button
          type="button"
          className={`circle-btn is-record${isRecording ? ' is-recording' : ''}`}
          disabled={disabled}
          onClick={isRecording ? onStop : onStart}
          aria-label={label}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
        </button>
      </div>
      <p className="action-label">{label}</p>
    </div>
  )
}
