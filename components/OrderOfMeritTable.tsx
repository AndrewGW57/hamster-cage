'use client'

import { useState } from 'react'
import { PlayerFlag } from './PlayerFlag'
import { WeeklyDetailModal } from './WeeklyDetailModal'
import type { OrderOfMeritRow, WeeklyDetail, Week } from '@/types'

type SortCol = 'total' | 'avg' | 'best'

interface Band {
  label: string
  start: number // -1 = All
}

interface Slot {
  weekNumber: number
  week: Week | null
}

interface Props {
  rows: OrderOfMeritRow[]
  weeks: Week[]
}

// Rank, flag, Player, Rnds, Total, Avg, Best
// Avg and Best are hidden on mobile but still count for colSpan
const FIXED_COLS = 7        // Rank, flag, Player, Rnds, Total, Avg, Best (desktop)
const MOBILE_FIXED_COLS = 5 // Rank, flag, Player, Rnds, Total (Avg+Best hidden on mobile)

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl leading-none" title="1st">🥇</span>
  if (rank === 2) return <span className="text-2xl leading-none" title="2nd">🥈</span>
  if (rank === 3) return <span className="text-2xl leading-none" title="3rd">🥉</span>
  return <span className="text-[#111111] font-mono tabular-nums">{rank}</span>
}

function rowBg(rank: number) {
  if (rank === 1) return 'bg-[#fef9c3]'
  if (rank === 2) return 'bg-[#f1f5f9]'
  if (rank === 3) return 'bg-[#fef3e2]'
  return ''
}

function SortArrow() {
  return <span className="ml-1 text-amber-500">↓</span>
}

function buildBands(weeks: Week[]): Band[] {
  if (weeks.length === 0) return []
  const starts = new Set<number>()
  for (const w of weeks) {
    starts.add(Math.floor((w.week_number - 1) / 5) * 5 + 1)
  }
  const bands: Band[] = Array.from(starts)
    .sort((a, b) => a - b)
    .map((start) => ({ label: `Wks ${start}–${start + 4}`, start }))
  if (bands.length > 1) {
    bands.push({ label: 'All', start: -1 })
  }
  return bands
}

