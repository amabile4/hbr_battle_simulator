import { MAX_PARTY_SIZE } from '../../src/domain/party.js';
import { clampEnemyCount } from '../../src/config/battle-defaults.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../../src/ui/lightweight-replay-script.js';

function normalizePosition(position) {
  const numeric = Number(position);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= MAX_PARTY_SIZE) {
    return null;
  }
  return numeric;
}

function normalizeEnemyIndex(enemyIndex, enemyCount = null) {
  const numeric = Number(enemyIndex);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }
  if (enemyCount == null) {
    return numeric;
  }
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  if (numeric >= normalizedEnemyCount) {
    return null;
  }
  return numeric;
}

export function normalizeFollowUpOverride(override = {}, enemyCount = null) {
  if (!override || typeof override !== 'object') {
    return null;
  }
  const position = normalizePosition(override.position);
  if (position === null) {
    return null;
  }
  const enemyIndex = normalizeEnemyIndex(override.enemyIndex, enemyCount);
  if (enemyIndex === null) {
    return null;
  }
  return {
    position,
    enemyIndex,
  };
}

export function normalizeFollowUpOverrides(overrides = [], enemyCount = null) {
  const normalized = [];
  const consumedPositions = new Set();
  for (const override of Array.isArray(overrides) ? overrides : []) {
    const entry = normalizeFollowUpOverride(override, enemyCount);
    if (!entry) {
      continue;
    }
    if (consumedPositions.has(entry.position)) {
      continue;
    }
    consumedPositions.add(entry.position);
    normalized.push(entry);
  }
  return normalized.sort((left, right) => left.position - right.position);
}

export function getFollowUpOverridesFromOverrideEntries(
  overrideEntries = [],
  enemyCount = null
) {
  const entry = (Array.isArray(overrideEntries) ? overrideEntries : []).find(
    (candidate) => String(candidate?.type ?? '') === REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES
  );
  return normalizeFollowUpOverrides(entry?.payload, enemyCount);
}

export function buildFollowUpOverrideEntry(overrides = [], enemyCount = null) {
  const normalized = normalizeFollowUpOverrides(overrides, enemyCount);
  if (normalized.length === 0) {
    return null;
  }
  return {
    type: REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES,
    payload: normalized,
  };
}

export function getFollowUpEnemyIndexForPosition(overrides = [], position) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return null;
  }
  const entry = normalizeFollowUpOverrides(overrides).find((item) => item.position === normalizedPosition);
  return entry ? Number(entry.enemyIndex) : null;
}
