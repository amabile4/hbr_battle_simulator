import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fallbackSpecialStatusName,
  buildSpecialStatusTypeMap,
  SUPPLEMENTARY_SPECIAL_STATUS_TYPES,
  CONDITION_USED_SPECIAL_STATUS_IDS,
  CONDITION_USED_SPECIAL_STATUS_ICON_IDS,
  DEFAULT_SPECIAL_STATUS_TYPES,
  DEFAULT_SPECIAL_STATUS_BY_NAME,
  SPECIAL_STATUS_CATEGORY,
  resolveSpecialStatusCategory,
  resolveSpecialStatusSide,
  getSpecialStatusName,
  getSpecialStatusIdByName,
  describeSpecialStatusCount,
  buildSpecialStatusCatalog,
} from '../src/special-status-types.js';

test('fallbackSpecialStatusName は未特定 ID を UnknownSpecialStatus_N で表す', () => {
  assert.equal(fallbackSpecialStatusName(9999), 'UnknownSpecialStatus_9999');
  assert.equal(fallbackSpecialStatusName(0), 'UnknownSpecialStatus_0');
});

test('buildSpecialStatusTypeMap は MasterSpecialStatus 構造から ID->名前 Map を構築する', () => {
  const sample = {
    items: [
      { specialStatusType: 3, label: 'SpecialStatus.DefenseDown' },
      { specialStatusType: 172, label: 'SpecialStatus.SuperBreakDown' },
      { specialStatusType: 1, label: 'SpecialStatus.AttackUp' },
    ],
  };
  const map = buildSpecialStatusTypeMap(sample);
  assert.equal(map.get(3), 'DefenseDown');
  assert.equal(map.get(172), 'SuperBreakDown');
  assert.equal(map.get(1), 'AttackUp');
  assert.equal(map.size, 3);
});

test('buildSpecialStatusTypeMap は配列入力と items/list 形式両方を受け付ける', () => {
  const arrayForm = buildSpecialStatusTypeMap([{ specialStatusType: 22, label: 'SpecialStatus.Fragile' }]);
  assert.equal(arrayForm.get(22), 'Fragile');

  const listForm = buildSpecialStatusTypeMap({ list: [{ specialStatusType: 30, label: 'SpecialStatus.Virus' }] });
  assert.equal(listForm.get(30), 'Virus');
});

