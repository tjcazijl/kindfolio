import { useState } from 'react'
import { useData } from '../store'
import type { Child, KerndoelSet } from '../types'
import { SET_KORT, SET_NAAM, SET_UITLEG } from '../utils/kerndoelen'
import { childAge, formatDateMonth } from '../utils/dates'

/**
 * Welke SLO-set bij dit kind hoort. Meestal gaat een kind rond zijn twaalfde
 * over, maar dat is geen wet: de app stelt voor, de ouder beslist.
 */
export function ChildKerndoelen({ child }: { child: Child }) {
  const { updateChild, kerndoelLinks } = useData()
  const [wisselNaar, setWisselNaar] = useState<KerndoelSet | null>(null)
  const [busy, setBusy] = useState(false)

  const leeftijd = childAge(child)
  const huidig = child.kerndoelenSet

  // Hoeveel er al vastligt — dat blijft staan zoals het is bij een overstap.
  const bestaand = kerndoelLinks.filter(
    (l) => l.childId === child.id && l.set === huidig && l.status === 'ok',
  ).length

  async function wissel(set: KerndoelSet) {
    setBusy(true)
    try {
      await updateChild(child.id, { kerndoelenSet: set, kerndoelenAsked: true })
      setWisselNaar(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card-section">
      <h2>Kerndoelen</h2>
      <p className="hint">
        Welke set van de SLO hoort bij {child.name}?
      </p>
      {(['po', 'vo'] as KerndoelSet[]).map((set) => (
        <button
          key={set}
          type="button"
          className={`kd-keuze ${set === 'vo' ? 'vo' : ''} ${huidig === set ? 'on' : ''}`}
          onClick={() => huidig !== set && setWisselNaar(set)}
        >
          <span className="kd-bol" />
          <span>
            <span className="kd-keuze-t">
              {SET_NAAM[set]} <span className={`kd-set ${set}`}>{SET_KORT[set]}</span>
            </span>
            <span className="kd-keuze-s">
              {huidig === set && child.kerndoelenSetAt
                ? `Sinds ${formatDateMonth(child.kerndoelenSetAt)}`
                : SET_UITLEG[set]}
            </span>
          </span>
        </button>
      ))}
      {huidig === 'po' && (leeftijd ?? 0) < 12 && (
        <p className="hint">
          Werkt {child.name} al met stof van de onderbouw? Zet hem dan gerust nu
          al over — de leeftijd is een suggestie, geen grens.
        </p>
      )}

      {wisselNaar && (
        <div className="modal-overlay" onClick={() => setWisselNaar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {child.name} naar {SET_NAAM[wisselNaar].toLowerCase()}?
            </h2>
            <p>
              {bestaand > 0 ? (
                <>
                  De <strong>{bestaand}</strong> kerndoelen die je al aan{' '}
                  {child.name} hebt gekoppeld blijven staan als{' '}
                  {SET_KORT[huidig].toLowerCase()}-kerndoelen. Er wordt niets
                  omgezet en niets weggegooid.
                </>
              ) : (
                <>Er ligt nog niets vast, dus er verandert alleen welke lijst je te zien krijgt.</>
              )}{' '}
              Vanaf nu kies je uit de lijst van{' '}
              {SET_NAAM[wisselNaar].toLowerCase()}.
            </p>
            <p className="hint">
              Blijkt het te vroeg, dan zet je hem gewoon weer terug.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setWisselNaar(null)}>
                Annuleren
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => wissel(wisselNaar)}
              >
                {busy ? 'Bezig…' : 'Overstappen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
