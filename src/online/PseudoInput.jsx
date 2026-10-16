export function PseudoInput({ value, onChange }) {
  return (
    <label className="stack field">
      <span className="field-label">Ton pseudo</span>
      <input
        className="text-input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Prénom ou surnom"
        maxLength={20}
        autoComplete="nickname"
      />
    </label>
  )
}
