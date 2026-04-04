import test from 'node:test';
import assert from 'node:assert/strict';

import { getStore, getSixUsableStyleIds } from './helpers.js';
import { buildUsedSkillsByPartyMember } from '../ui-next/utils/used-skills-view.js';
import { isExSkillByLabel } from '../src/domain/skill-classifiers.js';

function createTurnEngineManagerStub(store, styleIds, turns) {
  return {
    initialState: {
      party: styleIds.map((styleId, partyIndex) => {
        const style = store.getStyleById(styleId);
        return {
          partyIndex,
          styleId,
          styleName: String(style?.name ?? ''),
          characterName: String(style?.chara ?? ''),
        };
      }),
    },
    replayScript: {
      turns,
    },
  };
}

function findSkillByCategory(store, styleId, category) {
  const skills = store.listSkillsByStyleId(styleId);
  return skills.find((skill) => {
    const skillId = Number(skill?.id);
    const fullSkill = Number.isFinite(skillId) ? store.getSkillById(skillId) : null;
    const isPassive = fullSkill ? store.isPassiveSkill(fullSkill) : false;
    const isNormalAttack = String(skill?.name ?? '') === '通常攻撃';
    const isUsableActive = !isPassive && !isNormalAttack && skillId !== 0;
    const sourceType = String(skill?.sourceType ?? '');
    const sourceStyleId = Number(skill?.sourceMeta?.sourceStyleId);
    if (category === 'style') {
      return sourceType === 'style' && sourceStyleId === Number(styleId) && isUsableActive;
    }
    if (category === 'general') {
      return sourceType === 'style' && Number.isFinite(sourceStyleId) && sourceStyleId !== Number(styleId) && isUsableActive;
    }
    if (category === 'master') {
      return sourceType === 'master';
    }
    if (category === 'orb') {
      return sourceType === 'orb';
    }
    return false;
  }) ?? null;
}

test('buildUsedSkillsByPartyMember keeps party order and aggregates per-character used skills', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const leadStyleId = styleIds[0];
  const leadStyleSkill = findSkillByCategory(store, leadStyleId, 'style');
  const leadOrbSkill = findSkillByCategory(store, leadStyleId, 'orb');

  assert.ok(leadStyleSkill, 'lead style should have at least one style skill');
  assert.ok(leadOrbSkill, 'lead style should have at least one orb skill');

  const turnEngineManager = createTurnEngineManagerStub(store, styleIds, [
    {
      slots: [
        { styleId: leadStyleId, skillId: Number(leadStyleSkill.id) },
      ],
    },
    {
      slots: [
        { styleId: leadStyleId, skillId: Number(leadStyleSkill.id) },
        { styleId: leadStyleId, skillId: Number(leadOrbSkill.id) },
      ],
    },
  ]);

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });

  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((row) => row.partyIndex),
    [0, 1, 2, 3, 4, 5]
  );

  const leadRow = rows[0];
  assert.equal(leadRow.styleId, leadStyleId);
  assert.equal(leadRow.usedSkills.length, 2);

  const styleEntry = leadRow.usedSkills.find((entry) => Number(entry.skillId) === Number(leadStyleSkill.id));
  const orbEntry = leadRow.usedSkills.find((entry) => Number(entry.skillId) === Number(leadOrbSkill.id));

  assert.ok(styleEntry);
  assert.ok(orbEntry);
  assert.equal(styleEntry.category, 'style');
  assert.equal(orbEntry.category, 'orb');

  for (const row of rows.slice(1)) {
    assert.equal(Array.isArray(row.usedSkills), true);
    assert.equal(row.usedSkills.length, 0);
  }
});

test('buildUsedSkillsByPartyMember sorts by category style -> master -> general -> orb when available', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);

  let targetStyleId = null;
  let styleSkill = null;
  let masterSkill = null;
  let generalSkill = null;
  let orbSkill = null;

  for (const styleId of styleIds) {
    const candidateStyleSkill = findSkillByCategory(store, styleId, 'style');
    const candidateMasterSkill = findSkillByCategory(store, styleId, 'master');
    const candidateGeneralSkill = findSkillByCategory(store, styleId, 'general');
    const candidateOrbSkill = findSkillByCategory(store, styleId, 'orb');

    if (candidateStyleSkill && candidateMasterSkill && candidateOrbSkill) {
      targetStyleId = styleId;
      styleSkill = candidateStyleSkill;
      masterSkill = candidateMasterSkill;
      generalSkill = candidateGeneralSkill;
      orbSkill = candidateOrbSkill;
      break;
    }
  }

  assert.ok(targetStyleId != null, 'at least one style with style/master/orb skills should exist');

  const turnEngineManager = createTurnEngineManagerStub(store, styleIds, [
    {
      slots: [
        { styleId: targetStyleId, skillId: Number(orbSkill.id) },
        { styleId: targetStyleId, skillId: Number(masterSkill.id) },
        ...(generalSkill ? [{ styleId: targetStyleId, skillId: Number(generalSkill.id) }] : []),
        { styleId: targetStyleId, skillId: Number(styleSkill.id) },
      ],
    },
  ]);

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });
  const targetRow = rows.find((row) => Number(row.styleId) === Number(targetStyleId));
  assert.ok(targetRow, 'target row should be present');

  const categories = targetRow.usedSkills.map((entry) => entry.category);
  if (generalSkill) {
    assert.deepEqual(categories, ['style', 'master', 'general', 'orb']);
  } else {
    assert.deepEqual(categories, ['style', 'master', 'orb']);
  }
});

