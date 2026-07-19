import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import type { ResourceType } from '../types'
import {
  RESOURCE_META,
  RESOURCE_ORDER,
  STATUS_META,
  normalizeUrl,
  displayUrl,
} from '../utils/resources'

type Filter = 'alles' | ResourceType

export function Resources() {
  const navigate = useNavigate()
  const { resources, children, canEdit } = useData()
  const [filter, setFilter] = useState<Filter>('alles')

  const counts = useMemo(() => {
    const map: Record<string, number> = { alles: resources.length }
    for (const r of resources) map[r.type] = (map[r.type] || 0) + 1
    return map
  }, [resources])

  const list = useMemo(
    () => (filter === 'alles' ? resources : resources.filter((r) => r.type === filter)),
    [resources, filter],
  )

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
            onClick={() => navigate('/leermiddelen/nieuw')}
            aria-label="Leermiddel toevoegen"
            title="Leermiddel toevoegen"
          >
            +
          </button>
        )}
      </div>

      <header className="page-head">
        <h1>Leermiddelen</h1>
        <p className="subtitle">Je eigen verzameling</p>
      </header>

      <div className="res-filters">
        <button
          className={`chip ${filter === 'alles' ? 'on' : ''}`}
          onClick={() => setFilter('alles')}
        >
          Alles
        </button>
        {RESOURCE_ORDER.map((t) => (
          <button
            key={t}
            className={`chip ${filter === t ? 'on' : ''}`}
            onClick={() => setFilter(t)}
          >
            {RESOURCE_META[t].icon} {RESOURCE_META[t].label}
            {counts[t] ? ` · ${counts[t]}` : ''}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <p>
            {resources.length === 0
              ? 'Nog geen leermiddelen. Bewaar hier je boeken, sites, video’s en apps.'
              : 'Niets van dit type.'}
          </p>
          {canEdit && resources.length === 0 && (
            <button className="btn primary" onClick={() => navigate('/leermiddelen/nieuw')}>
              + Eerste leermiddel toevoegen
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="count-line">
            {list.length}{' '}
            {filter === 'boek'
              ? `boek${list.length === 1 ? '' : 'en'}`
              : `leermiddel${list.length === 1 ? '' : 'en'}`}
          </p>
          <div className="res-list">
            {list.map((r) => {
              const meta = RESOURCE_META[r.type]
              const href = normalizeUrl(r.url)
              const kids = r.childIds.map((id) => childById[id]).filter(Boolean)
              return (
                <div
                  key={r.id}
                  className={`res ${canEdit ? 'tappable' : ''}`}
                  onClick={() => canEdit && navigate(`/leermiddelen/${r.id}/bewerken`)}
                >
                  <span className={`res-ic ${meta.cls}`}>{meta.icon}</span>
                  <div className="res-main">
                    <div className="res-title">{r.title}</div>
                    {(r.author || href) && (
                      <div className="res-sub">
                        {r.author && <span>{r.author}</span>}
                        {href && (
                          <a
                            className="res-link"
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {displayUrl(r.url)} ↗
                          </a>
                        )}
                      </div>
                    )}
                    {(r.subject || r.status || kids.length > 0) && (
                      <div className="badges">
                        {r.subject && <span className="badge subj">{r.subject}</span>}
                        {r.status && (
                          <span className={`badge ${STATUS_META[r.status].cls}`}>
                            {STATUS_META[r.status].label}
                          </span>
                        )}
                        {kids.map((c) => (
                          <span key={c!.id} className="badge child">
                            <span className="badge-dot" style={{ background: c!.color }} />
                            {c!.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.notes && <div className="res-note">{r.notes}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
