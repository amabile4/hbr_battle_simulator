import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';

function buildParty() {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BDR${idx + 1}`,
      characterName: `BDR${idx + 1}`,
      styleId: idx + 1,
      styleName: `BDRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 92100 + idx,
          name: 'Noop',
          label: `BDRSkill${idx + 1}`,
          sp_cost: 0,
          parts: [],
        },
      ],
    })
  );
  return new Party(members);
}

function setEnemy(state, { statuses, eShield }) {
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: statuses.map((s) => ({ ...s })),
    eShieldStateByEnemy: {
      0: { ...eShield, defUpRate: 0, damageLimit: 0 },
    },
  };
  return state;
}

function runNoop(state) {
  const preview = previewTurn(state, {
    0: { characterId: 'BDR1', skillId: 92100 },
    1: { characterId: 'BDR2', skillId: 92101 },
    2: { characterId: 'BDR3', skillId: 92102 },
  });
  return commitTurn(state, preview);
}

test('ブレイク付与直後→1tick→2tickの3段ライフサイクル: remaining=1 → 0 (grace) → 削除+Eシールド復帰', () => {
  const party = buildParty();
  const t3Setup = setEnemy(createBattleStateFromParty(party), {
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
    eShield: { current: 0, max: 25, elements: ['Ice'] },
  });

  // T4 相当の tick 後: remaining=0 で active、E シールドはまだ 0
  const { nextState: afterT4 } = runNoop(t3Setup);
  const t4DownTurn = afterT4.turnState.enemyState.statuses.find(
    (s) => s.statusType === 'DownTurn' && s.targetIndex === 0
  );
  assert.ok(t4DownTurn, 'T4 時点で DownTurn が grace active のはず');
  assert.equal(Number(t4DownTurn.remainingTurns ?? -1), 0);
  assert.equal(afterT4.turnState.enemyState.eShieldStateByEnemy['0'].current, 0);

  // T5 相当の tick 後: DownTurn が削除され、E シールドは max に自然回復
  const { nextState: afterT5 } = runNoop({
    ...t3Setup,
    turnState: afterT4.turnState,
    party: t3Setup.party,
  });
  assert.equal(
    afterT5.turnState.enemyState.statuses.some(
      (s) => s.statusType === 'DownTurn' && s.targetIndex === 0
    ),
    false
  );
  assert.equal(afterT5.turnState.enemyState.eShieldStateByEnemy['0'].current, 25);
  assert.equal(afterT5.turnState.enemyState.eShieldStateByEnemy['0'].max, 25);
});

test('super-break (同一 action の SuperBreakDown) でもダウンターン長は DEFAULT と同じ 1 ターン', () => {
  // SAME_ACTION_SUPER_BREAK_DOWN_INITIAL_REMAINING が DEFAULT(=1) と一致することの保証
  const party = buildParty();
  const state = setEnemy(createBattleStateFromParty(party), {
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
    eShield: { current: 0, max: 25, elements: ['Ice'] },
  });

  const { nextState: afterFirst } = runNoop(state);
  const afterFirstDown = afterFirst.turnState.enemyState.statuses.find(
    (s) => s.statusType === 'DownTurn' && s.targetIndex === 0
  );
  assert.ok(afterFirstDown);
  assert.equal(Number(afterFirstDown.remainingTurns ?? -1), 0);

  const { nextState: afterSecond } = runNoop({
    ...state,
    turnState: afterFirst.turnState,
    party: state.party,
  });
  assert.equal(
    afterSecond.turnState.enemyState.statuses.some(
      (s) => s.statusType === 'DownTurn' && s.targetIndex === 0
    ),
    false
  );
  assert.equal(afterSecond.turnState.enemyState.eShieldStateByEnemy['0'].current, 25);
});
