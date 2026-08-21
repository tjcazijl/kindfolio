import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { EVENT_META } from '../utils/events'
import { expandEvents, recurrenceLabel } from '../utils/recurrence'
import { formatDateLong, todayISO, toISODate } from '../utils/dates'

export function EventDetail() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { events, children, canEdit, removeEvent } = useData()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const ev = events.find((e) => e.id === eventId)
  if (!ev) return <div className="page">Laden…</div>

  const meta = EVENT_META[ev.type]
  const kids = ev.childIds
    .map((id) => children.find((c) => c.id === id))
    .filter(Boolean)

  // Eerstvolgende keer (vanaf vandaag); anders de ankerdatum (verleden).
  const rangeEnd = (() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 2)
    return toISODate(d)
  })()
  const upcoming = expandEvents([ev], todayISO(), rangeEnd)
  const shownDate = upcoming[0]?.date || ev.date
  const rep = recurrenceLabel(ev)
  // Loopt dit item over meerdere dagen? Dan de einddag van déze keer erbij.
  const spanEinde = (() => {
    if (!ev.end || ev.end <= ev.date) return null
    const dagen = Math.round(
      (new Date(ev.end + 'T12:00:00Z').getTime() - new Date(ev.date + 'T12:00:00Z').getTime()) / 86400000,
    )
    const d = new Date(shownDate + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + dagen)
    return d.toISOString().slice(0, 10)
  })()

  async function remove() {
    await removeEvent(ev!.id)
    navigate('/agenda')
  }

  function makeMemo() {
    navigate('/memo/nieuw', {
      state: {
        eventPrefill: {
          title: ev!.title,
          date: shownDate,
          childIds: ev!.childIds,
          subjects: ev!.subjects,
        },
      },
    })
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/agenda')}>
          ‹ Agenda
        </button>
        {canEdit && (
          <button
            className="link-btn"
            onClick={() => navigate(`/agenda/${ev.id}/bewerken`)}
          >
            Bewerken
          </button>
        )}
      </div>

      <div className="event-hero">
        <span className={`event-hero-ic ${ev.type}`}>{meta.icon}</span>
        <h1>{ev.title}</h1>
        <span className={`ev-badge ${ev.type}`}>{meta.label.toLowerCase()}</span>
      </div>

      <div className="event-meta">
        <div className="event-meta-row">
          <span className="emi">📆</span>
          <span className="emk">Wanneer</span>
          <span className="emv">
            {formatDateLong(shownDate)}
            {/* Meerdaags: de hele reeks tonen, niet alleen de eerste dag. */}
            {spanEinde ? ` t/m ${formatDateLong(spanEinde)}` : ''}
            {ev.time ? ` · ${ev.time}` : ''}
          </span>
        </div>
        {rep && (
          <div className="event-meta-row">
            <span className="emi">↻</span>
            <span className="emk">Herhaalt</span>
            <span className="emv">{rep}</span>
          </div>
        )}
        {kids.length > 0 && (
          <div className="event-meta-row">
            <span className="emi">🧒</span>
            <span className="emk">{kids.length === 1 ? 'Kind' : 'Kinderen'}</span>
            <span className="emv ev-kids">
              {kids.map((c) => (
                <span key={c!.id} className="ev-dot" style={{ background: c!.color }} />
              ))}
              {kids.map((c) => c!.name).join(', ')}
            </span>
          </div>
        )}
        {ev.subjects.length > 0 && (
          <div className="event-meta-row">
            <span className="emi">📚</span>
            <span className="emk">Vakgebieden</span>
            <span className="emv">{ev.subjects.join(', ')}</span>
          </div>
        )}
        {ev.notes && (
          <div className="event-meta-row">
            <span className="emi">📝</span>
            <span className="emk">Notitie</span>
            <span className="emv">{ev.notes}</span>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="event-memo-cta">
          <p>Klaar of iets te melden? Zet het meteen in het logboek — datum en kind staan al ingevuld.</p>
          <button className="btn primary full" onClick={makeMemo}>
            📝 Memo maken van dit item
          </button>
        </div>
      )}

      {canEdit && (
        <div className="stack-actions">
          <button
            className="btn danger-outline full white-bg"
            onClick={() => setConfirmDelete(true)}
          >
            Item verwijderen
          </button>
        </div>
      )}

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
