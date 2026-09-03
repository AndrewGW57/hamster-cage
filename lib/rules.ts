/**
 * Season rule constants — Max 40 and Curveball Weeks.
 *
 * "Week N" here means the week's `week_number` column, which is assigned
 * sequentially per cohort at creation time (see app/api/create-week) and is
 * never reused or renumbered. In every place that displays "Wk N" to users
 * (the leaderboard grid, the weekly detail modal, the admin week picker)
 * that label is this same value, so keying Curveball detection off
 * `week_number` matches what players actually see.
 */

export const MAX_STABLEFORD_POINTS = 40

/** Weeks 3, 6, 9 and 12 of each cohort/season are Curveball Weeks. */
export const CURVEBALL_WEEK_NUMBERS = [3, 6, 9, 12] as const

export function isCurveballWeek(weekNumber: number): boolean {
  return (CURVEBALL_WEEK_NUMBERS as readonly number[]).includes(weekNumber)
}

/** "40 is what goes into the books" — caps a single round's Stableford score for scoring purposes. */
export function capStableford(rawScore: number): number {
  return Math.min(rawScore, MAX_STABLEFORD_POINTS)
}

/** Weekly winner bonus: 1 point normally, 2 points on a Curveball week. */
export function weeklyWinnerBonusPoints(isCurveball: boolean): number {
  return isCurveball ? 2 : 1
}
