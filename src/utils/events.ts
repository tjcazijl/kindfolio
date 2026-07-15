import type { EventType } from '../types'

export const EVENT_META: Record<EventType, { icon: string; label: string }> = {
  uitje: { icon: '🚌', label: 'Uitje' },
  taak: { icon: '📌', label: 'Taak' },
  les: { icon: '📚', label: 'Les' },
}

export const EVENT_ORDER: EventType[] = ['uitje', 'taak', 'les']
