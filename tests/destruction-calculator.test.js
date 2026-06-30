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
  assertAlmostEqual(manualBreak.destructionRate, 1.75, 'manualBreak.destructionRate');
  assertAlmostEqual(manualBreak.breakdown.finalBaseDestruction, 1.5, 'manualBreak.finalBaseDestruction');
  assertAlmostEqual(manualBreak.breakdown.destructionMultiplier, 1.5, 'manualBreak.destructionMultiplier');

  const autoBreak = calculateDestruction({
    ...input,
    hits: [{ damage: 0 }, { damage: 1000 }],
    autoBreak: true
  }, data);
  assertAlmostEqual(autoBreak.destructionRate, 1.75, 'autoBreak.destructionRate');
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

  assertAlmostEqual(result.destructionRate, 2.5, 'alreadyBrokenZeroDamage.destructionRate');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 1.5, 'alreadyBrokenZeroDamage.finalBaseDestruction');
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

  // bg30 = (dr * sp * destMult) / 100.0 = (1.0 * 10.0 * 1.0) / 100.0 = 0.1
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
  assertAlmostEqual(res.breakdown.baseDestruction, 1.1, 'baseDestruction');
  assertAlmostEqual(res.breakdown.flatDestructionRateBonus, 0.10, 'flatDestructionRateBonus');
});
