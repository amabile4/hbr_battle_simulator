import { normalizeActionOutcomeOverrides } from './action-outcome-overrides.js';

const DASH_SPLIT_RE = /\s*—\s*/;
const NAME_SPLIT_RE = /[\s　]+/;

function splitCharacterNameSegments(name) {
  return String(name ?? '')
    .split(DASH_SPLIT_RE)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractJapaneseNickname(segment) {
  return String(segment ?? '')
    .trim()
    .split(NAME_SPLIT_RE)
    .map((token) => token.trim())
    .filter(Boolean)[0] ?? '';
}

function extractGivenName(name) {
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

function measureLabelLength(label) {
  return Array.from(String(label ?? '').trim()).length;
}

export function resolveManualBreakActorLabel(member = {}, store = null) {
  const characterId = String(member?.characterId ?? '').trim();
  const rawCharacter =
    characterId && typeof store?.getCharacterByLabel === 'function'
      ? store.getCharacterByLabel(characterId)
      : null;
  const primaryName = String(rawCharacter?.name ?? member?.characterName ?? characterId).trim();
  const segments = splitCharacterNameSegments(primaryName);
  const fullName = String(segments[0] ?? member?.characterName ?? characterId).trim();
  const nickname = extractJapaneseNickname(segments[2]);
  const givenName = extractGivenName(fullName);
  const candidates = [...new Set([givenName, nickname, fullName].map((label) => String(label ?? '').trim()))]
    .filter(Boolean);
  if (candidates.length > 0) {
    return candidates.reduce((shortest, candidate) => {
      return measureLabelLength(candidate) < measureLabelLength(shortest) ? candidate : shortest;
    });
  }
  return String(member?.characterName ?? characterId ?? '').trim() || 'Unknown';
}

export function resolveManualBreakEnemyLabel(enemyIndex, enemyNamesByEnemy = {}) {
  const enemyName = String(
    enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
  ).trim();
  if (enemyName) {
    return enemyName;
  }
  return `E${Number(enemyIndex) + 1}`;
}

export function buildManualBreakChipModels({
  overrides = [],
  members = [],
  store = null,
  enemyNamesByEnemy = {},
} = {}) {
  const memberByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  return normalizeActionOutcomeOverrides(overrides).flatMap((override) => {
    const position = Number(override?.position);
    const member = memberByPosition.get(position) ?? null;
    const actorLabel = member
      ? resolveManualBreakActorLabel(member, store)
      : `P${position + 1}`;
    return (Array.isArray(override?.enemyIndexes) ? override.enemyIndexes : []).map((enemyIndex) => {
      const enemyLabel = resolveManualBreakEnemyLabel(enemyIndex, enemyNamesByEnemy);
      return {
        key: `${position}:${enemyIndex}`,
        actorLabel,
        enemyLabel,
        label: `${actorLabel}→${enemyLabel} ブレイク`,
        position,
        enemyIndex: Number(enemyIndex),
      };
    });
  });
}
