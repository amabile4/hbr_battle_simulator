import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDamageBreakdown,
  buildDamageCalculationInput,
  buildDamageStatDeltaViewModel,
  calculateDamage,
  loadDamageCalculationData,
  resolveDefaultStats,
} from '../src/index.js';

test('resolveDefaultStats applies role templates and +20 per limit break', () => {
  assert.deepEqual(resolveDefaultStats('Attacker', 0), {
    str: 650,
    dex: 650,
    wis: 600,
    spr: 600,
    luk: 600,
    con: 600,
  });
  assert.deepEqual(resolveDefaultStats('Buffer', 2), {
    str: 640,
    dex: 640,
    wis: 710,
    spr: 660,
    luk: 640,
    con: 640,
  });
  assert.deepEqual(resolveDefaultStats('Unknown', 9), {
    str: 700,
    dex: 700,
    wis: 700,
    spr: 700,
    luk: 700,
    con: 700,
  });
});

test('buildDamageCalculationInput preserves stat lane and builds target-indexed enemy adapter', () => {
  const damageContext = {
    actorCharacterId: '101',
    actorStyleId: 1001,
    skillId: 5001,
    skillName: 'テストスキル',
    isNormalAttack: false,
    zoneType: 'Fire',
    zonePowerRate: 50,
    tokenAttackTokenCount: 3,
    effectiveDamageRatesByEnemy: { 0: 100, 1: 150 },
    destructionRateByEnemy: { 0: 125, 1: 175 },
    chargeEffects: [{ statusType: 'Charge', power: 30, skillName: 'チャージ' }],
    damageBreakdown: {
      targetBreakdowns: [
        {
          targetEnemyIndex: 0,
          targetLabel: 'E1',
          groups: [
            { dataGroup: 'buff', multiplier: 1.8 },
            { dataGroup: 'crit-mindeye', multiplier: 1.2 },
            { dataGroup: 'funnel', multiplier: 1.1 },
            { dataGroup: 'token-passive', multiplier: 1.3 },
            { dataGroup: 'debuff', multiplier: 1.4 },
            { dataGroup: 'affinity', multiplier: 1 },
          ],
        },
        {
          targetEnemyIndex: 1,
          targetLabel: 'ボス',
          groups: [
            { dataGroup: 'buff', multiplier: 1.5 },
            { dataGroup: 'crit-mindeye', multiplier: 1 },
            { dataGroup: 'token-passive', multiplier: 1 },
            { dataGroup: 'debuff', multiplier: 1 },
            { dataGroup: 'affinity', multiplier: 1.5 },
          ],
        },
      ],
    },
  };

  const input = buildDamageCalculationInput(
    damageContext,
    { role: 'Attacker', limitBreakCount: 0, str: 700, dex: 680 },
    { targetEnemyIndex: 1, enemyName: 'ボス', paramBorder: 800 }
  );

  assert.equal(input.attacker.stats.str, 700);
  assert.equal(input.attacker.stats.dex, 680);
  assert.equal(input.attacker.stats.wis, 600);
  assert.equal(input.defender.enemyName, 'ボス');
  assert.equal(input.defender.paramBorder, 800);
  assert.equal(input.defender.affinityRate, 1.5);
  assert.equal(input.defender.destructionRate, 1.75);
  assert.equal(input.defender.resistances.Slash, 1.5);
  assert.equal(input.targetEnemyIndex, 1);
  assert.equal(input.activeZone, 'FireZone');
  assert.equal(input.attacker.statusEffects.find((effect) => effect.statusType === 'AttackUp')?.power, 50);
  assert.equal(input.attacker.statusEffects.some((effect) => effect.statusType === 'Charge'), false);
  assert.equal(input.defender.isHpTarget, true);
});

