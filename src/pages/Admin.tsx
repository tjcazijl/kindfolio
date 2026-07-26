import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAdminUsers, type AdminMember, type AdminOverview } from '../api'
import { useData } from '../store'

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// "Vandaag", "3 dagen geleden", of een datum — voor "laatst gezien".
function fmtAgo(ts?: number): string {
  if (!ts) return 'nooit teruggekomen'
  const dagen = Math.floor((Date.now() - ts) / 86400000)
  if (dagen <= 0) return 'vandaag actief'
  if (dagen === 1) return 'gisteren actief'
  if (dagen < 30) return `${dagen} dagen geleden`
  return fmtDate(ts)
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'eigenaar',
  editor: 'medeouder',
  commenter: 'meelezer',
  geen: 'geen portfolio',
}

export function Admin() {
  const navigate = useNavigate()
  const { isAdmin, loading } = useData()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loading) return
    if (!isAdmin) {
      navigate('/')
      return
    }
    fetchAdminUsers()
      .then(setData)
      .catch((e) => setError(e?.message || 'Kon gegevens niet laden'))
  }, [isAdmin, loading, navigate])

  const accounts = data?.accounts ?? []
  const totals = accounts.reduce(
    (a, u) => ({
      memos: a.memos + u.memos,
      summaries: a.summaries + u.summaries,
      mensen: a.mensen + 1 + u.members.length,
    }),
    { memos: 0, summaries: 0, mensen: 0 },
  )

  function memberRow(m: AdminMember) {
    return (
      <div key={m.email} className="admin-member">
        <span className="admin-member-email">
          {m.email}
          {!m.verified && <span className="badge-unverified">niet bevestigd</span>}
        </span>
        <span className="admin-member-meta">
          <span className={`role-badge ${m.role}`}>{ROLE_LABEL[m.role] ?? m.role}</span>
          <span className="admin-seen">{fmtAgo(m.lastSeen)}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate('/instellingen')}>
          ‹ Instellingen
        </button>
      </div>
      <header className="page-head">
        <h1>Beheer</h1>
        <p className="subtitle">Portfolio's en wie er toegang toe heeft</p>
      </header>

      {error && <div className="banner warn">{error}</div>}
      {!data && !error && <p className="empty-note">Laden…</p>}

      {data && (
        <>
          <div className="admin-stats">
            <div className="stat-card">
              <span className="stat-num">{accounts.length}</span>
              <span className="stat-label">portfolio's</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{totals.mensen}</span>
              <span className="stat-label">mensen</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">{totals.memos}</span>
              <span className="stat-label">memo's</span>
            </div>
          </div>

          <div className="admin-list">
            {accounts.map((a) => (
              <div key={a.email} className="admin-account">
                <div className="admin-row-main">
                  <span className="admin-email">
                    {a.email}
                    {!a.verified && (
                      <span className="badge-unverified">niet bevestigd</span>
                    )}
                  </span>
                  <span className="admin-date">{fmtDate(a.createdAt)}</span>
                </div>
                <div className="admin-counts">
                  <span>
                    {a.children} kind{a.children === 1 ? '' : 'eren'}
                  </span>
                  <span>
                    {a.memos} memo{a.memos === 1 ? '' : "'s"}
                  </span>
                  <span>{a.summaries} samenv.</span>
                  <span className="admin-seen">{fmtAgo(a.lastSeen)}</span>
                </div>

                {a.members.length > 0 && (
                  <div className="admin-members">
                    {a.members.map(memberRow)}
                  </div>
                )}

                {data.invites.filter((i) => i.ownerEmail === a.email).length > 0 && (
                  <div className="admin-members">
                    {data.invites
                      .filter((i) => i.ownerEmail === a.email)
                      .map((i) => (
                        <div key={i.email} className="admin-member">
                          <span className="admin-member-email">{i.email}</span>
                          <span className="admin-member-meta">
                            <span className="role-badge invite">
                              uitnodiging · {ROLE_LABEL[i.role] ?? i.role}
                            </span>
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {data.losse.length > 0 && (
            <>
              <h2 className="saved-title" style={{ marginTop: 22 }}>
                Zonder portfolio
              </h2>
              <div className="admin-list">
                {data.losse.map((m) => (
                  <div key={m.email} className="admin-account">
                    {memberRow(m)}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
