import { useState } from 'react'
import { CHILD_COLORS } from '../types'
import { todayISO } from '../utils/dates'

export interface ChildFormData {
  name: string
  birthDate?: string
  color: string
}

interface Props {
  initial?: { name: string; birthDate?: string; color?: string }
  submitLabel: string
  onSubmit: (data: ChildFormData) => Promise<void> | void
  onCancel: () => void
}

export function ChildForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? '')
  const [color, setColor] = useState(initial?.color ?? CHILD_COLORS[0])
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      await onSubmit({ name: n, birthDate: birthDate || undefined, color })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        autoFocus
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Naam van het kind"
      />
      <label className="field" style={{ margin: 0 }}>
        <span className="field-label">Geboortedatum (optioneel)</span>
        <input
          className="input"
          type="date"
          max={todayISO()}
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </label>
      <div>
        <span className="field-label">Kleur</span>
        <div className="color-swatches">
          {CHILD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Kleur ${c}`}
            />
          ))}
        </div>
      </div>
      <div className="row gap">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Opslaan…' : submitLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </form>
  )
}
