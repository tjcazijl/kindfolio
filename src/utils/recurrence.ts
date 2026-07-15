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
    const from = ev.date > rangeStart ? ev.date : rangeStart
    const hardEnd = ev.until && ev.until < rangeEnd ? ev.until : rangeEnd
    if (from > hardEnd) continue
    if (ev.freq === 'none') {
      if (ev.date >= rangeStart && ev.date <= rangeEnd) out.push({ event: ev, date: ev.date })
      continue
    }
    // Dag voor dag door het (begrensde) venster — simpel en correct.
    for (let iso = from; iso <= hardEnd; iso = addDaysISO(iso, 1)) {
      if (matchesOn(ev, iso)) out.push({ event: ev, date: iso })
    }
  }
  out.sort(
    (x, y) =>
      x.date.localeCompare(y.date) ||
      (x.event.time || '99').localeCompare(y.event.time || '99') ||
      x.event.title.localeCompare(y.event.title),
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
