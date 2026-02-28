import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateOverdrive,
  commitTurn,
  createBattleStateFromParty,
  grantExtraTurn,
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

  const preview = previewTurn(state, {
    0: {
      characterId: party.getByPosition(0).characterId,
      skillId: party.getByPosition(0).skills[0].skillId,
    },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
});
