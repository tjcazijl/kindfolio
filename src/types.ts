export interface Child {
  id: string
  name: string
  birthYear?: number
  birthDate?: string
  color: string
  // Eigen vakgebieden-lijst; afwezig = erft de accountlijst.
  subjects?: string[]
  createdAt: number
}

export interface Memo {
  id: string
  childId: string
  date: string // YYYY-MM-DD (lokale dag)
  text: string
  subjects: string[]
  photoIds: string[]
  draft?: boolean
  createdAt: number
  updatedAt: number
}

export interface Photo {
  id: string
  blob: Blob
}

export interface Summary {
  id: string
  childId: string
  period: string
  periodLabel: string
  start: string
  end: string
  text: string
  createdAt: number
}

export interface Comment {
  id: string
  targetType: 'memo' | 'summary'
  targetId: string
  authorEmail: string
  text: string
  createdAt: number
}

export interface AccountAccess {
  id: string
  role: 'owner' | 'commenter'
  ownerEmail: string
}

export interface Setting {
  key: string
  value: string
}

export const SUBJECTS = [
  'Taal',
  'Rekenen',
  'Lezen',
  'Schrijven',
  'Natuur',
  'Algemene wetenschap',
  'Technisch',
  'Geschiedenis',
  'Aardrijkskunde',
  'Creatief',
  'Muziek',
  'Bewegen',
  'Sociaal',
  'Uitstapje',
  'Overig',
] as const

export const CHILD_COLORS = [
  '#2f6f4f',
  '#c2553b',
  '#3b6fc2',
  '#9b51b0',
  '#d59a18',
  '#2a9d8f',
  '#e76f51',
  '#5a6f9b',
]
