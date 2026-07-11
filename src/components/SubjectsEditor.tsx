import { useState } from 'react'

interface Props {
  subjects: string[]
  onChange: (next: string[]) => void
  reset?: { label: string; onClick: () => void }
  // Optioneel: per vakgebied subcategorieën beheren (alleen account-breed).
  subcats?: Record<string, string[]>
  onSubcatsChange?: (next: Record<string, string[]>) => void
}

// Herbruikbare chip-editor voor vakgebieden (account-breed of per kind).
export function SubjectsEditor({
  subjects,
  onChange,
  reset,
  subcats,
  onSubcatsChange,
}: Props) {
  const [value, setValue] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [subValue, setSubValue] = useState('')
  const withSub = !!subcats && !!onSubcatsChange

  function addSubject(e: React.FormEvent) {
    e.preventDefault()
    const s = value.trim()
    if (!s || subjects.includes(s)) {
      setValue('')
      return
    }
    onChange([...subjects, s])
    setValue('')
  }

  function removeSubject(s: string) {
    onChange(subjects.filter((x) => x !== s))
    if (withSub && subcats![s]) {
      const next = { ...subcats! }
      delete next[s]
      onSubcatsChange!(next)
    }
  }

  function addSub(subject: string) {
    const v = subValue.trim()
    if (!v) return
    const cur = subcats![subject] || []
    if (!cur.includes(v)) onSubcatsChange!({ ...subcats!, [subject]: [...cur, v] })
    setSubValue('')
  }

  function removeSub(subject: string, sub: string) {
    const next = { ...subcats! }
    next[subject] = (next[subject] || []).filter((x) => x !== sub)
    if (!next[subject].length) delete next[subject]
    onSubcatsChange!(next)
  }

  const addForm = (
    <form onSubmit={addSubject} className="row gap" style={{ marginTop: 12 }}>
      <input
        className="input grow"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nieuw vakgebied"
      />
      <button className="btn primary sm" type="submit">
        Toevoegen
      </button>
    </form>
  )
  const resetBtn = reset && (
    <button className="link-btn" onClick={reset.onClick}>
      {reset.label}
    </button>
  )

  // --- Uitgebreide variant: met subcategorieën per vakgebied ---
  if (withSub) {
    return (
      <>
        <div className="subj-list">
          {subjects.map((s) => {
            const open = expanded === s
            const count = subcats![s]?.length ?? 0
            return (
              <div key={s} className="subj-item">
                <div className="subj-item-head">
                  <button
                    type="button"
                    className="subj-expand"
                    onClick={() => {
                      setExpanded(open ? null : s)
                      setSubValue('')
                    }}
                  >
                    <span className="chevron">{open ? '▾' : '▸'}</span>
                    {s}
                    {count > 0 && <span className="hint inline"> · {count}</span>}
                  </button>
                  <button
                    type="button"
                    className="link-btn danger sm"
                    onClick={() => removeSubject(s)}
                  >
                    Verwijderen
                  </button>
                </div>
                {open && (
                  <div className="subj-subs">
                    {count > 0 && (
                      <div className="chips">
                        {subcats![s].map((sub) => (
                          <span key={sub} className="chip on editable sm">
                            {sub}
                            <button
                              type="button"
                              className="chip-x"
                              onClick={() => removeSub(s, sub)}
                              aria-label={`${sub} verwijderen`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        addSub(s)
                      }}
                      className="row gap"
                      style={{ marginTop: count > 0 ? 8 : 0 }}
                    >
                      <input
                        className="input grow"
                        value={subValue}
                        onChange={(e) => setSubValue(e.target.value)}
                        placeholder="Nieuwe subcategorie"
                      />
                      <button className="btn primary sm" type="submit">
                        Toevoegen
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {addForm}
        {resetBtn}
      </>
    )
  }

  // --- Eenvoudige variant: platte chip-lijst (bv. per kind) ---
  return (
    <>
      <div className="chips">
        {subjects.map((s) => (
          <span key={s} className="chip on editable">
            {s}
            <button
              type="button"
              className="chip-x"
              onClick={() => onChange(subjects.filter((x) => x !== s))}
              aria-label={`${s} verwijderen`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {addForm}
      {resetBtn}
    </>
  )
}
