import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  const { course_name, date, cohort_id } = await req.json()

  if (!course_name || !date) {
    return NextResponse.json({ error: 'Missing course_name or date' }, { status: 400 })
  }

  let maxQuery = db
    .from('weeks')
    .select('week_number')
    .order('week_number', { ascending: false })
    .limit(1)
  if (cohort_id) maxQuery = maxQuery.eq('cohort_id', cohort_id)
  const { data: maxRow } = await maxQuery.maybeSingle()
  const nextWeekNum = (maxRow?.week_number ?? 0) + 1

  const { data: week, error } = await db
    .from('weeks')
    .insert({ week_number: nextWeekNum, course_name, date, cohort_id: cohort_id || null })
    .select()
    .single()

  if (error || !week) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create week' }, { status: 500 })
  }

  return NextResponse.json({ week })
}
