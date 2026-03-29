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

test('buildBuffListHtml follows status detail order and keeps per-type limits', () => {
  const html = buildBuffListHtml([
    { statusType: 'Funnel', remaining: 2, limitType: 'Count' },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count' },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count' },
    { statusType: 'MindEye', remaining: 1, limitType: 'Only' },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count' },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count' },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count' },
    { statusType: 'CriticalRateUp', remaining: 2, limitType: 'Count' },
    { statusType: 'CriticalDamageUp', remaining: 2, limitType: 'Only' },
  ]);

  const altList = extractAltList(html);

  assert.deepEqual(altList, [
    'AttackUp',
    'AttackUp',
    'CriticalRateUp',
    'CriticalDamageUp',
    'MindEye',
    'Funnel',
    'Funnel',
  ]);
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
