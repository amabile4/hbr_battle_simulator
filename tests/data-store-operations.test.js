import test from 'node:test';
import assert from 'node:assert/strict';
import { getStore } from './helpers.js';
import { HbrDataStore, createBattleStateFromParty, previewTurn, commitTurn } from '../src/index.js';

const UI_NEXT_YUINA_SWITCH_STYLE_ID = 1004107;
const UI_NEXT_YUINA_SWITCH_PARENT_SKILL_ID = 46004113;
const UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS = Object.freeze({
  LABYRINTH: 46004114,
  SPIRAL: 46004117,
});
const EMBEDDED_NORMAL_ATTACK_STYLE_ID = 1010103;
const RUBY_PERFUME_STYLE_ID = 1007106;
const RUBY_PERFUME_SKILL_ID = 46407101;

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

test('style limit break max depends on tier', () => {
  const store = getStore();
  assert.equal(store.getStyleLimitBreakMax(1001101), 20, 'A max LB should be 20');
  assert.equal(store.getStyleLimitBreakMax(1001106), 10, 'S max LB should be 10');
  assert.equal(store.getStyleLimitBreakMax(1001103), 4, 'SS max LB should be 4');
  assert.equal(store.getStyleLimitBreakMax(1001108), 4, 'SSR max LB should be 4');
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
  assert.equal(
    rkAdmiralSkills.includes(46001101),
    false,
    '通常攻撃 should be hidden on Admiral style'
  );
  assert.equal(rkAdmiralSkills[0], 46001134, '指揮行動 should be the first skill on Admiral style');
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

test('styles.json embedded fallback restores normal attack for selectable list and pursuit for triggered list', () => {
  const store = getStore();

  const selectableSkills = store.listSkillsByStyleId(EMBEDDED_NORMAL_ATTACK_STYLE_ID);
  const selectableNames = selectableSkills.map((skill) => String(skill.name ?? ''));
  const member = store.buildCharacterStyle({
    styleId: EMBEDDED_NORMAL_ATTACK_STYLE_ID,
    partyIndex: 0,
    initialSP: 10,
  });
  const triggeredNames = store
    .listTriggeredSkillsByStyleId(EMBEDDED_NORMAL_ATTACK_STYLE_ID)
    .map((skill) => String(skill.name ?? ''));

  assert.equal(selectableNames[0], '通常攻撃', 'embedded normal attack should be restored and sorted first');
  assert.equal(
    selectableNames.includes('追撃'),
    false,
    'pursuit should remain hidden from command-selectable skill lists'
  );
  assert.equal(member.getActionSkills()[0]?.name, '通常攻撃', 'CharacterStyle should also expose normal attack first');
  assert.equal(
    triggeredNames.includes('追撃'),
    true,
    'embedded pursuit should be restored in triggered skill lists'
  );
});

test('equipable skill list includes passive skills such as ルビー・パフューム', () => {
  const store = getStore();

  const equipableSkills = store.listEquipableSkillsByStyleId(RUBY_PERFUME_STYLE_ID);
  const rubyPerfume = equipableSkills.find((skill) => Number(skill.id) === RUBY_PERFUME_SKILL_ID);

  assert.ok(rubyPerfume, 'equipable list should include Ruby Perfume');
  assert.equal(rubyPerfume.sourceType, 'passive');
  assert.equal(Boolean(rubyPerfume.passive && typeof rubyPerfume.passive === 'object'), true);
});

test('buildCharacterStyle filters equipable passive triggered skills by equippedSkillIds', () => {
  const store = getStore();
  const allEquipableSkillIds = store
    .listEquipableSkillsByStyleId(RUBY_PERFUME_STYLE_ID)
    .map((skill) => Number(skill.id));
  const withoutRubyPerfume = allEquipableSkillIds.filter((skillId) => skillId !== RUBY_PERFUME_SKILL_ID);

  const equippedMember = store.buildCharacterStyle({
    styleId: RUBY_PERFUME_STYLE_ID,
    partyIndex: 0,
    initialSP: 20,
    equippedSkillIds: allEquipableSkillIds,
  });
  const unequippedMember = store.buildCharacterStyle({
    styleId: RUBY_PERFUME_STYLE_ID,
    partyIndex: 0,
    initialSP: 20,
    equippedSkillIds: withoutRubyPerfume,
  });

  assert.equal(
    equippedMember.triggeredSkills.some((skill) => Number(skill.skillId) === RUBY_PERFUME_SKILL_ID),
    true,
    'equipped passive should remain in triggeredSkills'
  );
  assert.equal(
    unequippedMember.triggeredSkills.some((skill) => Number(skill.skillId) === RUBY_PERFUME_SKILL_ID),
    false,
    'unequipped passive should be removed from triggeredSkills'
  );
});

test('distinct-name SkillSwitch variants are expanded into selectable skills', () => {
  const store = getStore();

  const switchSkills = store
    .listSkillsByStyleId(UI_NEXT_YUINA_SWITCH_STYLE_ID)
    .filter((skill) => String(skill.label ?? '').startsWith('YShirakawaSkill54'));

  assert.deepEqual(
    switchSkills.map((skill) => Number(skill.id)),
    [
      UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS.LABYRINTH,
      UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS.SPIRAL,
    ],
    'Yuina switch skill should expose both selectable variants instead of the parent SkillSwitch'
  );
  assert.equal(
    switchSkills.some((skill) => Number(skill.id) === UI_NEXT_YUINA_SWITCH_PARENT_SKILL_ID),
    false,
    'top-level SkillSwitch parent should not remain in selectable list'
  );
});

test('same-name SkillSwitch collapses to first variant and legacy parent id aliases to it', () => {
  const store = getStore();
  const izumiSwitchStyle = store.styles.find((style) =>
    (style.skills ?? []).some((skillRef) => Number(skillRef.id) === 46001215)
  );

  assert.ok(izumiSwitchStyle, 'YIzumi style with SkillSwitch parent should exist in test data');

  const switchSkills = store
    .listSkillsByStyleId(Number(izumiSwitchStyle.id))
    .filter((skill) => String(skill.label ?? '').startsWith('YIzumiSkill56'));
  const member = store.buildCharacterStyle({
    styleId: Number(izumiSwitchStyle.id),
    partyIndex: 0,
    initialSP: 20,
  });
  const state = createBattleStateFromParty(
    store.buildPartyFromStyleIds(
      [Number(izumiSwitchStyle.id), 1001101, 1001301, 1001401, 1001501, 1001701],
      { initialSP: 20 }
    )
  );
  const actor = state.party[0];

  assert.deepEqual(
    switchSkills.map((skill) => Number(skill.id)),
    [46001216],
    'same-name SkillSwitch should keep only the first selectable variant'
  );
  assert.equal(
    member.getSkill(46001215)?.skillId,
    46001216,
    'legacy parent id should resolve to the first selectable variant inside CharacterStyle'
  );

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46001215 },
  });
  const action = preview.actions.find((entry) => entry.characterId === actor.characterId);
  const committed = commitTurn(state, preview);
  const committedAction = committed.committedRecord.actions.find(
    (entry) => entry.characterId === actor.characterId
  );

  assert.equal(action?.skillId, 46001216, 'legacy parent id should preview using the first variant id');
  assert.equal(
    committedAction?.enemyStatusChanges?.some((change) => change.statusType === 'Hacking'),
    true,
    'commit should execute the selected SkillSwitch variant rather than a no-op parent shell'
  );
});

