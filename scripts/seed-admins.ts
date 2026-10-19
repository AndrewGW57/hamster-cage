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

const ROUNDS = 10

async function main() {
  // Usage: npx tsx scripts/seed-admins.ts <username> <password>
  // Creates one admin. Never overwrites an existing one (use the admin page to change passwords).
  const [rawUsername, password] = process.argv.slice(2)
  if (!rawUsername || !password) {
    console.error('Usage: npx tsx scripts/seed-admins.ts <username> <password>')
    process.exit(1)
  }
  const username = rawUsername.trim().toLowerCase()

  const { data: existing, error: lookupErr } = await db
    .from('admins')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (lookupErr) throw new Error(lookupErr.message)
  if (existing) {
    console.error(`Admin "${username}" already exists; not overwriting.`)
    process.exit(1)
  }

  const { error } = await db
    .from('admins')
    .insert({ username, password_hash: bcrypt.hashSync(password, ROUNDS) })
  if (error) {
    // 23505: created between the lookup and the insert
    console.error(`Failed to create ${username}:`, error.message)
    process.exit(1)
  }
  console.log(`✓ ${username}`)
}

main().catch(console.error)
