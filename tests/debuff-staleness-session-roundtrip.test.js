import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CharacterStyle,
  Party,
  createBattleStateFromParty,
  createInitialTurnState,
} from '../src/index.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';

const ENEMY_BORDER = 650;
const DEBUFF_SKILL_ID = 70020;
const PROTECTION_SKILL_ID = 70021;
const OLD_WIS = 700;
const NEW_WIS = 300;

function buildDebuffSkill() {
  return {
    id: DEBUFF_SKILL_ID,
    name: 'Session DefenseDown',
    label: 'Session DefenseDown',
    sp_cost: 0,
    target_type: 'Single',
    hit_count: 1,
    hitCount: 1,
    parts: [
      {
        skill_type: 'DefenseDown',
        target_type: 'Single',
        power: [0.3, 0.45],
        growth: [0, 0],
        diff_for_max: 100,
        parameters: { wis: 1 },
        effect: { limitType: 'Only', exitCond: 'Eternal' },
      },
    ],
  };
}

function buildProtectionSkill() {
  return {
    id: PROTECTION_SKILL_ID,
    name: 'Filler Protection',
    label: 'Filler Protection',
    sp_cost: 0,
    target_type: 'Self',
    hit_count: 1,
    hitCount: 1,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  };
}

function buildInitialState(actorWis) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const isActor = index === 0;
    return new CharacterStyle({
      characterId: `RT${index + 1}`,
      characterName: `RT${index + 1}`,
      styleId: 7100 + index,
      styleName: `RTS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 20,
      role: 'Attacker',
      weaponType: 'Slash',
      stats: { str: 1, dex: 1, con: 1, spr: 1, luk: 1, wis: isActor ? actorWis : 1 },
      skills: isActor ? [buildDebuffSkill(), buildProtectionSkill()] : [buildProtectionSkill()],
      passives: [],
    });
  });
  const party = new Party(members);
  const baseTurnState = createInitialTurnState();
  return createBattleStateFromParty(party, {
    ...baseTurnState,
    enemyState: {
      ...baseTurnState.enemyState,
      enemyCount: 1,
      paramBorderByEnemy: { 0: ENEMY_BORDER },
    },
  });
}

function buildSavedReplayWithStaleEnemyStatusSnapshot() {
  const manager = new TurnEngineManager();
  manager.initialize(buildInitialState(OLD_WIS), {});
  manager.commitNextTurn(
    { 0: { skillId: DEBUFF_SKILL_ID, target: { type: 'enemy', enemyIndex: 0 } } },
    { enemyCount: 1, note: 'roundtrip t1 apply debuff' }
  );
  manager.commitNextTurn(
    { 0: { skillId: PROTECTION_SKILL_ID } },
    { enemyCount: 1, note: 'roundtrip t2 carry debuff' }
  );
  const replayScript = structuredClone(manager.replayScript);
  const staleStatuses = structuredClone(manager.computedStates[0]?.turnState?.enemyState?.statuses ?? []);
  const secondTurn = replayScript.turns[1];
  secondTurn.overrideEntries = (secondTurn.overrideEntries ?? []).filter(
    (entry) => entry?.type !== REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES
  );
  secondTurn.overrideEntries.push({
    type: REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES,
    payload: staleStatuses,
  });
  return replayScript;
}

function getDefenseDownPower(state) {
  const statuses = state?.turnState?.enemyState?.statuses ?? [];
  const found = statuses.find(
    (status) => String(status?.statusType) === 'DefenseDown' && Number(status?.targetIndex ?? -1) === 0
  );
  return found ? Number(found.power) : null;
}

function getEnemyStatusesOverride(turn) {
  return (turn?.overrideEntries ?? []).find(
    (entry) => entry?.type === REPLAY_OVERRIDE_ENTRY_TYPES.ENEMY_STATUSES
  );
}

test('session round-trip: stale enemy debuff power snapshot is ignored after setup stat edit', () => {
  const replayScript = buildSavedReplayWithStaleEnemyStatusSnapshot();
  const staleOverride = getEnemyStatusesOverride(replayScript.turns[1]);
  assert.ok(staleOverride, 'turn2 contains an old EnemyStatuses override like existing saved sessions');
  assert.equal(Number(staleOverride.payload?.[0]?.power), 0.375);

  const reloadedManager = new TurnEngineManager();
  reloadedManager.loadReplayScript(buildInitialState(NEW_WIS), replayScript);

  const afterT1 = getDefenseDownPower(reloadedManager.computedStates[0]);
  const afterT2 = getDefenseDownPower(reloadedManager.computedStates[1]);

  assert.notEqual(afterT1, null, 'turn1 reapplies DefenseDown after load');
  assert.notEqual(afterT2, null, 'turn2 carries DefenseDown after load');
  assert.equal(afterT1, 0.3, 'edited caster wis is reflected in the apply turn');
  assert.equal(
    afterT2,
    afterT1,
    'carried turn must use recalculated debuff power, not the stale saved EnemyStatuses snapshot'
  );
});
