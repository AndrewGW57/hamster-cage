import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'
import { isCurveballWeek, weeklyWinnerBonusPoints } from '@/lib/rules'
import { determineWeeklyWinner } from '@/lib/weekly-winner'
import { normalizeCountryCode } from '@/lib/flag-codes.mjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConfirmWeekPayload } from '@/types'

type FlaggedEntry = { matched_player_id: string | null; country_code?: string | null }

// Fill players.country_code from flags read off the screenshots. One code per player across
// all three lists; players whose rows disagree are skipped. The null guard is inside the
// update, so a code that is already set is never overwritten. Never throws: a flag problem
// must not fail the confirm.
async function applyDetectedFlags(db: SupabaseClient, entries: FlaggedEntry[]): Promise<number> {
  try {
    const codesByPlayer = new Map<string, Set<string>>()
    for (const e of entries) {
      const code = normalizeCountryCode(e.country_code)
      if (!e.matched_player_id || !code) continue
      if (!codesByPlayer.has(e.matched_player_id)) codesByPlayer.set(e.matched_player_id, new Set())
      codesByPlayer.get(e.matched_player_id)!.add(code)
    }

    const idsByCode = new Map<string, string[]>()
    for (const [playerId, codes] of codesByPlayer) {
      if (codes.size !== 1) continue
      const [code] = codes
      idsByCode.set(code, [...(idsByCode.get(code) ?? []), playerId])
    }

    const outcomes = await Promise.allSettled(
      [...idsByCode].map(([code, ids]) =>
        db.from('players').update({ country_code: code }).in('id', ids).is('country_code', null).select('id')
      )
    )
    let applied = 0
    for (const o of outcomes) {
      if (o.status === 'rejected') console.error('[confirm-week] flag update failed', o.reason)
      else if (o.value.error) console.error('[confirm-week] flag update failed', o.value.error.message)
      else applied += o.value.data?.length ?? 0
    }
    return applied
  } catch (err) {
    console.error('[confirm-week] flag application failed', err)
    return 0
  }
}

// parsed_json keeps exactly the shape it had before flags were parsed
function withoutCountryCode<T extends { country_code?: string | null }>(rows: T[]): Omit<T, 'country_code'>[] {
  return rows.map(({ country_code: _flag, ...rest }) => rest)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const payload: ConfirmWeekPayload = await req.json()
    const { week_id, leaderboard, ctp, ld, upload_ids, ineligible_players, dnf_players, manual_winner_player_id, gross_scores } = payload
    const ineligibleSet = new Set(ineligible_players ?? [])
    const dnfSet = new Set(dnf_players ?? [])
    // Gross strokes typed in on the review screen for 40+ players. Anything that isn't a
    // positive whole number is dropped, so it reads as missing rather than as a score.
    const grossMap = new Map<string, number>()
    for (const [pid, g] of Object.entries(gross_scores ?? {})) {
      if (typeof g === 'number' && Number.isInteger(g) && g > 0) grossMap.set(pid, g)
    }

    if (!week_id || !leaderboard?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = createServiceClient()

    // Fetch week for cohort_id + week_number (Curveball Weeks are weeks 3, 6, 9, 12 — see lib/rules.ts)
    // and date (which weekly-winner rule applies — see lib/weekly-winner.ts)
    const { data: weekRow } = await db.from('weeks').select('cohort_id, week_number, date').eq('id', week_id).maybeSingle()
    // The date picks the weekly-winner rule, so a missing week or date is refused outright,
    // never treated as pre-cutover.
    if (!weekRow || !weekRow.date) {
      return NextResponse.json({ error: 'Week not found or has no date — reload the admin page and try again.' }, { status: 400 })
    }
    const cohortId: string | null = weekRow.cohort_id ?? null
    const isCurveball = isCurveballWeek(weekRow.week_number)
    const weekDate: string = weekRow.date

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
          gross_score: isDnf ? null : (grossMap.get(e.matched_player_id!) ?? null),
        }
      })

    // Weekly winner — decided before any write, so a week that still needs gross
    // scores is refused whole instead of being half-saved. See lib/weekly-winner.ts.
    const winner = determineWeeklyWinner(resultRows, weekDate, manual_winner_player_id)
    if (winner.needsGross) {
      return NextResponse.json(
        { error: 'Two or more players scored 40+ this week. Enter a gross score for each of them before confirming.' },
        { status: 400 }
      )
    }

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

      // Weekly winner bonus (winner computed above). A tie that neither the rule nor an
      // admin's manual pick resolved credits every tied player rather than picking one
      // arbitrarily. See lib/weekly-winner.ts for both rule versions.
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
        ? db.from('uploads').update({ parsed_json: withoutCountryCode(ctp) }).eq('week_id', week_id).eq('image_type', 'ctp')
        : Promise.resolve(),
      ld.length > 0
        ? db.from('uploads').update({ parsed_json: withoutCountryCode(ld) }).eq('week_id', week_id).eq('image_type', 'ld')
        : Promise.resolve(),
    ])

    // Country flags last, after every scoring write has succeeded
    const flagsApplied = await applyDetectedFlags(db, [...leaderboard, ...ctp, ...ld])

    return NextResponse.json({ success: true, flags_applied: flagsApplied })
  } catch (err) {
    console.error('[confirm-week]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
