import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSkillCostLabel } from '../ui-next/utils/skill-label.js';
import { resolveEffectiveSkillForAction } from '../src/turn/turn-controller.js';
import { createBattleStateFromParty } from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

// ────────────────────────────────────────────────────────────────
// 1〜6: 純粋なフォーマット分岐テスト（state=null、エンジン呼び出しなし）
// ────────────────────────────────────────────────────────────────

test('SP スキル: state=null でも raw spCost を "(N)" 形式で表示する', () => {
  const skill = { spCost: 4, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), '(4)');
});

test('SP コスト 0 スキル（通常攻撃）: "(0)" を返す', () => {
  const skill = { spCost: 0, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), '(0)');
});

test('EP 消費スキル: "E(N)" を返す', () => {
  const skill = { spCost: 3, consumeType: 'Ep' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'E(3)');
});

test('Token 消費スキル: "T(N)" を返す', () => {
  const skill = { spCost: 2, consumeType: 'Token' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'T(2)');
});

test('SP ALL スキル（spCost=-1）: "(*)" を返す', () => {
  const skill = { spCost: -1, consumeType: 'Sp' };
  assert.equal(formatSkillCostLabel(skill, null, null), '(*)');
});

test('Token ALL スキル（spCost=-1）: "T(*)" を返す', () => {
  const skill = { spCost: -1, consumeType: 'Token' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'T(*)');
});

test('Morale 消費スキル: "M(N)" を返す', () => {
  const skill = { spCost: 3, consumeType: 'Morale' };
  assert.equal(formatSkillCostLabel(skill, null, null), 'M(3)');
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

  // 両方とも "(N)" 形式
  assert.match(rawLabel, /^\(\d+\)$/, `raw ラベルが "(N)" 形式: ${rawLabel}`);
  assert.match(effectiveLabel, /^\(\d+\)$/, `effective ラベルが "(N)" 形式: ${effectiveLabel}`);

  const rawCost = Number(rawLabel.slice(1, -1));
  const effectiveCost = Number(effectiveLabel.slice(1, -1));
  assert.equal(
    effectiveCost,
    rawCost - 1,
    `ReduceSp -1 により SP コストが 1 減少する (raw: ${rawCost} → effective: ${effectiveCost})`
  );
});

// ────────────────────────────────────────────────────────────────
// 8〜9: 鬼神化（STezuka の isReinforcedMode）エンジンベーステスト
//
// resolveEffectiveSkillForAction が isReinforcedMode=true 時に
// consumeType='Sp' かつ spCost > 0 のスキルの spCost を 0 に解決することを確認する。
// UIワークアラウンドに依存せず、エンジン層で一元管理される。
// ────────────────────────────────────────────────────────────────

/** STezuka スタイルを含む6名パーティを組んで battleState を返す。STezuka が見つからない場合は null。 */
function buildStateWithTezuka() {
  const store = getStore();
  const tezukaStyle = store.styles.find((s) => String(s.chara_label ?? '') === 'STezuka');
  if (!tezukaStyle) return null;
  const others = getSixUsableStyleIds(store).filter((id) => id !== Number(tezukaStyle.id));
  const party = store.buildPartyFromStyleIds([Number(tezukaStyle.id), ...others.slice(0, 5)]);
  return createBattleStateFromParty(party);
}

test('鬼神化中 STezuka: resolveEffectiveSkillForAction が SP スキルの spCost を 0 に解決する', () => {
  const state = buildStateWithTezuka();
  if (!state) return; // STezuka スタイルがデータに存在しない場合はスキップ

  const member = state.party.find((m) => m.characterId === 'STezuka');
  assert.ok(member, 'STezuka がパーティに存在する');

  member.activateReinforcedMode();
  assert.equal(member.isReinforcedMode, true, '鬼神化が有効化されている');

  const skill = member.getActionSkills().find(
    (s) => Number(s.spCost) > 0 && String(s.consumeType ?? 'Sp') === 'Sp'
  );
  assert.ok(skill, 'SP コスト > 0 の Sp スキルが存在する');

  const resolved = resolveEffectiveSkillForAction(state, member, skill);
  assert.equal(
    resolved.spCost,
    0,
    `鬼神化中 STezuka の SP スキルコストがエンジン層で 0 に解決される (元コスト: ${skill.spCost})`
  );
});

test('鬼神化中 STezuka: formatSkillCostLabel がエンジン経由で "(0)" を返す', () => {
  const state = buildStateWithTezuka();
  if (!state) return; // STezuka スタイルがデータに存在しない場合はスキップ

  const member = state.party.find((m) => m.characterId === 'STezuka');
  assert.ok(member, 'STezuka がパーティに存在する');

  member.activateReinforcedMode();

  const skill = member.getActionSkills().find(
    (s) => Number(s.spCost) > 0 && String(s.consumeType ?? 'Sp') === 'Sp'
  );
  assert.ok(skill, 'SP コスト > 0 の Sp スキルが存在する');

  const label = formatSkillCostLabel(skill, member, state);
  assert.equal(label, '(0)', `鬼神化中 STezuka の SP スキルラベルが "(0)" になる`);
});

// ────────────────────────────────────────────────────────────────
// 10〜11: 鬼神化条件が揃わない場合（state=null フォールバック）
// ────────────────────────────────────────────────────────────────

test('STezuka でも isReinforcedMode=false なら通常コストを返す（state=null）', () => {
  const skill = { spCost: 10, consumeType: 'Sp' };
  const member = { characterId: 'STezuka', isReinforcedMode: false };
  assert.equal(formatSkillCostLabel(skill, member, null), '(10)');
});

test('非 STezuka の isReinforcedMode=true: 鬼神化チェックをスキップして通常コストを返す（state=null）', () => {
  const skill = { spCost: 4, consumeType: 'Sp' };
  const member = { characterId: 'RKayamori', isReinforcedMode: true };
  assert.equal(formatSkillCostLabel(skill, member, null), '(4)');
});
