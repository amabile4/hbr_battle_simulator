// 東城つかさ 激情のファム・ファタール — 1MORE パッシブ動作テスト
//
// 1MORE (LB step1 passive id: 57001343):
//   timing: OnPlayerTurnStart
//   condition: IsAttackNormal()==0  ← 通常攻撃では発動しない
//   parts: AdditionalHitOnWeak → AdditionalTurn
//   発火条件: アクティブスキルが敵の火弱点をついたとき

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';
import { getStore } from './helpers.js';

// ── ID定数 ────────────────────────────────────────────────────────────────────
const TOJO_STYLE_ID            = 1001409;   // 激情のファム・ファタール (TTojo)
const NIKAIDO_STYLE_ID         = 1005106;   // Lead by Example (MNikaido)
const MA_PASION_ID             = 46001415;  // 踊れ！マ・パシオン！ (Fire / All)
const NORMAL_ATTACK_ID         = 46001401;  // つかさ 通常攻撃 (Single)
const KOKUOMUSOU_ID            = 46005117;  // 国士無双 (Fire ResistDown / All)
const NIKAIDO_NORMAL_ATTACK_ID = 46005101;  // 二階堂 通常攻撃 (Single)

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function makeProtectionSkill(id) {
  return { id, name: 'プロテクション', sp_cost: 0, parts: [{ skill_type: 'Protection', target_type: 'Self' }] };
}

// つかさ(LB1 = 1MORE)＋フィラー5人のパーティ
function buildTojoParty(store, { normalAttackElements = [] } = {}) {
  const actor = store.buildCharacterStyle({
    styleId: TOJO_STYLE_ID,
    partyIndex: 0,
    initialSP: 16,
    limitBreakLevel: 1,
    normalAttackElements,
  });
  const fillers = Array.from({ length: 5 }, (_, i) =>
    new CharacterStyle({
      characterId: `TJF${i + 1}`,
      characterName: `TJF${i + 1}`,
      styleId: 9400 + i,
      styleName: `TJF${i}`,
      partyIndex: i + 1,
      position: i + 1,
      initialSP: 10,
      skills: [makeProtectionSkill(9400 + i)],
    })
  );
  return { actor, party: new Party([actor, ...fillers]) };
}

// 二階堂(Pos0)＋つかさ(Pos1, LB1)＋フィラー4人のパーティ
function buildNikaidoTojoParty(store) {
  const nikaido = store.buildCharacterStyle({
    styleId: NIKAIDO_STYLE_ID,
    partyIndex: 0,
    initialSP: 13,
  });
  const tojo = store.buildCharacterStyle({
    styleId: TOJO_STYLE_ID,
    partyIndex: 1,
    initialSP: 16,
    limitBreakLevel: 1,
  });
  const fillers = Array.from({ length: 4 }, (_, i) =>
    new CharacterStyle({
      characterId: `NTF${i + 1}`,
      characterName: `NTF${i + 1}`,
      styleId: 9380 + i,
      styleName: `NTF${i}`,
      partyIndex: i + 2,
      position: i + 2,
      initialSP: 10,
      skills: [makeProtectionSkill(9380 + i)],
    })
  );
  return { nikaido, tojo, party: new Party([nikaido, tojo, ...fillers]) };
}