test('buildUsedSkillsByPartyMember omits normal attack and Skill#0 and includes equipped passive skills', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const leadStyleId = styleIds[0];
  const leadSkills = store.listSkillsByStyleId(leadStyleId);
  const leadNormalAttack = leadSkills.find((skill) => String(skill?.name ?? '') === '通常攻撃') ?? null;
  const leadPassive = leadSkills.find((skill) => {
    const id = Number(skill?.id);
    if (!Number.isFinite(id)) {
      return false;
    }
    const full = store.getSkillById(id);
    return store.isPassiveSkill(full);
  }) ?? null;
  const leadCombatSkill = leadSkills.find((skill) => {
    const id = Number(skill?.id);
    if (!Number.isFinite(id)) {
      return false;
    }
    if (String(skill?.name ?? '') === '通常攻撃') {
      return false;
    }
    const full = store.getSkillById(id);
    return !store.isPassiveSkill(full);
  }) ?? null;

  assert.ok(leadCombatSkill, 'lead style should have a non-normal-attack active skill');

  const turnEngineManager = createTurnEngineManagerStub(store, styleIds, [
    {
      slots: [
        ...(leadNormalAttack ? [{ styleId: leadStyleId, skillId: Number(leadNormalAttack.id) }] : []),
        { styleId: leadStyleId, skillId: 0 },
        { styleId: leadStyleId, skillId: Number(leadCombatSkill.id) },
      ],
    },
  ]);
  turnEngineManager.replayScript.setup = {
    skillSetsByPartyIndex: {
      0: leadPassive ? [Number(leadPassive.id)] : [],
    },
  };

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });
  const leadRow = rows[0];
  assert.ok(leadRow);

  const names = leadRow.usedSkills.map((entry) => String(entry.name ?? ''));
  assert.equal(names.includes('通常攻撃'), false);
  assert.equal(names.some((name) => name.includes('Skill #0')), false);
  assert.equal(
    leadRow.usedSkills.some((entry) => Number(entry.skillId) === Number(leadCombatSkill.id)),
    true
  );

  if (leadPassive) {
    assert.equal(
      leadRow.equippedPassiveSkills.some((entry) => Number(entry.skillId) === Number(leadPassive.id)),
      true
    );
  }
});

test('buildUsedSkillsByPartyMember prioritizes EX-like skills over normal skills within same category', () => {
  const store = getStore();
  const fallbackStyleIds = getSixUsableStyleIds(store);

  let targetStyleId = null;
  let styleNormal = null;
  let styleEx = null;
  const candidateStyleIds = (store.styles ?? [])
    .map((style) => Number(style?.id))
    .filter((styleId) => Number.isFinite(styleId));
  for (const styleId of candidateStyleIds) {
    const styleSkills = store.listSkillsByStyleId(styleId).filter((skill) => {
      const sourceType = String(skill?.sourceType ?? '');
      const sourceStyleId = Number(skill?.sourceMeta?.sourceStyleId);
      const skillId = Number(skill?.id);
      const full = Number.isFinite(skillId) ? store.getSkillById(skillId) : null;
      const passive = full ? store.isPassiveSkill(full) : false;
      const normalAttack = String(skill?.name ?? '') === '通常攻撃';
      return sourceType === 'style' && sourceStyleId === Number(styleId) && !passive && !normalAttack;
    });

    const exCandidate = styleSkills.find((skill) => isExSkillByLabel(store.getSkillById(Number(skill?.id)) ?? skill)) ?? null;
    const normalCandidate = styleSkills.find((skill) => !isExSkillByLabel(store.getSkillById(Number(skill?.id)) ?? skill)) ?? null;

    if (exCandidate && normalCandidate) {
      targetStyleId = styleId;
      styleEx = exCandidate;
      styleNormal = normalCandidate;
      break;
    }
  }

  assert.ok(targetStyleId != null, 'style with both EX-like and normal style skills should exist');

  const styleIds = [
    targetStyleId,
    ...fallbackStyleIds.filter((styleId) => Number(styleId) !== Number(targetStyleId)).slice(0, 5),
  ];

  const turnEngineManager = createTurnEngineManagerStub(store, styleIds, [
    {
      slots: [
        { styleId: targetStyleId, skillId: Number(styleNormal.id) },
        { styleId: targetStyleId, skillId: Number(styleEx.id) },
      ],
    },
  ]);

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });
  const targetRow = rows.find((row) => Number(row.styleId) === Number(targetStyleId));
  assert.ok(targetRow);

  assert.equal(Number(targetRow.usedSkills[0]?.skillId), Number(styleEx.id));
  assert.equal(Number(targetRow.usedSkills[1]?.skillId), Number(styleNormal.id));
});

