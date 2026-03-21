import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, createBattleStateFromParty, Party } from '../src/index.js';
import { DEFAULT_INITIAL_SP } from '../src/config/battle-defaults.js';
import { createInitializedBattleSnapshot, queueSwapState } from '../src/ui/adapter-core.js';
import { getStore } from './helpers.js';

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

test('createInitializedBattleSnapshot keeps reported frontline initial SP at 9/11/9', () => {
  const snapshot = createInitializedBattleSnapshot({
    dataStore: getStore(),
    initialSP: DEFAULT_INITIAL_SP,
    styleIds: [1005504, 1004107, 1001408, 1001710, 1007106, 1020603],
    skillSetsByPartyIndex: {
      0: [
        46005501, 46005502, 46005503, 46005504, 46005505, 46005506, 46005507, 46005508, 46505501, 46300001,
        46300002, 46300003, 46300004, 46300005, 46300006, 46300007, 46300008, 46300009, 46300010, 46300011,
        46300012, 46300013, 46300014, 46300015, 46300017, 46300018, 46450001,
      ],
      1: [
        46004101, 46004102, 46004105, 46004104, 46004106, 46004103, 46004108, 46004109, 46004114, 46004117,
        46004118, 46004119, 46300001, 46300002, 46300003, 46300004, 46300005, 46300006, 46300007, 46300008,
        46300009, 46300010, 46300011, 46300012, 46300013, 46300014, 46300015, 46300017, 46300018, 46450001,
        46404101,
      ],
      2: [
        46001401, 46001402, 46001403, 46001406, 46001461, 46001404, 46001405, 46001408, 46001410, 46001412,
        46001413, 46300001, 46300002, 46300003, 46300004, 46300005, 46300006, 46300007, 46300008, 46300009,
        46300010, 46300011, 46300012, 46300013, 46300014, 46300015, 46300017, 46300018, 46450001, 46401401,
      ],
      3: [
        46001701, 46001702, 46001703, 46001704, 46001706, 46001761, 46001705, 46001708, 46001709, 46001711,
        46001713, 46001715, 46001716, 46300001, 46300002, 46300003, 46300004, 46300005, 46300006, 46300007,
        46300008, 46300009, 46300010, 46300011, 46300012, 46300013, 46300014, 46300015, 46300017, 46300018,
        46450001, 46401601,
      ],
      4: [46007110, 46407101, 46007102, 46007103, 46007104, 46007161, 46007106, 46007108, 46007109, 46507101, 46300003, 46300007, 46300009],
      5: [
        46040601, 46040602, 46040603, 46040604, 46300001, 46300002, 46300003, 46300004, 46300005, 46300006,
        46300007, 46300008, 46300009, 46300010, 46300011, 46300012, 46300013, 46300014, 46300015, 46300017,
        46300018, 46450001,
      ],
    },
    limitBreakLevelsByPartyIndex: { 0: 4, 1: 4, 2: 3, 3: 3, 4: 4, 5: 3 },
    drivePierceByPartyIndex: {},
    normalAttackElementsByPartyIndex: {},
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    initialMotivationByPartyIndex: {},
    initialDpStateByPartyIndex: {},
    initialBreakByPartyIndex: {},
    tokenStateByPartyIndex: {},
    moraleStateByPartyIndex: {},
    motivationStateByPartyIndex: {},
    markStateByPartyIndex: {},
    statusEffectsByPartyIndex: {},
    supportStyleIdsByPartyIndex: { 0: 1003204, 1: 1004305, 2: 1004507, 3: 1008406, 4: 1007104, 5: 1001508 },
    supportLimitBreakLevelsByPartyIndex: { 0: 4, 1: 4, 2: 4, 3: 1, 4: 4, 5: 4 },
    initialOdGauge: 0,
    enemyCount: 1,
  });

  assert.deepEqual(
    snapshot.state.party.slice(0, 3).map((member) => member.sp.current),
    [9, 11, 9]
  );
});
