import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, createBattleStateFromParty, Party } from '../src/index.js';
import { createInitializedBattleSnapshot, queueSwapState } from '../src/ui/adapter-core.js';

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

test('createInitializedBattleSnapshot applies statusEffectsByPartyIndex before initial passive evaluation', () => {
  const party = new Party(
    Array.from({ length: 6 }, (_, idx) =>
      new CharacterStyle({
        characterId: `S${idx + 1}`,
        characterName: `Status${idx + 1}`,
        styleId: idx + 1,
        styleName: `Style${idx + 1}`,
        partyIndex: idx,
        position: idx,
        initialSP: 10,
        passives:
          idx === 0
            ? [
                {
                  id: 9501,
                  name: '拘束検知',
                  timing: 'OnFirstBattleStart',
                  condition: 'CountBC(IsPlayer()==1&&SpecialStatusCountByType(79)>0)>0',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ]
            : [],
        skills: [
          {
            id: 9900 + idx,
            name: `Skill${idx + 1}`,
            sp_cost: 0,
            parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
          },
        ],
      })
    )
  );
  const fakeStore = {
    buildPartyFromStyleIds() {
      return party;
    },
  };

  const snapshot = createInitializedBattleSnapshot({
    dataStore: fakeStore,
    initialSP: 10,
    styleIds: [1, 2, 3, 4, 5, 6],
    skillSetsByPartyIndex: {},
    limitBreakLevelsByPartyIndex: {},
    drivePierceByPartyIndex: {},
    normalAttackElementsByPartyIndex: {},
    startSpEquipByPartyIndex: {},
    initialMotivationByPartyIndex: {},
    initialDpStateByPartyIndex: {},
    initialBreakByPartyIndex: {},
    tokenStateByPartyIndex: {},
    moraleStateByPartyIndex: {},
    motivationStateByPartyIndex: {},
    markStateByPartyIndex: {},
    statusEffectsByPartyIndex: {
      1: [{ specialStatusTypeId: 79, exitCond: 'PlayerTurnEnd', remainingTurns: 1 }],
    },
    supportStyleIdsByPartyIndex: {},
    supportLimitBreakLevelsByPartyIndex: {},
    initialOdGauge: 0,
    enemyCount: 1,
  });

  assert.equal(snapshot.state.party[0].sp.current, 12);
  assert.equal(
    snapshot.state.party[1].statusEffects.some(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === 79 && Number(effect.remaining) === 1
    ),
    true
  );
  assert.equal(
    snapshot.turnPlanBaseSetup.statusEffectsByPartyIndex['1'].some(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === 79
    ),
    true
  );
});

test('createInitializedBattleSnapshot keeps support setup in turnPlanBaseSetup', () => {
  const fakeStore = {
    buildPartyFromStyleIds(styleIds) {
      return new Party(
        styleIds.map((styleId, idx) =>
          new CharacterStyle({
            characterId: `SUP${idx + 1}`,
            characterName: `Support${idx + 1}`,
            styleId: Number(styleId),
            styleName: `SupportStyle${idx + 1}`,
            partyIndex: idx,
            position: idx,
            initialSP: 10,
            skills: [{ id: 9900 + idx, name: `Skill${idx + 1}`, sp_cost: 0, parts: [] }],
          })
        )
      );
    },
  };

  const snapshot = createInitializedBattleSnapshot({
    dataStore: fakeStore,
    initialSP: 10,
    styleIds: [1, 2, 3, 4, 5, 6],
    skillSetsByPartyIndex: {},
    limitBreakLevelsByPartyIndex: {},
    drivePierceByPartyIndex: {},
    normalAttackElementsByPartyIndex: {},
    startSpEquipByPartyIndex: {},
    initialMotivationByPartyIndex: {},
    initialDpStateByPartyIndex: {},
    initialBreakByPartyIndex: {},
    supportStyleIdsByPartyIndex: { 0: 1001408 },
    supportLimitBreakLevelsByPartyIndex: { 0: 3 },
    initialOdGauge: 0,
    enemyCount: 1,
  });

  assert.deepEqual(snapshot.turnPlanBaseSetup.supportStyleIdsByPartyIndex, { 0: 1001408 });
  assert.deepEqual(snapshot.turnPlanBaseSetup.supportLimitBreakLevelsByPartyIndex, { 0: 3 });
});