test('buildSpecialStatusTypeMap は欠損エントリを安全にスキップする', () => {
  const map = buildSpecialStatusTypeMap([
    { specialStatusType: 3, label: 'SpecialStatus.DefenseDown' },
    null,
    { label: 'SpecialStatus.NoId' },
    { specialStatusType: 172, label: '' },
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get(3), 'DefenseDown');
});

test('正本ベースで条件式出現 ID の正しい名前が解決される', () => {
  // 既存マップの誤りを修正した結果の検証
  assert.equal(getSpecialStatusName(79), 'Restraint'); // 旧: ImprisonRandom
  assert.equal(getSpecialStatusName(146), 'NegativeMind'); // 旧: NegativeState
  assert.equal(getSpecialStatusName(172), 'SuperBreakDown');
  assert.equal(getSpecialStatusName(3), 'DefenseDown');
  assert.equal(getSpecialStatusName(22), 'Fragile');
  assert.equal(getSpecialStatusName(20), 'AdditionalTurn');
  assert.equal(getSpecialStatusName(12), 'Provoke');
  assert.equal(getSpecialStatusName(30), 'Virus');
  assert.equal(getSpecialStatusName(57), 'Cover');
  assert.equal(getSpecialStatusName(132), 'CorrosionDp');
  assert.equal(getSpecialStatusName(157), 'SuperStun');
});
test('getSpecialStatusName は補助 ID（食事バフ等）も解決する', () => {
  assert.equal(getSpecialStatusName(258), 'Babied');
  assert.equal(getSpecialStatusName(303), 'Curry');
  assert.equal(getSpecialStatusName(304), 'Shchi');
  assert.equal(getSpecialStatusName(313), 'Mocktail');
  assert.equal(getSpecialStatusName(330), 'Steak');
  assert.equal(getSpecialStatusName(331), 'Gelato');
});

test('getSpecialStatusName は未知 ID に fallback する', () => {
  assert.equal(getSpecialStatusName(99999), 'UnknownSpecialStatus_99999');
});

test('getSpecialStatusName は masterMap を最優先する', () => {
  const masterMap = buildSpecialStatusTypeMap({
    items: [{ specialStatusType: 3, label: 'SpecialStatus.OverrideName' }],
  });
  assert.equal(getSpecialStatusName(3, masterMap), 'OverrideName');
  assert.equal(getSpecialStatusName(3), 'DefenseDown');
});

test('getSpecialStatusIdByName は名前から数値ID を逆引きする', () => {
  assert.equal(getSpecialStatusIdByName('SuperBreakDown'), 172);
  assert.equal(getSpecialStatusIdByName('Restraint'), 79);
  assert.equal(getSpecialStatusIdByName('DefenseDown'), 3);
  assert.equal(getSpecialStatusIdByName('Curry'), 303);
  assert.equal(getSpecialStatusIdByName('NotARealStatus'), null);
});

test('getSpecialStatusIdByName も masterMap を最優先する', () => {
  const masterMap = buildSpecialStatusTypeMap({
    items: [{ specialStatusType: 500, label: 'SpecialStatus.Custom' }],
  });
  assert.equal(getSpecialStatusIdByName('Custom', masterMap), 500);
});

test('describeSpecialStatusCount は ID 付き表記を生成する', () => {
  assert.equal(describeSpecialStatusCount(172), 'SpecialStatusCountByType(172) [SuperBreakDown]');
  assert.equal(describeSpecialStatusCount(999), 'SpecialStatusCountByType(999) [UnknownSpecialStatus_999]');
});

test('CONDITION_USED_SPECIAL_STATUS_IDS は条件式出現全19種を含む', () => {
  assert.equal(CONDITION_USED_SPECIAL_STATUS_IDS.length, 19);
  for (const id of [3, 12, 20, 22, 25, 30, 57, 78, 79, 122, 124, 125, 132, 144, 146, 155, 157, 164, 172]) {
    assert.ok(CONDITION_USED_SPECIAL_STATUS_IDS.includes(id), `should contain ${id}`);
  }
});

test('CONDITION_USED_SPECIAL_STATUS_ICON_IDS は4種を含む', () => {
  assert.deepEqual([...CONDITION_USED_SPECIAL_STATUS_ICON_IDS].sort((a, b) => a - b), [1, 25, 111, 176]);
});

test('DEFAULT_SPECIAL_STATUS_TYPES は条件出現 ID と補助 ID を全て覆盖する', () => {
  for (const id of CONDITION_USED_SPECIAL_STATUS_IDS) {
    assert.ok(Object.hasOwn(DEFAULT_SPECIAL_STATUS_TYPES, id), `should have ${id}`);
  }
  for (const id of Object.keys(SUPPLEMENTARY_SPECIAL_STATUS_TYPES).map(Number)) {
    assert.ok(Object.hasOwn(DEFAULT_SPECIAL_STATUS_TYPES, id), `should have supplementary ${id}`);
  }
});

test('DEFAULT_SPECIAL_STATUS_BY_NAME は完全逆引き', () => {
  assert.equal(Object.keys(DEFAULT_SPECIAL_STATUS_BY_NAME).length, Object.keys(DEFAULT_SPECIAL_STATUS_TYPES).length);
  assert.equal(DEFAULT_SPECIAL_STATUS_BY_NAME['SuperBreakDown'], 172);
});

test('resolveSpecialStatusCategory は各 status を大カテゴリに分類する', () => {
  assert.equal(resolveSpecialStatusCategory(3), 'debuffEnemy');
  assert.equal(resolveSpecialStatusCategory(172), 'debuffEnemy');
  assert.equal(resolveSpecialStatusCategory(1), 'buff');
  assert.equal(resolveSpecialStatusCategory(79), 'debuffPlayer');
  assert.equal(resolveSpecialStatusCategory(20), 'system');
  assert.equal(resolveSpecialStatusCategory(57), 'protective');
  assert.equal(resolveSpecialStatusCategory(9999), 'unknown');
});

test('resolveSpecialStatusSide は player/enemy/both に分類する', () => {
  assert.equal(resolveSpecialStatusSide(3), 'enemy');
  assert.equal(resolveSpecialStatusSide(172), 'enemy');
  assert.equal(resolveSpecialStatusSide(25), 'player');
  assert.equal(resolveSpecialStatusSide(79), 'player');
  assert.equal(resolveSpecialStatusSide(20), 'both');
  assert.equal(resolveSpecialStatusSide(9999), 'unknown');
});

test('SPECIAL_STATUS_CATEGORY は frozen で変更不可', () => {
  assert.ok(Object.isFrozen(SPECIAL_STATUS_CATEGORY));
  assert.ok(Object.isFrozen(SPECIAL_STATUS_CATEGORY.buff));
});

test('buildSpecialStatusCatalog は全 ID のメタ情報一覧を生成する', () => {
  const catalog = buildSpecialStatusCatalog();
  assert.ok(catalog.length > 0);
  const catalogIds = new Set(catalog.map((e) => e.id));
  for (const id of CONDITION_USED_SPECIAL_STATUS_IDS) {
    assert.ok(catalogIds.has(id), `catalog should contain ${id}`);
  }
  const entry172 = catalog.find((e) => e.id === 172);
  assert.equal(entry172.name, 'SuperBreakDown');
  assert.equal(entry172.side, 'enemy');
  assert.equal(entry172.usedInCondition, true);
});

test('buildSpecialStatusCatalog は masterMap の名前を優先する', () => {
  const masterMap = buildSpecialStatusTypeMap({
    items: [{ specialStatusType: 3, label: 'SpecialStatus.FromMaster' }],
  });
  const catalog = buildSpecialStatusCatalog(masterMap);
  const entry3 = catalog.find((e) => e.id === 3);
  assert.equal(entry3.name, 'FromMaster');
});

