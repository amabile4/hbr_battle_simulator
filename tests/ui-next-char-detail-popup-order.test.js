import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getStatusLabel,
  resolveSkillTypeIconUrl,
  sortStatusEffectsForStatusTab,
} from '../ui-next/utils/char-detail-popup.js';

test('Sprightly uses the 軽快 label and skill type icon', () => {
  assert.equal(getStatusLabel('Sprightly'), '軽快');
  assert.match(resolveSkillTypeIconUrl('Sprightly'), /assets\/skill_type\/Sprightly\.webp$/);
});

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

test('sortStatusEffectsForStatusTab sorts by category then skill_type id ascending', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'MindEye', remaining: 1 },
    { statusType: 'CriticalRateUp', remaining: 1 },
    { statusType: 'AttackUp', remaining: 1 },
    { statusType: 'Funnel', remaining: 1 },
  ]);

  // AttackUp(1b,30), CriticalRateUp(1b,70) → category (1)b first
  // Funnel(2,50), MindEye(2,187) → category (2) after
  assert.deepEqual(
    sorted.map((item) => item.statusType),
    ['AttackUp', 'CriticalRateUp', 'Funnel', 'MindEye']
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

test('sortStatusEffectsForStatusTab groups same statusType by category then element', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'AttackUp', remaining: 2, elements: ['Dark'] },
    { statusType: 'AttackUp', remaining: 2, elements: ['Fire'] },
    { statusType: 'AttackUp', remaining: 2, elements: [] },
    { statusType: 'AttackUp', remaining: 2, elements: ['Ice'] },
  ]);

  // §2.2: (1)a (属性付き: Fire→Ice→Dark) → (1)b (属性なし)
  const elements = sorted.map((item) => (item.elements?.[0] ?? ''));
  assert.deepEqual(elements, ['Fire', 'Ice', 'Dark', '']);
});

test('sortStatusEffectsForStatusTab sorts by category then element then power', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.1, elements: ['Ice'] },
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.3, elements: ['Fire'] },
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.2, elements: ['Fire'] },
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.15, elements: [] },
  ]);

  // §2.2: (1)a (Fire→Fire→Ice) → (1)b (属性なし)
  // 同一属性内は power 降順
  assert.deepEqual(
    sorted.map((item) => [(item.elements?.[0] ?? ''), item.power]),
    [['Fire', 0.3], ['Fire', 0.2], ['Ice', 0.1], ['', 0.15]]
  );
});

test('sortStatusEffectsForStatusTab orders same statusType as Eternal then Turn then Count before power', () => {
  const sorted = sortStatusEffectsForStatusTab([
    { statusType: 'AttackUp', exitCond: 'Count', remaining: 2, power: 0.9, effectId: 3 },
    { statusType: 'AttackUp', exitCond: 'TurnEnd', remaining: 3, power: 0.5, effectId: 2 },
    { statusType: 'AttackUp', exitCond: 'Eternal', remaining: 0, power: 0.1, effectId: 1 },
  ]);

  assert.deepEqual(
    sorted.map((item) => [item.exitCond, item.power]),
    [['Eternal', 0.1], ['TurnEnd', 0.5], ['Count', 0.9]]
  );
});

test('resolveSkillTypeIconUrl uses ui dead icon for Dead status', () => {
  const url = resolveSkillTypeIconUrl('Dead');

  assert.match(url, /assets\/ui\/dead\.webp$/);
});
