import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { player_id, display_name } = await req.json()
    if (!player_id || !display_name) {
      return NextResponse.json({ error: 'Missing player_id or display_name' }, { status: 400 })
    }

    const normalized = display_name.trim().replace(/\s+/g, ' ')
    if (!normalized) {
      return NextResponse.json({ error: 'display_name cannot be empty' }, { status: 400 })
    }

    const db = createServiceClient()

    // Pre-check for case-insensitive lookalike before hitting the unique constraint
    const { data: existing } = await db
      .from('players')
      .select('id')
      .ilike('display_name', normalized)
      .neq('id', player_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `A player named '${normalized}' already exists`, code: '23505' },
        { status: 409 }
      )
    }

    const { error } = await db
      .from('players')
      .update({ display_name: normalized })
      .eq('id', player_id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A player named '${normalized}' already exists`, code: '23505' },
          { status: 409 }
        )
      }
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true, display_name: normalized })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
