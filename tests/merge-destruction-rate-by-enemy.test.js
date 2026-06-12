/**
 * Tests for mergeDestructionRateByEnemy via applyEnemyStateOverrideSnapshot.
 *
 * Covers the 4 scenarios requested in PR #14 review:
 *   Case 1: Normal replay override — monotonic increase preserved
 *   Case 2: Snapshot value is higher — adopted
 *   Case 3: Summon replacing dead slot — rate resets to snapshot value (forced overwrite)
 *   Case 4: New slot (key not in currentMap) — snapshot value adopted
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEnemyStateOverrideSnapshot } from '../src/turn/turn-controller.js';
import { DEFAULT_DESTRUCTION_RATE_PERCENT } from '../src/config/battle-defaults.js';

function createTurnStateWithEnemies(destructionRateByEnemy = {}) {
  return {
    enemyState: {
      enemyCount: 3,
      enemyNamesByEnemy: { 0: 'Alpha', 1: 'Beta', 2: 'Gamma' },
      paramBorderByEnemy: { 0: 50, 1: 50, 2: 50 },
      enemyDpByEnemy: { 0: 1000000, 1: 1000000, 2: 1000000 },
      damageRatesByEnemy: { 0: { Fire: 100 }, 1: { Fire: 100 }, 2: { Fire: 100 } },
      destructionRateByEnemy: { ...destructionRateByEnemy },
      destructionRateCapByEnemy: { 0: 300, 1: 300, 2: 300 },
      destructionMultiplierByEnemy: { 0: 1, 1: 1, 2: 1 },
      odRateByEnemy: { 0: 0, 1: 0, 2: 0 },
      eShieldStateByEnemy: {},
      extraHpGaugeStateByEnemy: {},
      absorbElementsByEnemy: { 0: [], 1: [], 2: [] },
      breakStateByEnemy: {},
      statuses: [],
      allEnemiesDefeated: false,
    },
  };
}

// --- Case 1: Normal replay override — snapshot lower than current ---
test('Case 1: applyEnemyStateOverrideSnapshot preserves current rate when snapshot is lower', () => {
  const turnState = createTurnStateWithEnemies({ 0: 316.79, 1: 200, 2: 150 });
  const snapshot = {
    enemyDestructionRates: { 0: 292.49, 1: 180, 2: 150 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot);

  // Snapshot is lower for slots 0 and 1, so current values should be kept
  assert.equal(turnState.enemyState.destructionRateByEnemy['0'], 316.79);
  assert.equal(turnState.enemyState.destructionRateByEnemy['1'], 200);
  assert.equal(turnState.enemyState.destructionRateByEnemy['2'], 150);
});

// --- Case 2: Snapshot value is higher — adopted ---
test('Case 2: applyEnemyStateOverrideSnapshot adopts snapshot when snapshot is higher', () => {
  const turnState = createTurnStateWithEnemies({ 0: 200, 1: 150 });
  const snapshot = {
    enemyDestructionRates: { 0: 400, 1: 300 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot);

  assert.equal(turnState.enemyState.destructionRateByEnemy['0'], 400);
  assert.equal(turnState.enemyState.destructionRateByEnemy['1'], 300);
});

// --- Case 3: Summon replacing dead slot — rate resets to DEFAULT_DESTRUCTION_RATE_PERCENT ---
test('Case 3: applyEnemyStateOverrideSnapshot resets rate for summon-forced slot', () => {
  // Previous enemy in slot 0 reached 311.46% destruction rate
  const turnState = createTurnStateWithEnemies({ 0: 311.46, 1: 100 });
  // Summon operation sets slot 0 to DEFAULT_DESTRUCTION_RATE_PERCENT
  const snapshot = {
    enemyDestructionRates: { 0: DEFAULT_DESTRUCTION_RATE_PERCENT, 1: 100 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot, {
    forceDestructionRateKeys: new Set(['0']),
  });

  // Slot 0 should be reset to DEFAULT_DESTRUCTION_RATE_PERCENT, NOT Math.max(311.46, 100)
  assert.equal(
    turnState.enemyState.destructionRateByEnemy['0'],
    DEFAULT_DESTRUCTION_RATE_PERCENT,
    `Expected ${DEFAULT_DESTRUCTION_RATE_PERCENT}, got ${turnState.enemyState.destructionRateByEnemy['0']}`
  );
  assert.equal(turnState.enemyState.destructionRateByEnemy['1'], 100);
});

// --- Case 4: New slot (key not in currentMap) ---
test('Case 4: applyEnemyStateOverrideSnapshot adopts snapshot for new slot key', () => {
  const turnState = createTurnStateWithEnemies({ 0: 200 });
  const snapshot = {
    enemyDestructionRates: { 0: 150, 1: 100 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot);

  // Slot 0: current (200) > snapshot (150), so kept
  assert.equal(turnState.enemyState.destructionRateByEnemy['0'], 200);
  // Slot 1: new slot, snapshot value adopted
  assert.equal(turnState.enemyState.destructionRateByEnemy['1'], 100);
});

// --- Edge: forceDestructionRateKeys not provided — pure monotonic merge ---
test('Without forceDestructionRateKeys, behaves as pure monotonic merge', () => {
  const turnState = createTurnStateWithEnemies({ 0: 311.46 });
  const snapshot = {
    enemyDestructionRates: { 0: 100 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot);

  // Without force keys, Math.max applies: 311.46 > 100
  assert.equal(turnState.enemyState.destructionRateByEnemy['0'], 311.46);
});

// --- Edge: forceDestructionRateKeys with multiple keys ---
test('forceDestructionRateKeys with multiple keys resets only those slots', () => {
  const turnState = createTurnStateWithEnemies({ 0: 500, 1: 400, 2: 300 });
  const snapshot = {
    enemyDestructionRates: { 0: 100, 1: 100, 2: 100 },
  };

  applyEnemyStateOverrideSnapshot(turnState, snapshot, {
    forceDestructionRateKeys: new Set(['0', '1']),
  });

  // Slots 0 and 1 are force-overwritten to 100
  assert.equal(turnState.enemyState.destructionRateByEnemy['0'], 100);
  assert.equal(turnState.enemyState.destructionRateByEnemy['1'], 100);
  // Slot 2: monotonic merge (Math.max(300, 100) = 300)
  assert.equal(turnState.enemyState.destructionRateByEnemy['2'], 300);
});
