import type {
  AccountAccess,
  Child,
  Comment,
  Memo,
  Summary,
} from './types'

// ---- Actief account (welk portfolio bekijk je) ----
const ACCOUNT_KEY = 'kf_account'
export const getActiveAccount = (): string =>
  localStorage.getItem(ACCOUNT_KEY) || ''
export function setActiveAccount(id: string) {
  if (id) localStorage.setItem(ACCOUNT_KEY, id)
  else localStorage.removeItem(ACCOUNT_KEY)
}

export class AuthError extends Error {
  constructor() {
    super('Niet ingelogd')
    this.name = 'AuthError'
  }
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const acct = getActiveAccount()
  const res = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(acct ? { 'X-Account-Id': acct } : {}),
    },
    credentials: 'same-origin',
    ...options,
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    let msg = `Serverfout (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* geen json */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

async function postAuth(
  path: string,
  payload: Record<string, unknown>,
  fallback: string,
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let msg = fallback
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
}

/** Inloggen met e-mail + wachtwoord; zet een onthouden cookie. */
export const login = (email: string, password: string) =>
  postAuth('/api/login', { email, password }, 'Inloggen mislukt')

export interface RegisterResult {
  email: string
  needsVerification?: boolean
}

/** Nieuw account aanmaken. */
export async function register(
  email: string,
  password: string,
  code: string,
): Promise<RegisterResult> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password, code }),
  })
  if (!res.ok) {
    let msg = 'Registreren mislukt'
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
}

/** Vraagt een wachtwoord-reset-mail aan (geeft nooit prijs of het adres bestaat). */
export const forgotPassword = (email: string) =>
  postAuth('/api/forgot', { email }, 'Verzoek mislukt')

/** Stelt een nieuw wachtwoord in met de token uit de reset-mail. */
export const resetPassword = (token: string, password: string) =>
  postAuth('/api/reset', { token, password }, 'Wachtwoord wijzigen mislukt')

export interface AppState {
  children: Child[]
  memos: Memo[]
  summaries: Summary[]
  comments: Comment[]
  account: {
    id: string
    ownerEmail: string
    email: string
    role: 'owner' | 'editor' | 'commenter'
    isAdmin?: boolean
    subjects: string[]
    aiEnabled: boolean
  }
}

export const saveSettings = (data: {
  subjects?: string[]
  aiEnabled?: boolean
}) =>
  req<{ subjects: string[]; aiEnabled: boolean }>('/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const fetchState = () => req<AppState>('/state')

export const fetchAccounts = () =>
  req<{ accounts: AccountAccess[] }>('/accounts').then((r) => r.accounts)

export const addComment = (
  targetType: 'memo' | 'summary',
  targetId: string,
  text: string,
) =>
  req<Comment>('/comments', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, text }),
  })

export const deleteComment = (id: string) =>
  req<{ ok: boolean }>(`/comments/${id}`, { method: 'DELETE' })

export type ShareRole = 'editor' | 'commenter'
export interface Share {
  email: string
  role: ShareRole
  status: 'active' | 'pending'
}
export const invite = (email: string, role: ShareRole = 'commenter') =>
  req<{ ok: boolean }>('/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
export const fetchShares = () =>
  req<{ shares: Share[] }>('/shares').then((r) => r.shares)
export const revokeShare = (email: string) =>
  req<{ ok: boolean }>('/shares', {
    method: 'DELETE',
    body: JSON.stringify({ email }),
  })

export interface AdminUser {
  email: string
  createdAt: number
  verified: boolean
  children: number
  memos: number
  summaries: number
}

export const fetchAdminUsers = () =>
  req<{ users: AdminUser[] }>('/admin/users').then((r) => r.users)

export interface FeedbackPost {
  id: string
  author: string
  message: string
  status: 'open' | 'done'
  votes: number
  votedByMe: boolean
  commentCount: number
  mine: boolean
  createdAt: number
}
export interface FeedbackComment {
  id: string
  author: string
  text: string
  mine: boolean
  createdAt: number
}

export const fetchFeedback = () =>
  req<{ feedback: FeedbackPost[] }>('/feedback').then((r) => r.feedback)

export const postFeedback = (message: string, name?: string) =>
  req<FeedbackPost>('/feedback', {
    method: 'POST',
    body: JSON.stringify({ message, name }),
  })

export const voteFeedback = (id: string) =>
  req<{ votes: number; votedByMe: boolean }>(`/feedback/${id}/vote`, {
    method: 'POST',
  })

export const fetchFeedbackComments = (id: string) =>
  req<{ comments: FeedbackComment[] }>(`/feedback/${id}/comments`).then(
    (r) => r.comments,
  )

export const commentFeedback = (id: string, text: string, name?: string) =>
  req<FeedbackComment>(`/feedback/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text, name }),
  })

