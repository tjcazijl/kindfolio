import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import {
  deletePhoto,
  describePhotos,
  fetchPhotoBlob,
  rotateImageBlob,
  saveKerndoelen as apiSaveKerndoelen,
  uploadBlob,
  uploadPhoto,
} from '../api'
import { KerndoelPicker, type KerndoelKeuze } from '../components/KerndoelPicker'
import { linksVoor } from '../utils/kerndoelen'
import { PhotoGrid } from '../components/PhotoGrid'
import { Lightbox } from '../components/Lightbox'
import { useLiveSpeech } from '../hooks/useLiveSpeech'
import { formatDateLong, todayISO } from '../utils/dates'
import { effectiveSubcats } from '../utils/subjects'
import { MOODS } from '../utils/mood'
import { RESOURCE_META, isFinished, isRecentlyFinished } from '../utils/resources'
import type { MoodKey } from '../types'

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
    focusPoints,
    resources,
    saveSettings,
    updateChild,
    photoAiEnabled,
    kerndoelenEnabled,
    kerndoelLinks,
    reload,
  } = useData()
  const isNew = !memoId
  const existing = memoId ? memos.find((m) => m.id === memoId) : undefined
  const existingAttention = existing
    ? focusPoints.find((f) => f.sourceMemoId === existing.id && f.linkKind === 'attention')
    : undefined
  const existingLater = existing
    ? focusPoints.find((f) => f.sourceMemoId === existing.id && f.linkKind === 'later')
    : undefined

  // Voorgevulde waarden wanneer je vanuit een agenda-item een memo maakt.
  const location = useLocation()
  const prefill = (location.state as any)?.eventPrefill as
    | { title?: string; date?: string; childIds?: string[]; subjects?: string[] }
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
  const [subjects, setSubjects] = useState<string[]>(
    existing?.subjects || prefill?.subjects || [],
  )
  const [photoIds, setPhotoIds] = useState<string[]>(existing?.photoIds || [])
  // Schrijfhulp: laat de AI vertellen wat er op de foto's staat.
  const [describing, setDescribing] = useState(false)
  const [describeError, setDescribeError] = useState<string | null>(null)
  // In bewerkmodus: extra kinderen om een kopie van deze memo voor te maken.
  const [addChildIds, setAddChildIds] = useState<string[]>([])
  // Gekoppelde leermiddelen.
  const [resourceIds, setResourceIds] = useState<string[]>(
    existing?.resourceIds || [],
  )
  // Kerndoelen: alleen de bevestigde. AI-voorstellen worden in de Terugblik
  // nagekeken, niet hier — dat zou het schrijven van een memo in de weg zitten.
  const [kerndoelen, setKerndoelenKeuze] = useState<KerndoelKeuze[]>(() =>
    linksVoor(kerndoelLinks, 'memo', memoId)
      .filter((l) => l.status === 'ok')
      .map((l) => ({ childId: l.childId, set: l.set, nr: l.nr })),
  )
  // Reflectie ("Hoe ging het?") — standaard dichtgeklapt tenzij al ingevuld.
  const [mood, setMood] = useState<MoodKey | undefined>(existing?.mood)
  const [attentionText, setAttentionText] = useState(existingAttention?.text || '')
  const [attentionSubject, setAttentionSubject] = useState(
    existingAttention?.subject || '',
  )
  const [followupText, setFollowupText] = useState(existingLater?.text || '')
  const [reflectOpen, setReflectOpen] = useState(
    !!(existing?.mood || existingAttention || existingLater),
  )
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

  // Dictafoon: spraakherkenning in de browser zelf, tekst loopt live mee.
  const live = useLiveSpeech((full) => setText(full))
  // Schrijfhulp kan alleen iets als er foto's bij deze memo staan.
  const hulpBeschikbaar = photoAiEnabled && photoIds.length > 0

  // Als de memo's later binnenkomen, vul het formulier alsnog.
  useEffect(() => {
    if (existing) {
      setDate(existing.date)
      setText(existing.text)
      setSubjects(existing.subjects)
      setPhotoIds(existing.photoIds)
      setResourceIds(existing.resourceIds || [])
      setMood(existing.mood)
      const att = focusPoints.find(
        (f) => f.sourceMemoId === existing.id && f.linkKind === 'attention',
      )
      const lat = focusPoints.find(
        (f) => f.sourceMemoId === existing.id && f.linkKind === 'later',
      )
      setAttentionText(att?.text || '')
      setAttentionSubject(att?.subject || '')
      setFollowupText(lat?.text || '')
      if (existing.mood || att || lat) setReflectOpen(true)
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

  function toggleResource(id: string) {
    setResourceIds((prev) =>
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

  /** Vraagt de AI om een eerste beschrijving; vult aan, overschrijft nooit. */
  async function describe() {
    const kindId = childId || selectedChildIds[0]
    if (!kindId || photoIds.length === 0) return
    setDescribing(true)
    setDescribeError(null)
    try {
      const r = await describePhotos(kindId, photoIds, subjects)
      setText((huidig) => (huidig.trim() ? `${huidig.trimEnd()}\n\n${r.text}` : r.text))
    } catch (e: any) {
      setDescribeError(e?.message || 'Beschrijven mislukt')
    } finally {
      setDescribing(false)
    }
  }

  /**
   * Schrijft de gekozen kerndoelen weg per memo. Eén memo hoort bij één kind,
   * dus elk memo krijgt alleen de keuzes die voor dat kind gemaakt zijn.
   */
  async function koppelKerndoelen(doelen: { id: string; childId: string }[]) {
    if (!kerndoelenEnabled) return
    for (const m of doelen) {
      const items = kerndoelen.filter((k) => k.childId === m.childId)
      // Ook bij een lege lijst opslaan: dan wordt een eerdere keuze gewist.
      await apiSaveKerndoelen('memo', m.id, items)
    }
    await reload()
  }

  async function save(asDraft = false) {
    if (isNew && selectedChildIds.length === 0) {
      alert('Kies minstens één kind.')
      return
    }
    // Een memo mag ook zonder tekst/foto, zolang er íets in staat
    // (vakgebied, leermiddel, stemming of aandachtspunt).
    const hasContent =
      text.trim() ||
      photoIds.length > 0 ||
      subjects.length > 0 ||
      resourceIds.length > 0 ||
      kerndoelen.length > 0 ||
      !!mood ||
      attentionText.trim() ||
      followupText.trim()
    if (!hasContent) {
      alert('Voeg iets toe: tekst, een foto, een vakgebied of een leermiddel.')
      return
    }
    if (live.listening) live.stop()
    // Reflectie ("Hoe ging het?") — altijd meesturen, ook leeg (dan wissen).
    const reflection = {
      mood: mood ?? null,
      attentionText: attentionText.trim(),
      attentionSubject: attentionSubject.trim(),
      followupText: followupText.trim(),
    }
    setSaving(true)
    try {
      if (isNew) {
        const nieuw = await addMemoMulti(selectedChildIds, {
          date,
          text: text.trim(),
          subjects,
          photoIds,
          resourceIds,
          draft: asDraft,
          ...reflection,
        })
        // Elk kind krijgt zijn eigen memo, dus ook zijn eigen koppelingen.
        await koppelKerndoelen(nieuw.map((m) => ({ id: m.id, childId: m.childId })))
      } else if (memoId) {
        await editMemo(memoId, {
          date,
          text: text.trim(),
          subjects,
          photoIds,
          resourceIds,
          draft: asDraft,
          ...reflection,
        })
        const kopieen = { id: memoId, childId: existing?.childId || childId || '' }
        // Extra kinderen: maak een aparte kopie-memo (met eigen foto-kopieën).
        if (addChildIds.length) {
          const extra = await addMemoMulti(addChildIds, {
            date,
            text: text.trim(),
            subjects,
            photoIds,
            resourceIds,
            draft: asDraft,
            copyAllPhotos: true,
            ...reflection,
          })
          await koppelKerndoelen([
            kopieen,
            ...extra.map((m) => ({ id: m.id, childId: m.childId })),
          ])
        } else {
          await koppelKerndoelen([kopieen])
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
  const reflectName =
    relevantChildren.length === 1 && relevantChildren[0]
      ? relevantChildren[0].name
      : 'het kind'
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
        {/* Dictafoon en schrijfhulp vullen allebei dit tekstveld, dus staan ze
            er samen direct onder met één regel uitleg. */}
        {(live.supported || hulpBeschikbaar) && (
          <>
            <div className="voice-row">
              {live.supported && (
                <button
                  type="button"
                  className={`btn ${live.listening ? 'recording' : 'outline white-bg'}`}
                  onClick={() => (live.listening ? live.stop() : live.start(text))}
                >
                  {live.listening ? '⏹ Stop' : '🎤 Dictafoon'}
                </button>
              )}
              {hulpBeschikbaar && (
                <button
                  type="button"
                  className="btn outline white-bg"
                  disabled={describing || (!childId && selectedChildIds.length === 0)}
                  onClick={describe}
                >
                  {describing ? '⏳ Even kijken…' : '✨ Schrijfhulp'}
                </button>
              )}
            </div>
            <p className="hint">
              {live.listening
                ? 'Je ziet de tekst verschijnen terwijl je praat. Tik op stop als je klaar bent.'
                : describing
                  ? 'Even kijken wat er op je foto’s staat…'
                  : hulpBeschikbaar
                    ? 'Inspreken, of je foto’s laten beschrijven — je eigen tekst blijft altijd staan.'
                    : 'Praat in plaats van typen — de tekst loopt mee terwijl je spreekt.'}
            </p>
          </>
        )}
        {describeError && <p className="error-text">{describeError}</p>}
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

      {kerndoelenEnabled && (
        <div className="field">
          <span className="field-label">
            Kerndoelen <span className="fl-opt">(optioneel)</span>
          </span>
          <KerndoelPicker
            childIds={isNew ? selectedChildIds : [existing?.childId || childId || '']}
            value={kerndoelen}
            onChange={setKerndoelenKeuze}
          />
        </div>
      )}

      <div className="field">
        <span className="field-label">
          Leermiddelen <span className="fl-opt">(optioneel)</span>
        </span>
        {(() => {
          // Gelezen/afgeronde boeken niet aanbieden — behalve wat je net hebt
          // afgevinkt, zodat de volgorde van afvinken en noteren niet uitmaakt.
          const pickable = resources.filter(
            (r) =>
              !isFinished(r.status) ||
              isRecentlyFinished(r) ||
              resourceIds.includes(r.id),
          )
          return pickable.length > 0 ? (
            <>
              <div className="chips">
                {pickable.map((r) => {
                  const on = resourceIds.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`chip ${on ? 'on' : ''}`}
                      onClick={() => toggleResource(r.id)}
                      title={
                        isFinished(r.status)
                          ? 'Net afgerond — nog even te kiezen'
                          : undefined
                      }
                    >
                      {RESOURCE_META[r.type].icon} {r.title}
                      {isFinished(r.status) && <span className="chip-done"> ✓</span>}
                    </button>
                  )
                })}
              </div>
              <p className="hint">
                Tik aan welke je bij deze memo gebruikte.
                {pickable.some((r) => isFinished(r.status)) &&
                  ' Boeken met ✓ heb je net afgerond.'}
              </p>
            </>
          ) : (
            <p className="hint">
              Nog geen leermiddelen om te koppelen. Voeg boeken, sites of video’s
              toe via 📚 op het beginscherm.
            </p>
          )
        })()}
      </div>

      {/* Reflectie — standaard dichtgeklapt */}
      {!reflectOpen ? (
        <button
          type="button"
          className="reflect-collapsed"
          onClick={() => setReflectOpen(true)}
        >
          <span className="rc-left">
            💭 Hoe ging het? <span className="rc-opt">(optioneel)</span>
          </span>
          <span className="rc-chev">▾</span>
        </button>
      ) : (
        <div className="reflect">
          <button
            type="button"
            className="reflect-h"
            onClick={() => setReflectOpen(false)}
          >
            <span className="rc-left">
              💭 Hoe ging het? <span className="rc-opt">(optioneel)</span>
            </span>
            <span className="rc-chev">▴</span>
          </button>
          <div className="reflect-body">
            <div>
              <span className="field-label">Wat vond {reflectName} ervan?</span>
              <div className="mood-row">
                {MOODS.map((mo) => (
                  <button
                    key={mo.key}
                    type="button"
                    className={`mood ${mood === mo.key ? 'on' : ''}`}
                    onClick={() => setMood(mood === mo.key ? undefined : mo.key)}
                  >
                    <span className="mood-em">{mo.emoji}</span>
                    <span className="mood-lb">{mo.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="reflect-sub focus">
              <div className="reflect-sub-h">📌 Aandachtspunt</div>
              <textarea
                className="input textarea sm"
                rows={2}
                value={attentionText}
                onChange={(e) => setAttentionText(e.target.value)}
                placeholder={`Waar heeft ${reflectName} nog moeite mee?`}
              />
              {availableSubjects.length > 0 && (
                <select
                  className="input reflect-subject"
                  value={attentionSubject}
                  onChange={(e) => setAttentionSubject(e.target.value)}
                >
                  <option value="">Vakgebied (optioneel)</option>
                  {availableSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="reflect-sub later">
              <div className="reflect-sub-h">🔭 Voor later / verdieping</div>
              <textarea
                className="input textarea sm"
                rows={2}
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder="Bijv. een vervolgstap of iets om op door te gaan."
              />
            </div>
          </div>
        </div>
      )}

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
