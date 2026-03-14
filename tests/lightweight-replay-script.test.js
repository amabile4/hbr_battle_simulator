import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyReplayOverrideEntriesToScenarioTurn,
  LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
  REPLAY_OPERATION_TYPES,
  REPLAY_OVERRIDE_ENTRY_TYPES,
  REPLAY_SETUP_ENTRY_TYPES,
  createEmptyLightweightReplayScript,
  createLightweightReplayScriptFromBaseSetup,
  normalizeLightweightReplayTurn,
  replayOperationRegistry,
  replayOverrideEntryRegistry,
  replaySetupEntryRegistry,
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

test('override registry applies known scenario fields and warns only for unknown types', () => {
  assert.equal(replayOverrideEntryRegistry.has(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ACTION), true);

  const warnings = [];
  const scenarioTurn = applyReplayOverrideEntriesToScenarioTurn(
    [
      { type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ACTION, payload: 'Slash' },
      { type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ATTACK_TARGET_CHARACTER_IDS, payload: ['A1', 'A2'] },
      { type: 'FutureOverride', payload: { keep: true } },
    ],
    { commit: true },
    warnings
  );

  assert.equal(scenarioTurn.enemyAction, 'Slash');
  assert.deepEqual(scenarioTurn.enemyAttackTargetCharacterIds, ['A1', 'A2']);
  assert.deepEqual(warnings, ['override entry ignored: FutureOverride']);
});

test('setup registry migrates legacy pre-state fields into setupEntries and preserves explicit overrides', () => {
  assert.equal(replaySetupEntryRegistry.has(REPLAY_SETUP_ENTRY_TYPES.INITIAL_DP_STATE_BY_PARTY_INDEX), true);
  assert.equal(replaySetupEntryRegistry.has(REPLAY_SETUP_ENTRY_TYPES.TOKEN_STATE_BY_PARTY_INDEX), true);

  const existing = {
    version: LIGHTWEIGHT_REPLAY_SCRIPT_VERSION,
    setup: {
      setupEntries: [
        { type: 'FutureSetup', payload: { enabled: true } },
        { type: REPLAY_SETUP_ENTRY_TYPES.INITIAL_BREAK_BY_PARTY_INDEX, payload: { 4: true } },
      ],
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
      tokenStateByPartyIndex: { 0: { current: 4, min: 0, max: 10 } },
    },
    existing
  );

  const setupEntriesByType = Object.fromEntries(
    script.setup.setupEntries.map((entry) => [String(entry.type), entry.payload])
  );

  assert.equal(script.version, LIGHTWEIGHT_REPLAY_SCRIPT_VERSION);
  assert.deepEqual(script.setup.styleIds, [101, 102, 103, 104, 105, 106]);
  assert.deepEqual(script.setup.supportStyleIdsByPartyIndex, { 0: 1001408 });
  assert.deepEqual(script.setup.supportLimitBreakLevelsByPartyIndex, { 0: 3 });
  assert.equal(script.setup.initialOdGauge, 55);
  assert.equal('initialDpStateByPartyIndex' in script.setup, false);
  assert.equal('initialBreakByPartyIndex' in script.setup, false);
  assert.equal('initialMotivationByPartyIndex' in script.setup, false);
  assert.deepEqual(setupEntriesByType[REPLAY_SETUP_ENTRY_TYPES.INITIAL_DP_STATE_BY_PARTY_INDEX], {
    0: { currentDp: 90, effectiveDpCap: 100 },
  });
  assert.deepEqual(setupEntriesByType[REPLAY_SETUP_ENTRY_TYPES.INITIAL_BREAK_BY_PARTY_INDEX], {
    4: true,
  });
  assert.deepEqual(setupEntriesByType[REPLAY_SETUP_ENTRY_TYPES.INITIAL_MOTIVATION_BY_PARTY_INDEX], {
    2: 5,
  });
  assert.deepEqual(setupEntriesByType[REPLAY_SETUP_ENTRY_TYPES.TOKEN_STATE_BY_PARTY_INDEX], {
    0: { current: 4, min: 0, max: 10 },
  });
  assert.deepEqual(setupEntriesByType.FutureSetup, { enabled: true });
  assert.equal(script.turns.length, 1);
  assert.deepEqual(script.turns[0].slots[0], {
    styleId: 1,
    skillId: 2,
    target: { type: 'none' },
  });
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
  assert.equal(Array.isArray(script.setup.setupEntries), true);
  assert.deepEqual(script.setup.setupEntries.at(-1), { type: 'FutureSetup', payload: { enabled: true } });
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
