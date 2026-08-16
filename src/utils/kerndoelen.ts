import type { Child, Kerndoel, KerndoelLink, KerndoelSet } from '../types'

/** Vaste volgorde van de leergebieden. Beide sets delen dezelfde negen. */
export const LEERGEBIEDEN = [
  'Nederlands',
  'Rekenen en wiskunde',
  'Burgerschap',
  'Digitale geletterdheid',
  'Mens en maatschappij',
  'Mens en natuur',
  'Moderne vreemde talen',
  'Kunst en cultuur',
  'Bewegen en sport',
]

export const SET_KORT: Record<KerndoelSet, string> = { po: 'PO', vo: 'VO' }
export const SET_NAAM: Record<KerndoelSet, string> = {
  po: 'Basisonderwijs',
  vo: 'Voortgezet onderwijs',
}
export const SET_UITLEG: Record<KerndoelSet, string> = {
  po: '40 kerndoelen',
  vo: '45 kerndoelen · onderbouw, normaal gesproken vanaf ± 12 jaar',
}

/** "De leerling verkent…" → "Verkent…", zodat een lijst leesbaar blijft. */
export function kortTitel(t: string): string {
  const zonder = t.replace(/^De leerling /, '').replace(/\.$/, '')
  return zonder.charAt(0).toUpperCase() + zonder.slice(1)
}

/** Groepeert een set op leergebied, in de vaste volgorde. */
export function perLeergebied(
  lijst: Kerndoel[],
): { lg: string; doelen: Kerndoel[] }[] {
  const map = new Map<string, Kerndoel[]>()
  for (const k of lijst) {
    if (!map.has(k.lg)) map.set(k.lg, [])
    map.get(k.lg)!.push(k)
  }
  return LEERGEBIEDEN.filter((lg) => map.has(lg)).map((lg) => ({
    lg,
    doelen: map.get(lg)!.sort((a, b) => a.nr - b.nr),
  }))
}

/** De koppelingen van één memo/leermiddel/agenda-item. */
export const linksVoor = (
  links: KerndoelLink[],
  carrierType: KerndoelLink['carrierType'],
  carrierId: string | undefined,
) =>
  carrierId
    ? links.filter(
        (l) => l.carrierType === carrierType && l.carrierId === carrierId,
      )
    : []

/** Sleutel om een koppeling uniek te herkennen binnen één drager. */
export const linkKey = (childId: string, set: KerndoelSet, nr: number) =>
  `${childId}|${set}|${nr}`

export interface KerndoelStand {
  set: KerndoelSet
  nr: number
  doel: Kerndoel | undefined
  /** Aantal bevestigde koppelingen. */
  aantal: number
  /** Aantal AI-voorstellen dat nog nagekeken moet worden. */
  open: number
  /** Eerste citaat dat de AI meegaf, als bewijs bij het nakijken. */
  citaat?: string
}

/**
 * Telt per kerndoel hoe vaak het voorkomt bij één kind. Koppelingen uit de
 * andere set tellen apart mee: die horen bij de maanden vóór de overstap en
 * bij elkaar optellen zou nergens op slaan.
 */
export function standVoorKind(
  links: KerndoelLink[],
  kerndoelen: Record<KerndoelSet, Kerndoel[]>,
  childId: string,
  set: KerndoelSet,
): KerndoelStand[] {
  const eigen = links.filter((l) => l.childId === childId && l.set === set)
  const map = new Map<number, KerndoelStand>()
  for (const l of eigen) {
    let s = map.get(l.nr)
    if (!s) {
      s = {
        set,
        nr: l.nr,
        doel: kerndoelen[set]?.find((k) => k.nr === l.nr),
        aantal: 0,
        open: 0,
      }
      map.set(l.nr, s)
    }
    if (l.status === 'ok') s.aantal++
    else s.open++
    if (!s.citaat && l.quote) s.citaat = l.quote
  }
  return [...map.values()].sort((a, b) => a.nr - b.nr)
}

/** Dekking per leergebied: hoeveel doelen zijn er geraakt van hoeveel. */
export function dekkingPerLeergebied(
  standen: KerndoelStand[],
  kerndoelen: Record<KerndoelSet, Kerndoel[]>,
  set: KerndoelSet,
): { lg: string; geraakt: number; totaal: number }[] {
  const geraakt = new Set(standen.filter((s) => s.aantal > 0).map((s) => s.nr))
  return perLeergebied(kerndoelen[set] || []).map((g) => ({
    lg: g.lg,
    geraakt: g.doelen.filter((d) => geraakt.has(d.nr)).length,
    totaal: g.doelen.length,
  }))
}

/**
 * Kinderen die de 12-jaarsvraag nog niet beantwoord hebben en al 12 zijn.
 * De app schakelt nooit zelf om — hij vraagt het één keer.
 */
export function vraagOverstap(children: Child[], leeftijd: (c: Child) => number | null) {
  return children.filter(
    (c) =>
      !c.kerndoelenAsked &&
      c.kerndoelenSet === 'po' &&
      (leeftijd(c) ?? 0) >= 12,
  )
}
