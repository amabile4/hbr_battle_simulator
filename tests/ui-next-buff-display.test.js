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
    { statusType: 'Babied', remaining: 3 },
    { statusType: 'Curry', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'Shchi', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'Mocktail', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'Steak', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'Gelato', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'AttackDown', remaining: 2 },
    { statusType: 'ConfusionRandom', remaining: 2 },
    { statusType: 'CriticalRateUp', remaining: 0 },
    { statusType: 'CriticalDamageUp', remaining: 0, exitCond: 'Eternal' },
    { statusType: 'DefenseUp', remaining: 3, metadata: { isDebuff: true } },
    { statusType: 'DebuffGuard', remaining: 2, metadata: { specialStatusTypeId: 146 } },
  ];

  const actual = getDisplayableBuffs(effects).map((effect) => effect.statusType);
  assert.deepEqual(actual, [
    'AttackUp',
    'MindEye',
    'Funnel',
    'Babied',
    'Curry',
    'Shchi',
    'Mocktail',
    'Steak',
    'Gelato',
    'CriticalDamageUp',
  ]);
});

test('buildBuffListHtml follows status detail order and shows only adopted effects', () => {
  // 新ルール: Only vs 非Only のバケット合計比較（同値→Only優先）
  const html = buildBuffListHtml([
    // Funnel: Count top-2 合計=0.4+0.35=0.75 vs Only=0.8 → Only が勝つ → 1件
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.4, effectId: 701 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.35, effectId: 702 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.1, effectId: 703 },
    { statusType: 'Funnel', remaining: 2, limitType: 'Only', power: 0.8, effectId: 704 },
    // MindEye: Count top-2 合計=0.5+0.45=0.95 vs Only=0.6 → Count が勝つ → 2件
    { statusType: 'MindEye', remaining: 1, limitType: 'Count', exitCond: 'Count', power: 0.5, effectId: 801 },
    { statusType: 'MindEye', remaining: 1, limitType: 'Count', exitCond: 'Count', power: 0.45, effectId: 802 },
    { statusType: 'MindEye', remaining: 1, limitType: 'Only', power: 0.6, effectId: 803 },
    // AttackUp: Count top-2 合計=0.3+0.3=0.6 vs Only=0.6 → tie → Only が勝つ → 1件
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 101 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 102 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Only', power: 0.6, effectId: 103 },
    // CriticalRateUp: Default=0.2 vs Only=0.25 → Only が勝つ → 1件
    { statusType: 'CriticalRateUp', remaining: 2, power: 0.2, effectId: 201 },
    { statusType: 'CriticalRateUp', remaining: 2, limitType: 'Only', power: 0.25, effectId: 202 },
    { statusType: 'Babied', remaining: 3, power: 0.3, effectId: 25801 },
  ]);

  const altList = extractAltList(html);

  // skill_types.json ID 昇順:
  // AttackUp(30), Funnel(50), CriticalRateUp(70), MindEye(187), Babied(258)
  assert.deepEqual(altList, [
    'AttackUp',
    'Funnel',
    'CriticalRateUp',
    'MindEye',
    'MindEye',
    'Babied',
  ]);
});

test('buildBuffListHtml caps group to 1 when Only is present (Only wins by power)', () => {
  // グループに Only が含まれる → 上限1件、power 最大は Only (0.4)
  const html = buildBuffListHtml([
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 1 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.2, effectId: 2 },
    { statusType: 'AttackUp', remaining: 2, limitType: 'Only', power: 0.4, effectId: 3 },
  ]);

  const altList = extractAltList(html);
  assert.deepEqual(altList, ['AttackUp']);
});

test('buildBuffListHtml adopts top-2 when no Only is present (Count only)', () => {
  // Only なし → 上限2件、power 上位2件を採用
  const html = buildBuffListHtml([
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.3, effectId: 11 },
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.25, effectId: 12 },
    { statusType: 'DefenseUp', remaining: 2, limitType: 'Count', exitCond: 'Count', power: 0.1, effectId: 13 },
  ]);

  const altList = extractAltList(html);
  assert.deepEqual(altList, ['DefenseUp', 'DefenseUp']);
});

test('buildBuffListHtml caps group to 1 when Only is strongest across mixed Up-family statuses', () => {
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
    // Only あり → 上限1、power 最大 = Only(0.5)
    assert.deepEqual(extractAltList(html), expected, `${statusType} should cap to 1 when Only is present`);
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
  // skill_types.json ID 昇順（先頭10件）
  assert.deepEqual(altList, [
    'HealDp',
    'HealSp',
    'AttackUp',
    'DefenseUp',
    'CriticalRateUp',
    'CriticalDamageUp',
    'GiveAttackBuffUp',
    'DamageRateUp',
    'MindEye',
    'ToughnessUpValue',
  ]);
});
