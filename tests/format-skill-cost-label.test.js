import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSkillCostLabel } from '../ui-next/utils/skill-label.js';
import { createBattleStateFromParty } from '../src/index.js';
import { getStore } from './helpers.js';

// ────────────────────────────────────────────────────────────────
// 1〜6: 純粋なフォーマット分岐テスト（state=null、エンジン呼び出しなし）
// ────────────────────────────────────────────────────────────────

test('SP スキル: state=null でも raw spCost を "SP N" 形式で表示する', () => {
  const skill = { spCost: 4, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'SP 4');
});

test('SP コスト 0 スキル（通常攻撃）: "SP 0" を返す', () => {
  const skill = { spCost: 0, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'SP 0');
});

test('EP 消費スキル: "EP N" を返す', () => {
  const skill = { spCost: 3, consumeType: 'Ep' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'EP 3');
});

test('Token 消費スキル: "Token N" を返す', () => {
  const skill = { spCost: 2, consumeType: 'Token' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'Token 2');
});

test('SP ALL スキル（spCost=-1）: "SP ALL" を返す', () => {
  const skill = { spCost: -1, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'SP ALL');
});

test('Token ALL スキル（spCost=-1）: "Token ALL" を返す', () => {
  const skill = { spCost: -1, consumeType: 'Token' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'Token ALL');
});

test('Morale 消費スキル: "Morale N" を返す', () => {
  const skill = { spCost: 3, consumeType: 'Morale' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'Morale 3');
});

// ────────────────────────────────────────────────────────────────
// 7: ReduceSp パッシブ適用テスト（実データ + エンジン呼び出し）
//
// RKayamori11 (id:1001111) は LB=1 で Passive.Start_ReduceSp03 を習得。
// このパッシブは timing=OnFirstBattleStart / condition="" / target_condition="IsNatureElement(Ice)"
// → 氷属性の味方全員の消費 SP を常時 -1 する。
// RKayamori11 自身も氷属性なので、自分のスキルコストが -1 される。
// ────────────────────────────────────────────────────────────────

test('ReduceSp パッシブ: RKayamori11 (LB=1) がパーティにいると氷属性メンバー自身の SP コストが -1 される', () => {
  const store = getStore();
  // パーティ構成: RKayamori11 (index=0, LB=1) + 他5キャラ
  const styleIds = [1001111, 1001201, 1001301, 1001401, 1001501, 1001701];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 15,
    limitBreakLevelsByPartyIndex: { 0: 1 }, // index 0 = RKayamori11 を LB1 に
  });
  const state = createBattleStateFromParty(party);

  // RKayamori11 は氷属性なので自身の ReduceSp パッシブが自身にも適用される
  const member = state.party.find((m) => m.characterId === 'RKayamori');
  assert.ok(member, 'RKayamori がパーティに存在する');

  // SP コスト > 0 のスキルを取得（RKayamori11 の SP スキルは 9 / 13）
  const skill = member.getActionSkills().find((s) => s.spCost > 0);
  assert.ok(skill, 'SP コスト > 0 のスキルが存在する');

  const rawLabel = formatSkillCostLabel(skill, null, null);        // パッシブ未適用
  const effectiveLabel = formatSkillCostLabel(skill, member, state); // パッシブ適用後

  // 両方とも "SP N" 形式
  assert.match(rawLabel, /^SP \d+$/, `raw ラベルが "SP N" 形式: ${rawLabel}`);
  assert.match(effectiveLabel, /^SP \d+$/, `effective ラベルが "SP N" 形式: ${effectiveLabel}`);

  const rawCost = Number(rawLabel.replace('SP ', ''));
  const effectiveCost = Number(effectiveLabel.replace('SP ', ''));
  assert.equal(
    effectiveCost,
    rawCost - 1,
    `ReduceSp -1 により SP コストが 1 減少する (raw: ${rawCost} → effective: ${effectiveCost})`
  );
});

// ────────────────────────────────────────────────────────────────
// 8〜11: 鬼神化（STezuka の isReinforcedMode）テスト
//
// エンジンの character-style.js:L446-455 と同じ判定を UI 層でも保持している。
// resolveEffectiveSkillForAction は kishinka SP0 を返さないため UI 側で処理する。
// ────────────────────────────────────────────────────────────────

// STezuka / 非 STezuka のモックメンバー（state 不要なので null で十分）
const TEZUKA_REINFORCED = { characterId: 'STezuka', isReinforcedMode: true };
const TEZUKA_NORMAL     = { characterId: 'STezuka', isReinforcedMode: false };
const NON_TEZUKA_REINFORCED = { characterId: 'RKayamori', isReinforcedMode: true };

test('鬼神化中 STezuka: SP 消費スキルは "SP 0" を返す', () => {
  const skill = { spCost: 10, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, TEZUKA_REINFORCED, null), 'SP 0');
});

test('鬼神化中 STezuka: EP 消費スキルは "EP N" をそのまま返す（鬼神化チェックをスキップ）', () => {
  const skill = { spCost: 3, consumeType: 'Ep' };
  assert.equal(formatSkillCostLabel(skill, TEZUKA_REINFORCED, null), 'EP 3');
});

test('鬼神化中 STezuka: Token 消費スキルは "Token N" をそのまま返す', () => {
  const skill = { spCost: 2, consumeType: 'Token' };
  assert.equal(formatSkillCostLabel(skill, TEZUKA_REINFORCED, null), 'Token 2');
});

test('鬼神化中 STezuka: Morale 消費スキルは "Morale N" をそのまま返す', () => {
  const skill = { spCost: 3, consumeType: 'Morale' };
  assert.equal(formatSkillCostLabel(skill, TEZUKA_REINFORCED, null), 'Morale 3');
});

test('STezuka でも isReinforcedMode=false なら通常コストを返す', () => {
  const skill = { spCost: 10, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, TEZUKA_NORMAL, null), 'SP 10');
});

test('非 STezuka の isReinforcedMode=true: 鬼神化チェックをスキップして通常コストを返す', () => {
  const skill = { spCost: 4, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, NON_TEZUKA_REINFORCED, null), 'SP 4');
});
