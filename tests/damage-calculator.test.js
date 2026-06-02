import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NORMAL_ATTACK_ID_SUFFIX,
  NORMAL_ATTACK_SKILL_NAME,
  PURSUIT_ID_SUFFIX,
  PURSUIT_SKILL_NAME,
  calculateDamage,
  loadDamageCalculationData,
} from '../src/index.js';

const DAMAGE_FIXTURE_TOLERANCE = 1e-4;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertAlmostEqual(actual, expected, label, tolerance = DAMAGE_FIXTURE_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(tolerance, Math.abs(expected) * tolerance),
    `${label}: actual=${actual}, expected=${expected}`
  );
}

function assertDamageResultMatches(actual, expected, scenarioName) {
  for (const resultType of ['normal', 'critical']) {
    for (const key of ['expected', 'min', 'max']) {
      assertAlmostEqual(actual[resultType][key], expected[resultType][key], `${scenarioName}.${resultType}.${key}`);
    }
  }

  for (const key of [
    'baseDamageNormal',
    'baseDamageCrit',
    'buffMultiplier',
    'critMindeyeMultiplier',
    'debuffMultiplier',
    'vulnerabilityMultiplier',
    'resistMultiplier',
    'affinityMultiplier',
    'tokenMultiplier',
    'funnelMultiplier',
  ]) {
    assertAlmostEqual(actual.breakdown[key], expected.breakdown[key], `${scenarioName}.breakdown.${key}`);
  }

  assert.equal(
    actual.breakdown.ignoredEffects.length,
    expected.breakdown.ignoredEffects.length,
    `${scenarioName}.breakdown.ignoredEffects.length`
  );
}

test('calculateDamage matches fixed Python fixtures', () => {
  const data = loadDamageCalculationData();
  const fixtures = readJson('calc/test_cases_fixed.json');

  for (const fixture of fixtures) {
    const actual = calculateDamage(fixture.input, data);
    assertDamageResultMatches(actual, fixture.expected, fixture.name);
  }
});

test('skills master contains resolvable normal attack and pursuit entries', () => {
  const { skills } = loadDamageCalculationData();
  const normalAttacks = skills.filter(
    (skill) => skill.name === NORMAL_ATTACK_SKILL_NAME && String(skill.id).endsWith(NORMAL_ATTACK_ID_SUFFIX)
  );
  const pursuits = skills.filter(
    (skill) => skill.name === PURSUIT_SKILL_NAME && String(skill.id).endsWith(PURSUIT_ID_SUFFIX)
  );

  assert.ok(normalAttacks.length > 0);
  assert.ok(pursuits.length > 0);

  for (const skill of [...normalAttacks, ...pursuits]) {
    assert.equal(skill.target_type, 'Single');
    assert.ok(skill.parts.some((part) => part.skill_type === 'AttackNormal'));
    const attackPart = skill.parts.find((part) => part.skill_type === 'AttackNormal');
    assert.ok(Array.isArray(attackPart.power));
    assert.equal(typeof attackPart.diff_for_max, 'number');
  }
});
