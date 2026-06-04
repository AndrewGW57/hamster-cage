import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { WeeklyDetail, MatchedCTPEntry, MatchedLDEntry } from '@/types'

export async function GET(req: NextRequest) {
  const week_id = req.nextUrl.searchParams.get('week_id')
  if (!week_id) return NextResponse.json({ error: 'Missing week_id' }, { status: 400 })

  const db = createServiceClient()

  const [
    { data: week },
    { data: results },
    { data: contests },
    { data: players },
    { data: uploads },
    { data: bonusRows },
  ] = await Promise.all([
    db.from('weeks').select('*').eq('id', week_id).single(),
    db
      .from('results')
      .select('*, players(display_name, country_code)')
      .eq('week_id', week_id)
      .order('position'),
    db.from('side_contests').select('*').eq('week_id', week_id),
    db.from('players').select('id, display_name'),
    db
      .from('uploads')
      .select('image_type, parsed_json')
      .eq('week_id', week_id)
      .eq('confirmed', true)
      .in('image_type', ['ctp', 'ld']),
    db.from('bonus_points').select('player_id, points').eq('week_id', week_id),
  ])

  if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 })

  const bonusMap = new Map<string, number>()
  for (const b of bonusRows ?? []) {
    bonusMap.set(b.player_id, (bonusMap.get(b.player_id) ?? 0) + b.points)
  }

  // Course chooser: highest-scoring player (stableford desc) where ineligible_for_bonus = false
  const chooserRow = [...(results ?? [])]
    .sort((a: any, b: any) => b.stableford_score - a.stableford_score)
    .find((r: any) => !(r.ineligible_for_bonus ?? false))
  const courseChooser = chooserRow
    ? ((chooserRow.players as { display_name: string })?.display_name ?? null)
    : null

  const playerMap: Record<string, string> = Object.fromEntries(
    (players ?? []).map((p) => [p.id, p.display_name])
  )

  const ctpContest = (contests ?? []).find((c: any) => c.contest === 'ctp') ?? null
  const ldContest = (contests ?? []).find((c: any) => c.contest === 'ld') ?? null

  const ctpUpload = (uploads ?? []).find((u) => u.image_type === 'ctp')
  const ldUpload = (uploads ?? []).find((u) => u.image_type === 'ld')

  const ctpRaw = ctpUpload?.parsed_json as MatchedCTPEntry[] | null | undefined
  const ldRaw = ldUpload?.parsed_json as MatchedLDEntry[] | null | undefined

  const detail: WeeklyDetail = {
    week,
    results: (results ?? []).map((r) => ({
      player_id: r.player_id,
      display_name: (r.players as { display_name: string })?.display_name ?? '',
      country_code: (r.players as { country_code: string | null })?.country_code ?? null,
      position: r.position,
      stableford_score: r.stableford_score,
      score_vs_par: r.score_vs_par,
      ineligible_for_bonus: r.ineligible_for_bonus ?? false,
      bonus_points: bonusMap.get(r.player_id) ?? 0,
    })),
    ctp: ctpContest
      ? {
          player_name: playerMap[ctpContest.player_id] ?? '',
          hole: ctpContest.hole,
          measurement: ctpContest.measurement,
        }
      : null,
    ld: ldContest
      ? {
          player_name: playerMap[ldContest.player_id] ?? '',
          hole: ldContest.hole,
          measurement: ldContest.measurement,
        }
      : null,
    ctp_full_list: ctpRaw?.length
      ? ctpRaw
          .sort((a, b) => a.position - b.position)
          .map((e) => ({
            position: e.position,
            name: e.matched_name ?? e.name,
            distance: e.distance,
          }))
      : null,
    ld_full_list: ldRaw?.length
      ? ldRaw
          .sort((a, b) => a.position - b.position)
          .map((e) => ({
            position: e.position,
            name: e.matched_name ?? e.name,
            distance_yards: e.distance_yards,
          }))
      : null,
    course_chooser: courseChooser,
  }

  return NextResponse.json(detail)
}
