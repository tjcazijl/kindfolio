import { useMemo, useState } from 'react'
import { useData } from '../store'
import type { KerndoelSet } from '../types'
import { SET_KORT, kortTitel, perLeergebied } from '../utils/kerndoelen'

export interface KerndoelKeuze {
  childId: string
  set: KerndoelSet
  nr: number
}

interface Props {
  /** Voor welke kinderen geldt deze memo/dit leermiddel? Leeg = het hele gezin. */
  childIds: string[]
  value: KerndoelKeuze[]
  onChange: (next: KerndoelKeuze[]) => void
}

/**
 * Kerndoelen aanvinken, gegroepeerd per leergebied. Werken de betrokken
 * kinderen met verschillende sets (het ene kind po, het andere al vo), dan
 * staan beide onder hetzelfde leergebied, met erbij voor wie ze gelden.
 */
export function KerndoelPicker({ childIds, value, onChange }: Props) {
  const { children, kerndoelen } = useData()
  const [open, setOpen] = useState<string | null>(null)

  const betrokken = useMemo(
    () => (childIds.length ? children.filter((c) => childIds.includes(c.id)) : children),
    [children, childIds],
  )

  // Per set de kinderen die daarmee werken; bepaalt welke lijsten we tonen.
  const perSet = useMemo(() => {
    const map = new Map<KerndoelSet, typeof betrokken>()
    for (const c of betrokken) {
      const s = c.kerndoelenSet
      if (!map.has(s)) map.set(s, [])
      map.get(s)!.push(c)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [betrokken])

  const gemengd = perSet.length > 1

  const groepen = useMemo(() => {
    if (!kerndoelen) return []
    // Alle leergebieden die in minstens één betrokken set voorkomen, op volgorde.
    const namen: string[] = []
    for (const [set] of perSet) {
      for (const g of perLeergebied(kerndoelen[set] || [])) {
        if (!namen.includes(g.lg)) namen.push(g.lg)
      }
    }
    return namen.map((lg) => ({
      lg,
      rijen: perSet.flatMap(([set, kids]) =>
        (kerndoelen[set] || [])
          .filter((k) => k.lg === lg && !k.school)
          .map((k) => ({ set, kids, doel: k })),
      ),
    }))
  }, [kerndoelen, perSet])

  if (!kerndoelen || betrokken.length === 0) return null

  const heeft = (set: KerndoelSet, nr: number, kids: { id: string }[]) =>
    kids.length > 0 &&
    kids.every((c) => value.some((v) => v.childId === c.id && v.set === set && v.nr === nr))

  function toggle(set: KerndoelSet, nr: number, kids: { id: string }[]) {
    if (heeft(set, nr, kids)) {
      onChange(
        value.filter(
          (v) => !(v.set === set && v.nr === nr && kids.some((c) => c.id === v.childId)),
        ),
      )
    } else {
      const erbij = kids
        .filter((c) => !value.some((v) => v.childId === c.id && v.set === set && v.nr === nr))
        .map((c) => ({ childId: c.id, set, nr }))
      onChange([...value, ...erbij])
    }
  }

  // Kort overzicht van wat er al aanstaat, zodat je niet alles hoeft open te klappen.
  const gekozen = useMemo(() => {
    const uniek = new Map<string, { set: KerndoelSet; nr: number }>()
    for (const v of value) uniek.set(`${v.set}|${v.nr}`, { set: v.set, nr: v.nr })
    return [...uniek.values()].sort((a, b) => a.set.localeCompare(b.set) || a.nr - b.nr)
  }, [value])

  return (
    <div className="kd-picker">
      {gekozen.length > 0 && (
        <div className="kd-gekozen">
          {gekozen.map((g) => {
            const doel = kerndoelen[g.set]?.find((k) => k.nr === g.nr)
            return (
              <span key={`${g.set}${g.nr}`} className={`kd-chip ${g.set}`}>
                <span className="kd-set">{SET_KORT[g.set]}</span> {g.nr} ·{' '}
                {doel ? kortTitel(doel.t) : 'onbekend'}
              </span>
            )
          })}
        </div>
      )}

      {groepen.map((g) => {
        const aan = g.rijen.filter((r) => heeft(r.set, r.doel.nr, r.kids)).length
        const uit = open === g.lg
        return (
          <div key={g.lg} className={`kd-groep ${uit ? 'open' : ''}`}>
            <button
              type="button"
              className="kd-groep-head"
              onClick={() => setOpen(uit ? null : g.lg)}
            >
              <span className="kd-lg">{g.lg}</span>
              {aan > 0 && <span className="kd-teller">{aan}</span>}
              <span className="chevron">{uit ? '▾' : '▸'}</span>
            </button>
            {uit && (
              <div className="kd-rijen">
                {g.rijen.map((r) => {
                  const on = heeft(r.set, r.doel.nr, r.kids)
                  return (
                    <button
                      key={`${r.set}-${r.doel.nr}`}
                      type="button"
                      className={`kd-rij ${on ? 'on' : ''} ${r.set}`}
                      onClick={() => toggle(r.set, r.doel.nr, r.kids)}
                    >
                      <span className="kd-vink">{on ? '✓' : ''}</span>
                      <span className="kd-tekst">
                        <span className="kd-nr">
                          {r.doel.nr} · {kortTitel(r.doel.t)}
                        </span>
                        {gemengd && (
                          <span className="kd-wie">
                            <span className={`kd-set ${r.set}`}>{SET_KORT[r.set]}</span>{' '}
                            voor {r.kids.map((c) => c.name).join(', ')}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
