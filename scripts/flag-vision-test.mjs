// Runs the Trackman vision parsers on a folder of screenshots and prints every row,
// including country_code ("-" when the parser does not return one).
// Vision calls only: no database client, no writes.
//
// Usage: node --env-file=.env.local scripts/flag-vision-test.mjs <folder> [--json]
//
// Filename rules (case-insensitive, extension ignored):
//   "leaderboard" anywhere, or a separate "lb" token  -> leaderboard parser
//   "ctp" anywhere                                    -> CTP parser
//   "drive" anywhere, or a separate "ld" token        -> LD parser
// Tokens are split on anything that is not a letter or digit, so "lb_1700000000.png"
// and "week6-ld.jpg" match but "world.png" and "album.png" do not.
// A name that matches none, or more than one, is skipped.

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseLeaderboard, parseCTP, parseLD } from '../lib/parse-trackman.ts'

const MEDIA_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const folder = args.find((a) => a !== '--json')
if (!folder) {
  console.error('Usage: node --env-file=.env.local scripts/flag-vision-test.mjs <folder> [--json]')
  process.exit(1)
}

function screenFor(file) {
  const base = path.basename(file, path.extname(file)).toLowerCase()
  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean)
  const hits = []
  if (base.includes('leaderboard') || tokens.includes('lb')) hits.push('leaderboard')
  if (base.includes('ctp')) hits.push('ctp')
  if (base.includes('drive') || tokens.includes('ld')) hits.push('ld')
  return hits
}

const show = (v) => (v === undefined || v === null ? '-' : String(v))

function printRows(screen, rows) {
  for (const r of rows) {
    const flag = show(r.country_code)
    if (screen === 'leaderboard') {
      console.log(
        `  ${screen.padEnd(11)} ${show(r.name).padEnd(28)} flag=${flag.padEnd(3)} pos=${show(r.position).padEnd(4)}` +
          ` score=${show(r.stableford_score).padEnd(3)} vsPar=${show(r.score_vs_par).padEnd(4)} dnf=${show(r.dnf)} thru=${show(r.thru)}`
      )
    } else {
      const dist = screen === 'ctp' ? r.distance : r.distance_yards
      console.log(
        `  ${screen.padEnd(11)} ${show(r.name).padEnd(28)} flag=${flag.padEnd(3)} pos=${show(r.position).padEnd(4)}` +
          ` hole=${show(r.hole).padEnd(3)} distance=${show(dist)}`
      )
    }
  }
}

const parsers = { leaderboard: parseLeaderboard, ctp: parseCTP, ld: parseLD }
const skipped = []
const failed = []
const output = []

const entries = (await readdir(folder)).sort()
for (const name of entries) {
  const full = path.join(folder, name)
  if (!(await stat(full)).isFile()) continue
  if (name.startsWith('.')) {
    skipped.push({ file: name, reason: 'hidden file' })
    continue
  }
  const mediaType = MEDIA_TYPES[path.extname(name).toLowerCase()]
  if (!mediaType) {
    skipped.push({ file: name, reason: `unsupported extension "${path.extname(name) || '(none)'}" (jpg, jpeg, png, gif, webp only)` })
    continue
  }
  const hits = screenFor(name)
  if (hits.length === 0) {
    skipped.push({ file: name, reason: 'name matches no screen (needs leaderboard/lb, ctp, or ld/drive)' })
    continue
  }
  if (hits.length > 1) {
    skipped.push({ file: name, reason: `name matches more than one screen (${hits.join(', ')})` })
    continue
  }

  const screen = hits[0]
  try {
    const base64 = (await readFile(full)).toString('base64')
    const rows = await parsers[screen](base64, mediaType)
    output.push({ file: name, screen, rows })
    if (!asJson) {
      console.log(`\n${name}  [${screen}]  ${rows.length} row(s)`)
      printRows(screen, rows)
    }
  } catch (err) {
    failed.push({ file: name, screen, error: err instanceof Error ? err.message : String(err) })
  }
}

if (asJson) {
  console.log(JSON.stringify({ results: output, skipped, failed }, null, 2))
} else {
  console.log(`\nParsed: ${output.length} file(s)`)
  if (skipped.length) {
    console.log(`Skipped: ${skipped.length} file(s)`)
    for (const s of skipped) console.log(`  ${s.file}: ${s.reason}`)
  }
  if (failed.length) {
    console.log(`Failed: ${failed.length} file(s)`)
    for (const f of failed) console.log(`  ${f.file} [${f.screen}]: ${f.error}`)
  }
}
