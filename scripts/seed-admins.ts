import * as fs from 'fs'
import * as path from 'path'
import * as bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq < 0) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim()
  process.env[key] = val
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(url, key, { auth: { persistSession: false } })

const PASSWORD = 'HamsterCage'
const ROUNDS = 10

async function main() {
  const hash = bcrypt.hashSync(PASSWORD, ROUNDS)
  const admins = [
    { username: 'andrew', password_hash: hash },
    { username: 'eugene', password_hash: hash },
  ]

  for (const admin of admins) {
    const { error } = await db
      .from('admins')
      .upsert(admin, { onConflict: 'username' })
    if (error) {
      console.error(`Failed to upsert ${admin.username}:`, error.message)
    } else {
      console.log(`✓ ${admin.username}`)
    }
  }
}

main().catch(console.error)