test('buildDamageCalculationInput converts context destructionRate percent to calculateDamage rate', () => {
  const damageContext = {
    actorStyleId: 1010103,
    skillId: 46001107,
    skillName: '星火燎原',
    effectiveDamageRatesByEnemy: { 0: 100 },
    destructionRateByEnemy: { 0: 200 },
    damageBreakdown: {
      targetBreakdowns: [{ targetEnemyIndex: 0, targetLabel: 'E1', groups: [] }],
    },
  };
  const hpInput = buildDamageCalculationInput(damageContext, {}, { targetEnemyIndex: 0, isHpTarget: true });
  const dpInput = buildDamageCalculationInput(damageContext, {}, { targetEnemyIndex: 0, isHpTarget: false });

  assert.equal(hpInput.defender.destructionRate, 2);
  assert.equal(dpInput.defender.destructionRate, 2);

  const data = loadDamageCalculationData();
  const hpResult = calculateDamage(hpInput, data);
  const dpResult = calculateDamage(dpInput, data);
  assert.notEqual(hpResult.critical.expected, dpResult.critical.expected);
  assert.ok(hpResult.critical.expected > dpResult.critical.expected);
});

test('buildDamageCalculationInput applies enemy all ability down as absolute param border reduction', () => {
  const damageContext = {
    actorStyleId: 1010103,
    skillId: 46001107,
    skillName: '星火燎原',
    effectiveDamageRatesByEnemy: { 0: 100 },
    destructionRateByEnemy: { 0: 100 },
    enemyAllAbilityDownByEnemy: { 0: 50 },
    damageBreakdown: {
      targetBreakdowns: [{ targetEnemyIndex: 0, targetLabel: 'E1', groups: [] }],
    },
  };
  const attackerStats = { role: 'Attacker', str: 820, dex: 820, wis: 820, spr: 820, luk: 820, con: 820 };
  const enemyAdapter = { targetEnemyIndex: 0, paramBorder: 800, isHpTarget: false };
  const input = buildDamageCalculationInput(damageContext, attackerStats, enemyAdapter);
  const baselineInput = buildDamageCalculationInput(
    { ...damageContext, enemyAllAbilityDownByEnemy: {} },
    attackerStats,
    enemyAdapter
  );

  assert.equal(input.defender.paramBorder, 750);
  assert.equal(input.defender.statusEffects.some((effect) => effect.statusType === 'DefenseDown'), false);

  const data = loadDamageCalculationData();
  const result = calculateDamage(input, data);
  const baselineResult = calculateDamage(baselineInput, data);
  assert.ok(result.critical.expected > baselineResult.critical.expected);
});

test('buildDamageCalculationInput falls back per stat when actual stats are missing or zero', () => {
  const input = buildDamageCalculationInput(
    {},
    {
      role: 'Attacker',
      limitBreakCount: 1,
      str: 777,
      dex: 0,
      wis: null,
      spr: undefined,
      luk: 'bad',
      con: 888,
    }
  );

  assert.equal(input.attacker.stats.str, 777);
  assert.equal(input.attacker.stats.dex, 670);
  assert.equal(input.attacker.stats.wis, 620);
  assert.equal(input.attacker.stats.spr, 620);
  assert.equal(input.attacker.stats.luk, 620);
  assert.equal(input.attacker.stats.con, 888);
});

