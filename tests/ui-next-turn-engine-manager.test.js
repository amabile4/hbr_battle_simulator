import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CharacterStyle, HbrDataStore, Party, applyInitialPassiveState, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';
import { REPLAY_OPERATION_TYPES, REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';
import { DEFAULT_VALIDATION_POLICY } from '../ui-next/utils/validation-policy.js';
import { DEFAULT_SUMMON_SAMPLE_ENEMY } from '../src/data/enemy-sample-presets.js';
import { getSixUsableStyleIds, getStore } from './helpers.js';

const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_SKILL_ID = 46003117;

function loadSessionFixture(fileName) {
  const fixtureUrl = new URL(`./fixtures/${fileName}`, import.meta.url);
  const text = fs.readFileSync(fixtureUrl, 'utf8');
  return normalizeSessionSnapshot(JSON.parse(text));
}

function createSkill({ id, name, targetType, parts, spCost = 0, cond = '' }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: spCost,
    cond,
    target_type: targetType,
    parts,
  };
}

function createMakaiKiheiPassive() {
  return {
    id: 57001285,
    label: 'Passive.Machina_Demon',
    name: '魔界騎兵起動！',
    timing: 'OnBattleStart',
    parts: [
      {
        skill_type: 'SpecialCommandCountUp',
        target_type: 'Self',
        power: [3, 0],
        strval: [
          {
            id: MAKAI_KIHEI_SKILL_ID,
            label: 'BIYamawakiSkill55b',
            name: '魔界騎兵起動',
            hit_count: 6,
            target_type: 'All',
            consume_type: 'Sp',
            is_restricted: 0,
            sp_cost: 0,
            max_level: 1,
            overwrite: 0,
            overwrite_cond: '',
            effect: '',
            cond: '',
            parts: [
              { skill_type: 'PenetrationCriticalAttack', target_type: 'All', type: 'Slash' },
            ],
            hits: [
              { id: 1, type: 'Main', power_ratio: 1 / 6 },
              { id: 2, type: 'Main', power_ratio: 1 / 6 },
              { id: 3, type: 'Main', power_ratio: 1 / 6 },
              { id: 4, type: 'Main', power_ratio: 1 / 6 },
              { id: 5, type: 'Main', power_ratio: 1 / 6 },
              { id: 6, type: 'Main', power_ratio: 1 / 6 },
            ],
          },
          -1,
        ],
      },
    ],
  };
}

function createBreakHealPassive() {
  return {
    id: 99910,
    name: '激動テスト',
    timing: 'OnFirstBattleStart',
    parts: [
      { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0] },
      { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0] },
    ],
  };
}