test('legacy parent id for distinct-name SkillSwitch resolves to first selectable variant in preview', () => {
  const store = getStore();
  const state = createBattleStateFromParty(
    store.buildPartyFromStyleIds(
      [UI_NEXT_YUINA_SWITCH_STYLE_ID, 1001101, 1001201, 1001301, 1001401, 1001501],
      { initialSP: 20 }
    )
  );
  const actor = state.party[0];

  const legacyPreview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: UI_NEXT_YUINA_SWITCH_PARENT_SKILL_ID },
  });
  const branchPreview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS.SPIRAL },
  });
  const legacyAction = legacyPreview.actions.find((entry) => entry.characterId === actor.characterId);
  const branchAction = branchPreview.actions.find((entry) => entry.characterId === actor.characterId);

  assert.equal(
    legacyAction?.skillId,
    UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS.LABYRINTH,
    'legacy parent id should fall back to the first selectable variant'
  );
  assert.equal(branchAction?.skillId, UI_NEXT_YUINA_SWITCH_BRANCH_SKILL_IDS.SPIRAL);
  assert.equal(branchAction?.skillName, '蒼焔ノ螺旋', 'selecting the second variant should preserve its distinct name');
});

test('listPassivesByStyleId merges style and passive database entries', () => {
  const store = getStore();
  const tojoLamentStyleId = 1001408; // 哀情のラメント
  const passives = store.listPassivesByStyleId(tojoLamentStyleId);
  const passiveIds = passives.map((p) => Number(p.id));

  assert.equal(passiveIds.includes(57000002), true, 'base overdrive passive should exist');
  assert.equal(passiveIds.includes(100140803), true, 'style-specific passive should be merged');
  assert.equal(
    passives.filter((p) => String(p.name) === '愛嬌').length,
    1,
    'duplicate passive names should be deduplicated by meaning'
  );
});

