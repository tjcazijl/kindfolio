export type Period = 'week' | 'maand' | 'kwartaal'

export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

// Maandag als eerste dag van de week.
function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const day = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - day)
  r.setHours(0, 0, 0, 0)
  return r
}

export function periodRange(
  period: Period,
  ref: Date = new Date(),
): { start: string; end: string; label: string } {
  const r = new Date(ref)
  r.setHours(0, 0, 0, 0)

  if (period === 'week') {
    const start = startOfWeek(r)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return {
      start: toISODate(start),
      end: toISODate(end),
      label: `Week van ${start.toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'long',
      })}`,
    }
  }

  if (period === 'maand') {
    const start = new Date(r.getFullYear(), r.getMonth(), 1)
    const end = new Date(r.getFullYear(), r.getMonth() + 1, 0)
    return {
      start: toISODate(start),
      end: toISODate(end),
      label: start.toLocaleDateString('nl-NL', {
        month: 'long',
        year: 'numeric',
      }),
    }
  }

  // kwartaal
  const q = Math.floor(r.getMonth() / 3)
  const start = new Date(r.getFullYear(), q * 3, 1)
  const end = new Date(r.getFullYear(), q * 3 + 3, 0)
  return {
    start: toISODate(start),
    end: toISODate(end),
    label: `${q + 1}e kwartaal ${r.getFullYear()}`,
  }
}

export function ageFromBirthYear(birthYear?: number): number | undefined {
  if (!birthYear) return undefined
  return new Date().getFullYear() - birthYear
}

export function ageFromBirthDate(birthDate?: string): number | undefined {
  if (!birthDate) return undefined
  const b = new Date(birthDate + 'T00:00:00')
  if (isNaN(b.getTime())) return undefined
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

/** Leeftijd op basis van geboortedatum, met geboortejaar als terugval. */
export function childAge(child: {
  birthDate?: string
  birthYear?: number
}): number | undefined {
  return ageFromBirthDate(child.birthDate) ?? ageFromBirthYear(child.birthYear)
}

export function birthYearFromAge(age: number): number {
  return new Date().getFullYear() - age
}

export function shiftPeriod(
  period: Period,
  ref: Date,
  direction: -1 | 1,
): Date {
  const r = new Date(ref)
  if (period === 'week') r.setDate(r.getDate() + 7 * direction)
  else if (period === 'maand') r.setMonth(r.getMonth() + direction)
  else r.setMonth(r.getMonth() + 3 * direction)
  return r
}
