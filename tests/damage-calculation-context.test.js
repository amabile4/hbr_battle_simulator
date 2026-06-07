import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDamageCalculationContext } from '../src/index.js';

test('buildDamageCalculationContext applies defaults and null-safe target enemy normalization', () => {
  const context = buildDamageCalculationContext({
    actorCharacterId: 101,
    actorStyleId: '42',
    skillId: '5601',
    skillLabel: 99,
    skillName: null,
    targetType: undefined,
    targetEnemyIndex: undefined,
  });

  assert.deepEqual(context, {
    actorCharacterId: '101',
    actorStyleId: 42,
    skillId: 5601,
    skillLabel: '99',
    skillName: '',
    targetType: '',
    isNormalAttack: false,
    enemyCount: 1,
    targetEnemyIndex: null,
    baseHitCount: 0,
    funnelHitBonus: 0,
    effectiveHitCountPerEnemy: 0,
    effectiveHitCountTotal: 0,
    eligibleEnemyIndexes: [],
    effectiveDamageRatesByEnemy: {},
    enemyParamBorderByEnemy: {},
    enemyDpByEnemy: {},
    enemyNamesByEnemy: {},
    destructionRateByEnemy: {},
    activeStatusEffects: [],
    chargeEffects: [],
    enemyStatusEffects: [],
    attackReferencesByEnemy: {},
    affinityContributionsByEnemy: {},
    enemyTalismanLevelByEnemy: {},
    enemyDisasterLevelByEnemy: {},
    enemyAllAbilityDownByEnemy: {},
    tokenAttackTokenCount: 0,
    tokenAttackRatePerToken: 0,
    tokenAttackTotalRate: 0,
    attackByOwnDpRateStartDpRate: 0,
    attackByOwnDpRateReferenceDpRate: 0,
    attackByOwnDpRateLowDpMultiplier: 0,
    attackByOwnDpRateHighDpMultiplier: 0,
    attackByOwnDpRateResolvedMultiplier: 0,
    highBoostSkillAtkRate: 0,
    attackUpRate: 0,
    defenseUpRate: 0,
    criticalRateUpRate: 0,
    criticalDamageUpRate: 0,
    damageRateUpPerTokenRate: 0,
    babiedSkillAttackUpRate: 0,
    babiedOdGaugeGainUpRate: 0,
    divaSkillAttackUpRate: 0,
    foodBuffAttackUpRate: 0,
    foodBuffHealDpByDamageRate: 0,
    markAttackUpRate: 0,
    markDamageTakenDownRate: 0,
    markDestructionRateGainBonusRate: 0,
    markCriticalRateUp: 0,
    markCriticalDamageUp: 0,
    accessoryAttackUpRate: 0,
    accessoryContributions: [],
    overDrivePointUpByTokenPerToken: 0,
    overDrivePointUpByTokenTokenCount: 0,
    overDrivePointUpByTokenTotalPercent: 0,
    zoneType: '',
    zonePowerRate: 0,
    hasPenetrationCritical: false,
    selectedMindEyeEffects: [],
    criticalRateBreakdown: null,
    damageBreakdown: null,
    funnelEffects: [],
  });
});

