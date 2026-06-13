import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDestruction,
  loadDamageCalculationData,
} from '../src/index.js';
import { findAttackPart } from '../src/domain/calculator-helpers.js';

const DESTRUCTION_TOLERANCE = 1e-4;

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
  // Unified destruction formula: dr already includes effective SP, so active skills use dr * 4.
  assertAlmostEqual(manualBreak.destructionRate, 1.3, 'manualBreak.destructionRate');
  assertAlmostEqual(manualBreak.breakdown.finalBaseDestruction, 0.6, 'manualBreak.finalBaseDestruction');
  assertAlmostEqual(manualBreak.breakdown.destructionMultiplier, 1.5, 'manualBreak.destructionMultiplier');

  const autoBreak = calculateDestruction({
    ...input,
    hits: [{ damage: 0 }, { damage: 1000 }],
    autoBreak: true
  }, data);
  assertAlmostEqual(autoBreak.destructionRate, 1.3, 'autoBreak.destructionRate');
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

  // Unified destruction formula: dr already includes effective SP, so active skills use dr * 4.
  assertAlmostEqual(result.destructionRate, 1.6, 'alreadyBrokenZeroDamage.destructionRate');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.6, 'alreadyBrokenZeroDamage.finalBaseDestruction');
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

  // dr * 4 * destructionMultiplier / 100 = 1 * 4 * 2 / 100 = 0.08 gain.
  assertAlmostEqual(result.destructionRate, 1.08, 'destructionMultiplier.destructionRate');
  assertAlmostEqual(result.breakdown.destructionMultiplier, 2, 'destructionMultiplier.breakdown');
});

test('calculateDestruction: 9ヒット autoBreak 7発目ブレイクで破壊率が計算値+13.33%になる', () => {
  // SP二重掛け修正後: DR倍率=10 → baseDestRate=10*4/100=0.4 の設定
  // DP=4,550,000、1ヒット650,000ダメージ → 7発目(index 6)で累積4,550,000≥DP → ブレイク
  // 貢献ヒット: index 6(ブレイクヒット), 7, 8 = 3ヒット
  // DR加算 = 3 × (0.4/9) = 0.1333... ≈ 13.33%
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
    0.4 / 3,
    '9hit autoBreak DR加算(計算値+13.33%)'
  );
});

test('calculateDestruction resolves role, accessory, and limit exceedance bonuses', () => {
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

  // 1. Attacker is Blaster (+2.0 blaster correction)
  // 2. BlastPierce accessory (+0.15 accessory bonus)
  // 3. Resonance bonus (+10%)
  // 4. Limit exceedance bonus (+1.0)
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

  // SP二重掛け修正後: baseDestRate = (dr * 4.0 * destMult) / 100.0 = 0.04
  // blasterCorrection = 2.0 (role) + 0.15 (accessory) = 2.15
  // Since h = 1, blaster slope correction applies: sRatio = 5.0% = 0.05
  // baseDestruction = Math.floor(0.04 * 1.05 * 10000.0) / 10000.0 = 0.042
  // finalBaseDestruction = baseDestruction * (1.0 - destResist) * (1.0 + resonanceBonus) = 0.042 * 1.0 * 1.10 = 0.0462
  // finalDestLimit = 3.0 + 1.0 = 4.0
  // destructionRate = 1.0 + 0.0462 = 1.0462

  assertAlmostEqual(result.destructionRate, 1.0462, 'destructionRate');
  assertAlmostEqual(result.breakdown.baseDestruction, 0.042, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.0462, 'finalBaseDestruction');
  assertAlmostEqual(result.breakdown.blasterCorrection, 2.15, 'blasterCorrection');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.resonanceBonus, 0.10, 'resonanceBonus');
  assertAlmostEqual(result.breakdown.limitExceedBonus, 1.0, 'limitExceedBonus');
});

test('calculateDestruction applies resonance after accessory slope, flat bonus, and resist', () => {
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

  // SP二重掛け修正後: baseDestRate=10*4/100=0.4, slope=75%, flat=20%.
  assertAlmostEqual(result.breakdown.baseDestruction, 0.78, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.9126, 'finalBaseDestruction');
  assertAlmostEqual(result.destructionRate, 1.9126, 'destructionRate');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.flatDestructionRateBonus, 0.2, 'flatDestructionRateBonus');
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
  // SP二重掛け修正後: baseDestRate=10*4/100=0.4, flat +10% => 0.44.
  assertAlmostEqual(res.breakdown.baseDestruction, 0.44, 'baseDestruction');
  assertAlmostEqual(res.breakdown.flatDestructionRateBonus, 0.10, 'flatDestructionRateBonus');
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

    // SkillCondition variant selection must preserve the resolved dr; base = dr * 4 / 100.
    assertAlmostEqual(result.breakdown.baseDestruction, expectedDr * 4 / 100, `${childId}.baseDestruction`);
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

    // DamageRateChangeAttackSkill uses multipliers.dr normally and value[0] only on weak hit.
    assertAlmostEqual(normal.breakdown.baseDestruction, normalDr * 4 / 100, `${skillId}.normal`);
    assertAlmostEqual(weak.breakdown.baseDestruction, weakDr * 4 / 100, `${skillId}.weak`);
  }
});
