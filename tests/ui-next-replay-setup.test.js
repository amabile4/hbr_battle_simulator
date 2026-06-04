import test from 'node:test';
import assert from 'node:assert/strict';

import { REPLAY_SETUP_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';
import { buildReplaySetupFromPartySnapshot } from '../ui-next/utils/replay-setup.js';

function getSetupEntryPayloadByType(setup = {}, type) {
  return (setup?.setupEntries ?? []).find((entry) => entry?.type === type)?.payload ?? null;
}

test('buildReplaySetupFromPartySnapshot compacts belt selection into replay setup entry indexes', () => {
  const setup = buildReplaySetupFromPartySnapshot({
    styleIds: [1001, null, 1002, null, 1003, null],
    supportStyleIds: [2001, null, null, null, 2003, null],
    limitBreakLevelsByPartyIndex: { 0: 4, 2: 3, 4: 2 },
    skillSetsByPartyIndex: {
      0: [3001, 3002],
      2: [3003],
      4: [3004, 3005],
    },
    normalAttackElementsByPartyIndex: {
      0: ['Ice'],
      2: ['Fire'],
      4: ['Dark'],
    },
  });

  assert.deepEqual(setup.styleIds, [1001, 1002, 1003, null, null, null]);
  assert.deepEqual(setup.supportStyleIdsByPartyIndex, { 0: 2001, 2: 2003 });
  assert.deepEqual(setup.limitBreakLevelsByPartyIndex, { 0: 4, 1: 3, 2: 2 });
  assert.deepEqual(setup.skillSetsByPartyIndex, {
    0: [3001, 3002],
    1: [3003],
    2: [3004, 3005],
  });
  assert.deepEqual(
    getSetupEntryPayloadByType(setup, REPLAY_SETUP_ENTRY_TYPES.NORMAL_ATTACK_ELEMENTS_BY_PARTY_INDEX),
    {
      0: ['Ice'],
      1: ['Fire'],
      2: ['Dark'],
    }
  );
});

test('buildReplaySetupFromPartySnapshot compacts stats by filled party index', () => {
  const setup = buildReplaySetupFromPartySnapshot({
    styleIds: [1001, null, 1003],
    supportStyleIds: [null, null, null],
    limitBreakLevelsByPartyIndex: {},
    skillSetsByPartyIndex: {},
    statsByPartyIndex: {
      2: { stats: { str: 700, dex: 701, wis: 702, spr: 703, luk: 704, con: 705 } },
    },
  });

  assert.equal(setup.statsByPartyIndex['1'].stats.str, 700);
});

test('buildReplaySetupFromPartySnapshot omits empty bracelet payloads', () => {
  const setup = buildReplaySetupFromPartySnapshot({
    styleIds: [1001, 1002, 1003, null, null, null],
    supportStyleIds: [null, null, null, null, null, null],
    limitBreakLevelsByPartyIndex: { 0: 4, 1: 4, 2: 4 },
    normalAttackElementsByPartyIndex: {
      0: ['Fire', 'Ice'],
      1: ['Void'],
    },
  });

  assert.deepEqual(setup.styleIds, [1001, 1002, 1003, null, null, null]);
  assert.equal(
    getSetupEntryPayloadByType(setup, REPLAY_SETUP_ENTRY_TYPES.NORMAL_ATTACK_ELEMENTS_BY_PARTY_INDEX),
    null
  );
});
