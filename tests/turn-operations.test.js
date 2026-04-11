import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import {
  applyBeforeCommitOperations,
  canActivateKishinka,
  resolveMakaiKiheiAvailability,
} from '../src/turn/turn-operations.js';
import { REPLAY_OPERATION_TYPES } from '../src/ui/lightweight-replay-script.js';
import {
  DEFAULT_SUMMON_SAMPLE_ENEMY,
  ENERGY_PIT_PINK_E_SAMPLE_ENEMY,
} from '../src/data/enemy-sample-presets.js';
import { MAX_ENEMY_COUNT } from '../src/config/battle-defaults.js';

const MAKAI_KIHEI_STYLE_ID = 1003108;
const MAKAI_KIHEI_SKILL_ID = 46003117;
const TEZUKA_STYLE_ID = 1001408;
const TEZUKA_CHARACTER_ID = 'STezuka';

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
            parts: [{ skill_type: 'PenetrationCriticalAttack', target_type: 'All', type: 'Slash' }],
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

function createMember({
  characterId,
  characterName,
  styleId,
  styleName,
  partyIndex,
  position,
  initialSP = 10,
  drivePiercePercent = 0,
  skills = [],
  passives = [],
}) {
  return new CharacterStyle({
    characterId,
    characterName,
    styleId,
    styleName,
    partyIndex,
    position,
    initialSP,
    drivePiercePercent,
    skills,
    passives,
  });
}

function createBaselineParty(overrides = {}) {
  return new Party(
    Array.from({ length: 6 }, (_, index) => {
      const override = overrides[index] ?? {};
      return createMember({
        characterId: override.characterId ?? `UT${index + 1}`,
        characterName: override.characterName ?? `UT${index + 1}`,
        styleId: override.styleId ?? 9800 + index,
        styleName: override.styleName ?? `UTS${index + 1}`,
        partyIndex: index,
        position: override.position ?? index,
        initialSP: override.initialSP ?? 10,
        drivePiercePercent: override.drivePiercePercent ?? 0,
        skills:
          override.skills ??
          [
            createSkill({
              id: 9900 + index,
              name: `Protection${index + 1}`,
              targetType: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            }),
          ],
        passives: override.passives ?? [],
      });
    })
  );
}

function createState(overrides = {}, { odGauge = 0, enemyCount = 1 } = {}) {
  const state = createBattleStateFromParty(createBaselineParty(overrides));
  state.turnState.odGauge = odGauge;
  state.turnState.enemyState.enemyCount = enemyCount;
  return state;
}

function createSummonEnemyOperation({
  enemyId = DEFAULT_SUMMON_SAMPLE_ENEMY.id,
  enemyName = DEFAULT_SUMMON_SAMPLE_ENEMY.name,
  maxDRate = 350,
  fireRate = 250,
  targetEnemyIndex = null,
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
      ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
    },
  };
}

test('applyBeforeCommitOperations uses the supplied enemyCount for Makai Kihei OD gain', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 0, enemyCount: 1 }
  );

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }],
    { enemyCount: 2 }
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.odGauge, 30);
});

test('applyBeforeCommitOperations ignores drive pierce for duplicate Makai Kihei OD gain', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
        drivePiercePercent: 15,
      },
    },
    { odGauge: 10, enemyCount: 1 }
  );

  const nextState = applyBeforeCommitOperations(
    state,
    [
      { type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI },
      { type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI },
    ],
    { enemyCount: 2 }
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.odGauge, 70);
});

test('applyBeforeCommitOperations applies Makai Kihei during extra turn even when Yamawaki is not actionable', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 133.29, enemyCount: 2 }
  );
  state.turnState.turnType = 'extra';
  state.turnState.turnLabel = 'EX';
  state.turnState.extraTurnState = {
    active: true,
    remainingActions: 1,
    allowedCharacterIds: ['UT2'],
    grantTurnIndex: 1,
  };

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }],
    { enemyCount: 2 }
  );

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.equal(nextState.turnState.odGauge, 163.29);
});

test('applyBeforeCommitOperations applies Kishinka and Makai Kihei before preemptive OD', () => {
  const state = createState(
    {
      0: {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      },
      1: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 70, enemyCount: 2 }
  );

  const nextState = applyBeforeCommitOperations(state, [
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_KISHINKA },
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI },
    { type: REPLAY_OPERATION_TYPES.ACTIVATE_PREEMPTIVE_OD, payload: { level: 1 } },
  ]);

  assert.equal(nextState.party[0].isReinforcedMode, true);
  assert.equal(nextState.turnState.turnType, 'od');
  assert.equal(nextState.turnState.odGauge, 15);
});

test('capability helpers resolve Kishinka and Makai Kihei availability from state only', () => {
  const state = createState(
    {
      0: {
        characterId: TEZUKA_CHARACTER_ID,
        characterName: '手塚 咲',
        styleId: TEZUKA_STYLE_ID,
        styleName: '鬼神テスト',
      },
      1: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        passives: [createMakaiKiheiPassive()],
      },
    }
  );

  assert.equal(canActivateKishinka(state), true);
  const makai = resolveMakaiKiheiAvailability(state);
  assert.equal(makai.hasYamawaki, true);
  assert.equal(makai.availableInState, true);
  assert.equal(makai.embeddedSkill?.label, 'BIYamawakiSkill55b');

  state.party[0].activateReinforcedMode(3);
  assert.equal(canActivateKishinka(state), false);
});

