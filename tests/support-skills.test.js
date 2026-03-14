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

test('listSupportStyleCandidates: 属性(elements)のみで絞り込む — すべての候補がメインと共通elements を持つこと', () => {
  const store = getStore();
  const mainStyle = store.styles.find(
    (s) => ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
           Array.isArray(s.elements) && s.elements.length > 0
  );
  if (!mainStyle) return;

  const mainElements = new Set(mainStyle.elements);
  const candidates = store.listSupportStyleCandidates(mainStyle.id);

  for (const c of candidates) {
    const cElements = Array.isArray(c.elements) ? c.elements : [];
    assert.ok(
      cElements.some((el) => mainElements.has(el)),
      `Candidate id=${c.id} (weapon=${c.weapon}) has no common element with main style`
    );
  }
});

test('listSupportStyleCandidates: 武器種別(weapon)が異なっても属性(elements)が一致すれば候補に含まれること', () => {
  const store = getStore();
  // 同属性・異武器 SS/SSR スタイルが存在するメインスタイルを探す
  const mainStyle = store.styles.find((s) => {
    if (!['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase())) return false;
    if (!Array.isArray(s.elements) || s.elements.length === 0) return false;
    const mainWeapon = String(s.weapon ?? '');
    const mainEls = new Set(s.elements);
    return store.styles.some(
      (other) =>
        Number(other.id) !== Number(s.id) &&
        ['SS', 'SSR'].includes(String(other.tier ?? '').toUpperCase()) &&
        Array.isArray(other.elements) &&
        other.elements.some((el) => mainEls.has(el)) &&
        String(other.weapon ?? '') !== mainWeapon
    );
  });
  if (!mainStyle) return; // 条件を満たすデータがない場合はスキップ

  const mainWeapon = String(mainStyle.weapon ?? '');
  const mainEls = new Set(mainStyle.elements);
  const candidates = store.listSupportStyleCandidates(mainStyle.id);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));

  // 同属性・異武器のスタイルが候補に含まれていること
  const targets = store.styles.filter(
    (s) =>
      Number(s.id) !== Number(mainStyle.id) &&
      ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
      Array.isArray(s.elements) &&
      s.elements.some((el) => mainEls.has(el)) &&
      String(s.weapon ?? '') !== mainWeapon
  );
  assert.ok(targets.length > 0, 'test setup: should find SS/SSR style with different weapon but same element');
  for (const s of targets) {
    assert.ok(
      candidateIds.has(Number(s.id)),
      `Style id=${s.id} (weapon=${s.weapon}) has same element as main but was not in candidates`
    );
  }
});

test('listSupportStyleCandidates: 属性(elements)が一致しなければ武器種別(weapon)が同じでも候補に含まれないこと', () => {
  const store = getStore();
  // 同武器・異属性 SS/SSR スタイルが存在するメインスタイルを探す
  const mainStyle = store.styles.find((s) => {
    if (!['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase())) return false;
    if (!Array.isArray(s.elements) || s.elements.length === 0) return false;
    const mainWeapon = String(s.weapon ?? '');
    const mainEls = new Set(s.elements);
    return store.styles.some(
      (other) =>
        Number(other.id) !== Number(s.id) &&
        ['SS', 'SSR'].includes(String(other.tier ?? '').toUpperCase()) &&
        String(other.weapon ?? '') === mainWeapon &&
        Array.isArray(other.elements) &&
        !other.elements.some((el) => mainEls.has(el))
    );
  });
  if (!mainStyle) return; // 条件を満たすデータがない場合はスキップ

  const mainWeapon = String(mainStyle.weapon ?? '');
  const mainEls = new Set(mainStyle.elements);
  const candidates = store.listSupportStyleCandidates(mainStyle.id);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));

  // 同一武器・異属性のスタイルは候補に含まれないこと
  const targets = store.styles.filter(
    (s) =>
      Number(s.id) !== Number(mainStyle.id) &&
      ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
      String(s.weapon ?? '') === mainWeapon &&
      Array.isArray(s.elements) &&
      !s.elements.some((el) => mainEls.has(el))
  );
  assert.ok(targets.length > 0, 'test setup: should find SS/SSR style with same weapon but different elements');
  for (const s of targets) {
    assert.ok(
      !candidateIds.has(Number(s.id)),
      `Style id=${s.id} (weapon=${s.weapon}) has no common element but was incorrectly included in candidates`
    );
  }
});

