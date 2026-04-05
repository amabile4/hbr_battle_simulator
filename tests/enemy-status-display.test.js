/**
 * enemy-status-display.test.js
 *
 * 敵状態表示ユーティリティのテスト（WBS-4d の前段要件）
 * - isActiveEnemyStatus：アクティブ判定
 * - getActiveEnemyStatusesSorted：ソート
 * - pickEnemyStatusesForDisplay：cap制限
 * - getEnemyStatusLabel：ラベル生成
 * - buildEnemyStatusTableHtml / buildEnemyStatusIconsHtml：表示生成
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isActiveEnemyStatus,
  getActiveEnemyStatusesSorted,
  pickEnemyStatusesForDisplay,
  getEnemyStatusLabel,
  buildEnemyStatusTableHtml,
  buildEnemyStatusCompactText,
  buildEnemyStatusIconsHtml,
  getEnemyStatusMetadata,
} from '../ui-next/utils/enemy-status-display.js';

/**
 * WBS-4d-a1: isActiveEnemyStatus の判定テスト
 */
test('isActiveEnemyStatus identifies Eternal status as active', (t) => {
  const status = {
    statusType: 'AttackUp',
    remaining: 0,
    exitCond: 'Eternal',
    power: 10,
  };
  assert.equal(isActiveEnemyStatus(status), true, 'Eternal exitCond should be active');
});

test('isActiveEnemyStatus identifies active-remaining status as active', (t) => {
  const status = {
    statusType: 'AttackDown',
    remaining: 3,
    exitCond: 'TurnEnd',
    power: 5,
  };
  assert.equal(isActiveEnemyStatus(status), true, 'remaining > 0 should be active');
});

test('isActiveEnemyStatus identifies expired status as inactive', (t) => {
  const status = {
    statusType: 'DefenseDown',
    remaining: 0,
    exitCond: 'TurnEnd',
    power: 5,
  };
  assert.equal(isActiveEnemyStatus(status), false, 'remaining = 0 should be inactive');
});

test('isActiveEnemyStatus handles null/undefined', (t) => {
  assert.equal(isActiveEnemyStatus(null), false, 'null should be inactive');
  assert.equal(isActiveEnemyStatus(undefined), false, 'undefined should be inactive');
  assert.equal(isActiveEnemyStatus({}), false, 'empty object should be inactive');
});

/**
 * WBS-4d-a2: getActiveEnemyStatusesSorted のソート検証
 */
test('getActiveEnemyStatusesSorted filters and sorts by type priority', (t) => {
  const statuses = [
    { statusType: 'AttackUp', remaining: 2, power: 10, exitCond: 'TurnEnd' },
    { statusType: 'AttackDown', remaining: 1, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'DefenseUp', remaining: 0, power: 8, exitCond: 'TurnEnd' }, // inactive
    { statusType: 'DefenseDown', remaining: 3, power: 12, exitCond: 'TurnEnd' },
  ];

  const result = getActiveEnemyStatusesSorted(statuses);

  // skill_types.json ID 昇順: AttackUp(30), AttackDown(32), DefenseDown(34)
  assert.equal(result.length, 3, 'should filter out inactive status');
  assert.equal(result[0].statusType, 'AttackUp', 'lower skill_type id should come first');
  assert.equal(result[1].statusType, 'AttackDown', 'second lower skill_type id');
  assert.equal(result[2].statusType, 'DefenseDown', 'third lower skill_type id');
});

test('getActiveEnemyStatusesSorted sorts by power descending when priority is same', (t) => {
  const statuses = [
    { statusType: 'AttackUp', remaining: 2, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'AttackUp', remaining: 3, power: 15, exitCond: 'TurnEnd' },
    { statusType: 'AttackUp', remaining: 1, power: 10, exitCond: 'TurnEnd' },
  ];

  const result = getActiveEnemyStatusesSorted(statuses);

  assert.deepEqual(
    result.map((s) => s.power),
    [15, 10, 5],
    'should be sorted by power descending'
  );
});

/**
 * WBS-4d-a3: pickEnemyStatusesForDisplay の cap 制限テスト
 */