function getSlots(activeStart: number, weeks: Week[]): Slot[] {
  if (activeStart === -1) {
    return [...weeks]
      .sort((a, b) => a.week_number - b.week_number)
      .map((w) => ({ weekNumber: w.week_number, week: w }))
  }
  return Array.from({ length: 5 }, (_, i) => {
    const weekNumber = activeStart + i
    const week = weeks.find((w) => w.week_number === weekNumber) ?? null
    return { weekNumber, week }
  })
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

export function OrderOfMeritTable({ rows, weeks }: Props) {
  const [selectedWeek, setSelectedWeek] = useState<WeeklyDetail | null>(null)
  const [loadingWeek, setLoadingWeek] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('total')

  const bands = buildBands(weeks)
  const lastRegular = [...bands].filter((b) => b.start !== -1).at(-1)
  const [activeStart, setActiveStart] = useState(lastRegular?.start ?? 1)

  const slots = getSlots(activeStart, weeks)

  const rankedByTotal = rows
    .filter((r) => r.is_ranked)
    .sort((a, b) => b.total_score - a.total_score)
  const oomRank = new Map(rankedByTotal.map((r, i) => [r.player_id, i + 1]))

  const sortedRanked = [...rankedByTotal].sort((a, b) => {
    if (sortCol === 'avg') return b.avg_score - a.avg_score
    if (sortCol === 'best') return (b.high_score ?? 0) - (a.high_score ?? 0)
    return b.total_score - a.total_score
  })

  const unranked = rows.filter((r) => !r.is_ranked)

  function sortableHeader(label: string, col: SortCol, extraClass = '') {
    const active = sortCol === col
    return (
      <th
        className={`py-3 px-2 text-right font-mono whitespace-nowrap cursor-pointer select-none transition-colors ${
          active ? 'text-amber-500' : 'hover:text-amber-500'
        } ${extraClass}`}
        onClick={() => setSortCol(col)}
      >
        {label}{active && <SortArrow />}
      </th>
    )
  }

  async function openWeekDetail(week: Week) {
    setLoadingWeek(week.id)
    try {
      const res = await fetch(`/api/weekly-detail?week_id=${week.id}`)
      const data: WeeklyDetail = await res.json()
      setSelectedWeek(data)
    } finally {
      setLoadingWeek(null)
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Tab row — desktop: skip 7 fixed cols (includes hidden Avg+Best) */}
            <tr className="hidden sm:table-row">
              <th colSpan={FIXED_COLS} className="p-0" />
              <th colSpan={slots.length} className="p-0 align-bottom">
                <TabButtons bands={bands} activeStart={activeStart} onSelect={setActiveStart} />
              </th>
            </tr>
            {/* Tab row — mobile: skip 5 visible fixed cols only */}
            <tr className="sm:hidden">
              <th colSpan={MOBILE_FIXED_COLS} className="p-0" />
              <th colSpan={slots.length} className="p-0 align-bottom">
                <TabButtons bands={bands} activeStart={activeStart} onSelect={setActiveStart} />
              </th>
            </tr>

            {/* Row 2: column headers */}
            <tr className="border-b border-gray-200 text-gray-500 text-left">
              <th className="py-3 px-2 w-12">Rank</th>
              <th className="py-3 px-2 w-6" />
              <th className="py-3 px-2 w-[150px] max-w-[150px] sm:w-[300px] sm:max-w-[300px]">Player</th>
              <th className="py-3 px-2 w-10 sm:w-16 text-right font-mono whitespace-nowrap">Rnds</th>
              {sortableHeader('Total', 'total', 'w-10 sm:w-16')}
              {sortableHeader('Avg', 'avg', 'hidden sm:table-cell sm:w-16')}
              {sortableHeader('Best', 'best', 'hidden sm:table-cell sm:w-16')}
              {slots.map((slot) => (
                <th
                  key={slot.weekNumber}
                  className={`py-3 px-1 w-10 sm:w-16 text-right font-mono whitespace-nowrap ${
                    slot.week
                      ? 'cursor-pointer hover:text-amber-500 transition-colors'
                      : 'text-gray-300'
                  }`}
                  onClick={() => slot.week && openWeekDetail(slot.week)}
                  title={slot.week ? `${slot.week.course_name} · ${slot.week.date}` : undefined}
                >
                  {loadingWeek === slot.week?.id ? '…' : `Wk ${slot.weekNumber}`}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sortedRanked.map((row) => (
              <PlayerRow
                key={row.player_id}
                row={row}
                rank={oomRank.get(row.player_id)}
                slots={slots}
              />
            ))}
            {unranked.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={FIXED_COLS + slots.length}
                    className="py-2 px-2 text-xs text-[#6b7280] border-t border-gray-200"
                  >
                    Unranked (fewer than 3 rounds)
                  </td>
                </tr>
                {unranked.map((row) => (
                  <PlayerRow key={row.player_id} row={row} slots={slots} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {selectedWeek && (
        <WeeklyDetailModal
          detail={selectedWeek}
          onClose={() => setSelectedWeek(null)}
        />
      )}
    </>
  )
}

function PlayerRow({
  row,
  rank,
  slots,
}: {
  row: OrderOfMeritRow
  rank?: number
  slots: Slot[]
}) {
  const bg = rank ? rowBg(rank) : ''
  return (
    <tr className={`border-b border-gray-100 transition-colors hover:brightness-95 ${bg}`}>
      <td className="py-2.5 px-2 text-center">
        {rank ? <RankBadge rank={rank} /> : <span className="text-[#9ca3af] font-mono">–</span>}
      </td>
      <td className="py-2.5 px-2">
        <PlayerFlag code={row.country_code} />
      </td>
      <td className="py-2.5 px-2 text-[#111111] font-medium w-[150px] max-w-[150px] sm:w-[300px] sm:max-w-[300px] truncate">
        {row.display_name}
      </td>
      <td className="py-2.5 px-2 w-10 sm:w-16 text-right font-mono text-[#111111]">{row.rounds_played}</td>
      <td className="py-2.5 px-2 w-10 sm:w-16 text-right font-mono text-amber-600 font-semibold">{row.total_score}</td>
      <td className="py-2.5 px-2 sm:w-16 text-right font-mono text-[#111111] hidden sm:table-cell">
        {row.rounds_played > 0 ? row.avg_score.toFixed(1) : <span className="text-[#9ca3af]">–</span>}
      </td>
      <td className="py-2.5 px-2 sm:w-16 text-right font-mono text-[#111111] hidden sm:table-cell">
        {row.high_score || <span className="text-[#9ca3af]">–</span>}
      </td>
      {slots.map((slot) => {
        const ws = slot.week ? row.weekly_scores?.[slot.week.id] : null
        return (
          <td
            key={slot.weekNumber}
            className="py-2.5 px-1 text-right font-mono text-[#111111] w-10 sm:w-16 whitespace-nowrap"
          >
            {ws ? (
              <>
                {ws.stableford_score}
                {ws.has_ctp && <span className="ml-0.5 text-xs">📍</span>}
                {ws.has_ld && <span className="ml-0.5 text-xs">🏌️</span>}
              </>
            ) : (
              <span className="text-[#9ca3af]">–</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}
