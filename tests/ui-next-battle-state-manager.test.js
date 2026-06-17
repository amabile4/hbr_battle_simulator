import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { getStore } from './helpers.js';

const AMON_OMEGA_LV2_ENEMY_ID = 13402714;
const AMON_OMEGA_LV2_BATTLE_INDEX = 461;
const AMON_OMEGA_LV2_DP_GAUGES = [1_216_800, 1_216_800, 1_216_800];
const NON_AMON_MULTI_DP_ENEMY_CASES = [
  {
    name: 'レイジングエクリプス',
    battleIndex: 77,
    selectedEnemyId: -8003313,
    dpGauges: [200_000, 200_000, 200_000, 200_000],
  },
  {
    name: 'ダイヤモンドアイS',
    battleIndex: 2699,
    selectedEnemyId: -8130503,
    dpGauges: [15_000, 40_000, 40_000, 40_000],
  },
];

function createPartySnapshot() {
  return {
    isFrontFilled: true,
    styleIds: [1005504, 1004107, 1001408, null, null, null],
    supportStyleIds: [null, null, null, null, null, null],
    limitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    supportLimitBreakLevelsByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    drivePierceByPartyIndex: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    skillSetsByPartyIndex: {},
  };
}

function createFullPartySnapshot() {
  return {
    ...createPartySnapshot(),
    styleIds: [1005504, 1004107, 1001408, 1001109, 1007106, 1003406],
  };
}

test('BattleStateManager maps enemy preemptiveField to initial zoneState before battle-start passives', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
    preemptiveField: 'thunder',
  });

  assert.equal(state.turnState.zoneState?.type, 'Thunder');
  assert.equal(state.turnState.zoneState?.sourceSide, 'enemy');
  assert.equal(state.turnState.zoneState?.remainingTurns, null);
});

test('BattleStateManager keeps initial zoneState null when enemy preemptiveField is none', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
    preemptiveField: 'none',
  });

  assert.equal(state.turnState.zoneState, null);
});

test('BattleStateManager applies enemy resistance percent, absorb elements, name, and max D cap to all enemies', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 2,
    selectedEnemyName: '敵テスト',
    param_border: 845,
    max_d_rate: 650,
    d_rate: 5,
    resistances: {
      element: {
        slash: 150,
        stab: 100,
        strike: 100,
        fire: 400,
        ice: 30,
        thunder: 100,
        light: 100,
        dark: 100,
        nonelement: 100,
      },
    },
    absorbElementList: ['fire', 'nonelement'],
  });

  assert.equal(state.turnState.enemyState.enemyNamesByEnemy['0'], '敵テスト');
  assert.equal(state.turnState.enemyState.enemyNamesByEnemy['1'], '敵テスト');
  assert.equal(state.turnState.enemyState.paramBorderByEnemy['0'], 845);
  assert.equal(state.turnState.enemyState.paramBorderByEnemy['1'], 845);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['0'].Fire, 400);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['0'].Ice, 30);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['1'].Slash, 150);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['0'], 650);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['1'], 650);
  // destructionMultiplierByEnemy は raw d_rate をそのまま格納（d_rate=5 → 5）
  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['0'], 5);
  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['1'], 5);
  assert.deepEqual(state.turnState.enemyState.absorbElementsByEnemy['0'], ['fire', 'nonelement']);
  assert.deepEqual(state.turnState.enemyState.absorbElementsByEnemy['1'], ['fire', 'nonelement']);
});

test('BattleStateManager wires enemy od_rate to odRateByEnemy for each enemy slot', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 3,
    od_rate: 8500,
  });

  assert.equal(state.turnState.enemyState.odRateByEnemy['0'], 8500);
  assert.equal(state.turnState.enemyState.odRateByEnemy['1'], 8500);
  assert.equal(state.turnState.enemyState.odRateByEnemy['2'], 8500);
});

test('BattleStateManager forwards ancient chain equip bonuses to party members', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(
    {
      ...createPartySnapshot(),
      chainEquipByPartyIndex: { 0: true, 1: false },
      startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    },
    { enemyCount: 1 }
  );

  assert.equal(state.party[0].chainSkillAttackUpRate, 0.1);
  assert.equal(state.party[0].chainDestructionRateBonus, 0.1);
  assert.equal(state.party[0].sp.current, 6);
  assert.equal(state.party[1].chainSkillAttackUpRate, 0);
  assert.equal(state.party[1].chainDestructionRateBonus, 0);
});

