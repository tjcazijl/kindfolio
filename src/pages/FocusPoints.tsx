import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import type { FocusPoint, FocusStatus } from '../types'
import { formatDateNumeric } from '../utils/dates'

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
    addFocus,
    editFocus,
    removeFocus,
    canEdit,
    subjects: accountSubjects,
  } = useData()

  const [tab, setTab] = useState<FocusStatus>('open')
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
          <div key={f.id} className={`fp ${f.status === 'done' ? 'done' : ''}`}>
            <button
              className="fp-check"
              onClick={() => canEdit && toggleDone(f)}
              disabled={!canEdit}
              aria-label={f.status === 'done' ? 'Terugzetten' : 'Onder de knie'}
            >
              {f.status === 'done' ? '✓' : ''}
            </button>
            <div className="fp-main">
              <div className="fp-title">{f.text}</div>
              <div className="fp-meta">
                {f.subject && <span className="subj-badge">{f.subject}</span>}
                <span className="fp-src">
                  {f.sourceMemoId ? 'uit een memo' : 'los toegevoegd'} ·{' '}
                  {formatDateNumeric(isoFromTs(f.createdAt))}
                </span>
              </div>
              {canEdit && (
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
          </div>
        ))}
      </div>

      {canEdit &&
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