test('listPassivesByStyleId filters by selected limit break level', () => {
  const store = getStore();

  const aStyle = 1001101; // Attack or Music
  const aLb4 = store.listPassivesByStyleId(aStyle, { limitBreakLevel: 4 }).map((p) => p.name);
  const aLb5 = store.listPassivesByStyleId(aStyle, { limitBreakLevel: 5 }).map((p) => p.name);
  assert.equal(aLb4.includes('疾風'), false, '疾風 should require LB5');
  assert.equal(aLb5.includes('疾風'), true, '疾風 should be acquired at LB5');

  const sStyle = 1001106; // つかの間の安息
  const sLb2 = store.listPassivesByStyleId(sStyle, { limitBreakLevel: 2 }).map((p) => p.name);
  const sLb3 = store.listPassivesByStyleId(sStyle, { limitBreakLevel: 3 }).map((p) => p.name);
  const sLb10 = store.listPassivesByStyleId(sStyle, { limitBreakLevel: 10 }).map((p) => p.name);
  assert.equal(sLb2.includes('吉報'), false, '吉報 should require LB3');
  assert.equal(sLb3.includes('吉報'), true, '吉報 should be acquired at LB3');
  assert.equal(sLb10.includes('危険な火遊び'), true, '危険な火遊び should be acquired at LB10');

  const ssrStyle = 1001108; // The Feel of the Throne
  const ssrLb0 = store.listPassivesByStyleId(ssrStyle, { limitBreakLevel: 0 }).map((p) => p.name);
  const ssrLb1 = store.listPassivesByStyleId(ssrStyle, { limitBreakLevel: 1 }).map((p) => p.name);
  const ssrLb3 = store.listPassivesByStyleId(ssrStyle, { limitBreakLevel: 3 }).map((p) => p.name);
  const ssrLb4 = store.listPassivesByStyleId(ssrStyle, { limitBreakLevel: 4 }).map((p) => p.name);
  assert.equal(ssrLb0.includes('心眼の境地'), true, '心眼の境地 should be acquired at LB0');
  assert.equal(ssrLb0.includes('王の眼差し'), true, '王の眼差し should be acquired at LB0');
  assert.equal(ssrLb1.includes('閃光'), true, '閃光 should be acquired at LB1');
  assert.equal(ssrLb3.includes('万物の強威'), true, '万物の強威 should be acquired at LB3');
  assert.equal(ssrLb4.includes('即応の型'), true, '即応の型 should be acquired at LB4');
});

test('listPassivesByStyleId preserves activation metadata needed by runtime', () => {
  const store = getStore();
  const styleId = 1001108; // The Feel of the Throne

  const passives = store.listPassivesByStyleId(styleId, { limitBreakLevel: 4 });
  const passive = passives.find((item) => String(item.name) === '心眼の境地');

  assert.ok(passive, 'target passive should be resolved from style + lb');
  assert.equal(passive.requiredLimitBreakLevel, 0);
  assert.equal(passive.timing, 'OnPlayerTurnStart');
  assert.equal(passive.condition, 'SpecialStatusCountByType(78)>0 && IsFront()');
  assert.equal(passive.effect, 'NormalBuff_Up');
  assert.equal(passive.activ_rate, 0);
  assert.equal(passive.auto_type, 'None');
  assert.equal(passive.limit, 0);
  assert.equal(passive.sourceType, 'style');
  assert.equal(passive.sourceMeta?.sourceStyleId, styleId);
  assert.equal(Array.isArray(passive.parts), true);
  assert.equal(String(passive.parts?.[0]?.skill_type ?? ''), 'AttackUp');
});

