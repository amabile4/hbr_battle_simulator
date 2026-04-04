import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuffListHtml,
  getDisplayableBuffs,
} from '../ui-next/utils/buff-display.js';

function extractAltList(html) {
  return [...String(html).matchAll(/alt="([^"]+)"/g)].map((match) => match[1]);
}

test('getDisplayableBuffs includes buff-like statuses and excludes debuffs', () => {
  const effects = [
    { statusType: 'AttackUp', remaining: 2 },
    { statusType: 'MindEye', remaining: 1 },
    { statusType: 'Funnel', remaining: 1 },
    { statusType: 'AttackDown', remaining: 2 },
    { statusType: 'ConfusionRandom', remaining: 2 },
    { statusType: 'CriticalRateUp', remaining: 0 },
    { statusType: 'CriticalDamageUp', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'DefenseUp', remaining: 3, metadata: { isDebuff: true } },
    { statusType: 'DebuffGuard', remaining: 2, metadata: { specialStatusTypeId: 146 } },
  ];

  const actual = getDisplayableBuffs(effects).map((effect) => effect.statusType);
  assert.deepEqual(actual, ['AttackUp', 'MindEye', 'Funnel', 'CriticalDamageUp']);
});

test('buildBuffListHtml follows status detail order and shows only adopted effects', () => {
  const html = buildBuffListHtml([
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.4, effectId: 701 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.35, effectId: 702 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.1, effectId: 703 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Only', power: 0.8, effectId: 704 },
    { statusType: 'MindEye', remaining: 1, limitType: 'Count', exitCond: 'Count', power: 0.5, effectId: 801 },
    { statusType: 'MindEye', remaining: 1, limitType: 'Count', exitCond: 'Count', power: 0.45, effectId: 802 },
    { statusType: 'MindEye', remaining: 1, limitType: 'Only', power: 0.6, effectId: 803 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 101 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 102 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Only', power: 0.6, effectId: 103 },
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.2, effectId: 201 },
    { statusType: 'CriticalRateUp', remaining: 2, limitType: 'Only', power: 0.25, effectId: 202 },
  ]);

  const altList = extractAltList(html);

  assert.deepEqual(altList, [
    'AttackUp',
    'AttackUp',
    'CriticalRateUp',
    'CriticalRateUp',
    'MindEye',
    'MindEye',
    'Funnel',
  ]);
});

test('buildBuffListHtml uses Count side on tie between Count sum and Only', () => {
  const html = buildBuffListHtml([
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 1 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 2 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Only', power: 0.4, effectId: 3 },
  ]);

  const altList = extractAltList(html);
  assert.deepEqual(altList, ['AttackUp', 'AttackUp']);
});

test('buildBuffListHtml adopts Count side for DefenseUp when Count sum is stronger than Only', () => {
  const html = buildBuffListHtml([
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 11 },
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.25, effectId: 12 },
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Only', power: 0.5, effectId: 13 },
  ]);

  const altList = extractAltList(html);
  assert.deepEqual(altList, ['DefenseUp', 'DefenseUp']);
});

test('buildBuffListHtml adopts Only side when Only is stronger than Count sum for Up-family statuses', () => {
  const cases = [
    { statusType: 'AttackUp', expected: ['AttackUp'] },
    { statusType: 'CriticalRateUp', expected: ['CriticalRateUp'] },
    { statusType: 'CriticalDamageUp', expected: ['CriticalDamageUp'] },
  ];

  for (const { statusType, expected } of cases) {
    const html = buildBuffListHtml([
      { statusType, remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 1001 },
      { statusType, remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 1002 },
      { statusType, remaining: 2, limitType: 'Only', power: 0.5, effectId: 1003 },
    ]);
    assert.deepEqual(extractAltList(html), expected, `${statusType} should adopt Only side`);
  }
});

test('buildBuffListHtml caps icons by total limit', () => {
  const html = buildBuffListHtml([
    { statusType: 'AttackUp', remaining: 1 },
    { statusType: 'DefenseUp', remaining: 1 },
    { statusType: 'DamageRateUp', remaining: 1 },
    { statusType: 'ToughnessUpValue', remaining: 1 },
    { statusType: 'Shredding', remaining: 1 },
    { statusType: 'HighBoost', remaining: 1 },
    { statusType: 'GiveAttackBuffUp', remaining: 1 },
    { statusType: 'CriticalRateUp', remaining: 1 },
    { statusType: 'CriticalDamageUp', remaining: 1 },
    { statusType: 'HealDp', remaining: 1 },
    { statusType: 'HealSp', remaining: 1 },
    { statusType: 'MindEye', remaining: 1 },
  ]);

  const altList = extractAltList(html);
  assert.equal(altList.length, 10);
  assert.deepEqual(altList, [
    'AttackUp',
    'DefenseUp',
    'DamageRateUp',
    'ToughnessUpValue',
    'Shredding',
    'HighBoost',
    'GiveAttackBuffUp',
    'CriticalRateUp',
    'CriticalDamageUp',
    'HealDp',
  ]);
});
