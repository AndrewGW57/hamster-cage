import { capStableford, MAX_STABLEFORD_POINTS, MAX40_GROSS_TIEBREAK_FROM_DATE } from './rules'

/**
 * Weekly winner / Wooden Spoon determination — Max 40 rule.
 *
 * Pure functions, no DB access, so the same logic runs both server-side
 * (confirm-week, weekly-detail, home and cohort pages) and client-side (the
 * admin review screen, for a live preview before anything is saved).
 *
 * Bonus eligibility: only rows with `ineligible_for_bonus = false` can win.
 * confirm-week sets that flag for DNF players and for anyone the admin ticks
 * "No Bonus" (played outside normal Hamster Cage hours).
 *
 * Two rule versions, chosen by weeks.date (never week_number, which resets
 * per cohort). Past weeks are frozen, so the legacy path must stay exactly as
 * it was.
 *
 * From MAX40_GROSS_TIEBREAK_FROM_DATE (lib/rules.ts) — determineMax40Gross():
 *   - The group is every eligible player with RAW stableford_score >= 40.
 *   - Nobody in the group: unchanged legacy logic (sub-40 ties go to
 *     Trackman's `position`, which already reflects its back 9 / 6 / 3
 *     countback; this app has no hole-by-hole scores).
 *   - One player in the group: that player wins.
 *   - Two or more: lowest gross strokes (`gross_score`, entered by hand on
 *     the admin review screen) wins. A missing gross for anyone in the group
 *     means no winner is decided (`needsGross: true`); never guess. A shared
 *     lowest gross is `tied: true`, settled by the admin's manual pick.
 *
 * Before that date — determineWeeklyWinnerLegacy(), unchanged:
 *   - A tie AT the cap is broken on `score_vs_par`, lowest first. NOTE: the
 *     stored score_vs_par is Stableford points minus 36 (higher is better),
 *     not gross strokes, so this effectively picks the lowest raw points.
 *     Kept as-is because past results are frozen.
 *   - A tie BELOW the cap is broken on Trackman's `position`.
 *   - A tie that survives is `tied: true` for the admin's manual pick.
 */

export interface WeeklyResultForRules {
  player_id: string
  stableford_score: number
  /** Stableford points minus 36 (higher is better). Not gross strokes. */
  score_vs_par: number | null
  /** Trackman's own leaderboard position — already countback-resolved for a genuine (sub-cap) points tie. */
  position: number | null
  ineligible_for_bonus: boolean
  /** Gross strokes, entered by hand for 40+ groups. Only read by the post-cutover rule. */
  gross_score?: number | null
}

export interface WeeklyWinnerResult {
  winnerIds: string[]
  cappedScore: number
  tied: boolean
  /** Null when there's no tie, or it broke cleanly. */
  tieReason:
    | 'trackman-tied-needs-manual-pick'
    | 'gross-tied-needs-manual-pick'
    | 'needs-gross'
    | null
  /** True when two or more players are on 40+ and at least one has no gross score yet. No winner is decided. */
  needsGross: boolean
}

export interface WoodenSpoonResult {
  spoonIds: string[]
  rawScore: number
  tied: boolean
}

function byGrossAsc(a: WeeklyResultForRules, b: WeeklyResultForRules): number {
  const av = a.score_vs_par ?? Infinity
  const bv = b.score_vs_par ?? Infinity
  return av - bv
}

function byPositionAsc(a: WeeklyResultForRules, b: WeeklyResultForRules): number {
  const ap = a.position ?? Infinity
  const bp = b.position ?? Infinity
  return ap - bp
}

/**
 * Resolves a tied group as far as the rules allow. Every candidate shares
 * the same capped score, so `atCap` is decided once for the whole group.
 */
function narrowTie<T extends WeeklyResultForRules & { capped: number }>(candidates: T[]): T[] {
  const atCap = candidates[0].capped >= MAX_STABLEFORD_POINTS
  if (atCap) {
    const sorted = [...candidates].sort(byGrossAsc)
    const bestGross = sorted[0].score_vs_par ?? Infinity
    return sorted.filter((c) => (c.score_vs_par ?? Infinity) === bestGross)
  }
  const sorted = [...candidates].sort(byPositionAsc)
  const bestPosition = sorted[0].position ?? Infinity
  return sorted.filter((c) => (c.position ?? Infinity) === bestPosition)
}

/** True when the week (weeks.date, YYYY-MM-DD) uses the gross-strokes 40+ tiebreak. */
export function usesMax40GrossRule(weekDate: string): boolean {
  return weekDate >= MAX40_GROSS_TIEBREAK_FROM_DATE
}