test('buildDamageCalculationContext filters enemy indexes and coerces damage rate map values', () => {
  const context = buildDamageCalculationContext({
    enemyCount: '3',
    targetEnemyIndex: '2',
    eligibleEnemyIndexes: ['0', 1, -1, 2.5, 'x', 4],
    effectiveDamageRatesByEnemy: {
      0: '125',
      1: null,
      2: 'bad',
    },
    enemyParamBorderByEnemy: {
      0: '812',
      1: null,
      2: 'bad',
    },
    enemyDpByEnemy: {
      0: '4550000',
      1: null,
      2: 'bad',
    },
    enemyNamesByEnemy: {
      0: '敵A',
      1: null,
      2: ' 敵C ',
    },
    destructionRateByEnemy: {
      0: '150',
      1: null,
      2: 'bad',
    },
    enemyTalismanLevelByEnemy: {
      0: '3',
      1: null,
    },
    enemyDisasterLevelByEnemy: {
      0: '2',
      1: undefined,
    },
    enemyAllAbilityDownByEnemy: {
      0: '30',
      1: undefined,
    },
  });

  assert.equal(context.enemyCount, 3);
  assert.equal(context.targetEnemyIndex, 2);
  assert.deepEqual(context.eligibleEnemyIndexes, [0, 1, 4]);
  assert.equal(context.effectiveDamageRatesByEnemy[0], 125);
  assert.equal(context.effectiveDamageRatesByEnemy[1], 0);
  assert.equal(Number.isNaN(context.effectiveDamageRatesByEnemy[2]), true);
  assert.equal(context.enemyParamBorderByEnemy[0], 812);
  assert.equal(context.enemyParamBorderByEnemy[1], 0);
  assert.equal(Number.isNaN(context.enemyParamBorderByEnemy[2]), true);
  assert.equal(context.enemyDpByEnemy[0], 4550000);
  assert.equal(context.enemyDpByEnemy[1], 0);
  assert.equal(Number.isNaN(context.enemyDpByEnemy[2]), true);
  assert.equal(context.enemyNamesByEnemy[0], '敵A');
  assert.equal(context.enemyNamesByEnemy[1], '');
  assert.equal(context.enemyNamesByEnemy[2], '敵C');
  assert.equal(context.destructionRateByEnemy[0], 150);
  assert.equal(context.destructionRateByEnemy[1], 0);
  assert.equal(Number.isNaN(context.destructionRateByEnemy[2]), true);
  assert.equal(context.enemyTalismanLevelByEnemy[0], 3);
  assert.equal(context.enemyTalismanLevelByEnemy[1], 0);
  assert.equal(context.enemyDisasterLevelByEnemy[0], 2);
  assert.equal(context.enemyDisasterLevelByEnemy[1], 0);
  assert.equal(context.enemyAllAbilityDownByEnemy[0], 30);
  assert.equal(context.enemyAllAbilityDownByEnemy[1], 0);
});

