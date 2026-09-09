import { capStableford, MAX_STABLEFORD_POINTS } from './rules'

/**
 * Weekly winner / Wooden Spoon determination — Max 40 rule.
 *
 * Pure functions, no DB access, so the same logic runs both server-side
 * (confirm-week, weekly-detail) and client-side (the admin review screen,
 * for a live preview before anything is saved).
 *
 * Tie handling has two genuinely different cases, and using the wrong one
 * for the wrong case is exactly the bug this file used to have:
 *
 *   - A tie AT the Max 40 cap (two or more players read 40+ once capped).
 *     The written rule is explicit here: "the weekly winner is whoever has
 *     the lowest gross score." Trackman's `position` reflects the RAW
 *     (uncapped) points ranking — precisely the number the cap exists to
 *     override — so position must NOT be used to break this kind of tie.
 *     Gross score (`score_vs_par`, lower is better) is the correct and
 *     only automatic tiebreak here.
 *   - A tie BELOW the cap (a genuine points tie that never touched 40).
 *     Trackman already runs its own countback for this and `position`
 *     already reflects the result, so there's no need to reimplement
 *     back-9/back-6/back-3 — position is the correct tiebreak here.
 *
 * What this CANNOT resolve automatically is a tie that survives its
 * relevant tiebreak too (identical gross scores at the cap, or Trackman
 * itself showing a dead tie like "T1" below it). That's the rare case a
 * human needs to settle, surfaced via `tied: true`; the admin review
 * screen lets Andrew pick the winner by hand right there instead of
 * editing the database directly (see app/admin/page.tsx and
 * ConfirmWeekPayload).
 */

export interface WeeklyResultForRules {
  player_id: string
  stableford_score: number
  score_vs_par: number | null
  /** Trackman's own leaderboard position — already countback-resolved for a genuine (sub-cap) points tie. */
  position: number | null
  ineligible_for_bonus: boolean
}

export interface WeeklyWinnerResult {
  winnerIds: string[]
  cappedScore: number
  tied: boolean
  /** Null when there's no tie, or it broke cleanly on gross/position. */
  tieReason: 'trackman-tied-needs-manual-pick' | null
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

export function determineWeeklyWinner(
  results: WeeklyResultForRules[],
  manualWinnerId?: string | null
): WeeklyWinnerResult {
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
