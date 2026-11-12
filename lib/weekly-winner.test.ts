import { describe, expect, it } from 'vitest'
import { determineWeeklyWinner, type WeeklyResultForRules } from './weekly-winner'

const NEW = '2026-11-11' // first week on the gross-strokes rule
const OLD = '2026-09-09' // pre-cutover week

function row(
  player_id: string,
  stableford_score: number,
  extra: Partial<WeeklyResultForRules> = {}
): WeeklyResultForRules {
  return {
    player_id,
    stableford_score,
    score_vs_par: stableford_score - 36, // points minus 36, as Trackman stores it
    position: null,
    ineligible_for_bonus: false,
    gross_score: null,
    ...extra,
  }
}

describe('determineWeeklyWinner — gross-strokes rule (weeks.date >= 2026-11-11)', () => {
  it('one player on 40+ wins outright, no gross needed', () => {
    const r = determineWeeklyWinner(
      [row('a', 42, { position: 1 }), row('b', 39, { position: 2 }), row('c', 36, { position: 3 })],
      NEW
    )
    expect(r).toEqual({ winnerIds: ['a'], cappedScore: 40, tied: false, tieReason: null, needsGross: false })
  })

  it('two on 40+ with different gross: lowest gross wins, even with fewer raw points', () => {
    const r = determineWeeklyWinner(
      [
        row('a', 46, { position: 1, gross_score: 78 }),
        row('b', 41, { position: 2, gross_score: 72 }),
        row('c', 38, { position: 3 }),
      ],
      NEW
    )
    expect(r).toEqual({ winnerIds: ['b'], cappedScore: 40, tied: false, tieReason: null, needsGross: false })
  })

  it('two on 40+ with equal lowest gross: tied, settled by the manual pick', () => {
    const results = [
      row('a', 44, { position: 1, gross_score: 74 }),
      row('b', 40, { position: 2, gross_score: 74 }),
      row('c', 41, { position: 3, gross_score: 80 }),
    ]
    const r = determineWeeklyWinner(results, NEW)
    expect(r.tied).toBe(true)
    expect(r.needsGross).toBe(false)
    expect(r.tieReason).toBe('gross-tied-needs-manual-pick')
    expect(r.winnerIds.sort()).toEqual(['a', 'b'])

    const picked = determineWeeklyWinner(results, NEW, 'b')
    expect(picked).toEqual({ winnerIds: ['b'], cappedScore: 40, tied: false, tieReason: null, needsGross: false })

    // A manual pick outside the tied pair is ignored.
    expect(determineWeeklyWinner(results, NEW, 'c').tied).toBe(true)
  })

  it('missing gross for anyone in a 40+ group: needsGross, no winner decided', () => {
    const results = [
      row('a', 45, { position: 1, gross_score: 70 }),
      row('b', 41, { position: 2, gross_score: null }),
    ]
    const r = determineWeeklyWinner(results, NEW)
    expect(r).toEqual({ winnerIds: [], cappedScore: 40, tied: true, tieReason: 'needs-gross', needsGross: true })
    // A manual pick can't stand in for a missing gross.
    expect(determineWeeklyWinner(results, NEW, 'a').winnerIds).toEqual([])
  })

  it('nobody on 40+: existing logic unchanged (Trackman position breaks the tie)', () => {
    const results = [
      row('a', 38, { position: 2 }),
      row('b', 38, { position: 1 }),
      row('c', 35, { position: 3 }),
    ]
    const r = determineWeeklyWinner(results, NEW)
    expect(r).toEqual({ winnerIds: ['b'], cappedScore: 38, tied: false, tieReason: null, needsGross: false })
    expect(r).toEqual(determineWeeklyWinner(results, OLD))
  })

  it('ineligible players are left out of the 40+ group', () => {
    const r = determineWeeklyWinner(
      [
        row('a', 47, { position: 1, ineligible_for_bonus: true }), // afternoon round / DNF
        row('b', 41, { position: 2 }), // no gross entered, but alone in the group
      ],
      NEW
    )
    expect(r).toEqual({ winnerIds: ['b'], cappedScore: 40, tied: false, tieReason: null, needsGross: false })
  })
})

describe('determineWeeklyWinner — pre-cutover weeks keep the legacy result', () => {
  // The Sep 9 shape: 48, 47 and 40 raw, all capped to 40.
  const sep9 = [
    row('jp', 48, { position: 1, gross_score: 70 }),
    row('dh', 47, { position: 2, gross_score: 75 }),
    row('mc', 40, { position: 3, gross_score: 80 }),
  ]

  it('breaks a 40+ tie on lowest score_vs_par, ignoring gross_score', () => {
    expect(determineWeeklyWinner(sep9, OLD)).toEqual({
      winnerIds: ['mc'],
      cappedScore: 40,
      tied: false,
      tieReason: null,
      needsGross: false,
    })
    // Day before the cutover is still legacy.
    expect(determineWeeklyWinner(sep9, '2026-11-10').winnerIds).toEqual(['mc'])
  })

  it('the same rows on the cutover date go to lowest gross instead', () => {
    expect(determineWeeklyWinner(sep9, NEW).winnerIds).toEqual(['jp'])
  })
})
