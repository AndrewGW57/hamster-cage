export interface Cohort {
  id: string
  name: string
  status: 'active' | 'closed'
  scores_to_count: number
  min_rounds_to_rank: number
  total_weeks: number
  weeks_per_tab: number
  created_at: string
}

export interface Player {
  id: string
  display_name: string
  country_code: string | null
  ld_handicap_yards: number
  created_at: string
}

export interface PlayerAlias {
  id: string
  player_id: string
  alias: string
}

export interface Week {
  id: string
  week_number: number
  course_name: string
  date: string
  is_bye: boolean
  cohort_id: string | null
  created_at: string
}

export interface Result {
  id: string
  week_id: string
  player_id: string
  stableford_score: number
  score_vs_par: number | null  // null for DNF
  position: number | null      // null = DNF
  created_at: string
}

export interface SideContest {
  id: string
  week_id: string
  player_id: string
  contest_type: 'CTP' | 'LD'
  hole: number | null
  distance: string | null
  created_at: string
}

export interface Upload {
  id: string
  week_id: string
  image_type: 'leaderboard' | 'ctp' | 'ld'
  storage_path: string
  confirmed: boolean
  created_at: string
}

// Order of Merit view row
export interface OrderOfMeritRow {
  player_id: string
  display_name: string
  country_code: string | null
  rounds_played: number
  total_score: number
  avg_score: number
  high_score: number
  is_ranked: boolean
  rank: number | null
  weekly_scores: Record<string, WeeklyScore | null>
}

export interface WeeklyScore {
  stableford_score: number
  position: number
  has_ctp: boolean
  has_ld: boolean
}

export interface CtpFullEntry {
  position: number
  name: string
  distance: string
}

export interface LdFullEntry {
  position: number
  name: string
  distance_yards: string
}

// Weekly detail
export interface WeeklyDetail {
  week: Week
  results: WeeklyResultRow[]
  ctp: SideContestDetail | null
  ld: SideContestDetail | null
  ctp_full_list: CtpFullEntry[] | null
  ld_full_list: LdFullEntry[] | null
  course_chooser?: string | null
}

export interface WeeklyResultRow {
  player_id: string
  display_name: string
  country_code: string | null
  position: number | null
  stableford_score: number
  score_vs_par: number | null
  ineligible_for_bonus: boolean
  bonus_points: number
}

export interface SideContestDetail {
  player_name: string
  hole: number | null
  measurement: string | null
}

// Parsed data from Claude Vision
export interface ParsedLeaderboardEntry {
  name: string
  position: number | null  // null for DNF
  stableford_score: number  // 0 for DNF
  score_vs_par: number | null  // null for DNF
  dnf: boolean
  // thru is extracted by Vision for DNF detection but never persisted
}

export interface ParsedCTPEntry {
  name: string
  position: number
  hole: number
  distance: string
}

export interface ParsedLDEntry {
  name: string
  position: number
  hole: number
  distance_yards: string
}

export interface ParsedWeekData {
  leaderboard: MatchedLeaderboardEntry[]
  ctp: MatchedCTPEntry[]
  ld: MatchedLDEntry[]
}

export interface MatchedLeaderboardEntry extends ParsedLeaderboardEntry {
  matched_player_id: string | null
  matched_name: string | null
  is_new_player: boolean
}

export interface MatchedCTPEntry extends ParsedCTPEntry {
  matched_player_id: string | null
  matched_name: string | null
  is_new_player: boolean
}

export interface MatchedLDEntry extends ParsedLDEntry {
  matched_player_id: string | null
  matched_name: string | null
  is_new_player: boolean
}

export interface ConfirmWeekPayload {
  week_id: string
  leaderboard: MatchedLeaderboardEntry[]
  ctp: MatchedCTPEntry[]
  ld: MatchedLDEntry[]
  upload_ids: string[]
  ineligible_players?: string[]
  dnf_players?: string[]
}
