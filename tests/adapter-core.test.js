import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, createBattleStateFromParty, Party } from '../src/index.js';
import { queueSwapState } from '../src/ui/adapter-core.js';

function createPartyState() {
  const party = new Party(
    Array.from({ length: 6 }, (_, idx) =>
      new CharacterStyle({
        characterId: `A${idx + 1}`,
        characterName: `Actor${idx + 1}`,
        styleId: idx + 1,
        styleName: `Style${idx + 1}`,
        partyIndex: idx,
        position: idx,
        initialSP: 10,
        skills: [
          {
            id: 9000 + idx,
            name: `Skill${idx + 1}`,
            sp_cost: 0,
            parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
          },
        ],
      })
    )
  );
  return createBattleStateFromParty(party);
}

test('queueSwapState skips same-position swap without mutating state', () => {
  const state = createPartyState();
  const pendingSwapEvents = [];

  const result = queueSwapState(state, pendingSwapEvents, 0, 0);

  assert.deepEqual(result, { event: null, skippedSamePosition: true });
  assert.equal(pendingSwapEvents.length, 0);
  assert.equal(state.party[0].position, 0);
});

test('queueSwapState rejects EX swap when only one side is extra-active', () => {
  const state = createPartyState();
  const pendingSwapEvents = [];
  state.party[0].setExtraActive(true);
  state.party[1].setExtraActive(false);

  assert.throws(
    () => queueSwapState(state, pendingSwapEvents, 0, 1),
    /Swap is allowed only between \[EX\]<->\[EX\] during an Extra Turn\./
  );
  assert.equal(pendingSwapEvents.length, 0);
});

test('queueSwapState records swap event and updates positions once', () => {
  const state = createPartyState();
  const pendingSwapEvents = [];
  state.party[0].setExtraActive(true);
  state.party[3].setExtraActive(true);

  const result = queueSwapState(state, pendingSwapEvents, 0, 3);

  assert.equal(result.skippedSamePosition, false);
  assert.equal(result.event.swapSequence, 1);
  assert.equal(result.event.outCharacterId, 'A1');
  assert.equal(result.event.inCharacterId, 'A4');
  assert.equal(state.party.find((member) => member.characterId === 'A1')?.position, 3);
  assert.equal(state.party.find((member) => member.characterId === 'A4')?.position, 0);
  assert.equal(pendingSwapEvents.length, 1);
  assert.deepEqual(pendingSwapEvents[0], result.event);
});
