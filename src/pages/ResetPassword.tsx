import { useState } from 'react'
import { resetPassword } from '../api'

function getToken(): string {
  // HashRouter: de token staat achter het vraagteken in de hash (#/reset?token=...)
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q < 0) return ''
  return new URLSearchParams(hash.slice(q + 1)).get('token') || ''
}

function toLogin() {
  window.location.href = window.location.origin + '/'
}

export function ResetPassword() {
  const [token] = useState(getToken)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err: any) {
      setError(err?.message || 'Er ging iets mis')
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>Ongeldige link</h1>
          <p className="hint center">
            Deze link is niet compleet. Vraag een nieuwe aan via "Wachtwoord
            vergeten?".
          </p>
          <button className="btn outline full" onClick={toLogin}>
            Naar inloggen
          </button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <span className="avatar lg login-logo">✅</span>
          <h1>Gelukt!</h1>
          <p className="hint center">
            Je wachtwoord is gewijzigd. Je kunt nu inloggen met je nieuwe
            wachtwoord.
          </p>
          <button className="btn primary full big" onClick={toLogin}>
            Naar inloggen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="avatar lg login-logo">🔑</span>
        <h1>Nieuw wachtwoord</h1>
        <p className="subtitle">Kies een nieuw wachtwoord</p>
        <form onSubmit={submit} className="login-form">
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nieuw wachtwoord (min. 8 tekens)"
            autoComplete="new-password"
            autoFocus
          />
          <button className="btn primary full big" disabled={busy} type="submit">
            {busy ? 'Even geduld…' : 'Wachtwoord opslaan'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>
    </div>
  )
}
