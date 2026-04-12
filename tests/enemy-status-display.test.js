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
import fs from 'node:fs';
import path from 'node:path';

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
import { getStatusLabel } from '../ui-next/utils/char-detail-popup.js';

const ELEMENT_KANJI = Object.freeze({
  Fire: '火',
  Ice: '氷',
  Thunder: '雷',
  Light: '光',
  Dark: '闇',
});

const ELEMENT_PREFIXES = Object.freeze(Object.keys(ELEMENT_KANJI));

function loadElementCompositeSkillTypes() {
  const filePath = path.resolve(process.cwd(), 'docs/active/elements_skill.md');
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && line !== 'skill_type');
}

function splitElementCompositeSkillType(compositeType) {
  const normalized = String(compositeType ?? '').trim();
  for (const element of ELEMENT_PREFIXES) {
    if (normalized.startsWith(element)) {
      return {
        compositeType: normalized,
        element,
        baseType: normalized.slice(element.length),
      };
    }
  }
  return {
    compositeType: normalized,
    element: '',
    baseType: normalized,
  };
}

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

test('isActiveEnemyStatus treats canonical SuperBreak as active even when remaining is 0', (t) => {
  const status = {
    statusType: 'SuperBreak',
    remaining: 0,
    exitCond: 'TurnEnd',
  };
  assert.equal(isActiveEnemyStatus(status), true, 'persistent SuperBreak should stay active');
});

test('isActiveEnemyStatus treats legacy StrongBreak alias as active even when remaining is 0', (t) => {
  const status = {
    statusType: 'StrongBreak',
    remaining: 0,
    exitCond: 'TurnEnd',
  };
  assert.equal(isActiveEnemyStatus(status), true, 'legacy StrongBreak should normalize to active SuperBreak');
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

  // §2.2 category then ID: AttackUp(1b,30), DefenseDown(1b,34), AttackDown(2,32)
  assert.equal(result.length, 3, 'should filter out inactive status');
  assert.equal(result[0].statusType, 'AttackUp', 'category (1)b, lowest ID');
  assert.equal(result[1].statusType, 'DefenseDown', 'category (1)b, next ID');
  assert.equal(result[2].statusType, 'AttackDown', 'category (2), no element variants');
});

test('getActiveEnemyStatusesSorted groups same statusType by element before power', (t) => {
  const statuses = [
    { statusType: 'DefenseDown', remaining: 2, power: 10, exitCond: 'TurnEnd', elements: ['Ice'] },
    { statusType: 'DefenseDown', remaining: 2, power: 20, exitCond: 'TurnEnd', elements: [] },
    { statusType: 'DefenseDown', remaining: 2, power: 15, exitCond: 'TurnEnd', elements: ['Fire'] },
  ];

  const result = getActiveEnemyStatusesSorted(statuses);

  // §2.2: (1)a (Fire→Ice) → (1)b (属性なし)
  assert.deepEqual(
    result.map((s) => [(s.elements?.[0] ?? ''), s.power]),
    [['Fire', 15], ['Ice', 10], ['', 20]],
    'should group by category (1)a first, then (1)b'
  );
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
  assert.equal(getEnemyStatusLabel(status1), '攻撃力ダウン ×1ターン', 'should format single turn');
  assert.equal(getEnemyStatusLabel(status3), '防御力ダウン ×3ターン', 'should format multiple turns');
});

