import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPassiveTiming,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  Party,
  previewTurn,
} from '../src/index.js';

function createSixMemberManualParty(factory) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `R${idx + 1}`,
      characterName: `R${idx + 1}`,
      styleId: idx + 1,
      styleName: `RS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 29000 + idx,
          name: idx === 0 ? 'プロテクション' : `Skill${idx + 1}`,
          sp_cost: 0,
          parts: idx <= 2 ? [{ skill_type: idx === 0 ? 'BuffDefence' : 'AttackNormal', target_type: 'Self', type: 'None' }] : [],
        },
      ],
      ...(typeof factory === 'function' ? factory(idx) : {}),
    })
  );
  return new Party(members);
}

test('consume_type Ep spends EP instead of SP on preview and commit', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialEP: 5,
          skills: [
            {
              id: 29100,
              name: 'EP Spend',
              sp_cost: 4,
              consume_type: 'Ep',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'R1', skillId: 29100, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions[0].startSP, 10);
  assert.equal(preview.actions[0].endSP, 10);
  assert.equal(preview.actions[0].startEP, 5);
  assert.equal(preview.actions[0].endEP, 1);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const member = nextState.party.find((item) => item.characterId === 'R1');
  const committed = committedRecord.actions.find((item) => item.characterId === 'R1');

  assert.equal(member.ep.current, 1);
  assert.equal(member.sp.current, 12);
  assert.equal(committed.startSP, 10);
  assert.equal(committed.endSP, 12);
  assert.equal(committed.startEP, 5);
  assert.equal(committed.endEP, 1);
});

test('OnPlayerTurnStart passive Ep()>=10 activates only when EP threshold is met', () => {
  const createState = (initialEP) =>
    createBattleStateFromParty(
      createSixMemberManualParty((idx) =>
        idx === 0
          ? {
              initialSP: 1,
              initialEP,
              passives: [
                {
                  id: 29101,
                  name: 'トルクマキシマム',
                  timing: 'OnPlayerTurnStart',
                  condition: 'Ep()>=10',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ],
            }
          : {}
      )
    );

  const matchedState = createState(10);
  const matched = applyPassiveTiming(matchedState, 'OnPlayerTurnStart');
  assert.equal(matched.spEvents.length, 1);
  assert.equal(matchedState.party[0].sp.current, 3);

  const unmatchedState = createState(9);
  const unmatched = applyPassiveTiming(unmatchedState, 'OnPlayerTurnStart');
  assert.equal(unmatched.spEvents.length, 0);
  assert.equal(unmatchedState.party[0].sp.current, 1);
});

test('OnPlayerTurnStart passive Sp()<=3 && IsFront() activates only under low SP threshold', () => {
  const createState = (initialSP) =>
    createBattleStateFromParty(
      createSixMemberManualParty((idx) =>
        idx === 0
          ? {
              initialSP,
              passives: [
                {
                  id: 29102,
                  name: '窮地の閃き',
                  timing: 'OnPlayerTurnStart',
                  condition: 'Sp()<=3 && IsFront()',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ],
            }
          : {}
      )
    );

  const matchedState = createState(3);
  const matched = applyPassiveTiming(matchedState, 'OnPlayerTurnStart');
  assert.equal(matched.spEvents.length, 1);
  assert.equal(matchedState.party[0].sp.current, 5);

  const unmatchedState = createState(4);
  const unmatched = applyPassiveTiming(unmatchedState, 'OnPlayerTurnStart');
  assert.equal(unmatched.spEvents.length, 0);
  assert.equal(unmatchedState.party[0].sp.current, 4);
});

test('OnPlayerTurnStart passive Sp()>=15 && IsFront() activates only under high SP threshold', () => {
  const createState = (initialSP) =>
    createBattleStateFromParty(
      createSixMemberManualParty((idx) =>
        idx === 0
          ? {
              initialSP,
              passives: [
                {
                  id: 29103,
                  name: '万全の構え',
                  timing: 'OnPlayerTurnStart',
                  condition: 'Sp()>=15 && IsFront()',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ],
            }
          : {}
      )
    );

  const matchedState = createState(15);
  const matched = applyPassiveTiming(matchedState, 'OnPlayerTurnStart');
  assert.equal(matched.spEvents.length, 1);
  assert.equal(matchedState.party[0].sp.current, 17);

  const unmatchedState = createState(14);
  const unmatched = applyPassiveTiming(unmatchedState, 'OnPlayerTurnStart');
  assert.equal(unmatched.spEvents.length, 0);
  assert.equal(unmatchedState.party[0].sp.current, 14);
});

test('OnPlayerTurnStart passive MoraleLevel()>=6 && IsFront() checks morale and position together', () => {
  const createState = ({ morale, position }) =>
    createBattleStateFromParty(
      createSixMemberManualParty((idx) =>
        idx === 0
          ? {
              initialSP: 1,
              initialMorale: morale,
              position,
              passives: [
                {
                  id: 29104,
                  name: '士気高揚',
                  timing: 'OnPlayerTurnStart',
                  condition: 'MoraleLevel()>=6 && IsFront()',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ],
            }
          : idx === position
            ? {
                position: 0,
              }
          : {}
      )
    );

  const matchedState = createState({ morale: 6, position: 0 });
  const matched = applyPassiveTiming(matchedState, 'OnPlayerTurnStart');
  assert.equal(matched.spEvents.length, 1);
  assert.equal(matchedState.party[0].sp.current, 3);

  const backlineState = createState({ morale: 6, position: 3 });
  const backline = applyPassiveTiming(backlineState, 'OnPlayerTurnStart');
  assert.equal(backline.spEvents.length, 0);

  const lowMoraleState = createState({ morale: 5, position: 0 });
  const lowMorale = applyPassiveTiming(lowMoraleState, 'OnPlayerTurnStart');
  assert.equal(lowMorale.spEvents.length, 0);
});

test('OnPlayerTurnStart passive IsFront()==0 activates only for backline members', () => {
  const createState = (position) =>
    createBattleStateFromParty(
      createSixMemberManualParty((idx) =>
        idx === 0
          ? {
              initialSP: 1,
              position,
              passives: [
                {
                  id: 29105,
                  name: '後衛支援',
                  timing: 'OnPlayerTurnStart',
                  condition: 'IsFront()==0',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ],
            }
          : idx === position
            ? {
                position: 0,
              }
          : {}
      )
    );

  const backlineState = createState(3);
  const backline = applyPassiveTiming(backlineState, 'OnPlayerTurnStart');
  assert.equal(backline.spEvents.length, 1);
  assert.equal(backlineState.party[0].sp.current, 3);

  const frontlineState = createState(0);
  const frontline = applyPassiveTiming(frontlineState, 'OnPlayerTurnStart');
  assert.equal(frontline.spEvents.length, 0);
  assert.equal(frontlineState.party[0].sp.current, 1);
});
