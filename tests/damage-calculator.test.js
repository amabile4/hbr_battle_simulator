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
  const fixtures = readJson('tests/fixtures/test_cases_fixed.json');

  for (const fixture of fixtures) {
    const actual = calculateDamage(fixture.input, data);
    assertDamageResultMatches(actual, fixture.expected, fixture.name);
  }
});

test('calculateDamage exposes the resolved skill used by the calculation', () => {
  const data = loadDamageCalculationData();
  const input = createOfficialCategoryInput();
  const actual = calculateDamage(input, data);

  assert.deepEqual(actual.breakdown.resolvedSkill, {
    id: Number(input.skill.skillId),
    name: input.skill.name,
    isNormalAttack: false,
  });
});

test('calculateDamage resolves SkillSwitch child variants by skill id', () => {
  const data = loadDamageCalculationData();
  const input = createOfficialCategoryInput({
    attacker: {
      styleId: 1001209,
      stats: {
        str: 598,
        dex: 818,
        wis: 643,
        spr: 632,
        luk: 628,
        con: 629,
      },
    },
    defender: {
      paramBorder: 500,
      isHpTarget: false,
      resistances: {
        Stab: 1,
      },
    },
    skill: {
      skillId: 46001217,
      name: 'コードダクネス',
      level: 10,
    },
  });
  const actual = calculateDamage(input, data);

  assert.deepEqual(actual.breakdown.resolvedSkill, {
    id: 46001217,
    name: 'コードダクネス',
    isNormalAttack: false,
  });
});

