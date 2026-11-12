/**
 * Which week the admin review screen is looking at, and its date.
 *
 * The date decides which weekly-winner rule applies (lib/weekly-winner.ts), so a
 * missing or doubtful date must block the confirm. It is never treated as
 * pre-cutover. The source of truth is what parse-week returned for the week it
 * resolved or created. The admin's cached weeks list is only a cross-check: it
 * does not contain a week parse-week has just created.
 */

export interface ReviewWeek {
  date: string
  weekNumber: number
}

export type ReviewWeekResolution =
  | { ok: true; week: ReviewWeek }
  | { ok: false; error: string }

export const WEEK_DATE_MISSING_ERROR = 'Week date missing, reload the page before confirming'
export const WEEK_DATE_MISMATCH_ERROR =
  'Week date or number from the upload does not match the week list, reload the page before confirming'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function resolveReviewWeek(
  fromParse: { week_date?: unknown; week_number?: unknown } | null | undefined,
  fromList?: { date: string; week_number: number } | null
): ReviewWeekResolution {
  const date = fromParse?.week_date
  const weekNumber = fromParse?.week_number
  if (typeof date !== 'string' || !ISO_DATE.test(date) || typeof weekNumber !== 'number' || !Number.isInteger(weekNumber)) {
    return { ok: false, error: WEEK_DATE_MISSING_ERROR }
  }
  if (fromList && (fromList.date !== date || fromList.week_number !== weekNumber)) {
    return { ok: false, error: WEEK_DATE_MISMATCH_ERROR }
  }
  return { ok: true, week: { date, weekNumber } }
}
