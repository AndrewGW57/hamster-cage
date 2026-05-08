import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { name, scores_to_count, min_rounds_to_rank, total_weeks, status } = await req.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const db = createServiceClient()
    const { data, error } = await db
      .from('cohorts')
      .insert({
        name: name.trim(),
        scores_to_count: scores_to_count ?? 3,
        min_rounds_to_rank: min_rounds_to_rank ?? 1,
        total_weeks: total_weeks ?? 0,
        status: status ?? 'active',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ cohort: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
