import { ACTION_OUTCOME_TYPES, normalizeActionOutcomeOverrides } from './action-outcome-overrides.js';
import { resolveShortCharacterName } from '../../src/domain/character-name.js';

export function resolveManualBreakActorLabel(member = {}, store = null) {
  const characterId = String(member?.characterId ?? '').trim();
  const rawCharacter =
    characterId && typeof store?.getCharacterByLabel === 'function'
      ? store.getCharacterByLabel(characterId)
      : null;
  if (rawCharacter?.name) {
    return resolveShortCharacterName(String(rawCharacter.name).trim(), characterId);
  }
  if (member?.shortName) {
    return member.shortName;
  }
  return resolveShortCharacterName(String(member?.characterName ?? characterId).trim(), characterId);
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
  return normalizeActionOutcomeOverrides(overrides)
    .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.BREAK)
    .flatMap((override) => {
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

export function buildAutoBreakChipModels({
  actions = [],
  members = [],
  store = null,
  enemyNamesByEnemy = {},
} = {}) {
  const memberByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  const memberByCharacterId = new Map(
    (Array.isArray(members) ? members : [])
      .filter((member) => member?.characterId)
      .map((member) => [String(member.characterId), member])
  );
  const seen = new Set();
  const models = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    const enemyIndexes = Array.isArray(action?.autoBreakEnemyIndexes) ? action.autoBreakEnemyIndexes : [];
    if (enemyIndexes.length === 0) {
      continue;
    }
    const characterId = String(action?.actorCharacterId ?? action?.characterId ?? '').trim();
    const positionRaw = Number(action?.positionIndex ?? action?.actorPositionIndex);
    const position = Number.isFinite(positionRaw) ? positionRaw : null;
    const member =
      (characterId && memberByCharacterId.get(characterId)) ||
      (position != null ? memberByPosition.get(position) : null) ||
      null;
    const actorLabel = member
      ? resolveManualBreakActorLabel(member, store)
      : (position != null ? `P${position + 1}` : characterId || '?');
    for (const enemyIndex of enemyIndexes) {
      const normalizedEnemyIndex = Number(enemyIndex);
      if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
        continue;
      }
      const key = `${characterId || position || ''}:${Number(action?.skillId ?? 0)}:${normalizedEnemyIndex}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const enemyLabel = resolveManualBreakEnemyLabel(normalizedEnemyIndex, enemyNamesByEnemy);
      models.push({
        key,
        actorLabel,
        enemyLabel,
        label: `${actorLabel}→${enemyLabel} ブレイク (自動)`,
        position: position ?? -1,
        enemyIndex: normalizedEnemyIndex,
      });
    }
  }
  return models;
}

/**
 * DP枯渇による自動ブレイク（source:'auto', mode:'DownTurn'）のチップモデルを生成する。
 * enemyStatusChanges から DP 自動ブレイクを読み取り、EShield 自動ブレイクチップと
 * 重複しないよう autoBreakEnemyIndexes にない場合のみチップを追加する。
 *
 * @param {{ actions: Array, members: Array, store: object|null, enemyNamesByEnemy: object }} param0
 */
export function buildDpAutoBreakChipModels({
  actions = [],
  members = [],
  store = null,
  enemyNamesByEnemy = {},
} = {}) {
  const memberByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  const memberByCharacterId = new Map(
    (Array.isArray(members) ? members : [])
      .filter((member) => member?.characterId)
      .map((member) => [String(member.characterId), member])
  );
  const seen = new Set();
  const models = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    const existingAutoBreaks = Array.isArray(action?.autoBreakEnemyIndexes) ? action.autoBreakEnemyIndexes : [];
    const dpBreakChanges = (Array.isArray(action?.enemyStatusChanges) ? action.enemyStatusChanges : [])
      .filter(
        (change) =>
          String(change?.mode ?? '') === 'DownTurn' &&
          String(change?.source ?? '') === 'auto'
      );
    if (dpBreakChanges.length === 0) {
      continue;
    }
    const characterId = String(action?.actorCharacterId ?? action?.characterId ?? '').trim();
    const positionRaw = Number(action?.positionIndex ?? action?.actorPositionIndex);
    const position = Number.isFinite(positionRaw) ? positionRaw : null;
    const member =
      (characterId && memberByCharacterId.get(characterId)) ||
      (position != null ? memberByPosition.get(position) : null) ||
      null;
    const actorLabel = member
      ? resolveManualBreakActorLabel(member, store)
      : (position != null ? `P${position + 1}` : characterId || '?');
    for (const change of dpBreakChanges) {
      const normalizedEnemyIndex = Number(change?.targetIndex ?? -1);
      if (!Number.isInteger(normalizedEnemyIndex) || normalizedEnemyIndex < 0) {
        continue;
      }
      // EShield 自動ブレイクとの重複を避ける（autoBreakEnemyIndexes に既出のものはスキップ）
      if (existingAutoBreaks.includes(normalizedEnemyIndex)) {
        continue;
      }
      const key = `dp:${characterId || position || ''}:${Number(action?.skillId ?? 0)}:${normalizedEnemyIndex}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const enemyLabel = resolveManualBreakEnemyLabel(normalizedEnemyIndex, enemyNamesByEnemy);
      models.push({
        key,
        actorLabel,
        enemyLabel,
        label: `${actorLabel}→${enemyLabel} ブレイク (DP)`,
        position: position ?? -1,
        enemyIndex: normalizedEnemyIndex,
      });
    }
  }
  return models;
}

export function buildManualKillChipModels({
  overrides = [],
  members = [],
  store = null,
  enemyNamesByEnemy = {},
} = {}) {
  const memberByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  return normalizeActionOutcomeOverrides(overrides)
    .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.KILL)
    .flatMap((override) => {
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
          label: `${actorLabel}→${enemyLabel} 討伐`,
          position,
          enemyIndex: Number(enemyIndex),
        };
      });
    });
}

export function buildManualHpBreakChipModels({
  overrides = [],
  members = [],
  store = null,
  enemyNamesByEnemy = {},
} = {}) {
  const memberByPosition = new Map(
    (Array.isArray(members) ? members : []).map((member) => [Number(member?.position), member])
  );
  return normalizeActionOutcomeOverrides(overrides)
    .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.HP_BREAK)
    .flatMap((override) => {
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
          label: `${actorLabel}→${enemyLabel} HP破壊`,
          position,
          enemyIndex: Number(enemyIndex),
        };
      });
    });
}