// 火弱点の敵を enemyState にセット（fire damageRate > 100）
function setFireWeakEnemy(state) {
  state.turnState.enemyState = {
    enemyCount: 1,
    damageRatesByEnemy: { '0': { fire: 150 } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 踊れ！マ・パシオン！ + 火弱点の敵 → 追加ターン発生
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: 踊れ！マ・パシオン！で火弱点の敵を攻撃すると追加ターンが発生する', () => {
  const store = getStore();
  const { actor, party } = buildTojoParty(store);
  const state = createBattleStateFromParty(party);
  setFireWeakEnemy(state);

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: MA_PASION_ID },
    1: { characterId: 'TJF1', skillId: 9400 },
    2: { characterId: 'TJF2', skillId: 9401 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.turnType,
    'extra',
    '踊れ！マ・パシオン！(アクティブスキル)で火弱点をついたとき 1MORE が発動し追加ターンになる'
  );
  assert.ok(
    (nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(actor.characterId),
    '追加ターン対象につかさが含まれる'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 通常攻撃（火ベルト装備）+ 火弱点の敵 → 追加ターン発生しない
//    IsAttackNormal()==1 のため 1MORE の condition が不成立
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: 通常攻撃に火ベルトで火属性を付与しても、火弱点の敵を攻撃したとき追加ターンが発生しない', () => {
  const store = getStore();
  // 火ベルト相当: normalAttackElements = ['Fire']
  const { actor, party } = buildTojoParty(store, { normalAttackElements: ['Fire'] });
  const state = createBattleStateFromParty(party);
  setFireWeakEnemy(state);

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    1: { characterId: 'TJF1', skillId: 9400 },
    2: { characterId: 'TJF2', skillId: 9401 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    '通常攻撃は IsAttackNormal()==1 のため 1MORE の condition が成立せず追加ターンにならない'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 踊れ！マ・パシオン！ + 火弱点なしの敵 → 追加ターン発生しない
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: 踊れ！マ・パシオン！で火弱点のない敵を攻撃しても追加ターンが発生しない', () => {
  const store = getStore();
  const { actor, party } = buildTojoParty(store);
  const state = createBattleStateFromParty(party);
  // enemyState をセットしない（デフォルト: 火弱点なし）

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: MA_PASION_ID },
    1: { characterId: 'TJF1', skillId: 9400 },
    2: { characterId: 'TJF2', skillId: 9401 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    '敵が火弱点でなければ 1MORE は発動せず追加ターンにならない'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 国士無双(二階堂) → 踊れ！マ・パシオン！(つかさ) で追加ターン発生
//    国士無双が火耐性をOverwrite→ResistDownし火弱点化、その後 1MORE が発火する
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: 国士無双で敵の火耐性を下げた後、踊れ！マ・パシオン！で火弱点をつき追加ターンが発生する', () => {
  const store = getStore();
  const { nikaido, tojo, party } = buildNikaidoTojoParty(store);
  const state = createBattleStateFromParty(party);
  // 敵は初期状態（火弱点なし）

  const preview = previewTurn(state, {
    0: { characterId: nikaido.characterId, skillId: KOKUOMUSOU_ID },          // 国士無双: 火耐性Down
    1: { characterId: tojo.characterId,    skillId: MA_PASION_ID },            // 踊れ！マ・パシオン！: 火攻撃
    2: { characterId: 'NTF1',              skillId: 9380 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.turnType,
    'extra',
    '国士無双で火耐性を下げた直後に踊れ！マ・パシオン！を使うと 1MORE が発動し追加ターンになる'
  );
  assert.ok(
    (nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(tojo.characterId),
    '追加ターン対象につかさが含まれる'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. T1:国士無双 → T2:踊れ！マ・パシオン！ でターン跨ぎ追加ターン発生
//    ResistDown(Eternal) がターンを跨いで持続し、T2 の 1MORE が発動する
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: T1に国士無双で火耐性を下げ、T2に踊れ！マ・パシオン！で追加ターンが発生する', () => {
  const store = getStore();
  const { nikaido, tojo, party } = buildNikaidoTojoParty(store);
  const state = createBattleStateFromParty(party);

  // T1: 国士無双(火耐性Down) + つかさは通常攻撃のみ(1MORE不発)
  const preview1 = previewTurn(state, {
    0: { characterId: nikaido.characterId, skillId: KOKUOMUSOU_ID },
    1: { characterId: tojo.characterId,    skillId: NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    2: { characterId: 'NTF1',              skillId: 9380 },
  });
  const { nextState: stateAfterT1 } = commitTurn(state, preview1);

  assert.equal(stateAfterT1.turnState.turnType, 'normal', 'T1終了時は通常ターン（追加ターンなし）');

  // T2: 踊れ！マ・パシオン！ — ResistDown が Eternal で持続しているため火弱点を突く
  const preview2 = previewTurn(stateAfterT1, {
    0: { characterId: nikaido.characterId, skillId: NIKAIDO_NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    1: { characterId: tojo.characterId,    skillId: MA_PASION_ID },
    2: { characterId: 'NTF1',              skillId: 9380 },
  });
  const { nextState: stateAfterT2 } = commitTurn(stateAfterT1, preview2);

  assert.equal(
    stateAfterT2.turnState.turnType,
    'extra',
    'T1 の国士無双 ResistDown がT2まで持続し、踊れ！マ・パシオン！で 1MORE が発動して追加ターンになる'
  );
  assert.ok(
    (stateAfterT2.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(tojo.characterId),
    '追加ターン対象につかさが含まれる'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. T1:国士無双なし → T2:踊れ！マ・パシオン！ では追加ターン不発（ネガティブ）
//    ResistDown がなければ T2 でも火弱点は生じない
// ─────────────────────────────────────────────────────────────────────────────

test('1MORE: T1に国士無双なし、T2に踊れ！マ・パシオン！でも追加ターンが発生しない', () => {
  const store = getStore();
  const { nikaido, tojo, party } = buildNikaidoTojoParty(store);
  const state = createBattleStateFromParty(party);

  // T1: 通常行動のみ（ResistDown なし）
  const preview1 = previewTurn(state, {
    0: { characterId: nikaido.characterId, skillId: NIKAIDO_NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    1: { characterId: tojo.characterId,    skillId: NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    2: { characterId: 'NTF1',              skillId: 9380 },
  });
  const { nextState: stateAfterT1 } = commitTurn(state, preview1);

  // T2: 踊れ！マ・パシオン！ — 火弱点なし → 1MORE 不発
  const preview2 = previewTurn(stateAfterT1, {
    0: { characterId: nikaido.characterId, skillId: NIKAIDO_NORMAL_ATTACK_ID, targetEnemyIndex: 0 },
    1: { characterId: tojo.characterId,    skillId: MA_PASION_ID },
    2: { characterId: 'NTF1',              skillId: 9380 },
  });
  const { nextState: stateAfterT2 } = commitTurn(stateAfterT1, preview2);

  assert.notEqual(
    stateAfterT2.turnState.turnType,
    'extra',
    'T1 に国士無双がなければ ResistDown は付与されず、T2 の踊れ！マ・パシオン！では 1MORE は発動しない'
  );
});
