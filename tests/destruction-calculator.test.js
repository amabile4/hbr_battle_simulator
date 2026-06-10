import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDestruction,
  loadDamageCalculationData,
} from '../src/index.js';

const DESTRUCTION_TOLERANCE = 1e-4;

function assertAlmostEqual(actual, expected, label, tolerance = DESTRUCTION_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${label}: actual=${actual}, expected=${expected}`
  );
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
        parts: [{ skill_type: 'AttackSkill' }],
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
  assertAlmostEqual(manualBreak.destructionRate, 1.075, 'manualBreak.destructionRate');
  assertAlmostEqual(manualBreak.breakdown.finalBaseDestruction, 0.15, 'manualBreak.finalBaseDestruction');
  assertAlmostEqual(manualBreak.breakdown.destructionMultiplier, 1.5, 'manualBreak.destructionMultiplier');

  const autoBreak = calculateDestruction({
    ...input,
    hits: [{ damage: 0 }, { damage: 1000 }],
    autoBreak: true
  }, data);
  assertAlmostEqual(autoBreak.destructionRate, 1.075, 'autoBreak.destructionRate');
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
        parts: [{ skill_type: 'AttackSkill' }],
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

  assertAlmostEqual(result.destructionRate, 1.15, 'alreadyBrokenZeroDamage.destructionRate');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.15, 'alreadyBrokenZeroDamage.finalBaseDestruction');
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
        parts: [{ skill_type: 'AttackSkill' }],
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

  // F_tag = 0.25 (no tag)
  // bg30 = fTag * sp * DR = 0.25 * 10 * (1.0 / 25.0) = 0.1
  // blasterCorrection = 2.0 (role) + 0.15 (accessory) = 2.15
  // Since h = 1, blaster slope correction applies: sRatio = 5.0% = 0.05
  // baseDestruction = Math.floor(bg30 * (1.0 + sRatio) * 10000.0) / 10000.0 = Math.floor(0.1 * 1.05 * 10000) / 10000 = 0.105
  // finalBaseDestruction = baseDestruction * (1.0 - destResist) * (1.0 + resonanceBonus) = 0.105 * 1.0 * 1.10 = 0.1155
  // finalDestLimit = 3.0 + 1.0 = 4.0
  // destructionRate = 1.0 + 0.1155 = 1.1155

  assertAlmostEqual(result.destructionRate, 1.1155, 'destructionRate');
  assertAlmostEqual(result.breakdown.baseDestruction, 0.105, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.1155, 'finalBaseDestruction');
  assertAlmostEqual(result.breakdown.blasterCorrection, 2.15, 'blasterCorrection');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.resonanceBonus, 0.10, 'resonanceBonus');
  assertAlmostEqual(result.breakdown.limitExceedBonus, 1.0, 'limitExceedBonus');
});

test('calculateDestruction parses description tags correctly', () => {
  const data = (desc, target_type = 'Single') => ({
    styles: [{ id: 1, role: 'Attacker' }],
    enemies: [],
    skills: [{ id: 100, name: 'T', sp_cost: 10, desc, target_type }],
  });

  const run = (desc, target_type) => {
    const input = {
      attacker: { styleId: 1 },
      defender: { destructionRate: 1, destructionMultiplier: 1 },
      skill: { skillId: 100, name: 'T' },
      hits: [{ damage: 100 }],
      autoBreak: true,
    };
    return calculateDestruction(input, data(desc, target_type)).breakdown.baseDestruction;
  };

  // 1. Tag-less Single (0.25) -> baseDest = 0.25 * 10 * (1/25) = 0.10
  assertAlmostEqual(run('', 'Single'), 0.10, 'tagless-single');
  // 2. Tag-less AoE (0.20) -> baseDest = 0.20 * 10 * (1/25) = 0.08
  assertAlmostEqual(run('', 'All'), 0.08, 'tagless-aoe');

  // 3. [破壊率大] Single (1.00) -> baseDest = 1.00 * 10 * (1/25) = 0.40
  assertAlmostEqual(run('刀を振るう\n[破壊率大]', 'Single'), 0.40, 'large-single');
  // 4. [破壊率大] AoE (0.80) -> baseDest = 0.80 * 10 * (1/25) = 0.32
  assertAlmostEqual(run('刀を振るう\n[破壊率大]', 'All'), 0.32, 'large-aoe');

  // 5. [破壊率特大] Single (1.50) -> baseDest = 1.50 * 10 * (1/25) = 0.60
  assertAlmostEqual(run('大技\n[破壊率特大]', 'Single'), 0.60, 'ex-large-single');
  // 6. [破壊率特大] AoE (1.20) -> baseDest = 1.20 * 10 * (1/25) = 0.48
  assertAlmostEqual(run('大技\n[破壊率特大]', 'All'), 0.48, 'ex-large-aoe');

  // 7. [破壊率超特大] Single (2.00) -> baseDest = 2.00 * 10 * (1/25) = 0.80
  assertAlmostEqual(run('超大技\n[破壊率超特大]', 'Single'), 0.80, 'super-ex-large-single');
  // 8. [破壊率超特大] AoE (1.60) -> baseDest = 1.60 * 10 * (1/25) = 0.64
  assertAlmostEqual(run('超大技\n[破壊率超特大]', 'All'), 0.64, 'super-ex-large-aoe');

  // 9. [破壊率絶大] Single (2.50) -> baseDest = 2.50 * 10 * (1/25) = 1.00
  assertAlmostEqual(run('絶大技\n[破壊率絶大]', 'Single'), 1.00, 'absolute-single');
});
