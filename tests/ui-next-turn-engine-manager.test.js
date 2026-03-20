import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { REPLAY_OPERATION_TYPES, REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';

const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_SKILL_ID = 46003117;

function createSkill({ id, name, targetType, parts }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: 0,
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

function createManualParty(actorSkill, actorOptions = {}) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? (actorOptions.characterId ?? 'TM1') : `TM${index + 1}`,
      characterName: index === 0 ? (actorOptions.characterName ?? 'TM1') : `TM${index + 1}`,
      styleId: index === 0 ? (actorOptions.styleId ?? 9100) : 9100 + index,
      styleName: index === 0 ? (actorOptions.styleName ?? 'TS1') : `TS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills: [
        index === 0
          ? actorSkill
          : createSkill({
              id: 9200 + index,
              name: `Normal${index + 1}`,
              targetType: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            }),
      ],
      passives: index === 0 ? (actorOptions.passives ?? []) : [],
    })
  );
  return new Party(members);
}

function createInitialState(actorSkill, actorOptions = {}) {
  return createBattleStateFromParty(createManualParty(actorSkill, actorOptions));
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
