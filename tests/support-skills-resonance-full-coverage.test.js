/**
 * 共鳴アビリティ全件テストカバレッジ
 *
 * 既存テスト（dom-adapter-ui-selection.test.js）で確認済みの5グループは重複しない:
 *   31A / 31C / 31D / ADate01 / CSugahara01
 *
 * 本ファイルで確認する16グループ:
 *   31B / 31E / 31F / 30G / 31X / MSatsuki01 / VBalakrishnan01 / CSkopovskaya01
 *   SMinase01 / IrOhshima01 / IRedmayne01 / TTojo01 / MTenne01 / IMinase01
 *   YIzumi01 / BIYamawaki01
 *
 * silent-skip 仕様の確認:
 *   - HealSkillUsedCount (OnBattleWin): T09, T10 → ドメインレベル
 *   - Mocktail (OnBattleStart): T12 → passiveLogEntries に含まれないことを確認
 *   - AdditionalHit系 (OnFirstBattleStart): T07, T13 → ドメインレベル
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleDomAdapter } from '../src/index.js';
import { getStore } from './helpers.js';
import { createRoot, setFrontlineNormalAttackSelections } from './dom-adapter-test-utils.js';

/**
 * excludeCharaLabels に含まれないキャラクターから5つのスタイルIDを選ぶ
 * @param {import('../src/index.js').HbrDataStore} store
 * @param {string[]} excludeCharaLabels
 * @returns {number[]}
 */
function pickFiveUniqueOthers(store, excludeCharaLabels) {
  const excludeSet = new Set(excludeCharaLabels);
  const result = [];
  const seen = new Set();
  for (const style of store.styles) {
    if (!Array.isArray(style.skills) || style.skills.length === 0) continue;
    const label = String(style.chara_label ?? '');
    if (excludeSet.has(label) || seen.has(label)) continue;
    seen.add(label);
    result.push(Number(style.id));
    if (result.length === 5) break;
  }
  if (result.length !== 5) {
    throw new Error(`pickFiveUniqueOthers: not enough styles (got ${result.length})`);
  }
  return result;
}

// ── 31B: Love and Peace (OnEveryTurn + DefenseUp + Turn()<=3) ─────────────

