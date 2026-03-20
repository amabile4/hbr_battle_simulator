import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';

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

function createManualParty(actorSkill) {
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `TM${index + 1}`,
      characterName: `TM${index + 1}`,
      styleId: 9100 + index,
      styleName: `TS${index + 1}`,
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
    })
  );
  return new Party(members);
}

function createInitialState(actorSkill) {
  return createBattleStateFromParty(createManualParty(actorSkill));
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
