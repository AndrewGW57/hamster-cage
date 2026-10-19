import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-session'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const db = createServiceClient()
    const { data, error } = await db
      .from('admins')
      .select('id, username, created_at')
      .order('created_at')
    if (error) throw new Error(error.message)
    return NextResponse.json({ admins: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
