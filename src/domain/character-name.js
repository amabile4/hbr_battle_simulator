const DASH_SPLIT_RE = /\s*—\s*/;
const NAME_SPLIT_RE = /[\s　]+/;

export function splitCharacterNameSegments(name) {
  return String(name ?? '')
    .split(DASH_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function extractJapaneseNickname(segment) {
  return String(segment ?? '')
    .trim()
    .split(NAME_SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean)[0] ?? '';
}

export function extractGivenName(name) {
  const tokens = String(name ?? '')
    .trim()
    .split(NAME_SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length >= 2) {
    return tokens.at(-1) ?? '';
  }
  return tokens[0] ?? '';
}

export function measureLabelLength(label) {
  return Array.from(String(label ?? '').trim()).length;
}

/**
 * Extracts the shortest viable name for a character from their full raw name.
 * 
 * @param {string} rawFullCharacterName e.g., "茅森月城 — 茅森 — アーさん" or just "茅森月城"
 * @param {string} [fallbackId] e.g., "RKayamori"
 * @returns {string} The shortest name variant
 */
export function resolveShortCharacterName(rawFullCharacterName, fallbackId = '') {
  const primaryName = String(rawFullCharacterName ?? fallbackId).trim();
  const segments = splitCharacterNameSegments(primaryName);
  const fullName = String(segments[0] ?? fallbackId).trim();
  const nickname = extractJapaneseNickname(segments[2]);
  const givenName = extractGivenName(fullName);
  const candidates = [...new Set([givenName, nickname, fullName].map((label) => String(label ?? '').trim()))]
    .filter(Boolean);
  
  if (candidates.length > 0) {
    return candidates.reduce((shortest, candidate) => {
      return measureLabelLength(candidate) < measureLabelLength(shortest) ? candidate : shortest;
    });
  }
  return primaryName || 'Unknown';
}
