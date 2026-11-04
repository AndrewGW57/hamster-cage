import Anthropic from '@anthropic-ai/sdk'
import type {
  ParsedLeaderboardEntry,
  ParsedCTPEntry,
  ParsedLDEntry,
} from '@/types'
// Relative .mjs path (not @/): scripts/flag-vision-test.mjs loads this file under plain Node
import { normalizeCountryCode } from './flag-codes.mjs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

const FLAG_INSTRUCTIONS = `
Each row may show a small country flag next to the player's name. Add "country_code" to every row: the ISO 3166-1 alpha-2 code of that flag, in uppercase. Trackman shows a single UK flag, so for it return "GB". Return null if there is no flag, if it is a grey globe icon, or if the flag is too small or unclear to identify with confidence. Be especially careful with tricolours and blue flags with a Union Jack corner (Australia, New Zealand and others look alike). Never guess: null is always acceptable. The country_code must not affect any other field.`

// Adds a validated country_code to each row; every other field is left exactly as parsed.
// A non-array reply is returned untouched, so it fails (or not) exactly as it did before flags.
function withCountryCodes<T extends { country_code?: string | null }>(rows: T[]): T[] {
  if (!Array.isArray(rows)) return rows
  return rows.map((r) => (r && typeof r === 'object' ? { ...r, country_code: normalizeCountryCode(r.country_code) } : r))
}

async function callVision<T>(
  imageBase64: string,
  mediaType: ImageMediaType,
  prompt: string
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')

  // Strip markdown code fences if present
  const cleaned = text.replace(/```(?:json)?\n?/g, '').trim()

  return JSON.parse(cleaned) as T
}

export async function parseLeaderboard(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<ParsedLeaderboardEntry[]> {
  const prompt = `This is a Trackman golf leaderboard screenshot. Extract all player results as JSON.
Return ONLY a JSON array, no other text.

For players who FINISHED (THRU column shows "F"):
{ "name": string, "position": number, "stableford_score": number, "score_vs_par": number, "thru": "F", "dnf": false, "country_code": string | null }

For players who DID NOT FINISH (position column shows "DNF", OR the THRU column shows a hole number like "9" or "11" instead of "F"):
{ "name": string, "position": null, "stableford_score": 0, "score_vs_par": null, "thru": string, "dnf": true, "country_code": string | null }

DNF signals: "DNF" text where the finishing position would be, or THRU column showing a number instead of "F".
${FLAG_INSTRUCTIONS}`

  return withCountryCodes(await callVision<ParsedLeaderboardEntry[]>(imageBase64, mediaType, prompt))
}

export async function parseCTP(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<ParsedCTPEntry[]> {
  const prompt = `This is a Trackman Closest to Pin leaderboard. Extract results as JSON.
Return ONLY a JSON array: { "name": string, "position": number, "hole": number, "distance": string, "country_code": string | null }
${FLAG_INSTRUCTIONS}`

  return withCountryCodes(await callVision<ParsedCTPEntry[]>(imageBase64, mediaType, prompt))
}

export async function parseLD(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<ParsedLDEntry[]> {
  const prompt = `This is a Trackman Longest Drive leaderboard. Extract results as JSON.
Return ONLY a JSON array: { "name": string, "position": number, "hole": number, "distance_yards": string, "country_code": string | null }
${FLAG_INSTRUCTIONS}`

  return withCountryCodes(await callVision<ParsedLDEntry[]>(imageBase64, mediaType, prompt))
}
