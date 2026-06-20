import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAdminUsers, type AdminUser } from '../api'
import { useData } from '../store'

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function Admin() {
  const navigate = useNavigate()
  const { isAdmin, loading } = useData()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!isAdmin) {
      navigate('/')
      return
    }
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e?.message || 'Kon gegevens niet laden'))
  }, [isAdmin, loading, navigate])

  const totals = users?.reduce(
    (a, u) => ({
      memos: a.memos + u.memos,
      summaries: a.summaries + u.summaries,
    }),
    { memos: 0, summaries: 0 },
  )

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/instellingen')}>
          ‹ Instellingen
        </button>
      </div>
      <header className="page-head">
        <h1>Beheer</h1>
        <p className="subtitle">Overzicht van alle accounts</p>
      </header>

      {error && <div className="banner warn">{error}</div>}
      {!users && !error && <p className="empty-note">Laden…</p>}

      {users && (
        <>
          <div className="admin-stats">
            <div className="stat-card">
              <span className="stat-num">{users.length}</span>
              <span className="stat-label">accounts</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{totals?.memos ?? 0}</span>
              <span className="stat-label">memo's</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{totals?.summaries ?? 0}</span>
              <span className="stat-label">samenvattingen</span>
            </div>
          </div>

          <div className="admin-list">
            {users.map((u) => (
              <div key={u.email} className="admin-row">
                <div className="admin-row-main">
                  <span className="admin-email">
                    {u.email}
                    {!u.verified && (
                      <span className="badge-unverified">niet bevestigd</span>
                    )}
                  </span>
                  <span className="admin-date">{fmtDate(u.createdAt)}</span>
                </div>
                <div className="admin-counts">
                  <span>{u.children} kind{u.children === 1 ? '' : 'eren'}</span>
                  <span>{u.memos} memo{u.memos === 1 ? '' : "'s"}</span>
                  <span>{u.summaries} samenv.</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
