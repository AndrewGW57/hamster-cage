import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json()
    if (!username) {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    const db = createServiceClient()

    // Refuse if this would delete the last admin
    const { count } = await db.from('admins').select('*', { count: 'exact', head: true })
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 400 })
    }

    const { error } = await db.from('admins').delete().eq('username', username)
    if (error) throw new Error(error.message)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
