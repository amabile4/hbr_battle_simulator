import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCriticalRateBreakdown,
  buildDamageBreakdown,
  DAMAGE_BREAKDOWN_GROUPS,
  DAMAGE_RANDOM_FIXED_MULTIPLIER,
} from '../src/index.js';

function findGroup(target, dataGroup) {
  return target.groups.find((group) => group.dataGroup === dataGroup);
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

test('buildDamageBreakdown returns seven grouped target-specific critical multipliers', () => {
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
  assert.equal(findGroup(weakTarget, 'buff').multiplier, 2.5);
  assert.equal(findGroup(weakTarget, 'crit-mindeye').multiplier, 2.3);
  assert.equal(findGroup(weakTarget, 'funnel').multiplier, 1.5);
  assert.equal(findGroup(weakTarget, 'token-passive').multiplier, 1.8);
  assert.equal(findGroup(weakTarget, 'debuff').multiplier, 2.05);
  assert.equal(findGroup(weakTarget, 'resist-down').multiplier, 1.2);
  assert.equal(findGroup(weakTarget, 'affinity').multiplier, 1.5);
  assert.ok(weakTarget.finalMultiplier > resistedTarget.finalMultiplier);

  const debuffLabels = findGroup(weakTarget, 'debuff').contributions.map((entry) => entry.label);
  assert.deepEqual(debuffLabels, ['防御力ダウン', '防御力ダウン', '脆弱']);
  assert.equal(debuffLabels.includes('0.1'), false);
  assert.equal(findGroup(resistedTarget, 'debuff').contributions.some((entry) => entry.label === '脆弱'), false);
  assert.equal(findGroup(weakTarget, 'buff').contributions.some((entry) => entry.label === 'アクセサリ'), false);
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

test('buildDamageBreakdown includes priority 1 modifiers: food buff, high boost, damage rate up per token, all ability down', () => {
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
  assert.deepEqual(
    debuff.contributions.map((entry) => [entry.label, entry.value]),
    [['全能力ダウン', 0.3]]
  );
  assert.equal(debuff.multiplier, 1.3);
  assert.equal(findGroup(target1, 'debuff').contributions.some((entry) => entry.label === '全能力ダウン'), false);
});
