import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSupportPassiveEntry,
  buildSupportPassive,
} from '../src/domain/support-skills-resolver.js';
import { HbrDataStore } from '../src/index.js';
import { getStore } from './helpers.js';

// ── 純粋関数テスト（support-skills-resolver.js） ─────────────────────────

const MOCK_GROUP = {
  label: '31A',
  list: [
    { id: 1, lb_lv: 0, passive: { id: 1001, name: 'Passive_LB0', timing: 'OnBattleStart', parts: [] } },
    { id: 2, lb_lv: 1, passive: { id: 1002, name: 'Passive_LB1', timing: 'OnBattleStart', parts: [] } },
    { id: 3, lb_lv: 2, passive: { id: 1003, name: 'Passive_LB2', timing: 'OnBattleStart', parts: [] } },
    { id: 4, lb_lv: 3, passive: { id: 1004, name: 'Passive_LB3', timing: 'OnBattleStart', parts: [] } },
    { id: 5, lb_lv: 4, passive: { id: 1005, name: 'Passive_LB4', timing: 'OnBattleStart', parts: [] } },
  ],
};

test('resolveSupportPassiveEntry(group, 0): lb_lv=0 のエントリを返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 0);
  assert.ok(entry, 'should return an entry');
  assert.equal(entry.lb_lv, 0);
  assert.equal(entry.passive.name, 'Passive_LB0');
});

test('resolveSupportPassiveEntry(group, 4): lb_lv=4 のエントリを返す', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 4);
  assert.ok(entry);
  assert.equal(entry.lb_lv, 4);
  assert.equal(entry.passive.name, 'Passive_LB4');
});

test('resolveSupportPassiveEntry(group, 2): lb_lv=2 のエントリを返す（lb_lv=3,4 は除外）', () => {
  const entry = resolveSupportPassiveEntry(MOCK_GROUP, 2);
  assert.ok(entry);
  assert.equal(entry.lb_lv, 2);
  assert.equal(entry.passive.name, 'Passive_LB2');
});

test('resolveSupportPassiveEntry(null, 0): null を返す', () => {
  assert.equal(resolveSupportPassiveEntry(null, 0), null);
});

test('buildSupportPassive(passive, meta): sourceType: "support" が付与されること', () => {
  const passive = { id: 100, name: 'TestPassive', timing: 'OnBattleStart', parts: [] };
  const meta = { supportGroupLabel: '31A', supportStyleId: 1001109, limitBreakLevel: 2 };
  const result = buildSupportPassive(passive, meta);

  assert.equal(result.sourceType, 'support');
  assert.equal(result.tier, '');
});

test('buildSupportPassive(passive, meta): sourceMeta が正しく付与されること', () => {
  const passive = { id: 100, name: 'TestPassive', timing: 'OnBattleStart', parts: [] };
  const meta = { supportGroupLabel: '31A', supportStyleId: 1001109, limitBreakLevel: 2 };
  const result = buildSupportPassive(passive, meta);

  assert.deepEqual(result.sourceMeta, meta);
});

// ── HbrDataStore テスト ──────────────────────────────────────────────────

test('dataStore.getSupportGroupByLabel("31A"): オブジェクトを返す（label, list, styles を持つ）', () => {
  const store = getStore();
  const group = store.getSupportGroupByLabel('31A');
  assert.ok(group, 'should return group');
  assert.equal(group.label, '31A');
  assert.ok(Array.isArray(group.list), 'should have list');
  assert.ok(Array.isArray(group.styles), 'should have styles');
});

test('dataStore.getSupportGroupByLabel("nonexistent"): null を返す', () => {
  const store = getStore();
  const result = store.getSupportGroupByLabel('nonexistent');
  assert.equal(result, null);
});

test('dataStore.listSupportStyleCandidates(ssStyleId): SS/SSR のみ返すこと（A/S は除外）', () => {
  const store = getStore();
  // SS/SSR で elements を持つスタイルを探す
  const ssStyle = store.styles.find(
    (s) => ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
           Array.isArray(s.elements) && s.elements.length > 0
  );
  if (!ssStyle) return;

  const candidates = store.listSupportStyleCandidates(ssStyle.id);
  for (const c of candidates) {
    const tier = String(c.tier ?? '').toUpperCase();
    assert.ok(['SS', 'SSR'].includes(tier), `Candidate tier should be SS or SSR, got: ${tier}`);
  }
});

test('dataStore.listSupportStyleCandidates(ssStyleId): 自スタイルが除外されること', () => {
  const store = getStore();
  const ssStyle = store.styles.find(
    (s) => ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
           Array.isArray(s.elements) && s.elements.length > 0
  );
  if (!ssStyle) return;

  const candidates = store.listSupportStyleCandidates(ssStyle.id);
  const selfIncluded = candidates.some((c) => Number(c.id) === Number(ssStyle.id));
  assert.equal(selfIncluded, false, 'self style should be excluded');
});

