import { useEffect, useState } from 'react'
import { useData } from '../store'
import {
  commentFeedback,
  deleteFeedback,
  fetchFeedback,
  fetchFeedbackComments,
  postFeedback,
  setFeedbackStatus,
  voteFeedback,
  type FeedbackComment,
  type FeedbackPost,
} from '../api'

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
  })
}

// Zelfde volgorde als de server: open eerst, dan meeste stemmen, dan nieuwste.
function sortPosts(list: FeedbackPost[]): FeedbackPost[] {
  return [...list].sort(
    (a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done') ||
      b.votes - a.votes ||
      b.createdAt - a.createdAt,
  )
}

export function Feedback() {
  const { isAdmin } = useData()
  const [posts, setPosts] = useState<FeedbackPost[] | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, FeedbackComment[]>>({})
  const [commentText, setCommentText] = useState('')

  useEffect(() => {
    fetchFeedback().then(setPosts).catch(() => setPosts([]))
  }, [])

  function patch(id: string, fields: Partial<FeedbackPost>) {
    setPosts((cur) =>
      cur ? sortPosts(cur.map((p) => (p.id === id ? { ...p, ...fields } : p))) : cur,
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const msg = message.trim()
    if (!msg) return
    setBusy(true)
    try {
      const created = await postFeedback(msg)
      setPosts((cur) => sortPosts([created, ...(cur || [])]))
      setMessage('')
    } catch (err: any) {
      alert(err?.message || 'Versturen mislukt')
    } finally {
      setBusy(false)
    }
  }

  async function toggleVote(p: FeedbackPost) {
    // Optimistisch bijwerken; bij fout terugdraaien.
    patch(p.id, {
      votedByMe: !p.votedByMe,
      votes: p.votes + (p.votedByMe ? -1 : 1),
    })
    try {
      const r = await voteFeedback(p.id)
      patch(p.id, { votes: r.votes, votedByMe: r.votedByMe })
    } catch {
      patch(p.id, { votedByMe: p.votedByMe, votes: p.votes })
    }
  }

  async function toggleComments(p: FeedbackPost) {
    if (openId === p.id) {
      setOpenId(null)
      return
    }
    setOpenId(p.id)
    setCommentText('')
    if (!comments[p.id]) {
      const list = await fetchFeedbackComments(p.id)
      setComments((c) => ({ ...c, [p.id]: list }))
    }
  }

  async function addComment(e: React.FormEvent, p: FeedbackPost) {
    e.preventDefault()
    const text = commentText.trim()
    if (!text) return
    const created = await commentFeedback(p.id, text)
    setComments((c) => ({ ...c, [p.id]: [...(c[p.id] || []), created] }))
    patch(p.id, { commentCount: p.commentCount + 1 })
    setCommentText('')
  }

  async function toggleStatus(p: FeedbackPost) {
    const next = p.status === 'done' ? 'open' : 'done'
    patch(p.id, { status: next })
    try {
      await setFeedbackStatus(p.id, next)
    } catch {
      patch(p.id, { status: p.status })
    }
  }

  async function remove(p: FeedbackPost) {
    if (!confirm('Deze feedback verwijderen?')) return
    setPosts((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur))
    await deleteFeedback(p.id).catch(() => {})
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Feedback</h1>
        <p className="subtitle">
          Deel ideeën, stem op wat jij belangrijk vindt en praat mee.
        </p>
      </header>

      <form onSubmit={submit} className="card-section">
        <textarea
          className="input textarea"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Wat zou je graag anders of beter zien?"
        />
        <button
          className="btn primary full"
          type="submit"
          disabled={busy || !message.trim()}
        >
          {busy ? 'Plaatsen…' : 'Plaatsen'}
        </button>
      </form>

      {!posts && <p className="empty-note">Laden…</p>}
      {posts && posts.length === 0 && (
        <p className="empty-note">
          Nog geen feedback. Wees de eerste en deel een idee!
        </p>
      )}

      <div className="feedback-list">
        {posts?.map((p) => {
          const open = openId === p.id
          const list = comments[p.id]
          return (
            <div
              key={p.id}
              className={`feedback-item${p.status === 'done' ? ' done' : ''}`}
            >
              <button
                className={`vote-btn${p.votedByMe ? ' on' : ''}`}
                onClick={() => toggleVote(p)}
                aria-label="Stem"
              >
                <span className="vote-thumb">👍</span>
                <span className="vote-count">{p.votes}</span>
              </button>
              <div className="feedback-body">
                {p.status === 'done' && (
                  <span className="status-badge">✓ Verwerkt</span>
                )}
                <p className="feedback-msg">{p.message}</p>
                <div className="feedback-meta">
                  <span>{p.author}</span>
                  <span>·</span>
                  <span>{fmt(p.createdAt)}</span>
                  <button className="link-btn" onClick={() => toggleComments(p)}>
                    💬 {p.commentCount}
                  </button>
                  {isAdmin && (
                    <>
                      <button className="link-btn" onClick={() => toggleStatus(p)}>
                        {p.status === 'done' ? 'Heropenen' : 'Markeer verwerkt'}
                      </button>
                      <button
                        className="link-btn danger"
                        onClick={() => remove(p)}
                      >
                        Verwijderen
                      </button>
                    </>
                  )}
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
                    <form onSubmit={(e) => addComment(e, p)} className="row gap">
                      <input
                        className="input grow"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Schrijf een reactie…"
                      />
                      <button className="btn primary sm" type="submit">
                        Plaats
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="version-note">
        Kindfolio v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>
    </div>
  )
}
