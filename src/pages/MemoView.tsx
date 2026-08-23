import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { PhotoThumb } from '../components/PhotoThumb'
import { Lightbox } from '../components/Lightbox'
import { Comments } from '../components/Comments'
import { formatDateLong } from '../utils/dates'
import { RESOURCE_META, normalizeUrl, displayUrl } from '../utils/resources'

export function MemoView() {
  const { childId, memoId } = useParams()
  const navigate = useNavigate()
  const { memos, resources, loading, canWrite, userId, role } = useData()
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

      {canWrite && (role !== 'writer' || memo.authorId === userId) && (
        <button
          className="btn primary full big edit-cta"
          onClick={() => navigate(`/kind/${childId}/memo/${memoId}/bewerken`)}
        >
          ✏️ Bewerken
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
