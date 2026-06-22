import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import {
  deletePhoto,
  fetchPhotoBlob,
  rotateImageBlob,
  uploadBlob,
  uploadPhoto,
} from '../api'
import { PhotoThumb } from '../components/PhotoThumb'
import { Lightbox } from '../components/Lightbox'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { todayISO } from '../utils/dates'

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
  } = useData()
  const isNew = !memoId
  const existing = memoId ? memos.find((m) => m.id === memoId) : undefined

  // Bij een nieuwe memo kun je één of meerdere kinderen kiezen.
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    childId ? [childId] : children.length === 1 ? [children[0].id] : [],
  )
  const [date, setDate] = useState(existing?.date || todayISO())
  const [text, setText] = useState(existing?.text || '')
  const [subjects, setSubjects] = useState<string[]>(existing?.subjects || [])
  const [photoIds, setPhotoIds] = useState<string[]>(existing?.photoIds || [])
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [rotating, setRotating] = useState(false)
  // Foto's die geüpload zijn maar nog niet opgeslagen: opruimen bij annuleren.
  const stagedPhotos = useRef<Set<string>>(new Set())
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  const speech = useSpeechRecognition((chunk) => {
    setText((prev) => (prev ? `${prev} ${chunk}` : chunk).trim())
  })

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
    if (speech.listening) speech.stop()
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
    if (speech.listening) speech.stop()
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

  // Beschikbare vakgebieden: van de gekozen kinderen (eigen lijst of accountlijst),
  // plus de labels die deze memo al heeft.
  const relevantChildIds = isNew
    ? selectedChildIds
    : existing
      ? [existing.childId]
      : []
  const availableSubjects = (() => {
    const set = new Set<string>()
    if (relevantChildIds.length === 0) accountSubjects.forEach((s) => set.add(s))
    for (const id of relevantChildIds) {
      const c = children.find((x) => x.id === id)
      ;(c?.subjects ?? accountSubjects).forEach((s) => set.add(s))
    }
    subjects.forEach((s) => set.add(s))
    return [...set]
  })()

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

      <label className="field">
        <span className="field-label">Datum</span>
        <input
          type="date"
          className="input"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>

      <div className="field">
        <span className="field-label">Vakgebieden</span>
        <div className="chips">
          {availableSubjects.map((s) => (
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
      </div>

      <div className="field">
        <span className="field-label">Notitie</span>
        <textarea
          className="input textarea"
          rows={6}
          value={text + (speech.interim ? ` ${speech.interim}` : '')}
          onChange={(e) => setText(e.target.value)}
          placeholder="Wat heeft je kind vandaag gedaan en geleerd?"
        />
        {speech.supported ? (
          <button
            type="button"
            className={`btn ${speech.listening ? 'recording' : 'outline'} full`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            {speech.listening ? '⏹ Stop opname' : '🎤 Inspreken'}
          </button>
        ) : (
          <p className="hint">
            Spraakherkenning wordt niet ondersteund in deze browser. Gebruik bij
            voorkeur Chrome op Android, of typ de tekst.
          </p>
        )}
        {speech.error && <p className="error-text">{speech.error}</p>}
      </div>

      <div className="field">
        <span className="field-label">Foto's</span>
        <div className="thumb-row wrap">
          {photoIds.map((pid, i) => (
            <PhotoThumb
              key={pid}
              photoId={pid}
              onRemove={() => removePhoto(pid)}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>
        {photoIds.length > 0 && (
          <p className="hint">Tik op een foto om groot te bekijken of te draaien.</p>
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

      <div className="sticky-actions">
        <button
          className="btn primary full big"
          disabled={saving}
          onClick={() => save(false)}
        >
          {saving ? 'Opslaan…' : 'Memo opslaan'}
        </button>
        <button
          className="btn outline full"
          disabled={saving}
          onClick={() => save(true)}
        >
          📝 Opslaan als concept
        </button>
        {!isNew && (
          <button
            className="btn danger-outline full"
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
