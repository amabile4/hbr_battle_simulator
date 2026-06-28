import test from 'node:test';
import assert from 'node:assert/strict';

import { CharacterStyle, Party, createBattleStateFromParty } from '../src/index.js';
import {
  applyBeforeCommitOperations,
  canActivateKishinka,
  resolveAllOutAttackAvailability,
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
            parts: [{
              skill_type: 'PenetrationCriticalAttack',
              target_type: 'All',
              type: 'Slash',
              power: [20625, 41250],
              value: [3, 0],
              diff_for_max: 195,
              parameters: { str: 1, dex: 1 },
              multipliers: { dp: 1, hp: 1, dr: 6 },
            }],
            hits: [
              { id: 1, type: 'Main', power_ratio: 0.1 },
              { id: 2, type: 'Main', power_ratio: 0.1 },
              { id: 3, type: 'Main', power_ratio: 0.1 },
              { id: 4, type: 'Main', power_ratio: 0.1 },
              { id: 5, type: 'Main', power_ratio: 0.1 },
              { id: 6, type: 'Main', power_ratio: 0.5 },
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
  elements = [],
  roleAbility = null,
  skills = [],
  passives = [],
  stats = null,
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
    elements,
    roleAbility,
    skills,
    passives,
    stats,
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
        elements: override.elements ?? [],
        roleAbility: override.roleAbility ?? null,
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
        stats: override.stats ?? null,
      });
    })
  );
}

function createAllOutAttackSkill() {
  return {
    id: 46041001,
    label: 'EmaASkill51',
    name: '総攻撃',
    hit_count: 7,
    parts: [{
      skill_type: 'PenetrationCriticalAttack',
      target_type: 'All',
      type: 'Slash',
      power: [21997.5, 43995],
      value: [3, 0],
      diff_for_max: 198,
      parameters: { str: 1, dex: 1 },
      multipliers: { dp: 1, hp: 1, dr: 0 },
    }],
    hits: [
      { id: 1, power_ratio: 0.05 }, { id: 2, power_ratio: 0.05 },
      { id: 3, power_ratio: 0.05 }, { id: 4, power_ratio: 0.05 },
      { id: 5, power_ratio: 0.05 }, { id: 6, power_ratio: 0.05 },
      { id: 7, power_ratio: 0.7 },
    ],
  };
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
  eShield = null,
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
      ...(eShield ? { e_shield: structuredClone(eShield) } : {}),
      ...(Number.isInteger(targetEnemyIndex) ? { targetEnemyIndex } : {}),
    },
  };
}

function createEShieldState({
  current = 10,
  max = 10,
  elements = ['Light', 'Dark'],
  defUpRate = 5000,
  damageLimit = 0,
} = {}) {
  return {
    current,
    max,
    elements: [...elements],
    defUpRate,
    damageLimit,
  };
}

function createSetEnemyEShieldOperation({
  targetEnemyIndex = 0,
  eShieldState = createEShieldState(),
} = {}) {
  return {
    type: REPLAY_OPERATION_TYPES.SET_ENEMY_E_SHIELD,
    payload: {
      targetEnemyIndex,
      eShieldState: eShieldState ? structuredClone(eShieldState) : null,
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

test('魔界騎兵 uses party-average STR/DEX and applies damage and destruction to each enemy', () => {
  const state = createState({
    0: {
      characterId: 'BIYamawaki',
      styleId: MAKAI_KIHEI_STYLE_ID,
      passives: [createMakaiKiheiPassive()],
      stats: { str: 900, dex: 900, wis: 600, spr: 600, luk: 600, con: 600 },
    },
    1: { stats: { str: 600, dex: 600, wis: 600, spr: 600, luk: 600, con: 600 } },
    2: { stats: { str: 600, dex: 600, wis: 600, spr: 600, luk: 600, con: 600 } },
    3: { stats: { str: 600, dex: 600, wis: 600, spr: 600, luk: 600, con: 600 } },
    4: { stats: { str: 600, dex: 600, wis: 600, spr: 600, luk: 600, con: 600 } },
    5: { stats: { str: 600, dex: 600, wis: 600, spr: 600, luk: 600, con: 600 } },
  }, { enemyCount: 1 });
  state.turnState.enemyState.paramBorderByEnemy = { 0: 700 };
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Slash: 50 } };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 120 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 400 };
  state.turnState.enemyState.gaugeStateByEnemy = {
    0: { maxDp: 0, currentDp: 0, maxHp: 999999, currentHp: 999999 },
  };
  state.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
  ];

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }]
  );
  const event = nextState.turnState.specialOperationDamageEvents[0];

  assert.equal(event.referenceStat, 650);
  assert.equal(event.affinityMultiplier, 3);
  assert.ok(event.damage > 0);
  assert.equal(event.appliedHpDamage, event.damage);
  assert.equal(nextState.turnState.enemyState.damageTakenByEnemy['0'], event.damage);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
  assert.equal(nextState.turnState.odGauge, 15);
});

