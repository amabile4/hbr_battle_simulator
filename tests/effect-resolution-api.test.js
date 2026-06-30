import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectPowerFromPart } from '../src/index.js';
import { calculateDestruction } from '../src/index.js';

const tolerance = 1e-4;
function isClose(a, b) {
  return Math.abs(a - b) <= tolerance;
}

test('resolveEffectPowerFromPart - Buff Scenarios', () => {
  // 1. threshold <= 0 (always capped/overCap)
  const part1 = {
    power: [0.10, 0.20],
    growth: [0.03, 0.02],
    diff_for_max: 0,
    parameters: { wis: 1 }
  };
  const res1 = resolveEffectPowerFromPart(part1, {
    providerStats: { wis: 100 },
    skillLevel: 10,
    isEnemyDebuff: false
  });
  // minAtLevel = 10 * (1 + 0.03*9) = 12.7
  // maxAtLevel = 20 * (1 + 0.02*9) = 23.6
  assert.equal(res1.breakdown.regime, 'overCap');
  assert.ok(isClose(res1.power, 23.6));

  // 2. providerStatVal < 0 (belowMin)
  const part2 = {
    power: [0.10, 0.20],
    growth: [0.03, 0.02],
    diff_for_max: 100,
    parameters: { wis: 1 }
  };
  const res2 = resolveEffectPowerFromPart(part2, {
    providerStats: { wis: -50 },
    skillLevel: 10,
    isEnemyDebuff: false
  });
  assert.equal(res2.breakdown.regime, 'belowMin');
  assert.ok(isClose(res2.power, 12.7));

  // 3. Linear region
  const res3 = resolveEffectPowerFromPart(part2, {
    providerStats: { wis: 50 },
    skillLevel: 10,
    isEnemyDebuff: false
  });
  // minAtLevel = 12.7, maxAtLevel = 23.6
  // halfway: 12.7 + (23.6 - 12.7) * 50 / 100 = 12.7 + 5.45 = 18.15
  assert.equal(res3.breakdown.regime, 'linear');
  assert.ok(isClose(res3.power, 18.15));

  // 4. Over cap (overCap)
  const res4 = resolveEffectPowerFromPart(part2, {
    providerStats: { wis: 150 },
    skillLevel: 10,
    isEnemyDebuff: false
  });
  // maxAtLevel * (1 + 0.0002 * (providerStatVal - threshold))
  // 23.6 * (1 + 0.0002 * 50) = 23.6 * 1.01 = 23.836
  assert.equal(res4.breakdown.regime, 'overCap');
  assert.ok(isClose(res4.power, 23.836));

  // 5. Orb levels addition
  const res5 = resolveEffectPowerFromPart(part2, {
    providerStats: { wis: 200 },
    skillLevel: 10,
    orbLevel: 1,
    isEnemyDebuff: false
  });
  // threshold = 100. tJewel = 100 + 60*1 = 160.
  // providerStatVal = 200 >= 160. jewelAddition = vMax * 1 * 0.04 = 20 * 0.04 = 0.8
  // baseResolvedPower = 23.6 * (1 + 0.0002 * 100) = 23.6 * 1.02 = 24.072
  // total = 24.072 + 0.8 = 24.872
  assert.ok(isClose(res5.power, 24.872));
  assert.ok(isClose(res5.breakdown.jewelAddition, 0.8));
});

