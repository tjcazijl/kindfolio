import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Child, Memo } from '../types'
import { useData } from '../store'
import { Comments } from './Comments'
import { PhotoCarousel } from './PhotoCarousel'
import { formatDateShort } from '../utils/dates'

// Kapt lange memo-tekst af: 4 zinnen als er foto's zijn, anders 10 regels.
function MemoText({ text, hasPhotos }: { text: string; hasPhotos: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    if (hasPhotos || expanded) return
    const el = ref.current
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 2)
  }, [text, hasPhotos, expanded])

  if (hasPhotos) {
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text]
    const needsTrunc = sentences.length > 4
    const shown =
      needsTrunc && !expanded ? sentences.slice(0, 4).join('').trim() : text
    return (
      <p className="post-text">
        {shown}
        {needsTrunc && !expanded && (
          <>
            {'… '}
            <button className="link-btn" onClick={() => setExpanded(true)}>
              Meer weergeven
            </button>
          </>
        )}
      </p>
    )
  }

  return (
    <>
      <p ref={ref} className={`post-text${expanded ? '' : ' clamp-10'}`}>
        {text}
      </p>
      {overflow && !expanded && (
        <button
          className="link-btn post-more"
          onClick={() => setExpanded(true)}
        >
          Meer weergeven
        </button>
      )}
    </>
  )
}

interface Props {
  memo: Memo
  child: Child
  canEdit: boolean
}

// Tijdlijn-kaart in social-stijl: tekst boven, foto's groot (carousel),
// onderaan een like-knop en reacties.
export function MemoCard({ memo, child, canEdit }: Props) {
  const navigate = useNavigate()
  const { likeMemo, comments } = useData()
  const [showComments, setShowComments] = useState(false)

  const likeCount = memo.likeCount ?? 0
  const commentCount = comments.filter(
    (c) => c.targetType === 'memo' && c.targetId === memo.id,
  ).length

  return (
    <article className={`memo-post${memo.draft ? ' is-draft' : ''}`}>
      <header className="post-head">
        <span className="avatar sm" style={{ background: child.color }}>
          {child.name.charAt(0).toUpperCase()}
        </span>
        <div className="post-head-info">
          <span className="post-child">{child.name}</span>
          <span className="post-date">
            {formatDateShort(memo.date)}
            {memo.draft && <span className="draft-badge">Concept</span>}
          </span>
        </div>
        {canEdit && (
          <button
            className="link-btn"
            onClick={() =>
              navigate(`/kind/${child.id}/memo/${memo.id}/bewerken`)
            }
          >
            Bewerken
          </button>
        )}
      </header>

      {memo.subjects.length > 0 && (
        <div className="tags post-tags">
          {memo.subjects.map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          ))}
        </div>
      )}

      {memo.text && (
        <MemoText text={memo.text} hasPhotos={memo.photoIds.length > 0} />
      )}

      {memo.photoIds.length > 0 && <PhotoCarousel photoIds={memo.photoIds} />}

      {(likeCount > 0 || commentCount > 0) && (
        <div className="post-stats">
          {likeCount > 0 && <span>👍 {likeCount}</span>}
          {commentCount > 0 && (
            <button className="link-btn" onClick={() => setShowComments(true)}>
              {commentCount} reactie{commentCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      <div className="post-actions">
        <button
          type="button"
          className={`post-action${memo.likedByMe ? ' on' : ''}`}
          onClick={() => likeMemo(memo.id)}
        >
          <span className="pa-icon">👍</span> Leuk
        </button>
        <button
          type="button"
          className="post-action"
          onClick={() => setShowComments((v) => !v)}
        >
          <span className="pa-icon">💬</span> Reageren
        </button>
      </div>

      {showComments && (
        <div className="post-comments">
          <Comments targetType="memo" targetId={memo.id} />
        </div>
      )}
    </article>
  )
}
