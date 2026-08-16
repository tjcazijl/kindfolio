import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { ChildForm } from '../components/ChildForm'
import { childAge, formatDateNumeric, todayISO } from '../utils/dates'
import { expandEvents } from '../utils/recurrence'
import { EVENT_META } from '../utils/events'
import { vraagOverstap } from '../utils/kerndoelen'
import {
  CHANGELOG,
  LATEST_UPDATE_ID,
  latestSeenUpdate,
  markUpdatesSeen,
} from '../data/changelog'

export function Home() {
  const navigate = useNavigate()
  const {
    children,
    memos,
    events,
    loading,
    error,
    canEdit,
    role,
    ownerEmail,
    addChild,
    updateChild,
    kerndoelenEnabled,
  } = useData()

  // Kinderen die 12 zijn en nog op de po-set staan, zonder dat we het gevraagd
  // hebben. Alleen relevant als de kerndoelen überhaupt aanstaan.
  const overstappers = useMemo(
    () =>
      kerndoelenEnabled && canEdit
        ? vraagOverstap(children, (c) => childAge(c) ?? null)
        : [],
    [children, kerndoelenEnabled, canEdit],
  )

  const memoCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of memos) map[m.childId] = (map[m.childId] || 0) + 1
    return map
  }, [memos])

  // Wat staat er vandaag gepland? (ook voor het bolletje op het agenda-icoon)
  const vandaag = useMemo(() => {
    const t = todayISO()
    return expandEvents(events, t, t)
  }, [events])
  const hasAgendaToday = vandaag.length > 0

  const [adding, setAdding] = useState(false)
  const [updateSeen, setUpdateSeen] = useState(latestSeenUpdate())
  const latestUpdate = CHANGELOG[0]
  const hasUpdate = !!LATEST_UPDATE_ID && updateSeen !== LATEST_UPDATE_ID

  async function onAdd(data: { name: string; birthDate?: string; color: string }) {
    try {
      await addChild({
        name: data.name,
        color: data.color,
        birthDate: data.birthDate ?? null,
      })
      setAdding(false)
    } catch (err: any) {
      alert(err?.message || 'Toevoegen mislukt')
    }
  }

  return (
    <div className="page">
      <header className="page-head with-action">
        <div>
          <h1>Kindfolio</h1>
          <p className="subtitle">
            {role === 'commenter'
              ? `Je kijkt mee in het portfolio van ${ownerEmail}`
              : role === 'editor'
                ? `Je werkt samen in het portfolio van ${ownerEmail}`
                : 'Thuisonderwijs logboek'}
          </p>
        </div>
        <div className="head-actions">
          <button
            className="icon-btn"
            onClick={() => navigate('/leermiddelen')}
            aria-label="Leermiddelen"
            title="Leermiddelen"
          >
            <span className="icon-cal">📚</span>
          </button>
          <button
            className="icon-btn"
            onClick={() => navigate('/agenda')}
            aria-label="Agenda"
            title="Agenda"
          >
            <span className="icon-cal">📅</span>
            {hasAgendaToday && <span className="icon-badge" />}
          </button>
          {canEdit && children.length > 0 && (
            <button
              className="icon-btn"
              onClick={() => setAdding(true)}
              aria-label="Kind toevoegen"
              title="Kind toevoegen"
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="7.5" r="3.4" />
                <path d="M3.6 20c0-3.4 2.4-5.8 5.4-5.8 1.1 0 2.1.3 3 .85" />
                <path d="M18 14.5v5M15.5 17h5" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {hasUpdate && latestUpdate && (
        <div
          className="update-banner"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/updates')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/updates')}
        >
          <span className="update-emoji">✨</span>
          <div className="update-banner-text">
            <strong>Nieuwe update</strong>
            <span className="update-banner-sub">
              {latestUpdate.title} · {formatDateNumeric(latestUpdate.date)}
            </span>
          </div>
          <button
            className="update-banner-x"
            aria-label="Melding verbergen"
            onClick={(e) => {
              e.stopPropagation()
              markUpdatesSeen()
              setUpdateSeen(LATEST_UPDATE_ID)
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Eén keer vragen bij de twaalfde verjaardag — de app schakelt nooit zelf. */}
      {overstappers.map((c) => (
        <div key={c.id} className="kd-nudge">
          <p className="kd-nudge-t">{c.name} is {childAge(c)} geworden 🎂</p>
          <p>
            Vanaf ongeveer deze leeftijd gelden de kerndoelen voor de onderbouw
            van het voortgezet onderwijs. Zullen we overstappen? Wat je al hebt
            vastgelegd blijft staan zoals het is.
          </p>
          <div className="kd-nudge-acties">
            <button
              className="btn primary"
              onClick={() =>
                updateChild(c.id, { kerndoelenSet: 'vo', kerndoelenAsked: true })
              }
            >
              Overstappen
            </button>
            <button
              className="btn outline white-bg"
              onClick={() => updateChild(c.id, { kerndoelenAsked: true })}
            >
              Nog niet
            </button>
          </div>
        </div>
      ))}

      {loading && <p className="empty-note">Laden…</p>}
      {error && <div className="banner warn">Verbinden mislukt: {error}</div>}

      {!loading && children.length === 0 && !adding && (
        <div className="empty">
          {canEdit ? (
            <>
              <p>Nog geen kinderen toegevoegd.</p>
              <button className="btn primary" onClick={() => setAdding(true)}>
                + Eerste kind toevoegen
              </button>
            </>
          ) : (
            <p>Dit portfolio heeft nog geen kinderen.</p>
          )}
        </div>
      )}

      <div className="child-grid">
        {children.map((c) => {
          const age = childAge(c)
          const count = memoCounts[c.id] || 0
          return (
            <button
              key={c.id}
              className="child-card"
              style={{ borderColor: c.color }}
              onClick={() => navigate(`/kind/${c.id}`)}
            >
              <span className="avatar" style={{ background: c.color }}>
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="child-name">{c.name}</span>
              <span className="child-meta">
                {age != null && `${age} jaar · `}
                {count} memo{count === 1 ? '' : "'s"}
              </span>
            </button>
          )
        })}
      </div>

      {canEdit &&
        (adding ? (
          <ChildForm
            submitLabel="Opslaan"
            onSubmit={onAdd}
            onCancel={() => setAdding(false)}
          />
        ) : (
          children.length > 0 && (
            <button
              className="btn primary full big"
              onClick={() => navigate('/memo/nieuw')}
            >
              + Memo toevoegen
            </button>
          )
        ))}

      {vandaag.length > 0 && (
        <section className="today">
          <div className="today-head">
            <span className="today-title">📅 Vandaag</span>
            <button className="link-btn" onClick={() => navigate('/agenda')}>
              Agenda ›
            </button>
          </div>
          {vandaag.map((o) => {
            const ev = o.event
            const meta = EVENT_META[ev.type]
            const kids = ev.childIds
              .map((id) => children.find((c) => c.id === id))
              .filter(Boolean)
            return (
              <button
                key={`${ev.id}-${o.date}`}
                className="today-item"
                onClick={() => navigate(`/agenda/${ev.id}`)}
              >
                <span className={`ev-ic sm ${ev.type}`}>{meta.icon}</span>
                <span className="today-main">
                  <span className="today-item-title">{ev.title}</span>
                  {(ev.time || kids.length > 0) && (
                    <span className="today-item-meta">
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
                    </span>
                  )}
                </span>
                <span className="chev">›</span>
              </button>
            )
          })}
        </section>
      )}

      <footer className="home-footer">
        <button className="link-btn" onClick={() => navigate('/updates')}>
          ✨ Wat is er nieuw
        </button>
        <p className="version-note">
          Kindfolio v{__APP_VERSION__}
        </p>
      </footer>
    </div>
  )
}
