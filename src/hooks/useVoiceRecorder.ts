import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from '../api'

// Neemt audio op met MediaRecorder (werkt in alle moderne browsers) en laat de
// server het omzetten naar tekst. Vervangt de oude Web Speech API.
export interface VoiceHook {
  supported: boolean
  recording: boolean
  transcribing: boolean
  seconds: number
  error: string | null
  start: () => void
  stop: () => void
  cancel: () => void
}

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg']
  for (const c of cands) {
    try {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c))
        return c
    } catch {
      /* isTypeSupported bestaat niet overal */
    }
  }
  return ''
}

export function useVoiceRecorder(onResult: (text: string) => void): VoiceHook {
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    if (!supported) return
    setError(null)
    cancelledRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMime()
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = async () => {
        cleanup()
        setRecording(false)
        if (cancelledRef.current) return
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        })
        if (!blob.size) return
        setTranscribing(true)
        try {
          const text = await transcribeAudio(blob)
          if (text) onResultRef.current(text)
          else setError('Geen spraak herkend. Probeer opnieuw.')
        } catch (e: any) {
          setError(e?.message || 'Omzetten mislukt.')
        } finally {
          setTranscribing(false)
        }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = window.setInterval(
        () => setSeconds((s) => s + 1),
        1000,
      )
    } catch (e: any) {
      cleanup()
      setError(
        e?.name === 'NotAllowedError'
          ? 'Geen toestemming voor de microfoon. Sta microfoon toe in je browser.'
          : 'Kon de microfoon niet starten.',
      )
    }
  }, [supported, cleanup])

  const stop = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    cleanup()
    setRecording(false)
  }, [cleanup])

  return { supported, recording, transcribing, seconds, error, start, stop, cancel }
}
