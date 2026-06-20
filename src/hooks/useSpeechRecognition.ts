import { useCallback, useEffect, useRef, useState } from 'react'

// Minimale typing voor de Web Speech API (niet in standaard DOM-types).
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

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface SpeechHook {
  supported: boolean
  listening: boolean
  interim: string
  error: string | null
  start: () => void
  stop: () => void
}

/**
 * Spraak-naar-tekst via de Web Speech API.
 * Roept onResult aan met elk afgerond (final) tekstfragment, zodat de
 * editor het kan toevoegen aan de bestaande memo-tekst.
 */
export function useSpeechRecognition(
  onResult: (text: string) => void,
  lang = 'nl-NL',
): SpeechHook {
  const ctor = getRecognitionCtor()
  const supported = !!ctor
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!ctor) return
    setError(null)
    const rec = new ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e: any) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const transcript = res[0].transcript
        if (res.isFinal) {
          onResultRef.current(transcript.trim())
          live = ''
        } else {
          live += transcript
        }
      }
      setInterim(live)
    }
    rec.onerror = (e: any) => {
      setError(translateError(e?.error))
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }

    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      // start() gooit als hij al loopt; negeer.
    }
  }, [ctor, lang])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, interim, error, start, stop }
}

function translateError(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Geen toestemming voor de microfoon. Sta microfoon toe in je browser.'
    case 'no-speech':
      return 'Geen spraak gehoord. Probeer opnieuw.'
    case 'audio-capture':
      return 'Geen microfoon gevonden.'
    case 'network':
      return 'Netwerkfout bij spraakherkenning.'
    default:
      return 'Spraakherkenning werkte niet. Probeer opnieuw of typ je tekst.'
  }
}
