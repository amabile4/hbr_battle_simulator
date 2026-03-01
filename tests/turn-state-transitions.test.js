import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateOverdrive,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  grantExtraTurn,
  Party,
  previewTurn,
} from '../src/index.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

function buildActionDict(party) {
  return Object.fromEntries(
    party.getFrontline().map((member) => {
      const skill = member.skills.find((item) => item.spCost > 0) ?? member.skills[0];
      return [
        String(member.position),
        {
          characterId: member.characterId,
          skillId: skill.skillId,
        },
      ];
    })
  );
}

test('od state transitions to normal after remaining actions consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  state = activateOverdrive(state, 1, 'preemptive');

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.remainingOdActions, 1);

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
});

test('extra turn can be granted and consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const allowed = [party.getByPosition(0).characterId];
  state = grantExtraTurn(state, allowed);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.extraTurnState.active, true);
  assert.equal(
    state.party.filter((m) => m.isExtraActive).map((m) => m.characterId).join(','),
    allowed.join(','),
    'only granted member should be marked as extra-active'
  );

  const preview = previewTurn(state, {
    0: {
      characterId: party.getByPosition(0).characterId,
      skillId: party.getByPosition(0).skills[0].skillId,
    },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(
    nextState.party.some((m) => m.isExtraActive),
    false,
    'extra-active flags should be cleared after extra turn finishes'
  );
});

function createManualExtraTurnParty() {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const characterId = `C${idx + 1}`;
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;

    return new CharacterStyle({
      characterId,
      characterName: characterId,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });

  return new Party(members);
}

test('commitTurn grants extra turn and marks allowed members as extra-active', () => {
  const party = createManualExtraTurnParty();
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'C1', skillId: 9000 },
    1: { characterId: 'C2', skillId: 9001 },
    2: { characterId: 'C3', skillId: 9002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(
    nextState.turnState.extraTurnState?.allowedCharacterIds,
    ['C1', 'C2', 'C3'],
    'AllyFront grant should mark current frontline members'
  );
  assert.deepEqual(
    nextState.party
      .filter((m) => m.isExtraActive)
      .map((m) => m.characterId)
      .sort(),
    ['C1', 'C2', 'C3']
  );
});

test('extra turn disallows non-allowed members from acting', () => {
  const party = createManualExtraTurnParty();
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['C1']);

  assert.throws(
    () =>
      previewTurn(state, {
        1: { characterId: 'C2', skillId: 9001 },
      }),
    /not allowed to act in extra turn/
  );
});