test('BattleStateManager forwards normalAttackElementsByPartyIndex into party members', () => {
  const manager = new BattleStateManager({ store: getStore() });
  const partySnapshot = createPartySnapshot();
  partySnapshot.normalAttackElementsByPartyIndex = {
    0: ['Ice'],
    2: ['Dark'],
  };

  const state = manager.buildFromSnapshot(partySnapshot, {
    enemyCount: 1,
  });

  assert.deepEqual(state.party[0].normalAttackElements, ['Ice']);
  assert.deepEqual(state.party[1].normalAttackElements, []);
  assert.deepEqual(state.party[2].normalAttackElements, ['Dark']);
});

test('BattleStateManager forwards compacted main and support stats into party members', () => {
  const manager = new BattleStateManager({ store: getStore() });
  const partySnapshot = createPartySnapshot();
  partySnapshot.supportStyleIds[0] = 1006506;
  partySnapshot.statsByPartyIndex = {
    0: {
      stats: { str: 650, dex: 670, wis: 600, spr: 610, luk: 620, con: 630 },
      supportStats: { str: 50, dex: 40, wis: 30, spr: 20, luk: 10, con: 5 },
    },
  };

  const state = manager.buildFromSnapshot(partySnapshot, { enemyCount: 1 });

  assert.equal(state.party[0].stats.str, 650);
  assert.equal(state.party[0].supportStats.str, 50);
  assert.equal(state.party[1].stats, null);
});

test('BattleStateManager ignores support stats without a support style', () => {
  const manager = new BattleStateManager({ store: getStore() });
  const partySnapshot = createPartySnapshot();
  partySnapshot.statsByPartyIndex = {
    0: {
      stats: { str: 650, dex: 670, wis: 600, spr: 610, luk: 620, con: 630 },
      supportStats: { str: 50, dex: 40, wis: 30, spr: 20, luk: 10, con: 5 },
    },
  };

  const state = manager.buildFromSnapshot(partySnapshot, { enemyCount: 1 });

  assert.equal(state.party[0].stats.str, 650);
  assert.equal(state.party[0].supportStats, null);
});

test('BattleStateManager sets odRateByEnemy to 0 when od_rate is 0 (no correction)', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
    od_rate: 0,
  });

  assert.equal(state.turnState.enemyState.odRateByEnemy['0'], 0);
});

test('BattleStateManager applies per-slot enemy setup when enemySlots are provided', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 7001,
        selectedEnemyName: '魔王ヤマワキ',
        param_border: 812,
        dp: 12345,
        od_rate: 8500,
        max_d_rate: 650,
        d_rate: 150,
        e_shield: {
          count: 10,
          max: 10,
          elements: ['Fire', 'Ice'],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
        resistances: {
          element: {
            slash: 120,
            stab: 100,
            strike: 100,
            fire: 200,
            ice: 90,
            thunder: 100,
            light: 100,
            dark: 100,
            nonelement: 100,
          },
        },
        absorbElementList: ['fire'],
      },
      {
        slotIndex: 1,
        selectedEnemyId: 7002,
        selectedEnemyName: '使い魔ブンゴ',
        param_border: 923,
        dp: 0,
        od_rate: 0,
        max_d_rate: 999,
        d_rate: 80,
        resistances: {
          element: {
            slash: 80,
            stab: 100,
            strike: 100,
            fire: 100,
            ice: 160,
            thunder: 100,
            light: 100,
            dark: 60,
            nonelement: 100,
          },
        },
        absorbElementList: ['ice', 'dark'],
      },
      {
        slotIndex: 2,
        selectedEnemyId: null,
      },
    ],
  });

  assert.equal(state.turnState.enemyState.enemyCount, 2);
  assert.equal(state.turnState.enemyState.enemyNamesByEnemy['0'], '魔王ヤマワキ');
  assert.equal(state.turnState.enemyState.enemyNamesByEnemy['1'], '使い魔ブンゴ');
  assert.equal(state.turnState.enemyState.paramBorderByEnemy['0'], 812);
  assert.equal(state.turnState.enemyState.paramBorderByEnemy['1'], 923);
  assert.equal(state.turnState.enemyState.enemyDpByEnemy['0'], 12345);
  assert.equal(state.turnState.enemyState.enemyDpByEnemy['1'], 0);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['0'], 650);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['1'], 999);
  // raw d_rate をそのまま格納（150, 80）
  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['0'], 150);
  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['1'], 80);
  assert.equal(state.turnState.enemyState.odRateByEnemy['0'], 8500);
  assert.equal(state.turnState.enemyState.odRateByEnemy['1'], 0);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['0'].Fire, 200);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['1'].Ice, 160);
  assert.deepEqual(state.turnState.enemyState.absorbElementsByEnemy['0'], ['fire']);
  assert.deepEqual(state.turnState.enemyState.absorbElementsByEnemy['1'], ['ice', 'dark']);
  assert.deepEqual(state.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 10,
    max: 10,
    elements: ['Fire', 'Ice'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.equal(state.turnState.enemyState.eShieldStateByEnemy['1'], undefined);
});

