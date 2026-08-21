import type { Resource, ResourceType, ResourceStatus } from '../types'

export const RESOURCE_META: Record<
  ResourceType,
  { icon: string; label: string; cls: string }
> = {
  leerboek: { icon: '📕', label: 'Leerboek', cls: 'boek' },
  leesboek: { icon: '📖', label: 'Leesboek', cls: 'lees' },
  website: { icon: '🌐', label: 'Website', cls: 'site' },
  video: { icon: '▶️', label: 'Video', cls: 'tube' },
  app: { icon: '🧩', label: 'App/Spel', cls: 'app' },
  overig: { icon: '📌', label: 'Overig', cls: 'overig' },
}

export const RESOURCE_ORDER: ResourceType[] = [
  'leerboek',
  'leesboek',
  'website',
  'video',
  'app',
  'overig',
]

// Types waarvoor een status geldt, met hun toegestane statussen (in volgorde).
export const STATUSES_BY_TYPE: Partial<Record<ResourceType, ResourceStatus[]>> = {
  leesboek: ['te_lezen', 'bezig', 'gelezen'],
  leerboek: ['in_gebruik', 'afgerond'],
}

export const STATUS_META: Record<ResourceStatus, { label: string; cls: string }> = {
  te_lezen: { label: 'Te lezen', cls: 'te-lezen' },
  bezig: { label: 'Aan het lezen', cls: 'bezig' },
  gelezen: { label: 'Gelezen', cls: 'gelezen' },
  in_gebruik: { label: 'In gebruik', cls: 'bezig' },
  afgerond: { label: 'Afgerond', cls: 'gelezen' },
}

const FINISHED: ResourceStatus[] = ['gelezen', 'afgerond']

export function statusesForType(type: ResourceType): ResourceStatus[] {
  return STATUSES_BY_TYPE[type] || []
}
export function hasStatus(type: ResourceType): boolean {
  return !!STATUSES_BY_TYPE[type]
}
export function isBook(type: ResourceType): boolean {
  return type === 'leerboek' || type === 'leesboek'
}
export function isFinished(status?: ResourceStatus): boolean {
  return !!status && FINISHED.includes(status)
}

/**
 * Is dit iets waar op dit moment mee gewerkt wordt? Bepaalt welke leermiddelen
 * je bij een memo krijgt aangeboden: een leerboek dat in gebruik is, en een
 * leesboek dat te lezen of aan het lezen is. Wat af is verdwijnt uit de lijst.
 * Alles zonder status (sites, video's, apps, materiaal) hoort er altijd bij.
 */
export function isInGebruik(r: Resource): boolean {
  if (!hasStatus(r.type)) return true
  if (!r.status) return true // boek zonder status: niet verbergen
  return !isFinished(r.status)
}


/** Zet een link om naar iets dat de browser kan openen (met protocol). */
export function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined
  const t = url.trim()
  if (!t) return undefined
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

/** Korte weergave van een link (zonder protocol en trailing slash). */
export function displayUrl(url?: string): string {
  if (!url) return ''
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}
