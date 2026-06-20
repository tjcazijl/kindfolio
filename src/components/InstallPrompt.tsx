import { useEffect, useState } from 'react'
import {
  canPromptInstall,
  isIOS,
  isStandalone,
  onInstallChange,
  promptInstall,
} from '../utils/pwaInstall'

const DISMISS_KEY = 'kindfolio-install-dismissed'

// iOS-deelicoon (vierkant met pijl omhoog).
function ShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </svg>
  )
}

export function InstallPrompt({ auto = true }: { auto?: boolean }) {
  const [open, setOpen] = useState(false)
  const [canPrompt, setCanPrompt] = useState(canPromptInstall())
  const ios = isIOS()

  // Volg of er een native installatieprompt beschikbaar komt.
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), [])

  // Automatisch één keer tonen voor wie de app nog niet heeft geïnstalleerd.
  useEffect(() => {
    if (!auto) return
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return
    if (!ios && !canPrompt) return // op niet-iOS wachten tot install mogelijk is
    const t = setTimeout(() => setOpen(true), 2500)
    return () => clearTimeout(t)
  }, [auto, ios, canPrompt])

  // Vanuit Instellingen handmatig openen.
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('kindfolio:install', handler)
    return () => window.removeEventListener('kindfolio:install', handler)
  }, [])

  function close() {
    setOpen(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    const ok = await promptInstall()
    if (ok) close()
  }

  if (!open || isStandalone()) return null

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal install-modal" onClick={(e) => e.stopPropagation()}>
        <div className="install-icon">📲</div>
        <h2>Zet Kindfolio op je beginscherm</h2>
        <p className="hint">
          Dan open je het als een gewone app — sneller, schermvullend en met een
          eigen icoontje.
        </p>

        {canPrompt ? (
          <button className="btn primary full big" onClick={install}>
            Nu installeren
          </button>
        ) : ios ? (
          <ol className="install-steps">
            <li>
              <span>
                Tik onderaan op het <strong>deel-icoon</strong>
              </span>
              <span className="step-chip">
                <ShareIcon />
              </span>
            </li>
            <li>
              Kies <strong>“Zet op beginscherm”</strong>
              <span className="step-chip">＋</span>
            </li>
            <li>
              Tik op <strong>“Voeg toe”</strong> — klaar!
            </li>
          </ol>
        ) : (
          <p className="hint">
            Open deze website op je telefoon (Chrome op Android of Safari op
            iPhone) om hem als app toe te voegen. Op de computer kun je in de
            adresbalk vaak op het installatie-icoon klikken.
          </p>
        )}

        <button className="btn ghost full" onClick={close}>
          {canPrompt ? 'Niet nu' : 'Sluiten'}
        </button>
      </div>
    </div>
  )
}
