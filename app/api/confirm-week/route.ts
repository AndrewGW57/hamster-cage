import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isCurveballWeek, weeklyWinnerBonusPoints } from '@/lib/rules'
import { determineWeeklyWinner } from '@/lib/weekly-winner'
import type { ConfirmWeekPayload } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const payload: ConfirmWeekPayload = await req.json()
    const { week_id, leaderboard, ctp, ld, upload_ids, ineligible_players, dnf_players, manual_winner_player_id } = payload
    const ineligibleSet = new Set(ineligible_players ?? [])
    const dnfSet = new Set(dnf_players ?? [])

    if (!week_id || !leaderboard?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = createServiceClient()

    // Fetch week for cohort_id + week_number (Curveball Weeks are weeks 3, 6, 9, 12 — see lib/rules.ts)
    const { data: weekRow } = await db.from('weeks').select('cohort_id, week_number').eq('id', week_id).single()
    const cohortId: string | null = weekRow?.cohort_id ?? null
    const isCurveball = weekRow ? isCurveballWeek(weekRow.week_number) : false

    // Upsert results
    const resultRows = leaderboard
      .filter((e) => e.matched_player_id)
      .map((e) => {
        const isDnf = dnfSet.has(e.matched_player_id ?? '')
        return {
          week_id,
          player_id: e.matched_player_id!,
          stableford_score: isDnf ? 0 : e.stableford_score,
          score_vs_par: isDnf ? null : e.score_vs_par,
          position: isDnf ? null : (e.position ?? null),
          ineligible_for_bonus: isDnf || ineligibleSet.has(e.matched_player_id ?? ''),
        }
      })

    const { error: resultsError } = await db
      .from('results')
      .upsert(resultRows, { onConflict: 'week_id,player_id' })

    if (resultsError) throw new Error(`Results upsert failed: ${resultsError.message}`)

    // Delete existing side_contests for this week before inserting fresh
    await db.from('side_contests').delete().eq('week_id', week_id)

    // Insert CTP — first eligible player (skipping ineligible by position order)
    const ctpWinner = ctp.find((e) => e.matched_player_id && !ineligibleSet.has(e.matched_player_id ?? ''))
    if (ctpWinner) {
      const { error } = await db.from('side_contests').insert({
        week_id,
        player_id: ctpWinner.matched_player_id!,
        contest: 'ctp',
        hole: ctpWinner.hole,
        measurement: ctpWinner.distance,
      })
      if (error) throw new Error(`CTP insert failed: ${error.message}`)
    }

    // Insert LD — first eligible player (skipping ineligible by position order)
    const ldWinner = ld.find((e) => e.matched_player_id && !ineligibleSet.has(e.matched_player_id ?? ''))
    if (ldWinner) {
      const { error } = await db.from('side_contests').insert({
        week_id,
        player_id: ldWinner.matched_player_id!,
        contest: 'ld',
        hole: ldWinner.hole,
        measurement: ldWinner.distance_yards,
      })
      if (error) throw new Error(`LD insert failed: ${error.message}`)
    }

    // Bonus points — only if the week belongs to a cohort
    if (cohortId) {
      await db.from('bonus_points').delete().eq('week_id', week_id)

      const bonusRows: Array<{
        week_id: string
        player_id: string
        cohort_id: string
        bonus_type: 'ctp' | 'ld' | 'top10' | 'winner'
        points: number
      }> = []

      if (ctpWinner) {
        bonusRows.push({ week_id, player_id: ctpWinner.matched_player_id!, cohort_id: cohortId, bonus_type: 'ctp', points: 2 })
      }
      if (ldWinner) {
        bonusRows.push({ week_id, player_id: ldWinner.matched_player_id!, cohort_id: cohortId, bonus_type: 'ld', points: 2 })
      }
      const eligibleEntries = leaderboard
        .filter(e =>
          e.matched_player_id &&
          !dnfSet.has(e.matched_player_id) &&
          !ineligibleSet.has(e.matched_player_id) &&
          e.position != null
        )
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
      for (const entry of eligibleEntries.slice(0, 10)) {
        bonusRows.push({ week_id, player_id: entry.matched_player_id!, cohort_id: cohortId, bonus_type: 'top10', points: 1 })
      }

      // Weekly winner — Max 40 rule: highest score capped at 40, ties at 40+ broken by
      // lowest gross (vs-par). A tie that survives that (or any tie below 40, which the
      // rule sends straight to countback) can't be resolved without hole-by-hole scores
      // this app doesn't have — in that rare case every tied player gets credited rather
      // than picking one arbitrarily. See lib/weekly-winner.ts for the full rationale.
      const winner = determineWeeklyWinner(resultRows, manual_winner_player_id)
      const winnerPoints = weeklyWinnerBonusPoints(isCurveball)
      for (const playerId of winner.winnerIds) {
        bonusRows.push({ week_id, player_id: playerId, cohort_id: cohortId, bonus_type: 'winner', points: winnerPoints })
      }

      if (bonusRows.length > 0) {
        const { error: bonusErr } = await db.from('bonus_points').insert(bonusRows)
        if (bonusErr) throw new Error(`Bonus points insert failed: ${bonusErr.message}`)
      }
    }

    // Mark uploads as confirmed and save full parsed lists for CTP/LD
    await Promise.all([
      upload_ids?.length
        ? db.from('uploads').update({ confirmed: true }).in('id', upload_ids)
        : Promise.resolve(),
      ctp.length > 0
        ? db.from('uploads').update({ parsed_json: ctp }).eq('week_id', week_id).eq('image_type', 'ctp')
        : Promise.resolve(),
      ld.length > 0
        ? db.from('uploads').update({ parsed_json: ld }).eq('week_id', week_id).eq('image_type', 'ld')
        : Promise.resolve(),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[confirm-week]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