test('listPassivesByStyleId keeps same-name passives when activation metadata differs', () => {
  const store = HbrDataStore.fromRawData({
    characters: [{ id: 1, label: 'TestChar', name: 'Test Char', team: '31A' }],
    styles: [
      {
        id: 1001,
        name: 'Test Style',
        chara: 'Test Char',
        chara_label: 'TestChar',
        tier: 'SS',
        role: 'Attacker',
        elements: [],
        type: 'Slash',
        skills: [{ id: 9001 }],
        passives: [
          {
            id: 8001,
            label: 'Passive.SharedName',
            name: '同名パッシブ',
            timing: 'OnBattleStart',
            condition: 'IsFront()',
            effect: 'HealSp',
            parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
          },
        ],
      },
    ],
    skills: [{ id: 9001, label: 'TestSkill', name: 'Test Skill', sp_cost: 0, consume_type: 'Sp', parts: [] }],
    passives: [
      {
        id: 8002,
        label: 'Passive.SharedName',
        name: '同名パッシブ',
        style: 'Test Style',
        chara: 'Test Char',
        ct: 'SS',
        lb: 0,
        timing: 'OnPlayerTurnStart',
        condition: 'Sp()<=3',
        effect: 'NormalBuff_Up',
        parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.2, 0] }],
      },
    ],
    skillDbSchema: {},
    skillDbDraft: {},
  });

  const passives = store.listPassivesByStyleId(1001, { limitBreakLevel: 0 });

  assert.equal(passives.length, 2);
  assert.deepEqual(
    passives.map((item) => ({
      name: item.name,
      timing: item.timing,
      condition: item.condition,
      effect: item.effect,
    })),
    [
      {
        name: '同名パッシブ',
        timing: 'OnBattleStart',
        condition: 'IsFront()',
        effect: 'HealSp',
      },
      {
        name: '同名パッシブ',
        timing: 'OnPlayerTurnStart',
        condition: 'Sp()<=3',
        effect: 'NormalBuff_Up',
      },
    ]
  );
});

test('listEquipableSkillsByStyleId includes passives as equip-only entries', () => {
  const store = getStore();
  const tojoLamentStyleId = 1001408; // 哀情のラメント
  const equipables = store.listEquipableSkillsByStyleId(tojoLamentStyleId);
  const ids = equipables.map((s) => Number(s.id));
  const siesta = equipables.find((s) => Number(s.id) === 46401401);
  const orbPassive = equipables.find((s) => Number(s.id) === 46450001);

  const rkStyleId = 1001103;
  const rkEquipables = store.listEquipableSkillsByStyleId(rkStyleId);
  const masterPassive = rkEquipables.find((s) => Number(s.id) === 46511101);

  assert.equal(ids.includes(46401401), true, '日陰のシエスタ should be available in equip list');
  assert.equal(siesta?.sourceType, 'passive', 'style passive sourceType should be passive');
  assert.equal(Boolean(siesta?.passive), true, '日陰のシエスタ should keep passive metadata');

  assert.equal(Boolean(orbPassive), true, 'orb passive should be included in equip list');
  assert.equal(orbPassive?.sourceType, 'orb', 'orb passive should keep orb sourceType');
  assert.equal(Boolean(orbPassive?.passive), true, 'orb passive should keep passive metadata');

  assert.equal(Boolean(masterPassive), true, 'master passive should be included in equip list');
  assert.equal(masterPassive?.sourceType, 'master', 'master passive should keep master sourceType');
  assert.equal(Boolean(masterPassive?.passive), true, 'master passive should keep passive metadata');
});

test('skill rule overrides can patch additional turn behavior without hardcoding', () => {
  const store = getStore();
  const gokigen = store.getSkillById(46003115);
  const rule = store.getAdditionalTurnRule(46003115);
  const boryaku = store.getAdditionalTurnRule(46003626);

  assert.equal(gokigen?.name, 'ごきげんダンス');
  assert.equal(
    gokigen?.parts?.[2]?.extra_turn_grant_enabled_in_extra_turn,
    false,
    'override should be merged into AdditionalTurn part'
  );
  assert.equal(rule?.skillUsableInExtraTurn, true, 'skill should remain usable in extra turn');
  assert.equal(
    rule?.additionalTurnGrantInExtraTurn,
    false,
    'additional turn grant should be disabled in extra turn by override'
  );
  assert.equal(rule?.source, 'override');
  assert.equal(
    rule?.additionalTurnTargets?.some(
      (item) => item.targetType === 'Self' && item.targetCondition === 'SpecialStatusCountByType(20) == 0'
    ),
    true,
    'ごきげんダンス should keep AdditionalTurn target_condition in derived targets'
  );
  assert.equal(
    boryaku?.additionalTurnTargets?.some(
      (item) => item.targetType === 'AllySingleWithoutSelf' && item.targetCondition === 'IsFront()==1'
    ),
    true,
    '謀略 should keep front-only AdditionalTurn target_condition in derived targets'
  );
});

