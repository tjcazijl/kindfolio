import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import type { AgendaEvent, FocusPoint, FocusStatus } from '../types'
import { formatDateNumeric, formatDateShort, todayISO } from '../utils/dates'
import { expandEvents } from '../utils/recurrence'

const TABS: { key: FocusStatus; label: string }[] = [
  { key: 'open', label: 'Nu oefenen' },
  { key: 'later', label: 'Voor later' },
  { key: 'done', label: 'Klaar' },
]

function isoFromTs(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function FocusPoints() {
  const { childId } = useParams()
  const navigate = useNavigate()
  const {
    children,
    focusPoints,
    events,
    addFocus,
    editFocus,
    removeFocus,
    canWrite,
    subjects: accountSubjects,
  } = useData()

  // Vanuit de agenda kun je rechtstreeks naar één aandachtspunt springen.
  const location = useLocation()
  const highlightId = (location.state as any)?.highlightFocusId as
    | string
    | undefined
  const highlighted = focusPoints.find((f) => f.id === highlightId)

  const [tab, setTab] = useState<FocusStatus>(highlighted?.status ?? 'open')
  const markRef = useRef<HTMLDivElement>(null)

  // Het aangewezen punt in beeld brengen zodra de lijst er staat.
  useEffect(() => {
    if (highlightId && markRef.current) {
      markRef.current.scrollIntoView({ block: 'center' })
    }
  }, [highlightId])
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [later, setLater] = useState(false)
  const [busy, setBusy] = useState(false)

  const child = children.find((c) => c.id === childId)

  const mine = useMemo(
    () => focusPoints.filter((f) => f.childId === childId),
    [focusPoints, childId],
  )
  const counts = useMemo(
    () => ({
      open: mine.filter((f) => f.status === 'open').length,
      later: mine.filter((f) => f.status === 'later').length,
      done: mine.filter((f) => f.status === 'done').length,
    }),
    [mine],
  )
  const list = useMemo(
    () => mine.filter((f) => f.status === tab).sort((a, b) => b.createdAt - a.createdAt),
    [mine, tab],
  )

  const availableSubjects = useMemo(
    () => [...new Set([...accountSubjects, ...(child?.subjects || [])])],
    [accountSubjects, child],
  )

  // Welk agenda-item hoort bij welk aandachtspunt, en wanneer is het eerstvolgend?
  const planned = useMemo(() => {
    const map = new Map<string, { event: AgendaEvent; date: string }>()
    const linked = events.filter((e) => e.focusIds.length > 0)
    if (linked.length === 0) return map
    const from = todayISO()
    const tot = `${Number(from.slice(0, 4)) + 1}${from.slice(4)}`
    for (const occ of expandEvents(linked, from, tot)) {
      for (const fid of occ.event.focusIds) if (!map.has(fid)) map.set(fid, occ)
    }
    // Alleen in het verleden gepland? Dan toch tonen, met die datum.
    for (const ev of linked) {
      for (const fid of ev.focusIds) {
        if (!map.has(fid)) map.set(fid, { event: ev, date: ev.date })
      }
    }
    return map
  }, [events])

  /** Agenda-icoon: naar het gekoppelde item, of een nieuw item aanmaken. */
  function goToAgenda(f: FocusPoint) {
    const hit = planned.get(f.id)
    if (hit) {
      navigate(`/agenda/${hit.event.id}`)
      return
    }
    navigate('/agenda/nieuw', {
      state: {
        focusPrefill: {
          focusIds: [f.id],
          childIds: [f.childId],
          subjects: f.subject ? [f.subject] : [],
          title: f.text,
        },
      },
    })
  }

  if (!child)
    return (
      <div className="page">
        <p>Kind niet gevonden.</p>
        <button className="btn outline" onClick={() => navigate('/')}>
          Terug
        </button>
      </div>
    )

  async function toggleDone(f: FocusPoint) {
    await editFocus(f.id, { status: f.status === 'done' ? 'open' : 'done' })
  }
  async function move(f: FocusPoint, status: FocusStatus) {
    await editFocus(f.id, { status })
  }
  async function del(f: FocusPoint) {
    if (confirm('Dit aandachtspunt verwijderen?')) await removeFocus(f.id)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      await addFocus({
        childId,
        text: t,
        subject: subject || undefined,
        status: later ? 'later' : 'open',
      })
      setText('')
      setSubject('')
      setLater(false)
      setAdding(false)
      setTab(later ? 'later' : 'open')
    } catch (err: any) {
      alert(err?.message || 'Toevoegen mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate(`/kind/${child.id}`)}>
          ‹ {child.name}
        </button>
      </div>
      <header className="page-head">
        <h1>Aandachtspunten</h1>
        <p className="subtitle">Waar {child.name} mee oefent</p>
      </header>

      <div className="seg">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`seg-btn ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} · {counts[t.key]}
          </button>
        ))}
      </div>

      <div className="fp-list">
        {list.length === 0 && (
          <p className="empty-note">
            {tab === 'open'
              ? 'Nog geen aandachtspunten. Voeg er een toe of markeer er een in een memo.'
              : tab === 'later'
                ? 'Niets voor later.'
                : 'Nog niets afgerond.'}
          </p>
        )}

        {list.map((f) => (
          <div
            key={f.id}
            ref={f.id === highlightId ? markRef : undefined}
            className={`fp ${f.status === 'done' ? 'done' : ''} ${
              f.id === highlightId ? 'highlight' : ''
            }`}
          >
            <button
              className="fp-check"
              onClick={() => canWrite && toggleDone(f)}
              disabled={!canWrite}
              aria-label={f.status === 'done' ? 'Terugzetten' : 'Onder de knie'}
            >
              {f.status === 'done' ? '✓' : ''}
            </button>
            <div className="fp-main">
              <div className="fp-title">{f.text}</div>
              <div className="fp-meta">
                {f.subject && <span className="subj-badge">{f.subject}</span>}
                {planned.has(f.id) && (
                  <span className="fp-planned">
                    📅 {formatDateShort(planned.get(f.id)!.date)}
                  </span>
                )}
                <span className="fp-src">
                  {f.sourceMemoId ? 'uit een memo' : 'los toegevoegd'} ·{' '}
                  {formatDateNumeric(isoFromTs(f.createdAt))}
                </span>
              </div>
              {canWrite && (
                <div className="fp-actions">
                  {f.status === 'later' && (
                    <button className="link-btn" onClick={() => move(f, 'open')}>
                      Nu oefenen
                    </button>
                  )}
                  {f.status === 'open' && (
                    <button className="link-btn" onClick={() => move(f, 'later')}>
                      Naar later
                    </button>
                  )}
                  <button className="link-btn danger" onClick={() => del(f)}>
                    Verwijderen
                  </button>
                </div>
              )}
            </div>
            {/* Bij een afgerond punt alleen nog de doorklik naar wat er
                gepland stond, zodat je dat kunt aanpassen of weghalen. */}
            {canWrite && (f.status !== 'done' || planned.has(f.id)) && (
              <button
                className={`fp-agenda${planned.has(f.id) ? ' on' : ''}`}
                onClick={() => goToAgenda(f)}
                title={
                  planned.has(f.id)
                    ? `Ingepland op ${formatDateShort(planned.get(f.id)!.date)} — open het agenda-item`
                    : 'Zet dit aandachtspunt in de agenda'
                }
                aria-label={
                  planned.has(f.id)
                    ? `Ingepland op ${formatDateShort(planned.get(f.id)!.date)}`
                    : 'In de agenda zetten'
                }
              >
                📅{planned.has(f.id) && <span className="fp-agenda-ok">✓</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      {canWrite &&
        (adding ? (
          <form className="fp-add" onSubmit={submit}>
            <input
              className="input"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Waar wil je op oefenen?"
            />
            {availableSubjects.length > 0 && (
              <select
                className="input"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">Vakgebied (optioneel)</option>
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={later}
                onChange={(e) => setLater(e.target.checked)}
              />
              Zet bij “Voor later” (i.p.v. nu oefenen)
            </label>
            <div className="save-row">
              <button
                className="btn primary"
                type="submit"
                disabled={busy || !text.trim()}
              >
                {busy ? 'Toevoegen…' : 'Toevoegen'}
              </button>
              <button
                className="btn outline white-bg"
                type="button"
                onClick={() => setAdding(false)}
              >
                Annuleren
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn outline full add-fp"
            onClick={() => setAdding(true)}
          >
            + Aandachtspunt toevoegen
          </button>
        ))}
    </div>
  )
}
