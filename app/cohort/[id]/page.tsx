import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { getCohortLeaderboard } from '@/lib/cohort-scoring'
import { CohortLeaderboardTable } from '@/components/CohortLeaderboardTable'
import { AdminButton } from '@/components/AdminButton'
import type { CohortLeaderboardRow } from '@/lib/cohort-scoring'
import type { Cohort } from '@/types'

export const dynamic = 'force-dynamic'

export interface CohortWeek {
  id: string
  week_number: number
  local_week_number: number
  course_name: string
  date: string
}

export type WeeklyScoreMap = Record<
  string,
  Record<string, { stableford_score: number; has_ctp: boolean; has_ld: boolean }>
>

export type BonusDetail = { ctp: number[]; ld: number[]; top10: number[] }
export type BonusDetailMap = Record<string, BonusDetail>

export default async function CohortPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: cohortId } = await params
  const db = createServiceClient()

  const [{ data: cohort }, rows] = await Promise.all([
    db.from('cohorts').select('*').eq('id', cohortId).single(),
    getCohortLeaderboard(cohortId).catch(() => [] as CohortLeaderboardRow[]),
  ])

  if (!cohort) notFound()
  if (cohort.status === 'active') redirect('/')

  const { data: weeksRaw } = await db
    .from('weeks')
    .select('id, week_number, course_name, date')
    .eq('cohort_id', cohortId)
    .order('week_number')

  const weeks: CohortWeek[] = (weeksRaw ?? []).map((w, i) => ({
    ...w,
    local_week_number: i + 1,
  }))

  const weekIds = weeks.map((w) => w.id)
  const weekIdToLocal = new Map(weeks.map((w) => [w.id, w.local_week_number]))

  const [{ data: resultsRaw }, { data: contestsRaw }, { data: bonusRaw }] =
    weekIds.length > 0
      ? await Promise.all([
          db
            .from('results')
            .select('week_id, player_id, stableford_score, position')
            .in('week_id', weekIds),
          db
            .from('side_contests')
            .select('week_id, player_id, contest')
            .in('week_id', weekIds),
          db
            .from('bonus_points')
            .select('player_id, bonus_type, week_id')
            .eq('cohort_id', cohortId),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }]

  // Next upcoming week (exists in weeks table but has no results)
  const weeksWithResults = new Set((resultsRaw ?? []).map((r) => r.week_id))
  const nextWeek = weeks.find((w) => !weeksWithResults.has(w.id)) ?? null

  // Build weekly score map
  const weeklyScoreMap: WeeklyScoreMap = {}
  for (const r of resultsRaw ?? []) {
    if (!weeklyScoreMap[r.player_id]) weeklyScoreMap[r.player_id] = {}
    weeklyScoreMap[r.player_id][r.week_id] = {
      stableford_score: r.stableford_score,
      has_ctp: false,
      has_ld: false,
    }
  }
  for (const c of contestsRaw ?? []) {
    const entry = weeklyScoreMap[c.player_id]?.[c.week_id]
    if (entry) {
      if (c.contest === 'ctp') entry.has_ctp = true
      if (c.contest === 'ld') entry.has_ld = true
    }
  }

  // Build bonus detail map (local week numbers per bonus type)
  const bonusDetailMap: BonusDetailMap = {}
  for (const b of bonusRaw ?? []) {
    const localWk = weekIdToLocal.get(b.week_id)
    if (localWk === undefined) continue
    if (!bonusDetailMap[b.player_id]) {
      bonusDetailMap[b.player_id] = { ctp: [], ld: [], top10: [] }
    }
    bonusDetailMap[b.player_id][b.bonus_type as keyof BonusDetail].push(localWk)
  }

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-gray-900">
      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        {/* Site header — mirrors main page */}
        <div className="mb-8">
          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            <div className="flex justify-end gap-2">
              <a href="/rules" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Rules</a>
              <AdminButton />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-center items-center">
                <Image src="/hamster-logo.jpg" alt="The Hamster Cage" height={80} width={80} className="h-20 w-auto" style={{ width: 'auto' }} priority loading="eager" />
              </div>
              <div className="flex flex-col justify-center items-center">
                <span className="text-[10px] text-[#9ca3af] mb-1">Sponsored by</span>
                <Image src="/sponsor-lochwild.jpg" alt="Loch Wild" height={60} width={180} className="h-[60px] w-auto" style={{ width: 'auto' }} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-amber-500">The Hamster Cage</h1>
              <p className="text-gray-600 mt-1">Order of Ferret Leaderboard 2026</p>
              <p className="text-gray-400 text-sm mt-0.5">Five Irons Golf Dubai</p>
            </div>
          </div>
          {/* Desktop */}
          <div className="hidden sm:block relative sm:min-h-[140px]">
            <div className="flex absolute inset-0 items-center justify-center pointer-events-none">
              <Image src="/hamster-logo.jpg" alt="The Hamster Cage" height={140} width={140} className="h-[140px] w-auto" style={{ width: 'auto' }} priority loading="eager" />
            </div>
            <div className="flex items-start justify-between relative z-10">
              <div>
                <h1 className="text-3xl font-bold text-amber-500">The Hamster Cage</h1>
                <p className="text-gray-600 mt-1">Order of Ferret Leaderboard 2026</p>
                <p className="text-gray-400 text-sm mt-0.5">Five Irons Golf Dubai</p>
              </div>
              <div className="flex flex-col items-end mt-1 ml-4 shrink-0">
                <div className="flex items-center gap-2">
                  <a href="/rules" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Rules</a>
                  <AdminButton />
                </div>
                <div className="flex flex-col items-end mt-8">
                  <span className="text-xs text-[#9ca3af]">Sponsored by</span>
                  <Image src="/sponsor-lochwild.jpg" alt="Loch Wild" height={120} width={360} className="h-[120px] w-auto mt-0.5" style={{ width: 'auto' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back link */}
        <a href="/" className="inline-flex items-center gap-1 text-sm text-amber-500 hover:text-amber-600 mb-6">
          ← Back to Leaderboard
        </a>

        {nextWeek && (
          <p className="text-xs text-amber-500 mb-4">Next Week: {nextWeek.course_name}</p>
        )}

        <CohortLeaderboardTable
          cohort={cohort as Cohort}
          rows={rows}
          weeks={weeks}
          weeklyScoreMap={weeklyScoreMap}
          bonusDetailMap={bonusDetailMap}
        />
      </div>
    </main>
  )
}