test('BattleStateManager resolves missing enemy slot dp from selected enemy master', () => {
  const store = Object.create(getStore());
  store.enemies = [];
  store.enemiesById = new Map([
    [
      13420081,
      {
        id: 13420081,
        base_param: {
          dp: 4550000,
          hp: 156000000,
          d_rate: 10,
        },
      },
    ],
  ]);
  const manager = new BattleStateManager({ store });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 13420081,
        selectedEnemyName: '異時層 スカルフェザー 最終形態',
        param_border: 500,
      },
    ],
  });

  assert.equal(state.turnState.enemyState.enemyDpByEnemy['0'], 4550000);
  assert.equal(state.turnState.enemyState.enemyHpByEnemy['0'], 156000000);
  // raw d_rate=10 をそのまま格納
  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['0'], 10);
});

test('BattleStateManager maps selected アモンΩ Lv.2 battle eg.dp gauges into enemy DP state', () => {
  const battlesPath = path.resolve('json/battles.json');
  const battles = JSON.parse(fs.readFileSync(battlesPath, 'utf8'));
  const amonOmegaBattleEnemy = battles[AMON_OMEGA_LV2_BATTLE_INDEX]?.enemy_list?.[0];
  assert.equal(amonOmegaBattleEnemy?.name, 'アモンΩ : Lv.2');
  assert.deepEqual(amonOmegaBattleEnemy?.base_param?.eg?.dp, AMON_OMEGA_LV2_DP_GAUGES);

  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: AMON_OMEGA_LV2_ENEMY_ID,
        selectedEnemyName: 'アモンΩ : Lv.2',
      },
    ],
  });

  assert.equal(state.turnState.enemyState.enemyNamesByEnemy['0'], 'アモンΩ : Lv.2');
  assert.equal(state.turnState.enemyState.enemyDpByEnemy['0'], 1_216_800);
  assert.equal(state.turnState.enemyState.remainingDpByEnemy, null);
  assert.deepEqual(state.turnState.enemyState.extraDpGaugeStateByEnemy['0'], {
    total: 3,
    remaining: 3,
    values: AMON_OMEGA_LV2_DP_GAUGES,
  });
});

for (const enemyCase of NON_AMON_MULTI_DP_ENEMY_CASES) {
  test(`BattleStateManager maps selected ${enemyCase.name} battle eg.dp gauges into enemy DP state`, () => {
    const battlesPath = path.resolve('json/battles.json');
    const battles = JSON.parse(fs.readFileSync(battlesPath, 'utf8'));
    const battleEnemy = battles[enemyCase.battleIndex]?.enemy_list?.[0];
    assert.equal(battleEnemy?.name, enemyCase.name);
    assert.deepEqual(battleEnemy?.base_param?.eg?.dp, enemyCase.dpGauges);

    const manager = new BattleStateManager({ store: getStore() });

    const state = manager.buildFromSnapshot(createPartySnapshot(), {
      enemySlots: [
        {
          slotIndex: 0,
          selectedEnemyId: enemyCase.selectedEnemyId,
          selectedEnemyName: enemyCase.name,
        },
      ],
    });

    assert.equal(state.turnState.enemyState.enemyNamesByEnemy['0'], enemyCase.name);
    assert.equal(state.turnState.enemyState.enemyDpByEnemy['0'], enemyCase.dpGauges[0]);
    assert.equal(state.turnState.enemyState.remainingDpByEnemy, null);
    assert.deepEqual(state.turnState.enemyState.extraDpGaugeStateByEnemy['0'], {
      total: enemyCase.dpGauges.length,
      remaining: enemyCase.dpGauges.length,
      values: enemyCase.dpGauges,
    });
  });
}

