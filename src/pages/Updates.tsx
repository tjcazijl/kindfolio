import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHANGELOG, markUpdatesSeen } from '../data/changelog'
import { formatDateLong } from '../utils/dates'

export function Updates() {
  const navigate = useNavigate()

  // Alles als gezien markeren zodra deze pagina geopend wordt.
  useEffect(() => {
    markUpdatesSeen()
  }, [])

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
        {CHANGELOG.map((u) => (
          <article key={u.id} className="changelog-item">
            <div className="changelog-date">{formatDateLong(u.date)}</div>
            <h2 className="changelog-title">{u.title}</h2>
            <ul className="changelog-list">
              {u.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  )
}