test('buildUsedSkillsByPartyMember keeps first-seen order when same category and same EX class', () => {
  const store = getStore();
  const fallbackStyleIds = getSixUsableStyleIds(store);

  let targetStyleId = null;
  let exA = null;
  let exB = null;
  const candidateStyleIds = (store.styles ?? [])
    .map((style) => Number(style?.id))
    .filter((styleId) => Number.isFinite(styleId));

  for (const styleId of candidateStyleIds) {
    const styleSkills = store.listSkillsByStyleId(styleId).filter((skill) => {
      const sourceType = String(skill?.sourceType ?? '');
      const sourceStyleId = Number(skill?.sourceMeta?.sourceStyleId);
      const fullSkill = store.getSkillById(Number(skill?.id)) ?? skill;
      return (
        sourceType === 'style' &&
        sourceStyleId === Number(styleId) &&
        isExSkillByLabel(fullSkill)
      );
    });

    if (styleSkills.length >= 2) {
      targetStyleId = styleId;
      exA = styleSkills[0];
      exB = styleSkills[1];
      if (Number(exA?.id) !== Number(exB?.id)) {
        break;
      }
    }
  }

  assert.ok(targetStyleId != null, 'style with at least two EX-like style skills should exist');
  assert.ok(exA, 'first EX-like skill should exist');
  assert.ok(exB, 'second EX-like skill should exist');
  assert.notEqual(Number(exA.id), Number(exB.id));

  const styleIds = [
    targetStyleId,
    ...fallbackStyleIds.filter((styleId) => Number(styleId) !== Number(targetStyleId)).slice(0, 5),
  ];

  const turnEngineManager = createTurnEngineManagerStub(store, styleIds, [
    {
      slots: [
        { styleId: targetStyleId, skillId: Number(exA.id) },
        { styleId: targetStyleId, skillId: Number(exB.id) },
      ],
    },
  ]);

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });
  const targetRow = rows.find((row) => Number(row.styleId) === Number(targetStyleId));
  assert.ok(targetRow);

  assert.equal(Number(targetRow.usedSkills[0]?.skillId), Number(exA.id));
  assert.equal(Number(targetRow.usedSkills[1]?.skillId), Number(exB.id));
});

test('buildUsedSkillsByPartyMember resolves element/attack icons from style skill metadata when getSkillById misses variant', () => {
  const variantSkillId = 999991;
  const store = {
    listSkillsByStyleId(styleId) {
      if (Number(styleId) !== 5001) {
        return [];
      }
      return [
        {
          id: variantSkillId,
          name: 'コードダクネス(火)',
          sourceType: 'style',
          sourceMeta: { sourceStyleId: 5001 },
          parts: [{ type: 'Stab', elements: ['Fire'] }],
          use_count: [4, 5, 6],
        },
      ];
    },
    resolveSkillName(skillId) {
      return Number(skillId) === variantSkillId ? 'コードダクネス(火)' : null;
    },
    getSkillById() {
      return null;
    },
    resolveCharacterNameByStyleId() {
      return 'テストキャラ';
    },
    resolveStyleName() {
      return 'テストスタイル';
    },
    isPassiveSkill() {
      return false;
    },
    getSkillUsageRule() {
      return { mode: 'range' };
    },
  };

  const turnEngineManager = {
    initialState: {
      party: [
        {
          partyIndex: 0,
          styleId: 5001,
          styleName: 'テストスタイル',
          characterName: 'テストキャラ',
        },
      ],
    },
    replayScript: {
      turns: [
        {
          slots: [{ styleId: 5001, skillId: variantSkillId }],
        },
      ],
      setup: {
        skillSetsByPartyIndex: {},
      },
    },
  };

  const rows = buildUsedSkillsByPartyMember({ store, turnEngineManager });
  const used = rows[0]?.usedSkills?.[0];
  assert.ok(used);
  assert.equal(String(used.attackTypeIcon?.key ?? ''), 'Stab');
  assert.equal((used.elementIcons ?? []).some((icon) => String(icon?.key ?? '') === 'Fire'), true);
});
