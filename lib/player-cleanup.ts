import type { SupabaseClient } from '@supabase/supabase-js'

export async function safeDeletePlayer(
  db: SupabaseClient,
  player_id: string
): Promise<{ deleted: boolean; reason?: string }> {
  const [{ count: resultCount }, { count: contestCount }] = await Promise.all([
    db.from('results').select('id', { count: 'exact', head: true }).eq('player_id', player_id),
    db.from('side_contests').select('id', { count: 'exact', head: true }).eq('player_id', player_id),
  ])

  if ((resultCount ?? 0) > 0 || (contestCount ?? 0) > 0) {
    return { deleted: false, reason: 'Player has existing results or side contests' }
  }

  const { error } = await db.from('players').delete().eq('id', player_id)
  if (error) throw new Error(error.message)
  return { deleted: true }
}
