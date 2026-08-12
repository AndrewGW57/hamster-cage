/**
 * Shared "Next Week's Course" resolution.
 *
 * A week is upcoming only if it has no results AND is not a bye. A bye week is
 * scheduled and numbered but voided for every player (e.g. the Trackman malfunction
 * that forced a full replay of Summer 2026 Week 5), so it has zero result rows
 * forever. Treating "no scores" alone as "upcoming" pins the indicator to that week
 * permanently — hence the explicit is_bye check.
 *
 * `weeks` must already be ordered by week_number; the first match wins.
 */
export interface NextWeekCandidate {
  id: string
  course_name: string
  is_bye: boolean
}

export function findNextWeek<T extends NextWeekCandidate>(
  weeks: T[],
  weeksWithResults: Set<string>
): T | null {
  return weeks.find((w) => !w.is_bye && !weeksWithResults.has(w.id)) ?? null
}

/** Rounds that were actually playable — bye weeks are excluded from the denominator. */
export function countPlayableWeeks(weeks: { is_bye: boolean }[]): number {
  return weeks.filter((w) => !w.is_bye).length
}
