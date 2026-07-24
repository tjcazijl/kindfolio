import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import type { EventFreq, EventType } from '../types'
import { EVENT_ORDER, EVENT_META } from '../utils/events'
import { WEEKDAYS, recurrenceLabel } from '../utils/recurrence'
import { todayISO } from '../utils/dates'

const FREQ_OPTIONS: { value: EventFreq; label: string }[] = [
  { value: 'none', label: 'Niet herhalen' },
  { value: 'daily', label: 'Dagelijks' },
  { value: 'weekly', label: 'Wekelijks' },
  { value: 'monthly', label: 'Maandelijks' },
  { value: 'yearly', label: 'Jaarlijks' },
]
const UNIT: Record<Exclude<EventFreq, 'none'>, [string, string]> = {
  daily: ['dag', 'dagen'],
  weekly: ['week', 'weken'],
  monthly: ['maand', 'maanden'],
  yearly: ['jaar', 'jaar'],
}

export function EventEditor() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const {
    children,
    events,
    subjects: accountSubjects,
    addEvent,
    editEvent,
    removeEvent,
  } = useData()
  const isNew = !eventId
  const existing = eventId ? events.find((e) => e.id === eventId) : undefined

  const [title, setTitle] = useState(existing?.title || '')
  const [type, setType] = useState<EventType>(existing?.type || 'uitje')
  const [date, setDate] = useState(existing?.date || todayISO())
  const [time, setTime] = useState(existing?.time || '')
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds || [])
  const [subjects, setSubjects] = useState<string[]>(existing?.subjects || [])
  const [freq, setFreq] = useState<EventFreq>(existing?.freq || 'none')
  const [everyN, setEveryN] = useState(existing?.everyN || 1)
  const [weekdays, setWeekdays] = useState<string[]>(existing?.weekdays || [])
  const [until, setUntil] = useState(existing?.until || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const availableSubjects = [
    ...new Set([...accountSubjects, ...children.flatMap((c) => c.subjects || [])]),
  ]

  if (!isNew && !existing) return <div className="page">Laden…</div>

  function toggleChild(id: string) {
    setChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }
  function toggleSubject(s: string) {
    setSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }
  function toggleWeekday(code: string) {
    setWeekdays((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code],
    )
  }

  // Voorbeeld-omschrijving van de herhaling, live.
  const preview =
    freq === 'none'
      ? ''
      : recurrenceLabel({
          freq,
          everyN,
          weekdays,
          until: until || undefined,
          date,
        } as any)

  async function save() {
    if (!title.trim()) {
      alert('Geef een titel op.')
      return
    }
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        type,
        date,
        time: time || null,
        freq,
        everyN,
        weekdays,
        until: until || null,
        subjects,
        childIds,
        notes: notes.trim(),
      }
      const saved = isNew ? await addEvent(data) : await editEvent(eventId!, data)
      navigate(`/agenda/${saved.id}`)
    } catch (err: any) {
      alert(err?.message || 'Opslaan mislukt')
      setSaving(false)
    }
  }

  async function remove() {
    if (!eventId) return
    await removeEvent(eventId)
    navigate('/agenda')
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate(-1)}>
          ‹ Annuleren
        </button>
        <span className="topbar-title">
          {isNew ? 'Nieuw agenda-item' : 'Item bewerken'}
        </span>
      </div>

      <label className="field">
        <span className="field-label">Titel</span>
        <input
          className="input"
          value={title}
          autoFocus={isNew}
          placeholder="Bijv. Zwemles of Bibliotheek bezoeken"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="field">
        <span className="field-label">Type</span>
        <div className="seg">
          {EVENT_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={`seg-btn ${type === t ? 'on' : ''}`}
              onClick={() => setType(t)}
            >
              {EVENT_META[t].icon} {EVENT_META[t].label}
            </button>
          ))}
        </div>
      </div>

      <div className="two-fields">
        <label className="field">
          <span className="field-label">Datum</span>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Tijd <span className="fl-opt">(optioneel)</span></span>
          <input
            type="time"
            className="input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>

      {children.length > 0 && (
        <div className="field">
          <span className="field-label">
            Voor welk kind? <span className="fl-opt">(optioneel, gezinsbreed als je niets kiest)</span>
          </span>
          <div className="chips">
            {children.map((c) => {
              const on = childIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip child-chip ${on ? 'on' : ''}`}
                  onClick={() => toggleChild(c.id)}
                >
                  <span
                    className="avatar xs"
                    style={{ background: on ? '#fff' : c.color, color: on ? c.color : '#fff' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {availableSubjects.length > 0 && (
        <div className="field">
          <span className="field-label">
            Vakgebieden <span className="fl-opt">(optioneel, meerdere mag)</span>
          </span>
          <div className="chips">
            {availableSubjects.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${subjects.includes(s) ? 'on' : ''}`}
                onClick={() => toggleSubject(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span className="field-label">Herhalen</span>
        <select
          className="input"
          value={freq}
          onChange={(e) => setFreq(e.target.value as EventFreq)}
        >
          {FREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {freq !== 'none' && (
        <>
          <div className="two-fields">
            <label className="field">
              <span className="field-label">Elke</span>
              <div className="every-row">
                <input
                  type="number"
                  min={1}
                  className="input every-n"
                  value={everyN}
                  onChange={(e) => setEveryN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <span className="every-unit">
                  {UNIT[freq][everyN === 1 ? 0 : 1]}
                </span>
              </div>
            </label>
            <label className="field">
              <span className="field-label">Tot en met <span className="fl-opt">(optioneel)</span></span>
              <input
                type="date"
                className="input"
                value={until}
                min={date}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>

          {freq === 'weekly' && (
            <div className="field">
              <span className="field-label">Op welke dagen</span>
              <div className="weekday-row">
                {WEEKDAYS.map((w) => (
                  <button
                    key={w.code}
                    type="button"
                    className={`weekday ${weekdays.includes(w.code) ? 'on' : ''}`}
                    onClick={() => toggleWeekday(w.code)}
                  >
                    {w.short}
                  </button>
                ))}
              </div>
            </div>
          )}

          {preview && <p className="hint">↻ {preview}</p>}
        </>
      )}

      <label className="field">
        <span className="field-label">Notitie <span className="fl-opt">(optioneel)</span></span>
        <textarea
          className="input textarea"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bijv. locatie, wat mee te nemen…"
        />
      </label>

      <div className="sticky-actions">
        <button className="btn primary full big" disabled={saving} onClick={save}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
        {!isNew && (
          <button
            className="btn danger-outline full white-bg"
            onClick={() => setConfirmDelete(true)}
          >
            Item verwijderen
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Item verwijderen?</h2>
            <p>Dit agenda-item wordt permanent verwijderd.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Annuleren
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
