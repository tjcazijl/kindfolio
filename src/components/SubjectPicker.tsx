import { useData } from '../store'
import { effectiveSubcats } from '../utils/subjects'

interface Props {
  selected: string[]
  onToggle: (subject: string) => void
}

/**
 * Vakgebieden kiezen inclusief subcategorieën: de hoofdcategorieën staan als
 * chips, en zodra er één gekozen is verschijnen de bijbehorende subcategorieën
 * eronder. Zelfde opzet als in de memo-editor.
 */
export function SubjectPicker({ selected, onToggle }: Props) {
  const {
    children,
    subjects: accountSubjects,
    subcategories: accountSubcats,
  } = useData()

  // Alle vakgebieden: accountlijst + extra's van alle kinderen + wat al gekozen is.
  const all = [
    ...new Set([
      ...accountSubjects,
      ...children.flatMap((c) => c.subjects || []),
      ...selected,
    ]),
  ]
  const subcatFor = (s: string) => effectiveSubcats(s, accountSubcats, children)

  // Subcategorie-waarden niet ook als hoofd-chip tonen (voorkomt dubbeling).
  const subcatValues = new Set<string>()
  for (const s of all) subcatFor(s).forEach((v) => subcatValues.add(v))
  const topSubjects = all.filter((s) => !subcatValues.has(s))

  if (topSubjects.length === 0) return null

  return (
    <>
      <div className="chips">
        {topSubjects.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${selected.includes(s) ? 'on' : ''}`}
            onClick={() => onToggle(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {topSubjects
        .filter((s) => selected.includes(s) && subcatFor(s).length > 0)
        .map((s) => (
          <div key={s} className="subcat-row">
            <span className="subcat-label">{s}:</span>
            <div className="chips">
              {subcatFor(s).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  className={`chip sm ${selected.includes(sub) ? 'on' : ''}`}
                  onClick={() => onToggle(sub)}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        ))}
    </>
  )
}
