import { MAX_PARTY_SIZE } from '../../src/domain/party.js';
import { clampEnemyCount } from '../../src/config/battle-defaults.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../../src/ui/lightweight-replay-script.js';

export const ACTION_OUTCOME_TYPES = Object.freeze({
  BREAK: 'Break',
  KILL: 'Kill',
});

function normalizePosition(position) {
  const numeric = Number(position);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= MAX_PARTY_SIZE) {
    return null;
  }
  return numeric;
}

function normalizeEnemyIndexes(enemyIndexes = [], enemyCount = null) {
  const normalizedEnemyCount = enemyCount !== null && enemyCount !== undefined && Number.isFinite(Number(enemyCount))
    ? clampEnemyCount(enemyCount)
    : null;
  return [...new Set((Array.isArray(enemyIndexes) ? enemyIndexes : [])
    .map((enemyIndex) => Number(enemyIndex))
    .filter((enemyIndex) =>
      Number.isInteger(enemyIndex) &&
      enemyIndex >= 0 &&
      (normalizedEnemyCount === null || enemyIndex < normalizedEnemyCount)
    ))]
    .sort((left, right) => left - right);
}

export function normalizeActionOutcomeOverride(override = {}, enemyCount = null) {
  if (!override || typeof override !== 'object') {
    return null;
  }
  const position = normalizePosition(override.position);
  if (position === null) {
    return null;
  }
  const outcome = String(override.outcome ?? '').trim();
  if (outcome !== ACTION_OUTCOME_TYPES.BREAK && outcome !== ACTION_OUTCOME_TYPES.KILL) {
    return null;
  }
  const enemyIndexes = normalizeEnemyIndexes(override.enemyIndexes, enemyCount);
  if (enemyIndexes.length === 0) {
    return null;
  }
  return {
    position,
    outcome,
    enemyIndexes,
  };
}

export function normalizeActionOutcomeOverrides(overrides = [], enemyCount = null) {
  const merged = new Map();
  for (const override of Array.isArray(overrides) ? overrides : []) {
    const normalized = normalizeActionOutcomeOverride(override, enemyCount);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.position}:${normalized.outcome}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, normalized);
      continue;
    }
    merged.set(key, {
      position: normalized.position,
      outcome: normalized.outcome,
      enemyIndexes: normalizeEnemyIndexes(
        [...current.enemyIndexes, ...normalized.enemyIndexes],
        enemyCount
      ),
    });
  }
  return [...merged.values()].sort((left, right) => left.position - right.position);
}

export function getActionOutcomeOverridesFromOverrideEntries(
  overrideEntries = [],
  enemyCount = null
) {
  const entry = (Array.isArray(overrideEntries) ? overrideEntries : []).find(
    (candidate) => String(candidate?.type ?? '') === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
  );
  return normalizeActionOutcomeOverrides(entry?.payload, enemyCount);
}

export function buildActionOutcomeOverrideEntry(overrides = [], enemyCount = null) {
  const normalized = normalizeActionOutcomeOverrides(overrides, enemyCount);
  if (normalized.length === 0) {
    return null;
  }
  return {
    type: REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
    payload: normalized,
  };
}

export function getBreakEnemyIndexesForPosition(overrides = [], position) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return [];
  }
  const override = normalizeActionOutcomeOverrides(overrides).find(
    (candidate) =>
      candidate.position === normalizedPosition &&
      candidate.outcome === ACTION_OUTCOME_TYPES.BREAK
  );
  return override ? [...override.enemyIndexes] : [];
}

export function setBreakEnemyIndexesForPosition(
  overrides = [],
  position,
  enemyIndexes = [],
  enemyCount = null
) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return normalizeActionOutcomeOverrides(overrides, enemyCount);
  }
  const nextEnemyIndexes = normalizeEnemyIndexes(enemyIndexes, enemyCount);
  const filtered = normalizeActionOutcomeOverrides(overrides, enemyCount).filter(
    (override) =>
      !(override.position === normalizedPosition && override.outcome === ACTION_OUTCOME_TYPES.BREAK)
  );
  if (nextEnemyIndexes.length === 0) {
    return filtered;
  }
  return normalizeActionOutcomeOverrides(
    [
      ...filtered,
      {
        position: normalizedPosition,
        outcome: ACTION_OUTCOME_TYPES.BREAK,
        enemyIndexes: nextEnemyIndexes,
      },
    ],
    enemyCount
  );
}

export function getKillEnemyIndexesForPosition(overrides = [], position) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return [];
  }
  const override = normalizeActionOutcomeOverrides(overrides).find(
    (candidate) =>
      candidate.position === normalizedPosition &&
      candidate.outcome === ACTION_OUTCOME_TYPES.KILL
  );
  return override ? [...override.enemyIndexes] : [];
}

export function setKillEnemyIndexesForPosition(
  overrides = [],
  position,
  enemyIndexes = [],
  enemyCount = null
) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return normalizeActionOutcomeOverrides(overrides, enemyCount);
  }
  const nextEnemyIndexes = normalizeEnemyIndexes(enemyIndexes, enemyCount);
  const filtered = normalizeActionOutcomeOverrides(overrides, enemyCount).filter(
    (override) =>
      !(override.position === normalizedPosition && override.outcome === ACTION_OUTCOME_TYPES.KILL)
  );
  if (nextEnemyIndexes.length === 0) {
    return filtered;
  }
  return normalizeActionOutcomeOverrides(
    [
      ...filtered,
      {
        position: normalizedPosition,
        outcome: ACTION_OUTCOME_TYPES.KILL,
        enemyIndexes: nextEnemyIndexes,
      },
    ],
    enemyCount
  );
}

export function getAllKilledEnemyIndexes(overrides = []) {
  const all = normalizeActionOutcomeOverrides(overrides)
    .filter((o) => o.outcome === ACTION_OUTCOME_TYPES.KILL)
    .flatMap((o) => o.enemyIndexes);
  return [...new Set(all)].sort((a, b) => a - b);
}

export function formatBreakEnemySummary(enemyIndexes = [], enemyNamesByEnemy = {}) {
  const normalized = normalizeEnemyIndexes(enemyIndexes);
  if (normalized.length === 0) {
    return 'なし';
  }
  return normalized.map((enemyIndex) => {
    const enemyName = String(
      enemyNamesByEnemy[String(enemyIndex)] ?? enemyNamesByEnemy[enemyIndex] ?? ''
    ).trim();
    return enemyName ? `E${enemyIndex + 1} ${enemyName}` : `E${enemyIndex + 1}`;
  }).join(' / ');
}
