import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import {
  deletePhoto,
  fetchPhotoBlob,
  rotateImageBlob,
  uploadBlob,
  uploadPhoto,
} from '../api'
import { PhotoGrid } from '../components/PhotoGrid'
import { Lightbox } from '../components/Lightbox'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { useLiveSpeech } from '../hooks/useLiveSpeech'
import { formatDateLong, todayISO } from '../utils/dates'
import { effectiveSubcats } from '../utils/subjects'

export function MemoEditor() {
  const { childId, memoId } = useParams()
  const navigate = useNavigate()
  const {
    children,
    memos,
    editMemo,
    addMemoMulti,
    removeMemo,
    subjects: accountSubjects,
    subcategories,
    saveSettings,
    updateChild,
    voiceEnabled,
  } = useData()
  const isNew = !memoId
  const existing = memoId ? memos.find((m) => m.id === memoId) : undefined

  // Voorgevulde waarden wanneer je vanuit een agenda-item een memo maakt.
  const location = useLocation()
  const prefill = (location.state as any)?.eventPrefill as
    | { title?: string; date?: string; childIds?: string[] }
    | undefined

  // Bij een nieuwe memo kun je één of meerdere kinderen kiezen.
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    childId
      ? [childId]
      : prefill?.childIds?.length
        ? prefill.childIds
        : children.length === 1
          ? [children[0].id]
          : [],
  )
  const [date, setDate] = useState(existing?.date || prefill?.date || todayISO())
  const [text, setText] = useState(
    existing?.text || (prefill?.title ? `${prefill.title}: ` : ''),
  )
  const [subjects, setSubjects] = useState<string[]>(existing?.subjects || [])
  const [photoIds, setPhotoIds] = useState<string[]>(existing?.photoIds || [])
  // In bewerkmodus: extra kinderen om een kopie van deze memo voor te maken.
  const [addChildIds, setAddChildIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [rotating, setRotating] = useState(false)
  // Nieuw vakgebied aanmaken tijdens het schrijven van een memo.
  const [newSubjectOpen, setNewSubjectOpen] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newSubjectScope, setNewSubjectScope] = useState<'child' | 'account'>(
    'account',
  )
  const [addingSubject, setAddingSubject] = useState(false)
  // Foto's die geüpload zijn maar nog niet opgeslagen: opruimen bij annuleren.
  const stagedPhotos = useRef<Set<string>>(new Set())
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  // Twee manieren van inspreken: server-transcriptie (nauwkeurig) en live
  // (Web Speech, direct meelezen in Chrome/Safari).
  const voice = useVoiceRecorder((chunk) => {
    setText((prev) => (prev ? `${prev} ${chunk}` : chunk).trim())
  })
  const live = useLiveSpeech((full) => setText(full))
  const fmtSec = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const voiceBusy = voice.recording || voice.transcribing

  // Als de memo's later binnenkomen, vul het formulier alsnog.
  useEffect(() => {
    if (existing) {
      setDate(existing.date)
      setText(existing.text)
      setSubjects(existing.subjects)
      setPhotoIds(existing.photoIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoId])

  function toggleSubject(s: string) {
    setSubjects((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  function toggleChild(id: string) {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleAddChild(id: string) {
    setAddChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Nieuw vakgebied aanmaken: voor de gekozen kinderen of voor het hele account.
  async function addNewSubject() {
    const name = newSubjectName.trim()
    if (!name || addingSubject) return
    const childIds = isNew
      ? selectedChildIds
      : existing
        ? [existing.childId]
        : []
    if (newSubjectScope === 'child' && childIds.length === 0) {
      alert('Kies eerst een kind.')
      return
    }
    const known = new Set<string>([
      ...accountSubjects,
      ...childIds.flatMap(
        (id) => children.find((c) => c.id === id)?.subjects || [],
      ),
    ])
    setAddingSubject(true)
    try {
      if (!known.has(name)) {
        if (newSubjectScope === 'account') {
          await saveSettings({ subjects: [...accountSubjects, name] })
        } else {
          for (const id of childIds) {
            const c = children.find((x) => x.id === id)
            if (!c) continue
            const extras = c.subjects || []
            if (!extras.includes(name))
              await updateChild(id, { subjects: [...extras, name] })
          }
        }
      }
      setSubjects((prev) => (prev.includes(name) ? prev : [...prev, name]))
      setNewSubjectName('')
      setNewSubjectOpen(false)
    } catch (err: any) {
      alert(err?.message || 'Vakgebied toevoegen mislukt')
    } finally {
      setAddingSubject(false)
    }
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const files = Array.from(input.files || [])
    setUploading(true)
    try {
      for (const file of files) {
        const id = await uploadPhoto(file)
        stagedPhotos.current.add(id)
        setPhotoIds((prev) => [...prev, id])
      }
    } catch (err: any) {
      alert(err?.message || 'Foto uploaden mislukt')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function removePhoto(id: string) {
    setPhotoIds((prev) => prev.filter((p) => p !== id))
    if (stagedPhotos.current.has(id)) {
      await deletePhoto(id)
      stagedPhotos.current.delete(id)
    }
  }

  // Draait de getoonde foto, uploadt het resultaat en vervangt de oude.
  async function rotateLightbox(degrees: 90 | -90) {
    if (lightboxIndex == null) return
    const id = photoIds[lightboxIndex]
    if (!id) return
    setRotating(true)
    try {
      const blob = await fetchPhotoBlob(id)
      const rotated = await rotateImageBlob(blob, degrees)
      const newId = await uploadBlob(rotated)
      stagedPhotos.current.add(newId)
      setPhotoIds((prev) => prev.map((p) => (p === id ? newId : p)))
      // Oude foto opruimen als die nog niet was opgeslagen.
      if (stagedPhotos.current.has(id)) {
        await deletePhoto(id)
        stagedPhotos.current.delete(id)
      }
    } catch (err: any) {
      alert(err?.message || 'Draaien mislukt')
    } finally {
      setRotating(false)
    }
  }

  async function deleteFromLightbox() {
    if (lightboxIndex == null) return
    const id = photoIds[lightboxIndex]
    const remaining = photoIds.length - 1
    if (remaining <= 0) setLightboxIndex(null)
    else setLightboxIndex(Math.min(lightboxIndex, remaining - 1))
    await removePhoto(id)
  }

  async function save(asDraft = false) {
    if (isNew && selectedChildIds.length === 0) {
      alert('Kies minstens één kind.')
      return
    }
    if (!text.trim() && photoIds.length === 0) {
      alert('Voeg tekst of minstens één foto toe.')
      return
    }
    if (voice.recording) voice.cancel()
    if (live.listening) live.stop()
    setSaving(true)
    try {
      if (isNew) {
        await addMemoMulti(selectedChildIds, {
          date,
          text: text.trim(),
          subjects,
          photoIds,
          draft: asDraft,
        })
      } else if (memoId) {
        await editMemo(memoId, {
          date,
          text: text.trim(),
          subjects,
          photoIds,
          draft: asDraft,
        })
        // Extra kinderen: maak een aparte kopie-memo (met eigen foto-kopieën).
        if (addChildIds.length) {
          await addMemoMulti(addChildIds, {
            date,
            text: text.trim(),
            subjects,
            photoIds,
            draft: asDraft,
            copyAllPhotos: true,
          })
        }
      }
      stagedPhotos.current.clear()
      navigate(
        isNew
          ? `/kind/${selectedChildIds[0]}`
          : `/kind/${childId}/memo/${memoId}`,
      )
    } catch (err: any) {
      alert(err?.message || 'Opslaan mislukt')
      setSaving(false)
    }
  }

  async function cancel() {
    if (voice.recording) voice.cancel()
    if (live.listening) live.stop()
    if (stagedPhotos.current.size) {
      await Promise.all([...stagedPhotos.current].map((id) => deletePhoto(id)))
    }
    navigate(
      isNew
        ? childId
          ? `/kind/${childId}`
          : '/'
        : `/kind/${childId}/memo/${memoId}`,
    )
  }

  async function remove() {
    if (!memoId) return
    await removeMemo(memoId)
    navigate(`/kind/${childId}`)
  }

  if (!isNew && !existing) return <div className="page">Laden…</div>

  // Beschikbare vakgebieden: accountlijst + extra's van de gekozen kinderen,
  // plus de labels die deze memo al heeft.
  const relevantChildIds = isNew
    ? selectedChildIds
    : existing
      ? [existing.childId]
      : []
  const relevantChildren = relevantChildIds.map((id) =>
    children.find((x) => x.id === id),
  )
  const availableSubjects = (() => {
    const set = new Set<string>(accountSubjects)
    for (const c of relevantChildren) (c?.subjects || []).forEach((s) => set.add(s))
    subjects.forEach((s) => set.add(s))
    return [...set]
  })()
  // Effectieve subcategorieën per vakgebied (account + kind-extra's).
  const subcatFor = (s: string) =>
    effectiveSubcats(s, subcategories, relevantChildren)
  // Subcategorie-waarden niet ook als hoofd-chip tonen (voorkomt dubbeling).
  const subcatValues = new Set<string>()
  for (const s of availableSubjects) subcatFor(s).forEach((v) => subcatValues.add(v))
  const topSubjects = availableSubjects.filter((s) => !subcatValues.has(s))

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={cancel}>
          ‹ Annuleren
        </button>
        <span className="topbar-title">{isNew ? 'Nieuwe memo' : 'Memo'}</span>
      </div>

      {isNew && children.length > 0 && (
        <div className="field">
          <span className="field-label">
            Voor welk kind?{' '}
            {children.length > 1 && (
              <span className="hint inline">(meerdere mag)</span>
            )}
          </span>
          <div className="chips">
            {children.map((c) => {
              const on = selectedChildIds.includes(c.id)
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

      {!isNew && existing && children.length > 1 && (
        <div className="field">
          <span className="field-label">
            Ook toevoegen aan{' '}
            <span className="fl-opt">(maakt een kopie voor dat kind)</span>
          </span>
          <div className="chips">
            {children
              .filter((c) => c.id !== existing.childId)
              .map((c) => {
                const on = addChildIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip child-chip ${on ? 'on' : ''}`}
                    onClick={() => toggleAddChild(c.id)}
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
          {addChildIds.length > 0 && (
            <p className="hint">
              Er wordt een kopie van deze memo gemaakt voor{' '}
              {addChildIds.length} extra kind
              {addChildIds.length === 1 ? '' : 'eren'}.
            </p>
          )}
        </div>
      )}

      <label className="field">
        <span className="field-label">Datum</span>
        <input
          type="date"
          className="input"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
        />
        {date && <p className="hint date-readout">{formatDateLong(date)}</p>}
      </label>

      <div className="field">
        <span className="field-label">Foto's</span>
        <PhotoGrid
          photoIds={photoIds}
          onReorder={setPhotoIds}
          onOpen={setLightboxIndex}
        />
        {photoIds.length > 0 && (
          <p className="hint">
            Tik op een foto om groot te bekijken, te draaien of te verwijderen.
            Sleep om de volgorde te wijzigen.
          </p>
        )}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={onFiles}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onFiles}
        />
        <div className="photo-buttons">
          <button
            type="button"
            className="btn outline full"
            disabled={uploading}
            onClick={() => cameraInput.current?.click()}
          >
            {uploading ? 'Uploaden…' : '📷 Foto toevoegen'}
          </button>
          <button
            type="button"
            className="btn outline full"
            disabled={uploading}
            onClick={() => libraryInput.current?.click()}
          >
            🖼️ Uit bibliotheek
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Notitie</span>
        <textarea
          className="input textarea"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Wat heeft je kind vandaag gedaan en geleerd?"
        />
        {((voiceEnabled && voice.supported) || live.supported) && (
          <div className="voice-row">
            {voiceEnabled && voice.supported && (
              <button
                type="button"
                className={`btn ${voice.recording ? 'recording' : 'outline white-bg'}`}
                disabled={voice.transcribing || live.listening}
                onClick={() => (voice.recording ? voice.stop() : voice.start())}
              >
                {voice.transcribing
                  ? '⏳ Omzetten…'
                  : voice.recording
                    ? `⏹ Stop (${fmtSec(voice.seconds)})`
                    : '🎤 Inspreken'}
              </button>
            )}
            {live.supported && (
              <button
                type="button"
                className={`btn ${live.listening ? 'recording' : 'outline white-bg'}`}
                disabled={voiceBusy}
                onClick={() => (live.listening ? live.stop() : live.start(text))}
              >
                {live.listening ? '⏹ Stop' : '⚡ Live'}
              </button>
            )}
          </div>
        )}
        {(voiceEnabled && voice.supported) || live.supported ? (
          <p className="hint">
            {voice.recording
              ? 'Spreek rustig in; tik op stop, dan verschijnt de tekst.'
              : live.listening
                ? 'Je ziet de tekst live verschijnen. Tik op stop als je klaar bent.'
                : '“Inspreken” = nauwkeurig (even wachten na stop). “Live” = direct meelezen (Chrome/Safari).'}
          </p>
        ) : null}
        {voice.error && <p className="error-text">{voice.error}</p>}
        {live.error && <p className="error-text">{live.error}</p>}
      </div>

      <div className="field">
        <span className="field-label">Vakgebieden</span>
        <div className="chips">
          {topSubjects.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${subjects.includes(s) ? 'on' : ''}`}
              onClick={() => toggleSubject(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {topSubjects
          .filter((s) => subjects.includes(s) && subcatFor(s).length > 0)
          .map((s) => (
            <div key={s} className="subcat-row">
              <span className="subcat-label">{s}:</span>
              <div className="chips">
                {subcatFor(s).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    className={`chip sm ${subjects.includes(sub) ? 'on' : ''}`}
                    onClick={() => toggleSubject(sub)}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>
          ))}

        {newSubjectOpen ? (
          <div className="new-subject">
            <input
              className="input"
              value={newSubjectName}
              autoFocus
              placeholder="Naam van het vakgebied"
              onChange={(e) => setNewSubjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addNewSubject()
                }
              }}
            />
            <div className="scope-choice">
              <label className="scope-opt">
                <input
                  type="radio"
                  name="subject-scope"
                  checked={newSubjectScope === 'child'}
                  onChange={() => setNewSubjectScope('child')}
                />
                {relevantChildren.filter(Boolean).length > 1
                  ? 'Voor deze kinderen'
                  : 'Voor dit kind'}
              </label>
              <label className="scope-opt">
                <input
                  type="radio"
                  name="subject-scope"
                  checked={newSubjectScope === 'account'}
                  onChange={() => setNewSubjectScope('account')}
                />
                Voor heel het account
              </label>
            </div>
            <div className="save-row">
              <button
                type="button"
                className="btn primary"
                disabled={addingSubject || !newSubjectName.trim()}
                onClick={addNewSubject}
              >
                {addingSubject ? 'Toevoegen…' : 'Toevoegen'}
              </button>
              <button
                type="button"
                className="btn outline white-bg"
                disabled={addingSubject}
                onClick={() => {
                  setNewSubjectOpen(false)
                  setNewSubjectName('')
                }}
              >
                Annuleren
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn outline sm add-subject-btn"
            onClick={() => setNewSubjectOpen(true)}
          >
            + Nieuw vakgebied
          </button>
        )}
      </div>

      <div className="sticky-actions">
        <div className="save-row">
          <button
            className="btn primary big"
            disabled={saving}
            onClick={() => save(false)}
          >
            {saving ? 'Opslaan…' : 'Memo opslaan'}
          </button>
          <button
            className="btn outline white-bg big"
            disabled={saving}
            onClick={() => save(true)}
          >
            📝 Concept
          </button>
        </div>
        {!isNew && (
          <button
            className="btn danger-outline full white-bg"
            onClick={() => setConfirmDelete(true)}
          >
            Memo verwijderen
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Memo verwijderen?</h2>
            <p>
              Deze memo wordt permanent verwijderd. Dit kan niet ongedaan worden
              gemaakt.
            </p>
            <div className="modal-actions">
              <button
                className="btn ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Annuleren
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxIndex != null && (
        <Lightbox
          photoIds={photoIds}
          index={lightboxIndex}
          busy={rotating}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onRotate={rotateLightbox}
          onDelete={deleteFromLightbox}
        />
      )}
    </div>
  )
}
