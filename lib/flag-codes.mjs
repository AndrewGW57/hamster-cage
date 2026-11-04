// Country flags read from Trackman screenshots (ISO 3166-1 alpha-2, uppercase).
// Deliberately a short list of likely golf nations: a misread tiny flag becomes null
// rather than some obscure country. Anything else can still be set in Manage Players.
//
// Plain dependency-free .mjs on purpose: it is shared by lib/parse-trackman.ts (server, and
// scripts/flag-vision-test.mjs under plain Node), app/api/confirm-week and the admin review
// screen (browser), none of which should pull in anything else to validate a code.

export const FLAG_CODES = new Set([
  // Europe
  'GB', 'IE', 'FR', 'DE', 'NL', 'BE', 'LU', 'CH', 'AT', 'IT', 'ES', 'PT', 'SE', 'DK', 'NO', 'FI', 'IS',
  'PL', 'CZ', 'SK', 'HU', 'GR', 'TR', 'RO', 'BG', 'HR', 'SI', 'RS', 'UA', 'EE', 'LV', 'LT', 'MT', 'CY', 'RU',
  // Americas
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE',
  // Middle East and Asia
  'AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'LB', 'JO', 'IL', 'IN', 'PK', 'BD', 'LK', 'NP', 'CN', 'JP', 'KR',
  'SG', 'MY', 'TH', 'PH', 'ID', 'HK', 'VN',
  // Africa
  'ZA', 'KE', 'NG', 'EG', 'MA', 'ZW',
  // Oceania
  'AU', 'NZ', 'FJ',
])

/**
 * Returns an uppercase code from FLAG_CODES, or null. Never throws.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeCountryCode(value) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  const mapped = code === 'UK' ? 'GB' : code
  return FLAG_CODES.has(mapped) ? mapped : null
}
