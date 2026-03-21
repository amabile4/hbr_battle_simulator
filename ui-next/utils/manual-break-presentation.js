import { normalizeActionOutcomeOverrides } from './action-outcome-overrides.js';
import { resolveShortCharacterName } from '../../src/domain/character-name.js';

export function resolveManualBreakActorLabel(member = {}, store = null) {
  if (member?.shortName) {
    return member.shortName;
  }
  const characterId = String(member?.characterId ?? '').trim();
  const rawCharacter =
    characterId && typeof store?.getCharacterByLabel === 'function'
      ? store.getCharacterByLabel(characterId)
      : null;
  const primaryName = String(rawCharacter?.name ?? member?.characterName ?? characterId).trim();
  return resolveShortCharacterName(primaryName, characterId);
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
