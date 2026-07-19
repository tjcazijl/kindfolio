import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import type { ResourceStatus, ResourceType } from '../types'
import { RESOURCE_ORDER, RESOURCE_META, STATUS_ORDER, STATUS_META } from '../utils/resources'

export function ResourceEditor() {
  const { resourceId } = useParams()
  const navigate = useNavigate()
  const {
    resources,
    children,
    subjects: accountSubjects,
    addResource,
    editResource,
    removeResource,
  } = useData()
  const isNew = !resourceId
  const existing = resourceId ? resources.find((r) => r.id === resourceId) : undefined

  const [type, setType] = useState<ResourceType>(existing?.type || 'boek')
  const [title, setTitle] = useState(existing?.title || '')
  const [author, setAuthor] = useState(existing?.author || '')
  const [url, setUrl] = useState(existing?.url || '')
  const [status, setStatus] = useState<ResourceStatus>(existing?.status || 'te_lezen')
  const [subject, setSubject] = useState(existing?.subject || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds || [])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const availableSubjects = useMemo(
    () => [...new Set([...accountSubjects, ...children.flatMap((c) => c.subjects || [])])],
    [accountSubjects, children],
  )

  if (!isNew && !existing) return <div className="page">Laden…</div>

  function toggleChild(id: string) {
    setChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function save() {
    if (!title.trim()) {
      alert('Geef een titel op.')
      return
    }
    setSaving(true)
    try {
      const data = {
        type,
        title: title.trim(),
        author: type === 'boek' ? author.trim() : '',
        url: type === 'boek' ? '' : url.trim(),
        subject,
        status: type === 'boek' ? status : null,
        notes: notes.trim(),
        childIds,
      }
      const saved = isNew
        ? await addResource(data)
        : await editResource(resourceId!, data)
      navigate('/leermiddelen')
      void saved
    } catch (err: any) {
      alert(err?.message || 'Opslaan mislukt')
      setSaving(false)
    }
  }

  async function remove() {
    if (!resourceId) return
    await removeResource(resourceId)
    navigate('/leermiddelen')
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate(-1)}>
          ‹ Annuleren
        </button>
        <span className="topbar-title">
          {isNew ? 'Nieuw leermiddel' : 'Leermiddel bewerken'}
        </span>
      </div>

      <div className="field">
        <span className="field-label">Type</span>
        <div className="type-grid">
          {RESOURCE_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={`type-cell ${type === t ? 'on' : ''}`}
              onClick={() => setType(t)}
            >
              <span className="type-em">{RESOURCE_META[t].icon}</span>
              <span className="type-lb">{RESOURCE_META[t].label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Titel</span>
        <input
          className="input"
          value={title}
          autoFocus={isNew}
          placeholder="Naam van het boek, de site, video…"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      {type === 'boek' ? (
        <>
          <label className="field">
            <span className="field-label">
              Auteur <span className="fl-opt">(optioneel)</span>
            </span>
            <input
              className="input"
              value={author}
              placeholder="Wie schreef het?"
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <div className="field">
            <span className="field-label">Status</span>
            <div className="seg">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`seg-btn ${status === s ? 'on' : ''}`}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <label className="field">
          <span className="field-label">
            Link <span className="fl-opt">(optioneel)</span>
          </span>
          <input
            className="input"
            value={url}
            type="url"
            inputMode="url"
            placeholder="bijv. schooltv.nl"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      )}

      {children.length > 0 && (
        <div className="field">
          <span className="field-label">
            Voor welk kind? <span className="fl-opt">(optioneel, gezinsbreed als je niets kiest)</span>
          </span>
          <div className="chips">
            {children.map((c) => {
              const on = childIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip child-chip ${on ? 'on' : ''}`}
                  onClick={() => toggleChild(c.id)}
                >
                  <span
                    className="avatar xs"
                    style={{ background: on ? '#fff' : c.color, color: on ? c.color : '#fff' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {availableSubjects.length > 0 && (
        <label className="field">
          <span className="field-label">
            Vakgebied <span className="fl-opt">(optioneel)</span>
          </span>
          <select
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">Geen</option>
            {availableSubjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span className="field-label">
          Notitie <span className="fl-opt">(optioneel)</span>
        </span>
        <textarea
          className="input textarea"
          rows={3}
          value={notes}
          placeholder="Bijv. waarom het handig is."
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <div className="sticky-actions">
        <button className="btn primary full big" disabled={saving} onClick={save}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
        {!isNew && (
          <button
            className="btn danger-outline full white-bg"
            onClick={() => setConfirmDelete(true)}
          >
            Verwijderen
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Leermiddel verwijderen?</h2>
            <p>Dit leermiddel wordt permanent verwijderd.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Annuleren
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
