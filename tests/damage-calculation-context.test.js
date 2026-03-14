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
    enemyCount: 1,
    targetEnemyIndex: null,
    baseHitCount: 0,
    funnelHitBonus: 0,
    effectiveHitCountPerEnemy: 0,
    effectiveHitCountTotal: 0,
    eligibleEnemyIndexes: [],
    effectiveDamageRatesByEnemy: {},
    tokenAttackTokenCount: 0,
    tokenAttackRatePerToken: 0,
    tokenAttackTotalRate: 0,
    attackByOwnDpRateStartDpRate: 0,
    attackByOwnDpRateReferenceDpRate: 0,
    attackByOwnDpRateLowDpMultiplier: 0,
    attackByOwnDpRateHighDpMultiplier: 0,
    attackByOwnDpRateResolvedMultiplier: 0,
    attackUpRate: 0,
    defenseUpRate: 0,
    criticalRateUpRate: 0,
    criticalDamageUpRate: 0,
    damageRateUpPerTokenRate: 0,
    markAttackUpRate: 0,
    markDamageTakenDownRate: 0,
    markDevastationRateUp: 0,
    markCriticalRateUp: 0,
    markCriticalDamageUp: 0,
    overDrivePointUpByTokenPerToken: 0,
    overDrivePointUpByTokenTokenCount: 0,
    overDrivePointUpByTokenTotalPercent: 0,
    zoneType: '',
    zonePowerRate: 0,
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
  });

  assert.equal(context.enemyCount, 3);
  assert.equal(context.targetEnemyIndex, 2);
  assert.deepEqual(context.eligibleEnemyIndexes, [0, 1, 4]);
  assert.equal(context.effectiveDamageRatesByEnemy[0], 125);
  assert.equal(context.effectiveDamageRatesByEnemy[1], 0);
  assert.equal(Number.isNaN(context.effectiveDamageRatesByEnemy[2]), true);
});

test('buildDamageCalculationContext clones funnel effects and preserves numeric combat modifiers', () => {
  const funnelEffects = [{ effectType: 'Funnel', count: 2, power: [15, 0] }];
  const context = buildDamageCalculationContext({
    tokenAttackTokenCount: '5',
    tokenAttackRatePerToken: '12.5',
    tokenAttackTotalRate: '62.5',
    attackByOwnDpRateStartDpRate: '0.5',
    attackByOwnDpRateReferenceDpRate: '0.8',
    attackByOwnDpRateLowDpMultiplier: '1.8',
    attackByOwnDpRateHighDpMultiplier: '1.2',
    attackByOwnDpRateResolvedMultiplier: '1.8',
    attackUpRate: '0.25',
    defenseUpRate: '0.15',
    criticalRateUpRate: '0.35',
    criticalDamageUpRate: '0.45',
    damageRateUpPerTokenRate: '0.1',
    markAttackUpRate: '30',
    markDamageTakenDownRate: '10',
    markDevastationRateUp: '20',
    markCriticalRateUp: '30',
    markCriticalDamageUp: '40',
    overDrivePointUpByTokenPerToken: '2.5',
    overDrivePointUpByTokenTokenCount: '5',
    overDrivePointUpByTokenTotalPercent: '12.5',
    zoneType: 'Fire',
    zonePowerRate: '45',
    funnelEffects,
  });

  assert.equal(context.tokenAttackTokenCount, 5);
  assert.equal(context.tokenAttackRatePerToken, 12.5);
  assert.equal(context.tokenAttackTotalRate, 62.5);
  assert.equal(context.attackByOwnDpRateResolvedMultiplier, 1.8);
  assert.equal(context.attackUpRate, 0.25);
  assert.equal(context.defenseUpRate, 0.15);
  assert.equal(context.criticalRateUpRate, 0.35);
  assert.equal(context.criticalDamageUpRate, 0.45);
  assert.equal(context.damageRateUpPerTokenRate, 0.1);
  assert.equal(context.markCriticalDamageUp, 40);
  assert.equal(context.overDrivePointUpByTokenTotalPercent, 12.5);
  assert.equal(context.zoneType, 'Fire');
  assert.equal(context.zonePowerRate, 45);
  assert.notEqual(context.funnelEffects, funnelEffects);
  assert.deepEqual(context.funnelEffects, funnelEffects);

  funnelEffects[0].count = 99;
  assert.equal(context.funnelEffects[0].count, 2);
});
