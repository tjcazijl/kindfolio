import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import type { Child, KerndoelSet } from '../types'
import {
  SET_KORT,
  SET_NAAM,
  dekkingPerLeergebied,
  kortTitel,
  standVoorKind,
} from '../utils/kerndoelen'
import { formatDateMonth } from '../utils/dates'

/**
 * Wat er per kind aan kerndoelen is vastgelegd, plus de AI-voorstellen die nog
 * nagekeken moeten worden. Nakijken gebeurt per kerndoel, niet per memo: een
 * paar honderd memo's stuk voor stuk langslopen doet niemand.
 */
export function KerndoelenOverzicht() {
  const { children, kerndoelen, kerndoelenAi, canEdit } = useData()
  const navigate = useNavigate()
  const [open, setOpen] = useState<string>(children[0]?.id || '')

  if (!kerndoelen) return null
  const kind = children.find((c) => c.id === open) || children[0]
  if (!kind) return <p className="empty-note">Voeg eerst een kind toe.</p>

  return (
    <>
      {children.length > 1 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip child-chip ${c.id === kind.id ? 'on' : ''}`}
              onClick={() => setOpen(c.id)}
            >
              <span
                className="avatar xs"
                style={{
                  background: c.id === kind.id ? '#fff' : c.color,
                  color: c.id === kind.id ? c.color : '#fff',
                }}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              {c.name}
            </button>
          ))}
        </div>
      )}

      <KindOverzicht key={kind.id} kind={kind} />

      {kerndoelenAi && canEdit && (
        <button
          className="btn outline full"
          onClick={() => navigate('/kerndoelen/scan')}
        >
          ✨ Memo's door de AI laten doorlopen
        </button>
      )}
    </>
  )
}

function KindOverzicht({ kind }: { kind: Child }) {
  const { kerndoelen, kerndoelLinks, reviewKerndoel, canEdit } = useData()
  const [bezig, setBezig] = useState<number | null>(null)

  const huidig = kind.kerndoelenSet
  // De andere set telt apart mee: die hoort bij de maanden vóór de overstap,
  // en bij elkaar optellen zou nergens op slaan.
  const ander: KerndoelSet = huidig === 'po' ? 'vo' : 'po'
  const heeftAnder = kerndoelLinks.some(
    (l) => l.childId === kind.id && l.set === ander && l.status === 'ok',
  )

  const standen = useMemo(
    () => standVoorKind(kerndoelLinks, kerndoelen!, kind.id, huidig),
    [kerndoelLinks, kerndoelen, kind.id, huidig],
  )
  const voorstellen = standen.filter((s) => s.open > 0)
  const bevestigd = standen.filter((s) => s.aantal > 0)
  const dekking = dekkingPerLeergebied(standen, kerndoelen!, huidig)

  async function beoordeel(nr: number, action: 'accept' | 'reject' | 'remove') {
    setBezig(nr)
    try {
      await reviewKerndoel(kind.id, huidig, nr, action)
    } finally {
      setBezig(null)
    }
  }

  return (
    <>
      {voorstellen.length > 0 && canEdit && (
        <section className="card-section">
          <h2>Voorstellen van de AI</h2>
          <p className="hint">
            Neem over wat klopt, gooi weg wat niet klopt. Een voorstel telt pas
            mee als je het overneemt — ook in een overzicht dat je deelt.
          </p>
          {voorstellen.map((s) => (
            <div key={s.nr} className="kd-voorstel">
              <div className="kd-vk-kop">
                <span className={`kd-set ${huidig}`}>{SET_KORT[huidig]}</span>
                <strong>
                  {s.nr} · {s.doel ? kortTitel(s.doel.t) : 'onbekend kerndoel'}
                </strong>
              </div>
              <p className="kd-vk-bewijs">
                Gevonden in {s.open} memo{s.open > 1 ? "'s" : ''}
                {s.doel ? ` · ${s.doel.lg}` : ''}
              </p>
              {s.citaat && <p className="kd-vk-citaat">“{s.citaat}”</p>}
              <div className="kd-vk-acties">
                <button
                  className="btn primary sm"
                  disabled={bezig === s.nr}
                  onClick={() => beoordeel(s.nr, 'accept')}
                >
                  Klopt
                </button>
                <button
                  className="btn outline sm white-bg"
                  disabled={bezig === s.nr}
                  onClick={() => beoordeel(s.nr, 'reject')}
                >
                  Weg ermee
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card-section">
        <h2>
          Dekking <span className={`kd-set ${huidig}`}>{SET_KORT[huidig]}</span>
        </h2>
        <p className="hint">
          {SET_NAAM[huidig]}
          {kind.kerndoelenSetAt
            ? ` · sinds ${formatDateMonth(kind.kerndoelenSetAt)}`
            : ''}
        </p>
        {dekking.map((d) => (
          <div key={d.lg} className="kd-staaf">
            <span className="kd-staaf-nm">{d.lg}</span>
            <span className={`kd-bar ${huidig}`}>
              <i style={{ width: `${(d.geraakt / d.totaal) * 100}%` }} />
            </span>
            <span className="kd-staaf-n">
              {d.geraakt}/{d.totaal}
            </span>
          </div>
        ))}
        {heeftAnder && (
          <p className="hint">
            Er staat ook nog werk onder de {SET_NAAM[ander].toLowerCase()}-set,
            van vóór de overstap. Dat wordt apart geteld en blijft gewoon staan.
          </p>
        )}
      </section>

      {bevestigd.length > 0 && (
        <section className="card-section">
          <h2>Wat er is vastgelegd</h2>
          {bevestigd.map((s) => (
            <div key={s.nr} className="kd-regel">
              <span className="kd-regel-t">
                <span className={`kd-set ${huidig}`}>{SET_KORT[huidig]}</span>{' '}
                {s.nr} · {s.doel ? kortTitel(s.doel.t) : 'onbekend'}
              </span>
              <span className="kd-regel-n">
                {s.aantal}×
                {canEdit && (
                  <button
                    className="link-btn danger"
                    disabled={bezig === s.nr}
                    onClick={() => {
                      if (
                        confirm(
                          `Kerndoel ${s.nr} losmaken van alle ${s.aantal} plekken bij ${kind.name}?`,
                        )
                      ) {
                        beoordeel(s.nr, 'remove')
                      }
                    }}
                  >
                    losmaken
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
      )}

      {bevestigd.length === 0 && voorstellen.length === 0 && (
        <p className="empty-note">
          Nog niets gekoppeld voor {kind.name}. Je vinkt kerndoelen aan bij een
          memo, een leermiddel of een agenda-item.
        </p>
      )}
    </>
  )
}