test('buildDamageCalculationContext clones funnel effects and preserves numeric combat modifiers', () => {
  const funnelEffects = [{ effectType: 'Funnel', count: 2, power: [15, 0] }];
  const activeStatusEffects = [{ statusType: 'AttackUp', power: 65 }];
  const chargeEffects = [{ statusType: 'Charge', power: 30 }];
  const enemyStatusEffects = [{ statusType: 'DefenseDown', power: 30 }];
  const attackReferencesByEnemy = { 0: ['Slash'] };
  const affinityContributionsByEnemy = { 0: [{ label: '斬相性', value: 1.5 }] };
  const accessoryContributions = [{ label: 'リング', value: 0.1 }];
  const selectedMindEyeEffects = [{ statusType: 'MindEye', power: 0.5 }];
  const criticalRateBreakdown = { criticalRatePercent: 100, isCriticalGuaranteed: true };
  const damageBreakdown = { version: 1, targetBreakdowns: [{ targetEnemyIndex: 0 }] };
  const context = buildDamageCalculationContext({
    tokenAttackTokenCount: '5',
    tokenAttackRatePerToken: '12.5',
    tokenAttackTotalRate: '62.5',
    attackByOwnDpRateStartDpRate: '0.5',
    attackByOwnDpRateReferenceDpRate: '0.8',
    attackByOwnDpRateLowDpMultiplier: '1.8',
    attackByOwnDpRateHighDpMultiplier: '1.2',
    attackByOwnDpRateResolvedMultiplier: '1.8',
    highBoostSkillAtkRate: '1.8',
    attackUpRate: '0.25',
    defenseUpRate: '0.15',
    criticalRateUpRate: '0.35',
    criticalDamageUpRate: '0.45',
    damageRateUpPerTokenRate: '0.1',
    babiedSkillAttackUpRate: '0.3',
    babiedOdGaugeGainUpRate: '0.2',
    foodBuffAttackUpRate: '0.5',
    foodBuffHealDpByDamageRate: '0.1',
    enemyTalismanLevelByEnemy: { 0: '4' },
    enemyDisasterLevelByEnemy: { 0: '2' },
    enemyAllAbilityDownByEnemy: { 0: '40' },
    markAttackUpRate: '30',
    markDamageTakenDownRate: '10',
    markDestructionRateGainBonusRate: '20',
    markCriticalRateUp: '30',
    markCriticalDamageUp: '40',
    accessoryAttackUpRate: '0.15',
    accessoryContributions,
    overDrivePointUpByTokenPerToken: '2.5',
    overDrivePointUpByTokenTokenCount: '5',
    overDrivePointUpByTokenTotalPercent: '12.5',
    zoneType: 'Fire',
    zonePowerRate: '45',
    isNormalAttack: true,
    activeStatusEffects,
    chargeEffects,
    enemyStatusEffects,
    attackReferencesByEnemy,
    affinityContributionsByEnemy,
    hasPenetrationCritical: true,
    selectedMindEyeEffects,
    criticalRateBreakdown,
    damageBreakdown,
    funnelEffects,
  });

  assert.equal(context.tokenAttackTokenCount, 5);
  assert.equal(context.tokenAttackRatePerToken, 12.5);
  assert.equal(context.tokenAttackTotalRate, 62.5);
  assert.equal(context.attackByOwnDpRateResolvedMultiplier, 1.8);
  assert.equal(context.highBoostSkillAtkRate, 1.8);
  assert.equal(context.attackUpRate, 0.25);
  assert.equal(context.defenseUpRate, 0.15);
  assert.equal(context.criticalRateUpRate, 0.35);
  assert.equal(context.criticalDamageUpRate, 0.45);
  assert.equal(context.damageRateUpPerTokenRate, 0.1);
  assert.equal(context.babiedSkillAttackUpRate, 0.3);
  assert.equal(context.babiedOdGaugeGainUpRate, 0.2);
  assert.equal(context.foodBuffAttackUpRate, 0.5);
  assert.equal(context.foodBuffHealDpByDamageRate, 0.1);
  assert.equal(context.enemyTalismanLevelByEnemy[0], 4);
  assert.equal(context.enemyDisasterLevelByEnemy[0], 2);
  assert.equal(context.enemyAllAbilityDownByEnemy[0], 40);
  assert.equal(context.markDestructionRateGainBonusRate, 20);
  assert.equal(context.markCriticalDamageUp, 40);
  assert.equal(context.accessoryAttackUpRate, 0.15);
  assert.equal(context.overDrivePointUpByTokenTotalPercent, 12.5);
  assert.equal(context.zoneType, 'Fire');
  assert.equal(context.zonePowerRate, 45);
  assert.equal(context.isNormalAttack, true);
  assert.equal(context.hasPenetrationCritical, true);
  assert.notEqual(context.activeStatusEffects, activeStatusEffects);
  assert.deepEqual(context.activeStatusEffects, activeStatusEffects);
  assert.notEqual(context.chargeEffects, chargeEffects);
  assert.deepEqual(context.chargeEffects, chargeEffects);
  assert.notEqual(context.enemyStatusEffects, enemyStatusEffects);
  assert.deepEqual(context.enemyStatusEffects, enemyStatusEffects);
  assert.notEqual(context.attackReferencesByEnemy, attackReferencesByEnemy);
  assert.deepEqual(context.attackReferencesByEnemy, attackReferencesByEnemy);
  assert.notEqual(context.affinityContributionsByEnemy, affinityContributionsByEnemy);
  assert.deepEqual(context.affinityContributionsByEnemy, affinityContributionsByEnemy);
  assert.notEqual(context.accessoryContributions, accessoryContributions);
  assert.deepEqual(context.accessoryContributions, accessoryContributions);
  assert.notEqual(context.selectedMindEyeEffects, selectedMindEyeEffects);
  assert.deepEqual(context.selectedMindEyeEffects, selectedMindEyeEffects);
  assert.notEqual(context.criticalRateBreakdown, criticalRateBreakdown);
  assert.deepEqual(context.criticalRateBreakdown, criticalRateBreakdown);
  assert.notEqual(context.damageBreakdown, damageBreakdown);
  assert.deepEqual(context.damageBreakdown, damageBreakdown);
  assert.notEqual(context.funnelEffects, funnelEffects);
  assert.deepEqual(context.funnelEffects, funnelEffects);

  accessoryContributions[0].value = 0.9;
  selectedMindEyeEffects[0].power = 0.9;
  criticalRateBreakdown.criticalRatePercent = 0;
  damageBreakdown.targetBreakdowns[0].targetEnemyIndex = 2;
  funnelEffects[0].count = 99;
  activeStatusEffects[0].power = 999;
  chargeEffects[0].power = 999;
  enemyStatusEffects[0].power = 999;
  attackReferencesByEnemy[0].push('Fire');
  affinityContributionsByEnemy[0][0].value = 0.5;
  assert.equal(context.accessoryContributions[0].value, 0.1);
  assert.equal(context.activeStatusEffects[0].power, 65);
  assert.equal(context.chargeEffects[0].power, 30);
  assert.equal(context.enemyStatusEffects[0].power, 30);
  assert.deepEqual(context.attackReferencesByEnemy[0], ['Slash']);
  assert.equal(context.affinityContributionsByEnemy[0][0].value, 1.5);
  assert.equal(context.selectedMindEyeEffects[0].power, 0.5);
  assert.equal(context.criticalRateBreakdown.criticalRatePercent, 100);
  assert.equal(context.damageBreakdown.targetBreakdowns[0].targetEnemyIndex, 0);
  assert.equal(context.funnelEffects[0].count, 2);
});
