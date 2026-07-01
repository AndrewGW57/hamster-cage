import Anthropic from '@anthropic-ai/sdk'
import type {
  ParsedLeaderboardEntry,
  ParsedCTPEntry,
  ParsedLDEntry,
} from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

async function callVision<T>(
  imageBase64: string,
  mediaType: ImageMediaType,
  prompt: string
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
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
{ "name": string, "position": number, "stableford_score": number, "score_vs_par": number, "thru": "F", "dnf": false }

For players who DID NOT FINISH (position column shows "DNF", OR the THRU column shows a hole number like "9" or "11" instead of "F"):
{ "name": string, "position": null, "stableford_score": 0, "score_vs_par": null, "thru": string, "dnf": true }

DNF signals: "DNF" text where the finishing position would be, or THRU column showing a number instead of "F".`

  return callVision<ParsedLeaderboardEntry[]>(imageBase64, mediaType, prompt)
}

export async function parseCTP(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<ParsedCTPEntry[]> {
  const prompt = `This is a Trackman Closest to Pin leaderboard. Extract results as JSON.
Return ONLY a JSON array: { "name": string, "position": number, "hole": number, "distance": string }`

  return callVision<ParsedCTPEntry[]>(imageBase64, mediaType, prompt)
}

export async function parseLD(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<ParsedLDEntry[]> {
  const prompt = `This is a Trackman Longest Drive leaderboard. Extract results as JSON.
Return ONLY a JSON array: { "name": string, "position": number, "hole": number, "distance_yards": string }`

  return callVision<ParsedLDEntry[]>(imageBase64, mediaType, prompt)
}
