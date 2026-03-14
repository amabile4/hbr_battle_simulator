import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party } from '../src/index.js';
import { BattleAdapterFacade } from '../src/ui/battle-adapter-facade.js';

function createStubDataStore() {
  return {
    buildPartyFromStyleIds(styleIds, options = {}) {
      return new Party(
        styleIds.map((styleId, idx) =>
          new CharacterStyle({
            characterId: `F${idx + 1}`,
            characterName: `Facade${idx + 1}`,
            styleId: Number(styleId),
            styleName: `FacadeStyle${idx + 1}`,
            partyIndex: idx,
            position: idx,
            initialSP: Number(options.initialSpByPartyIndex?.[idx] ?? options.initialSP ?? 10),
            skills: [
              {
                id: 9100 + idx,
                name: `FacadeSkill${idx + 1}`,
                sp_cost: 0,
                parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
              },
            ],
          })
        )
      );
    },
  };
}

function createInitializeOptions(overrides = {}) {
  return {
    styleIds: [101, 102, 103, 104, 105, 106],
    skillSetsByPartyIndex: {},
    limitBreakLevelsByPartyIndex: {},
    drivePierceByPartyIndex: {},
    normalAttackElementsByPartyIndex: {},
    startSpEquipByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    initialMotivationByPartyIndex: {},
    initialDpStateByPartyIndex: {},
    initialBreakByPartyIndex: {},
    initialOdGauge: 0,
    enemyCount: 1,
    enemyNamesByEnemy: {},
    damageRatesByEnemy: {},
    destructionRateByEnemy: {},
    destructionRateCapByEnemy: {},
    enemyStatuses: [],
    breakStateByEnemy: {},
    enemyZoneConfigByEnemy: {},
    zoneState: null,
    territoryState: null,
    ...overrides,
  };
}

function createFrontlineActions() {
  return {
    0: { characterId: 'F1', skillId: 9100, targetEnemyIndex: 0 },
    1: { characterId: 'F2', skillId: 9101, targetEnemyIndex: 0 },
    2: { characterId: 'F3', skillId: 9102, targetEnemyIndex: 0 },
  };
}

test('initializeBattleState resets turn-plan state unless preserveTurnPlans is true', () => {
  const facade = new BattleAdapterFacade({ dataStore: createStubDataStore(), initialSP: 10 });
  facade.turnPlans = [{ turnId: 'T1' }];
  facade.turnPlanComputedRecords = [{ turnId: 'R1' }];
  facade.turnPlanReplayError = new Error('stale');
  facade.turnPlanReplayWarnings = ['warn'];
  facade.turnPlanEditSession = { active: true };
  facade.replayScript.turns = [{ turn: 1 }];

  facade.initializeBattleState(createInitializeOptions());

  assert.deepEqual(facade.turnPlans, []);
  assert.deepEqual(facade.turnPlanComputedRecords, []);
  assert.equal(facade.turnPlanReplayError, null);
  assert.deepEqual(facade.turnPlanReplayWarnings, []);
  assert.equal(facade.turnPlanEditSession, null);
  assert.equal(facade.turnPlanBaseSetup.forceOdToggle, false);
  assert.deepEqual(facade.replayScript.turns, []);
  assert.deepEqual(facade.replayScript.setup.styleIds, [101, 102, 103, 104, 105, 106]);
});

test('initializeBattleState preserves turn-plan state when preserveTurnPlans is requested', () => {
  const facade = new BattleAdapterFacade({ dataStore: createStubDataStore(), initialSP: 10 });
  facade.turnPlans = [{ turnId: 'T1' }];
  facade.turnPlanComputedRecords = [{ turnId: 'R1' }];
  facade.turnPlanReplayError = new Error('stale');
  facade.turnPlanReplayWarnings = ['warn'];
  facade.turnPlanEditSession = { active: true };
  facade.replayScript.turns = [{ turn: 1 }];

  facade.initializeBattleState(
    createInitializeOptions({
      preserveTurnPlans: true,
      forceOdToggle: true,
    })
  );

  assert.deepEqual(facade.turnPlans, [{ turnId: 'T1' }]);
  assert.deepEqual(facade.turnPlanComputedRecords, [{ turnId: 'R1' }]);
  assert.equal(facade.turnPlanReplayError instanceof Error, true);
  assert.deepEqual(facade.turnPlanReplayWarnings, ['warn']);
  assert.deepEqual(facade.turnPlanEditSession, { active: true });
  assert.equal(facade.turnPlanBaseSetup.forceOdToggle, true);
  assert.deepEqual(facade.replayScript.turns, [{ turn: 1, slots: [{ styleId: null, skillId: null }, { styleId: null, skillId: null }, { styleId: null, skillId: null }, { styleId: null, skillId: null }, { styleId: null, skillId: null }, { styleId: null, skillId: null }], operations: [], note: '', overrideEntries: [] }]);
  assert.deepEqual(facade.replayScript.setup.styleIds, [101, 102, 103, 104, 105, 106]);
});

test('commitCurrentTurnState captures turn plan and replay turn and clears transient preview state', () => {
  const facade = new BattleAdapterFacade({ dataStore: createStubDataStore(), initialSP: 10 });
  facade.initializeBattleState(createInitializeOptions());
  facade.previewCurrentTurnState({ actions: createFrontlineActions(), enemyCount: 1 });
  facade.turnNoteDraft = 'commit memo';

  const committedRecord = facade.commitCurrentTurnState({
    shouldCaptureTurnPlan: true,
    capturedTurnPlan: { turnId: 'TURN-1' },
    shouldCaptureReplayTurn: true,
    capturedReplayTurn: {
      turn: 1,
      slots: [{ styleId: 101, skillId: 9100 }],
      operations: [{ type: 'UnknownOperation', level: 3 }],
      note: 'commit memo',
    },
  });

  assert.equal(typeof committedRecord.turnLabel, 'string');
  assert.equal(facade.recordStore.records.length, 1);
  assert.equal(facade.previewRecord, null);
  assert.deepEqual(facade.pendingSwapEvents, []);
  assert.equal(facade.pendingInterruptOdLevel, null);
  assert.equal(facade.interruptOdProjection, null);
  assert.equal(facade.preemptiveOdCheckpoint, null);
  assert.equal(facade.kishinkaActivatedThisTurn, false);
  assert.equal(facade.turnNoteDraft, '');
  assert.deepEqual(facade.turnPlans, [{ turnId: 'TURN-1' }]);
  assert.deepEqual(facade.turnPlanComputedRecords, [...facade.recordStore.records]);
  assert.equal(facade.turnPlanReplayError, null);
  assert.deepEqual(facade.turnPlanReplayWarnings, []);
  assert.equal(facade.turnPlanEditSession, null);
  assert.equal(facade.replayScript.turns.length, 1);
  assert.deepEqual(facade.replayScript.turns[0].slots[0], {
    styleId: 101,
    skillId: 9100,
    target: { type: 'none' },
  });
  assert.deepEqual(facade.replayScript.turns[0].operations, [
    { type: 'UnknownOperation', payload: { level: 3 } },
  ]);
  assert.equal(facade.replayScript.turns[0].note, 'commit memo');
});
