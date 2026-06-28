// クイーン 慧眼の女教皇 — スキル・パッシブ動作テスト
// 総攻撃: turn-controller.js に MassAttack / OverallAttack 相当の実装なし → 未実装

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInitialPassiveState,
  CharacterStyle,
  Party,
  commitTurn,
  createBattleStateFromParty,
  previewTurn,
} from '../src/index.js';
import { getStore } from './helpers.js';

const QUEEN_STYLE_ID = 1021203;
const QUEEN_NORMAL_ATTACK_SKILL_ID = 46041201;
const QUEEN_ATOMIC_FLARE_SKILL_ID = 46041206;
const QUEEN_INITIAL_SP = 16;
const E_SHIELD_INITIAL_VALUE = 10;
const ATOMIC_FLARE_HIT_COUNT = 5;
const QUEEN_NORMAL_ATTACK_HIT_COUNT = 4;
const E_SHIELD_ELEMENTS = Object.freeze(['Fire', 'Ice', 'Thunder']);

function makeProtectionSkill(id) {
  return {
    id,
    name: 'プロテクション',
    sp_cost: 0,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function buildQueenParty(store, limitBreakLevel = 1, { normalAttackElements = [] } = {}) {
  const queen = store.buildCharacterStyle({
    styleId: QUEEN_STYLE_ID,
    partyIndex: 0,
    initialSP: QUEEN_INITIAL_SP,
    limitBreakLevel,
    normalAttackElements,
  });
  const fillers = Array.from(
    { length: 5 },
    (_, index) => new CharacterStyle({
      characterId: `QNF${index + 1}`,
      characterName: `QNF${index + 1}`,
      styleId: 9330 + index,
      styleName: `QNF${index}`,
      partyIndex: index + 1,
      position: index + 1,
      initialSP: 10,
      skills: [makeProtectionSkill(9330 + index)],
    })
  );
  return { queen, party: new Party([queen, ...fillers]) };
}

function createQueenState(limitBreakLevel = 1, options = {}) {
  const store = getStore();
  const { queen, party } = buildQueenParty(store, limitBreakLevel, options);
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  return { queen: state.party[0], state };
}

function setEnemyEShield(state, element) {
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Strike: 100 } },
    eShieldStateByEnemy: {
      '0': {
        current: E_SHIELD_INITIAL_VALUE,
        max: E_SHIELD_INITIAL_VALUE,
        elements: [element],
        defUpRate: 0,
        damageLimit: 0,
      },
    },
  };
}

function previewQueenSkill(state, queen, skillId) {
  return previewTurn(state, {
    0: {
      characterId: queen.characterId,
      skillId,
      targetEnemyIndex: 0,
    },
  });
}

test('1MORE: アトミックフレアは弱点・Eシールドなしでも追加ターンを発生させる', () => {
  const { queen, state } = createQueenState(1);
  const preview = previewQueenSkill(state, queen, QUEEN_ATOMIC_FLARE_SKILL_ID);
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.ok(nextState.turnState.extraTurnState?.allowedCharacterIds?.includes(queen.characterId));
});

test('1MORE: 通常攻撃では追加ターンを発生させない', () => {
  const { queen, state } = createQueenState(1);
  const preview = previewQueenSkill(state, queen, QUEEN_NORMAL_ATTACK_SKILL_ID);
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(nextState.turnState.turnType, 'extra');
});

for (const element of E_SHIELD_ELEMENTS) {
  test(`Eシールド属性無視: アトミックフレアは${element} Eシールドを減少させる`, () => {
    const { queen, state } = createQueenState(1);
    setEnemyEShield(state, element);

    const preview = previewQueenSkill(state, queen, QUEEN_ATOMIC_FLARE_SKILL_ID);
    const { nextState } = commitTurn(state, preview);
    const eShieldAfter = nextState.turnState.enemyState?.eShieldStateByEnemy?.['0'];

    assert.equal(eShieldAfter.current, E_SHIELD_INITIAL_VALUE - ATOMIC_FLARE_HIT_COUNT);
  });
}

test('通常攻撃は同属性Eシールドのみ減少させる', () => {
  const matching = createQueenState(1, { normalAttackElements: ['Fire'] });
  setEnemyEShield(matching.state, 'Fire');
  const matchingCommit = commitTurn(
    matching.state,
    previewQueenSkill(matching.state, matching.queen, QUEEN_NORMAL_ATTACK_SKILL_ID)
  );
  assert.equal(
    matchingCommit.nextState.turnState.enemyState.eShieldStateByEnemy['0'].current,
    E_SHIELD_INITIAL_VALUE - QUEEN_NORMAL_ATTACK_HIT_COUNT
  );

  const mismatching = createQueenState(1, { normalAttackElements: ['Fire'] });
  setEnemyEShield(mismatching.state, 'Ice');
  const mismatchingCommit = commitTurn(
    mismatching.state,
    previewQueenSkill(mismatching.state, mismatching.queen, QUEEN_NORMAL_ATTACK_SKILL_ID)
  );
  assert.equal(
    mismatchingCommit.nextState.turnState.enemyState.eShieldStateByEnemy['0'].current,
    E_SHIELD_INITIAL_VALUE
  );
});

test('微分積分 LB2: アトミックフレアのFunnel追加hitは2', () => {
  const { queen, state } = createQueenState(2);
  const preview = previewQueenSkill(state, queen, QUEEN_ATOMIC_FLARE_SKILL_ID);

  assert.equal(preview.actions[0].skillFunnelHitBonus, 2);
});

test('微分積分 LB3: Only競合では強い方が採用されFunnel追加hitは5', () => {
  const { queen, state } = createQueenState(3);
  const preview = previewQueenSkill(state, queen, QUEEN_ATOMIC_FLARE_SKILL_ID);

  assert.equal(preview.actions[0].skillFunnelHitBonus, 5);
});
