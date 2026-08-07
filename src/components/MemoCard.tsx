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

// "a", "a en b", "a, b en c"
function joinNl(names: string[]): string {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`
}

// "Jij en Myranda vinden dit leuk" — eigen naam wordt "jij" en staat vooraan.
function likeText(names: string[], myEmail: string | null): string {
  if (!names.length) return ''
  const mij = (myEmail || '').split('@')[0]
  const anderen = names.filter((n) => n !== mij)
  const lijst = names.length > anderen.length ? ['jij', ...anderen] : anderen
  const zin = `${joinNl(lijst)} ${lijst.length === 1 ? 'vindt' : 'vinden'} dit leuk`
  return zin.charAt(0).toUpperCase() + zin.slice(1)
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
  const { likeMemo, comments, accountEmail } = useData()
  const [showComments, setShowComments] = useState(false)
  const [showLikers, setShowLikers] = useState(false)

  const likeCount = memo.likeCount ?? 0
  const likers = likeText(memo.likedBy ?? [], accountEmail)
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
          {likeCount > 0 &&
            (likers ? (
              // Hover toont de namen; op de telefoon tik je erop.
              <button
                type="button"
                className="stat-likes"
                title={likers}
                aria-label={likers}
                onClick={() => setShowLikers((v) => !v)}
              >
                👍 {likeCount}
              </button>
            ) : (
              <span>👍 {likeCount}</span>
            ))}
          {commentCount > 0 && (
            <button className="link-btn" onClick={() => setShowComments(true)}>
              {commentCount} reactie{commentCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}

      {showLikers && likers && <p className="post-likers">{likers}</p>}

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
