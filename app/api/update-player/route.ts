import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { player_id, country_code, ld_handicap_yards } = await req.json()
    if (!player_id) {
      return NextResponse.json({ error: 'Missing player_id' }, { status: 400 })
    }
    const db = createServiceClient()
    const { error } = await db
      .from('players')
      .update({
        country_code: country_code || null,
        ld_handicap_yards: ld_handicap_yards ?? 0,
      })
      .eq('id', player_id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
