import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { MemoCard } from '../components/MemoCard'
import { ChildForm } from '../components/ChildForm'
import { ChildSubjectsEditor } from '../components/ChildSubjectsEditor'
import { childAge, periodRange, shiftPeriod } from '../utils/dates'

type Filter = 'week' | 'maand' | 'alles'

// Kleine lijn-iconen voor de actie-knoppen.
const IconMemo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 12v5M9.5 14.5h5" />
  </svg>
)
const IconBook = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.5C10.5 5.5 8 5 4 5v13c4 0 6.5.5 8 1.5 1.5-1 4-1.5 8-1.5V5c-4 0-6.5.5-8 1.5z" />
    <path d="M12 6.5V19" />
  </svg>
)
const IconHeart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 8.6c0 4.6-8.8 9.9-8.8 9.9S3.2 13.2 3.2 8.6C3.2 6 5.2 4 7.8 4c1.7 0 3.2.9 4.2 2.3C13 4.9 14.5 4 16.2 4c2.6 0 4.6 2 4.6 4.6z" />
  </svg>
)

export function ChildTimeline() {
  const { childId } = useParams()
  const navigate = useNavigate()
  const {
    children,
    memos,
    focusPoints,
    loading,
    updateChild,
    canEdit,
    subjects: accountSubjects,
    subcategories: accountSubcats,
  } = useData()
  const [editing, setEditing] = useState(false)
  const [showSubjects, setShowSubjects] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [filter, setFilter] = useState<Filter>('week')
  const [refDate, setRefDate] = useState(new Date())
  const [search, setSearch] = useState('')

  const child = children.find((c) => c.id === childId)

  const childMemos = useMemo(
    () =>
      memos
        .filter((m) => m.childId === childId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [memos, childId],
  )

  const openFocusCount = useMemo(
    () => focusPoints.filter((f) => f.childId === childId && f.status === 'open').length,
    [focusPoints, childId],
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

  function toggleSearch() {
    setShowSearch((v) => {
      if (v) setSearch('')
      return !v
    })
  }

  const age = childAge(child)

  if (editing) {
    return (
      <div className="page">
        <div className="topbar">
          <button className="link-btn" onClick={() => navigate('/')}>
            ‹ Kinderen
          </button>
        </div>
        <ChildForm
          initial={{ name: child.name, birthDate: child.birthDate, color: child.color }}
          submitLabel="Opslaan"
          onSubmit={onSaveChild}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/')}>
          ‹ Kinderen
        </button>
        {canEdit && (
          <button className="link-btn edit-link" onClick={() => setEditing(true)}>
            <span className="edit-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </span>
            Bewerken
          </button>
        )}
      </div>

      <div className="child-hero" style={{ borderColor: child.color }}>
        <div className="child-hero-head">
          <span className="avatar lg" style={{ background: child.color }}>
            {child.name.charAt(0).toUpperCase()}
          </span>
          <div className="grow">
            <h1>{child.name}</h1>
            {age != null && <div className="child-age">{age} jaar</div>}
          </div>
        </div>

        {canEdit ? (
          <div className="child-actions">
            <button
              className="child-act primary"
              onClick={() => navigate(`/kind/${child.id}/memo/nieuw`)}
            >
              <span className="ca-badge">
                <IconMemo />
              </span>
              <span className="ca-lb">Nieuwe memo</span>
            </button>
            <button className="child-act" onClick={() => setShowSubjects((v) => !v)}>
              <span className="ca-badge book">
                <IconBook />
              </span>
              <span className="ca-lb">Vakgebieden</span>
            </button>
            <button
              className="child-act"
              onClick={() => navigate(`/kind/${child.id}/aandacht`)}
            >
              <span className="ca-badge heart">
                <IconHeart />
                {openFocusCount > 0 && <span className="ca-count">{openFocusCount}</span>}
              </span>
              <span className="ca-lb">Aandacht</span>
            </button>
          </div>
        ) : (
          <div className="child-actions single">
            <button
              className="child-act"
              onClick={() => navigate(`/kind/${child.id}/aandacht`)}
            >
              <span className="ca-badge heart">
                <IconHeart />
              </span>
              <span className="ca-lb">Aandachtspunten</span>
            </button>
          </div>
        )}
      </div>

      {showSubjects && canEdit && (
        <section className="card-section">
          <ChildSubjectsEditor
            childName={child.name}
            accountSubjects={accountSubjects}
            accountSubcats={accountSubcats}
            childSubjects={child.subjects ?? []}
            childSubcats={child.subcategories ?? {}}
            onChange={(subjects, subcategories) =>
              updateChild(child.id, { subjects, subcategories })
            }
          />
        </section>
      )}

      <div className="child-toolbar">
        <div className="seg timeline-seg">
          {(['week', 'maand', 'alles'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`seg-btn ${!search.trim() && filter === f ? 'on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          className={`search-ic-btn ${showSearch ? 'on' : ''}`}
          onClick={toggleSearch}
          aria-label="Zoeken"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </button>
      </div>

      {showSearch && (
        <input
          className="input search-input"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek in memo’s…"
        />
      )}

      {!search.trim() && range && (
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

      <p className="count-line">
        {visible.length} memo{visible.length === 1 ? '' : "'s"}
        {search.trim() ? ' gevonden' : range ? ' in deze periode' : ' in totaal'}
      </p>

      <div className="timeline feed">
        {visible.map((m) => (
          <MemoCard key={m.id} memo={m} child={child} canEdit={canEdit} />
        ))}
      </div>
    </div>
  )
}
