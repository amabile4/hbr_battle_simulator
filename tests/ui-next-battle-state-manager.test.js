import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { getStore } from './helpers.js';

function createPartySnapshot() {
  return {
    isFrontFilled: true,
    styleIds: [1005504, 1004107, 1001408, null, null, null],
    supportStyleIds: [null, null, null, null, null, null],
    limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    skillSetsByPartyIndex: {},
  };
}

test('BattleStateManager maps enemy preemptiveField to initial zoneState before battle-start passives', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
    preemptiveField: 'thunder',
  });

  assert.equal(state.turnState.zoneState?.type, 'Thunder');
  assert.equal(state.turnState.zoneState?.sourceSide, 'enemy');
  assert.equal(state.turnState.zoneState?.remainingTurns, null);
});

test('BattleStateManager keeps initial zoneState null when enemy preemptiveField is none', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
    preemptiveField: 'none',
  });

  assert.equal(state.turnState.zoneState, null);
});
