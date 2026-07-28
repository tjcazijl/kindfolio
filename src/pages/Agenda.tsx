import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { updateEvent } from '../api'
import { expandEvents, recurrenceLabel, type Occurrence } from '../utils/recurrence'
import { EVENT_META } from '../utils/events'
import { todayISO, toISODate, formatDateShort } from '../utils/dates'

export function Agenda() {
  const navigate = useNavigate()
  const { events, children, focusPoints, canEdit, reload } = useData()

  const today = todayISO()
  const tomorrow = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toISODate(d)
  }, [])
  const yesterday = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toISODate(d)
  }, [])

  // Afgelopen week blijft staan (om nog memo's bij te kunnen schrijven),
  // vandaag t/m een jaar vooruit.
  const rangeStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return toISODate(d)
  }, [])
  const rangeEnd = useMemo(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() + 1)
    return toISODate(d)
  }, [])

  const occurrences = useMemo(
    () => expandEvents(events, rangeStart, rangeEnd),
    [events, rangeStart, rangeEnd],
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

  // Afgelopen dagen apart, zodat je niet langs het verleden hoeft te scrollen.
  const pastGroups = useMemo(() => groups.filter(([d]) => d < today), [groups, today])
  const upcomingGroups = useMemo(
    () => groups.filter(([d]) => d >= today),
    [groups, today],
  )
  const pastCount = useMemo(
    () => pastGroups.reduce((n, [, items]) => n + items.length, 0),
    [pastGroups],
  )
  const [showPast, setShowPast] = useState(false)

  function headerLabel(iso: string): string {
    if (iso === today) return 'Vandaag'
    if (iso === tomorrow) return 'Morgen'
    if (iso === yesterday) return 'Gisteren'
    const s = formatDateShort(iso)
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  // Vanuit een agenda-item direct een (voorgevulde) memo maken.
  function makeMemo(o: Occurrence) {
    navigate('/memo/nieuw', {
      state: {
        eventPrefill: {
          title: o.event.title,
          date: o.date,
          childIds: o.event.childIds,
          subjects: o.event.subjects,
        },
      },
    })
  }

  const childById = useMemo(() => {
    const m: Record<string, (typeof children)[number]> = {}
    for (const c of children) m[c.id] = c
    return m
  }, [children])

  // Tijdloze items binnen een dag handmatig verplaatsen (op tijd sorterende items
  // staan al vast op tijd).
  async function moveTimeless(dayItems: Occurrence[], occ: Occurrence, dir: -1 | 1) {
    const order = dayItems.filter((i) => !i.event.time).map((i) => i.event)
    const idx = order.findIndex((e) => e.id === occ.event.id)
    const j = idx + dir
    if (idx < 0 || j < 0 || j >= order.length) return
    ;[order[idx], order[j]] = [order[j], order[idx]]
    await Promise.all(
      order.map((ev, i) =>
        ev.sortOrder === i ? Promise.resolve() : updateEvent(ev.id, { sortOrder: i }),
      ),
    )
    await reload()
  }

  // Springt naar het gekoppelde aandachtspunt, zodat je het daar kunt afvinken.
  function goToFocus(focusId: string) {
    const fp = focusPoints.find((f) => f.id === focusId)
    if (!fp) return
    navigate(`/kind/${fp.childId}/aandacht`, {
      state: { highlightFocusId: focusId },
    })
  }

  function renderGroup([date, items]: [string, Occurrence[]]) {
    const timeless = items.filter((i) => !i.event.time)
    return (
      <div key={date} className="agenda-group">
        <div className="agenda-group-head">{headerLabel(date)}</div>
        {items.map((o) => {
          const ev = o.event
          const meta = EVENT_META[ev.type]
          const kids = ev.childIds.map((id) => childById[id]).filter(Boolean)
          const rep = recurrenceLabel(ev)
          // Reorder tonen voor tijdloze items als er meer dan één is die dag.
          const tIdx = ev.time ? -1 : timeless.findIndex((i) => i.event.id === ev.id)
          const showReorder = canEdit && tIdx >= 0 && timeless.length > 1
          // Gekoppelde aandachtspunten die nog niet afgevinkt zijn.
          const openFocus = ev.focusIds
            .map((id) => focusPoints.find((f) => f.id === id))
            .filter((f): f is NonNullable<typeof f> => !!f && f.status !== 'done')
          return (
            <div
              key={`${ev.id}-${o.date}`}
              className={`agenda-item ${o.date < today ? 'past' : ''}`}
            >
              <button
                className="agenda-item-open"
                onClick={() => navigate(`/agenda/${ev.id}`)}
              >
                <span className={`ev-ic ${ev.type}`}>{meta.icon}</span>
                <span className="agenda-item-main">
                  <span className="agenda-item-title">
                    {ev.title}
                    <span className={`ev-badge ${ev.type}`}>
                      {meta.label.toLowerCase()}
                    </span>
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
                    {ev.subjects.length > 0 && (
                      <span className="ev-subjects">{ev.subjects.join(', ')}</span>
                    )}
                    {rep && <span className="ev-rep">↻ {rep}</span>}
                  </span>
                  {openFocus.length > 0 && (
                    <span className="ev-focus">
                      {openFocus.map((f) => (
                        <span key={f.id} className="ev-focus-item">
                          📌 {f.text}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
              {canEdit && openFocus.length > 0 && (
                <button
                  className="agenda-memo-btn focus"
                  aria-label="Naar aandachtspunt"
                  title="Naar aandachtspunt"
                  onClick={() => goToFocus(openFocus[0].id)}
                >
                  📌
                </button>
              )}
              {canEdit && (
                <button
                  className="agenda-memo-btn"
                  aria-label="Notitie maken"
                  title="Notitie maken"
                  onClick={() => makeMemo(o)}
                >
                  📝
                </button>
              )}
              {showReorder ? (
                <span className="agenda-reorder">
                  <button
                    className="reorder-btn"
                    aria-label="Omhoog"
                    disabled={tIdx === 0}
                    onClick={() => moveTimeless(items, o, -1)}
                  >
                    ▲
                  </button>
                  <button
                    className="reorder-btn"
                    aria-label="Omlaag"
                    disabled={tIdx === timeless.length - 1}
                    onClick={() => moveTimeless(items, o, 1)}
                  >
                    ▼
                  </button>
                </span>
              ) : (
                <span className="chev">›</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

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

      {/* Afgelopen dagen apart en standaard ingeklapt. */}
      {pastCount > 0 && (
        <div className="past-section">
          <button
            className="collapse-head"
            onClick={() => setShowPast((v) => !v)}
          >
            <span>
              <strong>Afgelopen</strong>
              <span className="hint inline"> · {pastCount}</span>
            </span>
            <span className="chevron">{showPast ? '▾' : '▸'}</span>
          </button>
          {showPast && <div className="past-list">{pastGroups.map(renderGroup)}</div>}
        </div>
      )}

      {upcomingGroups.map(renderGroup)}

      {upcomingGroups.length === 0 && pastCount > 0 && (
        <p className="empty-note">Niets meer gepland vanaf vandaag.</p>
      )}
    </div>
  )
}
