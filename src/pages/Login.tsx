import { useEffect, useState } from 'react'
import { useData } from '../store'
import { forgotPassword } from '../api'
import { isStandalone } from '../utils/pwaInstall'

type Mode = 'login' | 'register' | 'forgot'

export function Login() {
  const { login, register } = useData()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [forgotSent, setForgotSent] = useState(false)
  const [showPw, setShowPw] = useState(false)

  // Meldingen / uitnodigingslink uit de URL verwerken.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('verified')) {
      setNotice(
        params.get('verified') === '1'
          ? 'Je e-mailadres is bevestigd! Je kunt nu inloggen.'
          : 'Deze bevestigingslink is ongeldig of verlopen.',
      )
    }
    const invite = params.get('uitnodiging')
    if (invite) {
      setMode('register')
      setEmail(invite)
    }
    if (params.has('verified') || invite) {
      window.history.replaceState(
        {},
        '',
        window.location.pathname + window.location.hash,
      )
    }
  }, [])

  function go(m: Mode) {
    setMode(m)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    if (mode !== 'forgot' && !password) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else if (mode === 'register') {
        const r = await register(email.trim(), password, code.trim())
        if (r.needsVerification) {
          setRegisteredEmail(email.trim())
          setBusy(false)
        }
      } else {
        await forgotPassword(email.trim())
        setForgotSent(true)
        setBusy(false)
      }
    } catch (err: any) {
      setError(err?.message || 'Er ging iets mis')
      setBusy(false)
    }
  }

  // --- Bevestigingsscherm na registratie ---
  if (registeredEmail) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <span className="avatar lg login-logo">✉️</span>
          <h1>Bijna klaar!</h1>
          <p className="subtitle">Bevestig je e-mailadres</p>
          <p className="hint center">
            We hebben een bevestigingsmail gestuurd naar{' '}
            <strong>{registeredEmail}</strong>. Klik op de link in die mail om je
            account te activeren. (Check ook even je <strong>spam-map</strong>.)
          </p>
          <button
            className="btn outline full"
            onClick={() => {
              setRegisteredEmail(null)
              go('login')
            }}
          >
            Terug naar inloggen
          </button>
        </div>
      </div>
    )
  }

  // --- Bevestigingsscherm na 'wachtwoord vergeten' ---
  if (forgotSent) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <span className="avatar lg login-logo">✉️</span>
          <h1>Check je mail</h1>
          <p className="hint center">
            Als er een account bestaat met dit e-mailadres, hebben we een link
            gestuurd om een nieuw wachtwoord in te stellen. (Check ook je{' '}
            <strong>spam-map</strong>.)
          </p>
          <button
            className="btn outline full"
            onClick={() => {
              setForgotSent(false)
              go('login')
            }}
          >
            Terug naar inloggen
          </button>
        </div>
      </div>
    )
  }

  // --- Wachtwoord vergeten: e-mail invoeren ---
  if (mode === 'forgot') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <span className="avatar lg login-logo">🔑</span>
          <h1>Wachtwoord vergeten</h1>
          <p className="subtitle">We sturen je een herstel-link</p>
          <form onSubmit={submit} className="login-form">
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mailadres"
              autoComplete="email"
              autoFocus
            />
            <button className="btn primary full big" disabled={busy} type="submit">
              {busy ? 'Even geduld…' : 'Stuur herstel-link'}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
          <button className="link-btn center-link" onClick={() => go('login')}>
            ‹ Terug naar inloggen
          </button>
        </div>
      </div>
    )
  }

  // --- Inloggen / Registreren ---
  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="avatar lg login-logo">📚</span>
        <h1>Kindfolio</h1>
        <p className="subtitle">Thuisonderwijs logboek</p>

        {notice && <div className="banner ok-banner">{notice}</div>}

        <div className="seg auth-seg">
          <button
            className={`seg-btn ${mode === 'login' ? 'on' : ''}`}
            onClick={() => go('login')}
            type="button"
          >
            Inloggen
          </button>
          <button
            className={`seg-btn ${mode === 'register' ? 'on' : ''}`}
            onClick={() => go('register')}
            type="button"
          >
            Registreren
          </button>
        </div>

        <form onSubmit={submit} className="login-form">
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mailadres"
            autoComplete="email"
            autoFocus
          />
          <div className="row gap">
            <input
              type={showPw ? 'text' : 'password'}
              className="input grow"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Kies een wachtwoord (min. 8 tekens)' : 'Wachtwoord'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? 'Verberg' : 'Toon'}
            </button>
          </div>
          {mode === 'register' && (
            <input
              type="text"
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Uitnodigingscode"
              autoComplete="off"
            />
          )}
          <button className="btn primary full big" disabled={busy} type="submit">
            {busy
              ? 'Even geduld…'
              : mode === 'login'
                ? 'Inloggen'
                : 'Account aanmaken'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>

        {mode === 'login' && (
          <button className="link-btn center-link" onClick={() => go('forgot')}>
            Wachtwoord vergeten?
          </button>
        )}

        <p className="hint center">
          {mode === 'login'
            ? 'Je blijft hierna ingelogd op dit apparaat.'
            : 'Voor de beta heb je een uitnodigingscode nodig.'}
        </p>

        {!isStandalone() && (
          <button
            className="link-btn center-link"
            onClick={() => window.dispatchEvent(new Event('kindfolio:install'))}
          >
            📲 Installeer Kindfolio als app
          </button>
        )}
      </div>
    </div>
  )
}
