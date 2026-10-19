import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase'
import { setAdminCookie } from '@/lib/admin-session'

// Slows down password guessing. Per-request only: Vercel instances share no memory,
// so real rate limiting would need a shared store.
const FAILED_LOGIN_DELAY_MS = 1000
const failedLoginDelay = () => new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS))

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }
    const db = createServiceClient()
    const { data: admin, error } = await db
      .from('admins')
      .select('username, password_hash')
      .eq('username', username.trim().toLowerCase())
      .single()
    if (error || !admin) {
      await failedLoginDelay()
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const valid = bcrypt.compareSync(password, admin.password_hash)
    if (!valid) {
      await failedLoginDelay()
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const res = NextResponse.json({ success: true, username: admin.username })
    if (!setAdminCookie(res, admin.username)) {
      // Login still works for the existing admin UI; merge routes will refuse until this is fixed
      console.error('[admin-auth] ADMIN_SESSION_SECRET missing or too short; session cookie not set')
    }
    return res
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
