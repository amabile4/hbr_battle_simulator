import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TurnEngineManager } from '../ui-next/engine/turn-engine-manager.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { buildAutomaticFollowUpChipModelsFromActions } from '../ui-next/utils/follow-up-presentation.js';
import { CharacterStyle, Party, createBattleStateFromParty, applyInitialPassiveState } from '../src/index.js';
import { REPLAY_OVERRIDE_ENTRY_TYPES } from '../src/ui/lightweight-replay-script.js';
import { normalizeSessionSnapshot } from '../ui-next/utils/session-snapshot.js';
import { getStore } from './helpers.js';

const YUMEGURI_REAL_REPLAY_FIXTURE = 'ui_next_session_yumeguri_real_replay_2026-05-23.json';

function createSkill({ id, name, targetType, parts, spCost = 0, hitCount = 0 }) {
  return {
    id,
    name,
    label: `${name}${id}`,
    sp_cost: spCost,
    hit_count: hitCount,
    cond: '',
    target_type: targetType,
    parts,
  };
}

const PROTECTION_SKILL = createSkill({
  id: 8001,
  name: 'Protection',
  targetType: 'Self',
  parts: [{ skill_type: 'Protection', target_type: 'Self' }],
});

function loadSessionFixture(fileName) {
  const fixtureUrl = new URL(`./fixtures/${fileName}`, import.meta.url);
  const text = fs.readFileSync(fixtureUrl, 'utf8');
  return normalizeSessionSnapshot(JSON.parse(text));
}

function loadSessionIntoTurnEngine(session) {
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const initialState = battleStateManager.buildFromSnapshot(session.setup, session.enemy);
  const manager = new TurnEngineManager();
  manager.loadReplayScript(initialState, session.replayScript, {
    validationPolicy: session.validationPolicy,
  });
  return manager;
}

function createPursuitTestParty(actorOptions = {}) {
  const backMemberSkills = actorOptions.backMemberSkills ?? [PROTECTION_SKILL];
  const memberSkillsByIndex =
    actorOptions.memberSkillsByIndex && typeof actorOptions.memberSkillsByIndex === 'object'
      ? actorOptions.memberSkillsByIndex
      : {};
  const memberOptionsByIndex =
    actorOptions.memberOptionsByIndex && typeof actorOptions.memberOptionsByIndex === 'object'
      ? actorOptions.memberOptionsByIndex
      : {};
  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: memberOptionsByIndex[index]?.characterId ?? (index === 0 ? (actorOptions.characterId ?? 'TM1') : `TM${index + 1}`),
      characterName: memberOptionsByIndex[index]?.characterName ?? (index === 0 ? (actorOptions.characterName ?? 'TM1') : `TM${index + 1}`),
      styleId: memberOptionsByIndex[index]?.styleId ?? (index === 0 ? (actorOptions.styleId ?? 9100) : 9100 + index),
      styleName: index === 0 ? (actorOptions.styleName ?? 'TS1') : `TS${index + 1}`,
      partyIndex: index,
      position: index,
      elements: memberOptionsByIndex[index]?.elements ?? [],
      initialSP: memberOptionsByIndex[index]?.initialSP ?? 10,
      drivePiercePercent: index === 0 ? (actorOptions.drivePiercePercent ?? 0) : 0,
      skills: [
        Object.hasOwn(memberSkillsByIndex, index)
          ? memberSkillsByIndex[index]
          : index === 0
          ? (actorOptions.skills ?? [actorOptions.skill ?? PROTECTION_SKILL])
          : index === 3
            ? backMemberSkills
            : PROTECTION_SKILL,
      ].flat(),
      triggeredSkills: memberOptionsByIndex[index]?.triggeredSkills ?? [],
      passives: memberOptionsByIndex[index]?.passives ?? (index === 0 ? (actorOptions.passives ?? []) : []),
    })
  );
  return new Party(members);
}

