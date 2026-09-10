'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { PlayerFlag } from './PlayerFlag'
import { MAX_STABLEFORD_POINTS } from '@/lib/rules'
import type { WeeklyDetail, CtpFullEntry, LdFullEntry } from '@/types'

interface Props {
  detail: WeeklyDetail
  onClose: () => void
}

const ROW_TINT = ['bg-[#fef9c3]', 'bg-[#f1f5f9]', 'bg-[#fef3e2]']

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }
  return dateStr
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="w-3.5 h-3.5 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d={expanded ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
      />
    </svg>
  )
}

function ContestCard({
  icon,
  label,
  playerName,
  hole,
  measurement,
  fullList,
  distanceKey,
  ineligibleNames,
}: {
  icon: string
  label: string
  playerName: string
  hole: number | null
  measurement: string | null
  fullList: (CtpFullEntry | LdFullEntry)[] | null
  distanceKey: 'distance' | 'distance_yards'
  ineligibleNames: Set<string>
}) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = fullList && fullList.length > 1

  const firstEligiblePos = fullList
    ? [...fullList].sort((a, b) => a.position - b.position).find((e) => !ineligibleNames.has(e.name))?.position ?? -1
    : -1

  return (
    <div
      className={`bg-gray-50 rounded-lg p-3 border border-gray-200 relative ${canExpand ? 'cursor-pointer select-none' : ''}`}
      onClick={() => canExpand && setExpanded(!expanded)}
    >
      <div className="flex items-center gap-1.5 text-xs text-gray-500 uppercase tracking-wider mb-1">
        <Image src={icon} alt={label} height={20} width={20} style={{ width: 'auto' }} />
        {label}
      </div>
      <div className="text-[#111111] font-semibold text-sm">{playerName}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-gray-500 text-xs">Hole {hole} ·</span>
        <span className="text-[#111111] text-sm font-semibold">{measurement}</span>
      </div>

      {expanded && fullList && (
        <div className="mt-3 pt-2 border-t border-gray-200 space-y-0.5">
          {fullList.map((e) => {
            const dist = distanceKey === 'distance'
              ? (e as CtpFullEntry).distance
              : (e as LdFullEntry).distance_yards
            const ineligible = ineligibleNames.has(e.name)
            const isWinner = !ineligible && e.position === firstEligiblePos
            return (
              <div
                key={e.position}
                className={`flex justify-between text-xs py-0.5 ${
                  ineligible
                    ? 'line-through text-[#9ca3af]'
                    : isWinner
                    ? 'font-semibold text-[#111111]'
                    : 'text-[#111111]'
                }`}
              >
                <span>#{e.position} {e.name}</span>
                <span className="font-mono ml-4 shrink-0">{dist}</span>
              </div>
            )
          })}
        </div>
      )}

      {canExpand && (
        <div className="absolute bottom-2 right-2">
          <Chevron expanded={expanded} />
        </div>
      )}
    </div>
  )
}

