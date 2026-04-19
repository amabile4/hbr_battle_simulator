import { MAX_PARTY_SIZE } from './party.js';
import { clampEnemyCount } from '../config/battle-defaults.js';

export const REPLAY_TURN_LEGACY_OVERRIDE_ENTRY_TYPES = Object.freeze({
  ACTION_OUTCOME_OVERRIDES: 'ActionOutcomeOverrides',
  FOLLOW_UP_OVERRIDES: 'FollowUpOverrides',
});

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
  const normalizedEnemyCount =
    enemyCount !== null && enemyCount !== undefined && Number.isFinite(Number(enemyCount))
      ? clampEnemyCount(enemyCount)
      : null;
  return [...new Set(
    (Array.isArray(enemyIndexes) ? enemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) =>
        Number.isInteger(enemyIndex) &&
        enemyIndex >= 0 &&
        (normalizedEnemyCount === null || enemyIndex < normalizedEnemyCount)
      )
  )].sort((left, right) => left - right);
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
    (candidate) =>
      String(candidate?.type ?? '') ===
      REPLAY_TURN_LEGACY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
  );
  return normalizeActionOutcomeOverrides(entry?.payload, enemyCount);
}

export function getActionOutcomeOverridesFromReplayTurn(replayTurn = {}, enemyCount = null) {
  const source = replayTurn && typeof replayTurn === 'object' ? replayTurn : {};
  if (Object.prototype.hasOwnProperty.call(source, 'actionOutcomeOverrides')) {
    return normalizeActionOutcomeOverrides(source.actionOutcomeOverrides, enemyCount);
  }
  return getActionOutcomeOverridesFromOverrideEntries(source.overrideEntries, enemyCount);
}

export function buildActionOutcomeOverrideEntry(overrides = [], enemyCount = null) {
  const normalized = normalizeActionOutcomeOverrides(overrides, enemyCount);
  if (normalized.length === 0) {
    return null;
  }
  return {
    type: REPLAY_TURN_LEGACY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
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
    .filter((override) => override.outcome === ACTION_OUTCOME_TYPES.KILL)
    .flatMap((override) => override.enemyIndexes);
  return [...new Set(all)].sort((left, right) => left - right);
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
    (candidate) =>
      String(candidate?.type ?? '') === REPLAY_TURN_LEGACY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES
  );
  return normalizeFollowUpOverrides(entry?.payload, enemyCount);
}

export function getFollowUpOverridesFromReplayTurn(replayTurn = {}, enemyCount = null) {
  const source = replayTurn && typeof replayTurn === 'object' ? replayTurn : {};
  if (Object.prototype.hasOwnProperty.call(source, 'followUpOverrides')) {
    return normalizeFollowUpOverrides(source.followUpOverrides, enemyCount);
  }
  return getFollowUpOverridesFromOverrideEntries(source.overrideEntries, enemyCount);
}

export function buildFollowUpOverrideEntry(overrides = [], enemyCount = null) {
  const normalized = normalizeFollowUpOverrides(overrides, enemyCount);
  if (normalized.length === 0) {
    return null;
  }
  return {
    type: REPLAY_TURN_LEGACY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES,
    payload: normalized,
  };
}

export function getFollowUpEnemyIndexForPosition(overrides = [], position) {
  const normalizedPosition = normalizePosition(position);
  if (normalizedPosition === null) {
    return null;
  }
  const entry = normalizeFollowUpOverrides(overrides).find(
    (item) => item.position === normalizedPosition
  );
  return entry ? Number(entry.enemyIndex) : null;
}
