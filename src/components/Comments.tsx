import { useState } from 'react'
import { useData } from '../store'

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Props {
  targetType: 'memo' | 'summary'
  targetId: string
}

export function Comments({ targetType, targetId }: Props) {
  const { comments, accountEmail, role, addComment, removeComment } = useData()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const list = comments.filter(
    (c) => c.targetType === targetType && c.targetId === targetId,
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      await addComment(targetType, targetId, t)
      setText('')
    } catch (err: any) {
      alert(err?.message || 'Reactie plaatsen mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="comments">
      <h3 className="comments-title">
        💬 Reacties{list.length ? ` (${list.length})` : ''}
      </h3>
      {list.map((c) => (
        <div key={c.id} className="comment">
          <div className="comment-head">
            <span className="comment-author">{c.authorEmail}</span>
            <span className="comment-date">{fmt(c.createdAt)}</span>
          </div>
          <p className="comment-text">{c.text}</p>
          {(c.authorEmail === accountEmail || role === 'owner') && (
            <button
              className="link-btn danger comment-del"
              onClick={() => removeComment(c.id)}
            >
              verwijderen
            </button>
          )}
        </div>
      ))}
      <form onSubmit={submit} className="comment-form">
        <textarea
          className="input textarea comment-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Schrijf een reactie of tip…"
        />
        <button className="btn primary full" disabled={busy} type="submit">
          {busy ? 'Plaatsen…' : 'Reactie plaatsen'}
        </button>
      </form>
    </div>
  )
}