test('dataStore.listSupportStyleCandidates(aStyleId): A/S メインは空配列を返すこと', () => {
  const store = getStore();
  const aStyle = store.styles.find(
    (s) => !['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase())
  );
  if (!aStyle) return;

  const candidates = store.listSupportStyleCandidates(aStyle.id);
  assert.equal(candidates.length, 0, 'A/S main style should return empty candidates');
});

test('dataStore.resolveSupportSkillPassive(resonanceNullStyleId, 0): resonance なしは null', () => {
  const store = getStore();
  const styleWithoutResonance = store.styles.find(
    (s) => !s.resonance || String(s.resonance).trim() === ''
  );
  if (!styleWithoutResonance) return;

  const result = store.resolveSupportSkillPassive(styleWithoutResonance.id, 0);
  assert.equal(result, null);
});

test('dataStore.resolveSupportSkillPassive(ssStyleWithResonanceId, 2): passive オブジェクトを返す（sourceType:"support"）', () => {
  const store = getStore();
  const styleWithResonance = store.styles.find(
    (s) => s.resonance && String(s.resonance).trim() !== ''
  );
  if (!styleWithResonance) return;

  const result = store.resolveSupportSkillPassive(styleWithResonance.id, 2);
  assert.ok(result !== null, 'should return a passive object');
  assert.equal(result.sourceType, 'support');
  assert.ok(result.sourceMeta?.supportGroupLabel, 'should have supportGroupLabel in sourceMeta');
  assert.equal(result.sourceMeta.supportStyleId, Number(styleWithResonance.id));
});

// ── buildCharacterStyle 統合テスト ────────────────────────────────────────

test('buildCharacterStyle with supportStyleId: passives に sourceType:"support" が含まれること', () => {
  const store = getStore();
  // resonance を持つスタイルを探してサポートとして使用
  const supportStyle = store.styles.find(
    (s) => s.resonance && String(s.resonance).trim() !== ''
  );
  if (!supportStyle) return;

  // メインスタイルは6人分別のキャラクターから選ぶ（supportStyleと別キャラ）
  const mainStyle = store.styles.find(
    (s) => Array.isArray(s.skills) && s.skills.length > 0 &&
           String(s.chara_label) !== String(supportStyle.chara_label)
  );
  if (!mainStyle) return;

  const cs = store.buildCharacterStyle({
    styleId: mainStyle.id,
    partyIndex: 0,
    supportStyleId: supportStyle.id,
    supportStyleLimitBreakLevel: 2,
  });

  const supportPassives = cs.passives.filter((p) => p.sourceType === 'support');
  assert.ok(supportPassives.length > 0, 'should have at least one support passive');
});

test('buildCharacterStyle without supportStyleId: passives に sourceType:"support" が含まれないこと', () => {
  const store = getStore();
  const mainStyle = store.styles.find(
    (s) => Array.isArray(s.skills) && s.skills.length > 0
  );
  if (!mainStyle) return;

  const cs = store.buildCharacterStyle({
    styleId: mainStyle.id,
    partyIndex: 0,
    supportStyleId: null,
  });

  const supportPassives = cs.passives.filter((p) => p.sourceType === 'support');
  assert.equal(supportPassives.length, 0, 'should have no support passives');
});

test('buildCharacterStyle: LB 0 と LB 4 で異なる passive が注入されること', () => {
  const store = getStore();
  // lb_lv=0 と lb_lv=4 で効果が異なるサポートスタイルを探す
  const supportStyle = store.styles.find((s) => {
    if (!s.resonance || !String(s.resonance).trim()) return false;
    const group = store.getSupportGroupByLabel(s.resonance);
    return group && group.list.length >= 2 &&
           group.list.some((e) => e.lb_lv === 0) &&
           group.list.some((e) => e.lb_lv === 4);
  });
  if (!supportStyle) return;

  const mainStyle = store.styles.find(
    (s) => Array.isArray(s.skills) && s.skills.length > 0 &&
           String(s.chara_label) !== String(supportStyle.chara_label)
  );
  if (!mainStyle) return;

  const csLb0 = store.buildCharacterStyle({
    styleId: mainStyle.id,
    partyIndex: 0,
    supportStyleId: supportStyle.id,
    supportStyleLimitBreakLevel: 0,
  });
  const csLb4 = store.buildCharacterStyle({
    styleId: mainStyle.id,
    partyIndex: 0,
    supportStyleId: supportStyle.id,
    supportStyleLimitBreakLevel: 4,
  });

  const spLb0 = csLb0.passives.find((p) => p.sourceType === 'support');
  const spLb4 = csLb4.passives.find((p) => p.sourceType === 'support');

  assert.ok(spLb0, 'LB0 should have support passive');
  assert.ok(spLb4, 'LB4 should have support passive');

  // LB0 と LB4 では lb_lv の異なるエントリが選ばれるはずなので、sourceMeta.limitBreakLevel も異なる
  assert.notEqual(
    spLb0.sourceMeta.limitBreakLevel,
    spLb4.sourceMeta.limitBreakLevel,
    'LB0 and LB4 should use different passive entries'
  );
});
