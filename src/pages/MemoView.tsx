import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { PhotoThumb } from '../components/PhotoThumb'
import { Lightbox } from '../components/Lightbox'
import { Comments } from '../components/Comments'
import { formatDateLong } from '../utils/dates'

export function MemoView() {
  const { childId, memoId } = useParams()
  const navigate = useNavigate()
  const { memos, loading, canEdit } = useData()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const memo = memos.find((m) => m.id === memoId)

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

      {canEdit && (
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
