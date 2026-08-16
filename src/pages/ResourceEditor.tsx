import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import type { ResourceStatus, ResourceType } from '../types'
import {
  RESOURCE_ORDER,
  RESOURCE_META,
  STATUS_META,
  statusesForType,
  hasStatus,
  isBook,
  isFinished,
} from '../utils/resources'
import { todayISO } from '../utils/dates'
import { SubjectPicker } from '../components/SubjectPicker'
import { KerndoelPicker, type KerndoelKeuze } from '../components/KerndoelPicker'
import { linksVoor } from '../utils/kerndoelen'

export function ResourceEditor() {
  const { resourceId } = useParams()
  const navigate = useNavigate()
  const {
    resources,
    children,
    addResource,
    editResource,
    removeResource,
    kerndoelenEnabled,
    kerndoelLinks,
    saveKerndoelen,
  } = useData()
  const isNew = !resourceId
  const existing = resourceId ? resources.find((r) => r.id === resourceId) : undefined

  const [type, setType] = useState<ResourceType>(existing?.type || 'leesboek')
  const [title, setTitle] = useState(existing?.title || '')
  const [author, setAuthor] = useState(existing?.author || '')
  const [url, setUrl] = useState(existing?.url || '')
  const [status, setStatus] = useState<ResourceStatus | undefined>(existing?.status)
  const [readDate, setReadDate] = useState(existing?.readDate || '')
  const [subjects, setSubjects] = useState<string[]>(existing?.subjects || [])
  const [notes, setNotes] = useState(existing?.notes || '')
  const [childIds, setChildIds] = useState<string[]>(existing?.childIds || [])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [kerndoelen, setKerndoelenKeuze] = useState<KerndoelKeuze[]>(() =>
    linksVoor(kerndoelLinks, 'resource', resourceId).map((l) => ({
      childId: l.childId,
      set: l.set,
      nr: l.nr,
    })),
  )

  if (!isNew && !existing) return <div className="page">Laden…</div>

  // Status resetten als het gekozen type een andere statusset heeft.
  function pickType(t: ResourceType) {
    setType(t)
    const opts = statusesForType(t)
    setStatus((cur) => (cur && opts.includes(cur) ? cur : opts[0]))
  }
  function toggleChild(id: string) {
    setChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }
  function toggleSubject(s: string) {
    setSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
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
        author: isBook(type) ? author.trim() : '',
        url: isBook(type) ? '' : url.trim(),
        subjects,
        status: hasStatus(type) ? status ?? null : null,
        readDate:
          hasStatus(type) && isFinished(status)
            ? readDate || todayISO()
            : null,
        notes: notes.trim(),
        childIds,
      }
      // Bij een nieuw leermiddel is het id er pas ná het opslaan; de gekozen
      // kerndoelen gaan er daarom in een tweede stap achteraan.
      const id = isNew
        ? (await addResource(data)).id
        : ((await editResource(resourceId!, data)), resourceId!)
      if (kerndoelenEnabled) {
        // Kinderen die van het leermiddel af zijn gehaald, mogen geen koppeling
        // houden — die zou nergens meer zichtbaar zijn.
        const geldig = childIds.length ? childIds : children.map((c) => c.id)
        await saveKerndoelen(
          'resource',
          id,
          kerndoelen.filter((k) => geldig.includes(k.childId)),
        )
      }
      navigate('/leermiddelen')
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

  const statusOptions = statusesForType(type)

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
              onClick={() => pickType(t)}
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

      {isBook(type) ? (
        <>
          <label className="field">
            <span className="field-label">
              Auteur / methode <span className="fl-opt">(optioneel)</span>
            </span>
            <input
              className="input"
              value={author}
              placeholder={type === 'leerboek' ? 'Bijv. de uitgever of methode' : 'Wie schreef het?'}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          {statusOptions.length > 0 && (
            <div className="field">
              <span className="field-label">Status</span>
              <div className="seg">
                {statusOptions.map((s) => (
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
          )}
          {isFinished(status) && (
            <label className="field">
              <span className="field-label">
                {type === 'leerboek' ? 'Afgerond op' : 'Gelezen op'}{' '}
                <span className="fl-opt">(optioneel)</span>
              </span>
              <input
                type="date"
                className="input"
                value={readDate || todayISO()}
                max={todayISO()}
                onChange={(e) => setReadDate(e.target.value)}
              />
            </label>
          )}
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

      <div className="field">
        <span className="field-label">
          Vakgebieden <span className="fl-opt">(optioneel, meerdere mag)</span>
        </span>
        <SubjectPicker selected={subjects} onToggle={toggleSubject} />
      </div>

      {kerndoelenEnabled && (
        <div className="field">
          <span className="field-label">
            Kerndoelen <span className="fl-opt">(optioneel)</span>
          </span>
          <KerndoelPicker
            childIds={childIds}
            value={kerndoelen}
            onChange={setKerndoelenKeuze}
          />
        </div>
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
