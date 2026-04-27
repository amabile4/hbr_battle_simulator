import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { getStore } from './helpers.js';

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
    max_d_rate: 650,
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
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['0'].Fire, 400);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['0'].Ice, 30);
  assert.equal(state.turnState.enemyState.damageRatesByEnemy['1'].Slash, 150);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['0'], 650);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['1'], 650);
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
        od_rate: 8500,
        max_d_rate: 650,
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
        od_rate: 0,
        max_d_rate: 999,
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
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['0'], 650);
  assert.equal(state.turnState.enemyState.destructionRateCapByEnemy['1'], 999);
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
