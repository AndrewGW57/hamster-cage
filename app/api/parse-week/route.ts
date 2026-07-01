import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { parseLeaderboard, parseCTP, parseLD, type ImageMediaType } from '@/lib/parse-trackman'
import { matchPlayer } from '@/lib/match-player'
import type {
  MatchedLeaderboardEntry,
  MatchedCTPEntry,
  MatchedLDEntry,
  Player,
} from '@/types'

// Detects the real image format from magic bytes rather than trusting the
// client-supplied File.type, which can be blank or wrong (e.g. some mobile
// browsers omit it, or a file is renamed with a mismatched extension).
function detectImageMediaType(buffer: Buffer, fallback: ImageMediaType): ImageMediaType {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'GIF8') {
    return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return fallback
}

export async function POST(req: NextRequest) {
  const db = createServiceClient()
  let weekId: string | null = null
  let weekCreatedHere = false

  try {
    const formData = await req.formData()
    const weekIdField = formData.get('week_id') as string | null
    const lbFile = formData.get('leaderboard') as File | null
    const ctpFile = formData.get('ctp') as File | null
    const ldFile = formData.get('ld') as File | null

    if (!lbFile || !ctpFile || !ldFile) {
      return NextResponse.json({ error: 'Missing image files' }, { status: 400 })
    }

    // Resolve or create week — all writes use service role
    if (weekIdField && weekIdField !== 'new') {
      weekId = weekIdField
    } else {
      const courseName = formData.get('course_name') as string | null
      const date = formData.get('date') as string | null
      const cohortId = formData.get('cohort_id') as string | null
      if (!courseName || !date) {
        return NextResponse.json({ error: 'Missing course_name or date for new week' }, { status: 400 })
      }
      // Derive next week number from the max within the same cohort
      let maxQuery = db
        .from('weeks')
        .select('week_number')
        .order('week_number', { ascending: false })
        .limit(1)
      if (cohortId) maxQuery = maxQuery.eq('cohort_id', cohortId)
      const { data: maxRow } = await maxQuery.maybeSingle()
      const nextWeekNum = (maxRow?.week_number ?? 0) + 1

      const { data: newWeek, error: weekErr } = await db
        .from('weeks')
        .insert({ week_number: nextWeekNum, course_name: courseName, date, cohort_id: cohortId || null })
        .select()
        .single()
      if (weekErr || !newWeek) throw new Error(`Failed to create week: ${weekErr?.message}`)

      weekId = newWeek.id
      weekCreatedHere = true
    }

    const timestamp = Date.now()

    const VALID_MEDIA_TYPES: ImageMediaType[] = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]

    // Upload file to storage and return path + base64 + detected media type in one pass
    async function processFile(
      file: File,
      name: string
    ): Promise<{ path: string; base64: string; mediaType: ImageMediaType }> {
      const buffer = Buffer.from(await file.arrayBuffer())
      const clientType = VALID_MEDIA_TYPES.includes(file.type as ImageMediaType)
        ? (file.type as ImageMediaType)
        : 'image/jpeg'
      const mediaType = detectImageMediaType(buffer, clientType)
      const ext = mediaType.split('/')[1]
      const path = `${weekId}/${name}_${timestamp}.${ext}`
      const { error } = await db.storage
        .from('trackman-uploads')
        .upload(path, buffer, { upsert: true, contentType: mediaType })
      if (error) throw new Error(`Storage upload failed (${name}): ${error.message}`)
      return { path, base64: buffer.toString('base64'), mediaType }
    }

    const [lb, ctp, ld] = await Promise.all([
      processFile(lbFile, 'lb'),
      processFile(ctpFile, 'ctp'),
      processFile(ldFile, 'ld'),
    ])

    // Record uploads in DB
    const { data: uploadRows, error: uploadErr } = await db
      .from('uploads')
      .insert([
        { week_id: weekId, image_type: 'leaderboard', storage_path: lb.path, confirmed: false },
        { week_id: weekId, image_type: 'ctp', storage_path: ctp.path, confirmed: false },
        { week_id: weekId, image_type: 'ld', storage_path: ld.path, confirmed: false },
      ])
      .select('id')
    if (uploadErr) throw new Error(`uploads insert failed: ${uploadErr.message}`)

    // Parse all three images with Claude Vision
    const [parsedLB, parsedCTP, parsedLD] = await Promise.all([
      parseLeaderboard(lb.base64, lb.mediaType),
      parseCTP(ctp.base64, ctp.mediaType),
      parseLD(ld.base64, ld.mediaType),
    ])

    // Fetch players + aliases for name matching
    const [{ data: players, error: playersErr }, { data: aliases, error: aliasesErr }] =
      await Promise.all([
        db.from('players').select('*'),
        db.from('player_aliases').select('*'),
      ])
    if (playersErr) throw new Error(`players fetch failed: ${playersErr.message}`)
    if (aliasesErr) throw new Error(`aliases fetch failed: ${aliasesErr.message}`)

    const playerList: Player[] = players ?? []
    const aliasList = aliases ?? []

    async function resolvePlayer(name: string): Promise<{
      matched_player_id: string | null
      matched_name: string | null
      is_new_player: boolean
    }> {
      const match = matchPlayer(name, playerList, aliasList)
      if (match) {
        return { matched_player_id: match.id, matched_name: match.display_name, is_new_player: false }
      }
      const { data: newPlayer, error } = await db
        .from('players')
        .insert({ display_name: name, country_code: null })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          // Concurrent resolvePlayer call won the race on display_name unique constraint —
          // fetch the row that was just inserted by the winning call.
          const { data: existing } = await db
            .from('players')
            .select('*')
            .eq('display_name', name)
            .single()
          if (existing) {
            return { matched_player_id: existing.id, matched_name: existing.display_name, is_new_player: false }
          }
        }
        console.error('[parse-week] resolvePlayer insert failed', { name, code: error.code, message: error.message, error })
        return { matched_player_id: null, matched_name: null, is_new_player: true }
      }
      if (!newPlayer) {
        console.error('[parse-week] resolvePlayer insert returned no data', { name })
        return { matched_player_id: null, matched_name: null, is_new_player: true }
      }
      playerList.push(newPlayer as Player)
      return { matched_player_id: newPlayer.id, matched_name: newPlayer.display_name, is_new_player: true }
    }

    const [matchedLB, matchedCTP, matchedLDRaw] = await Promise.all([
      Promise.all(parsedLB.map(async (e): Promise<MatchedLeaderboardEntry> =>
        ({ ...e, ...(await resolvePlayer(e.name)) })
      )),
      Promise.all(parsedCTP.map(async (e): Promise<MatchedCTPEntry> =>
        ({ ...e, ...(await resolvePlayer(e.name)) })
      )),
      Promise.all(parsedLD.map(async (e): Promise<MatchedLDEntry> =>
        ({ ...e, ...(await resolvePlayer(e.name)) })
      )),
    ])

    // Re-rank LD entries after applying each player's ld_handicap_yards.
    // Adjusted distance = raw yards - handicap. Highest adjusted distance wins.
    const ldHandicapMap = new Map(
      playerList.map((p) => [p.id, p.ld_handicap_yards ?? 0])
    )
    const matchedLD: MatchedLDEntry[] = matchedLDRaw
      .map((e) => {
        const raw = parseFloat(e.distance_yards)
        const handicap = e.matched_player_id ? (ldHandicapMap.get(e.matched_player_id) ?? 0) : 0
        return { ...e, _adj: isNaN(raw) ? -Infinity : raw - handicap }
      })
      .sort((a, b) => (b as typeof b & { _adj: number })._adj - (a as typeof a & { _adj: number })._adj)
      .map((e, i) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _adj, ...entry } = e as typeof e & { _adj: number }
        return { ...entry, position: i + 1 }
      })

    return NextResponse.json({
      week_id: weekId,
      leaderboard: matchedLB,
      ctp: matchedCTP,
      ld: matchedLD,
      upload_ids: (uploadRows ?? []).map((u: { id: string }) => u.id),
    })
  } catch (err) {
    // If this request created the week record, delete it so it doesn't orphan
    if (weekCreatedHere && weekId) {
      try { await db.from('weeks').delete().eq('id', weekId) } catch { /* best-effort cleanup */ }
    }
    console.error('[parse-week]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
