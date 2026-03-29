import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFieldDisplayEntries,
  isDisplayableTalismanState,
} from '../ui-next/utils/field-state-display.js';

test('buildFieldDisplayEntries includes zone metadata with element, multiplier and duration', () => {
  const entries = buildFieldDisplayEntries({
    zoneState: {
      type: 'Fire',
      powerRate: 1.8,
      remainingTurns: 7,
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, 'Zone');
  assert.equal(entries[0].name, '火ゾーン');
  assert.equal(entries[0].duration, '7T');
  assert.deepEqual(entries[0].meta, ['火', '倍率1.80x']);
});

test('buildFieldDisplayEntries uses eternal label when remainingTurns is null', () => {
  const entries = buildFieldDisplayEntries({
    territoryState: {
      type: 'Ice',
      powerRate: 1.5,
      remainingTurns: null,
    },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, 'Territory');
  assert.equal(entries[0].duration, '永続');
});

test('default inactive talisman state is not displayable', () => {
  assert.equal(isDisplayableTalismanState({ active: false, level: 0, maxLevel: 10 }), false);
  const entries = buildFieldDisplayEntries({
    talismanState: { active: false, level: 0, maxLevel: 10 },
  });
  assert.equal(entries.length, 0);
});

test('active talisman state is included with level metadata', () => {
  const entries = buildFieldDisplayEntries({
    talismanState: { active: true, level: 3, maxLevel: 10 },
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, 'Talisman');
  assert.deepEqual(entries[0].meta, ['有効', 'Lv3/10']);
});
