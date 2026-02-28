import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from './helpers.js';

test('style/skill lookup and assignment operations work', () => {
  const store = getStore();
  const targetStyle = store.styles.find((style) => Array.isArray(style.skills));

  assert.ok(targetStyle);

  const customSkillId = 99999901;

  store.putSkill({
    id: customSkillId,
    name: 'Test Skill',
    label: 'TestSkill',
    sp_cost: 3,
    consume_type: 'Sp',
    max_level: 1,
    parts: [{ skill_type: 'AttackSkill' }],
  });

  const updatedStyle = store.assignSkillToStyle(targetStyle.id, customSkillId);
  const found = updatedStyle.skills.some((skillRef) => Number(skillRef.id) === customSkillId);

  assert.equal(found, true);
  assert.equal(store.getSkillById(customSkillId).name, 'Test Skill');
});

test('listStylesByCharacter returns styles', () => {
  const store = getStore();
  const style = store.styles[0];
  const items = store.listStylesByCharacter(style.chara_label);

  assert.ok(items.length >= 1);
  assert.ok(items.some((row) => Number(row.id) === Number(style.id)));
});

test('listCharacterCandidates is ordered by team then character order', () => {
  const store = getStore();
  const candidates = store.listCharacterCandidates();

  const teamOrderByName = new Map();
  let nextTeamOrder = 0;
  for (const row of store.characters) {
    const teamRaw = row.team;
    const team = teamRaw === undefined || teamRaw === null ? '' : String(teamRaw);
    if (team && !teamOrderByName.has(team)) {
      teamOrderByName.set(team, nextTeamOrder);
      nextTeamOrder += 1;
    }
  }

  const characterOrderByLabel = new Map(
    store.characters.map((row, index) => [String(row.label ?? ''), index])
  );
  const teamByLabel = new Map(
    store.characters.map((row) => [
      String(row.label ?? ''),
      row.team === undefined || row.team === null ? '' : String(row.team),
    ])
  );

  let prevTeamOrder = Number.NEGATIVE_INFINITY;
  let prevCharacterOrder = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const label = String(candidate.label ?? '');
    const team = teamByLabel.get(label) ?? '';
    const teamOrder = team ? (teamOrderByName.get(team) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    const characterOrder = characterOrderByLabel.get(label) ?? Number.POSITIVE_INFINITY;

    if (teamOrder === prevTeamOrder) {
      assert.ok(
        characterOrder >= prevCharacterOrder,
        `character order should be non-decreasing in the same team: ${label}`
      );
    } else {
      assert.ok(teamOrder >= prevTeamOrder, `team order should be non-decreasing: ${label}`);
    }

    prevTeamOrder = teamOrder;
    prevCharacterOrder = characterOrder;
  }
});

test('listSkillsByStyleId applies restricted/generalize/admiral rules', () => {
  const store = getStore();

  const maruyamaSmiley = 1007205;
  const maruyamaBaseSs = 1007203;
  const rkayamoriBaseSs = 1001103;
  const rkayamoriAdmiral = 1001111;

  const smileySkills = store.listSkillsByStyleId(maruyamaSmiley).map((s) => Number(s.id));
  const baseSsSkills = store.listSkillsByStyleId(maruyamaBaseSs).map((s) => Number(s.id));
  const rkBaseSkills = store.listSkillsByStyleId(rkayamoriBaseSs).map((s) => Number(s.id));
  const rkAdmiralSkills = store.listSkillsByStyleId(rkayamoriAdmiral).map((s) => Number(s.id));

  assert.equal(smileySkills.includes(46007214), true, 'normal skill should be shared across styles');
  assert.equal(
    smileySkills.includes(46007206),
    true,
    'restricted skill from generalized basic style should be transferable'
  );
  assert.equal(
    baseSsSkills.includes(46007210),
    false,
    'restricted skill from non-generalized style should not be transferable'
  );
  assert.equal(
    rkBaseSkills.includes(46001134),
    false,
    '指揮行動 should not be usable on non-Admiral style'
  );
  assert.equal(
    rkAdmiralSkills.includes(46001134),
    true,
    '指揮行動 should be usable on Admiral style'
  );
});

test('skill usage rule resolves range and fixed-limited counts', () => {
  const store = getStore();

  const jinrai = store.getSkillUsageRule(46001112);
  const nagareboshi = store.getSkillUsageRule(46001120);

  assert.equal(jinrai.mode, 'range');
  assert.equal(jinrai.minUses, 4);
  assert.equal(jinrai.maxUses, 6);
  assert.equal(jinrai.displayUses, 6);
  assert.equal(jinrai.expandable, true);

  assert.equal(nagareboshi.mode, 'fixed_limited');
  assert.equal(nagareboshi.displayUses, 4);
  assert.equal(nagareboshi.maxUses, 4);
  assert.equal(nagareboshi.expandable, false);
});

test('style skill list includes master/orb skills and can toggle orb skills', () => {
  const store = getStore();

  const megumiAStyleId = 1001301; // MAikawa
  const skillIdsDefault = store.listSkillsByStyleId(megumiAStyleId).map((s) => Number(s.id));
  const masterSkill = store.listSkillsByStyleId(megumiAStyleId).find((s) => Number(s.id) === 46501301);
  const orbSkill = store.listSkillsByStyleId(megumiAStyleId).find((s) => Number(s.id) === 46300007);

  assert.equal(skillIdsDefault.includes(46501301), true, 'master skill should be selectable');
  assert.equal(skillIdsDefault.includes(46300007), true, 'orb skill should be selectable');
  assert.equal(skillIdsDefault.includes(46001391), false, 'pursuit should not be command-selectable');
  assert.equal(masterSkill?.sourceType, 'master');
  assert.equal(orbSkill?.sourceType, 'orb');

  store.setSkillAvailability({ includeOrbSkills: false });
  const skillIdsNoOrb = store.listSkillsByStyleId(megumiAStyleId).map((s) => Number(s.id));
  assert.equal(skillIdsNoOrb.includes(46501301), true, 'master skill should remain selectable');
  assert.equal(skillIdsNoOrb.includes(46300007), false, 'orb skill should be hidden when disabled');

  store.setSkillAvailability({ includeOrbSkills: true });
  const skillIdsOrbBack = store.listSkillsByStyleId(megumiAStyleId).map((s) => Number(s.id));
  assert.equal(skillIdsOrbBack.includes(46300007), true, 'orb skill should reappear when enabled');
});

test('triggered skill list keeps pursuit skills for future simulation', () => {
  const store = getStore();
  const megumiAStyleId = 1001301;

  const triggeredSkillIds = store.listTriggeredSkillsByStyleId(megumiAStyleId).map((s) => Number(s.id));
  assert.equal(triggeredSkillIds.includes(46001391), true, 'pursuit should be retained as triggered');
});
