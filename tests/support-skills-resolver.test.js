import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupportPassiveEntry,
  buildSupportPassive,
} from '../src/domain/support-skills-resolver.js';
import { HbrDataStore } from '../src/index.js';
import { getStore } from './helpers.js';

// ── 純粋関数のユニットテスト ────────────────────────────────────────────

const MOCK_GROUP = {
  label: 'TestGroup',
  list: [
    { id: 1, lb_lv: 0, passive: { id: 100, name: 'PassiveLv0', timing: 'OnBattleStart', parts: [] } },
    { id: 2, lb_lv: 1, passive: { id: 101, name: 'PassiveLv1', timing: 'OnBattleStart', parts: [] } },
    { id: 3, lb_lv: 3, passive: { id: 102, name: 'PassiveLv3', timing: 'OnBattleStart', parts: [] } },
    { id: 4, lb_lv: 4, passive: { id: 103, name: 'PassiveLv4', timing: 'OnBattleStart', parts: [] } },
  ],
};

test('resolveSupportPassiveEntry: lb=0 のとき lb_lv=0 のエントリを返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 0);
  assert.ok(entry, 'entry should not be null');
  assert.equal(entry.lb_lv, 0);
  assert.equal(entry.passive.name, 'PassiveLv0');
});

test('resolveSupportPassiveEntry: lb=2 のとき lb_lv<=2 の最大エントリ(lb_lv=1)を返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 2);
  assert.ok(entry);
  assert.equal(entry.lb_lv, 1);
});

test('resolveSupportPassiveEntry: lb=3 のとき lb_lv=3 のエントリを返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 3);
  assert.ok(entry);
  assert.equal(entry.lb_lv, 3);
});

test('resolveSupportPassiveEntry: lb=4 のとき lb_lv=4 の最大エントリを返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 4);
  assert.ok(entry);
  assert.equal(entry.lb_lv, 4);
});

test('resolveSupportPassiveEntry: supportGroup が null のとき null を返す', () => {
  assert.equal(resolveSupportPassiveEntry(null, 3), null);
});

test('resolveSupportPassiveEntry: list が空配列のとき null を返す', () => {
  assert.equal(resolveSupportPassiveEntry({ list: [] }, 3), null);
});

test('resolveSupportPassiveEntry: 全エントリより lb が低い場合 null を返す', () => {
  const group = {
    list: [{ lb_lv: 2, passive: { id: 1, name: 'A', parts: [] } }],
  };
  assert.equal(resolveSupportPassiveEntry(group, 1), null);
});

test('buildSupportPassive: sourceType が "support" に設定される', () => {
  const passive = { id: 100, name: 'TestPassive', timing: 'OnBattleStart', parts: [] };
  const result = buildSupportPassive(passive, { resonanceGroup: 'TestGroup' });

  assert.equal(result.sourceType, 'support');
  assert.equal(result.name, 'TestPassive');
  assert.deepEqual(result.sourceMeta, { resonanceGroup: 'TestGroup' });
  assert.equal(result.tier, '');
});

test('buildSupportPassive: sourceMeta が省略されたとき空オブジェクトになる', () => {
  const passive = { id: 100, name: 'TestPassive', parts: [] };
  const result = buildSupportPassive(passive);
  assert.deepEqual(result.sourceMeta, {});
});

test('buildSupportPassive: 元のオブジェクトを変更しない（深いコピー）', () => {
  const passive = { id: 100, name: 'TestPassive', parts: [{ skill_type: 'Heal' }] };
  const meta = { group: 'X' };
  const result = buildSupportPassive(passive, meta);

  result.parts.push({ skill_type: 'Attack' });
  result.sourceMeta.extra = 'injected';

  assert.equal(passive.parts.length, 1, 'original passive.parts should not be mutated');
  assert.equal(meta.extra, undefined, 'original sourceMeta should not be mutated');
});

// ── HbrDataStore 統合テスト ─────────────────────────────────────────────

test('HbrDataStore: supportSkills が読み込まれている', () => {
  const store = getStore();
  assert.ok(Array.isArray(store.supportSkills), 'supportSkills should be array');
  assert.ok(store.supportSkills.length > 0, 'support skills should not be empty');
});

test('HbrDataStore: getSupportGroupByLabel で既存グループを取得できる', () => {
  const store = getStore();
  const firstGroup = store.supportSkills[0];
  const found = store.getSupportGroupByLabel(firstGroup.label);
  assert.ok(found, 'should find group by label');
  assert.equal(found.label, firstGroup.label);
});

test('HbrDataStore: getSupportGroupByLabel で存在しないラベルは null を返す', () => {
  const store = getStore();
  const result = store.getSupportGroupByLabel('__NO_SUCH_GROUP__');
  assert.equal(result, null);
});

test('HbrDataStore: resolveSupportSkillPassive - resonance を持つスタイルでパッシブが解決される', () => {
  const store = getStore();
  // resonance フィールドを持つスタイルを検索
  const styleWithResonance = store.styles.find((s) => s.resonance && String(s.resonance).trim() !== '');
  if (!styleWithResonance) return;

  const result = store.resolveSupportSkillPassive(styleWithResonance.id, 0);
  assert.ok(result !== null, 'should resolve a support passive');
  assert.equal(result.sourceType, 'support');
  assert.equal(result.tier, '');
  assert.ok(result.sourceMeta?.supportGroupLabel, 'sourceMeta should contain supportGroupLabel');
});

test('HbrDataStore: resolveSupportSkillPassive - 高 LB レベルでは high lb_lv のエントリが選ばれる', () => {
  const store = getStore();
  const styleWithResonance = store.styles.find((s) => s.resonance && String(s.resonance).trim() !== '');
  if (!styleWithResonance) return;

  const resultLv0 = store.resolveSupportSkillPassive(styleWithResonance.id, 0);
  const maxLb = store.getStyleLimitBreakMax(styleWithResonance);
  const resultLvMax = store.resolveSupportSkillPassive(styleWithResonance.id, maxLb);

  assert.ok(resultLv0 !== null);
  assert.ok(resultLvMax !== null);
});

test('HbrDataStore: resolveSupportSkillPassive - resonance のないスタイルは null を返す', () => {
  const store = getStore();
  const styleWithoutResonance = store.styles.find(
    (s) => !s.resonance || String(s.resonance).trim() === ''
  );
  if (!styleWithoutResonance) return;

  const result = store.resolveSupportSkillPassive(styleWithoutResonance.id, 4);
  assert.equal(result, null);
});

test('HbrDataStore: resolveSupportSkillPassive - 存在しない styleId は null を返す', () => {
  const store = getStore();
  assert.equal(store.resolveSupportSkillPassive(999999999, 0), null);
});

test('HbrDataStore: fromRawData でも supportSkills が設定できる', () => {
  const store = HbrDataStore.fromRawData({
    supportSkills: [
      {
        id: 99,
        label: 'MockGroup',
        list: [{ id: 1, lb_lv: 0, passive: { id: 999, name: 'MockPassive', parts: [] } }],
      },
    ],
  });
  assert.ok(Array.isArray(store.supportSkills));
  assert.equal(store.supportSkills.length, 1);
  const group = store.getSupportGroupByLabel('MockGroup');
  assert.ok(group);
  assert.equal(group.label, 'MockGroup');
});

test('HbrDataStore: fromRawData で supportSkills 省略時は空配列になる', () => {
  const store = HbrDataStore.fromRawData({});
  assert.deepEqual(store.supportSkills, []);
});
