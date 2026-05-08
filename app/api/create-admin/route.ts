import { NextRequest, NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!username?.trim() || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
    }

    const db = createServiceClient()
    const hash = bcrypt.hashSync(password, 10)
    const { data, error } = await db
      .from('admins')
      .insert({ username: username.trim().toLowerCase(), password_hash: hash })
      .select('id, username, created_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ admin: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
