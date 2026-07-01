import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { calculateDestruction, loadDamageCalculationData } from '../src/index.js';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const FIXTURE_PATH = path.join(ROOT_DIR, 'tests/fixtures/test_cases_destruction_large.json');
const METADATA_PATH = path.join(ROOT_DIR, 'tests/fixtures/test_cases_destruction_large.meta.json');
const SKILL_MAPPING_PATH = path.join(ROOT_DIR, 'tests/fixtures/skill_sp_mapping.json');
const SYNC_METADATA_PATH = path.join(ROOT_DIR, 'json/_sync_metadata.json');
const SEED = 20260701;
const CASE_COUNT = 1000;
const GENERATOR_VERSION = 1;
const ATTACK_SKILL_TYPES = new Set([
  'AttackNormal',
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'PenetrationNormalAttack',
  'PenetrationSkill',
  'TokenAttack',
  'AttackBySp',
  'AttackByOwnDpRate',
  'FixedHpDamageRateAttack',
]);
const CALC_CORE_FILES = [
  'src/domain/damage-calculator.js',
  'src/domain/destruction-calculator.js',
  'src/domain/calculator-helpers.js',
  'src/contracts/damage-calculation.js',
  'src/data/damage-calculation-data.js',
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hashFile(relativePath) {
  return sha256(readFileSync(path.join(ROOT_DIR, relativePath)));
}

function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  if (values.length === 0) {
    throw new Error('Cannot choose from an empty collection.');
  }
  return values[Math.floor(random() * values.length)];
}

function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(random, min, max, digits = 2) {
  return Number((min + random() * (max - min)).toFixed(digits));
}

function flattenParts(parts = []) {
  const flattened = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    flattened.push(part);
    for (const nested of Array.isArray(part.strval) ? part.strval : []) {
      if (nested && typeof nested === 'object' && Array.isArray(nested.parts)) {
        flattened.push(...flattenParts(nested.parts));
      }
    }
  }
  return flattened;
}

function cleanSkillName(skillName) {
  return String(skillName ?? '')
    .replace('[単独発動]', '')
    .split('[')[0]
    .split('(')[0]
    .split('（')[0]
    .trim();
}

function calculateFixtureExpected(input, data, spMapping) {
  const skillName = input.skill.name;
  const cleanName = cleanSkillName(skillName);
  let realSkill = data.skills.find((skill) => skill.name === cleanName) ?? null;
  if (!realSkill && skillName.includes('通常攻撃')) {
    realSkill = data.skills.find((skill) => skill.name === '通常攻撃' && String(skill.id).endsWith('01')) ?? null;
  }
  if (!realSkill && skillName.includes('追撃')) {
    realSkill = data.skills.find((skill) => skill.name === '追撃' && String(skill.id).endsWith('91')) ?? null;
  }

  const mappingInfo = spMapping[skillName] ?? spMapping[cleanName] ?? null;
  let sp = 4;
  if (mappingInfo?.sp !== undefined && mappingInfo.sp !== null && mappingInfo.sp !== '-') {
    sp = Number.parseFloat(mappingInfo.sp);
  } else if (realSkill) {
    sp = Number.parseFloat(realSkill.sp_cost ?? realSkill.spCost ?? 4);
  }

  let isNormalAttack = skillName.includes('通常攻撃');
  let isPursuit = skillName.includes('追撃');
  if (mappingInfo) {
    if (mappingInfo.is_normal_attack !== undefined) {
      isNormalAttack = Boolean(mappingInfo.is_normal_attack);
    }
    if (mappingInfo.is_pursuit !== undefined) {
      isPursuit = Boolean(mappingInfo.is_pursuit);
    }
  }

  const mockSkill = realSkill
    ? {
        ...realSkill,
        sp_cost: isNormalAttack || isPursuit ? 0 : sp,
      }
    : {
        id: isNormalAttack ? 46001101 : (isPursuit ? 46001191 : 99999999),
        name: cleanName,
        sp_cost: isNormalAttack || isPursuit ? 0 : sp,
        hit_count: 1,
        parts: [{ skill_type: 'AttackSkill', multipliers: { dr: 13.8 } }],
      };

  const normalizedInput = {
    ...input,
    attacker: {
      ...input.attacker,
      accessoryDestructionRateBonus: Number(input.attacker?.accessoryDestructionRateBonus ?? 0),
    },
    autoBreak: true,
    skill: {
      ...input.skill,
      skillId: mockSkill.id,
      name: mockSkill.name,
      spCostOverride: sp,
      isNormalAttack,
      isPursuit,
    },
  };

  return calculateDestruction(normalizedInput, {
    styles: data.styles,
    enemies: data.enemies,
    skills: [mockSkill],
  });
}

