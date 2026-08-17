import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG, markUpdatesSeen } from '../data/changelog'
import { formatDateNumeric } from '../utils/dates'
import { likeText } from '../utils/likes'
import { useData } from '../store'
import {
  commentUpdate,
  fetchUpdateComments,
  fetchUpdateReactions,
  likeUpdate,
  type FeedbackComment,
  type UpdateReaction,
} from '../api'

const NAME_KEY = 'kindfolio-feedback-name'
const EMPTY: UpdateReaction = { likes: 0, likedByMe: false, commentCount: 0, likedBy: [] }

export function Updates() {
  const navigate = useNavigate()
  const { accountEmail } = useData()
  const [reactions, setReactions] = useState<Record<string, UpdateReaction>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, FeedbackComment[]>>({})
  const [commentText, setCommentText] = useState('')
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '')

  // Alles als gezien markeren zodra deze pagina geopend wordt.
  useEffect(() => {
    markUpdatesSeen()
    fetchUpdateReactions()
      .then(setReactions)
      .catch(() => {})
  }, [])

  function updateName(v: string) {
    setName(v)
    if (v.trim()) localStorage.setItem(NAME_KEY, v.trim())
    else localStorage.removeItem(NAME_KEY)
  }

  function patch(id: string, fields: Partial<UpdateReaction>) {
    setReactions((cur) => ({ ...cur, [id]: { ...(cur[id] || EMPTY), ...fields } }))
  }

  async function toggleLike(id: string) {
    const cur = reactions[id] || EMPTY
    // Optimistisch bijwerken; bij fout terugdraaien.
    const mij = (accountEmail || '').split('@')[0] || 'ik'
    patch(id, {
      likedByMe: !cur.likedByMe,
      likes: cur.likes + (cur.likedByMe ? -1 : 1),
      likedBy: cur.likedByMe
        ? (cur.likedBy ?? []).filter((n) => n !== mij)
        : [...(cur.likedBy ?? []), mij],
    })
    try {
      const r = await likeUpdate(id)
      patch(id, { likes: r.likes, likedByMe: r.likedByMe, likedBy: r.likedBy })
    } catch {
      patch(id, { likedByMe: cur.likedByMe, likes: cur.likes, likedBy: cur.likedBy })
    }
  }

  async function toggleComments(id: string) {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    setCommentText('')
    if (!comments[id]) {
      const list = await fetchUpdateComments(id).catch(() => [])
      setComments((c) => ({ ...c, [id]: list }))
    }
  }

  async function addComment(e: React.FormEvent, id: string) {
    e.preventDefault()
    const text = commentText.trim()
    if (!text) return
    try {
      const created = await commentUpdate(id, text, name)
      setComments((c) => ({ ...c, [id]: [...(c[id] || []), created] }))
      patch(id, { commentCount: (reactions[id]?.commentCount || 0) + 1 })
      setCommentText('')
    } catch (err: any) {
      alert(err?.message || 'Plaatsen mislukt')
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/')}>
          ‹ Terug
        </button>
      </div>
      <header className="page-head">
        <h1>Wat is er nieuw</h1>
        <p className="subtitle">De laatste updates in Kindfolio</p>
      </header>

      <div className="changelog">
        {CHANGELOG.map((u) => {
          const r = reactions[u.id] || EMPTY
          const duimen = likeText(r.likedBy ?? [], accountEmail)
          const open = openId === u.id
          const list = comments[u.id]
          return (
            <article key={u.id} className="changelog-item">
              <div className="changelog-date">{formatDateNumeric(u.date)}</div>
              <h2 className="changelog-title">{u.title}</h2>
              <ul className="changelog-list">
                {u.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>

              <div className="update-reactions">
                <button
                  className={`react-btn${r.likedByMe ? ' on' : ''}`}
                  onClick={() => toggleLike(u.id)}
                  // Hover toont wie er een duim gaf.
                  title={duimen || 'Duimpje geven'}
                  aria-label={duimen || 'Duimpje geven'}
                >
                  👍 <span>{r.likes}</span>
                </button>
                <button className="react-btn" onClick={() => toggleComments(u.id)}>
                  💬 <span>{r.commentCount}</span>
                </button>
              </div>

              {open && (
                <div className="feedback-comments">
                  {!list && <p className="hint">Laden…</p>}
                  {list?.map((c) => (
                    <div key={c.id} className="fc-row">
                      <span className="fc-author">{c.author}</span>
                      <span className="fc-text">{c.text}</span>
                    </div>
                  ))}
                  {list && list.length === 0 && (
                    <p className="hint">Nog geen reacties. Wees de eerste!</p>
                  )}
                  <form onSubmit={(e) => addComment(e, u.id)} className="fc-form">
                    <input
                      className="input"
                      value={name}
                      onChange={(e) => updateName(e.target.value)}
                      placeholder="Je naam (optioneel)"
                      maxLength={80}
                    />
                    <div className="row gap">
                      <input
                        className="input grow"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Schrijf een reactie…"
                      />
                      <button className="btn primary sm" type="submit">
                        Plaats
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