test('総攻撃 operation adds fixed destruction rate and OD without advancing turn resources', () => {
  const state = createState({
    0: { roleAbility: { name: '総攻撃', specialSkill: createAllOutAttackSkill() } },
  }, { odGauge: 280, enemyCount: 2 });
  state.turnState.holdUpActive = true;
  state.turnState.turnIndex = 4;
  state.turnState.sequenceId = 9;
  state.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
    { statusType: 'DownTurn', targetIndex: 1, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
  ];
  state.turnState.enemyState.destructionRateByEnemy = { 0: 150, 1: 210 };
  state.turnState.enemyState.gaugeStateByEnemy = {
    0: { maxDp: 0, currentDp: 0, maxHp: 999999, currentHp: 999999 },
    1: { maxDp: 0, currentDp: 0, maxHp: 999999, currentHp: 999999 },
  };
  const spBefore = state.party.map((member) => member.sp.current);

  assert.deepEqual(resolveAllOutAttackAvailability(state), {
    hasAbility: true,
    holdUpActive: true,
    allAliveEnemiesDownTurn: true,
    aliveEnemyCount: 2,
    available: true,
  });

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK }]
  );

  assert.equal(nextState.turnState.holdUpActive, false);
  assert.equal(nextState.turnState.odGauge, 300);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 250);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['1'], 310);
  assert.equal(nextState.turnState.specialOperationDamageEvents.length, 2);
  assert.ok(nextState.turnState.enemyState.damageTakenByEnemy['0'] > 0);
  assert.equal(nextState.turnState.turnIndex, 4);
  assert.equal(nextState.turnState.sequenceId, 9);
  assert.deepEqual(nextState.party.map((member) => member.sp.current), spBefore);
});

test('総攻撃 operation is ignored without role ability or all-down HOLD UP state', () => {
  const noAbilityState = createState({}, { odGauge: 10, enemyCount: 1 });
  noAbilityState.turnState.holdUpActive = true;
  noAbilityState.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
  ];

  const noAbilityNext = applyBeforeCommitOperations(
    noAbilityState,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK }]
  );
  assert.equal(noAbilityNext.turnState.odGauge, 10);
  assert.equal(noAbilityNext.turnState.holdUpActive, true);
  assert.equal(noAbilityNext.turnState.enemyState.destructionRateByEnemy['0'], undefined);

  const notAllDownState = createState({
    0: { roleAbility: { name: '総攻撃' } },
  }, { odGauge: 10, enemyCount: 2 });
  notAllDownState.turnState.holdUpActive = true;
  notAllDownState.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1, exitCond: 'PlayerTurnEnd' },
  ];

  const notAllDownNext = applyBeforeCommitOperations(
    notAllDownState,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_ALL_OUT_ATTACK }]
  );
  assert.equal(notAllDownNext.turnState.odGauge, 10);
  assert.equal(notAllDownNext.turnState.holdUpActive, true);
  assert.equal(notAllDownNext.turnState.enemyState.destructionRateByEnemy['0'], undefined);
});

test('applyBeforeCommitOperations applies Makai Kihei dark attack to matching Eシールド by hit count', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        elements: ['Dark'],
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 0, enemyCount: 2 }
  );
  state.turnState.enemyState.eShieldStateByEnemy = {
    0: createEShieldState({ current: 10, max: 10, elements: ['Dark'] }),
    1: createEShieldState({ current: 5, max: 5, elements: ['Fire'] }),
  };

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }],
    { enemyCount: 2 }
  );

  assert.equal(nextState.turnState.odGauge, 30);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 4,
    max: 10,
    elements: ['Dark'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['1'], {
    current: 5,
    max: 5,
    elements: ['Fire'],
    defUpRate: 5000,
    damageLimit: 0,
  });
});

