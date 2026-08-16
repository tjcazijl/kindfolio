import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../store'
import {
  fetchKerndoelScan,
  startKerndoelScan,
  stopKerndoelScan,
  type KerndoelScan as Scan,
} from '../api'

/**
 * De AI met terugwerkende kracht door bestaande memo's laten gaan. Dat gebeurt
 * in bundels per maand: één verzoek per memo zou bij een gevuld logboek
 * honderden verzoeken kosten. Wat het gaat kosten staat er vooraf bij.
 */
export function KerndoelScan() {
  const navigate = useNavigate()
  const { kerndoelenEnabled, kerndoelenAi, canEdit, reload } = useData()
  const [scan, setScan] = useState<Scan | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [starten, setStarten] = useState(false)
  const bezigRef = useRef(false)

  const haalOp = useCallback(async () => {
    try {
      const s = await fetchKerndoelScan()
      setScan(s)
      // Klaar? Dan de nieuwe voorstellen ophalen zodat het overzicht klopt.
      if (bezigRef.current && s.status !== 'bezig') {
        bezigRef.current = false
        await reload()
      }
      if (s.status === 'bezig') bezigRef.current = true
      return s
    } catch (e: any) {
      setFout(e?.message || 'Ophalen mislukt')
      return null
    }
  }, [reload])

  useEffect(() => {
    haalOp()
  }, [haalOp])

  // Tijdens het doorlopen elke paar seconden bijwerken.
  useEffect(() => {
    if (scan?.status !== 'bezig') return
    const t = setInterval(haalOp, 3000)
    return () => clearInterval(t)
  }, [scan?.status, haalOp])

  async function start() {
    setStarten(true)
    setFout(null)
    try {
      await startKerndoelScan()
      bezigRef.current = true
      await haalOp()
    } catch (e: any) {
      setFout(e?.message || 'Starten mislukt')
    } finally {
      setStarten(false)
    }
  }

  async function stop() {
    await stopKerndoelScan()
    await haalOp()
  }

  const terug = (
    <div className="topbar">
      <button className="link-btn" onClick={() => navigate(-1)}>
        ‹ Terug
      </button>
    </div>
  )

  if (!kerndoelenEnabled || !kerndoelenAi || !canEdit) {
    return (
      <div className="page">
        {terug}
        <p className="empty-note">
          Zet bij Instellingen eerst de kerndoelen aan, en kies daar dat de AI
          voorstellen mag doen.
        </p>
      </div>
    )
  }

  const bezig = scan?.status === 'bezig'
  const totaal = scan?.total ?? scan?.batches ?? 0
  const pct = bezig && totaal ? Math.round((scan!.done / totaal) * 100) : 0

  return (
    <div className="page">
      {terug}
      <header className="page-head">
        <h1>Memo's doorlopen</h1>
        <p className="subtitle">
          Claude leest je memo's per maand in bundels en stelt per bundel
          kerndoelen voor. Daarna loop jij de voorstellen langs.
        </p>
      </header>

      {fout && <div className="banner warn">{fout}</div>}
      {scan?.status === 'fout' && scan.error && (
        <div className="banner warn">{scan.error}</div>
      )}
      {scan?.beschikbaar === false && (
        <div className="banner warn">
          De AI is nog niet ingesteld op de server.
        </div>
      )}

      {bezig ? (
        <section className="card-section">
          <h2>Bezig…</h2>
          <div className="kd-voortgang">
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className="hint">
            {scan?.bezigMet ? `${scan.bezigMet} · ` : ''}bundel{' '}
            {Math.min(scan!.done + 1, totaal)} van {totaal}
          </p>
          <div className="kd-regel">
            <span className="kd-regel-t">Voorstellen tot nu toe</span>
            <span className="kd-regel-n">{scan?.gevonden ?? 0}</span>
          </div>
          <p className="hint">
            Je kunt dit scherm sluiten; het loopt door op de server.
          </p>
          <button className="btn outline full white-bg" onClick={stop}>
            Stoppen
          </button>
        </section>
      ) : (
        <section className="card-section">
          {scan?.memos ? (
            <>
              <h2>Wat er te doen is</h2>
              <div className="kd-regel">
                <span className="kd-regel-t">Memo's, nog niet bekeken</span>
                <span className="kd-regel-n">{scan.memos}</span>
              </div>
              <div className="kd-regel">
                <span className="kd-regel-t">Kost ongeveer</span>
                <span className="kd-regel-n">
                  {scan.batches} verzoek{scan.batches === 1 ? '' : 'en'}
                </span>
              </div>
              {scan.aiLeft != null && (
                <div className="kd-regel">
                  <span className="kd-regel-t">Deze maand nog beschikbaar</span>
                  <span className="kd-regel-n">{scan.aiLeft}</span>
                </div>
              )}
              <p className="hint">
                Er wordt niets vastgelegd zonder jouw akkoord: je krijgt eerst
                een overzicht van wat er gevonden is, per kerndoel.
              </p>
              <button
                className="btn primary full"
                disabled={
                  starten ||
                  scan.beschikbaar === false ||
                  (scan.aiLeft != null && scan.aiLeft < scan.batches!)
                }
                onClick={start}
              >
                {starten ? 'Starten…' : 'Beginnen'}
              </button>
              {scan.aiLeft != null && scan.aiLeft < scan.batches! && (
                <p className="hint">
                  Hier zijn meer verzoeken voor nodig dan je deze maand nog hebt.
                  Mail even naar <a href="mailto:info@kindfolio.nl">info@kindfolio.nl</a>,
                  dan zetten we de grens omhoog.
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Alles is al bekeken</h2>
              <p className="hint">
                Er staan geen memo's meer open. Schrijf je nieuwe memo's, dan kun
                je hier later opnieuw langs.
              </p>
            </>
          )}

          {(scan?.status === 'klaar' || scan?.status === 'gestopt') && (
            <p className="ok-text">
              {scan.status === 'klaar' ? 'Klaar.' : 'Gestopt.'}{' '}
              {scan.gevondenVorigeKeer
                ? `${scan.gevondenVorigeKeer} voorstellen om na te kijken.`
                : 'Er zijn geen nieuwe voorstellen gevonden.'}
            </p>
          )}

          <button
            className="btn outline full"
            onClick={() => navigate('/samenvatting')}
          >
            Naar de voorstellen
          </button>
        </section>
      )}
    </div>
  )
}
