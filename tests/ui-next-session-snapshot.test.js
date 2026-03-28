import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSessionSnapshot, serializeSessionSnapshot, SESSION_SNAPSHOT_VERSION } from '../ui-next/utils/session-snapshot.js';
import { TARGET_SELECTION_MODES } from '../ui-next/utils/simulator-settings.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';

test('normalizeSessionSnapshot fills defaults and preserves replay override entries', () => {
  const snapshot = normalizeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
      limitBreakLevelsByPartyIndex: { 0: 4, 1: 3, 2: 2 },
      skillSetsByPartyIndex: { 0: ['46000001', 46400001] },
    },
    simulatorSettings: {
      targetSelection: {
        enemyMode: TARGET_SELECTION_MODES.MANUAL,
      },
      captureUntilBattleEnd: true,
    },
    replayScript: {
      turns: [
        {
          turn: 1,
          slots: [{ styleId: 1001, skillId: 2001 }],
          overrideEntries: [
            {
              type: REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
              payload: [{ position: 0, outcome: 'Break', enemyIndexes: [0, 1] }],
            },
          ],
        },
      ],
    },
  });

  assert.equal(snapshot.version, SESSION_SNAPSHOT_VERSION);
  assert.equal(snapshot.setup.isFrontFilled, true);
  assert.equal(snapshot.simulatorSettings.targetSelection.enemyMode, TARGET_SELECTION_MODES.MANUAL);
  assert.equal(snapshot.simulatorSettings.captureUntilBattleEnd, true);
  assert.equal(snapshot.validationPolicy.allowUseCountOverflow, true);
  assert.deepEqual(snapshot.setup.skillSetsByPartyIndex['0'], [46000001, 46400001]);
  assert.deepEqual(
    snapshot.replayScript.turns[0].overrideEntries.find(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
    )?.payload,
    [{ position: 0, outcome: 'Break', enemyIndexes: [0, 1] }]
  );
});

test('serializeSessionSnapshot writes a round-trippable JSON payload', () => {
  const text = serializeSessionSnapshot({
    setup: {
      styleIds: [1001, 1002, 1003, null, null, null],
      supportStyleIds: [null, null, null, null, null, null],
    },
    replayScript: {
      turns: [],
    },
  });

  const parsed = JSON.parse(text);
  assert.equal(parsed.version, SESSION_SNAPSHOT_VERSION);
  assert.equal(parsed.validationPolicy.allowInsufficientSp, true);
  assert.equal(parsed.simulatorSettings.captureUntilBattleEnd, true);
  assert.deepEqual(parsed.setup.styleIds.slice(0, 3), [1001, 1002, 1003]);
  assert.deepEqual(parsed.setup.skillSetsByPartyIndex, {});
});
