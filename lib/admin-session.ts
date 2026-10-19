import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Signed admin session cookie: base64url(JSON {u, exp}) + "." + base64url(HMAC-SHA256).
// Used by the merge-players routes only (other admin routes are unchanged for now).
export const ADMIN_COOKIE = 'hc_admin'
const MAX_AGE_SECONDS = 4 * 60 * 60

function getSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  return secret && secret.length >= 32 ? secret : null
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  }
}

// Returns false (and sets nothing) if the secret is missing or too short.
export function setAdminCookie(res: NextResponse, username: string): boolean {
  const secret = getSecret()
  if (!secret) return false
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString('base64url')
  res.cookies.set(ADMIN_COOKIE, `${payload}.${sign(payload, secret)}`, cookieOptions(MAX_AGE_SECONDS))
  return true
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, '', cookieOptions(0))
}

function verify(value: string, secret: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [payload, sig] = parts

  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(sig)
  // timingSafeEqual throws on unequal lengths, so check length first
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof u !== 'string' || !u || typeof exp !== 'number') return null
    if (exp <= Math.floor(Date.now() / 1000)) return null
    return u
  } catch {
    return null
  }
}

function unauthorized() {
  return NextResponse.json(
    { error: 'Your admin session has expired. Log out and log back in.' },
    { status: 401 }
  )
}

// Returns the admin's username, or a response to send back as-is.
export async function requireAdmin(req: NextRequest): Promise<{ username: string } | NextResponse> {
  const secret = getSecret()
  if (!secret) {
    return NextResponse.json({ error: 'Admin sessions are not configured' }, { status: 500 })
  }

  const value = req.cookies.get(ADMIN_COOKIE)?.value
  const username = value ? verify(value, secret) : null
  if (!username) return unauthorized()

  // A deleted admin's cookie stops working immediately
  const db = createServiceClient()
  const { data: admin, error } = await db
    .from('admins')
    .select('username')
    .eq('username', username)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!admin) return unauthorized()

  return { username: admin.username }
}
