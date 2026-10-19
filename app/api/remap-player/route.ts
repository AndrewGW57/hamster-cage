import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'
import { safeDeletePlayer } from '@/lib/player-cleanup'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const { player_id } = await req.json()
    if (!player_id) {
      return NextResponse.json({ error: 'Missing player_id' }, { status: 400 })
    }

    const db = createServiceClient()
    const result = await safeDeletePlayer(db, player_id)

    if (!result.deleted) {
      return NextResponse.json({ error: result.reason }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
