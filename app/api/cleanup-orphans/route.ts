import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { safeDeletePlayer } from '@/lib/player-cleanup'

export async function POST(req: NextRequest) {
  try {
    const { player_ids } = await req.json()
    if (!Array.isArray(player_ids) || player_ids.length === 0) {
      return NextResponse.json({ deleted: [], skipped: [] })
    }

    const db = createServiceClient()
    const results = await Promise.all(
      player_ids.map(async (id: string) => {
        const r = await safeDeletePlayer(db, id)
        return { id, ...r }
      })
    )

    return NextResponse.json({
      deleted: results.filter((r) => r.deleted).map((r) => r.id),
      skipped: results
        .filter((r) => !r.deleted)
        .map((r) => ({ id: r.id, reason: r.reason })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
