import type { MoodKey } from '../types'

export const MOODS: { key: MoodKey; emoji: string; label: string }[] = [
  { key: 'leuk', emoji: '😀', label: 'Leuk' },
  { key: 'prima', emoji: '🙂', label: 'Prima' },
  { key: 'ging_wel', emoji: '😐', label: 'Ging wel' },
  { key: 'lastig', emoji: '😕', label: 'Lastig' },
]

export function moodMeta(key?: string) {
  return MOODS.find((m) => m.key === key)
}
