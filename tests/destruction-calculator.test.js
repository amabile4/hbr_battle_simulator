import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDestruction,
  loadDamageCalculationData,
} from '../src/index.js';
import { findAttackPart } from '../src/domain/calculator-helpers.js';

const DESTRUCTION_TOLERANCE = 1e-4;
const DESTRUCTION_BASE_HIT_REFERENCE = 8;
const RATIO_PERCENT_DENOMINATOR = 100;

function assertAlmostEqual(actual, expected, label, tolerance = DESTRUCTION_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${label}: actual=${actual}, expected=${expected}`
  );
}

function buildBrokenDestructionInput({ skillId, skillName, attackPart, conditionResults } = {}) {
  return {
    attacker: { styleId: 1 },
    defender: {
      destructionRate: 1,
      destructionLimit: 9,
      destructionMultiplier: 1,
      dp: 0,
    },
    skill: {
      skillId,
      name: skillName,
      attackPart,
      conditionResults,
    },
    hits: [{ damage: 1 }],
  };
}

function expectedSkillBaseDestruction(dr, dRate, hitCount, bonusSum = 0) {
  return Math.floor(
    (dr * dRate * hitCount / (DESTRUCTION_BASE_HIT_REFERENCE * RATIO_PERCENT_DENOMINATOR)) *
    (1 + bonusSum) *
    10000
  ) / 10000;
}

test('calculateDestruction requires manual break hits unless autoBreak is enabled', () => {
  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [
      {
        id: 10,
        name: 'Test Skill',
        hit_count: 2,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 10 } }],
      },
    ],
  };
  const input = {
    attacker: { styleId: 1 },
    defender: {
      destructionRate: 1,
      destructionLimit: 9,
      destructionMultiplier: 1.5,
      dp: 1000,
    },
    skill: { skillId: 10, name: 'Test Skill' },
    hits: [{ damage: 0 }, { damage: 1000 }],
  };

  assert.equal(calculateDestruction(input, data).destructionRate, 1);

  const manualBreak = calculateDestruction({
    ...input,
    hits: [{ damage: 0 }, { damage: 1000, isBreakHit: true }],
  }, data);
  assertAlmostEqual(manualBreak.destructionRate, 1.01875, 'manualBreak.destructionRate');
  assertAlmostEqual(manualBreak.breakdown.finalBaseDestruction, 0.0375, 'manualBreak.finalBaseDestruction');
  assertAlmostEqual(manualBreak.breakdown.destMult, 1.5, 'manualBreak.destMult');

  const autoBreak = calculateDestruction({
    ...input,
    hits: [{ damage: 0 }, { damage: 1000 }],
    autoBreak: true
  }, data);
  assertAlmostEqual(autoBreak.destructionRate, 1.01875, 'autoBreak.destructionRate');
});

test('calculateDestruction treats dp=0 zero-damage hits as post-break destruction hits', () => {
  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [
      {
        id: 11,
        name: 'Already Broken Skill',
        hit_count: 3,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 10 } }],
      },
    ],
  };
  const result = calculateDestruction(
    {
      attacker: { styleId: 1 },
      defender: {
        destructionRate: 1,
        destructionLimit: 9,
        destructionMultiplier: 1.5,
        dp: 0,
      },
      skill: { skillId: 11, name: 'Already Broken Skill' },
      hits: [{ damage: 0 }, { damage: 0 }, { damage: 0 }],
      autoBreak: false,
    },
    data
  );

  assertAlmostEqual(result.destructionRate, 1.0562, 'alreadyBrokenZeroDamage.destructionRate');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.0562, 'alreadyBrokenZeroDamage.finalBaseDestruction');
});

test('calculateDestruction applies enemy destructionMultiplier to destruction gain', () => {
  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [
      {
        id: 12,
        name: 'Multiplier Skill',
        hit_count: 1,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 1 } }],
      },
    ],
  };
  const result = calculateDestruction(
    {
      attacker: { styleId: 1 },
      defender: {
        destructionRate: 1,
        destructionLimit: 9,
        destructionMultiplier: 2,
        dp: 0,
      },
      skill: { skillId: 12, name: 'Multiplier Skill' },
      hits: [{ damage: 1 }],
    },
    data
  );

  assertAlmostEqual(result.destructionRate, 1.0025, 'destructionMultiplier.destructionRate');
  assertAlmostEqual(result.breakdown.destMult, 2, 'destMult.breakdown');
});

test('calculateDestruction uses raw d_rate for normal attack destruction and only applies transcendence bonus', () => {
  const data = {
    styles: [{ id: 1, role: 'Blaster' }],
    enemies: [],
    skills: [],
  };
  const makeInput = (destructionMultiplier, transcendenceBonus = 0) => ({
    attacker: {
      styleId: 1,
      statusEffects: [
        {
          statusType: 'DestructionUp',
          power: 1.0,
        },
      ],
      accessoryDestructionRateBonus: 2.0,
      flatDestructionRateBonus: 2.0,
      resonanceDestructionRateBonus: 2.0,
      transcendenceBurstDestructionRateGainBonusRate: transcendenceBonus,
    },
    defender: {
      destructionRate: 1,
      destructionLimit: 9,
      destructionMultiplier,
      destructionResist: 0.5,
      dp: 0,
    },
    skill: {
      name: '通常攻撃',
      isNormalAttack: true,
      attackPart: { skill_type: 'AttackNormal', multipliers: { dr: 1 } },
    },
    hits: [{ damage: 0 }, { damage: 0 }, { damage: 0 }],
  });

  const normalD5 = calculateDestruction(makeInput(5), data);
  assertAlmostEqual(normalD5.destructionRate, 1.05, 'normal.dRate5');
  assertAlmostEqual(normalD5.breakdown.finalBaseDestruction, 0.05, 'normal.dRate5.finalBase');

  const normalD10 = calculateDestruction(makeInput(10), data);
  assertAlmostEqual(normalD10.destructionRate, 1.10, 'normal.dRate10');
  assertAlmostEqual(normalD10.breakdown.finalBaseDestruction, 0.10, 'normal.dRate10.finalBase');

  const transcendenceD10 = calculateDestruction(makeInput(10, 0.1), data);
  assertAlmostEqual(transcendenceD10.destructionRate, 1.11, 'normal.dRate10.transcendence');
  assertAlmostEqual(
    transcendenceD10.breakdown.finalBaseDestruction,
    0.11,
    'normal.dRate10.transcendence.finalBase'
  );
});

test('calculateDestruction: 9ヒット autoBreak 7発目ブレイクで破壊率が計算値+13.33%になる', () => {
  // 正式式: DR倍率=10, d_rate=1, 9hit → baseDestRate=10*1*9/(8*100)=0.1125
  // DP=4,550,000、1ヒット650,000ダメージ → 7発目(index 6)で累積4,550,000≥DP → ブレイク
  // 貢献ヒット: index 6(ブレイクヒット), 7, 8 = 3ヒット
  // DR加算 = 3 × (0.1125/9) = 0.0375
  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [
      {
        id: 9001,
        name: 'テスト9ヒット',
        hit_count: 9,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 10 } }],
      },
    ],
  };

  const input = {
    attacker: { styleId: 1 },
    defender: {
      destructionRate: 1.0,
      destructionLimit: 5.0,
      destructionMultiplier: 1.0,
      dp: 4550000,
    },
    skill: { skillId: 9001, name: 'テスト9ヒット' },
    hits: Array.from({ length: 9 }, () => ({ damage: 650000 })),
    autoBreak: true,
  };

  const result = calculateDestruction(input, data);

  assertAlmostEqual(
    result.destructionRate - 1.0,
    0.0375,
    '9hit autoBreak DR加算'
  );
});

test('calculateDestruction resolves accessory additive bonus and limit exceedance bonuses', () => {
  const data = {
    styles: [{ id: 2, role: 'Blaster' }],
    enemies: [],
    skills: [
      {
        id: 20,
        name: 'Blaster Skill',
        hit_count: 1,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 1.0 } }],
      },
    ],
  };

  // Blaster role no longer has a hidden +2.0 correction. Blast pierce and resonance are additive.
  const input = {
    attacker: {
      styleId: 2,
      accessories: ['BlastPierce'],
      accessoryDestructionRateBonus: 0.15,
      resonanceDestructionRateBonus: 0.10,
      destructionLimitExceedBonus: 1.0,
    },
    defender: {
      destructionRate: 1.0,
      destructionLimit: 3.0,
      destructionMultiplier: 1.0,
      dp: 0,
    },
    skill: { skillId: 20, name: 'Blaster Skill' },
    hits: [{ damage: 100 }],
    autoBreak: true,
  };

  const result = calculateDestruction(input, data);

  assertAlmostEqual(result.destructionRate, 1.0015, 'destructionRate');
  assertAlmostEqual(result.breakdown.baseDestruction, 0.0015, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.0015, 'finalBaseDestruction');
  assertAlmostEqual(result.breakdown.blasterCorrection, 0, 'blasterCorrection');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.resonanceBonus, 0.10, 'resonanceBonus');
  assertAlmostEqual(result.breakdown.limitExceedBonus, 1.0, 'limitExceedBonus');
});

test('calculateDestruction applies resonance in additive group before resist', () => {
  const data = {
    styles: [{ id: 3, role: 'Blaster' }],
    enemies: [],
    skills: [
      {
        id: 21,
        name: 'Resonance Skill',
        hit_count: 4,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 10 } }],
      },
    ],
  };

  const result = calculateDestruction(
    {
      attacker: {
        styleId: 3,
        accessoryDestructionRateBonus: 0.15,
        flatDestructionRateBonus: 0.2,
        resonanceDestructionRateBonus: 0.3,
      },
      defender: {
        destructionRate: 1.0,
        destructionLimit: 9.0,
        destructionMultiplier: 1.0,
        destructionResist: 0.1,
        dp: 0,
      },
      skill: { skillId: 21, name: 'Resonance Skill' },
      hits: [{ damage: 100 }, { damage: 100 }, { damage: 100 }, { damage: 100 }],
      autoBreak: true,
    },
    data
  );

  assertAlmostEqual(result.breakdown.baseDestruction, 0.0825, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.07425, 'finalBaseDestruction');
  assertAlmostEqual(result.destructionRate, 1.07425, 'destructionRate');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.flatDestructionBonus, 0.2, 'flatDestructionBonus');
  assertAlmostEqual(result.breakdown.resonanceBonus, 0.3, 'resonanceBonus');
});

test('calculateDestruction: resolveEffectPower regression test for DestructionUp buff', () => {
  const data = {
    styles: [{ id: 2, role: 'Blaster' }],
    enemies: [],
    skills: [
      {
        id: 46001361,
        name: 'Test Destruction Skill',
        parts: [
          {
            skill_type: 'DestructionUp',
            power: [0.20, 0.35],
            diff_for_max: 132,
            parameters: { wis: 1, luk: 2 },
            growth: [0.0, 0.0]
          }
        ]
      }
    ]
  };

  const input = {
    attacker: {
      styleId: 2,
      statusEffects: [
        {
          statusType: 'DestructionUp',
          sourceSkillId: 46001361,
          skillLevel: 10,
          orbLevel: 1,
          providerStats: { wis: 600, luk: 600 },
        }
      ]
    },
    defender: {
      destructionRate: 1.0,
      destructionLimit: 3.0,
      destructionMultiplier: 1.0,
      dp: 0,
    },
    skill: { name: '通常攻撃' },
    hits: [{ damage: 100 }],
    autoBreak: true,
  };

  const result = calculateDestruction(input, data);
  assertAlmostEqual(result.breakdown.buffMultiplier, 0.39676, 'DestructionUp resolvedPower regression');
});

test('calculateDestruction resolves flatDestructionRateBonus', () => {
  const data = {
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [
      {
        id: 10,
        name: 'Test Skill',
        hit_count: 1,
        sp_cost: 10,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 10 } }],
      },
    ],
  };
  const input = {
    attacker: {
      styleId: 1,
      flatDestructionRateBonus: 0.10,
    },
    defender: {
      destructionRate: 1,
      destructionLimit: 9,
      destructionMultiplier: 1.0,
      dp: 0,
    },
    skill: { skillId: 10, name: 'Test Skill' },
    hits: [{ damage: 1000 }],
    autoBreak: true,
  };

  const res = calculateDestruction(input, data);
  assertAlmostEqual(res.breakdown.baseDestruction, 0.0137, 'baseDestruction');
  assertAlmostEqual(res.breakdown.flatDestructionBonus, 0.10, 'flatDestructionBonus');
});

test('calculateDestruction uses resolved SkillCondition attackPart instead of flattened first variant', () => {
  const data = loadDamageCalculationData();
  const cases = [
    [46001131, 46001132, 18.75],
    [46001131, 46001133, 3.125],
    [46002511, 46002512, 23.2],
    [46002511, 46002513, 17.4],
    [46005616, 46005617, 28],
    [46005616, 46005618, 3.5],
    [46007605, 46007606, 21.75],
    [46007605, 46007607, 13],
    [46008311, 46008312, 20.8],
    [46008311, 46008313, 15.6],
  ];

  for (const [parentId, childId, expectedDr] of cases) {
    const parentSkill = data.skills.find((skill) => Number(skill.id) === parentId);
    const childSkill = parentSkill?.parts?.[0]?.strval?.find((skill) => Number(skill.id) === childId);
    const attackPart = findAttackPart(childSkill);
    const result = calculateDestruction(
      buildBrokenDestructionInput({
        skillId: parentId,
        skillName: parentSkill?.name,
        attackPart,
      }),
      data
    );

    const expectedBase = expectedSkillBaseDestruction(
      expectedDr,
      1,
      Number(childSkill?.hit_count ?? childSkill?.hitCount ?? 1)
    );
    assertAlmostEqual(result.breakdown.baseDestruction, expectedBase, `${childId}.baseDestruction`);
  }
});

test('calculateDestruction applies IsHitWeak conditionResults per target', () => {
  const data = loadDamageCalculationData();
  const cases = [
    [46003507, 13, 21.75],
    [46001509, 2.9, 23.2],
    [46001512, 2.2, 17.6],
    [46002108, 1.8, 8],
  ];

  for (const [skillId, normalDr, weakDr] of cases) {
    const skill = data.skills.find((entry) => Number(entry.id) === skillId);
    const normal = calculateDestruction(
      buildBrokenDestructionInput({
        skillId,
        skillName: skill?.name,
        conditionResults: { 'IsHitWeak()': false },
      }),
      data
    );
    const weak = calculateDestruction(
      buildBrokenDestructionInput({
        skillId,
        skillName: skill?.name,
        conditionResults: { 'IsHitWeak()': true },
      }),
      data
    );

    const hitCount = Number(skill?.hit_count ?? skill?.hitCount ?? 1);
    assertAlmostEqual(normal.breakdown.baseDestruction, expectedSkillBaseDestruction(normalDr, 1, hitCount), `${skillId}.normal`);
    assertAlmostEqual(weak.breakdown.baseDestruction, expectedSkillBaseDestruction(weakDr, 1, hitCount), `${skillId}.weak`);
  }
});

test('calculateDestruction matches issue #19 verified formula cases', () => {
  const cases = [
    [8, 8, 0, 0, 0, 0.1, 0, 0, 0, 20.25, 178.2],
    [8, 8, 0, 0, 0.1, 0.1, 0, 0, 0, 20.25, 194.4],
    [8, 8, 0, 0, 0, 0.1, 0, 0, 0.45, 20.25, 251.1],
    [8, 8, 0, 0, 0.1, 0.1, 0, 0, 0.45, 20.25, 267.3],
    [8, 8, 0, 0, 0, 0.1, 0, 0, 0.45, 20.25, 251.1],
    [8, 8, 0.25, 3, 0, 0.1, 0, 0, 0.45, 20.25, 439.425],
    [8, 8, 0.25, 3, 0.1, 0.1, 0, 0, 0.45, 20.25, 467.775],
    [8, 8, 0.06, 10, 0.1, 0.1, 0, 0, 0.45, 20.25, 427.68],
    [8, 8, 0.25, 3, 0.1, 0.1, 0.1, 0, 0.45, 20.25, 496.125],
    [8, 8, 0.25, 3, 0.1, 0.1, 0, 0.1278, 0.45, 20.25, 504.0063],
    [8, 8, 0, 0, 0.1, 0.1, 0, 0.1278, 0.45, 20.25, 288.0036],
    [8, 8, 0.25, 3, 0.1, 0.1, 0.1, 0.1278, 0.45, 20.25, 532.3563],
    [8, 8, 0.25, 3, 0.1, 0.1, 0.1, 0, 0.45, 20.25, 496.125],
    [7, 8, 0.25, 3, 0.1, 0.1, 0, 0, 0.45, 20.25, 409.303125],
    [10, 8, 0.25, 3, 0.1, 0.1, 0, 0, 0.45, 20.25, 584.71875],
  ];
  const data = {
    styles: [{ id: 1, role: 'Blaster' }],
    enemies: [],
    skills: [],
  };

  for (const [index, params] of cases.entries()) {
    const [
      dRate,
      hitCount,
      funnelRate,
      funnelHitCount,
      transcendence,
      mark,
      chain,
      pierce,
      resonance,
      dr,
      expectedPercent,
    ] = params;
    const result = calculateDestruction(
      {
        attacker: {
          styleId: 1,
          accessoryDestructionRateBonus: pierce,
          flatDestructionRateBonus: chain,
          transcendenceBurstDestructionRateGainBonusRate: transcendence,
          markDestructionRateGainBonusRate: mark,
          resonanceDestructionRateBonus: resonance,
        },
        defender: {
          destructionRate: 1,
          destructionLimit: 99,
          destructionMultiplier: dRate,
          dp: 0,
        },
        skill: {
          isNormalAttack: false,
          baseHitCount: hitCount,
          funnelHitCount,
          funnelRate,
          attackPart: { skill_type: 'AttackSkill', multipliers: { dr } },
        },
        hits: Array.from({ length: hitCount + funnelHitCount }, () => ({ damage: 1 })),
      },
      data
    );
    assertAlmostEqual(
      result.destructionRate - 1,
      expectedPercent / 100,
      `issue19 case ${index + 1}`,
      1e-4
    );
  }
});
