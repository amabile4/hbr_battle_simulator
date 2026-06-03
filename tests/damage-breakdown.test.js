import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCriticalRateBreakdown,
  buildDamageBreakdown,
  calculateDamage,
  DAMAGE_BREAKDOWN_GROUPS,
  DAMAGE_RANDOM_FIXED_MULTIPLIER,
  loadDamageCalculationData,
} from '../src/index.js';

const MULTIPLIER_TOLERANCE = 1e-9;

function findGroup(target, dataGroup) {
  return target.groups.find((group) => group.dataGroup === dataGroup);
}

function assertAlmostEqual(actual, expected, label, tolerance = MULTIPLIER_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${label}: actual=${actual}, expected=${expected}`
  );
}

function createCalculatorInput(overrides = {}) {
  return {
    attacker: {
      characterId: 'DAMAGE_BREAKDOWN_MATCH_TEST',
      styleId: 1010103,
      tokenCount: 0,
      stats: {
        str: 675,
        dex: 675,
        wis: 675,
        spr: 675,
        luk: 675,
        con: 675,
      },
      statusEffects: [],
      ...(overrides.attacker ?? {}),
    },
    defender: {
      enemyId: 13000001,
      paramBorder: 770,
      destructionRate: 1,
      isHpTarget: true,
      resistances: { Stab: 1.5 },
      statusEffects: [],
      ...(overrides.defender ?? {}),
    },
    skill: {
      skillId: 46001107,
      name: '星火燎原',
      level: 10,
      ...(overrides.skill ?? {}),
    },
    activeZone: 'None',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['attacker', 'defender', 'skill'].includes(key))),
  };
}

function firstTargetBreakdown(input) {
  return buildDamageBreakdown(input).targetBreakdowns[0];
}

test('buildCriticalRateBreakdown totals selected critical sources and marks guaranteed critical', () => {
  const breakdown = buildCriticalRateBreakdown({
    activeStatusEffects: [
      { statusType: 'CriticalRateUp', power: 1.2, sourceSkillName: '会心の構え', remaining: 1 },
    ],
    markCriticalRateUp: 0.3,
    hasPenetrationCritical: true,
  });

  assert.equal(breakdown.criticalRatePercent, 250);
  assert.equal(breakdown.isCriticalGuaranteed, true);
  assert.deepEqual(
    breakdown.contributions.map((entry) => entry.label),
    ['クリティカル確率アップ', '固有マーク クリティカル率', '貫通クリティカル']
  );
});

test('buildDamageBreakdown returns official-category target-specific critical multipliers', () => {
  const breakdown = buildDamageBreakdown({
    effectiveDamageRatesByEnemy: { 0: 150, 1: 50 },
    attackReferencesByEnemy: {
      0: ['Slash', 'Fire'],
      1: ['Slash', 'Fire'],
    },
    affinityContributionsByEnemy: {
      0: [{ reference: 'Slash', label: '斬相性', multiplier: 1.5 }],
      1: [{ reference: 'Slash', label: '斬相性', multiplier: 0.5 }],
    },
    activeStatusEffects: [
      { statusType: 'AttackUp', power: 0.5, sourceSkillName: '攻撃支援', remaining: 1 },
      { statusType: 'CriticalDamageUp', power: 0.3, sourceSkillName: '会心支援', remaining: 1 },
    ],
    chargeEffects: [{ statusType: 'BuffCharge', power: 0.2, sourceSkillName: 'チャージ', remaining: 1 }],
    selectedMindEyeEffects: [{ statusType: 'MindEye', power: 0.5, sourceSkillName: '心眼', remaining: 1 }],
    funnelEffects: [
      { statusType: 'Funnel', power: 2, metadata: { damageBonus: 0.25 }, sourceSkillName: '連撃', remaining: 1 },
    ],
    enemyStatusEffects: [
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.4, remaining: 1, effectId: 1 },
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.3, remaining: 1, effectId: 2 },
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.1, remaining: 1, effectId: 3 },
      { targetIndex: 0, statusType: 'Fragile', power: 0.35, remaining: 1, effectId: 4 },
      { targetIndex: 0, statusType: 'ResistDown', elements: ['Fire'], power: 0.2, remaining: 1, effectId: 5 },
      { targetIndex: 1, statusType: 'Fragile', power: 0.35, remaining: 1, effectId: 6 },
    ],
    tokenAttackTokenCount: 5,
    tokenAttackRatePerToken: 0.16,
    tokenAttackTotalRate: 0.8,
    zoneType: 'Fire',
    zonePowerRate: 1.8,
    accessoryAttackUpRate: 0,
  });

  assert.equal(breakdown.version, 1);
  assert.equal(breakdown.randomMultiplier, DAMAGE_RANDOM_FIXED_MULTIPLIER);
  assert.equal(breakdown.targetBreakdowns.length, 2);
  assert.deepEqual(
    breakdown.targetBreakdowns[0].groups.map((group) => group.dataGroup),
    DAMAGE_BREAKDOWN_GROUPS.map((group) => group.dataGroup)
  );

  const weakTarget = breakdown.targetBreakdowns[0];
  const resistedTarget = breakdown.targetBreakdowns[1];
  assert.equal(findGroup(weakTarget, 'buff').multiplier, 3);
  assert.equal(findGroup(weakTarget, 'crit-mindeye').multiplier, 1.8);
  assert.equal(findGroup(weakTarget, 'funnel').multiplier, 1.5);
  assert.equal(findGroup(weakTarget, 'token-passive').multiplier, 1.8);
  assert.equal(findGroup(weakTarget, 'debuff').multiplier, 2.25);
  assert.equal(findGroup(weakTarget, 'affinity').multiplier, 1.5);
  assert.ok(weakTarget.finalMultiplier > resistedTarget.finalMultiplier);

  const debuffLabels = findGroup(weakTarget, 'debuff').contributions.map((entry) => entry.label);
  assert.deepEqual(debuffLabels, ['防御力ダウン', '防御力ダウン', '脆弱', '火属性耐性ダウン']);
  assert.equal(debuffLabels.includes('0.1'), false);
  assert.equal(findGroup(resistedTarget, 'debuff').contributions.some((entry) => entry.label === '脆弱'), false);
  assert.equal(findGroup(weakTarget, 'buff').contributions.some((entry) => entry.label === 'アクセサリ'), false);
  assert.equal(findGroup(weakTarget, 'buff').contributions.some((entry) => entry.label === '心眼'), true);
  assert.equal(findGroup(weakTarget, 'crit-mindeye').contributions.some((entry) => entry.label === '心眼'), false);
});

test('buildDamageBreakdown keeps enemy debuff adoption target-specific', () => {
  const breakdown = buildDamageBreakdown({
    effectiveDamageRatesByEnemy: { 0: 100, 1: 100 },
    enemyStatusEffects: [
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.5, remaining: 1, effectId: 1 },
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.4, remaining: 1, effectId: 2 },
      { targetIndex: 1, statusType: 'DefenseDown', power: 0.3, remaining: 1, effectId: 3 },
    ],
  });

  const target0 = breakdown.targetBreakdowns[0];
  const target1 = breakdown.targetBreakdowns[1];

  assert.deepEqual(
    findGroup(target0, 'debuff').contributions.map((entry) => entry.value),
    [0.5, 0.4]
  );
  assert.deepEqual(
    findGroup(target1, 'debuff').contributions.map((entry) => entry.value),
    [0.3]
  );
  assert.equal(findGroup(target1, 'debuff').multiplier, 1.3);
});

test('buildDamageBreakdown includes supported priority 1 modifiers without all ability down', () => {
  const breakdown = buildDamageBreakdown({
    effectiveDamageRatesByEnemy: { 0: 100, 1: 100 },
    foodBuffAttackUpRate: 0.5,
    highBoostSkillAtkRate: 1.8,
    damageRateUpPerTokenRate: 0.2,
    enemyAllAbilityDownByEnemy: {
      0: 30,
      1: 0,
    },
  });

  const target0 = breakdown.targetBreakdowns[0];
  const target1 = breakdown.targetBreakdowns[1];
  const buffLabels = findGroup(target0, 'buff').contributions.map((entry) => entry.label);
  const tokenPassiveLabels = findGroup(target0, 'token-passive').contributions.map((entry) => entry.label);
  const debuff = findGroup(target0, 'debuff');

  assert.equal(buffLabels.includes('食事バフ攻撃力'), true);
  assert.equal(buffLabels.includes('ハイブースト'), true);
  assert.equal(findGroup(target0, 'buff').multiplier, 3.3);
  assert.equal(tokenPassiveLabels.includes('トークン連動ダメージアップ'), true);
  assert.equal(findGroup(target0, 'token-passive').multiplier, 1.2);
  assert.equal(debuff.contributions.some((entry) => entry.label === '全能力ダウン'), false);
  assert.equal(debuff.multiplier, 1);
  assert.equal(findGroup(target1, 'debuff').contributions.some((entry) => entry.label === '全能力ダウン'), false);
});

test('buildDamageBreakdown adds defense down, element resist down, and fragile in one defense category', () => {
  const breakdown = buildDamageBreakdown({
    effectiveDamageRatesByEnemy: { 0: 150 },
    attackReferencesByEnemy: { 0: ['Fire'] },
    enemyStatusEffects: [
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.3, remaining: 1, effectId: 1 },
      { targetIndex: 0, statusType: 'ResistDown', elements: ['Fire'], power: 0.2, remaining: 1, effectId: 2 },
      { targetIndex: 0, statusType: 'Fragile', power: 0.35, remaining: 1, effectId: 3 },
    ],
  });

  const debuff = findGroup(breakdown.targetBreakdowns[0], 'debuff');
  assert.equal(debuff.multiplier, 1.85);
  assert.deepEqual(
    debuff.contributions.map((entry) => entry.label),
    ['防御力ダウン', '火属性耐性ダウン', '脆弱']
  );
});

test('buildDamageBreakdown matches calculateDamage for defense down plus fragile category', () => {
  const calculator = calculateDamage(
    createCalculatorInput({
      defender: {
        resistances: { Stab: 1.5 },
        statusEffects: [
          { statusType: 'DefenseDown', skillName: '防御力ダウン', category: 'NormalDefense', power: 30 },
          { statusType: 'Fragile', skillName: '脆弱', category: 'NormalFragile', power: 35 },
        ],
      },
    }),
    loadDamageCalculationData()
  );
  const breakdown = firstTargetBreakdown({
    effectiveDamageRatesByEnemy: { 0: 150 },
    attackReferencesByEnemy: { 0: ['Stab'] },
    enemyStatusEffects: [
      { targetIndex: 0, statusType: 'DefenseDown', power: 0.3, remaining: 1, effectId: 1 },
      { targetIndex: 0, statusType: 'Fragile', power: 0.35, remaining: 1, effectId: 2 },
    ],
  });

  assertAlmostEqual(
    findGroup(breakdown, 'debuff').multiplier,
    calculator.breakdown.debuffMultiplier,
    'debuffMultiplier'
  );
});

test('buildDamageBreakdown matches calculateDamage for MindEye on weakness skill attacks', () => {
  const calculator = calculateDamage(
    createCalculatorInput({
      attacker: {
        statusEffects: [{ statusType: 'MindEye', skillName: '心眼', power: 50 }],
      },
    }),
    loadDamageCalculationData()
  );
  const breakdown = firstTargetBreakdown({
    effectiveDamageRatesByEnemy: { 0: 150 },
    selectedMindEyeEffects: [{ statusType: 'MindEye', power: 0.5, sourceSkillName: '心眼', remaining: 1 }],
  });

  assertAlmostEqual(findGroup(breakdown, 'buff').multiplier, calculator.breakdown.buffMultiplier, 'buffMultiplier');
  assert.equal(findGroup(breakdown, 'buff').contributions.some((entry) => entry.label === '心眼'), true);
});

test('buildDamageBreakdown matches calculateDamage by excluding MindEye from weakness normal attacks', () => {
  const calculatorInput = createCalculatorInput({
    attacker: {
      statusEffects: [{ statusType: 'MindEye', skillName: '心眼', power: 50 }],
    },
    skill: {
      skillId: null,
      name: '通常攻撃',
      level: 10,
    },
  });
  const calculator = calculateDamage(calculatorInput, loadDamageCalculationData());
  const breakdown = firstTargetBreakdown({
    effectiveDamageRatesByEnemy: { 0: 150 },
    isNormalAttack: true,
    selectedMindEyeEffects: [{ statusType: 'MindEye', power: 0.5, sourceSkillName: '心眼', remaining: 1 }],
  });

  assertAlmostEqual(findGroup(breakdown, 'buff').multiplier, calculator.breakdown.buffMultiplier, 'buffMultiplier');
  assert.equal(findGroup(breakdown, 'buff').contributions.some((entry) => entry.label === '心眼'), false);
});