test('applyBeforeCommitOperations breaks enemy when Makai Kihei depletes Eシールド', () => {
  const state = createState(
    {
      0: {
        characterId: 'BIYamawaki',
        characterName: '山脇・ボン・イヴァール',
        styleId: MAKAI_KIHEI_STYLE_ID,
        styleName: '誇り高き魔王の凱旋',
        elements: ['Dark'],
        passives: [createMakaiKiheiPassive()],
      },
    },
    { odGauge: 0, enemyCount: 1 }
  );
  state.turnState.enemyState.eShieldStateByEnemy = {
    0: createEShieldState({ current: 1, max: 5, elements: ['Dark'] }),
  };

  const nextState = applyBeforeCommitOperations(
    state,
    [{ type: REPLAY_OPERATION_TYPES.ACTIVATE_MAKAI_KIHEI }],
    { enemyCount: 1 }
  );

  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 0);
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
    ),
    true
  );
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

  const nextState = applyBeforeCommitOperations(
    state,
    [
      createSummonEnemyOperation({
        eShield: {
          count: 12,
          max: 12,
          elements: ['Fire', 'Light'],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
      }),
    ],
    {}
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.enemyState.enemyNamesByEnemy['1'], DEFAULT_SUMMON_SAMPLE_ENEMY.name);
  assert.equal(nextState.turnState.enemyState.paramBorderByEnemy['1'], 770);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['1'], 350);
  assert.equal(nextState.turnState.enemyState.damageRatesByEnemy['1'].Fire, 250);
  assert.deepEqual(nextState.turnState.enemyState.absorbElementsByEnemy['1'], ['fire']);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['1'], {
    current: 12,
    max: 12,
    elements: ['Fire', 'Light'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['1'], 100);
});

test('applyBeforeCommitOperations skips inactive summon Eシールド metadata', () => {
  const state = createState({}, { enemyCount: 1 });
  state.turnState.enemyState.enemyNamesByEnemy = { 0: 'Alpha' };

  const nextState = applyBeforeCommitOperations(
    state,
    [
      createSummonEnemyOperation({
        eShield: {
          count: 0,
          max: 0,
          elements: ['Fire', 'Light'],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
      }),
    ],
    {}
  );

  assert.equal(nextState.turnState.enemyState.enemyCount, 2);
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['1'], undefined);
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

test('applyBeforeCommitOperations updates only the targeted enemy Eシールド and preserves break state', () => {
  const state = createState({}, { enemyCount: 2 });
  state.turnState.enemyState.eShieldStateByEnemy = {
    0: createEShieldState({ current: 0, max: 30, elements: ['Light', 'Dark'] }),
    1: createEShieldState({ current: 12, max: 12, elements: ['Fire'] }),
  };
  state.turnState.enemyState.breakStateByEnemy = {
    0: { broken: true, superDown: false },
  };
  state.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2, exitCond: 'PlayerTurnEnd' },
  ];

  const nextState = applyBeforeCommitOperations(
    state,
    [createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: createEShieldState({ current: 45, max: 45, elements: ['Light', 'Dark'] }),
    })]
  );

  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 45,
    max: 45,
    elements: ['Light', 'Dark'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['1'], {
    current: 12,
    max: 12,
    elements: ['Fire'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.deepEqual(nextState.turnState.enemyState.breakStateByEnemy, {
    0: { broken: true, superDown: false },
  });
  assert.deepEqual(nextState.turnState.enemyState.statuses, [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2, exitCond: 'PlayerTurnEnd' },
  ]);
});

test('applyBeforeCommitOperations clears targeted enemy Eシールド when max is zero or elements are empty', () => {
  const state = createState({}, { enemyCount: 1 });
  state.turnState.enemyState.eShieldStateByEnemy = {
    0: createEShieldState({ current: 18, max: 30, elements: ['Light'] }),
  };

  const clearedByMax = applyBeforeCommitOperations(
    state,
    [createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: {
        current: 25,
        max: 0,
        elements: ['Light'],
        defUpRate: 5000,
        damageLimit: 0,
      },
    })]
  );
  assert.equal(clearedByMax.turnState.enemyState.eShieldStateByEnemy['0'], undefined);

  state.turnState.enemyState.eShieldStateByEnemy = {
    0: createEShieldState({ current: 18, max: 30, elements: ['Light'] }),
  };
  const clearedByElements = applyBeforeCommitOperations(
    state,
    [createSetEnemyEShieldOperation({
      targetEnemyIndex: 0,
      eShieldState: {
        current: 25,
        max: 30,
        elements: [],
        defUpRate: 5000,
        damageLimit: 0,
      },
    })]
  );
  assert.equal(clearedByElements.turnState.enemyState.eShieldStateByEnemy['0'], undefined);
});
