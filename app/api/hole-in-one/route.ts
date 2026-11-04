import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'

// Hole-in-ones are entered by hand: Trackman leaderboard exports don't record them.
// A badge only, so nothing here touches bonus_points.

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { week_id, player_id, hole } = await req.json()
    if (!week_id || !player_id) {
      return NextResponse.json({ error: 'Missing week_id or player_id' }, { status: 400 })
    }
    let holeNum: number | null = null
    if (hole !== null && hole !== undefined && hole !== '') {
      holeNum = Number(hole)
      if (!Number.isInteger(holeNum) || holeNum < 1 || holeNum > 18) {
        return NextResponse.json({ error: 'Hole must be a whole number from 1 to 18' }, { status: 400 })
      }
    }

    const db = createServiceClient()

    // Only someone who played that week can have aced a hole in it.
    const { data: result } = await db
      .from('results')
      .select('id')
      .eq('week_id', week_id)
      .eq('player_id', player_id)
      .maybeSingle()
    if (!result) {
      return NextResponse.json({ error: 'That player has no result for this week' }, { status: 400 })
    }

    const { data, error } = await db
      .from('hole_in_ones')
      .insert({ week_id, player_id, hole: holeNum })
      .select('id, week_id, player_id, hole, created_at')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That player already has a hole-in-one recorded this week' }, { status: 409 })
      }
      throw new Error(error.message)
    }
    return NextResponse.json({ success: true, hole_in_one: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const db = createServiceClient()
    const { error } = await db.from('hole_in_ones').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
