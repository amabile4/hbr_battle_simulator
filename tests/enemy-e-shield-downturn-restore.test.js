import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';

function buildSixMemberDownTurnParty() {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `DTR${idx + 1}`,
      characterName: `DTR${idx + 1}`,
      styleId: idx + 1,
      styleName: `DTRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 91100 + idx,
          name: 'Noop',
          label: `DTRSkill${idx + 1}`,
          sp_cost: 0,
          parts: [],
        },
      ],
    })
  );
  return new Party(members);
}

function setEnemyDownTurnAndShield(
  state,
  {
    current = 0,
    max = 30,
    maxByStage = null,
    elements = ['Fire'],
    remainingTurns = 0,
    extraHpGaugeState = null,
  } = {}
) {
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns }],
    eShieldStateByEnemy: {
      0: {
        current,
        max,
        ...(Array.isArray(maxByStage) ? { maxByStage: [...maxByStage] } : {}),
        elements,
        defUpRate: 0,
        damageLimit: 0,
      },
    },
    ...(extraHpGaugeState ? { extraHpGaugeStateByEnemy: { 0: structuredClone(extraHpGaugeState) } } : {}),
  };
  return state;
}

function runDefaultPreviewCommit(state) {
  const preview = previewTurn(state, {
    0: { characterId: 'DTR1', skillId: 91100 },
    1: { characterId: 'DTR2', skillId: 91101 },
    2: { characterId: 'DTR3', skillId: 91102 },
  });
  return commitTurn(state, preview);
}

test('Eシールド current=0 の敵の DownTurn (remaining=0) が tick で消滅すると current が max まで自動復帰する', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 0,
    max: 30,
    elements: ['Fire'],
    remainingTurns: 0,
  });

  const { nextState } = runDefaultPreviewCommit(state);

  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
    ),
    false
  );
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 30);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].max, 30);
});

test('Eシールド current が max のまま残っている敵では DownTurn (remaining=0) 消滅で値が変わらない', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 30,
    max: 30,
    elements: ['Fire'],
    remainingTurns: 0,
  });

  const { nextState } = runDefaultPreviewCommit(state);

  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 30);
});

test('部分減算された Eシールド (current<max) も DownTurn (remaining=0) 消滅で max まで戻る', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 12,
    max: 45,
    elements: ['Wind'],
    remainingTurns: 0,
  });

  const { nextState } = runDefaultPreviewCommit(state);

  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 45);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].max, 45);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'].elements, ['Wind']);
});

test('段階別Eシールドは DownTurn 自然回復で現在HP段階の max まで戻る', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 0,
    max: 30,
    maxByStage: [30, 35, 40],
    elements: ['Fire', 'Light', 'Dark'],
    remainingTurns: 0,
    extraHpGaugeState: {
      total: 3,
      remaining: 2,
      values: [75000000, 150000000, 200000000],
    },
  });

  const { nextState } = runDefaultPreviewCommit(state);

  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 35);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].max, 35);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'].maxByStage, [30, 35, 40]);
});

test('DownTurn remaining=1 は 1 tick 後も remaining=0 で active のまま (Eシールド復帰しない)', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 0,
    max: 30,
    elements: ['Fire'],
    remainingTurns: 1,
  });

  const { nextState } = runDefaultPreviewCommit(state);

  const downTurn = nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurn, 'DownTurn が remaining=0 で残っているはず');
  assert.equal(Number(downTurn.remainingTurns ?? -1), 0);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 0);
});

test('DownTurn が複数ターン残っている場合は Eシールドが復帰しない (まだ DownTurn 中)', () => {
  const party = buildSixMemberDownTurnParty();
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
    eShieldStateByEnemy: {
      0: { current: 0, max: 30, elements: ['Fire'], defUpRate: 0, damageLimit: 0 },
    },
  };

  const { nextState } = runDefaultPreviewCommit(state);

  const downTurn = nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurn, 'DownTurn が残っているはず');
  assert.equal(Number(downTurn.remainingTurns ?? -1), 1);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 0);
});

test('DownTurn remaining=1 → 2 commit 後に削除 + Eシールド max 復帰 (break→回復ライフサイクル)', () => {
  const party = buildSixMemberDownTurnParty();
  const state = setEnemyDownTurnAndShield(createBattleStateFromParty(party), {
    current: 0,
    max: 30,
    elements: ['Fire'],
    remainingTurns: 1,
  });

  const { nextState: afterFirst } = runDefaultPreviewCommit(state);
  const afterFirstDownTurn = afterFirst.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(afterFirstDownTurn);
  assert.equal(Number(afterFirstDownTurn.remainingTurns ?? -1), 0);
  assert.equal(afterFirst.turnState.enemyState.eShieldStateByEnemy['0'].current, 0);

  const { nextState: afterSecond } = runDefaultPreviewCommit({
    ...state,
    turnState: afterFirst.turnState,
    party: state.party,
  });
  assert.equal(
    afterSecond.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
    ),
    false
  );
  assert.equal(afterSecond.turnState.enemyState.eShieldStateByEnemy['0'].current, 30);
});