export function WeeklyDetailModal({ detail, onClose }: Props) {
  const { week, results, ctp, ld, ctp_full_list, ld_full_list } = detail
  const backdropRef = useRef<HTMLDivElement>(null)

  // Ranks by the same number the Total column shows (capped score + bonus),
  // not raw stableford_score — otherwise a player over the Max 40 cap can
  // outrank the actual winner here while the Total column says otherwise.
  // Ties fall back to gross score (lower vs-par first), matching how Max 40
  // ties themselves are broken (see lib/weekly-winner.ts).
  const weeklyTotal = (r: typeof results[0]) => Math.min(r.stableford_score, MAX_STABLEFORD_POINTS) + r.bonus_points
  const byScore = (a: typeof results[0], b: typeof results[0]) =>
    weeklyTotal(b) - weeklyTotal(a) || (a.score_vs_par ?? Infinity) - (b.score_vs_par ?? Infinity)
  const finishers = [...results].filter(r => !!r.position).sort(byScore)
  const dnfPlayers = [...results].filter(r => !r.position).sort(byScore)

  const ctpWinner = ctp?.player_name ?? null
  const ldWinner = ld?.player_name ?? null

  const ineligibleNames = new Set(
    results.filter((r) => r.ineligible_for_bonus).map((r) => r.display_name)
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-0 sm:px-4"
      ref={backdropRef}
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div className="bg-white border border-gray-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl sm:mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-amber-500 flex items-center gap-2">
              Week {week.week_number}
              {detail.is_curveball && (
                <span
                  className="px-1.5 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-700 align-middle"
                  title="Curveball Week"
                >
                  🎲 Curveball
                </span>
              )}
              <span className="text-gray-300 font-normal">·</span>
              <span className="text-gray-500 font-normal text-base">{formatDate(week.date)}</span>
            </h2>
            <p className="text-sm text-gray-500">{week.course_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Bye week — replaces the results table entirely */}
        {week.is_bye && (
          <div className="p-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-6 text-center">
              <div className="inline-block px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-600 tracking-wide mb-2">
                BYE WEEK
              </div>
              <p className="text-sm text-gray-600">Round voided for all players.</p>
              <p className="text-xs text-gray-400 mt-1">
                No scores were recorded, and this week does not count toward anyone&apos;s total.
              </p>
            </div>
          </div>
        )}

        {/* Weekly winner / course chooser */}
        {!week.is_bye && detail.course_chooser && (
          <div className="px-3 sm:px-4 pt-3 pb-0">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-amber-700">
              🏆 {detail.course_chooser} wins the week (+{detail.is_curveball ? 2 : 1} pt{detail.is_curveball ? 's' : ''}) and chooses next week&apos;s course
            </div>
          </div>
        )}
        {!week.is_bye && !detail.course_chooser && detail.winner_tied && (
          <div className="px-3 sm:px-4 pt-3 pb-0">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-gray-600">
              🏆 Weekly winner is tied — needs a manual countback to settle (see 🏆 marks below). Everyone shown has been credited for now.
            </div>
          </div>
        )}

        {/* Results table */}
        {!week.is_bye && (
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-200">
                <th className="pb-2 w-10">#</th>
                <th className="pb-2 w-6"></th>
                <th className="pb-2">Player</th>
                <th className="pb-2 text-center font-mono"><span className="sm:hidden">Sc</span><span className="hidden sm:inline">Score</span></th>
                <th className="pb-2 text-center font-mono"><span className="sm:hidden">Bon</span><span className="hidden sm:inline">Bonus</span></th>
                <th className="pb-2 text-center font-mono"><span className="sm:hidden">Tot</span><span className="hidden sm:inline">Total</span></th>
                <th className="pb-2 text-center font-mono"><span className="sm:hidden">±</span><span className="hidden sm:inline">vs Par</span></th>
              </tr>
            </thead>
            <tbody>
              {finishers.map((r, i) => (
                <tr
                  key={r.player_id}
                  className={`${ROW_TINT[i] ?? ''} border-b border-gray-100`}
                >
                  <td className="py-2 text-[#111111] font-mono">#{i + 1}</td>
                  <td className="py-2">
                    <PlayerFlag code={r.country_code} />
                  </td>
                  <td className="py-2 text-[#111111] max-w-[120px] sm:max-w-none overflow-hidden">
                    <span className="block truncate sm:overflow-visible sm:whitespace-normal">{r.display_name}</span>
                    {r.ineligible_for_bonus && (
                      <span className="ml-1.5 px-1 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 align-middle"><span className="sm:hidden">PM</span><span className="hidden sm:inline">Ineligible for Bonus</span></span>
                    )}
                    {r.is_weekly_winner && (
                      <span className="ml-1.5 text-sm align-middle" title="Weekly winner">🏆</span>
                    )}
                    {ctpWinner && r.display_name === ctpWinner && (
                      <Image src="/ctp-icon.png" alt="CTP" height={20} width={20} style={{ display: 'inline', marginLeft: '6px' }} />
                    )}
                    {ldWinner && r.display_name === ldWinner && (
                      <Image src="/ld-icon.png" alt="LD" height={20} width={20} style={{ display: 'inline', marginLeft: '6px' }} />
                    )}
                    {r.is_wooden_spoon && (
                      <Image src="/wooden-spoon-icon.png" alt="Wooden Spoon" height={20} width={20} style={{ display: 'inline', marginLeft: '6px' }} />
                    )}
                  </td>
                  <td className="py-2 text-center font-mono text-amber-600 font-semibold">
                    {r.stableford_score}
                    {r.stableford_score > 40 && (
                      <span className="block text-[10px] font-sans font-normal text-gray-400 leading-tight" title="Max 40 — this is what counts toward the season total">
                        40 in the books
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center font-mono text-[#9ca3af]">
                    {r.ineligible_for_bonus || r.bonus_points === 0 ? '–' : `+${r.bonus_points}`}
                  </td>
                  <td className="py-2 text-center font-mono text-amber-600 font-semibold">
                    {Math.min(r.stableford_score, MAX_STABLEFORD_POINTS) + r.bonus_points}
                  </td>
                  <td className="py-2 text-center font-mono text-xs">
                    {(() => {
                      const vp = r.stableford_score - 36
                      if (vp === 0) return <span className="text-[#9ca3af]">E</span>
                      if (vp > 0) return <span className="text-amber-500">+{vp}</span>
                      return <span className="text-[#9ca3af]">{vp}</span>
                    })()}
                  </td>
                </tr>
              ))}
              {dnfPlayers.map((r) => (
                <tr key={r.player_id} className="border-b border-gray-100">
                  <td className="py-2 text-[#9ca3af] font-mono text-xs">DNF</td>
                  <td className="py-2">
                    <PlayerFlag code={r.country_code} />
                  </td>
                  <td className="py-2 text-[#9ca3af] max-w-[120px] sm:max-w-none overflow-hidden">
                    <span className="block truncate sm:overflow-visible sm:whitespace-normal">{r.display_name}</span>
                    {r.ineligible_for_bonus && (
                      <span className="ml-1.5 px-1 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700 align-middle"><span className="sm:hidden">PM</span><span className="hidden sm:inline">Ineligible for Bonus</span></span>
                    )}
                  </td>
                  <td className="py-2 text-center font-mono text-[#9ca3af]">{r.stableford_score}</td>
                  <td className="py-2 text-center font-mono text-[#9ca3af]">–</td>
                  <td className="py-2 text-center font-mono text-[#9ca3af]">{r.stableford_score}</td>
                  <td className="py-2 text-center font-mono text-[#9ca3af]">–</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Side contests */}
        {!week.is_bye && (ctp || ld) && (
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            {ctp && (
              <ContestCard
                icon="/ctp-icon.png"
                label="Closest to Pin"
                playerName={ctp.player_name}
                hole={ctp.hole}
                measurement={ctp.measurement}
                fullList={ctp_full_list}
                distanceKey="distance"
                ineligibleNames={ineligibleNames}
              />
            )}
            {ld && (
              <ContestCard
                icon="/ld-icon.png"
                label="Longest Drive"
                playerName={ld.player_name}
                hole={ld.hole}
                measurement={ld.measurement}
                fullList={ld_full_list}
                distanceKey="distance_yards"
                ineligibleNames={ineligibleNames}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
