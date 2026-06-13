import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { calculateDestruction, loadDamageCalculationData } from '../../src/index.js';

const tolerance = 1e-4;

function isClose(a, b) {
  return Math.abs(a - b) <= Math.max(tolerance, Math.abs(b) * tolerance);
}

try {
  console.log('=== Running JS Destruction Calculator Regression Tests ===');
  const rootDir = join(import.meta.dirname, '../..');
  const data = loadDamageCalculationData(rootDir);

  const runFixture = (fixture, quiet = false) => {
    if (!quiet) {
      console.log(`Running scenario: ${fixture.name}...`);
    }
    const input = fixture.input;
    const expected = fixture.expected;

    const skillName = input.skill.name;
    const cleanName = skillName.replace('[単独発動]', '').split('[')[0].split('(')[0].split('（')[0].trim();

    let realSkill = data.skills.find(s => s.name === cleanName) || null;
    if (!realSkill && skillName.includes('通常攻撃')) {
      realSkill = data.skills.find(s => s.name === '通常攻撃' && String(s.id).endsWith('01')) || null;
    }
    if (!realSkill && skillName.includes('追撃')) {
      realSkill = data.skills.find(s => s.name === '追撃' && String(s.id).endsWith('91')) || null;
    }

    const spMapping = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/skill_sp_mapping.json'), 'utf8'));
    const mappingInfo = spMapping[skillName] || spMapping[cleanName];

    let sp = 4.0;
    if (mappingInfo && mappingInfo.sp !== undefined && mappingInfo.sp !== null && mappingInfo.sp !== '-') {
      sp = parseFloat(mappingInfo.sp);
    } else if (realSkill) {
      sp = parseFloat(realSkill.sp_cost ?? realSkill.spCost ?? 4.0);
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

    const mockSkill = realSkill ? {
      ...realSkill,
      sp_cost: skillName.includes('通常攻撃') ? 0 : (skillName.includes('追撃') ? 0 : sp)
    } : {
      id: skillName.includes('通常攻撃') ? 46001101 : (skillName.includes('追撃') ? 46001191 : 99999999),
      name: cleanName,
      sp_cost: skillName.includes('通常攻撃') ? 0 : (skillName.includes('追撃') ? 0 : sp),
      hit_count: 1,
      parts: [
        {
          skill_type: 'AttackSkill',
          multipliers: { dr: 13.8 }
        }
      ]
    };

    const mockData = {
      styles: data.styles,
      enemies: data.enemies,
      skills: [mockSkill]
    };

    const accessories = input.attacker?.accessories ?? [];
    let accessoryDestructionRateBonus = input.attacker?.accessoryDestructionRateBonus;
    if (accessoryDestructionRateBonus === undefined || accessoryDestructionRateBonus === null) {
      if (accessories.includes('BlastPierce') || accessories.includes('ブラストピアス')) {
        accessoryDestructionRateBonus = 0.15;
      } else {
        accessoryDestructionRateBonus = 0.0;
      }
    }

    const mockInput = {
      ...input,
      attacker: {
        ...input.attacker,
        accessoryDestructionRateBonus
      },
      autoBreak: true,
      skill: {
        ...input.skill,
        skillId: mockSkill.id,
        name: mockSkill.name,
        spCostOverride: sp,
        isNormalAttack,
        isPursuit
      }
    };

    const actual = calculateDestruction(mockInput, mockData);

    let mismatch = false;

    if (!isClose(actual.destructionRate, expected.destructionRate)) {
      console.error(`❌ destructionRate mismatch in ${fixture.name}: actual=${actual.destructionRate} | expected=${expected.destructionRate}`);
      mismatch = true;
    }

    const checkKeys = ['baseDestruction', 'finalBaseDestruction', 'blasterCorrection', 'buffMultiplier', 'accessoryBonus', 'resonanceBonus', 'limitExceedBonus'];
    if (expected.breakdown && expected.breakdown.flatDestructionRateBonus !== undefined) {
      checkKeys.push('flatDestructionRateBonus');
    }
    for (const key of checkKeys) {
      const actVal = actual.breakdown[key] ?? 0;
      const expVal = expected.breakdown[key] ?? 0;
      if (!isClose(actVal, expVal)) {
        console.error(`❌ Breakdown ${key} mismatch in ${fixture.name}: actual=${actVal} | expected=${expVal}`);
        mismatch = true;
      }
    }

    return !mismatch;
  };

  console.log('Loading destruction fixtures...');
  const fixtures = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/test_cases_destruction.json'), 'utf8'));

  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    try {
      if (runFixture(fixture, false)) {
        console.log(`  ✅ PASS`);
        passed++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`❌ Scenario ${fixture.name} crashed:`, e.stack);
      failed++;
    }
  }

  const largeFixturesPath = join(import.meta.dirname, '../fixtures/test_cases_destruction_large.json');
  if (existsSync(largeFixturesPath)) {
    console.log('\nLoading large randomized destruction fixtures...');
    const largeFixtures = JSON.parse(readFileSync(largeFixturesPath, 'utf8'));
    console.log(`Running ${largeFixtures.length} large scenarios...`);
    let largePassed = 0;
    let largeFailed = 0;

    for (const fixture of largeFixtures) {
      try {
        if (runFixture(fixture, true)) {
          largePassed++;
        } else {
          largeFailed++;
        }
      } catch (e) {
        console.error(`❌ Scenario ${fixture.name} crashed:`, e.stack);
        largeFailed++;
      }
    }
    console.log(`Large fixtures: Passed=${largePassed} | Failed=${largeFailed}`);
    passed += largePassed;
    failed += largeFailed;
  }

  console.log(`\nTotal JS Destruction Results: Passed=${passed} | Failed=${failed}`);

  // flatDestructionRateBonus manual validation
  console.log('Running flatDestructionRateBonus manual JS validation...');
  const testInput = {
    attacker: {
      characterId: "手塚咲",
      styleId: 1010103,
      flatDestructionRateBonus: 0.10,
      statusEffects: []
    },
    defender: {
      enemyId: 13000001,
      destructionMultiplier: 1.0,
      dp: 0,
      destructionRate: 1.0
    },
    skill: {
      name: "星の海、航海の果てに",
      spCostOverride: 10
    },
    hits: [
      {
        damage: 1000,
        isMultiHit: false,
        hitRatio: 1.0
      }
    ]
  };
  const testData = {
    styles: data.styles,
    enemies: data.enemies,
    skills: []
  };
  const testRes = calculateDestruction(testInput, testData);
  if (!isClose(testRes.breakdown.baseDestruction, 0.11)) {
    console.error(`❌ flatDestructionRateBonus test failed: actual=${testRes.breakdown.baseDestruction} | expected=0.11`);
    failed++;
  } else {
    console.log('  ✅ flatDestructionRateBonus test passed!');
  }

  if (failed === 0) {
    console.log('🎉 SUCCESS! JS engine matches all destruction scenarios (fixed + large) perfectly!');
    process.exit(0);
  } else {
    process.exit(1);
  }
} catch (e) {
  console.error('Crash in destruction tests:', e);
  process.exit(1);
}
