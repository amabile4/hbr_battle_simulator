import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSkillTypeIconUrl,
  sortStatusEffectsForStatusTab,
} from '../ui-next/utils/char-detail-popup.js';

test('sortStatusEffectsForStatusTab keeps special statuses first', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'AttackUp', remaining: 1 },
    { statusType: 'ActionDisabled', remaining: 1 },
    { statusType: 'Reinforce', remaining: 1 },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.statusType),
    ['Reinforce', 'ActionDisabled', 'AttackUp']
  );
});

test('sortStatusEffectsForStatusTab sorts known types by skill_type id ascending', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'MindEye', remaining: 1 },
    { statusType: 'CriticalRateUp', remaining: 1 },
    { statusType: 'AttackUp', remaining: 1 },
    { statusType: 'Funnel', remaining: 1 },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.statusType),
    ['AttackUp', 'Funnel', 'CriticalRateUp', 'MindEye']
  );
});

test('sortStatusEffectsForStatusTab places unknown status after mapped statuses', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'SpeedUp', remaining: 1 },
    { statusType: 'AttackUp', remaining: 1 },
    { statusType: 'DefenseDown', remaining: 1 },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.statusType),
    ['AttackUp', 'DefenseDown', 'SpeedUp']
  );
});

test('resolveSkillTypeIconUrl uses ui dead icon for Dead status', () => {
  const url = resolveSkillTypeIconUrl('Dead');

  assert.match(url, /assets\/ui\/dead\.webp$/);
});
