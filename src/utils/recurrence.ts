import type { AgendaEvent } from '../types'
import { formatDateNumeric } from './dates'

// Weekdag-codes in weergavevolgorde (maandag eerst).
export const WEEKDAYS: { code: string; short: string; long: string }[] = [
  { code: 'ma', short: 'ma', long: 'maandag' },
  { code: 'di', short: 'di', long: 'dinsdag' },
  { code: 'wo', short: 'wo', long: 'woensdag' },
  { code: 'do', short: 'do', long: 'donderdag' },
  { code: 'vr', short: 'vr', long: 'vrijdag' },
  { code: 'za', short: 'za', long: 'zaterdag' },
  { code: 'zo', short: 'zo', long: 'zondag' },
]

// JS-weekdag (0=zo..6=za) -> onze code.
const JS_TO_CODE = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** Parseert 'YYYY-MM-DD' naar een UTC-tijdstip (middag) — DST-veilig. */
function ts(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1, 12)
}
const DAY = 86400000
/** Aantal hele dagen tussen twee datums (b - a). */
function daysBetween(aISO: string, bISO: string): number {
  return Math.round((ts(bISO) - ts(aISO)) / DAY)
}
function addDaysISO(iso: string, days: number): string {
  return new Date(ts(iso) + days * DAY).toISOString().slice(0, 10)
}
function codeOf(iso: string): string {
  return JS_TO_CODE[new Date(ts(iso)).getUTCDay()]
}
function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
// Maandag als eerste dag: aantal hele weken tussen twee data.
function weeksBetween(aISO: string, bISO: string): number {
  const mondayOffset = (iso: string) => (new Date(ts(iso)).getUTCDay() + 6) % 7
  const aMon = ts(aISO) - mondayOffset(aISO) * DAY
  const bMon = ts(bISO) - mondayOffset(bISO) * DAY
  return Math.round((bMon - aMon) / (7 * DAY))
}

/** Valt de dag `iso` samen met een herhaling van dit event? (iso >= anker verondersteld) */
function matchesOn(ev: AgendaEvent, iso: string): boolean {
  const a = parts(ev.date)
  const b = parts(iso)
  const everyN = Math.max(1, ev.everyN || 1)
  switch (ev.freq) {
    case 'daily':
      return Math.round((ts(iso) - ts(ev.date)) / DAY) % everyN === 0
    case 'weekly': {
      if (weeksBetween(ev.date, iso) % everyN !== 0) return false
      const days = ev.weekdays && ev.weekdays.length ? ev.weekdays : [codeOf(ev.date)]
      return days.includes(codeOf(iso))
    }
    case 'monthly': {
      if (b.d !== a.d) return false
      const monthsDiff = (b.y - a.y) * 12 + (b.m - a.m)
      return monthsDiff >= 0 && monthsDiff % everyN === 0
    }
    case 'yearly': {
      if (b.d !== a.d || b.m !== a.m) return false
      return (b.y - a.y) % everyN === 0
    }
    default:
      return iso === ev.date
  }
}

export interface Occurrence {
  event: AgendaEvent
  date: string // YYYY-MM-DD van deze keer
  // Alleen bij een meerdaags item: de omvang van deze keer.
  spanStart?: string
  spanEnd?: string
  spanDay?: number // 1-gebaseerd: de hoeveelste dag
  spanDays?: number // totaal aantal dagen
}

/**
 * Berekent alle voorvallen van de events binnen [rangeStart, rangeEnd] (inclusief),
 * gesorteerd op datum en daarna tijd. Herhalingen worden niet opgeslagen maar
 * per venster uitgerekend.
 */
export function expandEvents(
  events: AgendaEvent[],
  rangeStart: string,
  rangeEnd: string,
): Occurrence[] {
  const out: Occurrence[] = []
  for (const ev of events) {
    // Meerdaags item: hoeveel dagen na de startdag loopt het door?
    const spanDagen = ev.end && ev.end > ev.date ? daysBetween(ev.date, ev.end) : 0
    /** Zet één startdag om in een regel per dag dat het item loopt. */
    const zetNeer = (start: string) => {
      for (let i = 0; i <= spanDagen; i++) {
        const dag = i === 0 ? start : addDaysISO(start, i)
        if (dag < rangeStart || dag > rangeEnd) continue
        out.push({
          event: ev,
          date: dag,
          ...(spanDagen > 0
            ? { spanStart: start, spanEnd: addDaysISO(start, spanDagen), spanDay: i + 1, spanDays: spanDagen + 1 }
            : {}),
        })
      }
    }
    // Een meerdaags item kan al vóór het venster begonnen zijn en er nog in lopen.
    const from = ev.date > rangeStart ? ev.date : addDaysISO(rangeStart, -spanDagen)
    const hardEnd = ev.until && ev.until < rangeEnd ? ev.until : rangeEnd
    if (ev.freq === 'none') {
      zetNeer(ev.date)
      continue
    }
    if (from > hardEnd) continue
    // Dag voor dag door het (begrensde) venster — simpel en correct.
    for (let iso = from; iso <= hardEnd; iso = addDaysISO(iso, 1)) {
      if (iso >= ev.date && matchesOn(ev, iso)) zetNeer(iso)
    }
  }
  out.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      // Items met tijd eerst (op tijd), daarna tijdloze op handmatige volgorde.
      (x.event.time || '99:99').localeCompare(y.event.time || '99:99') ||
      (x.event.sortOrder || 0) - (y.event.sortOrder || 0) ||
      x.event.createdAt - y.event.createdAt,
  )
  return out
}

function weekdaysText(codes: string[]): string {
  const ordered = WEEKDAYS.filter((w) => codes.includes(w.code))
  if (ordered.length === 1) return ordered[0].long
  if (ordered.length === 2) return `${ordered[0].long} en ${ordered[1].long}`
  return ordered.map((w) => w.short).join(', ')
}

/** Leesbare omschrijving van de herhaling, bv. "Elke week op wo en vr, t/m 01-07-2026". */
export function recurrenceLabel(ev: AgendaEvent): string {
  const n = Math.max(1, ev.everyN || 1)
  let base = ''
  switch (ev.freq) {
    case 'daily':
      base = n === 1 ? 'Elke dag' : `Elke ${n} dagen`
      break
    case 'weekly': {
      const every = n === 1 ? 'Elke week' : `Elke ${n} weken`
      const days = ev.weekdays && ev.weekdays.length ? ev.weekdays : [codeOf(ev.date)]
      base = `${every} op ${weekdaysText(days)}`
      break
    }
    case 'monthly':
      base = n === 1 ? 'Elke maand' : `Elke ${n} maanden`
      break
    case 'yearly':
      base = n === 1 ? 'Elk jaar' : `Elke ${n} jaar`
      break
    default:
      return ''
  }
  if (ev.until) base += `, t/m ${formatDateNumeric(ev.until)}`
  return base
}