function createManualParty(actorSkill, actorOptions = {}) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? (actorOptions.characterId ?? 'TM1') : `TM${index + 1}`,
      characterName: index === 0 ? (actorOptions.characterName ?? 'TM1') : `TM${index + 1}`,
      styleId: index === 0 ? (actorOptions.styleId ?? 9100) : 9100 + index,
      styleName: index === 0 ? (actorOptions.styleName ?? 'TS1') : `TS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: index === 0 ? (actorOptions.initialSP ?? 10) : 10,
      skills: [
        index === 0
          ? (actorOptions.skills ?? [actorSkill])
          : createSkill({
              id: 9200 + index,
              name: `Normal${index + 1}`,
              targetType: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            }),
      ].flat(),
      passives: index === 0 ? (actorOptions.passives ?? []) : [],
    })
  );
  return new Party(members);
}

function createInitialState(actorSkill, actorOptions = {}) {
  return createBattleStateFromParty(createManualParty(actorSkill, actorOptions));
}

function createSummonEnemyOperation({
  enemyId = DEFAULT_SUMMON_SAMPLE_ENEMY.id,
  enemyName = DEFAULT_SUMMON_SAMPLE_ENEMY.name,
  maxDRate = 350,
  fireRate = 250,
} = {}) {
  return {
    type: REPLAY_OPERATION_TYPES.SUMMON_ENEMY,
    payload: {
      enemyId,
      enemyName,
      od_rate: 0,
      max_d_rate: maxDRate,
      resistances: {
        element: {
          slash: 100,
          stab: 100,
          strike: 100,
          fire: fireRate,
          ice: 250,
          thunder: 250,
          light: 250,
          dark: 250,
          nonelement: 100,
        },
      },
      absorbElementList: ['fire'],
    },
  };
}

function createLegacyExtraTurnInitialState() {
  const initialState = createInitialState(
    createSkill({
      id: 9080,
      name: 'Legacy Extra Lead',
      targetType: 'Self',
      parts: [{ skill_type: 'Protection', target_type: 'Self' }],
    }),
    {
      characterId: 'TM1',
      skills: [
        createSkill({
          id: 9080,
          name: 'Legacy Extra Lead',
          targetType: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        }),
      ],
    }
  );
  initialState.turnState.turnType = 'extra';
  initialState.turnState.extraTurnState = {
    allowedCharacterIds: ['TM1'],
  };
  return initialState;
}

function createRealDataManagerState(styleId, options = {}) {
  const store = getStore();
  const actorStyle = store.getStyleById(Number(styleId));
  const actorCharacterLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const otherStyleIds = getSixUsableStyleIds(store).filter(
    (candidateId) =>
      Number(candidateId) !== Number(styleId) &&
      String(store.getStyleById(candidateId)?.chara_label ?? store.getStyleById(candidateId)?.chara ?? '') !==
        actorCharacterLabel
  );
  const styleIds = [Number(styleId), ...otherStyleIds.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: Number(options.initialSP ?? 30),
    limitBreakLevelsByPartyIndex: options.limitBreakLevelsByPartyIndex ?? {},
  });
  const state = createBattleStateFromParty(party);
  return options.applyInitialPassives ? applyInitialPassiveState(state) : state;
}

test('TurnEngineManager persists enemyCount through commit and replay recalculation', () => {
  const actorSkill = createSkill({
    id: 9001,
    name: 'Single Slash',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(actorSkill), {});

  const committedRecord = manager.commitNextTurn(
    {
      0: {
        skillId: 9001,
        target: { type: 'enemy', enemyIndex: 2 },
      },
    },
    { enemyCount: 3, note: 'enemy-count test' }
  );

  assert.equal(committedRecord.enemyCount, 3);
  assert.equal(manager.currentState.turnState.enemyState.enemyCount, 3);
  assert.equal(committedRecord.actions.find((action) => action.positionIndex === 0)?.targetEnemyIndex, 2);
  assert.deepEqual(manager.replayScript.turns[0].overrideEntries, [
    { type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, payload: 3 },
  ]);

  manager.recalculateFrom(0);

  assert.equal(manager.computedRecords[0]?.enemyCount, 3);
  assert.equal(manager.computedStates[0]?.turnState?.enemyState?.enemyCount, 3);
  assert.equal(manager.computedRecords[0]?.actions.find((action) => action.positionIndex === 0)?.targetEnemyIndex, 2);
});

test('TurnEngineManager commits summon operations into enemy slot snapshots and restores them on reload', () => {
  const actorSkill = createSkill({
    id: 90726,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const initialState = createInitialState(actorSkill);
  initialState.turnState.enemyState.enemyCount = 1;
  initialState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  initialState.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  initialState.turnState.enemyState.absorbElementsByEnemy = { 0: [] };
  initialState.turnState.enemyState.odRateByEnemy = { 0: 0 };
  initialState.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  initialState.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  initialState.turnState.enemyState.breakStateByEnemy = {};
  initialState.turnState.enemyState.statuses = [];

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});
  assert.equal(manager.addPendingSpecialOperation(createSummonEnemyOperation()), true);

  const committedRecord = manager.commitNextTurn(
    { 0: { skillId: 90726 } },
    { enemyCount: 1, note: 'summon turn' }
  );

  assert.equal(committedRecord.enemyCount, 2);
  assert.equal(manager.currentState.turnState.enemyState.enemyCount, 2);
  assert.equal(manager.replayScript.turns[0].operations[0]?.type, REPLAY_OPERATION_TYPES.SUMMON_ENEMY);
  assert.equal(
    manager.getStateBefore(0)?.turnState?.enemyState?.enemyNamesByEnemy?.['1'],
    DEFAULT_SUMMON_SAMPLE_ENEMY.name
  );
  assert.equal(manager.getStateBefore(0)?.turnState?.enemyState?.damageRatesByEnemy?.['1']?.Fire, 250);

  const overrideTypes = manager.replayScript.turns[0].overrideEntries.map((entry) => entry.type);
  assert.ok(overrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT));
  assert.ok(overrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_NAMES));
  assert.ok(overrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_DAMAGE_RATES));
  assert.ok(overrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_OD_RATES));
  assert.ok(overrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ABSORB_ELEMENTS));

  const reloadState = createInitialState(actorSkill);
  reloadState.turnState.enemyState.enemyCount = 1;
  reloadState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  reloadState.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  reloadState.turnState.enemyState.absorbElementsByEnemy = { 0: [] };
  reloadState.turnState.enemyState.odRateByEnemy = { 0: 0 };
  reloadState.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  reloadState.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  reloadState.turnState.enemyState.breakStateByEnemy = {};
  reloadState.turnState.enemyState.statuses = [];

  const reloadedManager = new TurnEngineManager();
  reloadedManager.loadReplayScript(reloadState, manager.replayScript, {});

  const stateBeforeFirstTurn = reloadedManager.getStateBefore(0);
  assert.equal(stateBeforeFirstTurn.turnState.enemyState.enemyCount, 2);
  assert.equal(stateBeforeFirstTurn.turnState.enemyState.enemyNamesByEnemy['1'], DEFAULT_SUMMON_SAMPLE_ENEMY.name);
  assert.equal(stateBeforeFirstTurn.turnState.enemyState.damageRatesByEnemy['1'].Fire, 250);
  assert.deepEqual(stateBeforeFirstTurn.turnState.enemyState.absorbElementsByEnemy['1'], ['fire']);
  assert.equal(reloadedManager.computedStates[0]?.turnState?.enemyState?.enemyCount, 2);
});

test('TurnEngineManager replays Karen double-action EX after 意気揚々 self-buff', () => {
  const manager = new TurnEngineManager();
  manager.initialize(createRealDataManagerState(1001507), {});

  manager.commitNextTurn(
    {
      0: {
        skillId: 46001511,
        target: { type: 'enemy', enemyIndex: 0 },
      },
    },
    { enemyCount: 1, note: 'double-action setup' }
  );

  const exRecord = manager.commitNextTurn(
    {
      0: {
        skillId: 46001512,
        target: { type: 'enemy', enemyIndex: 0 },
      },
    },
    { enemyCount: 1, note: 'double-action ex' }
  );

  const repeatedActions = exRecord.actions.filter((action) => action.positionIndex === 0);
  assert.equal(repeatedActions.length, 2);
  assert.deepEqual(repeatedActions.map((action) => action.castIndex), [0, 1]);
  assert.equal(repeatedActions[0].castCount, 2);
  assert.equal(repeatedActions[1].spCost, 0);

  manager.recalculateFrom(0);
  const replayedActions = manager.computedRecords[1]?.actions?.filter((action) => action.positionIndex === 0) ?? [];
  assert.equal(replayedActions.length, 2);
  assert.deepEqual(replayedActions.map((action) => action.castIndex), [0, 1]);
});

test('TurnEngineManager materializes ally replay target into targetCharacterId', () => {
  const actorSkill = createSkill({
    id: 9010,
    name: 'Front Buff',
    targetType: 'AllySingleWithoutSelf',
    parts: [{ skill_type: 'AttackUp', target_type: 'AllySingleWithoutSelf' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(actorSkill);
  manager.initialize(initialState, {});

  const targetStyleId = initialState.party.find((member) => member.position === 2)?.styleId;
  const targetCharacterId = initialState.party.find((member) => member.position === 2)?.characterId;

  const committedRecord = manager.commitNextTurn(
    {
      0: {
        skillId: 9010,
        target: { type: 'ally', styleId: targetStyleId },
      },
    },
    { enemyCount: 1, note: 'ally-target test' }
  );

  assert.equal(
    committedRecord.actions.find((action) => action.positionIndex === 0)?.targetCharacterId,
    targetCharacterId
  );
});

test('TurnEngineManager keeps Kishinka operation stateBefore aligned after commit and replay recalculation', () => {
  const actorSkill = createSkill({
    id: 9020,
    name: 'Tezuka Slash',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(actorSkill, {
      characterId: 'STezuka',
      characterName: '手塚 咲',
      styleId: 1001408,
      styleName: '鬼神テスト',
    }),
    {}
  );

  assert.equal(
    manager.addPendingSpecialOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA }),
    true
  );
  manager.commitNextTurn({ 0: { skillId: 9020 } }, { enemyCount: 1, note: '' });

  assert.equal(manager.getStateBefore(0)?.party?.[0]?.isReinforcedMode, true);
  assert.deepEqual(
    manager.replayScript.turns[0].operations.map((operation) => operation.type),
    [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]
  );

  manager.recalculateFrom(0);

  assert.equal(manager.getStateBefore(0)?.party?.[0]?.isReinforcedMode, true);
  assert.deepEqual(
    manager.replayScript.turns[0].operations.map((operation) => operation.type),
    [REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA]
  );
});

test('TurnEngineManager applies duplicate Makai Kihei operations before commit and restores uses after removal', () => {
  const actorSkill = createSkill({
    id: 9030,
    name: 'Makai Follow',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(actorSkill, {
    characterId: 'BIYamawaki',
    characterName: '山脇・ボン・イヴァール',
    styleId: MAKAI_KIHEI_STYLE_ID,
    styleName: '誇り高き魔王の凱旋',
    passives: [createMakaiKiheiPassive()],
  });
  initialState.turnState.enemyState.enemyCount = 3;
  manager.initialize(initialState, {});

  assert.equal(
    manager.addPendingSpecialOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }),
    true
  );
  assert.equal(
    manager.addPendingSpecialOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }),
    true
  );

  const previewState = manager.currentStateWithPending;
  assert.equal(previewState.turnState.odGauge, 90);

  manager.commitNextTurn({ 0: { skillId: 9030 } }, { enemyCount: 3, note: '' });

  assert.deepEqual(
    manager.replayScript.turns[0].operations.map((operation) => operation.type),
    [
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI,
      REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI,
    ]
  );
  assert.equal(manager.getStateBefore(0)?.turnState?.turnIndex, 1);
  assert.equal(manager.getStateBefore(0)?.turnState?.odGauge, 90);
  assert.equal(manager.getMakaiKiheiStatus().remainingUses, 1);

  manager.updateOperations(0, [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }]);

  assert.equal(manager.getStateBefore(0)?.turnState?.odGauge, 45);
  assert.equal(manager.getMakaiKiheiStatus().remainingUses, 2);
});

test('TurnEngineManager applies Makai Kihei OD gain using the committed enemyCount', () => {
  const actorSkill = createSkill({
    id: 9040,
    name: 'Makai Follow',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(actorSkill, {
    characterId: 'BIYamawaki',
    characterName: '山脇・ボン・イヴァール',
    styleId: MAKAI_KIHEI_STYLE_ID,
    styleName: '誇り高き魔王の凱旋',
    passives: [createMakaiKiheiPassive()],
  });
  initialState.turnState.enemyState.enemyCount = 1;
  manager.initialize(initialState, {});

  assert.equal(
    manager.addPendingSpecialOperation({ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }),
    true
  );

  assert.equal(manager.getCurrentStateWithPending(2).turnState.odGauge, 30);

  manager.commitNextTurn({ 0: { skillId: 9040 } }, { enemyCount: 2, note: '' });

  assert.equal(manager.getStateBefore(0)?.turnState?.odGauge, 30);

  manager.recalculateFrom(0);

  assert.equal(manager.getStateBefore(0)?.turnState?.odGauge, 30);
  assert.equal(manager.computedRecords[0]?.enemyCount, 2);
});

test('TurnEngineManager getStateBefore reflects position swap recorded in replayScript slots (JSON load flow)', () => {
  // JSON 読み込みシナリオ: loadReplayScript 後に getStateBefore が
  // slots に記録されたスワップ後の位置を正しく返すことを確認する。
  // （swapCurrentPositions による in-place mutation がない状態でのテスト）
  const skill0 = createSkill({
    id: 9080,
    name: 'Skill0',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(skill0);

  // partyIndex 2 (styleId 9102) と partyIndex 5 (styleId 9105) を入れ替えた turn を
  // replayScript として loadReplayScript に渡す
  const styleId0 = initialState.party.find((m) => m.partyIndex === 0)?.styleId; // 9100
  const styleId1 = initialState.party.find((m) => m.partyIndex === 1)?.styleId; // 9101
  const styleId2 = initialState.party.find((m) => m.partyIndex === 2)?.styleId; // 9102
  const styleId3 = initialState.party.find((m) => m.partyIndex === 3)?.styleId; // 9103
  const styleId4 = initialState.party.find((m) => m.partyIndex === 4)?.styleId; // 9104
  const styleId5 = initialState.party.find((m) => m.partyIndex === 5)?.styleId; // 9105

  const replayScript = {
    turns: [
      {
        // slot[2] に partyIndex 5 (styleId5) が入る（partyIndex 2 と入れ替え）
        slots: [
          { styleId: styleId0, skillId: 9080 },
          { styleId: styleId1, skillId: null },
          { styleId: styleId5, skillId: null }, // swap: partyIndex5 → position2
          { styleId: styleId3, skillId: null },
          { styleId: styleId4, skillId: null },
          { styleId: styleId2, skillId: null }, // swap: partyIndex2 → position5
        ],
        operations: [],
        overrideEntries: [],
        note: '',
      },
    ],
  };

  manager.loadReplayScript(initialState, replayScript);

  const stateBefore = manager.getStateBefore(0);
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 5)?.position, 2,
    'partyIndex 5 のメンバーが position 2 に移動していること');
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 2)?.position, 5,
    'partyIndex 2 のメンバーが position 5 に移動していること');
  // スワップしていないメンバーの position は変わらない
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 0)?.position, 0);
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 1)?.position, 1);
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 3)?.position, 3);
  assert.equal(stateBefore?.party?.find((m) => m.partyIndex === 4)?.position, 4);
});

test('TurnEngineManager recalculateFrom preserves position swap and produces valid computedRecords', () => {
  // recalculateFrom は replay の slots (position キー) から #slotActionsFromReplayTurn →
  // #buildActionsDict を通すため、スワップ済みスロットが正しく再計算されることを確認する。
  const actorSkill = createSkill({
    id: 9080,
    name: 'Skill0',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(actorSkill);

  const styleId0 = initialState.party.find((m) => m.partyIndex === 0)?.styleId;
  const styleId3 = initialState.party.find((m) => m.partyIndex === 3)?.styleId;

  // position 0 と 3 を入れ替えた replay を読み込む
  const replayScript = {
    turns: [
      {
        slots: [
          { styleId: styleId3, skillId: null },  // position 0 ← partyIndex 3
          { styleId: initialState.party.find((m) => m.partyIndex === 1)?.styleId, skillId: null },
          { styleId: initialState.party.find((m) => m.partyIndex === 2)?.styleId, skillId: null },
          { styleId: styleId0, skillId: null },   // position 3 ← partyIndex 0
          { styleId: initialState.party.find((m) => m.partyIndex === 4)?.styleId, skillId: null },
          { styleId: initialState.party.find((m) => m.partyIndex === 5)?.styleId, skillId: null },
        ],
        operations: [],
        overrideEntries: [],
        note: '',
      },
    ],
  };

  manager.loadReplayScript(initialState, replayScript);

  // recalculateFrom を呼んでも例外なく再計算が成功すること
  manager.recalculateFrom(0);

  // computedRecords が存在すること（#buildActionsDict で例外が出ていないこと）
  assert.ok(manager.computedRecords[0] != null, 'computedRecords[0] should exist after recalculateFrom');

  // スワップ後の position が保持されていること
  const stateAfter = manager.computedStates[0];
  assert.equal(stateAfter?.party?.find((m) => m.partyIndex === 0)?.position, 3,
    'partyIndex 0 should be at position 3 after recalculate');
  assert.equal(stateAfter?.party?.find((m) => m.partyIndex === 3)?.position, 0,
    'partyIndex 3 should be at position 0 after recalculate');
});

test('TurnEngineManager buildInputRowSnapshot resolves partyIndex keyed draft actions after swaps', () => {
  const actorSkill = createSkill({
    id: 9050,
    name: 'Single Slash',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(actorSkill), {});

  manager.swapCurrentPositions(0, 1);

  const snapshot = manager.buildInputRowSnapshot({
    slotActions: {
      0: {
        partyIndex: 0,
        skillId: 9050,
        target: { type: 'enemy', enemyIndex: 1 },
      },
    },
    enemyCount: 2,
  });

  assert.equal(snapshot.stateBefore.party.find((member) => member.partyIndex === 0)?.position, 1);
  assert.equal(snapshot.slotActions[1]?.skillId, 9050);
  assert.deepEqual(snapshot.slotActions[1]?.target, { type: 'enemy', enemyIndex: 1 });
});

test('TurnEngineManager buildInputRowSnapshot exposes preview endSP by partyIndex', () => {
  const normalSkill = createSkill({
    id: 9051,
    name: '通常攻撃',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const costlySkill = createSkill({
    id: 9052,
    name: '夜醒',
    targetType: 'Self',
    spCost: 7,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(normalSkill, {
      initialSP: 11,
      skills: [normalSkill, costlySkill],
    }),
    {}
  );

  const snapshot = manager.buildInputRowSnapshot({
    slotActions: {
      0: {
        partyIndex: 0,
        skillId: 9052,
      },
    },
    enemyCount: 1,
  });

  assert.equal(snapshot.previewResourceState.spAfterByPartyIndex[0], 4);
  assert.equal(Array.isArray(snapshot.previewActionFlow), true);
  assert.equal(snapshot.previewActionFlow.length, 1);
  assert.equal(snapshot.previewActionFlow[0].order, 1);
  assert.equal(snapshot.previewActionFlow[0].skillId, 9052);
  assert.equal(snapshot.previewActionFlow[0].costDelta, -7);
  assert.equal(snapshot.previewActionFlow[0].costPreSp, 11);
  assert.equal(snapshot.previewActionFlow[0].costPostSp, 4);
});

test('TurnEngineManager buildInputRowSnapshot includes buff status change events in previewActionFlow', () => {
  const normalSkill = createSkill({
    id: 9060,
    name: '通常攻撃',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const fillEnhanceLikeSkill = createSkill({
    id: 9061,
    name: 'フィルエンハンス',
    targetType: 'AllyAll',
    spCost: 7,
    parts: [
      {
        skill_type: 'AttackUp',
        target_type: 'AllyAll',
        power: [0.5, 0.65],
        effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
      },
    ],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(normalSkill, {
      initialSP: 20,
      skills: [normalSkill, fillEnhanceLikeSkill],
    }),
    {}
  );

  const snapshot = manager.buildInputRowSnapshot({
    slotActions: {
      0: {
        partyIndex: 0,
        skillId: 9061,
      },
    },
    enemyCount: 1,
  });

  assert.equal(Array.isArray(snapshot.previewActionFlow), true);
  assert.equal(snapshot.previewActionFlow.length, 1);
  const first = snapshot.previewActionFlow[0];
  assert.equal(first.skillName, 'フィルエンハンス');
  assert.equal(Array.isArray(first.statusEffectsApplied), true);
  assert.equal(first.statusEffectsApplied.length > 0, true);
});

test('TurnEngineManager replaceCommittedTurn recalculates downstream records and collects replay warnings', () => {
  const safeSkill = createSkill({
    id: 9053,
    name: 'Safe Guard',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const costlySkill = createSkill({
    id: 9054,
    name: 'Risk Slash',
    targetType: 'Self',
    spCost: 7,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(safeSkill, {
      initialSP: 4,
      skills: [safeSkill, costlySkill],
    }),
    {}
  );

  manager.commitNextTurn({ 0: { skillId: 9053 } }, { enemyCount: 1 });
  manager.commitNextTurn({ 0: { skillId: 9053 } }, { enemyCount: 1 });

  const beforeStartSp = manager.computedRecords[1]?.actions.find((action) => action.positionIndex === 0)?.startSP;
  const draft = manager.buildTurnEditDraft(0);
  draft.slots[0].skillId = 9054;

  manager.replaceCommittedTurn(0, draft);

  const afterStartSp = manager.computedRecords[1]?.actions.find((action) => action.positionIndex === 0)?.startSP;
  assert.equal(manager.replayScript.turns[0].slots[0].skillId, 9054);
  assert.equal(afterStartSp < beforeStartSp, true);
  assert.equal(
    manager.replayDiagnostics.turnWarnings[0].some((warning) => warning.includes('SP allowed')),
    true,
    'Warning should contain "SP allowed" (either "negative SP allowed" or "insufficient SP allowed")'
  );
});

test('TurnEngineManager popLastCommittedTurnToDraft restores the last replay turn as an editable draft', () => {
  const actorSkill = createSkill({
    id: 9055,
    name: 'Draft Slash',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(actorSkill), {});
  manager.commitNextTurn(
    {
      0: {
        skillId: 9055,
        target: { type: 'enemy', enemyIndex: 2 },
      },
    },
    {
      enemyCount: 3,
      note: 'rollback-me',
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [1] }],
    }
  );

  const popped = manager.popLastCommittedTurnToDraft();

  assert.equal(popped?.turnIndex, 0);
  assert.equal(popped?.draft?.slots?.[0]?.skillId, 9055);
  assert.deepEqual(popped?.draft?.slots?.[0]?.target, { type: 'enemy', enemyIndex: 2 });
  assert.equal(popped?.draft?.enemyCount, 3);
  assert.equal(popped?.draft?.note, 'rollback-me');
  assert.deepEqual(popped?.draft?.actionOutcomeOverrides, [
    { position: 0, outcome: 'Kill', enemyIndexes: [1] },
  ]);
  assert.equal(manager.committedTurnCount, 0);
  assert.deepEqual(manager.computedRecords, []);
});

test('TurnEngineManager normalizes single-target manual break attribution to the current target and replays break-triggered passive effects', () => {
  const actorSkill = createSkill({
    id: 9060,
    name: 'Break Follow',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(actorSkill, {
      passives: [createBreakHealPassive()],
    }),
    {},
    { validationPolicy: DEFAULT_VALIDATION_POLICY }
  );

  const actionOutcomeOverrides = [
    {
      position: 0,
      outcome: 'Break',
      enemyIndexes: [0, 2],
    },
  ];
  const committedRecord = manager.commitNextTurn(
    {
      0: {
        skillId: 9060,
        target: { type: 'enemy', enemyIndex: 1 },
      },
    },
    {
      enemyCount: 3,
      note: 'manual-break test',
      actionOutcomeOverrides,
    }
  );

  const action = committedRecord.actions.find((entry) => entry.positionIndex === 0);
  const spPassiveChange = action.spChanges.find((change) => change.source === 'sp_passive');

  assert.equal(action.targetEnemyIndex, 1);
  assert.equal(action.breakHitCount, 1);
  assert.deepEqual(action.manualBreakEnemyIndexes, [1]);
  assert.equal(spPassiveChange?.delta, 8);
  assert.deepEqual(
    manager.replayScript.turns[0].overrideEntries.find(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
    )?.payload,
    [{ position: 0, outcome: 'Break', enemyIndexes: [1] }]
  );
  assert.equal(
    action.enemyStatusChanges.some(
      (change) =>
        change.statusType === 'DownTurn' &&
        change.targetIndex === 1 &&
        change.source === 'manual'
    ),
    true
  );

  manager.recalculateFrom(0);

  const replayedAction = manager.computedRecords[0]?.actions.find((entry) => entry.positionIndex === 0);
  assert.equal(replayedAction?.breakHitCount, 1);
  assert.deepEqual(replayedAction?.manualBreakEnemyIndexes, [1]);
  assert.equal(
    replayedAction?.spChanges.some((change) => change.source === 'sp_passive'),
    true
  );
  assert.equal(
    replayedAction?.enemyStatusChanges.some(
      (change) =>
        change.statusType === 'DownTurn' &&
        change.targetIndex === 1 &&
        change.source === 'manual'
    ),
    true
  );
});

test('TurnEngineManager preserves subset manual break attribution for all-target attacks', () => {
  const actorSkill = createSkill({
    id: 9061,
    name: 'Wide Break Follow',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(actorSkill), {});

  const committedRecord = manager.commitNextTurn(
    {
      0: { skillId: 9061 },
    },
    {
      enemyCount: 3,
      actionOutcomeOverrides: [
        { position: 0, outcome: 'Break', enemyIndexes: [0, 2] },
      ],
    }
  );

  const action = committedRecord.actions.find((entry) => entry.positionIndex === 0);
  assert.equal(action.breakHitCount, 2);
  assert.deepEqual(action.manualBreakEnemyIndexes, [0, 2]);
  assert.deepEqual(
    manager.replayScript.turns[0].overrideEntries.find(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
    )?.payload,
    [{ position: 0, outcome: 'Break', enemyIndexes: [0, 2] }]
  );
});

test('TurnEngineManager loadReplayScript normalizes legacy single-target manual break overrides to the saved target', () => {
  const actorSkill = createSkill({
    id: 9062,
    name: 'Replay Break Follow',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const initialState = createInitialState(actorSkill);
  const replayScript = {
    turns: [
      {
        turn: 1,
        slots: [
          {
            styleId: initialState.party[0].styleId,
            skillId: 9062,
            target: { type: 'enemy', enemyIndex: 1 },
          },
          { styleId: initialState.party[1].styleId, skillId: 9201 },
          { styleId: initialState.party[2].styleId, skillId: 9202 },
          { styleId: initialState.party[3].styleId, skillId: null },
          { styleId: initialState.party[4].styleId, skillId: null },
          { styleId: initialState.party[5].styleId, skillId: null },
        ],
        note: '',
        operations: [],
        overrideEntries: [
          { type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_COUNT, payload: 3 },
          {
            type: REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES,
            payload: [{ position: 0, outcome: 'Break', enemyIndexes: [2] }],
          },
        ],
      },
    ],
  };

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, replayScript);

  const action = manager.computedRecords[0]?.actions.find((entry) => entry.positionIndex === 0);
  assert.equal(action?.targetEnemyIndex, 1);
  assert.equal(action?.breakHitCount, 1);
  assert.deepEqual(action?.manualBreakEnemyIndexes, [1]);
  assert.deepEqual(
    manager.replayScript.turns[0].overrideEntries.find(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
    )?.payload,
    [{ position: 0, outcome: 'Break', enemyIndexes: [1] }]
  );
});

test('TurnEngineManager loadReplayScript restores validationPolicy and committed rows', () => {
  const actorSkill = createSkill({
    id: 9070,
    name: 'Replay Slash',
    targetType: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const initialState = createInitialState(actorSkill);
  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});
  manager.commitNextTurn({ 0: { skillId: 9070 } }, { enemyCount: 2, note: 'saved' });

  const restored = new TurnEngineManager();
  restored.loadReplayScript(initialState, manager.replayScript, {
    validationPolicy: {
      allowInsufficientSp: true,
      allowInsufficientOd: true,
      allowUseCountOverflow: true,
    },
  });

  assert.equal(restored.committedTurnCount, 1);
  assert.equal(restored.computedRecords[0]?.enemyCount, 2);
  assert.equal(restored.validationPolicy.allowUseCountOverflow, true);
});

test('session fixture replay: Turn4 start SP reflects OnOverdriveStart HealSp over-cap for Nikaido', () => {
  const session = loadSessionFixture('ui_next_session_2026-04-01T14-09-27.704Z.json');
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turn4StateBefore = manager.getStateBefore(3);
  const nikaido = turn4StateBefore.party.find((member) => member.characterName === '二階堂 三郷');
  assert.equal(Number(nikaido?.sp?.current), 25);
});

test('session fixture replay: #5相当ターン開始はODサスペンドEXとして復元される', () => {
  const session = loadSessionFixture('ui_next_session_2026-04-01T14-09-27.704Z.json');
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turn5StateBefore = manager.getStateBefore(5);
  assert.equal(turn5StateBefore?.turnState?.turnType, 'extra');
  assert.equal(turn5StateBefore?.turnState?.turnLabel, 'EX');
  assert.equal(Boolean(turn5StateBefore?.turnState?.odSuspended), true);
});

test('session fixture replay: #4のBreak overrideで和泉ユキのBeatDown(); SP+2が反映される', () => {
  const session = loadSessionFixture('ui_next_session_2026-04-01T14-09-27.704Z.json');
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turn4Record = manager.computedRecords[3];
  const yukiAction = turn4Record?.actions?.find((action) => action.characterName === '和泉 ユキ');
  assert.equal(Number(yukiAction?.breakHitCount ?? 0), 1);

  const beatDownSpGain = (yukiAction?.spChanges ?? []).find(
    (change) => change?.source === 'sp_passive' && Number(change?.delta) === 2
  );
  assert.ok(beatDownSpGain, 'Break override 経由でも BeatDown(); の前衛SP+2が適用される');
});

test('session fixture replay: #4で石塔の手筋+ (OD) の自身以外SP+5が反映される', () => {
  const session = loadSessionFixture('ui_next_session_2026-04-01T14-09-27.704Z.json');
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turn4Record = manager.computedRecords[3];
  const nikaidoAction = turn4Record?.actions?.find((action) => action.characterName === '二階堂 三郷');
  const yukiAction = turn4Record?.actions?.find((action) => action.characterName === '和泉 ユキ');
  const yuinaAction = turn4Record?.actions?.find((action) => action.characterName === '白河 ユイナ');

  assert.equal(nikaidoAction?.skillName, '石塔の手筋+');
  assert.equal(
    (nikaidoAction?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    false,
    '自身にはSP+5が入らない'
  );
  assert.equal(
    (yukiAction?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    true,
    '和泉ユキにSP+5が入る'
  );
  assert.equal(
    (yuinaAction?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    true,
    '白河ユイナにSP+5が入る'
  );
});

test('session fixture replay: #4の和泉ユキSP遷移は中間clampなしで 21 -> 7 -> 9 -> 14 になる', () => {
  const session = loadSessionFixture('ui_next_session_2026-04-01T15-30-26.076Z.json');
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup);

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });

  const turn4Record = manager.computedRecords[3];
  const yukiAction = turn4Record?.actions?.find((action) => action.characterName === '和泉 ユキ');
  assert.ok(yukiAction, 'turn #4 に和泉ユキの行動が存在すること');

  assert.equal(Number(yukiAction?.startSP), 21);
  assert.equal(Number(yukiAction?.endSP), 14);

  const deltas = (yukiAction?.spChanges ?? []).map((change) => Number(change?.delta ?? 0));
  assert.equal(deltas.includes(-14), true, 'コードダクネスの消費 -14 が入ること');
  assert.equal(deltas.includes(2), true, 'BeatDown(); の +2 が入ること');
  assert.equal(deltas.includes(5), true, '石塔の手筋+ の +5 が入ること');
  assert.equal(
    (yukiAction?.spChanges ?? []).some((change) => String(change?.source ?? '') === 'clamp'),
    false,
    '中間clampイベントが入らないこと'
  );
});

test('TurnEngineManager buildTurnEditSnapshot does not mutate the initial transcendence state', () => {
  const actorSkill = createSkill({
    id: 9071,
    name: 'Trans Preview',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const initialState = createInitialState(actorSkill);
  initialState.party[0].elements = ['Thunder'];
  initialState.turnState.transcendence = {
    active: true,
    sourceCharacterId: initialState.party[0].characterId,
    sourceStyleId: initialState.party[0].styleId,
    gaugeElement: 'Thunder',
    gaugePercent: 90,
    maxGaugePercent: 100,
    gainPercentPerAction: 10,
    odBonusOnMax: 100,
    burstTriggered: false,
  };
  const replayScript = {
    turns: [
      {
        turn: 1,
        slots: [
          { styleId: initialState.party[0].styleId, skillId: 9071 },
          { styleId: initialState.party[1].styleId, skillId: 9201 },
          { styleId: initialState.party[2].styleId, skillId: 9202 },
          { styleId: initialState.party[3].styleId, skillId: null },
          { styleId: initialState.party[4].styleId, skillId: null },
          { styleId: initialState.party[5].styleId, skillId: null },
        ],
        note: 'transcendence-edit-preview',
        operations: [],
        overrideEntries: [],
      },
    ],
  };

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, replayScript);
  const before = structuredClone(manager.initialState.turnState.transcendence);

  manager.buildTurnEditSnapshot(0);

  assert.deepEqual(manager.initialState.turnState.transcendence, before);
});

test('TurnEngineManager loadReplayScript clears stale extra-turn actors without warnings', () => {
  const initialState = createLegacyExtraTurnInitialState();
  const replayScript = {
    turns: [
      {
        turn: 1,
        slots: [
          { styleId: initialState.party[0].styleId, skillId: 9080 },
          { styleId: initialState.party[1].styleId, skillId: 9201 },
          { styleId: initialState.party[2].styleId, skillId: null },
          { styleId: initialState.party[3].styleId, skillId: null },
          { styleId: initialState.party[4].styleId, skillId: null },
          { styleId: initialState.party[5].styleId, skillId: null },
        ],
        note: 'legacy-extra-turn',
        operations: [],
        overrideEntries: [],
      },
    ],
  };

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, replayScript);

  assert.equal(manager.replayDiagnostics.error, null);
  assert.equal(manager.replayDiagnostics.appliedTurnCount, 1);
  assert.deepEqual(manager.replayDiagnostics.turnWarnings[0], []);
  assert.deepEqual(
    manager.computedRecords[0]?.actions?.map((action) => action.characterId),
    ['TM1']
  );
  assert.equal(manager.replayScript.turns[0].slots[1].skillId, null);
});

test('TurnEngineManager replaceCommittedTurn keeps edited extra-turn actor mismatches as hard errors', () => {
  const initialState = createLegacyExtraTurnInitialState();
  const replayScript = {
    turns: [
      {
        turn: 1,
        slots: [
          { styleId: initialState.party[0].styleId, skillId: 9080 },
          { styleId: initialState.party[1].styleId, skillId: null },
          { styleId: initialState.party[2].styleId, skillId: null },
          { styleId: initialState.party[3].styleId, skillId: null },
          { styleId: initialState.party[4].styleId, skillId: null },
          { styleId: initialState.party[5].styleId, skillId: null },
        ],
        note: 'strict-extra-turn-edit',
        operations: [],
        overrideEntries: [],
      },
    ],
  };

  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, replayScript);

  const draft = manager.buildTurnEditDraft(0);
  draft.slots[1].skillId = 9201;
  manager.replaceCommittedTurn(0, draft);

  assert.equal(manager.replayDiagnostics.error?.index, 0);
  assert.match(manager.replayDiagnostics.error?.message ?? '', /not allowed to act in extra turn/);
  assert.equal(manager.computedRecords[0], null);
});

test('TurnEngineManager applies OD-start SP recovery before the first interrupt OD action after an extra turn', () => {
  const store = HbrDataStore.fromJsonDirectory('json');
  const party = store.buildPartyFromStyleIds([1005504, 1004107, 1020603, 1001710, 1007106, 1001408], {
    initialSP: 10,
  });
  const initialState = createBattleStateFromParty(party);
  initialState.turnState.odGauge = 245;

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {}, { validationPolicy: DEFAULT_VALIDATION_POLICY });

  manager.commitNextTurn(
    {
      0: { skillId: 46005501 },
      1: { skillId: 46004118 },
      2: { skillId: 46040604 },
    },
    { enemyCount: 3 }
  );

  assert.equal(manager.currentState.turnState.turnType, 'extra');
  assert.equal(
    manager.currentState.party.find((member) => member.styleId === 1020603)?.sp.current,
    -2
  );

  manager.commitNextTurn(
    {
      0: { skillId: 46005501 },
      1: { skillId: 46004101 },
      2: { skillId: 46040601 },
    },
    {
      enemyCount: 3,
      interruptOdLevel: 2,
    }
  );

  assert.equal(manager.currentState.turnState.turnType, 'od');
  assert.equal(manager.currentState.turnState.odContext, 'interrupt');
  assert.equal(
    manager.currentState.party.find((member) => member.styleId === 1020603)?.sp.current,
    10
  );

  const preview = manager.previewCurrentTurn(
    {
      2: { skillId: 46040604 },
    },
    { enemyCount: 3 }
  );

  assert.notEqual(preview, null);
});

function createKillCountPassive() {
  return {
    id: 99912,
    name: '意気軒昂テスト',
    timing: 'OnFirstBattleStart',
    parts: [
      { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self', power: [0, 0], value: [0, 0] },
      { skill_type: 'HealSp', target_type: 'Self', power: [5, 0], value: [0, 0] },
    ],
  };
}

test('TurnEngineManager passes killCount to actions when Kill overrides are provided', () => {
  const actorSkill = createSkill({
    id: 9070,
    name: 'Kill Slash',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  const initialState = createInitialState(actorSkill, { passives: [createKillCountPassive()] });
  manager.initialize(initialState, {});

  const committedRecord = manager.commitNextTurn(
    { 0: { skillId: 9070 } },
    {
      enemyCount: 2,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0, 1] }],
    }
  );

  // killCount=2 → HealSp passive fires with multiplier 2 → SP+10
  const action = committedRecord.actions.find((e) => e.positionIndex === 0);
  const spPassive = action?.spChanges?.find((c) => c.source === 'sp_passive');
  assert.ok(spPassive, 'kill-count passive should fire');
  assert.equal(spPassive.delta, 10); // 5 * 2 kills

  // replay script に ACTION_OUTCOME_OVERRIDES として Kill エントリが保存されていること
  const overrideEntry = manager.replayScript.turns[0].overrideEntries.find(
    (e) => e.type === REPLAY_OVERRIDE_ENTRY_TYPES.ACTION_OUTCOME_OVERRIDES
  );
  assert.ok(overrideEntry, 'ACTION_OUTCOME_OVERRIDES entry should exist');
  const killEntry = overrideEntry?.payload?.find(
    (e) => e.position === 0 && e.outcome === 'Kill'
  );
  assert.deepEqual(killEntry?.enemyIndexes, [0, 1]);
});

test('TurnEngineManager patches nextState with allEnemiesDefeated when all enemies are killed', () => {
  const actorSkill = createSkill({
    id: 9071,
    name: 'Wipe',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(createInitialState(actorSkill), {});

  manager.commitNextTurn(
    { 0: { skillId: 9071 } },
    {
      enemyCount: 2,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0, 1] }],
    }
  );

  assert.equal(
    manager.computedStates[0].turnState.enemyState.allEnemiesDefeated,
    true,
    'allEnemiesDefeated should be true when all enemies are killed'
  );
  // enemyCount は clampEnemyCount のため 0 にはならない（全滅時は元の値を維持）
  assert.equal(manager.computedStates[0].turnState.enemyState.enemyCount, 2);
});

test('TurnEngineManager recalculateFrom restores killCount from overrideEntries', () => {
  const actorSkill = createSkill({
    id: 9072,
    name: 'Kill2',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(actorSkill, { passives: [createKillCountPassive()] }),
    {}
  );

  manager.commitNextTurn(
    { 0: { skillId: 9072 } },
    {
      enemyCount: 1,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );

  // recalculate すると Kill overrides が replay turn から復元される
  manager.recalculateFrom(0);

  const replayed = manager.computedRecords[0]?.actions.find((e) => e.positionIndex === 0);
  const sp = replayed?.spChanges?.find((c) => c.source === 'sp_passive');
  assert.ok(sp, 'kill-count passive should fire after recalculate');
  assert.equal(sp.delta, 5); // 5 * 1 kill
  assert.equal(manager.computedStates[0].turnState.enemyState.allEnemiesDefeated, true);
});

test('TurnEngineManager persists turn-start enemy slot snapshots into overrideEntries and restores them on reload', () => {
  const actorSkill = createSkill({
    id: 90725,
    name: 'Protection',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
  const initialState = createInitialState(actorSkill);
  initialState.turnState.enemyState.enemyCount = 2;
  initialState.turnState.enemyState.odRateByEnemy = { 0: 10000, 1: 10000 };
  initialState.turnState.enemyState.absorbElementsByEnemy = { 0: [], 1: [] };
  initialState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta' };

  const manager = new TurnEngineManager();
  manager.initialize(initialState, {});

  manager.commitNextTurn(
    { 0: { skillId: 90725 } },
    {
      enemyCount: 2,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [1] }],
      note: 'kill E2',
    }
  );

  manager.currentState.turnState.enemyState.odRateByEnemy = { 0: 10000, 1: 8500 };
  manager.currentState.turnState.enemyState.absorbElementsByEnemy = { 0: [], 1: ['fire'] };
  manager.currentState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Summoned Beta' };

  manager.commitNextTurn(
    { 0: { skillId: 90725 } },
    {
      enemyCount: 2,
      note: 'snapshot turn',
    }
  );

  const secondTurnOverrideTypes = manager.replayScript.turns[1].overrideEntries.map((entry) => entry.type);
  assert.ok(secondTurnOverrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_NAMES));
  assert.ok(secondTurnOverrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_OD_RATES));
  assert.ok(secondTurnOverrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_ABSORB_ELEMENTS));
  assert.ok(secondTurnOverrideTypes.includes(REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES));

  const reloadInitialState = createInitialState(actorSkill);
  reloadInitialState.turnState.enemyState.enemyCount = 2;
  reloadInitialState.turnState.enemyState.odRateByEnemy = { 0: 10000, 1: 10000 };
  reloadInitialState.turnState.enemyState.absorbElementsByEnemy = { 0: [], 1: [] };
  reloadInitialState.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta' };

  const reloadedManager = new TurnEngineManager();
  reloadedManager.loadReplayScript(reloadInitialState, manager.replayScript, {});

  const stateBeforeSecondTurn = reloadedManager.getStateBefore(1);
  assert.equal(stateBeforeSecondTurn.turnState.enemyState.enemyNamesByEnemy['1'], 'Summoned Beta');
  assert.equal(stateBeforeSecondTurn.turnState.enemyState.odRateByEnemy['1'], 8500);
  assert.deepEqual(stateBeforeSecondTurn.turnState.enemyState.absorbElementsByEnemy['1'], ['fire']);
  assert.equal(
    stateBeforeSecondTurn.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Dead' && status.targetIndex === 1
    ),
    true
  );
});

test('TurnEngineManager break passive fires on Break but not on Kill for the same enemy', () => {
  // E1 をブレイクすると AdditionalHitOnBreaking パッシブが発火（SP+8）
  // E1 を討伐すると同パッシブは発火しない（討伐はブレイク成立ではないため）
  const actorSkill = createSkill({
    id: 9073,
    name: 'Strike',
    targetType: 'All',
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });
  const manager = new TurnEngineManager();
  manager.initialize(
    createInitialState(actorSkill, { passives: [createBreakHealPassive()] }),
    {}
  );

  // --- ケース1: E1 をブレイク → ブレイクパッシブ発火（SP+8）---
  const breakRecord = manager.commitNextTurn(
    { 0: { skillId: 9073 } },
    {
      enemyCount: 2,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Break', enemyIndexes: [0] }],
    }
  );
  const breakAction = breakRecord.actions.find((e) => e.positionIndex === 0);
  assert.equal(breakAction?.breakHitCount, 1, 'break passive: breakHitCount should be 1');
  assert.ok(
    breakAction?.spChanges?.some((c) => c.source === 'sp_passive' && c.delta === 8),
    'break passive should fire on break (SP+8)'
  );

  // --- ケース2: E1 を討伐 → ブレイクパッシブ発火なし ---
  manager.initialize(
    createInitialState(actorSkill, { passives: [createBreakHealPassive()] }),
    {}
  );
  const killRecord = manager.commitNextTurn(
    { 0: { skillId: 9073 } },
    {
      enemyCount: 2,
      actionOutcomeOverrides: [{ position: 0, outcome: 'Kill', enemyIndexes: [0] }],
    }
  );
  const killAction = killRecord.actions.find((e) => e.positionIndex === 0);
  assert.equal(
    killAction?.breakHitCount ?? 0,
    0,
    'break passive: breakHitCount should be 0 on kill'
  );
  assert.ok(
    !killAction?.spChanges?.some((c) => c.source === 'sp_passive'),
    'break passive should NOT fire on kill'
  );
});