test('BattleStateManager defaults missing selected enemy d_rate to raw 5', () => {
  const store = Object.create(getStore());
  store.enemies = [];
  store.enemiesById = new Map([
    [
      990001,
      {
        id: 990001,
        base_param: {
          dp: 1000,
          hp: 2000,
        },
      },
    ],
  ]);
  const manager = new BattleStateManager({ store });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 990001,
        selectedEnemyName: 'd_rate欠損敵',
      },
    ],
  });

  assert.equal(state.turnState.enemyState.destructionMultiplierByEnemy['0'], 5);
});

test('BattleStateManager ignores inactive Eシールド definitions in enemy slots', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 7001,
        selectedEnemyName: '無効Eシールド敵A',
        e_shield: {
          count: 0,
          max: 0,
          elements: ['Light'],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
      },
      {
        slotIndex: 1,
        selectedEnemyId: 7002,
        selectedEnemyName: '無効Eシールド敵B',
        e_shield: {
          count: 10,
          max: 10,
          elements: [],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
      },
    ],
  });

  assert.equal(state.turnState.enemyState.eShieldStateByEnemy['0'], undefined);
  assert.equal(state.turnState.enemyState.eShieldStateByEnemy['1'], undefined);
});

test('BattleStateManager maps enemy extra_hp_gauge into extraHpGaugeStateByEnemy', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 7101,
        selectedEnemyName: '多重ゲージ敵',
        extra_hp_gauge: {
          total: 3,
          remaining: 2,
          values: [40400000, 40400000, 40400000],
        },
      },
    ],
  });

  assert.deepEqual(state.turnState.enemyState.extraHpGaugeStateByEnemy['0'], {
    total: 3,
    remaining: 2,
    values: [40400000, 40400000, 40400000],
  });
});

test('BattleStateManager preserves sparse enemy slot indexes for Eシールド and extra HP gauge', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 7101,
        selectedEnemyName: '通常敵',
      },
      {
        slotIndex: 1,
        selectedEnemyId: 7102,
        selectedEnemyName: '特殊ゲージ敵',
        e_shield: {
          count: 12,
          max: 12,
          elements: ['Fire'],
          def_up_rate: 5000,
          dmg_limit: 0,
        },
        extra_hp_gauge: {
          total: 2,
          remaining: 2,
          values: [100, 200],
        },
      },
    ],
  });

  assert.equal(state.turnState.enemyState.eShieldStateByEnemy['0'], undefined);
  assert.deepEqual(state.turnState.enemyState.eShieldStateByEnemy['1'], {
    current: 12,
    max: 12,
    elements: ['Fire'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.equal(state.turnState.enemyState.extraHpGaugeStateByEnemy['0'], undefined);
  assert.deepEqual(state.turnState.enemyState.extraHpGaugeStateByEnemy['1'], {
    total: 2,
    remaining: 2,
    values: [100, 200],
  });
});

test('BattleStateManager preserves stage-specific Eシールド values', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      {
        slotIndex: 0,
        selectedEnemyId: 7102,
        selectedEnemyName: '段階Eシールド敵',
        e_shield: {
          count: 30,
          max: 30,
          maxByStage: [30, 35, 40],
          elements: ['Fire', 'Light', 'Dark'],
          def_up_rate: 9900,
          dmg_limit: 0,
        },
      },
    ],
  });

  assert.deepEqual(state.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 30,
    max: 30,
    maxByStage: [30, 35, 40],
    elements: ['Fire', 'Light', 'Dark'],
    defUpRate: 9900,
    damageLimit: 0,
  });
});

test('BattleStateManager falls back to one enemy when all enemy slots are unselected', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const state = manager.buildFromSnapshot(createPartySnapshot(), {
    enemySlots: [
      { slotIndex: 0, selectedEnemyId: null },
      { slotIndex: 1, selectedEnemyId: null },
      { slotIndex: 2, selectedEnemyId: null },
    ],
  });

  assert.equal(state.turnState.enemyState.enemyCount, 1);
  assert.equal(state.turnState.enemyState.odRateByEnemy['0'], 0);
});

