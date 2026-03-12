// 速弾き（Shredding）実装テスト
// 仕組みA: 速弾きバフ / 仕組みB: SPが0以上であれば使用可能スキル
// タスクリスト: docs/active/shredding_implementation_tasklist.md T9-T15

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';

const SHREDDING_SKILL_ID = 90001;
const NORMAL_SKILL_ID = 90002;
const COSTLY_SKILL_ID = 90003;
const FULL_CONSUME_SKILL_ID = 90004;
const SP_MINUS_COND_SKILL_ID = 90005;
const ADV_SKILL_ID = 90006;

function buildShreddingParty(overridesByIdx = {}) {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const base = {
      characterId: `SH${idx + 1}`,
      characterName: `SH${idx + 1}`,
      styleId: 9000 + idx,
      styleName: `SHS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: NORMAL_SKILL_ID + idx,
          name: `通常${idx}`,
          sp_cost: 0,
          parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
    };
    return new CharacterStyle({ ...base, ...(overridesByIdx[idx] ?? {}) });
  });
  return new Party(members);
}

// ─────────────────────────────────────────────────────────────
// T9: 速弾き付与 — かき鳴らせキラーチューン相当のスキル使用後、全メンバーに shreddingTurnsRemaining = 3 が付与される
// ─────────────────────────────────────────────────────────────

test('速弾き付与: Shredding スキル使用後、全パーティメンバーの shreddingTurnsRemaining = 3', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: 15,
      skills: [
        {
          id: SHREDDING_SKILL_ID,
          name: 'かき鳴らせキラーチューン',
          sp_cost: 12,
          parts: [
            {
              skill_type: 'Shredding',
              target_type: 'AllyAll',
              effect: { exitCond: 'PlayerTurnEnd', exitVal: [3, 0] },
            },
          ],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SH1', skillId: SHREDDING_SKILL_ID },
    1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
    2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
  });

  const { nextState } = commitTurn(state, preview);

  for (const member of nextState.party) {
    assert.equal(
      member.shreddingTurnsRemaining,
      3,
      `${member.characterId} の shreddingTurnsRemaining = 3`
    );
    assert.equal(member.isShredding, true, `${member.characterId} の isShredding = true`);
  }
});

// ─────────────────────────────────────────────────────────────
// T10: 速弾き中の SP 下限 — SP=0 でコスト 14 のスキルを使用 → endSP = -14
// ─────────────────────────────────────────────────────────────

test('速弾き中の SP 下限: SP=0 でコスト 14 のスキルを使用 → endSP = -14', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: 0,
      shreddingTurnsRemaining: 3,
      spMin: -30,
      skills: [
        {
          id: COSTLY_SKILL_ID,
          name: 'コストの高いスキル',
          sp_cost: 14,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SH1', skillId: COSTLY_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
    2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
  });

  const entry = preview.actions.find((a) => a.characterId === 'SH1');
  assert.equal(entry.startSP, 0, 'startSP = 0');
  assert.equal(entry.endSP, -14, 'endSP = -14（速弾き中は sp.min=-30 まで下降可）');
});

// ─────────────────────────────────────────────────────────────
// T11: 速弾き中に SP がマイナスになった後、Sp()<0 条件スキルが使用可能
// ─────────────────────────────────────────────────────────────

test('速弾き中の Sp()<0 条件スキル: SP がマイナスのとき spring_roji スキルが使用可能', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: -5,
      shreddingTurnsRemaining: 3,
      spMin: -30,
      skills: [
        {
          id: SP_MINUS_COND_SKILL_ID,
          name: '春の宵の塵に同じ',
          sp_cost: 0,
          cond: 'Sp()<0',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SH1', skillId: SP_MINUS_COND_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
    2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
  });

  const entry = preview.actions.find((a) => a.characterId === 'SH1');
  assert.equal(entry.startSP, -5, 'startSP = -5');
  assert.equal(entry.endSP, -5, 'sp_cost: 0 なので SP 変化なし');
});

// ─────────────────────────────────────────────────────────────
// T12: 速弾き状態カウントダウン — 3 ターン後に turnsRemaining = 0 になる
// ─────────────────────────────────────────────────────────────

test('速弾き状態のカウントダウン: 3 ターン後に shreddingTurnsRemaining = 0 になり sp.min が 0 に戻る', () => {
  let party = buildShreddingParty({
    0: { shreddingTurnsRemaining: 3, spMin: -30, initialSP: 10 },
    1: { shreddingTurnsRemaining: 3, spMin: -30, initialSP: 10 },
    2: { shreddingTurnsRemaining: 3, spMin: -30, initialSP: 10 },
  });

  let state = createBattleStateFromParty(party);

  for (let turn = 1; turn <= 3; turn++) {
    const preview = previewTurn(state, {
      0: { characterId: 'SH1', skillId: NORMAL_SKILL_ID },
      1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
      2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
    });
    const result = commitTurn(state, preview);
    state = result.nextState;

    const expected = 3 - turn;
    for (let pos = 0; pos <= 2; pos++) {
      const member = state.party.find((m) => m.position === pos);
      assert.equal(
        member.shreddingTurnsRemaining,
        expected,
        `ターン ${turn} 後: SH${pos + 1}.shreddingTurnsRemaining = ${expected}`
      );
    }
  }

  // 3 ターン後: sp.min が 0 に戻る
  for (let pos = 0; pos <= 2; pos++) {
    const member = state.party.find((m) => m.position === pos);
    assert.equal(member.isShredding, false, `SH${pos + 1} の isShredding = false`);
    assert.equal(member.sp.min, 0, `SH${pos + 1} の sp.min = 0（解除後）`);
  }
});

// ─────────────────────────────────────────────────────────────
// T13: sp_cost=-1 スキルは速弾き中でも速弾き SP 判定の対象外（cond チェックは通常通り）
// ─────────────────────────────────────────────────────────────

test('sp_cost=-1 スキルは速弾き中でも cond が Sp()>0 なら SP=0 で使用不可', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: 0,
      shreddingTurnsRemaining: 3,
      spMin: -30,
      skills: [
        {
          id: FULL_CONSUME_SKILL_ID,
          name: '全消費スキル',
          sp_cost: -1,
          cond: 'Sp()>0',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'SH1', skillId: FULL_CONSUME_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
        2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
      }),
    /cannot be used because cond is not satisfied/,
    'sp_cost=-1 かつ cond=Sp()>0 の場合、SP=0 ではエラー'
  );
});

test('速弾き中の sp_cost=-1 スキル: SP > 0 のとき全 SP を消費して endSP = 0 になる', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: 8,
      shreddingTurnsRemaining: 3,
      spMin: -30,
      skills: [
        {
          id: FULL_CONSUME_SKILL_ID,
          name: '全消費スキル',
          sp_cost: -1,
          cond: 'Sp()>0',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SH1', skillId: FULL_CONSUME_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
    2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
  });

  const entry = preview.actions.find((a) => a.characterId === 'SH1');
  assert.equal(entry.startSP, 8, 'startSP = 8');
  assert.equal(entry.endSP, 0, 'endSP = 0（全消費）');
});

// ─────────────────────────────────────────────────────────────
// T14: "SPが0以上であれば使用可能" スキル（仕組みB）— SP>=0 のとき使用可能、SP<0 のときエラー
// ─────────────────────────────────────────────────────────────

test('"SPが0以上" スキル（仕組みB）: SP = 0 のとき使用可能', () => {
  // cond: 'Sp()>=0' は T8 で is_adv=true スキルに付与される（ここでは直接インライン指定）
  const party = buildShreddingParty({
    0: {
      initialSP: 0,
      skills: [
        {
          id: ADV_SKILL_ID,
          name: 'パニッシャー',
          sp_cost: 10,
          is_adv: true,
          cond: 'Sp()>=0',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SH1', skillId: ADV_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
    2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
  });

  const entry = preview.actions.find((a) => a.characterId === 'SH1');
  assert.equal(entry.startSP, 0, 'startSP = 0');
  assert.equal(entry.endSP, 0, 'endSP = 0（sp_cost=10 だが sp.min=0 にクランプ）');
});

test('"SPが0以上" スキル（仕組みB）: SP < 0 のとき使用不可', () => {
  const party = buildShreddingParty({
    0: {
      initialSP: -3,
      spMin: -5,
      skills: [
        {
          id: ADV_SKILL_ID,
          name: 'パニッシャー',
          sp_cost: 10,
          is_adv: true,
          cond: 'Sp()>=0',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
        },
      ],
    },
  });

  const state = createBattleStateFromParty(party);
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'SH1', skillId: ADV_SKILL_ID, targetEnemyIndex: 0 },
        1: { characterId: 'SH2', skillId: NORMAL_SKILL_ID + 1 },
        2: { characterId: 'SH3', skillId: NORMAL_SKILL_ID + 2 },
      }),
    /cannot be used because cond is not satisfied/,
    'SP < 0 のとき Sp()>=0 条件を満たさないためエラー'
  );
});
