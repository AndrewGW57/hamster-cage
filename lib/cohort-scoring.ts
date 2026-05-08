import { createServiceClient } from '@/lib/supabase'

export interface BonusBreakdown {
  ctp: number
  ld: number
  top10: number
}

export interface CohortLeaderboardRow {
  rank: number
  player_id: string
  display_name: string
  country_code: string | null
  rounds_played: number
  best_scores: number[]
  bonus_breakdown: BonusBreakdown
  stableford_total: number
  bonus_total: number
  total: number
}

export async function getCohortLeaderboard(cohort_id: string): Promise<CohortLeaderboardRow[]> {
  const db = createServiceClient()

  const [
    { data: cohort, error: cohortErr },
    { data: weeks, error: weeksErr },
  ] = await Promise.all([
    db.from('cohorts').select('scores_to_count').eq('id', cohort_id).single(),
    db.from('weeks').select('id').eq('cohort_id', cohort_id),
  ])

  if (cohortErr || !cohort) throw new Error(`Cohort fetch failed: ${cohortErr?.message}`)
  if (weeksErr) throw new Error(`Weeks fetch failed: ${weeksErr?.message}`)

  const weekIds = (weeks ?? []).map((w: { id: string }) => w.id)
  if (weekIds.length === 0) return []

  const [
    { data: results, error: resultsErr },
    { data: players, error: playersErr },
    { data: bonusRows, error: bonusErr },
  ] = await Promise.all([
    db.from('results').select('player_id, stableford_score').in('week_id', weekIds),
    db.from('players').select('id, display_name, country_code'),
    db.from('bonus_points').select('player_id, bonus_type, points').eq('cohort_id', cohort_id),
  ])

  if (resultsErr) throw new Error(`Results fetch failed: ${resultsErr?.message}`)
  if (playersErr) throw new Error(`Players fetch failed: ${playersErr?.message}`)
  if (bonusErr) throw new Error(`Bonus points fetch failed: ${bonusErr?.message}`)

  const playerMap = new Map(
    (players ?? []).map((p: { id: string; display_name: string; country_code: string | null }) => [p.id, p])
  )

  const scoresByPlayer = new Map<string, number[]>()
  for (const r of results ?? []) {
    const arr = scoresByPlayer.get(r.player_id) ?? []
    arr.push(r.stableford_score)
    scoresByPlayer.set(r.player_id, arr)
  }

  const bonusByPlayer = new Map<string, BonusBreakdown>()
  for (const b of bonusRows ?? []) {
    const bd = bonusByPlayer.get(b.player_id) ?? { ctp: 0, ld: 0, top10: 0 }
    bd[b.bonus_type as keyof BonusBreakdown] += b.points
    bonusByPlayer.set(b.player_id, bd)
  }

  const allPlayerIds = new Set([...scoresByPlayer.keys(), ...bonusByPlayer.keys()])

  const rows: CohortLeaderboardRow[] = []
  for (const playerId of allPlayerIds) {
    const player = playerMap.get(playerId)
    if (!player) continue

    const scores = (scoresByPlayer.get(playerId) ?? []).sort((a, b) => b - a)
    const bestScores = scores.slice(0, cohort.scores_to_count)
    const stablefordTotal = bestScores.reduce((s, n) => s + n, 0)
    const bonus = bonusByPlayer.get(playerId) ?? { ctp: 0, ld: 0, top10: 0 }
    const bonusTotal = bonus.ctp + bonus.ld + bonus.top10

    rows.push({
      rank: 0,
      player_id: playerId,
      display_name: player.display_name,
      country_code: player.country_code,
      rounds_played: scores.length,
      best_scores: bestScores,
      bonus_breakdown: bonus,
      stableford_total: stablefordTotal,
      bonus_total: bonusTotal,
      total: stablefordTotal + bonusTotal,
    })
  }

  rows.sort((a, b) => b.total - a.total || b.stableford_total - a.stableford_total)
  rows.forEach((r, i) => { r.rank = i + 1 })

  return rows
}
