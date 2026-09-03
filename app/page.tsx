import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase'
import { getCohortLeaderboard, type CohortLeaderboardRow } from '@/lib/cohort-scoring'
import { findNextWeek } from '@/lib/next-week'
import { determineWeeklyWinner, determineWoodenSpoon } from '@/lib/weekly-winner'
import { CohortLeaderboardTable } from '@/components/CohortLeaderboardTable'
import { AdminButton } from '@/components/AdminButton'
import type { Cohort } from '@/types'
import type { CohortWeek, WeeklyScoreMap, BonusDetailMap, BonusDetail } from '@/app/cohort/[id]/page'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const db = createServiceClient()

  // Round 1: shape data needed to scope result fetches
  const [{ data: cohortsRaw }, { data: weeksRaw }] = await Promise.all([
    db.from('cohorts').select('*').order('created_at'),
    db.from('weeks').select('id, week_number, course_name, date, is_bye, cohort_id').order('week_number'),
  ])

  const cohortsAll: Cohort[] = (cohortsRaw ?? []) as Cohort[]
  const cohorts: Cohort[] = [
    ...cohortsAll.filter((c) => c.status === 'active'),
    ...cohortsAll.filter((c) => c.status !== 'active'),
  ]
  const activeCohort = cohortsAll.find((c) => c.status === 'active') ?? null

  const activeCohortWeeks: CohortWeek[] = activeCohort
    ? (weeksRaw ?? [])
        .filter((w) => w.cohort_id === activeCohort.id)
        .sort((a, b) => a.week_number - b.week_number)
        .map((w, i) => ({ ...w, local_week_number: i + 1 }))
    : []

  const weekIds = activeCohortWeeks.map((w) => w.id)
  const weekIdToLocal = new Map(activeCohortWeeks.map((w) => [w.id, w.local_week_number]))

  // Round 2: leaderboard + grid data, scoped to active cohort
  let rows: CohortLeaderboardRow[] = []
  let resultsRaw: {
    week_id: string
    player_id: string
    stableford_score: number
    score_vs_par: number | null
    position: number | null
    ineligible_for_bonus: boolean
  }[] = []
  let contestsRaw: { week_id: string; player_id: string; contest: string }[] = []
  let bonusRaw: { player_id: string; bonus_type: string; week_id: string }[] = []

  if (activeCohort) {
    const [leaderboard, results, contests, bonus] = await Promise.all([
      getCohortLeaderboard(activeCohort.id),
      weekIds.length > 0
        ? db
            .from('results')
            .select('week_id, player_id, stableford_score, score_vs_par, position, ineligible_for_bonus')
            .in('week_id', weekIds)
        : Promise.resolve({ data: [] as typeof resultsRaw }),
      weekIds.length > 0
        ? db.from('side_contests').select('week_id, player_id, contest').in('week_id', weekIds)
        : Promise.resolve({ data: [] as typeof contestsRaw }),
      db.from('bonus_points').select('player_id, bonus_type, week_id').eq('cohort_id', activeCohort.id),
    ])
    rows = leaderboard
    resultsRaw = results.data ?? []
    contestsRaw = contests.data ?? []
    bonusRaw = bonus.data ?? []
  }

  // Weekly score map
  const weeklyScoreMap: WeeklyScoreMap = {}
  for (const r of resultsRaw) {
    if (!weeklyScoreMap[r.player_id]) weeklyScoreMap[r.player_id] = {}
    weeklyScoreMap[r.player_id][r.week_id] = {
      stableford_score: r.stableford_score,
      has_ctp: false,
      has_ld: false,
      has_winner: false,
      has_wooden_spoon: false,
    }
  }
  for (const c of contestsRaw) {
    const entry = weeklyScoreMap[c.player_id]?.[c.week_id]
    if (entry) {
      if (c.contest === 'ctp') entry.has_ctp = true
      if (c.contest === 'ld') entry.has_ld = true
    }
  }

  // Weekly winner / Wooden Spoon per week — Max 40 rule (see lib/weekly-winner.ts).
  const resultsByWeek = new Map<string, typeof resultsRaw>()
  for (const r of resultsRaw) {
    const arr = resultsByWeek.get(r.week_id) ?? []
    arr.push(r)
    resultsByWeek.set(r.week_id, arr)
  }
  for (const [wId, weekResults] of resultsByWeek) {
    const forRules = weekResults.map((r) => ({
      player_id: r.player_id,
      stableford_score: r.stableford_score,
      score_vs_par: r.score_vs_par,
      position: r.position,
      ineligible_for_bonus: r.ineligible_for_bonus ?? false,
    }))
    const winner = determineWeeklyWinner(forRules)
    const spoon = determineWoodenSpoon(forRules)
    for (const pid of winner.winnerIds) {
      const entry = weeklyScoreMap[pid]?.[wId]
      if (entry) entry.has_winner = true
    }
    for (const pid of spoon.spoonIds) {
      const entry = weeklyScoreMap[pid]?.[wId]
      if (entry) entry.has_wooden_spoon = true
    }
  }

  // Next upcoming week (no results yet, and not a bye)
  const weeksWithResults = new Set(resultsRaw.map((r) => r.week_id))
  const nextWeek = findNextWeek(activeCohortWeeks, weeksWithResults)

  // Bonus detail map
  const bonusDetailMap: BonusDetailMap = {}
  for (const b of bonusRaw) {
    const localWk = weekIdToLocal.get(b.week_id)
    if (localWk === undefined) continue
    if (!bonusDetailMap[b.player_id]) bonusDetailMap[b.player_id] = { ctp: [], ld: [], top10: [], winner: [] }
    bonusDetailMap[b.player_id][b.bonus_type as keyof BonusDetail].push(localWk)
  }

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-gray-900">
      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        {/* Site header */}
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

        {/* Cohort pills — active is non-clickable, closed navigate to /cohort/[id] */}
        {cohorts.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {cohorts.map((c) =>
              c.status === 'active' ? (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-700 cursor-default select-none"
                >
                  {c.name}
                  <span className="text-xs font-semibold text-green-600">Active</span>
                </span>
              ) : (
                <a
                  key={c.id}
                  href={`/cohort/${c.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-700 hover:border-amber-400 hover:text-amber-600 transition-colors"
                >
                  {c.name}
                  <span className="text-xs text-gray-400">Closed</span>
                </a>
              )
            )}
          </div>
        )}

        {nextWeek && (
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-lg bg-[#fef3c7] border border-[#f59e0b]">
            <MapPin size={14} className="text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-amber-600">Next Week&apos;s Course:</span>
            <span className="text-sm font-medium text-[#111111]">{nextWeek.course_name}</span>
          </div>
        )}

        {activeCohort ? (
          <CohortLeaderboardTable
            cohort={activeCohort}
            rows={rows}
            weeks={activeCohortWeeks}
            weeklyScoreMap={weeklyScoreMap}
            bonusDetailMap={bonusDetailMap}
            showHeader={false}
          />
        ) : (
          <p className="text-gray-500 text-sm">No active cohort. Select a cohort above to view its leaderboard.</p>
        )}
      </div>
    </main>
  )
}