test('pickEnemyStatusesForDisplay respects limit and calculates overflow', (t) => {
  const statuses = [
    { statusType: 'Stun', remaining: 1, power: 0, exitCond: 'TurnEnd' },
    { statusType: 'Confusion', remaining: 2, power: 0, exitCond: 'TurnEnd' },
    { statusType: 'Imprison', remaining: 3, power: 0, exitCond: 'TurnEnd' },
    { statusType: 'AttackDown', remaining: 1, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'DefenseDown', remaining: 2, power: 8, exitCond: 'TurnEnd' },
    { statusType: 'AttackUp', remaining: 1, power: 10, exitCond: 'TurnEnd' },
  ];

  const result = pickEnemyStatusesForDisplay(statuses, { limit: 5 });

  assert.equal(result.visible.length, 5, 'should return limit items');
  assert.equal(result.overflowCount, 1, 'should calculate overflow');
});

/**
 * WBS-4d-a4: getEnemyStatusLabel のテキスト生成テスト
 */
test('getEnemyStatusLabel formats Eternal status', (t) => {
  const status = {
    statusType: 'Barrier',
    remaining: 0,
    exitCond: 'Eternal',
  };
  const label = getEnemyStatusLabel(status);
  assert.equal(label, 'Barrier (永続)', 'should indicate eternal');
});

test('getEnemyStatusLabel formats remaining turns', (t) => {
  const status1 = {
    statusType: 'AttackDown',
    remaining: 1,
    exitCond: 'TurnEnd',
  };
  const status3 = {
    statusType: 'DefenseDown',
    remaining: 3,
    exitCond: 'TurnEnd',
  };
  assert.equal(getEnemyStatusLabel(status1), 'AttackDown ×1ターン', 'should format single turn');
  assert.equal(getEnemyStatusLabel(status3), 'DefenseDown ×3ターン', 'should format multiple turns');
});

/**
 * WBS-4d-a5: buildEnemyStatusTableHtml の HTML 生成テスト（ブロック形式）
 */
test('buildEnemyStatusTableHtml generates block rows', (t) => {
  const statuses = [
    { statusType: 'AttackDown', remaining: 2, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'DefenseUp', remaining: 0, power: 10, exitCond: 'TurnEnd' }, // inactive
    { statusType: 'Barrier', remaining: 0, power: 0, exitCond: 'Eternal' },
  ];

  const html = buildEnemyStatusTableHtml(statuses);

  assert(html.includes('char-popup-buff-block'), 'should use block format');
  assert(html.includes('data-status-type='), 'should contain status-type attr');
  // active status: 日本語ラベルが含まれる（AttackDown → 攻撃力ダウン）
  assert(html.includes('攻撃力ダウン'), 'should include Japanese label for active status');
  // アイコン img タグが含まれる
  assert(html.includes('<img'), 'should include icon img tag');
  // 残りターン表示 (2T)
  assert(html.includes('2T'), 'should show remaining turns');
  // "Barrier" (Eternal) should be included
  assert(html.includes('data-status-type="Barrier"'), 'should include eternal status');
  // Eternal→ ∞ 表示
  assert(html.includes('∞'), 'should show infinity for Eternal');
  // "DefenseUp" (remaining=0) should NOT be included
  assert(!html.includes('data-status-type="DefenseUp"'), 'should not include inactive status');
});

/**
 * WBS-4d-a6: buildEnemyStatusCompactText の要約テキスト生成テスト
 */
test('buildEnemyStatusCompactText generates compact text with limit', (t) => {
  const statuses = [
    { statusType: 'AttackDown', remaining: 2, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'DefenseDown', remaining: 1, power: 8, exitCond: 'TurnEnd' },
    { statusType: 'Stun', remaining: 3, power: 0, exitCond: 'TurnEnd' },
    { statusType: 'AttackUp', remaining: 2, power: 15, exitCond: 'TurnEnd' },
  ];

  const text = buildEnemyStatusCompactText(statuses, { limit: 3 });

  // should show remaining count for each visible
  assert(text.match(/\d+/), 'should contain numbers (remaining turns)');
  assert(text.includes('(+1)'), 'should show overflow count');
});

/**
 * WBS-4d-a7: buildEnemyStatusIconsHtml の HTML 生成テスト
 */
test('buildEnemyStatusIconsHtml generates img tags with limit', (t) => {
  const statuses = [
    { statusType: 'AttackDown', remaining: 2, power: 5, exitCond: 'TurnEnd' },
    { statusType: 'DefenseDown', remaining: 1, power: 8, exitCond: 'TurnEnd' },
    { statusType: 'Stun', remaining: 3, power: 0, exitCond: 'TurnEnd' },
  ];

  const html = buildEnemyStatusIconsHtml(statuses, { limit: 2, size: '24px' });

  assert(html.includes('<img'), 'should generate img elements');
  assert(html.includes('24px'), 'should apply size in style');
  // should generate 2 images + potential overflow text
  const imgCount = (html.match(/<img/g) || []).length;
  assert.equal(imgCount, 2, 'should respect limit');
});

