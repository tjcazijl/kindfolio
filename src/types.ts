export interface Child {
  id: string
  name: string
  birthYear?: number
  birthDate?: string
  color: string
  // Extra vakgebieden alleen voor dit kind (bovenop de accountlijst).
  subjects?: string[]
  // Extra subcategorieën per vakgebied, alleen voor dit kind.
  subcategories?: Record<string, string[]>
  // Welke SLO-set voor dit kind geldt, en sinds wanneer die is omgezet.
  kerndoelenSet: KerndoelSet
  kerndoelenSetAt?: string
  // Of de "dit kind is 12 geworden"-vraag al beantwoord is.
  kerndoelenAsked?: boolean
  createdAt: number
}

/** po = primair onderwijs (40 doelen), vo = onderbouw voortgezet (45 doelen). */
export type KerndoelSet = 'po' | 'vo'

export interface Kerndoel {
  nr: number
  /** Leergebied, bijv. "Rekenen en wiskunde". Beide sets delen dezelfde negen. */
  lg: string
  t: string
  /** 1 bij de twee doelen die over de leeromgeving gaan, niet over het kind. */
  school?: number
}

/**
 * Een stuk tijd waar je achteraf een naam aan geeft ("Het WK", "De ijstijd").
 * Welke memo's erin vallen volgt uit de datums en de kinderen — je koppelt ze
 * niet stuk voor stuk.
 */
export interface Period {
  id: string
  title: string
  start: string // YYYY-MM-DD
  end: string
  note?: string
  /** ok = van jou, open = voorstel van de AI dat je nog moet nakijken. */
  status: 'ok' | 'open'
  source: 'manual' | 'ai'
  childIds: string[] // leeg = gezinsbreed
  createdAt: number
  updatedAt: number
}

export type KerndoelCarrier = 'memo' | 'resource' | 'event' | 'period'

export interface KerndoelLink {
  id: string
  carrierType: KerndoelCarrier
  carrierId: string
  childId: string
  set: KerndoelSet
  nr: number
  source: 'manual' | 'ai'
  /** ok = telt mee, open = AI-voorstel dat nog nagekeken moet worden. */
  status: 'ok' | 'open'
  quote?: string
  createdAt: number
}

export type MoodKey = 'leuk' | 'prima' | 'ging_wel' | 'lastig'

export interface Memo {
  id: string
  childId: string
  date: string // YYYY-MM-DD (lokale dag)
  text: string
  subjects: string[]
  photoIds: string[]
  resourceIds: string[] // gekoppelde leermiddelen
  draft?: boolean
  mood?: MoodKey // reactie van het kind ("Hoe ging het?")
  likeCount?: number
  likedByMe?: boolean
  likedBy?: string[] // namen van wie het leuk vindt (oudste eerst)
  createdAt: number
  updatedAt: number
}

export type ResourceType =
  | 'leerboek'
  | 'leesboek'
  | 'website'
  | 'video'
  | 'app'
  | 'overig'
export type ResourceStatus =
  | 'te_lezen'
  | 'bezig'
  | 'gelezen'
  | 'in_gebruik'
  | 'afgerond'

export interface Resource {
  id: string
  type: ResourceType
  title: string
  author?: string
  url?: string
  subjects: string[]
  status?: ResourceStatus // alleen bij boeken
  readDate?: string // YYYY-MM-DD, wanneer gelezen/afgerond
  notes?: string
  childIds: string[] // leeg = gezinsbreed
  createdAt: number
  updatedAt: number
}

export type FocusStatus = 'open' | 'later' | 'done'

export interface FocusPoint {
  id: string
  childId: string
  text: string
  subject?: string
  status: FocusStatus
  sourceMemoId?: string // gekoppeld aan een memo, of los toegevoegd
  linkKind?: 'attention' | 'later'
  createdAt: number
  updatedAt: number
}

export interface Photo {
  id: string
  blob: Blob
}

export type EventType = 'uitje' | 'taak' | 'les'
export type EventFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface AgendaEvent {
  id: string
  title: string
  notes?: string
  type: EventType
  date: string // YYYY-MM-DD (ankerdatum / eerste keer)
  /** Laatste dag als het item meerdere dagen beslaat (themaweek, kamp). */
  end?: string
  time?: string // HH:MM (optioneel)
  freq: EventFreq
  everyN: number // elke N dagen/weken/…
  weekdays: string[] // ['ma','wo'] — alleen bij freq 'weekly'
  until?: string // YYYY-MM-DD, herhaal t/m (optioneel)
  sortOrder: number // handmatige volgorde binnen een dag
  subjects: string[] // vakgebieden/categorieën
  childIds: string[] // leeg = gezinsbreed
  focusIds: string[] // gekoppelde aandachtspunten
  createdAt: number
  updatedAt: number
}

export interface Summary {
  id: string
  childId: string
  period: string
  periodLabel: string
  start: string
  end: string
  text: string
  photoIds: string[] // foto's die zichtbaar bij de samenvatting horen
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
