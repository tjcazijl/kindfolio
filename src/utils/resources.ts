import type { ResourceType, ResourceStatus } from '../types'

export const RESOURCE_META: Record<
  ResourceType,
  { icon: string; label: string; cls: string }
> = {
  boek: { icon: '📚', label: 'Boek', cls: 'boek' },
  website: { icon: '🌐', label: 'Website', cls: 'site' },
  video: { icon: '▶️', label: 'Video', cls: 'tube' },
  app: { icon: '🧩', label: 'App/Spel', cls: 'app' },
  overig: { icon: '📌', label: 'Overig', cls: 'overig' },
}

export const RESOURCE_ORDER: ResourceType[] = [
  'boek',
  'website',
  'video',
  'app',
  'overig',
]

export const STATUS_META: Record<ResourceStatus, { label: string; cls: string }> = {
  te_lezen: { label: 'Te lezen', cls: 'te-lezen' },
  bezig: { label: 'Bezig', cls: 'bezig' },
  gelezen: { label: 'Gelezen', cls: 'gelezen' },
}
export const STATUS_ORDER: ResourceStatus[] = ['te_lezen', 'bezig', 'gelezen']

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