test('listSupportStyleCandidates: 複数elements(Dark+Fire)の場合、DarkもFireも両方の属性から候補に含まれること', () => {
  const store = getStore();
  // 実データ: Dark+Fire の SSR スタイルを使用（id: 1001108）
  const mainStyle = store.styles.find(
    (s) => Array.isArray(s.elements) && s.elements.length >= 2 &&
           ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase())
  );
  if (!mainStyle) return;

  const candidates = store.listSupportStyleCandidates(mainStyle.id);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));
  const mainEls = mainStyle.elements.filter((el) => el && el !== 'None');

  // 各属性について「その属性を持つ SS/SSR スタイル」が候補に含まれることを確認
  for (const el of mainEls) {
    const sameElStyles = store.styles.filter(
      (s) =>
        Number(s.id) !== Number(mainStyle.id) &&
        ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
        Array.isArray(s.elements) &&
        s.elements.includes(el)
    );
    assert.ok(
      sameElStyles.length > 0,
      `test setup: should find SS/SSR style with element "${el}"`
    );
    for (const s of sameElStyles) {
      assert.ok(
        candidateIds.has(Number(s.id)),
        `Style id=${s.id} with element "${el}" should be in candidates for multi-element main style`
      );
    }
  }
});

test('listSupportStyleCandidates: Fire+None の場合、Noneのみを持つスタイルは候補に含まれないこと（無属性は除外）', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    skills: [],
    passivesDb: [],
    skillRules: {},
    epRules: {},
    supportSkills: [],
    styles: [
      { id: 101, tier: 'SS', elements: ['Fire', 'None'], weapon: 'Slash', chara_label: 'MainA', name: 'Main Fire+None' },
      { id: 102, tier: 'SS', elements: ['None'],         weapon: 'Stab',  chara_label: 'CandB', name: 'Cand None only' },
      { id: 103, tier: 'SS', elements: ['Fire'],         weapon: 'Strike', chara_label: 'CandC', name: 'Cand Fire only' },
      { id: 104, tier: 'SS', elements: ['None', 'Dark'], weapon: 'Slash',  chara_label: 'CandD', name: 'Cand None+Dark' },
    ],
  });

  const candidates = store.listSupportStyleCandidates(101);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));

  // Fire属性の候補は含まれる
  assert.ok(candidateIds.has(103), 'Style with Fire element should be included');
  // Noneのみの候補は含まれない
  assert.ok(!candidateIds.has(102), 'Style with only None element should NOT be included');
  // None+Darkの候補も None では含まれない（Dark も持たないので除外）
  assert.ok(!candidateIds.has(104), 'Style with None+Dark should NOT be included when main has only Fire (no Dark)');
});

test('listSupportStyleCandidates: Fire+None のメインに対し、共鳴アビリティもFireのみから得られること', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    skills: [],
    passivesDb: [],
    skillRules: {},
    epRules: {},
    supportSkills: [
      {
        id: 1,
        label: 'MockGroup',
        list: [{ id: 9001, lb_lv: 0, passive: { id: 9001, name: 'MockPassive', timing: 'OnBattleStart', parts: [], desc: 'test' } }],
        styles: [],
      },
    ],
    styles: [
      { id: 101, tier: 'SS', elements: ['Fire', 'None'], weapon: 'Slash', chara_label: 'MainA', name: 'Main Fire+None', resonance: null },
      { id: 102, tier: 'SS', elements: ['None'],         weapon: 'Stab',  chara_label: 'CandB', name: 'Cand None only', resonance: 'MockGroup' },
      { id: 103, tier: 'SS', elements: ['Fire'],         weapon: 'Strike', chara_label: 'CandC', name: 'Cand Fire only', resonance: 'MockGroup' },
    ],
  });

  // None属性のスタイル(id=102)は候補に含まれないため、共鳴アビリティも得られない
  const candidates = store.listSupportStyleCandidates(101);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));
  assert.ok(!candidateIds.has(102), 'None-element support style should not be selectable');
  assert.ok(candidateIds.has(103), 'Fire-element support style should be selectable');

  // Fire属性(id=103)から共鳴アビリティは解決できる
  const passive = store.resolveSupportSkillPassive(103, 0);
  assert.ok(passive !== null, 'Fire-element support style should resolve resonance passive');
  assert.equal(passive.sourceType, 'support');
});