/** Eligible players on 40+ raw points this week — the group the post-cutover gross tiebreak applies to. */
export function max40Group<T extends WeeklyResultForRules>(results: T[]): T[] {
  return results.filter((r) => !r.ineligible_for_bonus && r.stableford_score >= MAX_STABLEFORD_POINTS)
}

export function determineWeeklyWinner(
  results: WeeklyResultForRules[],
  weekDate: string,
  manualWinnerId?: string | null
): WeeklyWinnerResult {
  if (usesMax40GrossRule(weekDate)) return determineMax40Gross(results, manualWinnerId)
  return { ...determineWeeklyWinnerLegacy(results, manualWinnerId), needsGross: false }
}

function determineMax40Gross(
  results: WeeklyResultForRules[],
  manualWinnerId?: string | null
): WeeklyWinnerResult {
  const group = max40Group(results)

  if (group.length === 0) {
    return { ...determineWeeklyWinnerLegacy(results, manualWinnerId), needsGross: false }
  }

  if (group.length === 1) {
    return { winnerIds: [group[0].player_id], cappedScore: MAX_STABLEFORD_POINTS, tied: false, tieReason: null, needsGross: false }
  }

  if (group.some((r) => r.gross_score == null)) {
    return { winnerIds: [], cappedScore: MAX_STABLEFORD_POINTS, tied: true, tieReason: 'needs-gross', needsGross: true }
  }

  const bestGross = Math.min(...group.map((r) => r.gross_score as number))
  const best = group.filter((r) => r.gross_score === bestGross)

  if (best.length === 1) {
    return { winnerIds: [best[0].player_id], cappedScore: MAX_STABLEFORD_POINTS, tied: false, tieReason: null, needsGross: false }
  }

  if (manualWinnerId && best.some((r) => r.player_id === manualWinnerId)) {
    return { winnerIds: [manualWinnerId], cappedScore: MAX_STABLEFORD_POINTS, tied: false, tieReason: null, needsGross: false }
  }

  return {
    winnerIds: best.map((r) => r.player_id),
    cappedScore: MAX_STABLEFORD_POINTS,
    tied: true,
    tieReason: 'gross-tied-needs-manual-pick',
    needsGross: false,
  }
}

// Pre-cutover rule. Logic frozen: past weeks must keep their results.
function determineWeeklyWinnerLegacy(
  results: WeeklyResultForRules[],
  manualWinnerId?: string | null
): Omit<WeeklyWinnerResult, 'needsGross'> {
  const eligible = results.filter((r) => !r.ineligible_for_bonus)
  if (eligible.length === 0) {
    return { winnerIds: [], cappedScore: 0, tied: false, tieReason: null }
  }

  const capped = eligible.map((r) => ({ ...r, capped: capStableford(r.stableford_score) }))
  const topCapped = Math.max(...capped.map((c) => c.capped))
  const candidates = capped.filter((c) => c.capped === topCapped)

  if (candidates.length === 1) {
    return { winnerIds: [candidates[0].player_id], cappedScore: topCapped, tied: false, tieReason: null }
  }

  const narrowed = narrowTie(candidates)

  if (narrowed.length === 1) {
    return { winnerIds: [narrowed[0].player_id], cappedScore: topCapped, tied: false, tieReason: null }
  }

  // Neither gross score (at-cap ties) nor Trackman's own position (sub-cap
  // ties) could split this group — a human call is needed. If the admin
  // has already made that call (manualWinnerId), honor it.
  if (manualWinnerId && narrowed.some((c) => c.player_id === manualWinnerId)) {
    return { winnerIds: [manualWinnerId], cappedScore: topCapped, tied: false, tieReason: null }
  }

  return {
    winnerIds: narrowed.map((c) => c.player_id),
    cappedScore: topCapped,
    tied: true,
    tieReason: 'trackman-tied-needs-manual-pick',
  }
}

export function determineWoodenSpoon(results: WeeklyResultForRules[]): WoodenSpoonResult {
  const eligible = results.filter((r) => !r.ineligible_for_bonus)
  if (eligible.length === 0) return { spoonIds: [], rawScore: 0, tied: false }

  const lowest = Math.min(...eligible.map((r) => r.stableford_score))
  const candidates = eligible.filter((r) => r.stableford_score === lowest)

  return {
    spoonIds: candidates.map((c) => c.player_id),
    rawScore: lowest,
    tied: candidates.length > 1,
  }
}