export const setFeedbackStatus = (id: string, status: 'open' | 'done') =>
  req<{ status: 'open' | 'done' }>(`/feedback/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })

export const deleteFeedback = (id: string) =>
  req<{ ok: boolean }>(`/feedback/${id}`, { method: 'DELETE' })

export interface ChildInput {
  name?: string
  color?: string
  birthYear?: number | null
  birthDate?: string | null
  // array = eigen lijst, null = terug naar accountlijst, weglaten = ongewijzigd.
  subjects?: string[] | null
}
export const createChild = (data: ChildInput) =>
  req<Child>('/children', { method: 'POST', body: JSON.stringify(data) })

export const updateChild = (id: string, data: ChildInput) =>
  req<Child>(`/children/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteChild = (id: string) =>
  req<{ ok: boolean }>(`/children/${id}`, { method: 'DELETE' })

export interface MemoInput {
  childId?: string
  date?: string
  text?: string
  subjects?: string[]
  photoIds?: string[]
  draft?: boolean
}

export const createMemo = (data: MemoInput) =>
  req<Memo>('/memos', { method: 'POST', body: JSON.stringify(data) })

// Maakt voor elk gekozen kind een (eigen) memo aan; geeft de lijst terug.
export const createMemoForChildren = (childIds: string[], data: MemoInput) =>
  req<{ memos: Memo[] }>('/memos', {
    method: 'POST',
    body: JSON.stringify({ ...data, childIds }),
  }).then((r) => r.memos)

export const updateMemo = (id: string, data: MemoInput) =>
  req<Memo>(`/memos/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteMemo = (id: string) =>
  req<{ ok: boolean }>(`/memos/${id}`, { method: 'DELETE' })

// ---- Foto's ----

export const photoUrl = (id: string) => {
  const acct = getActiveAccount()
  return `/api/photos/${id}` + (acct ? `?account=${encodeURIComponent(acct)}` : '')
}

export async function uploadBlob(blob: Blob): Promise<string> {
  const acct = getActiveAccount()
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      ...(acct ? { 'X-Account-Id': acct } : {}),
    },
    credentials: 'same-origin',
    body: blob,
  })
  if (!res.ok) throw new Error(`Upload mislukt (${res.status})`)
  const { id } = (await res.json()) as { id: string }
  return id
}

export async function uploadPhoto(file: File): Promise<string> {
  const blob = await downscaleImage(file)
  return uploadBlob(blob)
}

/** Draait een afbeelding 90° (positief = met de klok mee) en geeft een nieuwe JPEG-blob. */
export async function rotateImageBlob(
  blob: Blob,
  degrees: 90 | -90,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  // Bij 90°/-90° wisselen breedte en hoogte.
  canvas.width = bitmap.height
  canvas.height = bitmap.width
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  bitmap.close()
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.82)
  })
}

export async function fetchPhotoBlob(id: string): Promise<Blob> {
  const res = await fetch(photoUrl(id))
  if (!res.ok) throw new Error(`Foto laden mislukt (${res.status})`)
  return res.blob()
}

export const deletePhoto = (id: string) =>
  fetch(photoUrl(id), { method: 'DELETE' })

// ---- AI-samenvatting (server-side) ----

export const summaryAvailable = () =>
  req<{ available: boolean }>('/summary/available')
    .then((r) => r.available)
    .catch(() => false)

export interface SummaryParams {
  childId: string
  start: string
  end: string
  period: string
  periodLabel: string
  includePhotos: boolean
  subject?: string
}

export async function generateSummary(params: SummaryParams): Promise<Summary> {
  return req<Summary>('/summary', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export const deleteSummary = (id: string) =>
  req<{ ok: boolean }>(`/summaries/${id}`, { method: 'DELETE' })

/** Verwijdert ALLE gegevens van het ingelogde account. */
export const deleteAllData = () =>
  req<{ ok: boolean }>('/account/data', { method: 'DELETE' })

// ---- Foto verkleinen vóór upload ----

const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.82

export async function downscaleImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  let { width, height } = bitmap
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', JPEG_QUALITY)
  })
}
