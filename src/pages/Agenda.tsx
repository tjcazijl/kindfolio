import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { expandEvents, recurrenceLabel, type Occurrence } from '../utils/recurrence'
import { EVENT_META } from '../utils/events'
import { todayISO, toISODate, formatDateShort } from '../utils/dates'

export function Agenda() {
  const navigate = useNavigate()
  const { events, children, canEdit } = useData()

  const today = todayISO()
  const tomorrow = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toISODate(d)
  }, [])

  // Vandaag t/m een jaar vooruit.
  const rangeEnd = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return toISODate(d)
  }, [])

  const occurrences = useMemo(
    () => expandEvents(events, today, rangeEnd),
    [events, today, rangeEnd],
  )

  // Groeperen per datum, met behoud van de sortering.
  const groups = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of occurrences) {
      if (!map.has(o.date)) map.set(o.date, [])
      map.get(o.date)!.push(o)
    }
    return [...map.entries()]
  }, [occurrences])

  function headerLabel(iso: string): string {
    if (iso === today) return 'Vandaag'
    if (iso === tomorrow) return 'Morgen'
    const s = formatDateShort(iso)
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const childById = useMemo(() => {
    const m: Record<string, (typeof children)[number]> = {}
    for (const c of children) m[c.id] = c
    return m
  }, [children])

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/')}>
          ‹ Home
        </button>
        {canEdit && (
          <button
            className="icon-btn"
            onClick={() => navigate('/agenda/nieuw')}
            aria-label="Agenda-item toevoegen"
            title="Agenda-item toevoegen"
          >
            +
          </button>
        )}
      </div>

      <header className="page-head">
        <h1>Agenda</h1>
        <p className="subtitle">Geplande uitjes, taken en lessen</p>
      </header>

      {groups.length === 0 && (
        <div className="empty">
          <p>Nog niets gepland.</p>
          {canEdit && (
            <button className="btn primary" onClick={() => navigate('/agenda/nieuw')}>
              + Eerste item toevoegen
            </button>
          )}
        </div>
      )}

      {groups.map(([date, items]) => (
        <div key={date} className="agenda-group">
          <div className="agenda-group-head">{headerLabel(date)}</div>
          {items.map((o) => {
            const ev = o.event
            const meta = EVENT_META[ev.type]
            const kids = ev.childIds.map((id) => childById[id]).filter(Boolean)
            const rep = recurrenceLabel(ev)
            return (
              <button
                key={`${ev.id}-${o.date}`}
                className="agenda-item"
                onClick={() => navigate(`/agenda/${ev.id}`)}
              >
                <span className={`ev-ic ${ev.type}`}>{meta.icon}</span>
                <span className="agenda-item-main">
                  <span className="agenda-item-title">
                    {ev.title}
                    <span className={`ev-badge ${ev.type}`}>{meta.label.toLowerCase()}</span>
                  </span>
                  <span className="agenda-item-meta">
                    {ev.time && <span className="ev-time">{ev.time}</span>}
                    {kids.length > 0 && (
                      <span className="ev-kids">
                        {kids.map((c) => (
                          <span
                            key={c!.id}
                            className="ev-dot"
                            style={{ background: c!.color }}
                          />
                        ))}
                        {kids.map((c) => c!.name).join(', ')}
                      </span>
                    )}
                    {rep && <span className="ev-rep">↻ {rep}</span>}
                  </span>
                </span>
                <span className="chev">›</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
