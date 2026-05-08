import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { id, name, scores_to_count, min_rounds_to_rank, total_weeks, weeks_per_tab, status } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'Missing cohort id' }, { status: 400 })
    }
    const db = createServiceClient()
    const patch: Record<string, unknown> = {}
    if (name !== undefined) patch.name = name.trim()
    if (scores_to_count !== undefined) patch.scores_to_count = scores_to_count
    if (min_rounds_to_rank !== undefined) patch.min_rounds_to_rank = min_rounds_to_rank
    if (total_weeks !== undefined) patch.total_weeks = total_weeks
    if (weeks_per_tab !== undefined) patch.weeks_per_tab = weeks_per_tab
    if (status !== undefined) patch.status = status
    const { error } = await db.from('cohorts').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
