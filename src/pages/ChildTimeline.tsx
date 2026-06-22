import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { PhotoThumb } from '../components/PhotoThumb'
import { ChildForm } from '../components/ChildForm'
import { SubjectsEditor } from '../components/SubjectsEditor'
import {
  childAge,
  formatDateShort,
  periodRange,
  shiftPeriod,
} from '../utils/dates'

type Filter = 'week' | 'maand' | 'alles'

export function ChildTimeline() {
  const { childId } = useParams()
  const navigate = useNavigate()
  const {
    children,
    memos,
    loading,
    updateChild,
    canEdit,
    subjects: accountSubjects,
  } = useData()
  const [editing, setEditing] = useState(false)
  const [showSubjects, setShowSubjects] = useState(false)
  const [filter, setFilter] = useState<Filter>('week')
  const [refDate, setRefDate] = useState(new Date())
  const [search, setSearch] = useState('')

  const child = children.find((c) => c.id === childId)

  const childMemos = useMemo(
    () =>
      memos
        .filter((m) => m.childId === childId)
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
        ),
    [memos, childId],
  )

  const range = useMemo(
    () => (filter === 'alles' ? null : periodRange(filter, refDate)),
    [filter, refDate],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) {
      return childMemos.filter(
        (m) =>
          m.text.toLowerCase().includes(q) ||
          m.subjects.some((s) => s.toLowerCase().includes(q)),
      )
    }
    if (range) {
      return childMemos.filter((m) => m.date >= range.start && m.date <= range.end)
    }
    return childMemos
  }, [childMemos, search, range])

  if (loading && !child) return <div className="page">Laden…</div>
  if (!child)
    return (
      <div className="page">
        <p>Kind niet gevonden.</p>
        <button className="btn outline" onClick={() => navigate('/')}>
          Terug
        </button>
      </div>
    )

  async function onSaveChild(data: {
    name: string
    birthDate?: string
    color: string
  }) {
    if (!childId) return
    await updateChild(childId, {
      name: data.name,
      color: data.color,
      birthDate: data.birthDate ?? null,
    })
    setEditing(false)
  }

  const age = childAge(child)

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/')}>
          ‹ Kinderen
        </button>
      </div>

      {editing ? (
        <ChildForm
          initial={{
            name: child.name,
            birthDate: child.birthDate,
            color: child.color,
          }}
          submitLabel="Opslaan"
          onSubmit={onSaveChild}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <header className="child-head" style={{ borderColor: child.color }}>
          <span className="avatar lg" style={{ background: child.color }}>
            {child.name.charAt(0).toUpperCase()}
          </span>
          <div className="grow">
            <h1>{child.name}</h1>
            {age != null && <div className="child-age">{age} jaar</div>}
            {canEdit && (
              <div className="row gap small-actions">
                <button className="link-btn" onClick={() => setEditing(true)}>
                  Bewerken
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {canEdit && (
        <button
          className="btn primary full big"
          onClick={() => navigate(`/kind/${child.id}/memo/nieuw`)}
        >
          + Nieuwe memo
        </button>
      )}

      {canEdit && (
        <section className="card-section">
          <button
            className="collapse-head"
            onClick={() => setShowSubjects((v) => !v)}
          >
            <span>
              <strong>Vakgebieden</strong>
              <span className="hint inline">
                {' '}
                {child.subjects
                  ? `eigen lijst (${child.subjects.length})`
                  : 'volgt accountlijst'}
              </span>
            </span>
            <span className="chevron">{showSubjects ? '▾' : '▸'}</span>
          </button>
          {showSubjects && (
            <div style={{ marginTop: 12 }}>
              <p className="hint">
                Deze vakgebieden kun je bij {child.name} per memo kiezen.{' '}
                {child.subjects
                  ? 'Dit is een eigen lijst voor dit kind.'
                  : 'Nu gelijk aan de accountlijst — pas aan voor een eigen lijst.'}
              </p>
              <SubjectsEditor
                subjects={child.subjects ?? accountSubjects}
                onChange={(next) => updateChild(child.id, { subjects: next })}
                reset={
                  child.subjects
                    ? {
                        label: 'Terug naar accountlijst',
                        onClick: () => updateChild(child.id, { subjects: null }),
                      }
                    : undefined
                }
              />
            </div>
          )}
        </section>
      )}

      {/* Zoeken / filteren */}
      <input
        className="input search-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Zoek in memo's…"
      />

      {!search.trim() && (
        <>
          <div className="seg timeline-seg">
            {(['week', 'maand', 'alles'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`seg-btn ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {range && (
            <div className="period-nav">
              <button
                className="link-btn"
                onClick={() => setRefDate((d) => shiftPeriod(filter as 'week' | 'maand', d, -1))}
              >
                ‹ Vorige
              </button>
              <span className="period-label">{range.label}</span>
              <button
                className="link-btn"
                onClick={() => setRefDate((d) => shiftPeriod(filter as 'week' | 'maand', d, 1))}
              >
                Volgende ›
              </button>
            </div>
          )}
        </>
      )}

      <p className="count-line">
        {visible.length} memo{visible.length === 1 ? '' : "'s"}
        {search.trim()
          ? ' gevonden'
          : range
            ? ' in deze periode'
            : ' in totaal'}
      </p>

      <div className="timeline">
        {visible.map((m) => (
          <button
            key={m.id}
            className={`memo-card${m.draft ? ' is-draft' : ''}`}
            onClick={() => navigate(`/kind/${child.id}/memo/${m.id}`)}
          >
            <div className="memo-date">
              {formatDateShort(m.date)}
              {m.draft && <span className="draft-badge">Concept</span>}
            </div>
            {m.subjects.length > 0 && (
              <div className="tags">
                {m.subjects.map((s) => (
                  <span key={s} className="tag">
                    {s}
                  </span>
                ))}
              </div>
            )}
            {m.text && <p className="memo-text">{m.text}</p>}
            {m.photoIds.length > 0 && (
              <div className="thumb-row">
                {m.photoIds.slice(0, 4).map((pid) => (
                  <PhotoThumb key={pid} photoId={pid} />
                ))}
                {m.photoIds.length > 4 && (
                  <span className="more">+{m.photoIds.length - 4}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