test('resolveEffectPowerFromPart - Debuff Scenarios', () => {
  const part = {
    power: [0.30, 0.45],
    growth: [0.03, 0.02],
    diff_for_max: 150,
    parameters: { wis: 1 }
  };
  // minAtLevel = 30 * (1 + 0.03*9) = 38.1
  // maxAtLevel = 45 * (1 + 0.02*9) = 53.1

  // 1. statDiff < 0 (belowMin)
  const res1 = resolveEffectPowerFromPart(part, {
    providerStats: { wis: 700 },
    enemyBorder: 750,
    skillLevel: 10,
    isEnemyDebuff: true
  });
  assert.equal(res1.breakdown.regime, 'belowMin');
  assert.equal(res1.power, 38.1); // Rounding should floor it: 38.1

  // 2. statDiff in linear region
  const res2 = resolveEffectPowerFromPart(part, {
    providerStats: { wis: 800 },
    enemyBorder: 750,
    skillLevel: 10,
    isEnemyDebuff: true
  });
  // statDiff = 50. min = 38.1, max = 53.1. threshold = 150
  // power = 38.1 + (53.1 - 38.1) * 50 / 150 = 38.1 + 5.0 = 43.1
  assert.equal(res2.breakdown.regime, 'linear');
  assert.equal(res2.power, 43.1);

  // 3. statDiff over cap (overCap)
  const res3 = resolveEffectPowerFromPart(part, {
    providerStats: { wis: 950 },
    enemyBorder: 750,
    skillLevel: 10,
    isEnemyDebuff: true
  });
  // statDiff = 200 >= 150.
  // base = 53.1 * (1 + 0.001 * (200 - 150)) = 53.1 * 1.05 = 55.755
  // floor(100 * 55.755) / 100 = 55.75
  assert.equal(res3.breakdown.regime, 'overCap');
  assert.equal(res3.power, 55.75);

  // 4. Orb levels addition
  const res4 = resolveEffectPowerFromPart(part, {
    providerStats: { wis: 950 },
    enemyBorder: 750,
    skillLevel: 10,
    orbLevel: 1,
    isEnemyDebuff: true
  });
  // statDiff = 200. threshold = 150. tJewel = 150 + 20*1 = 170.
  // statDiff = 200 >= 170. jewelAddition = vMax * 1 * 0.02 = 45 * 0.02 = 0.9.
  // base = 55.755. total = 55.755 + 0.9 = 56.655.
  // floor(100 * 56.655) / 100 = 56.65
  assert.equal(res4.power, 56.65);
});

test('resolveEffectPowerFromPart - Parameter and Normalization', () => {
  const part = {
    power: [0.10],
    growth: [0.03],
    diff_for_max: 100,
    parameters: { wis: 2, luk: 1 }
  };
  // 1. int and mnd aliases and weighting
  const res1 = resolveEffectPowerFromPart(part, {
    providerStats: { int: 700, luk: 400 },
    skillLevel: 1,
    isEnemyDebuff: false
  });
  // int -> wis = 700. luk = 400.
  // weightedSum = (700 * 2 + 400 * 1) / 3 = 1800 / 3 = 600.
  // threshold = 100. providerStatVal = 600 >= 100.
  // maxAtLevel = 10.
  // power = 10 * (1 + 0.0002 * (600 - 100)) = 10 * 1.1 = 11
  assert.equal(res1.breakdown.providerStatVal, 600);
  assert.ok(isClose(res1.power, 11));

  // 2. Missing stat fallback to 600
  const res2 = resolveEffectPowerFromPart(part, {
    providerStats: { wis: 600 }, // luk missing -> fallback 600
    skillLevel: 1,
    isEnemyDebuff: false
  });
  assert.equal(res2.breakdown.providerStatVal, 600);
  assert.ok(isClose(res2.power, 11));
});

test('calculateDestruction - DestructionUp integration with pre-resolved power', () => {
  // DestructionUp buff with pre-resolved power = 45.32 (means +45.32% destruction rate)
  const input = {
    attacker: {
      styleId: 1,
      role: 'Attacker',
      statusEffects: [
        { statusType: 'DestructionUp', power: 45.32 }
      ]
    },
    defender: {
      enemyId: 'dummy',
      destructionRate: 1.5 // 150%
    },
    skill: {
      spCostOverride: 4,
      isNormalAttack: false
    },
    hits: [
      { damage: 100, isBreakHit: true }
    ]
  };

  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [{ id: 'dummy', base_param: { d_rate: 1.0, max_d_rate: 300.0 } }],
    skills: []
  };

  const res = calculateDestruction(input, data);
  // fTag = 0.25 (since single target and no special desc). spVal = 4.
  // destMult = 1.0. drVal = 1.0 / 25.0 = 0.04.
  // bg30 = 0.25 * 4 * 0.04 = 0.04.
  // buffMultiplier = 45.32 / 100 = 0.4532
  // baseDestruction = Math.floor(0.04 * (1 + 0 + 0.4532) * 10000) / 10000
  //                 = Math.floor(0.04 * 1.4532 * 10000) / 10000 = Math.floor(581.28) / 10000 = 0.0581
  assert.ok(isClose(res.breakdown.baseDestruction, 0.0581));
  assert.ok(isClose(res.breakdown.buffMultiplier, 0.4532));
});
