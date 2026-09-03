'use client'

import { useState } from 'react'
import { PlayerFlag } from './PlayerFlag'
import { WeeklyDetailModal } from './WeeklyDetailModal'
import { countPlayableWeeks } from '@/lib/next-week'
import { isCurveballWeek } from '@/lib/rules'
import type { CohortLeaderboardRow } from '@/lib/cohort-scoring'
import type { Cohort, WeeklyDetail } from '@/types'
import type { CohortWeek, WeeklyScoreMap, BonusDetailMap } from '@/app/cohort/[id]/page'

interface Props {
  cohort: Cohort
  rows: CohortLeaderboardRow[]
  weeks: CohortWeek[]
  weeklyScoreMap: WeeklyScoreMap
  bonusDetailMap: BonusDetailMap
  showHeader?: boolean
}

interface Band {
  label: string
  start: number
}

interface Slot {
  localWeekNumber: number
  week: CohortWeek | null
}

function buildBands(weeks: CohortWeek[], n: number): Band[] {
  if (weeks.length === 0) return []
  const starts = new Set<number>()
  for (const w of weeks) {
    starts.add(Math.floor((w.local_week_number - 1) / n) * n + 1)
  }
  const bands: Band[] = Array.from(starts)
    .sort((a, b) => a - b)
    .map((start) => ({ label: `Wks ${start}–${start + n - 1}`, start }))
  if (bands.length > 1) bands.push({ label: 'All', start: -1 })
  return bands
}

function getSlots(activeStart: number, weeks: CohortWeek[], n: number): Slot[] {
  if (activeStart === -1) {
    return [...weeks]
      .sort((a, b) => a.local_week_number - b.local_week_number)
      .map((w) => ({ localWeekNumber: w.local_week_number, week: w }))
  }
  return Array.from({ length: n }, (_, i) => {
    const localWeekNumber = activeStart + i
    const week = weeks.find((w) => w.local_week_number === localWeekNumber) ?? null
    return { localWeekNumber, week }
  })
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl leading-none">🥇</span>
  if (rank === 2) return <span className="text-2xl leading-none">🥈</span>
  if (rank === 3) return <span className="text-2xl leading-none">🥉</span>
  return <span className="text-[#111111] font-mono tabular-nums">{rank}</span>
}

function rowBg(rank: number) {
  if (rank === 1) return 'bg-[#fef9c3]'
  if (rank === 2) return 'bg-[#f1f5f9]'
  if (rank === 3) return 'bg-[#fef3e2]'
  return ''
}


