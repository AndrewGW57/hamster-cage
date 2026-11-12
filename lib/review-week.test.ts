import { describe, expect, it } from 'vitest'
import { resolveReviewWeek, WEEK_DATE_MISMATCH_ERROR, WEEK_DATE_MISSING_ERROR } from './review-week'

describe('resolveReviewWeek', () => {
  it('existing week: parse-week and the weeks list agree', () => {
    expect(
      resolveReviewWeek({ week_date: '2026-11-11', week_number: 4 }, { date: '2026-11-11', week_number: 4 })
    ).toEqual({ ok: true, week: { date: '2026-11-11', weekNumber: 4 } })
  })

  it('new week: not in the weeks list yet, parse-week values are used', () => {
    expect(resolveReviewWeek({ week_date: '2026-11-18', week_number: 5 }, undefined)).toEqual({
      ok: true,
      week: { date: '2026-11-18', weekNumber: 5 },
    })
  })

  it('parse-week and the weeks list disagree: error, no date', () => {
    expect(
      resolveReviewWeek({ week_date: '2026-11-11', week_number: 4 }, { date: '2026-11-04', week_number: 4 })
    ).toEqual({ ok: false, error: WEEK_DATE_MISMATCH_ERROR })
    expect(
      resolveReviewWeek({ week_date: '2026-11-11', week_number: 4 }, { date: '2026-11-11', week_number: 3 })
    ).toEqual({ ok: false, error: WEEK_DATE_MISMATCH_ERROR })
  })

  it('missing or malformed date: error, never a pre-cutover fallback', () => {
    const missing = { ok: false, error: WEEK_DATE_MISSING_ERROR }
    expect(resolveReviewWeek(null)).toEqual(missing)
    expect(resolveReviewWeek({ week_number: 4 })).toEqual(missing)
    expect(resolveReviewWeek({ week_date: '', week_number: 4 })).toEqual(missing)
    expect(resolveReviewWeek({ week_date: '11/11/2026', week_number: 4 })).toEqual(missing)
    expect(resolveReviewWeek({ week_date: '2026-11-11' })).toEqual(missing)
    // A list entry can't stand in for a missing parse-week date.
    expect(resolveReviewWeek({}, { date: '2026-11-11', week_number: 4 })).toEqual(missing)
  })
})
