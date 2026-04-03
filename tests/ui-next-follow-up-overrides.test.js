import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFollowUpOverride,
  normalizeFollowUpOverrides,
  buildFollowUpOverrideEntry,
  getFollowUpOverridesFromOverrideEntries,
  getFollowUpEnemyIndexForPosition,
} from '../ui-next/utils/follow-up-overrides.js';
import {
  buildFollowUpChipModels,
} from '../ui-next/utils/follow-up-presentation.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';

test('follow-up-overrides: normalizeFollowUpOverride validates position (0-5)', () => {
  const valid = normalizeFollowUpOverride({ position: 3, enemyIndex: 0 });
  assert.deepEqual(valid, { position: 3, enemyIndex: 0 });

  const invalidPositionNegative = normalizeFollowUpOverride({ position: -1, enemyIndex: 0 });
  assert.equal(invalidPositionNegative, null);

  const invalidPosition6 = normalizeFollowUpOverride({ position: 6, enemyIndex: 0 });
  assert.equal(invalidPosition6, null);

  const outsideRange = normalizeFollowUpOverride({ position: 100, enemyIndex: 0 });
  assert.equal(outsideRange, null);
});

test('follow-up-overrides: normalizeFollowUpOverride validates enemyIndex', () => {
  const validEnemy0 = normalizeFollowUpOverride({ position: 3, enemyIndex: 0 });
  assert.deepEqual(validEnemy0, { position: 3, enemyIndex: 0 });

  const validEnemy5 = normalizeFollowUpOverride({ position: 3, enemyIndex: 5 });
  assert.deepEqual(validEnemy5, { position: 3, enemyIndex: 5 });

  const negativeEnemy = normalizeFollowUpOverride({ position: 3, enemyIndex: -1 });
  assert.equal(negativeEnemy, null);

  const nonIntegerEnemy = normalizeFollowUpOverride({ position: 3, enemyIndex: 1.5 });
  assert.equal(nonIntegerEnemy, null);
});

test('follow-up-overrides: normalizeFollowUpOverrides deduplicates by position', () => {
  const overrides = [
    { position: 3, enemyIndex: 0 },
    { position: 3, enemyIndex: 1 }, // duplicate position, should keep first
    { position: 4, enemyIndex: 2 },
  ];
  const normalized = normalizeFollowUpOverrides(overrides, 8);
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized[0], { position: 3, enemyIndex: 0 }); // First occurrence
  assert.deepEqual(normalized[1], { position: 4, enemyIndex: 2 });
});

test('follow-up-overrides: normalizeFollowUpOverrides filters invalid enemyIndex', () => {
  const overrides = [
    { position: 3, enemyIndex: 0 },
    { position: 4, enemyIndex: 10 }, // enemyIndex >= maxEnemyCount
  ];
  const normalized = normalizeFollowUpOverrides(overrides, 5);
  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0], { position: 3, enemyIndex: 0 });
});

test('follow-up-overrides: buildFollowUpOverrideEntry creates correct entry', () => {
  const overrides = [
    { position: 3, enemyIndex: 1 },
    { position: 4, enemyIndex: 0 },
  ];
  const entry = buildFollowUpOverrideEntry(overrides);
  assert.equal(entry.type, REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES);
  assert.deepEqual(entry.payload, overrides);
});

test('follow-up-overrides: getFollowUpOverridesFromOverrideEntries extracts data', () => {
  const overrideEntries = [
    {
      type: REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES,
      payload: [{ position: 3, enemyIndex: 0 }],
    },
  ];
  const result = getFollowUpOverridesFromOverrideEntries(overrideEntries);
  assert.deepEqual(result, [{ position: 3, enemyIndex: 0 }]);
});

test('follow-up-overrides: getFollowUpOverridesFromOverrideEntries returns empty array when not found', () => {
  const overrideEntries = [
    {
      entryType: 'SOME_OTHER_TYPE',
      data: { some: 'data' },
    },
  ];
  const result = getFollowUpOverridesFromOverrideEntries(overrideEntries);
  assert.deepEqual(result, []);
});

test('follow-up-overrides: getFollowUpEnemyIndexForPosition returns correct index', () => {
  const overrides = [
    { position: 3, enemyIndex: 2 },
    { position: 4, enemyIndex: 0 },
  ];
  assert.equal(getFollowUpEnemyIndexForPosition(overrides, 3), 2);
  assert.equal(getFollowUpEnemyIndexForPosition(overrides, 4), 0);
  assert.equal(getFollowUpEnemyIndexForPosition(overrides, 5), null);
});

test('follow-up-presentation: buildFollowUpChipModels formats chip labels', () => {
  const overrides = [
    { position: 3, enemyIndex: 0 },
  ];

  const members = [
    { position: 3, characterId: 'ALICE', characterName: 'Alice', shortName: 'Alice' },
  ];
  const enemyNamesByEnemy = { '0': 'Enemy1', '1': 'Enemy2' };
  const resolvedSkillNameByPosition = { '3': 'スペシャル攻撃' };

  const chips = buildFollowUpChipModels({
    overrides,
    members,
    enemyNamesByEnemy,
    resolvedSkillNameByPosition,
  });

  assert.ok(Array.isArray(chips));
  assert.equal(chips.length, 1);
  assert.ok(chips[0].label);
  assert.match(chips[0].label, /Alice/);
  assert.match(chips[0].label, /Enemy1/);
  assert.match(chips[0].label, /スペシャル攻撃/);
  assert.equal(chips[0].position, 3);
  assert.equal(chips[0].enemyIndex, 0);
});

test('follow-up-presentation: buildFollowUpChipModels handles empty overrides', () => {
  const chips = buildFollowUpChipModels({ overrides: [] });
  assert.equal(chips.length, 0);
});

test('follow-up-presentation: buildFollowUpChipModels handles missing party member', () => {
  const overrides = [
    { position: 3, enemyIndex: 0 },
  ];
  const chips = buildFollowUpChipModels({
    overrides,
    members: [],  // no member at position 3
    enemyNamesByEnemy: { '0': 'Enemy1' },
  });
  // Should skip overrides with no matching member
  assert.ok(Array.isArray(chips));
  assert.equal(chips.length, 0);
});

test('follow-up-presentation: buildFollowUpChipModels uses default skill name', () => {
  const overrides = [
    { position: 4, enemyIndex: 1 },
  ];
  const members = [
    { position: 4, characterId: 'BOB', characterName: 'Bob', shortName: 'Bob' },
  ];

  const chips = buildFollowUpChipModels({
    overrides,
    members,
    enemyNamesByEnemy: { '1': 'BossEnemy' },
    // resolvedSkillNameByPosition not provided → defaults to '追撃'
  });

  assert.equal(chips.length, 1);
  assert.match(chips[0].label, /追撃/);
  assert.match(chips[0].label, /BossEnemy/);
});
