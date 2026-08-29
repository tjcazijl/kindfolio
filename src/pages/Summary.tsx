import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useData } from '../store'
import { generateSummary, photoUrl, summaryAvailable, type AiStatus } from '../api'
import { Markdown } from '../components/Markdown'
import { Comments } from '../components/Comments'
import { Lightbox } from '../components/Lightbox'
import { KerndoelenOverzicht } from '../components/KerndoelenOverzicht'
import { PeriodList } from '../components/PeriodList'
import {
  formatDateLong,
  formatDateNumeric,
  periodRange,
  shiftPeriod,
  todayISO,
  type Period,
} from '../utils/dates'
import { openSummaryPrint } from '../utils/summaryPrint'

const PERIODS: Period[] = ['week', 'maand', 'kwartaal']

// Kopjes boven de bewaarde samenvattingen.
const SAVED_TAB_LABEL: Record<string, string> = {
  week: 'Weken',
  maand: 'Maanden',
  kwartaal: 'Kwartalen',
  eigen: 'Eigen',
}

function formatMoment(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function Summary() {
  const {
    children,
    memos,
    summaries,
    removeSummary,
    editSummary,
    reload,
    canEdit,
    aiEnabled,
    kerndoelenEnabled,
  } = useData()
  // Terugkomen vanuit de periode-editor opent weer het juiste tabblad.
  const locState = useLocation().state as { tab?: string } | null
  // Terugkomen vanuit de scan of de periode-editor opent het juiste tabblad.
  const gevraagdTab =
    locState?.tab === 'periodes' || locState?.tab === 'kerndoelen'
      ? locState.tab
      : 'samenvatting'
  const [tab, setTab] = useState<'samenvatting' | 'periodes' | 'kerndoelen'>(
    gevraagdTab,
  )
  const [ai, setAi] = useState<AiStatus | null>(null)
  const available = ai ? ai.available : null

  const [childId, setChildId] = useState<string>('')
  const [period, setPeriod] = useState<Period>('week')
  const [refDate, setRefDate] = useState<Date>(new Date())
  const [custom, setCustom] = useState(false)
  const [customStart, setCustomStart] = useState<string>(
    () => periodRange('week').start,
  )
  const [customEnd, setCustomEnd] = useState<string>(() => todayISO())
  const [subject, setSubject] = useState<string>('')
  const [withPhotos, setWithPhotos] = useState(false)
  const [withBooks, setWithBooks] = useState(false)
  const [withKerndoelen, setWithKerndoelen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Bewerken van een bewaarde samenvatting.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // Foto's groot bekijken bij een samenvatting.
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(
    null,
  )

  useEffect(() => {
    if (aiEnabled) summaryAvailable().then(setAi)
  }, [aiEnabled])
  // Tegoed op = alleen nog samenvattingen zonder AI mogelijk.
  const aiOp = !!ai && ai.aiLeft !== null && ai.aiLeft <= 0

  const customValid = !!customStart && !!customEnd && customStart <= customEnd
  const range = useMemo(
    () =>
      custom
        ? {
            start: customStart,
            end: customEnd,
            label: `${formatDateNumeric(customStart)} – ${formatDateNumeric(customEnd)}`,
          }
        : periodRange(period, refDate),
    [custom, customStart, customEnd, period, refDate],
  )

  const effectiveChildId = childId || children[0]?.id || ''
  const child = children.find((c) => c.id === effectiveChildId)

  const periodMemos = useMemo(
    () =>
      memos
        .filter(
          (m) =>
            m.childId === effectiveChildId &&
            !m.draft &&
            m.date >= range.start &&
            m.date <= range.end,
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [memos, effectiveChildId, range.start, range.end],
  )

  // Vakgebieden die in deze periode voorkomen (opties voor het filter).
  const subjectsInPeriod = useMemo(
    () => [...new Set(periodMemos.flatMap((m) => m.subjects))].sort(),
    [periodMemos],
  )
  // Filter het filter weg zodra het niet meer van toepassing is (ander kind/periode).
  useEffect(() => {
    if (subject && !subjectsInPeriod.includes(subject)) setSubject('')
  }, [subjectsInPeriod, subject])

  const filteredMemos = useMemo(
    () =>
      subject ? periodMemos.filter((m) => m.subjects.includes(subject)) : periodMemos,
    [periodMemos, subject],
  )

  const childSummaries = useMemo(
    () => summaries.filter((s) => s.childId === effectiveChildId),
    [summaries, effectiveChildId],
  )

  // Bij welke dag hoort een foto? Afgeleid uit de memo's, zodat ook eerder
  // bewaarde samenvattingen dagkoppen krijgen zonder de opslag te wijzigen.
  const photoDay = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of memos) for (const id of m.photoIds) map.set(id, m.date)
    return map
  }, [memos])

  /** Foto's van een bewaarde samenvatting, elk met de dag waarop ze horen. */
  function summaryPhotos(ids: string[]) {
    return ids.map((id) => {
      const iso = photoDay.get(id)
      return { url: photoUrl(id), day: iso ? formatDateLong(iso) : undefined }
    })
  }

  // Bewaarde samenvattingen per soort periode, zodat weken niet tussen
  // maanden en kwartalen door lopen.
  const savedGroups = useMemo(() => {
    const order = ['week', 'maand', 'kwartaal', 'eigen']
    const map = new Map<string, typeof childSummaries>()
    for (const s of childSummaries) {
      const key = order.includes(s.period) ? s.period : 'eigen'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return order
      .filter((k) => map.has(k))
      .map((k) => [k, map.get(k)!] as const)
  }, [childSummaries])

  // Tab kiezen: onthoud de keuze, maar val terug als die leeg raakt.
  const [savedTab, setSavedTab] = useState<string | null>(null)
  const activeTab =
    savedTab && savedGroups.some(([k]) => k === savedTab)
      ? savedTab
      : (savedGroups[0]?.[0] ?? null)
  const shownSummaries =
    savedGroups.find(([k]) => k === activeTab)?.[1] ?? []

  async function run() {
    if (!child || filteredMemos.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const saved = await generateSummary({
        childId: child.id,
        start: range.start,
        end: range.end,
        // Een eigen datumreeks is geen week/maand/kwartaal — apart bewaren,
        // zodat het onder het juiste tabje terechtkomt.
        period: custom ? 'eigen' : period,
        periodLabel: subject ? `${subject} · ${range.label}` : range.label,
        includePhotos: false,
        withPhotos,
        withBooks,
        withKerndoelen,
        subject: subject || undefined,
        ai: aiEnabled,
      })
      await reload()
      setExpandedId(saved.id)
      if (aiEnabled) summaryAvailable().then(setAi)
    } catch (e: any) {
      setError(e?.message || 'Er ging iets mis.')
      // Bij een limietfout meteen de teller bijwerken, zodat de melding klopt.
      if (aiEnabled) summaryAvailable().then(setAi)
    } finally {
      setLoading(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Deze samenvatting verwijderen?')) return
    await removeSummary(id)
  }

  // Memo's onder elkaar als platte tekst voor PDF / afdrukken.
  function printOverview() {
    if (!child) return
    const body = filteredMemos
      .map((m) => {
        const head = `## ${formatDateLong(m.date)}`
        const tags = m.subjects.length ? `*${m.subjects.join(', ')}*\n\n` : ''
        return `${head}\n\n${tags}${m.text || ''}`
      })
      .join('\n\n')
    const title = subject
      ? `${child.name} — ${subject} — ${range.label}`
      : `${child.name} — ${range.label}`
    const fotos = withPhotos
      ? filteredMemos
          .flatMap((m) =>
            m.photoIds.map((id) => ({
              url: photoUrl(id),
              day: formatDateLong(m.date),
            })),
          )
          .slice(0, 60)
      : []
    openSummaryPrint(
      title,
      `${child.name} · ${filteredMemos.length} memo${filteredMemos.length === 1 ? '' : "'s"}`,
      body,
      fotos,
    )
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    try {
      await editSummary(id, { text: editText })
      setEditingId(null)
    } catch (e: any) {
      alert(e?.message || 'Opslaan mislukt')
    } finally {
      setSavingEdit(false)
    }
  }

  if (children.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Samenvatting</h1>
        </header>
        <p className="empty-note">Voeg eerst een kind en wat memo's toe.</p>
      </div>
    )
  }

  const periodControls = (
    <>
      <div className="field">
        <span className="field-label">Periode</span>
        <div className="seg">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`seg-btn ${!custom && period === p ? 'on' : ''}`}
              onClick={() => {
                setCustom(false)
                setPeriod(p)
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <button
            className={`seg-btn ${custom ? 'on' : ''}`}
            onClick={() => setCustom(true)}
          >
            Eigen
          </button>
        </div>
      </div>

      {custom ? (
        <div className="row gap">
          <label className="field">
            <span className="field-label">Van</span>
            <input
              type="date"
              className="input"
              value={customStart}
              max={customEnd || todayISO()}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Tot en met</span>
            <input
              type="date"
              className="input"
              value={customEnd}
              min={customStart}
              max={todayISO()}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <div className="period-nav">
          <button
            className="link-btn"
            onClick={() => setRefDate((d) => shiftPeriod(period, d, -1))}
          >
            ‹ Vorige
          </button>
          <span className="period-label">{range.label}</span>
          <button
            className="link-btn"
            onClick={() => setRefDate((d) => shiftPeriod(period, d, 1))}
          >
            Volgende ›
          </button>
        </div>
      )}

      {custom && !customValid && (
        <p className="hint">Kies een begindatum die vóór de einddatum ligt.</p>
      )}

      {subjectsInPeriod.length > 0 && (
        <label className="field">
          <span className="field-label">Vakgebied</span>
          <select
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">Alle vakgebieden</option>
            {subjectsInPeriod.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="count-line">
        {filteredMemos.length} memo
        {filteredMemos.length === 1 ? '' : "'s"}
        {subject ? ` voor ${subject}` : ' in deze periode'}
      </p>
    </>
  )

  // Segmentkiezer boven de Terugblik. "Kerndoelen" verschijnt alleen als je ze
  // aan hebt staan; periodes staan er altijd, die staan op zichzelf.
  const segmenten: { key: typeof tab; label: string }[] = [
    { key: 'samenvatting', label: 'Samenvattingen' },
    { key: 'periodes', label: 'Periodes' },
    ...(kerndoelenEnabled
      ? [{ key: 'kerndoelen' as const, label: 'Kerndoelen' }]
      : []),
  ]
  const segKiezer = (
    <div className="seg" style={{ marginBottom: 14 }}>
      {segmenten.map((s) => (
        <button
          key={s.key}
          className={`seg-btn ${tab === s.key ? 'on' : ''}`}
          onClick={() => setTab(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  )

  if (tab !== 'samenvatting') {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Terugblik</h1>
          <p className="subtitle">
            {tab === 'periodes'
              ? 'Waar jullie een tijd in zaten'
              : 'Welke kerndoelen er zijn langsgekomen'}
          </p>
        </header>
        {segKiezer}
        {tab === 'periodes' ? <PeriodList /> : <KerndoelenOverzicht />}
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Terugblik</h1>
        <p className="subtitle">
          {aiEnabled ? 'AI-overzicht per periode' : 'Memo-overzicht per periode'}
        </p>
      </header>

      {segKiezer}

      {aiEnabled && available === false && (
        <div className="banner warn">
          De AI-samenvatting is nog niet ingesteld op de server.
        </div>
      )}

      {aiEnabled && aiOp && (
        <div className="banner warn">
          Er zijn in de afgelopen 30 dagen al {ai?.aiLimit} AI-verzoeken gedaan vanuit dit
          portfolio. Die grens zit er alleen om fouten af te vangen — kom je er
          in gewoon gebruik tegenaan, mail dan even naar{' '}
          <a href="mailto:info@kindfolio.nl">info@kindfolio.nl</a>. Een
          samenvatting <strong>zonder AI</strong> kun je gewoon blijven maken —
          zet AI uit bij Instellingen.
        </div>
      )}

      {/* Alleen waarschuwen als het bijna op is; anders is het ruis. */}
      {aiEnabled && !aiOp && ai?.aiLeft != null && ai.aiLeft <= 10 && (
        <p className="hint">
          Nog {ai.aiLeft} AI-verzoeken over in de komende dagen.
        </p>
      )}

      <label className="field">
        <span className="field-label">Kind</span>
        <select
          className="input"
          value={effectiveChildId}
          onChange={(e) => setChildId(e.target.value)}
        >
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {(!aiEnabled || canEdit) && periodControls}

      {/* Samenvatting maken — met of zonder AI (chronologisch). */}
      {canEdit && (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={withPhotos}
              onChange={(e) => setWithPhotos(e.target.checked)}
            />
            📷 Foto's uit deze periode meenemen in de samenvatting
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={withBooks}
              onChange={(e) => setWithBooks(e.target.checked)}
            />
            📚 Gelezen boeken uit deze periode onderaan toevoegen
          </label>
          {kerndoelenEnabled && (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={withKerndoelen}
                onChange={(e) => setWithKerndoelen(e.target.checked)}
              />
              🎯 Kerndoelen en de stand per leergebied onderaan toevoegen
            </label>
          )}
          <button
            className="btn primary full big"
            disabled={
              loading ||
              filteredMemos.length === 0 ||
              (custom && !customValid) ||
              (aiEnabled && (available === false || aiOp))
            }
            onClick={run}
          >
            {loading
              ? 'Samenvatting maken…'
              : aiEnabled
                ? subject
                  ? `✨ Samenvatting maken (${subject})`
                  : '✨ Samenvatting maken'
                : subject
                  ? `Samenvatting maken (${subject})`
                  : 'Samenvatting maken'}
          </button>
          {!aiEnabled && (
            <p className="hint">
              Zonder AI: alle memo's chronologisch onder elkaar.
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
        </>
      )}

      {/* Zonder AI: voorbeeld van de memo's + losse PDF-knop. */}
      {!aiEnabled &&
        (filteredMemos.length > 0 ? (
          <>
            <button className="btn outline full" onClick={printOverview}>
              📄 PDF / Afdrukken
            </button>
            <div className="timeline">
              {filteredMemos.map((m) => (
                <div key={m.id} className="memo-card static">
                  <div className="memo-date">{formatDateLong(m.date)}</div>
                  {m.subjects.length > 0 && (
                    <div className="tags">
                      {m.subjects.map((s) => (
                        <span key={s} className="tag">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text && <p className="memo-text">{m.text}</p>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-note">
            {subject
              ? `Geen memo's voor ${subject} in deze periode.`
              : "Geen memo's in deze periode."}
          </p>
        ))}

      {/* Bewaarde samenvattingen — in beide modi, gegroepeerd per soort. */}
      {childSummaries.length > 0 && (
        <section className="saved-summaries">
          <h2 className="saved-title">Bewaarde samenvattingen</h2>
          {savedGroups.length > 1 && (
            <div className="seg saved-seg">
              {savedGroups.map(([key, list]) => (
                <button
                  key={key}
                  className={`seg-btn ${activeTab === key ? 'on' : ''}`}
                  onClick={() => setSavedTab(key)}
                >
                  {SAVED_TAB_LABEL[key] ?? key} · {list.length}
                </button>
              ))}
            </div>
          )}
          {shownSummaries.map((s) => {
                const open = expandedId === s.id
                return (
                  <div key={s.id} className="summary-item">
                    <button
                      className="summary-item-head"
                      onClick={() => setExpandedId(open ? null : s.id)}
                    >
                      <span>
                        <strong>{s.periodLabel}</strong>
                        <span className="summary-date">
                          Gemaakt op {formatMoment(s.createdAt)}
                        </span>
                      </span>
                      <span className="chevron">{open ? '▾' : '▸'}</span>
                    </button>
                    {open && (
                      <div className="summary-item-body">
                        {editingId === s.id ? (
                          <div className="summary-edit">
                            <textarea
                              className="input textarea summary-textarea"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <p className="hint">
                              Je bewerkt de tekst (Markdown: # kop, - opsomming,
                              **vet**).
                            </p>
                            <div className="row gap">
                              <button
                                className="btn primary sm"
                                disabled={savingEdit}
                                onClick={() => saveEdit(s.id)}
                              >
                                {savingEdit ? 'Opslaan…' : 'Opslaan'}
                              </button>
                              <button
                                className="btn outline sm white-bg"
                                onClick={() => setEditingId(null)}
                              >
                                Annuleren
                              </button>
                            </div>
                          </div>
                        ) : (
                          <Markdown text={s.text} />
                        )}

                        {s.photoIds.length > 0 && editingId !== s.id && (
                          <div className="summary-photos">
                            <div className="field-label">
                              Foto's ({s.photoIds.length})
                            </div>
                            <div className="photo-grid">
                              {s.photoIds.map((pid, i) => (
                                <div
                                  key={pid}
                                  className="thumb"
                                  onClick={() =>
                                    setLightbox({ ids: s.photoIds, index: i })
                                  }
                                >
                                  <img src={photoUrl(pid)} alt="" loading="lazy" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="row gap summary-actions">
                          <button
                            className="btn outline sm"
                            onClick={() =>
                              openSummaryPrint(
                                `${child?.name ?? ''} — ${s.periodLabel}`,
                                `${child?.name ?? ''} · gemaakt op ${formatMoment(s.createdAt)}`,
                                s.text,
                                summaryPhotos(s.photoIds),
                              )
                            }
                          >
                            📄 PDF / Afdrukken
                          </button>
                          <button
                            className="btn outline sm"
                            onClick={() => navigator.clipboard?.writeText(s.text)}
                          >
                            Kopiëren
                          </button>
                          {canEdit && editingId !== s.id && (
                            <button
                              className="btn outline sm"
                              onClick={() => {
                                setEditingId(s.id)
                                setEditText(s.text)
                              }}
                            >
                              ✏️ Bewerken
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="btn danger-outline sm"
                              onClick={() => onDelete(s.id)}
                            >
                              Verwijderen
                            </button>
                          )}
                        </div>
                        <Comments targetType="summary" targetId={s.id} />
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )}

      {lightbox && (
        <Lightbox
          photoIds={lightbox.ids}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox({ ids: lightbox.ids, index: i })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
