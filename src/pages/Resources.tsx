import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import type { Resource, ResourceStatus, ResourceType } from '../types'
import {
  RESOURCE_META,
  RESOURCE_ORDER,
  STATUS_META,
  statusLabel,
  MODE_META,
  statusesForType,
  isBook,
  isFinished,
  normalizeUrl,
  displayUrl,
} from '../utils/resources'
import { todayISO, formatDateNumeric } from '../utils/dates'

type Filter = 'alles' | ResourceType

export function Resources() {
  const navigate = useNavigate()
  const { resources, children, canEdit, editResource } = useData()
  const [filter, setFilter] = useState<Filter>('alles')
  const [showFinished, setShowFinished] = useState(false)

  const counts = useMemo(() => {
    const map: Record<string, number> = { alles: resources.length }
    for (const r of resources) map[r.type] = (map[r.type] || 0) + 1
    return map
  }, [resources])

  const list = useMemo(
    () => (filter === 'alles' ? resources : resources.filter((r) => r.type === filter)),
    [resources, filter],
  )
  const active = useMemo(() => list.filter((r) => !isFinished(r.status)), [list])
  const finished = useMemo(() => list.filter((r) => isFinished(r.status)), [list])

  const childById = useMemo(() => {
    const m: Record<string, (typeof children)[number]> = {}
    for (const c of children) m[c.id] = c
    return m
  }, [children])

  async function setStatus(r: Resource, s: ResourceStatus) {
    await editResource(r.id, {
      status: s,
      readDate: isFinished(s) ? r.readDate || todayISO() : null,
    })
  }

  function renderCard(r: Resource) {
    const meta = RESOURCE_META[r.type]
    const href = normalizeUrl(r.url)
    const kids = r.childIds.map((id) => childById[id]).filter(Boolean)
    const statuses = statusesForType(r.type)
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
          {(r.subjects.length > 0 || kids.length > 0 || r.readDate) && (
            <div className="badges">
              {r.subjects.map((s) => (
                <span key={s} className="badge subj">
                  {s}
                </span>
              ))}
              {isFinished(r.status) && r.readDate && (
                <span className="badge gelezen">
                  {r.type === 'leerboek' ? 'Afgerond' : 'Gelezen'} · {formatDateNumeric(r.readDate)}
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

          {/* Snelle statuswissel voor boeken. */}
          {isBook(r.type) && statuses.length > 0 && canEdit && (
            <div className="res-status" onClick={(e) => e.stopPropagation()}>
              {statuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`status-btn ${r.status === s ? 'on' : ''}`}
                  onClick={() => setStatus(r, s)}
                >
                  {statusLabel({ type: r.type, status: s, mode: r.mode })}
                </button>
              ))}
            </div>
          )}
          {r.type === 'leesboek' && r.mode && r.mode !== 'lezen' && (
            <span className="res-mode" title={MODE_META[r.mode].label}>
              {MODE_META[r.mode].icon} {MODE_META[r.mode].label}
            </span>
          )}
          {isBook(r.type) && r.status && !canEdit && (
            <div className="badges">
              <span className={`badge ${STATUS_META[r.status].cls}`}>
                {statusLabel(r)}
              </span>
            </div>
          )}
        </div>
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
            {active.length}{' '}
            {filter === 'leerboek' || filter === 'leesboek'
              ? `boek${active.length === 1 ? '' : 'en'}`
              : `leermiddel${active.length === 1 ? '' : 'en'}`}
          </p>
          <div className="res-list">{active.map(renderCard)}</div>

          {finished.length > 0 && (
            <div className="finished-section">
              <button
                className="collapse-head"
                onClick={() => setShowFinished((v) => !v)}
              >
                <span>
                  <strong>Gelezen / afgerond</strong>
                  <span className="hint inline"> · {finished.length}</span>
                </span>
                <span className="chevron">{showFinished ? '▾' : '▸'}</span>
              </button>
              {showFinished && (
                <div className="res-list" style={{ marginTop: 10 }}>
                  {finished.map(renderCard)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
