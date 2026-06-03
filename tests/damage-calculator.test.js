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
const OFFICIAL_CATEGORY_TOLERANCE = 1e-9;

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

function createOfficialCategoryInput(overrides = {}) {
  return {
    attacker: {
      characterId: 'DAMAGE_CATEGORY_TEST',
      styleId: 1010103,
      tokenCount: 0,
      stats: {
        str: 675,
        dex: 675,
        wis: 675,
        spr: 675,
        luk: 675,
        con: 675,
      },
      statusEffects: [],
      ...(overrides.attacker ?? {}),
    },
    defender: {
      enemyId: 13000001,
      paramBorder: 770,
      destructionRate: 1,
      isHpTarget: true,
      resistances: {
        Stab: 1.5,
      },
      statusEffects: [],
      ...(overrides.defender ?? {}),
    },
    skill: {
      skillId: 46001107,
      name: '星火燎原',
      level: 10,
      ...(overrides.skill ?? {}),
    },
    activeZone: 'None',
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['attacker', 'defender', 'skill'].includes(key))),
  };
}

test('calculateDamage: MindEye does not affect normal damage, only critical (Excel Y16 confirmed)', () => {
  // Excel セル参照確認済み: Y16 (通常) に AR65 (MindEye) は含まれない
  // ユーザー仕様: 心眼バフは通常攻撃には乗らない
  const data = loadDamageCalculationData();
  const base = calculateDamage(createOfficialCategoryInput(), data);
  const actual = calculateDamage(
    createOfficialCategoryInput({
      attacker: {
        statusEffects: [{ statusType: 'MindEye', skillName: '心眼', power: 50 }],
      },
    }),
    data
  );

  // 通常ダメージは MindEye の影響を受けない
  assertAlmostEqual(actual.normal.expected / base.normal.expected, 1, 'mindeye.normalRatio', OFFICIAL_CATEGORY_TOLERANCE);
  // クリティカルのみ MindEye が乗る: (1.5 + 0.5) / 1.5 ≒ 1.333
  assertAlmostEqual(actual.breakdown.critMindeyeMultiplier, (1.5 + 0.5) / 1.5, 'mindeye.critMultiplier', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.breakdown.buffMultiplier, 1, 'mindeye.buffMultiplier', OFFICIAL_CATEGORY_TOLERANCE);
});

test('calculateDamage adds defense down, element resist down, and fragile in one defense category', () => {
  const data = loadDamageCalculationData();
  const base = calculateDamage(createOfficialCategoryInput(), data);
  const actual = calculateDamage(
    createOfficialCategoryInput({
      defender: {
        resistances: { Stab: 1.5 },
        statusEffects: [
          { statusType: 'DefenseDown', skillName: '防御力ダウン', category: 'NormalDefense', power: 30 },
          { statusType: 'ElementResistDown', skillName: '属性防御力ダウン', category: 'ElementDefense', power: 20 },
          { statusType: 'Fragile', skillName: '脆弱', category: 'NormalFragile', power: 35 },
        ],
      },
    }),
    data
  );

  assertAlmostEqual(actual.breakdown.debuffMultiplier, 1.85, 'official.debuffMultiplier', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(
    actual.breakdown.vulnerabilityMultiplier,
    1,
    'official.vulnerabilityMultiplier',
    OFFICIAL_CATEGORY_TOLERANCE
  );
  assertAlmostEqual(actual.normal.expected / base.normal.expected, 1.85, 'official.normalRatio', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(
    actual.critical.expected / base.critical.expected,
    1.85,
    'official.criticalRatio',
    OFFICIAL_CATEGORY_TOLERANCE
  );
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
