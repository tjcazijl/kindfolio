import { useState } from 'react'

interface Props {
  childName: string
  accountSubjects: string[]
  accountSubcats: Record<string, string[]>
  childSubjects: string[] // extra vakgebieden alleen voor dit kind
  childSubcats: Record<string, string[]> // extra subcategorieën per vakgebied
  onChange: (
    subjects: string[],
    subcats: Record<string, string[]>,
  ) => void | Promise<void>
}

// Additief: de accountlijst geldt altijd; hier voeg je per kind extra's toe.
export function ChildSubjectsEditor({
  childName,
  accountSubjects,
  accountSubcats,
  childSubjects,
  childSubcats,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newSubject, setNewSubject] = useState('')
  const [newSub, setNewSub] = useState('')

  const effective = [
    ...accountSubjects,
    ...childSubjects.filter((s) => !accountSubjects.includes(s)),
  ]

  function addSubject(e: React.FormEvent) {
    e.preventDefault()
    const s = newSubject.trim()
    setNewSubject('')
    if (!s || effective.includes(s)) return
    onChange([...childSubjects, s], childSubcats)
  }
  function removeSubject(s: string) {
    const nextSubcats = { ...childSubcats }
    delete nextSubcats[s]
    onChange(
      childSubjects.filter((x) => x !== s),
      nextSubcats,
    )
  }
  function addSub(subject: string) {
    const v = newSub.trim()
    setNewSub('')
    if (!v) return
    const cur = childSubcats[subject] || []
    const accountHas = (accountSubcats[subject] || []).includes(v)
    if (cur.includes(v) || accountHas) return
    onChange(childSubjects, { ...childSubcats, [subject]: [...cur, v] })
  }
  function removeSub(subject: string, v: string) {
    const next = { ...childSubcats }
    next[subject] = (next[subject] || []).filter((x) => x !== v)
    if (!next[subject].length) delete next[subject]
    onChange(childSubjects, next)
  }

  return (
    <>
      <p className="hint">
        De accountlijst geldt altijd. Hier voeg je vakgebieden en subcategorieën
        toe die alleen bij {childName} horen. Tik een vakgebied open voor de
        subcategorieën.
      </p>
      <div className="subj-list">
        {effective.map((s) => {
          const open = expanded === s
          const isAccount = accountSubjects.includes(s)
          const accSubs = accountSubcats[s] || []
          const kidSubs = childSubcats[s] || []
          const count = accSubs.length + kidSubs.length
          return (
            <div key={s} className="subj-item">
              <div className="subj-item-head">
                <button
                  type="button"
                  className="subj-expand"
                  onClick={() => {
                    setExpanded(open ? null : s)
                    setNewSub('')
                  }}
                >
                  <span className="chevron">{open ? '▾' : '▸'}</span>
                  {s}
                  {isAccount ? (
                    <span className="role-badge">account</span>
                  ) : (
                    <span className="role-badge">eigen</span>
                  )}
                  {count > 0 && <span className="hint inline"> · {count}</span>}
                </button>
                {!isAccount && (
                  <button
                    type="button"
                    className="link-btn danger sm"
                    onClick={() => removeSubject(s)}
                  >
                    Verwijderen
                  </button>
                )}
              </div>
              {open && (
                <div className="subj-subs">
                  {count > 0 && (
                    <div className="chips">
                      {accSubs.map((sub) => (
                        <span key={sub} className="chip sm inherited">
                          {sub}
                        </span>
                      ))}
                      {kidSubs.map((sub) => (
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
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      placeholder={`Subcategorie voor ${childName}`}
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
      <form onSubmit={addSubject} className="row gap" style={{ marginTop: 12 }}>
        <input
          className="input grow"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          placeholder={`Extra vakgebied voor ${childName}`}
        />
        <button className="btn primary sm" type="submit">
          Toevoegen
        </button>
      </form>
    </>
  )
}