test('getEnemyStatusLabel normalizes SuperBreak aliases to the canonical Japanese label', (t) => {
  assert.equal(getEnemyStatusLabel({ statusType: 'SuperBreak', remaining: 0 }), '強ブレイク');
  assert.equal(getEnemyStatusLabel({ statusType: 'StrongBreak', remaining: 0 }), '強ブレイク');
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

test('buildEnemyStatusTableHtml uses fallback icon and label for DownTurn', () => {
  const statuses = [
    {
      statusType: 'DownTurn',
      remaining: 2,
      exitCond: 'TurnEnd',
      power: 0,
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);
  assert(html.includes('BreakDownTurnUp.webp'), 'DownTurn should fallback to BreakDownTurnUp icon');
  assert(html.includes('ダウンターン'), 'DownTurn should show Japanese label');
  assert(html.includes('2T'), 'DownTurn should show remaining turns');
});

test('buildEnemyStatusTableHtml uses LightSuperBreak icon and omits infinity for persistent SuperBreak', () => {
  const html = buildEnemyStatusTableHtml([
    {
      statusType: 'SuperBreak',
      elements: ['Light'],
      remaining: 0,
      exitCond: 'TurnEnd',
    },
  ]);

  assert(html.includes('data-status-type="SuperBreak"'), 'SuperBreak should use canonical data-status-type');
  assert(html.includes('LightSuperBreak.webp'), 'SuperBreak should use LightSuperBreak icon');
  assert(html.includes('強ブレイク'), 'SuperBreak should show Japanese label');
  assert(!html.includes('∞'), 'persistent SuperBreak should not render infinity');
  assert(!html.includes('0T'), 'persistent SuperBreak should not render 0T');
});

test('buildEnemyStatusTableHtml hides Break because the popup state badge already represents BREAK state', () => {
  const html = buildEnemyStatusTableHtml([
    {
      statusType: 'Break',
      remaining: 0,
      exitCond: 'TurnEnd',
    },
  ]);

  assert(!html.includes('data-status-type="Break"'), 'Break should be hidden from the popup status table');
  assert(html.includes('状態異常なし'), 'Break-only tables should fall back to the empty message');
  assert(!html.includes('Break.webp'), 'Break should not pretend a skill_type icon exists');
});

test('buildEnemyStatusTableHtml keeps only stronger DownTurn when duplicate entries exist', () => {
  const statuses = [
    {
      statusType: 'DownTurn',
      remaining: 1,
      exitCond: 'TurnEnd',
      power: 0,
    },
    {
      statusType: 'DownTurn',
      remaining: 2,
      exitCond: 'TurnEnd',
      power: 0,
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);
  const blockCount = (html.match(/data-status-type="DownTurn"/g) || []).length;
  assert.equal(blockCount, 1, 'duplicate DownTurn rows should be collapsed into one');
  assert(html.includes('2T'), 'collapsed DownTurn should keep the larger remaining value');
  assert(!html.includes('1T'), 'weaker DownTurn should not be displayed');
});

test('buildEnemyStatusTableHtml shows DownTurn 1T when no extension exists', () => {
  const statuses = [
    {
      statusType: 'DownTurn',
      remaining: 1,
      exitCond: 'TurnEnd',
      power: 0,
    },
  ];

  const html = buildEnemyStatusTableHtml(statuses);
  assert(html.includes('ダウンターン'), 'DownTurn should be shown with label');
  assert(html.includes('1T'), 'non-extended DownTurn should be shown as 1T');
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

test('buildEnemyStatusTableHtml displays sourceSkillDesc when present', () => {
  const statuses = [
    {
      statusType: 'DefenseDown',
      remaining: 2,
      power: 0.3,
      exitCond: 'TurnEnd',
      sourceSkillName: 'スキル名',
      sourceSkillDesc: '敵の防御力を30%ダウン',
    },
  ];
  const html = buildEnemyStatusTableHtml(statuses);
  assert(html.includes('char-popup-buff-desc'), 'should include desc container');
  assert(html.includes('敵の防御力を30%ダウン'), 'should display sourceSkillDesc text');
});

test('buildEnemyStatusTableHtml omits desc div when sourceSkillDesc is empty', () => {
  const statuses = [
    { statusType: 'AttackDown', remaining: 1, power: 0.2, exitCond: 'TurnEnd' },
  ];
  const html = buildEnemyStatusTableHtml(statuses);
  assert(!html.includes('char-popup-buff-desc'), 'should not include desc container when sourceSkillDesc is absent');
});

test('all skill_type entries in docs/active/elements_skill.md use element-prefixed label and icon when elements[0] exists', () => {
  const compositeTypes = loadElementCompositeSkillTypes();
  assert.ok(compositeTypes.length > 0, 'elements_skill.md should contain at least one skill_type entry');

  for (const compositeType of compositeTypes) {
    const { element, baseType } = splitElementCompositeSkillType(compositeType);
    assert.ok(element, `${compositeType}: should start with a known element prefix`);
    assert.ok(baseType, `${compositeType}: should have a non-empty base skill_type`);

    const status = {
      statusType: baseType,
      elements: [element],
      remaining: 1,
      power: 0.5,
      exitCond: 'EnemyTurnEnd',
      sourceSkillName: `${compositeType} source`,
      sourceCharacterName: 'test caster',
    };

    const baseLabel = getStatusLabel(baseType);
    const expectedLabel = `${ELEMENT_KANJI[element]}${baseLabel}`;

    const tableHtml = buildEnemyStatusTableHtml([status]);
    assert(
      tableHtml.includes(`${compositeType}.webp`),
      `${compositeType}: table html should use element-prefixed icon`
    );
    assert(
      tableHtml.includes(expectedLabel),
      `${compositeType}: table html should include prefixed label ${expectedLabel}`
    );

    const iconsHtml = buildEnemyStatusIconsHtml([status], { limit: 5 });
    assert(
      iconsHtml.includes(`${compositeType}.webp`),
      `${compositeType}: icons html should use element-prefixed icon`
    );
    assert(
      iconsHtml.includes(`alt="${expectedLabel}"`),
      `${compositeType}: icons html should include prefixed alt label ${expectedLabel}`
    );
  }
});
