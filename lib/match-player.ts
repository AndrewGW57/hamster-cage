import type { Player, PlayerAlias } from '@/types'

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

const THRESHOLD = 3

export function matchPlayer(
  name: string,
  players: Player[],
  aliases: PlayerAlias[]
): Player | null {
  const normalised = name.trim().toLowerCase()

  // Exact match on display_name first
  const exact = players.find(
    (p) => p.display_name.toLowerCase() === normalised
  )
  if (exact) return exact

  // Exact match on aliases
  const aliasMatch = aliases.find((a) => a.alias.toLowerCase() === normalised)
  if (aliasMatch) {
    return players.find((p) => p.id === aliasMatch.player_id) ?? null
  }

  // Fuzzy match on display_name
  let best: Player | null = null
  let bestDist = Infinity

  for (const player of players) {
    const dist = levenshtein(normalised, player.display_name.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = player
    }
  }

  // Fuzzy match on aliases
  for (const alias of aliases) {
    const dist = levenshtein(normalised, alias.alias.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = players.find((p) => p.id === alias.player_id) ?? null
    }
  }

  return bestDist <= THRESHOLD ? best : null
}
