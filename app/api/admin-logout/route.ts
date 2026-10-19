import { NextResponse } from 'next/server'
import { clearAdminCookie } from '@/lib/admin-session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  clearAdminCookie(res)
  return res
}
