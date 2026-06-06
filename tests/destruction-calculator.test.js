import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  calculateDestruction,
  loadDamageCalculationData,
} from '../src/index.js';

const DESTRUCTION_FIXTURE_TOLERANCE = 1e-4;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertAlmostEqual(actual, expected, label, tolerance = DESTRUCTION_FIXTURE_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${label}: actual=${actual}, expected=${expected}`
  );
}

function assertDestructionResultMatches(actual, expected, scenarioName) {
  assertAlmostEqual(actual.destructionRate, expected.destructionRate, `${scenarioName}.destructionRate`);

  for (const key of ['baseDestruction', 'finalBaseDestruction', 'blasterCorrection', 'buffMultiplier']) {
    assertAlmostEqual(actual.breakdown[key], expected.breakdown[key], `${scenarioName}.breakdown.${key}`);
  }
}

const spMapping = readJson('calc/skill_sp_mapping.json');

function injectOverrides(input, data) {
  const skillInput = input.skill || {};
  const skillName = skillInput.name;
  const cleanName = skillName ? skillName.replace('[単独発動]', '').split('[')[0].split('(')[0].split('（')[0].trim() : '';

  const mappingInfo = spMapping[skillName] || spMapping[cleanName];

  let sp = 4.0;
  let isNormalAttack = skillName ? skillName.includes('通常攻撃') : false;
  let isPursuit = skillName ? skillName.includes('追撃') : false;

  const realSkill = data?.skills?.find(s => s.name === cleanName) || null;

  if (mappingInfo) {
    const spVal = mappingInfo.sp;
    if (spVal !== undefined && spVal !== null && spVal !== '-') {
      sp = Number(spVal);
    } else {
      sp = 0.0;
    }
    isNormalAttack = Boolean(mappingInfo.is_normal_attack);
    isPursuit = Boolean(mappingInfo.is_pursuit);
  } else if (realSkill) {
    sp = Number(realSkill.sp_cost ?? realSkill.spCost ?? 4.0);
  }

  return {
    ...input,
    autoBreak: true,
    skill: {
      ...skillInput,
      spCostOverride: sp,
      isNormalAttack,
      isPursuit,
    },
  };
}

test('calculateDestruction matches fixed regression fixtures', () => {
  const data = loadDamageCalculationData();

  const fixtures = readJson('calc/test_cases_destruction.json');

  for (const fixture of fixtures) {
    const actual = calculateDestruction(injectOverrides(fixture.input, data), data);
    assertDestructionResultMatches(actual, fixture.expected, fixture.name);
  }
});

test('calculateDestruction matches randomized large-scale differential tests', () => {
  const data = loadDamageCalculationData();

  const fixtures = readJson('calc/test_cases_destruction_large.json');

  for (const fixture of fixtures) {
    const actual = calculateDestruction(injectOverrides(fixture.input, data), data);
    assertDestructionResultMatches(actual, fixture.expected, fixture.name);
  }
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
