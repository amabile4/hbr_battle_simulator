import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
  REPLAY_OPERATION_TYPES,
  createEmptyLightweightReplayScript,
  createLightweightReplayScriptFromBaseSetup,
  normalizeLightweightReplayTurn,
  replayOperationRegistry,
} from '../src/ui/lightweight-replay-script.js';

test('operation registry keeps known operation definitions and preserves unknown envelopes', () => {
  assert.equal(replayOperationRegistry.has(REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA), true);
  assert.deepEqual(replayOperationRegistry.get(REPLAY_OPERATION_TYPES.RESERVE_INTERRUPT_OD), {
    timing: 'afterCommitReservation',
  });

  const turn = normalizeLightweightReplayTurn({
    turn: 3,
    slots: [{ styleId: 1001, skillId: 2001 }],
    operations: [
      { type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD, payload: { level: 3 } },
      { type: 'FutureOperation', marker: 'preserve-me' },
    ],
    note: 'memo',
  });

  assert.deepEqual(turn.operations, [
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD, payload: { level: 3 } },
    { type: 'FutureOperation', payload: { marker: 'preserve-me' } },
  ]);
  assert.equal(turn.note, 'memo');
});

test('createLightweightReplayScriptFromBaseSetup keeps stable core and turn list', () => {
  const existing = {
    version: LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
    setup: {
      setupEntries: [{ type: 'FutureSetup', payload: { enabled: true } }],
    },
    turns: [{ turn: 1, slots: [{ styleId: 1, skillId: 2 }] }],
  };

  const script = createLightweightReplayScriptFromBaseSetup(
    {
      styleIds: [101, 102, 103, 104, 105, 106],
      supportStyleIdsByPartyIndex: { 0: 1001408 },
      supportLimitBreakLevelsByPartyIndex: { 0: 3 },
      initialOdGauge: 55,
      initialDpStateByPartyIndex: { 0: { currentDp: 90, effectiveDpCap: 100 } },
      initialBreakByPartyIndex: { 1: true },
      initialMotivationByPartyIndex: { 2: 5 },
    },
    existing
  );

  assert.equal(script.version, LIGHTWEIGHT_REPLAY_SCRIPT_VERSION);
  assert.deepEqual(script.setup.styleIds, [101, 102, 103, 104, 105, 106]);
  assert.deepEqual(script.setup.supportStyleIdsByPartyIndex, { 0: 1001408 });
  assert.deepEqual(script.setup.supportLimitBreakLevelsByPartyIndex, { 0: 3 });
  assert.equal(script.setup.initialOdGauge, 55);
  assert.deepEqual(script.setup.initialDpStateByPartyIndex, { 0: { currentDp: 90, effectiveDpCap: 100 } });
  assert.deepEqual(script.setup.initialBreakByPartyIndex, { 1: true });
  assert.deepEqual(script.setup.initialMotivationByPartyIndex, { 2: 5 });
  assert.deepEqual(script.setup.setupEntries, [{ type: 'FutureSetup', payload: { enabled: true } }]);
  assert.equal(script.turns.length, 1);
  assert.deepEqual(script.turns[0].slots[0], {
    styleId: 1,
    skillId: 2,
    target: { type: 'none' },
  });
});

test('createEmptyLightweightReplayScript seeds empty fixed-width setup and turns', () => {
  const script = createEmptyLightweightReplayScript();

  assert.equal(script.version, LIGHTWEIGHT_REPLAY_SCRIPT_VERSION);
  assert.deepEqual(script.setup.styleIds, [null, null, null, null, null, null]);
  assert.deepEqual(script.turns, []);
});
