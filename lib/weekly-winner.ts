import { capStableford } from './rules'

/**
 * Weekly winner / Wooden Spoon determination — Max 40 rule.
 *
 * Pure functions, no DB access, so the same logic runs both server-side
 * (confirm-week, weekly-detail) and client-side (the admin review screen,
 * for a live preview before anything is saved).
 *
 * Tie handling: Trackman already runs its own countback for a genuine points
 * tie in a normal (uncapped) round — that's exactly what its `position`
 * column already reflects, so this app doesn't need to reimplement
 * back-9/back-6/back-3 itself. What this DOES resolve automatically, in
 * order:
 *   1. A clear high score under the Max 40 cap → single winner.
 *   2. A tie created BY the cap (e.g. 45 and 42 both read as 40) → broken by
 *      whoever actually finished higher on Trackman's own leaderboard
 *      (lowest `position`), which is exactly the "lowest gross score" the
 *      rule asks for and already carries Trackman's countback with it.
 *   3. If Trackman itself showed a dead tie (two players sharing the same
 *      position, e.g. "T1") — the last-resort tiebreak: lowest vs-par.
 * What it CANNOT resolve — because Trackman itself couldn't split them —
 * is a tie that survives all three steps. That's the rare case a human
 * needs to settle, surfaced via `tied: true`; the admin review screen lets
 * Andrew pick the winner by hand right there instead of editing the
 * database directly (see app/admin/page.tsx and ConfirmWeekPayload).
 */

export interface WeeklyResultForRules {
  player_id: string
  stableford_score: number
  score_vs_par: number | null
  /** Trackman's own leaderboard position — already countback-resolved for a genuine points tie. */
  position: number | null
  ineligible_for_bonus: boolean
}

export interface WeeklyWinnerResult {
  winnerIds: string[]
  cappedScore: number
  tied: boolean
  /** Null when there's no tie, or it broke cleanly on position/gross. */
  tieReason: 'trackman-tied-needs-manual-pick' | null
}

export interface WoodenSpoonResult {
  spoonIds: string[]
  rawScore: number
  tied: boolean
}

function byPositionThenGross(a: WeeklyResultForRules, b: WeeklyResultForRules): number {
  const ap = a.position ?? Infinity
  const bp = b.position ?? Infinity
  if (ap !== bp) return ap - bp
  const av = a.score_vs_par ?? Infinity
  const bv = b.score_vs_par ?? Infinity
  return av - bv
}

/**
 * Resolves a tied group down as far as position + gross score can take it.
 * Returns every player left tied after both checks (length 1 = resolved).
 */
function narrowTie<T extends WeeklyResultForRules>(candidates: T[]): T[] {
  const sorted = [...candidates].sort(byPositionThenGross)
  const best = sorted[0]
  return sorted.filter(
    (c) => (c.position ?? Infinity) === (best.position ?? Infinity) && (c.score_vs_par ?? Infinity) === (best.score_vs_par ?? Infinity)
  )
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

  // Trackman itself couldn't split this group — a human call is needed.
  // If the admin has already made that call (manualWinnerId), honor it.
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