test('buildDamageCalculationInput preserves resolved breakdown multipliers without splitting charge', () => {
  const input = buildDamageCalculationInput(
    {
      actorStyleId: 1000101,
      skillId: 46001102,
      skillName: 'クロス斬り',
      chargeEffects: [{ statusType: 'Charge', power: 30, skillName: 'チャージ' }],
      damageBreakdown: {
        targetBreakdowns: [{
          targetEnemyIndex: 0,
          groups: [
            { dataGroup: 'buff', multiplier: 1.8 },
            { dataGroup: 'crit-mindeye', multiplier: 1.2 },
            { dataGroup: 'funnel', multiplier: 1.1 },
            { dataGroup: 'token-passive', multiplier: 1.3 },
            { dataGroup: 'debuff', multiplier: 1.4 },
            { dataGroup: 'affinity', multiplier: 1.5 },
          ],
        }],
      },
    },
    { tokenRatio: 0.3 },
    { targetEnemyIndex: 0, isHpTarget: false }
  );

  assert.ok(Math.abs(input.attacker.statusEffects.find((effect) => effect.statusType === 'AttackUp')?.power - 80) < 1e-9);
  assert.ok(Math.abs(input.attacker.statusEffects.find((effect) => effect.statusType === 'CritDamageUp')?.power - 30) < 1e-9);
  assert.ok(Math.abs(input.attacker.statusEffects.find((effect) => effect.statusType === 'Funnel')?.power - 10) < 1e-9);
  assert.ok(Math.abs(input.defender.statusEffects.find((effect) => effect.statusType === 'DefenseDown')?.power - 40) < 1e-9);
  assert.equal(input.attacker.tokenRatio, 0.3);
  assert.equal(input.defender.affinityRate, 1.5);
  assert.equal(input.defender.isHpTarget, false);

  const result = calculateDamage(input, loadDamageCalculationData());
  assert.ok(Math.abs(result.breakdown.buffMultiplier - 1.8) < 1e-9);
  assert.ok(Math.abs(result.breakdown.critMindeyeMultiplier - 1.2) < 1e-9);
  assert.ok(Math.abs(result.breakdown.funnelMultiplier - 1.1) < 1e-9);
  assert.ok(Math.abs(result.breakdown.tokenMultiplier - 1.3) < 1e-9);
  assert.ok(Math.abs(result.breakdown.debuffMultiplier - 1.4) < 1e-9);
  assert.ok(Math.abs(result.breakdown.affinityMultiplier - 1.5) < 1e-9);
});

test('buildDamageCalculationInput forwards multiplicative token-passive breakdown as token ratio', () => {
  const damageBreakdown = buildDamageBreakdown({
    effectiveDamageRatesByEnemy: { 0: 100 },
    tokenAttackTotalRate: 0.2,
    damageRateUpPerTokenRate: 0.1,
    attackByOwnDpRateResolvedMultiplier: 1.8,
  });
  const input = buildDamageCalculationInput({
    actorStyleId: 1000101,
    skillId: 46001102,
    skillName: 'クロス斬り',
    damageBreakdown,
  });

  assert.ok(Math.abs(input.attacker.tokenRatio - 1.34) < 1e-9);

  const result = calculateDamage(input, loadDamageCalculationData());
  assert.ok(Math.abs(result.breakdown.tokenMultiplier - 2.34) < 1e-9);
});

test('buildDamageCalculationInput marks normal attacks and keeps MindEye out of synthetic normal handling', () => {
  const input = buildDamageCalculationInput({
    actorStyleId: 1001,
    skillId: 500101,
    skillName: '任意名',
    isNormalAttack: true,
    damageBreakdown: {
      targetBreakdowns: [{ targetEnemyIndex: 0, targetLabel: 'E1', groups: [] }],
    },
  });

  assert.equal(input.skill.name, '通常攻撃');
  assert.equal(input.skill.kind, 'normal');
  assert.equal(input.attacker.statusEffects.some((effect) => effect.statusType === 'MindEye'), false);
});

test('buildDamageStatDeltaViewModel exposes base, delta and resolved lanes without mutating input stats', () => {
  const viewModel = buildDamageStatDeltaViewModel(
    {},
    { role: 'Debuffer', limitBreakCount: 1, luk: 777 },
    { paramBorder: 810 }
  );

  assert.deepEqual(viewModel.attacker.luk, {
    base: 777,
    buffDelta: 0,
    debuffDelta: 0,
    resolved: 777,
  });
  assert.deepEqual(viewModel.enemy.str, {
    base: 810,
    buffDelta: 0,
    debuffDelta: 0,
    resolved: 810,
  });
});
