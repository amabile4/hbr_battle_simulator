export {
  ACTION_OUTCOME_TYPES,
  buildActionOutcomeOverrideEntry,
  getActionOutcomeOverridesFromOverrideEntries,
  getActionOutcomeOverridesFromReplayTurn,
  getAllKilledEnemyIndexes,
  getBreakEnemyIndexesForPosition,
  getKillEnemyIndexesForPosition,
  normalizeActionOutcomeOverride,
  normalizeActionOutcomeOverrides,
  setBreakEnemyIndexesForPosition,
  setKillEnemyIndexesForPosition,
} from '../../src/domain/replay-turn-overrides.js';

function normalizeEnemyIndexes(enemyIndexes = []) {
  return [...new Set(
    (Array.isArray(enemyIndexes) ? enemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0)
  )].sort((left, right) => left - right);
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
