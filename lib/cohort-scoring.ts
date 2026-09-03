import { createServiceClient } from '@/lib/supabase'
import { capStableford, isCurveballWeek } from '@/lib/rules'

export interface BonusBreakdown {
  ctp: number
  ld: number
  top10: number
  winner: number
}

export interface CohortLeaderboardRow {
  rank: number
  player_id: string
  display_name: string
  country_code: string | null
  rounds_played: number
  best_scores: number[]
  /** How many of this player's rounds actually counted toward stableford_total this season. */
  counted_weeks: number
  /** True if this player has never posted a Curveball-week (3/6/9/12) score — costs them one counting slot. */
  no_curveball_score: boolean
  bonus_breakdown: BonusBreakdown
  stableford_total: number
  bonus_total: number
  total: number
}

interface PlayerRoundScore {
  /** Stableford score already capped at 40 (Max 40 rule) — this is what goes into the books. */
  score: number
  isCurveball: boolean
}

export async function getCohortLeaderboard(cohort_id: string): Promise<CohortLeaderboardRow[]> {
  const db = createServiceClient()

  const [
    { data: cohort, error: cohortErr },
    { data: weeks, error: weeksErr },
  ] = await Promise.all([
    db.from('cohorts').select('scores_to_count').eq('id', cohort_id).single(),
    db.from('weeks').select('id, week_number').eq('cohort_id', cohort_id),
  ])

  if (cohortErr || !cohort) throw new Error(`Cohort fetch failed: ${cohortErr?.message}`)
  if (weeksErr) throw new Error(`Weeks fetch failed: ${weeksErr?.message}`)

  const weekIds = (weeks ?? []).map((w: { id: string }) => w.id)
  if (weekIds.length === 0) return []

  // Curveball Weeks are weeks 3, 6, 9 and 12 of the cohort (see lib/rules.ts).
  const curveballWeekIds = new Set(
    (weeks ?? [])
      .filter((w: { week_number: number }) => isCurveballWeek(w.week_number))
      .map((w: { id: string }) => w.id)
  )

  const [
    { data: results, error: resultsErr },
    { data: players, error: playersErr },
    { data: bonusRows, error: bonusErr },
  ] = await Promise.all([
    db.from('results').select('player_id, week_id, stableford_score').in('week_id', weekIds),
    db.from('players').select('id, display_name, country_code'),
    db.from('bonus_points').select('player_id, bonus_type, points').eq('cohort_id', cohort_id),
  ])

  if (resultsErr) throw new Error(`Results fetch failed: ${resultsErr?.message}`)
  if (playersErr) throw new Error(`Players fetch failed: ${playersErr?.message}`)
  if (bonusErr) throw new Error(`Bonus points fetch failed: ${bonusErr?.message}`)

  const playerMap = new Map(
    (players ?? []).map((p: { id: string; display_name: string; country_code: string | null }) => [p.id, p])
  )

  const scoresByPlayer = new Map<string, PlayerRoundScore[]>()
  for (const r of results ?? []) {
    const arr = scoresByPlayer.get(r.player_id) ?? []
    // DNF rounds are saved with stableford_score = 0. They count toward rounds_played
    // and sort to the bottom of the best-N selection naturally (0 is always last when sorted desc).
    arr.push({ score: capStableford(r.stableford_score), isCurveball: curveballWeekIds.has(r.week_id) })
    scoresByPlayer.set(r.player_id, arr)
  }

  const bonusByPlayer = new Map<string, BonusBreakdown>()
  for (const b of bonusRows ?? []) {
    const bd = bonusByPlayer.get(b.player_id) ?? { ctp: 0, ld: 0, top10: 0, winner: 0 }
    bd[b.bonus_type as keyof BonusBreakdown] += b.points
    bonusByPlayer.set(b.player_id, bd)
  }

  const allPlayerIds = new Set([...scoresByPlayer.keys(), ...bonusByPlayer.keys()])

  const rows: CohortLeaderboardRow[] = []
  for (const playerId of allPlayerIds) {
    const player = playerMap.get(playerId)
    if (!player) continue

    // Scores are capped at 40 (Max 40) before ranking, then sorted best-first.
    const allRounds = (scoresByPlayer.get(playerId) ?? []).sort((a, b) => b.score - a.score)
    const hasCurveballRound = allRounds.some((r) => r.isCurveball)

    // Curveball Weeks rule: at least one of your counting scores must come from a
    // Curveball week (3, 6, 9 or 12). A player who never posted one simply counts
    // one fewer score for the season — no free pass, no extra penalty either.
    const effectiveN = hasCurveballRound
      ? cohort.scores_to_count
      : Math.max(0, cohort.scores_to_count - 1)

    let bestRounds = allRounds.slice(0, effectiveN)

    if (hasCurveballRound && effectiveN > 0 && !bestRounds.some((r) => r.isCurveball)) {
      // Force-swap: the natural best N didn't include a Curveball week — swap out
      // the weakest counted round for the player's best Curveball round, even if
      // that lowers the total. This is what makes the eligibility rule bite.
      const bestCurveball = [...allRounds].filter((r) => r.isCurveball).sort((a, b) => b.score - a.score)[0]
      bestRounds = [...bestRounds.slice(0, -1), bestCurveball]
    }

    const bestScores = bestRounds.map((r) => r.score)
    const stablefordTotal = bestScores.reduce((s, n) => s + n, 0)
    const bonus = bonusByPlayer.get(playerId) ?? { ctp: 0, ld: 0, top10: 0, winner: 0 }
    const bonusTotal = bonus.ctp + bonus.ld + bonus.top10 + bonus.winner

    rows.push({
      rank: 0,
      player_id: playerId,
      display_name: player.display_name,
      country_code: player.country_code,
      rounds_played: allRounds.length,
      best_scores: bestScores,
      counted_weeks: bestRounds.length,
      no_curveball_score: !hasCurveballRound,
      bonus_breakdown: bonus,
      stableford_total: stablefordTotal,
      bonus_total: bonusTotal,
      total: stablefordTotal + bonusTotal,
    })
  }

  // Bonus points bank permanently toward the Order of Ferret total regardless of
  // whether that week's Stableford score ends up being one of the counting rounds.
  rows.sort((a, b) => b.total - a.total || b.stableford_total - a.stableford_total)
  rows.forEach((r, i) => { r.rank = i + 1 })

  return rows
}