test('applyBeforeCommitOperations summons into the next unused enemy slot and copies enemy metadata', () => {
  const state = createState({}, { enemyCount: 1 });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 100, Stab: 100, Strike: 100, Fire: 100, Ice: 100, Thunder: 100, Light: 100, Dark: 100, Nonelement: 100 },
  };
  state.turnState.enemyState.absorbElementsByEnemy = { 0: [] };
  state.turnState.enemyState.odRateByEnemy = { 0: 0 };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  state.turnState.enemyState.breakStateByEnemy = {};
  state.turnState.enemyState.statuses = [];

  const nextState = applyBeforeCommitOperations(state, [createSummonEnemyOperation()], {});

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['1'], DEFAULT_SUMMON_SAMPLE_ENEMY.name);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['1'], 350);
  assert.equal(nextState.turnState.enemyState.damageRatesByEnemy['1'].Fire, 250);
  assert.deepEqual(nextState.turnState.enemyState.absorbElementsByEnemy['1'], ['fire']);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['1'], 100);
});

test('applyBeforeCommitOperations preserves summon-expanded enemyCount when the caller passes a stale value', () => {
  const state = createState({}, { enemyCount: 1 });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

  const nextState = applyBeforeCommitOperations(
    state,
    [createSummonEnemyOperation()],
    { enemyCount: 1 }
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['1'], DEFAULT_SUMMON_SAMPLE_ENEMY.name);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['2'], undefined);
});

test('applyBeforeCommitOperations reuses the lowest dead enemy slot without increasing enemyCount', () => {
  const state = createState({}, { enemyCount: 3 });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta', 2: 'Gamma' };
  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Fire: 100 },
    1: { Fire: 90 },
    2: { Fire: 80 },
  };
  state.turnState.enemyState.absorbElementsByEnemy = { 0: [], 1: [], 2: [] };
  state.turnState.enemyState.odRateByEnemy = { 0: 0, 1: 0, 2: 0 };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100, 1: 180, 2: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300, 1: 300, 2: 300 };
  state.turnState.enemyState.breakStateByEnemy = { 1: { broken: true } };
  state.turnState.enemyState.statuses = [
    { statusType: 'Dead', targetIndex: 1, remainingTurns: 0, exitCond: 'Eternal' },
    { statusType: 'DefenseDown', targetIndex: 1, remainingTurns: 2, exitCond: 'EnemyTurnEnd' },
  ];

  const nextState = applyBeforeCommitOperations(state, [
    createSummonEnemyOperation({
      enemyId: ENERGY_PIT_PINK_E_SAMPLE_ENEMY.id,
      enemyName: ENERGY_PIT_PINK_E_SAMPLE_ENEMY.name,
      fireRate: 220,
    }),
  ]);

  assert.equal(nextState.turnState.enemyState.enemyCount, 3);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['1'], ENERGY_PIT_PINK_E_SAMPLE_ENEMY.name);
  assert.equal(nextState.turnState.enemyState.damageRatesByEnemy['1'].Fire, 220);
  assert.deepEqual(nextState.turnState.enemyState.absorbElementsByEnemy['1'], ['fire']);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['1'], 100);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['1'], 350);
  assert.equal(Object.hasOwn(nextState.turnState.enemyState.breakStateByEnemy, '1'), false);
  assert.equal(
    nextState.turnState.enemyState.statuses.some((status) => Number(status.targetIndex) === 1),
    false
  );
});

test('applyBeforeCommitOperations honors targetEnemyIndex for a dead slot even before max enemy count', () => {
  const state = createState({}, { enemyCount: 1 });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Fire: 90 } };
  state.turnState.enemyState.absorbElementsByEnemy = { 0: [] };
  state.turnState.enemyState.odRateByEnemy = { 0: 0 };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 180 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  state.turnState.enemyState.breakStateByEnemy = { 0: { broken: true } };
  state.turnState.enemyState.statuses = [
    { statusType: 'Dead', targetIndex: 0, remainingTurns: 0, exitCond: 'Eternal' },
    { statusType: 'DefenseDown', targetIndex: 0, remainingTurns: 2, exitCond: 'EnemyTurnEnd' },
  ];

  const nextState = applyBeforeCommitOperations(state, [
    createSummonEnemyOperation({
      enemyId: ENERGY_PIT_PINK_E_SAMPLE_ENEMY.id,
      enemyName: ENERGY_PIT_PINK_E_SAMPLE_ENEMY.name,
      fireRate: 220,
      targetEnemyIndex: 0,
    }),
  ]);

  assert.equal(nextState.turnState.enemyState.enemyCount, 1);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['0'], ENERGY_PIT_PINK_E_SAMPLE_ENEMY.name);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['1'], undefined);
  assert.equal(nextState.turnState.enemyState.damageRatesByEnemy['0'].Fire, 220);
  assert.deepEqual(nextState.turnState.enemyState.absorbElementsByEnemy['0'], ['fire']);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 100);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 350);
  assert.equal(Object.hasOwn(nextState.turnState.enemyState.breakStateByEnemy, '0'), false);
  assert.equal(
    nextState.turnState.enemyState.statuses.some((status) => Number(status.targetIndex) === 0),
    false
  );
});

test('applyBeforeCommitOperations warns when summon has no reusable enemy slot', () => {
  const state = createState({}, { enemyCount: MAX_ENEMY_COUNT });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha', 1: 'Beta', 2: 'Gamma' };
  state.turnState.enemyState.statuses = [];
  const warnings = [];

  const nextState = applyBeforeCommitOperations(
    state,
    [createSummonEnemyOperation()],
    {
      enemyCount: MAX_ENEMY_COUNT,
      onWarning: (message) => warnings.push(String(message)),
    }
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, MAX_ENEMY_COUNT);
  assert.deepEqual(nextState.turnState.enemyState.enemyNamesByEnemy, { 0: 'Alpha', 1: 'Beta', 2: 'Gamma' });
  assert.deepEqual(warnings, ['summon enemy ignored: no available enemy slot.']);
});
