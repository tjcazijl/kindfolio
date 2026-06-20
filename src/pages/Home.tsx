import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import { ChildForm } from '../components/ChildForm'
import { childAge } from '../utils/dates'

export function Home() {
  const navigate = useNavigate()
  const { children, memos, loading, error, canEdit, role, ownerEmail, addChild } =
    useData()

  const memoCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of memos) map[m.childId] = (map[m.childId] || 0) + 1
    return map
  }, [memos])

  const [adding, setAdding] = useState(false)

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
          <h1>Portfolio</h1>
          <p className="subtitle">
            {role === 'commenter'
              ? `Je kijkt mee in het portfolio van ${ownerEmail}`
              : role === 'editor'
                ? `Je werkt samen in het portfolio van ${ownerEmail}`
                : 'Thuisonderwijs logboek'}
          </p>
        </div>
        {canEdit && children.length > 0 && (
          <button
            className="icon-btn"
            onClick={() => setAdding(true)}
            aria-label="Kind toevoegen"
            title="Kind toevoegen"
          >
            +
          </button>
        )}
      </header>

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
    </div>
  )
}