test('listSupportStyleCandidates: 無属性(elements:[])のメインは無属性の候補のみ選べること（実データ）', () => {
  const store = getStore();
  // 実データで elements:[] の SS/SSR スタイルを探す（48件存在することが確認済み）
  const mainStyle = store.styles.find(
    (s) =>
      ['SS', 'SSR'].includes(String(s.tier ?? '').toUpperCase()) &&
      Array.isArray(s.elements) &&
      s.elements.length === 0
  );
  if (!mainStyle) return; // 該当データがなければスキップ

  const candidates = store.listSupportStyleCandidates(mainStyle.id);

  // 候補はすべて「有効な元素属性を持たない」スタイルであること
  for (const c of candidates) {
    const effectiveEls = (c.elements ?? []).filter((el) => el && String(el) !== 'None');
    assert.equal(
      effectiveEls.length,
      0,
      `Candidate id=${c.id} has elements ${JSON.stringify(c.elements)} but should be none-element`
    );
  }

  // Fire/Water 等の有属性 SS/SSR スタイルが候補に含まれないこと
  const elementedStyleInCandidates = candidates.find((c) => {
    const eff = (c.elements ?? []).filter((el) => el && String(el) !== 'None');
    return eff.length > 0;
  });
  assert.equal(elementedStyleInCandidates, undefined, 'Elemented SS/SSR should not be in candidates for none-element main');
});

test('listSupportStyleCandidates: 無属性(elements:[None])のメインは無属性([]または[None])のみ候補になること（モック）', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    skills: [],
    passivesDb: [],
    skillRules: {},
    epRules: {},
    supportSkills: [],
    styles: [
      { id: 201, tier: 'SS', elements: ['None'],  weapon: 'Slash', chara_label: 'MainA', name: 'Main None' },
      { id: 202, tier: 'SS', elements: [],        weapon: 'Stab',  chara_label: 'CandB', name: 'Cand Empty' },
      { id: 203, tier: 'SS', elements: ['None'],  weapon: 'Strike', chara_label: 'CandC', name: 'Cand None' },
      { id: 204, tier: 'SS', elements: ['Fire'],  weapon: 'Slash',  chara_label: 'CandD', name: 'Cand Fire' },
      { id: 205, tier: 'SS', elements: ['Dark'],  weapon: 'Stab',   chara_label: 'CandE', name: 'Cand Dark' },
    ],
  });

  const candidates = store.listSupportStyleCandidates(201);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));

  // elements:[] の候補は含まれる
  assert.ok(candidateIds.has(202), 'elements:[] style should be a candidate for elements:[None] main');
  // elements:['None'] の候補は含まれる
  assert.ok(candidateIds.has(203), 'elements:[None] style should be a candidate for elements:[None] main');
  // 有属性は含まれない
  assert.ok(!candidateIds.has(204), 'Fire-element style should NOT be a candidate for none-element main');
  assert.ok(!candidateIds.has(205), 'Dark-element style should NOT be a candidate for none-element main');
});

test('listSupportStyleCandidates: 無属性メインに共鳴アビリティは無属性のサポートからのみ得られること（モック）', () => {
  const store = HbrDataStore.fromRawData({
    characters: [],
    skills: [],
    passivesDb: [],
    skillRules: {},
    epRules: {},
    supportSkills: [
      {
        id: 1,
        label: 'NoneGroup',
        list: [{ id: 9101, lb_lv: 0, passive: { id: 9101, name: 'NonePassive', timing: 'OnBattleStart', parts: [], desc: 'none test' } }],
        styles: [],
      },
      {
        id: 2,
        label: 'FireGroup',
        list: [{ id: 9102, lb_lv: 0, passive: { id: 9102, name: 'FirePassive', timing: 'OnBattleStart', parts: [], desc: 'fire test' } }],
        styles: [],
      },
    ],
    styles: [
      { id: 301, tier: 'SS', elements: [],       weapon: 'Slash', chara_label: 'MainA', name: 'Main None', resonance: null },
      { id: 302, tier: 'SS', elements: ['None'], weapon: 'Stab',  chara_label: 'CandB', name: 'Cand None', resonance: 'NoneGroup' },
      { id: 303, tier: 'SS', elements: ['Fire'], weapon: 'Strike', chara_label: 'CandC', name: 'Cand Fire', resonance: 'FireGroup' },
    ],
  });

  const candidates = store.listSupportStyleCandidates(301);
  const candidateIds = new Set(candidates.map((c) => Number(c.id)));

  // 無属性サポート(id=302)は候補に含まれ、共鳴アビリティが解決できる
  assert.ok(candidateIds.has(302), 'None-element support should be a candidate for none-element main');
  const passive = store.resolveSupportSkillPassive(302, 0);
  assert.ok(passive !== null, 'None-element support should resolve resonance passive');
  assert.equal(passive.sourceType, 'support');

  // 有属性サポート(id=303)は候補に含まれない
  assert.ok(!candidateIds.has(303), 'Fire-element support should NOT be a candidate for none-element main');
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