test('buildEnemyStatusIconsHtml handles empty status', (t) => {
  const html = buildEnemyStatusIconsHtml([], { limit: 5 });
  assert.equal(html, '', 'should return empty string for no statuses');
});

/**
 * WBS-4d-a8: getEnemyStatusMetadata のメタデータ抽出テスト
 */
test('getEnemyStatusMetadata returns normalized metadata', (t) => {
  const status = {
    statusType: 'AttackDown',
    remaining: 2,
    power: 5,
    elements: ['fire', 'ice'],
    exitCond: 'TurnEnd',
    source: 'skill:12345',
    effectId: 100,
    metadata: { isDebuff: true },
  };

  const meta = getEnemyStatusMetadata(status);

  assert.equal(meta.statusType, 'AttackDown');
  assert.equal(meta.remaining, 2);
  assert.equal(meta.power, 5);
  assert.deepEqual(meta.elements, ['fire', 'ice']);
  assert.equal(meta.exitCond, 'TurnEnd');
  assert.equal(meta.isActive, true);
});

test('getEnemyStatusMetadata handles null and defaults', (t) => {
  const meta = getEnemyStatusMetadata(null);
  assert.deepEqual(meta, {});

  const emptyStatus = {};
  const emptyMeta = getEnemyStatusMetadata(emptyStatus);
  assert.equal(emptyMeta.statusType, '');
  assert.equal(emptyMeta.remaining, 0);
  assert.equal(emptyMeta.power, 0);
  assert.deepEqual(emptyMeta.elements, []);
  assert.equal(emptyMeta.isActive, false);
});

/**
 * 属性付き敵status の element-prefixed アイコン・ラベル表示テスト
 */
test('buildEnemyStatusTableHtml shows element-prefixed icon and label for DefenseDown with Ice elements', (t) => {
  const statuses = [
    {
      statusType: 'DefenseDown',
      elements: ['Ice'],
      remaining: 1,
      power: 0.3,
      exitCond: 'EnemyTurnEnd',
      sourceSkillName: '目覚まし見て氷結',
      sourceCharacterName: '小笠原 緋雨',
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);

  // element-prefixed icon URL が使われていること
  assert(html.includes('IceDefenseDown.webp'), 'should use IceDefenseDown.webp icon');
  // ラベルに '氷' が付加されていること
  assert(html.includes('氷防御力ダウン'), 'should show 氷防御力ダウン label');
  // スキル名・キャラ名が含まれること
  assert(html.includes('目覚まし見て氷結'), 'should show skill name');
  assert(html.includes('小笠原 緋雨'), 'should show character name');
});

test('buildEnemyStatusTableHtml shows element-prefixed icon and label for DefenseDown with Fire elements', (t) => {
  const statuses = [
    {
      statusType: 'DefenseDown',
      elements: ['Fire'],
      remaining: 1,
      power: 0.3,
      exitCond: 'EnemyTurnEnd',
      sourceSkillName: 'ファイアグラビトン',
      sourceCharacterName: '二階堂 三郷',
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);

  assert(html.includes('FireDefenseDown.webp'), 'should use FireDefenseDown.webp icon');
  assert(html.includes('火防御力ダウン'), 'should show 火防御力ダウン label');
});

test('buildEnemyStatusTableHtml keeps base icon/label when elements is empty', (t) => {
  const statuses = [
    {
      statusType: 'DefenseDown',
      elements: [],
      remaining: 1,
      power: 0.3,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);

  assert(html.includes('DefenseDown.webp'), 'should use base DefenseDown.webp icon');
  assert(html.includes('防御力ダウン'), 'should show base label');
  // 属性漢字が付かないこと
  assert(!html.includes('氷防御力ダウン'), 'should not prefix element kanji');
  assert(!html.includes('火防御力ダウン'), 'should not prefix element kanji');
});

test('buildEnemyStatusIconsHtml uses element-prefixed icon for status with elements', (t) => {
  const statuses = [
    {
      statusType: 'DefenseDown',
      elements: ['Thunder'],
      remaining: 1,
      power: 0.3,
      exitCond: 'EnemyTurnEnd',
    },
  ];

  const html = buildEnemyStatusIconsHtml(statuses, { limit: 5 });

  assert(html.includes('ThunderDefenseDown.webp'), 'should use ThunderDefenseDown.webp icon');
  assert(html.includes('雷防御力ダウン'), 'should show 雷防御力ダウン in alt/title');
});
