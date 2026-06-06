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

test('loadDamageCalculationData includes spMapping for destruction calculations', () => {
  const data = loadDamageCalculationData();
  assert.ok(data.spMapping);
  assert.equal(typeof data.spMapping, 'object');
  assert.ok(Object.keys(data.spMapping).length > 0);
});

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
    spMapping: {},
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

  assertAlmostEqual(result.destructionRate, 1.1155, 'destructionRate');
  assertAlmostEqual(result.breakdown.baseDestruction, 0.105, 'baseDestruction');
  assertAlmostEqual(result.breakdown.finalBaseDestruction, 0.1155, 'finalBaseDestruction');
  assertAlmostEqual(result.breakdown.blasterCorrection, 2.15, 'blasterCorrection');
  assertAlmostEqual(result.breakdown.accessoryBonus, 0.15, 'accessoryBonus');
  assertAlmostEqual(result.breakdown.resonanceBonus, 0.10, 'resonanceBonus');
  assertAlmostEqual(result.breakdown.limitExceedBonus, 1.0, 'limitExceedBonus');
});
