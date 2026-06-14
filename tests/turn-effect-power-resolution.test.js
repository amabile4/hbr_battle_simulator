import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CharacterStyle,
  Party,
  commitTurn,
  createBattleStateFromParty,
  previewTurn,
} from '../src/index.js';

function assertAlmostEqual(actual, expected, message) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function createSkill({ id, name, targetType = 'Self', parts, hitCount = 1, spCost = 0 }) {
  return {
    id,
    name,
    label: name,
    sp_cost: spCost,
    target_type: targetType,
    hit_count: hitCount,
    hitCount,
    parts,
  };
}

function createProtectionSkill(id) {
  return createSkill({
    id,
    name: `Protection ${id}`,
    parts: [{ skill_type: 'Protection', target_type: 'Self' }],
  });
}

function createStats(overrides = {}) {
  return { str: 1, dex: 1, con: 1, spr: 1, wis: 1, luk: 1, ...overrides };
}

function createParty(actorOverrides = {}) {
  const members = Array.from({ length: 6 }, (_, index) => {
    const isActor = index === 0;
    return new CharacterStyle({
      characterId: isActor ? 'EFF1' : `EFF${index + 1}`,
      characterName: isActor ? 'Effect Tester' : `Member ${index + 1}`,
      styleId: 9100 + index,
      styleName: isActor ? 'Effect Style' : `Style ${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 20,
      role: 'Attacker',
      weaponType: 'Slash',
      stats: createStats(),
      skills: [createProtectionSkill(9900 + index)],
      passives: [],
      ...(isActor ? actorOverrides : {}),
    });
  });
  return new Party(members);
}

function commitSingleActorSkill(state, skillId, extraAction = {}) {
  const preview = previewTurn(state, {
    0: { characterId: 'EFF1', skillId, ...extraAction },
  });
  return commitTurn(state, preview).committedRecord.actions[0];
}

const effectPowerPart = {
  skill_type: 'AttackUp',
  target_type: 'Self',
  power: [0.1, 0.2],
  growth: [0, 0],
  diff_for_max: 100,
  parameters: { wis: 1 },
  effect: { limitType: 'Only', exitCond: 'Count', exitVal: [1, 0] },
};

test('active buff effect power resolves from actor stats and keeps fixed parts unchanged', () => {
  const skill = createSkill({
    id: 9910,
    name: 'Stat AttackUp',
    parts: [effectPowerPart],
  });
  const lowState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 50 }),
    skills: [skill],
  }));
  const lowAction = commitSingleActorSkill(lowState, 9910);
  assertAlmostEqual(lowAction.statusEffectsApplied[0].power, 0.15, 'low stat resolves on linear curve');

  const highState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 150 }),
    skills: [skill],
  }));
  const highAction = commitSingleActorSkill(highState, 9910);
  assertAlmostEqual(highAction.statusEffectsApplied[0].power, 0.202, 'over cap applies +0.0002 growth');

  const fixedSkill = createSkill({
    id: 9911,
    name: 'Fixed AttackUp',
    parts: [{ ...effectPowerPart, diff_for_max: 0 }],
  });
  const fixedState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 150 }),
    skills: [fixedSkill],
  }));
  const fixedAction = commitSingleActorSkill(fixedState, 9911);
  assertAlmostEqual(fixedAction.statusEffectsApplied[0].power, 0.1, 'fixed part keeps power[0]');
});

test('Funnel hit count resolves variable power from actor stats and clamps at max count', () => {
  const skill = createSkill({
    id: 9916,
    name: 'Variable Funnel',
    parts: [
      {
        skill_type: 'Funnel',
        target_type: 'Self',
        power: [2, 3],
        value: [0.25, 0],
        growth: [0, 0],
        diff_for_max: 10000,
        parameters: { wis: 1 },
        effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
      },
    ],
  });

  const lowState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 1 }),
    skills: [skill],
  }));
  const lowCommit = commitTurn(lowState, previewTurn(lowState, {
    0: { characterId: 'EFF1', skillId: 9916 },
  }));
  assert.equal(lowCommit.nextState.party[0].getFunnelEffects({ activeOnly: true })[0]?.power, 2);
  assert.equal(lowCommit.committedRecord.actions[0].funnelApplied[0]?.hitBonus, 2);

  const highState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 12000 }),
    skills: [skill],
  }));
  const highCommit = commitTurn(highState, previewTurn(highState, {
    0: { characterId: 'EFF1', skillId: 9916 },
  }));
  assert.equal(highCommit.nextState.party[0].getFunnelEffects({ activeOnly: true })[0]?.power, 3);
  assert.equal(highCommit.committedRecord.actions[0].funnelApplied[0]?.hitBonus, 3);
});

test('HighBoost scales active buff after stat based power resolution', () => {
  const skill = createSkill({
    id: 9912,
    name: 'HighBoosted AttackUp',
    parts: [effectPowerPart],
  });
  const state = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 100 }),
    skills: [skill],
    statusEffects: [
      {
        statusType: 'HighBoost',
        attackBuffMultiplier: 1.2,
        debuffMultiplier: 1.2,
        skillAttackRate: 1.8,
        exitCond: 'Eternal',
        remaining: 0,
      },
    ],
  }));
  const action = commitSingleActorSkill(state, 9912);
  assertAlmostEqual(action.statusEffectsApplied[0].power, 0.24, 'HighBoost applies after resolved max power');
});

test('enemy debuff effect power resolves per target enemy border and skips duration statuses', () => {
  const debuffPart = {
    skill_type: 'DefenseDown',
    target_type: 'Single',
    power: [0.3, 0.45],
    growth: [0, 0],
    diff_for_max: 100,
    parameters: { wis: 1 },
    effect: { limitType: 'Only', exitCond: 'EnemyTurnEnd', exitVal: [1, 0] },
  };
  const debuffSkill = createSkill({
    id: 9920,
    name: 'Border DefenseDown',
    targetType: 'Single',
    parts: [debuffPart],
  });
  const state = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 700 }),
    skills: [debuffSkill],
  }));
  state.turnState.enemyState.enemyCount = 3;
  state.turnState.enemyState.paramBorderByEnemy = { 0: 750, 1: 650, 2: 550 };

  const belowMin = commitSingleActorSkill(state, 9920, { targetEnemyIndex: 0 });
  assertAlmostEqual(belowMin.enemyStatusChanges[0].power, 0.3, 'below min border uses min power');

  const linear = commitSingleActorSkill(state, 9920, { targetEnemyIndex: 1 });
  assertAlmostEqual(linear.enemyStatusChanges[0].power, 0.375, 'linear border uses target border');

  const overCap = commitSingleActorSkill(state, 9920, { targetEnemyIndex: 2 });
  assertAlmostEqual(overCap.enemyStatusChanges[0].power, 0.4725, 'over cap border applies debuff growth');

  const durationSkill = createSkill({
    id: 9921,
    name: 'Duration Misfortune',
    targetType: 'Single',
    parts: [
      {
        skill_type: 'Misfortune',
        target_type: 'Single',
        power: [3, 0],
        diff_for_max: 100,
        parameters: { wis: 1 },
        effect: { limitType: 'Only', exitCond: 'EnemyTurnEnd' },
      },
    ],
  });
  const durationState = createBattleStateFromParty(createParty({
    stats: createStats({ wis: 999 }),
    skills: [durationSkill],
  }));
  durationState.turnState.enemyState.enemyCount = 1;
  const durationAction = commitSingleActorSkill(durationState, 9921, { targetEnemyIndex: 0 });
  assert.equal(durationAction.enemyStatusChanges[0].remainingTurns, 3);
  assert.equal(durationAction.enemyStatusChanges[0].power, 3);
});

test('DestructionUp stored as ratio is converted to core percent at destruction calculation input', () => {
  const attackSkill = createSkill({
    id: 9930,
    name: 'DR Attack',
    targetType: 'EnemySingle',
    spCost: 10,
    parts: [{ skill_type: 'AttackSkill', target_type: 'EnemySingle', type: 'Slash', multipliers: { dr: 10 } }],
  });
  const state = createBattleStateFromParty(createParty({
    skills: [attackSkill],
    statusEffects: [{ statusType: 'DestructionUp', power: 0.2 }],
  }));
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 500 };
  // d_rate=1 を明示 (旧デフォルト100/100=1.0 と同等のraw値)
  state.turnState.enemyState.destructionMultiplierByEnemy = { 0: 1 };

  const preview = previewTurn(state, {
    0: {
      characterId: 'EFF1',
      skillId: 9930,
      targetEnemyIndex: 0,
      manualBreakEnemyIndexes: [0],
    },
  });
  const { nextState } = commitTurn(state, preview);
  const updatedRate = Number(nextState.turnState.enemyState.destructionRateByEnemy?.[0] ?? 0);
  // 正式式では d_rate=1, 1hit, dr=10 の基礎上昇は 1.25%。
  // DestructionUp 0.2 は core へ 20% として渡され、1.25% * 1.2 = 1.5% 加算になる。
  assertAlmostEqual(updatedRate, 101.5, 'DestructionUp ratio is passed to core as percent');
});