function buildCases() {
  const random = createPrng(SEED);
  const data = loadDamageCalculationData(ROOT_DIR);
  const spMapping = JSON.parse(readFileSync(SKILL_MAPPING_PATH, 'utf8'));
  const styles = [...data.styles].sort((left, right) => Number(left.id) - Number(right.id));
  const enemies = [...data.enemies].sort((left, right) => Number(left.id) - Number(right.id));
  const attackSkills = data.skills
    .filter((skill) => flattenParts(skill.parts).some((part) => ATTACK_SKILL_TYPES.has(part.skill_type)))
    .sort((left, right) => Number(left.id) - Number(right.id));
  const skills = [
    ...attackSkills,
    { id: 46001101, name: '通常攻撃' },
    { id: 46001191, name: '追撃' },
  ];

  if (styles.length === 0 || enemies.length === 0 || attackSkills.length === 0) {
    throw new Error('Required styles, enemies, or attack skills are empty.');
  }

  return Array.from({ length: CASE_COUNT }, (_, index) => {
    const style = pick(random, styles);
    const enemy = pick(random, enemies);
    const skill = pick(random, skills);
    const statusEffects = [];
    const buffCount = randomInt(random, 0, 3);
    for (let buffIndex = 0; buffIndex < buffCount; buffIndex++) {
      statusEffects.push({
        statusType: 'DestructionUp',
        power: randomFloat(random, 5, 120),
        skillName: `BuffSkill${randomInt(random, 1, 5)}`,
      });
    }
    if (random() < 0.3) {
      statusEffects.push({
        statusType: pick(random, ['AttackUp', 'CritRateUp', 'MindEye']),
        power: 30,
        skillName: 'IgnoredSkill',
      });
    }
    const defenderStatusEffects = random() < 0.3
      ? [{ statusType: 'DefenseDown', power: 30, skillName: 'DebuffSkill' }]
      : [];
    const hits = Array.from({ length: randomInt(random, 1, 12) }, () => ({
      damage: randomFloat(random, 0, 150000),
      isMultiHit: random() < 0.5,
      hitRatio: randomFloat(random, 0.05, 1),
    }));
    const input = {
      attacker: {
        characterId: style.chara ?? style.chara_label ?? 'Unknown',
        styleId: style.id,
        accessories: [],
        accessoryDestructionRateBonus: random() < 0.2 ? pick(random, [0.10, 0.12, 0.15]) : 0,
        statusEffects,
      },
      defender: {
        enemyId: enemy.id,
        enemyName: enemy.name ?? 'Unknown',
        destructionRate: randomFloat(random, 1, 3, 4),
        destructionLimit: random() < 0.5 ? null : randomFloat(random, 3, 5),
        dp: randomFloat(random, 0, 300000),
        destructionResist: randomFloat(random, 0, 0.5, 4),
        statusEffects: defenderStatusEffects,
      },
      skill: {
        skillId: skill.id,
        name: skill.name,
      },
      hits,
      autoBreak: true,
    };

    return {
      name: `Deterministic Case ${String(index).padStart(4, '0')}`,
      input,
      expected: calculateFixtureExpected(input, data, spMapping),
    };
  });
}

function buildMetadata(fixtureText) {
  const syncMetadata = JSON.parse(readFileSync(SYNC_METADATA_PATH, 'utf8'));
  return {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    generator: 'scripts/generate-destruction-large-fixtures.mjs',
    generationCommand: 'npm run generate:calc-fixtures',
    checkCommand: 'npm run check:calc-fixtures',
    algorithm: 'mulberry32',
    seed: SEED,
    caseCount: CASE_COUNT,
    inputDataVersion: {
      generatedAt: syncMetadata.generated_at,
      datasets: Object.fromEntries(
        ['styles.json', 'enemies.json', 'skills.json'].map((name) => [
          name,
          syncMetadata.datasets?.[name]?.sha256 ?? null,
        ])
      ),
      skillSpMappingSha256: hashFile('tests/fixtures/skill_sp_mapping.json'),
    },
    calcCoreSha256: Object.fromEntries(
      CALC_CORE_FILES.map((file) => [file, hashFile(file)])
    ),
    fixtureSha256: sha256(fixtureText),
  };
}

function generateArtifacts() {
  const cases = buildCases();
  if (cases.length !== CASE_COUNT) {
    throw new Error(`Expected ${CASE_COUNT} cases, generated ${cases.length}.`);
  }
  const fixtureText = JSON.stringify(cases);
  const metadataText = JSON.stringify(buildMetadata(fixtureText));
  return { fixtureText, metadataText };
}

function checkFile(filePath, expectedText) {
  if (!existsSync(filePath)) return false;
  return readFileSync(filePath, 'utf8') === expectedText;
}

const writeMode = process.argv.includes('--write');
const checkMode = process.argv.includes('--check');
if (writeMode === checkMode) {
  throw new Error('Specify exactly one of --write or --check.');
}

const { fixtureText, metadataText } = generateArtifacts();
if (writeMode) {
  writeFileSync(FIXTURE_PATH, fixtureText);
  writeFileSync(METADATA_PATH, metadataText);
  console.log(`Generated ${CASE_COUNT} deterministic destruction fixtures (seed=${SEED}).`);
} else {
  const fixtureMatches = checkFile(FIXTURE_PATH, fixtureText);
  const metadataMatches = checkFile(METADATA_PATH, metadataText);
  if (!fixtureMatches || !metadataMatches) {
    console.error('Deterministic destruction fixtures are stale. Run: npm run generate:calc-fixtures');
    process.exitCode = 1;
  } else {
    console.log(`Verified ${CASE_COUNT} deterministic destruction fixtures (seed=${SEED}).`);
  }
}
