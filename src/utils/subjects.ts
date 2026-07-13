import type { Child } from '../types'

// De accountlijst geldt altijd voor elk kind; per kind kunnen er extra's bij.
export function effectiveSubjects(
  child: Child | undefined,
  accountSubjects: string[],
): string[] {
  return [...new Set([...accountSubjects, ...(child?.subjects || [])])]
}

// Subcategorieën voor een vakgebied: account-breed + extra's van de gegeven kinderen.
export function effectiveSubcats(
  subject: string,
  accountSubcats: Record<string, string[]>,
  children: (Child | undefined)[],
): string[] {
  const set = new Set<string>(accountSubcats[subject] || [])
  for (const c of children)
    (c?.subcategories?.[subject] || []).forEach((v) => set.add(v))
  return [...set]
}
