import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import {
  summaryAvailable,
  type AiStatus,
  exportUrl,
  fetchShares,
  invite,
  revokeShare,
  type Share,
  type ShareRole,
} from '../api'
import { SUBJECTS, type Child } from '../types'
import { isStandalone } from '../utils/pwaInstall'
import { SubjectsEditor } from '../components/SubjectsEditor'
import { openTimelinePrint } from '../utils/timelinePrint'
import { formatDateLong, todayISO } from '../utils/dates'

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
    subcategories,
    aiEnabled,
    photoAiEnabled,
    kerndoelenEnabled,
    kerndoelenAi,
    saveSettings,
    children,
    memos,
    removeChild,
  } = useData()
  // Hoeveel AI-verzoeken er nog over zijn. Hier op te zoeken, in plaats van
  // dat je het pas merkt als het bijna op is.
  const [ai, setAi] = useState<AiStatus | null>(null)
  useEffect(() => {
    if (canEdit) summaryAvailable().then(setAi).catch(() => {})
  }, [canEdit])
  const [confirmStage, setConfirmStage] = useState<0 | 1 | 2>(0)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [wiping, setWiping] = useState(false)
  const [childToDelete, setChildToDelete] = useState<Child | null>(null)
  const [childTyped, setChildTyped] = useState('')
  const [deletingChild, setDeletingChild] = useState(false)
  // PDF-export opties
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfChildIds, setPdfChildIds] = useState<string[]>([])
  const [pdfFrom, setPdfFrom] = useState('')
  const [pdfTo, setPdfTo] = useState('')

  function openPdfModal() {
    setPdfChildIds(children.map((c) => c.id))
    setPdfFrom('')
    setPdfTo('')
    setPdfOpen(true)
  }
  function generatePdf() {
    const chosen = children.filter((c) => pdfChildIds.includes(c.id))
    const inRange = memos.filter(
      (m) =>
        (!pdfFrom || m.date >= pdfFrom) && (!pdfTo || m.date <= pdfTo),
    )
    const range =
      pdfFrom || pdfTo
        ? `${pdfFrom ? formatDateLong(pdfFrom) : 'begin'} t/m ${
            pdfTo ? formatDateLong(pdfTo) : 'nu'
          }`
        : undefined
    openTimelinePrint(chosen, inRange, range)
    setPdfOpen(false)
  }

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
          ? `${email} is uitgenodigd als gezinslid.`
          : inviteRole === 'writer'
            ? `${email} is uitgenodigd als meeschrijver.`
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

      {canEdit && (
      <section className="card-section">
        <h2>AI-samenvatting</h2>
        <p className="hint">
          Samenvattingen worden gemaakt met <strong>Claude</strong> (van
          Anthropic). Staat dit uit, dan toont het tabblad Samenvatting gewoon
          alle memo's onder elkaar — zonder AI.
        </p>
        {ai && ai.aiLimit != null && (
          <div className="ai-teller">
            <div className="ai-teller-kop">
              <span>Gebruikt in de afgelopen 30 dagen</span>
              <span className="ai-teller-n">
                {ai.aiUsed} van {ai.aiLimit}
              </span>
            </div>
            <div className="ai-balk">
              <i style={{ width: `${Math.min(100, (ai.aiUsed / ai.aiLimit) * 100)}%` }} />
            </div>
            <p className="hint">
              Samenvattingen, de foto-schrijfhulp en de kerndoelvoorstellen tellen
              hier samen in mee. Dit is een voortschrijdend venster: een verzoek
              van vandaag telt tot over dertig dagen mee. De grens vangt fouten
              af — loop je er in gewoon gebruik tegenaan, mail dan even naar{' '}
              <a href="mailto:info@kindfolio.nl">info@kindfolio.nl</a>.
            </p>
          </div>
        )}
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

        <p className="hint fotohulp-hint">
          <strong>Foto's beschrijven als schrijfhulp.</strong> Zet je dit aan,
          dan verschijnt bij het maken van een memo een knop die aan Claude
          vraagt wat er op je foto's te zien is. Je krijgt een ruwe eerste tekst
          waar je zelf op verder schrijft — je hoeft hem niet te gebruiken.
          Let op: je foto's worden dan naar Anthropic gestuurd om bekeken te
          worden. Daarom staat dit standaard uit.
        </p>
        {canEdit && (
          <label className="toggle-row">
            <span>Foto-schrijfhulp bij een memo</span>
            <input
              type="checkbox"
              className="toggle"
              checked={photoAiEnabled}
              onChange={(e) => saveSettings({ photoAiEnabled: e.target.checked })}
            />
          </label>
        )}
      </section>
      )}

      {canEdit && (
      <section className="card-section">
        <h2>Kerndoelen</h2>
        <p className="hint">
          Houd bij welke <strong>SLO-kerndoelen</strong> er langskomen, en maak
          daar een overzicht van dat je kunt laten zien. Je bent hier nergens toe
          verplicht — laat je dit uit, dan zie je er verder niets van in de app.
        </p>
        {canEdit && (
          <label className="toggle-row">
            <span>Kerndoelen bijhouden</span>
            <input
              type="checkbox"
              className="toggle"
              checked={kerndoelenEnabled}
              onChange={(e) =>
                saveSettings({ kerndoelenEnabled: e.target.checked })
              }
            />
          </label>
        )}

        {kerndoelenEnabled && canEdit && (
          <>
            <span className="field-label" style={{ marginTop: 14 }}>
              Hoe wil je ze koppelen?
            </span>
            <button
              type="button"
              className={`kd-keuze ${kerndoelenAi ? '' : 'on'}`}
              onClick={() => saveSettings({ kerndoelenAi: false })}
            >
              <span className="kd-bol" />
              <span>
                <span className="kd-keuze-t">Ik vink zelf aan</span>
                <span className="kd-keuze-s">
                  Bij een memo, een leermiddel of een agenda-item kies je zelf
                  welke kerndoelen erbij horen. Kost niets en er gaat niets naar
                  buiten.
                </span>
              </span>
            </button>
            <button
              type="button"
              className={`kd-keuze ai ${kerndoelenAi ? 'on' : ''}`}
              onClick={() => saveSettings({ kerndoelenAi: true })}
            >
              <span className="kd-bol" />
              <span>
                <span className="kd-keuze-t">Laat de AI voorstellen doen ✨</span>
                <span className="kd-keuze-s">
                  Claude leest je memo's en stelt kerndoelen voor. Jij bevestigt
                  of past aan — een voorstel telt pas mee als je het overneemt.
                </span>
              </span>
            </button>
            {kerndoelenAi && (
              <>
                <p className="hint kd-ai-uitleg">
                  Hiervoor gaat de <strong>tekst</strong> van je memo's naar
                  Anthropic — geen foto's. Het telt mee voor je AI-verzoeken per
                  maand.
                </p>
                <button
                  className="btn outline full"
                  onClick={() => navigate('/kerndoelen/scan')}
                >
                  ✨ Mijn memo's doorlopen
                </button>
                <p className="hint">
                  Voor memo's die je al eerder hebt geschreven. Nieuwe memo's
                  vink je gewoon bij het schrijven aan.
                </p>
              </>
            )}
            <p className="hint">
              Welke set bij een kind hoort — basisonderwijs of voortgezet — stel
              je in op de pagina van dat kind.
            </p>
          </>
        )}
      </section>
      )}

      {canEdit && (
        <section className="card-section">
          <h2>Vakgebieden</h2>
          <p className="hint">
            De standaardlijst voor alle kinderen. Tik op een vakgebied om er
            subcategorieën aan toe te voegen (bijv. Taal → woordenschat,
            spelling). Je kunt per kind een eigen lijst instellen op de pagina
            van dat kind.
          </p>
          <SubjectsEditor
            subjects={subjects}
            onChange={(next) => saveSettings({ subjects: next })}
            subcats={subcategories}
            onSubcatsChange={(next) => saveSettings({ subcategories: next })}
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
            Nodig iemand uit via hun e-mailadres. Een <strong>gezinslid</strong>{' '}
            (bijv. een medeouder) kan alles wat jij kunt. Een{' '}
            <strong>meeschrijver</strong> (bijv. je kind zelf) schrijft memo's
            maar komt niet aan je instellingen. Een <strong>meelezer</strong>{' '}
            (bijv. een lerares) leest mee en reageert.
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
                className={`seg-btn ${inviteRole === 'writer' ? 'on' : ''}`}
                onClick={() => setInviteRole('writer')}
              >
                Meeschrijver
              </button>
              <button
                type="button"
                className={`seg-btn ${inviteRole === 'editor' ? 'on' : ''}`}
                onClick={() => setInviteRole('editor')}
              >
                Gezinslid
              </button>
            </div>
            <p className="hint rol-uitleg">
              {inviteRole === 'commenter'
                ? 'Leest mee en kan reageren. Verandert niets.'
                : inviteRole === 'writer'
                  ? 'Schrijft memo’s met foto’s, vult aandachtspunten in en vinkt de agenda af. Komt niet aan je instellingen, je kinderen of het AI-tegoed, en kan alleen zijn eigen memo’s aanpassen. Bedoeld voor je kinderen zelf.'
                  : 'Mag alles wat jij mag, behalve uitnodigen en het account wissen.'}
            </p>
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
                      {s.role === 'editor'
                        ? 'gezinslid'
                        : s.role === 'writer'
                          ? 'meeschrijver'
                          : 'meelezer'}
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
        {canEdit && (
          <button className="btn outline full" onClick={downloadBackup}>
            ⬇ Tekstgegevens downloaden (JSON)
          </button>
        )}
        {canEdit && (
          <>
            <button
              className="btn outline full"
              onClick={() => {
                const a = document.createElement('a')
                a.href = exportUrl()
                a.click()
              }}
            >
              🖼️ Alles exporteren incl. foto's (ZIP)
            </button>
            <p className="hint">
              De ZIP bevat je gegevens (JSON) én alle foto's, geordend per kind en
              datum. Bij veel foto's kan de download even duren.
            </p>
            <button className="btn outline full" onClick={openPdfModal}>
              📄 Portfolio als PDF (tijdlijn met foto's)
            </button>
            <p className="hint">
              Opent een printbare tijdlijn per kind; kies daar “Opslaan als PDF”.
              Dit gebeurt volledig op je eigen apparaat.
            </p>
          </>
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

      {isOwner && (
        <section className="card-section">
          <button
            className="collapse-head"
            onClick={() => setDangerOpen((v) => !v)}
          >
            <span>
              <strong>Gevaarlijke acties</strong>
            </span>
            <span className="chevron">{dangerOpen ? '▾' : '▸'}</span>
          </button>
          {dangerOpen && (
            <div style={{ marginTop: 12 }}>
              <p className="hint">
                Dit wist <strong>je hele account</strong> — álle kinderen,
                memo's, foto's en samenvattingen tegelijk. Wil je maar één kind
                weg? Gebruik dan hierboven <strong>Kinderen beheren</strong>.
                Verwijderen kan niet ongedaan worden gemaakt.
              </p>
              <button
                className="btn danger-outline full"
                onClick={() => {
                  setTyped('')
                  setConfirmStage(1)
                }}
              >
                🗑 Alle gegevens verwijderen
              </button>
            </div>
          )}
        </section>
      )}

      <p className="version-note">
        <button className="link-btn" onClick={() => navigate('/updates')}>
          ✨ Wat is er nieuw
        </button>
        <br />
        Kindfolio v{__APP_VERSION__}
      </p>

      {pdfOpen && (
        <div className="modal-overlay" onClick={() => setPdfOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Portfolio als PDF</h2>
            <p className="hint">Kies welke kinderen en welke periode.</p>

            <span className="field-label">Kinderen</span>
            <div className="chips" style={{ marginBottom: 6 }}>
              {children.map((c) => {
                const on = pdfChildIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip child-chip ${on ? 'on' : ''}`}
                    onClick={() =>
                      setPdfChildIds((prev) =>
                        on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                      )
                    }
                  >
                    <span
                      className="avatar xs"
                      style={{
                        background: on ? '#fff' : c.color,
                        color: on ? c.color : '#fff',
                      }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    {c.name}
                  </button>
                )
              })}
            </div>

            <div className="row gap">
              <label className="field grow" style={{ margin: 0 }}>
                <span className="field-label">Van (optioneel)</span>
                <input
                  type="date"
                  className="input"
                  value={pdfFrom}
                  max={pdfTo || todayISO()}
                  onChange={(e) => setPdfFrom(e.target.value)}
                />
              </label>
              <label className="field grow" style={{ margin: 0 }}>
                <span className="field-label">Tot (optioneel)</span>
                <input
                  type="date"
                  className="input"
                  value={pdfTo}
                  min={pdfFrom || undefined}
                  max={todayISO()}
                  onChange={(e) => setPdfTo(e.target.value)}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setPdfOpen(false)}>
                Annuleren
              </button>
              <button
                className="btn primary"
                disabled={pdfChildIds.length === 0}
                onClick={generatePdf}
              >
                PDF openen
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h2>Je hele account wissen?</h2>
                <p>
                  <strong>Alle kinderen samen</strong> — met al hun memo's, foto's
                  en samenvattingen — worden permanent verwijderd.
                </p>
                <p className="hint">
                  Wil je maar één kind weg? Annuleer dit en gebruik “Kinderen
                  beheren”. Dit kan niet ongedaan worden gemaakt.
                </p>
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
                  Typ je e-mailadres <strong>{accountEmail}</strong> om definitief
                  je hele account te wissen.
                </p>
                <input
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={accountEmail || 'e-mailadres'}
                  autoComplete="off"
                  autoFocus
                />
                <div className="modal-actions">
                  <button className="btn ghost" onClick={closeModal}>
                    Annuleren
                  </button>
                  <button
                    className="btn danger-solid"
                    disabled={
                      typed.trim().toLowerCase() !==
                        (accountEmail || '').toLowerCase() || wiping
                    }
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