function TabButtons({
  bands,
  activeStart,
  onSelect,
}: {
  bands: Band[]
  activeStart: number
  onSelect: (start: number) => void
}) {
  return (
    <div className="flex border-b border-gray-200">
      {bands.map((band) => (
        <button
          key={band.start}
          onClick={() => onSelect(band.start)}
          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors -mb-px border-b-2 ${
            activeStart === band.start
              ? 'border-amber-400 text-amber-600'
              : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
          }`}
        >
          {band.label}
        </button>
      ))}
    </div>
  )
}

// Rank, Flag, Player, Rnds, Best Scores, Bonus, Total = 7 fixed cols (desktop)
// Mobile hides Best Scores → 6 fixed cols
const FIXED_COLS = 7
const MOBILE_FIXED_COLS = 7

export function CohortLeaderboardTable({
  cohort,
  rows,
  weeks,
  weeklyScoreMap,
  showHeader = true,
}: Props) {
  const [modalDetail, setModalDetail] = useState<WeeklyDetail | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  async function handleWeekClick(weekId: string) {
    setModalLoading(true)
    setModalDetail(null)
    const res = await fetch(`/api/weekly-detail?week_id=${weekId}`)
    if (res.ok) setModalDetail(await res.json())
    setModalLoading(false)
  }

  const weeksPerTab = cohort.weeks_per_tab ?? 5
  const bands = buildBands(weeks, weeksPerTab)
  const lastRegular = [...bands].filter((b) => b.start !== -1).at(-1)
  const [activeStart, setActiveStart] = useState(lastRegular?.start ?? 1)

  const slots = getSlots(activeStart, weeks, weeksPerTab)
  const totalCols = FIXED_COLS + slots.length

  const minRounds = cohort.min_rounds_to_rank ?? 1
  const ranked = rows.filter((r) => r.rounds_played >= minRounds)
  const unranked = rows.filter((r) => r.rounds_played < minRounds)

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        {showHeader && (
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-amber-500">{cohort.name}</h1>
            {cohort.status === 'active' ? (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                Active
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-200 text-gray-600">
                Closed
              </span>
            )}
          </div>
        )}
        <p className="text-sm text-gray-500">
          Best {cohort.scores_to_count} of {countPlayableWeeks(weeks)} rounds · Bonus points included
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Tab row — desktop */}
            <tr className="hidden sm:table-row">
              <th colSpan={FIXED_COLS} className="p-0" />
              {bands.length > 0 && (
                <th colSpan={slots.length} className="p-0 align-bottom">
                  <TabButtons bands={bands} activeStart={activeStart} onSelect={setActiveStart} />
                </th>
              )}
            </tr>
            {/* Tab row — mobile */}
            <tr className="sm:hidden">
              <th colSpan={MOBILE_FIXED_COLS} className="p-0" />
              {bands.length > 0 && (
                <th colSpan={slots.length} className="p-0 align-bottom">
                  <TabButtons bands={bands} activeStart={activeStart} onSelect={setActiveStart} />
                </th>
              )}
            </tr>

            {/* Column headers */}
            <tr className="border-b border-gray-200 text-gray-500 text-left">
              <th className="py-3 px-2 w-12">Rank</th>
              <th className="py-3 px-2 w-6" />
              <th className="py-3 px-2 w-[180px] max-w-[180px]">Player</th>
              <th className="py-3 px-2 w-10 text-center font-mono whitespace-nowrap">Rnds</th>
              <th className="py-3 px-2 w-24 text-center font-mono whitespace-nowrap">
                <span className="sm:hidden">Best</span>
                <span className="hidden sm:inline">Best {cohort.scores_to_count}</span>
              </th>
              <th className="py-3 px-2 w-16 text-center font-mono whitespace-nowrap">Bonus</th>
              <th className="py-3 px-2 w-16 text-center font-mono whitespace-nowrap">Total</th>
              {slots.map((slot) => {
                const curveball = isCurveballWeek(slot.localWeekNumber)
                return (
                  <th
                    key={slot.localWeekNumber}
                    className={`py-3 px-1 w-10 sm:w-14 text-center font-mono whitespace-nowrap align-bottom ${
                      slot.week
                        ? 'cursor-pointer hover:text-amber-500 transition-colors'
                        : 'text-gray-300'
                    }`}
                    title={
                      slot.week
                        ? `${slot.week.course_name} · ${slot.week.date}${
                            slot.week.is_bye ? ' · Bye week — round voided for all players' : ''
                          }${curveball ? ' · Curveball Week' : ''}`
                        : curveball
                        ? 'Curveball Week'
                        : undefined
                    }
                    onClick={() => slot.week && handleWeekClick(slot.week.id)}
                  >
                    Wk {slot.localWeekNumber}
                    {curveball && <span className="ml-0.5">🎲</span>}
                    {slot.week?.is_bye && (
                      <span className="block mt-1 mx-auto px-1 py-0.5 text-[9px] font-sans font-semibold leading-none rounded bg-gray-200 text-gray-600 tracking-wide">
                        BYE
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {ranked.map((row, idx) => (
              <PlayerRows
                key={row.player_id}
                row={row}
                rank={idx + 1}
                slots={slots}
                weeklyScoreMap={weeklyScoreMap}
              />
            ))}

            {unranked.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={totalCols}
                    className="py-2 px-2 text-xs text-[#6b7280] border-t border-gray-200"
                  >
                    Unranked (fewer than {minRounds} round{minRounds !== 1 ? 's' : ''} played in this cohort)
                  </td>
                </tr>
                {unranked.map((row) => (
                  <PlayerRows
                    key={row.player_id}
                    row={row}
                    slots={slots}
                    weeklyScoreMap={weeklyScoreMap}
                  />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      {modalLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl px-6 py-4 text-sm text-gray-500 shadow-xl">Loading…</div>
        </div>
      )}
      {modalDetail && (
        <WeeklyDetailModal detail={modalDetail} onClose={() => setModalDetail(null)} />
      )}
    </div>
  )
}

function PlayerRows({
  row,
  rank,
  slots,
  weeklyScoreMap,
}: {
  row: CohortLeaderboardRow
  rank?: number
  slots: Slot[]
  weeklyScoreMap: WeeklyScoreMap
}) {
  const bg = rank ? rowBg(rank) : ''

  return (
    <>
      <tr className={`border-b border-gray-100 transition-colors hover:brightness-95 ${bg}`}>
        <td className="py-2.5 px-2 text-center">
          {rank ? (
            <RankBadge rank={rank} />
          ) : (
            <span className="text-[#9ca3af] font-mono">–</span>
          )}
        </td>
        <td className="py-2.5 px-2">
          <PlayerFlag code={row.country_code} />
        </td>
        <td className="py-2.5 px-2 text-[#111111] font-medium w-[180px] max-w-[180px] truncate">
          {row.display_name}
        </td>
        <td className="py-2.5 px-2 text-center font-mono text-[#111111]">{row.rounds_played}</td>
        <td className="py-2.5 px-2 text-center font-mono text-amber-600">
          {row.stableford_total || <span className="text-[#9ca3af]">–</span>}
          {row.no_curveball_score && row.counted_weeks > 0 && (
            <span
              className="block text-[9px] font-sans font-normal text-gray-400 leading-tight"
              title="No Curveball week (3, 6, 9 or 12) posted yet — counts one fewer round until you play one"
            >
              {row.counted_weeks} rnds
            </span>
          )}
        </td>
        <td className="py-2.5 px-2 text-center font-mono text-[#111111]">
          {row.bonus_total > 0 ? row.bonus_total : <span className="text-[#9ca3af]">–</span>}
        </td>
        <td className="py-2.5 px-2 text-center font-mono text-amber-600 font-semibold">
          {row.total}
        </td>
        {slots.map((slot) => {
          const ws = slot.week ? weeklyScoreMap[row.player_id]?.[slot.week.id] : null
          const isBye = slot.week?.is_bye ?? false
          return (
            <td
              key={slot.localWeekNumber}
              className={`py-2.5 px-1 text-center font-mono text-[#111111] w-10 sm:w-14 whitespace-nowrap ${
                isBye ? 'bg-gray-50' : ''
              }`}
              title={isBye ? 'Bye week — round voided for all players' : undefined}
            >
              {isBye ? (
                // Distinct from the '–' used for a week a player simply missed.
                <span className="text-[#9ca3af] text-[10px] font-sans tracking-wide">BYE</span>
              ) : ws ? (
                <>
                  {ws.stableford_score}
                  {ws.has_winner && <span className="ml-0.5 text-xs" title="Weekly winner">🏆</span>}
                  {ws.has_ctp && <span className="ml-0.5 text-xs" title="Closest to Pin">📍</span>}
                  {ws.has_ld && <span className="ml-0.5 text-xs" title="Longest Drive">🏌️</span>}
                  {ws.has_wooden_spoon && <span className="ml-0.5 text-xs" title="Wooden Spoon">🥄</span>}
                </>
              ) : (
                <span className="text-[#9ca3af]">–</span>
              )}
            </td>
          )
        })}
      </tr>
    </>
  )
}
