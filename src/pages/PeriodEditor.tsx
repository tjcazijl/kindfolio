import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../store'
import { saveKerndoelen as apiSaveKerndoelen } from '../api'
import { KerndoelPicker, type KerndoelKeuze } from '../components/KerndoelPicker'
import { linksVoor, memosInPeriode } from '../utils/kerndoelen'
import { formatDateMonth, todayISO } from '../utils/dates'

/**
 * Een periode maken of bijschaven. Je kiest een naam en een stuk tijd; welke
 * memo's erin vallen rekent de app zelf uit, zodat je niets hoeft te koppelen.
 */
export function PeriodEditor() {
  const { periodId } = useParams()
  const navigate = useNavigate()
  const {
    periods,
    memos,
    children,
    addPeriod,
    editPeriod,
    removePeriod,
    reload,
    kerndoelenEnabled,
    kerndoelLinks,
  } = useData()
  const isNew = !periodId
  const bestaand = periodId ? periods.find((p) => p.id === periodId) : undefined

  const [title, setTitle] = useState(bestaand?.title || '')
  const [start, setStart] = useState(bestaand?.start || todayISO())
  const [end, setEnd] = useState(bestaand?.end || todayISO())
  const [note, setNote] = useState(bestaand?.note || '')
  const [childIds, setChildIds] = useState<string[]>(bestaand?.childIds || [])
  const [kerndoelen, setKerndoelenKeuze] = useState<KerndoelKeuze[]>(() =>
    linksVoor(kerndoelLinks, 'period', periodId).map((l) => ({
      childId: l.childId,
      set: l.set,
      nr: l.nr,
    })),
  )
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Wat er in deze periode valt — leeft mee terwijl je de datums verschuift.
  const erin = useMemo(
    () => memosInPeriode(memos, { ...(bestaand as any), start, end, childIds } as any),
    [memos, start, end, childIds, bestaand],
  )

  if (!isNew && !bestaand) return <div className="page">Laden…</div>

  async function save() {
    if (!title.trim()) {
      alert('Geef de periode een naam.')
      return
    }
    if (end < start) {
      alert('De einddatum ligt vóór de begindatum.')
      return
    }
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        start,
        end,
        note: note.trim(),
        childIds,
        // Een voorstel van de AI dat je opslaat, is daarmee van jou.
        ...(bestaand?.status === 'open' ? { status: 'ok' as const } : {}),
      }
      const p = isNew ? await addPeriod(data) : await editPeriod(periodId!, data)
      if (kerndoelenEnabled) {
        const geldig = childIds.length ? childIds : children.map((c) => c.id)
        await apiSaveKerndoelen(
          'period',
          p.id,
          kerndoelen.filter((k) => geldig.includes(k.childId)),
        )
        await reload()
      }
      navigate('/samenvatting', { state: { tab: 'periodes' } })
    } catch (err: any) {
      alert(err?.message || 'Opslaan mislukt')
      setSaving(false)
    }
  }

  async function remove() {
    if (!periodId) return
    await removePeriod(periodId)
    navigate('/samenvatting', { state: { tab: 'periodes' } })
  }

  return (
    <div className="page">
      <div className="topbar">
        <button className="link-btn" onClick={() => navigate(-1)}>
          ‹ Annuleren
        </button>
        <span className="topbar-title">
          {isNew ? 'Nieuwe periode' : 'Periode bewerken'}
        </span>
      </div>

      {bestaand?.status === 'open' && (
        <div className="banner">
          Dit is een voorstel van de AI. Sla je hem op, dan is het jouw periode —
          pas de naam en de datums gerust aan.
        </div>
      )}

      <label className="field">
        <span className="field-label">Naam</span>
        <input
          className="input"
          value={title}
          autoFocus={isNew}
          placeholder="Bijv. Het WK, De ijstijd, De verbouwing"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="row gap">
        <label className="field grow" style={{ margin: 0 }}>
          <span className="field-label">Van</span>
          <input
            type="date"
            className="input"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field grow" style={{ margin: 0 }}>
          <span className="field-label">Tot en met</span>
          <input
            type="date"
            className="input"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>

      {children.length > 0 && (
        <div className="field">
          <span className="field-label">
            Voor welk kind?{' '}
            <span className="fl-opt">(optioneel, gezinsbreed als je niets kiest)</span>
          </span>
          <div className="chips">
            {children.map((c) => {
              const on = childIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`chip child-chip ${on ? 'on' : ''}`}
                  onClick={() =>
                    setChildIds((prev) =>
                      on ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                    )
                  }
                >
                  <span
                    className="avatar xs"
                    style={{ background: on ? '#fff' : c.color, color: on ? c.color : '#fff' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label">Wat er in deze periode valt</span>
        <p className="hint">
          {erin.length === 0
            ? 'Nog geen memo’s in deze weken.'
            : `${erin.length} memo${erin.length === 1 ? '' : "'s"} van ${formatDateMonth(start)} tot en met ${formatDateMonth(end)}. Je hoeft ze niet los te koppelen — ze horen erbij zolang ze in deze weken vallen.`}
        </p>
      </div>

      <label className="field">
        <span className="field-label">
          Terugblik <span className="fl-opt">(optioneel)</span>
        </span>
        <textarea
          className="input textarea"
          rows={4}
          value={note}
          placeholder="Hoe liep deze periode? Waar kwam het vandaan, waar liep het op uit?"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {kerndoelenEnabled && (
        <div className="field">
          <span className="field-label">
            Kerndoelen <span className="fl-opt">(optioneel)</span>
          </span>
          <p className="hint">
            Wat er in deze hele periode aan bod kwam. Losse memo's kun je
            daarnaast nog apart aanvinken.
          </p>
          <KerndoelPicker
            childIds={childIds}
            value={kerndoelen}
            onChange={setKerndoelenKeuze}
          />
        </div>
      )}

      <div className="sticky-actions">
        <button className="btn primary full big" disabled={saving} onClick={save}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </button>
        {!isNew && (
          <button
            className="btn danger-outline full white-bg"
            onClick={() => setConfirmDelete(true)}
          >
            Verwijderen
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Periode verwijderen?</h2>
            <p>
              Alleen de periode zelf verdwijnt. Je memo's uit deze weken blijven
              gewoon staan.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Annuleren
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