test('calculateDamage applies destructionRate only to HP damage', () => {
  const data = loadDamageCalculationData();
  const baseDp = calculateDamage(
    createOfficialCategoryInput({
      defender: { isHpTarget: false, destructionRate: 1 },
    }),
    data
  );
  const boostedDp = calculateDamage(
    createOfficialCategoryInput({
      defender: { isHpTarget: false, destructionRate: 2 },
    }),
    data
  );
  const baseHp = calculateDamage(
    createOfficialCategoryInput({
      defender: { isHpTarget: true, destructionRate: 1 },
    }),
    data
  );
  const boostedHp = calculateDamage(
    createOfficialCategoryInput({
      defender: { isHpTarget: true, destructionRate: 2 },
    }),
    data
  );

  assertAlmostEqual(boostedDp.critical.expected, baseDp.critical.expected, 'dp ignores destruction');
  assertAlmostEqual(boostedHp.critical.expected, baseHp.critical.expected * 2, 'hp applies destruction');
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

test('calculateDamage: MindEye applies to skill attacks on weakness (both normal and crit via buffMultiplier)', () => {
  // 仕様: 心眼はスキル攻撃力アップカテゴリ。弱点スキル攻撃時に通常・クリ両方に影響する。
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
  // 弱点スキル攻撃: MindEye が buffMultiplier に加算され通常・クリ両方が増加
  assertAlmostEqual(actual.breakdown.buffMultiplier, 1.5, 'mindeye.buffMultiplier', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.breakdown.critMindeyeMultiplier, 1, 'mindeye.critMindeyeMult', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.normal.expected / base.normal.expected, 1.5, 'mindeye.normalRatio', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.critical.expected / base.critical.expected, 1.5, 'mindeye.criticalRatio', OFFICIAL_CATEGORY_TOLERANCE);
});

test('calculateDamage: MindEye does not apply to normal attacks (isNormalAttack)', () => {
  // 仕様: 通常攻撃では心眼は乗らない（バフ消費設計との一貫性）
  const data = loadDamageCalculationData();
  const baseInput = createOfficialCategoryInput({ skill: { skillId: null, name: '通常攻撃', level: 10 } });
  const base = calculateDamage(baseInput, data);
  const actual = calculateDamage({
    ...baseInput,
    attacker: { ...baseInput.attacker, statusEffects: [{ statusType: 'MindEye', skillName: '心眼', power: 50 }] },
  }, data);
  // 通常攻撃: MindEye 不適用、通常・クリ両方とも倍率変化なし
  assertAlmostEqual(actual.breakdown.buffMultiplier, 1, 'normalatk.buffMultiplier', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.breakdown.critMindeyeMultiplier, 1, 'normalatk.critMindeyeMult', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.normal.expected / base.normal.expected, 1, 'normalatk.normalRatio', OFFICIAL_CATEGORY_TOLERANCE);
  assertAlmostEqual(actual.critical.expected / base.critical.expected, 1, 'normalatk.criticalRatio', OFFICIAL_CATEGORY_TOLERANCE);
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
    assert.ok(attackPart.parts === undefined); // Check flatten
    assert.ok(Array.isArray(attackPart.power));
    assert.equal(typeof attackPart.diff_for_max, 'number');
  }
});

test('calculateDamage: resolveEffectPower edge cases', () => {
  const data = loadDamageCalculationData();

  // 1. providerStats がある場合、providerWis 未指定でも効果量が変化するケース
  const input1 = createOfficialCategoryInput({
    defender: {
      paramBorder: 500,
      resistances: { Stab: 1.5 },
      statusEffects: [
        {
          statusType: 'Fragile',
          sourceSkillId: 46001304,
          skillLevel: 10,
          providerStats: { wis: 600, luk: 600 },
        }
      ]
    }
  });
  const actual1 = calculateDamage(input1, data);
  assertAlmostEqual(actual1.breakdown.debuffMultiplier, 1.5563, 'providerStats test', OFFICIAL_CATEGORY_TOLERANCE);

  // 2. providerStats なしの場合は、従来どおり providerWis/providerWisOrLuk を使うケース
  const input2 = createOfficialCategoryInput({
    defender: {
      paramBorder: 500,
      resistances: { Stab: 1.5 },
      statusEffects: [
        {
          statusType: 'Fragile',
          sourceSkillId: 46001304,
          skillLevel: 10,
          providerWis: 600,
        }
      ]
    }
  });
  const actual2 = calculateDamage(input2, data);
  assertAlmostEqual(actual2.breakdown.debuffMultiplier, 1.5563, 'providerWis fallback test', OFFICIAL_CATEGORY_TOLERANCE);

  // 3. DefenseDown 系で enemyBorder を渡したときに、境界前後で値が変わるケース
  const input3 = createOfficialCategoryInput({
    defender: {
      paramBorder: 700,
      resistances: { Stab: 1.5 },
      statusEffects: [
        {
          statusType: 'Fragile',
          sourceSkillId: 46001304,
          skillLevel: 10,
          providerStats: { wis: 600, luk: 600 },
        }
      ]
    }
  });
  const actual3 = calculateDamage(input3, data);
  assertAlmostEqual(actual3.breakdown.debuffMultiplier, 1.42, 'enemyBorder boundary clamp test', OFFICIAL_CATEGORY_TOLERANCE);

  // 4. orbLevel > 0 のとき、バフ系とデバフ系でそれぞれ加算が効くケース
  const input4_debuff = createOfficialCategoryInput({
    defender: {
      paramBorder: 500,
      resistances: { Stab: 1.5 },
      statusEffects: [
        {
          statusType: 'Fragile',
          sourceSkillId: 46001304,
          skillLevel: 10,
          orbLevel: 2,
          providerStats: { wis: 600, luk: 600 },
        }
      ]
    }
  });
  const actual4_debuff = calculateDamage(input4_debuff, data);
  assertAlmostEqual(actual4_debuff.breakdown.debuffMultiplier, 1.5773, 'debuff orbLevel test', OFFICIAL_CATEGORY_TOLERANCE);

  const input4_buff = createOfficialCategoryInput({
    attacker: {
      stats: { wis: 300 },
      statusEffects: [
        {
          statusType: 'AttackUp',
          sourceSkillId: 46003603,
          skillLevel: 10,
          orbLevel: 1,
        }
      ]
    }
  });
  const actual4_buff = calculateDamage(input4_buff, data);
  assertAlmostEqual(actual4_buff.breakdown.buffMultiplier, 1.8071128, 'buff orbLevel test', OFFICIAL_CATEGORY_TOLERANCE);

  // 5. power 直接指定 effect が最優先で返るケース
  const input5 = createOfficialCategoryInput({
    defender: {
      paramBorder: 500,
      resistances: { Stab: 1.5 },
      statusEffects: [
        {
          statusType: 'Fragile',
          sourceSkillId: 46001304,
          skillLevel: 10,
          power: 99.9,
          providerStats: { wis: 600, luk: 600 },
        }
      ]
    }
  });
  const actual5 = calculateDamage(input5, data);
  assertAlmostEqual(actual5.breakdown.debuffMultiplier, 1.999, 'power override priority test', OFFICIAL_CATEGORY_TOLERANCE);
});

test('calculateDamage resolves pierceMultiplier', () => {
  const data = loadDamageCalculationData();
  const input = createOfficialCategoryInput({
    attacker: {
      attackPierceUpRate: 0.15,
      breakPierceUpRate: 0.12,
    },
    defender: {
      isHpTarget: true,
      resistances: { Stab: 1.5 },
    },
  });

  // 1. HP target, skill attack -> pierceMultiplier = 1.15
  const resHp = calculateDamage(input, data);
  assertAlmostEqual(resHp.breakdown.pierceMultiplier, 1.15, 'hpTarget.pierceMultiplier');

  // 2. DP target, skill attack -> pierceMultiplier = 1.12
  const inputDp = createOfficialCategoryInput({
    attacker: {
      attackPierceUpRate: 0.15,
      breakPierceUpRate: 0.12,
    },
    defender: {
      isHpTarget: false,
      resistances: { Stab: 1.5 },
    },
  });
  const resDp = calculateDamage(inputDp, data);
  assertAlmostEqual(resDp.breakdown.pierceMultiplier, 1.12, 'dpTarget.pierceMultiplier');

  // 3. Normal attack -> pierceMultiplier = 1.00
  const inputNormal = createOfficialCategoryInput({
    attacker: {
      attackPierceUpRate: 0.15,
      breakPierceUpRate: 0.12,
    },
    defender: {
      isHpTarget: true,
      resistances: { Stab: 1.5 },
    },
    skill: {
      name: '通常攻撃',
      skillId: 46001101,
    },
  });
  const resNormal = calculateDamage(inputNormal, data);
  assertAlmostEqual(resNormal.breakdown.pierceMultiplier, 1.00, 'normalAttack.pierceMultiplier');
});