test('BattleStateManager applies stageSetup initial OD/SP bonus and initial status effects', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const baseState = manager.buildFromSnapshot(createPartySnapshot(), {
    enemyCount: 1,
  });
  const stagedState = manager.buildFromSnapshot(
    {
      ...createPartySnapshot(),
      stageSetup: {
        initialOdGauge: -300,
        initialSpBonusAll: 5,
        initialStatusEffects: [
          {
            scope: 'all',
            statusType: 'DefenseUp',
            power: 0.3,
            remaining: 3,
            exitCond: 'PlayerTurnEnd',
          },
          {
            scope: 'all',
            statusType: 'DebuffGuard',
            remaining: 1,
            limitType: 'Count',
            exitCond: 'Count',
          },
        ],
      },
    },
    {
      enemyCount: 1,
    }
  );

  assert.equal(
    Number(stagedState.turnState.odGauge) - Number(baseState.turnState.odGauge),
    -300,
  );

  for (let index = 0; index < 3; index += 1) {
    const baseMember = baseState.party[index];
    const stagedMember = stagedState.party[index];
    assert.equal(
      Number(stagedMember.sp.current) - Number(baseMember.sp.current),
      5,
      `partyIndex=${index} should gain +5 initial SP from stageSetup`
    );
    assert.equal(
      stagedMember.statusEffects.some((effect) => String(effect?.statusType ?? '') === 'DefenseUp'),
      true,
      `partyIndex=${index} should include DefenseUp from stageSetup`
    );
    assert.equal(
      stagedMember.statusEffects.some((effect) => String(effect?.statusType ?? '') === 'DebuffGuard'),
      true,
      `partyIndex=${index} should include DebuffGuard from stageSetup`
    );
  }
});

