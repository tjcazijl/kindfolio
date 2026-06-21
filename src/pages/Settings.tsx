import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import {
  fetchShares,
  invite,
  revokeShare,
  type Share,
  type ShareRole,
} from '../api'
import { SUBJECTS, type Child } from '../types'
import { isStandalone } from '../utils/pwaInstall'
import { SubjectsEditor } from '../components/SubjectsEditor'

export function Settings() {
  const navigate = useNavigate()
  const {
    logout,
    accountEmail,
    wipeData,
    isAdmin,
    canEdit,
    isOwner,
    subjects,
    aiEnabled,
    saveSettings,
    children,
    removeChild,
  } = useData()
  const [confirmStage, setConfirmStage] = useState<0 | 1 | 2>(0)
  const [typed, setTyped] = useState('')
  const [wiping, setWiping] = useState(false)
  const [childToDelete, setChildToDelete] = useState<Child | null>(null)
  const [childTyped, setChildTyped] = useState('')
  const [deletingChild, setDeletingChild] = useState(false)

  async function doDeleteChild() {
    if (!childToDelete) return
    setDeletingChild(true)
    try {
      await removeChild(childToDelete.id)
      setChildToDelete(null)
      setChildTyped('')
    } catch (e: any) {
      alert(e?.message || 'Verwijderen mislukt')
    } finally {
      setDeletingChild(false)
    }
  }

  // Delen
  const [shares, setShares] = useState<Share[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ShareRole>('commenter')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOwner) fetchShares().then(setShares).catch(() => {})
  }, [isOwner])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    setInviteBusy(true)
    setInviteMsg(null)
    try {
      await invite(email, inviteRole)
      setInviteMsg(
        inviteRole === 'editor'
          ? `${email} is uitgenodigd als medeouder.`
          : `${email} is uitgenodigd als meelezer.`,
      )
      setInviteEmail('')
      setShares(await fetchShares())
    } catch (err: any) {
      setInviteMsg(err?.message || 'Uitnodigen mislukt')
    } finally {
      setInviteBusy(false)
    }
  }

  async function revoke(email: string) {
    if (!confirm(`Toegang van ${email} intrekken?`)) return
    await revokeShare(email)
    setShares(await fetchShares())
  }

  async function downloadBackup() {
    try {
      const res = await fetch('/api/state')
      const data = await res.text()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kindfolio-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Back-up downloaden mislukt.')
    }
  }

  function closeModal() {
    setConfirmStage(0)
    setTyped('')
  }

  async function doWipe() {
    setWiping(true)
    try {
      await wipeData()
      closeModal()
    } catch (e: any) {
      alert(e?.message || 'Verwijderen mislukt')
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Instellingen</h1>
      </header>

      {isAdmin && (
        <section className="card-section">
          <h2>Beheer</h2>
          <p className="hint">Overzicht van alle accounts en hun activiteit.</p>
          <button className="btn outline full" onClick={() => navigate('/beheer')}>
            👑 Accounts bekijken
          </button>
        </section>
      )}

      <section className="card-section">
        <h2>AI-samenvatting</h2>
        <p className="hint">
          Samenvattingen worden gemaakt met <strong>Claude</strong> (van
          Anthropic). Staat dit uit, dan toont het tabblad Samenvatting gewoon
          alle memo's onder elkaar — zonder AI.
        </p>
        {canEdit && (
          <label className="toggle-row">
            <span>AI-samenvattingen gebruiken</span>
            <input
              type="checkbox"
              className="toggle"
              checked={aiEnabled}
              onChange={(e) => saveSettings({ aiEnabled: e.target.checked })}
            />
          </label>
        )}
      </section>

      {canEdit && (
        <section className="card-section">
          <h2>Vakgebieden</h2>
          <p className="hint">
            De standaardlijst voor alle kinderen. Je kunt per kind een eigen
            lijst instellen op de pagina van dat kind.
          </p>
          <SubjectsEditor
            subjects={subjects}
            onChange={(next) => saveSettings({ subjects: next })}
            reset={
              subjects.length !== SUBJECTS.length
                ? {
                    label: 'Standaardlijst herstellen',
                    onClick: () => saveSettings({ subjects: [...SUBJECTS] }),
                  }
                : undefined
            }
          />
        </section>
      )}

      {isOwner && (
        <section className="card-section">
          <h2>Delen &amp; samenwerken</h2>
          <p className="hint">
            Nodig iemand uit via hun e-mailadres. Een <strong>medeouder</strong>{' '}
            kan samen met jou kinderen, memo's en samenvattingen toevoegen en
            bewerken. Een <strong>meelezer</strong> (bijv. een lerares) kan alles
            lezen en erop reageren, maar niets bewerken.
          </p>
          <form onSubmit={sendInvite} className="invite-form">
            <input
              className="input"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="E-mailadres"
              autoComplete="off"
            />
            <div className="seg">
              <button
                type="button"
                className={`seg-btn ${inviteRole === 'commenter' ? 'on' : ''}`}
                onClick={() => setInviteRole('commenter')}
              >
                Meelezer
              </button>
              <button
                type="button"
                className={`seg-btn ${inviteRole === 'editor' ? 'on' : ''}`}
                onClick={() => setInviteRole('editor')}
              >
                Medeouder
              </button>
            </div>
            <button
              className="btn primary full"
              disabled={inviteBusy}
              type="submit"
            >
              {inviteBusy ? 'Uitnodigen…' : 'Uitnodigen'}
            </button>
          </form>
          {inviteMsg && <p className="ok-text">{inviteMsg}</p>}
          {shares.length > 0 && (
            <div className="share-list">
              {shares.map((s) => (
                <div key={s.email} className="share-row">
                  <span>
                    {s.email}
                    <span className="role-badge">
                      {s.role === 'editor' ? 'medeouder' : 'meelezer'}
                    </span>
                    {s.status === 'pending' && (
                      <span className="badge-unverified">uitgenodigd</span>
                    )}
                  </span>
                  <button
                    className="link-btn danger"
                    onClick={() => revoke(s.email)}
                  >
                    Intrekken
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {canEdit && children.length > 0 && (
        <section className="card-section">
          <h2>Kinderen beheren</h2>
          <p className="hint">
            Hier verwijder je een kind. <strong>Let op:</strong> alle memo's,
            foto's en samenvattingen van dat kind gaan dan permanent weg.
          </p>
          <div className="share-list">
            {children.map((c) => (
              <div key={c.id} className="share-row">
                <span>
                  <span
                    className="avatar xs"
                    style={{ background: c.color, marginRight: 8 }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </span>
                <button
                  className="link-btn danger"
                  onClick={() => {
                    setChildToDelete(c)
                    setChildTyped('')
                  }}
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card-section">
        <h2>Gegevens</h2>
        <p className="hint">
          Al je gegevens worden veilig opgeslagen op een server in de{' '}
          <strong>Europese Unie</strong> (Duitsland) en gesynchroniseerd tussen
          je apparaten. Je kunt een kopie van de tekstgegevens downloaden
          (zonder foto's).
        </p>
        <button className="btn outline full" onClick={downloadBackup}>
          ⬇ Tekstgegevens downloaden (JSON)
        </button>
        {isOwner && (
          <button
            className="btn danger-outline full"
            onClick={() => setConfirmStage(1)}
          >
            🗑 Alle gegevens verwijderen
          </button>
        )}
      </section>

      {!isStandalone() && (
        <section className="card-section">
          <h2>App op je telefoon</h2>
          <p className="hint">
            Zet Kindfolio als icoon op je beginscherm — dan opent het als een
            gewone app.
          </p>
          <button
            className="btn outline full"
            onClick={() => window.dispatchEvent(new Event('kindfolio:install'))}
          >
            📲 App installeren
          </button>
        </section>
      )}

      <section className="card-section">
        <h2>Account</h2>
        {accountEmail && (
          <p className="hint">
            Ingelogd als <strong>{accountEmail}</strong>
          </p>
        )}
        <button className="btn danger-outline full" onClick={() => logout()}>
          Uitloggen
        </button>
      </section>

      <p className="version-note">
        Kindfolio v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>

      {childToDelete && (
        <div className="modal-overlay" onClick={() => setChildToDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{childToDelete.name} verwijderen?</h2>
            <p>
              Alle memo's, foto's en samenvattingen van{' '}
              <strong>{childToDelete.name}</strong> worden permanent verwijderd.
              Dit kan niet ongedaan worden gemaakt.
            </p>
            <p className="hint">
              Typ <strong>{childToDelete.name}</strong> om te bevestigen.
            </p>
            <input
              className="input"
              value={childTyped}
              onChange={(e) => setChildTyped(e.target.value)}
              placeholder={childToDelete.name}
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="btn ghost"
                onClick={() => setChildToDelete(null)}
              >
                Annuleren
              </button>
              <button
                className="btn danger-solid"
                disabled={
                  childTyped.trim() !== childToDelete.name || deletingChild
                }
                onClick={doDeleteChild}
              >
                {deletingChild ? 'Verwijderen…' : 'Definitief verwijderen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmStage > 0 && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {confirmStage === 1 ? (
              <>
                <h2>Weet je het zeker?</h2>
                <p>
                  Al je <strong>kinderen, memo's, foto's en samenvattingen</strong>{' '}
                  worden permanent verwijderd. Je account zelf blijft bestaan.
                </p>
                <p className="hint">Dit kan niet ongedaan worden gemaakt.</p>
                <div className="modal-actions">
                  <button className="btn ghost" onClick={closeModal}>
                    Annuleren
                  </button>
                  <button
                    className="btn danger-solid"
                    onClick={() => setConfirmStage(2)}
                  >
                    Doorgaan
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Laatste bevestiging</h2>
                <p>
                  Typ <strong>VERWIJDER</strong> om definitief al je gegevens te
                  wissen.
                </p>
                <input
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="VERWIJDER"
                  autoFocus
                />
                <div className="modal-actions">
                  <button className="btn ghost" onClick={closeModal}>
                    Annuleren
                  </button>
                  <button
                    className="btn danger-solid"
                    disabled={typed.trim().toUpperCase() !== 'VERWIJDER' || wiping}
                    onClick={doWipe}
                  >
                    {wiping ? 'Verwijderen…' : 'Definitief verwijderen'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