test('follow-up override sets pursuedHitCount on committed action', () => {
  const actorSkill = createSkill({
    id: 9301,
    name: 'Pursuit Test Skill',
    targetType: 'Single',
    spCost: 3,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const party = createPursuitTestParty({
    characterId: 'PURSUIT_ACTOR',
    skill: actorSkill,
  });

  const state = createBattleStateFromParty(party);

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9301, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'PURSUIT_ACTOR');
  assert.ok(actorEntry, 'Actor action should exist in committed record');
  assert.equal(actorEntry.pursuedHitCount, 1, 'pursuedHitCount should be 1 when follow-up override is set');
});

test('AdditionalHitOnPursuit passive fires when pursuedHitCount is set', () => {
  const actorSkill = createSkill({
    id: 9301,
    name: 'Pursuit Test Skill',
    targetType: 'Single',
    spCost: 3,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const party = createPursuitTestParty({
    characterId: 'PURSUIT_ACTOR',
    skill: actorSkill,
    passives: [
      {
        id: 300001,
        name: 'そよぐ新緑テスト',
        timing: 'OnFirstBattleStart',
        parts: [
          { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
          { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
        ],
      },
    ],
  });

  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9301, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'PURSUIT_ACTOR');
  assert.ok(actorEntry, 'Actor action should exist in committed record');

  const spPassive = (actorEntry.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spPassive, 'AdditionalHitOnPursuit should fire and grant SP via HealSp');
  assert.equal(spPassive.delta, 2, 'SP delta should be 2 per the passive power[0]');
});

test('follow-up override NOT set means pursuedHitCount stays 0', () => {
  const actorSkill = createSkill({
    id: 9302,
    name: 'No Pursuit Skill',
    targetType: 'Single',
    spCost: 3,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const party = createPursuitTestParty({
    characterId: 'NO_PURSUIT',
    skill: actorSkill,
    passives: [
      {
        id: 300002,
        name: 'そよぐ新緑テスト_非発火',
        timing: 'OnFirstBattleStart',
        parts: [
          { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
          { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
        ],
      },
    ],
  });

  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  // No followUpOverrides → pursuedHitCount should be 0
  const record = manager.commitNextTurn(
    {
      0: { skillId: 9302, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {}
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'NO_PURSUIT');
  assert.ok(actorEntry, 'Actor action should exist');
  assert.equal(actorEntry.pursuedHitCount, 0, 'pursuedHitCount should be 0 without follow-up override');

  // Verify AdditionalHitOnPursuit passive did NOT fire
  const spPassive = (actorEntry.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spPassive, 'sp_passive should NOT fire when pursuedHitCount is 0');
});

test('follow-up overrides are persisted in canonical replay turn fields', () => {
  const actorSkill = createSkill({
    id: 9303,
    name: 'Replay Persist Test',
    targetType: 'Self',
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });

  const party = createPursuitTestParty({ skill: actorSkill });
  const state = createBattleStateFromParty(party);

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  manager.commitNextTurn(
    {
      0: { skillId: 9303 },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      enemyCount: 3,
      followUpOverrides: [
        { position: 3, enemyIndex: 0 },
        { position: 4, enemyIndex: 1 },
      ],
    }
  );

  const replayTurn = manager.replayScript.turns[0];
  assert.ok(replayTurn, 'Replay turn should exist');
  assert.deepEqual(replayTurn.followUpOverrides, [
    { position: 3, enemyIndex: 0 },
    { position: 4, enemyIndex: 1 },
  ]);
  assert.equal(
    replayTurn.overrideEntries.some(
      (entry) => entry.type === REPLAY_OVERRIDE_ENTRY_TYPES.FOLLOW_UP_OVERRIDES
    ),
    false
  );
});

test('follow-up overrides survive recalculateFrom', () => {
  const actorSkill = createSkill({
    id: 9304,
    name: 'Recalc Persist Test',
    targetType: 'Single',
    spCost: 3,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const party = createPursuitTestParty({
    characterId: 'RECALC_ACTOR',
    skill: actorSkill,
    passives: [
      {
        id: 300004,
        name: 'そよぐ新緑テスト_再計算',
        timing: 'OnFirstBattleStart',
        parts: [
          { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
          { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
        ],
      },
    ],
  });

  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  manager.commitNextTurn(
    {
      0: { skillId: 9304, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  // Recalculate from turn 0
  manager.recalculateFrom(0);

  // After recalculation, the action should still have pursuedHitCount=1
  const recalcedRecord = manager.computedRecords[0];
  assert.ok(recalcedRecord, 'Recalculated record should exist');
  const actorEntry = recalcedRecord.actions.find((a) => a.characterId === 'RECALC_ACTOR');
  assert.ok(actorEntry, 'Actor action should exist after recalculation');
  assert.equal(actorEntry.pursuedHitCount, 1, 'pursuedHitCount should persist after recalculation');
});

test('follow-up override increases OD gauge by additional pursuit hit', () => {
  const actorSkill = createSkill({
    id: 9305,
    name: 'OD Pursuit Test',
    targetType: 'Single',
    spCost: 3,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', hit_count: 1 }],
  });

  const partyWithout = createPursuitTestParty({
    characterId: 'OD_ACTOR',
    skill: actorSkill,
  });
  const stateWithout = createBattleStateFromParty(partyWithout);
  const managerWithout = new TurnEngineManager();
  managerWithout.initialize(stateWithout, {});

  const recordWithout = managerWithout.commitNextTurn(
    {
      0: { skillId: 9305, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {}
  );

  const partyWith = createPursuitTestParty({
    characterId: 'OD_ACTOR',
    skill: actorSkill,
  });
  const stateWith = createBattleStateFromParty(partyWith);
  const managerWith = new TurnEngineManager();
  managerWith.initialize(stateWith, {});

  const recordWith = managerWith.commitNextTurn(
    {
      0: { skillId: 9305, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const odWithout = recordWithout.projections?.odGaugeAtEnd ?? 0;
  const odWith = recordWith.projections?.odGaugeAtEnd ?? 0;
  assert.ok(
    odWith > odWithout,
    `OD with pursuit (${odWith}) should be greater than without (${odWithout})`
  );
});

// --- 追撃 OD の前衛からの独立性テスト ---

const PURSUIT_SKILL_4HIT = createSkill({
  id: 8091,
  name: '追撃',
  targetType: 'Single',
  hitCount: 4,
  parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
});

const PURSUIT_SKILL_1HIT = createSkill({
  id: 8092,
  name: '追撃',
  targetType: 'Single',
  hitCount: 1,
  parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
});

test('extra turn follow-up from non-EX backliner attaches to the sole EX action and survives recalculation', () => {
  const actorSkill = createSkill({
    id: 9306,
    name: 'EX Pursuit Test',
    targetType: 'Single',
    spCost: 3,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const party = createPursuitTestParty({
    characterId: 'EX_ACTOR',
    skill: actorSkill,
    memberSkillsByIndex: {
      4: [PROTECTION_SKILL, PURSUIT_SKILL_4HIT],
    },
  });
  const state = createBattleStateFromParty(party);
  state.turnState.turnType = 'extra';
  state.turnState.turnLabel = 'EX';
  state.turnState.odSuspended = true;
  state.turnState.extraTurnState = {
    active: true,
    remainingActions: 1,
    allowedCharacterIds: ['EX_ACTOR'],
    grantTurnIndex: 0,
  };

  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9306, target: { type: 'enemy', enemyIndex: 0 } },
    },
    {
      followUpOverrides: [{ position: 4, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'EX_ACTOR');
  assert.ok(actorEntry, 'EX actor action should exist');
  assert.equal(actorEntry.pursuedHitCount, 4, 'non-paired backliner pursuit should attach on sole EX action');
  assert.equal(actorEntry.pursuedTargetEnemyIndex, 0);
  assert.equal(record.projections?.odGaugeAtEnd, 12.5, '1hit skill + 4hit pursuit should total 12.5% OD');

  assert.deepEqual(manager.replayScript.turns[0]?.followUpOverrides, [
    { position: 4, enemyIndex: 0 },
  ]);

  manager.recalculateFrom(0);

  const recalculatedEntry = manager.computedRecords[0]?.actions.find((a) => a.characterId === 'EX_ACTOR');
  assert.ok(recalculatedEntry, 'recalculated EX actor action should exist');
  assert.equal(recalculatedEntry.pursuedHitCount, 4);
  assert.equal(manager.computedRecords[0]?.projections?.odGaugeAtEnd, 12.5);
});

test('pursuit OD gain is independent: non-damage front skill + pursuit still increases OD', () => {
  // 前衛が Protection（非ダメージ）、後衛に追撃スキル(4hit)をもたせる
  const party = createPursuitTestParty({
    characterId: 'PROT_ACTOR',
    skill: PROTECTION_SKILL,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_4HIT],
  });
  const state = createBattleStateFromParty(party);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 8001 },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const odEnd = record.projections?.odGaugeAtEnd ?? 0;
  // 4hit × 2.5% = 10% OD gain expected
  assert.ok(odEnd > 0, `OD should increase even when front uses Protection, got ${odEnd}`);
  assert.equal(odEnd, 10, 'Pursuit 4hit should give 10% OD (4 × 2.5%)');
});

test('pursuedHitCount resolves from back member pursuit skill hit_count', () => {
  const actorSkill = createSkill({
    id: 9306,
    name: 'Single Attack',
    targetType: 'Single',
    spCost: 3,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const party = createPursuitTestParty({
    characterId: 'HIT_COUNT_ACTOR',
    skill: actorSkill,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_4HIT],
  });
  const state = createBattleStateFromParty(party);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9306, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'HIT_COUNT_ACTOR');
  assert.equal(actorEntry.pursuedHitCount, 4, 'pursuedHitCount should be 4 from pursuit skill hit_count');
});

test('pursuedHitCount resolves from back member triggered pursuit skill hit_count', () => {
  const actorSkill = createSkill({
    id: 9316,
    name: 'Triggered Pursuit Source Test',
    targetType: 'Single',
    spCost: 3,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? 'TRIGGERED_HIT_COUNT_ACTOR' : `TRG${index + 1}`,
      characterName: index === 0 ? 'TRIGGERED_HIT_COUNT_ACTOR' : `TRG${index + 1}`,
      styleId: 9500 + index,
      styleName: `TRG_STYLE_${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills:
        index === 0
          ? [actorSkill]
          : [PROTECTION_SKILL],
      triggeredSkills:
        index === 3
          ? [PURSUIT_SKILL_4HIT]
          : [],
      passives: [],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9316, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'TRIGGERED_HIT_COUNT_ACTOR');
  assert.equal(
    actorEntry.pursuedHitCount,
    4,
    'pursuedHitCount should be 4 from triggered pursuit skill hit_count'
  );
});

test('pursuedHitCount falls back by weapon exception when pursuit skill cannot be resolved', () => {
  const actorSkill = createSkill({
    id: 9317,
    name: 'Fallback Pursuit Source Test',
    targetType: 'Single',
    spCost: 3,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? 'FALLBACK_HIT_COUNT_ACTOR' : index === 3 ? 'IMinase' : `FAL${index + 1}`,
      characterName: index === 0 ? 'FALLBACK_HIT_COUNT_ACTOR' : `FAL${index + 1}`,
      styleId: 9600 + index,
      styleName: `FAL_STYLE_${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      weaponType: index === 3 ? 'Gun' : 'Sword',
      skills: index === 0 ? [actorSkill] : [PROTECTION_SKILL],
      triggeredSkills: [],
      passives: [],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9317, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'FALLBACK_HIT_COUNT_ACTOR');
  assert.equal(actorEntry.pursuedHitCount, 2, 'IMinase(gun) fallback should resolve to 2 hits');
});

test('pursuedHitCount resolves transformed pursuit skill hit_count (ネコジェット・シャテキ)', () => {
  const actorSkill = createSkill({
    id: 9318,
    name: 'Transformed Pursuit Source Test',
    targetType: 'Single',
    spCost: 3,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const transformedPursuit = createSkill({
    id: 9391,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    hitCount: 5,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });

  const members = Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: index === 0 ? 'TRANSFORMED_HIT_COUNT_ACTOR' : `TRF${index + 1}`,
      characterName: index === 0 ? 'TRANSFORMED_HIT_COUNT_ACTOR' : `TRF${index + 1}`,
      styleId: 9700 + index,
      styleName: `TRF_STYLE_${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      skills: index === 0 ? [actorSkill] : [PROTECTION_SKILL],
      triggeredSkills: index === 3 ? [transformedPursuit] : [],
      passives: [],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9318, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'TRANSFORMED_HIT_COUNT_ACTOR');
  assert.equal(actorEntry.pursuedHitCount, 5, 'Transformed pursuit skill should resolve to 5 hits');
  assert.equal(actorEntry.pursuitSourceSpCost, 10);
  assert.equal(actorEntry.pursuitSourceSkillName, 'ネコジェット・シャテキ');
});

test('ネコジェット・シャテキ requires pursuit source SP10; SP8 uses normal pursuit', () => {
  const actorSkill = createSkill({
    id: 9319,
    name: 'Transformed Pursuit SP Gate Test',
    targetType: 'Single',
    spCost: 5,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const normalPursuit = createSkill({
    id: 9390,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const nekoJet = createSkill({
    id: 9391,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    hitCount: 5,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'TRANSFORMED_SP_GATE_ACTOR',
    skill: actorSkill,
    memberOptionsByIndex: {
      3: {
        characterId: 'YO_OSHIMA_SP8',
        initialSP: 8,
        triggeredSkills: [nekoJet, normalPursuit],
        passives: [{ id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] }],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9319, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );

  const actorEntry = record.actions.find((a) => a.characterId === 'TRANSFORMED_SP_GATE_ACTOR');
  assert.equal(actorEntry.pursuedHitCount, 1);
  assert.equal(actorEntry.pursuitSourceSkillName, '追撃');
  assert.equal(actorEntry.pursuitSourceSpCost, 0);
});

test('湯めぐり automatically materializes follow-up and そよぐ新緑 heals frontline SP', () => {
  const actorSkill = createSkill({
    id: 9401,
    name: 'Auto Follow Source Skill',
    targetType: 'Single',
    spCost: 8,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const nekoJet = createSkill({
    id: 9491,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    hitCount: 5,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'AUTO_FOLLOW_ACTOR',
    skill: actorSkill,
    memberOptionsByIndex: {
      3: {
        characterId: 'YO_OSHIMA_AUTO',
        initialSP: 10,
        triggeredSkills: [nekoJet],
        passives: [
          { id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] },
          {
            id: 57001217,
            name: 'そよぐ新緑',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0] },
              { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0] },
            ],
          },
        ],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9401, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );

  assert.deepEqual(manager.replayScript.turns[0].followUpOverrides, [{ position: 3, enemyIndex: 0 }]);
  const actorEntry = record.actions.find((action) => action.characterId === 'AUTO_FOLLOW_ACTOR');
  assert.equal(actorEntry.pursuedHitCount, 5);
  assert.equal(actorEntry.pursuitSourceCharacterId, 'YO_OSHIMA_AUTO');
  assert.equal(actorEntry.pursuitSourceSkillName, 'ネコジェット・シャテキ');
  assert.equal(actorEntry.pursuitSourceSpCost, 10);
  const spPassives = record.actions
    .flatMap((action) => action.spChanges ?? [])
    .filter((change) => change.source === 'sp_passive');
  assert.equal(spPassives.length, 3, 'AllyFront three members should receive SP+2');
  assert.ok(spPassives.every((change) => change.delta === 2));
  const passiveLogEvents = record.passiveEvents.filter((event) => event.passiveName === 'そよぐ新緑');
  assert.equal(passiveLogEvents.length, 1);
  assert.equal(passiveLogEvents[0].source, 'passive_trigger');
  assert.equal(passiveLogEvents[0].spDelta, 6);
});

test('自動追撃はパッシブ定義のConsumeSp条件で判定し固定SP8閾値に依存しない', () => {
  const actorSkill = createSkill({
    id: 9406,
    name: 'Future Auto Follow Source Skill',
    targetType: 'Single',
    spCost: 9,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const normalPursuit = createSkill({
    id: 9496,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const commitWithCondition = (condition) => {
    const party = createPursuitTestParty({
      characterId: `AUTO_FOLLOW_CONDITION_${condition.replace(/[^0-9]/g, '')}`,
      skill: actorSkill,
      memberOptionsByIndex: {
        3: {
          characterId: 'FUTURE_AUTO_FOLLOW_SOURCE',
          initialSP: 10,
          triggeredSkills: [normalPursuit],
          passives: [
            {
              id: 57009999,
              label: 'Passive.PursuitConfirmedFuture',
              name: 'Future Pursuit Condition',
              timing: 'None',
              auto_type: 'Pursuit',
              condition,
              parts: [],
            },
          ],
        },
      },
    });
    const state = createBattleStateFromParty(party);
    const manager = new TurnEngineManager();
    manager.initialize(state, {});
    return manager.commitNextTurn(
      {
        0: { skillId: 9406, target: { type: 'enemy', enemyIndex: 0 } },
        1: { skillId: 8001 },
        2: { skillId: 8001 },
      },
      { enemyCount: 1 }
    );
  };

  const matchedRecord = commitWithCondition('ConsumeSp()<=10');
  const unmatchedRecord = commitWithCondition('ConsumeSp()<=8');

  assert.equal(
    matchedRecord.actions.find((action) => action.skillId === 9406)?.pursuitTriggerSource,
    'auto',
    'SP9の攻撃はパッシブ条件がConsumeSp()<=10なら自動追撃する'
  );
  assert.notEqual(
    unmatchedRecord.actions.find((action) => action.skillId === 9406)?.pursuitTriggerSource,
    'auto',
    'SP9の攻撃はパッシブ条件がConsumeSp()<=8なら自動追撃しない'
  );
});

test('ネコジェット・シャテキ pursuit cost uses ReduceSp passives such as 闇天', () => {
  const actorSkill = createSkill({
    id: 94011,
    name: 'Dark Heaven Follow Source',
    targetType: 'Single',
    spCost: 8,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const nekoJet = createSkill({
    id: 94911,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    spCost: 10,
    hitCount: 5,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Dark'] }],
  });
  const normalPursuit = createSkill({
    id: 94912,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'DARK_HEAVEN_ACTOR',
    skill: actorSkill,
    memberOptionsByIndex: {
      3: {
        characterId: 'YO_OSHIMA_DARK',
        initialSP: 9,
        elements: ['Dark'],
        triggeredSkills: [nekoJet, normalPursuit],
        passives: [{ id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] }],
      },
      4: {
        characterId: 'DARK_HEAVEN_REDUCER',
        passives: [
          {
            id: 57009991,
            name: '闇天テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              {
                skill_type: 'ReduceSp',
                target_type: 'AllyAll',
                power: [1, 0],
                target_condition: 'IsNatureElement(Dark)',
              },
            ],
          },
        ],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 94011, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );

  const actorEntry = record.actions.find((action) => action.characterId === 'DARK_HEAVEN_ACTOR');
  assert.equal(actorEntry.pursuitSourceSkillName, 'ネコジェット・シャテキ');
  assert.equal(actorEntry.pursuitSourceSpCost, 9);
  const yotsubaAfter = manager.computedStates[0].party.find((member) => member.characterId === 'YO_OSHIMA_DARK');
  assert.equal(yotsubaAfter.sp.current, 2, 'SP9からネコジェット実効コスト9を消費し、ターン開始回復+2でSP2');
});

test('ネコジェット・シャテキ transform resets for the next committed row but remains once per row', () => {
  const actorSkill = createSkill({
    id: 94012,
    name: 'Repeated Row Follow Source',
    targetType: 'Single',
    spCost: 8,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const nekoJet = createSkill({
    id: 94913,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    spCost: 10,
    hitCount: 5,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const normalPursuit = createSkill({
    id: 94914,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'ROW_RESET_ACTOR',
    skill: actorSkill,
    memberSkillsByIndex: {
      1: [actorSkill, PROTECTION_SKILL],
    },
    memberOptionsByIndex: {
      1: { characterId: 'ROW_RESET_ACTOR_2' },
      3: {
        characterId: 'YO_OSHIMA_ROW_RESET',
        initialSP: 30,
        triggeredSkills: [nekoJet, normalPursuit],
        passives: [{ id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] }],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const firstRecord = manager.commitNextTurn(
    {
      0: { skillId: 94012, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 94012, target: { type: 'enemy', enemyIndex: 0 } },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );
  assert.deepEqual(
    firstRecord.actions
      .filter((action) => action.pursuitTriggerSource === 'auto')
      .map((action) => action.pursuitSourceSkillName),
    ['ネコジェット・シャテキ', '追撃']
  );

  const secondRecord = manager.commitNextTurn(
    {
      0: { skillId: 94012, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );
  const secondPursuitAction = secondRecord.actions.find((action) => action.pursuitTriggerSource === 'auto');
  assert.equal(secondPursuitAction.pursuitSourceSkillName, 'ネコジェット・シャテキ');
});

test('湯めぐり automatic follow-up fires for both Byakko rush repeated attacks', () => {
  const byakkoAssaultClaw = createSkill({
    id: 9402,
    name: 'アサルトクロー',
    targetType: 'Single',
    spCost: 6,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
  });
  const pursuit = createSkill({
    id: 9492,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'BYAKKO_RUSH_AUTO',
    skill: byakkoAssaultClaw,
    memberOptionsByIndex: {
      3: {
        characterId: 'YO_OSHIMA_RUSH',
        passives: [{ id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] }],
        triggeredSkills: [pursuit],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  state.party[0].addStatusEffect({
    statusType: 'ByakkoDoubleActionAttackSkill',
    limitType: 'None',
    exitCond: 'PlayerTurnEnd',
    remaining: 1,
  });
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9402, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );

  const byakkoActions = record.actions.filter((action) => action.characterId === 'BYAKKO_RUSH_AUTO');
  assert.equal(byakkoActions.length, 2);
  assert.deepEqual(byakkoActions.map((action) => action.castIndex), [0, 1]);
  assert.deepEqual(byakkoActions.map((action) => action.pursuedHitCount), [1, 1]);
  assert.deepEqual(byakkoActions.map((action) => action.pursuitTriggerSource), ['auto', 'auto']);
  const chipModels = buildAutomaticFollowUpChipModelsFromActions({
    actions: record.actions,
    members: state.party,
  });
  assert.equal(chipModels.length, 2);
  assert.ok(chipModels.every((chip) => chip.label.includes('自動追撃')));
});

test('Byakko rush remains active into granted extra turn and repeats Assault Claw there', () => {
  const grantExtraAttack = {
    id: 9403,
    name: 'Extra Grant Attack',
    label: 'ExtraGrantAttack9403',
    sp_cost: 0,
    target_type: 'Single',
    hit_count: 1,
    additionalTurnRule: {
      skillUsableInExtraTurn: true,
      additionalTurnGrantInExtraTurn: true,
      conditions: {
        requiresOverDrive: false,
        requiresReinforcedMode: false,
        excludesExtraTurnForSkillUse: false,
        excludesExtraTurnForAdditionalTurnGrant: false,
      },
      additionalTurnTargetTypes: ['AllyFront'],
    },
    parts: [
      { skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' },
      { skill_type: 'AdditionalTurn', target_type: 'AllyFront' },
    ],
  };
  const byakkoAssaultClaw = createSkill({
    id: 9404,
    name: 'アサルトクロー',
    targetType: 'Single',
    spCost: 5,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
  });
  const party = createPursuitTestParty({
    characterId: 'BYAKKO_RUSH_EXTRA',
    skills: [grantExtraAttack, byakkoAssaultClaw],
  });
  const state = createBattleStateFromParty(party);
  state.party[0].addStatusEffect({
    statusType: 'ByakkoDoubleActionAttackSkill',
    limitType: 'None',
    exitCond: 'PlayerTurnEnd',
    remaining: 1,
  });
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  manager.commitNextTurn(
    {
      0: { skillId: 9403, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 1 }
  );

  const extraState = manager.getStateBefore(1);
  const byakkoBeforeExtra = extraState.party.find((member) => member.characterId === 'BYAKKO_RUSH_EXTRA');
  assert.equal(extraState.turnState.turnType, 'extra');
  assert.equal(byakkoBeforeExtra.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 1);

  const extraRecord = manager.commitNextTurn(
    {
      0: { skillId: 9404, target: { type: 'enemy', enemyIndex: 0 } },
    },
    { enemyCount: 1 }
  );
  const byakkoActions = extraRecord.actions.filter((action) => action.characterId === 'BYAKKO_RUSH_EXTRA');
  assert.equal(byakkoActions.length, 2);
  assert.deepEqual(byakkoActions.map((action) => action.castIndex), [0, 1]);
});

test('湯めぐり handles derived attack skills before HP break and 温泉手形 transforms only once per player turn', () => {
  const lovelyBeam = createSkill({
    id: 9410,
    name: 'くぎづけ♡ラブリービーム',
    targetType: 'Single',
    spCost: 7,
    hitCount: 1,
    parts: [{ skill_type: 'DamageRateChangeAttackSkill', target_type: 'Single', type: 'Light' }],
  });
  const sweetsCharge = createSkill({
    id: 9411,
    name: 'スイーツチャージ！',
    targetType: 'Single',
    spCost: 4,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });
  const finisher = createSkill({
    id: 9412,
    name: '黒曜のオーバーロード',
    targetType: 'Single',
    spCost: 13,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Dark' }],
  });
  const normalPursuit = createSkill({
    id: 9490,
    name: '追撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const nekoJet = createSkill({
    id: 9491,
    name: 'ネコジェット・シャテキ',
    targetType: 'Single',
    hitCount: 5,
    parts: [{ skill_type: 'AttackNormal', target_type: 'Single' }],
  });
  const party = createPursuitTestParty({
    characterId: 'ALESSA_LOVELY',
    skill: lovelyBeam,
    memberSkillsByIndex: {
      0: [lovelyBeam],
      1: [sweetsCharge],
      2: [finisher],
    },
    memberOptionsByIndex: {
      1: { characterId: 'NIKAIDO_SWEETS', initialSP: 20 },
      2: { characterId: 'RUKA_FINISHER', initialSP: 20 },
      3: {
        characterId: 'YO_OSHIMA_TICKET',
        initialSP: 24,
        triggeredSkills: [nekoJet, normalPursuit],
        passives: [{ id: 57001218, label: 'Passive.PursuitConfirmed01', name: '湯めぐり', timing: 'None', auto_type: 'Pursuit', condition: 'ConsumeSp()<=8', parts: [] }],
      },
    },
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.extraHpGaugeStateByEnemy = {
    0: { total: 3, remaining: 3, values: [1, 1, 1] },
  };
  const manager = new TurnEngineManager();
  manager.initialize(state, {});

  const record = manager.commitNextTurn(
    {
      0: { skillId: 9410, target: { type: 'enemy', enemyIndex: 0 } },
      1: { skillId: 9411, target: { type: 'enemy', enemyIndex: 0 } },
      2: { skillId: 9412, target: { type: 'enemy', enemyIndex: 0 } },
    },
    {
      enemyCount: 1,
      actionOutcomeOverrides: [{ position: 2, outcome: 'HpBreak', enemyIndexes: [0] }],
    }
  );

  assert.deepEqual(record.actions.map((action) => action.skillName), [
    'くぎづけ♡ラブリービーム',
    'スイーツチャージ！',
    '黒曜のオーバーロード',
  ]);
  assert.deepEqual(record.actions.map((action) => action.pursuitSourceSkillName || ''), [
    'ネコジェット・シャテキ',
    '追撃',
    '',
  ]);
  assert.deepEqual(record.actions.map((action) => action.pursuitSourceSpCost ?? 0), [10, 0, 0]);
  assert.deepEqual(record.actions.map((action) => action.pursuedHitCount), [5, 1, 0]);
});

test('実リプレイ #5: 自動追撃表示・SP消費/増加・ネコジェットと通常追撃を1回ずつ再計算できる', () => {
  const session = loadSessionFixture(YUMEGURI_REAL_REPLAY_FIXTURE);
  const manager = loadSessionIntoTurnEngine(session);

  assert.equal(manager.replayDiagnostics.error, null);
  assert.equal(manager.replayDiagnostics.appliedTurnCount, 5);
  assert.ok(manager.replayDiagnostics.turnWarnings.every((warnings) => warnings.length === 0));

  const turnIndex = 4;
  const record = manager.computedRecords[turnIndex];
  const stateBefore = manager.getStateBefore(turnIndex);
  const stateAfter = manager.computedStates[turnIndex];
  assert.ok(record, '実リプレイ #5 の record が存在する');

  assert.deepEqual(record.actions.map((action) => action.skillName), [
    'くぎづけ♡ラブリービーム',
    'スイーツチャージ！',
    '黒曜のオーバーロード',
  ]);
  assert.deepEqual(record.actions.map((action) => action.characterName), [
    '蒼井 えりか',
    '二階堂 三郷',
    '茅森 月歌',
  ]);

  const pursuitActions = record.actions.filter((action) => action.pursuitTriggerSource === 'auto');
  assert.equal(pursuitActions.length, 2, '実リプレイ #5 の自動追撃は2回');
  assert.deepEqual(pursuitActions.map((action) => action.pursuitSourceSkillName), [
    'ネコジェット・シャテキ',
    '追撃',
  ]);
  assert.deepEqual(pursuitActions.map((action) => action.pursuitSourceSpCost), [9, 0]);
  assert.deepEqual(pursuitActions.map((action) => action.pursuedHitCount), [5, 1]);
  assert.equal(
    record.actions.filter((action) => action.pursuitSourceSkillName === 'ネコジェット・シャテキ').length,
    1,
    '温泉手形によるネコジェット変換は同一行動レコードで1回だけ'
  );
  assert.equal(
    record.actions.filter((action) => action.pursuitSourceSkillName === '追撃').length,
    1,
    '2回目の湯めぐりは通常追撃に戻る'
  );

  const chipModels = buildAutomaticFollowUpChipModelsFromActions({
    actions: record.actions,
    members: stateBefore.party,
  });
  assert.equal(chipModels.length, 2, '実リプレイ #5 の自動追撃チップは2枚表示される');
  assert.deepEqual(chipModels.map((chip) => chip.label), [
    '四ツ葉→E1 自動追撃 ネコジェット・シャテキ',
    '四ツ葉→E1 自動追撃 追撃',
  ]);

  const costBySkillName = Object.fromEntries(
    record.actions.map((action) => [
      action.skillName,
      (action.spChanges ?? [])
        .filter((change) => change.source === 'cost')
        .reduce((sum, change) => sum + Number(change.delta ?? 0), 0),
    ])
  );
  assert.deepEqual(costBySkillName, {
    'くぎづけ♡ラブリービーム': -7,
    'スイーツチャージ！': -4,
    '黒曜のオーバーロード': -13,
  });

  const frontSpPassiveChanges = record.actions.flatMap((action) =>
    (action.spChanges ?? [])
      .filter((change) => change.source === 'sp_passive')
      .map((change) => ({
        skillName: action.skillName,
        delta: change.delta,
      }))
  );
  assert.equal(frontSpPassiveChanges.length, 6, 'そよぐ新緑2回 x 前衛3人分の SP+2 が記録される');
  assert.ok(frontSpPassiveChanges.every((change) => change.delta === 2));

  const passiveLogEvents = record.passiveEvents.filter((event) => event.passiveName === 'そよぐ新緑');
  assert.equal(passiveLogEvents.length, 2, 'そよぐ新緑のパッシブログは追撃2回分');
  assert.deepEqual(passiveLogEvents.map((event) => event.triggerSkillName), [
    'くぎづけ♡ラブリービーム',
    'スイーツチャージ！',
  ]);
  assert.ok(passiveLogEvents.every((event) => event.spDelta === 6));
  assert.ok(passiveLogEvents.every((event) => event.affectedTargetCount === 3));

  const yotsubaBefore = stateBefore.party.find((member) => member.characterName === '大島 四ツ葉');
  const yotsubaAfter = stateAfter.party.find((member) => member.characterName === '大島 四ツ葉');
  assert.equal(yotsubaBefore?.sp?.current, 24);
  assert.equal(yotsubaAfter?.sp?.current, 19);
});

test('pursuit OD is not multiplied by enemy count on All-target skill', () => {
  const allTargetSkill = createSkill({
    id: 9307,
    name: 'All Target Attack',
    targetType: 'All',
    spCost: 5,
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
  });

  // Without pursuit
  const partyWithout = createPursuitTestParty({
    characterId: 'ALL_ACTOR',
    skill: allTargetSkill,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateWithout = createBattleStateFromParty(partyWithout);
  const managerWithout = new TurnEngineManager();
  managerWithout.initialize(stateWithout, {});
  const recordWithout = managerWithout.commitNextTurn(
    {
      0: { skillId: 9307 },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    { enemyCount: 3 }
  );

  // With pursuit
  const partyWith = createPursuitTestParty({
    characterId: 'ALL_ACTOR',
    skill: allTargetSkill,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateWith = createBattleStateFromParty(partyWith);
  const managerWith = new TurnEngineManager();
  managerWith.initialize(stateWith, {});
  const recordWith = managerWith.commitNextTurn(
    {
      0: { skillId: 9307 },
      1: { skillId: 8001 },
      2: { skillId: 8001 },
    },
    {
      enemyCount: 3,
      followUpOverrides: [{ position: 3, enemyIndex: 0 }],
    }
  );

  const odWithout = recordWithout.projections?.odGaugeAtEnd ?? 0;
  const odWith = recordWith.projections?.odGaugeAtEnd ?? 0;
  const pursuitContribution = odWith - odWithout;
  // 追撃1hit = 2.5% 固定。敵3体でも3倍にならない
  assert.equal(pursuitContribution, 2.5, 'Pursuit OD should be 2.5% (1hit), not multiplied by enemy count');
});

test('pursuit OD is not affected by drive pierce bonus on front attacker', () => {
  const singleAttack = createSkill({
    id: 9308,
    name: 'Pierce Test Skill',
    targetType: 'Single',
    spCost: 3,
    hitCount: 2,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  // Without drive pierce
  const partyNoPierce = createPursuitTestParty({
    characterId: 'DP_ACTOR',
    skill: singleAttack,
    drivePiercePercent: 0,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateNoPierce = createBattleStateFromParty(partyNoPierce);
  const managerNoPierce = new TurnEngineManager();
  managerNoPierce.initialize(stateNoPierce, {});
  const recordNoPierce = managerNoPierce.commitNextTurn(
    { 0: { skillId: 9308, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    { followUpOverrides: [{ position: 3, enemyIndex: 0 }] }
  );

  // With drive pierce 15%
  const partyPierce = createPursuitTestParty({
    characterId: 'DP_ACTOR',
    skill: singleAttack,
    drivePiercePercent: 15,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const statePierce = createBattleStateFromParty(partyPierce);
  const managerPierce = new TurnEngineManager();
  managerPierce.initialize(statePierce, {});
  const recordPierce = managerPierce.commitNextTurn(
    { 0: { skillId: 9308, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    { followUpOverrides: [{ position: 3, enemyIndex: 0 }] }
  );

  // Without pursuit for baseline
  const partyBaseline = createPursuitTestParty({
    characterId: 'DP_ACTOR',
    skill: singleAttack,
    drivePiercePercent: 15,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateBaseline = createBattleStateFromParty(partyBaseline);
  const managerBaseline = new TurnEngineManager();
  managerBaseline.initialize(stateBaseline, {});
  const recordBaseline = managerBaseline.commitNextTurn(
    { 0: { skillId: 9308, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    {}
  );

  const odNoPierce = recordNoPierce.projections?.odGaugeAtEnd ?? 0;
  const odPierce = recordPierce.projections?.odGaugeAtEnd ?? 0;
  const odBaselinePierce = recordBaseline.projections?.odGaugeAtEnd ?? 0;

  // Drive pierce changes the front skill OD, so total differs
  assert.ok(odPierce > odNoPierce, 'Drive pierce should increase front skill OD');
  // But pursuit contribution should be exactly the same
  const pursuitNoPierce = odNoPierce - (recordNoPierce.projections?.odGaugeAtEnd ?? 0) + 2.5;
  const pursuitWithPierce = odPierce - odBaselinePierce;
  assert.equal(pursuitWithPierce, 2.5, 'Pursuit OD contribution should be 2.5% regardless of drive pierce');
});

test('pursuit OD is not mixed into normal attack fixed 1-hit OD handling', () => {
  // 通常攻撃の OD は raw hit_count に関わらず 1hit 相当 (=2.5%) を基準にする
  const normalAttack = createSkill({
    id: 8000,
    name: '通常攻撃',
    targetType: 'Single',
    hitCount: 1,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  // Without pursuit baseline
  const partyWithout = createPursuitTestParty({
    characterId: 'NORMAL_ACTOR',
    skill: normalAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateWithout = createBattleStateFromParty(partyWithout);
  const managerWithout = new TurnEngineManager();
  managerWithout.initialize(stateWithout, {});
  const recordWithout = managerWithout.commitNextTurn(
    { 0: { skillId: 8000, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    {}
  );

  // With pursuit
  const partyWith = createPursuitTestParty({
    characterId: 'NORMAL_ACTOR',
    skill: normalAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateWith = createBattleStateFromParty(partyWith);
  const managerWith = new TurnEngineManager();
  managerWith.initialize(stateWith, {});
  const recordWith = managerWith.commitNextTurn(
    { 0: { skillId: 8000, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    { followUpOverrides: [{ position: 3, enemyIndex: 0 }] }
  );

  const odWithout = recordWithout.projections?.odGaugeAtEnd ?? 0;
  const odWith = recordWith.projections?.odGaugeAtEnd ?? 0;
  // 通常攻撃 1hit 相当 × 2.5% = 2.5%、追撃 1hit × 2.5% = 2.5%
  assert.equal(odWithout, 2.5, 'Normal attack should give fixed 2.5% OD');
  assert.equal(odWith - odWithout, 2.5, 'Pursuit should add exactly 2.5% (1hit), not alter normal attack fixed OD');
});

test('pursuit OD is affected by enemy od_rate multiplier', () => {
  const singleAttack = createSkill({
    id: 9400,
    name: 'OdRate Test Skill',
    targetType: 'Single',
    spCost: 3,
    hitCount: 2,
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
  });

  // od_rate = 1.0 (no correction)
  const partyNormal = createPursuitTestParty({
    characterId: 'ODR_ACTOR',
    skill: singleAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateNormal = createBattleStateFromParty(partyNormal);
  const managerNormal = new TurnEngineManager();
  managerNormal.initialize(stateNormal, {});
  const recordNormal = managerNormal.commitNextTurn(
    { 0: { skillId: 9400, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    { followUpOverrides: [{ position: 3, enemyIndex: 0 }] }
  );

  // od_rate = 0.5 (50% OD gain)
  const partyHalf = createPursuitTestParty({
    characterId: 'ODR_ACTOR',
    skill: singleAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateHalf = createBattleStateFromParty(partyHalf);
  stateHalf.turnState.enemyState = stateHalf.turnState.enemyState ?? {};
  stateHalf.turnState.enemyState.odRateByEnemy = { '0': 5000 };
  const managerHalf = new TurnEngineManager();
  managerHalf.initialize(stateHalf, {});
  const recordHalf = managerHalf.commitNextTurn(
    { 0: { skillId: 9400, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    { followUpOverrides: [{ position: 3, enemyIndex: 0 }] }
  );

  // Baselines without pursuit
  const partyBaseNormal = createPursuitTestParty({
    characterId: 'ODR_ACTOR',
    skill: singleAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateBaseNormal = createBattleStateFromParty(partyBaseNormal);
  const managerBaseNormal = new TurnEngineManager();
  managerBaseNormal.initialize(stateBaseNormal, {});
  const recordBaseNormal = managerBaseNormal.commitNextTurn(
    { 0: { skillId: 9400, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    {}
  );

  const partyBaseHalf = createPursuitTestParty({
    characterId: 'ODR_ACTOR',
    skill: singleAttack,
    backMemberSkills: [PROTECTION_SKILL, PURSUIT_SKILL_1HIT],
  });
  const stateBaseHalf = createBattleStateFromParty(partyBaseHalf);
  stateBaseHalf.turnState.enemyState = stateBaseHalf.turnState.enemyState ?? {};
  stateBaseHalf.turnState.enemyState.odRateByEnemy = { '0': 5000 };
  const managerBaseHalf = new TurnEngineManager();
  managerBaseHalf.initialize(stateBaseHalf, {});
  const recordBaseHalf = managerBaseHalf.commitNextTurn(
    { 0: { skillId: 9400, target: { type: 'enemy', enemyIndex: 0 } }, 1: { skillId: 8001 }, 2: { skillId: 8001 } },
    {}
  );

  const odNormal = recordNormal.projections?.odGaugeAtEnd ?? 0;
  const odHalf = recordHalf.projections?.odGaugeAtEnd ?? 0;
  const baseNormal = recordBaseNormal.projections?.odGaugeAtEnd ?? 0;
  const baseHalf = recordBaseHalf.projections?.odGaugeAtEnd ?? 0;

  // Pursuit contribution at od_rate=1.0: 1hit × 2.5% × 1.0 = 2.5%
  const pursuitNormal = odNormal - baseNormal;
  assert.equal(pursuitNormal, 2.5, 'Pursuit at od_rate=1.0 should be 2.5%');

  // Pursuit contribution at od_rate=0.5: 1hit × 2.5% × 0.5 = 1.25%
  const pursuitHalf = odHalf - baseHalf;
  assert.equal(pursuitHalf, 1.25, 'Pursuit at od_rate=0.5 should be 1.25% (affected by od_rate)');

  // Front skill OD should also be halved
  assert.ok(baseHalf < baseNormal, 'Front skill OD should also be reduced by od_rate 0.5');
});
