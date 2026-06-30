import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateDamage, loadDamageCalculationData } from '../src/index.js';
import { calculateDestruction } from '../src/domain/destruction-calculator.js';
import { buildDamageCalculationInput } from '../src/domain/damage-calculator-input-builder.js';

const TOLERANCE = 1e-9;

function assertAlmostEqual(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= Math.max(TOLERANCE, Math.abs(expected) * TOLERANCE),
    `${label}: actual=${actual}, expected=${expected}`
  );
}

function createInput(overrides = {}) {
  return {
    attacker: {
      characterId: 'PIERCE_TEST',
      styleId: 1010103,
      tokenCount: 0,
      stats: { str: 675, dex: 675, wis: 675, spr: 675, luk: 675, con: 675 },
      statusEffects: [],
      ...(overrides.attacker ?? {}),
    },
    defender: {
      enemyId: 13000001,
      paramBorder: 770,
      destructionRate: 1,
      isHpTarget: true,
      resistances: { Stab: 1.5 },
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
  };
}

test('calculateDamage: attackPierceUpRate は HP対象のみ乗算される', () => {
  const data = loadDamageCalculationData();
  const base = calculateDamage(createInput(), data);
  const withPierce = calculateDamage(
    createInput({ attacker: { attackPierceUpRate: 0.15 } }),
    data
  );

  assertAlmostEqual(
    withPierce.normal.expected,
    base.normal.expected * 1.15,
    'HP対象 normal 期待値'
  );
  assertAlmostEqual(
    withPierce.critical.expected,
    base.critical.expected * 1.15,
    'HP対象 critical 期待値'
  );
  assert.equal(withPierce.breakdown.pierceMultiplier, 1.15);

  // DP対象（isHpTarget: false）にはアタックピアスは効かない
  const baseDp = calculateDamage(createInput({ defender: { isHpTarget: false } }), data);
  const dpWithAttackPierce = calculateDamage(
    createInput({
      attacker: { attackPierceUpRate: 0.15 },
      defender: { isHpTarget: false },
    }),
    data
  );
  assertAlmostEqual(dpWithAttackPierce.normal.expected, baseDp.normal.expected, 'DP対象には非適用');
  assert.equal(dpWithAttackPierce.breakdown.pierceMultiplier, 1);
});

test('calculateDamage: breakPierceUpRate は DP対象のみ乗算される', () => {
  const data = loadDamageCalculationData();
  const baseDp = calculateDamage(createInput({ defender: { isHpTarget: false } }), data);
  const withPierce = calculateDamage(
    createInput({
      attacker: { breakPierceUpRate: 0.12 },
      defender: { isHpTarget: false },
    }),
    data
  );
  assertAlmostEqual(
    withPierce.normal.expected,
    baseDp.normal.expected * 1.12,
    'DP対象 normal 期待値'
  );

  // HP対象にはブレイクピアスは効かない
  const baseHp = calculateDamage(createInput(), data);
  const hpWithBreakPierce = calculateDamage(
    createInput({ attacker: { breakPierceUpRate: 0.12 } }),
    data
  );
  assertAlmostEqual(hpWithBreakPierce.normal.expected, baseHp.normal.expected, 'HP対象には非適用');
});

test('calculateDamage: 通常攻撃にはピアス乗数を適用しない', () => {
  const data = loadDamageCalculationData();
  const skills = data?.skills ?? [];
  const normalAttack = skills.find(
    (skill) => skill?.name === '通常攻撃' && String(skill?.id ?? '').endsWith('999')
  );
  if (!normalAttack) {
    // データに通常攻撃が見つからない場合はガードのみ確認
    assert.ok(true);
    return;
  }
  const base = calculateDamage(
    createInput({ skill: { skillId: normalAttack.id, name: normalAttack.name, level: 1 } }),
    data
  );
  const withPierce = calculateDamage(
    createInput({
      attacker: { attackPierceUpRate: 0.15 },
      skill: { skillId: normalAttack.id, name: normalAttack.name, level: 1 },
    }),
    data
  );
  assertAlmostEqual(withPierce.normal.expected, base.normal.expected, '通常攻撃は非適用');
  assert.equal(withPierce.breakdown.pierceMultiplier, 1);
});

test('buildDamageCalculationInput: damageContext のピアス ratio が attacker へ伝搬する', () => {
  const damageContext = {
    actorCharacterId: 'PIERCE_TEST',
    actorStyleId: 1010103,
    skillId: 46001107,
    skillName: '星火燎原',
    targetEnemyIndex: 0,
    attackPierceUpRate: 0.1389,
    breakPierceUpRate: 0.05,
  };
  const input = buildDamageCalculationInput(damageContext, { role: 'Attacker' }, {});
  assert.equal(input.attacker.attackPierceUpRate, 0.1389);
  assert.equal(input.attacker.breakPierceUpRate, 0.05);
});

test('calculateDestruction: accessoryDestructionRateBonus がヒット数傾斜（上昇型）で破壊率に寄与する', () => {
  // 非 blaster role 前提: blasterCorrection = accessoryBonus のみ。
  // slopePct = 5 + ((p - 5) * (h - 1)) / 9 が仕様式Bと一致することを確認する。
  const buildInput = (accessoryBonus, hitCount) => ({
    attacker: {
      styleId: 0,
      role: 'Attacker',
      statusEffects: [],
      accessoryDestructionRateBonus: accessoryBonus,
    },
    defender: {
      enemyId: null,
      destructionRate: 1.0,
      destructionLimit: 3.0,
      destructionMultiplier: 1.0,
      dp: 0,
    },
    skill: { skillId: 0, name: 'テストスキル', isNormalAttack: false },
    hits: Array.from({ length: hitCount }, () => ({ damage: 1, isBreakHit: false })),
    autoBreak: false,
  });

  // skill 不明時は sp=4, dr=1, destMult=1 → bg30 = 0.04（破壊済み全ヒット加算）。
  // p=15%: slopePct = 5 + (10 * (h - 1)) / 9（仕様式B）
  // baseDestruction = floor(0.04 * (1 + slopePct/100) * 10000) / 10000
  const expectedGainByHit = { 1: 0.042, 5: 0.0437, 10: 0.046 };
  const data = { skills: [], enemies: [], styles: [] };

  for (const [hitCount, expectedGain] of Object.entries(expectedGainByHit)) {
    const h = Number(hitCount);
    const base = calculateDestruction(buildInput(0, h), data);
    const withBlast = calculateDestruction(buildInput(0.15, h), data);

    assertAlmostEqual(base.destructionRate, 1.04, `hit=${h}: 基準破壊率`);
    assertAlmostEqual(
      withBlast.destructionRate,
      1 + expectedGain,
      `hit=${h}: ブラストピアス +15% 適用後破壊率`
    );
    assert.equal(withBlast.breakdown.accessoryBonus, 0.15, `hit=${h}: accessoryBonus`);
  }
});

test('calculateDestruction: flatDestructionRateBonus（エンシェントチェーン）はヒット数非依存のフラット加算', () => {
  // skill 不明時は sp=4, dr=1, destMult=1 → bg30 = 0.04（破壊済み全ヒット加算）。
  // flat +10%: baseDestruction = floor(0.04 * 1.10 * 10000) / 10000 = 0.044（ヒット数によらず一定）
  const data = { skills: [], enemies: [], styles: [] };
  const buildInput = (flatBonus, hitCount) => ({
    attacker: {
      styleId: 0,
      role: 'Attacker',
      statusEffects: [],
      flatDestructionRateBonus: flatBonus,
    },
    defender: {
      enemyId: null,
      destructionRate: 1.0,
      destructionLimit: 3.0,
      destructionMultiplier: 1.0,
      dp: 0,
    },
    skill: { skillId: 0, name: 'テストスキル', isNormalAttack: false },
    hits: Array.from({ length: hitCount }, () => ({ damage: 1, isBreakHit: false })),
    autoBreak: false,
  });

  for (const hitCount of [1, 5, 10]) {
    const base = calculateDestruction(buildInput(0, hitCount), data);
    const withChain = calculateDestruction(buildInput(0.1, hitCount), data);
    assertAlmostEqual(base.destructionRate, 1.04, `hit=${hitCount}: 基準破壊率`);
    assertAlmostEqual(
      withChain.destructionRate,
      1.044,
      `hit=${hitCount}: フラット+10%適用後（ヒット数非依存）`
    );
    assert.equal(withChain.breakdown.flatDestructionRateBonus, 0.1, `hit=${hitCount}: breakdown`);
  }
});
