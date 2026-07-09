import { useCallback, useEffect, useRef, useState } from 'react'

// Live spraak-naar-tekst via de Web Speech API (Chrome/Safari/Edge).
// Bewust herbouwt de tekst elke keer volledig uit alle resultaten i.p.v.
// losse fragmenten aan te plakken — dat voorkomt de herhaalde/dubbele tekst.
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
}

function getCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface LiveSpeechHook {
  supported: boolean
  listening: boolean
  error: string | null
  start: (baseline: string) => void
  stop: () => void
}

export function useLiveSpeech(
  onText: (fullText: string) => void,
  lang = 'nl-NL',
): LiveSpeechHook {
  const ctor = getCtor()
  const supported = !!ctor
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const wantRef = useRef(false) // wil de gebruiker nog opnemen?
  const baseRef = useRef('') // tekst die er al stond vóór het inspreken
  const committedRef = useRef('') // afgeronde tekst uit eerdere sessies
  const sessionFinalRef = useRef('') // afgeronde tekst in de huidige sessie
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const build = useCallback((live: string) => {
    const spoken = (committedRef.current + live).trim()
    const base = baseRef.current
    onTextRef.current(base && spoken ? `${base} ${spoken}` : base || spoken)
  }, [])

  const makeRec = useCallback(() => {
    const rec = new (ctor as new () => SpeechRecognitionLike)()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e: any) => {
      let finals = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finals += t
        else interim += t
      }
      sessionFinalRef.current = finals
      build(finals + interim)
    }
    rec.onerror = (e: any) => {
      // 'no-speech'/'aborted' zijn niet fataal; laat 'onend' herstarten.
      if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(translate(e.error))
        wantRef.current = false
      }
    }
    rec.onend = () => {
      // Chrome stopt vanzelf na een stilte: bewaar het afgeronde deel en herstart.
      committedRef.current += sessionFinalRef.current
      sessionFinalRef.current = ''
      if (wantRef.current) {
        try {
          const next = makeRec()
          recRef.current = next
          next.start()
          return
        } catch {
          /* val door naar stoppen */
        }
      }
      setListening(false)
    }
    return rec
  }, [ctor, lang, build])

  const start = useCallback(
    (baseline: string) => {
      if (!ctor) return
      setError(null)
      baseRef.current = (baseline || '').trim()
      committedRef.current = ''
      sessionFinalRef.current = ''
      wantRef.current = true
      try {
        const rec = makeRec()
        recRef.current = rec
        rec.start()
        setListening(true)
      } catch {
        wantRef.current = false
      }
    },
    [ctor, makeRec],
  )

  const stop = useCallback(() => {
    wantRef.current = false
    recRef.current?.stop()
    setListening(false)
  }, [])

  useEffect(
    () => () => {
      wantRef.current = false
      recRef.current?.abort()
    },
    [],
  )

  return { supported, listening, error, start, stop }
}

function translate(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Geen toestemming voor de microfoon.'
    case 'audio-capture':
      return 'Geen microfoon gevonden.'
    case 'network':
      return 'Netwerkfout bij live spraakherkenning.'
    default:
      return 'Live spraakherkenning werkte niet. Probeer opnieuw of typ de tekst.'
  }
}
