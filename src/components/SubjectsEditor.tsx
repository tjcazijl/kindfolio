import { useState } from 'react'

interface Props {
  subjects: string[]
  onChange: (next: string[]) => void
  reset?: { label: string; onClick: () => void }
}

// Herbruikbare chip-editor voor vakgebieden (account-breed of per kind).
export function SubjectsEditor({ subjects, onChange, reset }: Props) {
  const [value, setValue] = useState('')

  function add(e: React.FormEvent) {
    e.preventDefault()
    const s = value.trim()
    if (!s || subjects.includes(s)) {
      setValue('')
      return
    }
    onChange([...subjects, s])
    setValue('')
  }

  return (
    <>
      <div className="chips">
        {subjects.map((s) => (
          <span key={s} className="chip on editable">
            {s}
            <button
              type="button"
              className="chip-x"
              onClick={() => onChange(subjects.filter((x) => x !== s))}
              aria-label={`${s} verwijderen`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="row gap" style={{ marginTop: 12 }}>
        <input
          className="input grow"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nieuw vakgebied"
        />
        <button className="btn primary sm" type="submit">
          Toevoegen
        </button>
      </form>
      {reset && (
        <button className="link-btn" onClick={reset.onClick}>
          {reset.label}
        </button>
      )}
    </>
  )
}
