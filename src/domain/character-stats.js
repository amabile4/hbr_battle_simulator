export const CHARACTER_STAT_KEYS = Object.freeze(['str', 'dex', 'wis', 'spr', 'luk', 'con']);
export const SUPPORT_STAT_CONTRIBUTION_RATE = 0.1;

export function normalizeCharacterStats(source = null) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const entries = CHARACTER_STAT_KEYS.map((key) => [key, Number(source[key])]);
  return entries.every(
    ([key, value]) => source[key] !== null && source[key] !== undefined && Number.isFinite(value) && value > 0
  )
    ? Object.fromEntries(entries)
    : null;
}

export function normalizeStatsByPartyIndex(source = {}) {
  if (!source || typeof source !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(source)
      .map(([partyIndex, value]) => {
        const stats = normalizeCharacterStats(value?.stats);
        const supportStats = normalizeCharacterStats(value?.supportStats);
        return stats || supportStats
          ? [String(partyIndex), {
              ...(stats ? { stats } : {}),
              ...(supportStats ? { supportStats } : {}),
            }]
          : null;
      })
      .filter(Boolean)
  );
}

export function resolveStatsWithSupport(stats, supportStats = null) {
  const main = normalizeCharacterStats(stats);
  if (!main) {
    return null;
  }
  const support = normalizeCharacterStats(supportStats);
  return support
    ? Object.fromEntries(
        CHARACTER_STAT_KEYS.map((key) => [key, main[key] + support[key] * SUPPORT_STAT_CONTRIBUTION_RATE])
      )
    : main;
}
