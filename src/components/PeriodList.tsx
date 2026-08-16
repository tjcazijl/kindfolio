import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import type { Period } from '../types'
import { SET_KORT, linksVoor, memosInPeriode } from '../utils/kerndoelen'
import { formatDateMonth } from '../utils/dates'

/** "18 juni – 14 juli 2026", met het jaar alleen waar het nodig is. */
function bereik(p: Period): string {
  const van = formatDateMonth(p.start)
  const tot = formatDateMonth(p.end)
  const jaar = van.slice(-4)
  return jaar === tot.slice(-4) ? `${van.slice(0, -5)} – ${tot}` : `${van} – ${tot}`
}

/**
 * De periodes van dit portfolio: stukken tijd waar achteraf een naam aan is
 * gegeven. Voorstellen van de AI staan bovenaan, met een stippellijn, tot je ze
 * overneemt.
 */
export function PeriodList() {
  const { periods, memos, children, canEdit, kerndoelenEnabled, kerndoelLinks } =
    useData()
  const navigate = useNavigate()

  const [voorstellen, eigen] = useMemo(
    () => [
      periods.filter((p) => p.status === 'open'),
      periods.filter((p) => p.status !== 'open'),
    ],
    [periods],
  )

  function Kaart({ p }: { p: Period }) {
    const erin = memosInPeriode(memos, p)
    const kids = p.childIds.length
      ? children.filter((c) => p.childIds.includes(c.id))
      : children
    const doelen = kerndoelenEnabled ? linksVoor(kerndoelLinks, 'period', p.id) : []
    const uniek = [...new Map(doelen.map((l) => [`${l.set}${l.nr}`, l])).values()]
    return (
      <button
        className={`periode-kaart ${p.status === 'open' ? 'voorstel' : ''}`}
        onClick={() => canEdit && navigate(`/periodes/${p.id}`)}
      >
        <span className="periode-kop">
          <strong>{p.title}</strong>
          {p.status === 'open' && <span className="periode-merk">✨ voorstel</span>}
        </span>
        <span className="periode-meta">
          {bereik(p)} · {erin.length} memo{erin.length === 1 ? '' : "'s"}
          {p.childIds.length > 0 && ` · ${kids.map((c) => c.name).join(', ')}`}
        </span>
        {p.note && <span className="periode-note">{p.note}</span>}
        {uniek.length > 0 && (
          <span className="periode-doelen">
            {uniek.map((l) => (
              <span key={`${l.set}${l.nr}`} className={`kd-chip ${l.set}`}>
                <span className={`kd-set ${l.set}`}>{SET_KORT[l.set]}</span> {l.nr}
              </span>
            ))}
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <p className="hint">
        Een periode is een stuk tijd waar je achteraf een naam aan geeft — het WK
        dat wekenlang meeliep, de winter waarin het over de ijstijd ging. Wat er
        in die weken in je logboek staat, hoort er vanzelf bij.
      </p>

      {voorstellen.length > 0 && (
        <section className="card-section">
          <h2>Voorstellen van de AI</h2>
          <p className="hint">
            Claude zag deze onderwerpen weken achter elkaar terugkomen. Open er
            een om hem bij te schaven en te bewaren, of laat hem staan.
          </p>
          {voorstellen.map((p) => (
            <Kaart key={p.id} p={p} />
          ))}
        </section>
      )}

      {eigen.length > 0 ? (
        <section className="card-section">
          <h2>Periodes</h2>
          {eigen.map((p) => (
            <Kaart key={p.id} p={p} />
          ))}
        </section>
      ) : (
        voorstellen.length === 0 && (
          <p className="empty-note">
            Nog geen periodes. Kijk eens terug op de afgelopen maanden: was er iets
            waar jullie een tijd in zaten?
          </p>
        )
      )}

      {canEdit && (
        <button
          className="btn primary full"
          onClick={() => navigate('/periodes/nieuw')}
        >
          + Periode toevoegen
        </button>
      )}
    </>
  )
}
