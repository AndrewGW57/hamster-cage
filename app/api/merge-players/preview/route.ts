import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'
import { getCohortLeaderboard, type CohortLeaderboardRow } from '@/lib/cohort-scoring'
import type { MergeCohortStanding, MergeCohortTotals, MergePreview } from '@/types'

function standing(row: CohortLeaderboardRow | undefined): MergeCohortStanding | null {
  if (!row) return null
  return {
    rank: row.rank,
    rounds_played: row.rounds_played,
    stableford_total: row.stableford_total,
    bonus_total: row.bonus_total,
    total: row.total,
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  try {
    const { player_a, player_b } = await req.json()
    if (!player_a || !player_b) {
      return NextResponse.json({ error: 'Missing player_a or player_b' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data, error } = await db.rpc('merge_players', {
      p_a: player_a,
      p_b: player_b,
      p_final_name: null,
      p_dry_run: true,
      p_admin: admin.username,
    })
    if (error) {
      // P0001 = raise exception inside merge_players
      return NextResponse.json({ error: error.message }, { status: error.code === 'P0001' ? 409 : 500 })
    }
    const preview = data as MergePreview

    // Cohort totals as they compute today, for every cohort either player has a result in
    const ids = [preview.survivor.id, preview.removed.id]
    const { data: results, error: resultsErr } = await db
      .from('results')
      .select('week_id')
      .in('player_id', ids)
    if (resultsErr) throw new Error(resultsErr.message)

    const weekIds = [...new Set((results ?? []).map((r: { week_id: string }) => r.week_id))]
    let cohortTotals: MergeCohortTotals[] = []
    if (weekIds.length > 0) {
      const { data: weeks, error: weeksErr } = await db
        .from('weeks')
        .select('cohort_id')
        .in('id', weekIds)
        .not('cohort_id', 'is', null)
      if (weeksErr) throw new Error(weeksErr.message)

      const cohortIds = [...new Set((weeks ?? []).map((w: { cohort_id: string }) => w.cohort_id))]
      const { data: cohorts, error: cohortsErr } = await db
        .from('cohorts')
        .select('id, name')
        .in('id', cohortIds)
        .order('created_at')
      if (cohortsErr) throw new Error(cohortsErr.message)

      cohortTotals = await Promise.all(
        (cohorts ?? []).map(async (c: { id: string; name: string }) => {
          const rows = await getCohortLeaderboard(c.id)
          return {
            cohort_id: c.id,
            cohort_name: c.name,
            survivor: standing(rows.find((r) => r.player_id === preview.survivor.id)),
            removed: standing(rows.find((r) => r.player_id === preview.removed.id)),
          }
        })
      )
    }

    return NextResponse.json({ preview, cohort_totals: cohortTotals })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