test('BattleStateManager appends Stage Setup passive log events for initial battle-start and T1 turn-start effects', () => {
  const manager = new BattleStateManager({ store: getStore() });

  const stagedState = manager.buildFromSnapshot(
    {
      ...createFullPartySnapshot(),
      stageSetup: {
        initialOdGauge: 100,
        initialSpBonusAll: 5,
        turnlyOdGauge: 10,
        turnlySpFront: 1,
      },
    },
    {
      enemyCount: 1,
    }
  );

  const passiveEvents = stagedState.turnState.passiveEventsLastApplied.filter(
    (event) => String(event?.sourceType ?? '') === 'stage_setup'
  );

  assert.equal(
    passiveEvents.some(
      (event) =>
        event.timing === 'OnBattleStart' &&
        event.passiveDesc === '戦闘開始時SP+5' &&
        Number(event.spDelta ?? 0) === 30
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.timing === 'OnBattleStart' &&
        event.passiveDesc === '戦闘開始時ODゲージ+100%' &&
        Number(event.odGaugeDelta ?? 0) === 100
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === '毎ターン前衛のSP+1' &&
        Number(event.spDelta ?? 0) === 3
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === '毎ターンOD+10%' &&
        Number(event.odGaugeDelta ?? 0) === 10
    ),
    true
  );
});

  test('BattleStateManager stores stageSetupTurnly from snapshot stageSetup in battle state', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const partySnapshot = createPartySnapshot();
    partySnapshot.stageSetup = {
      turnlyOdGauge: -10,
      turnlySpAll: 2,
      turnlySpFront: 5,
      turnlySpBack: -3,
    };

    const state = manager.buildFromSnapshot(partySnapshot, {
      enemyCount: 1,
    });

    assert.equal(state.stageSetupTurnly?.odGauge, -10);
    assert.equal(state.stageSetupTurnly?.spAll, 2);
    assert.equal(state.stageSetupTurnly?.spFront, 5);
    assert.equal(state.stageSetupTurnly?.spBack, -3);
  });

  test('BattleStateManager applies stageSetup turnly OD once to the initial T1 gauge', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const baseState = manager.buildFromSnapshot(
      {
        ...createPartySnapshot(),
        stageSetup: {
          initialOdGauge: 100,
        },
      },
      {
        enemyCount: 1,
      }
    );
    const stagedState = manager.buildFromSnapshot(
      {
        ...createPartySnapshot(),
        stageSetup: {
          initialOdGauge: 100,
          turnlyOdGauge: 10,
        },
      },
      {
        enemyCount: 1,
      }
    );

    assert.equal(Number(stagedState.turnState.odGauge) - Number(baseState.turnState.odGauge), 10);
  });

  test('BattleStateManager applies stageSetup turnly SP to the initial T1 state', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const baseState = manager.buildFromSnapshot(createFullPartySnapshot(), {
      enemyCount: 1,
    });
    const stagedState = manager.buildFromSnapshot(
      {
        ...createFullPartySnapshot(),
        stageSetup: {
          turnlySpAll: 2,
          turnlySpFront: 1,
          turnlySpBack: -1,
        },
      },
      {
        enemyCount: 1,
      }
    );

    for (let index = 0; index < 3; index += 1) {
      assert.equal(
        Number(stagedState.party[index].sp.current) - Number(baseState.party[index].sp.current),
        3,
        `front partyIndex=${index} should gain +3 on T1 from turnly SP`
      );
    }
    for (let index = 3; index < 6; index += 1) {
      assert.equal(
        Number(stagedState.party[index].sp.current) - Number(baseState.party[index].sp.current),
        1,
        `back partyIndex=${index} should gain +1 on T1 from turnly SP`
      );
    }
  });

  test('BattleStateManager applies T1 negative-SP stage setup recovery only to matching front/back members', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const baseSnapshot = {
      ...createFullPartySnapshot(),
      startSpEquipByPartyIndex: { 0: -10, 1: 3, 2: 3, 3: -9, 4: 3, 5: 3 },
    };
    const baseState = manager.buildFromSnapshot(baseSnapshot, {
      enemyCount: 1,
    });
    const stagedState = manager.buildFromSnapshot(
      {
        ...baseSnapshot,
        stageSetup: {
          enchantEffects: [
            { effectType: 'turnStartSpIfNegativeSp', scope: 'front', amount: 2 },
            { effectType: 'turnStartSpIfNegativeSp', scope: 'back', amount: 2 },
          ],
        },
      },
      {
        enemyCount: 1,
      }
    );

    assert.equal(
      Number(stagedState.party[0].sp.current) - Number(baseState.party[0].sp.current),
      2,
      'front negative-SP member should gain +2 on T1'
    );
    assert.equal(
      Number(stagedState.party[3].sp.current) - Number(baseState.party[3].sp.current),
      2,
      'back negative-SP member should gain +2 on T1'
    );
    for (const index of [1, 2, 4, 5]) {
      assert.equal(
        Number(stagedState.party[index].sp.current) - Number(baseState.party[index].sp.current),
        0,
        `partyIndex=${index} should not gain conditional T1 recovery`
      );
    }
  });

  test('BattleStateManager stores stageSetupEnchantEffects from snapshot stageSetup in battle state', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const partySnapshot = createPartySnapshot();
    partySnapshot.stageSetup = {
      enchantEffects: [
        { effectType: 'spOnEnemyKill', scope: 'all', amount: 1 },
        { effectType: 'spOnEnemyKill', scope: 'all', amount: 2 },
        { effectType: 'odGaugeGainBonusPercent', amount: 20 },
      ],
    };

    const state = manager.buildFromSnapshot(partySnapshot, {
      enemyCount: 1,
    });

    assert.deepEqual(state.stageSetupEnchantEffects, [
      { effectType: 'odGaugeGainBonusPercent', amount: 20 },
      { effectType: 'spOnEnemyKill', scope: 'all', amount: 3 },
    ]);
  });

  test('BattleStateManager handles missing stageSetup turnly SP fields with zero defaults', () => {
    const manager = new BattleStateManager({ store: getStore() });

    const state = manager.buildFromSnapshot(createPartySnapshot(), { 
      enemyCount: 1,
      // No turnly SP fields provided
    });

    assert.equal(state.stageSetupTurnly?.odGauge, 0);
    assert.equal(state.stageSetupTurnly?.spAll, 0);
    assert.equal(state.stageSetupTurnly?.spFront, 0);
    assert.equal(state.stageSetupTurnly?.spBack, 0);
    assert.deepEqual(state.stageSetupEnchantEffects, []);
  });
