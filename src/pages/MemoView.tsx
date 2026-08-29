import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { PhotoThumb } from '../components/PhotoThumb'
import { Lightbox } from '../components/Lightbox'
import { Comments } from '../components/Comments'
import { documentUrl } from '../api'

/** "1,4 MB" of "820 kB" — leesbaar in plaats van een berg bytes. */
function docGrootte(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}
import { formatDateLong } from '../utils/dates'
import { RESOURCE_META, normalizeUrl, displayUrl } from '../utils/resources'

export function MemoView() {
  const { childId, memoId } = useParams()
  const navigate = useNavigate()
  const { memos, resources, documents, loading, canWrite, userId, role } = useData()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const memo = memos.find((m) => m.id === memoId)
  const linkedResources = (memo?.resourceIds || [])
    .map((id) => resources.find((r) => r.id === id))
    .filter(Boolean)

  if (loading && !memo) return <div className="page">Laden…</div>
  if (!memo)
    return (
      <div className="page">
        <p className="empty-note">Memo niet gevonden.</p>
        <button className="btn outline" onClick={() => navigate(`/kind/${childId}`)}>
          Terug
        </button>
      </div>
    )

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate(`/kind/${childId}`)}>
          ‹ Terug
        </button>
      </div>

      <div className="memo-date big">{formatDateLong(memo.date)}</div>

      {memo.subjects.length > 0 && (
        <div className="tags view-tags">
          {memo.subjects.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
      )}

      {memo.text && <p className="memo-view-text">{memo.text}</p>}

      {memo.photoIds.length > 0 && (
        <div className="thumb-row wrap view-photos">
          {memo.photoIds.map((pid, i) => (
            <PhotoThumb
              key={pid}
              photoId={pid}
              onClick={() => setLightboxIndex(i)}
            />
          ))}
        </div>
      )}

      {linkedResources.length > 0 && (
        <div className="memo-resources">
          <div className="field-label">Gebruikte leermiddelen</div>
          {linkedResources.map((r) => {
            const href = normalizeUrl(r!.url)
            return (
              <div key={r!.id} className="memo-res">
                <span className="memo-res-ic">{RESOURCE_META[r!.type].icon}</span>
                <span className="memo-res-main">
                  <span className="memo-res-title">{r!.title}</span>
                  {href && (
                    <a
                      className="res-link"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {displayUrl(r!.url)} ↗
                    </a>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {memo.documentIds.length > 0 && (
        <div className="field">
          <span className="field-label">Bijlagen</span>
          <ul className="doc-lijst">
            {memo.documentIds.map((id) => {
              const d = documents.find((x) => x.id === id)
              return (
                <li key={id} className="doc-rij">
                  <a className="doc-naam" href={documentUrl(id)} target="_blank" rel="noreferrer">
                    📄 {d ? d.name : 'Document'}
                  </a>
                  {d && <span className="doc-grootte">{docGrootte(d.size)}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {canWrite && (role !== 'writer' || memo.authorId === userId) && (
        <button
          className="btn primary full big edit-cta"
          onClick={() => navigate(`/kind/${childId}/memo/${memoId}/bewerken`)}
        >
          ✏️ Bewerken
        </button>
      )}
      {canWrite && (
        <button
          className="btn outline full white-bg"
          onClick={() =>
            // Als nieuwe memo openen met dezelfde inhoud, op de datum van vandaag.
            navigate('/memo/nieuw', {
              state: {
                eventPrefill: {
                  kopieVan: memo.id,
                  childIds: [memo.childId],
                  subjects: memo.subjects,
                  tekst: memo.text,
                  resourceIds: memo.resourceIds,
                  mood: memo.mood,
                },
              },
            })
          }
        >
          ⧉ Kopiëren naar een nieuwe memo
        </button>
      )}

      <Comments targetType="memo" targetId={memo.id} />

      {lightboxIndex != null && (
        <Lightbox
          photoIds={memo.photoIds}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
