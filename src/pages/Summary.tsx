import { useEffect, useMemo, useState } from 'react'
import { useData } from '../store'
import { generateSummary, summaryAvailable } from '../api'
import { Markdown } from '../components/Markdown'
import { Comments } from '../components/Comments'
import {
  formatDateLong,
  periodRange,
  shiftPeriod,
  type Period,
} from '../utils/dates'
import { openSummaryPrint } from '../utils/summaryPrint'

const PERIODS: Period[] = ['week', 'maand', 'kwartaal']

function formatMoment(ts: number): string {
  return new Date(ts).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function Summary() {
  const { children, memos, summaries, removeSummary, reload, canEdit, aiEnabled } =
    useData()
  const [available, setAvailable] = useState<boolean | null>(null)

  const [childId, setChildId] = useState<string>('')
  const [period, setPeriod] = useState<Period>('week')
  const [refDate, setRefDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (aiEnabled) summaryAvailable().then(setAvailable)
  }, [aiEnabled])

  const range = useMemo(() => periodRange(period, refDate), [period, refDate])

  const effectiveChildId = childId || children[0]?.id || ''
  const child = children.find((c) => c.id === effectiveChildId)

  const periodMemos = useMemo(
    () =>
      memos
        .filter(
          (m) =>
            m.childId === effectiveChildId &&
            m.date >= range.start &&
            m.date <= range.end,
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt),
    [memos, effectiveChildId, range.start, range.end],
  )

  const childSummaries = useMemo(
    () => summaries.filter((s) => s.childId === effectiveChildId),
    [summaries, effectiveChildId],
  )

  async function run() {
    if (!child || periodMemos.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const saved = await generateSummary({
        childId: child.id,
        start: range.start,
        end: range.end,
        period,
        periodLabel: range.label,
        includePhotos: false,
      })
      await reload()
      setExpandedId(saved.id)
    } catch (e: any) {
      setError(e?.message || 'Er ging iets mis.')
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
    const body = periodMemos
      .map((m) => {
        const head = `## ${formatDateLong(m.date)}`
        const tags = m.subjects.length ? `*${m.subjects.join(', ')}*\n\n` : ''
        return `${head}\n\n${tags}${m.text || ''}`
      })
      .join('\n\n')
    openSummaryPrint(
      `${child.name} — ${range.label}`,
      `${child.name} · ${periodMemos.length} memo${periodMemos.length === 1 ? '' : "'s"}`,
      body,
    )
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
              className={`seg-btn ${period === p ? 'on' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

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

      <p className="count-line">
        {periodMemos.length} memo
        {periodMemos.length === 1 ? '' : "'s"} in deze periode
      </p>
    </>
  )

  return (
    <div className="page">
      <header className="page-head">
        <h1>Samenvatting</h1>
        <p className="subtitle">
          {aiEnabled ? 'AI-overzicht per periode' : 'Memo-overzicht per periode'}
        </p>
      </header>

      {aiEnabled && available === false && (
        <div className="banner warn">
          De AI-samenvatting is nog niet ingesteld op de server.
        </div>
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

      {/* AI uit: gewoon alle memo's onder elkaar tonen. */}
      {!aiEnabled && (
        <>
          {periodControls}
          {periodMemos.length > 0 ? (
            <>
              <button className="btn outline full" onClick={printOverview}>
                📄 PDF / Afdrukken
              </button>
              <div className="timeline">
                {periodMemos.map((m) => (
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
            <p className="empty-note">Geen memo's in deze periode.</p>
          )}
        </>
      )}

      {/* AI aan: generator + bewaarde samenvattingen. */}
      {aiEnabled && (
        <>
          {canEdit && (
            <>
              {periodControls}
              <button
                className="btn primary full big"
                disabled={
                  loading || available === false || periodMemos.length === 0
                }
                onClick={run}
              >
                {loading ? 'Samenvatting maken…' : '✨ Samenvatting maken'}
              </button>
              {error && <p className="error-text">{error}</p>}
            </>
          )}

          {childSummaries.length > 0 && (
            <section className="saved-summaries">
              <h2 className="saved-title">Bewaarde samenvattingen</h2>
              {childSummaries.map((s) => {
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
                        <Markdown text={s.text} />
                        <div className="row gap summary-actions">
                          <button
                            className="btn outline sm"
                            onClick={() =>
                              openSummaryPrint(
                                `${child?.name ?? ''} — ${s.periodLabel}`,
                                `${child?.name ?? ''} · gemaakt op ${formatMoment(s.createdAt)}`,
                                s.text,
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
        </>
      )}
    </div>
  )
}