test('skill rule overrides can patch nested SkillCondition branch sp_cost without losing variant parts', () => {
  const store = getStore();
  const skill = store.getSkillById(46005616); // レインボーミラクルスライダー
  const branch0 = skill?.parts?.[0]?.strval?.[0];
  const branch1 = skill?.parts?.[0]?.strval?.[1];

  assert.equal(skill?.name, 'レインボーミラクルスライダー');
  assert.equal(branch0?.id, 46005617);
  assert.equal(branch0?.sp_cost, 0, 'override should patch branch-0 sp_cost to 0');
  assert.equal(
    Array.isArray(branch0?.parts) && branch0.parts.length > 0,
    true,
    'branch-0 parts should remain available after override merge'
  );
  assert.equal(branch1?.id, 46005618);
  assert.equal(branch1?.sp_cost, 16, 'branch-1 should keep original sp_cost');
});

test('additional turn rules expose turn-context conditions from skill parts', () => {
  const store = getStore();
  const yatadoru = store.getAdditionalTurnRule(46041501); // 宿る想い
  const tenku = store.getAdditionalTurnRule(46041403); // 天駆の鉄槌
  const sprint = store.getAdditionalTurnRule(46006661); // 快感・スプリント！+

  assert.equal(yatadoru?.skillUsableInExtraTurn, true);
  assert.equal(yatadoru?.additionalTurnGrantInExtraTurn, false);
  assert.equal(
    yatadoru?.conditions?.excludesExtraTurnForAdditionalTurnGrant,
    true,
    '宿る想い should block additional-turn grant while in extra turn'
  );

  assert.equal(tenku?.conditions?.requiresReinforcedMode, true);
  assert.equal(tenku?.conditions?.requiresOverDrive, false);
  assert.equal(tenku?.additionalTurnGrantInExtraTurn, true);

  assert.equal(sprint?.conditions?.requiresOverDrive, true);
});

test('EP rules are loaded from external rule table for Nanase styles', () => {
  const store = getStore();
  const rider = store.buildCharacterStyle({ styleId: 1010203, partyIndex: 0, initialSP: 10 });
  const admiral = store.buildCharacterStyle({ styleId: 1010204, partyIndex: 1, initialSP: 10 });

  assert.equal(rider.ep.max, 10);
  assert.equal(rider.ep.odMax, 10);
  assert.equal(rider.epRule?.turnStartEpDelta, 2);
  assert.equal(admiral.epRule, null, 'Admiral should rely on in-data passives, not override');
});

test('party build rejects multiple Admiral members', () => {
  const store = getStore();
  const admiralStyles = store.styles.filter((style) => String(style.role ?? '') === 'Admiral');
  assert.equal(admiralStyles.length >= 2, true);

  const duplicateAdmirals = [Number(admiralStyles[0].id), Number(admiralStyles[1].id)];
  const usedChara = new Set(
    admiralStyles.slice(0, 2).map((style) => String(style.chara_label ?? ''))
  );

  for (const style of store.styles) {
    const charaLabel = String(style.chara_label ?? '');
    if (
      String(style.role ?? '') === 'Admiral' ||
      usedChara.has(charaLabel) ||
      !Array.isArray(style.skills) ||
      style.skills.length === 0
    ) {
      continue;
    }
    duplicateAdmirals.push(Number(style.id));
    usedChara.add(charaLabel);
    if (duplicateAdmirals.length === 6) {
      break;
    }
  }

  assert.equal(duplicateAdmirals.length, 6);
  assert.throws(
    () => store.buildPartyFromStyleIds(duplicateAdmirals, { initialSP: 10 }),
    /at most one Admiral/
  );
});
