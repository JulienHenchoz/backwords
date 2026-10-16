import { navigate } from '../hooks/useHashRoute'

export function TopBar({ backTo, backLabel, children }) {
  return (
    <div className="top-bar">
      <button type="button" className="top-bar-back" onClick={() => navigate(backTo)}>
        ← {backLabel}
      </button>
      {children}
    </div>
  )
}
