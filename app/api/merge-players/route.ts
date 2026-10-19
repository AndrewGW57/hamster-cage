import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'
import type { MergeResult } from '@/types'

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  try {
    const { player_a, player_b, final_name } = await req.json()
    if (!player_a || !player_b) {
      return NextResponse.json({ error: 'Missing player_a or player_b' }, { status: 400 })
    }
    if (typeof final_name !== 'string' || !final_name.trim()) {
      return NextResponse.json({ error: 'Choose the name to display' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data, error } = await db.rpc('merge_players', {
      p_a: player_a,
      p_b: player_b,
      p_final_name: final_name,
      p_dry_run: false,
      p_admin: admin.username,
    })
    if (error) {
      // P0001 = raise exception inside merge_players; the whole merge was rolled back
      return NextResponse.json({ error: error.message }, { status: error.code === 'P0001' ? 409 : 500 })
    }

    return NextResponse.json({ result: data as MergeResult })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