test('T01: 31B (Love and Peace) OnEveryTurn で commitCurrentTurn 後に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001103 (RKayamori 無属性SS), support=1002107 (EAoi 無属性)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'EAoi']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1002107 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  setFrontlineNormalAttackSelections(adapter, root, win);
  adapter.commitCurrentTurn();

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'Love and Peace');
  assert.ok(entry, '1ターン目コミット後に Love and Peace が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

test('T02: 31B (Love and Peace) Turn()<=3 の境界: T3 でも発動すること', () => {
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const others = pickFiveUniqueOthers(store, ['RKayamori', 'EAoi']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1002107 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  // 3ターンコミット
  for (let i = 0; i < 3; i++) {
    setFrontlineNormalAttackSelections(adapter, root, win);
    adapter.commitCurrentTurn();
  }

  const entries = adapter.passiveLogEntries.filter((e) => e.passiveName === 'Love and Peace');
  assert.ok(entries.length > 0, '3ターンコミット後も Love and Peace が passiveLogEntries に存在すること');
});

test('T03: 31B (Love and Peace) Turn()<=3 境界: T5 以降は新規発動しないこと', () => {
  // Turn() 条件は実装済み。applyRecoveryPipeline は前ターンの状態で評価するため、
  // T3 の回復イベントが T4 のコミット記録に含まれる（1ターン遅延）。
  // T5 以降は T4 の回復（turnIdx=4 > 3 = false）も含まず、新規イベントが記録されないことを確認。
  const store = getStore();
  const { root, win } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const others = pickFiveUniqueOthers(store, ['RKayamori', 'EAoi']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1002107 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  // 4ターンコミット後の Love and Peace 件数を記録
  for (let i = 0; i < 4; i++) {
    setFrontlineNormalAttackSelections(adapter, root, win);
    adapter.commitCurrentTurn();
  }
  const countAfterT4 = adapter.passiveLogEntries.filter((e) => e.passiveName === 'Love and Peace').length;

  // 5ターン目コミット後は件数が増えないこと（T4 の回復は turnIdx=4>3 で条件不成立）
  setFrontlineNormalAttackSelections(adapter, root, win);
  adapter.commitCurrentTurn();
  const countAfterT5 = adapter.passiveLogEntries.filter((e) => e.passiveName === 'Love and Peace').length;

  assert.ok(countAfterT4 > 0, `T4 までに Love and Peace が発動していること（count=${countAfterT4}）`);
  assert.equal(
    countAfterT5,
    countAfterT4,
    `T5 コミット後は Love and Peace が追加されないこと（T4 回復は Turn()=4>3 で条件不成立、T4=${countAfterT4}, T5=${countAfterT5}）`
  );
});

// ── 31E: Get it together! (OnPlayerTurnStart + GiveDefenseDebuffUp) ────────

test('T04: 31E (Get it together!) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001104 (RKayamori Fire SS), support=1006104 (IcOhshima Fire)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'IcOhshima']);
  adapter.initializeBattle(
    [1001104, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1006104 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'Get it together!');
  assert.ok(entry, 'initializeBattle 後の T1 開始時に Get it together! が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── 31F: We Live Better (OnPlayerTurnStart + GiveAttackBuffUp) ────────────

test('T05: 31F (We Live Better) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001103 (RKayamori 無属性SS), support=1007104 (MYanagi 無属性)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'MYanagi']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1007104 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'We Live Better');
  assert.ok(entry, 'initializeBattle 後の T1 開始時に We Live Better が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── 30G: Faith (OnFirstBattleStart + Morale) ─────────────────────────────

test('T06: 30G (Faith) OnFirstBattleStart で initializeBattle 後に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001108 (RKayamori Dark+Fire SSR), support=1004106 (YShirakawa Dark)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'YShirakawa']);
  adapter.initializeBattle(
    [1001108, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1004106 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'Faith');
  assert.ok(entry, 'initializeBattle 後に Faith が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── 31X: Excelsior! (OnFirstBattleStart + AdditionalHitOnBreaking + OverDrivePointUp) ───

test('T07: 31X (Excelsior!) buildCharacterStyle の passives に OnFirstBattleStart タイミングのパッシブが含まれること（AdditionalHit系はsilent-skip）', () => {
  const store = getStore();
  // AdditionalHit系パッシブはタイミングパイプラインで silent-skip のため passiveLogEntries には表示されない
  // ドメインレベルで passives に正しく注入されていることを確認する
  const cs = store.buildCharacterStyle({
    styleId: 1001104,
    partyIndex: 0,
    supportStyleId: 1008105,
    supportStyleLimitBreakLevel: 0,
  });

  const supportPassive = cs.passives.find(
    (p) => p.name === 'Excelsior!' && p.timing === 'OnFirstBattleStart'
  );
  assert.ok(supportPassive, 'buildCharacterStyle の passives に Excelsior! (OnFirstBattleStart) が含まれること');
  assert.equal(supportPassive.sourceType, 'support', 'sourceType が "support" であること');
});

// ── SupportSkill_MSatsuki01: 暗躍 (OnPlayerTurnStart + AttackUp) ──────────

test('T08: SupportSkill_MSatsuki01 (暗躍) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001103 (RKayamori 無属性SS), support=1003607 (MSatsuki 無属性)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'MSatsuki']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1003607 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === '暗躍');
  assert.ok(entry, 'initializeBattle 後の T1 開始時に 暗躍 が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── SupportSkill_VBalakrishnan01: ムクワス (OnBattleWin + HealSkillUsedCount) ──

test('T09: SupportSkill_VBalakrishnan01 (ムクワス) buildCharacterStyle の passives に OnBattleWin タイミングのパッシブが含まれること', () => {
  const store = getStore();
  // HealSkillUsedCount はタイミングパイプライン外で処理（silent-skip）のため passiveLogEntries には表示されない
  // ドメインレベルでパッシブが正しく注入されていることを確認する
  const cs = store.buildCharacterStyle({
    styleId: 1001111,  // RKayamori Ice SSR
    partyIndex: 0,
    supportStyleId: 1008406,  // VBalakrishnan Ice
    supportStyleLimitBreakLevel: 0,
  });

  const supportPassive = cs.passives.find(
    (p) => p.name === 'ムクワス' && p.timing === 'OnBattleWin'
  );
  assert.ok(supportPassive, 'buildCharacterStyle の passives に ムクワス (OnBattleWin) が含まれること');
  assert.equal(supportPassive.sourceType, 'support', 'sourceType が "support" であること');
});

// ── SupportSkill_CSkopovskaya01: ザクースカ (OnBattleWin + HealSkillUsedCount) ──

test('T10: SupportSkill_CSkopovskaya01 (ザクースカ) buildCharacterStyle の passives に OnBattleWin タイミングのパッシブが含まれること', () => {
  const store = getStore();
  // HealSkillUsedCount はタイミングパイプライン外で処理（silent-skip）のため passiveLogEntries には表示されない
  const cs = store.buildCharacterStyle({
    styleId: 1001104,  // RKayamori Fire SS
    partyIndex: 0,
    supportStyleId: 1008607,  // CSkopovskaya Fire
    supportStyleLimitBreakLevel: 0,
  });

  const supportPassive = cs.passives.find(
    (p) => p.name === 'ザクースカ' && p.timing === 'OnBattleWin'
  );
  assert.ok(supportPassive, 'buildCharacterStyle の passives に ザクースカ (OnBattleWin) が含まれること');
  assert.equal(supportPassive.sourceType, 'support', 'sourceType が "support" であること');
});

// ── SupportSkill_SMinase01: つめとぎ (OnPlayerTurnStart + AttackUp) ────────

test('T11: SupportSkill_SMinase01 (つめとぎ) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001111 (RKayamori Ice SSR), support=1002307 (SMinase Ice)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'SMinase']);
  adapter.initializeBattle(
    [1001111, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1002307 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'つめとぎ');
  assert.ok(entry, 'initializeBattle 後の T1 開始時に つめとぎ が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── SupportSkill_IrOhshima01: 素敵な夜 (OnBattleStart + Mocktail) ─────────

test('T12: SupportSkill_IrOhshima01 (素敵な夜) Mocktail は action-time modifier のため initializeBattle 後 passiveLogEntries に表示されないこと（silent-skip 仕様確認）', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001108 (RKayamori Dark+Fire SSR), support=1006506 (IrOhshima Dark)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'IrOhshima']);
  adapter.initializeBattle(
    [1001108, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1006506 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === '素敵な夜');
  assert.equal(entry, undefined, '素敵な夜（Mocktail）は silent-skip のため passiveLogEntries に含まれないこと');

  // ドメインレベルでは正しく注入されていることを確認
  const cs = store.buildCharacterStyle({
    styleId: 1001108,
    partyIndex: 0,
    supportStyleId: 1006506,
    supportStyleLimitBreakLevel: 0,
  });
  const supportPassive = cs.passives.find((p) => p.name === '素敵な夜');
  assert.ok(supportPassive, 'buildCharacterStyle の passives には 素敵な夜 が注入されていること');
});

// ── SupportSkill_IRedmayne01: Q.E.D. (OnFirstBattleStart + AdditionalHitOnHealedSpWithoutSelfHeal + OverDrivePointUp) ──

test('T13: SupportSkill_IRedmayne01 (Q.E.D.) buildCharacterStyle の passives に OnFirstBattleStart タイミングのパッシブが含まれること（AdditionalHit系はsilent-skip）', () => {
  const store = getStore();
  // AdditionalHit系パッシブはタイミングパイプラインで silent-skip のため passiveLogEntries には表示されない
  const cs = store.buildCharacterStyle({
    styleId: 1001103,  // RKayamori 無属性SS
    partyIndex: 0,
    supportStyleId: 1008307,  // IRedmayne 無属性
    supportStyleLimitBreakLevel: 0,
  });

  const supportPassive = cs.passives.find(
    (p) => p.name === 'Q.E.D.' && p.timing === 'OnFirstBattleStart'
  );
  assert.ok(supportPassive, 'buildCharacterStyle の passives に Q.E.D. (OnFirstBattleStart) が含まれること');
  assert.equal(supportPassive.sourceType, 'support', 'sourceType が "support" であること');
});

// ── SupportSkill_TTojo01: フィーバー・サマータイム (OnPlayerTurnStart + GiveAttackBuffUp, DpRate()>=0.5 条件) ──

test('T14: SupportSkill_TTojo01 (フィーバー・サマータイム) DP 50% 以上のとき passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001104 (RKayamori Fire SS), support=1001404 (TTojo Fire)
  // initialDp: currentDp=100, baseMaxDp=100 → DpRate=1.0 >= 0.5
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'TTojo']);
  adapter.initializeBattle(
    [1001104, ...others],
    {
      supportStyleIdsByPartyIndex: { 0: 1001404 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0 },
      initialDpStateByPartyIndex: { 0: { currentDp: 100, baseMaxDp: 100 } },
    }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'フィーバー・サマータイム');
  assert.ok(entry, 'DP 50% 以上のとき フィーバー・サマータイム が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

test('T15: SupportSkill_TTojo01 (フィーバー・サマータイム) DP 50% 未満のとき passiveLogEntries に記録されないこと', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // initialDp: currentDp=49, baseMaxDp=100 → DpRate=0.49 < 0.5
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'TTojo']);
  adapter.initializeBattle(
    [1001104, ...others],
    {
      supportStyleIdsByPartyIndex: { 0: 1001404 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0 },
      initialDpStateByPartyIndex: { 0: { currentDp: 49, baseMaxDp: 100 } },
    }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'フィーバー・サマータイム');
  assert.equal(entry, undefined, 'DP 50% 未満のとき フィーバー・サマータイム は passiveLogEntries に記録されないこと');
});

// ── SupportSkill_MTenne01: 毛づくろい (OnOverdriveStart + GiveDefenseDebuffUp) ──

test('T16: SupportSkill_MTenne01 (毛づくろい) OnOverdriveStart で OD 開始後に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001111 (RKayamori Ice SSR), support=1003304 (MTenne Ice)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'MTenne']);
  adapter.initializeBattle(
    [1001111, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1003304 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  adapter.state.turnState.odGauge = 120;
  adapter.renderTurnStatus();
  adapter.openOdDialog('normal');
  adapter.confirmOdDialog('normal');

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === '毛づくろい');
  assert.ok(entry, 'OD 開始後に 毛づくろい が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── SupportSkill_IMinase01: ライブ・ブースト (OnPlayerTurnStart + AttackUp) ──

test('T17: SupportSkill_IMinase01 (ライブ・ブースト) OnPlayerTurnStart で initializeBattle 後 T1 開始時に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001104 (RKayamori Fire SS), support=1002204 (IMinase Fire)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'IMinase']);
  adapter.initializeBattle(
    [1001104, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1002204 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'ライブ・ブースト');
  assert.ok(entry, 'initializeBattle 後の T1 開始時に ライブ・ブースト が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

// ── SupportSkill_YIzumi01: ディスチャージ (OnPlayerTurnStart + GiveDefenseDebuffUp, DpRate()>=0.5 条件) ──

test('T18: SupportSkill_YIzumi01 (ディスチャージ) DP 50% 以上のとき passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001107 (RKayamori Thunder SS), support=1001205 (YIzumi Thunder)
  // initialDp: currentDp=100, baseMaxDp=100 → DpRate=1.0 >= 0.5
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'YIzumi']);
  adapter.initializeBattle(
    [1001107, ...others],
    {
      supportStyleIdsByPartyIndex: { 0: 1001205 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0 },
      initialDpStateByPartyIndex: { 0: { currentDp: 100, baseMaxDp: 100 } },
    }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'ディスチャージ');
  assert.ok(entry, 'DP 50% 以上のとき ディスチャージ が passiveLogEntries に記録されること');
  assert.equal(entry.characterName, '茅森 月歌', '発動キャラクター名が正しいこと');
});

test('T19: SupportSkill_YIzumi01 (ディスチャージ) DP 50% 未満のとき passiveLogEntries に記録されないこと', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // initialDp: currentDp=49, baseMaxDp=100 → DpRate=0.49 < 0.5
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'YIzumi']);
  adapter.initializeBattle(
    [1001107, ...others],
    {
      supportStyleIdsByPartyIndex: { 0: 1001205 },
      supportLimitBreakLevelsByPartyIndex: { 0: 0 },
      initialDpStateByPartyIndex: { 0: { currentDp: 49, baseMaxDp: 100 } },
    }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === 'ディスチャージ');
  assert.equal(entry, undefined, 'DP 50% 未満のとき ディスチャージ は passiveLogEntries に記録されないこと');
});

// ── SupportSkill_BIYamawaki01: 忠義 (OnFirstBattleStart + BIYamawakiServant + DefenseUp) ──

test('T20: SupportSkill_BIYamawaki01 (忠義) OnFirstBattleStart で initializeBattle 後に passiveLogEntries に記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  // main=1001103 (RKayamori 無属性SS), support=1003109 (BIYamawaki 無属性)
  const others = pickFiveUniqueOthers(store, ['RKayamori', 'BIYamawaki']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1003109 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === '忠義');
  assert.ok(entry, 'initializeBattle 後に 忠義 が passiveLogEntries に記録されること（DefenseUp part が発動）');
});

test('T21: SupportSkill_BIYamawaki01 (忠義) passiveEventsLastApplied に defenseUpRate が記録されること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const others = pickFiveUniqueOthers(store, ['RKayamori', 'BIYamawaki']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1003109 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const event = adapter.state.turnState.passiveEventsLastApplied?.find(
    (e) => e.passiveName === '忠義'
  );
  assert.ok(event, 'passiveEventsLastApplied に 忠義 エントリが存在すること');
  assert.ok(
    typeof event.defenseUpRate === 'number' && event.defenseUpRate > 0,
    `忠義 エントリの defenseUpRate が正の数値であること（got: ${event?.defenseUpRate}）`
  );
});

test('T22: SupportSkill_BIYamawaki01 (忠義) passiveLogEntries の 忠義 エントリの characterName がメインキャラ名と一致すること', () => {
  const store = getStore();
  const { root } = createRoot();
  const adapter = new BattleDomAdapter({ root, dataStore: store, initialSP: 10 });
  adapter.mount();

  const others = pickFiveUniqueOthers(store, ['RKayamori', 'BIYamawaki']);
  adapter.initializeBattle(
    [1001103, ...others],
    { supportStyleIdsByPartyIndex: { 0: 1003109 }, supportLimitBreakLevelsByPartyIndex: { 0: 0 } }
  );

  const entry = adapter.passiveLogEntries.find((e) => e.passiveName === '忠義');
  assert.ok(entry, '忠義 エントリが passiveLogEntries に存在すること');
  assert.equal(
    entry.characterName,
    '茅森 月歌',
    'BIYamawakiServant は silent-skip のため、忠義 エントリの characterName はメインキャラ（茅森 月歌）であること'
  );
});
