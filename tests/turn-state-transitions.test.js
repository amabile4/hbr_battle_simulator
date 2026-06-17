import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activateOverdrive,
  analyzePassiveTimingCoverage,
  analyzePassiveConditionSupport,
  applyEnemyAttackMotivationTriggers,
  applyEnemyAttackTokenTriggers,
  applyPassiveTiming,
  CharacterStyle,
  commitTurn,
  createBattleStateFromParty,
  grantExtraTurn,
  Party,
  previewTurn,
  applyInitialPassiveState,
} from '../src/index.js';
import {
  applyEnemyStateOverrideSnapshot,
  applyStageSetupTurnStartEffects,
} from '../src/turn/turn-controller.js';
import { BattleStateManager } from '../ui-next/engine/battle-state-manager.js';
import { getStore, getSixUsableStyleIds } from './helpers.js';

const DIMENSION_BATTLE_DATA = JSON.parse(
  readFileSync(new URL('../json/dimension_battle.json', import.meta.url), 'utf8')
);

function buildActionDict(party) {
  return Object.fromEntries(
    party.getFrontline().map((member) => {
      const skill = member.skills.find((item) => item.spCost > 0) ?? member.skills[0];
      return [
        String(member.position),
        {
          characterId: member.characterId,
          skillId: skill.skillId,
        },
      ];
    })
  );
}

function findStyleIdBySkillId(store, skillId) {
  for (const style of store.styles) {
    if (!Array.isArray(style.skills)) {
      continue;
    }
    if (style.skills.some((s) => Number(s.id ?? s.i) === Number(skillId))) {
      return Number(style.id);
    }
  }
  throw new Error(`style not found for skillId=${skillId}`);
}

function getUniqueTeamStyleIds(store, team, count, excludedStyleIds = []) {
  const excludedIds = new Set(excludedStyleIds.map((id) => Number(id)));
  const excludedChars = new Set(
    excludedStyleIds
      .map((id) => String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? ''))
      .filter(Boolean)
  );
  const picked = [];
  const seenChars = new Set();

  for (const style of store.styles) {
    if (String(style?.team ?? '') !== String(team)) {
      continue;
    }

    const styleId = Number(style.id);
    const charaLabel = String(style?.chara_label ?? style?.chara ?? '');
    if (!Number.isFinite(styleId) || excludedIds.has(styleId) || excludedChars.has(charaLabel) || seenChars.has(charaLabel)) {
      continue;
    }

    seenChars.add(charaLabel);
    picked.push(styleId);
    if (picked.length === count) {
      return picked;
    }
  }

  throw new Error(`Could not find ${count} unique team styles for team=${team}`);
}

function getUniqueNonTeamStyleIds(store, team, count, excludedStyleIds = []) {
  const excludedIds = new Set(excludedStyleIds.map((id) => Number(id)));
  const excludedChars = new Set(
    excludedStyleIds
      .map((id) => String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? ''))
      .filter(Boolean)
  );
  const picked = [];
  const seenChars = new Set();

  for (const style of store.styles) {
    if (String(style?.team ?? '') === String(team)) {
      continue;
    }

    const styleId = Number(style.id);
    const charaLabel = String(style?.chara_label ?? style?.chara ?? '');
    if (!Number.isFinite(styleId) || excludedIds.has(styleId) || excludedChars.has(charaLabel) || seenChars.has(charaLabel)) {
      continue;
    }

    seenChars.add(charaLabel);
    picked.push(styleId);
    if (picked.length === count) {
      return picked;
    }
  }

  throw new Error(`Could not find ${count} unique non-${team} styles`);
}

function getUniqueStyleIdsByPredicate(store, predicate, count, excludedStyleIds = []) {
  const excludedIds = new Set(excludedStyleIds.map((id) => Number(id)));
  const excludedChars = new Set(
    excludedStyleIds
      .map((id) => String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? ''))
      .filter(Boolean)
  );
  const picked = [];
  const seenChars = new Set();

  for (const style of store.styles) {
    const styleId = Number(style?.id);
    const charaLabel = String(style?.chara_label ?? style?.chara ?? '');
    if (
      !Number.isFinite(styleId) ||
      excludedIds.has(styleId) ||
      excludedChars.has(charaLabel) ||
      seenChars.has(charaLabel) ||
      !Array.isArray(style?.skills) ||
      style.skills.length === 0 ||
      !predicate(style)
    ) {
      continue;
    }

    seenChars.add(charaLabel);
    picked.push(styleId);
    if (picked.length === count) {
      return picked;
    }
  }

  throw new Error(`Could not find ${count} styles that satisfy predicate`);
}

function buildSingleSkillRealDataParty(store, skillId, options = {}) {
  const actorStyleId = findStyleIdBySkillId(store, skillId);
  const actorStyle = store.getStyleById(actorStyleId);
  const extraStyleIds = Array.isArray(options.extraStyleIds) ? options.extraStyleIds.map((id) => Number(id)) : [];
  const excludedStyleIds = new Set([actorStyleId, ...extraStyleIds]);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const otherStyleIds = getSixUsableStyleIds(store).filter(
    (id) => !excludedStyleIds.has(Number(id)) && String(store.getStyleById(id)?.chara_label ?? store.getStyleById(id)?.chara ?? '') !== actorCharaLabel
  );
  const styleIds = [actorStyleId, ...extraStyleIds, ...otherStyleIds.slice(0, 5 - extraStyleIds.length)];
  if (styleIds.length !== 6) {
    throw new Error(`Could not build 6-member party for skillId=${skillId}`);
  }

  return store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [skillId],
    },
    ...(options.buildOptions ?? {}),
  });
}

function buildFullSkillRealDataParty(store, skillId, options = {}) {
  const actorStyleId = findStyleIdBySkillId(store, skillId);
  const actorStyle = store.getStyleById(actorStyleId);
  const extraStyleIds = Array.isArray(options.extraStyleIds) ? options.extraStyleIds.map((id) => Number(id)) : [];
  const excludedStyleIds = new Set([actorStyleId, ...extraStyleIds]);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const otherStyleIds = getSixUsableStyleIds(store).filter(
    (id) => !excludedStyleIds.has(Number(id)) && String(store.getStyleById(id)?.chara_label ?? store.getStyleById(id)?.chara ?? '') !== actorCharaLabel
  );
  const styleIds = [actorStyleId, ...extraStyleIds, ...otherStyleIds.slice(0, 5 - extraStyleIds.length)];
  if (styleIds.length !== 6) {
    throw new Error(`Could not build 6-member party for skillId=${skillId}`);
  }

  return store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    ...(options.buildOptions ?? {}),
  });
}

const START_CHARGE_STYLE_ID = 1007505;
const START_CHARGE_LIMIT_BREAK_LEVEL = 3;
const START_CHARGE_PASSIVE_ID = 100750503;
const START_CHARGE_INITIAL_SP = 10;
const START_CHARGE_SP_DELTA = 3;
const START_CHARGE_TURN_SP_DELTA = 1;
const START_CHARGE_CONDITIONAL_TURN_SP_DELTA = 1;
const BUFF_CHARGE_SPECIAL_STATUS_ID = 25;
const ADATE_FUYU_URARA_STYLE_ID = 1005505;
const ADATE_NEGATIVE_STYLE_PASSIVE_ID = 57001170;
const SELF_AID_SKILL_ID = 46300008;
const ALLY_DEBUFF_CLEANSE_SKILL_ID = 46005416;
const NEGATIVE_STATE_SPECIAL_STATUS_ID = 146;
const NEGATIVE_STATE_DURATION_TURNS = 5;
const NIOHSHIMA_PURE_MEMORY_STYLE_ID = 1006206;
const NIOHSHIMA_MAKEUP_PASSIVE_ID = 57001237;
const NIOHSHIMA_ODOR_TOILETTE_SKILL_ID = 46006211;
const QUEEN_HIGH_PRIESTESS_STYLE_ID = 1021203;
const QUEEN_ATOMIC_FLARE_SKILL_ID = 46041206;
const QUEEN_1MORE_LIMIT_BREAK_LEVEL = 1;
const TOJO_FATAL_FEMME_STYLE_ID = 1001409;
const TOJO_MEMENTO_MORI_PLUS_SKILL_ID = 46001461;
const TOJO_CHARMING_GAZE_SKILL_ID = 46001414;
const TOJO_1MORE_PASSIVE_USAGE_KEY = 'TTojo:100140901:1MORE';
const YUINA_ORACLE_FLAG_STYLE_ID = 1004110;
const YUINA_DIVINE_EYE_SKILL_ID = 46004121;
const COMMON_PROTECTION_SKILL_ID = 46300004;
const NIOHSHIMA_ODOR_TOILETTE_BASE_SP_COST = 16;
const NIOHSHIMA_ODOR_TOILETTE_MAKEUP_SP_COST = 8;
const MAKEUP_SPECIAL_STATUS_ID = 164;
const MOCKTAIL_SUPPORT_MAIN_STYLE_ID = 1001108;
const MOCKTAIL_SUPPORT_STYLE_ID = 1006506;
const MOCKTAIL_SUPPORT_LIMIT_BREAK_LEVEL = 4;
const MOCKTAIL_SUPPORT_PASSIVE_ID_LB4 = 57009445;
const MOCKTAIL_SPECIAL_STATUS_ID = 313;
const MOCKTAIL_SUPPORT_LB4_HEAL_UP_RATE = 0.5;
const MOCKTAIL_SUPPORT_LB4_HEAL_MULTIPLIER = 1.5;
const MOCKTAIL_TEST_HEAL_DP_RATE_SKILL_ID = 99031301;
const MOCKTAIL_TEST_BASE_MAX_DP = 100;
const MOCKTAIL_TEST_START_DP = 0;
const MOCKTAIL_TEST_HEAL_DP_RATE = 0.1;
const MOCKTAIL_TEST_HEAL_DP_DELTA = 15;
const FOOD_BUFF_ATTACK_UP_RATE = 0.5;
const FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE = 0.1;
const FOOD_BUFF_TEST_ATTACK_SKILL_ID = 99033001;
const FOOD_BUFF_TEST_NORMAL_ATTACK_SKILL_ID = 99033002;
const DIVA_SKILL_ID = 46001120;
const DIVA_SPECIAL_STATUS_ID = 144;
const DIVA_SKILL_ATTACK_UP_RATE = 0.3;
const BABIED_STYLE_ID = 1005403;
const BABIED_MASTER_SKILL_ID = 46505401;
const BABIED_SPECIAL_STATUS_ID = 258;
const BABIED_SKILL_ATTACK_UP_RATE = 0.3;
const BABIED_OD_GAUGE_GAIN_UP_RATE = 0.2;
const BABIED_DURATION_TURNS = 3;
const BABIED_TEST_ATTACK_SKILL_ID = 99025801;
const BABIED_TEST_NORMAL_ATTACK_SKILL_ID = 99025802;
const BABIED_TEST_ATTACK_HIT_COUNT = 2;
const BABIED_TEST_ATTACK_OD_GAIN = 6;
const FOOD_BUFF_CASES = Object.freeze([
  {
    statusType: 'Steak',
    statusTypeId: 330,
    skillId: 46008114,
    skillName: 'サーブド・アメイジング',
  },
  {
    statusType: 'Curry',
    statusTypeId: 303,
    skillId: 46008409,
    skillName: '饗宴アヌラーガ',
  },
  {
    statusType: 'Gelato',
    statusTypeId: 331,
    skillId: 46008511,
    skillName: '感嘆必至のボナペティート',
  },
  {
    statusType: 'Shchi',
    statusTypeId: 304,
    skillId: 46008611,
    skillName: '召し上がれミラーシュカ',
  },
]);

function buildStartChargeRealDataParty(store, stylePosition) {
  const style = store.getStyleById(START_CHARGE_STYLE_ID);
  const styleCharacterKey = String(style?.chara_label ?? style?.chara ?? '');
  const styleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== START_CHARGE_STYLE_ID &&
        String(candidate?.chara_label ?? candidate?.chara ?? '') !== styleCharacterKey
      );
    })
    .slice(0, 6);
  styleIds[stylePosition] = START_CHARGE_STYLE_ID;

  return store.buildPartyFromStyleIds(styleIds, {
    initialSP: START_CHARGE_INITIAL_SP,
    limitBreakLevelsByPartyIndex: { [stylePosition]: START_CHARGE_LIMIT_BREAK_LEVEL },
  });
}

function buildAdateFuyuUraraSelfAidParty(store) {
  const style = store.getStyleById(ADATE_FUYU_URARA_STYLE_ID);
  const styleCharacterKey = String(style?.chara_label ?? style?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== ADATE_FUYU_URARA_STYLE_ID &&
        String(candidate?.chara_label ?? candidate?.chara ?? '') !== styleCharacterKey
      );
    })
    .slice(0, 5);
  if (fillerStyleIds.length !== 5) {
    throw new Error('Could not build ADate05 real-data party');
  }

  return store.buildPartyFromStyleIds([ADATE_FUYU_URARA_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [SELF_AID_SKILL_ID],
    },
  });
}

function buildAdateFuyuUraraAllyCleanseParty(store) {
  const negativeStyle = store.getStyleById(ADATE_FUYU_URARA_STYLE_ID);
  const cleanseStyleId = findStyleIdBySkillId(store, ALLY_DEBUFF_CLEANSE_SKILL_ID);
  const cleanseStyle = store.getStyleById(cleanseStyleId);
  const excludedCharacterKeys = new Set(
    [negativeStyle, cleanseStyle].map((style) => String(style?.chara_label ?? style?.chara ?? ''))
  );
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== ADATE_FUYU_URARA_STYLE_ID &&
        Number(id) !== Number(cleanseStyleId) &&
        !excludedCharacterKeys.has(String(candidate?.chara_label ?? candidate?.chara ?? ''))
      );
    })
    .slice(0, 4);
  if (fillerStyleIds.length !== 4) {
    throw new Error('Could not build ADate05 ally cleanse party');
  }

  return store.buildPartyFromStyleIds([ADATE_FUYU_URARA_STYLE_ID, cleanseStyleId, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      1: [ALLY_DEBUFF_CLEANSE_SKILL_ID],
    },
  });
}

function buildNiOhshimaMakeupParty(store) {
  const style = store.getStyleById(NIOHSHIMA_PURE_MEMORY_STYLE_ID);
  const styleCharacterKey = String(style?.chara_label ?? style?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== NIOHSHIMA_PURE_MEMORY_STYLE_ID &&
        String(candidate?.chara_label ?? candidate?.chara ?? '') !== styleCharacterKey
      );
    })
    .slice(0, 5);
  if (fillerStyleIds.length !== 5) {
    throw new Error('Could not build NiOhshima06 real-data party');
  }

  return store.buildPartyFromStyleIds([NIOHSHIMA_PURE_MEMORY_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [NIOHSHIMA_ODOR_TOILETTE_SKILL_ID],
    },
  });
}

function buildRmurohushiBabiedParty(store) {
  const style = store.getStyleById(BABIED_STYLE_ID);
  const styleCharacterKey = String(style?.chara_label ?? style?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== BABIED_STYLE_ID &&
        String(candidate?.chara_label ?? candidate?.chara ?? '') !== styleCharacterKey
      );
    })
    .slice(0, 5);
  if (fillerStyleIds.length !== 5) {
    throw new Error('Could not build RMurohushi Babied real-data party');
  }

  return store.buildPartyFromStyleIds([BABIED_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [BABIED_MASTER_SKILL_ID],
    },
  });
}

function buildMocktailSupportParty(store) {
  const mainStyle = store.getStyleById(MOCKTAIL_SUPPORT_MAIN_STYLE_ID);
  const supportStyle = store.getStyleById(MOCKTAIL_SUPPORT_STYLE_ID);
  const excludedCharacterKeys = new Set(
    [mainStyle, supportStyle].map((style) => String(style?.chara_label ?? style?.chara ?? ''))
  );
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((id) => {
      const candidate = store.getStyleById(id);
      return (
        Number(id) !== MOCKTAIL_SUPPORT_MAIN_STYLE_ID &&
        Number(id) !== MOCKTAIL_SUPPORT_STYLE_ID &&
        !excludedCharacterKeys.has(String(candidate?.chara_label ?? candidate?.chara ?? ''))
      );
    })
    .slice(0, 5);
  if (fillerStyleIds.length !== 5) {
    throw new Error('Could not build Mocktail support real-data party');
  }

  return store.buildPartyFromStyleIds([MOCKTAIL_SUPPORT_MAIN_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    supportStyleIdsByPartyIndex: {
      0: MOCKTAIL_SUPPORT_STYLE_ID,
    },
    supportLimitBreakLevelsByPartyIndex: {
      0: MOCKTAIL_SUPPORT_LIMIT_BREAK_LEVEL,
    },
  });
}

function addMocktailTestHealSkill(actor) {
  actor.skills = Object.freeze([...actor.skills, {
    skillId: MOCKTAIL_TEST_HEAL_DP_RATE_SKILL_ID,
    label: 'TestMocktailHealDpRate',
    name: 'Mocktail HealDpRate',
    targetType: 'Self',
    spCost: 0,
    sourceType: 'test',
    isPassive: false,
    type: 'non_damage',
    consumeType: 'Sp',
    hitCount: 0,
    hits: [],
    maxLevel: null,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    effect: '',
    overwrite: null,
    legacySkillIds: [],
    usage: null,
    additionalTurnRule: null,
    parts: [
      {
        skill_type: 'HealDpRate',
        target_type: 'Self',
        power: [MOCKTAIL_TEST_HEAL_DP_RATE, 0],
        value: [1, 0],
      },
    ],
    passive: null,
  }]);
}

function addFoodBuffTestAttackSkill(actor) {
  actor.skills = Object.freeze([...actor.skills, {
    skillId: FOOD_BUFF_TEST_ATTACK_SKILL_ID,
    label: 'TestFoodBuffAttack',
    name: 'Food Buff Attack',
    targetType: 'Single',
    spCost: 0,
    sourceType: 'test',
    isPassive: false,
    type: 'attack',
    consumeType: 'Sp',
    hitCount: 1,
    hits: [],
    maxLevel: null,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    effect: '',
    overwrite: null,
    legacySkillIds: [],
    usage: null,
    additionalTurnRule: null,
    parts: [
      {
        skill_type: 'AttackSkill',
        target_type: 'Single',
        type: 'Slash',
        power: [100, 0],
        value: [0, 0],
      },
    ],
    passive: null,
  }, {
    skillId: FOOD_BUFF_TEST_NORMAL_ATTACK_SKILL_ID,
    label: 'TestFoodBuffAttackNormal',
    name: '通常攻撃',
    targetType: 'Single',
    spCost: 0,
    sourceType: 'test',
    isPassive: false,
    type: 'attack',
    consumeType: 'Sp',
    hitCount: 1,
    hits: [],
    maxLevel: null,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    effect: '',
    overwrite: null,
    legacySkillIds: [],
    usage: null,
    additionalTurnRule: null,
    parts: [
      {
        skill_type: 'AttackNormal',
        target_type: 'Single',
        type: 'Slash',
        power: [100, 0],
        value: [0, 0],
      },
    ],
    passive: null,
  }]);
}

function addBabiedTestAttackSkills(actor) {
  actor.skills = Object.freeze([...actor.skills, {
    skillId: BABIED_TEST_ATTACK_SKILL_ID,
    label: 'TestBabiedAttack',
    name: 'Babied Attack',
    targetType: 'Single',
    spCost: 0,
    sourceType: 'test',
    isPassive: false,
    type: 'attack',
    consumeType: 'Sp',
    hitCount: BABIED_TEST_ATTACK_HIT_COUNT,
    hits: [],
    maxLevel: null,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    effect: '',
    overwrite: null,
    legacySkillIds: [],
    usage: null,
    additionalTurnRule: null,
    parts: [
      {
        skill_type: 'AttackSkill',
        target_type: 'Single',
        type: 'Slash',
        power: [100, 0],
        value: [0, 0],
      },
    ],
    passive: null,
  }, {
    skillId: BABIED_TEST_NORMAL_ATTACK_SKILL_ID,
    label: 'TestBabiedAttackNormal',
    name: '通常攻撃',
    targetType: 'Single',
    spCost: 0,
    sourceType: 'test',
    isPassive: false,
    type: 'attack',
    consumeType: 'Sp',
    hitCount: BABIED_TEST_ATTACK_HIT_COUNT,
    hits: [],
    maxLevel: null,
    cond: '',
    iucCond: '',
    overwriteCond: '',
    effect: '',
    overwrite: null,
    legacySkillIds: [],
    usage: null,
    additionalTurnRule: null,
    parts: [
      {
        skill_type: 'AttackNormal',
        target_type: 'Single',
        type: 'Slash',
        power: [100, 0],
        value: [0, 0],
      },
    ],
    passive: null,
  }]);
}

function previewActorSkill(state, skillId, actionOverrides = {}) {
  const actor = state.party[0];
  return previewTurn(state, {
    0: {
      characterId: actor.characterId,
      skillId,
      targetEnemyIndex: 0,
      ...actionOverrides,
    },
  });
}

function previewMemberSkill(state, member, skillId, actionOverrides = {}) {
  return previewTurn(state, {
    [String(member.position)]: {
      characterId: member.characterId,
      skillId,
      targetEnemyIndex: 0,
      ...actionOverrides,
    },
  });
}

function findActionByCharacterId(turnRecord, characterId) {
  return (turnRecord?.actions ?? []).find((item) => String(item.characterId) === String(characterId));
}

function createSixMemberManualParty(factory) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `M${idx + 1}`,
      characterName: `M${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 8000 + idx,
          name: '通常',
          sp_cost: 0,
          parts: idx <= 2 ? [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
      ...(typeof factory === 'function' ? factory(idx) : {}),
    })
  );
  return new Party(members);
}

const HIGH_BOOST_TEST_STATUS_EFFECT = Object.freeze({
  statusType: 'HighBoost',
  limitType: 'Only',
  exitCond: 'Eternal',
  remaining: 0,
  power: 1.8,
  sourceType: 'passive',
  metadata: {
    onlyGroupKey: 'HighBoost',
    spCostIncrease: 2,
    skillAtkRate: 1.8,
    attackBuffMultiplier: 1.2,
    debuffMultiplier: 1.2,
    dpHealMultiplier: 1.5,
  },
});

function createProtectionSkill(skillId) {
  return {
    id: skillId,
    name: 'プロテクション',
    label: `Protection${skillId}`,
    sp_cost: 0,
    parts: [
      {
        skill_type: 'DefenseUp',
        target_type: 'Self',
        power: [0.3, 0],
        effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
      },
    ],
  };
}

function createEnemyEShieldState({
  current = 1,
  max = current,
  maxByStage = null,
  elements = ['Fire'],
  defUpRate = 0,
  damageLimit = 0,
} = {}) {
  return {
    current,
    max,
    ...(Array.isArray(maxByStage) ? { maxByStage: [...maxByStage] } : {}),
    elements,
    defUpRate,
    damageLimit,
  };
}

function applyEnemyEShieldTestSetup(
  state,
  {
    enemyCount = 1,
    eShields = {},
    damageRatesByEnemy = {},
    statuses = [],
  } = {}
) {
  state.turnState.enemyState.enemyCount = enemyCount;
  state.turnState.enemyState.statuses = structuredClone(statuses);
  state.turnState.enemyState.damageRatesByEnemy = structuredClone(damageRatesByEnemy);
  state.turnState.enemyState.eShieldStateByEnemy = Object.fromEntries(
    Object.entries(eShields).map(([enemyIndex, shieldState]) => [String(enemyIndex), structuredClone(shieldState)])
  );
  return state;
}

const HP_BREAK_TEST_EXTRA_GAUGE_TOTAL = 3;
const HP_BREAK_TEST_EXTRA_GAUGE_VALUE = 40400000;
const DIMENSION_HP_BREAK_TARGET_NAMES = Object.freeze([
  '万象を蝕む妖花',
  '絶界に屹立せし蝕樹',
]);

function createHpBreakAttackSkill(skillId = 99501, { targetType = 'Single' } = {}) {
  return {
    id: skillId,
    name: 'Gauge Slash',
    label: `GaugeSlash${skillId}`,
    sp_cost: 0,
    target_type: targetType,
    parts: [{ skill_type: 'AttackSkill', target_type: targetType, type: 'Slash' }],
  };
}

function getDimensionBattleEnemyEntriesByName(enemyName) {
  const entries = [];
  for (const dimension of DIMENSION_BATTLE_DATA) {
    for (const [slotIndex, entry] of (dimension?.central ?? []).entries()) {
      const names = (entry?.bn ?? [])
        .filter(Boolean)
        .map((candidate) => String(candidate?.n ?? ''))
        .filter(Boolean);
      if (!names.includes(enemyName)) {
        continue;
      }
      entries.push({
        dimensionLabel: String(dimension?.label ?? ''),
        slotIndex,
        enemyLabel: String(entry?.b?.[0] ?? ''),
        enemyName,
        extraGauge: structuredClone(entry?.eg?.[0] ?? null),
      });
    }
  }
  return entries;
}

function createHpBreakTestStateFromDimensionEnemy(dimensionEnemy) {
  const extraGauge = dimensionEnemy?.extraGauge;
  assert.ok(extraGauge, `${dimensionEnemy?.enemyLabel ?? dimensionEnemy?.enemyName} should have eg[0]`);
  const hpStages = extraGauge.hp;
  const eShield = extraGauge.eshield;
  const expectedEShieldMax = Number(extraGauge.esp);
  assert.equal(Array.isArray(hpStages), true, 'dimension_battle eg[0].hp should be an array');
  assert.equal(hpStages.length, 3, 'target dimension enemy should have 3 HP gauge stages');
  assert.equal(Array.isArray(extraGauge?.pattern?.hp), true, 'dimension_battle eg[0].pattern.hp should exist');
  assert.equal(
    extraGauge.pattern.hp.length,
    hpStages.length,
    'HP break pattern count should match HP gauge stage count'
  );
  assert.equal(Number.isFinite(expectedEShieldMax), true, 'dimension_battle eg[0].esp should be numeric');
  assert.ok(eShield && typeof eShield === 'object', 'dimension_battle eg[0].eshield should exist');

  const { state, skillId } = createHpBreakTestState({
    remaining: hpStages.length,
    eShieldState: createEnemyEShieldState({
      current: 0,
      max: expectedEShieldMax,
      elements: eShield.ele_list,
      defUpRate: Number(eShield.def_up_rate ?? 0),
      damageLimit: Number(eShield.dmg_limit ?? 0),
    }),
  });
  state.turnState.enemyState.extraHpGaugeStateByEnemy = {
    0: {
      total: hpStages.length,
      remaining: hpStages.length,
      values: [...hpStages],
    },
  };
  return {
    state,
    skillId,
    hpStages,
    expectedEShieldMax,
    expectedEShieldElements: [...eShield.ele_list],
    expectedDefUpRate: Number(eShield.def_up_rate ?? 0),
    expectedDamageLimit: Number(eShield.dmg_limit ?? 0),
  };
}

function createHpBreakTestState({
  enemyCount = 1,
  remaining = 3,
  skillTargetType = 'Single',
  eShieldState = createEnemyEShieldState({
    current: 12,
    max: 30,
    elements: ['Light'],
    defUpRate: 5000,
  }),
} = {}) {
  const skill = createHpBreakAttackSkill(99501, { targetType: skillTargetType });
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? { skills: [skill] }
      : { skills: [createProtectionSkill(8800 + idx)] }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = enemyCount;
  state.turnState.enemyState.extraHpGaugeStateByEnemy = Object.fromEntries(
    Array.from({ length: enemyCount }, (_, enemyIndex) => [
      String(enemyIndex),
      {
        total: HP_BREAK_TEST_EXTRA_GAUGE_TOTAL,
        remaining,
        values: Array.from(
          { length: HP_BREAK_TEST_EXTRA_GAUGE_TOTAL },
          () => HP_BREAK_TEST_EXTRA_GAUGE_VALUE
        ),
      },
    ])
  );
  state.turnState.enemyState.eShieldStateByEnemy = eShieldState
    ? Object.fromEntries(
        Array.from({ length: enemyCount }, (_, enemyIndex) => [String(enemyIndex), structuredClone(eShieldState)])
      )
    : {};
  return {
    state,
    skillId: skill.id,
  };
}

test('manual HP break decrements extra gauge, resets break state, restores E shield to max, and preserves earlier actions', () => {
  const { state, skillId } = createHpBreakTestState();
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 },
    { statusType: 'SuperBreak', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'SuperBreakDown', targetIndex: 0, remainingTurns: 0 },
  ];
  state.turnState.enemyState.destructionRateByEnemy = { 0: 250 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 350 };
  state.turnState.enemyState.breakStateByEnemy = {
    0: {
      baseCap: 300,
      strongBreakActive: true,
      superDown: { preRate: 100, preCap: 300 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
    1: { characterId: 'M2', skillId: state.party[1].skills[0].skillId },
    2: { characterId: 'M3', skillId: state.party[2].skills[0].skillId },
  });
  assert.equal(preview.actions.length, 3, 'preview should preserve earlier non-damage actions before the HP break action');
  assert.deepEqual(preview.actions.map((action) => action.characterId), ['M2', 'M3', 'M1']);

  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(committedRecord.actions.length, 3, 'commit should keep actions that execute before HP break');
  assert.deepEqual(committedRecord.actions.map((action) => action.characterId), ['M2', 'M3', 'M1']);
  assert.deepEqual(committedRecord.actions[2]?.manualHpBreakEnemyIndexes, [0]);
  assert.equal(committedRecord.actions[2]?.hpBreakCount, 1);
  assert.deepEqual(nextState.turnState.enemyState.extraHpGaugeStateByEnemy['0'], {
    total: 3,
    remaining: 2,
    values: [40400000, 40400000, 40400000],
  });
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 30,
    max: 30,
    elements: ['Light'],
    defUpRate: 5000,
    damageLimit: 0,
  });
  assert.deepEqual(
    (nextState.turnState.enemyState.statuses ?? []).filter((status) => Number(status?.targetIndex) === 0),
    [],
    'BREAK/DownTurn/SuperBreak states should be cleared'
  );
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 100);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['0'], undefined);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
});

test('manual HP break restores depleted E shield without increasing max', () => {
  const { state, skillId } = createHpBreakTestState({
    eShieldState: createEnemyEShieldState({
      current: 0,
      max: 35,
      elements: ['Fire', 'Light', 'Dark'],
      defUpRate: 5000,
    }),
  });

  const { nextState, committedRecord } = commitTurn(
    state,
    previewTurn(state, {
      0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
      1: { characterId: 'M2', skillId: state.party[1].skills[0].skillId },
      2: { characterId: 'M3', skillId: state.party[2].skills[0].skillId },
    })
  );

  assert.equal(committedRecord.actions.at(-1)?.hpBreakCount, 1);
  assert.deepEqual(nextState.turnState.enemyState.extraHpGaugeStateByEnemy['0'], {
    total: 3,
    remaining: 2,
    values: [40400000, 40400000, 40400000],
  });
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 35,
    max: 35,
    elements: ['Fire', 'Light', 'Dark'],
    defUpRate: 5000,
    damageLimit: 0,
  });
});

test('manual HP break restores E shield to stage-specific max values', () => {
  const { state, skillId } = createHpBreakTestState({
    eShieldState: createEnemyEShieldState({
      current: 0,
      max: 30,
      maxByStage: [30, 35, 40],
      elements: ['Fire', 'Light', 'Dark'],
      defUpRate: 9900,
    }),
  });
  let currentState = state;

  for (const expectedMax of [35, 40]) {
    currentState.turnState.enemyState.eShieldStateByEnemy['0'].current = 0;
    const { nextState } = commitTurn(
      currentState,
      previewTurn(currentState, {
        0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
        1: { characterId: 'M2', skillId: currentState.party[1].skills[0].skillId },
        2: { characterId: 'M3', skillId: currentState.party[2].skills[0].skillId },
      })
    );

    assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
      current: expectedMax,
      max: expectedMax,
      maxByStage: [30, 35, 40],
      elements: ['Fire', 'Light', 'Dark'],
      defUpRate: 9900,
      damageLimit: 0,
    });
    currentState = nextState;
  }
});

test('stale EnemyEShields override without maxByStage keeps catalog stage values for HP break restore', () => {
  const { state, skillId } = createHpBreakTestState({
    eShieldState: createEnemyEShieldState({
      current: 30,
      max: 30,
      maxByStage: [30, 35, 40],
      elements: ['Fire', 'Light', 'Dark'],
      defUpRate: 9900,
    }),
  });
  let currentState = state;

  for (const expectedMax of [35, 40]) {
    applyEnemyStateOverrideSnapshot(currentState.turnState, {
      enemyEShields: {
        0: {
          current: 0,
          max: 30,
          elements: ['Fire', 'Light', 'Dark'],
          defUpRate: 9900,
          damageLimit: 0,
        },
      },
    });
    assert.deepEqual(
      currentState.turnState.enemyState.eShieldStateByEnemy['0'].maxByStage,
      [30, 35, 40]
    );

    const { nextState } = commitTurn(
      currentState,
      previewTurn(currentState, {
        0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
        1: { characterId: 'M2', skillId: currentState.party[1].skills[0].skillId },
        2: { characterId: 'M3', skillId: currentState.party[2].skills[0].skillId },
      })
    );

    assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, expectedMax);
    assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].max, expectedMax);
    assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'].maxByStage, [30, 35, 40]);
    currentState = nextState;
  }
});

for (const enemyName of DIMENSION_HP_BREAK_TARGET_NAMES) {
  test(`dimension_battle real data: ${enemyName} HP break advances gauges and restores E shield to eg[0].esp`, () => {
    const dimensionEnemies = getDimensionBattleEnemyEntriesByName(enemyName);
    assert.ok(dimensionEnemies.length > 0, `${enemyName} should exist in dimension_battle central entries`);

    for (const dimensionEnemy of dimensionEnemies) {
      const {
        state,
        skillId,
        hpStages,
        expectedEShieldMax,
        expectedEShieldElements,
        expectedDefUpRate,
        expectedDamageLimit,
      } = createHpBreakTestStateFromDimensionEnemy(dimensionEnemy);
      let currentState = state;

      for (const breakIndex of [0, 1]) {
        currentState.turnState.enemyState.eShieldStateByEnemy['0'] = {
          ...currentState.turnState.enemyState.eShieldStateByEnemy['0'],
          current: 0,
        };

        const { nextState, committedRecord } = commitTurn(
          currentState,
          previewTurn(currentState, {
            0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
            1: { characterId: 'M2', skillId: currentState.party[1].skills[0].skillId },
            2: { characterId: 'M3', skillId: currentState.party[2].skills[0].skillId },
          })
        );

        const expectedRemaining = hpStages.length - (breakIndex + 1);
        assert.equal(
          committedRecord.actions.at(-1)?.hpBreakCount,
          1,
          `${dimensionEnemy.enemyLabel} HP break #${breakIndex + 1} should be recorded`
        );
        assert.deepEqual(
          nextState.turnState.enemyState.extraHpGaugeStateByEnemy['0'],
          {
            total: hpStages.length,
            remaining: expectedRemaining,
            values: hpStages,
          },
          `${dimensionEnemy.enemyLabel} HP break #${breakIndex + 1} should advance to the next HP gauge`
        );
        assert.deepEqual(
          nextState.turnState.enemyState.eShieldStateByEnemy['0'],
          {
            current: expectedEShieldMax,
            max: expectedEShieldMax,
            elements: expectedEShieldElements,
            defUpRate: expectedDefUpRate,
            damageLimit: expectedDamageLimit,
          },
          `${dimensionEnemy.enemyLabel} HP break #${breakIndex + 1} should restore E shield to dimension_battle eg[0].esp`
        );

        currentState = nextState;
      }
    }
  });
}

test('manual HP break can be applied repeatedly to multiple enemies until final kill', () => {
  const { state, skillId } = createHpBreakTestState({
    enemyCount: 2,
    skillTargetType: 'All',
  });
  let currentState = state;

  for (const expectedTurnIndex of [2, 3]) {
    const preview = previewTurn(currentState, {
      0: { characterId: 'M1', skillId, manualHpBreakEnemyIndexes: [0, 1] },
      1: { characterId: 'M2', skillId: currentState.party[1].skills[0].skillId },
    });

    assert.equal(preview.actions.length, 2, 'preview should preserve earlier non-damage actions before each HP break action');
    assert.deepEqual(preview.actions.map((action) => action.characterId), ['M2', 'M1']);

    const { nextState, committedRecord } = commitTurn(currentState, preview);
    const expectedRemaining = HP_BREAK_TEST_EXTRA_GAUGE_TOTAL - (expectedTurnIndex - 1);

    assert.equal(committedRecord.actions.length, 2, 'commit should preserve earlier actions before HP break');
    assert.deepEqual(committedRecord.actions.map((action) => action.characterId), ['M2', 'M1']);
    assert.deepEqual(committedRecord.actions[1]?.manualHpBreakEnemyIndexes, [0, 1]);
    assert.equal(committedRecord.actions[1]?.hpBreakCount, 2);
    assert.equal(nextState.turnState.turnType, 'normal');
    assert.equal(nextState.turnState.turnIndex, expectedTurnIndex);

    for (const enemyIndex of [0, 1]) {
      assert.deepEqual(
        nextState.turnState.enemyState.extraHpGaugeStateByEnemy[String(enemyIndex)],
        {
          total: HP_BREAK_TEST_EXTRA_GAUGE_TOTAL,
          remaining: expectedRemaining,
          values: Array.from(
            { length: HP_BREAK_TEST_EXTRA_GAUGE_TOTAL },
            () => HP_BREAK_TEST_EXTRA_GAUGE_VALUE
          ),
        },
        `enemy ${enemyIndex} should consume one extra HP gauge`
      );
      assert.equal(
        (nextState.turnState.enemyState.statuses ?? []).some(
          (status) => status?.statusType === 'Dead' && Number(status?.targetIndex) === enemyIndex
        ),
        false,
        `enemy ${enemyIndex} should not be dead before the final gauge`
      );
    }

    currentState = nextState;
  }

  const killPreview = previewTurn(currentState, {
    0: { characterId: 'M1', skillId, manualKillEnemyIndexes: [0, 1] },
    1: { characterId: 'M2', skillId: currentState.party[1].skills[0].skillId },
  });
  const { nextState: killedState, committedRecord } = commitTurn(currentState, killPreview);
  const killAction = findActionByCharacterId(committedRecord, 'M1');

  assert.equal(committedRecord.actions.length, 2, 'kill should not use the HP break truncation path');
  assert.deepEqual(killAction?.manualKillEnemyIndexes, [0, 1]);
  assert.equal(killAction?.killCount, 2);
  assert.equal(killAction?.hpBreakCount, 0);
  for (const enemyIndex of [0, 1]) {
    assert.equal(
      (killAction?.enemyStatusChanges ?? []).some(
        (event) => event?.statusType === 'Dead' && Number(event?.targetIndex) === enemyIndex
      ),
      true,
      `enemy ${enemyIndex} should be killed manually after the final gauge`
    );
    assert.equal(
      (killedState.turnState.enemyState.statuses ?? []).some(
        (status) => status?.statusType === 'Dead' && Number(status?.targetIndex) === enemyIndex
      ),
      true,
      `enemy ${enemyIndex} should stay dead in next state`
    );
  }
});

test('manual HP break does not create an E shield when no active E shield exists', () => {
  const { state, skillId } = createHpBreakTestState({ eShieldState: null });

  const committed = commitTurn(
    state,
    previewTurn(state, {
      0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
    })
  );

  assert.equal(committed.nextState.turnState.enemyState.eShieldStateByEnemy['0'], undefined);
  assert.deepEqual(committed.nextState.turnState.enemyState.extraHpGaugeStateByEnemy['0'], {
    total: 3,
    remaining: 2,
    values: [40400000, 40400000, 40400000],
  });
});

test('manual HP break forces the next state to the next normal base turn from OD and EX contexts', () => {
  const { state: odBaseState, skillId } = createHpBreakTestState();
  odBaseState.turnState.odGauge = 100;
  const odState = activateOverdrive(odBaseState, 1, 'preemptive');
  const odCommitted = commitTurn(
    odState,
    previewTurn(odState, {
      0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
    })
  );
  assert.equal(odCommitted.nextState.turnState.turnType, 'normal');
  assert.equal(odCommitted.nextState.turnState.turnIndex, 2);
  assert.equal(odCommitted.nextState.turnState.turnLabel, 'T2');

  const { state: exBaseState } = createHpBreakTestState();
  const extraState = grantExtraTurn(exBaseState, ['M1']);
  const extraCommitted = commitTurn(
    extraState,
    previewTurn(extraState, {
      0: { characterId: 'M1', skillId, targetEnemyIndex: 0, manualHpBreakEnemyIndexes: [0] },
    })
  );
  assert.equal(extraCommitted.nextState.turnState.turnType, 'normal');
  assert.equal(extraCommitted.nextState.turnState.turnIndex, 2);
  assert.equal(extraCommitted.nextState.turnState.turnLabel, 'T2');
});

function createHighBoostManualParty(actorOverrides = {}) {
  return createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'HB1',
        characterName: 'HB1',
        initialSP: 20,
        statusEffects: [structuredClone(HIGH_BOOST_TEST_STATUS_EFFECT)],
        ...actorOverrides,
      };
    }
    return {
      skills: [createProtectionSkill(8800 + idx)],
    };
  });
}

const DOUBLE_ACTION_TEST_USAGE = Object.freeze({
  mode: 'fixed',
  displayUses: 4,
  maxUses: 4,
  minUses: 4,
  expandable: true,
});

function createDoubleActionRestrictedSkill(skillId, options = {}) {
  return {
    id: skillId,
    name: String(options.name ?? 'Double Action EX'),
    label: String(options.label ?? `DoubleActionEx${skillId}`),
    sp_cost: Number(options.spCost ?? 14),
    is_restricted: 1,
    hit_count: Number(options.hitCount ?? 1),
    target_type: String(options.targetType ?? 'Single'),
    usage: options.usage ? structuredClone(options.usage) : structuredClone(DOUBLE_ACTION_TEST_USAGE),
    parts: Array.isArray(options.parts)
      ? structuredClone(options.parts)
      : [{ skill_type: 'AttackSkill', target_type: String(options.targetType ?? 'Single'), type: 'Slash' }],
  };
}

function createDoubleActionManualState(actorOverrides = {}) {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'DEX1',
        characterName: 'DEX1',
        initialSP: 30,
        skills: [createDoubleActionRestrictedSkill(99001, actorOverrides.skillOptions)],
        statusEffects: [
          {
            statusType: 'DoubleActionExtraSkill',
            limitType: 'Only',
            exitCond: 'Count',
            remaining: 1,
            power: 1,
          },
          ...(Array.isArray(actorOverrides.statusEffects) ? structuredClone(actorOverrides.statusEffects) : []),
        ],
        ...(actorOverrides.memberOverrides ?? {}),
      };
    }
    return {
      skills: [createProtectionSkill(9800 + idx)],
    };
  });
  return createBattleStateFromParty(party);
}

test('consume_type Token spends token instead of SP on preview and commit', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 5,
          skills: [
            {
              id: 18000,
              name: 'Token Spend',
              sp_cost: 3,
              consume_type: 'Token',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const entry = preview.actions.find((item) => item.characterId === 'M1');
  assert.equal(entry.startSP, 10);
  assert.equal(entry.endSP, 10);
  assert.equal(entry.startToken, 5);
  assert.equal(entry.endToken, 2);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.sp.current, 12);
  assert.equal(member.tokenState.current, 2);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(committed.endToken, 2);
  assert.equal(committed.tokenChanges[0].delta, -3);
});

test('TokenSet skill part increases token and clamps at max 10', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 9,
          skills: [
            {
              id: 18010,
              name: 'Token Gain',
              sp_cost: 0,
              parts: [{ skill_type: 'TokenSet', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18010 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview);
  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.tokenState.current, 10);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(committed.tokenChanges.some((item) => item.triggerType === 'TokenSet' && item.delta === 1), true);
});

test('TokenSetByAttacking grants token per damaged enemy', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18100,
              name: '戦勲',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacking', target_type: 'Self', power: [1, 0] }],
            },
          ],
          skills: [
            {
              id: 18101,
              name: 'All Attack',
              sp_cost: 0,
              target_type: 'All',
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18101 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const member = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(member.tokenState.current, 3);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    committed.tokenChanges.some((item) => item.triggerType === 'TokenSetByAttacking' && item.delta === 3),
    true
  );
});

test('TokenSetByHealedDp grants token when DP heal skill targets the member', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18120,
            name: 'DP Heal',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDp', target_type: 'AllySingle', power: [10, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        passives: [
          {
            id: 18121,
            name: '戦士の祝福',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [{ skill_type: 'TokenSetByHealedDp', target_type: 'Self', power: [1, 0] }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18120, targetCharacterId: 'M2' },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const target = nextState.party.find((item) => item.characterId === 'M2');
  assert.equal(target.tokenState.current, 1);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDp' &&
        item.targetCharacterId === 'M2' &&
        item.isAmountResolved === false
    ),
    true
  );
  const committed = committedRecord.actions.find((item) => item.characterId === 'M2');
  assert.equal(
    committed.tokenChanges.some((item) => item.triggerType === 'TokenSetByHealedDp' && item.delta === 1),
    true
  );
});

test('HealDpRate updates DP current/cap and records direct DP heal change', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18122,
            name: 'DP Rate Heal',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDpRate', target_type: 'AllySingle', power: [0.1, 0], value: [1.2, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        dpState: {
          baseMaxDp: 100,
          currentDp: 40,
          effectiveDpCap: 100,
        },
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18122, targetCharacterId: 'M2' },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const target = nextState.party.find((item) => item.characterId === 'M2');
  assert.equal(target.dpState.currentDp, 50);
  assert.equal(target.dpState.effectiveDpCap, 120);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDpRate' &&
        item.targetCharacterId === 'M2' &&
        item.delta === 10 &&
        item.preDp === 40 &&
        item.postDp === 50 &&
        item.postDpCap === 120 &&
        item.isAmountResolved === true
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'DirectDpHeal' &&
        item.skillType === 'HealDpRate' &&
        item.characterId === 'M2' &&
        item.delta === 10
    ),
    true
  );
});

test('フェリチータ grants token only on initial skill use, not on later regeneration turns', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46008506);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46008506],
    },
  });
  let state = createBattleStateFromParty(party);
  let actor = state.party[0];

  assert.equal(actor.characterId, 'MdAngelis');

  const preview1 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46008506 },
  });
  const commit1 = commitTurn(state, preview1);
  state = commit1.nextState;
  actor = state.party[0];
  const entry1 = commit1.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 2);
  assert.equal(
    (entry1.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSet' && item.delta === 2),
    true
  );
  assert.equal(
    (entry1.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSetByHealedDp' && item.delta === 1),
    false
  );
  assert.equal(
    (entry1.dpChanges ?? []).some(
      (item) => item.triggerType === 'RegenerationDpGrant' && item.targetCharacterId === actor.characterId
    ),
    true
  );
  assert.equal(
    (commit1.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );
  const actorSnapAfterTurn1 = commit1.committedRecord.snapAfter.find(
    (item) => item.characterId === actor.characterId
  );
  assert.equal(
    (actorSnapAfterTurn1.statusEffects ?? []).some(
      (item) => item.statusType === 'RegenerationDp' && item.exitCond === 'EnemyTurnEnd' && item.remaining === 3
    ),
    true
  );

  const preview2 = previewTurn(state, {});
  const commit2 = commitTurn(state, preview2);
  state = commit2.nextState;
  actor = state.party[0];
  const entry2 = commit2.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 2);
  assert.equal(entry2, undefined);
  assert.equal(
    (commit2.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );

  const preview3 = previewTurn(state, {});
  const commit3 = commitTurn(state, preview3);
  state = commit3.nextState;
  actor = state.party[0];
  const entry3 = commit3.committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.tokenState.current, 2);
  assert.equal(entry3, undefined);
  assert.equal(
    (commit3.committedRecord.dpEvents ?? []).some(
      (item) => item.triggerType === 'RegenerationDpTick' && item.characterId === actor.characterId
    ),
    true
  );
});

test('HealDpByDamage is tracked separately from direct DP heal triggers', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        passives: [
          {
            id: 18124,
            name: '戦士の祝福',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [{ skill_type: 'TokenSetByHealedDp', target_type: 'Self', power: [1, 0] }],
          },
        ],
        skills: [
          {
            id: 18123,
            name: 'Shield Tornado',
            sp_cost: 0,
            target_type: 'All',
            hit_count: 1,
            parts: [
              { skill_type: 'AttackSkill', target_type: 'All', type: 'Strike', power: [100, 0] },
              { skill_type: 'HealDpByDamage', target_type: 'Self', power: [0.3, 0] },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18123 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(actor.tokenState.current, 0);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'HealDpByDamage' &&
        item.skillType === 'HealDpByDamage' &&
        item.targetCharacterId === 'M1' &&
        item.delta === 0 &&
        item.isAmountResolved === false
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'HealDpByDamage' &&
        item.skillType === 'HealDpByDamage' &&
        item.characterId === 'M1'
    ),
    true
  );
});

test('SelfDamage lowers current DP by baseMax rate and records DP self-damage', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 100,
            currentDp: 100,
            effectiveDpCap: 100,
          },
          skills: [
            {
              id: 18125,
              name: 'Self Damage Slash',
              sp_cost: 0,
              target_type: 'Single',
              hit_count: 1,
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', power: [100, 0] },
                { skill_type: 'SelfDamage', target_type: 'Self', power: [0.5, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18125, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(actor.dpState.currentDp, 50);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.skillType === 'SelfDamage' &&
        item.targetCharacterId === 'M1' &&
        item.delta === -50 &&
        item.preDp === 100 &&
        item.postDp === 50 &&
        item.isAmountResolved === true
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.skillType === 'SelfDamage' &&
        item.characterId === 'M1' &&
        item.delta === -50
    ),
    true
  );
});

test('SelfDamage supports ally-targeted DP reduction skill parts', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 2
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          ...(idx === 0
            ? {
                skills: [
                  {
                    id: 18126,
                    name: 'Ally Damage Boost',
                    sp_cost: 0,
                    parts: [
                      { skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.3, 0] },
                      { skill_type: 'SelfDamage', target_type: 'AllyFrontWithoutSelf', power: [0.3, 0] },
                    ],
                  },
                ],
              }
            : {}),
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18126 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 70);
  assert.equal(nextState.party[1].dpState.currentDp, 49);
  assert.equal(nextState.party[2].dpState.currentDp, 49);
  const actorEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  assert.equal(
    actorEntry.dpChanges.filter((item) => item.triggerType === 'SelfDpDamage').length,
    2
  );
  assert.equal(
    actorEntry.dpChanges.some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M2' && item.delta === -21
    ),
    true
  );
  assert.equal(
    actorEntry.dpChanges.some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M3' && item.delta === -21
    ),
    true
  );
});

test('SelfDamage keeps 1 DP floor instead of auto-breaking on 100% cost', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          skills: [
            {
              id: 18131,
              name: 'Full Cost',
              sp_cost: 0,
              parts: [{ skill_type: 'SelfDamage', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18131 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 1);
  assert.equal(
    committedRecord.actions[0].dpChanges.some(
      (item) =>
        item.triggerType === 'SelfDpDamage' &&
        item.targetCharacterId === 'M1' &&
        item.preDp === 70 &&
        item.postDp === 1 &&
        item.delta === -69
    ),
    true
  );
});

test('AttackByOwnDpRate exposes resolved multiplier from current DP rate', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        dpState: {
          baseMaxDp: 70,
          currentDp: 35,
          effectiveDpCap: 70,
        },
        skills: [
          {
            id: 18127,
            name: 'Low DP Burst',
            sp_cost: 0,
            target_type: 'Single',
            hit_count: 1,
            parts: [
              {
                skill_type: 'AttackByOwnDpRate',
                target_type: 'Single',
                type: 'Strike',
                power: [100, 0],
                value: [1.75, 1.0],
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        dpState: {
          baseMaxDp: 70,
          currentDp: 84,
          effectiveDpCap: 84,
        },
        skills: [
          {
            id: 18128,
            name: 'High DP Burst',
            sp_cost: 0,
            target_type: 'Single',
            hit_count: 1,
            parts: [
              {
                skill_type: 'AttackByOwnDpRate',
                target_type: 'Single',
                type: 'Slash',
                power: [100, 0],
                value: [0.6, 1.5],
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18127, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 18128, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  assert.equal(preview.actions[0].attackByOwnDpRateContext.startDpRate, 0.5);
  assert.equal(preview.actions[0].attackByOwnDpRateContext.referenceDpRate, 0.5);
  assert.equal(preview.actions[0].attackByOwnDpRateContext.resolvedMultiplier, 1.375);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.startDpRate, 1.2);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.referenceDpRate, 1);
  assert.equal(preview.actions[1].attackByOwnDpRateContext.resolvedMultiplier, 1.5);

  const { committedRecord } = commitTurn(state, preview);
  const lowDpEntry = committedRecord.actions.find((item) => item.characterId === 'M1');
  const highDpEntry = committedRecord.actions.find((item) => item.characterId === 'M2');

  assert.equal(lowDpEntry.damageContext.attackByOwnDpRateStartDpRate, 0.5);
  assert.equal(lowDpEntry.damageContext.attackByOwnDpRateResolvedMultiplier, 1.375);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateStartDpRate, 1.2);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateReferenceDpRate, 1);
  assert.equal(highDpEntry.damageContext.attackByOwnDpRateResolvedMultiplier, 1.5);
});

test('post-action DpRate changes are visible to additional-turn passive conditions', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          dpState: {
            baseMaxDp: 70,
            currentDp: 70,
            effectiveDpCap: 70,
          },
          passives: [
            {
              id: 18129,
              name: '破砕の残光',
              timing: 'OnAdditionalTurnStart',
              condition: 'DpRate()<=0.05',
              parts: [{ skill_type: 'HealEp', target_type: 'Self', power: [2, 0] }],
            },
          ],
          skills: [
            {
              id: 18130,
              name: 'Near Break',
              sp_cost: 0,
              additionalTurnRule: {
                skillUsableInExtraTurn: true,
                additionalTurnGrantInExtraTurn: true,
                conditions: {
                  requiresOverDrive: false,
                  requiresReinforcedMode: false,
                  excludesExtraTurnForSkillUse: false,
                  excludesExtraTurnForAdditionalTurnGrant: false,
                },
                additionalTurnTargetTypes: ['Self'],
              },
              parts: [
                { skill_type: 'SelfDamage', target_type: 'Self', power: [1, 0] },
                { skill_type: 'AdditionalTurn', target_type: 'Self' },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18130 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((item) => item.characterId === 'M1');
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.equal(actor.dpState.currentDp, 1);
  assert.equal(actor.ep.current, 2);
  assert.equal(
    (committedRecord.actions[0].dpChanges ?? []).some(
      (item) => item.triggerType === 'SelfDpDamage' && item.targetCharacterId === 'M1' && item.postDp === 1
    ),
    true
  );
  assert.equal(
    (nextState.turnState.passiveEventsLastApplied ?? []).some(
      (item) => item.timing === 'OnAdditionalTurnStart' && item.passiveName === '破砕の残光'
    ),
    true
  );
});

test('Token() condition can trigger passives from current token state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialToken: 3,
          passives: [
            {
              id: 18130,
              name: 'Token Heal',
              desc: '行動開始時 トークン3以上なら自身のSP+2',
              timing: 'OnPlayerTurnStart',
              condition: 'Token()>=3',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party.find((item) => item.characterId === 'M1').sp.current, 3);
});

test('TokenAttack exposes token-based attack context on preview action', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 4,
          skills: [
            {
              id: 18140,
              name: 'Token Attack',
              sp_cost: 13,
              target_type: 'All',
              hit_count: 1,
              parts: [
                { skill_type: 'TokenAttack', target_type: 'All', power: [4177.5, 8355], value: [0.16, 0] },
                { skill_type: 'TokenChangeTimeline', target_type: 'All', power: [0, 0], value: [0, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18140 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const entry = preview.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.tokenAttackContext.tokenCount, 4);
  assert.equal(entry.tokenAttackContext.ratePerToken, 0.16);
  assert.equal(entry.tokenAttackContext.totalRate, 0.64);
});

test('TokenAttack context is preserved into committed damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 5,
          skills: [
            {
              id: 18141,
              name: 'Token Attack',
              sp_cost: 13,
              target_type: 'Single',
              hit_count: 1,
              parts: [
                { skill_type: 'TokenAttack', target_type: 'Single', power: [5445, 10890], value: [0.16, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18141, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.damageContext.tokenAttackTokenCount, 5);
  assert.equal(entry.damageContext.tokenAttackRatePerToken, 0.16);
  assert.equal(entry.damageContext.tokenAttackTotalRate, 0.8);
});

test('TokenSetByAttacked grants token when enemy attack trigger is applied to the target member', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18150,
              name: '護りの真髄',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacked', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const events = applyEnemyAttackTokenTriggers(state, ['M1']);
  const member = state.party.find((item) => item.characterId === 'M1');

  assert.equal(events.length, 1);
  assert.equal(events[0].triggerType, 'TokenSetByAttacked');
  assert.equal(member.tokenState.current, 1);
});

test('enemy attack reduces motivation by 1 for attacked members with motivation state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialMotivation: 5,
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const events = applyEnemyAttackMotivationTriggers(state, ['M1']);
  const member = state.party.find((item) => item.characterId === 'M1');

  assert.equal(events.length, 1);
  assert.equal(events[0].triggerType, 'MotivationDamage');
  assert.equal(events[0].delta, -1);
  assert.equal(member?.motivationState.current, 4);
});

test('enemy attack motivation decrease clamps at level 1', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialMotivation: 1,
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const events = applyEnemyAttackMotivationTriggers(state, ['M1']);
  const member = state.party.find((item) => item.characterId === 'M1');

  assert.equal(events.length, 0);
  assert.equal(member?.motivationState.current, 1);
});

test('commitTurn records enemy attack token triggers when attacked targets are provided', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18151,
              name: '護りの真髄',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacked', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002, targetEnemyIndex: 0 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview, [], {
    enemyAttackTargetCharacterIds: ['M1'],
  });
  const member = nextState.party.find((item) => item.characterId === 'M1');

  assert.equal(member?.tokenState.current, 1);
  assert.deepEqual(committedRecord.enemyAttackTargetCharacterIds, ['M1']);
  assert.equal(committedRecord.enemyAttackEvents.length, 1);
  assert.equal(committedRecord.enemyAttackEvents[0].characterId, 'M1');
  assert.equal(committedRecord.enemyAttackEvents[0].triggerType, 'TokenSetByAttacked');
  assert.equal(committedRecord.enemyAttackEvents[0].delta, 1);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === 'M1' &&
        event.triggerType === 'TokenSetByAttacked' &&
        event.source === 'enemy_attack' &&
        event.tokenDelta === 1
    ),
    true
  );
});

test('commitTurn records enemy attack motivation loss when attacked targets are provided', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialMotivation: 4,
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002, targetEnemyIndex: 0 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview, [], {
    enemyAttackTargetCharacterIds: ['M1'],
  });
  const member = nextState.party.find((item) => item.characterId === 'M1');

  assert.equal(member?.motivationState.current, 3);
  assert.deepEqual(committedRecord.enemyAttackTargetCharacterIds, ['M1']);
  assert.equal(committedRecord.enemyAttackEvents.length, 1);
  assert.equal(committedRecord.enemyAttackEvents[0].characterId, 'M1');
  assert.equal(committedRecord.enemyAttackEvents[0].triggerType, 'MotivationDamage');
  assert.equal(committedRecord.enemyAttackEvents[0].delta, -1);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === 'M1' &&
        event.triggerType === 'MotivationDamage' &&
        event.source === 'enemy_attack' &&
        event.motivationDelta === -1
    ),
    true
  );
});

test('DamageRateUpPerToken is exposed on preview action modifiers', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 3,
          passives: [
            {
              id: 18160,
              name: '奮起',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'DamageRateUpPerToken', target_type: 'AllyAll', power: [0.03, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers.damageRateUpRate, 0.09);
  assert.equal(
    preview.actions[0].specialPassiveEvents.some((event) => event.damageRateUpRate === 0.09),
    true
  );
});

test('OverDrivePointUpByToken increases od gauge gain by token count', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialToken: 3,
          skills: [
            {
              id: 18161,
              name: 'Token OD Up',
              sp_cost: 0,
              target_type: 'Self',
              hit_count: 0,
              parts: [
                { skill_type: 'OverDrivePointUpByToken', target_type: 'Self', power: [0.1, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18161 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.odGaugeGain, 30);
  assert.equal(entry.damageContext.overDrivePointUpByTokenPerToken, 0.1);
  assert.equal(entry.damageContext.overDrivePointUpByTokenTokenCount, 3);
  assert.equal(entry.damageContext.overDrivePointUpByTokenTotalPercent, 30);
});

test('Morale skill part raises target morale and clamps at max 10', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18200,
              name: 'Morale Up',
              sp_cost: 0,
              target_type: 'AllyAll',
              parts: [{ skill_type: 'Morale', target_type: 'AllyAll', power: [2, 0] }],
            },
          ],
        }
      : idx === 1
        ? { initialMorale: 9 }
        : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18200 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party[1].moraleState.current, 10);
  const committed = committedRecord.actions.find((item) => item.characterId === 'M2');
  assert.equal(committed.moraleChanges.some((item) => item.triggerType === 'Morale' && item.delta === 1), true);
});

test('Morale consume_type spends current morale instead of SP', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 9,
          initialMorale: 6,
          skills: [
            {
              id: 18205,
              name: 'Morale Burst',
              sp_cost: 4,
              consume_type: 'Morale',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18205, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(preview.actions[0].startSP, 9);
  assert.equal(preview.actions[0].endSP, 9);
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'M1');

  assert.equal(entry.startMorale, 6);
  assert.equal(entry.endMorale, 2);
  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.source === 'cost' && item.delta === -4), true);
});

test('MoraleLevel condition can trigger passives from current morale state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialMorale: 6,
          passives: [
            {
              id: 18210,
              name: 'Morale Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'MoraleLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('MoraleLevel works inside CountBC player predicates', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EAoi',
          characterName: '青井',
          initialSP: 1,
          initialMorale: 6,
          passives: [
            {
              id: 18211,
              name: '夢中',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==1&&IsCharacter(EAoi)==1&&MoraleLevel()>=6)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('DpRate condition can trigger passives from current DP state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          baseMaxDp: 70,
          currentDp: 84,
          effectiveDpCap: 98,
          passives: [
            {
              id: 18212,
              name: 'Dp Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'DpRate()>=1.01',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('DpRate works inside CountBC player predicates', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          baseMaxDp: 70,
          currentDp: 70,
          passives: [
            {
              id: 18213,
              name: 'Dp Count Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==1&&DpRate()>=1.0)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(state.party[0].sp.current, 3);
});

test('OnEveryTurn passive HealDpRate updates DP state when DpRate condition matches', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18214,
              name: '気合',
              timing: 'OnEveryTurn',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.15, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.dpEvents.length, 1);
  assert.ok(Math.abs(state.party[0].dpState.currentDp - 45.5) < 1e-9);
  assert.ok(
    result.passiveEvents.some(
      (event) => event.passiveName === '気合' && Math.abs(Number(event.dpDelta ?? 0) - 10.5) < 1e-9
    )
  );
});

test('applyInitialPassiveState applies OnPlayerTurnStart HealDpRate passive when DpRate condition matches', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18217,
              name: '静養',
              timing: 'OnPlayerTurnStart',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.2, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.equal(state.party[0].dpState.currentDp, 49);
  assert.ok(
    state.turnState.passiveEventsLastApplied.some(
      (event) => event.passiveName === '静養' && Math.abs(Number(event.dpDelta ?? 0) - 14) < 1e-9
    )
  );
});

test('ReviveDpRate passive revives broken self only once when limit is 1', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 0,
          passives: [
            {
              id: 18215,
              name: 'くじけぬ心',
              timing: 'OnEveryTurn',
              condition: 'DpRate()==0.0 && IsFront()',
              limit: 1,
              parts: [{ skill_type: 'ReviveDpRate', target_type: 'Self', power: [0.5, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);

  const first = applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(first.dpEvents.length, 1);
  assert.equal(state.party[0].dpState.currentDp, 35);

  state.party[0].setDpState({ currentDp: 0 });
  const second = applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(second.dpEvents.length, 0);
  assert.equal(second.passiveEvents.length, 0);
  assert.equal(state.party[0].dpState.currentDp, 0);
});

test('commitTurn applies OnEnemyTurnStart HealDpRate passive when base turn advances', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 18218,
              name: '充填',
              timing: 'OnEnemyTurnStart',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.1, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 42);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) => event.timing === 'OnEnemyTurnStart' && event.passiveName === '充填' && event.dpDelta === 7
    ),
    true
  );
  assert.equal(
    committedRecord.dpEvents.some(
      (event) => event.source === 'dp_passive' && event.passiveName === '充填' && event.delta === 7
    ),
    true
  );
});

test('DefenseUp passive fires only when DpRate condition matches and records defenseUpRate', () => {
  const createParty = (currentDp) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            baseMaxDp: 70,
            currentDp,
            passives: [
              {
                id: 18216,
                name: '堅忍',
                timing: 'OnEnemyTurnStart',
                condition: 'DpRate()==0.0 && IsFront()',
                parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.5, 0] }],
              },
            ],
          }
        : { baseMaxDp: 70 }
    );

  // DpRate==0 (currentDp=0) → condition true → should fire as supported DefenseUp
  const highState = createBattleStateFromParty(createParty(0));
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  assert.ok(
    highResult.passiveEvents.some(
      (event) => event.passiveName === '堅忍' && (event.defenseUpRate ?? 0) > 0
    ),
    'DefenseUp passive should fire and record defenseUpRate when condition is met'
  );

  // DpRate==1 (currentDp=70) → condition false → should not fire
  const lowState = createBattleStateFromParty(createParty(70));
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('Morale skill variants resolve low and high morale branches without blocking use', () => {
  const createParty = (morale) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: 'KHiiragi',
            characterName: '柊',
            initialMorale: morale,
            skills: [
              {
                id: 18220,
                name: '邪眼・マリンスラッシュ',
                sp_cost: 16,
                target_type: 'All',
                iuc_cond: 'MoraleLevel()>=6',
                overwrite_cond: 'CountBC(IsPlayer()==1&&IsCharacter(KHiiragi)==1&&MoraleLevel()>=6)>0',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'All',
                    cond: 'CountBC(IsPlayer()==1&&IsCharacter(KHiiragi)==1&&MoraleLevel()>=6)>0',
                    strval: [
                      {
                        id: 18221,
                        name: 'high',
                        sp_cost: 8,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                      {
                        id: 18222,
                        name: 'low',
                        sp_cost: 16,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {}
    );

  const lowPreview = previewTurn(createBattleStateFromParty(createParty(0)), {
    0: { characterId: 'KHiiragi', skillId: 18220 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(lowPreview.actions[0].spCost, 16);

  const highPreview = previewTurn(createBattleStateFromParty(createParty(6)), {
    0: { characterId: 'KHiiragi', skillId: 18220 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 8);
});

test('SkillCondition supports reversed DpRate comparison clauses', () => {
  const createParty = (currentDp) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: 'KDpRate',
            characterName: 'DP条件役',
            initialSP: 20,
            baseMaxDp: 70,
            currentDp,
            skills: [
              {
                id: 18230,
                name: 'Dp Reverse Branch',
                sp_cost: 10,
                target_type: 'Single',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    cond: '0.0 < DpRate()',
                    strval: [
                      {
                        id: 18231,
                        name: 'high',
                        sp_cost: 0,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
                      },
                      {
                        id: 18232,
                        name: 'low',
                        sp_cost: 10,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : { baseMaxDp: 70 }
    );

  const zeroPreview = previewTurn(createBattleStateFromParty(createParty(0)), {
    0: { characterId: 'KDpRate', skillId: 18230 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(zeroPreview.actions[0].spCost, 10);

  const highPreview = previewTurn(createBattleStateFromParty(createParty(35)), {
    0: { characterId: 'KDpRate', skillId: 18230 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 0);
});

test('skill-level overwrite_cond halves SP cost on first use without SkillCondition parts', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          skills: [
            {
              id: 18240,
              name: 'First Use Half',
              label: 'FirstUseHalf',
              sp_cost: 10,
              overwrite: 5,
              overwrite_cond: 'CountBC(PlayedSkillCount(FirstUseHalf)>0)==0',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const actions = {
    0: { characterId: 'M1', skillId: 18240 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  const firstPreview = previewTurn(state, actions);
  assert.equal(firstPreview.actions[0].spCost, 5);

  const { nextState } = commitTurn(state, firstPreview);
  const secondPreview = previewTurn(nextState, actions);
  assert.equal(secondPreview.actions[0].spCost, 10);
});

test('skill-level overwrite_cond can set SP cost to 0 when a non-fire zone is active', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 14,
          skills: [
            {
              id: 18241,
              name: 'Zone Cost Override',
              label: 'ZoneCostOverride',
              sp_cost: 14,
              overwrite: 0,
              overwrite_cond: 'CountBC(IsZone(Fire)==0&&IsZone(None)==0)>0',
              target_type: 'Field',
              parts: [{ skill_type: 'Zone', target_type: 'Field', power: [1.8, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const actions = {
    0: { characterId: 'M1', skillId: 18241 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  const noZonePreview = previewTurn(state, actions);
  assert.equal(noZonePreview.actions[0].spCost, 14);

  state.turnState.zoneState = { type: 'Ice', sourceSide: 'player', remainingTurns: 8, powerRate: 1.8 };
  const activeZonePreview = previewTurn(state, actions);
  assert.equal(activeZonePreview.actions[0].spCost, 0);
});

test('skill-level overwrite_cond can reference SpecialStatusCountByType on the actor', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 14,
          skills: [
            {
              id: 18242,
              name: 'Dodge Half',
              label: 'DodgeHalf',
              sp_cost: 14,
              overwrite: 7,
              overwrite_cond: 'CountBC(IsPlayer()==1&&IsCharacter(M1)==1&&SpecialStatusCountByType(122)>0)>0',
              target_type: 'All',
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const actions = {
    0: { characterId: 'M1', skillId: 18242 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  const normalPreview = previewTurn(state, actions);
  assert.equal(normalPreview.actions[0].spCost, 14);

  state.party[0].applySpecialStatus(122, 1, 'Count', {});
  const dodgePreview = previewTurn(state, actions);
  assert.equal(dodgePreview.actions[0].spCost, 7);
});

test('skill-level overwrite_cond can reference manual player-side ImprisonRandom via CountBC', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 8,
          skills: [
            {
              id: 18242_79,
              name: 'Imprison Free',
              label: 'ImprisonFree',
              sp_cost: 8,
              overwrite: 0,
              overwrite_cond: 'CountBC(IsPlayer()==1&&SpecialStatusCountByType(79)>0)>0',
              target_type: 'All',
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const actions = {
    0: { characterId: 'M1', skillId: 18242_79 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  const normalPreview = previewTurn(state, actions);
  assert.equal(normalPreview.actions[0].spCost, 8);

  state.party[1].applySpecialStatus(79, 1, 'PlayerTurnEnd', {});
  const imprisonPreview = previewTurn(state, actions);
  assert.equal(imprisonPreview.actions[0].spCost, 0);
});

test('skill-level overwrite_cond can reference IsCharging on the actor', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 7,
          skills: [
            {
              id: 18243,
              name: 'Charge Free',
              label: 'ChargeFree',
              sp_cost: 7,
              overwrite: 0,
              overwrite_cond: 'CountBC(IsPlayer()==1&&IsCharacter(M1)==1&&IsCharging()==1)>0',
              target_type: 'AllyFront',
              parts: [{ skill_type: 'DefenseUp', target_type: 'AllyFront', power: [0.3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const actions = {
    0: { characterId: 'M1', skillId: 18243 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  const normalPreview = previewTurn(state, actions);
  assert.equal(normalPreview.actions[0].spCost, 7);

  state.party[0].applySpecialStatus(25, 1, 'Count', {});
  const chargePreview = previewTurn(state, actions);
  assert.equal(chargePreview.actions[0].spCost, 0);
});

test('skill-level overwrite_cond can reference enemy-side SpecialStatusCountByType(12/57)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 20,
          skills: [
            {
              id: 18245,
              name: 'Enemy Provoke Half',
              label: 'EnemyProvokeHalf',
              sp_cost: 14,
              overwrite: 7,
              overwrite_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(12)>0)>0',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
            {
              id: 18246,
              name: 'Enemy Attention Free',
              label: 'EnemyAttentionFree',
              sp_cost: 9,
              overwrite: 0,
              overwrite_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(57)>0)>0',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18245, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions[0].spCost, 14);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Provoke', targetIndex: 1, remainingTurns: 2 }],
  };
  preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18245, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions[0].spCost, 7);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Attention', targetIndex: 0, remainingTurns: 2 }],
  };
  preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18246, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions[0].spCost, 0);
});

test('skill-level overwrite_cond falls back to base cost when the condition remains unknown', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 14,
          skills: [
            {
              id: 18244,
              name: 'Unknown Enemy Cond',
              label: 'UnknownEnemyCond',
              sp_cost: 14,
              overwrite: 0,
              overwrite_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&SpecialStatusCountByType(999)>0)>0',
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18244 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(preview.actions[0].spCost, 14);
});

test('ロココ・デストラクション applies overwrite_cond only on first use in real data', () => {
  const store = getStore();
  const skillId = 46002309;
  let state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const firstPreview = previewActorSkill(state, skillId);
  assert.equal(firstPreview.actions[0].spCost, 7);

  state = commitTurn(state, firstPreview).nextState;
  const secondPreview = previewActorSkill(state, skillId);
  assert.equal(secondPreview.actions[0].spCost, 14);
});

test('ヘイルストーム halves SP cost while Dodge is active in real data', () => {
  const store = getStore();
  const skillId = 46002307;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const normalPreview = previewActorSkill(state, skillId);
  assert.equal(normalPreview.actions[0].spCost, 14);

  state.party[0].applySpecialStatus(122, 1, 'Count', {});
  const dodgePreview = previewActorSkill(state, skillId);
  assert.equal(dodgePreview.actions[0].spCost, 7);
});

test('スパークル・トライエッジ+ halves SP cost when enemy Provoke or Attention is active in real data', () => {
  const store = getStore();
  const skillId = 46002361;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  let preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 14);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Provoke', targetIndex: 1, remainingTurns: 2 }],
  };
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 7);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Attention', targetIndex: 0, remainingTurns: 2 }],
  };
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 7);
});

test('御祈祷オーバーヒート resolves SpecialStatusCountByType(146) in overwrite_cond and SkillCondition', () => {
  const store = getStore();
  const skillId = 46005511;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  let preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 8);
  assert.equal(preview.actions[0]._effectiveSkillSnapshot.parts[0].multipliers.dr, 3);

  state.party[0].applySpecialStatus(146, 3, 'PlayerTurnEnd', {});
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 16);
  assert.equal(preview.actions[0]._effectiveSkillSnapshot.parts[0].multipliers.dr, 18);
});

test('にゃんこ大魔法 halves SP cost when enemy DefenseDown is active in real data', () => {
  const store = getStore();
  const skillId = 46003307;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  let preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 14);

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DefenseDown', targetIndex: 0, remainingTurns: 2 }],
  };
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 7);
});

test('御稲荷神話 halves SP cost when enemy Fragile is active in real data', () => {
  const store = getStore();
  const skillId = 46004307;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  let preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 14);

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'Fragile', targetIndex: 0, remainingTurns: 2 }],
  };
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 7);
});

test('シンメトリー・リベレーション resolves SuperBreakDown enemy condition in overwrite_cond and SkillCondition', () => {
  const store = getStore();
  const skillId = 46001523;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  let preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 16);
  assert.equal(preview.actions[0]._effectiveSkillSnapshot.parts[0].multipliers.dr, 30);

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'SuperBreakDown', targetIndex: 0, remainingTurns: 0 }],
  };
  preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 0);
  assert.equal(preview.actions[0]._effectiveSkillSnapshot.parts[0].multipliers.dr, 37.5);
});

test('シンメトリー・リベレーション resolves replay superDown break-state snapshots without explicit SuperBreakDown status', () => {
  const store = getStore();
  const skillId = 46001523;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [
      { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
      { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 },
    ],
    destructionRateByEnemy: { 0: 999 },
    destructionRateCapByEnemy: { 0: 1299 },
    breakStateByEnemy: {
      0: {
        baseCap: 999,
        strongBreakActive: false,
        superDown: {
          preRate: 100,
          preCap: 999,
        },
      },
    },
  };

  const preview = previewActorSkill(state, skillId);
  assert.equal(preview.actions[0].spCost, 0);
  assert.equal(preview.actions[0]._effectiveSkillSnapshot.parts[0].multipliers.dr, 37.5);
});

test('HasSkill() condition can resolve triggered skill labels at preview time', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18270,
            label: 'ConditionalSkill',
            name: 'Conditional Skill',
            sp_cost: 0,
            cond: 'HasSkill(TargetSkill)==1',
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
          },
        ],
        triggeredSkills: [
          {
            id: 18271,
            label: 'TargetSkill',
            name: 'Triggered Skill',
            sp_cost: 0,
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
          },
        ],
      };
    }
    if (idx <= 2) {
      return {
        skills: [
          {
            id: 18280 + idx,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [
              {
                skill_type: 'DefenseUp',
                target_type: 'Self',
                power: [0.1, 0],
                effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const actions = {
    0: { characterId: 'M1', skillId: 18270, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 18281 },
    2: { characterId: 'M3', skillId: 18282 },
  };

  assert.doesNotThrow(() => previewTurn(createBattleStateFromParty(party), actions));

  const missingSkillParty = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18272,
            label: 'ConditionalSkill',
            name: 'Conditional Skill',
            sp_cost: 0,
            cond: 'HasSkill(TargetSkill)==1',
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
          },
        ],
      };
    }
    if (idx <= 2) {
      return {
        skills: [
          {
            id: 18290 + idx,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [
              {
                skill_type: 'DefenseUp',
                target_type: 'Self',
                power: [0.1, 0],
                effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });

  assert.throws(
    () =>
      previewTurn(createBattleStateFromParty(missingSkillParty), {
        0: { characterId: 'M1', skillId: 18272, targetEnemyIndex: 0 },
        1: { characterId: 'M2', skillId: 18291 },
        2: { characterId: 'M3', skillId: 18292 },
      }),
    /cond is not satisfied/
  );
});

test('RemoveDebuffCount()>0 enables follow-up buff and removes tracked debuff statuses', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        statusEffects: [
          {
            statusType: 'NegativeState',
            exitCond: 'PlayerTurnEnd',
            remaining: 3,
            metadata: { specialStatusTypeId: 146, isDebuff: true },
          },
        ],
        skills: [
          {
            id: 18300,
            name: 'Debuff Cleanse',
            sp_cost: 0,
            target_type: 'Self',
            parts: [
              { skill_type: 'RemoveDebuff', target_type: 'Self', power: [1, 0] },
              {
                skill_type: 'AttackUp',
                target_type: 'Self',
                power: [0.5, 0],
                hit_condition: 'RemoveDebuffCount()>0',
                effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
              },
            ],
          },
        ],
      };
    }
    if (idx <= 2) {
      return {
        skills: [
          {
            id: 18310 + idx,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [
              {
                skill_type: 'DefenseUp',
                target_type: 'Self',
                power: [0.1, 0],
                effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18300 },
    1: { characterId: 'M2', skillId: 18311 },
    2: { characterId: 'M3', skillId: 18312 },
  });
  assert.equal(findActionByCharacterId(preview, 'M1').removeDebuffCount, 1);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const actor = nextState.party[0];
  const action = findActionByCharacterId(committedRecord, 'M1');

  assert.equal(actor.statusEffects.some((effect) => Number(effect.metadata?.specialStatusTypeId) === 146), false);
  assert.ok(actor.resolveEffectiveStatusEffects('AttackUp').length > 0);
  assert.equal(action.statusEffectsApplied.some((event) => event.statusType === 'AttackUp'), true);
  assert.equal(action.statusEffectsRemoved.some((event) => event.removedCount === 1), true);
});

test('TargetBreakDownTurn()>0 evaluates against the selected enemy target', () => {
  const createParty = () =>
    createSixMemberManualParty((idx) => {
      if (idx === 0) {
        return {
          initialSP: 5,
          skills: [
            {
              id: 18320,
              name: 'Target DownTurn Check',
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'Self',
                  power: [2, 0],
                  cond: 'TargetBreakDownTurn()>0',
                },
              ],
            },
          ],
        };
      }
      if (idx <= 2) {
        return {
          skills: [
            {
              id: 18330 + idx,
              name: 'プロテクション',
              sp_cost: 0,
              target_type: 'Self',
              parts: [
                {
                  skill_type: 'DefenseUp',
                  target_type: 'Self',
                  power: [0.1, 0],
                  effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        };
      }
      return {};
    });

  const downState = createBattleStateFromParty(createParty());
  downState.turnState.enemyState = {
    ...downState.turnState.enemyState,
    enemyCount: 2,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
  };
  const downPreview = previewTurn(downState, {
    0: { characterId: 'M1', skillId: 18320, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 18331 },
    2: { characterId: 'M3', skillId: 18332 },
  });
  const downCommit = commitTurn(downState, downPreview);
  assert.equal(downCommit.nextState.party[0].sp.current, 9);

  const missState = createBattleStateFromParty(createParty());
  missState.turnState.enemyState = {
    ...missState.turnState.enemyState,
    enemyCount: 2,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
  };
  const missPreview = previewTurn(missState, {
    0: { characterId: 'M1', skillId: 18320, targetEnemyIndex: 1 },
    1: { characterId: 'M2', skillId: 18331 },
    2: { characterId: 'M3', skillId: 18332 },
  });
  const missCommit = commitTurn(missState, missPreview);
  assert.equal(missCommit.nextState.party[0].sp.current, 7);
});

test('迅雷風烈 records DefenseDown enemy status in real data', () => {
  const store = getStore();
  const skillId = 46001112;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'DefenseDown');

  assert.ok(event);
  assert.equal(event.mode, 'EnemyStatus');
  assert.equal(event.targetIndex, 0);
  assert.equal(event.remainingTurns, 1);
  assert.equal(event.power, 0.3);
});

test('まだまだ行くで！ applies Fragile enemy status in real data', () => {
  const store = getStore();
  const skillId = 46001314;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const fragile = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'Fragile' && status.targetIndex === 0
  );

  assert.ok(fragile);
  assert.equal(fragile.power, 0.3);
  assert.equal(fragile.exitCond, 'Eternal');
});

test('フレイムテンペスト records AttackDown enemy status in real data', () => {
  const store = getStore();
  const skillId = 46001705;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'AttackDown');

  assert.ok(event);
  assert.equal(event.mode, 'EnemyStatus');
  assert.equal(event.targetIndex, 0);
  assert.equal(event.remainingTurns, 1);
  assert.equal(event.power, 0.3);
});

test('今宵、快楽ナイトメア stores eternal Dark ResistDown statuses in real data', () => {
  const store = getStore();
  const skillId = 46001411;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const overwriteStatus = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'ResistDownOverwrite' && status.targetIndex === 0
  );
  const resistStatus = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'ResistDown' && status.targetIndex === 0
  );

  assert.ok(overwriteStatus);
  assert.equal(overwriteStatus.exitCond, 'Eternal');
  assert.deepEqual(overwriteStatus.elements, ['Dark']);
  assert.equal(overwriteStatus.power, 0);
  assert.ok(resistStatus);
  assert.equal(resistStatus.exitCond, 'Eternal');
  assert.deepEqual(resistStatus.elements, ['Dark']);
  assert.equal(resistStatus.power, 0.45);
});

test('今宵、快楽ナイトメア grants 5-hit Funnel only to frontline Dark styles in real data', () => {
  const store = getStore();
  const skillId = 46001411;
  const nonDarkStyleId = getSixUsableStyleIds(store).find((id) => {
    const style = store.getStyleById(Number(id));
    return Array.isArray(style?.elements) && !style.elements.includes('Dark');
  });
  assert.ok(nonDarkStyleId, 'should prepare one non-Dark frontline style');
  const state = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      extraStyleIds: [1005107, Number(nonDarkStyleId)],
    })
  );

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const tojoFunnels = committed.nextState.party[0].resolveEffectiveFunnelEffects();
  const misatoFunnels = committed.nextState.party[1].resolveEffectiveFunnelEffects();
  const nonDarkFunnels = committed.nextState.party[2].resolveEffectiveFunnelEffects();

  assert.equal(tojoFunnels.length, 1);
  assert.equal(tojoFunnels[0].power, 5);
  assert.equal(misatoFunnels.length, 1);
  assert.equal(misatoFunnels[0].power, 5);
  assert.equal(nonDarkFunnels.length, 0);
});

test('スタンブレード deterministically records StunRandom enemy status in real data', () => {
  const store = getStore();
  const skillId = 46001302;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'StunRandom');

  assert.ok(event);
  assert.equal(event.mode, 'EnemyStatus');
  assert.equal(event.targetIndex, 0);
  assert.equal(event.remainingTurns, 1);
  assert.equal(event.power, 0.85);
  assert.equal(event.exitCond, 'EnemyTurnEnd');
});

test('ナイトフォール stores Misfortune with duration derived from power in real data', () => {
  const store = getStore();
  const skillId = 46001310;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'Misfortune');
  const nextStatus = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'Misfortune' && status.targetIndex === 0
  );

  assert.ok(event);
  assert.equal(event.remainingTurns, 2);
  assert.equal(event.power, 2);
  assert.ok(nextStatus);
  assert.equal(nextStatus.remainingTurns, 1);
});

test('コードダクネス stores Hacking from the selected SkillSwitch variant in real data', () => {
  const store = getStore();
  const skillId = 46001215;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const hacking = action.enemyStatusChanges.find((item) => item.statusType === 'Hacking');
  const fragile = action.enemyStatusChanges.find((item) => item.statusType === 'Fragile');

  assert.ok(hacking);
  assert.equal(hacking.remainingTurns, 2);
  assert.equal(hacking.exitCond, 'EnemyTurnEnd');
  assert.equal(action.damageContext?.enemyAllAbilityDownByEnemy?.['0'], 100);
  assert.ok(fragile);
  assert.equal(fragile.remainingTurns, 2);
});

test('コードダクネス reads per-effect limitType from JSON (Hacking=None, Fragile=Default)', () => {
  const store = getStore();
  const skillId = 46001215;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const hacking = action.enemyStatusChanges.find((item) => item.statusType === 'Hacking');
  const fragile = action.enemyStatusChanges.find((item) => item.statusType === 'Fragile');

  assert.ok(hacking);
  assert.equal(hacking.limitType, 'None');
  assert.ok(fragile);
  assert.equal(fragile.limitType, 'Default');
});

test('Default limitType enemy status stacks when previous instance remains active (Eternal Fragile)', () => {
  const store = getStore();
  const skillId = 46001314; // まだまだ行くで！: Fragile (limitType=Default, exitCond=Eternal)
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const turn1 = commitTurn(state, previewActorSkill(state, skillId));
  const turn2 = commitTurn(turn1.nextState, previewActorSkill(turn1.nextState, skillId));
  const fragileStatuses = turn2.nextState.turnState.enemyState.statuses.filter(
    (status) => status.statusType === 'Fragile' && Number(status?.targetIndex ?? -1) === 0
  );

  assert.equal(fragileStatuses.length, 2);
});

test('コードダクネス stacks in extra-turn sequence (Hacking non-stack, Fragile stack)', () => {
  const store = getStore();
  const skillId = 46001215;
  const sourceState = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const codeDarknessSkill = structuredClone(sourceState.party[0].getSkill(skillId));
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'CD1',
        characterName: 'CD1',
        initialSP: 30,
        skills: [codeDarknessSkill],
      };
    }
    if (idx === 1) {
      return {
        skills: [
          {
            id: 990091,
            name: '追加ターン付与(テスト)',
            sp_cost: 0,
            additionalTurnRule: {
              skillUsableInExtraTurn: true,
              additionalTurnGrantInExtraTurn: true,
              conditions: {
                requiresOverDrive: false,
                requiresReinforcedMode: false,
                excludesExtraTurnForSkillUse: false,
                excludesExtraTurnForAdditionalTurnGrant: false,
              },
              additionalTurnTargetTypes: ['AllyFront'],
            },
            parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }],
          },
        ],
      };
    }
    return {
      skills: [createProtectionSkill(9800 + idx)],
    };
  });
  const initial = createBattleStateFromParty(party);
  const actorId = 'CD1';
  const extraTurnGranterId = 'M2';

  // T1: 追加ターンスキル + コードダクネス + 補助行動
  const turn1Preview = previewTurn(initial, {
    0: { characterId: actorId, skillId, targetEnemyIndex: 0 },
    1: { characterId: extraTurnGranterId, skillId: 990091 },
    2: { characterId: initial.party[2].characterId, skillId: initial.party[2].skills[0].skillId },
  }, null, 1);
  const turn1 = commitTurn(initial, turn1Preview);
  assert.equal(turn1.nextState.turnState.turnType, 'extra');

  // EX: コードダクネス
  const extraCommitted = commitTurn(
    turn1.nextState,
    previewTurn(turn1.nextState, {
      0: { characterId: actorId, skillId, targetEnemyIndex: 0 },
      1: { characterId: extraTurnGranterId, skillId: turn1.nextState.party[1].skills[0].skillId },
      2: { characterId: initial.party[2].characterId, skillId: initial.party[2].skills[0].skillId },
    }, null, 1)
  );
  const statuses = (extraCommitted.nextState.turnState.enemyState?.statuses ?? []).filter(
    (status) => Number(status?.targetIndex ?? -1) === 0
  );
  const hackingStatuses = statuses.filter((status) => status.statusType === 'Hacking');
  const fragileStatuses = statuses.filter((status) => status.statusType === 'Fragile');

  assert.equal(hackingStatuses.length, 1, 'Hacking(limitType=None) は重ならないこと');
  assert.equal(fragileStatuses.length, 2, 'Fragile(limitType=Default) は重なること');
});

test('コードダクネス stacks across OD2 actions in same turn (Hacking non-stack, Fragile stack)', () => {
  const store = getStore();
  const skillId = 46001215;
  const initial = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  initial.turnState.odGauge = 200;
  const odState = activateOverdrive(initial, 2, 'preemptive');

  // T1 OD2-1: コードダクネス
  const odAction1 = commitTurn(odState, previewActorSkill(odState, skillId));
  assert.equal(odAction1.nextState.turnState.turnType, 'od');

  // T1 OD2-2: コードダクネス
  const odAction2 = commitTurn(
    odAction1.nextState,
    previewActorSkill(odAction1.nextState, skillId)
  );
  const statuses = (odAction2.nextState.turnState.enemyState?.statuses ?? []).filter(
    (status) => Number(status?.targetIndex ?? -1) === 0
  );
  const hackingStatuses = statuses.filter((status) => status.statusType === 'Hacking');
  const fragileStatuses = statuses.filter((status) => status.statusType === 'Fragile');

  assert.equal(hackingStatuses.length, 1, 'Hacking(limitType=None) は重ならないこと');
  assert.equal(fragileStatuses.length, 2, 'Fragile(limitType=Default) は重なること');
});

test('エンジェルズ・ウィング stores Cover with duration derived from power in real data', () => {
  const store = getStore();
  const skillId = 46002106;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'Cover');
  const nextStatus = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'Cover' && status.targetIndex === 0
  );

  assert.ok(event);
  assert.equal(event.remainingTurns, 3);
  assert.equal(event.power, 3);
  assert.ok(nextStatus);
  assert.equal(nextStatus.remainingTurns, 2);
});

test('ヒットチャートからの一閃 stores eternal HealDown enemy status in real data', () => {
  const store = getStore();
  const skillId = 46001311;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const healDown = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'HealDown' && status.targetIndex === 0
  );

  assert.ok(healDown);
  assert.equal(healDown.exitCond, 'Eternal');
  assert.equal(healDown.limitType, 'Once');
  assert.equal(healDown.power, 1);
});

test('背水のギャンビット stores enemy-target AttackUp in real data', () => {
  const store = getStore();
  const skillId = 46008314;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const attackUp = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'AttackUp' && status.targetIndex === 0
  );

  assert.ok(attackUp);
  assert.equal(attackUp.exitCond, 'Eternal');
  assert.equal(attackUp.power, 0.5);
});

test('ー◯◯◯ selects the deterministic SkillRandom failure branch and stores DefenseUp in real data', () => {
  const store = getStore();
  const skillId = 46003414;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const event = action.enemyStatusChanges.find((item) => item.statusType === 'DefenseUp');
  const nextStatus = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DefenseUp' && status.targetIndex === 0
  );

  assert.ok(event);
  assert.equal(event.remainingTurns, 3);
  assert.equal(event.power, 0.5);
  assert.ok(nextStatus);
  assert.equal(nextStatus.remainingTurns, 2);
});

test('怪物球威 applies passive DefenseDown enemy status at battle start in real data', () => {
  const store = getStore();
  const skillId = 46401101;
  const state = applyInitialPassiveState(createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId)));

  const defenseDown = state.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DefenseDown' && status.targetIndex === 0
  );

  assert.ok(defenseDown);
  assert.equal(defenseDown.exitCond, 'PlayerTurnEnd');
  assert.equal(defenseDown.remainingTurns, 1);
  assert.equal(defenseDown.power, 0.1);
});

test('ハードブレード applies DefenseDown in real data despite top-level DefaultDebuff label', () => {
  const store = getStore();
  const skillId = 46001303;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === state.party[0].characterId);
  const enemyStatus = action.enemyStatusChanges.find((status) => status.statusType === 'DefenseDown');

  assert.ok(enemyStatus);
  assert.equal(enemyStatus.power, 0.3);
  assert.equal(enemyStatus.exitCond, 'EnemyTurnEnd');
});

test('炯眼の構え applies MindEye in real data despite top-level MindEyeBuff label', () => {
  const store = getStore();
  const skillId = 46001116;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const actor = committed.nextState.party[0];

  assert.equal(countActiveSpecialStatus(actor, 78), 1);
});

test('聖域のカンタータ applies BuffCharge in real data despite top-level ChargeBuff label', () => {
  const store = getStore();
  const skillId = 46007303;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(state, previewActorSkill(state, skillId));

  for (const member of committed.nextState.party.slice(0, 3)) {
    assert.equal(countActiveSpecialStatus(member, 25), 1);
  }
});

test('水影 applies Funnel in real data despite top-level FunnelUp label', () => {
  const store = getStore();
  const skillId = 46003504;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const committed = commitTurn(state, previewActorSkill(state, skillId));

  const funnelEffects = committed.nextState.party[0].resolveEffectiveFunnelEffects();
  assert.equal(funnelEffects.length, 1);
  assert.equal(funnelEffects[0].power, 3);
});

test('今宵、快楽ナイトメア stacked across extra turn raises ハネ殺し OD gain in real data', () => {
  const store = getStore();
  const fixedStyleIds = [1001406, 1005107, 1003108];
  const extraStyleIds = getSixUsableStyleIds(store)
    .filter((id) => !fixedStyleIds.includes(Number(id)))
    .slice(0, 3);
  const party = store.buildPartyFromStyleIds([...fixedStyleIds, ...extraStyleIds], {
    initialSP: 40,
    drivePierceByPartyIndex: {
      0: 15,
      1: 15,
      2: 15,
    },
  });
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 2;

  const tojoId = state.party[0].characterId;
  const misatoId = state.party[1].characterId;
  const yamawakiId = state.party[2].characterId;

  const turn1 = previewTurn(state, {
    0: { characterId: tojoId, skillId: 46001411, targetEnemyIndex: 0 },
    1: { characterId: misatoId, skillId: 46005120, targetEnemyIndex: 0 },
    2: { characterId: yamawakiId, skillId: 46003113, targetEnemyIndex: 0 },
  });
  state = commitTurn(state, turn1).nextState;
  assert.equal(state.turnState.turnType, 'extra');

  const turn2 = previewTurn(state, {
    0: { characterId: tojoId, skillId: 46001411, targetEnemyIndex: 0 },
    1: { characterId: misatoId, skillId: 46005102, targetEnemyIndex: 0 },
    2: { characterId: yamawakiId, skillId: 46003113, targetEnemyIndex: 0 },
  });
  const committed = commitTurn(state, turn2);
  const misatoAction = findActionByCharacterId(committed.committedRecord, misatoId);

  assert.ok(misatoAction);
  assert.equal(misatoAction.skillFunnelHitBonus, 10);
  assert.equal(misatoAction.skillHitCount, 13);
  assert.ok(Math.abs(Number(misatoAction.odGaugeGain ?? 0) - 69.68) < 0.01);
});

test('クレール・ド・リュンヌ heals ally SP in real data despite top-level HealSp label', () => {
  const store = getStore();
  const skillId = 46002505;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const target1 = state.party[1];
  const target2 = state.party[2];

  target1.applySpDelta(-5, 'active');
  target2.applySpDelta(-4, 'active');
  const before1 = Number(target1.sp.current ?? 0);
  const before2 = Number(target2.sp.current ?? 0);

  const committed = commitTurn(state, previewActorSkill(state, skillId));

  assert.ok(Number(committed.nextState.party[1].sp.current ?? 0) > before1);
  assert.ok(Number(committed.nextState.party[2].sp.current ?? 0) > before2);
});

test('指揮行動 records NormalBuff_Up AttackUp application on non-acting frontline allies in real data', () => {
  const store = getStore();
  const skillId = 46001134;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const committed = commitTurn(
    state,
    previewActorSkill(state, skillId, {
      targetCharacterId: state.party[1].characterId,
    })
  );
  const actor = state.party[0];
  const frontlineAlly = committed.nextState.party[1];
  const action = findActionByCharacterId(committed.committedRecord, actor.characterId);

  assert.equal(
    frontlineAlly.resolveEffectiveStatusEffects('AttackUp').some(
      (effect) => effect.metadata?.effectName === 'NormalBuff_Up'
    ),
    false,
    '1T PlayerTurnEnd status should be consumed when the next row is action-capable'
  );
  assert.equal(
    action.statusEffectsApplied.some(
      (event) =>
        event.statusType === 'AttackUp' &&
        event.targetCharacterId === frontlineAlly.characterId &&
        event.effectName === 'NormalBuff_Up'
    ),
    true
  );
});

test('ご注文を伺います records DefenseUp status application together with TokenSet and Provoke in real data', () => {
  const store = getStore();
  const skillId = 46002105;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const actor = state.party[0];

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = findActionByCharacterId(committed.committedRecord, actor.characterId);

  assert.equal(
    action.statusEffectsApplied.some(
      (event) =>
        event.statusType === 'DefenseUp' &&
        event.targetCharacterId === actor.characterId &&
        event.exitCond === 'EnemyTurnEnd'
    ),
    true
  );
  assert.equal(action.tokenChanges.some((event) => event.triggerType === 'TokenSet' && event.delta > 0), true);
  assert.equal(action.enemyStatusChanges.some((event) => event.statusType === 'Provoke'), true);
});

test('一途なスマイル stores count-based critical statuses and exposes them on the next preview in real data', () => {
  const store = getStore();
  const skillId = 46002508;
  const party = buildFullSkillRealDataParty(store, skillId, { buildOptions: { initialSP: 30 } });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const firstCommit = commitTurn(
    state,
    previewActorSkill(state, skillId, {
      targetCharacterId: actor.characterId,
    })
  );
  const nextActor = firstCommit.nextState.party[0];
  const criticalRate = nextActor.resolveEffectiveStatusEffects('CriticalRateUp')[0];
  const criticalDamage = nextActor.resolveEffectiveStatusEffects('CriticalDamageUp')[0];
  // 通常攻撃（AttackNormal ラベル）・追撃（Skill91 ラベル）は Count バフを消費しないため除外
  const followUpSkill = nextActor.skills.find(
    (skill) =>
      Number(skill.skillId ?? 0) !== skillId &&
      !String(skill.label ?? '').endsWith('AttackNormal') &&
      !String(skill.label ?? '').endsWith('Skill91') &&
      String(skill.name ?? '') !== '通常攻撃' &&
      String(skill.name ?? '') !== '追撃' &&
      (skill.parts ?? []).some((part) => String(part?.skill_type ?? '').includes('Attack'))
  );

  assert.ok(criticalRate);
  assert.ok(criticalDamage);
  assert.equal(criticalRate.metadata.effectName, 'CriticalBuff_Up');
  assert.equal(criticalDamage.metadata.effectName, 'CriticalBuff_Up');
  assert.equal(criticalRate.remaining, 1);
  assert.equal(criticalDamage.remaining, 1);
  assert.ok(followUpSkill, 'follow-up attack skill should exist on the real-data style');

  const secondPreview = previewTurn(firstCommit.nextState, {
    0: { characterId: nextActor.characterId, skillId: followUpSkill.skillId, targetEnemyIndex: 0 },
  });
  const secondAction = findActionByCharacterId(secondPreview, nextActor.characterId);

  assert.equal(secondAction.specialPassiveModifiers.criticalRateUpRate, criticalRate.power);
  assert.equal(secondAction.specialPassiveModifiers.criticalDamageUpRate, criticalDamage.power);
  assert.equal(secondAction.activeStatusEffects.length, 2);

  const secondCommit = commitTurn(firstCommit.nextState, secondPreview);
  const afterUse = secondCommit.nextState.party[0];
  const committedAction = findActionByCharacterId(secondCommit.committedRecord, afterUse.characterId);

  assert.equal(afterUse.resolveEffectiveStatusEffects('CriticalRateUp').length, 0);
  assert.equal(afterUse.resolveEffectiveStatusEffects('CriticalDamageUp').length, 0);
  assert.equal(committedAction.damageContext.criticalRateUpRate, criticalRate.power);
  assert.equal(committedAction.damageContext.criticalDamageUpRate, criticalDamage.power);
});

test('涙雨 / ホーリーエンハンス / ねこじゃらし store elemental AttackUp status metadata in real data', () => {
  const store = getStore();
  const cases = [
    { skillId: 46001412, targetPartyIndex: 1, effectName: 'IceBuff_Up', element: 'Ice', limitType: 'Only', exitCond: 'PlayerTurnEnd' },
    { skillId: 46001408, targetPartyIndex: 1, effectName: 'LightBuff_Up', element: 'Light', limitType: 'Default', exitCond: 'Count' },
    { skillId: 46002308, targetPartyIndex: 0, effectName: 'ThunderBuff_Up', element: 'Thunder', limitType: 'Default', exitCond: 'Count' },
  ];

  for (const { skillId, targetPartyIndex, effectName, element, limitType, exitCond } of cases) {
    const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
    const committed = commitTurn(state, previewActorSkill(state, skillId));
    const target = committed.nextState.party[targetPartyIndex];
    const stored = target.resolveEffectiveStatusEffects('AttackUp').find(
      (effect) => effect.metadata?.effectName === effectName
    );

    assert.ok(stored, `${effectName} should be stored as AttackUp`);
    assert.deepEqual(stored.elements, [element]);
    assert.equal(stored.limitType, limitType);
    assert.equal(stored.exitCond, exitCond);
  }
});

test('極彩色 stores nested elemental critical buffs with the selected effect label in real data', () => {
  const store = getStore();
  const skillId = 46005207;
  const state = createBattleStateFromParty(buildFullSkillRealDataParty(store, skillId, { buildOptions: { initialSP: 30 } }));
  const actor = state.party[0];
  state.turnState.zoneState = {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 8,
    powerRate: 1.8,
  };

  const committed = commitTurn(
    state,
    previewActorSkill(state, skillId, {
      targetCharacterId: actor.characterId,
    })
  );
  const nextActor = committed.nextState.party[0];
  const criticalRate = nextActor.resolveEffectiveStatusEffects('CriticalRateUp')[0];
  const criticalDamage = nextActor.resolveEffectiveStatusEffects('CriticalDamageUp')[0];

  assert.ok(criticalRate);
  assert.ok(criticalDamage);
  assert.equal(criticalRate.metadata.effectName, 'FireBuff_Up');
  assert.equal(criticalDamage.metadata.effectName, 'FireBuff_Up');
  assert.deepEqual(criticalRate.elements, ['Fire']);
  assert.deepEqual(criticalDamage.elements, ['Fire']);
});

test('リカバー remains HealDp-only and does not create active buff statuses in real data', () => {
  const store = getStore();
  const skillId = 46001104;
  const state = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: {
        initialDpStateByPartyIndex: {
          0: { baseMaxDp: 1000, currentDp: 700, effectiveDpCap: 1000 },
          1: { baseMaxDp: 1000, currentDp: 750, effectiveDpCap: 1000 },
          2: { baseMaxDp: 1000, currentDp: 800, effectiveDpCap: 1000 },
        },
      },
    })
  );
  const beforeDp = state.party.slice(0, 3).map((member) => Number(member.dpState.currentDp ?? 0));

  const committed = commitTurn(state, previewActorSkill(state, skillId));
  const action = findActionByCharacterId(committed.committedRecord, state.party[0].characterId);
  const afterDp = committed.nextState.party.slice(0, 3).map((member) => Number(member.dpState.currentDp ?? 0));

  assert.equal(action.dpChanges.some((change) => change.triggerType === 'DirectDpHeal' && change.skillType === 'HealDp'), true);
  assert.equal(afterDp.every((value, index) => value >= beforeDp[index]), true);
  assert.deepEqual(action.statusEffectsApplied, []);
});

test('スペクタクルアート becomes free only under a non-fire active zone in real data', () => {
  const store = getStore();
  const skillId = 46005222;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const noZonePreview = previewActorSkill(state, skillId);
  assert.equal(noZonePreview.actions[0].spCost, 14);

  state.turnState.zoneState = {
    type: 'Ice',
    sourceSide: 'player',
    remainingTurns: 8,
    powerRate: 1.8,
  };
  const activeZonePreview = previewActorSkill(state, skillId);
  assert.equal(activeZonePreview.actions[0].spCost, 0);
});

test('スターダムロード becomes free while charging in real data', () => {
  const store = getStore();
  const skillId = 46007411;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));

  const normalPreview = previewActorSkill(state, skillId);
  assert.equal(normalPreview.actions[0].spCost, 7);

  state.party[0].applySpecialStatus(25, 1, 'Count', {});
  const chargingPreview = previewActorSkill(state, skillId);
  assert.equal(chargingPreview.actions[0].spCost, 0);
});

test('リミット・インパクト+ halves SP cost only when at least 3 members are team 31A in real data', () => {
  const store = getStore();
  const skillId = 46001361;
  const actorStyleId = findStyleIdBySkillId(store, skillId);
  const extra31A = getUniqueTeamStyleIds(store, '31A', 2, [actorStyleId]);
  const non31A = getUniqueNonTeamStyleIds(store, '31A', 5, [actorStyleId]);

  const matchedState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      extraStyleIds: extra31A,
    })
  );
  const matchedPreview = previewActorSkill(matchedState, skillId);
  assert.equal(matchedPreview.actions[0].spCost, 5);

  const unmatchedState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      extraStyleIds: non31A,
    })
  );
  const unmatchedPreview = previewActorSkill(unmatchedState, skillId);
  assert.equal(unmatchedPreview.actions[0].spCost, 10);
});

test('燃やせ青春！マリンボール！ applies parent overwrite_cond across SkillCondition branches in real data', () => {
  const store = getStore();
  const skillId = 46001121;

  const highState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: {
        initialMotivationByPartyIndex: { 0: 5 },
      },
    })
  );
  const highPreview = previewActorSkill(highState, skillId);
  assert.equal(highPreview.actions[0].spCost, 8);

  const lowState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: {
        initialMotivationByPartyIndex: { 0: 3 },
      },
    })
  );
  const lowPreview = previewActorSkill(lowState, skillId);
  assert.equal(lowPreview.actions[0].spCost, 16);
});

test('MotivationLevel condition can trigger passives from current motivation state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 1,
          initialMotivation: 5,
          passives: [
            {
              id: 18225,
              name: 'Motivation Heal',
              timing: 'OnPlayerTurnStart',
              condition: 'MotivationLevel()>=4',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  assert.equal(state.party[0].sp.current, 3);
});

test('ThunderMark skill part does not mutate intrinsic thunder mark levels', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        elements: ['Thunder'],
        skills: [
          {
            id: 18600,
            name: 'Thunder Mark Up',
            sp_cost: 0,
            parts: [
              {
                skill_type: 'ThunderMark',
                target_type: 'AllyAll',
                power: [2, 0],
                target_condition: 'IsNatureElement(Thunder)==1',
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        elements: ['Thunder'],
        skills: [
          {
            id: 18601,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 2) {
      return {
        elements: ['Fire'],
        skills: [
          {
            id: 18602,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18600 },
    1: { characterId: 'M2', skillId: 18601 },
    2: { characterId: 'M3', skillId: 18602 },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.party[0].markStates.Thunder.current, 0);
  assert.equal(nextState.party[1].markStates.Thunder.current, 0);
  assert.equal(nextState.party[2].markStates.Thunder.current, 0);
});

test('intrinsic mark levels stay at zero when no mark-granting passive-like source exists', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx <= 2) {
      return { elements: ['Fire'] };
    }
    if (idx === 3) {
      return { elements: ['Thunder'] };
    }
    return {};
  });

  const state = createBattleStateFromParty(party);

  assert.equal(state.party[0].markStates.Fire.current, 0);
  assert.equal(state.party[1].markStates.Fire.current, 0);
  assert.equal(state.party[2].markStates.Fire.current, 0);
  assert.equal(state.party[3].markStates.Thunder.current, 0);
  assert.equal(state.party[4].markStates.Fire.current, 0);
});

test('intrinsic mark levels are initialized when a battle-start mark passive exists', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        elements: ['Thunder'],
        passives: [
          {
            id: 18605,
            name: 'Thunder Mark Start',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [{ skill_type: 'ThunderMark', target_type: 'AllyAll', target_condition: '' }],
          },
        ],
      };
    }
    if (idx === 1) {
      return { elements: ['Thunder'] };
    }
    if (idx === 2) {
      return { elements: ['Fire'] };
    }
    return {};
  });

  const state = createBattleStateFromParty(party);

  assert.equal(state.party[0].markStates.Thunder.current, 2);
  assert.equal(state.party[1].markStates.Thunder.current, 2);
  assert.equal(state.party[2].markStates.Fire.current, 0);
});

test('real-data 雷の印 passive gates intrinsic thunder mark initialization', () => {
  const store = getStore();
  const thunderMarkProviderStyleId = 1002604;
  const thunderAllyStyleId = getUniqueStyleIdsByPredicate(
    store,
    (style) => Array.isArray(style?.elements) && style.elements.includes('Thunder'),
    1,
    [thunderMarkProviderStyleId]
  )[0];
  const fillerStyleIds = getUniqueStyleIdsByPredicate(
    store,
    (style) => !Array.isArray(style?.elements) || !style.elements.includes('Thunder'),
    5,
    [thunderMarkProviderStyleId, thunderAllyStyleId]
  );

  const noProviderState = createBattleStateFromParty(
    store.buildPartyFromStyleIds([thunderAllyStyleId, ...fillerStyleIds], { initialSP: 10 })
  );
  const withProviderState = createBattleStateFromParty(
    store.buildPartyFromStyleIds(
      [thunderMarkProviderStyleId, thunderAllyStyleId, ...fillerStyleIds.slice(0, 4)],
      { initialSP: 10 }
    )
  );

  const noProviderThunderMember = noProviderState.party.find(
    (member) => Number(member.styleId) === thunderAllyStyleId
  );
  const providerThunderMember = withProviderState.party.find(
    (member) => Number(member.styleId) === thunderMarkProviderStyleId
  );
  const alliedThunderMember = withProviderState.party.find(
    (member) => Number(member.styleId) === thunderAllyStyleId
  );

  assert.ok(noProviderThunderMember);
  assert.ok(providerThunderMember);
  assert.ok(alliedThunderMember);
  assert.equal(noProviderThunderMember.markStates.Thunder.current, 0);
  assert.equal(providerThunderMember.markStates.Thunder.current, 2);
  assert.equal(alliedThunderMember.markStates.Thunder.current, 2);
});

test('DarkMarkLevel condition can trigger passives from current dark mark state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Dark: { current: 6, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18610,
              name: 'Dark Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'DarkMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 1);
});

test('LightMark passive timing keeps intrinsic light mark state unchanged at battle start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Light'],
          passives: [
            {
              id: 18620,
              name: 'Light Mark Start',
              timing: 'OnBattleStart',
              condition: '',
              parts: [{ skill_type: 'LightMark', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnBattleStart');

  assert.equal(state.party[0].markStates.Light.current, 1);
  assert.equal(result.passiveEvents.length, 0);
});

test('猛火の進撃 grants ally-wide SP+5 when fire mark level is 6 or higher', () => {
  const store = getStore();
  const passive = store
    .listPassivesByStyleId(1004307, { limitBreakLevel: 3 })
    .find((item) => String(item.name ?? '') === '猛火の進撃');
  assert.ok(passive);

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 0,
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
          passives: [passive],
        }
      : { initialSP: 0 }
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [5, 5, 5, 5, 5, 5]
  );
  assert.equal(result.spEvents.length, 6);
  assert.equal(result.passiveEvents[0]?.passiveName, '猛火の進撃');
});

test('猛火の進撃 triggers only once per sortie when passive limit is 1', () => {
  const store = getStore();
  const passive = store
    .listPassivesByStyleId(1004307, { limitBreakLevel: 3 })
    .find((item) => String(item.name ?? '') === '猛火の進撃');
  assert.ok(passive);

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 0,
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
          passives: [passive],
        }
      : { initialSP: 0 }
  );
  const state = createBattleStateFromParty(party);

  const first = applyPassiveTiming(state, 'OnEveryTurn');
  const second = applyPassiveTiming(state, 'OnEveryTurn');

  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [5, 5, 5, 5, 5, 5]
  );
  assert.equal(first.spEvents.length, 6);
  assert.equal(second.spEvents.length, 0);
  assert.equal(first.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), true);
  assert.equal(second.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), false);
});

test('夏のひより party keeps intrinsic fire marks only on fire-element allies', () => {
  const store = getStore();
  const styleIds = [1004307, 1001104, 1001204, 1001504, 1001401, 1001701];
  assert.equal(styleIds.length, 6);

  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    limitBreakLevelsByPartyIndex: { 0: 3 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  for (const member of state.party) {
    const expected = member.elements.includes('Fire') ? 4 : 0;
    assert.equal(Number(member.markStates?.Fire?.current ?? 0), expected, member.styleName);
  }
  // 夏のひより is a triggered skill passive (sourceType='triggered') that logs a passive event.
  // Mark state changes are handled by initializeIntrinsicMarkStatesFromParty, not by this passive.
  assert.equal(
    state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '夏のひより'),
    true
  );
});

test('夏のひより alone does not satisfy 猛火の進撃 fire mark threshold', () => {
  const store = getStore();
  const styleIds = [1004307, 1001104, 1001204, 1001504, 1001401, 1001701];
  assert.equal(styleIds.length, 6);

  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    limitBreakLevelsByPartyIndex: { 0: 3 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(Number(state.party[0].markStates?.Fire?.current ?? 0), 4);
  assert.equal(result.passiveEvents.some((event) => event.passiveName === '猛火の進撃'), false);
});

test('fire mark intrinsic level 6 grants extra SP only to frontline fire styles at battle start and every turn start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 3
      ? {
          initialSP: 0,
          elements: ['Fire'],
          markStates: {
            Fire: { current: 6, min: 0, max: 6 },
          },
        }
      : {
          initialSP: 0,
          elements: idx === 4 ? ['Fire'] : [],
          markStates: {
            Fire: { current: idx === 4 ? 6 : 0, min: 0, max: 6 },
          },
        }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);
  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [1, 1, 1, 0, 0, 0]
  );
  const preview = previewTurn(state, {});
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => member.sp.current),
    [4, 4, 4, 2, 2, 2]
  );
});

test('six-fire real-data opening SP includes fire mark level 6 recovery at battle start', () => {
  const store = getStore();
  const styleIds = [1004307, 1001206, 1001106, 1001506, 1002405, 1004206];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 6,
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    limitBreakLevelsByPartyIndex: { 0: 4 },
  });
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);
  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [13, 12, 15, 11, 11, 11]
  );
  const preview = previewTurn(state, {});
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => member.sp.current),
    [17, 15, 20, 13, 13, 13]
  );
  // 猛火の進撃は limit=1 のため applyInitialPassiveState（バトル開始時）に発火済み → commitTurn後には含まれない
  assert.equal(nextState.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '猛火の進撃'), false);
  assert.equal(nextState.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '吉報'), true);
});

test('fire mark intrinsic modifiers are exposed on preview and damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          elements: ['Fire'],
          markStates: {
            Fire: { current: 5, min: 0, max: 6 },
          },
          skills: [
            {
              id: 8401,
              name: '火炎斬',
              label: 'FireSlash',
              sp_cost: 4,
              hit_count: 2,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Slash',
                  elements: ['Fire'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8401 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.markAttackUpRate, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDamageTakenDownRate, 0.1);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDestructionRateGainBonusRate, 0.1);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalRateUp, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalDamageUp, 0.3);
  assert.equal(preview.actions[0].specialPassiveModifiers?.attackUpRate, 0.3);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.markAttackUpRate, 0.3);
  assert.equal(committedRecord.actions[0].damageContext?.markDamageTakenDownRate, 0.1);
  assert.equal(committedRecord.actions[0].damageContext?.markDestructionRateGainBonusRate, 0.1);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalRateUp, 0.3);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalDamageUp, 0.3);
});

test('thunder mark intrinsic level 6 grants extra SP only to frontline thunder styles at battle start and every turn start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 3
      ? {
          initialSP: 0,
          elements: ['Thunder'],
          markStates: {
            Thunder: { current: 6, min: 0, max: 6 },
          },
        }
      : {
          initialSP: 0,
          elements: idx === 4 ? ['Thunder'] : [],
          markStates: {
            Thunder: { current: idx === 4 ? 6 : 0, min: 0, max: 6 },
          },
        }
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);
  assert.deepEqual(
    state.party.map((member) => member.sp.current),
    [1, 1, 1, 0, 0, 0]
  );
  const preview = previewTurn(state, {});
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => member.sp.current),
    [4, 4, 4, 2, 2, 2]
  );
});

test('dark and light mark intrinsic modifiers are exposed on preview and damage context', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          elements: ['Dark', 'Light'],
          markStates: {
            Dark: { current: 4, min: 0, max: 6 },
            Light: { current: 5, min: 0, max: 6 },
          },
          skills: [
            {
              id: 8402,
              name: '光闇連撃',
              label: 'DualElementAttack',
              sp_cost: 4,
              hit_count: 2,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Slash',
                  elements: ['Dark', 'Light'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8402 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.markAttackUpRate, 0.6);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDamageTakenDownRate, 0.2);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markDestructionRateGainBonusRate, 0.2);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalRateUp, 0.6);
  assert.equal(preview.actions[0].specialPassiveModifiers?.markCriticalDamageUp, 0.3);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.markAttackUpRate, 0.6);
  assert.equal(committedRecord.actions[0].damageContext?.markDamageTakenDownRate, 0.2);
  assert.equal(committedRecord.actions[0].damageContext?.markDestructionRateGainBonusRate, 0.2);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalRateUp, 0.6);
  assert.equal(committedRecord.actions[0].damageContext?.markCriticalDamageUp, 0.3);
});

test('CountBC with 3 motivated allies resolves high branch when 3 members are MotivationLevel>=4', () => {
  const createParty = (motivationValues) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            initialMotivation: motivationValues[idx] ?? 3,
            skills: [
              {
                id: 18226,
                name: 'Motivation Count Branch',
                sp_cost: 12,
                target_type: 'All',
                overwrite_cond: 'CountBC(IsPlayer()==1&&MotivationLevel()>=4)>=3',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'All',
                    cond: 'CountBC(IsPlayer()==1&&MotivationLevel()>=4)>=3',
                    strval: [
                      {
                        id: 18227,
                        name: 'high',
                        sp_cost: 6,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                      {
                        id: 18228,
                        name: 'low',
                        sp_cost: 12,
                        target_type: 'All',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {
            initialMotivation: motivationValues[idx] ?? 3,
          }
    );

  const highPreview = previewTurn(createBattleStateFromParty(createParty([4, 4, 4, 3, 3, 3])), {
    0: { characterId: 'M1', skillId: 18226 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(highPreview.actions[0].spCost, 6);

  const lowPreview = previewTurn(createBattleStateFromParty(createParty([4, 4, 3, 3, 3, 3])), {
    0: { characterId: 'M1', skillId: 18226 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  assert.equal(lowPreview.actions[0].spCost, 12);
});

test('スペシャルタッグ passive resolves 3/2/1 motivated ally branches', () => {
  const createParty = (motivationValues) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            initialMotivation: motivationValues[idx] ?? 3,
            passives: [
              {
                id: 18229,
                name: 'スペシャルタッグ',
                timing: 'OnPlayerTurnStart',
                condition: 'CountBC(MotivationLevel() >= 4) > 0',
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    target_type: 'None',
                    cond: 'CountBC(MotivationLevel() >= 4) >= 3',
                    strval: [
                      {
                        id: 18230,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：3人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.3, 0] }],
                      },
                      {
                        id: 18231,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：2人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.2, 0] }],
                      },
                      {
                        id: 18232,
                        name: 'スペシャルタッグ',
                        desc: '好調以上の味方：1人',
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.1, 0] }],
                      },
                    ],
                  },
                ],
              },
            ],
          }
        : {
            initialMotivation: motivationValues[idx] ?? 3,
          }
    );

  const result3 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 4, 4, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result3.passiveEvents[0].attackUpRate, 0.3);
  assert.deepEqual(result3.passiveEvents[0].unsupportedEffectTypes, []);

  const result2 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 4, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result2.passiveEvents[0].attackUpRate, 0.2);
  assert.deepEqual(result2.passiveEvents[0].unsupportedEffectTypes, []);

  const result1 = applyPassiveTiming(createBattleStateFromParty(createParty([4, 3, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result1.passiveEvents[0].attackUpRate, 0.1);
  assert.deepEqual(result1.passiveEvents[0].unsupportedEffectTypes, []);

  const result0 = applyPassiveTiming(createBattleStateFromParty(createParty([3, 3, 3, 3, 3, 3])), 'OnPlayerTurnStart');
  assert.equal(result0.passiveEvents.length, 0);
});

test('掴め栄冠！グランドスラム！ sets all ally motivation levels to 5', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46002210);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    initialMotivationByPartyIndex: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 1 },
    skillSetsByPartyIndex: {
      0: [46002210],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46002210 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => member.motivationState.current),
    [5, 5, 5, 5, 5, 5]
  );
  const motivationEvents = committedRecord.actions.flatMap((entry) => entry.motivationChanges ?? []);
  assert.equal(motivationEvents.some((event) => event.triggerType === 'Motivation' && event.postMotivation === 5), true);
});

test('絶好調女 gives SP+1 only to allies whose motivation level is 5', () => {
  const store = getStore();
  const actorStyleId = 1002207;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 5, 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 },
  });
  const state = createBattleStateFromParty(party);

  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 2);
  assert.equal(state.party[0].sp.current, 2);
  assert.equal(state.party[1].sp.current, 2);
  assert.equal(state.party[2].sp.current, 1);
  assert.equal(state.party[3].sp.current, 1);
  assert.equal(state.party[4].sp.current, 1);
  assert.equal(state.party[5].sp.current, 1);
  assert.equal(
    result.passiveEvents.some((event) => event.passiveName === '絶好調女' && event.spDelta === 2),
    true
  );
});

test('怪童 gives self SP+1 only when motivation is 4 or higher', () => {
  const store = getStore();
  const actorStyleId = 1001110;
  const actorStyle = store.getStyleById(actorStyleId);
  const others = getSixUsableStyleIds(store).filter(
    (id) => String(store.getStyleById(id)?.chara ?? '') !== String(actorStyle?.chara ?? '')
  );

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEveryTurn');
  assert.equal(highState.party[0].sp.current, 2);
  assert.equal(highResult.passiveEvents.some((event) => event.passiveName === '怪童' && event.spDelta === 1), true);

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 1 },
    initialMotivationByPartyIndex: { 0: 3 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEveryTurn');
  assert.equal(lowState.party[0].sp.current, 1);
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('球界の頭脳 adds 10% OD gauge only when motivation is 4 or higher', () => {
  const store = getStore();
  const actorStyleId = 1004508;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 3 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const highState = createBattleStateFromParty(highParty);
  highState.turnState.odGauge = 20;
  const highResult = applyPassiveTiming(highState, 'OnEveryTurn');
  assert.equal(highState.turnState.odGauge, 30);
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '球界の頭脳' && event.odGaugeDelta === 10),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 3 },
    initialMotivationByPartyIndex: { 0: 3 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  lowState.turnState.odGauge = 20;
  const lowResult = applyPassiveTiming(lowState, 'OnEveryTurn');
  assert.equal(lowState.turnState.odGauge, 20);
  assert.equal(lowResult.passiveEvents.length, 0);
});

test('不屈の魂 applies DebuffGuard only when motivation is 5', () => {
  const store = getStore();
  const actorStyleId = 1001110;
  const actorStyle = store.getStyleById(actorStyleId);
  const others = getSixUsableStyleIds(store).filter(
    (id) => String(store.getStyleById(id)?.chara ?? '') !== String(actorStyle?.chara ?? '')
  );

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 5 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  const guardEffects = highState.party[0].getStatusEffectsByType('DebuffGuard');
  assert.equal(guardEffects.length, 1);
  assert.equal(guardEffects[0].exitCond, 'EnemyTurnEnd');
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '不屈の魂' && event.appliedStatusEffects?.length === 1),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowState.party[0].getStatusEffectsByType('DebuffGuard').length, 0);
  assert.equal(lowResult.passiveEvents.some((event) => event.passiveName === '不屈の魂'), false);
});

test('明鏡止水 applies DebuffGuard only when motivation is 5', () => {
  const store = getStore();
  const actorStyleId = 1002207;
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);

  const highParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 5 },
  });
  const highState = createBattleStateFromParty(highParty);
  const highResult = applyPassiveTiming(highState, 'OnEnemyTurnStart');
  assert.equal(highState.party[0].getStatusEffectsByType('DebuffGuard').length, 1);
  assert.equal(
    highResult.passiveEvents.some((event) => event.passiveName === '明鏡止水' && event.appliedStatusEffects?.length === 1),
    true
  );

  const lowParty = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 1,
    limitBreakLevelsByPartyIndex: { 0: 0 },
    initialMotivationByPartyIndex: { 0: 4 },
  });
  const lowState = createBattleStateFromParty(lowParty);
  const lowResult = applyPassiveTiming(lowState, 'OnEnemyTurnStart');
  assert.equal(lowState.party[0].getStatusEffectsByType('DebuffGuard').length, 0);
  assert.equal(lowResult.passiveEvents.some((event) => event.passiveName === '明鏡止水'), false);
});

test('BreakGuard skill part is added to self status effects and recorded on commit', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18180,
              name: '聖女の守護',
              sp_cost: 0,
              target_type: 'Self',
              parts: [
                {
                  skill_type: 'BreakGuard',
                  target_type: 'Self',
                  power: [0.5, 0],
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18180 },
  });
  const committed = commitTurn(state, preview);
  const actor = committed.nextState.party.find((member) => member.characterId === 'M1');
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(actor.getStatusEffectsByType('BreakGuard').length, 1);
  assert.equal(actor.getStatusEffectsByType('BreakGuard')[0].exitCond, 'Count');
  assert.equal(action.statusEffectsApplied.length, 1);
  assert.equal(action.statusEffectsApplied[0].statusType, 'BreakGuard');
});

test('applyInitialPassiveState applies BreakGuard passive into status effects', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 91020,
              name: '根性',
              timing: 'OnBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'BreakGuard',
                  target_type: 'Self',
                  power: [0.5, 0],
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.equal(state.party[0].getStatusEffectsByType('BreakGuard').length, 1);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '根性'), true);
  assert.equal(
    state.turnState.passiveEventsLastApplied.some(
      (event) =>
        event.passiveName === '根性' &&
        Array.isArray(event.appliedStatusEffects) &&
        event.appliedStatusEffects.some((effect) => effect.statusType === 'BreakGuard')
    ),
    true
  );
});

test('AdditionalHitOnSpecifiedSkill can raise morale via passive trigger', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EAoi',
          characterName: '青井',
          passives: [
            {
              id: 18230,
              name: 'ムードメーカー',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'AdditionalHitOnSpecifiedSkill',
                  target_type: 'Self',
                  strval: [-1, { id: 18231, label: 'EAoiSkillX', name: 'Trigger Skill' }],
                },
                { skill_type: 'Morale', target_type: 'AllyAll', power: [2, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18231,
              label: 'EAoiSkillX',
              name: 'Trigger Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'EAoi', skillId: 18231, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party[1].moraleState.current, 2);
});

test('AdditionalHitOnExtraSkill can raise morale when restricted skill is used', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18240,
              name: 'Extra Morale',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self' },
                { skill_type: 'Morale', target_type: 'Self', power: [3, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18241,
              label: 'TestSkill51',
              name: 'EX Skill',
              is_restricted: 1,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18241, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 3);
});

test('AdditionalHitOnKillCount can raise morale per defeated enemy', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KILL1',
          characterName: 'KILL1',
          passives: [
            {
              id: 18250,
              name: '迸る衝動',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self' },
                { skill_type: 'Morale', target_type: 'Self', power: [2, 0] },
              ],
            },
          ],
          skills: [
            {
              id: 18251,
              name: 'Kill Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KILL1', skillId: 18251, killCount: 2 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'KILL1');

  assert.equal(nextState.party[0].moraleState.current, 4);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.triggerType === 'MoralePassiveTrigger' && item.delta === 4), true);
});

test('real kill-count morale passive raises morale for ally party members', () => {
  const store = getStore();
  const allyMoralePassive = structuredClone(store.passives.find((passive) => Number(passive?.id) === 100460600));
  assert.ok(allyMoralePassive);
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'LEAD1',
          characterName: 'LEAD1',
          initialSP: 20,
          passives: [allyMoralePassive],
          skills: [
            {
              id: 18252,
              name: 'Leader Kill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'LEAD1', skillId: 18252, killCount: 2, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [2, 2, 2, 2, 2, 2]
  );
});

test('real token consume skill 星降るシャンデリア・グラス spends 5 token and grants token and morale to all allies', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006511);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  actor.tokenState.current = 7;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006511 },
  });
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startToken, 7);
  assert.equal(preview.actions[0].endToken, 2);
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'IrOhshima');
  // IrOhshima has ボルテージ passive (OnEveryTurn, TokenSet +1) that fires in recovery pipeline
  assert.equal(nextState.party[0].tokenState.current, 7); // 7-5+4=6 from skill, +1 from passive
  assert.deepEqual(
    nextState.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [7, 3, 3, 3, 3, 3]
  );
  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [3, 3, 3, 3, 3, 3]
  );
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -5), true);
  assert.equal((entry.moraleChanges ?? []).some((item) => item.triggerType === 'Morale' && item.delta === 3), true);
});

test('一途 spends 5 token on preview and commit', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46004211);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46004211],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  actor.tokenState.current = 7;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46004211, targetEnemyIndex: 0 },
  });
  assert.equal(actor.characterId, 'MTsukishiro');
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 20);
  assert.equal(preview.actions[0].startToken, 7);
  assert.equal(preview.actions[0].endToken, 2);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(nextState.party[0].sp.current, 20);
  assert.equal(nextState.party[0].tokenState.current, 3);
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -5), true);
  assert.equal(
    (entry.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSetByAttacking' && item.delta === 1),
    true
  );
});

test('サマーグレイス is usable outside OD and blocked during OD', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006610);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006610],
    },
  });
  let state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006610 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'MuOhshima');
  assert.equal(preview.actions[0].spCost, 4);
  assert.equal(preview.actions[0].startToken, 0);
  // MuOhshima has ボルテージ passive (OnEveryTurn, TokenSet +1) that fires in recovery pipeline
  assert.equal(nextState.party[0].tokenState.current, 3); // 2 from skill + 1 from passive
  assert.equal(
    (entry.tokenChanges ?? []).some((item) => item.triggerType === 'TokenSet' && item.delta === 2),
    true
  );

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: actor.characterId, skillId: 46006610 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('真夏のひんやりショック！ consumes all token and converts it to OD gain', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006609);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006609],
    },
  });
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 40;
  const actor = state.party[0];
  actor.tokenState.current = 4;

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006609 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'MuOhshima');
  assert.equal(preview.actions[0].consumeType, 'Token');
  assert.equal(preview.actions[0].startToken, 4);
  // commitTurn overwrites entry.endToken with post-recovery value (0 from cost + 1 from passive)
  assert.equal(preview.actions[0].endToken, 1);
  // MuOhshima has ボルテージ passive (OnEveryTurn, TokenSet +1) that fires in recovery pipeline
  assert.equal(nextState.party[0].tokenState.current, 1); // 4-4=0 from skill, +1 from passive
  assert.equal(entry.odGaugeGain, 40);
  assert.equal(nextState.turnState.odGauge, 80);
  assert.equal((entry.tokenChanges ?? []).some((item) => item.source === 'cost' && item.delta === -4), true);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenPerToken, 0.1);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenTokenCount, 4);
  assert.equal(entry.damageContext?.overDrivePointUpByTokenTotalPercent, 40);
});

test('orb skill Cheer Up raises self morale for characters without innate morale support', () => {
  const store = getStore();
  const actorStyleId = 1001201; // YIzumi
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'YIzumi');
  const styleIds = [actorStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46300018], // [オーブ] チアーアップ
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  assert.equal(actor.characterId, 'YIzumi');

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46300018 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].moraleState.current, 2);
  assert.equal(nextState.party.slice(1).every((member) => Number(member.moraleState?.current ?? 0) === 0), true);
  assert.equal(
    (committedRecord.actions.find((entry) => entry.characterId === actor.characterId)?.moraleChanges ?? []).some(
      (item) => item.triggerType === 'Morale' && item.delta === 2
    ),
    true
  );
});

test('frontline morale skill raises morale only for front members', () => {
  const store = getStore();
  const actorStyleId = 1008303; // IRedmayne
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'IRedmayne');
  const styleIds = [actorStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46008314], // 背水のギャンビット
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  assert.equal(actor.characterId, 'IRedmayne');

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46008314, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [5, 5, 5, 0, 0, 0]
  );
});

test('ハートフル・ボマー+ raises morale for all allies', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46005461);
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? '');
  const extra31d = [];
  const seen31dChars = new Set([actorCharaLabel]);
  for (const style of store.styles) {
    if (String(style?.team ?? '') !== '31D') {
      continue;
    }
    const styleId = Number(style.id);
    const charaLabel = String(style?.chara_label ?? '');
    if (!Number.isFinite(styleId) || styleId === actorStyleId || seen31dChars.has(charaLabel)) {
      continue;
    }
    seen31dChars.add(charaLabel);
    extra31d.push(styleId);
    if (extra31d.length >= 2) {
      break;
    }
  }
  assert.equal(extra31d.length, 2);
  const others = getSixUsableStyleIds(store).filter((id) => ![actorStyleId, ...extra31d].includes(Number(id)));
  const styleIds = [actorStyleId, ...extra31d, ...others.slice(0, 3)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [46005461],
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46005461, targetEnemyIndex: 0 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === actor.characterId);

  assert.equal(actor.characterId, 'RMurohushi');
  assert.deepEqual(
    nextState.party.map((member) => Number(member.moraleState?.current ?? 0)),
    [4, 4, 4, 4, 4, 4]
  );
  assert.equal(
    (entry.moraleChanges ?? []).filter((item) => item.triggerType === 'Morale' && item.delta === 4).length,
    1
  );
});

test('バーテンダーズ・チョイス splits first and second use for token gain and OD cost', () => {
  const store = getStore();
  const actorStyleId = findStyleIdBySkillId(store, 46006308);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], {
    initialSP: 10,
    skillSetsByPartyIndex: {
      0: [46006308],
    },
  });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  const actor = state.party[0];

  const preview1 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006308 },
  });
  assert.equal(actor.characterId, 'MiOhshima');
  assert.equal(preview1.actions[0].spCost, 0);
  const commit1 = commitTurn(state, preview1);
  state = commit1.nextState;

  assert.equal(state.turnState.odGauge, 85);
  // MiOhshima has ボルテージ passive (OnEveryTurn, TokenSet +1) that fires in recovery pipeline
  assert.deepEqual(
    state.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [3, 2, 2, 0, 0, 0] // MiOhshima: 0+2(skill)+1(passive)=3, others: 0+2(skill)=2
  );
  assert.deepEqual(
    state.party.map((member) => Number(member.sp?.current ?? 0)),
    [15, 15, 15, 15, 15, 15]
  );

  const preview2 = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46006308 },
  });
  assert.equal(preview2.actions[0].spCost, 0);
  const commit2 = commitTurn(state, preview2);
  state = commit2.nextState;

  assert.equal(state.turnState.odGauge, 70);
  assert.deepEqual(
    state.party.map((member) => Number(member.tokenState?.current ?? 0)),
    [6, 4, 4, 0, 0, 0] // MiOhshima: 3+2(skill)+1(passive)=6, others: 2+2(skill)=4
  );
  assert.deepEqual(
    state.party.map((member) => Number(member.sp?.current ?? 0)),
    [17, 17, 17, 17, 17, 17]
  );
});

test('TokenSet OnEveryTurn passive increments token each turn via recovery pipeline', () => {
  const store = getStore();
  // MiOhshima has ボルテージ (OnEveryTurn, TokenSet +1)
  const actorStyleId = findStyleIdBySkillId(store, 46006308);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], { initialSP: 10 });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];
  assert.equal(actor.characterId, 'MiOhshima');
  assert.equal(actor.tokenState.current, 0);

  // First commitTurn: no skill used, recovery pipeline fires OnEveryTurn
  const preview1 = previewTurn(state, { 0: { characterId: actor.characterId, skillId: actor.skills[0].skillId } });
  const { nextState: state1 } = commitTurn(state, preview1);
  // ボルテージ fires: token 0+1=1
  assert.equal(state1.party[0].tokenState.current, 1);

  // Second commitTurn: ボルテージ fires again: token 1+1=2
  const preview2 = previewTurn(state1, { 0: { characterId: actor.characterId, skillId: actor.skills[0].skillId } });
  const { nextState: state2 } = commitTurn(state1, preview2);
  assert.equal(state2.party[0].tokenState.current, 2);
});

test('TokenSet OnBattleStart passive increments token at battle start via applyInitialPassiveState', () => {
  const store = getStore();
  // IrOhshima has 洗練 (OnBattleStart, TokenSet +5, condition: front)
  const actorStyleId = findStyleIdBySkillId(store, 46006511);
  const others = getSixUsableStyleIds(store).filter((id) => Number(id) !== actorStyleId);
  const party = store.buildPartyFromStyleIds([actorStyleId, ...others.slice(0, 5)], { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state = applyInitialPassiveState(state);
  const actor = state.party[0];

  assert.equal(actor.characterId, 'IrOhshima');
  // 洗練 fires at OnBattleStart for front members: +5 token
  // ボルテージ fires at OnEveryTurn: +1 token
  assert.equal(actor.tokenState.current, 6); // 5 (OnBattleStart) + 1 (OnEveryTurn)
  // Others have no TokenSet passives
  assert.equal(state.party[1].tokenState.current, 0);

  const result = applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(state.party[0].tokenState.current, 7);
  assert.equal(result.passiveEvents.some((event) => event.passiveName === 'ボルテージ'), true);
});

test('preemptive od returns to same normal turn context after remaining actions consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.remainingOdActions, 1);

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 1);
});

test('activateOverdrive consumes gauge by level and rejects insufficient gauge unless forced', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);

  state.turnState.odGauge = 250.5;
  state = activateOverdrive(state, 2, 'preemptive');
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.odGauge, 50.5);

  const lowGaugeState = createBattleStateFromParty(party);
  lowGaugeState.turnState.odGauge = 80;
  assert.throws(() => activateOverdrive(lowGaugeState, 1, 'preemptive'), /requires 100% gauge/);

  const forcedState = activateOverdrive(lowGaugeState, 1, 'preemptive', { forceActivation: true });
  assert.equal(forcedState.turnState.turnType, 'od');
  assert.equal(forcedState.turnState.odGauge, 80);
});

test('passive timing coverage report identifies controller gaps against passives.json', () => {
  const store = getStore();
  const report = analyzePassiveTimingCoverage(store.passives);

  assert.deepEqual(
    report.supportedTimings.map((item) => item.timing),
    [
      'OnAdditionalTurnStart',
      'OnBattleStart',
      'OnBattleWin',
      'OnEnemyTurnStart',
      'OnEveryTurn',
      'OnFirstBattleStart',
      'OnOverdriveStart',
      'OnPlayerTurnStart',
    ]
  );
  assert.deepEqual(
    report.unsupportedTimings.map((item) => item.timing),
    ['None', 'OnEveryTurnIncludeSpecial']
  );
});

test('condition support matrix classifies passive conditions by planned tier', () => {
  const report = analyzePassiveConditionSupport([
    {
      id: 1,
      name: 'Support A',
      condition: 'DpRate()>=1.0 && IsFront()',
      parts: [],
    },
    {
      id: 2,
      name: 'Support B',
      condition: 'ConquestBikeLevel()>=80 || Random()<0.3',
      parts: [],
    },
    {
      id: 3,
      name: 'Support C',
      condition: 'IsNatureElement(Fire)==1 && IsCharacter(IIshii)==1',
      parts: [],
    },
    {
      id: 4,
      name: 'Support D',
      condition: 'MoraleLevel()>=6',
      parts: [],
    },
  ]);

  assert.deepEqual(report.summary.implemented, ['ConquestBikeLevel', 'DpRate', 'IsFront', 'MoraleLevel', 'Random']);
  assert.deepEqual(report.summary.ready_now, ['IsCharacter', 'IsNatureElement']);
  assert.deepEqual(report.summary.manual_state, []);
  assert.deepEqual(report.summary.stateful_future, []);
});

test('activateOverdrive records triggered passive events for debug logging', () => {
  const store = getStore();
  const styleIds = [
    1001408,
    ...getSixUsableStyleIds(store)
      .filter((id) => store.getStyleById(id)?.chara_label !== 'TTojo')
      .slice(0, 5),
  ];
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);

  state.turnState.odGauge = 120;
  state = activateOverdrive(state, 1, 'preemptive');

  const passiveEvents = state.turnState.passiveEventsLastApplied ?? [];
  assert.equal(passiveEvents.length > 0, true);
  assert.equal(passiveEvents.some((event) => event.turnLabel === 'OD1-1'), true);
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.characterName === '東城 つかさ' &&
        String(event.passiveDesc ?? '').includes('オーバードライブ中 ダメージアップ')
    ),
    true
  );
});

test('commitTurn can activate interrupt OD after commit', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 150;

  const preview = previewTurn(state, buildActionDict(party));
  const { nextState } = commitTurn(state, preview, [], { interruptOdLevel: 1 });

  assert.equal(nextState.turnState.turnType, 'od');
  assert.equal(nextState.turnState.odContext, 'interrupt');
  assert.equal(nextState.turnState.odGauge < 150, true, 'interrupt OD should consume 100% gauge');
  assert.equal(nextState.turnState.odGauge > 0, true, 'remaining gauge should stay positive in this case');
  assert.equal(nextState.turnState.turnIndex, 1, 'interrupt OD should keep base turn index until OD ends');
});

test('interrupt OD advances to next base turn after OD sequence ends', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 150;

  // T1 の行動後に割込OD1へ入る (T1 | OD1-1)
  const preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview, [], { interruptOdLevel: 1 }).nextState;
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnIndex, 1);
  assert.equal(state.turnState.turnLabel, 'OD1-1');

  // OD1-1 消化後は T2 に進む
  const odPreview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, odPreview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnIndex, 2);
  assert.equal(state.turnState.turnLabel, 'T2');
});

test('interrupt OD does not fire OnEnemyTurnStart until OD completes', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          baseMaxDp: 70,
          currentDp: 35,
          skills: [createProtectionSkill(9900)],
          passives: [
            {
              id: 18218,
              name: '充填',
              timing: 'OnEnemyTurnStart',
              condition: 'DpRate()<=0.5 && IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.1, 0] }],
            },
          ],
        }
      : {
          initialSP: 10,
          baseMaxDp: 70,
          skills: [createProtectionSkill(9900 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;

  const preview1 = previewTurn(state, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9901 },
    2: { characterId: 'M3', skillId: 9902 },
  });
  const { nextState: odState, committedRecord: firstCommit } = commitTurn(state, preview1, [], {
    interruptOdLevel: 1,
  });

  const firstEnemyTurnStartEvents = (firstCommit.passiveEvents ?? []).filter(
    (event) => event.timing === 'OnEnemyTurnStart' && event.passiveName === '充填'
  );
  assert.equal(firstEnemyTurnStartEvents.length, 0);
  assert.equal(odState.turnState.turnType, 'od');
  assert.equal(odState.turnState.turnIndex, 1);
  assert.equal(odState.party[0].dpState.currentDp, 35);

  const preview2 = previewTurn(odState, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9901 },
    2: { characterId: 'M3', skillId: 9902 },
  });
  const { nextState: normalState, committedRecord: secondCommit } = commitTurn(odState, preview2);

  const secondEnemyTurnStartEvents = (secondCommit.passiveEvents ?? []).filter(
    (event) => event.timing === 'OnEnemyTurnStart' && event.passiveName === '充填'
  );
  assert.equal(secondEnemyTurnStartEvents.length, 1);
  assert.equal(secondEnemyTurnStartEvents[0].dpDelta, 7);
  assert.equal(normalState.turnState.turnType, 'normal');
  assert.equal(normalState.turnState.turnIndex, 2);
  assert.equal(normalState.party[0].dpState.currentDp, 42);
});

test('normal/od/extra boundary transitions keep expected turn labels and indices', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });
  const firstCharacterId = party.getByPosition(0).characterId;

  let state = createBattleStateFromParty(party);
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
  assert.equal(state.turnState.sequenceId, 1);

  let preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T2');
  assert.equal(state.turnState.turnIndex, 2);
  assert.equal(state.turnState.sequenceId, 2);

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD1-1');
  assert.equal(state.turnState.turnIndex, 2, 'preemptive OD should keep base turn index');
  assert.equal(state.turnState.sequenceId, 2, 'OD activation itself should not advance sequence');

  preview = previewTurn(state, buildActionDict(party));
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T2');
  assert.equal(state.turnState.turnIndex, 2, 'OD1 end should return to same base turn context');
  assert.equal(state.turnState.sequenceId, 3);

  state = grantExtraTurn(state, [firstCharacterId]);
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.turnLabel, 'EX');
  assert.equal(state.turnState.turnIndex, 2, 'granting extra turn should not advance base turn');
  assert.equal(state.turnState.sequenceId, 3);

  preview = previewTurn(state, {
    0: { characterId: firstCharacterId, skillId: party.getByPosition(0).skills[0].skillId },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T3');
  assert.equal(state.turnState.turnIndex, 3);
  assert.equal(state.turnState.sequenceId, 4);
});

function createTranscendenceTestParty({ initialGaugePercent = null, withBurst = false } = {}) {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TC${idx + 1}`,
      characterName: `TC${idx + 1}`,
      styleId: idx + 1,
      styleName: `TS${idx + 1}`,
      role: idx === 0 ? 'Admiral' : 'Attacker',
      elements: idx <= 2 ? ['Ice'] : ['Fire'],
      transcendenceRule:
        idx === 0
          ? {
              styleId: 1,
              gaugeElement: 'Ice',
              initialGaugePercentPerMatchingElementMember: 15,
              gaugeGainPercentOnMatchingElementAction: 4,
              maxGaugePercent: 100,
              triggerOnReachMax: {
                odGaugeDeltaPercent: 100,
                burst: withBurst
                  ? {
                      enabled: true,
                      element: 'Ice',
                      attackUpPercent: 300,
                      destructionRateBonusPercent: 10,
                      attackBuffSkillEffectUpPercent: 20,
                      debuffSkillEffectUpPercent: 20,
                      criticalGuaranteed: true,
                      criticalDamageUpPercent: 100,
                      destructionRateCapPercent: 300,
                    }
                  : null,
              },
            }
          : null,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15000 + idx,
          name: 'Support',
          sp_cost: 0,
          parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );

  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  if (initialGaugePercent !== null) {
    state.turnState.transcendence.gaugePercent = Number(initialGaugePercent);
  }
  return state;
}

const REAL_DATA_DARK_TRANSCENDENCE_STYLE_ID = 1005107;
const REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT = 3;
const TRANSCENDENCE_INITIAL_GAUGE_PERCENT_PER_MEMBER = 15;
const TRANSCENDENCE_GAUGE_GAIN_PERCENT_PER_UNIT = 4;

function createRealDataDarkTranscendenceState() {
  const store = getStore();
  const supportingDarkStyleIds = getUniqueStyleIdsByPredicate(
    store,
    (style) => Array.isArray(style?.elements) && style.elements.includes('Dark'),
    2,
    [REAL_DATA_DARK_TRANSCENDENCE_STYLE_ID]
  );
  const fillerStyleIds = getUniqueStyleIdsByPredicate(
    store,
    (style) => !Array.isArray(style?.elements) || !style.elements.includes('Dark'),
    3,
    [REAL_DATA_DARK_TRANSCENDENCE_STYLE_ID, ...supportingDarkStyleIds]
  );
  const party = store.buildPartyFromStyleIds(
    [REAL_DATA_DARK_TRANSCENDENCE_STYLE_ID, ...supportingDarkStyleIds, ...fillerStyleIds],
    { initialSP: 99 }
  );
  return createBattleStateFromParty(party);
}

test('transcendence gauge initializes by matching-element member count x 15%', () => {
  const state = createTranscendenceTestParty();
  assert.equal(state.turnState.transcendence?.active, true);
  assert.equal(state.turnState.transcendence?.gaugeElement, 'Ice');
  assert.equal(state.turnState.transcendence?.gaugePercent, 45);
});

test('transcendence gauge gains +4 per matching-element action and is capped at 100%', () => {
  let state = createTranscendenceTestParty({ initialGaugePercent: 96 });
  state.turnState.odGauge = 10;

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 }, // Ice
    1: { characterId: 'TC2', skillId: 15001 }, // Ice
    2: { characterId: 'TC3', skillId: 15002 }, // Ice
  });
  assert.equal(preview.projections?.transcendence?.endGaugePercent, 100);
  assert.equal(preview.projections?.transcendence?.odGaugeBonusPercent, 100);

  const committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.transcendence?.gaugePercent, 100);
  assert.equal(state.turnState.odGauge, 110);

  // 2ターン目: すでに100%到達済みのため、OD+100は再発しない。
  const preview2 = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15000 },
    1: { characterId: 'TC2', skillId: 15001 },
    2: { characterId: 'TC3', skillId: 15002 },
  });
  const committed2 = commitTurn(state, preview2);
  assert.equal(committed2.nextState.turnState.odGauge, 110);
  assert.equal(committed2.nextState.turnState.transcendence?.gaugePercent, 100);
});

test('transcendence burst applies matching-element attack and critical modifiers after reaching 100%', () => {
  const state = createTranscendenceTestParty({ initialGaugePercent: 100, withBurst: true });
  state.turnState.transcendence.burstTriggered = true;
  state.party[0].skills = Object.freeze([
    ...state.party[0].skills,
    {
      id: 15200,
      skillId: 15200,
      name: 'Ice Burst Hit',
      sp_cost: 0,
      hit_count: 1,
      target_type: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Ice'] }],
    },
  ]);
  state.party[1].elements = ['Fire'];
  state.party[1].skills = Object.freeze([
    ...state.party[1].skills,
    {
      id: 15201,
      skillId: 15201,
      name: 'Fire Burst Miss',
      sp_cost: 0,
      hit_count: 1,
      target_type: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Ice'] }],
    },
  ]);

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15200, targetEnemyIndex: 0 },
    1: { characterId: 'TC2', skillId: 15201, targetEnemyIndex: 0 },
  });
  const iceAction = findActionByCharacterId(preview, 'TC1');
  const fireAction = findActionByCharacterId(preview, 'TC2');

  assert.equal(iceAction.specialPassiveModifiers.transcendenceBurstAttackUpRate, 3);
  assert.equal(iceAction.specialPassiveModifiers.attackUpRate, 3);
  assert.equal(iceAction.specialPassiveModifiers.criticalRateUpRate, 1);
  assert.equal(iceAction.specialPassiveModifiers.criticalDamageUpRate, 1);
  assert.equal(fireAction.specialPassiveModifiers.transcendenceBurstAttackUpRate, 0);
  assert.equal(fireAction.specialPassiveModifiers.attackUpRate, 0);

  const { committedRecord } = commitTurn(state, preview);
  const committedIceAction = findActionByCharacterId(committedRecord, 'TC1');
  assert.equal(committedIceAction.damageContext.attackUpRate, 3);
  assert.equal(committedIceAction.damageContext.transcendenceBurstAttackUpRate, 3);
  assert.equal(committedIceAction.damageContext.criticalRateBreakdown?.isCriticalGuaranteed, true);
});

test('transcendence burst modifiers stay zero before burst is triggered', () => {
  const state = createTranscendenceTestParty({ initialGaugePercent: 99, withBurst: true });
  state.party[0].skills = Object.freeze([
    ...state.party[0].skills,
    {
      id: 15205,
      skillId: 15205,
      name: 'Ice Pre Burst Hit',
      sp_cost: 0,
      hit_count: 1,
      target_type: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Ice'] }],
    },
  ]);

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15205, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'TC1');

  assert.equal(state.turnState.transcendence?.burstTriggered, false);
  assert.equal(action.specialPassiveModifiers.transcendenceBurstAttackUpRate, 0);
  assert.equal(action.specialPassiveModifiers.transcendenceBurstCriticalRateUpRate, 0);
  assert.equal(action.specialPassiveModifiers.transcendenceBurstDestructionRateGainBonusRate, 0);
});

test('transcendence burst scales matching-element attack buff and debuff skill effects by 20%', () => {
  const state = createTranscendenceTestParty({ initialGaugePercent: 100, withBurst: true });
  state.turnState.transcendence.burstTriggered = true;
  state.party[0].skills = Object.freeze([
    {
      id: 15210,
      skillId: 15210,
      name: 'Burst Attack Buff',
      sp_cost: 0,
      target_type: 'Self',
      parts: [
        {
          skill_type: 'AttackUp',
          target_type: 'Self',
          power: [0.5, 0],
          effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
        },
      ],
    },
  ]);
  state.party[1].skills = Object.freeze([
    {
      id: 15211,
      skillId: 15211,
      name: 'Burst Defense Down',
      sp_cost: 0,
      target_type: 'Single',
      parts: [
        {
          skill_type: 'DefenseDown',
          target_type: 'Single',
          power: [0.5, 0],
          effect: { limitType: 'Default', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
        },
      ],
    },
  ]);
  state.turnState.enemyState.enemyCount = 1;

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15210 },
    1: { characterId: 'TC2', skillId: 15211, targetEnemyIndex: 0 },
  });
  assert.equal(findActionByCharacterId(preview, 'TC1').specialPassiveModifiers.giveAttackBuffUpRate, 0.2);
  assert.equal(findActionByCharacterId(preview, 'TC2').specialPassiveModifiers.giveDefenseDebuffUpRate, 0.2);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(findActionByCharacterId(committedRecord, 'TC1').statusEffectsApplied[0].power, 0.6);
  assert.equal(findActionByCharacterId(committedRecord, 'TC2').enemyStatusChanges[0].power, 0.6);
});

test('transcendence burst raises destruction gain and cap without stacking with SuperBreak cap bonus', () => {
  const state = createTranscendenceTestParty({ initialGaugePercent: 100, withBurst: true });
  state.turnState.transcendence.burstTriggered = true;
  state.party[0].skills = Object.freeze([
    {
      id: 15220,
      skillId: 15220,
      name: 'Burst Destruction Hit',
      hitCount: 2,
      sp_cost: 10,
      target_type: 'Single',
      parts: [
        { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 1 } },
        { skill_type: 'SuperBreak', target_type: 'Single' },
      ],
    },
  ]);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Slash: 150 } };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 590 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  state.turnState.enemyState.destructionMultiplierByEnemy = { 0: 1 };

  const preview = previewTurn(state, {
    0: { characterId: 'TC1', skillId: 15220, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
  });
  const action = findActionByCharacterId(preview, 'TC1');
  assert.equal(action.specialPassiveModifiers.transcendenceBurstDestructionRateGainBonusRate, 0.1);

  const { committedRecord, nextState } = commitTurn(state, preview);
  const committedAction = findActionByCharacterId(committedRecord, 'TC1');
  assert.equal(committedAction.damageContext?.destructionRateCapByEnemy?.['0'], 600);
  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 591.0999999999999);
});

test('transcendence burst destruction cap is actor-element gated and does not add to higher stored cap', () => {
  const createState = (characterId, elements, storedRate, storedCap) => {
    const state = createTranscendenceTestParty({ initialGaugePercent: 100, withBurst: true });
    state.turnState.transcendence.burstTriggered = true;
    state.party[0].characterId = characterId;
    state.party[0].elements = elements;
    state.party[0].skills = Object.freeze([
      {
        id: 15225,
        skillId: 15225,
        name: 'Burst Cap Boundary Hit',
        hitCount: 2,
        sp_cost: 10,
        target_type: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 1 } }],
      },
    ]);
    state.turnState.enemyState.enemyCount = 1;
    state.turnState.enemyState.damageRatesByEnemy = { 0: { Slash: 150 } };
    state.turnState.enemyState.statuses = [
      { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    ];
    state.turnState.enemyState.destructionRateByEnemy = { 0: storedRate };
    state.turnState.enemyState.destructionRateCapByEnemy = { 0: storedCap };
    state.turnState.enemyState.destructionMultiplierByEnemy = { 0: 1 };
    return state;
  };

  const nonMatchingState = createState('TC_FIRE_CAP', ['Fire'], 290, 300);
  const nonMatchingPreview = previewTurn(nonMatchingState, {
    0: { characterId: 'TC_FIRE_CAP', skillId: 15225, targetEnemyIndex: 0 },
  });
  const nonMatchingCommitted = commitTurn(nonMatchingState, nonMatchingPreview);
  assert.ok(
    Math.abs(nonMatchingCommitted.nextState.turnState.enemyState.destructionRateByEnemy['0'] - 291.0) < 1e-9
  );

  const highStoredCapState = createState('TC_ICE_CAP', ['Ice'], 690, 700);
  const highStoredCapPreview = previewTurn(highStoredCapState, {
    0: { characterId: 'TC_ICE_CAP', skillId: 15225, targetEnemyIndex: 0 },
  });
  const highStoredCapCommitted = commitTurn(highStoredCapState, highStoredCapPreview);
  assert.ok(
    Math.abs(highStoredCapCommitted.nextState.turnState.enemyState.destructionRateByEnemy['0'] - 691.1) < 1e-9
  );
});

test('transcendence gauge ignores matching skill element when actor element does not match', () => {
  const state = createTranscendenceTestParty();
  const nonMatchingActor = state.party[2];
  nonMatchingActor.elements = ['Fire'];
  nonMatchingActor.skills = Object.freeze([
    ...nonMatchingActor.skills,
    {
      id: 15150,
      skillId: 15150,
      name: 'Ice Attack By Fire Actor',
      sp_cost: 0,
      hit_count: 3,
      target_type: 'Single',
      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Ice'] }],
    },
  ]);

  const preview = previewTurn(state, {
    2: { characterId: nonMatchingActor.characterId, skillId: 15150, targetEnemyIndex: 0 },
  });

  assert.equal(preview.projections?.transcendence?.matchingUnitCount, 0);
  assert.equal(preview.projections?.transcendence?.endGaugePercent, 45);
});

test('transcendence gauge gains +4 when matching-element pursuit source attacks', () => {
  const state = createTranscendenceTestParty();
  const nonMatchingActor = state.party[2];
  const pursuitSource = state.party[3];
  nonMatchingActor.elements = ['Fire'];
  pursuitSource.elements = ['Ice'];

  const preview = previewTurn(state, {
    2: {
      characterId: nonMatchingActor.characterId,
      skillId: nonMatchingActor.skills[0].skillId ?? nonMatchingActor.skills[0].id,
      pursuedHitCount: 1,
      pursuedTargetEnemyIndex: 0,
      pursuitSourceCharacterId: pursuitSource.characterId,
      pursuitSourcePosition: pursuitSource.position,
      pursuitSourceSkillName: '追撃',
    },
  });

  assert.equal(preview.projections?.transcendence?.matchingUnitCount, 1);
  assert.equal(preview.projections?.transcendence?.endGaugePercent, 49);
});

test('real data dark transcendence initializes for アオゾラ全力応援歌', () => {
  const state = createRealDataDarkTranscendenceState();
  assert.equal(state.turnState.transcendence?.active, true);
  assert.equal(state.turnState.transcendence?.sourceStyleId, REAL_DATA_DARK_TRANSCENDENCE_STYLE_ID);
  assert.equal(state.turnState.transcendence?.gaugeElement, 'Dark');
  assert.equal(
    state.turnState.transcendence?.gaugePercent,
    REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT * TRANSCENDENCE_INITIAL_GAUGE_PERCENT_PER_MEMBER
  );
});

test('real data dark transcendence gains gauge once per Dark action even with multi-hit skills', () => {
  let state = createRealDataDarkTranscendenceState();
  const darkHitCounts = [3, 2, 1];
  state.party.slice(0, REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT).forEach((member, index) => {
    member.skills = Object.freeze([
      ...member.skills,
      {
        skillId: 15100 + index,
        id: 15100 + index,
        name: `Dark Transcendence Hit ${index + 1}`,
        label: `DarkTranscendenceHit${index + 1}`,
        spCost: 0,
        sp_cost: 0,
        hitCount: darkHitCounts[index],
        hit_count: darkHitCounts[index],
        targetType: 'Single',
        target_type: 'Single',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Dark'] }],
      },
    ]);
  });

  const frontlineActions = Object.fromEntries(
    state.party.slice(0, REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT).map((member, index) => {
      return [
        String(member.position),
        {
          characterId: member.characterId,
          skillId: 15100 + index,
          targetEnemyIndex: 0,
        },
      ];
    })
  );
  const preview = previewTurn(state, frontlineActions);
  assert.equal(preview.projections?.transcendence?.matchingUnitCount, REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT);
  assert.equal(
    preview.projections?.transcendence?.endGaugePercent,
    REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT * TRANSCENDENCE_INITIAL_GAUGE_PERCENT_PER_MEMBER +
      REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT * TRANSCENDENCE_GAUGE_GAIN_PERCENT_PER_UNIT
  );

  const committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(
    state.turnState.transcendence?.gaugePercent,
    REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT * TRANSCENDENCE_INITIAL_GAUGE_PERCENT_PER_MEMBER +
      REAL_DATA_DARK_TRANSCENDENCE_MATCHING_MEMBER_COUNT * TRANSCENDENCE_GAUGE_GAIN_PERCENT_PER_UNIT
  );
});

test('extra turn can be granted and consumed', () => {
  const store = getStore();
  const styleIds = getSixUsableStyleIds(store);
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const allowed = [party.getByPosition(0).characterId];
  state = grantExtraTurn(state, allowed);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.extraTurnState.active, true);
  assert.equal(
    state.party.filter((m) => m.isExtraActive).map((m) => m.characterId).join(','),
    allowed.join(','),
    'only granted member should be marked as extra-active'
  );

  const preview = previewTurn(state, {
    0: {
      characterId: party.getByPosition(0).characterId,
      skillId: party.getByPosition(0).skills[0].skillId,
    },
  });

  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.turnState.turnIndex, 2);
  assert.equal(
    nextState.party.some((m) => m.isExtraActive),
    false,
    'extra-active flags should be cleared after extra turn finishes'
  );
});

function createManualExtraTurnParty() {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const characterId = `C${idx + 1}`;
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;

    return new CharacterStyle({
      characterId,
      characterName: characterId,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });

  return new Party(members);
}

test('commitTurn grants extra turn and marks allowed members as extra-active', () => {
  const party = createManualExtraTurnParty();
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'C1', skillId: 9000 },
    1: { characterId: 'C2', skillId: 9001 },
    2: { characterId: 'C3', skillId: 9002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(
    nextState.turnState.extraTurnState?.allowedCharacterIds,
    ['C1', 'C2', 'C3'],
    'AllyFront grant should mark current frontline members'
  );
  assert.deepEqual(
    nextState.party
      .filter((m) => m.isExtraActive)
      .map((m) => m.characterId)
      .sort(),
    ['C1', 'C2', 'C3']
  );
});

test('commitTurn applies OnAdditionalTurnStart passives when next state enters extra turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const extraRule =
      idx === 0
        ? {
            skillUsableInExtraTurn: true,
            additionalTurnGrantInExtraTurn: true,
            conditions: {
              requiresOverDrive: false,
              requiresReinforcedMode: false,
              excludesExtraTurnForSkillUse: false,
              excludesExtraTurnForAdditionalTurnGrant: false,
            },
            additionalTurnTargetTypes: ['AllyFront'],
          }
        : null;
    return new CharacterStyle({
      characterId: `CE${idx + 1}`,
      characterName: `CE${idx + 1}`,
      styleId: idx + 1,
      styleName: `CES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 1
          ? [
              {
                id: 31,
                name: 'アフターサービス',
                desc: '追加ターン開始時 自身のSP+1',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [
        {
          id: 29000 + idx,
          name: idx === 0 ? 'Grant Front Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule: extraRule,
          parts: extraRule ? [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }] : [],
        },
      ],
    });
  });
  const state = createBattleStateFromParty(new Party(members));

  const preview = previewTurn(state, {
    0: { characterId: 'CE1', skillId: 29000 },
    1: { characterId: 'CE2', skillId: 29001 },
    2: { characterId: 'CE3', skillId: 29002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  // EX遷移時はbase回復(+2)がスキップされるため、CE2 SP = initialSP(3) + OnAdditionalTurnStart(+1) = 4
  assert.equal(nextState.party.find((m) => m.characterId === 'CE2').sp.current, 4);
  assert.equal(nextState.turnState.passiveEventsLastApplied.length, 1);
  assert.equal(nextState.turnState.passiveEventsLastApplied[0].timing, 'OnAdditionalTurnStart');
  assert.equal(committedRecord.passiveEvents.length, 1);
  assert.equal(committedRecord.passiveEvents[0].passiveName, 'アフターサービス');
});

test('self-only additional turn in extra turn does not carry previous allowed members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `X${idx + 1}`,
      characterName: `X${idx + 1}`,
      styleId: idx + 1,
      styleName: `XS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 11000 + idx,
          name: idx === 0 ? 'Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['X1', 'X2', 'X3']);

  const preview = previewTurn(state, {
    0: { characterId: 'X1', skillId: 11000 },
    1: { characterId: 'X2', skillId: 11001 },
    2: { characterId: 'X3', skillId: 11002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['X1']);
});

test('additional turn AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATS${idx + 1}`,
      characterName: `ATS${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54000 + idx,
          name: idx === 0 ? 'Single Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATS1', skillId: 54000, targetCharacterId: 'ATS3' },
    1: { characterId: 'ATS2', skillId: 54001 },
    2: { characterId: 'ATS3', skillId: 54002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['ATS3']);
});

test('additional turn target_condition IsFront()==1 rejects backline target', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ATF${idx + 1}`,
      characterName: `ATF${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 54100 + idx,
          name: idx === 0 ? 'Front Only Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                  },
                  additionalTurnTargets: [
                    { targetType: 'AllySingleWithoutSelf', targetCondition: 'IsFront()==1' },
                  ],
                  additionalTurnTargetTypes: ['AllySingleWithoutSelf'],
                }
              : null,
          parts:
            idx === 0
              ? [{ skill_type: 'AdditionalTurn', target_type: 'AllySingleWithoutSelf', target_condition: 'IsFront()==1' }]
              : [],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ATF1', skillId: 54100, targetCharacterId: 'ATF5' },
    1: { characterId: 'ATF2', skillId: 54101 },
    2: { characterId: 'ATF3', skillId: 54102 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'normal');
  assert.equal(nextState.party.some((m) => m.isExtraActive), false);
});

test('国士無双は非ODでは追加ターンなし、OD中のみ追加ターンを付与する', () => {
  const store = getStore();
  const skillId = 46005117;

  const normalState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId)
  );
  const normalCommit = commitTurn(normalState, previewActorSkill(normalState, skillId));
  assert.equal(
    normalCommit.nextState.turnState.turnType,
    'normal',
    'non-OD usage should not grant an extra turn'
  );

  let odState = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  odState.turnState.odGauge = 300;
  odState = activateOverdrive(odState, 2, 'preemptive');

  const odCommit = commitTurn(odState, previewActorSkill(odState, skillId));
  assert.equal(
    odCommit.nextState.turnState.turnType,
    'extra',
    'OD usage should grant an extra turn'
  );
  assert.ok(
    (odCommit.nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(
      odState.party[0].characterId
    ),
    'actor should be included in extra turn allowed members'
  );
});

test('国士無双はODサスペンドEX(remainingOdActions=0)でも追加ターンを付与する', () => {
  const store = getStore();
  const skillId = 46005117;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const actorId = state.party[0].characterId;

  state.turnState.turnType = 'extra';
  state.turnState.turnLabel = 'EX';
  state.turnState.odLevel = 1;
  state.turnState.odContext = 'interrupt';
  state.turnState.odSuspended = true;
  state.turnState.remainingOdActions = 0;
  state.turnState.extraTurnState = {
    active: true,
    remainingActions: 1,
    allowedCharacterIds: [actorId],
    grantTurnIndex: Number(state.turnState.turnIndex ?? 1),
  };

  const commit = commitTurn(state, previewActorSkill(state, skillId));
  assert.equal(commit.nextState.turnState.turnType, 'extra');
  assert.ok(
    (commit.nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes(actorId),
    'ODサスペンドEXでも自身への追加ターン付与が継続する'
  );
});

test('国士無双はOD1+EX連鎖中(EnemyTurnEnd前)にResistDown/DefenseDownが積み上がる', () => {
  const store = getStore();
  const skillId = 46005117;
  const actorTargetIndex = 0;

  const collectTargetStatuses = (state, statusType) =>
    (state.turnState.enemyState?.statuses ?? []).filter(
      (status) =>
        String(status?.statusType ?? '') === statusType &&
        Number(status?.targetIndex ?? -1) === actorTargetIndex
    );

  // StageSetup equivalent: OD 300% / SP 20
  let state = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: { initialSP: 20 },
    })
  );
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 1, 'preemptive');

  const step1 = commitTurn(state, previewActorSkill(state, skillId));
  assert.equal(step1.nextState.turnState.turnType, 'extra', '1回目後はEXに遷移すること');

  const step2 = commitTurn(step1.nextState, previewActorSkill(step1.nextState, skillId));
  assert.equal(step2.nextState.turnState.turnType, 'extra', '2回目後もEX継続であること');

  const step3 = commitTurn(step2.nextState, previewActorSkill(step2.nextState, skillId));
  assert.equal(step3.nextState.turnState.turnType, 'extra', '3回目後もEX継続であること');

  const step4 = commitTurn(step3.nextState, previewActorSkill(step3.nextState, skillId));
  const nextState = step4.nextState;

  const overwriteStatuses = collectTargetStatuses(nextState, 'ResistDownOverwrite');
  const resistStatuses = collectTargetStatuses(nextState, 'ResistDown');
  const defenseDownStatuses = collectTargetStatuses(nextState, 'DefenseDown');

  assert.equal(overwriteStatuses.length, 1, 'ResistDownOverwrite(limitType=Once) は1件のみ残ること');
  assert.equal(resistStatuses.length, 4, 'ResistDown(limitType=Default) は4回分スタックすること');
  assert.equal(defenseDownStatuses.length, 4, 'DefenseDown(limitType=Default) はEnemyTurnEnd前に4回分残ること');
});

test('石塔の手筋+ はOD中のみ自身以外へHealSp+5が適用される (real data)', () => {
  const store = getStore();
  const skillId = 46005161;
  const makeActions = (state) => {
    const actor = state.party[0];
    const ally1 = state.party[1];
    const ally2 = state.party[2];
    return {
      0: { characterId: actor.characterId, skillId },
      1: { characterId: ally1.characterId, skillId: Number(ally1.skills?.[0]?.skillId ?? ally1.skills?.[0]?.id ?? 0) },
      2: { characterId: ally2.characterId, skillId: Number(ally2.skills?.[0]?.skillId ?? ally2.skills?.[0]?.id ?? 0) },
    };
  };

  let nonOdState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: { initialSP: 10 },
    })
  );
  const nonOdCommit = commitTurn(nonOdState, previewTurn(nonOdState, makeActions(nonOdState)));
  const nonOdAlly1 = findActionByCharacterId(nonOdCommit.committedRecord, nonOdState.party[1].characterId);
  const nonOdAlly2 = findActionByCharacterId(nonOdCommit.committedRecord, nonOdState.party[2].characterId);
  assert.equal(
    (nonOdAlly1?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    false,
    '非ODでは自身以外SP+5が発生しない'
  );
  assert.equal(
    (nonOdAlly2?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    false,
    '非ODでは自身以外SP+5が発生しない (2人目)'
  );

  let odState = createBattleStateFromParty(
    buildSingleSkillRealDataParty(store, skillId, {
      buildOptions: { initialSP: 10 },
    })
  );
  odState.turnState.odGauge = 300;
  odState = activateOverdrive(odState, 1, 'preemptive');
  const odCommit = commitTurn(odState, previewTurn(odState, makeActions(odState)));

  const odActor = findActionByCharacterId(odCommit.committedRecord, odState.party[0].characterId);
  const odAlly1 = findActionByCharacterId(odCommit.committedRecord, odState.party[1].characterId);
  const odAlly2 = findActionByCharacterId(odCommit.committedRecord, odState.party[2].characterId);
  assert.equal(
    (odActor?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    false,
    'OD中でも自身にはSP+5が適用されない'
  );
  assert.equal(
    (odAlly1?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    true,
    'OD中は自身以外にSP+5が適用される'
  );
  assert.equal(
    (odAlly2?.spChanges ?? []).some((change) => change?.source === 'active' && Number(change?.delta) === 5),
    true,
    'OD中は自身以外にSP+5が適用される (2人目)'
  );
});

test('OD turn resumes after extra turn (OD3-1 -> EX -> OD3-2)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `R${idx + 1}`,
      characterName: `R${idx + 1}`,
      styleId: idx + 1,
      styleName: `RS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 12000 + idx,
          name: idx === 0 ? 'Grant Self Extra' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD3-1');

  // OD3-1 で追加ターン付与
  const previewOd = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
    1: { characterId: 'R2', skillId: 12001 },
    2: { characterId: 'R3', skillId: 12002 },
  });
  state = commitTurn(state, previewOd).nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.turnState.odSuspended, true);
  assert.equal(state.turnState.remainingOdActions, 2);

  // EX終了後は OD3-2 へ復帰するべき
  const previewEx = previewTurn(state, {
    0: { characterId: 'R1', skillId: 12000 },
  });
  state = commitTurn(state, previewEx).nextState;
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');
  assert.equal(state.turnState.remainingOdActions, 2);
  assert.equal(state.turnState.odSuspended, false);
});

test('OD SP recovery is granted once per OD activation (no repeated +20 on OD3-2 after EX)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OR${idx + 1}`,
      characterName: `OR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ORS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 12100,
                name: 'Grant Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 12101,
                name: 'Normal',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
            ]
          : [{ id: 12110 + idx, name: 'Normal', sp_cost: 0, parts: [{ skill_type: 'AttackSkill' }] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive');
  let actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 30, 'OD開始時点で +20 が付与される');

  // OD3-1: OD開始時に付与済みの +20 を維持したまま EX へ遷移する
  let preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12100 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 30);
  assert.equal(state.turnState.turnType, 'extra');

  // EX: EXターンは独立した回復なし。SP=30維持。
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 30);
  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.turnLabel, 'OD3-2');

  // OD3-2: OD回復(+20)は再発しない。base回復(+2)はSPが上限(20)を超えているため効果なし。SP=30維持。
  preview = previewTurn(state, {
    0: { characterId: 'OR1', skillId: 12101 },
    1: { characterId: 'OR2', skillId: 12111 },
    2: { characterId: 'OR3', skillId: 12112 },
  });
  state = commitTurn(state, preview).nextState;
  actor = state.party.find((m) => m.characterId === 'OR1');
  assert.equal(actor.sp.current, 30);
});

test('interrupt OD after extra turn grants OD SP recovery before the first OD action', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `IO${idx + 1}`,
      characterName: `IO${idx + 1}`,
      styleId: 3500 + idx,
      styleName: `IOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 35000,
                name: 'Grant Front Extra',
                sp_cost: 0,
                target_type: 'AllyFront',
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['AllyFront'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'AllyFront' }],
              },
              {
                id: 35001,
                name: 'Normal',
                sp_cost: 0,
                target_type: 'Self',
                parts: [{ skill_type: 'Protection', target_type: 'Self' }],
              },
            ]
          : idx === 2
            ? [
                {
                  id: 35002,
                  name: 'Costly Song',
                  sp_cost: 12,
                  cond: 'Sp()>=0',
                  target_type: 'AllyAll',
                  parts: [{ skill_type: 'Shredding', target_type: 'AllyAll' }],
                },
                {
                  id: 35003,
                  name: 'Normal',
                  sp_cost: 0,
                  target_type: 'Self',
                  parts: [{ skill_type: 'Protection', target_type: 'Self' }],
                },
              ]
            : [
                {
                  id: 35010 + idx,
                  name: 'Normal',
                  sp_cost: 0,
                  target_type: 'Self',
                  parts: [{ skill_type: 'Protection', target_type: 'Self' }],
                },
              ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 250;

  let preview = previewTurn(state, {
    0: { characterId: 'IO1', skillId: 35000 },
    1: { characterId: 'IO2', skillId: 35011 },
    2: { characterId: 'IO3', skillId: 35002 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.party.find((member) => member.characterId === 'IO3')?.sp.current, -2);

  preview = previewTurn(state, {
    0: { characterId: 'IO1', skillId: 35001 },
    1: { characterId: 'IO2', skillId: 35011 },
    2: { characterId: 'IO3', skillId: 35003 },
  });
  state = commitTurn(state, preview, [], { interruptOdLevel: 2 }).nextState;

  assert.equal(state.turnState.turnType, 'od');
  assert.equal(state.turnState.odContext, 'interrupt');
  assert.equal(state.party.find((member) => member.characterId === 'IO3')?.sp.current, 10);

  const odPreview = previewTurn(state, {
    2: { characterId: 'IO3', skillId: 35002 },
  });
  assert.equal(odPreview.actions[0]?.skillId, 35002);
});

test('OD1 preemptive + single extra returns to T1 after extra ends', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `O${idx + 1}`,
      characterName: `O${idx + 1}`,
      styleId: idx + 1,
      styleName: `OS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 13000 + idx,
          name: idx === 0 ? 'Grant Self Extra Once' : 'Normal',
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts: idx === 0 ? [{ skill_type: 'AdditionalTurn', target_type: 'Self' }] : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.equal(state.turnState.turnLabel, 'OD1-1');

  const odPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
    1: { characterId: 'O2', skillId: 13001 },
    2: { characterId: 'O3', skillId: 13002 },
  });
  let committed = commitTurn(state, odPreview);
  state = committed.nextState;
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');

  const exPreview = previewTurn(state, {
    0: { characterId: 'O1', skillId: 13000 },
  });
  committed = commitTurn(state, exPreview);
  state = committed.nextState;
  assert.equal(committed.committedRecord.odTurnLabelAtStart, 'OD1-1');
  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
});

test('OD1 preemptive + chained extras returns to T1 after all extras end', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `Z${idx + 1}`,
      characterName: `Z${idx + 1}`,
      styleId: idx + 1,
      styleName: `ZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 14000,
                name: 'Chain Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 14001,
                name: 'End Chain',
                sp_cost: 0,
                parts: [],
              },
            ]
          : [
              {
                id: 14000 + idx + 1,
                name: 'Normal',
                sp_cost: 0,
                parts: [],
              },
            ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const odPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14000 },
    1: { characterId: 'Z2', skillId: 14002 },
    2: { characterId: 'Z3', skillId: 14003 },
  });
  state = commitTurn(state, odPreview).nextState;
  assert.equal(state.turnState.turnType, 'extra');

  // EX, EX, EX を継続
  for (let i = 0; i < 3; i += 1) {
    const exPreview = previewTurn(state, {
      0: { characterId: 'Z1', skillId: 14000 },
    });
    state = commitTurn(state, exPreview).nextState;
    assert.equal(state.turnState.turnType, 'extra');
  }

  // 最後のEXで連鎖を止める
  const exEndPreview = previewTurn(state, {
    0: { characterId: 'Z1', skillId: 14001 },
  });
  state = commitTurn(state, exEndPreview).nextState;

  assert.equal(state.turnState.turnType, 'normal');
  assert.equal(state.turnState.turnLabel, 'T1');
  assert.equal(state.turnState.turnIndex, 1);
});

test('extra turn disallows non-allowed members from acting', () => {
  const party = createManualExtraTurnParty();
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['C1']);

  assert.throws(
    () =>
      previewTurn(state, {
        1: { characterId: 'C2', skillId: 9001 },
      }),
    /not allowed to act in extra turn/
  );
});

test('Nanase supports parallel SP/EP and EP ceiling changes in OD', () => {
  const store = getStore();
  const nanaseStyleId = 1010204; // 約束は暁の彼方で (Admiral)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase');
  const styleIds = [nanaseStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, { initialSP: 10 });

  let state = createBattleStateFromParty(party);
  const nanase = state.party.find((m) => m.characterId === 'NNanase');
  assert.ok(nanase);
  assert.equal(nanase.ep.current, 0);
  assert.equal(nanase.ep.max, 10);

  // 宿る想い (SP消費 + HealEp)
  const action = {
    [String(nanase.position)]: {
      characterId: nanase.characterId,
      skillId: 46041501,
    },
  };

  const preview = previewTurn(state, action);
  assert.equal(preview.actions[0].startEP, 0);
  assert.equal(preview.actions[0].endEP, 0, '宿る想いはEP消費ではない');
  const { nextState } = commitTurn(state, preview);
  const after = nextState.party.find((m) => m.characterId === 'NNanase');
  // EX遷移時はターン開始EP回復がスキップされるため、スキルHealEp+3のみ
  assert.equal(after.ep.current, 3, 'HealEp +3 from skill only (turn-start EP gains skipped for EX transition)');

  // OD発動時の+5（EP 3+5=8）and 上限20
  nextState.turnState.odGauge = 100;
  state = activateOverdrive(nextState, 1, 'preemptive');
  const odNanase = state.party.find((m) => m.characterId === 'NNanase');
  // EX遷移によりターン開始EP回復(+2)がスキップされたため、EP=3(skill)+5(OD)=8
  assert.equal(odNanase.ep.current, 8);

  // OD中はEP上限20として扱われるため、10を超えて増加できる
  const odPreview = previewTurn(state, {
    [String(odNanase.position)]: {
      characterId: odNanase.characterId,
      skillId: 46041501,
    },
  });
  const odCommitted = commitTurn(state, odPreview);
  const odAfter = odCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(odAfter.ep.current > 10, true, 'OD中はEP上限20として10超過が可能');
});

test('Nanase Rider uses external EP rule while Admiral uses passive-derived EP rule', () => {
  const store = getStore();
  const riderOnly = [1010203, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  let riderState = createBattleStateFromParty(store.buildPartyFromStyleIds(riderOnly, { initialSP: 10 }));
  const riderNanase = riderState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(riderNanase.epRule?.turnStartEpDelta, 2);
  const riderPreview = previewTurn(riderState, {
    [String(riderNanase.position)]: { characterId: riderNanase.characterId, skillId: riderNanase.getActionSkills()[0].skillId },
  });
  const riderCommitted = commitTurn(riderState, riderPreview);
  const riderAfter = riderCommitted.nextState.party.find((m) => m.characterId === 'NNanase');
  assert.ok(riderAfter.ep.current >= 2, 'Rider turn-start EP gain should come from override rule');

  const admiralOnly = [1010204, ...getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'NNanase').slice(0, 5)];
  const admiralState = createBattleStateFromParty(store.buildPartyFromStyleIds(admiralOnly, { initialSP: 10 }));
  const admiralNanase = admiralState.party.find((m) => m.characterId === 'NNanase');
  assert.equal(admiralNanase.epRule, null);
  const preview = previewTurn(admiralState, {
    [String(admiralNanase.position)]: { characterId: admiralNanase.characterId, skillId: 46041501 },
  });
  const committed = commitTurn(admiralState, preview);
  const admiralAfter = committed.nextState.party.find((m) => m.characterId === 'NNanase');
  // EX遷移時はターン開始EP回復がスキップされるため、スキルHealEp+3のみ
  assert.equal(admiralAfter.ep.current, 3, 'HealEp +3 from skill only (turn-start EP gains skipped for EX transition)');
});

test('HealSp AllyFront increases SP for all frontline members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSF${idx + 1}`,
      characterName: `HSF${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSFS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51000 + idx,
          name: idx === 0 ? 'Front SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSF1', skillId: 51000 },
    1: { characterId: 'HSF2', skillId: 51001 },
    2: { characterId: 'HSF3', skillId: 51002 },
  });
  const { nextState } = commitTurn(state, preview);

  const m1 = nextState.party.find((m) => m.characterId === 'HSF1');
  const m2 = nextState.party.find((m) => m.characterId === 'HSF2');
  const m3 = nextState.party.find((m) => m.characterId === 'HSF3');
  const m4 = nextState.party.find((m) => m.characterId === 'HSF4');

  // frontline: +3 (skill) +2 (base)
  assert.equal(m1.sp.current, 15);
  assert.equal(m2.sp.current, 15);
  assert.equal(m3.sp.current, 15);
  // backline: +2 (base only)
  assert.equal(m4.sp.current, 12);
});

test('HealSp AllyFront committed record separates cost and active spChanges for display', () => {
  // Scenario: pos0 uses HealSp AllyFront (+5), pos1 uses a costly attack (cost 4).
  // The committed record's spChanges for pos1 should have separate 'cost' and 'active' entries.
  // The display formula (turnStartSP + costDelta) should give the correct
  // "post-cost, pre-HealSp" value matching the real game display.
  const HEALER_SKILL_ID = 59001;
  const ATTACK_SKILL_ID = 59002;
  const GUARD_SKILL_ID = 59003;
  const HEAL_POWER = 5;
  const ATTACK_COST = 4;
  const INITIAL_SP = 10;

  const members = Array.from({ length: 6 }, (_, idx) => {
    let skills;
    if (idx === 0) {
      skills = [{ id: HEALER_SKILL_ID, name: 'HealFrontSP', sp_cost: 0,
        parts: [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [HEAL_POWER, 0] }] }];
    } else if (idx === 1) {
      skills = [{ id: ATTACK_SKILL_ID, name: 'CostlyAttack', sp_cost: ATTACK_COST,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }] }];
    } else {
      skills = [{ id: GUARD_SKILL_ID, name: 'プロテクション', sp_cost: 0,
        parts: [{ skill_type: 'Support', target_type: 'Self' }] }];
    }
    return new CharacterStyle({
      characterId: `HDISP${idx + 1}`,
      characterName: `HDISP${idx + 1}`,
      styleId: 59100 + idx,
      styleName: `HDISPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: INITIAL_SP,
      skills,
    });
  });

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HDISP1', skillId: HEALER_SKILL_ID },
    1: { characterId: 'HDISP2', skillId: ATTACK_SKILL_ID },
    2: { characterId: 'HDISP3', skillId: GUARD_SKILL_ID },
  });
  const { committedRecord } = commitTurn(state, preview);

  // Check the attacking character's (pos1) spChanges
  const attackerAction = committedRecord.actions.find((a) => a.characterId === 'HDISP2');
  assert.ok(attackerAction, 'Attacker action should exist');
  const costChanges = attackerAction.spChanges.filter((c) => c.source === 'cost');
  assert.ok(costChanges.length > 0, 'Should have at least one cost spChange');

  // Verify the display formula: turnStartSP + sum(cost deltas)
  // This should give the "post-cost, pre-HealSp" value
  const costDeltaSum = costChanges.reduce((sum, c) => sum + c.delta, 0);
  const displaySp = INITIAL_SP + costDeltaSum;
  assert.equal(displaySp, INITIAL_SP - ATTACK_COST,
    `Display SP should be turnStartSP(${INITIAL_SP}) - cost(${ATTACK_COST}) = ${INITIAL_SP - ATTACK_COST}, ` +
    `ignoring HealSp(+${HEAL_POWER}). costPostSP(${costChanges[0].postSP}) includes HealSp contamination.`);

  // The costPostSP is contaminated by HealSp (applied before cost in action resolution)
  // so it should NOT equal the expected display value
  const contaminatedCostPostSp = costChanges[0].postSP;
  assert.notEqual(contaminatedCostPostSp, displaySp,
    'costPostSP should differ from the correct display value because it includes inter-action HealSp');

  // Verify the healer's own display is just turnStartSP (0 cost skill)
  const healerAction = committedRecord.actions.find((a) => a.characterId === 'HDISP1');
  const healerCostDeltas = (healerAction?.spChanges ?? [])
    .filter((c) => c.source === 'cost')
    .reduce((sum, c) => sum + c.delta, 0);
  assert.equal(INITIAL_SP + healerCostDeltas, INITIAL_SP,
    'Healer display SP should be turnStartSP (0 cost skill)');
});

test('HealSp AllyAll increases SP for all party members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSA${idx + 1}`,
      characterName: `HSA${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51500 + idx,
          name: idx === 0 ? 'All SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSA1', skillId: 51500 },
    1: { characterId: 'HSA2', skillId: 51501 },
    2: { characterId: 'HSA3', skillId: 51502 },
  });
  const { nextState } = commitTurn(state, preview);

  for (const member of nextState.party) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllyAllWithoutSelf excludes actor and affects all allies', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSAS${idx + 1}`,
      characterName: `HSAS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSASS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 51600 + idx,
          name: idx === 0 ? 'All Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [3, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSAS1', skillId: 51600 },
    1: { characterId: 'HSAS2', skillId: 51601 },
    2: { characterId: 'HSAS3', skillId: 51602 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSAS1');
  assert.equal(actor.sp.current, 12);
  for (const member of nextState.party.filter((m) => m.characterId !== 'HSAS1')) {
    assert.equal(member.sp.current, 15);
  }
});

test('HealSp AllySingleWithoutSelf targets one ally and excludes self', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HSS${idx + 1}`,
      characterName: `HSS${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 52000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HSS1', skillId: 52000 },
    1: { characterId: 'HSS2', skillId: 52001 },
    2: { characterId: 'HSS3', skillId: 52002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HSS1');
  const ally = nextState.party.find((m) => m.characterId === 'HSS2');

  // actor: base only
  assert.equal(actor.sp.current, 12);
  // first non-self frontline ally gets +4 then base +2
  assert.equal(ally.sp.current, 16);
});

test('HealSp AllySingleWithoutSelf respects selected targetCharacterId', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HST${idx + 1}`,
      characterName: `HST${idx + 1}`,
      styleId: idx + 1,
      styleName: `HSTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 53000 + idx,
          name: idx === 0 ? 'Single Other SP Up' : 'Normal',
          sp_cost: 0,
          parts:
            idx === 0
              ? [{ skill_type: 'HealSp', target_type: 'AllySingleWithoutSelf', power: [4, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'HST1', skillId: 53000, targetCharacterId: 'HST5' },
    1: { characterId: 'HST2', skillId: 53001 },
    2: { characterId: 'HST3', skillId: 53002 },
  });
  const { nextState } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'HST1');
  const t2 = nextState.party.find((m) => m.characterId === 'HST2');
  const t3 = nextState.party.find((m) => m.characterId === 'HST3');
  const t5 = nextState.party.find((m) => m.characterId === 'HST5');

  assert.equal(actor.sp.current, 12);
  assert.equal(t2.sp.current, 12, 'non-selected frontline ally should get base only');
  assert.equal(t3.sp.current, 12, 'non-selected ally should get base only');
  assert.equal(t5.sp.current, 16, 'selected backline ally should receive HealSp');
});

test('normal attack gains fixed 7.5% OD even when its raw hit count is below 3', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `N${idx + 1}`,
      characterName: `N${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9100 + idx,
          label: `N${idx + 1}AttackNormal`,
          name: '通常攻撃',
          sp_cost: 0,
          hit_count: 1,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'N1', skillId: 9100 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 7.5);
});

test('normal attack uses belt element in OD resistance check', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NAB${idx + 1}`,
      characterName: `NAB${idx + 1}`,
      styleId: idx + 1,
      styleName: `NABS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      normalAttackElements: idx === 0 ? ['Fire'] : [],
      skills: [
        {
          id: 11600 + idx,
          name: '通常攻撃',
          label: `NABAttackNormal${idx + 1}`,
          sp_cost: 0,
          hit_count: 1,
          target_type: 'Single',
          parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 100, Fire: 50 },
    },
  };
  let preview = previewTurn(state, {
    0: { characterId: 'NAB1', skillId: 11600 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 0);

  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 300, Fire: 50 },
  };
  preview = previewTurn(state, {
    0: { characterId: 'NAB1', skillId: 11600 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 7.5);
});

test('skill attack increases OD gauge by hit_count * 2.5%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `A${idx + 1}`,
      characterName: `A${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9200 + idx,
          name: idx === 0 ? 'Hit5 Attack' : 'Buff',
          sp_cost: 1,
          hit_count: idx === 0 ? 5 : 0,
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single' }]
              : [{ skill_type: 'AttackUp', target_type: 'Self' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'A1', skillId: 9200 },
    1: { characterId: 'A2', skillId: 9201 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 12.5);
});

test('non-damaging debuff skill with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9300 + idx,
          name: idx === 0 ? 'Weaken-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackDown', target_type: 'Single' },
                  { skill_type: 'RemoveBuff', target_type: 'Single' },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9300 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('enemy debuff statuses preserve fields and tick on enemy turn end', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18260,
              name: 'Enemy Debuff',
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'DefenseDown',
                  target_type: 'Single',
                  elements: ['Thunder'],
                  power: [0.3, 0],
                  effect: { limitType: 'Default', exitCond: 'EnemyTurnEnd', exitVal: [2, 0] },
                },
              ],
            },
          ],
        }
      : idx === 1
        ? {
            skills: [
              {
                id: 18261,
                name: 'プロテクション',
                sp_cost: 0,
                target_type: 'Self',
                parts: [
                  {
                    skill_type: 'DefenseUp',
                    target_type: 'Self',
                    power: [0.2, 0],
                    effect: { limitType: 'Default', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                  },
                ],
              },
            ],
          }
        : {}
  );
  const state = createBattleStateFromParty(party);

  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18260, targetEnemyIndex: 0 },
  });
  let committed = commitTurn(state, preview);
  let action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');
  let status = committed.nextState.turnState.enemyState.statuses.find(
    (item) => item.statusType === 'DefenseDown' && item.targetIndex === 0
  );

  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'EnemyStatus');
  assert.equal(action.enemyStatusChanges[0].statusType, 'DefenseDown');
  assert.equal(action.enemyStatusChanges[0].power, 0.3);
  assert.deepEqual(action.enemyStatusChanges[0].elements, ['Thunder']);
  assert.equal(status.remainingTurns, 1);
  assert.equal(status.power, 0.3);
  assert.deepEqual(status.elements, ['Thunder']);
  assert.equal(status.exitCond, 'EnemyTurnEnd');

  preview = previewTurn(committed.nextState, {
    1: { characterId: 'M2', skillId: 18261 },
  });
  committed = commitTurn(committed.nextState, preview);
  status = committed.nextState.turnState.enemyState.statuses.find(
    (item) => item.statusType === 'DefenseDown' && item.targetIndex === 0
  );
  assert.equal(status, undefined);
});

test('PlayerTurnEnd enemy debuff expires before the next recovery pipeline when passive limit is 1', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              passiveId: 18880,
              name: 'One Turn Enemy Debuff',
              timing: 'OnPlayerTurnStart',
              condition: 'IsFront()',
              limit: 1,
              parts: [
                {
                  skill_type: 'DefenseDown',
                  target_type: 'All',
                  power: [0.1, 0],
                  effect: { limitType: 'None', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                },
              ],
            },
          ],
          skills: [
            {
              id: 18262,
              name: 'Strike',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : idx <= 2
        ? {
            skills: [
              {
                id: 18270 + idx,
                name: 'プロテクション',
                sp_cost: 0,
                target_type: 'Self',
                parts: [
                  {
                    skill_type: 'DefenseUp',
                    target_type: 'Self',
                    power: [0.2, 0],
                    effect: { limitType: 'Default', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                  },
                ],
              },
            ],
          }
        : {}
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));

  // One Turn Enemy Debuff (OnPlayerTurnStart, limit=1) が applyInitialPassiveState で発火して DefenseDown が付与済み
  assert.equal(
    state.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DefenseDown' && status.targetIndex === 0
    ),
    true
  );
  // limit=1 のため再発火しない
  const turnStartResult = applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(turnStartResult.passiveEvents.some((event) => event.passiveName === 'One Turn Enemy Debuff'), false);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18262, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 18271 },
    2: { characterId: 'M3', skillId: 18272 },
  });
  const committed = commitTurn(state, preview);

  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DefenseDown' && status.targetIndex === 0
    ),
    false
  );
});

test('non-damaging skill-switch with hit_count does not increase OD gauge', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `S${idx + 1}`,
      characterName: `S${idx + 1}`,
      styleId: idx + 1,
      styleName: `Style${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9400 + idx,
          name: idx === 0 ? 'Aoharu-like' : 'Normal',
          sp_cost: 1,
          hit_count: 1,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillSwitch',
                    target_type: 'All',
                    strval: [
                      {
                        id: 994001,
                        name: 'Branch A',
                        hit_count: 1,
                        parts: [{ skill_type: 'AttackUp', target_type: 'AllyAll' }],
                      },
                      {
                        id: 994002,
                        name: 'Branch B',
                        hit_count: 1,
                        parts: [{ skill_type: 'CriticalRateUp', target_type: 'AllyAll' }],
                      },
                    ],
                  },
                ]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'S1', skillId: 9400 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 0);
});

test('all-target attack scales OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `E${idx + 1}`,
      characterName: `E${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9500 + idx,
          name: idx === 0 ? 'AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: idx === 0 ? 'All' : 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'E1', skillId: 9500 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 15, '2 hits * 3 enemies * 2.5%');
});

test('all-target attack with drive uses per-hit truncation before total hit multiplication', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `H${idx + 1}`,
      characterName: `H${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9700 + idx,
          name: idx === 0 ? 'Hit12 AoE Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: 'All' }],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  for (let i = 0; i < 2; i += 1) {
    const preview = previewTurn(
      state,
      {
        0: { characterId: 'H1', skillId: 9700 },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
  }

  // per-hit truncation model:
  // bonus(hit=12, drive15)=15%
  // per-hit = trunc2(2.5 * 1.15) = 2.87
  // one action (12hit * 3targets) = trunc2(2.87 * 36) = 103.32
  // two actions = 206.64 -> floor 206
  assert.equal(Math.floor(state.turnState.odGauge), 206);
});

test('single-target attack does not scale OD gain by enemy count', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `F${idx + 1}`,
      characterName: `F${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 9600 + idx,
          name: idx === 0 ? 'Single Attack' : 'Normal',
          sp_cost: 1,
          hit_count: 2,
          target_type: 'Single',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'F1', skillId: 9600 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 5, 'single-target remains 2 hits * 2.5%');
});

test('single-target attack does not gain OD when combined damage rate is below 100%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODR${idx + 1}`,
      characterName: `ODR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14000 + idx,
          name: idx === 0 ? 'Resisted Slash' : 'Normal',
          label: idx === 0 ? 'ResistedSlash' : `ODRSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'ODR1', skillId: 14000 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 0);
});

test('single-target attack uses selected enemy target for OD resistance check', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODT${idx + 1}`,
      characterName: `ODT${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14050 + idx,
          name: idx === 0 ? 'Targeted Slash' : 'Normal',
          label: idx === 0 ? 'TargetedSlash' : `ODTSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
      1: { Slash: 150 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'ODT1', skillId: 14050, targetEnemyIndex: 1 },
    },
    null,
    2
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 5);
});

test('damage context keeps target enemy and effective rates for multi-enemy OD analysis', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CTX${idx + 1}`,
      characterName: `CTX${idx + 1}`,
      styleId: idx + 1,
      styleName: `CTXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15050 + idx,
          name: idx === 0 ? 'Targeted Thunder Slash' : 'Normal',
          label: idx === 0 ? 'TargetedThunderSlash' : `CTXSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Thunder'] }]
              : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 300, Thunder: 50 },
      1: { Slash: 50, Thunder: 50 },
    },
    paramBorderByEnemy: {
      0: 812,
      1: 923,
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'CTX1', skillId: 15050, targetEnemyIndex: 0 },
    },
    null,
    2
  );
  const { committedRecord } = commitTurn(state, preview);
  const damageContext = committedRecord.actions[0].damageContext;

  assert.ok(damageContext);
  assert.equal(damageContext.targetEnemyIndex, 0);
  assert.deepEqual(damageContext.eligibleEnemyIndexes, [0]);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['0'], 150);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['1'], undefined);
  assert.deepEqual(damageContext.enemyParamBorderByEnemy, { 0: 812, 1: 923 });
});

test('absorbed element is treated as resistance for OD gain and damage context', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ABS${idx + 1}`,
      characterName: `ABS${idx + 1}`,
      styleId: idx + 1,
      styleName: `ABSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15080 + idx,
          name: idx === 0 ? 'Absorb Fire Slash' : 'Normal',
          label: idx === 0 ? 'AbsorbFireSlash' : `ABSSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }]
              : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 150, Fire: 400 },
    },
    absorbElementsByEnemy: {
      0: ['fire'],
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'ABS1', skillId: 15080 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const damageContext = committedRecord.actions[0].damageContext;

  assert.equal(nextState.turnState.odGauge, 0);
  assert.ok(damageContext);
  assert.deepEqual(damageContext.eligibleEnemyIndexes, []);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['0'], 0);
  assert.equal(damageContext.damageBreakdown.targetBreakdowns[0].finalMultiplier, 0);
});

test('damage context keeps all-target enemy eligibility and effective rates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CTXA${idx + 1}`,
      characterName: `CTXA${idx + 1}`,
      styleId: idx + 1,
      styleName: `CTXAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15150 + idx,
          name: idx === 0 ? 'All Slash' : 'Normal',
          label: idx === 0 ? 'AllSlash' : `CTXASkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 1 : 0,
          target_type: 'All',
          parts: idx === 0 ? [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' }] : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 3,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 50 },
      1: { Slash: 100 },
      2: { Slash: 150 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'CTXA1', skillId: 15150 },
    },
    null,
    3
  );
  const { committedRecord } = commitTurn(state, preview);
  const damageContext = committedRecord.actions[0].damageContext;

  assert.ok(damageContext);
  assert.equal(damageContext.targetEnemyIndex, null);
  assert.deepEqual(damageContext.eligibleEnemyIndexes, [1, 2]);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['0'], 50);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['1'], 100);
  assert.equal(damageContext.effectiveDamageRatesByEnemy['2'], 150);
});

test('all-target attack gains OD only from enemies whose combined damage rate is at least 100%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODA${idx + 1}`,
      characterName: `ODA${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 14100 + idx,
          name: idx === 0 ? 'All Slash Fire' : 'Normal',
          label: idx === 0 ? 'AllSlashFire' : `ODASkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 2 : 0,
          target_type: 'All',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Slash', elements: ['Fire'] }]
              : [],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 3,
    statuses: [],
    damageRatesByEnemy: {
      0: { Slash: 300, Fire: 50 },
      1: { Slash: 80, Fire: 100 },
      2: { Slash: 120, Fire: 100 },
    },
  };

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'ODA1', skillId: 14100 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 10, '2 hits * 2 eligible enemies * 2.5%');
});

test('manual-compare case: Ruka Thunder Pulse vs 3 enemies with Drive Pierce 15% for 10 turns', () => {
  const store = getStore();
  const rukaStyleId = 1001107; // ナイトクルーズ・エスコート (サンダーパルス所持)
  const others = getSixUsableStyleIds(store).filter((id) => store.getStyleById(id)?.chara_label !== 'RKayamori');
  const styleIds = [rukaStyleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 10,
    drivePierceByPartyIndex: { 0: 15 },
  });
  let state = createBattleStateFromParty(party);
  const ruka = state.party.find((m) => m.characterId === 'RKayamori');
  assert.ok(ruka);

  const flooredByTurn = [];
  for (let i = 0; i < 10; i += 1) {
    const preview = previewTurn(
      state,
      {
        [String(ruka.position)]: {
          characterId: ruka.characterId,
          skillId: 46001111, // サンダーパルス (2hit, All)
        },
      },
      null,
      3
    );
    state = commitTurn(state, preview).nextState;
    flooredByTurn.push(Math.floor(state.turnState.odGauge));
  }

  // 仕様:
  // - ODゲージは小数第2位まで保持し、第3位以下を切り捨て
  // - 攻撃ぶんODは1hitごとに計算し、小数第2位で切り捨てて合算
  // - サンダーパルス(2hit) + ドライブ15%(2hit=>+6.11%) の場合
  //   敵1体ぶん: trunc2(2 * 2.5 * 1.0611) = trunc2(5.3055) = 5.30
  //   敵3体合計: 15.90
  //   10ターン: 159.00
  assert.equal(state.turnState.odGauge, 159);
  assert.deepEqual(flooredByTurn.slice(0, 4), [15, 31, 47, 63]);
});

test('AttackSkill + OverDrivePointUp applies drive bonus and max self-parameter assumption', () => {
  const store = getStore();
  const cases = [
    // 実機確認値: 渾身銃撃=18, 海のギャング=71, サービス・エース=21
    { skillId: 46004504, expected: 18, breakHitCount: 0 },
    { skillId: 46005605, expected: 71, breakHitCount: 0 },
    { skillId: 46005502, expected: 21, breakHitCount: 0 },
  ];

  for (const c of cases) {
    const styleId = findStyleIdBySkillId(store, c.skillId);
    const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
    const styleIds = [styleId, ...others.slice(0, 5)];
    const party = store.buildPartyFromStyleIds(styleIds, {
      initialSP: 20,
      drivePierceByPartyIndex: { 0: 15 },
    });
    const actor = party.getByPosition(0);
    const state = createBattleStateFromParty(party);

    const preview = previewTurn(state, {
      0: {
        characterId: actor.characterId,
        skillId: c.skillId,
        breakHitCount: c.breakHitCount,
      },
    });
    const { nextState } = commitTurn(state, preview);
    assert.equal(
      Math.floor(nextState.turnState.odGauge),
      c.expected,
      `skillId=${c.skillId} should match confirmed OD integer`
    );
  }
});

test('OverDrivePointUp condition BreakHitCount()>0 is evaluated from action context', () => {
  const store = getStore();
  const skillId = 46005507; // 哀のスノードロップ
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 15 },
  });
  const actor = party.getByPosition(0);

  // 非ブレイク時: 攻撃ぶんのみ
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 0 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 5);

  // ブレイク時: OverDrivePointUp(+150%)を追加
  state = createBattleStateFromParty(party);
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId, breakHitCount: 1 },
  });
  committed = commitTurn(state, preview);
  assert.equal(Math.floor(committed.nextState.turnState.odGauge), 164);
});

test('non-damaging OD gain skill applies drive bonus and first-use branching (Compensation)', () => {
  const store = getStore();
  const skillId = 46005308; // コンペンセーション
  const styleId = findStyleIdBySkillId(store, skillId);
  const others = getSixUsableStyleIds(store).filter((id) => id !== styleId);
  const styleIds = [styleId, ...others.slice(0, 5)];
  const party = store.buildPartyFromStyleIds(styleIds, {
    initialSP: 20,
    drivePierceByPartyIndex: { 0: 0 },
  });
  const actor = party.getByPosition(0);

  // 1回目: 装備なしの素の状態ではスキル本体ぶん 75% のみ。
  // 究極のスリルは T2 開始条件なので、T1 の committed record には混ざらない。
  let state = createBattleStateFromParty(party);
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  let committed = commitTurn(state, preview);
  assert.ok(Math.abs(committed.committedRecord.actions[0].odGaugeGain - 75) < 0.01);
  assert.equal(
    committed.committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === actor.characterId &&
        event.passiveName === '究極のスリル'
    ),
    false
  );
  assert.equal(committed.nextState.party[0].dpState.currentDp, 1);

  // 2回目: 開始時点で DP50%未満なので、T2 の committed record には究極のスリルが現れる。
  // スキル本体は 25% 側に切り替わる。
  state = committed.nextState;
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId },
  });
  committed = commitTurn(state, preview);
  assert.ok(Math.abs(committed.committedRecord.actions[0].odGaugeGain - 25) < 0.01);
  assert.equal(committed.nextState.party[0].dpState.currentDp, 1);
  assert.ok(
    committed.committedRecord.passiveEvents.some(
      (event) =>
        event.characterId === actor.characterId &&
        event.passiveName === '究極のスリル' &&
        event.effectTypes.includes('OverDrivePointUp') &&
        Number(event.odGaugeDelta ?? 0) === 10
    )
  );
});

test('od gauge is capped at 300%', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `C${idx + 1}`,
      characterName: `C${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      drivePiercePercent: idx === 0 ? 15 : 0,
      skills: [
        {
          id: 9800 + idx,
          name: idx === 0 ? 'Big AoE' : 'Normal',
          sp_cost: 1,
          hit_count: 12,
          target_type: 'All',
          parts: [{ skill_type: 'AttackSkill', target_type: idx === 0 ? 'All' : 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 299.5;
  const preview = previewTurn(
    state,
    {
      0: { characterId: 'C1', skillId: 9800 },
    },
    null,
    3
  );
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.odGauge, 300);
});

test('OverDrivePointDown reduces od gauge and lower bound is -999.99', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `D${idx + 1}`,
      characterName: `D${idx + 1}`,
      styleId: idx + 1,
      styleName: `S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills: [
        {
          id: 9900 + idx,
          name: idx === 0 ? 'Spend OD 50' : 'Normal',
          sp_cost: 0,
          hit_count: -1,
          target_type: 'Self',
          parts:
            idx === 0
              ? [{ skill_type: 'OverDrivePointDown', target_type: 'Self', power: [0.5, 0] }]
              : [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 40;
  let preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  let committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -10);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = 184.7;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, 134.7);

  state = createBattleStateFromParty(party);
  state.turnState.odGauge = -990;
  preview = previewTurn(state, {
    0: { characterId: 'D1', skillId: 9900 },
  });
  committed = commitTurn(state, preview);
  assert.equal(committed.nextState.turnState.odGauge, -999.99);
});

test('skill with IsOverDrive() condition is unusable outside OD and usable in OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OD${idx + 1}`,
      characterName: `OD${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10000 + idx,
          name: 'OD Only Skill',
          label: `ODOnly${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OD1', skillId: 10000 },
      }),
    /cannot be used because cond is not satisfied/
  );

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  const preview = previewTurn(state, {
    0: { characterId: 'OD1', skillId: 10000 },
  });
  assert.equal(preview.actions.length, 1);
});

test('skill with IsOverDrive()==0 is unusable in OD and usable outside OD', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODZ${idx + 1}`,
      characterName: `ODZ${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODZS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10200 + idx,
          name: 'OD Forbidden Skill',
          label: `ODForbidden${idx + 1}`,
          sp_cost: 0,
          cond: 'IsOverDrive()==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);

  const normalPreview = previewTurn(state, {
    0: { characterId: 'ODZ1', skillId: 10200 },
  });
  assert.equal(normalPreview.actions.length, 1);

  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'ODZ1', skillId: 10200 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('CountBC(...BreakDownTurn()>0) is evaluated from enemy down-turn state', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ED${idx + 1}`,
      characterName: `ED${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18000,
                name: 'BreakDown Dependent',
                label: 'BreakDownDependent',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0',
                parts: [],
              },
            ]
          : [{ id: 18000 + idx, name: 'Normal', label: `EDSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);

  const previewWithoutDown = previewTurn(state, {
    0: { characterId: 'ED1', skillId: 18000 },
  });
  assert.equal(previewWithoutDown.actions.length, 1);

  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };
  const preview = previewTurn(state, {
    0: { characterId: 'ED1', skillId: 18000 },
  });
  const { nextState } = commitTurn(state, preview);
  // 新仕様: remaining=1 は 1 tick で 0 に下がるが、grace として status は残る
  const downTurn = nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurn, 'DownTurn should remain at remaining=0 (grace) after 1 tick');
  assert.equal(Number(downTurn.remainingTurns ?? -1), 0);
});

test('CountBC(...IsBroken()==1) is evaluated from enemy break status', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EB${idx + 1}`,
      characterName: `EB${idx + 1}`,
      styleId: idx + 1,
      styleName: `EBS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18100,
                name: 'Break Hunter',
                label: 'BreakHunter',
                sp_cost: 0,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsBroken()==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18100 + idx, name: 'Normal', label: `EBSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const previewWithoutBreak = previewTurn(state, {
    0: { characterId: 'EB1', skillId: 18100 },
  });
  assert.equal(previewWithoutBreak.actions.length, 1);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [{ statusType: 'Break', targetIndex: 1, remainingTurns: 2 }],
  };
  const preview = previewTurn(state, {
    0: { characterId: 'EB1', skillId: 18100 },
  });
  assert.equal(preview.actions.length, 1);
});

test('iuc_cond mismatch does not emit skill condition mismatch warning', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18110,
              name: 'IUC Conditional Skill',
              label: 'IUCConditionalSkill',
              sp_cost: 0,
              iuc_cond: 'CountBC(IsPlayer()==0&&IsDead()==0&&BreakDownTurn()>0)>0',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const warnings = [];

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'M1', skillId: 18110 },
    },
    null,
    1,
    {
      allowSkillConditionMismatch: true,
      onWarning: (message) => warnings.push(String(message)),
    }
  );

  assert.equal(preview.actions.length, 1);
  assert.equal(
    warnings.some((warning) => warning.includes('skill condition mismatch allowed')),
    false
  );
});

test('SuperBreak only upgrades weak broken targets and records SuperBreak state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18120,
              name: '光輝の夜明け',
              sp_cost: 0,
              target_type: 'All',
              parts: [
                {
                  skill_type: 'SuperBreak',
                  target_type: 'All',
                  elements: ['Light'],
                  cond: 'IsHitWeak()',
                  hits: [{ id: 1, type: 'Before', power_ratio: 0 }],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [
      { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
      { statusType: 'Break', targetIndex: 1, remainingTurns: 0 },
    ],
    damageRatesByEnemy: {
      0: { Light: 150 },
      1: { Light: 50 },
    },
    destructionRateByEnemy: {
      0: 180,
      1: 220,
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18120 },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');
  const nextEnemyState = committed.nextState.turnState.enemyState;

  assert.equal(
    nextEnemyState.statuses.some((status) => status.statusType === 'SuperBreak' && status.targetIndex === 0),
    true
  );
  assert.deepEqual(
    nextEnemyState.statuses.find((status) => status.statusType === 'SuperBreak' && status.targetIndex === 0)?.elements,
    ['Light']
  );
  assert.equal(
    nextEnemyState.statuses.some((status) => status.statusType === 'SuperBreak' && status.targetIndex === 1),
    false
  );
  assert.equal(nextEnemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(nextEnemyState.destructionRateCapByEnemy['1'], undefined);
  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'SuperBreak');
  assert.equal(action.enemyStatusChanges[0].targetIndex, 0);
  assert.deepEqual(action.enemyStatusChanges[0].elements, ['Light']);
});

test('SuperBreak After upgrades a target that the same action marked as Break', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18121,
              name: 'Self Break Super',
              hit_count: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Stab',
                  elements: ['Light'],
                  power: [999999, 999999],
                  value: [0, 0],
                  strval: [-1, -1],
                  cond: '',
                  multipliers: { dp: 1, hp: 1, dr: 1 },
                  parameters: { str: 1, wis: 0, dex: 1, spr: 0, luk: 0, con: 0 },
                  growth: [0, 0],
                  hits: [],
                  hit_condition: '',
                  target_condition: '',
                  effect: { ir: false, category: 'None', limitType: 'None', exitCond: 'None', exitVal: [0, 0] },
                },
                {
                  skill_type: 'SuperBreak',
                  target_type: 'Single',
                  elements: ['Light'],
                  cond: 'IsHitWeak()',
                  hits: [{ id: 1, type: 'After', power_ratio: 0 }],
                },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(8800 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.statuses = [];
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Light: 150 } };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18121, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreak' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'SuperBreak' && change.targetIndex === 0),
    true
  );
});

test('SuperBreak Before does not upgrade a target that was only marked as Break by the same action', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18122,
              name: 'Before Only Super',
              hit_count: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  type: 'Stab',
                  elements: ['Light'],
                  power: [999999, 999999],
                  value: [0, 0],
                  strval: [-1, -1],
                  cond: '',
                  multipliers: { dp: 1, hp: 1, dr: 1 },
                  parameters: { str: 1, wis: 0, dex: 1, spr: 0, luk: 0, con: 0 },
                  growth: [0, 0],
                  hits: [],
                  hit_condition: '',
                  target_condition: '',
                  effect: { ir: false, category: 'None', limitType: 'None', exitCond: 'None', exitVal: [0, 0] },
                },
                {
                  skill_type: 'SuperBreak',
                  target_type: 'Single',
                  elements: ['Light'],
                  cond: 'IsHitWeak()',
                  hits: [{ id: 1, type: 'Before', power_ratio: 0 }],
                },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(8900 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.statuses = [];
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Light: 150 } };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18122, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreak' && status.targetIndex === 0
    ),
    false
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'SuperBreak'),
    false
  );
});

test('CountBC(...IsWeakElement(Fire)==1) in overwrite_cond changes SP cost from enemy damage rates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EW${idx + 1}`,
      characterName: `EW${idx + 1}`,
      styleId: idx + 1,
      styleName: `EWS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18150,
                name: 'Weak Hunter',
                label: 'WeakHunter',
                sp_cost: 5,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Fire)==1)>0',
                overwrite: 0,
                overwrite_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Fire)==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18150 + idx, name: 'Normal', label: `EWSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const neutralPreview = previewTurn(state, {
    0: { characterId: 'EW1', skillId: 18150 },
  });
  assert.equal(neutralPreview.actions.length, 1);
  assert.equal(neutralPreview.actions[0].spCost, 5);

  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Fire: 120, Ice: 100 },
      1: { Fire: 100 },
    },
  };
  const preview = previewTurn(state, {
    0: { characterId: 'EW1', skillId: 18150 },
  });
  assert.equal(preview.actions.length, 1);
  assert.equal(preview.actions[0].spCost, 0);
});

test('IsWeakElement defaults to false when enemy damage rate is not above 100% in overwrite_cond', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EWD${idx + 1}`,
      characterName: `EWD${idx + 1}`,
      styleId: idx + 1,
      styleName: `EWDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 18180,
                name: 'Weak Hunter Default',
                label: 'WeakHunterDefault',
                sp_cost: 6,
                iuc_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Ice)==1)>0',
                overwrite: 0,
                overwrite_cond: 'CountBC(IsPlayer()==0 && IsDead()==0 && IsWeakElement(Ice)==1)>0',
                parts: [],
              },
            ]
          : [{ id: 18180 + idx, name: 'Normal', label: `EWDSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Ice: 100 },
      1: { Fire: 130 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EWD1', skillId: 18180 },
  });
  assert.equal(preview.actions.length, 1);
  assert.equal(preview.actions[0].spCost, 6);
});

test('Zone skill applies zone state and IsZone condition becomes true on next turn', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8101,
              name: '火フィールド',
              label: 'FireZoneSkill',
              sp_cost: 5,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  power: [1.8, 0],
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8101 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'zone');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].type, 'Fire');

  const conditionalParty = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 90001,
              name: '火陣確認',
              timing: 'OnPlayerTurnStart',
              condition: 'IsZone(Fire)==1',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'Self',
                  power: [2, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const conditionalState = createBattleStateFromParty(conditionalParty, nextState.turnState);
  const result = applyPassiveTiming(conditionalState, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0].delta, 2);
});

test('ZoneUpEternal modifier makes deployed zone eternal', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8102,
              name: '火フィールド',
              label: 'FireZoneSkill',
              sp_cost: 5,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  power: [1.8, 0],
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 90002,
              name: 'メディテーション',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'ZoneUpEternal',
                  target_type: 'Field',
                  power: [0.15, 0],
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8102 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: null,
    powerRate: 1.95,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'zone');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].remainingTurns, null);
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].powerRate, 1.95);
});

test('ZoneUpEternal with OnPlayerTurnStart timing and MoraleLevel condition activates when morale >= 6', () => {
  const makeParty = (initialMorale) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            elements: ['Fire'],
            initialMorale,
            skills: [
              {
                id: 8103,
                name: '火フィールド',
                sp_cost: 0,
                target_type: 'Field',
                parts: [
                  {
                    skill_type: 'Zone',
                    target_type: 'Field',
                    elements: ['Fire'],
                    power: [1.35, 0],
                    effect: { exitCond: 'PlayerTurnEnd', exitVal: [4, 0] },
                  },
                ],
              },
            ],
            passives: [
              {
                id: 90003,
                name: '武運長久テスト',
                timing: 'OnPlayerTurnStart',
                condition: 'MoraleLevel()>=6',
                parts: [
                  {
                    skill_type: 'ZoneUpEternal',
                    target_type: 'Self',
                    power: [0.15, 0],
                    effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                  },
                ],
              },
            ],
          }
        : {}
    );

  // morale=6 → ZoneUpEternal condition satisfied → zone becomes eternal
  const highMoraleState = createBattleStateFromParty(makeParty(6));
  const { nextState: highNext } = commitTurn(
    highMoraleState,
    previewTurn(highMoraleState, { 0: { characterId: 'M1', skillId: 8103 } })
  );
  assert.equal(highNext.turnState.zoneState?.remainingTurns, null, 'zone should be eternal when morale>=6');
  assert.equal(highNext.turnState.zoneState?.powerRate, 1.5, 'zone powerRate should include ZoneUpEternal bonus');

  // morale=5 → condition not satisfied → zone keeps its original duration (4 turns, ticks to 3 after commit)
  const lowMoraleState = createBattleStateFromParty(makeParty(5));
  const { nextState: lowNext } = commitTurn(
    lowMoraleState,
    previewTurn(lowMoraleState, { 0: { characterId: 'M1', skillId: 8103 } })
  );
  assert.ok(
    typeof lowNext.turnState.zoneState?.remainingTurns === 'number',
    'zone should have finite duration when morale<6'
  );
  assert.notEqual(lowNext.turnState.zoneState?.remainingTurns, null, 'zone should not be eternal when morale<6');
  assert.equal(lowNext.turnState.zoneState?.powerRate, 1.35, 'zone powerRate should not change when modifier is inactive');
});

test('ZoneUpEternal increases power without changing duration for already eternal zones', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 81031,
              name: '永続火フィールド',
              sp_cost: 0,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  power: [1.35, 0],
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 90004,
              name: '天長地久テスト',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [
                {
                  skill_type: 'ZoneUpEternal',
                  target_type: 'Field',
                  power: [0.2, 0],
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const { nextState, committedRecord } = commitTurn(
    state,
    previewTurn(state, { 0: { characterId: 'M1', skillId: 81031 } })
  );

  assert.deepEqual(nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: null,
    powerRate: 1.55,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].remainingTurns, null);
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].powerRate, 1.55);
});

test('new field zone overwrites the previous active field zone', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 81020,
            name: '火フィールド',
            sp_cost: 0,
            target_type: 'Field',
            parts: [
              {
                skill_type: 'Zone',
                target_type: 'Field',
                elements: ['Fire'],
                power: [1.8, 0],
                effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
              },
            ],
          },
          {
            id: 81022,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        skills: [
          {
            id: 81021,
            name: '氷フィールド',
            sp_cost: 0,
            target_type: 'Field',
            parts: [
              {
                skill_type: 'Zone',
                target_type: 'Field',
                elements: ['Ice'],
                power: [1.8, 0],
                effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
              },
            ],
          },
          {
            id: 81023,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    if (idx === 2) {
      return {
        skills: [
          {
            id: 81024,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  const preview1 = previewTurn(state, {
    0: { characterId: 'M1', skillId: 81020 },
    1: { characterId: 'M2', skillId: 81023 },
    2: { characterId: 'M3', skillId: 81024 },
  });
  const commit1 = commitTurn(state, preview1);
  assert.deepEqual(commit1.nextState.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });

  const preview2 = previewTurn(commit1.nextState, {
    0: { characterId: 'M1', skillId: 81022 },
    1: { characterId: 'M2', skillId: 81021 },
    2: { characterId: 'M3', skillId: 81024 },
  });
  const commit2 = commitTurn(commit1.nextState, preview2);

  assert.deepEqual(commit2.nextState.turnState.zoneState, {
    type: 'Ice',
    sourceSide: 'player',
    remainingTurns: 7,
    powerRate: 1.8,
  });
});

test('preview and damage context expose zone power for matching element skills', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          elements: ['Fire'],
          skills: [
            {
              id: 8103,
              name: '火属性攻撃',
              label: 'FireAttackSkill',
              sp_cost: 5,
              hit_count: 1,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'AttackSkill',
                  target_type: 'Single',
                  elements: ['Fire'],
                  power: [1.0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party, {
    zoneState: { type: 'Fire', sourceSide: 'player', remainingTurns: 8, powerRate: 1.8 },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8103 },
  });
  assert.equal(preview.actions[0].specialPassiveModifiers?.zonePowerRate, 1.8);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].damageContext?.zoneType, 'Fire');
  assert.equal(committedRecord.actions[0].damageContext?.zonePowerRate, 1.8);
});

test('OnEveryTurn Zone展開パッシブ: partyIndex=1が先に展開しpartyIndex=0のIsZone(Fire)==1条件が正しく評価される', () => {
  // パーティー行動順は [1, 0, 2, 3, 4, 5]（partyIndex=1 が最初に行動）
  // partyIndex=1: OnEveryTurn で Fire Zone を展開
  // partyIndex=0: IsZone(Fire)==1 条件 + SP+3 の OnEveryTurn パッシブ
  //
  // 旧走査順 [0,1,...] では partyIndex=0 が zone 展開前に評価 → 条件 false → SP変動なし
  // 正しい走査順 [1,0,...] では partyIndex=1 が先にゾーン展開 → partyIndex=0 が条件 true → SP+3
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        passives: [
          {
            id: 91001,
            name: '火陣SP回復',
            timing: 'OnEveryTurn',
            condition: 'IsZone(Fire)==1',
            parts: [
              {
                skill_type: 'HealSp',
                target_type: 'Self',
                power: [3, 0],
                effect: { exitCond: 'None', exitVal: [0, 0] },
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        passives: [
          {
            id: 91002,
            name: '火陣展開',
            timing: 'OnEveryTurn',
            condition: '',
            parts: [
              {
                skill_type: 'Zone',
                target_type: 'Field',
                elements: ['Fire'],
                power: [1.8, 0],
                effect: { exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);

  // 毎ターン開始時の applyInitialPassiveState 相当のタイミングをシミュレート
  // commitTurn でも同じ applyPassiveTimingInternal が呼ばれる（OnEveryTurn は recovery pipeline 内）
  // ここでは applyPassiveTiming('OnEveryTurn') を直接呼び出して評価順の検証のみを行う
  const initialSP0 = state.party[0].sp.current;
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  // partyIndex=1 が先に Zone(Fire) 展開 → partyIndex=0 の IsZone(Fire)==1 が true → SP+3
  assert.equal(
    result.spEvents.some((ev) => ev.characterId === 'M1' && ev.delta === 3),
    true,
    'partyIndex=0 の IsZone(Fire)==1 条件付きパッシブが SP+3 で発動すべき'
  );
  // ゾーンが展開されていること
  assert.equal(state.turnState.zoneState?.type, 'Fire', '火属性ゾーンが展開されているべき');
});

test('Passive.Start_UseZone_SP01 (オーバーレイ) does not fire from enemy preemptive Turn0 zone deployment', () => {
  const store = getStore();
  const overlayStyle = store.getStyleById(1005206);
  assert.ok(overlayStyle, 'overlay style should exist');
  const overlayPassive = structuredClone(
    (overlayStyle.passives ?? []).find((passive) => String(passive?.label ?? '') === 'Passive.Start_UseZone_SP01')
  );
  assert.ok(overlayPassive, 'overlay passive should exist');

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'IIshii',
          characterName: 'Ishii',
          passives: [overlayPassive],
        }
      : {}
  );
  const state = createBattleStateFromParty(party, {
    zoneState: {
      type: 'Fire',
      sourceSide: 'enemy',
      remainingTurns: null,
    },
  });
  const overlayMember = state.party.find((member) => String(member.characterId) === 'IIshii');
  assert.ok(overlayMember, 'overlay member should exist in battle state');
  const initialSp = overlayMember.sp.current;

  applyInitialPassiveState(state);

  assert.equal(
    overlayMember.sp.current,
    initialSp,
    'オーバーレイは「味方がフィールドを展開した時」トリガーのため、敵Turn0展開のみでは発火しない'
  );
  assert.equal(
    state.turnState.passiveEventsLastApplied.some((event) => String(event?.passiveName ?? '') === 'オーバーレイ'),
    false,
    'enemy preemptive zone should not produce overlay passive event at battle start'
  );
});

test('Passive.Start_FireFieldODUp01 (インパスト) fires on Turn1 start when enemy preemptive fire zone is active', () => {
  const store = getStore();
  const impastStyle = store.getStyleById(1005205);
  assert.ok(impastStyle, 'impast style should exist');
  const impastPassive = structuredClone(
    (impastStyle.passives ?? []).find((passive) => String(passive?.label ?? '') === 'Passive.Start_FireFieldODUp01')
  );
  assert.ok(impastPassive, 'impast passive should exist');

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [impastPassive],
        }
      : {}
  );
  const state = createBattleStateFromParty(party, {
    zoneState: {
      type: 'Fire',
      sourceSide: 'enemy',
      remainingTurns: null,
    },
  });

  applyInitialPassiveState(state);

  assert.equal(
    state.turnState.odGauge,
    5,
    'Turn1 start OnEveryTurn should gain +5% OD when Fire zone is active'
  );
  assert.equal(
    state.turnState.passiveEventsLastApplied.some((event) => String(event?.passiveName ?? '') === 'インパスト'),
    true,
    'インパスト passive event should be logged at Turn1 start'
  );
});

test('ReviveTerritory skill applies territory state and IsTerritory condition becomes true', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 8201,
              name: '再生の陣',
              label: 'ReviveTerritorySkill',
              sp_cost: 8,
              target_type: 'Field',
              parts: [
                {
                  skill_type: 'ReviveTerritory',
                  target_type: 'Field',
                  power: [0.5, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8201 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.territoryState, {
    type: 'ReviveTerritory',
    sourceSide: 'player',
    remainingTurns: null,
    powerRate: 0.5,
  });
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].kind, 'territory');
  assert.equal(committedRecord.actions[0].fieldStateApplied[0].powerRate, 0.5);

  const conditionalParty = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 90002,
              name: '方円',
              timing: 'OnEveryTurn',
              condition: 'IsTerritory(ReviveTerritory)==1',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'Self',
                  power: [1, 0],
                  effect: { exitCond: 'None', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const conditionalState = createBattleStateFromParty(conditionalParty, nextState.turnState);
  const result = applyPassiveTiming(conditionalState, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0].delta, 1);
});

test('ReviveTerritory activates at turn start, heals all allies, and is consumed', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx <= 2) {
      return {
        dpState:
          idx === 0
            ? { baseMaxDp: 100, currentDp: 0 }
            : idx === 1
              ? { baseMaxDp: 100, currentDp: 20 }
              : { baseMaxDp: 100, currentDp: 60 },
        skills: [
          {
            id: 8210 + idx,
            name: 'プロテクション',
            sp_cost: 0,
            target_type: 'Self',
            parts: [{ skill_type: 'BuffDefence', target_type: 'Self', type: 'None' }],
          },
        ],
      };
    }
    return {
      dpState: { baseMaxDp: 100, currentDp: 40 },
    };
  });
  const state = createBattleStateFromParty(party, {
    territoryState: { type: 'ReviveTerritory', sourceSide: 'player', remainingTurns: null, powerRate: 0.5 },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8210 },
    1: { characterId: 'M2', skillId: 8211 },
    2: { characterId: 'M3', skillId: 8212 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.territoryState, null);
  assert.equal(nextState.party[0].dpState.currentDp, 50);
  assert.equal(nextState.party[1].dpState.currentDp, 70);
  assert.equal(nextState.party[2].dpState.currentDp, 100);
  assert.equal(nextState.party[3].dpState.currentDp, 90);
  assert.equal(
    committedRecord.dpEvents.some(
      (event) =>
        event.source === 'territory' &&
        event.triggerType === 'ReviveTerritory' &&
        event.characterId === 'M1'
    ),
    true
  );
});

test('enemy down-turn status does not tick during OD/EX chain without base-turn advance', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EDO${idx + 1}`,
      characterName: `EDO${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 18200 + idx, name: 'Normal', label: `EDOSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  state = activateOverdrive(state, 1, 'preemptive', { forceActivation: true });
  const preview = previewTurn(state, {
    0: { characterId: 'EDO1', skillId: 18200 },
    1: { characterId: 'EDO2', skillId: 18201 },
    2: { characterId: 'EDO3', skillId: 18202 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnIndex, 1);
  assert.equal(nextState.turnState.enemyState.statuses.length, 1);
});

test('enemy down-turn status ticks when base turn advances (enemy turn consumed)', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EDX${idx + 1}`,
      characterName: `EDX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EDXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 18100 + idx, name: 'Normal', label: `EDXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const party = new Party(members);
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EDX1', skillId: 18100 },
    1: { characterId: 'EDX2', skillId: 18101 },
    2: { characterId: 'EDX3', skillId: 18102 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(nextState.turnState.turnIndex, 2);
  // remaining=1 → 1 tick で remaining=0 へ（ダウンターン最終ターンとして保持される）
  const downTurn = nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurn, 'DownTurn が remaining=0 で残っているはず');
  assert.equal(Number(downTurn.remainingTurns ?? -1), 0);
});

test('SuperBreakDown adds DownTurn event on fresh target and leaves Break state in next turn', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18130,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18130, targetEnemyIndex: 0 },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'DownTurn');
  assert.equal(action.enemyStatusChanges[0].remainingTurns, 1);
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  // 新仕様: 付与された DownTurn(remaining=1) は 1 tick 後 remaining=0 で残る（次ターンに消える）
  const downTurn = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurn, '付与直後の DownTurn は remaining=0 の grace で残っているはず');
  assert.equal(Number(downTurn.remainingTurns ?? -1), 0);
});

test('SuperBreakDown upgrades same-action manual break target to canonical SuperBreakDown state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18133,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18133, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'SuperBreakDown'),
    true
  );
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn'),
    false
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreakDown' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
});

test('SuperBreakDown does not re-break a target that is already in Break state on the next turn', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18130,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const turn1Preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18130, targetEnemyIndex: 0 },
  });
  const turn1Committed = commitTurn(state, turn1Preview);
  const turn2Preview = previewTurn(turn1Committed.nextState, {
    0: { characterId: 'M1', skillId: 18130, targetEnemyIndex: 0 },
  });
  const turn2Committed = commitTurn(turn1Committed.nextState, turn2Preview);
  const turn2Action = turn2Committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(
    (turn2Action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn'),
    false
  );
  assert.equal(
    turn2Committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    turn2Committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
    ),
    false
  );
});

test('BreakDownTurnUp from triggered passive skill extends DownTurn by 1 turn on break', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18132,
              name: 'トリガーブレイク(テスト)',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
          triggeredSkills: [
            {
              id: 46409901,
              name: '遥拝の君(テスト)',
              label: 'TriggeredBreakDownTurnUp',
              sp_cost: 0,
              target_type: 'None',
              passive: {
                timing: 'OnFirstBattleStart',
                condition: '',
                effect: 'NormalBuff_Up',
              },
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'AllyAll' },
                { skill_type: 'BreakDownTurnUp', target_type: 'None', power: [1, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18132, targetEnemyIndex: 0, breakHitCount: 1 },
  });
  const committed = commitTurn(state, preview);
  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(
    action.enemyStatusChanges.some(
      (change) =>
        change.mode === 'BreakDownTurnUp' &&
        change.statusType === 'DownTurn' &&
        change.targetIndex === 0 &&
        change.remainingTurns === 2
    ),
    true
  );

  const downTurn = committed.nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.equal(Number(downTurn?.remainingTurns ?? 0), 1);
});

test('SuperBreakDown upgrades down-turn target to canonical SuperBreakDown state and restores cap when down-turn ends', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 18131,
              name: 'ナイトキルエッジ',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 2 }],
    destructionRateByEnemy: { 0: 250 },
  };

  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18131, targetEnemyIndex: 0 },
  });
  let committed = commitTurn(state, preview);
  let action = committed.committedRecord.actions.find((entry) => entry.characterId === 'M1');

  assert.equal(action.enemyStatusChanges.length, 1);
  assert.equal(action.enemyStatusChanges[0].mode, 'SuperBreakDown');
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreakDown' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.find((status) => status.statusType === 'DownTurn')
      ?.remainingTurns,
    1
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(committed.nextState.turnState.enemyState.breakStateByEnemy['0'].superDown.preRate, 250);

  committed.nextState.turnState.enemyState.destructionRateByEnemy['0'] = 420;
  preview = previewTurn(committed.nextState, {
    0: { characterId: 'M1', skillId: 18131, targetEnemyIndex: 0 },
  });
  committed = commitTurn(committed.nextState, preview);

  // 新仕様: 1 → 0 grace で DownTurn / SuperBreakDown はまだ残り、もう 1 ターン後に消える
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some((status) => status.statusType === 'SuperBreakDown'),
    true
  );

  preview = previewTurn(committed.nextState, {
    0: { characterId: 'M1', skillId: 18131, targetEnemyIndex: 0 },
  });
  committed = commitTurn(committed.nextState, preview);

  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some((status) => status.statusType === 'SuperBreakDown'),
    false
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
  assert.deepEqual(committed.nextState.turnState.enemyState.destructionRateCapByEnemy, {});
  assert.deepEqual(committed.nextState.turnState.enemyState.breakStateByEnemy, {});
});

test('same-turn manual Break can yield SuperBreak on E1/E2 and SuperBreakDown on E3 across three enemies', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 18140,
            name: 'クロス斬り',
            sp_cost: 0,
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        skills: [
          {
            id: 18141,
            name: '光輝の夜明け',
            sp_cost: 0,
            target_type: 'All',
            parts: [
              { skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' },
              { skill_type: 'SuperBreak', target_type: 'All', hits: [{ type: 'Before' }], elements: ['Light'] },
              { skill_type: 'SuperBreak', target_type: 'All', hits: [{ type: 'After' }], elements: ['Light'] },
            ],
          },
        ],
      };
    }
    if (idx === 2) {
      return {
        skills: [
          {
            id: 18142,
            name: 'ナイトキルエッジ',
            sp_cost: 0,
            target_type: 'Single',
            parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single', type: 'Slash' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 3;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 18140, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
    1: { characterId: 'M2', skillId: 18141, manualBreakEnemyIndexes: [1] },
    2: { characterId: 'M3', skillId: 18142, targetEnemyIndex: 2, manualBreakEnemyIndexes: [2] },
  });
  const committed = commitTurn(state, preview);
  const yukiAction = committed.committedRecord.actions.find((entry) => entry.characterId === 'M2');
  const karenAction = committed.committedRecord.actions.find((entry) => entry.characterId === 'M3');

  assert.deepEqual(
    (yukiAction?.enemyStatusChanges ?? [])
      .filter((change) => change.mode === 'SuperBreak')
      .map((change) => change.targetIndex)
      .sort((left, right) => left - right),
    [0, 1]
  );
  assert.equal(
    (karenAction?.enemyStatusChanges ?? []).some(
      (change) => change.mode === 'SuperBreakDown' && change.targetIndex === 2
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreak' && status.targetIndex === 0
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreak' && status.targetIndex === 1
    ),
    true
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreakDown' && status.targetIndex === 2
    ),
    true
  );
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['1'], 600);
  assert.equal(committed.nextState.turnState.enemyState.destructionRateCapByEnemy['2'], 600);
});

test('SkillCondition branch sp_cost is applied when BreakDownTurn condition matches', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BDSP${idx + 1}`,
      characterName: `BDSP${idx + 1}`,
      styleId: idx + 1,
      styleName: `BDSPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      skills:
        idx === 0
          ? [
              {
                id: 28000,
                name: 'BreakDown Cost Branch',
                label: 'BreakDownCostBranch',
                sp_cost: 16,
                parts: [
                  {
                    skill_type: 'SkillCondition',
                    cond: 'CountBC(IsDead()==0&&IsPlayer()==0&&BreakDownTurn()>0)>0',
                    strval: [
                      {
                        id: 28001,
                        name: 'BreakDown Cost Branch A',
                        label: 'BreakDownCostBranchA',
                        sp_cost: 0,
                        consume_type: 'Sp',
                        hit_count: 8,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', power: [1, 1] }],
                      },
                      {
                        id: 28002,
                        name: 'BreakDown Cost Branch B',
                        label: 'BreakDownCostBranchB',
                        sp_cost: 16,
                        consume_type: 'Sp',
                        hit_count: 8,
                        target_type: 'Single',
                        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', power: [1, 1] }],
                      },
                    ],
                  },
                ],
              },
            ]
          : [{ id: 28010 + idx, name: 'Normal', label: `BDSPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  const party = new Party(members);
  const state = createBattleStateFromParty(party);

  // DownTurnなし: 16消費
  const previewNormal = previewTurn(state, {
    0: { characterId: 'BDSP1', skillId: 28000 },
  });
  assert.equal(previewNormal.actions[0].spCost, 16);
  assert.equal(previewNormal.actions[0].startSP, 20);
  assert.equal(previewNormal.actions[0].endSP, 4);

  // DownTurnあり: 0消費
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };
  const previewDown = previewTurn(state, {
    0: { characterId: 'BDSP1', skillId: 28000 },
  });
  assert.equal(previewDown.actions[0].spCost, 0);
  assert.equal(previewDown.actions[0].startSP, 20);
  assert.equal(previewDown.actions[0].endSP, 20);

  const { nextState } = commitTurn(state, previewDown);
  const actor = nextState.party.find((m) => m.characterId === 'BDSP1');
  assert.equal(actor?.sp?.current, 20);
});

test('skill with SpecialStatusCountByType(20)==0 is blocked during extra turn', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EX${idx + 1}`,
      characterName: `EX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10100 + idx,
          name: 'No Extra Skill',
          label: `NoExtra${idx + 1}`,
          sp_cost: 0,
          cond: 'SpecialStatusCountByType(20)==0',
          parts: [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['EX1']);

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'EX1', skillId: 10100 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('od-suspended extra turn satisfies both OD and extra-turn conditions simultaneously', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OX${idx + 1}`,
      characterName: `OX${idx + 1}`,
      styleId: idx + 1,
      styleName: `OXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 10150,
                name: 'OD Only',
                label: 'ODOnlyInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==1',
                parts: [],
              },
              {
                id: 10151,
                name: 'OD Forbidden',
                label: 'ODForbiddenInExtra',
                sp_cost: 0,
                cond: 'IsOverDrive()==0',
                parts: [],
              },
              {
                id: 10152,
                name: 'No Extra',
                label: 'NoExtraInOd',
                sp_cost: 0,
                cond: 'SpecialStatusCountByType(20)==0',
                parts: [],
              },
            ]
          : [{ id: 10160 + idx, name: 'Normal', label: `OXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['OX1']);
  state.turnState.odSuspended = true;
  state.turnState.odLevel = 3;
  state.turnState.remainingOdActions = 2;
  state.turnState.odContext = 'interrupt';

  const odOnlyPreview = previewTurn(state, {
    0: { characterId: 'OX1', skillId: 10150 },
  });
  assert.equal(odOnlyPreview.actions.length, 1, 'OD-only skill should be usable during OD-suspended EX');

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10151 },
      }),
    /cannot be used because cond is not satisfied/,
    'OD-forbidden skill should be blocked during OD-suspended EX'
  );

  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'OX1', skillId: 10152 },
      }),
    /cannot be used because cond is not satisfied/,
    'extra-turn-forbidden skill should remain blocked during OD-suspended EX'
  );
});

test('condition aliases support bare IsFront() and resource predicates', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CA${idx + 1}`,
      characterName: `CA${idx + 1}`,
      styleId: idx + 1,
      styleName: `CAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: idx === 0 ? 0 : 10,
      initialEP: idx === 0 ? 3 : 0,
      isBreak: idx === 0,
      skills: [
        idx === 0
          ? {
              id: 30001,
              name: '通常攻撃',
              label: 'AliasNormal',
              sp_cost: 0,
              cond: 'IsFront() && IsAttackNormal()==1 && ConsumeSp()==0 && Ep()>=3 && IsBroken()==1',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            }
          : {
              id: 30002 + idx,
              name: 'Normal',
              label: `AliasSkill${idx + 1}`,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'CA1', skillId: 30001 },
    1: { characterId: 'CA2', skillId: 30003 },
    2: { characterId: 'CA3', skillId: 30004 },
  });

  assert.equal(preview.actions.length, 3);
});

test('condition aliases block skills when bare/resource predicates are false', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CB${idx + 1}`,
      characterName: `CB${idx + 1}`,
      styleId: idx + 1,
      styleName: `CBS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      initialEP: idx === 0 ? 2 : 0,
      skills: [
        idx === 0
          ? {
              id: 31001,
              name: 'Spell',
              label: 'AliasBlocked',
              sp_cost: 9,
              cond: 'IsFront() && IsAttackNormal()==0 && ConsumeSp()<=8 && Ep()>=3',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            }
          : {
              id: 31002 + idx,
              name: 'Normal',
              label: `AliasBlockSkill${idx + 1}`,
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  assert.throws(
    () =>
      previewTurn(state, {
        0: { characterId: 'CB1', skillId: 31001 },
        1: { characterId: 'CB2', skillId: 31003 },
        2: { characterId: 'CB3', skillId: 31004 },
      }),
    /cannot be used because cond is not satisfied/
  );
});

test('IsNatureElement direct condition is evaluated from member style elements', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NE${idx + 1}`,
      characterName: `NE${idx + 1}`,
      styleId: idx + 1,
      styleName: `NES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      elements: idx === 0 ? ['Fire'] : ['Ice'],
      skills: [
        {
          id: 32000 + idx,
          name: 'Nature Skill',
          label: `NatureSkill${idx + 1}`,
          sp_cost: 0,
          cond: 'IsNatureElement(Fire)==1',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'NE1', skillId: 32000 },
  });
  assert.equal(preview.actions.length, 1);
  assert.throws(
    () => previewTurn(state, { 1: { characterId: 'NE2', skillId: 32001 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('CountBC(IsPlayer() && IsNatureElement(...)) is evaluated from party member elements', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `NC${idx + 1}`,
      characterName: `NC${idx + 1}`,
      styleId: idx + 1,
      styleName: `NCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      elements: idx <= 2 ? ['Fire'] : ['Ice'],
      skills: [
        {
          id: 32100 + idx,
          name: 'Nature Count Skill',
          label: `NatureCount${idx + 1}`,
          sp_cost: 0,
          cond: 'CountBC(IsPlayer() && IsNatureElement(Fire)==1)>=3',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'NC1', skillId: 32100 },
  });
  assert.equal(preview.actions.length, 1);

  state.party[2].elements = Object.freeze(['Ice']);
  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'NC1', skillId: 32100 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('IsCharacter direct condition is evaluated from member identity', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 1 ? 'IIshii' : `IC${idx + 1}`,
      characterName: idx === 1 ? '石井 色葉' : `IC${idx + 1}`,
      styleId: idx + 1,
      styleName: `ICS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 32200 + idx,
          name: 'Character Skill',
          label: `CharacterSkill${idx + 1}`,
          sp_cost: 0,
          cond: 'IsCharacter(IIshii)==1',
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    1: { characterId: 'IIshii', skillId: 32201 },
  });
  assert.equal(preview.actions.length, 1);

  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'IC1', skillId: 32200 } }),
    /cannot be used because cond is not satisfied/
  );
});

test('ConquestBikeLevel condition uses fixed internal value 160', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19001,
              name: '制圧戦常勝',
              timing: 'OnPlayerTurnStart',
              condition: 'ConquestBikeLevel()>=80',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents[0]?.passiveName, '制圧戦常勝');
});

test('DamageRate condition uses manual enemy destruction-rate state only', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19021,
              name: '高破壊率警戒',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()==0&&IsDead()==0&&IsBroken()==1&&DamageRate()>=200.0)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 2;
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
    { statusType: 'Break', targetIndex: 1, remainingTurns: 0 },
  ];
  state.turnState.enemyState.destructionRateByEnemy = {
    '0': 199,
    '1': 200,
  };

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents[0]?.passiveName, '高破壊率警戒');
});

test('Random condition succeeds by default for A, S, SS, and SSR passives', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 19011,
              name: 'A Random',
              tier: 'A',
              timing: 'OnPlayerTurnStart',
              condition: 'Random()<0.3',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : idx === 1
        ? {
            passives: [
              {
                id: 19012,
                name: 'S Random',
                tier: 'S',
                timing: 'OnPlayerTurnStart',
                condition: 'Random()<0.3',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ],
          }
        : idx === 2
          ? {
              passives: [
                {
                  id: 19013,
                  name: 'SS Random',
                  tier: 'SS',
                  timing: 'OnPlayerTurnStart',
                  condition: 'Random()<0.3',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                },
              ],
            }
          : idx === 3
            ? {
                passives: [
                  {
                    id: 19014,
                    name: 'SSR Random',
                    tier: 'SSR',
                    timing: 'OnPlayerTurnStart',
                    condition: 'Random()<0.3',
                    parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                  },
                ],
              }
          : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(state.party[0].sp.current, 11);
  assert.equal(state.party[1].sp.current, 11);
  assert.equal(state.party[2].sp.current, 11);
  assert.equal(state.party[3].sp.current, 11);
  assert.equal(result.spEvents.length, 4);
});

test('kishin state lasts 3 actionable turns then applies 1-turn action disable', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `K${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `K${idx + 1}`,
      styleId: idx + 1,
      styleName: `KS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 10300 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaSkill' : `KSkill${idx + 1}`,
          sp_cost: 1,
          parts: idx === 0 ? [{ skill_type: 'AttackSkill' }] : [],
        },
      ],
    })
  );
  const party = new Party(members);
  let state = createBattleStateFromParty(party);
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10300 },
      1: { characterId: 'K2', skillId: 10301 },
      2: { characterId: 'K3', skillId: 10302 },
    });
    state = commitTurn(state, preview).nextState;
  }

  const afterThree = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThree.isReinforcedMode, false);
  assert.equal(afterThree.actionDisabledTurns, 1);
  const actionSkills = afterThree.getActionSkills();
  assert.equal(actionSkills.length, 1);
  assert.equal(actionSkills[0].skillId, 0);
  assert.equal(actionSkills[0].name, '行動なし');

  const previewDisabledTurn = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
    1: { characterId: 'K2', skillId: 10301 },
    2: { characterId: 'K3', skillId: 10302 },
  });
  state = commitTurn(state, previewDisabledTurn).nextState;
  const recovered = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(recovered.actionDisabledTurns, 0);
});

test('Tezuka kishin turn count advances on extra turn even when Tezuka is not in allowed extra members', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KX${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KX${idx + 1}`,
      styleId: idx + 1,
      styleName: `KXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 18000 + idx,
          name: 'Normal',
          label: `KXSkill${idx + 1}`,
          sp_cost: 0,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);

  state = grantExtraTurn(state, ['KX2']);
  const preview = previewTurn(state, {
    1: { characterId: 'KX2', skillId: 18001 },
  });
  state = commitTurn(state, preview).nextState;

  const after = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(after.reinforcedTurnsRemaining, 2);
});

test('kishin remaining 1 still allows Tezuka self-extra grant before expiring', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: idx === 0 ? 'STezuka' : `KR${idx + 1}`,
      characterName: idx === 0 ? '手塚 咲' : `KR${idx + 1}`,
      styleId: idx + 1,
      styleName: `KRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: idx === 0 ? 10400 : 10400 + idx,
          name: idx === 0 ? '天駆の鉄槌' : 'Normal',
          label: idx === 0 ? 'STezukaTenku' : `KRSkill${idx + 1}`,
          sp_cost: 0,
          additionalTurnRule:
            idx === 0
              ? {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: true,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: true,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: false,
                  },
                  additionalTurnTargetTypes: ['Self'],
                }
              : null,
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'All' },
                  { skill_type: 'AdditionalTurn', target_type: 'Self' },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const tezuka = state.party.find((m) => m.characterId === 'STezuka');
  tezuka.activateReinforcedMode(3);
  state = grantExtraTurn(state, ['STezuka']);

  for (let i = 0; i < 3; i += 1) {
    const preview = previewTurn(state, {
      0: { characterId: 'STezuka', skillId: 10400 },
    });
    state = commitTurn(state, preview).nextState;
    assert.equal(state.turnState.turnType, 'extra', `commit #${i + 1} should still be extra`);
  }

  const afterThird = state.party.find((m) => m.characterId === 'STezuka');
  assert.equal(afterThird.isReinforcedMode, false);
  assert.equal(afterThird.actionDisabledTurns, 1);

  const disabledSkills = afterThird.getActionSkills();
  assert.equal(disabledSkills.length, 1);
  assert.equal(disabledSkills[0].skillId, 0);

  const previewDisabled = previewTurn(state, {
    0: { characterId: 'STezuka', skillId: 0 },
  });
  state = commitTurn(state, previewDisabled).nextState;
  assert.equal(state.turnState.turnType, 'normal');
});

test('commitTurn imports Funnel effect values from skill parts into statusEffects', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FU${idx + 1}`,
      characterName: `FU${idx + 1}`,
      styleId: idx + 1,
      styleName: `FUS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 21000 + idx,
          name: idx === 0 ? 'Funnel Self' : 'Normal',
          label: idx === 0 ? 'FunnelSelf' : `FUSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [5, 0],
                    value: [0.06, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'FU1', skillId: 21000 },
  });
  state = commitTurn(state, preview).nextState;

  const actor = state.party.find((m) => m.characterId === 'FU1');
  const effects = actor.resolveEffectiveFunnelEffects();
  assert.equal(effects.length, 1);
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].limitType, 'Default');
  assert.equal(effects[0].exitCond, 'Count');
  assert.equal(effects[0].remaining, 1);
  assert.equal(effects[0].metadata?.damageBonus, 0.06);
});

test('commitTurn imports Funnel from SkillCondition resolved branch', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FC${idx + 1}`,
      characterName: `FC${idx + 1}`,
      styleId: idx + 1,
      styleName: `FCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 22000 + idx,
          name: idx === 0 ? 'Conditional Funnel' : 'Normal',
          label: idx === 0 ? 'ConditionalFunnel' : `FCSkill${idx + 1}`,
          sp_cost: 0,
          parts:
            idx === 0
              ? [
                  {
                    skill_type: 'SkillCondition',
                    cond: 'IsOverDrive()==1',
                    strval: [
                      {
                        id: 1,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [3, 0],
                            value: [0.5, 0],
                            effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [3, 0] },
                          },
                        ],
                      },
                      {
                        id: 2,
                        parts: [
                          {
                            skill_type: 'Funnel',
                            target_type: 'Self',
                            power: [5, 0],
                            value: [0.12, 0],
                            effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                          },
                        ],
                      },
                    ],
                  },
                ]
              : [],
        },
      ],
    })
  );

  // 非ODでは後段(branch #2)が選ばれる
  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  let effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects[0].power, 5);
  assert.equal(effects[0].metadata?.damageBonus, 0.12);

  // ODでは前段(branch #1)が選ばれる
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');
  preview = previewTurn(state, {
    0: { characterId: 'FC1', skillId: 22000 },
  });
  state = commitTurn(state, preview).nextState;
  effects = state.party.find((m) => m.characterId === 'FC1').resolveEffectiveFunnelEffects();
  assert.equal(effects.some((item) => item.power === 3 && item.metadata?.damageBonus === 0.5), true);
});

test('OD gain uses Funnel hit bonus and consumes count-based Funnel on damage action', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FO${idx + 1}`,
      characterName: `FO${idx + 1}`,
      styleId: idx + 1,
      styleName: `FOS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 23000 + idx,
          name: idx === 0 ? 'Attack + Funnel' : 'Normal',
          label: idx === 0 ? 'AttackFunnel' : `FOSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 1 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'Single' },
                  {
                    skill_type: 'Funnel',
                    target_type: 'Self',
                    power: [3, 0],
                    value: [0.25, 0],
                    effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                  },
                ]
              : [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  let preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  let committed = commitTurn(state, preview);
  state = committed.nextState;

  // base hit 1 + funnel +3 => 4 hits => 10.0%
  assert.equal(state.turnState.odGauge, 10);
  const odEvent = committed.committedRecord.actions[0].funnelApplied;
  assert.equal(Array.isArray(odEvent), true);
  const actor = state.party.find((m) => m.characterId === 'FO1');
  assert.equal(actor.resolveEffectiveFunnelEffects().length, 0, 'count-based funnel should be consumed');

  preview = previewTurn(state, {
    0: { characterId: 'FO1', skillId: 23000 },
  });
  committed = commitTurn(state, preview);
  state = committed.nextState;
  assert.equal(state.turnState.odGauge, 20, 'same action repeats same +10.0%');
});

test('PlayerTurnEnd status expiry is applied to members action-capable on the next row', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TE${idx + 1}`,
      characterName: `TE${idx + 1}`,
      styleId: idx + 1,
      styleName: `TES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [{ id: 24000 + idx, name: 'Normal', label: `TESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['TE1']);
  state.party.find((m) => m.characterId === 'TE1').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });
  state.party.find((m) => m.characterId === 'TE2').addStatusEffect({
    statusType: 'Funnel',
    limitType: 'Only',
    exitCond: 'PlayerTurnEnd',
    remaining: 2,
    power: 3,
  });

  const preview = previewTurn(state, {
    0: { characterId: 'TE1', skillId: 24000 },
  });
  state = commitTurn(state, preview).nextState;

  const te1 = state.party.find((m) => m.characterId === 'TE1').resolveEffectiveFunnelEffects();
  const te2 = state.party.find((m) => m.characterId === 'TE2').resolveEffectiveFunnelEffects();
  assert.equal(te1[0].remaining, 1, 'allowed extra-turn member should tick when next row is normal');
  assert.equal(te2[0].remaining, 1, 'non-acting member should tick when the next row is normal');
});

test('count-based MindEye is consumed by damage action only', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ME${idx + 1}`,
      characterName: `ME${idx + 1}`,
      styleId: idx + 1,
      styleName: `MES${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 25000,
                name: 'Damage',
                label: 'DamageSkill',
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
              {
                id: 25001,
                name: 'Buff',
                label: 'BuffSkill',
                sp_cost: 0,
                parts: [{ skill_type: 'AttackUp', target_type: 'Self' }],
              },
            ]
          : [{ id: 25000 + idx + 1, name: 'Normal', label: `MESkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  // Damage consumes Count mind-eye
  let state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  let preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25000 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 0);

  // Non-damage does not consume Count mind-eye
  state = createBattleStateFromParty(new Party(members));
  state.party.find((m) => m.characterId === 'ME1').addStatusEffect({
    statusType: 'MindEye',
    limitType: 'Default',
    exitCond: 'Count',
    remaining: 1,
    power: 1,
  });
  preview = previewTurn(state, {
    0: { characterId: 'ME1', skillId: 25001 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(state.party.find((m) => m.characterId === 'ME1').resolveEffectiveMindEyeEffects().length, 1);
});

test('Funnel/MindEye: AdditionalTurn中も与ダメージで消費し、非ダメージでは消費しない', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: 9321,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 1,
            },
            {
              effectId: 9322,
              statusType: 'MindEye',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 1,
            },
          ],
          skills: [
            {
              id: 25231,
              name: 'Extra Damage',
              label: 'ExtraDamage25231',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
            {
              id: 25232,
              name: 'Extra Protection',
              label: 'ExtraProtection25232',
              sp_cost: 0,
              target_type: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            },
          ],
        }
      : {}
  );

  let state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['M1']);
  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25232 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(
    state.party.find((m) => m.characterId === 'M1').resolveEffectiveFunnelEffects().length,
    1,
    'AdditionalTurn中の非ダメージ行動ではFunnelが残る'
  );
  assert.equal(
    state.party.find((m) => m.characterId === 'M1').resolveEffectiveMindEyeEffects().length,
    1,
    'AdditionalTurn中の非ダメージ行動ではMindEyeが残る'
  );

  state = createBattleStateFromParty(party);
  state = grantExtraTurn(state, ['M1']);
  preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25231, targetEnemyIndex: 0 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(
    state.party.find((m) => m.characterId === 'M1').resolveEffectiveFunnelEffects().length,
    0,
    'AdditionalTurn中の与ダメージ行動でFunnelが消費される'
  );
  assert.equal(
    state.party.find((m) => m.characterId === 'M1').resolveEffectiveMindEyeEffects().length,
    0,
    'AdditionalTurn中の与ダメージ行動でMindEyeが消費される'
  );
});

const PLAYER_TURN_END_STATUS_START_REMAINING = 3;
const PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN = 2;
const TURN_BASED_FUNNEL_EFFECT_ID_BASE = 9400;
const TURN_BASED_FUNNEL_GRANT_EXTRA_SKILL_ID = 25301;
const TURN_BASED_FUNNEL_APPLY_AND_GRANT_EXTRA_SKILL_ID = 25302;
const TURN_BASED_ATTACK_UP_APPLY_SKILL_ID = 25303;
const TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE = 25310;

function addTurnBasedFunnelToAllMembers(state, remaining = PLAYER_TURN_END_STATUS_START_REMAINING) {
  for (const [idx, member] of state.party.entries()) {
    member.addStatusEffect({
      effectId: TURN_BASED_FUNNEL_EFFECT_ID_BASE + idx,
      statusType: 'Funnel',
      limitType: 'Default',
      exitCond: 'PlayerTurnEnd',
      remaining,
      power: 1,
    });
  }
}

function getTurnBasedFunnelRemainingByCharacterId(state) {
  return Object.fromEntries(
    state.party.map((member) => {
      const effect = member.statusEffects.find(
        (item) => item.statusType === 'Funnel' && item.exitCond === 'PlayerTurnEnd'
      );
      return [member.characterId, Number(effect?.remaining ?? 0)];
    })
  );
}

function getTurnBasedStatusRemainingByCharacterId(state, statusType) {
  return Object.fromEntries(
    state.party.map((member) => {
      const effect = member.statusEffects.find(
        (item) => item.statusType === statusType && item.exitCond === 'PlayerTurnEnd'
      );
      return [member.characterId, Number(effect?.remaining ?? 0)];
    })
  );
}

function buildTurnBasedFunnelActionableParty() {
  return createSixMemberManualParty((idx) => ({
    skills: [
      {
        id: TURN_BASED_FUNNEL_GRANT_EXTRA_SKILL_ID,
        name: '追加ターン付与',
        label: 'TurnBasedFunnelGrantExtra',
        sp_cost: 0,
        additionalTurnRule: {
          skillUsableInExtraTurn: true,
          additionalTurnGrantInExtraTurn: false,
          conditions: {
            requiresOverDrive: false,
            requiresReinforcedMode: false,
            excludesExtraTurnForSkillUse: false,
            excludesExtraTurnForAdditionalTurnGrant: true,
          },
          additionalTurnTargetTypes: ['Self'],
        },
        parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
      },
      {
        id: TURN_BASED_FUNNEL_APPLY_AND_GRANT_EXTRA_SKILL_ID,
        name: '連撃付与と追加ターン付与',
        label: 'TurnBasedFunnelApplyAndGrantExtra',
        sp_cost: 0,
        additionalTurnRule: {
          skillUsableInExtraTurn: true,
          additionalTurnGrantInExtraTurn: false,
          conditions: {
            requiresOverDrive: false,
            requiresReinforcedMode: false,
            excludesExtraTurnForSkillUse: false,
            excludesExtraTurnForAdditionalTurnGrant: true,
          },
          additionalTurnTargetTypes: ['Self'],
        },
        parts: [
          {
            skill_type: 'Funnel',
            target_type: 'AllyAll',
            power: [1, 0],
            effect: {
              exitCond: 'PlayerTurnEnd',
              exitVal: [PLAYER_TURN_END_STATUS_START_REMAINING, 0],
            },
          },
          { skill_type: 'AdditionalTurn', target_type: 'Self' },
        ],
      },
      {
        id: TURN_BASED_ATTACK_UP_APPLY_SKILL_ID,
        name: '攻撃力アップ付与',
        label: 'TurnBasedAttackUpApply',
        sp_cost: 0,
        parts: [
          {
            skill_type: 'AttackUp',
            target_type: 'AllyAll',
            power: [0.2, 0],
            effect: {
              limitType: 'Default',
              exitCond: 'PlayerTurnEnd',
              exitVal: [PLAYER_TURN_END_STATUS_START_REMAINING, 0],
            },
          },
        ],
      },
      {
        id: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE + idx,
        name: 'プロテクション',
        label: `TurnBasedFunnelProtection${idx + 1}`,
        sp_cost: 0,
        target_type: 'Self',
        parts: [{ skill_type: 'Protection', target_type: 'Self' }],
      },
    ],
  }));
}

test('PlayerTurnEnd型Funnelは付与直後は消費せず次行EXの行動可能対象だけ減る', () => {
  let state = createBattleStateFromParty(buildTurnBasedFunnelActionableParty());

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: TURN_BASED_FUNNEL_APPLY_AND_GRANT_EXTRA_SKILL_ID },
    1: { characterId: 'M2', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE + 1 },
    2: { characterId: 'M3', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE + 2 },
  });
  state = commitTurn(state, preview).nextState;

  assert.equal(state.turnState.turnType, 'extra');
  assert.deepEqual(getTurnBasedFunnelRemainingByCharacterId(state), {
    M1: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M2: PLAYER_TURN_END_STATUS_START_REMAINING,
    M3: PLAYER_TURN_END_STATUS_START_REMAINING,
    M4: PLAYER_TURN_END_STATUS_START_REMAINING,
    M5: PLAYER_TURN_END_STATUS_START_REMAINING,
    M6: PLAYER_TURN_END_STATUS_START_REMAINING,
  });
});

test('PlayerTurnEnd型ステータスはFunnel以外も次行の行動可能対象で減る', () => {
  let state = createBattleStateFromParty(buildTurnBasedFunnelActionableParty());

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: TURN_BASED_ATTACK_UP_APPLY_SKILL_ID },
    1: { characterId: 'M2', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE + 1 },
    2: { characterId: 'M3', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE + 2 },
  });
  state = commitTurn(state, preview).nextState;

  assert.deepEqual(getTurnBasedStatusRemainingByCharacterId(state, 'AttackUp'), {
    M1: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M2: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M3: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M4: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M5: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M6: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
  });
});

test('PlayerTurnEnd型Funnelは通常ターンからEXへ継続すると追加ターン対象だけ減る', () => {
  let state = createBattleStateFromParty(buildTurnBasedFunnelActionableParty());
  addTurnBasedFunnelToAllMembers(state);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: TURN_BASED_FUNNEL_GRANT_EXTRA_SKILL_ID },
  });
  state = commitTurn(state, preview).nextState;

  assert.equal(state.turnState.turnType, 'extra');
  assert.deepEqual(getTurnBasedFunnelRemainingByCharacterId(state), {
    M1: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M2: PLAYER_TURN_END_STATUS_START_REMAINING,
    M3: PLAYER_TURN_END_STATUS_START_REMAINING,
    M4: PLAYER_TURN_END_STATUS_START_REMAINING,
    M5: PLAYER_TURN_END_STATUS_START_REMAINING,
    M6: PLAYER_TURN_END_STATUS_START_REMAINING,
  });
});

test('PlayerTurnEnd型FunnelはEX終了後に通常ターンへ進むと全員が減る', () => {
  let state = createBattleStateFromParty(buildTurnBasedFunnelActionableParty());
  addTurnBasedFunnelToAllMembers(state);
  state = grantExtraTurn(state, ['M1', 'M2', 'M3']);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE },
  });
  state = commitTurn(state, preview).nextState;

  assert.deepEqual(getTurnBasedFunnelRemainingByCharacterId(state), {
    M1: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M2: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M3: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M4: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M5: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M6: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
  });
});

test('PlayerTurnEnd型FunnelはOD中に後衛も行動可能として減る', () => {
  let state = createBattleStateFromParty(buildTurnBasedFunnelActionableParty());
  addTurnBasedFunnelToAllMembers(state);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: TURN_BASED_FUNNEL_PROTECTION_SKILL_ID_BASE },
  });
  state = commitTurn(state, preview).nextState;

  assert.deepEqual(getTurnBasedFunnelRemainingByCharacterId(state), {
    M1: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M2: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M3: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M4: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M5: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
    M6: PLAYER_TURN_END_STATUS_AFTER_ONE_ACTIONABLE_TURN,
  });
});

test('EnemyTurnEnd status expiry ticks for all active members on base turn advance', () => {
  const party = createSixMemberManualParty((idx) =>
    idx <= 1
      ? {
          statusEffects: [
            {
              effectId: 9330 + idx,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'EnemyTurnEnd',
              remaining: 2,
              power: 0.2,
              metadata: { activeBuffStatus: true },
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000, targetEnemyIndex: 0 },
  });
  state = commitTurn(state, preview).nextState;

  const m1Effects = state.party.find((m) => m.characterId === 'M1').resolveEffectiveStatusEffects('AttackUp');
  const m2Effects = state.party.find((m) => m.characterId === 'M2').resolveEffectiveStatusEffects('AttackUp');
  assert.equal(m1Effects[0]?.remaining, 1, '行動メンバーのEnemyTurnEnd残り回数が1減る');
  assert.equal(m2Effects[0]?.remaining, 1, '非行動メンバーのEnemyTurnEnd残り回数も1減る');
});

test('Funnel: Only vs Count(上位2)で勝者を採用し、採用されたCount側のみを消費する', () => {
  const COUNT_A_ID = 9301;
  const COUNT_B_ID = 9302;
  const ONLY_ID = 9303;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.5,
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.4,
            },
            {
              effectId: ONLY_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 0.8,
            },
          ],
          skills: [
            {
              id: 25240,
              name: 'Funnel Test Slash',
              label: 'FunnelTestSlash25240',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25240, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');
  assert.equal(action.skillFunnelHitBonus, 0.9);

  const { committedRecord, nextState } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const remainingIds = new Set(actor.getFunnelEffects({ activeOnly: true }).map((effect) => Number(effect.effectId)));

  assert.deepEqual(
    (committed.consumedFunnelEffects ?? []).map((effect) => Number(effect.effectId)).sort((a, b) => a - b),
    [COUNT_A_ID, COUNT_B_ID]
  );
  assert.equal(remainingIds.has(ONLY_ID), true);
});

test('Funnel: OD増加0の与ダメージスキルでも採用Countを消費する', () => {
  const COUNT_ID = 9314;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.5,
            },
          ],
          skills: [
            {
              id: 25246,
              name: 'Funnel Zero OD Slash',
              label: 'FunnelZeroOdSlash25246',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.damageRatesByEnemy = {
    0: { Slash: 0 },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25246, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  const actor = nextState.party.find((member) => member.characterId === 'M1');

  assert.equal(committed.odGaugeGain, 0);
  assert.deepEqual(
    (committed.consumedFunnelEffects ?? []).map((effect) => Number(effect.effectId)),
    [COUNT_ID]
  );
  assert.equal(actor.getFunnelEffects({ activeOnly: true }).length, 0);
});

test('Funnel: 同一skill由来Onlyは残ターン違いでも最強1件だけ採用する', () => {
  const ONLY_LONG_ID = 9304;
  const ONLY_SHORT_ID = 9305;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: ONLY_SHORT_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'PlayerTurnEnd',
              remaining: 2,
              power: 3,
              sourceType: 'skill',
              sourceSkillId: 46004121,
            },
            {
              effectId: ONLY_LONG_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'PlayerTurnEnd',
              remaining: 3,
              power: 3,
              sourceType: 'skill',
              sourceSkillId: 46004121,
            },
          ],
          skills: [
            {
              id: 25243,
              name: 'Funnel Only Slash',
              label: 'FunnelOnlySlash25243',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25243, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');

  assert.equal(action.skillFunnelHitBonus, 3);
  const { committedRecord } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  assert.deepEqual(
    committed.damageContext.funnelEffects.map((effect) => Number(effect.effectId)),
    [ONLY_LONG_ID]
  );
});

test('Funnel: skill由来Onlyとpassive由来Onlyは別枠で共存する', () => {
  const SKILL_ONLY_ID = 9306;
  const PASSIVE_ONLY_ID = 9307;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: SKILL_ONLY_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'PlayerTurnEnd',
              remaining: 2,
              power: 3,
              sourceType: 'skill',
            },
            {
              effectId: PASSIVE_ONLY_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'Eternal',
              remaining: 0,
              power: 2,
              sourceType: 'passive',
            },
          ],
          skills: [
            {
              id: 25244,
              name: 'Funnel Skill Passive Slash',
              label: 'FunnelSkillPassiveSlash25244',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25244, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');

  assert.equal(action.skillFunnelHitBonus, 5);
  const { committedRecord } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  assert.deepEqual(
    committed.damageContext.funnelEffects.map((effect) => Number(effect.effectId)).sort((a, b) => a - b),
    [SKILL_ONLY_ID, PASSIVE_ONLY_ID]
  );
});

test('Funnel: Only勝ちの場合はCount候補を消費しない', () => {
  const COUNT_A_ID = 9308;
  const COUNT_B_ID = 9309;
  const ONLY_ID = 9310;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.4,
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.3,
            },
            {
              effectId: ONLY_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'PlayerTurnEnd',
              remaining: 2,
              power: 0.8,
            },
          ],
          skills: [
            {
              id: 25245,
              name: 'Funnel Only Wins Slash',
              label: 'FunnelOnlyWinsSlash25245',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25245, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');
  assert.equal(action.skillFunnelHitBonus, 0.8);

  const { committedRecord, nextState } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const remainingIds = new Set(actor.getFunnelEffects({ activeOnly: true }).map((effect) => Number(effect.effectId)));

  assert.deepEqual(committed.consumedFunnelEffects ?? [], []);
  assert.equal(remainingIds.has(COUNT_A_ID), true);
  assert.equal(remainingIds.has(COUNT_B_ID), true);
});

test('MindEye: Only vs Count(上位2)で勝者を採用し、採用されたCount側のみを消費する', () => {
  const COUNT_A_ID = 9311;
  const COUNT_B_ID = 9312;
  const ONLY_ID = 9313;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'MindEye',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.6,
              metadata: { singleTrigger: true },
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'MindEye',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.5,
              metadata: { singleTrigger: true },
            },
            {
              effectId: ONLY_ID,
              statusType: 'MindEye',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 1.0,
              metadata: { singleTrigger: true },
            },
          ],
          skills: [
            {
              id: 25241,
              name: 'MindEye Test Slash',
              label: 'MindEyeTestSlash25241',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25241, targetEnemyIndex: 0 },
  });

  const { committedRecord, nextState } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const remainingIds = new Set(actor.getMindEyeEffects({ activeOnly: true }).map((effect) => Number(effect.effectId)));

  assert.deepEqual(
    (committed.consumedMindEyeEffects ?? []).map((effect) => Number(effect.effectId)).sort((a, b) => a - b),
    [COUNT_A_ID, COUNT_B_ID]
  );
  assert.equal(remainingIds.has(ONLY_ID), true);
});

test('Funnel: 非ダメージスキルではCount候補は消費されない', () => {
  const COUNT_A_ID = 9321;
  const COUNT_B_ID = 9322;
  const ONLY_ID = 9323;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.6,
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.5,
            },
            {
              effectId: ONLY_ID,
              statusType: 'Funnel',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 0.7,
            },
          ],
          skills: [
            {
              id: 25242,
              name: 'Funnel NonDamage Test',
              label: 'FunnelNonDamage25242',
              sp_cost: 0,
              target_type: 'Self',
              parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25242 },
  });
  const { nextState } = commitTurn(state, preview);
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const remainingIds = new Set(actor.getFunnelEffects({ activeOnly: true }).map((effect) => Number(effect.effectId)));

  assert.equal(remainingIds.has(COUNT_A_ID), true);
  assert.equal(remainingIds.has(COUNT_B_ID), true);
  assert.equal(remainingIds.has(ONLY_ID), true);
});

test('Funnel: strict metadata validation有効時は不正metadataのCount候補を消費しない', () => {
  const INVALID_FUNNEL_ID = 9341;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: INVALID_FUNNEL_ID,
              statusType: 'Funnel',
              limitType: 'Invalid',
              exitCond: 'Count',
              remaining: 1,
              power: 1,
            },
          ],
          skills: [
            {
              id: 25244,
              name: 'Funnel Strict Validation Test',
              label: 'FunnelStrictValidation25244',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const warnings = [];

  const preview = previewTurn(
    state,
    {
      0: { characterId: 'M1', skillId: 25244, targetEnemyIndex: 0 },
    },
    null,
    1,
    {
      validateBuffMetadata: {
        enabled: true,
        mode: 'strict',
        onWarning: (message) => warnings.push(String(message)),
      },
    }
  );
  const { nextState } = commitTurn(state, preview, [], {
    validateBuffMetadata: {
      enabled: true,
      mode: 'strict',
      onWarning: (message) => warnings.push(String(message)),
    },
  });

  const actor = nextState.party.find((member) => member.characterId === 'M1');
  assert.equal(actor.resolveEffectiveFunnelEffects().length, 1);
  assert.ok(warnings.length >= 1);
});

test('MindEye: 追撃ラベルスキルではCount候補は消費されない', () => {
  const COUNT_A_ID = 9331;
  const COUNT_B_ID = 9332;
  const ONLY_ID = 9333;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'MindEye',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.6,
              metadata: { singleTrigger: true },
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'MindEye',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.5,
              metadata: { singleTrigger: true },
            },
            {
              effectId: ONLY_ID,
              statusType: 'MindEye',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 0.7,
              metadata: { singleTrigger: true },
            },
          ],
          skills: [
            {
              id: 25243,
              name: 'PursuitLike',
              label: 'M1Skill91',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25243, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const remainingIds = new Set(actor.getMindEyeEffects({ activeOnly: true }).map((effect) => Number(effect.effectId)));

  assert.equal(remainingIds.has(COUNT_A_ID), true);
  assert.equal(remainingIds.has(COUNT_B_ID), true);
  assert.equal(remainingIds.has(ONLY_ID), true);
});

test('AttackUpIncludeNormal active buff status applies to normal attack preview and is consumed on use', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 25100,
              name: 'Command Buff',
              label: 'CommandBuff',
              sp_cost: 0,
              effect: 'NormalBuff_Up',
              parts: [
                {
                  skill_type: 'AttackUpIncludeNormal',
                  target_type: 'AllySingle',
                  power: [0.4, 0],
                  effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : idx === 1
        ? {
            skills: [
              {
                id: 25101,
                name: '通常攻撃',
                label: 'M2AttackNormal',
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
              },
            ],
          }
        : {}
  );
  const state = createBattleStateFromParty(party);

  const firstPreview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25100, targetCharacterId: 'M2' },
  });
  const firstCommit = commitTurn(state, firstPreview);
  const target = firstCommit.nextState.party.find((member) => member.characterId === 'M2');
  const storedStatuses = target.resolveEffectiveStatusEffects('AttackUp');

  assert.equal(storedStatuses.length, 1);
  assert.equal(storedStatuses[0].metadata.effectName, 'NormalBuff_Up');
  assert.equal(storedStatuses[0].metadata.includeNormalAttack, true);
  assert.equal(storedStatuses[0].remaining, 1);

  const nextPreview = previewTurn(firstCommit.nextState, {
    1: { characterId: 'M2', skillId: 25101, targetEnemyIndex: 0 },
  });
  const nextAction = findActionByCharacterId(nextPreview, 'M2');

  assert.equal(nextAction.activeStatusEffectModifiers.attackUpRate, 0.4);
  assert.equal(nextAction.specialPassiveModifiers.attackUpRate, 0.4);
  assert.equal(nextAction.activeStatusEffects.length, 1);
  assert.equal(nextAction.activeStatusEffects[0].effectName, 'NormalBuff_Up');

  const secondCommit = commitTurn(firstCommit.nextState, nextPreview);
  const acted = secondCommit.nextState.party.find((member) => member.characterId === 'M2');
  const committedAction = findActionByCharacterId(secondCommit.committedRecord, 'M2');

  assert.equal(acted.resolveEffectiveStatusEffects('AttackUp').length, 0);
  assert.equal(committedAction.damageContext.attackUpRate, 0.4);
});

test('active buff監査: 通常AttackUpは通常攻撃/非ダメージで消費されず、与ダメージで消費される', () => {
  const STATUS_ID = 25190;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: STATUS_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 0.4,
              metadata: { activeBuffStatus: true },
            },
          ],
          skills: [
            {
              id: 25191,
              name: '通常攻撃',
              label: 'M1AttackNormal',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
            },
            {
              id: 25192,
              name: 'Protection',
              label: 'M1Protection',
              sp_cost: 0,
              target_type: 'Self',
              parts: [{ skill_type: 'Protection', target_type: 'Self' }],
            },
            {
              id: 25193,
              name: 'DamageSkill',
              label: 'M1DamageSkill',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );

  let state = createBattleStateFromParty(party);
  const actorFromInitial = state.party.find((member) => member.characterId === 'M1');
  assert.equal(actorFromInitial.resolveEffectiveStatusEffects('AttackUp').length, 1);

  let preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25191, targetEnemyIndex: 0 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(
    state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects('AttackUp').length,
    1,
    '通常攻撃では通常AttackUpは消費されない'
  );

  preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25192 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(
    state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects('AttackUp').length,
    1,
    '非ダメージスキルでは通常AttackUpは消費されない'
  );

  preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25193, targetEnemyIndex: 0 },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(
    state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects('AttackUp').length,
    0,
    '与ダメージスキルで通常AttackUpが消費される'
  );
});

test('active buff全種監査: 通常攻撃/非ダメージでは Count バフが消費されない', () => {
  const statusTypes = ['AttackUp', 'DefenseUp', 'CriticalRateUp', 'CriticalDamageUp'];

  for (const [idx, statusType] of statusTypes.entries()) {
    const baseId = 25200 + idx * 10;
    const party = createSixMemberManualParty((memberIdx) =>
      memberIdx === 0
        ? {
            statusEffects: [
              {
                effectId: baseId,
                statusType,
                limitType: 'Default',
                exitCond: 'Count',
                remaining: 1,
                power: 0.3,
                metadata: { activeBuffStatus: true },
              },
            ],
            skills: [
              {
                id: baseId + 1,
                name: '通常攻撃',
                label: `M1${statusType}AttackNormal`,
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
              },
              {
                id: baseId + 2,
                name: 'Protection',
                label: `M1${statusType}Protection`,
                sp_cost: 0,
                target_type: 'Self',
                parts: [{ skill_type: 'Protection', target_type: 'Self' }],
              },
            ],
          }
        : {}
    );

    let state = createBattleStateFromParty(party);
    const countBefore =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countBefore, 1, `${statusType}: 初期状態で1件`);

    let preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: baseId + 1, targetEnemyIndex: 0 },
    });
    state = commitTurn(state, preview).nextState;
    const countAfterNormal =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countAfterNormal, 1, `${statusType}: 通常攻撃では消費されない`);

    preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: baseId + 2 },
    });
    state = commitTurn(state, preview).nextState;
    const countAfterNonDamage =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countAfterNonDamage, 1, `${statusType}: 非ダメージスキルでは消費されない`);
  }
});

test('Funnel/MindEye: 通常攻撃では消費されず、与ダメージスキルで消費される', () => {
  const statusTypes = ['Funnel', 'MindEye'];

  for (const [idx, statusType] of statusTypes.entries()) {
    const baseId = 25240 + idx * 10;
    const party = createSixMemberManualParty((memberIdx) =>
      memberIdx === 0
        ? {
            statusEffects: [
              {
                effectId: baseId,
                statusType,
                limitType: 'Default',
                exitCond: 'Count',
                remaining: 1,
                power: 1,
                metadata: { activeBuffStatus: true },
              },
            ],
            skills: [
              {
                id: baseId + 1,
                name: '通常攻撃',
                label: `M1${statusType}AttackNormal`,
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
              },
              {
                id: baseId + 2,
                name: 'Protection',
                label: `M1${statusType}Protection`,
                sp_cost: 0,
                target_type: 'Self',
                parts: [{ skill_type: 'Protection', target_type: 'Self' }],
              },
              {
                id: baseId + 3,
                name: 'DamageSkill',
                label: `M1${statusType}DamageSkill`,
                sp_cost: 0,
                hit_count: 1,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              },
            ],
          }
        : {}
    );

    let state = createBattleStateFromParty(party);
    const countBefore =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countBefore, 1, `${statusType}: 初期状態で1件`);

    let preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: baseId + 1, targetEnemyIndex: 0 },
    });
    state = commitTurn(state, preview).nextState;
    const countAfterNormal =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countAfterNormal, 1, `${statusType}: 通常攻撃では消費されない`);

    preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: baseId + 2 },
    });
    state = commitTurn(state, preview).nextState;
    const countAfterNonDamage =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countAfterNonDamage, 1, `${statusType}: 非ダメージスキルでは消費されない`);

    preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: baseId + 3, targetEnemyIndex: 0 },
    });
    state = commitTurn(state, preview).nextState;
    const countAfterDamage =
      state.party.find((member) => member.characterId === 'M1').resolveEffectiveStatusEffects(statusType).length;
    assert.equal(countAfterDamage, 0, `${statusType}: 与ダメージスキルで消費される`);
  }
});

test('elemental active AttackUp status applies only to matching element skills', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 25110,
              name: 'Element Buff',
              label: 'ElementBuff',
              sp_cost: 0,
              effect: 'IceBuff_Up',
              parts: [
                {
                  skill_type: 'AttackUp',
                  target_type: 'AllySingle',
                  elements: ['Ice'],
                  power: [0.5, 0],
                  effect: { limitType: 'Only', exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
        }
      : idx === 1
        ? {
            skills: [
              {
                id: 25111,
                name: 'Ice Slash',
                label: 'IceSlash',
                sp_cost: 0,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Ice'] }],
              },
              {
                id: 25112,
                name: 'Fire Slash',
                label: 'FireSlash',
                sp_cost: 0,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }],
              },
            ],
          }
        : {}
  );
  const state = createBattleStateFromParty(party);

  const firstCommit = commitTurn(
    state,
    previewTurn(state, {
      0: { characterId: 'M1', skillId: 25110, targetCharacterId: 'M2' },
    })
  );
  const target = firstCommit.nextState.party.find((member) => member.characterId === 'M2');
  const stored = target.resolveEffectiveStatusEffects('AttackUp');

  assert.equal(stored.length, 1);
  assert.equal(stored[0].metadata.effectName, 'IceBuff_Up');
  assert.deepEqual(stored[0].elements, ['Ice']);
  assert.equal(stored[0].limitType, 'Only');

  const icePreview = previewTurn(firstCommit.nextState, {
    1: { characterId: 'M2', skillId: 25111, targetEnemyIndex: 0 },
  });
  const firePreview = previewTurn(firstCommit.nextState, {
    1: { characterId: 'M2', skillId: 25112, targetEnemyIndex: 0 },
  });

  assert.equal(findActionByCharacterId(icePreview, 'M2').specialPassiveModifiers.attackUpRate, 0.5);
  assert.deepEqual(findActionByCharacterId(icePreview, 'M2').activeStatusEffects[0].elements, ['Ice']);
  assert.equal(findActionByCharacterId(firePreview, 'M2').specialPassiveModifiers.attackUpRate, 0);
  assert.deepEqual(findActionByCharacterId(firePreview, 'M2').activeStatusEffects, []);
});

test('active AttackUp: Count(2枠)合算がOnlyを上回る場合はCount側を採用し、採用Countのみ2消費する', () => {
  const COUNT_TOP_A_ID = 9201;
  const COUNT_TOP_B_ID = 9202;
  const COUNT_UNUSED_ID = 9203;
  const ONLY_ID = 9204;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_TOP_A_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.5,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: COUNT_TOP_B_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.4,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: COUNT_UNUSED_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.3,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: ONLY_ID,
              statusType: 'AttackUp',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 0.8,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
          ],
          skills: [
            {
              id: 25220,
              name: 'Fire Strike',
              label: 'FireStrike25220',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25220, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');

  assert.equal(action.specialPassiveModifiers.attackUpRate, 0.9);
  assert.deepEqual(
    [...(action.specialPassiveModifiers.consumedCountEffectIds ?? [])].sort((a, b) => a - b),
    [COUNT_TOP_A_ID, COUNT_TOP_B_ID]
  );

  const { nextState } = commitTurn(state, preview);
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const byId = new Map(actor.resolveEffectiveStatusEffects('AttackUp').map((effect) => [Number(effect.effectId), effect]));

  assert.equal(byId.get(COUNT_TOP_A_ID), undefined);
  assert.equal(byId.get(COUNT_TOP_B_ID), undefined);
  assert.equal(byId.get(COUNT_UNUSED_ID)?.remaining, 2);
  assert.equal(byId.get(ONLY_ID)?.remaining, 1);
});

test('active AttackUp: 無属性Countは属性一致扱いで採用対象になり、2消費される', () => {
  const NO_ELEMENT_COUNT_ID = 9211;
  const FIRE_COUNT_ID = 9212;
  const ONLY_ID = 9213;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: NO_ELEMENT_COUNT_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.4,
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: FIRE_COUNT_ID,
              statusType: 'AttackUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.3,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: ONLY_ID,
              statusType: 'AttackUp',
              limitType: 'Only',
              exitCond: 'Count',
              remaining: 1,
              power: 0.6,
              elements: ['Fire'],
              metadata: { activeBuffStatus: true },
            },
          ],
          skills: [
            {
              id: 25230,
              name: 'Fire Slash',
              label: 'FireSlash25230',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25230, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');

  assert.equal(action.specialPassiveModifiers.attackUpRate, 0.7);
  assert.deepEqual(
    [...(action.specialPassiveModifiers.consumedCountEffectIds ?? [])].sort((a, b) => a - b),
    [NO_ELEMENT_COUNT_ID, FIRE_COUNT_ID]
  );

  const { nextState } = commitTurn(state, preview);
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const byId = new Map(actor.resolveEffectiveStatusEffects('AttackUp').map((effect) => [Number(effect.effectId), effect]));

  assert.equal(byId.get(NO_ELEMENT_COUNT_ID), undefined);
  assert.equal(byId.get(FIRE_COUNT_ID), undefined);
  assert.equal(byId.get(ONLY_ID)?.remaining, 1);
});

test('active DefenseUp: Count(2枠)合算がOnlyを上回る場合はCount側を採用し、採用Countのみ2消費する', () => {
  const COUNT_A_ID = 9311;
  const COUNT_B_ID = 9312;
  const ONLY_ID = 9313;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          statusEffects: [
            {
              effectId: COUNT_A_ID,
              statusType: 'DefenseUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.3,
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: COUNT_B_ID,
              statusType: 'DefenseUp',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 2,
              power: 0.25,
              metadata: { activeBuffStatus: true },
            },
            {
              effectId: ONLY_ID,
              statusType: 'DefenseUp',
              limitType: 'Only',
              exitCond: 'PlayerTurnEnd',
              remaining: 2,
              power: 0.5,
              metadata: { activeBuffStatus: true },
            },
          ],
          skills: [
            {
              id: 25310,
              name: 'DefenseUp Damage Action',
              label: 'DefenseUpDamage25310',
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', hit_count: 1 }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 25310, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');

  assert.equal(action.specialPassiveModifiers.defenseUpRate, 0.55);
  assert.deepEqual(
    [...(action.specialPassiveModifiers.consumedCountEffectIds ?? [])].sort((a, b) => a - b),
    [COUNT_A_ID, COUNT_B_ID]
  );

  const { nextState } = commitTurn(state, preview);
  const actor = nextState.party.find((member) => member.characterId === 'M1');
  const byId = new Map(actor.resolveEffectiveStatusEffects('DefenseUp').map((effect) => [Number(effect.effectId), effect]));

  assert.equal(byId.get(COUNT_A_ID), undefined);
  assert.equal(byId.get(COUNT_B_ID), undefined);
  assert.equal(byId.get(ONLY_ID)?.remaining, 1);
});

test('applyInitialPassiveState applies battle-start and turn-start SP passives', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `IP${idx + 1}`,
      characterName: `IP${idx + 1}`,
      styleId: idx + 1,
      styleName: `IPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 1,
                name: '閃光',
                desc: 'ターン開始時に前衛にいると自身のSP+1',
                timing: 'OnEveryTurn',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : idx === 1
            ? [
                {
                  id: 2,
                  name: '機敏',
                  desc: 'バトル開始時 前衛にいると自身のSP+2',
                  timing: 'OnBattleStart',
                  condition: 'IsFront()',
                  parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                },
              ]
            : idx === 2
              ? [
                  {
                    id: 3,
                    name: '号令',
                    desc: 'プレイヤーターン開始時 前衛にいると自身のSP+1',
                    timing: 'OnPlayerTurnStart',
                    condition: 'IsFront()',
                    parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                  },
                ]
              : idx === 3
                ? [
                    {
                      id: 4,
                      name: '閃光',
                      desc: 'ターン開始時に前衛にいると自身のSP+1',
                      timing: 'OnEveryTurn',
                      condition: 'IsFront()',
                      parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
                    },
                  ]
                : idx === 4
                  ? [
                      {
                        id: 5,
                        name: '先陣',
                        desc: '初回バトル開始時 自身のSP+2',
                        timing: 'OnFirstBattleStart',
                        condition: '',
                        parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
                      },
                    ]
                  : [],
      skills: [{ id: 26000 + idx, name: 'Wait', label: `IPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  applyInitialPassiveState(state);

  assert.equal(state.party.find((m) => m.characterId === 'IP1').sp.current, 4);
  assert.equal(state.party.find((m) => m.characterId === 'IP2').sp.current, 5);
  assert.equal(state.party.find((m) => m.characterId === 'IP3').sp.current, 4);
  assert.equal(state.party.find((m) => m.characterId === 'IP4').sp.current, 3);
  assert.equal(state.party.find((m) => m.characterId === 'IP5').sp.current, 5);
  assert.equal(state.turnState.passiveEventsLastApplied.length, 4);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.timing === 'OnPlayerTurnStart'), true);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.timing === 'OnFirstBattleStart'), true);
});

test('applyInitialPassiveState applies OnBattleStart Zone passive into zone state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 91001,
              name: '灼熱の陣',
              timing: 'OnBattleStart',
              condition: 'IsFront()',
              parts: [
                {
                  skill_type: 'Zone',
                  target_type: 'Field',
                  elements: ['Fire'],
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.deepEqual(state.turnState.zoneState, {
    type: 'Fire',
    sourceSide: 'player',
    remainingTurns: null,
  });
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === '灼熱の陣'), true);
});

test('applyInitialPassiveState keeps battle-start and turn-start passives distinct in the initial state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 9901,
              name: 'BattleStart Heal',
              timing: 'OnBattleStart',
              condition: '',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
            {
              id: 9902,
              name: 'TurnStart Heal',
              timing: 'OnEveryTurn',
              condition: '',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
            {
              id: 9903,
              name: 'TurnStart Buff',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  applyInitialPassiveState(state);

  assert.equal(state.party[0].sp.current, 13);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === 'BattleStart Heal'), true);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === 'TurnStart Heal'), true);
  assert.equal(state.turnState.passiveEventsLastApplied.some((event) => event.passiveName === 'TurnStart Buff'), true);
  const turnStartResult = applyPassiveTiming(state, ['OnEveryTurn', 'OnPlayerTurnStart']);
  assert.equal(state.party[0].sp.current, 14);
  assert.equal(turnStartResult.passiveEvents.some((event) => event.passiveName === 'TurnStart Heal'), true);
  assert.equal(turnStartResult.passiveEvents.some((event) => event.passiveName === 'TurnStart Buff'), true);
  assert.equal(
    turnStartResult.passiveEvents.filter((event) => event.passiveName === 'TurnStart Heal').length,
    1
  );
});

test('turn recovery applies 閃光 on every turn while frontline', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `FS${idx + 1}`,
      characterName: `FS${idx + 1}`,
      styleId: idx + 1,
      styleName: `FSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 10,
                name: '閃光',
                desc: 'ターン開始時に前衛にいると自身のSP+1',
                timing: 'OnEveryTurn',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [{ id: 26100 + idx, name: 'Wait', label: `FSSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  applyInitialPassiveState(state);
  assert.equal(state.party.find((m) => m.characterId === 'FS1').sp.current, 4);

  const preview = previewTurn(state, {
    0: { characterId: 'FS1', skillId: 26100 },
    1: { characterId: 'FS2', skillId: 26101 },
    2: { characterId: 'FS3', skillId: 26102 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party.find((m) => m.characterId === 'FS1').sp.current, 7);
  assert.equal(nextState.party.find((m) => m.characterId === 'FS2').sp.current, 5);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '閃光'), true);
  assert.equal(
    nextState.turnState.passiveEventsLastApplied.filter((event) => event.passiveName === '閃光').length,
    1
  );
});

test('applyPassiveTiming applies OnPlayerTurnStart through exported timing API', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `PT${idx + 1}`,
      characterName: `PT${idx + 1}`,
      styleId: idx + 1,
      styleName: `PTS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 11,
                name: '号令',
                desc: 'プレイヤーターン開始時 前衛にいると自身のSP+1',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : [],
      skills: [{ id: 27000 + idx, name: 'Wait', label: `PTSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart', {});

  assert.equal(state.party.find((m) => m.characterId === 'PT1').sp.current, 4);
  assert.equal(result.spEvents.length, 1);
  assert.equal(result.passiveEvents.length, 1);
  assert.equal(result.passiveEvents[0].timing, 'OnPlayerTurnStart');
});

test('grantExtraTurn applies OnAdditionalTurnStart SP passives when extra turn begins', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `AT${idx + 1}`,
      characterName: `AT${idx + 1}`,
      styleId: idx + 1,
      styleName: `ATS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 21,
                name: 'アフターサービス',
                desc: '追加ターン開始時 自身のSP+1',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : idx === 1
            ? [
                {
                  id: 22,
                  name: '戦場の華',
                  desc: '追加ターン開始時 自分以外の味方のSP+2',
                  timing: 'OnAdditionalTurnStart',
                  condition: '',
                  parts: [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [2, 0] }],
                },
              ]
            : [],
      skills: [{ id: 28000 + idx, name: 'Wait', label: `ATSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));

  state = grantExtraTurn(state, ['AT1', 'AT2']);

  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(state.party.find((m) => m.characterId === 'AT1').sp.current, 6);
  assert.equal(state.party.find((m) => m.characterId === 'AT2').sp.current, 3);
  assert.equal(state.party.find((m) => m.characterId === 'AT3').sp.current, 5);
  assert.equal(state.turnState.passiveEventsLastApplied.length, 2);
  // partyIndex=1 が行動順先頭のため '戦場の華'(partyIndex=1) → 'アフターサービス'(partyIndex=0) の順
  assert.deepEqual(
    state.turnState.passiveEventsLastApplied.map((event) => event.passiveName),
    ['戦場の華', 'アフターサービス']
  );
});

test('grantExtraTurn skips OnAdditionalTurnStart passives for non-isExtraActive members', () => {
  // Regression: サプライズギフト等の OnAdditionalTurnStart パッシブが、
  // extraTurn の対象外メンバーに対しても発火していた不具合の検証
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EX${idx + 1}`,
      characterName: `EX${idx + 1}`,
      styleId: idx + 1,
      styleName: `EXS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 31,
                name: 'アフターサービス',
                desc: '追加ターン開始時 自身のSP+1',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
              },
            ]
          : idx === 1
            ? [
                {
                  id: 32,
                  name: 'サプライズギフト',
                  desc: '自身が追加ターン開始時 自身以外の味方のSP+2',
                  timing: 'OnAdditionalTurnStart',
                  condition: '',
                  parts: [{ skill_type: 'HealSp', target_type: 'AllyAllWithoutSelf', power: [2, 0] }],
                },
              ]
            : [],
      skills: [{ id: 31000 + idx, name: 'Wait', label: `EXSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));

  // EX1 のみ extraActive、EX2 は対象外
  state = grantExtraTurn(state, ['EX1']);

  assert.equal(state.turnState.turnType, 'extra');
  // EX1: 3 + 1 (self passive) = 4  ※ EX2 の +2 は発火しない
  assert.equal(state.party.find((m) => m.characterId === 'EX1').sp.current, 4);
  // EX2: 変化なし (自身の passive は AllyAllWithoutSelf で自分には効かない & そもそも発火しない)
  assert.equal(state.party.find((m) => m.characterId === 'EX2').sp.current, 3);
  // EX3: 変化なし (EX2 の passive が発火しないため +2 されない)
  assert.equal(state.party.find((m) => m.characterId === 'EX3').sp.current, 3);
  // パッシブイベントは 1 件のみ (アフターサービス)
  assert.equal(state.turnState.passiveEventsLastApplied.length, 1);
  assert.deepEqual(
    state.turnState.passiveEventsLastApplied.map((event) => event.passiveName),
    ['アフターサービス']
  );
});

test('commitTurn records OnEnemyTurnStart passive events when base turn advances', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EN${idx + 1}`,
      characterName: `EN${idx + 1}`,
      styleId: idx + 1,
      styleName: `ENS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      passives:
        idx === 0
          ? [
              {
                id: 41,
                name: '銀氷の加護',
                desc: '敵行動開始時 氷属性弱点の敵の攻撃ステータスを50下げる',
                timing: 'OnEnemyTurnStart',
                condition: '',
                parts: [
                  {
                    skill_type: 'BorderRefPDownByAdmiral',
                    target_type: 'All',
                    target_condition: 'IsWeakElement(Ice)==1',
                    power: [0, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28100 + idx, name: 'Wait', label: `ENSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    damageRatesByEnemy: [{ Ice: 150 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EN1', skillId: 28100 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnIndex, 2);
  // BorderRefPDownByAdmiral is a silent-skip (action-time Admiral mechanic); no passive event logged.
  assert.equal(committedRecord.passiveEvents.length, 0);
});

test('OnEveryTurnIncludeSpecial ReduceSp lowers self skill cost at action selection time', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RS${idx + 1}`,
      characterName: `RS${idx + 1}`,
      styleId: idx + 1,
      styleName: `RSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 51,
                name: 'ポジショニング',
                desc: 'ダウンターン中の敵がいるとき 自身の消費SPが-2',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'CountBC(IsDead()==0 && IsPlayer()==0&&BreakDownTurn()>0)>0',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 28200 + idx, name: 'Act', label: `RSSkill${idx + 1}`, sp_cost: idx === 0 ? 8 : 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'RS1', skillId: 28200 },
  });

  assert.equal(preview.actions[0].spCost, 6);
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 14);

  const { committedRecord } = commitTurn(state, preview);
  const actionSelectionEvent = committedRecord.passiveEvents.find(
    (event) => event.source === 'action_selection' && event.passiveName === 'ポジショニング'
  );
  assert.ok(actionSelectionEvent);
  assert.equal(actionSelectionEvent.timing, 'OnEveryTurnIncludeSpecial');
  assert.equal(actionSelectionEvent.reduceSp, 2);
  assert.equal(actionSelectionEvent.targetCharacterId, 'RS1');
});

test('OnEveryTurnIncludeSpecial ReduceSp can target matching allies at action selection time', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RA${idx + 1}`,
      characterName: `RA${idx + 1}`,
      styleId: idx + 1,
      styleName: `RAS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 52,
                name: '勇姿',
                desc: 'ターン開始時 チャージ状態の味方の消費SP-1',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'CountBC(IsPlayer() && SpecialStatusCountByType(20) > 0)>0',
                parts: [
                  {
                    skill_type: 'ReduceSp',
                    target_type: 'AllyAll',
                    target_condition: 'SpecialStatusCountByType(20)>0',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28300 + idx, name: 'Act', label: `RASkill${idx + 1}`, sp_cost: idx === 1 ? 5 : 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state = grantExtraTurn(state, ['RA2']);

  const preview = previewTurn(state, {
    1: { characterId: 'RA2', skillId: 28301 },
  });

  assert.equal(preview.actions[0].spCost, 4);
  assert.equal(preview.actions[0].startSP, 20);
  assert.equal(preview.actions[0].endSP, 16);

  const { committedRecord } = commitTurn(state, preview);
  const actionSelectionEvent = committedRecord.passiveEvents.find(
    (event) => event.source === 'action_selection' && event.passiveName === '勇姿'
  );
  assert.ok(actionSelectionEvent);
  assert.equal(actionSelectionEvent.timing, 'OnEveryTurnIncludeSpecial');
  assert.equal(actionSelectionEvent.reduceSp, 1);
  assert.equal(actionSelectionEvent.targetCharacterId, 'RA2');
});

test('OnEveryTurnIncludeSpecial AttackUp is exposed on preview action modifiers', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `AP${idx + 1}`,
      characterName: `AP${idx + 1}`,
      styleId: idx + 1,
      styleName: `APS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      initialEP: idx === 0 ? 10 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 53,
                name: 'トルクマキシマム',
                desc: '行動選択時 自身のEPが10以上のとき 自身のスキル攻撃力+50%',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'Ep()>=10',
                parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.5, 0] }],
              },
            ]
          : [],
      skills: [{ id: 28400 + idx, name: 'Act', label: `APSkill${idx + 1}`, sp_cost: idx === 0 ? 4 : 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const preview = previewTurn(state, {
    0: { characterId: 'AP1', skillId: 28400 },
  });

  assert.equal(preview.actions[0].specialPassiveModifiers?.attackUpRate, 0.5);
  assert.equal(preview.actions[0].specialPassiveEvents?.length, 1);
  assert.equal(preview.actions[0].specialPassiveEvents?.[0]?.passiveName, 'トルクマキシマム');

  const { committedRecord } = commitTurn(state, preview);
  const actionSelectionEvent = committedRecord.passiveEvents.find(
    (event) => event.source === 'action_selection' && event.passiveName === 'トルクマキシマム'
  );
  assert.ok(actionSelectionEvent);
  assert.equal(actionSelectionEvent.timing, 'OnEveryTurnIncludeSpecial');
  assert.equal(actionSelectionEvent.attackUpRate, 0.5);
  assert.equal(actionSelectionEvent.targetCharacterId, 'AP1');
});

test('OnEveryTurnIncludeSpecial passive is not recorded when action-selection condition is unmet', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RN${idx + 1}`,
      characterName: `RN${idx + 1}`,
      styleId: idx + 1,
      styleName: `RNS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 54,
                name: 'ポジショニング',
                desc: 'ダウンターン中の敵がいるとき 自身の消費SPが-2',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: 'CountBC(IsDead()==0 && IsPlayer()==0&&BreakDownTurn()>0)>0',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 28500 + idx, name: 'Act', label: `RNSkill${idx + 1}`, sp_cost: idx === 0 ? 8 : 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'RN1', skillId: 28500 },
  });

  assert.equal(preview.actions[0].spCost, 8);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(
    committedRecord.passiveEvents.some(
      (event) => event.source === 'action_selection' && event.timing === 'OnEveryTurnIncludeSpecial'
    ),
    false
  );
});

test('commitTurn applies OnBattleWin passives when all enemies are dead', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BW${idx + 1}`,
      characterName: `BW${idx + 1}`,
      styleId: idx + 1,
      styleName: `BWS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      elements: idx === 0 ? ['Fire'] : [],
      passives:
        idx === 0
          ? [
              {
                id: 61,
                name: '実の父よりもシチーは飽きることがない',
                desc: 'バトル勝利時 味方全体の火属性スタイルのSP+3',
                timing: 'OnBattleWin',
                condition: '',
                parts: [
                  {
                    skill_type: 'HealSp',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Fire)',
                    power: [3, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28500 + idx, name: 'Act', label: `BWSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'Dead', targetIndex: 0, remainingTurns: 0 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'BW1', skillId: 28500 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party.find((m) => m.characterId === 'BW1').sp.current, 8);
  assert.equal(committedRecord.passiveEvents.some((event) => event.timing === 'OnBattleWin'), true);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '実の父よりもシチーは飽きることがない'), true);
});

test('commitTurn applies OnBattleWin HealDpRate passive to matching allies', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BDP${idx + 1}`,
      characterName: `BDP${idx + 1}`,
      styleId: idx + 1,
      styleName: `BDPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 3,
      baseMaxDp: 70,
      currentDp: idx < 2 ? 0 : 35,
      elements: idx < 2 ? ['Fire'] : ['Ice'],
      passives:
        idx === 0
          ? [
              {
                id: 62,
                name: '愛情の料理',
                desc: 'バトル勝利時 味方全体の火属性スタイルのDP+100%',
                timing: 'OnBattleWin',
                condition: '',
                parts: [
                  {
                    skill_type: 'HealDpRate',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Fire)',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 28600 + idx, name: 'Act', label: `BDPSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  let state = createBattleStateFromParty(new Party(members));
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'Dead', targetIndex: 0, remainingTurns: 0 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'BDP1', skillId: 28600 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party[0].dpState.currentDp, 70);
  assert.equal(nextState.party[1].dpState.currentDp, 70);
  assert.equal(nextState.party[2].dpState.currentDp, 35);
  assert.equal(committedRecord.passiveEvents.some((event) => event.passiveName === '愛情の料理'), true);
  assert.equal(
    committedRecord.dpEvents.some(
      (event) => event.source === 'dp_passive' && event.passiveName === '愛情の料理' && event.delta === 70
    ),
    true
  );
});

// C群: IceMarkLevel パッシブテスト
test('IceMarkLevel condition can trigger passives from current ice mark state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Ice: { current: 6, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18700,
              name: 'Ice Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'IceMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 1);
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 3);
});

test('IceMarkLevel condition does not trigger when ice mark is below threshold', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          markStates: {
            Ice: { current: 5, min: 0, max: 6 },
          },
          passives: [
            {
              id: 18701,
              name: 'Ice Mark Passive',
              timing: 'OnEveryTurn',
              condition: 'IceMarkLevel()>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');

  assert.equal(result.spEvents.length, 0, 'passive should not fire when ice mark < 6');
});

// C群: OnOverdriveStart タイミングテスト
test('OnOverdriveStart passive with IsFront condition fires for frontline members via applyPassiveTiming', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18710,
              name: 'OD Start Passive',
              timing: 'OnOverdriveStart',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // M1 は position=0（前衛）なので IsFront() が成立する
  const result = applyPassiveTiming(state, 'OnOverdriveStart');

  assert.equal(result.spEvents.length, 1, 'frontline member should gain SP');
  assert.equal(result.spEvents[0]?.characterId, 'M1');
  assert.equal(result.spEvents[0]?.delta, 5);
});

test('OnOverdriveStart passive does not fire for backline member with IsFront condition', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 3
      ? {
          passives: [
            {
              id: 18711,
              name: 'OD Start Passive',
              timing: 'OnOverdriveStart',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // M4 は position=3（後衛）なので IsFront() が不成立
  const result = applyPassiveTiming(state, 'OnOverdriveStart');

  assert.equal(result.spEvents.length, 0, 'backline member should not gain SP with IsFront condition');
});

test('OnOverdriveStart passive does not fire on non-OD timing (OnPlayerTurnStart)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 18712,
              name: 'OD Start Only Passive',
              timing: 'OnOverdriveStart',
              condition: '',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // OnPlayerTurnStart では OnOverdriveStart タイミングの passive は発動しない
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(result.spEvents.length, 0, 'OnOverdriveStart passive must not fire on OnPlayerTurnStart');
});

test('commitTurn includes stateSnapshot with markStateByPartyIndex, statusEffectsByPartyIndex, zoneState, territoryState, tokenStateByPartyIndex', () => {
  const party = createSixMemberManualParty(() => ({}));
  const state = createBattleStateFromParty(party);
  state.party[4].applySpecialStatus(79, 2, 'PlayerTurnEnd', {});
  const actions = buildActionDict(new Party(party.members));
  const preview = previewTurn(state, actions);
  const { committedRecord } = commitTurn(state, preview);

  assert.ok(committedRecord.stateSnapshot !== undefined, 'stateSnapshot must exist');
  assert.ok(
    typeof committedRecord.stateSnapshot.markStateByPartyIndex === 'object' &&
      committedRecord.stateSnapshot.markStateByPartyIndex !== null,
    'markStateByPartyIndex must be an object'
  );
  assert.ok(
    typeof committedRecord.stateSnapshot.statusEffectsByPartyIndex === 'object' &&
      committedRecord.stateSnapshot.statusEffectsByPartyIndex !== null,
    'statusEffectsByPartyIndex must be an object'
  );
  assert.ok(
    committedRecord.stateSnapshot.zoneState === null ||
      typeof committedRecord.stateSnapshot.zoneState === 'object',
    'zoneState must be null or object'
  );
  assert.ok(
    committedRecord.stateSnapshot.territoryState === null ||
      typeof committedRecord.stateSnapshot.territoryState === 'object',
    'territoryState must be null or object'
  );
  assert.ok(
    typeof committedRecord.stateSnapshot.tokenStateByPartyIndex === 'object' &&
      committedRecord.stateSnapshot.tokenStateByPartyIndex !== null,
    'tokenStateByPartyIndex must be an object'
  );

  // 6メンバー全員のエントリが存在する
  for (let i = 0; i < 6; i++) {
    assert.ok(
      committedRecord.stateSnapshot.statusEffectsByPartyIndex[i] !== undefined,
      `statusEffectsByPartyIndex[${i}] must exist`
    );
    assert.ok(
      committedRecord.stateSnapshot.markStateByPartyIndex[i] !== undefined,
      `markStateByPartyIndex[${i}] must exist`
    );
    assert.ok(
      committedRecord.stateSnapshot.tokenStateByPartyIndex[i] !== undefined,
      `tokenStateByPartyIndex[${i}] must exist`
    );
  }
  assert.equal(
    committedRecord.stateSnapshot.statusEffectsByPartyIndex['4'].some(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === 79
    ),
    true
  );
});

test('Morale passive applies morale delta and records moraleDelta in passiveEvent', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialMorale: 3,
          passives: [
            {
              id: 99901,
              name: '士気増加パッシブ',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'Morale', target_type: 'Self', power: [2] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '士気増加パッシブ');
  assert.ok(event, 'Morale passive should fire');
  assert.ok((event.moraleDelta ?? 0) !== 0, 'moraleDelta should be non-zero');
  assert.ok(
    !event.unsupportedEffectTypes?.includes('Morale'),
    'Morale should not appear in unsupportedEffectTypes'
  );
});

test('DamageRateUp passive records damageRateUpRate in passiveEvent and is not unsupported', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99902,
              name: 'ダメージ上昇パッシブ',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'DamageRateUp', target_type: 'Self', power: [0.2] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');
  const event = result.passiveEvents.find((e) => e.passiveName === 'ダメージ上昇パッシブ');
  assert.ok(event, 'DamageRateUp passive should fire');
  assert.ok((event.damageRateUpRate ?? 0) > 0, 'damageRateUpRate should be positive');
  assert.ok(
    !event.unsupportedEffectTypes?.includes('DamageRateUp'),
    'DamageRateUp should not appear in unsupportedEffectTypes'
  );
});

test('CriticalRateUp and CriticalDamageUp passives record rates in passiveEvent', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99903,
              name: 'クリ率パッシブ',
              timing: 'OnBattleStart',
              condition: '',
              parts: [
                { skill_type: 'CriticalRateUp', target_type: 'Self', power: [0.1] },
                { skill_type: 'CriticalDamageUp', target_type: 'Self', power: [0.15] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnBattleStart');
  const event = result.passiveEvents.find((e) => e.passiveName === 'クリ率パッシブ');
  assert.ok(event, 'CriticalRateUp/CriticalDamageUp passive should fire');
  assert.ok((event.criticalRateUpRate ?? 0) > 0, 'criticalRateUpRate should be positive');
  assert.ok((event.criticalDamageUpRate ?? 0) > 0, 'criticalDamageUpRate should be positive');
});

test('DamageUpByOverDrive passive records damageUpByOverDriveRate and is not unsupported', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 57000999,
              name: 'ODダメージ上昇',
              timing: 'OnOverdriveStart',
              condition: '',
              parts: [{ skill_type: 'DamageUpByOverDrive', target_type: 'Self', power: [0.5] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  // OD timing 発火のため turnState を OD に設定
  state.turnState.turnType = 'od';
  const result = applyPassiveTiming(state, 'OnOverdriveStart');
  const event = result.passiveEvents.find((e) => e.passiveName === 'ODダメージ上昇');
  assert.ok(event, 'DamageUpByOverDrive passive should fire');
  assert.ok((event.damageUpByOverDriveRate ?? 0) > 0, 'damageUpByOverDriveRate should be positive');
  assert.ok(
    !event.unsupportedEffectTypes?.includes('DamageUpByOverDrive'),
    'DamageUpByOverDrive should not appear in unsupportedEffectTypes'
  );
});

test('GiveDefenseDebuffUp passive on OnOverdriveStart records giveDefenseDebuffUpRate and is not unsupported', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 57001000,
              name: '防デバフ強化',
              timing: 'OnOverdriveStart',
              condition: '',
              parts: [{ skill_type: 'GiveDefenseDebuffUp', target_type: 'Self', power: [0.15] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.turnType = 'od';
  const result = applyPassiveTiming(state, 'OnOverdriveStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '防デバフ強化');
  assert.ok(event, 'GiveDefenseDebuffUp passive should fire');
  assert.ok((event.giveDefenseDebuffUpRate ?? 0) > 0, 'giveDefenseDebuffUpRate should be positive');
  assert.ok(
    !event.unsupportedEffectTypes?.includes('GiveDefenseDebuffUp'),
    'GiveDefenseDebuffUp should not appear in unsupportedEffectTypes'
  );
});

test('Talisman passive activates talisman state on enemy at battle start', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          triggeredSkills: [
            {
              id: 46401601,
              name: '貼ったりましょう！',
              passive: { timing: 'OnBattleStart', condition: '', activ_rate: 0, effect: '', auto_type: 'None', limit: 0 },
              parts: [{ skill_type: 'Talisman', target_type: 'All', power: [0, 0], value: [0, 0] }],
              sourceType: 'triggered',
              isTriggeredSkillPassive: true,
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  assert.equal(state.turnState.enemyState?.talismanState?.active, false, 'talisman inactive before');
  const result = applyPassiveTiming(state, 'OnBattleStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '貼ったりましょう！');
  assert.ok(event, 'Talisman passive should fire');
  assert.equal(state.turnState.enemyState?.talismanState?.active, true, 'talisman should be active');
  assert.equal(state.turnState.enemyState?.talismanState?.level, 0, 'talisman level should be 0');
});

test('Talisman passive increases level when talisman is already active', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99801,
              name: '霊符レベルアップ',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'Talisman', target_type: 'All', power: [2, 0], value: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  // Pre-activate talisman
  state.turnState.enemyState.talismanState = { active: true, level: 3, maxLevel: 10 };
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '霊符レベルアップ');
  assert.ok(event, 'Talisman level-up passive should fire when talisman is active');
  assert.equal(state.turnState.enemyState?.talismanState?.level, 5, 'talisman level should be 3+2=5');
});

test('Talisman level-up passive does not fire when talisman is not active', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99802,
              name: '霊符レベルアップ（条件あり）',
              timing: 'OnPlayerTurnStart',
              condition: '',
              parts: [{ skill_type: 'Talisman', target_type: 'All', power: [2, 0], value: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  // talismanState is inactive (default)
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '霊符レベルアップ（条件あり）');
  assert.equal(event, undefined, 'Talisman level-up passive should NOT fire when talisman is inactive');
});

test('Talisman level increments by 1 per attack action during OD sub-turn (no reset)', () => {
  // OD sub-turn を使用するとターンインデックスが進まず敵ターン終了リセットが発生しないため、
  // レベル増加のみを独立してテストできる。
  const party = createSixMemberManualParty();
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 300;
  state = activateOverdrive(state, 3, 'preemptive'); // OD3: remainingOdActions=3
  // talisman を active=true, level=2 にセット
  state.turnState.enemyState.talismanState = { active: true, level: 2, maxLevel: 10 };

  // M1, M2, M3 それぞれが AttackNormal スキルを使用（3 攻撃）
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  // OD sub-turn のためターンインデックス変化なし → 敵ターン終了リセットなし
  assert.equal(nextState.turnState.turnType, 'od', 'should remain OD sub-turn');
  // 3 攻撃 → level 2 + 3 = 5
  assert.equal(
    nextState.turnState.enemyState?.talismanState?.level,
    5,
    'talisman level should increment by 1 for each attack action'
  );
});

test('恐怖の叫び: EX skill use applies Talisman trigger, attack increment, and damageContext metadata', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'TAL1',
          characterName: 'TAL1',
          initialSP: 20,
          triggeredSkills: [
            {
              id: 46401601,
              name: '貼ったりましょう！',
              passive: { timing: 'OnBattleStart', condition: '', activ_rate: 0, effect: '', auto_type: 'None', limit: 0 },
              parts: [{ skill_type: 'Talisman', target_type: 'All', power: [0, 0], value: [0, 0] }],
              sourceType: 'triggered',
              isTriggeredSkillPassive: true,
            },
          ],
          passives: [
            {
              id: 57001275,
              name: '恐怖の叫び',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'Talisman', target_type: 'All', power: [2, 0], value: [1, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99984,
              label: 'TestSkill51',
              name: 'Talisman EX Slash',
              sp_cost: 12,
              is_restricted: 1,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              hits: [{ id: 1, type: 'Main', power_ratio: 1 }],
            },
          ],
        }
      : {}
  );
  let state = applyInitialPassiveState(createBattleStateFromParty(party));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'TAL1', skillId: 99984 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState?.talismanState?.active, true);
  assert.equal(nextState.turnState.enemyState?.talismanState?.level, 3);

  const triggerEvent = (committedRecord.passiveEvents ?? []).find(
    (event) => event.source === 'passive_trigger' && event.passiveName === '恐怖の叫び'
  );
  assert.ok(triggerEvent, '恐怖の叫び passive_trigger event should be recorded');
  assert.equal(triggerEvent.talismanChange?.levelBefore, 0);
  assert.equal(triggerEvent.talismanChange?.levelAfter, 2);
  assert.equal(triggerEvent.talismanChange?.levelDelta, 2);

  const action = committedRecord.actions.find((entry) => entry.characterId === 'TAL1');
  assert.ok(action, 'committed action should exist');
  const talismanFieldEvents = (action.fieldStateApplied ?? []).filter((event) => event.kind === 'talisman');
  assert.equal(talismanFieldEvents.length, 2, 'trigger and attacked-by-player talisman events should both be recorded');
  assert.deepEqual(
    talismanFieldEvents.map((event) => [event.source, event.levelBefore, event.levelAfter, event.levelDelta]),
    [
      ['passive_trigger', 0, 2, 2],
      ['attacked_by_player_action', 2, 3, 1],
    ]
  );
  assert.equal(action.damageContext?.enemyTalismanLevelByEnemy?.['0'], 3);
  assert.equal(action.damageContext?.enemyAllAbilityDownByEnemy?.['0'], 30);
});

test('AdditionalHitOnExtraSkill + Talisman does not fire while talisman is inactive', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'TAL2',
          characterName: 'TAL2',
          initialSP: 20,
          passives: [
            {
              id: 57001275,
              name: '恐怖の叫び',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'Talisman', target_type: 'All', power: [2, 0], value: [1, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99985,
              label: 'TestSkill51',
              name: 'Inactive Talisman EX',
              sp_cost: 12,
              is_restricted: 1,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              hits: [{ id: 1, type: 'Main', power_ratio: 1 }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'TAL2', skillId: 99985 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState?.talismanState?.active, false);
  assert.equal(nextState.turnState.enemyState?.talismanState?.level, 0);
  assert.equal(
    (committedRecord.passiveEvents ?? []).some((event) => event.passiveName === '恐怖の叫び'),
    false,
    'passive_trigger event should not be recorded when talisman is inactive'
  );
});

test('AdditionalHitOnExtraSkill + Talisman clamps at max level 10', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'TAL3',
          characterName: 'TAL3',
          initialSP: 20,
          passives: [
            {
              id: 57001275,
              name: '恐怖の叫び',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'Talisman', target_type: 'All', power: [2, 0], value: [1, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99986,
              label: 'TestSkill51',
              name: 'Clamp Talisman EX',
              sp_cost: 12,
              is_restricted: 1,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              hits: [{ id: 1, type: 'Main', power_ratio: 1 }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  state.turnState.enemyState.talismanState = { active: true, level: 9, maxLevel: 10 };
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'TAL3', skillId: 99986 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState?.talismanState?.level, 10);
  const action = committedRecord.actions.find((entry) => entry.characterId === 'TAL3');
  assert.equal(action.damageContext?.enemyTalismanLevelByEnemy?.['0'], 10);
  assert.equal(action.damageContext?.enemyAllAbilityDownByEnemy?.['0'], 100);
});

test('Talisman level does not increment for non-attack skills', () => {
  // M1 が Heal スキルのみを持つ構成で OD1 sub-turn を使用。
  // ターンインデックスは進まない（preemptive OD で OD 終了後も同一ターン文脈）ため
  // 敵ターン終了リセットなし。非攻撃スキルでは霊符レベルが増加しないことを確認する。
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 8000,
              name: '回復',
              sp_cost: 0,
              parts: [{ skill_type: 'Heal', target_type: 'Self', type: 'None' }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive'); // OD1: remainingOdActions=1
  state.turnState.enemyState.talismanState = { active: true, level: 3, maxLevel: 10 };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
  });
  const { nextState } = commitTurn(state, preview);

  // OD1 preemptive 終了 → normal ターンに戻るがターンインデックスは進まない
  // → 敵ターン終了リセットなし → level は 3 のまま
  assert.equal(
    nextState.turnState.enemyState?.talismanState?.level,
    3,
    'talisman level should not change for non-attack skills'
  );
});

test('Talisman level resets to 0 when base turn index advances (enemy turn end)', () => {
  const party = createSixMemberManualParty();
  const state = createBattleStateFromParty(party);
  // talisman を active=true, level=5 にセット
  state.turnState.enemyState.talismanState = { active: true, level: 5, maxLevel: 10 };
  // 通常ターンでコミット → ターンインデックスが進み敵ターン終了でリセット
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.enemyState?.talismanState?.level,
    0,
    'talisman level should reset to 0 at enemy turn end'
  );
  assert.equal(
    nextState.turnState.enemyState?.talismanState?.active,
    true,
    'talisman should remain active after reset'
  );
});

test('IsTalisman condition evaluates correctly based on talisman active state', () => {
  // IsTalisman()==1 条件付きパッシブで発火確認
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99803,
              name: '霊符条件パッシブ',
              timing: 'OnPlayerTurnStart',
              condition: 'IsTalisman()==1',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );

  // active=true の場合: パッシブが発火する
  const stateActive = createBattleStateFromParty(party);
  stateActive.turnState.enemyState.talismanState = { active: true, level: 3, maxLevel: 10 };
  const resultActive = applyPassiveTiming(stateActive, 'OnPlayerTurnStart');
  assert.ok(
    resultActive.passiveEvents.some((e) => e.passiveName === '霊符条件パッシブ'),
    'IsTalisman passive should fire when talisman is active'
  );

  // active=false の場合: パッシブが発火しない
  const stateInactive = createBattleStateFromParty(party);
  stateInactive.turnState.enemyState.talismanState = { active: false, level: 0, maxLevel: 10 };
  const resultInactive = applyPassiveTiming(stateInactive, 'OnPlayerTurnStart');
  assert.equal(
    resultInactive.passiveEvents.find((e) => e.passiveName === '霊符条件パッシブ'),
    undefined,
    'IsTalisman passive should NOT fire when talisman is inactive'
  );
});

test('real-data もつれトラップ applies disaster from both active skill and 巻き添え passive trigger', () => {
  const store = getStore();
  const skillId = 46005514;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  const preview = previewActorSkill(state, skillId);
  const { committedRecord, nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState?.disasterState?.active, true);
  assert.equal(nextState.turnState.enemyState?.disasterState?.level, 4);
  assert.equal(nextState.turnState.enemyState?.disasterState?.maxLevel, 10);
  assert.equal(nextState.turnState.enemyState?.disasterState?.penaltyPerLevel, 7);

  const action = findActionByCharacterId(committedRecord, state.party[0].characterId);
  assert.ok(action, 'committed action should exist');
  const disasterFieldEvents = (action.fieldStateApplied ?? []).filter((event) => event.kind === 'disaster');
  assert.deepEqual(
    disasterFieldEvents.map((event) => [
      event.source,
      event.activeBefore,
      event.activeAfter,
      event.levelBefore,
      event.levelAfter,
      event.levelDelta,
    ]),
    [
      ['active_skill', true, true, 2, 4, 2],
      ['passive_trigger', false, true, 0, 2, 2],
    ]
  );
  const passiveTriggerEvent = (committedRecord.passiveEvents ?? []).find((event) => event.passiveName === '巻き添え');
  assert.ok(passiveTriggerEvent, '巻き添え passive trigger should be recorded');
  assert.equal(passiveTriggerEvent.disasterChange?.levelAfter, 2);
  assert.equal(action.damageContext?.enemyDisasterLevelByEnemy?.['0'], 4);
  assert.equal(action.damageContext?.enemyAllAbilityDownByEnemy?.['0'], 28);
});

test('real-data もつれトラップ keeps the higher all-ability-down penalty when talisman is also active', () => {
  const store = getStore();
  const skillId = 46005514;
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, skillId));
  state.turnState.enemyState.talismanState = { active: true, level: 2, maxLevel: 10, penaltyPerLevel: 10 };

  const preview = previewActorSkill(state, skillId);
  const { committedRecord } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, state.party[0].characterId);

  assert.ok(action, 'committed action should exist');
  assert.equal(action.damageContext?.enemyTalismanLevelByEnemy?.['0'], 3);
  assert.equal(action.damageContext?.enemyDisasterLevelByEnemy?.['0'], 4);
  assert.equal(
    action.damageContext?.enemyAllAbilityDownByEnemy?.['0'],
    30,
    'talisman 30 should win over disaster 28'
  );
});

// ===== やる気 DP回復フック テスト =====

test('Motivation increases by 1 when receiving direct DP heal from active skill', () => {
  // M1 が M2 に HealDpRate スキルを使用 → M2 のやる気が +1 されることを確認
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 8000,
            name: 'DP回復',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDpRate', target_type: 'AllyAll', power: [0.5, 0], value: [1, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      // M2: DP 50/100, やる気 3（普通）
      return {
        baseMaxDp: 100,
        currentDp: 50,
        initialMotivation: 3,
        skills: [{ id: 8001, name: '通常', sp_cost: 0, parts: [] }],
      };
    }
    return {};
  });
  let state = createBattleStateFromParty(party);
  // OD1 preemptive でターンインデックス変化なし（やる気リセット等を避ける）
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
  });
  const { nextState } = commitTurn(state, preview);

  const m2 = nextState.party.find((m) => m.characterId === 'M2');
  assert.equal(
    m2.motivationState.current,
    4,
    'M2 motivation should increase by 1 after receiving DP heal'
  );
});

test('Motivation does not increase when DP is already full', () => {
  // M2 の DP が満タン → HealDpRate を受けても増加なし → やる気も変化しない
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 8000,
            name: 'DP回復',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDpRate', target_type: 'AllyAll', power: [0.5, 0], value: [1, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      // M2: DP 満タン（100/100）, やる気 3
      return {
        baseMaxDp: 100,
        currentDp: 100,
        initialMotivation: 3,
        skills: [{ id: 8001, name: '通常', sp_cost: 0, parts: [] }],
      };
    }
    return {};
  });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 8000 } });
  const { nextState } = commitTurn(state, preview);

  const m2 = nextState.party.find((m) => m.characterId === 'M2');
  assert.equal(m2.motivationState.current, 3, 'Motivation should not change when DP is already full');
});

test('Motivation does not increase beyond max level 5', () => {
  // やる気 5（絶好調）→ DP回復を受けても変化しない
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        skills: [
          {
            id: 8000,
            name: 'DP回復',
            sp_cost: 0,
            parts: [{ skill_type: 'HealDpRate', target_type: 'AllyAll', power: [0.5, 0], value: [1, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        baseMaxDp: 100,
        currentDp: 50,
        initialMotivation: 5, // 最大
        skills: [{ id: 8001, name: '通常', sp_cost: 0, parts: [] }],
      };
    }
    return {};
  });
  let state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 8000 } });
  const { nextState } = commitTurn(state, preview);

  const m2 = nextState.party.find((m) => m.characterId === 'M2');
  assert.equal(m2.motivationState.current, 5, 'Motivation should not exceed max level');
});

test('HealSpRandom passive heals SP using value[0] as amount (always succeeds)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          position: 0, // front
          passives: [
            {
              id: 99901,
              name: '吉報テスト',
              timing: 'OnEveryTurn',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealSpRandom', target_type: 'Self', power: [0.3, 0], value: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnEveryTurn');
  const event = result.passiveEvents.find((e) => e.passiveName === '吉報テスト');
  assert.ok(event, 'HealSpRandom passive should fire');
  assert.ok(!event.unsupportedEffectTypes?.includes('HealSpRandom'), 'should not be unsupported');
  const m1 = state.party.find((m) => m.characterId === 'M1');
  assert.equal(m1.sp.current, 8, 'SP should increase by value[0]=3');
});

test('OverDrivePointUpRandom passive increases OD gauge using value[0]*100 (always succeeds)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          position: 0, // front
          passives: [
            {
              id: 99902,
              name: '福運テスト',
              timing: 'OnEveryTurn',
              condition: 'IsFront()',
              parts: [{ skill_type: 'OverDrivePointUpRandom', target_type: 'Self', power: [0.3, 0], value: [0.1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 50;
  const result = applyPassiveTiming(state, 'OnEveryTurn');
  const event = result.passiveEvents.find((e) => e.passiveName === '福運テスト');
  assert.ok(event, 'OverDrivePointUpRandom passive should fire');
  assert.ok(!event.unsupportedEffectTypes?.includes('OverDrivePointUpRandom'), 'should not be unsupported');
  assert.equal(state.turnState.odGauge, 60, 'OD gauge should increase by value[0]*100=10%');
});

test('TokenSetByAttacking passive is silently skipped at timing boundary (handled at action time)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99903,
              name: '戦勲テスト',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'TokenSetByAttacking', target_type: 'Self', power: [1, 0], value: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnFirstBattleStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '戦勲テスト');
  assert.ok(!event, 'TokenSetByAttacking at timing boundary should be silently skipped (no event)');
});

test('AdditionalHitOnBreaking passive is silently skipped at timing boundary (no event, not unsupported)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99902,
              name: '破砕テスト',
              timing: 'OnFirstBattleStart',
              condition: '',
              parts: [{ skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnFirstBattleStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '破砕テスト');
  assert.ok(!event, 'AdditionalHitOnBreaking should be silently skipped (no passive event)');
  assert.ok(
    !result.passiveEvents.some((e) => (e.unsupportedEffectTypes ?? []).includes('AdditionalHitOnBreaking')),
    'AdditionalHitOnBreaking must not appear in unsupportedEffectTypes'
  );
});

test('StunRandom passive logs a passive event (log-only, not unsupported)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          passives: [
            {
              id: 99903,
              name: '威嚇テスト',
              timing: 'OnBattleStart',
              condition: '',
              parts: [{ skill_type: 'StunRandom', target_type: 'Self', power: [0.5, 0], value: [0, 0], target_condition: '' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const result = applyPassiveTiming(state, 'OnBattleStart');
  const event = result.passiveEvents.find((e) => e.passiveName === '威嚇テスト');
  assert.ok(event, 'StunRandom should log a passive event');
  assert.ok(
    !(event.unsupportedEffectTypes ?? []).includes('StunRandom'),
    'StunRandom must not appear in unsupportedEffectTypes'
  );
});

test('AdditionalHitOnBreaking + HealSp: SP healed for self when breakHitCount > 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK1',
          characterName: 'BREAK1',
          initialSP: 5,
          passives: [
            {
              id: 99910,
              name: '激動テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99911,
              name: 'Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'BREAK1', skillId: 99911, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'BREAK1');
  const spChange = (entry.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'spChanges should include sp_passive source from passive trigger');
  assert.equal(spChange.delta, 8, 'HealSp passive trigger should add 8 SP');
});

test('AdditionalHitOnBreaking + HealSp does NOT fire when breakHitCount is 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK2',
          characterName: 'BREAK2',
          initialSP: 5,
          passives: [
            {
              id: 99920,
              name: '激動テスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99921,
              name: 'No-Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'BREAK2', skillId: 99921, breakHitCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord: rec2 } = commitTurn(state, preview);
  const entry2 = rec2.actions.find((item) => item.characterId === 'BREAK2');
  const spChange2 = (entry2.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spChange2, 'sp_passive should not appear when breakHitCount is 0');
});

test('AdditionalHitOnExtraSkill + OverDrivePointUp: OD gauge increases when EX skill used', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EX1',
          characterName: 'EX1',
          initialSP: 15,
          passives: [
            {
              id: 99930,
              name: '追加支援テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.1, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99931,
              label: 'TestSkill51',
              name: 'EX Skill Test',
              sp_cost: 12,
              is_restricted: 1,
              // Non-attack EX skill so no extra OD from applyOdGaugeFromActions
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: { characterId: 'EX1', skillId: 99931 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  // OD gauge is in 0-100 scale; power[0]=0.1 → resolveOverDrivePointUpPowerPercent returns 10 (10%)
  // No attack in skill so no additional OD from applyOdGaugeFromActions
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge) - (initialOdGauge + 10)) < 0.1,
    `OD gauge should increase by 10 (10%): initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

test('AdditionalHitOnExtraSkill + DebuffGuard: EX skill used grants DebuffGuard to allies', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EXDG1',
          characterName: 'EXDG1',
          initialSP: 15,
          passives: [
            {
              id: 99932,
              name: 'ライトプロテクションテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                {
                  skill_type: 'DebuffGuard',
                  target_type: 'AllyAll',
                  power: [1, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  effect: { limitType: 'Count', exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
          skills: [
            {
              id: 99933,
              label: 'TestSkill51',
              name: 'EX Guard Skill',
              sp_cost: 12,
              is_restricted: 1,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'EXDG1', skillId: 99933 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  assert.equal(nextState.party.filter((m) => m.getStatusEffectsByType('DebuffGuard').length > 0).length, 6);
  const triggerEvent = (committedRecord.passiveEvents ?? []).find(
    (e) => e.source === 'passive_trigger' && e.effectTypes?.includes('DebuffGuard')
  );
  assert.ok(triggerEvent, 'DebuffGuard passive_trigger event should be recorded');
});

test('AdditionalHitOnExtraSkill + BuffCharge: EX skill used grants BuffCharge to self', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'EXBC1',
          characterName: 'EXBC1',
          initialSP: 15,
          passives: [
            {
              id: 99934,
              name: '役者魂テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                {
                  skill_type: 'BuffCharge',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  effect: { limitType: 'Count', exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
          skills: [
            {
              id: 99935,
              label: 'TestSkill51',
              name: 'EX Charge Skill',
              sp_cost: 12,
              is_restricted: 1,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'EXBC1', skillId: 99935 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const actor = nextState.party.find((m) => m.characterId === 'EXBC1');
  assert.equal(countActiveSpecialStatus(actor, 25), 1, 'BuffCharge special status should be active on self');
  const triggerEvent = (committedRecord.passiveEvents ?? []).find(
    (e) => e.source === 'passive_trigger' && e.effectTypes?.includes('BuffCharge')
  );
  assert.ok(triggerEvent, 'BuffCharge passive_trigger event should be recorded');
});

test('AdditionalHitOnHealedSpWithoutSelfHeal + HealSp: 別の味方スキルでSPが上昇したとき発動（RECEIVER基準）', () => {
  // 正しいトリガー方向の確認:
  // HEALER1 はパッシブ保持者。別のメンバー（M2）が HealSp AllyFront を使い
  // HEALER1 のSPが上昇したとき、HEALER1 の AdditionalHitOnHealedSpWithoutSelfHeal パッシブが発動する。
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'HEALER1',
        characterName: 'HEALER1',
        initialSP: 10,
        passives: [
          {
            id: 99940,
            name: '愛嬌テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
              { skill_type: 'HealSp', target_type: 'Self', power: [3, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        characterId: 'SPHEALER2',
        characterName: 'SPHEALER2',
        skills: [
          {
            id: 99941,
            name: 'AllyFront HealSp',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [5, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'HEALER1', skillId: 8000 },   // HEALER1は通常攻撃
    1: { characterId: 'SPHEALER2', skillId: 99941 }, // M2 が AllyFront HealSp を使用
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // HEALER1 の spChanges に sp_passive(+3) が含まれること
  const healer1Entry = committedRecord.actions.find((item) => item.characterId === 'HEALER1');
  const spChange = (healer1Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'HEALER1: 別メンバーのHealSpでSPが上昇したとき sp_passive が発動すること');
  assert.equal(spChange.delta, 3, '発動時 SP+3 であること');

  // HEALER1 自身が AllyFront を使っても自分のパッシブは発動しない（自身スキルは対象外）
  // → 別途 test L10304 相当で確認済み
});

test('AdditionalHitOnHealedSpWithoutSelfHeal does NOT fire when skill only heals Self SP', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'SELFHEAL1',
          characterName: 'SELFHEAL1',
          initialSP: 10,
          passives: [
            {
              id: 99950,
              name: '愛嬌テスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [3, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99951,
              name: 'SelfHeal Skill',
              sp_cost: 5,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0], value: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SELFHEAL1', skillId: 99951 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((item) => item.characterId === 'SELFHEAL1');
  const spChange = (entry.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spChange, 'sp_passive should NOT fire when the skill only heals Self SP');
});

test('お裾分け: 別の味方HealSp AllyAll → 全体SP+2 + passiveTriggerEvents 記録', () => {
  // お裾分け（AllyAll SP+2）: 別のメンバーが HealSp AllyAll を使い、
  // パッシブ保持者のSPが上昇したとき、全員に SP+2 を付与する
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 10,
        passives: [
          {
            id: 99960,
            name: 'お裾分けテスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0] },
              { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [30, 0] },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        initialSP: 10,
        skills: [
          {
            id: 99961,
            name: 'AllyAll HealSp',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return { initialSP: 10 };
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },  // M1: 通常攻撃
    1: { characterId: 'M2', skillId: 99961 }, // M2: AllyAll HealSp → M1 のSP上昇 → お裾分け発動
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // 全メンバーに sp_passive(+2) が付与されること
  const allSpPassiveEvents = committedRecord.actions.flatMap((a) =>
    (a.spChanges ?? []).filter((c) => c.source === 'sp_passive' && c.delta === 2)
  );
  assert.ok(
    allSpPassiveEvents.length >= 3,
    '前衛3人以上に sp_passive +2 が付与されること'
  );

  // passiveEvents に「お裾分けテスト」が記録されること
  const passiveEvent = committedRecord.passiveEvents.find((ev) => ev.passiveName === 'お裾分けテスト');
  assert.ok(passiveEvent, 'passiveEvents にお裾分けパッシブのトリガーイベントが記録されること');
});

test('お裾分け: パッシブ保持者自身がHealSp AllyAllを使っても発動しない', () => {
  // お裾分けは「自身以外の味方のアクティブスキル」が条件 → 自身スキルでは発動しない
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 10,
        passives: [
          {
            id: 99962,
            name: 'お裾分け自身スキルテスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0] },
              { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [30, 0] },
            ],
          },
        ],
        skills: [
          {
            id: 99963,
            name: 'M1 AllyAll HealSp',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return { initialSP: 10 };
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 99963 }, // M1 自身が AllyAll HealSp を使用
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // M1 の spChanges に sp_passive が存在しないこと（自身スキルは対象外）
  const m1Entry = committedRecord.actions.find((a) => a.characterId === 'M1');
  const spPassive = (m1Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spPassive, 'M1自身のHealSpスキルではお裾分けは発動しないこと');
});

test('お裾分け: SP30 上限突破 — event ceiling=30 で SP=20 → 22、SP=28 → 30', () => {
  // お裾分けの HealSp は value[0]=30 を event ceiling として使用
  // 通常 sp.max=20 のメンバーも SP30 まで受け取れる
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 28, // SP28 → お裾分けSP+2 → SP30（上限突破確認）
        passives: [
          {
            id: 99964,
            name: 'お裾分けSP30テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0] },
              { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [30, 0] },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        initialSP: 20, // SP20 → お裾分けSP+2 → SP22（sp.max=20を超えて回復）
        skills: [
          {
            id: 99965,
            name: 'AllyAll HealSp trigger',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [3, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return { initialSP: 10 };
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },  // M1: 通常
    1: { characterId: 'M2', skillId: 99965 }, // M2: AllyAll HealSp → M1 お裾分け発動
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // M2 の spChanges にお裾分け SP+2 が含まれること
  // M2: 初期 SP=20、コスト-4=16、HealSp AllyAll+3(自分にも)=19、そこにお裾分け+2=21 (event ceiling=30 > sp.max=20)
  const m2Entry = committedRecord.actions.find((a) => a.characterId === 'M2');
  const osusowareChange = (m2Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive' && c.delta === 2);
  assert.ok(osusowareChange, 'M2にもお裾分けSP+2が付与されること（sp.max=20を超えて受け取れる）');

  // M1 にもお裾分け SP+2 が付与されること
  const m1Entry = committedRecord.actions.find((a) => a.characterId === 'M1');
  const m1OsusowareChange = (m1Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive' && c.delta === 2);
  assert.ok(m1OsusowareChange, 'M1にもお裾分けSP+2が付与されること');

  // event ceiling=30 確認: M2 へのお裾分けの eventCeiling が 30 であること
  assert.equal(
    osusowareChange.eventCeiling,
    30,
    `お裾分けのeventCeilingが30であること（実際: ${osusowareChange.eventCeiling}）`
  );
});

test('愛嬌パッシブ（AdditionalHitOnHealedSpWithoutSelfHeal + HealSp Self）: 別メンバーHealSp → 自身SP+3', () => {
  // 愛嬌: 同一トリガー・自身のみSP+3版
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 10,
        passives: [
          {
            id: 99970,
            name: '愛嬌',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0] },
              { skill_type: 'HealSp', target_type: 'Self', power: [3, 0], value: [30, 0] },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        skills: [
          {
            id: 99971,
            name: 'AllyAll HealSp',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },
    1: { characterId: 'M2', skillId: 99971 }, // M2 が AllyAll HealSp → M1 愛嬌発動
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // M1 の spChanges に sp_passive(+3) が含まれること
  const m1Entry = committedRecord.actions.find((a) => a.characterId === 'M1');
  const spChange = (m1Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive' && c.delta === 3);
  assert.ok(spChange, '愛嬌: 別メンバーのHealSp AllyAll で M1 に sp_passive +3 が付与されること');

  // M2-M6 には sp_passive が付与されないこと（愛嬌は Self target）
  const m2Entry = committedRecord.actions.find((a) => a.characterId === 'M2');
  const m2SpPassive = (m2Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive' && c.passiveName === '愛嬌');
  assert.ok(!m2SpPassive, '愛嬌は Self target なので M2 には付与されないこと');
});

test('AdditionalHitOnBreaking + AdditionalTurn: passive trigger grants extra turn when breakHitCount > 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ENCORE1',
          characterName: 'ENCORE1',
          initialSP: 10,
          passives: [
            {
              id: 99960,
              name: 'アンコールテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99961,
              name: 'Break Skill 2',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'ENCORE1', skillId: 99961, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  // When break occurs, passive grants extra turn for ENCORE1
  assert.equal(
    nextState.turnState.turnType,
    'extra',
    'next turn should be extra when AdditionalHitOnBreaking+AdditionalTurn fires'
  );
  assert.ok(
    (nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes('ENCORE1'),
    'ENCORE1 should be in allowedCharacterIds for the extra turn'
  );
});

test('AdditionalHitOnBreaking + AdditionalTurn does NOT grant extra turn when breakHitCount is 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ENCORE2',
          characterName: 'ENCORE2',
          initialSP: 10,
          passives: [
            {
              id: 99970,
              name: 'アンコールテスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99971,
              name: 'No-Break Skill 2',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'ENCORE2', skillId: 99971, breakHitCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    'next turn should NOT be extra when no break occurred'
  );
});

test('AdditionalHitOnWeak + AdditionalTurn grants extra turn when the action hits an enemy weakness', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'WEAK_TURN1',
        characterName: 'WEAK_TURN1',
        initialSP: 10,
        passives: [
          {
            id: 205000,
            name: '1MORE弱点テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnWeak', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
              { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
        skills: [
          {
            id: 205001,
            name: 'Fire Weak Skill',
            sp_cost: 3,
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }],
          },
        ],
      };
    }
    if (idx === 1 || idx === 2) {
      return { skills: [createProtectionSkill(205010 + idx)] };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Fire: 150 },
      1: { Fire: 50 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'WEAK_TURN1', skillId: 205001, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 205011 },
    2: { characterId: 'M3', skillId: 205012 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['WEAK_TURN1']);
});

test('AdditionalHitOnWeak + AdditionalTurn does not grant extra turn when the target is not weak', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'WEAK_TURN2',
        characterName: 'WEAK_TURN2',
        initialSP: 10,
        passives: [
          {
            id: 205002,
            name: '1MORE弱点不発テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnWeak', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
              { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
        skills: [
          {
            id: 205003,
            name: 'Fire Non Weak Skill',
            sp_cost: 3,
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] }],
          },
        ],
      };
    }
    if (idx === 1 || idx === 2) {
      return { skills: [createProtectionSkill(205020 + idx)] };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 2,
    statuses: [],
    damageRatesByEnemy: {
      0: { Fire: 150 },
      1: { Fire: 50 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'WEAK_TURN2', skillId: 205003, targetEnemyIndex: 1 },
    1: { characterId: 'M2', skillId: 205021 },
    2: { characterId: 'M3', skillId: 205022 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(nextState.turnState.turnType, 'extra');
});

test('闇撃のブレス通常攻撃は弱点攻撃として AdditionalHitOnWeak + AdditionalTurn を発火する', () => {
  const NORMAL_ATTACK_SKILL_ID = 205004;
  const FILLER_SKILL_ID_BASE = 205030;
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'WEAK_TURN_DARK_NORMAL',
        characterName: 'WEAK_TURN_DARK_NORMAL',
        weaponType: 'Strike',
        normalAttackElements: ['Dark'],
        initialSP: 10,
        passives: [
          {
            id: 205005,
            name: '1MORE闇撃通常攻撃テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnWeak', target_type: 'Self', power: [0, 0], value: [0, 0], cond: 'IsHitWeak()', hit_condition: '' },
              { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
        skills: [
          {
            id: NORMAL_ATTACK_SKILL_ID,
            name: '通常攻撃',
            label: 'WeakDarkNormalAttack',
            sp_cost: 0,
            hit_count: 1,
            target_type: 'Single',
            parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Strike' }],
          },
        ],
      };
    }
    if (idx === 1 || idx === 2) {
      return { skills: [createProtectionSkill(FILLER_SKILL_ID_BASE + idx)] };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Strike: 50, Dark: 150 },
    },
  };

  const preview = previewTurn(state, {
    0: { characterId: 'WEAK_TURN_DARK_NORMAL', skillId: NORMAL_ATTACK_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: FILLER_SKILL_ID_BASE + 1 },
    2: { characterId: 'M3', skillId: FILLER_SKILL_ID_BASE + 2 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, ['WEAK_TURN_DARK_NORMAL']);
});

test('慧眼の女教皇 アトミックフレアはEシールド属性無視を弱点命中として扱い1MOREを発火する', () => {
  const store = getStore();
  const fillerStyleIds = getSixUsableStyleIds(store).filter((styleId) => Number(styleId) !== QUEEN_HIGH_PRIESTESS_STYLE_ID);
  const party = store.buildPartyFromStyleIds(
    [QUEEN_HIGH_PRIESTESS_STYLE_ID, ...fillerStyleIds.slice(0, 5)],
    {
      initialSP: 20,
      limitBreakLevelsByPartyIndex: { 0: QUEEN_1MORE_LIMIT_BREAK_LEVEL },
      skillSetsByPartyIndex: {
        0: [QUEEN_ATOMIC_FLARE_SKILL_ID],
      },
    }
  );
  const state = applyEnemyEShieldTestSetup(applyInitialPassiveState(createBattleStateFromParty(party)), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 10, max: 10, elements: ['Fire'] }),
    },
    damageRatesByEnemy: {
      0: { Strike: 100, Fire: 50 },
    },
  });
  const queen = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: queen.characterId, skillId: QUEEN_ATOMIC_FLARE_SKILL_ID, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, queen.characterId);

  assert.equal(action?.skillName, 'アトミックフレア');
  assert.equal(action?.spCost, 16);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 5,
    max: 10,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(nextState.turnState.turnType, 'extra');
  assert.deepEqual(nextState.turnState.extraTurnState?.allowedCharacterIds, [queen.characterId]);

  const extraPreview = previewTurn(nextState, {
    0: { characterId: queen.characterId, skillId: QUEEN_ATOMIC_FLARE_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(extraPreview.actions[0]?.spCost, 0, 'アトミックフレアは追加ターン中 SP0');
  const extraCommit = commitTurn(nextState, extraPreview);
  assert.equal(extraCommit.nextState.turnState.turnType, 'normal', '1MOREは追加ターン中に再付与しない');
});

test('慧眼の女教皇 アトミックフレアはEシールドがない非弱点敵では1MOREを発火しない', () => {
  const store = getStore();
  const fillerStyleIds = getSixUsableStyleIds(store).filter((styleId) => Number(styleId) !== QUEEN_HIGH_PRIESTESS_STYLE_ID);
  const party = store.buildPartyFromStyleIds(
    [QUEEN_HIGH_PRIESTESS_STYLE_ID, ...fillerStyleIds.slice(0, 5)],
    {
      initialSP: 20,
      limitBreakLevelsByPartyIndex: { 0: QUEEN_1MORE_LIMIT_BREAK_LEVEL },
      skillSetsByPartyIndex: {
        0: [QUEEN_ATOMIC_FLARE_SKILL_ID],
      },
    }
  );
  const state = applyEnemyEShieldTestSetup(applyInitialPassiveState(createBattleStateFromParty(party)), {
    enemyCount: 1,
    damageRatesByEnemy: {
      0: { Strike: 100 },
    },
  });
  const queen = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: queen.characterId, skillId: QUEEN_ATOMIC_FLARE_SKILL_ID, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.notEqual(nextState.turnState.turnType, 'extra');
});

function createTojoYuinaOneMoreTestState() {
  const store = getStore();
  const tojoStyle = store.getStyleById(TOJO_FATAL_FEMME_STYLE_ID);
  const tojoCharaLabel = String(tojoStyle?.chara_label ?? tojoStyle?.chara ?? '');
  const yuinaStyle = store.getStyleById(YUINA_ORACLE_FLAG_STYLE_ID);
  const yuinaCharaLabel = String(yuinaStyle?.chara_label ?? yuinaStyle?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store).filter(
    (styleId) => {
      const style = store.getStyleById(styleId);
      const charaLabel = String(style?.chara_label ?? style?.chara ?? '');
      return (
        Number(styleId) !== TOJO_FATAL_FEMME_STYLE_ID &&
        Number(styleId) !== YUINA_ORACLE_FLAG_STYLE_ID &&
        charaLabel !== tojoCharaLabel &&
        charaLabel !== yuinaCharaLabel
      );
    }
  );
  const party = store.buildPartyFromStyleIds(
    [TOJO_FATAL_FEMME_STYLE_ID, YUINA_ORACLE_FLAG_STYLE_ID, ...fillerStyleIds.slice(0, 4)],
    {
      initialSP: 30,
      limitBreakLevelsByPartyIndex: { 0: 3 },
      skillSetsByPartyIndex: {
        0: [
          TOJO_MEMENTO_MORI_PLUS_SKILL_ID,
          TOJO_CHARMING_GAZE_SKILL_ID,
          COMMON_PROTECTION_SKILL_ID,
        ],
        1: [
          YUINA_DIVINE_EYE_SKILL_ID,
          COMMON_PROTECTION_SKILL_ID,
        ],
      },
    }
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  state.turnState.enemyState = {
    ...state.turnState.enemyState,
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: {
      0: { Stab: 100, Fire: 400 },
    },
  };
  return state;
}

test('東城つかさ 1MORE: ユイナ追加ターンと同時発火しても追加ターン開始時に発火済み状態を消す', () => {
  const state = createTojoYuinaOneMoreTestState();
  const tojo = state.party[0];
  const yuina = state.party[1];

  const firstPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: TOJO_MEMENTO_MORI_PLUS_SKILL_ID,
      targetEnemyIndex: 0,
    },
    1: {
      characterId: yuina.characterId,
      skillId: YUINA_DIVINE_EYE_SKILL_ID,
    },
  });
  const committed = commitTurn(state, firstPreview);
  assert.equal(committed.nextState.turnState.turnType, 'extra');
  assert.ok(
    committed.nextState.turnState.extraTurnState?.allowedCharacterIds?.includes(tojo.characterId),
    '初回の火弱点攻撃で東城つかさの1MOREが発火する'
  );
  assert.ok(
    committed.nextState.turnState.extraTurnState?.allowedCharacterIds?.includes(yuina.characterId),
    '神命を宿す瞳の前衛追加ターンも同時に成立する'
  );
  assert.equal(
    committed.nextState.turnState.passiveTurnFiredKeys?.includes(TOJO_1MORE_PASSIVE_USAGE_KEY),
    false,
    '追加ターンに入った時点で東城つかさ1MOREの発火済み状態は消える'
  );
});

test('東城つかさ 1MORE: 割込ODなしでも追加ターン後の通常ターンで魅惑のまなざしが再度追加ターンを付与する', () => {
  let state = createTojoYuinaOneMoreTestState();
  const tojo = state.party[0];
  const yuina = state.party[1];

  const firstPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: TOJO_MEMENTO_MORI_PLUS_SKILL_ID,
      targetEnemyIndex: 0,
    },
    1: {
      characterId: yuina.characterId,
      skillId: YUINA_DIVINE_EYE_SKILL_ID,
    },
  });
  let committed = commitTurn(state, firstPreview);
  assert.equal(committed.nextState.turnState.turnType, 'extra');

  state = committed.nextState;
  const extraPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: COMMON_PROTECTION_SKILL_ID,
    },
  });
  committed = commitTurn(state, extraPreview);
  assert.equal(committed.nextState.turnState.turnType, 'normal');

  state = committed.nextState;
  const nextNormalPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: TOJO_CHARMING_GAZE_SKILL_ID,
      targetEnemyIndex: 0,
    },
  });
  committed = commitTurn(state, nextNormalPreview);

  assert.equal(committed.nextState.turnState.turnType, 'extra');
  assert.deepEqual(committed.nextState.turnState.extraTurnState?.allowedCharacterIds, [tojo.characterId]);
});

test('東城つかさ 1MORE: 追加ターン後の割込OD中に魅惑のまなざしで弱点を突くと再度追加ターンを付与する', () => {
  let state = createTojoYuinaOneMoreTestState();
  const tojo = state.party[0];
  const yuina = state.party[1];

  const firstPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: TOJO_MEMENTO_MORI_PLUS_SKILL_ID,
      targetEnemyIndex: 0,
    },
    1: {
      characterId: yuina.characterId,
      skillId: YUINA_DIVINE_EYE_SKILL_ID,
    },
  });
  let committed = commitTurn(state, firstPreview);
  assert.equal(committed.nextState.turnState.turnType, 'extra');

  state = committed.nextState;
  state.turnState.odGauge = 200;
  const extraPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: COMMON_PROTECTION_SKILL_ID,
    },
  });
  committed = commitTurn(state, extraPreview, [], { interruptOdLevel: 2 });
  assert.equal(committed.nextState.turnState.turnType, 'od');
  assert.deepEqual(
    committed.nextState.turnState.passiveTurnFiredKeys,
    [],
    '追加ターンから割込ODへ移る境界でPlayerTurnEnd扱いの発火フラグをリセットする'
  );

  state = committed.nextState;
  const odPreview = previewTurn(state, {
    0: {
      characterId: tojo.characterId,
      skillId: TOJO_CHARMING_GAZE_SKILL_ID,
      targetEnemyIndex: 0,
    },
  });
  committed = commitTurn(state, odPreview);

  assert.equal(committed.nextState.turnState.turnType, 'extra');
  assert.deepEqual(committed.nextState.turnState.extraTurnState?.allowedCharacterIds, [tojo.characterId]);
});

test('AdditionalHitOnExtraSkill + HealDpRate: DP healed to AllyFront targets when EX skill used', () => {
  // 慶福の一矢: EXスキル使用後、前衛全員のDPを+30%回復するパッシブのテスト
  const BASE_MAX_DP = 1000;
  const INITIAL_DP = 500;
  const HEAL_RATE = 0.3; // power[0]=0.3 → 30% of baseMaxDp

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KOYUKI1',
          characterName: 'KOYUKI1',
          initialSP: 15,
          initialDp: INITIAL_DP,
          baseMaxDp: BASE_MAX_DP,
          passives: [
            {
              id: 99980,
              name: '慶福の一矢テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealDpRate', target_type: 'AllyFront', power: [HEAL_RATE, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99981,
              label: 'TestSkill51',
              name: 'EX Non-Attack',
              sp_cost: 12,
              is_restricted: 1,
              // Non-attack EX skill to avoid confounding OD-based DP effects
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : { initialDp: INITIAL_DP, baseMaxDp: BASE_MAX_DP }
  );
  const state = createBattleStateFromParty(party);
  const actor = state.party.find((m) => m.characterId === 'KOYUKI1');
  const initialActorDp = Number(actor?.dpState?.currentDp ?? 0);

  const preview = previewTurn(state, {
    0: { characterId: 'KOYUKI1', skillId: 99981 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);

  // EX skill triggers HealDpRate passive: each AllyFront member gets +30% baseMaxDp DP
  const expectedHeal = BASE_MAX_DP * HEAL_RATE; // 300

  // Actor's own DP should increase (they are in AllyFront)
  const actorAfter = nextState.party.find((m) => m.characterId === 'KOYUKI1');
  const finalActorDp = Number(actorAfter?.dpState?.currentDp ?? 0);
  assert.ok(
    Math.abs(finalActorDp - (initialActorDp + expectedHeal)) < 1,
    `Actor DP should increase by ${expectedHeal}: initial=${initialActorDp}, final=${finalActorDp}`
  );

  // dpChanges in the committed record should contain a dp_passive entry for the actor
  const entry = committedRecord.actions.find((item) => item.characterId === 'KOYUKI1');
  const dpChange = (entry?.dpChanges ?? []).find((c) => c.source === 'dp_passive');
  assert.ok(dpChange, 'dpChanges should include dp_passive entry from HealDpRate passive trigger');
  assert.ok(
    Math.abs(dpChange.delta - expectedHeal) < 1,
    `dp_passive delta should be ~${expectedHeal}, got ${dpChange.delta}`
  );
});

test('AdditionalHitOnExtraSkill + HealDpRate does NOT fire when non-EX skill used', () => {
  const BASE_MAX_DP = 1000;
  const INITIAL_DP = 500;

  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KOYUKI2',
          characterName: 'KOYUKI2',
          initialSP: 10,
          initialDp: INITIAL_DP,
          baseMaxDp: BASE_MAX_DP,
          passives: [
            {
              id: 99982,
              name: '慶福の一矢テスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnExtraSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealDpRate', target_type: 'AllyFront', power: [0.3, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99983,
              name: 'Normal Attack',
              sp_cost: 3,
              // Not an EX skill (is_restricted not set)
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : { initialDp: INITIAL_DP, baseMaxDp: BASE_MAX_DP }
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'KOYUKI2', skillId: 99983 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  const entry = committedRecord.actions.find((item) => item.characterId === 'KOYUKI2');
  const dpChange = (entry?.dpChanges ?? []).find((c) => c.source === 'dp_passive');
  assert.ok(!dpChange, 'dp_passive should NOT appear when non-EX skill is used');
});

test('AdditionalHitOnBreaking + BreakDownTurnUp: extends DownTurn remaining when break occurs (ひれ伏すでゲス！)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BUNGO1',
          characterName: 'BUNGO1',
          initialSP: 10,
          passives: [
            {
              id: 100340603,
              name: 'ひれ伏すでゲス！',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'AllyAll', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'BreakDownTurnUp', target_type: 'None', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99990,
              name: 'Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'SuperBreakDown', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // Manually set a DownTurn on enemy 0 (remaining 3 turns) to simulate pre-existing break state
  // We simulate the break by providing breakHitCount=1, which means the passive fires,
  // and applyEnemyBreakEffectsFromActions adds a new DownTurn (3 turns default),
  // then applyBreakDownTurnUpFromActions extends it by 1.
  const preview = previewTurn(state, {
    0: { characterId: 'BUNGO1', skillId: 99990, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // The BreakDownTurnUp event should appear in entry.enemyStatusChanges
  const entry = committedRecord.actions.find((item) => item.characterId === 'BUNGO1');
  const bdt = (entry?.enemyStatusChanges ?? []).find((ev) => ev.mode === 'BreakDownTurnUp');
  assert.ok(bdt, 'enemyStatusChanges should include BreakDownTurnUp event when break occurs');
  assert.equal(bdt.extension, 1, 'BreakDownTurnUp extension should be 1');
  // The event's remainingTurns = DEFAULT_AUTO_DOWN_TURN_REMAINING(1) + extension(1) = 2
  assert.equal(bdt.remainingTurns, 2, 'BreakDownTurnUp event remainingTurns should be 2 after extension');
});

test('AdditionalHitOnBreaking + BreakDownTurnUp does NOT fire when breakHitCount is 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BUNGO2',
          characterName: 'BUNGO2',
          initialSP: 10,
          passives: [
            {
              id: 100340604,
              name: 'ひれ伏すでゲス！2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'AllyAll', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'BreakDownTurnUp', target_type: 'None', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99991,
              name: 'Normal Attack',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'BUNGO2', skillId: 99991, breakHitCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  const entry = committedRecord.actions.find((item) => item.characterId === 'BUNGO2');
  const bdt = (entry?.enemyStatusChanges ?? []).find((ev) => ev.mode === 'BreakDownTurnUp');
  assert.ok(!bdt, 'BreakDownTurnUp should NOT fire when breakHitCount is 0');
});

test('AdditionalHitOnBreaking + AttackUp: grants AllyAll AttackUp +0.6 for 8 turns as single trigger (破砕の喝采)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'HASAN1',
          characterName: 'HASAN1',
          initialSP: 10,
          passives: [
            {
              id: 99995,
              name: '破砕の喝采テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                {
                  skill_type: 'AttackUp',
                  target_type: 'AllyAll',
                  power: [0.6, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  target_condition: '',
                  effect: { limitType: 'Default', exitCond: 'PlayerTurnEnd', exitVal: [8, 0] },
                },
              ],
            },
          ],
          skills: [
            {
              id: 99996,
              name: 'Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'HASAN1', skillId: 99996, breakHitCount: 2 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  const evt = (committedRecord.passiveEvents ?? []).find(
    (e) => e.effectTypes?.includes('AttackUp') && e.source === 'passive_trigger'
  );
  assert.ok(evt, 'passiveEvents should include AttackUp trigger event when break occurs');
  assert.ok(
    Math.abs(Number(evt.attackUpRate) - 0.6) < 0.01,
    `attackUpRate should be 0.6, got ${evt.attackUpRate}`
  );

  for (const member of nextState.party) {
    const attackUps = member
      .resolveEffectiveStatusEffects('AttackUp')
      .filter((status) => Math.abs(Number(status?.power ?? 0) - 0.6) < 0.01);
    assert.equal(attackUps.length, 1, `${member.characterId} should have exactly one +0.6 AttackUp`);
    assert.equal(String(attackUps[0].exitCond), 'PlayerTurnEnd');
    assert.equal(Number(attackUps[0].remaining), 7);
  }
});

test('AdditionalHitOnRemovingBuff + AttackUp: fires when skill has RemoveBuff part (浄化の喝采)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KIRINO1',
          characterName: 'KIRINO1',
          initialSP: 10,
          passives: [
            {
              id: 99997,
              name: '浄化の喝采テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnRemovingBuff', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.6, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99998,
              name: 'Debuff Remove Skill',
              sp_cost: 4,
              parts: [
                { skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' },
                { skill_type: 'RemoveBuff', target_type: 'All' },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KIRINO1', skillId: 99998 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  const evt = (committedRecord.passiveEvents ?? []).find(
    (e) => e.effectTypes?.includes('AttackUp') && e.source === 'passive_trigger'
  );
  assert.ok(evt, 'passiveEvents should include AttackUp trigger event when RemoveBuff skill used');
});

test('AdditionalHitOnRemovingBuff does NOT fire when skill has no RemoveBuff part', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KIRINO2',
          characterName: 'KIRINO2',
          initialSP: 10,
          passives: [
            {
              id: 99999,
              name: '浄化の喝采テスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnRemovingBuff', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AttackUp', target_type: 'AllyAll', power: [0.6, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100000,
              name: 'Normal Attack',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KIRINO2', skillId: 100000 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  const evt = (committedRecord.passiveEvents ?? []).find(
    (e) => e.effectTypes?.includes('AttackUp') && e.source === 'passive_trigger'
  );
  assert.ok(!evt, 'AttackUp should NOT fire when skill has no RemoveBuff part');
});

// ─── AdditionalHitOnBreaking + OverDrivePointUp（破竹の勢い相当） ───

test('AdditionalHitOnBreaking + OverDrivePointUp: OD gauge increases when breaking (破竹の勢い)', () => {
  // non-attack スキルに breakHitCount:1 を設定し、攻撃由来ODと混同しないよう分離
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK_OD1',
          characterName: 'BREAK_OD1',
          initialSP: 5,
          passives: [
            {
              id: 100101,
              name: '破竹の勢いテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.25, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100102,
              name: 'Break Trigger Non-Attack',
              sp_cost: 3,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: { characterId: 'BREAK_OD1', skillId: 100102, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  // power[0]=0.25 → resolveOverDrivePointUpPowerPercent returns 25 (25%)
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge) - (initialOdGauge + 25)) < 0.1,
    `OD gauge should increase by 25 when breaking: initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

test('AdditionalHitOnBreaking + OverDrivePointUp does NOT fire when breakHitCount is 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK_OD2',
          characterName: 'BREAK_OD2',
          initialSP: 5,
          passives: [
            {
              id: 100103,
              name: '破竹の勢いテスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.25, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100104,
              name: 'No-Break Non-Attack',
              sp_cost: 3,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: { characterId: 'BREAK_OD2', skillId: 100104, breakHitCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge) - initialOdGauge) < 0.1,
    `OD gauge should not change from passive when breakHitCount is 0: initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

test('AdditionalHitOnBreaking + OverDrivePointUp fires when manualBreakEnemyIndexes is set', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK_OD_MANUAL',
          characterName: 'BREAK_OD_MANUAL',
          initialSP: 5,
          passives: [
            {
              id: 100105,
              name: '破竹の勢いテスト3(manual)',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.2, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100106,
              name: 'Manual-Break Attack',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );

  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: {
      characterId: 'BREAK_OD_MANUAL',
      skillId: 100106,
      manualBreakEnemyIndexes: [0],
    },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  // 攻撃1hit 2.5% + ブレイクトリガーOD+20% = 22.5%
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge ?? 0) - (initialOdGauge + 22.5)) < 0.1,
    `OD gauge should include manual-break trigger bonus (+20): initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

test('Carnival with You resonance is injected as support passive on 桐生 美也 (31X/Excelsior)', () => {
  const store = getStore();
  const actor = store.buildCharacterStyle({
    styleId: 1004307,
    partyIndex: 0,
    initialSP: 20,
    limitBreakLevel: 4,
    supportStyleId: 1008105,
    supportStyleLimitBreakLevel: 4,
  });

  const supportBreakOdPassive = actor.passives.find((passive) => {
    const parts = Array.isArray(passive?.parts) ? passive.parts : [];
    const hasBreakTrigger = parts.some((part) => String(part?.skill_type ?? '') === 'AdditionalHitOnBreaking');
    const odPart = parts.find((part) => String(part?.skill_type ?? '') === 'OverDrivePointUp');
    return hasBreakTrigger && odPart && Number(odPart?.power?.[0] ?? 0) === 0.2;
  });

  assert.ok(supportBreakOdPassive, '31X support passive (AdditionalHitOnBreaking + OverDrivePointUp 0.2) should be injected');
  assert.equal(supportBreakOdPassive.sourceType, 'support');
  assert.equal(String(supportBreakOdPassive.name ?? ''), 'Excelsior!');
});

test('Carnival with You resonance fires on break and adds +20 OD gauge for 桐生 美也 (#2 break scenario)', () => {
  const store = getStore();
  const actorStyleId = 1004307;
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter(
      (id) =>
        Number(id) !== actorStyleId &&
        String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? '') !== actorCharaLabel
    )
    .slice(0, 5);
  assert.equal(fillerStyleIds.length, 5, 'should prepare five filler styles');

  const styleIds = [actorStyleId, ...fillerStyleIds];
  const buildState = () =>
    createBattleStateFromParty(
      store.buildPartyFromStyleIds(styleIds, {
        initialSP: 20,
        limitBreakLevelsByPartyIndex: { 0: 4 },
        supportStyleIdsByPartyIndex: { 0: 1008105 },
        supportLimitBreakLevelsByPartyIndex: { 0: 4 },
      })
    );

  const seedState = buildState();
  const attackSkill = seedState.party[0].skills.find((skill) =>
    (skill?.parts ?? []).some((part) => String(part?.skill_type ?? '') === 'AttackSkill')
  );
  assert.ok(attackSkill, 'actor should have an attack skill');
  const attackSkillId = Number(attackSkill.skillId);

  const buildActions = (state, breakHitCount) => ({
    0: {
      characterId: state.party[0].characterId,
      skillId: attackSkillId,
      breakHitCount,
    },
    1: {
      characterId: state.party[1].characterId,
      skillId: state.party[1].skills[0].skillId,
    },
    2: {
      characterId: state.party[2].characterId,
      skillId: state.party[2].skills[0].skillId,
    },
  });

  const noBreakState = buildState();
  const noBreakPreview = previewTurn(noBreakState, buildActions(noBreakState, 0));
  const noBreakCommit = commitTurn(noBreakState, noBreakPreview);

  const withBreakState = buildState();
  const withBreakPreview = previewTurn(withBreakState, buildActions(withBreakState, 1));
  const withBreakCommit = commitTurn(withBreakState, withBreakPreview);

  const noBreakOd = Number(noBreakCommit.nextState.turnState.odGauge ?? 0);
  const withBreakOd = Number(withBreakCommit.nextState.turnState.odGauge ?? 0);
  const odDiffByBreak = withBreakOd - noBreakOd;

  assert.ok(
    Math.abs(odDiffByBreak - 20) < 0.1,
    `break-triggered support resonance should add +20 OD: noBreak=${noBreakOd}, withBreak=${withBreakOd}, diff=${odDiffByBreak}`
  );
});

test('Carnival with You resonance is reflected in preview odGaugeAtEnd on break (+20)', () => {
  const store = getStore();
  const actorStyleId = 1004307;
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter(
      (id) =>
        Number(id) !== actorStyleId &&
        String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? '') !== actorCharaLabel
    )
    .slice(0, 5);

  const styleIds = [actorStyleId, ...fillerStyleIds];
  const buildState = () =>
    createBattleStateFromParty(
      store.buildPartyFromStyleIds(styleIds, {
        initialSP: 20,
        limitBreakLevelsByPartyIndex: { 0: 4 },
        supportStyleIdsByPartyIndex: { 0: 1008105 },
        supportLimitBreakLevelsByPartyIndex: { 0: 4 },
      })
    );

  const seedState = buildState();
  const attackSkill = seedState.party[0].skills.find((skill) =>
    (skill?.parts ?? []).some((part) => String(part?.skill_type ?? '') === 'AttackSkill')
  );
  assert.ok(attackSkill, 'actor should have an attack skill');
  const attackSkillId = Number(attackSkill.skillId);

  const buildActions = (state, breakHitCount) => ({
    0: {
      characterId: state.party[0].characterId,
      skillId: attackSkillId,
      breakHitCount,
    },
    1: {
      characterId: state.party[1].characterId,
      skillId: state.party[1].skills[0].skillId,
    },
    2: {
      characterId: state.party[2].characterId,
      skillId: state.party[2].skills[0].skillId,
    },
  });

  const noBreakState = buildState();
  const withBreakState = buildState();
  const noBreakPreview = previewTurn(noBreakState, buildActions(noBreakState, 0));
  const withBreakPreview = previewTurn(withBreakState, buildActions(withBreakState, 1));

  const noBreakProjectedOd = Number(noBreakPreview.projections?.odGaugeAtEnd ?? 0);
  const withBreakProjectedOd = Number(withBreakPreview.projections?.odGaugeAtEnd ?? 0);
  const projectedDiff = withBreakProjectedOd - noBreakProjectedOd;

  assert.ok(
    Math.abs(projectedDiff - 20) < 0.1,
    `preview odGaugeAtEnd should include +20 on break: noBreak=${noBreakProjectedOd}, withBreak=${withBreakProjectedOd}, diff=${projectedDiff}`
  );
});

test('real-data reconciliation: 咲き昇る宵の幻 break keeps Excelsior OD+20 flat across od_rate variants', () => {
  const store = getStore();
  const actorStyleId = 1004307;
  const actorSkillId = 46004311; // 咲き昇る宵の幻 (AttackSkill)
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter(
      (id) =>
        Number(id) !== actorStyleId &&
        String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? '') !== actorCharaLabel
    )
    .slice(0, 5);

  const styleIds = [actorStyleId, ...fillerStyleIds];
  const buildState = (odRate) => {
    const state = createBattleStateFromParty(
      store.buildPartyFromStyleIds(styleIds, {
        initialSP: 20,
        limitBreakLevelsByPartyIndex: { 0: 4 },
        supportStyleIdsByPartyIndex: { 0: 1008105 },
        supportLimitBreakLevelsByPartyIndex: { 0: 4 },
      })
    );
    state.turnState.enemyState.odRateByEnemy = { '0': odRate };
    return state;
  };

  const buildActions = (state, shouldBreak) => ({
    0: {
      characterId: state.party[0].characterId,
      skillId: actorSkillId,
      targetEnemyIndex: 0,
      manualBreakEnemyIndexes: shouldBreak ? [0] : [],
    },
    1: {
      characterId: state.party[1].characterId,
      skillId: state.party[1].skills[0].skillId,
    },
    2: {
      characterId: state.party[2].characterId,
      skillId: state.party[2].skills[0].skillId,
    },
  });

  const checkBreakDiff = (odRate, label) => {
    const noBreakState = buildState(odRate);
    const noBreakPreview = previewTurn(noBreakState, buildActions(noBreakState, false));
    const noBreakCommit = commitTurn(noBreakState, noBreakPreview);

    const withBreakState = buildState(odRate);
    const withBreakPreview = previewTurn(withBreakState, buildActions(withBreakState, true));
    const withBreakCommit = commitTurn(withBreakState, withBreakPreview);

    const noBreakOd = Number(noBreakCommit.nextState.turnState.odGauge ?? 0);
    const withBreakOd = Number(withBreakCommit.nextState.turnState.odGauge ?? 0);
    const odDiffByBreak = withBreakOd - noBreakOd;

    assert.ok(
      Math.abs(odDiffByBreak - 20) < 0.1,
      `${label}: break-triggered Excelsior bonus should stay +20 OD (noBreak=${noBreakOd}, withBreak=${withBreakOd}, diff=${odDiffByBreak})`
    );
  };

  checkBreakDiff(1, 'od_rate=1.0');
  checkBreakDiff(0.5, 'od_rate=0.5');
});

function runExcelsiorBreakDecompositionDebugCase({
  odRate,
  drivePiercePercent,
  caseLabel,
  expectedResonanceFloor,
  expectedIntegerResidual,
  expectedAttackFloor,
  expectedTotalFloor,
}) {
  const store = getStore();
  const actorStyleId = 1004307;
  const actorSkillId = 46004311; // 咲き昇る宵の幻 (AttackSkill)
  const actorStyle = store.getStyleById(actorStyleId);
  const actorCharaLabel = String(actorStyle?.chara_label ?? actorStyle?.chara ?? '');
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter(
      (id) =>
        Number(id) !== actorStyleId &&
        String(store.getStyleById(Number(id))?.chara_label ?? store.getStyleById(Number(id))?.chara ?? '') !== actorCharaLabel
    )
    .slice(0, 5);

  const styleIds = [actorStyleId, ...fillerStyleIds];
  const buildState = ({ withSupport }) => {
    const state = createBattleStateFromParty(
      store.buildPartyFromStyleIds(styleIds, {
        initialSP: 20,
        limitBreakLevelsByPartyIndex: { 0: 4 },
        supportStyleIdsByPartyIndex: withSupport ? { 0: 1008105 } : {},
        supportLimitBreakLevelsByPartyIndex: withSupport ? { 0: 4 } : {},
      })
    );
    state.turnState.enemyState.odRateByEnemy = { '0': odRate };
    state.party[0].drivePiercePercent = drivePiercePercent;
    return state;
  };

  const buildActions = (state) => ({
    0: {
      characterId: state.party[0].characterId,
      skillId: actorSkillId,
      targetEnemyIndex: 0,
      manualBreakEnemyIndexes: [0],
    },
  });

  const noSupportState = buildState({ withSupport: false });
  const noSupportPreview = previewTurn(noSupportState, buildActions(noSupportState));
  const noSupportCommit = commitTurn(noSupportState, noSupportPreview);
  const attackDerived = Number(noSupportCommit.nextState.turnState.odGauge ?? 0);

  const withSupportState = buildState({ withSupport: true });
  const withSupportPreview = previewTurn(withSupportState, buildActions(withSupportState));
  const withSupportCommit = commitTurn(withSupportState, withSupportPreview);
  const total = Number(withSupportCommit.nextState.turnState.odGauge ?? 0);

  const resonanceDerived = total - attackDerived;
  const integerResidual = Math.floor(total) - Math.floor(attackDerived);

  console.log(
    `[OD_DEBUG] ${caseLabel} | 攻撃由来=${attackDerived.toFixed(2)} | 共鳴由来=${resonanceDerived.toFixed(2)} | 合計=${total.toFixed(2)} | integerResidual=${integerResidual}`
  );

  assert.ok(
    Math.floor(resonanceDerived) === expectedResonanceFloor,
    `${caseLabel}: floor(共鳴由来) should match real-device observation (attack=${attackDerived.toFixed(2)}, resonance=${resonanceDerived.toFixed(2)}, total=${total.toFixed(2)}, integerResidual=${integerResidual})`
  );
  assert.equal(
    Math.floor(attackDerived),
    expectedAttackFloor,
    `${caseLabel}: floor(攻撃由来) should match real-device observation`
  );
  assert.equal(
    Math.floor(total),
    expectedTotalFloor,
    `${caseLabel}: floor(合計) should match real-device observation`
  );
  assert.equal(
    integerResidual,
    expectedIntegerResidual,
    `${caseLabel}: integerResidual should match real-device display split`
  );
  assert.ok(
    Math.abs(total - (attackDerived + resonanceDerived)) < 1e-9,
    `${caseLabel}: decomposition identity must hold (attack + resonance = total)`
  );
}

test('od_rate=0.85 ドライブピアスなし 16%+20%=36%', () => {
  runExcelsiorBreakDecompositionDebugCase({
    odRate: 0.85,
    drivePiercePercent: 0,
    caseLabel: 'od_rate=0.85 ドライブピアスなし 16%+20%=36%',
    expectedResonanceFloor: 20,
    expectedIntegerResidual: 20,
    expectedAttackFloor: 16,
    expectedTotalFloor: 36,
  });
});

test('od_rate=0.85 ドライブピアス15% 19%+22%=41%', () => {
  runExcelsiorBreakDecompositionDebugCase({
    odRate: 0.85,
    drivePiercePercent: 15,
    caseLabel: 'od_rate=0.85 ドライブピアス15% 19%+22%=41%',
    expectedResonanceFloor: 22,
    expectedIntegerResidual: 22,
    expectedAttackFloor: 19,
    expectedTotalFloor: 41,
  });
});

test('od_rate=1.00 ドライブピアスなし 20%+20%=40%', () => {
  runExcelsiorBreakDecompositionDebugCase({
    odRate: 1,
    drivePiercePercent: 0,
    caseLabel: 'od_rate=1.00 ドライブピアスなし 20%+20%=40%',
    expectedResonanceFloor: 20,
    expectedIntegerResidual: 20,
    expectedAttackFloor: 20,
    expectedTotalFloor: 40,
  });
});

test('od_rate=1.00 ドライブピアス15% 22%+23%=45%', () => {
  runExcelsiorBreakDecompositionDebugCase({
    odRate: 1,
    drivePiercePercent: 15,
    caseLabel: 'od_rate=1.00 ドライブピアス15% 22%+23%=45%',
    expectedResonanceFloor: 22,
    expectedIntegerResidual: 23,
    expectedAttackFloor: 22,
    expectedTotalFloor: 45,
  });
});

// ─── AdditionalHitOnRemovingBuff + OverDrivePointUp（アプローチショット相当） ───

test('AdditionalHitOnRemovingBuff + OverDrivePointUp: OD gauge increases when buff removed (アプローチショット)', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'REMOVE_OD1',
          characterName: 'REMOVE_OD1',
          initialSP: 10,
          passives: [
            {
              id: 100105,
              name: 'アプローチショットテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnRemovingBuff', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.5, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100106,
              name: 'RemoveBuff Skill',
              sp_cost: 4,
              parts: [{ skill_type: 'RemoveBuff', target_type: 'All' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: { characterId: 'REMOVE_OD1', skillId: 100106 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  // power[0]=0.5 → resolveOverDrivePointUpPowerPercent returns 50 (50%)
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge) - (initialOdGauge + 50)) < 0.1,
    `OD gauge should increase by 50 when removing buff: initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

test('AdditionalHitOnRemovingBuff + OverDrivePointUp does NOT fire when skill has no RemoveBuff part', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'REMOVE_OD2',
          characterName: 'REMOVE_OD2',
          initialSP: 10,
          passives: [
            {
              id: 100107,
              name: 'アプローチショットテスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnRemovingBuff', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.5, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100108,
              name: 'Normal Heal Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  const preview = previewTurn(state, {
    0: { characterId: 'REMOVE_OD2', skillId: 100108 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.ok(
    Math.abs(Number(nextState.turnState.odGauge) - initialOdGauge) < 0.1,
    `OD gauge should not change from passive when no RemoveBuff part: initial=${initialOdGauge}, final=${nextState.turnState.odGauge}`
  );
});

// ─── AdditionalHitOnKillCount + HealSp（クリアリング / 意気軒昂相当） ───

test('AdditionalHitOnKillCount + HealSp: killCount=1 → SP+2（意気軒昂/クリアリング）', () => {
  // killCount 倍率が HealSp に適用される（「敵1体につきSP+2」仕様）
  // killCount=1 → delta = 2×1 = 2
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KILL_SP1',
          characterName: 'KILL_SP1',
          initialSP: 5,
          passives: [
            {
              id: 100109,
              name: '意気軒昂テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100110,
              name: 'Kill Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KILL_SP1', skillId: 100110, killCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'KILL_SP1');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'spChanges should include sp_passive source when kill occurs');
  assert.equal(spChange.delta, 2, 'killCount=1 → delta=2 (2×1)');
});

test('AdditionalHitOnKillCount + HealSp does NOT fire when killCount is 0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KILL_SP2',
          characterName: 'KILL_SP2',
          initialSP: 5,
          passives: [
            {
              id: 100111,
              name: '意気軒昂テスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100112,
              name: 'No-Kill Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KILL_SP2', skillId: 100112, killCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'KILL_SP2');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spChange, 'sp_passive should NOT fire when killCount is 0');
});

test('SpLimitOverwrite (歴戦): applyInitialPassiveState で sp.max が 30 になる', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `SL${idx + 1}`,
      characterName: `SL${idx + 1}`,
      styleId: 2000 + idx,
      styleName: `SLS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 101010300,
                name: '歴戦',
                desc: '自身のSPの上限が30になる',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [{ skill_type: 'SpLimitOverwrite', target_type: 'Self', power: [30, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29000 + idx, name: 'Act', label: `SLSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  assert.equal(state.party[0].sp.max, 20, 'applyInitialPassiveState 前の sp.max は 20');
  applyInitialPassiveState(state);
  assert.equal(state.party[0].sp.max, 30, '歴戦により sp.max が 30 になる');
  assert.equal(state.party[0].sp.current, 20, 'sp.current は変化しない');
  for (let i = 1; i < 6; i++) {
    assert.equal(state.party[i].sp.max, 20, `party[${i}] の sp.max は変化しない`);
  }
});

test('SpLimitOverwrite (歴戦): sp.max 30 になると回復上限も 30 になる', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `SL2${idx + 1}`,
      characterName: `SL2${idx + 1}`,
      styleId: 2100 + idx,
      styleName: `SL2S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 101010301,
                name: '歴戦',
                desc: '自身のSPの上限が30になる',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [{ skill_type: 'SpLimitOverwrite', target_type: 'Self', power: [30, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29050 + idx, name: 'Act', label: `SL2Skill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  applyInitialPassiveState(state);
  assert.equal(state.party[0].sp.max, 30, '歴戦後: sp.max = 30');
  // previewTurn で回復後 sp が 30 上限に収まることを確認
  const preview = previewTurn(state, {
    0: { characterId: 'SL21', skillId: 29050 },
    1: { characterId: 'SL22', skillId: 29051 },
    2: { characterId: 'SL23', skillId: 29052 },
  });
  const actor = preview.actions.find((a) => a.characterId === 'SL21');
  assert.ok(actor, 'SL21 の action が存在する');
  assert.ok(actor.endSP <= 30, `endSP (${actor.endSP}) は sp.max (30) 以下`);
});

test('ルビー・パフューム装備時は battle start で味方全体に HighBoost と sp.max=30 が付く', () => {
  const store = getStore();
  const actor = store.buildCharacterStyle({
    styleId: 1007106,
    partyIndex: 0,
    initialSP: 20,
  });
  const allies = Array.from({ length: 5 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HBALLY${idx + 1}`,
      characterName: `HBALLY${idx + 1}`,
      styleId: 9000 + idx,
      styleName: `HBALLY${idx + 1}`,
      partyIndex: idx + 1,
      position: idx + 1,
      initialSP: 20,
      skills: [createProtectionSkill(8900 + idx)],
    })
  );
  const state = createBattleStateFromParty(new Party([actor, ...allies]));

  applyInitialPassiveState(state);

  for (const member of state.party) {
    assert.equal(member.sp.max, 30, `${member.characterId} should have sp.max 30`);
    assert.equal(
      member.resolveEffectiveStatusEffects('HighBoost').length,
      1,
      `${member.characterId} should have HighBoost status`
    );
  }
  assert.ok(
    (state.turnState.passiveEventsLastApplied ?? []).some((event) =>
      Array.isArray(event.effectTypes) &&
      event.effectTypes.includes('HighBoost') &&
      event.effectTypes.includes('SpLimitOverwrite')
    ),
    'battle start passive log should include HighBoost and SpLimitOverwrite'
  );
});

test('ルビー・パフュームを外すと battle start で HighBoost も sp.max 30 も付かない', () => {
  const store = getStore();
  const equippedSkillIds = store
    .listEquipableSkillsByStyleId(1007106)
    .map((skill) => Number(skill.id))
    .filter((skillId) => skillId !== 46407101);
  const actor = store.buildCharacterStyle({
    styleId: 1007106,
    partyIndex: 0,
    initialSP: 20,
    equippedSkillIds,
  });
  const allies = Array.from({ length: 5 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HBUNEQ${idx + 1}`,
      characterName: `HBUNEQ${idx + 1}`,
      styleId: 9100 + idx,
      styleName: `HBUNEQ${idx + 1}`,
      partyIndex: idx + 1,
      position: idx + 1,
      initialSP: 20,
      skills: [createProtectionSkill(9000 + idx)],
    })
  );
  const state = createBattleStateFromParty(new Party([actor, ...allies]));

  applyInitialPassiveState(state);

  for (const member of state.party) {
    assert.equal(member.sp.max, 20, `${member.characterId} should keep default sp.max`);
    assert.equal(
      member.resolveEffectiveStatusEffects('HighBoost').length,
      0,
      `${member.characterId} should not gain HighBoost when passive is unequipped`
    );
  }
});

test('HighBoost increases SP consumption by 2 without stacking and keeps zero or all-cost skills unchanged', () => {
  const party = createHighBoostManualParty({
    skills: [
      {
        id: 30010,
        name: 'Heavy Skill',
        label: 'HeavySkill',
        sp_cost: 7,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
      {
        id: 30011,
        name: 'Free Skill',
        label: 'FreeSkill',
        sp_cost: 0,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
      {
        id: 30012,
        name: 'All Cost Skill',
        label: 'AllCostSkill',
        sp_cost: -1,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
    ],
    statusEffects: [
      structuredClone(HIGH_BOOST_TEST_STATUS_EFFECT),
      structuredClone(HIGH_BOOST_TEST_STATUS_EFFECT),
    ],
  });
  const state = createBattleStateFromParty(party);

  const heavyPreview = previewTurn(state, {
    0: { characterId: 'HB1', skillId: 30010, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const freePreview = previewTurn(state, {
    0: { characterId: 'HB1', skillId: 30011, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const allCostPreview = previewTurn(state, {
    0: { characterId: 'HB1', skillId: 30012, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });

  assert.equal(findActionByCharacterId(heavyPreview, 'HB1').spCost, 9, 'HighBoost should increase SP cost by 2 once');
  assert.equal(findActionByCharacterId(freePreview, 'HB1').spCost, 0, 'zero-cost skills should remain unchanged');
  assert.equal(findActionByCharacterId(allCostPreview, 'HB1').spCost, -1, 'all-cost skills should remain unchanged');
});

test('HighBoost scales attack-up buffs, enemy debuffs, non-revive DP healing, and damage context metadata', () => {
  const createParty = () => createHighBoostManualParty({
    initialSP: 10,
    baseMaxDp: 100,
    currentDp: 10,
    skills: [
      {
        id: 30020,
        name: 'HighBoost Attack',
        label: 'HighBoostAttack',
        sp_cost: 7,
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
      {
        id: 30021,
        name: 'HighBoost Buff',
        label: 'HighBoostBuff',
        sp_cost: 0,
        parts: [
          {
            skill_type: 'AttackUp',
            target_type: 'Self',
            power: [0.5, 0],
            effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
          },
        ],
      },
      {
        id: 30022,
        name: 'HighBoost Debuff',
        label: 'HighBoostDebuff',
        sp_cost: 0,
        parts: [
          {
            skill_type: 'DefenseDown',
            target_type: 'Single',
            power: [0.5, 0],
            effect: { limitType: 'Only', exitCond: 'EnemyTurnEnd', exitVal: [1, 0] },
          },
        ],
      },
      {
        id: 30023,
        name: 'HighBoost HealSp',
        label: 'HighBoostHealSp',
        sp_cost: 0,
        parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [4, 0] }],
      },
      {
        id: 30024,
        name: 'HighBoost HealDp',
        label: 'HighBoostHealDp',
        sp_cost: 0,
        parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.1, 0], value: [1, 0] }],
      },
    ],
  });

  const attackState = createBattleStateFromParty(createParty());
  const attackPreview = previewTurn(attackState, {
    0: { characterId: 'HB1', skillId: 30020, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  assert.equal(findActionByCharacterId(attackPreview, 'HB1').specialPassiveModifiers.highBoostSkillAtkRate, 1.8);
  const { committedRecord: attackRecord } = commitTurn(attackState, attackPreview);
  assert.equal(findActionByCharacterId(attackRecord, 'HB1').specialPassiveModifiers.highBoostSkillAtkRate, 1.8);

  const buffState = createBattleStateFromParty(createParty());
  const buffPreview = previewTurn(buffState, {
    0: { characterId: 'HB1', skillId: 30021 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: buffRecord } = commitTurn(buffState, buffPreview);
  assert.equal(findActionByCharacterId(buffRecord, 'HB1').statusEffectsApplied[0].power, 0.6);

  const debuffState = createBattleStateFromParty(createParty());
  const debuffPreview = previewTurn(debuffState, {
    0: { characterId: 'HB1', skillId: 30022, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: debuffRecord } = commitTurn(debuffState, debuffPreview);
  assert.equal(findActionByCharacterId(debuffRecord, 'HB1').enemyStatusChanges[0].power, 0.6);

  const healSpState = createBattleStateFromParty(createParty());
  const healSpPreview = previewTurn(healSpState, {
    0: { characterId: 'HB1', skillId: 30023 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: healSpRecord } = commitTurn(healSpState, healSpPreview);
  const healSpChange = findActionByCharacterId(healSpRecord, 'HB1').spChanges.find(
    (change) => change.source === 'active'
  );
  assert.equal(healSpChange?.delta, 4);

  const healDpState = createBattleStateFromParty(createParty());
  const healDpPreview = previewTurn(healDpState, {
    0: { characterId: 'HB1', skillId: 30024 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: healDpRecord } = commitTurn(healDpState, healDpPreview);
  assert.equal(findActionByCharacterId(healDpRecord, 'HB1').dpChanges[0].delta, 15);
});

test('HighBoost does not scale active HealEp or revive effects', () => {
  const createParty = (skills, actorOverrides = {}) => createHighBoostManualParty({
    initialSP: 10,
    initialEP: 0,
    baseMaxDp: 100,
    currentDp: 0,
    skills,
    ...actorOverrides,
  });

  const healEpState = createBattleStateFromParty(createParty([
    {
      id: 30030,
      name: 'HighBoost HealEp',
      label: 'HighBoostHealEp',
      sp_cost: 0,
      parts: [{ skill_type: 'HealEp', target_type: 'Self', power: [4, 0] }],
    },
  ]));
  const healEpPreview = previewTurn(healEpState, {
    0: { characterId: 'HB1', skillId: 30030 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: healEpRecord } = commitTurn(healEpState, healEpPreview);
  assert.equal(findActionByCharacterId(healEpRecord, 'HB1').epChanges[0]?.delta, 4);

  const reviveDpState = createBattleStateFromParty(createParty([
    {
      id: 30031,
      name: 'HighBoost ReviveDp',
      label: 'HighBoostReviveDp',
      sp_cost: 0,
      parts: [{ skill_type: 'ReviveDp', target_type: 'Self', power: [0, 0] }],
    },
  ]));
  const reviveDpPreview = previewTurn(reviveDpState, {
    0: { characterId: 'HB1', skillId: 30031 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: reviveDpRecord } = commitTurn(reviveDpState, reviveDpPreview);
  assert.equal(findActionByCharacterId(reviveDpRecord, 'HB1').dpChanges[0]?.delta, 1);

  const reviveDpRateState = createBattleStateFromParty(createParty([
    {
      id: 30032,
      name: 'HighBoost ReviveDpRate',
      label: 'HighBoostReviveDpRate',
      sp_cost: 0,
      parts: [{ skill_type: 'ReviveDpRate', target_type: 'Self', power: [0.1, 0], value: [1, 0] }],
    },
  ]));
  const reviveDpRatePreview = previewTurn(reviveDpRateState, {
    0: { characterId: 'HB1', skillId: 30032 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });
  const { committedRecord: reviveDpRateRecord } = commitTurn(reviveDpRateState, reviveDpRatePreview);
  assert.equal(findActionByCharacterId(reviveDpRateRecord, 'HB1').dpChanges[0]?.delta, 10);
});

test('HighBoost does not scale passive SP healing effects', () => {
  const party = createHighBoostManualParty({
    initialSP: 10,
    passives: [
      {
        id: 30100,
        name: 'Passive Heal',
        timing: 'OnPlayerTurnStart',
        condition: '',
        parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [4, 0] }],
      },
      {
        id: 30101,
        name: 'Passive Random Heal',
        timing: 'OnPlayerTurnStart',
        condition: '',
        parts: [{ skill_type: 'HealSpRandom', target_type: 'Self', power: [1, 0], value: [4, 0] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);

  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.deepEqual(
    result.spEvents.map((event) => event.delta),
    [4, 4]
  );
  assert.equal(state.party[0].sp.current, 18);
});

test('ReduceSp (OnFirstBattleStart / 蒼天): 全味方スキルコスト -1 が preview に反映される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ST${idx + 1}`,
      characterName: `ST${idx + 1}`,
      styleId: 2200 + idx,
      styleName: `STS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 100210701,
                name: '蒼天',
                desc: '味方全体の消費SPが常時-1',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [{ skill_type: 'ReduceSp', target_type: 'AllyAll', power: [1, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29100 + idx, name: 'Act', label: `STSkill${idx + 1}`, sp_cost: 5, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'ST1', skillId: 29100 },
    1: { characterId: 'ST2', skillId: 29101 },
    2: { characterId: 'ST3', skillId: 29102 },
  });
  assert.equal(preview.actions[0].spCost, 4, 'ST1（蒼天 actor）: spCost 5 → 4');
  assert.equal(preview.actions[1].spCost, 4, 'ST2: spCost 5 → 4');
  assert.equal(preview.actions[2].spCost, 4, 'ST3: spCost 5 → 4');
});

test('ReduceSp (OnFirstBattleStart / 氷天): 氷属性味方のみ -1 適用、非氷属性は変化なし', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `IC${idx + 1}`,
      characterName: `IC${idx + 1}`,
      styleId: 2300 + idx,
      styleName: `ICS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      elements: idx === 1 ? ['Ice'] : [],
      passives:
        idx === 0
          ? [
              {
                id: 100111101,
                name: '氷天',
                desc: '味方全体の氷属性スタイルの消費SPが常時-1',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [
                  {
                    skill_type: 'ReduceSp',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Ice)',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 29200 + idx, name: 'Act', label: `ICSkill${idx + 1}`, sp_cost: 5, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'IC1', skillId: 29200 },
    1: { characterId: 'IC2', skillId: 29201 },
    2: { characterId: 'IC3', skillId: 29202 },
  });
  assert.equal(preview.actions[0].spCost, 5, 'IC1（非氷属性）: spCost 変化なし');
  assert.equal(preview.actions[1].spCost, 4, 'IC2（氷属性）: spCost 5 → 4 (氷天 -1)');
  assert.equal(preview.actions[2].spCost, 5, 'IC3（非氷属性）: spCost 変化なし');
});

test('ReduceSp: 同時成立時は加算せず最大効果のみ採用する（火天-1 と 飛躍-2 なら -2）', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `RD${idx + 1}`,
      characterName: `RD${idx + 1}`,
      styleId: 2360 + idx,
      styleName: `RDS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      elements: idx === 0 ? ['Fire'] : [],
      passives:
        idx === 0
          ? [
              {
                id: 91001,
                name: '火天',
                desc: '味方全体の火属性スタイルの消費SPが常時-1',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [
                  {
                    skill_type: 'ReduceSp',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Fire)',
                    power: [1, 0],
                  },
                ],
              },
              {
                id: 91002,
                name: '飛躍',
                desc: 'オーバードライブ中 自身の消費SPが-2',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29300 + idx, name: 'Act', label: `RDSkill${idx + 1}`, sp_cost: idx === 0 ? 11 : 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'RD1', skillId: 29300 },
  });

  assert.equal(preview.actions[0].spCost, 9, '11 から -2 のみ適用（-1 と -2 の加算はしない）');
});

test('OD中のSP計算順: 半減を先に適用し、その後 ReduceSp(-2) を適用する（12 -> 6 -> 4）', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OS${idx + 1}`,
      characterName: `OS${idx + 1}`,
      styleId: 2400 + idx,
      styleName: `OSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 92001,
                name: '飛躍',
                desc: 'オーバードライブ中 自身の消費SPが-2',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [
        {
          id: 29400 + idx,
          name: 'OdHalfCostSkill',
          label: `OdHalfCostSkill${idx + 1}`,
          sp_cost: idx === 0 ? 12 : 0,
          overwrite: idx === 0 ? 6 : undefined,
          overwrite_cond: idx === 0 ? 'CountBC(IsOverDrive()==1)>0' : '',
          parts: [],
        },
      ],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  state = activateOverdrive(state, 1, 'preemptive');

  const preview = previewTurn(state, {
    0: { characterId: 'OS1', skillId: 29400 },
  });

  assert.equal(preview.actions[0].spCost, 4, 'OD中は 12 を半減して 6、その後 ReduceSp-2 で 4');
  assert.equal(preview.actions[0].startSP, 25, 'OD開始時の基本SP回復(+5)を含む');
  assert.equal(preview.actions[0].endSP, 21);
});

test('ReduceSp (OnFirstBattleStart): applyInitialPassiveState で current SP は変化しない', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `IS${idx + 1}`,
      characterName: `IS${idx + 1}`,
      styleId: 2350 + idx,
      styleName: `ISS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      elements: idx === 1 ? ['Ice'] : [],
      passives:
        idx === 0
          ? [
              {
                id: 100111101,
                name: '氷天',
                desc: '味方全体の氷属性スタイルの消費SPが常時-1',
                timing: 'OnFirstBattleStart',
                condition: '',
                parts: [
                  {
                    skill_type: 'ReduceSp',
                    target_type: 'AllyAll',
                    target_condition: 'IsNatureElement(Ice)',
                    power: [1, 0],
                  },
                ],
              },
            ]
          : [],
      skills: [{ id: 29250 + idx, name: 'Act', label: `ISSkill${idx + 1}`, sp_cost: 5, parts: [] }],
    })
  );

  const state = createBattleStateFromParty(new Party(members));
  const before = state.party.map((member) => member.sp.current);

  applyInitialPassiveState(state);

  const after = state.party.map((member) => member.sp.current);
  assert.deepEqual(after, before, 'ReduceSp は開幕適用で current SP を変化させない');

  const preview = previewTurn(state, {
    0: { characterId: 'IS1', skillId: 29250 },
    1: { characterId: 'IS2', skillId: 29251 },
  });
  assert.equal(preview.actions[0].spCost, 5, 'IS1（非氷属性）: spCost 変化なし');
  assert.equal(preview.actions[1].spCost, 4, 'IS2（氷属性）: spCost 5 → 4 (氷天 -1)');
});

test('ReduceSp (OnAdditionalTurnStart): 追加ターン中のみ自身のスキルコスト -2 が反映される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `QR${idx + 1}`,
      characterName: `QR${idx + 1}`,
      styleId: 2400 + idx,
      styleName: `QRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 100330503,
                name: 'クイックリキャスト',
                desc: '追加ターン中のとき 自身の消費SPが-2',
                timing: 'OnAdditionalTurnStart',
                condition: '',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29300 + idx, name: 'Act', label: `QRSkill${idx + 1}`, sp_cost: 8, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  // 通常ターン: ReduceSp は適用されない
  const previewNormal = previewTurn(state, {
    0: { characterId: 'QR1', skillId: 29300 },
  });
  assert.equal(previewNormal.actions[0].spCost, 8, '通常ターン: spCost 変化なし');

  // 追加ターン: ReduceSp が適用される
  const extraState = grantExtraTurn(state, ['QR1']);
  const previewExtra = previewTurn(extraState, {
    0: { characterId: 'QR1', skillId: 29300 },
  });
  assert.equal(previewExtra.actions[0].spCost, 6, '追加ターン: spCost 8 → 6 (クイックリキャスト -2)');
});

test('HealSp (OnOverdriveStart / Self / 旭日昇天相当): activateOverdrive 後に自身のSPが増加する', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HS${idx + 1}`,
      characterName: `HS${idx + 1}`,
      styleId: 2600 + idx,
      styleName: `HSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      passives:
        idx === 0
          ? [
              {
                id: 100510601,
                name: '旭日昇天',
                desc: 'オーバードライブ開始時 自身のSP+5',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29500 + idx, name: 'Act', label: `HSSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  assert.equal(state.party[0].sp.current, 10, 'OD前: SP = 10');
  state.turnState.odGauge = 100;
  const odState = activateOverdrive(state, 1, 'preemptive');
  assert.equal(odState.party[0].sp.current, 20, 'OD開始後: SP 10 → 20 (OD +5, 旭日昇天 +5)');
  for (let i = 1; i < 6; i++) {
    assert.equal(odState.party[i].sp.current, 15, `party[${i}]: SP 10 → 15 (OD +5)`);
  }
  assert.ok(
    odState.turnState.passiveEventsLastApplied.some((e) => e.passiveName === '旭日昇天'),
    'passiveEvents に旭日昇天が記録されている'
  );
});

test('HealSp (OnOverdriveStart / AllyAll / エクスタシー相当): activateOverdrive 後に全員のSPが増加する', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `EC${idx + 1}`,
      characterName: `EC${idx + 1}`,
      styleId: 2700 + idx,
      styleName: `ECS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      passives:
        idx === 0
          ? [
              {
                id: 100660603,
                name: 'エクスタシー',
                desc: 'オーバードライブ開始時 味方全体のSP+5',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'AllyAll', power: [5, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29600 + idx, name: 'Act', label: `ECSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  const odState = activateOverdrive(state, 1, 'preemptive');
  for (let i = 0; i < 6; i++) {
    assert.equal(odState.party[i].sp.current, 20, `party[${i}]: SP 10 → 20 (OD +5, エクスタシー +5)`);
  }
  assert.ok(
    odState.turnState.passiveEventsLastApplied.some((e) => e.passiveName === 'エクスタシー'),
    'passiveEvents にエクスタシーが記録されている'
  );
});

test('HealSp (OnOverdriveStart): OD開始時HealSpはOD回復と同じ上限（99）で加算される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `HC${idx + 1}`,
      characterName: `HC${idx + 1}`,
      styleId: 2900 + idx,
      styleName: `HCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 18,
      passives:
        idx === 0
          ? [
              {
                id: 100510602,
                name: '旭日昇天',
                desc: 'オーバードライブ開始時 自身のSP+5',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [5, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29800 + idx, name: 'Act', label: `HCSkill${idx + 1}`, sp_cost: 0, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;
  const odState = activateOverdrive(state, 1, 'preemptive');
  assert.equal(odState.party[0].sp.current, 28, 'OD既定回復 +5 の後に OnOverdriveStart HealSp +5 が加算される');
});

test('AttackUp (OnOverdriveStart / 専心相当): OD中の preview に attackUpRate が反映される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `SS${idx + 1}`,
      characterName: `SS${idx + 1}`,
      styleId: 2800 + idx,
      styleName: `SSS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 100510303,
                name: '専心',
                desc: 'オーバードライブ開始時 前衛にいると 自身のスキル攻撃力+20%',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29700 + idx, name: 'Act', label: `SSSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  // 通常ターン: attackUpRate は 0
  const previewNormal = previewTurn(state, {
    0: { characterId: 'SS1', skillId: 29700 },
  });
  assert.equal(
    Number(previewNormal.actions[0].specialPassiveModifiers?.attackUpRate ?? 0),
    0,
    '通常ターン: attackUpRate = 0'
  );

  // OD中: attackUpRate = 0.2
  state.turnState.odGauge = 100;
  const odState = activateOverdrive(state, 1, 'preemptive');
  assert.equal(odState.turnState.turnType, 'od', 'OD状態確認');
  const previewOd = previewTurn(odState, {
    0: { characterId: 'SS1', skillId: 29700 },
  });
  assert.equal(
    previewOd.actions[0].specialPassiveModifiers?.attackUpRate,
    0.2,
    'OD中: attackUpRate = 0.2 (専心 +20%)'
  );
  assert.ok(
    (previewOd.actions[0].specialPassiveEvents ?? []).some((e) => e.passiveName === '専心'),
    'specialPassiveEvents に専心が記録されている'
  );
});

test('ReduceSp (OnOverdriveStart): OD中のみ自身のスキルコスト -2 が反映される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OV${idx + 1}`,
      characterName: `OV${idx + 1}`,
      styleId: 2500 + idx,
      styleName: `OVS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 100510603,
                name: '飛躍',
                desc: 'オーバードライブ中 自身の消費SPが-2',
                timing: 'OnOverdriveStart',
                condition: '',
                parts: [{ skill_type: 'ReduceSp', target_type: 'Self', power: [2, 0] }],
              },
            ]
          : [],
      skills: [{ id: 29400 + idx, name: 'Act', label: `OVSkill${idx + 1}`, sp_cost: 8, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  // 通常ターン: ReduceSp は適用されない
  const previewNormal = previewTurn(state, {
    0: { characterId: 'OV1', skillId: 29400 },
  });
  assert.equal(previewNormal.actions[0].spCost, 8, '通常ターン: spCost 変化なし');

  // OD中: ReduceSp が適用される
  state.turnState.odGauge = 100;
  const odState = activateOverdrive(state, 1, 'preemptive');
  assert.equal(odState.turnState.turnType, 'od', 'OD 状態確認');
  const previewOd = previewTurn(odState, {
    0: { characterId: 'OV1', skillId: 29400 },
  });
  assert.equal(previewOd.actions[0].spCost, 6, 'OD中: spCost 8 → 6 (飛躍 -2)');
});

test('AttackUpPerToken (Self / 高揚相当): トークン数に応じて attackUpRate が増加する', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `KK${idx + 1}`,
      characterName: `KK${idx + 1}`,
      styleId: 3000 + idx,
      styleName: `KKS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: idx === 0 ? 2 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 100210403,
                name: '高揚',
                desc: '行動開始時 前衛にいると トークン1つにつき 攻撃力+5%',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'AttackUpPerToken', target_type: 'Self', power: [0.05, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30000 + idx, name: 'Act', label: `KKSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  // token=2 → attackUpRate = 0.10
  const preview = previewTurn(state, {
    0: { characterId: 'KK1', skillId: 30000 },
  });
  assert.equal(
    preview.actions[0].specialPassiveModifiers?.attackUpPerTokenRate,
    0.1,
    'attackUpPerTokenRate = token(2) × 0.05 = 0.10'
  );
  assert.ok(
    (preview.actions[0].specialPassiveEvents ?? []).some((e) => e.passiveName === '高揚'),
    'specialPassiveEvents に高揚が記録されている'
  );
});

test('AttackUpPerToken (Self / 高揚相当): token=0 のとき attackUpRate への寄与は 0', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `KK2${idx + 1}`,
      characterName: `KK2${idx + 1}`,
      styleId: 3100 + idx,
      styleName: `KK2S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: 0,
      passives:
        idx === 0
          ? [
              {
                id: 100210404,
                name: '高揚',
                desc: '行動開始時 前衛にいると トークン1つにつき 攻撃力+5%',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'AttackUpPerToken', target_type: 'Self', power: [0.05, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30100 + idx, name: 'Act', label: `KK2Skill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'KK21', skillId: 30100 },
  });
  assert.equal(
    Number(preview.actions[0].specialPassiveModifiers?.attackUpPerTokenRate ?? 0),
    0,
    'token=0 のとき attackUpPerTokenRate = 0'
  );
});

test('AttackUpPerToken (AllyAll / 激励相当): actor のトークンが味方全体の attackUpRate に反映される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `GK${idx + 1}`,
      characterName: `GK${idx + 1}`,
      styleId: 3200 + idx,
      styleName: `GKS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: idx === 0 ? 3 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 100410803,
                name: '激励',
                desc: '行動開始時 自身のトークン1つにつき 味方全体の攻撃力+3%',
                timing: 'OnPlayerTurnStart',
                condition: '',
                parts: [{ skill_type: 'AttackUpPerToken', target_type: 'AllyAll', power: [0.03, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30200 + idx, name: 'Act', label: `GKSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  // GK1(actor, token=3) → 全前衛の attackUpPerTokenRate = 0.09
  const preview = previewTurn(state, {
    0: { characterId: 'GK1', skillId: 30200 },
    1: { characterId: 'GK2', skillId: 30201 },
    2: { characterId: 'GK3', skillId: 30202 },
  });
  for (let i = 0; i < 3; i++) {
    assert.equal(
      preview.actions[i].specialPassiveModifiers?.attackUpPerTokenRate,
      0.09,
      `GK${i + 1}: attackUpPerTokenRate = actor token(3) × 0.03 = 0.09`
    );
  }
});

test('AttackUpPerToken (IsFront condition): 後衛メンバーへの preview では適用されない', () => {
  // 後衛（position=3）の actor は IsFront() = false なので passive が発動しない
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `BK${idx + 1}`,
      characterName: `BK${idx + 1}`,
      styleId: 3300 + idx,
      styleName: `BKS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: idx === 3 ? 5 : 0,
      passives:
        idx === 3
          ? [
              {
                id: 100210405,
                name: '高揚',
                desc: '行動開始時 前衛にいると トークン1つにつき 攻撃力+5%',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'AttackUpPerToken', target_type: 'Self', power: [0.05, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30300 + idx, name: 'Act', label: `BKSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  // 前衛（BK1）の preview を確認 → 後衛 actor の passive は発動しない
  const preview = previewTurn(state, {
    0: { characterId: 'BK1', skillId: 30300 },
  });
  assert.equal(
    Number(preview.actions[0].specialPassiveModifiers?.attackUpPerTokenRate ?? 0),
    0,
    '後衛 actor (position=3) の IsFront() 条件不成立 → attackUpPerTokenRate = 0'
  );
});

test('DefenseUpPerToken (Self / 鉄壁相当): トークン数に応じて defenseUpPerTokenRate が設定される', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `TW${idx + 1}`,
      characterName: `TW${idx + 1}`,
      styleId: 3400 + idx,
      styleName: `TWS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: idx === 0 ? 2 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 100420105,
                name: '鉄壁',
                desc: '敵行動開始時 前衛にいると トークン1つにつき 防御力+7%',
                timing: 'OnEnemyTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'DefenseUpPerToken', target_type: 'Self', power: [0.07, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30400 + idx, name: 'Act', label: `TWSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'TW1', skillId: 30400 },
  });
  assert.equal(
    preview.actions[0].specialPassiveModifiers?.defenseUpPerTokenRate,
    0.14,
    'defenseUpPerTokenRate = token(2) × 0.07 = 0.14'
  );
  assert.ok(
    (preview.actions[0].specialPassiveEvents ?? []).some((e) => e.passiveName === '鉄壁'),
    'specialPassiveEvents に鉄壁が記録されている'
  );
});

test('AttackUpPerToken + AttackUp の合算: specialPassiveModifiers.attackUpRate が両方の合計になる', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `CM${idx + 1}`,
      characterName: `CM${idx + 1}`,
      styleId: 3500 + idx,
      styleName: `CMS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      initialToken: idx === 0 ? 3 : 0,
      passives:
        idx === 0
          ? [
              {
                id: 200001,
                name: 'テスト攻撃上昇',
                desc: 'OnEveryTurnIncludeSpecial: 自身の攻撃力+10%',
                timing: 'OnEveryTurnIncludeSpecial',
                condition: '',
                parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.1, 0] }],
              },
              {
                id: 200002,
                name: '高揚',
                desc: 'OnPlayerTurnStart: トークン1つにつき 攻撃力+5%',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'AttackUpPerToken', target_type: 'Self', power: [0.05, 0] }],
              },
            ]
          : [],
      skills: [{ id: 30500 + idx, name: 'Act', label: `CMSkill${idx + 1}`, sp_cost: 4, parts: [] }],
    })
  );
  const state = createBattleStateFromParty(new Party(members));
  const preview = previewTurn(state, {
    0: { characterId: 'CM1', skillId: 30500 },
  });
  // attackUpRate = AttackUp(0.1) + AttackUpPerToken(3 × 0.05 = 0.15) = 0.25
  assert.ok(
    Math.abs(preview.actions[0].specialPassiveModifiers.attackUpRate - 0.25) < 1e-9,
    `attackUpRate = 0.25 (AttackUp 0.10 + AttackUpPerToken 0.15), got ${preview.actions[0].specialPassiveModifiers.attackUpRate}`
  );
  assert.ok(
    Math.abs(preview.actions[0].specialPassiveModifiers.attackUpPerTokenRate - 0.15) < 1e-9,
    `breakdown: attackUpPerTokenRate = 0.15, got ${preview.actions[0].specialPassiveModifiers.attackUpPerTokenRate}`
  );
});

test('support DamageRateUp resolves as resonanceDestructionRateBonus without merging AttackUp', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `DR${idx + 1}`,
      characterName: `DR${idx + 1}`,
      styleId: 3600 + idx,
      styleName: `DRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 20,
      passives:
        idx === 0
          ? [
              {
                id: 272000151,
                name: 'Fly High!',
                desc: '自身のスキル攻撃時の破壊率上昇量+30% かつ スキル攻撃力+30%',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                sourceType: 'support',
                parts: [
                  { skill_type: 'DamageRateUp', target_type: 'Self', power: [0.3, 0] },
                  { skill_type: 'AttackUp', target_type: 'Self', power: [0.3, 0] },
                ],
              },
              {
                id: 272000999,
                name: '通常枠DamageRateUp',
                desc: 'support 以外の DamageRateUp は共鳴破壊率として扱わない',
                timing: 'OnPlayerTurnStart',
                condition: 'IsFront()',
                parts: [{ skill_type: 'DamageRateUp', target_type: 'Self', power: [0.9, 0] }],
              },
            ]
          : [],
      skills: [
        {
          id: 30600 + idx,
          name: 'Act',
          label: `DRSkill${idx + 1}`,
          sp_cost: 4,
          parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 10 } }],
        },
      ],
    })
  );
  const state = createBattleStateFromParty(new Party(members));

  const preview = previewTurn(state, {
    0: { characterId: 'DR1', skillId: 30600, targetEnemyIndex: 0 },
  });
  const action = preview.actions[0];

  assert.equal(action.specialPassiveModifiers.resonanceDestructionRateBonus, 0.3);
  assert.equal(action.specialPassiveModifiers.attackUpRate, 0);
  assert.ok(
    (action.specialPassiveEvents ?? []).some(
      (event) =>
        event.passiveName === 'Fly High!' &&
        event.effectType === 'DamageRateUp' &&
        event.resonanceDestructionRateBonus === 0.3
    ),
    'specialPassiveEvents に共鳴 DamageRateUp が記録されている'
  );

  const { committedRecord } = commitTurn(state, preview);
  const committedAction = committedRecord.actions[0];
  assert.equal(committedAction.specialPassiveModifiers.resonanceDestructionRateBonus, 0.3);
  assert.equal(committedAction.damageContext?.resonanceDestructionRateBonus, 0.3);
});

// ─────────────────────────────────────────────────────────────
// SP条件スキル（cond: Sp()...）テスト
// 仕様: docs/specs/sp_condition_skill_spec.md
// ─────────────────────────────────────────────────────────────

function buildSpCondTestParty(actorOverrides) {
  const members = Array.from({ length: 6 }, (_, idx) => {
    const isActor = idx === 0;
    return new CharacterStyle({
      characterId: `SC${idx + 1}`,
      characterName: `SC${idx + 1}`,
      styleId: 3000 + idx,
      styleName: `SCS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      ...(isActor ? actorOverrides : {}),
    });
  });
  return new Party(members);
}

test('スキル cond Sp()<0: SP >= 0 のとき previewTurn がエラーをスローする', () => {
  const party = buildSpCondTestParty({
    initialSP: 0,
    skills: [
      {
        id: 46008209,
        name: '春の宵の塵に同じ',
        label: 'LShanhuaSkill53',
        sp_cost: 0,
        cond: 'Sp()<0',
        parts: [{ skill_type: 'FixedHpDamageRateAttack', target_type: 'Single', power: [0.15, 0] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'SC1', skillId: 46008209 } }),
    /cannot be used because cond is not satisfied/,
    'SP = 0 では Sp()<0 条件を満たさないためエラー'
  );
});

test('スキル cond Sp()<0: SP < 0 のとき（spMin 設定済み）previewTurn が成功する', () => {
  const party = buildSpCondTestParty({
    initialSP: -3,
    spMin: -5,
    skills: [
      {
        id: 46008209,
        name: '春の宵の塵に同じ',
        label: 'LShanhuaSkill53',
        sp_cost: 0,
        cond: 'Sp()<0',
        parts: [{ skill_type: 'FixedHpDamageRateAttack', target_type: 'Single', power: [0.15, 0] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, { 0: { characterId: 'SC1', skillId: 46008209 } });
  assert.equal(preview.actions[0].startSP, -3, 'startSP = -3');
  assert.equal(preview.actions[0].endSP, -3, 'sp_cost: 0 なので SP 変化なし');
  assert.equal(preview.actions[0].spCost, 0, 'spCost = 0');
});

test('スキル cond Sp()<0: SP = -5 のとき（sp.min = -5 の下限）preview が成功する', () => {
  const party = buildSpCondTestParty({
    initialSP: -5,
    spMin: -5,
    skills: [
      {
        id: 46008209,
        name: '春の宵の塵に同じ',
        label: 'LShanhuaSkill53',
        sp_cost: 0,
        cond: 'Sp()<0',
        parts: [{ skill_type: 'FixedHpDamageRateAttack', target_type: 'Single', power: [0.15, 0] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, { 0: { characterId: 'SC1', skillId: 46008209 } });
  assert.equal(preview.actions[0].startSP, -5, 'startSP = -5');
});

test('スキル cond Sp()>0 + sp_cost -1: SP = 0 のとき previewTurn がエラーをスローする', () => {
  const party = buildSpCondTestParty({
    initialSP: 0,
    skills: [
      {
        id: 46007514,
        name: '疾きこと風の如し',
        label: 'INatsumeSkill53',
        sp_cost: -1,
        cond: 'Sp()>0',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'SC1', skillId: 46007514 } }),
    /cannot be used because cond is not satisfied/,
    'SP = 0 では Sp()>0 条件を満たさないためエラー'
  );
});

test('スキル cond Sp()>0 + sp_cost -1: SP > 0 のとき全 SP を消費して endSP = 0 になる', () => {
  const party = buildSpCondTestParty({
    initialSP: 15,
    skills: [
      {
        id: 46007514,
        name: '疾きこと風の如し',
        label: 'INatsumeSkill53',
        sp_cost: -1,
        cond: 'Sp()>0',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, { 0: { characterId: 'SC1', skillId: 46007514 } });
  assert.equal(preview.actions[0].startSP, 15, 'startSP = 15');
  assert.equal(preview.actions[0].endSP, 0, 'sp_cost=-1 の全SP消費により endSP = 0');
  assert.equal(preview.actions[0].spCost, -1, 'スキル定義の spCost = -1 がそのまま出力される');
});

test('スキル cond Sp()>0 + sp_cost -1: SP = 1 のとき全 SP を消費して endSP = 0 になる', () => {
  const party = buildSpCondTestParty({
    initialSP: 1,
    skills: [
      {
        id: 46007514,
        name: '疾きこと風の如し',
        label: 'INatsumeSkill53',
        sp_cost: -1,
        cond: 'Sp()>0',
        parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, { 0: { characterId: 'SC1', skillId: 46007514 } });
  assert.equal(preview.actions[0].startSP, 1);
  assert.equal(preview.actions[0].endSP, 0, 'SP 1 を全消費 → endSP = 0');
});

test('スキル cond Sp()>19: SP = 19 のとき previewTurn がエラーをスローする', () => {
  const party = buildSpCondTestParty({
    initialSP: 19,
    skills: [
      {
        id: 46007513,
        name: 'アオナツの夢',
        label: 'INatsumeSkill05',
        sp_cost: 0,
        cond: 'Sp()>19',
        parts: [{ skill_type: 'BuffCharge', target_type: 'Self', power: [0.2, 0.3] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  assert.throws(
    () => previewTurn(state, { 0: { characterId: 'SC1', skillId: 46007513 } }),
    /cannot be used because cond is not satisfied/,
    'SP = 19 では Sp()>19 条件を満たさないためエラー'
  );
});

test('スキル cond Sp()>19: SP = 20 のとき previewTurn が成功する（sp_cost: 0）', () => {
  const party = buildSpCondTestParty({
    initialSP: 20,
    skills: [
      {
        id: 46007513,
        name: 'アオナツの夢',
        label: 'INatsumeSkill05',
        sp_cost: 0,
        cond: 'Sp()>19',
        parts: [{ skill_type: 'BuffCharge', target_type: 'Self', power: [0.2, 0.3] }],
      },
    ],
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, { 0: { characterId: 'SC1', skillId: 46007513 } });
  assert.equal(preview.actions[0].startSP, 20, 'startSP = 20');
  assert.equal(preview.actions[0].endSP, 20, 'sp_cost: 0 なので SP 変化なし');
});

// --- 未実装バフ状態条件パッシブの誤発動修正テスト ---

test('未実装 SpecialStatusCountByType 条件のパッシブは発動しない', () => {
  // statusType 144（歌姫の加護）は未実装 → unknown → パッシブを発動させない
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          passives: [
            {
              id: 99001,
              name: 'レゾナンス',
              desc: '歌姫の加護状態のとき SP+2',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(144)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  applyPassiveTiming(state, 'OnPlayerTurnStart');

  const member = state.party.find((item) => item.characterId === 'M1');
  assert.equal(member.sp.current, 5, '未実装状態条件のため SP は増加しない');
});

test('実装済み SpecialStatusCountByType(20) 条件のパッシブは isExtraActive=true のとき発動する', () => {
  // statusType 20（追加ターン状態）は実装済み → known → isExtraActive=true なら発動
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          passives: [
            {
              id: 99002,
              name: '速弾き追加SP',
              desc: '追加ターン状態のとき SP+2',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(20)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  // 追加ターン状態を付与
  const member = state.party.find((item) => item.characterId === 'M1');
  member.isExtraActive = true;

  applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(member.sp.current, 7, 'isExtraActive=true のため SP+2 が適用される');
});

// ─── T06〜T13: SpecialStatusCountByType 状態の付与・判定・解除テスト ───

// ヘルパー: specialStatusTypeId が typeId で active なエントリ数を返す
function countActiveSpecialStatus(member, typeId) {
  return member.statusEffects.filter(
    (e) =>
      Number(e.metadata?.specialStatusTypeId) === typeId &&
      (String(e.exitCond) === 'Eternal' || Number(e.remaining) > 0)
  ).length;
}

test('Passive.Start_Charge01 applies battle-start BuffCharge and SP+3 for frontline real data', () => {
  const store = getStore();
  const state = applyInitialPassiveState(
    createBattleStateFromParty(buildStartChargeRealDataParty(store, 0))
  );
  const actor = state.party[0];
  const openingEvent = state.turnState.passiveEventsLastApplied.find(
    (event) => Number(event.passiveId) === START_CHARGE_PASSIVE_ID && event.characterId === actor.characterId
  );

  assert.equal(
    actor.sp.current,
    START_CHARGE_INITIAL_SP +
      START_CHARGE_SP_DELTA +
      START_CHARGE_TURN_SP_DELTA +
      START_CHARGE_CONDITIONAL_TURN_SP_DELTA
  );
  assert.equal(countActiveSpecialStatus(actor, BUFF_CHARGE_SPECIAL_STATUS_ID), 1);
  assert.ok(openingEvent, 'Passive.Start_Charge01 event should be recorded');
  assert.deepEqual(openingEvent.effectTypes, ['BuffCharge', 'HealSp']);
  assert.equal(openingEvent.spDelta, START_CHARGE_SP_DELTA);
  assert.deepEqual(
    openingEvent.appliedStatusEffects.map((effect) => ({
      characterId: effect.characterId,
      statusType: effect.statusType,
      exitCond: effect.exitCond,
      remaining: effect.remaining,
    })),
    [
      {
        characterId: actor.characterId,
        statusType: 'BuffCharge',
        exitCond: 'Count',
        remaining: 1,
      },
    ]
  );
});

test('Passive.Start_Charge01 does not apply while the real-data style starts in backline', () => {
  const store = getStore();
  const backlinePosition = 3;
  const state = applyInitialPassiveState(
    createBattleStateFromParty(buildStartChargeRealDataParty(store, backlinePosition))
  );
  const actor = state.party[backlinePosition];
  const openingEvent = state.turnState.passiveEventsLastApplied.find(
    (event) => Number(event.passiveId) === START_CHARGE_PASSIVE_ID && event.characterId === actor.characterId
  );

  assert.equal(actor.sp.current, START_CHARGE_INITIAL_SP);
  assert.equal(countActiveSpecialStatus(actor, BUFF_CHARGE_SPECIAL_STATUS_ID), 0);
  assert.equal(openingEvent, undefined);
});

test('伊達朱里[幸運ふゆうらら] applies NegativeState on first battle start and Self Aid removes it', () => {
  const store = getStore();
  let state = applyInitialPassiveState(
    createBattleStateFromParty(buildAdateFuyuUraraSelfAidParty(store))
  );
  const actor = state.party[0];
  const negativeState = actor.statusEffects.find(
    (effect) => Number(effect.metadata?.specialStatusTypeId) === NEGATIVE_STATE_SPECIAL_STATUS_ID
  );
  const openingEvent = state.turnState.passiveEventsLastApplied.find(
    (event) => Number(event.passiveId) === ADATE_NEGATIVE_STYLE_PASSIVE_ID && event.characterId === actor.characterId
  );

  assert.equal(negativeState?.statusType, 'NegativeState');
  assert.equal(negativeState?.exitCond, 'EnemyTurnEnd');
  assert.equal(negativeState?.remaining, NEGATIVE_STATE_DURATION_TURNS);
  assert.equal(countActiveSpecialStatus(actor, NEGATIVE_STATE_SPECIAL_STATUS_ID), 1);
  assert.ok(openingEvent, '生きててごめんなさい should be recorded during initial passive state');
  assert.deepEqual(openingEvent.appliedStatusEffects.map((effect) => effect.statusType), ['NegativeState']);

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: SELF_AID_SKILL_ID },
  });
  assert.equal(findActionByCharacterId(preview, actor.characterId).removeDebuffCount, 1);

  state = commitTurn(state, preview).nextState;
  const cleanedActor = state.party.find((member) => member.characterId === actor.characterId);

  assert.equal(countActiveSpecialStatus(cleanedActor, NEGATIVE_STATE_SPECIAL_STATUS_ID), 0);
  assert.equal(
    cleanedActor.statusEffects.some(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === NEGATIVE_STATE_SPECIAL_STATUS_ID
    ),
    false
  );
});

test('伊達朱里[幸運ふゆうらら] NegativeState can be removed by ally debuff cleanse skills', () => {
  const store = getStore();
  let state = applyInitialPassiveState(
    createBattleStateFromParty(buildAdateFuyuUraraAllyCleanseParty(store))
  );
  const negativeActor = state.party[0];
  const cleanser = state.party[1];

  assert.equal(countActiveSpecialStatus(negativeActor, NEGATIVE_STATE_SPECIAL_STATUS_ID), 1);

  const preview = previewTurn(state, {
    1: { characterId: cleanser.characterId, skillId: ALLY_DEBUFF_CLEANSE_SKILL_ID },
  });
  assert.equal(findActionByCharacterId(preview, cleanser.characterId).removeDebuffCount, 1);

  state = commitTurn(state, preview).nextState;
  const cleanedActor = state.party.find((member) => member.characterId === negativeActor.characterId);

  assert.equal(countActiveSpecialStatus(cleanedActor, NEGATIVE_STATE_SPECIAL_STATUS_ID), 0);
});

test('大島二以奈[渚のピュアメモリー] applies Makeup on first battle start and unlocks Makeup conditions', () => {
  const store = getStore();
  const state = createBattleStateFromParty(buildNiOhshimaMakeupParty(store));

  assert.equal(countActiveSpecialStatus(state.party[0], MAKEUP_SPECIAL_STATUS_ID), 0);
  assert.equal(
    previewActorSkill(state, NIOHSHIMA_ODOR_TOILETTE_SKILL_ID).actions[0].spCost,
    NIOHSHIMA_ODOR_TOILETTE_BASE_SP_COST
  );

  applyInitialPassiveState(state);

  const actor = state.party[0];
  const makeupEffect = actor.statusEffects.find(
    (effect) => Number(effect.metadata?.specialStatusTypeId) === MAKEUP_SPECIAL_STATUS_ID
  );
  const openingEvent = state.turnState.passiveEventsLastApplied.find(
    (event) => Number(event.passiveId) === NIOHSHIMA_MAKEUP_PASSIVE_ID && event.characterId === actor.characterId
  );

  assert.equal(countActiveSpecialStatus(actor, MAKEUP_SPECIAL_STATUS_ID), 1);
  assert.equal(makeupEffect?.statusType, 'Makeup');
  assert.equal(makeupEffect?.exitCond, 'Eternal');
  assert.equal(makeupEffect?.remaining, 0);
  assert.equal(Number(makeupEffect?.sourceSkillId), NIOHSHIMA_MAKEUP_PASSIVE_ID);
  assert.ok(openingEvent, 'Passive.Condition_MakeUp01 event should be recorded');
  assert.deepEqual(openingEvent.effectTypes, ['Makeup']);
  assert.deepEqual(
    openingEvent.appliedStatusEffects.map((effect) => ({
      characterId: effect.characterId,
      statusType: effect.statusType,
      statusTypeId: effect.statusTypeId,
      exitCond: effect.exitCond,
      remaining: effect.remaining,
    })),
    [
      {
        characterId: actor.characterId,
        statusType: 'Makeup',
        statusTypeId: MAKEUP_SPECIAL_STATUS_ID,
        exitCond: 'Eternal',
        remaining: 0,
      },
    ]
  );
  assert.equal(
    previewActorSkill(state, NIOHSHIMA_ODOR_TOILETTE_SKILL_ID).actions[0].spCost,
    NIOHSHIMA_ODOR_TOILETTE_MAKEUP_SP_COST
  );
});

test('共鳴アビリティ[素敵な夜] applies Mocktail and scales DP healing by support LB', () => {
  const store = getStore();
  const state = createBattleStateFromParty(buildMocktailSupportParty(store));
  const actor = state.party[0];
  actor.setDpState({
    baseMaxDp: MOCKTAIL_TEST_BASE_MAX_DP,
    currentDp: MOCKTAIL_TEST_START_DP,
    effectiveDpCap: MOCKTAIL_TEST_BASE_MAX_DP,
  });
  addMocktailTestHealSkill(actor);

  assert.equal(countActiveSpecialStatus(actor, MOCKTAIL_SPECIAL_STATUS_ID), 0);

  applyInitialPassiveState(state);

  const mocktailEffect = actor.statusEffects.find(
    (effect) => Number(effect.metadata?.specialStatusTypeId) === MOCKTAIL_SPECIAL_STATUS_ID
  );
  const openingEvent = state.turnState.passiveEventsLastApplied.find(
    (event) => Number(event.passiveId) === MOCKTAIL_SUPPORT_PASSIVE_ID_LB4 && event.characterId === actor.characterId
  );

  assert.equal(countActiveSpecialStatus(actor, MOCKTAIL_SPECIAL_STATUS_ID), 1);
  assert.equal(mocktailEffect?.statusType, 'Mocktail');
  assert.equal(mocktailEffect?.exitCond, 'Eternal');
  assert.equal(mocktailEffect?.remaining, 0);
  assert.equal(mocktailEffect?.power, MOCKTAIL_SUPPORT_LB4_HEAL_UP_RATE);
  assert.equal(mocktailEffect?.metadata?.dpHealMultiplier, MOCKTAIL_SUPPORT_LB4_HEAL_MULTIPLIER);
  assert.equal(Number(mocktailEffect?.sourceSkillId), MOCKTAIL_SUPPORT_PASSIVE_ID_LB4);
  assert.ok(openingEvent, 'SupportSkill_IrOhshima01 Mocktail event should be recorded');
  assert.equal(openingEvent.sourceType, 'support');
  assert.deepEqual(openingEvent.effectTypes, ['Mocktail']);
  assert.deepEqual(
    openingEvent.appliedStatusEffects.map((effect) => ({
      characterId: effect.characterId,
      statusType: effect.statusType,
      statusTypeId: effect.statusTypeId,
      power: effect.power,
      exitCond: effect.exitCond,
      remaining: effect.remaining,
    })),
    [
      {
        characterId: actor.characterId,
        statusType: 'Mocktail',
        statusTypeId: MOCKTAIL_SPECIAL_STATUS_ID,
        power: MOCKTAIL_SUPPORT_LB4_HEAL_UP_RATE,
        exitCond: 'Eternal',
        remaining: 0,
      },
    ]
  );

  const preview = previewTurn(state, {
    0: {
      characterId: actor.characterId,
      skillId: MOCKTAIL_TEST_HEAL_DP_RATE_SKILL_ID,
    },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const healedActor = nextState.party[0];
  const actorRecord = committedRecord.actions.find((action) => action.characterId === actor.characterId);
  const dpChange = actorRecord?.dpChanges.find(
    (change) =>
      change.triggerType === 'DirectDpHeal' &&
      change.skillType === 'HealDpRate' &&
      change.targetCharacterId === actor.characterId
  );

  assert.equal(actorRecord?.specialPassiveModifiers?.giveHealUpRate, MOCKTAIL_SUPPORT_LB4_HEAL_UP_RATE);
  assert.equal(dpChange?.delta, MOCKTAIL_TEST_HEAL_DP_DELTA);
  assert.equal(healedActor.dpState.currentDp, MOCKTAIL_TEST_HEAL_DP_DELTA);
});

test('料理バフ4種 applies Eternal food statuses and exposes skill attack / damage-heal modifiers', () => {
  const store = getStore();

  for (const foodCase of FOOD_BUFF_CASES) {
    const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, foodCase.skillId));
    const actor = state.party[0];
    addFoodBuffTestAttackSkill(actor);

    assert.equal(countActiveSpecialStatus(actor, foodCase.statusTypeId), 0, `${foodCase.statusType} should start inactive`);
    assert.equal(
      previewActorSkill(state, FOOD_BUFF_TEST_ATTACK_SKILL_ID).actions[0].specialPassiveModifiers.foodBuffAttackUpRate,
      0,
      `${foodCase.statusType} should not affect attacks before the food skill is committed`
    );

    const foodPreview = previewActorSkill(state, foodCase.skillId);
    const { nextState, committedRecord } = commitTurn(state, foodPreview);
    const foodAction = committedRecord.actions.find((action) => action.characterId === actor.characterId);

    assert.equal(foodAction?.skillName, foodCase.skillName);
    const foodStatusEffectsApplied = (foodAction?.statusEffectsApplied ?? []).filter(
      (effect) => effect.statusType === foodCase.statusType
    );
    assert.equal(foodStatusEffectsApplied.length, 6);
    assert.equal(
      foodStatusEffectsApplied.every(
        (effect) =>
          effect.statusType === foodCase.statusType &&
          effect.statusTypeId === foodCase.statusTypeId &&
          effect.exitCond === 'Eternal' &&
          effect.remaining === 0 &&
          effect.power === FOOD_BUFF_ATTACK_UP_RATE &&
          effect.healDpByDamageRate === FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE
      ),
      true,
      `${foodCase.statusType} should be applied to all allies as an Eternal food status`
    );
    for (const member of nextState.party) {
      assert.equal(countActiveSpecialStatus(member, foodCase.statusTypeId), 1);
      const effect = member.statusEffects.find(
        (item) => Number(item.metadata?.specialStatusTypeId) === foodCase.statusTypeId
      );
      assert.equal(effect?.statusType, foodCase.statusType);
      assert.equal(effect?.metadata?.attackUpRate, FOOD_BUFF_ATTACK_UP_RATE);
      assert.equal(effect?.metadata?.healDpByDamageRate, FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE);
    }

    const nextActor = nextState.party[0];
    const normalSkill = nextActor.skills.find(
      (skill) => Number(skill.skillId) === FOOD_BUFF_TEST_NORMAL_ATTACK_SKILL_ID
    );
    assert.ok(normalSkill, 'normal attack skill should exist in real-data party');
    const normalPreview = previewActorSkill(nextState, normalSkill.skillId);
    assert.equal(normalPreview.actions[0].specialPassiveModifiers.foodBuffAttackUpRate, 0);
    assert.equal(normalPreview.actions[0].specialPassiveModifiers.foodBuffHealDpByDamageRate, 0);

    const attackPreview = previewActorSkill(nextState, FOOD_BUFF_TEST_ATTACK_SKILL_ID);
    const attackAction = attackPreview.actions[0];
    assert.equal(attackAction.specialPassiveModifiers.foodBuffAttackUpRate, FOOD_BUFF_ATTACK_UP_RATE);
    assert.equal(attackAction.specialPassiveModifiers.foodBuffHealDpByDamageRate, FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE);
    assert.ok(attackAction.specialPassiveModifiers.attackUpRate >= FOOD_BUFF_ATTACK_UP_RATE);
    assert.equal(
      attackAction.activeStatusEffects.some((effect) => effect.statusType === foodCase.statusType),
      true
    );

    const { committedRecord: attackRecord } = commitTurn(nextState, attackPreview);
    const committedAttack = attackRecord.actions.find((action) => action.characterId === nextActor.characterId);
    const foodDpChange = committedAttack?.dpChanges.find(
      (change) =>
        change.source === 'food_buff' &&
        change.triggerType === 'HealDpByDamage' &&
        change.skillType === 'HealDpByDamage'
    );
    assert.equal(committedAttack?.damageContext?.foodBuffAttackUpRate, FOOD_BUFF_ATTACK_UP_RATE);
    assert.equal(committedAttack?.damageContext?.foodBuffHealDpByDamageRate, FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE);
    assert.equal(foodDpChange?.delta, 0);
    assert.equal(foodDpChange?.isAmountResolved, false);
    assert.equal(foodDpChange?.healDpByDamageRate, FOOD_BUFF_HEAL_DP_BY_DAMAGE_RATE);
    assert.equal(foodDpChange?.foodBuffStatusEffects[0]?.statusType, foodCase.statusType);
  }
});

test('料理バフは異なる料理状態同士で重複してスキル攻撃補正を合算する', () => {
  const store = getStore();
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, 46008611, {
    extraStyleIds: [findStyleIdBySkillId(store, 46008409)],
    buildOptions: {
      skillSetsByPartyIndex: {
        0: [46008611],
        1: [46008409],
      },
    },
  }));
  addFoodBuffTestAttackSkill(state.party[0]);

  const shchiPreview = previewTurn(state, {
    0: {
      characterId: state.party[0].characterId,
      skillId: 46008611,
      targetEnemyIndex: 0,
    },
  });
  const { nextState: afterShchi } = commitTurn(state, shchiPreview);
  const curryPreview = previewTurn(afterShchi, {
    1: {
      characterId: afterShchi.party[1].characterId,
      skillId: 46008409,
      targetEnemyIndex: 0,
    },
  });
  const { nextState: afterCurry } = commitTurn(afterShchi, curryPreview);
  const actor = afterCurry.party[0];

  assert.equal(countActiveSpecialStatus(actor, 304), 1);
  assert.equal(countActiveSpecialStatus(actor, 303), 1);

  const attackPreview = previewActorSkill(afterCurry, FOOD_BUFF_TEST_ATTACK_SKILL_ID);
  const action = attackPreview.actions[0];
  assert.equal(action.specialPassiveModifiers.foodBuffAttackUpRate, 1);
  assert.equal(action.specialPassiveModifiers.foodBuffHealDpByDamageRate, 0.2);
  assert.equal(action.specialPassiveModifiers.attackUpRate, 1);

  const { committedRecord } = commitTurn(afterCurry, attackPreview);
  const committedAction = committedRecord.actions.find((entry) => entry.characterId === actor.characterId);
  const foodDpChange = committedAction?.dpChanges.find((change) => change.source === 'food_buff');
  assert.equal(committedAction?.damageContext?.foodBuffAttackUpRate, 1);
  assert.equal(committedAction?.damageContext?.foodBuffHealDpByDamageRate, 0.2);
  assert.equal(foodDpChange?.healDpByDamageRate, 0.2);
  assert.deepEqual(
    foodDpChange?.foodBuffStatusEffects.map((effect) => effect.statusType).sort(),
    ['Curry', 'Shchi']
  );
});

test('流れ星に唄えば applies Diva and grants skill attack up to non-normal damage skills', () => {
  const store = getStore();
  const state = createBattleStateFromParty(buildSingleSkillRealDataParty(store, DIVA_SKILL_ID));
  const target = state.party[1];
  addFoodBuffTestAttackSkill(target);

  assert.equal(countActiveSpecialStatus(target, DIVA_SPECIAL_STATUS_ID), 0);

  const divaPreview = previewActorSkill(state, DIVA_SKILL_ID);
  const { nextState, committedRecord } = commitTurn(state, divaPreview);
  const divaAction = findActionByCharacterId(committedRecord, state.party[0].characterId);
  const appliedEffects = (divaAction?.statusEffectsApplied ?? []).filter(
    (effect) => effect.statusType === 'Diva'
  );

  assert.equal(appliedEffects.length, 6);
  assert.equal(
    appliedEffects.every(
      (effect) =>
        effect.statusTypeId === DIVA_SPECIAL_STATUS_ID &&
        effect.exitCond === 'PlayerTurnEnd' &&
        effect.remaining === 5 &&
        effect.power === DIVA_SKILL_ATTACK_UP_RATE
    ),
    true
  );

  const refreshedTarget = nextState.party.find((member) => member.characterId === target.characterId);
  assert.equal(countActiveSpecialStatus(refreshedTarget, DIVA_SPECIAL_STATUS_ID), 1);
  const divaEffect = refreshedTarget.statusEffects.find(
    (effect) => Number(effect.metadata?.specialStatusTypeId) === DIVA_SPECIAL_STATUS_ID
  );
  assert.equal(divaEffect?.metadata?.skillAttackUpRate, DIVA_SKILL_ATTACK_UP_RATE);

  const normalPreview = previewMemberSkill(nextState, refreshedTarget, FOOD_BUFF_TEST_NORMAL_ATTACK_SKILL_ID);
  const normalAction = findActionByCharacterId(normalPreview, refreshedTarget.characterId);
  assert.equal(normalAction?.specialPassiveModifiers?.divaSkillAttackUpRate, 0);

  const attackPreview = previewMemberSkill(nextState, refreshedTarget, FOOD_BUFF_TEST_ATTACK_SKILL_ID);
  const attackAction = findActionByCharacterId(attackPreview, refreshedTarget.characterId);
  assert.equal(attackAction?.specialPassiveModifiers?.divaSkillAttackUpRate, DIVA_SKILL_ATTACK_UP_RATE);
  assert.ok(Number(attackAction?.specialPassiveModifiers?.attackUpRate ?? 0) >= DIVA_SKILL_ATTACK_UP_RATE);
  assert.equal(
    attackAction?.activeStatusEffects.some(
      (effect) =>
        effect.statusType === 'Diva' &&
        effect.statusTypeId === DIVA_SPECIAL_STATUS_ID &&
        effect.skillAttackUpRate === DIVA_SKILL_ATTACK_UP_RATE
    ),
    true
  );

  const { committedRecord: attackRecord } = commitTurn(nextState, attackPreview);
  const committedAttack = findActionByCharacterId(attackRecord, refreshedTarget.characterId);
  assert.equal(committedAttack?.damageContext?.divaSkillAttackUpRate, DIVA_SKILL_ATTACK_UP_RATE);
});

test('Babied オギャり状態 applies to allies except self and increases skill attack / OD gain for skill attacks', () => {
  const store = getStore();
  const state = createBattleStateFromParty(buildRmurohushiBabiedParty(store));
  const actor = state.party[0];
  const target = state.party[1];
  addBabiedTestAttackSkills(target);

  assert.equal(countActiveSpecialStatus(actor, BABIED_SPECIAL_STATUS_ID), 0);
  assert.equal(countActiveSpecialStatus(target, BABIED_SPECIAL_STATUS_ID), 0);

  const babiedPreview = previewMemberSkill(state, actor, BABIED_MASTER_SKILL_ID);
  const { nextState, committedRecord } = commitTurn(state, babiedPreview);
  const babiedAction = findActionByCharacterId(committedRecord, actor.characterId);
  const appliedEffects = (babiedAction?.statusEffectsApplied ?? []).filter(
    (effect) => effect.statusType === 'Babied'
  );

  assert.equal(appliedEffects.length, 5);
  assert.equal(countActiveSpecialStatus(nextState.party[0], BABIED_SPECIAL_STATUS_ID), 0);
  for (const member of nextState.party.slice(1)) {
    assert.equal(countActiveSpecialStatus(member, BABIED_SPECIAL_STATUS_ID), 1);
    const effect = member.statusEffects.find(
      (item) => Number(item.metadata?.specialStatusTypeId) === BABIED_SPECIAL_STATUS_ID
    );
    assert.equal(effect?.statusType, 'Babied');
    assert.equal(effect?.exitCond, 'PlayerTurnEnd');
    assert.equal(effect?.remaining, BABIED_DURATION_TURNS - 1);
    assert.equal(effect?.power, BABIED_SKILL_ATTACK_UP_RATE);
    assert.equal(effect?.metadata?.skillAttackUpRate, BABIED_SKILL_ATTACK_UP_RATE);
    assert.equal(effect?.metadata?.odGaugeGainUpRate, BABIED_OD_GAUGE_GAIN_UP_RATE);
  }

  const refreshedActor = nextState.party[0];
  const refreshPreview = previewMemberSkill(nextState, refreshedActor, BABIED_MASTER_SKILL_ID);
  const { nextState: refreshedState } = commitTurn(nextState, refreshPreview);
  const refreshedTarget = refreshedState.party[1];
  assert.equal(countActiveSpecialStatus(refreshedTarget, BABIED_SPECIAL_STATUS_ID), 1);
  assert.equal(
    refreshedTarget.statusEffects.find(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === BABIED_SPECIAL_STATUS_ID
    )?.remaining,
    BABIED_DURATION_TURNS - 1
  );

  const normalPreview = previewMemberSkill(
    refreshedState,
    refreshedTarget,
    BABIED_TEST_NORMAL_ATTACK_SKILL_ID
  );
  const normalAction = findActionByCharacterId(normalPreview, refreshedTarget.characterId);
  assert.equal(normalAction?.specialPassiveModifiers?.babiedSkillAttackUpRate, 0);
  assert.equal(normalAction?.specialPassiveModifiers?.babiedOdGaugeGainUpRate, 0);

  const attackPreview = previewMemberSkill(refreshedState, refreshedTarget, BABIED_TEST_ATTACK_SKILL_ID);
  const attackAction = findActionByCharacterId(attackPreview, refreshedTarget.characterId);
  assert.equal(attackAction?.specialPassiveModifiers?.babiedSkillAttackUpRate, BABIED_SKILL_ATTACK_UP_RATE);
  assert.equal(attackAction?.specialPassiveModifiers?.babiedOdGaugeGainUpRate, BABIED_OD_GAUGE_GAIN_UP_RATE);
  assert.ok(Number(attackAction?.specialPassiveModifiers?.attackUpRate ?? 0) >= BABIED_SKILL_ATTACK_UP_RATE);
  assert.equal(
    attackAction?.activeStatusEffects.some(
      (effect) =>
        effect.statusType === 'Babied' &&
        effect.skillAttackUpRate === BABIED_SKILL_ATTACK_UP_RATE &&
        effect.odGaugeGainUpRate === BABIED_OD_GAUGE_GAIN_UP_RATE
    ),
    true
  );

  const { nextState: afterAttack, committedRecord: attackRecord } = commitTurn(refreshedState, attackPreview);
  const committedAttack = findActionByCharacterId(attackRecord, refreshedTarget.characterId);
  assert.equal(committedAttack?.odGaugeGain, BABIED_TEST_ATTACK_OD_GAIN);
  assert.equal(committedAttack?.damageContext?.babiedSkillAttackUpRate, BABIED_SKILL_ATTACK_UP_RATE);
  assert.equal(committedAttack?.damageContext?.babiedOdGaugeGainUpRate, BABIED_OD_GAUGE_GAIN_UP_RATE);
  assert.equal(afterAttack.turnState.odGauge, BABIED_TEST_ATTACK_OD_GAIN);
  assert.equal(
    afterAttack.party[1].statusEffects.find(
      (effect) => Number(effect.metadata?.specialStatusTypeId) === BABIED_SPECIAL_STATUS_ID
    )?.remaining,
    BABIED_DURATION_TURNS - 2
  );
});

test('T06: BuffCharge(25) — commitTurnで付与・パッシブ発動・次スキル使用で解除', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30001,
              name: 'BuffChargeSkill',
              label: 'TestBuffCharge',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'BuffCharge',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
            { id: 30002, name: 'Attack', label: 'TestAtk', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
          passives: [
            {
              id: 91001,
              name: '充填',
              desc: 'チャージ状態のとき SP+1',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(25)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト: BuffChargeスキル使用後に状態が付与される
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30001 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 25), 1, 'BuffCharge後にspecialStatus(25)が付与される');

  // 判定テスト: SpecialStatusCountByType(25)>0 パッシブが発動する
  const spBefore = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  const spAfter = state.party.find((m) => m.characterId === 'M1').sp.current;
  assert.equal(spAfter - spBefore, 1, 'チャージ状態のときパッシブ(充填)が発動してSP+1');

  // 解除テスト: 次スキル使用後にチャージ状態が消える
  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30002 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 25), 0, 'スキル使用後にチャージ状態が解除される');
});

test('T06-B: BuffCharge(25) — 通常攻撃では消費されず、与ダメージスキルで消費される', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30101,
              name: 'BuffChargeSkill',
              label: 'TestBuffCharge2',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'BuffCharge',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
            {
              id: 30102,
              name: '通常攻撃',
              label: 'TestAttackNormal',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
            {
              id: 30103,
              name: 'Attack',
              label: 'TestDamageSkill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30101 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 25), 1, 'BuffCharge付与後はチャージ状態が残る');

  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30102 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 25), 1, '通常攻撃ではチャージ状態が消費されない');

  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30103 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 25), 0, '与ダメージスキル使用でチャージ状態が消費される');
});

test('T06-C: 特殊状態バフ全種監査 — Count型は通常攻撃/非ダメージで消費されず、与ダメージで消費される', () => {
  const cases = [
    { skillType: 'BuffCharge', typeId: 25 },
    { skillType: 'MindEye', typeId: 78 },
    { skillType: 'Dodge', typeId: 122 },
    { skillType: 'ShadowClone', typeId: 125 },
    { skillType: 'Diva', typeId: 144 },
    { skillType: 'NegativeMind', typeId: 146 },
    { skillType: 'Makeup', typeId: 164 },
  ];

  for (const [idx, testCase] of cases.entries()) {
    const baseId = 30200 + idx * 10;
    const party = createSixMemberManualParty((memberIdx) =>
      memberIdx === 0
        ? {
            initialSP: 5,
            skills: [
              {
                id: baseId + 1,
                name: `${testCase.skillType}Skill`,
                label: `Test${testCase.skillType}`,
                sp_cost: 0,
                parts: [
                  {
                    skill_type: testCase.skillType,
                    target_type: 'Self',
                    effect: { exitCond: 'Count', exitVal: [1, 0] },
                  },
                ],
              },
              {
                id: baseId + 2,
                name: '通常攻撃',
                label: `Test${testCase.skillType}AttackNormal`,
                sp_cost: 0,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
              {
                id: baseId + 3,
                name: 'Protection',
                label: `Test${testCase.skillType}Protection`,
                sp_cost: 0,
                parts: [{ skill_type: 'Protection', target_type: 'Self' }],
              },
              {
                id: baseId + 4,
                name: 'DamageSkill',
                label: `Test${testCase.skillType}DamageSkill`,
                sp_cost: 0,
                hit_count: 1,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              },
            ],
          }
        : {}
    );

    let state = createBattleStateFromParty(party);

    let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 1 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      1,
      `${testCase.skillType}: 付与後はアクティブ`
    );

    preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 2 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      1,
      `${testCase.skillType}: 通常攻撃では消費されない`
    );

    preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 3 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      1,
      `${testCase.skillType}: 非ダメージスキルでは消費されない`
    );

    preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 4 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      0,
      `${testCase.skillType}: 与ダメージスキルで消費される`
    );
  }
});

test('T06-D: 特殊状態バフ全種監査 — Eternal型は与ダメージでも消費されない', () => {
  const cases = [
    { skillType: 'EternalOath', typeId: 124 },
    { skillType: 'BIYamawakiServant', typeId: 155 },
  ];

  for (const [idx, testCase] of cases.entries()) {
    const baseId = 30300 + idx * 10;
    const party = createSixMemberManualParty((memberIdx) =>
      memberIdx === 0
        ? {
            initialSP: 5,
            skills: [
              {
                id: baseId + 1,
                name: `${testCase.skillType}Skill`,
                label: `Test${testCase.skillType}`,
                sp_cost: 0,
                parts: [
                  {
                    skill_type: testCase.skillType,
                    target_type: 'Self',
                    effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                  },
                ],
              },
              {
                id: baseId + 2,
                name: 'DamageSkill',
                label: `Test${testCase.skillType}DamageSkill`,
                sp_cost: 0,
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }],
              },
            ],
          }
        : {}
    );

    let state = createBattleStateFromParty(party);
    let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 1 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      1,
      `${testCase.skillType}: 付与後はアクティブ`
    );

    preview = previewTurn(state, { 0: { characterId: 'M1', skillId: baseId + 2 } });
    state = commitTurn(state, preview).nextState;
    assert.equal(
      countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), testCase.typeId),
      1,
      `${testCase.skillType}: Eternal型は与ダメージでも消費されない`
    );
  }
});

test('T07: MindEye(78) — commitTurnで付与・パッシブ発動・次スキル使用で解除', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30011,
              name: 'MindEyeSkill',
              label: 'TestMindEye',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'MindEye',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
            { id: 30012, name: 'Attack', label: 'TestAtk2', sp_cost: 0, hitCount: 1, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
          passives: [
            {
              id: 91002,
              name: '心眼の境地',
              desc: '前衛&心眼状態のとき スキル攻撃力+15%',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(78)>0&&IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30011 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 78), 1, 'MindEye後にspecialStatus(78)が付与される');

  // 判定テスト
  const spBefore = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(state.party.find((m) => m.characterId === 'M1').sp.current - spBefore, 1, '心眼状態のときパッシブが発動');

  // 解除テスト
  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30012 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 78), 0, 'スキル使用後に心眼状態が解除される');

  // Diagnostic: Check if attrib upassive modifiers are set (this test verifies if condition evaluation is working)
  applyPassiveTiming(state,'OnPlayerTurnStart');  // Try again to confirm condition evaluation
});

test('T07-diagnostic: MindEye(78) passives modifiers diagnostic', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 20,
          skills: [
            {
              id: 30011,
              name: 'MindEyeSkill',
              label: 'TestMindEye',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'MindEye',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 91003,
              name: 'TestMindEyeAttackUp',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(78)>0&&IsFront()',
              parts: [{ skill_type: 'AttackUp', target_type: 'Self', power: [0.15, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // Step 1: MindEye を付与
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30011 } });
  state = commitTurn(state, preview).nextState;
  const m1 = state.party.find((m) => m.characterId === 'M1');
  assert.equal(countActiveSpecialStatus(m1, 78), 1, 'MindEye condition 観測step 1');

  // Step 2: applyPassiveTiming で passiveEvents の attackUpRate を検証
  const result = applyPassiveTiming(state, 'OnPlayerTurnStart');
  const attackUpEvent = result.passiveEvents?.find(
    (e) => e.passiveId === 91003 && e.attackUpRate > 0
  );

  assert.ok(
    attackUpEvent !== undefined && attackUpEvent.attackUpRate >= 0.14,
    `PassiveEvent に AttackUp が記録されている (value=${attackUpEvent?.attackUpRate})`
  );
});

test('T07b: MindEye(78) — SpecialStatusCountByType(78)>0 条件下でのスキル攻撃力 +15% 検証', () => {
  // MindEye(78) 条件付き AttackUp パッシブの条件評価を検証
  // OnEveryTurn タイミングで applyPassiveTiming の passiveEvents に attackUpRate が反映されることを確認
  
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 20,
          skills: [
            {
              id: 30011,
              name: 'MindEyeSkill',
              label: 'TestMindEye',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'MindEye',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 91002,
              name: 'TestMindEyePassive',
              timing: 'OnEveryTurn',
              condition: 'SpecialStatusCountByType(78)>0',
              parts: [
                {
                  skill_type: 'AttackUp',
                  target_type: 'Self',
                  power: [0.15, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // Step 1: MindEye を付与
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30011 } });
  state = commitTurn(state, preview).nextState;
  
  const m1Before = state.party.find((m) => m.characterId === 'M1');
  assert.equal(countActiveSpecialStatus(m1Before, 78), 1, 'MindEye 付与確認');

  // Step 2: applyPassiveTiming で passiveEvents を取得し、AttackUp が反映されていることを検証
  const result = applyPassiveTiming(state, 'OnEveryTurn');
  const attackUpEvent = result.passiveEvents?.find(
    (e) => e.passiveId === 91002 && e.attackUpRate > 0
  );
  
  assert.ok(
    attackUpEvent !== undefined &&
    attackUpEvent.attackUpRate >= 0.14 &&
    attackUpEvent.attackUpRate <= 0.16,
    `PassiveEvent に AttackUp が記録されている (value=${attackUpEvent?.attackUpRate})`
  );
});

test('T08: Dodge(122) — commitTurnで前衛全員に付与・解除', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30021,
              name: 'DodgeSkill',
              label: 'TestDodge',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'Dodge',
                  target_type: 'AllyFront',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
              ],
            },
            { id: 30022, name: 'Attack', label: 'TestAtk3', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト: AllyFront（前衛3人）全員にDodge状態が付与される
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30021 } });
  state = commitTurn(state, preview).nextState;
  const frontMembers = state.party.filter((m) => Number(m.position) <= 2);
  for (const m of frontMembers) {
    assert.equal(countActiveSpecialStatus(m, 122), 1, `前衛 ${m.characterId} にDodge(122)が付与される`);
  }

  // 解除テスト: スキル使用後にM1のDodge状態が消える
  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30022 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 122), 0, 'スキル使用後にM1のDodge状態が解除される');
});

test('T09: ShadowClone(125) — exitVal=[2,0]: 2スキル使用後に解除', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30031,
              name: 'ShadowCloneSkill',
              label: 'TestShadowClone',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'ShadowClone',
                  target_type: 'Self',
                  effect: { exitCond: 'Count', exitVal: [2, 0] },
                },
              ],
            },
            { id: 30032, name: 'Attack', label: 'TestAtk4', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30031 } });
  state = commitTurn(state, preview).nextState;
  const m1 = state.party.find((m) => m.characterId === 'M1');
  const shadow = m1.statusEffects.find((e) => Number(e.metadata?.specialStatusTypeId) === 125);
  assert.ok(shadow, '影分身状態が付与される');
  assert.equal(shadow.remaining, 2, 'exitVal=[2,0] なので remaining=2');

  // 1回スキル使用 → remaining=1
  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30032 } });
  state = commitTurn(state, preview).nextState;
  const shadow2 = state.party.find((m) => m.characterId === 'M1').statusEffects.find((e) => Number(e.metadata?.specialStatusTypeId) === 125);
  assert.ok(shadow2, '1回使用後も影分身状態が残る');
  assert.equal(shadow2.remaining, 1, '1回使用後はremaining=1');

  // 2回目スキル使用 → 解除
  preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30032 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 125), 0, '2回使用後に影分身状態が解除される');
});

test('T10: Diva(144) — PlayerTurnEnd型: commitTurn×6後に解除・パッシブ(レゾナンス相当)が加護中のみ発動', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30041,
              name: 'DivaSkill',
              label: 'TestDiva',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'Diva',
                  target_type: 'AllyAll',
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [5, 0] },
                },
              ],
            },
            { id: 30042, name: 'Attack', label: 'TestAtk5', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
          passives: [
            {
              id: 91003,
              name: 'レゾナンス相当',
              desc: '歌姫の加護状態のとき SP+2',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(144)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト: DivaスキルでAllyAll（全員）に付与される
  let preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30041 } });
  state = commitTurn(state, preview).nextState;
  for (const m of state.party) {
    assert.equal(countActiveSpecialStatus(m, 144), 1, `全員(${m.characterId})にDiva(144)が付与される`);
  }

  // 判定テスト: 加護状態のとき、加護中のみパッシブが発動
  const spBefore = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(state.party.find((m) => m.characterId === 'M1').sp.current - spBefore, 2, '歌姫の加護中にパッシブが発動してSP+2');

  // 解除テスト: 5ターン後（PlayerTurnEnd×5）に状態が消える
  // commitTurn のたびに PlayerTurnEnd がデクリメントされる
  for (let i = 0; i < 5; i++) {
    preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30042 } });
    state = commitTurn(state, preview).nextState;
  }
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 144), 0, '5ターン後にDiva状態が解除される');

  // 加護解除後はパッシブが発動しない
  const spBefore2 = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(state.party.find((m) => m.characterId === 'M1').sp.current - spBefore2, 0, '歌姫の加護解除後はパッシブが発動しない');
});

test('T11: Makeup(164) — direct applySpecialStatus path triggers condition and Count expiry', () => {
  // Direct付与経路でも SpecialStatusCountByType(164) 条件と Count 消費が機能することを固定する
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            { id: 30051, name: 'Attack', label: 'TestAtk6', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
          passives: [
            {
              id: 91004,
              name: '耽美',
              desc: '前衛&メイクアップ状態のとき スキル攻撃力+50%',
              timing: 'OnPlayerTurnStart',
              condition: 'SpecialStatusCountByType(164)>0&&IsFront()',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [2, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  const m1 = state.party.find((m) => m.characterId === 'M1');

  // 付与テスト: applySpecialStatus直接呼び出し
  m1.applySpecialStatus(164, 1, 'Count', {});
  assert.equal(countActiveSpecialStatus(m1, 164), 1, 'applySpecialStatus(164)で状態が付与される');

  // 判定テスト: 前衛&メイクアップ状態のときパッシブが発動
  const spBefore = m1.sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(m1.sp.current - spBefore, 2, 'メイクアップ状態のときパッシブが発動してSP+2');

  // 解除テスト: スキル使用後にメイクアップ状態が消える
  const preview = previewTurn(state, { 0: { characterId: 'M1', skillId: 30051 } });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M1'), 164), 0, 'スキル使用後にメイクアップ状態が解除される');
});

test('T12: EternalOath(124) — Eternal型: commitTurnで付与・解除なし・CountBCパッシブ発動', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30061,
              name: 'EternalOathSkill',
              label: 'TestEternalOath',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'EternalOath',
                  target_type: 'AllySingleWithoutSelf',
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
            { id: 30062, name: 'Attack', label: 'TestAtk7', sp_cost: 0, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
          ],
          passives: [
            {
              id: 91005,
              name: 'エンゲージリンク相当',
              desc: '前衛にいると 永遠なる誓い状態の味方がいるときSP+1',
              timing: 'OnPlayerTurnStart',
              condition: 'IsFront()&&CountBC(IsPlayer()&&SpecialStatusCountByType(124)>0)>0',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);

  // 付与テスト: 対象メンバー（M2）にEternalOathが付与される
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 30061, targetCharacterId: 'M2' },
  });
  state = commitTurn(state, preview).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M2'), 124), 1, 'M2にEternalOath(124)が付与される');

  // Eternal型は複数ターン経過しても消えない
  const preview2 = previewTurn(state, { 0: { characterId: 'M1', skillId: 30062 } });
  state = commitTurn(state, preview2).nextState;
  assert.equal(countActiveSpecialStatus(state.party.find((m) => m.characterId === 'M2'), 124), 1, 'Eternal型なので2ターン後も状態が残る');

  // CountBCパッシブ発動テスト: 永遠なる誓い状態の味方がいるときM1のパッシブが発動
  const spBefore = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(state.party.find((m) => m.characterId === 'M1').sp.current - spBefore, 1, '永遠なる誓い状態の味方がいるとき前衛M1のパッシブが発動');
});

test('T13: BIYamawakiServant(155) — Eternal型: 複数付与・CountBC(>=6)判定', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          skills: [
            {
              id: 30071,
              name: 'ServantSkill',
              label: 'TestServant',
              sp_cost: 0,
              parts: [
                {
                  skill_type: 'BIYamawakiServant',
                  target_type: 'AllySingleWithoutSelf',
                  effect: { exitCond: 'Eternal', exitVal: [0, 0] },
                },
              ],
            },
          ],
          passives: [
            {
              id: 91006,
              name: '魔王軍の大攻勢相当',
              desc: 'しもべ6人以上のとき OD+100%相当',
              timing: 'OnPlayerTurnStart',
              condition: 'CountBC(IsPlayer()&&SpecialStatusCountByType(155)>=1)>=6',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // 6人全員に手動でBIYamawakiServant状態を付与
  for (const m of state.party) {
    m.applySpecialStatus(155, 0, 'Eternal', {});
  }

  // CountBC(>=6)テスト: 6人全員がしもべ状態のときパッシブが発動
  const spBefore = state.party.find((m) => m.characterId === 'M1').sp.current;
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(state.party.find((m) => m.characterId === 'M1').sp.current - spBefore, 3, 'しもべ状態6人以上のときパッシブが発動してSP+3');
});

test('SkillCondition variants use CountBC thresholds and same-action Before Funnel for OD gain', () => {
  const skillId = 30072;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 20,
          drivePiercePercent: 15,
          skills: [
            {
              id: skillId,
              name: 'Servant Mega Destroyer',
              label: 'TestServantMegaDestroyer',
              sp_cost: 0,
              hit_count: 10,
              target_type: 'Single',
              parts: [
                {
                  skill_type: 'SkillCondition',
                  cond: 'CountBC(IsPlayer() == 1 && SpecialStatusCountByType(155) >= 1)<=4',
                  strval: [
                    {
                      name: '下僕1人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
                    },
                    {
                      name: '下僕2人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
                    },
                    {
                      name: '下僕3人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
                    },
                    {
                      name: '下僕4人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' }],
                    },
                    {
                      name: '下僕5人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [
                        { skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' },
                        {
                          skill_type: 'Funnel',
                          target_type: 'Self',
                          power: [3, 0],
                          value: [0.25, 0],
                          hits: [{ id: 1, type: 'Before', power_ratio: 0 }],
                          effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                        },
                      ],
                    },
                    {
                      name: '下僕6人',
                      hit_count: 10,
                      target_type: 'Single',
                      sp_cost: 0,
                      parts: [
                        { skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab' },
                        {
                          skill_type: 'Funnel',
                          target_type: 'Self',
                          power: [3, 0],
                          value: [0.25, 0],
                          hits: [{ id: 1, type: 'Before', power_ratio: 0 }],
                          effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                        },
                        {
                          skill_type: 'Funnel',
                          target_type: 'Self',
                          power: [3, 0],
                          value: [0.25, 0],
                          hits: [{ id: 2, type: 'Before', power_ratio: 0 }],
                          effect: { limitType: 'Default', exitCond: 'Count', exitVal: [1, 0] },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  for (const member of state.party) {
    member.applySpecialStatus(155, 0, 'Eternal', {});
  }

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId, targetEnemyIndex: 0 },
  });
  const action = findActionByCharacterId(preview, 'M1');
  assert.equal(action.skillFunnelHitBonus, 6);
  assert.equal(action.skillHitCount, 16);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const committed = findActionByCharacterId(committedRecord, 'M1');
  assert.equal(committed.odGaugeGain, 45.92);
  assert.equal(committed.damageContext.funnelHitBonus, 6);
  assert.equal(nextState.party[0].getFunnelEffects({ activeOnly: true }).length, 0);
});

test('T12b: EternalOath(124) + エンゲージリンク — AllyAll+target_conditionで誓い状態のメンバーのみSP+1', () => {
  // 実際のエンゲージリンク (清廉なるニヴェースタ) のデータを模倣:
  //   condition: IsFront() && CountBC(IsPlayer() && SpecialStatusCountByType(124)>0)>0
  //   target_type: AllyAll, target_condition: SpecialStatusCountByType(124)>0, power: [1, 0]
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          passives: [
            {
              id: 92001,
              name: 'エンゲージリンク相当(AllyAll)',
              desc: '前衛にいるとき 永遠なる誓い状態の味方がいれば 誓い状態の全員にSP+1',
              timing: 'OnEveryTurn',
              condition: 'IsFront()&&CountBC(IsPlayer()&&SpecialStatusCountByType(124)>0)>0',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'AllyAll',
                  target_condition: 'SpecialStatusCountByType(124)>0',
                  power: [1, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const m1 = state.party.find((m) => m.characterId === 'M1');
  const m2 = state.party.find((m) => m.characterId === 'M2');
  const m3 = state.party.find((m) => m.characterId === 'M3');

  // EternalOath状態なし → CountBC=0 → passive条件不成立 → 誰もSP変化なし
  const sp1Before = m1.sp.current;
  const sp2Before = m2.sp.current;
  applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(m1.sp.current - sp1Before, 0, '誓い状態なし: M1のSP変化なし');
  assert.equal(m2.sp.current - sp2Before, 0, '誓い状態なし: M2のSP変化なし');

  // M2だけEternalOath状態付与 → M1のpassiveが発動、target_conditionでM2のみSP+1
  m2.applySpecialStatus(124, 0, 'Eternal', {});
  const sp1Before2 = m1.sp.current;
  const sp2Before2 = m2.sp.current;
  const sp3Before2 = m3.sp.current;
  applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(m1.sp.current - sp1Before2, 0, '誓い状態なし: M1はtarget_conditionで除外されSP変化なし');
  assert.equal(m2.sp.current - sp2Before2, 1, '誓い状態あり: M2はtarget_conditionを満たしSP+1');
  assert.equal(m3.sp.current - sp3Before2, 0, '誓い状態なし: M3はtarget_conditionで除外されSP変化なし');
});

test('T13b: BIYamawakiServant(155) + 世界を滅ぼすお手伝い — target_conditionでしもべ状態のメンバーのみSP+1', () => {
  // 実際の「世界を滅ぼすお手伝いでゲス！」(悪の軍団進軍開始でゲス！) のデータを模倣:
  //   condition: CountBC(IsPlayer() && SpecialStatusCountByType(155) > 0)>0
  //   target_type: AllyAll, target_condition: SpecialStatusCountByType(155) > 0, power: [1, 0]
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          passives: [
            {
              id: 92002,
              name: '世界を滅ぼすお手伝いでゲス！相当',
              desc: 'しもべ状態の味方がいるとき しもべ状態の全員にSP+1',
              timing: 'OnEveryTurn',
              condition: 'CountBC(IsPlayer()&&SpecialStatusCountByType(155)>0)>0',
              parts: [
                {
                  skill_type: 'HealSp',
                  target_type: 'AllyAll',
                  target_condition: 'SpecialStatusCountByType(155)>0',
                  power: [1, 0],
                },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const m1 = state.party.find((m) => m.characterId === 'M1');
  const m2 = state.party.find((m) => m.characterId === 'M2');
  const m3 = state.party.find((m) => m.characterId === 'M3');

  // しもべ状態なし → CountBC=0 → passive条件不成立 → 誰もSP変化なし
  const sp1Before = m1.sp.current;
  applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(m1.sp.current - sp1Before, 0, 'しもべ状態なし: SP変化なし');

  // M1とM2にしもべ状態付与 → M1のpassiveが発動、M1/M2はSP+1、M3はSP変化なし
  m1.applySpecialStatus(155, 0, 'Eternal', {});
  m2.applySpecialStatus(155, 0, 'Eternal', {});
  const sp1Before2 = m1.sp.current;
  const sp2Before2 = m2.sp.current;
  const sp3Before2 = m3.sp.current;
  applyPassiveTiming(state, 'OnEveryTurn');
  assert.equal(m1.sp.current - sp1Before2, 1, 'しもべ状態あり: M1はtarget_conditionを満たしSP+1');
  assert.equal(m2.sp.current - sp2Before2, 1, 'しもべ状態あり: M2はtarget_conditionを満たしSP+1');
  assert.equal(m3.sp.current - sp3Before2, 0, 'しもべ状態なし: M3はtarget_conditionで除外されSP変化なし');
});

test('T13c: BIYamawakiServant(155) — OnFirstBattleStart自己付与でCountBC条件のOD加算が成立する', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 5,
        passives: [
          {
            id: 92021,
            name: '魔王様降臨！相当',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [
              {
                skill_type: 'BIYamawakiServant',
                target_type: 'Self',
                effect: { exitCond: 'Eternal', exitVal: [0, 0] },
              },
            ],
          },
          {
            id: 92022,
            name: '魔王軍の大攻勢！相当',
            timing: 'OnEveryTurn',
            condition: 'CountBC(IsPlayer() && SpecialStatusCountByType(155) >= 1)>=2',
            parts: [{ skill_type: 'OverDrivePointUp', target_type: 'Self', power: [1, 0] }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        passives: [
          {
            id: 92023,
            name: '直属の使い魔でゲス！相当',
            timing: 'OnFirstBattleStart',
            condition: '',
            parts: [
              {
                skill_type: 'BIYamawakiServant',
                target_type: 'Self',
                effect: { exitCond: 'Eternal', exitVal: [0, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });

  const state = createBattleStateFromParty(party);
  const odBeforeInitialPassive = Number(state.turnState.odGauge ?? 0);
  applyInitialPassiveState(state);

  const m1 = state.party.find((m) => m.characterId === 'M1');
  const m2 = state.party.find((m) => m.characterId === 'M2');
  assert.equal(countActiveSpecialStatus(m1, 155), 1, 'M1がOnFirstBattleStartでしもべ状態になる');
  assert.equal(countActiveSpecialStatus(m2, 155), 1, 'M2がOnFirstBattleStartでしもべ状態になる');
  const odPassiveEvent = (state.turnState.passiveEventsLastApplied ?? []).find(
    (event) => event?.passiveName === '魔王軍の大攻勢！相当'
  );
  assert.equal(odPassiveEvent?.odGaugeDelta, 100, 'しもべ2人条件を満たし初期化時OnEveryTurnでOD+100される');
  assert.equal(
    Number(state.turnState.odGauge ?? 0) > odBeforeInitialPassive,
    true,
    'ODゲージが初期化前より増加している'
  );
});

test('勇姿(ReduceSp/OnEveryTurnIncludeSpecial) — チャージ状態のメンバーのみSP消費-1', () => {
  // 実際の「勇姿」(決起のレガリア) のデータを模倣:
  //   condition: CountBC(IsPlayer() && SpecialStatusCountByType(25) > 0)>0
  //   target_type: AllyAll, target_condition: SpecialStatusCountByType(25)>0, power: [1, 0]
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        initialSP: 10,
        passives: [
          {
            id: 92003,
            name: '勇姿相当',
            desc: 'ターン開始時 チャージ状態の味方の消費SP-1',
            timing: 'OnEveryTurnIncludeSpecial',
            condition: 'CountBC(IsPlayer()&&SpecialStatusCountByType(25)>0)>0',
            parts: [
              {
                skill_type: 'ReduceSp',
                target_type: 'AllyAll',
                target_condition: 'SpecialStatusCountByType(25)>0',
                power: [1, 0],
              },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        initialSP: 10,
        skills: [
          { id: 92011, name: 'コストスキル', sp_cost: 5, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
        ],
      };
    }
    if (idx === 2) {
      return {
        initialSP: 10,
        skills: [
          { id: 92012, name: 'コストスキル(チャージなし)', sp_cost: 5, parts: [{ skill_type: 'AttackSkill', target_type: 'Single' }] },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const m2 = state.party.find((m) => m.characterId === 'M2');
  const m3 = state.party.find((m) => m.characterId === 'M3');

  // M2にチャージ状態を付与（M3にはなし）
  m2.applySpecialStatus(25, 1, 'Count', {});

  // previewTurnでM2とM3のSP消費を比較
  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8000 },    // M1はデフォルトの通常スキル
    1: { characterId: 'M2', skillId: 92011 },    // M2: sp_cost=5、チャージ状態あり → 消費-1で4
    2: { characterId: 'M3', skillId: 92012 },    // M3: sp_cost=5、チャージ状態なし → 消費5のまま
  });

  const m2Entry = preview.actions.find((a) => a.characterId === 'M2');
  const m3Entry = preview.actions.find((a) => a.characterId === 'M3');

  assert.equal(m2Entry.spCost, 4, 'チャージ状態のM2は勇姿でSP消費-1 (5→4)');
  assert.equal(m3Entry.spCost, 5, 'チャージ状態なしのM3はSP消費そのまま (5)');

  // commitTurn後のSP値でも確認（SP消費差が1あることを検証）
  const { nextState } = commitTurn(state, preview);
  const m2After = nextState.party.find((m) => m.characterId === 'M2');
  const m3After = nextState.party.find((m) => m.characterId === 'M3');
  // M2: 10 - 4 + base_recovery = M3より1多いはず
  assert.equal(m2After.sp.current - m3After.sp.current, 1, 'commitTurn後: M2(チャージ)はM3より1SP多い（消費-1の差）');
});

test('条件なしパッシブは正常に発動する（リグレッション確認）', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 5,
          passives: [
            {
              id: 99003,
              name: '無条件SP回復',
              desc: 'ターン開始時 SP+3',
              timing: 'OnPlayerTurnStart',
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [3, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  applyPassiveTiming(state, 'OnPlayerTurnStart');

  const member = state.party.find((item) => item.characterId === 'M1');
  assert.equal(member.sp.current, 8, '条件なしパッシブは発動して SP+3');
});

// ─────────────────────────────────────────────────────────────
// CharacterStyle shallow copy 修正 (Issue #1)
// commitTurnRecord が party: state.party.map(m => m.clone()) を行うため、
// 各ターンの CharacterStyle インスタンスが独立していること
// ─────────────────────────────────────────────────────────────

test('多ターンコミット後: 各ターンの party メンバーは独立した CharacterStyle インスタンスを持つ', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 10,
          skills: [
            {
              id: 9100,
              name: 'SP消費スキル',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state0 = applyInitialPassiveState(createBattleStateFromParty(party));

  const preview1 = previewTurn(state0, {
    0: { characterId: 'M1', skillId: 9100, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: state1 } = commitTurn(state0, preview1);

  const preview2 = previewTurn(state1, {
    0: { characterId: 'M1', skillId: 9100, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: state2 } = commitTurn(state1, preview2);

  const m1InState1 = state1.party.find((m) => m.characterId === 'M1');
  const m1InState2 = state2.party.find((m) => m.characterId === 'M1');

  // 異なるインスタンスであること
  assert.notStrictEqual(m1InState1, m1InState2, 'state1 と state2 の M1 は別インスタンス');

  // state2 の M1 を変更しても state1 の M1 に影響しないこと
  const state1SpBefore = m1InState1.sp.current;
  m1InState2.sp.current = 99;
  assert.equal(m1InState1.sp.current, state1SpBefore, 'state2 の mutation が state1 に影響しない');
  assert.equal(m1InState2.sp.current, 99);
});

test('normal → extra 遷移時にSP回復が発生しないこと', () => {
  // EXターン付与スキルを持つパーティを作成（createManualExtraTurnParty と同じ構成）
  const party = createManualExtraTurnParty();
  const state = createBattleStateFromParty(party);

  // 全メンバーの初期SP記録（initialSP: 10 で作成されている）
  const initialSpByCharId = Object.fromEntries(
    state.party.map((m) => [m.characterId, m.sp.current])
  );

  const preview = previewTurn(state, {
    0: { characterId: 'C1', skillId: 9000 },
    1: { characterId: 'C2', skillId: 9001 },
    2: { characterId: 'C3', skillId: 9002 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);

  // 次のターンが EX ターンであることを確認
  assert.equal(nextState.turnState.turnType, 'extra', '次のターンは EX ターンになるべき');

  // 全アクションエントリの spChanges に 'base' 回復が含まれないことを確認
  for (const entry of committedRecord.actions) {
    const baseRecovery = (entry.spChanges ?? []).filter((ch) => ch.source === 'base');
    assert.equal(
      baseRecovery.length,
      0,
      `normal → extra 遷移時は base SP 回復が発生してはならない（characterId: ${entry.characterId}）`
    );
  }

  // nextState の全メンバーSPがスキルコスト分のみ変化していることを確認（base 回復なし）
  // 本パーティは全スキルSPコスト0のため、SP変化は0であるべき
  for (const member of nextState.party) {
    const initial = initialSpByCharId[member.characterId];
    assert.equal(
      member.sp.current,
      initial,
      `EX遷移時は base 回復なし（${member.characterId}: expected ${initial}, got ${member.sp.current}）`
    );
  }
});

// ---------- パッシブログ turnLabel 修正（regression test） ----------

test('commitTurn後のpassiveEventsLastAppliedのturnLabelは次ターン（T2）を示す', () => {
  // OnEveryTurn パッシブを持つ PT を使って T1 をコミットし、
  // nextState.turnState.passiveEventsLastApplied の各イベントが
  // T1 ではなく T2 の turnLabel を持つことを検証する。
  // （修正前は applyRecoveryPipeline が state.turnState（T1）で呼ばれるため
  //   イベントに turnLabel='T1' が付き、パッシブログ上で1ターンずれて表示されていた）
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          baseMaxDp: 70,
          currentDp: 35,
          passives: [
            {
              id: 19801,
              name: 'ターンラベルテスト',
              timing: 'OnEveryTurn',
              condition: 'IsFront()',
              parts: [{ skill_type: 'HealDpRate', target_type: 'Self', power: [0.1, 0] }],
            },
          ],
        }
      : { baseMaxDp: 70 }
  );
  const state = createBattleStateFromParty(party);
  applyInitialPassiveState(state);

  assert.equal(state.turnState.turnLabel, 'T1', 'コミット前は T1');

  const preview = previewTurn(state, {});
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.turnLabel, 'T2', 'コミット後は T2');

  const turnStartEvents = (nextState.turnState.passiveEventsLastApplied ?? []).filter(
    (e) => e.timing === 'OnEveryTurn'
  );
  assert.ok(turnStartEvents.length > 0, 'OnEveryTurnパッシブがpassiveEventsLastAppliedに含まれること');
  for (const event of turnStartEvents) {
    assert.equal(
      event.turnLabel,
      'T2',
      `passiveEventsLastAppliedのturnLabelはT2であること（実際: ${event.turnLabel}）`
    );
  }
});

// ─── P1-A: リバーブレーション SP30 上限突破（OnSpecifiedSkill + HealSp + skillCeiling） ───

test('P1-A: OnSpecifiedSkill + HealSp + SP30: リバーブレーション SP30上限突破テスト', () => {
  // SP=18, sp.max=20 の状態で power=[5], value=[30] の HealSp を適用する。
  // 修正前: source='passive', eventCeiling=sp.max=20 → endSP=20（+2のみ）
  // 修正後: source='active', skillCeiling=30 → eventCeiling=30 → endSP=23（+5）
  const triggerSkillId = 201001;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'REVERB1',
          characterName: 'REVERB1',
          initialSP: 18,
          passives: [
            {
              id: 201000,
              name: 'リバーブレーションテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                {
                  skill_type: 'AdditionalHitOnSpecifiedSkill',
                  target_type: 'Self',
                  strval: [-1, { id: triggerSkillId, label: 'ReverbTrigger', name: 'Reverb Trigger Skill' }],
                },
                {
                  skill_type: 'HealSp',
                  target_type: 'AllyAll',
                  power: [5, 0],
                  value: [30, 0],
                  cond: '',
                  hit_condition: '',
                  target_condition: '',
                },
              ],
            },
          ],
          skills: [
            {
              id: triggerSkillId,
              label: 'ReverbTrigger',
              name: 'Reverb Trigger Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'REVERB1', skillId: triggerSkillId, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'REVERB1');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'sp_passive イベントが発生すること');
  // SP=18 + HealSp(5) = 23。skillCeiling=30 があるため sp.max=20 を超えて適用される
  assert.equal(spChange.postSP, 23, 'skillCeiling=30 により SP が 20 を超えて 23 になること（SP30対応）');
  assert.equal(spChange.delta, 5, 'delta は power[0]=5 そのまま');
});

// ─── P1-B: クロノチェイン OD増加（OnHealedSpWithoutSelfHeal + OverDrivePointUp） ───

test('P1-B: OnHealedSpWithoutSelfHeal + OverDrivePointUp: クロノチェイン OD増加テスト', () => {
  // CHRONO1（クロノチェイン保持者）が別メンバーのSP回復スキルでSPが上昇したとき
  // OverDrivePointUp +25% が odGauge に加算される。
  const initialOdGauge = 10;
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'CHRONO1',
        characterName: 'CHRONO1',
        initialSP: 10,
        passives: [
          {
            id: 202000,
            name: 'クロノチェインテスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnHealedSpWithoutSelfHeal', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
              { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.25, 0], value: [0, 0], cond: '', hit_condition: '' },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        characterId: 'SPHEALER_C',
        characterName: 'SPHEALER_C',
        skills: [
          {
            id: 202001,
            name: 'AllyFront HealSp',
            sp_cost: 4,
            parts: [{ skill_type: 'HealSp', target_type: 'AllyFront', power: [5, 0], value: [0, 0] }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = initialOdGauge;

  const preview = previewTurn(state, {
    0: { characterId: 'CHRONO1', skillId: 8000 },
    1: { characterId: 'SPHEALER_C', skillId: 202001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);

  // OD ゲージが +25% 増加していること
  assert.ok(
    Math.abs(nextState.turnState.odGauge - (initialOdGauge + 25)) < 0.1,
    `OD gauge should increase by 25 (expected ~${initialOdGauge + 25}, got ${nextState.turnState.odGauge})`
  );

  // passiveEvents に OverDrivePointUp が含まれること
  const odEvent = (committedRecord.passiveEvents ?? []).find(
    (e) => e.effectTypes?.includes('OverDrivePointUp') && e.source === 'passive_trigger'
  );
  assert.ok(odEvent, 'passiveEvents に OverDrivePointUp passive_trigger イベントが含まれること');
});

// ─── P1-C: killCount × HealSp 倍率（クリアリング/意気軒昂 仕様確定） ───

test('P1-C: OnKillCount + HealSp + killCount=2 → SP が 2 倍（+4）で発動する', () => {
  // desc「敵1体につき味方全体のSP+2」に基づき、killCount=2 のとき delta=4 になること
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'KILL_MULTI1',
          characterName: 'KILL_MULTI1',
          initialSP: 5,
          passives: [
            {
              id: 203000,
              name: '意気軒昂×killCount倍率テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnKillCount', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 203001,
              name: 'Multi Kill Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'KILL_MULTI1', skillId: 203001, killCount: 2 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'KILL_MULTI1');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'sp_passive イベントが発生すること');
  assert.equal(spChange.delta, 4, 'killCount=2 → delta=4 (2×2)');
});

test('P1-C: OnBreaking + HealSp + breakHitCount=2 → SP は倍にならない（+8 固定）', () => {
  // desc「ブレイクしたとき自身のSPが8上昇する」= 単発発動、breakHitCount 倍率は不要
  // breakHitCount=2 でも delta=8 のまま（16 にならない）
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'BREAK_SP_FIXED',
          characterName: 'BREAK_SP_FIXED',
          initialSP: 5,
          passives: [
            {
              id: 203002,
              name: '激震×breakHitCount固定テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 203003,
              name: 'Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'All', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'BREAK_SP_FIXED', skillId: 203003, breakHitCount: 2 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'BREAK_SP_FIXED');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'sp_passive イベントが発生すること');
  assert.equal(spChange.delta, 8, 'breakHitCount=2 でも delta=8 固定（倍にならない）');
});

// ─── P2-C: AdditionalHitOnOverDrivePointDownSkill + AdditionalTurn（トップアップ相当） ───

test('P2-C: OnOverDrivePointDownSkill + AdditionalTurn: ODDownスキル使用時に追加ターン付与', () => {
  // トップアップ相当: ODゲージを下げるスキル(OverDrivePointDown部位あり)を使ったとき AdditionalTurn 発動
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'TOPUP1',
          characterName: 'TOPUP1',
          initialSP: 10,
          passives: [
            {
              id: 204000,
              name: 'トップアップテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnOverDrivePointDownSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 204001,
              name: 'OD Down Skill',
              sp_cost: 3,
              parts: [
                { skill_type: 'AttackSkill', target_type: 'All', type: 'Slash' },
                { skill_type: 'OverDrivePointDown', target_type: 'All', power: [0.5, 0], value: [0, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'TOPUP1', skillId: 204001 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.equal(
    nextState.turnState.turnType,
    'extra',
    'OverDrivePointDown部位を持つスキル使用後は追加ターンになること'
  );
  assert.ok(
    (nextState.turnState.extraTurnState?.allowedCharacterIds ?? []).includes('TOPUP1'),
    'TOPUP1 が追加ターンの allowedCharacterIds に含まれること'
  );
});

test('P2-C: OnOverDrivePointDownSkill does NOT fire when skill has no OverDrivePointDown part', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'TOPUP2',
          characterName: 'TOPUP2',
          initialSP: 10,
          passives: [
            {
              id: 204002,
              name: 'トップアップテスト2（発火なし）',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnOverDrivePointDownSkill', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 204003,
              name: 'Normal Slash',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'TOPUP2', skillId: 204003 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  assert.notEqual(
    nextState.turnState.turnType,
    'extra',
    'OverDrivePointDown部位のないスキルでは追加ターンにならないこと'
  );
});

// ─── P2-B: AdditionalHitOnPursuit + HealSp（そよぐ新緑相当） ───

test('P2-B: OnPursuit + HealSp: pursuedHitCount=1 → AllyFront SP+2', () => {
  // そよぐ新緑相当: 追撃発動時（pursuedHitCount=1）、前衛全員 SP+2
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'SOYO1',
          characterName: 'SOYO1',
          initialSP: 10,
          passives: [
            {
              id: 205000,
              name: 'そよぐ新緑テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 205001,
              name: 'Pursuit Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  // 基準SP: M1(SOYO1)=10, M2=10, M3=10（前衛）, M4..=10（後衛）
  // ターン開始時SP回復(base=2)後: 全員+2 ※パッシブSP+2は前衛のみ
  const preview = previewTurn(state, {
    0: { characterId: 'SOYO1', skillId: 205001, pursuedHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'SOYO1');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'sp_passive イベントが SOYO1 に発生すること（自分も AllyFront）');
  assert.equal(spChange.delta, 2, 'delta=2（power[0]=2）');
});

test('P2-B: OnPursuit does NOT fire when pursuedHitCount=0', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'SOYO2',
          characterName: 'SOYO2',
          initialSP: 10,
          passives: [
            {
              id: 205002,
              name: 'そよぐ新緑テスト2（発火なし）',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnPursuit', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'AllyFront', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 205003,
              name: 'No Pursuit Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'SOYO2', skillId: 205003, pursuedHitCount: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const entry = committedRecord.actions.find((a) => a.characterId === 'SOYO2');
  const spChange = (entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spChange, 'pursuedHitCount=0 のとき sp_passive イベントが発生しないこと');
});

// ─── P2-A: AdditionalHitOnZone + HealSp（オーバーレイ相当）※RECEIVER-based ───

test('P2-A: OnZone + HealSp: Zone展開スキル使用時に全員SP+2', () => {
  // オーバーレイ相当: OVER1（パッシブ保持）が後衛に下がり、ZONECASTER が Zone スキルを使用する。
  // OVER1 の AdditionalHitOnZone パッシブが発火し、AllyAll メンバーに SP+2 が適用される。
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'OVER1',
        characterName: 'OVER1',
        initialSP: 10,
        passives: [
          {
            id: 206000,
            name: 'オーバーレイテスト',
            timing: 'OnFirstBattleStart',
            parts: [
              { skill_type: 'AdditionalHitOnZone', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
              { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        characterId: 'ZONECASTER',
        characterName: 'ZONECASTER',
        initialSP: 10,
        skills: [
          {
            id: 206001,
            name: 'Zone Skill',
            sp_cost: 4,
            parts: [
              { skill_type: 'Zone', target_type: 'AllyAll', power: [0, 0], value: [0, 0] },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'OVER1', skillId: 8000 },
    1: { characterId: 'ZONECASTER', skillId: 206001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // OVER1 のエントリに sp_passive イベントが存在すること
  // （sp イベントは characterId ベースで各アクションエントリに振り分けられる）
  const over1Entry = committedRecord.actions.find((a) => a.characterId === 'OVER1');
  const spChange = (over1Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, 'Zone展開スキル使用後に OVER1 への sp_passive イベントが発生すること');
  assert.equal(spChange.delta, 2, 'delta=2（power[0]=2）');

  // passiveEvents にも HealSp トリガーが含まれること
  const evt = (committedRecord.passiveEvents ?? []).find(
    (e) => e.effectTypes?.includes('HealSp') && e.source === 'passive_trigger'
  );
  assert.ok(evt, 'passiveEvents に HealSp passive_trigger イベントが含まれること');
});

test('P2-A: OnZone: 自分がZone展開 → 自分のパッシブも発動', () => {
  // オーバーレイ保持者 OVER2 自身が Zone スキルを使用した場合、自分のパッシブも発動する。
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'OVER2',
          characterName: 'OVER2',
          initialSP: 10,
          passives: [
            {
              id: 206002,
              name: 'オーバーレイテスト2（自発）',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnZone', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 206003,
              name: 'Self Zone Skill',
              sp_cost: 3,
              parts: [
                { skill_type: 'Zone', target_type: 'AllyAll', power: [0, 0], value: [0, 0] },
              ],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'OVER2', skillId: 206003 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  // OVER2 自身のアクションエントリに sp_passive イベントが存在すること（自分が Zone 展開 → 自分のパッシブも発動）
  const over2Entry = committedRecord.actions.find((a) => a.characterId === 'OVER2');
  const spChange = (over2Entry?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange, '自分が Zone 展開スキルを使用したとき自分への sp_passive イベントが発生すること');
  assert.equal(spChange.delta, 2, 'delta=2');
});

test('P2-A: OnZone does NOT fire when skill has no Zone part', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'OVER3',
          characterName: 'OVER3',
          initialSP: 10,
          passives: [
            {
              id: 206004,
              name: 'オーバーレイテスト3（発火なし）',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnZone', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'AllyAll', power: [2, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 206005,
              name: 'Normal Attack',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'OVER3', skillId: 206005 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord } = commitTurn(state, preview);

  const evt = (committedRecord.passiveEvents ?? []).find(
    (e) =>
      e.source === 'passive_trigger' &&
      e.effectTypes?.includes('HealSp') &&
      e.characterId === 'OVER3'
  );
  assert.ok(!evt, 'Zone部位のないスキルでは AdditionalHitOnZone パッシブが発火しないこと');
});

// ─── P3-A: exitCond=Count 管理（激動: バトル中1回上限） ───

test('P3-A: exitCond=Count(1): 2ターン目のブレイクでも激動が発動しない', () => {
  // 激動相当: AdditionalHitOnBreaking + HealSp, exitCond=Count, exitVal=[1,0]
  // T1: breakHitCount=1 → 発火（SP+8）
  // T2: breakHitCount=1 → 発火しない（Count上限=1に達済み）
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'GEKIDO1',
          characterName: 'GEKIDO1',
          initialSP: 5,
          passives: [
            {
              id: 207000,
              name: '激動テスト',
              timing: 'OnFirstBattleStart',
              parts: [
                {
                  skill_type: 'AdditionalHitOnBreaking',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  effect: { exitCond: 'Count', exitVal: [1, 0] },
                },
                { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 207001,
              name: 'Break Skill',
              sp_cost: 3,
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // T1: ブレイク発生 → 激動が発火する
  const preview1 = previewTurn(state, {
    0: { characterId: 'GEKIDO1', skillId: 207001, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord: record1, nextState: state2 } = commitTurn(state, preview1);

  const entry1 = record1.actions.find((a) => a.characterId === 'GEKIDO1');
  const spChange1 = (entry1?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(spChange1, 'T1: sp_passive イベントが発生すること（1回目は発火する）');
  assert.equal(spChange1.delta, 8, 'T1: delta=8');

  // T2: 同じく breakHitCount=1 → 激動は発火しない（Count上限到達）
  const preview2 = previewTurn(state2, {
    0: { characterId: 'GEKIDO1', skillId: 207001, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { committedRecord: record2 } = commitTurn(state2, preview2);

  const entry2 = record2.actions.find((a) => a.characterId === 'GEKIDO1');
  const spChange2 = (entry2?.spChanges ?? []).find((c) => c.source === 'sp_passive');
  assert.ok(!spChange2, 'T2: Count上限=1に達しているため sp_passive イベントが発生しないこと');
});

// ─── Phase A: sourceCharacterId / sourceCharacterName が statusEffect に保存される ───

test('Phase A: active skill AttackUp includes sourceCharacterId matching the actor', () => {
  // スキル由来 AttackUp バフに sourceCharacterId / sourceCharacterName が記録されること
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'BUFF_ACTOR',
        characterName: 'BUFF_ACTOR',
        initialSP: 10,
        skills: [
          {
            id: 209001,
            name: 'Attack Up Skill',
            sp_cost: 3,
            parts: [
              {
                skill_type: 'AttackUp',
                target_type: 'AllyAll',
                power: [0.5, 0],
                effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [2, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'BUFF_ACTOR', skillId: 209001 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  // 前衛メンバー全員の AttackUp に sourceCharacterId が記録されていること
  for (const member of nextState.party.slice(0, 3)) {
    const stored = member.resolveEffectiveStatusEffects('AttackUp');
    assert.ok(stored.length > 0, `${member.characterId} に AttackUp が付与されていること`);
    assert.equal(
      stored[0].sourceCharacterId,
      'BUFF_ACTOR',
      `${member.characterId} の AttackUp.sourceCharacterId が 'BUFF_ACTOR' であること`
    );
    assert.equal(
      stored[0].sourceCharacterName,
      'BUFF_ACTOR',
      `${member.characterId} の AttackUp.sourceCharacterName が 'BUFF_ACTOR' であること`
    );
  }
});

// ─── Phase B: passive AttackUp が statusEffect として昇格される ───

test('Phase B: OnRemovingBuff + AttackUp (浄化の喝采パターン): 発火時に statusEffect が作成される', () => {
  // OnRemovingBuff で発火した AttackUp パッシブが statusEffect として記録されること
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'JOKA_ACTOR',
        characterName: 'JOKA_ACTOR',
        initialSP: 10,
        passives: [
          {
            id: 209100,
            name: '浄化の喝采テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              {
                skill_type: 'AdditionalHitOnRemovingBuff',
                target_type: 'Self',
                power: [0, 0],
                value: [0, 0],
                cond: '',
                hit_condition: '',
                effect: { exitCond: 'Eternal', exitVal: [0, 0] },
              },
              {
                skill_type: 'AttackUp',
                target_type: 'AllyAll',
                power: [0.6, 0],
                value: [0, 0],
                cond: '',
                hit_condition: '',
                target_condition: '',
                elements: ['Dark'],
                effect: {
                  category: 'AttackUpDark_Turn',
                  limitType: 'Only',
                  exitCond: 'PlayerTurnEnd',
                  exitVal: [8, 0],
                },
              },
            ],
          },
        ],
        skills: [
          {
            id: 209101,
            name: 'RemoveBuff Skill',
            sp_cost: 3,
            parts: [
              { skill_type: 'RemoveBuff', target_type: 'Single', power: [1, 0] },
            ],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'JOKA_ACTOR', skillId: 209101, removeBuffCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  // 前衛メンバー全員に AttackUp statusEffect が付与されていること
  for (const member of nextState.party.slice(0, 3)) {
    const stored = member.resolveEffectiveStatusEffects('AttackUp');
    assert.ok(stored.length > 0, `${member.characterId} に AttackUp statusEffect が付与されていること`);
    assert.equal(stored[0].power, 0.6, `power=0.6（60%攻撃力アップ）`);
    // commitTurn 後に PlayerTurnEnd デクリメントが1回走るため remaining は 8-1=7
    assert.equal(stored[0].remaining, 7, `remaining=7（8ターン付与 → 1回デクリメント済み）`);
    assert.equal(stored[0].exitCond, 'PlayerTurnEnd', `exitCond=PlayerTurnEnd`);
    assert.equal(stored[0].sourceType, 'passive', `sourceType='passive'`);
    assert.equal(stored[0].sourceCharacterId, 'JOKA_ACTOR', `sourceCharacterId='JOKA_ACTOR'`);
  }
});

test('Phase B: OnBreaking + AttackUp (破砕の喝采パターン): breakHitCount=1 で statusEffect が作成される', () => {
  // OnBreaking で発火した AttackUp パッシブが statusEffect として記録されること
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'HASSAI_ACTOR',
        characterName: 'HASSAI_ACTOR',
        initialSP: 10,
        passives: [
          {
            id: 209200,
            name: '破砕の喝采テスト',
            timing: 'OnFirstBattleStart',
            parts: [
              {
                skill_type: 'AdditionalHitOnBreaking',
                target_type: 'Self',
                power: [0, 0],
                value: [0, 0],
                cond: '',
                hit_condition: '',
                effect: { exitCond: 'Eternal', exitVal: [0, 0] },
              },
              {
                skill_type: 'AttackUp',
                target_type: 'AllyAll',
                power: [0.6, 0],
                value: [0, 0],
                cond: '',
                hit_condition: '',
                target_condition: '',
                elements: [],
                effect: {
                  category: 'AttackUp_Turn',
                  limitType: 'Only',
                  exitCond: 'PlayerTurnEnd',
                  exitVal: [8, 0],
                },
              },
            ],
          },
        ],
        skills: [
          {
            id: 209201,
            name: 'Break Skill',
            sp_cost: 3,
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike' }],
          },
        ],
      };
    }
    return {};
  });
  const state = createBattleStateFromParty(party);
  const preview = previewTurn(state, {
    0: { characterId: 'HASSAI_ACTOR', skillId: 209201, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  for (const member of nextState.party.slice(0, 3)) {
    const stored = member.resolveEffectiveStatusEffects('AttackUp');
    assert.ok(stored.length > 0, `${member.characterId} に AttackUp statusEffect が付与されていること`);
    assert.equal(stored[0].power, 0.6, `power=0.6`);
    // commitTurn 後に PlayerTurnEnd デクリメントが1回走るため remaining は 8-1=7
    assert.equal(stored[0].remaining, 7, `remaining=7（8ターン付与 → 1回デクリメント済み）`);
    assert.equal(stored[0].sourceCharacterId, 'HASSAI_ACTOR', `sourceCharacterId='HASSAI_ACTOR'`);
  }
});

// ─── P3-B: exitCond=PlayerTurnEnd 管理（二度咲き: 同一プレイヤーターン内1回） ───

test('P3-B: exitCond=PlayerTurnEnd: T1EXで再度EXスキル使用しても二度咲きが発動しない', () => {
  // 二度咲き相当: AdditionalHitOnExtraSkill + AdditionalTurn, exitCond=PlayerTurnEnd
  // T1: EXスキル使用 → 発火 → extra turn
  // T1EX: 再度EXスキル使用 → 発火しない（PlayerTurnEnd = 同一ターン内1回）
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'FUTABA1',
          characterName: 'FUTABA1',
          initialSP: 20,
          passives: [
            {
              id: 208000,
              name: '二度咲きテスト',
              timing: 'OnFirstBattleStart',
              parts: [
                {
                  skill_type: 'AdditionalHitOnExtraSkill',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 208001,
              label: 'TestSkill51',
              name: 'EX Skill',
              sp_cost: 10,
              is_restricted: 1,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // T1: EXスキル使用 → 二度咲き発火 → extra turn
  const preview1 = previewTurn(state, {
    0: { characterId: 'FUTABA1', skillId: 208001 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateT1EX } = commitTurn(state, preview1);
  assert.equal(stateT1EX.turnState.turnType, 'extra', 'T1後はextra turnになること');

  // T1EX: 同じEXスキルを再使用 → 二度咲きは発動しない
  const preview1ex = previewTurn(stateT1EX, {
    0: { characterId: 'FUTABA1', skillId: 208001 },
  });
  const { nextState: stateT2 } = commitTurn(stateT1EX, preview1ex);
  assert.notEqual(
    stateT2.turnState.turnType,
    'extra',
    'T1EXで再度EXスキルを使用しても二度咲きは発動せず追加ターンにならないこと'
  );
});

test('P3-B: exitCond=PlayerTurnEnd: T2では再び発動する', () => {
  // 二度咲き相当のパッシブは、プレイヤーターンが変わったら再び発動する。
  // T1 → T1EX(スキップ) → T2 で二度咲き再発火
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'FUTABA2',
          characterName: 'FUTABA2',
          initialSP: 20,
          passives: [
            {
              id: 208002,
              name: '二度咲きテスト2',
              timing: 'OnFirstBattleStart',
              parts: [
                {
                  skill_type: 'AdditionalHitOnExtraSkill',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  effect: { exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                },
                { skill_type: 'AdditionalTurn', target_type: 'Self', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 208003,
              label: 'TestSkill51',
              name: 'EX Skill 2',
              sp_cost: 10,
              is_restricted: 1,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
            {
              id: 208004,
              name: 'Normal Skill',
              sp_cost: 0,
              parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);

  // T1: EXスキル → 二度咲き発火 → extra turn
  const preview1 = previewTurn(state, {
    0: { characterId: 'FUTABA2', skillId: 208003 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateT1EX } = commitTurn(state, preview1);
  assert.equal(stateT1EX.turnState.turnType, 'extra', 'T1後はextra turnになること');

  // T1EX: 通常スキルを使用して T2 へ（二度咲き非発動で extra ターン消費）
  const preview1ex = previewTurn(stateT1EX, {
    0: { characterId: 'FUTABA2', skillId: 208004 },
  });
  const { nextState: stateT2 } = commitTurn(stateT1EX, preview1ex);
  assert.equal(stateT2.turnState.turnType, 'normal', 'T1EX消化後はnormal(T2)になること');
  assert.equal(stateT2.turnState.turnIndex, 2, 'turnIndex=2');

  // T2: EXスキルを使用 → 二度咲きが再発火してextra turnになる
  const preview2 = previewTurn(stateT2, {
    0: { characterId: 'FUTABA2', skillId: 208003 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateT2EX } = commitTurn(stateT2, preview2);
  assert.equal(
    stateT2EX.turnState.turnType,
    'extra',
    'T2でEXスキル使用時、PlayerTurnEnd リセット後に二度咲きが再発火してextra turnになること'
  );
});

test('DoubleActionExtraSkill: 水瀬すももの初回EXは二連になり、SPは1回分・使用回数は2回分消費する', () => {
  const store = getStore();
  const party = buildFullSkillRealDataParty(store, 46002310, {
    buildOptions: {
      initialSP: 30,
      limitBreakLevelsByPartyIndex: { 0: 2 },
    },
  });
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46002310, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 2);
  assert.deepEqual(preview.actions.map((entry) => entry.castIndex), [0, 1]);
  assert.equal(preview.actions[0].castCount, 2);
  assert.equal(preview.actions[0].spCost, 14);
  assert.equal(preview.actions[1].spCost, 0);
  assert.equal(preview.actions[1].isDerivedRepeat, true);
  assert.equal(preview.actions[1].startSP, preview.actions[0].endSP);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const actorAfter = nextState.party[0];

  assert.equal(committedRecord.actions.length, 2);
  assert.equal(actorAfter.getSkillUseCountByLabel('SMinaseSkill54'), 2);
  assert.equal(actorAfter.resolveEffectiveDoubleActionExtraSkillEffects().length, 0);
});

test('DoubleActionExtraSkill: 水瀬すももLB3はEX使用後に次回ぶんの二連権を再付与する', () => {
  const store = getStore();
  const party = buildFullSkillRealDataParty(store, 46002310, {
    buildOptions: {
      initialSP: 30,
      limitBreakLevelsByPartyIndex: { 0: 3 },
    },
  });
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  const actor = state.party[0];

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: 46002310, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);
  const actorAfter = nextState.party[0];

  assert.equal(actorAfter.resolveEffectiveDoubleActionExtraSkillEffects().length, 1);

  const nextPreview = previewTurn(nextState, {
    0: { characterId: actorAfter.characterId, skillId: 46002310, targetEnemyIndex: 0 },
  });
  assert.equal(nextPreview.actions.length, 2);
});

test('DoubleActionExtraSkill: 朝倉可憐の意気揚々で次のEX二連権が自己付与される', () => {
  const store = getStore();
  const party = buildFullSkillRealDataParty(store, 46001512, {
    buildOptions: {
      initialSP: 30,
    },
  });
  const initialState = createBattleStateFromParty(party);
  const actor = initialState.party[0];

  const buffPreview = previewTurn(initialState, {
    0: { characterId: actor.characterId, skillId: 46001511, targetEnemyIndex: 0 },
  });
  const { nextState: buffedState } = commitTurn(initialState, buffPreview);
  const actorAfterBuff = buffedState.party[0];

  assert.equal(actorAfterBuff.resolveEffectiveDoubleActionExtraSkillEffects().length, 1);

  const exPreview = previewTurn(buffedState, {
    0: { characterId: actorAfterBuff.characterId, skillId: 46001512, targetEnemyIndex: 0 },
  });
  assert.equal(exPreview.actions.length, 2);
  assert.equal(exPreview.actions[0].spCost, 14);
  assert.equal(exPreview.actions[1].spCost, 0);
  assert.equal(exPreview.actions[1].startSP, exPreview.actions[0].endSP);

  const { nextState: exState } = commitTurn(buffedState, exPreview);
  const actorAfterEx = exState.party[0];
  assert.equal(actorAfterEx.getSkillUseCountByLabel('KAsakuraSkill54'), 2);
  assert.equal(actorAfterEx.resolveEffectiveDoubleActionExtraSkillEffects().length, 0);
});

function buildByakko06RealDataParty(store, skillIds, buildOptions = {}) {
  const BYAKKO_STYLE_ID = 1002606;
  const byakkoStyle = store.getStyleById(BYAKKO_STYLE_ID);
  const byakkoCharaLabel = String(byakkoStyle?.chara_label ?? byakkoStyle?.chara ?? '');
  const otherStyleIds = getSixUsableStyleIds(store).filter((id) => {
    if (Number(id) === BYAKKO_STYLE_ID) {
      return false;
    }
    const style = store.getStyleById(id);
    return String(style?.chara_label ?? style?.chara ?? '') !== byakkoCharaLabel;
  });
  return store.buildPartyFromStyleIds([BYAKKO_STYLE_ID, ...otherStyleIds.slice(0, 5)], {
    initialSP: 30,
    skillSetsByPartyIndex: {
      0: Array.isArray(skillIds) ? skillIds : [skillIds],
    },
    ...buildOptions,
  });
}

test('ByakkoDoubleActionAttackSkill: DP100%以上のラッシュで非EX攻撃スキルが二連になる', () => {
  const store = getStore();
  const BYAKKO_ASSAULT_CLAW_SKILL_ID = 46002609;
  const party = buildByakko06RealDataParty(store, [BYAKKO_ASSAULT_CLAW_SKILL_ID], {
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  const passiveResult = applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.ok(
    passiveResult.passiveEvents.some((event) =>
      (event.appliedStatusEffects ?? []).some(
        (effect) => effect.statusType === 'ByakkoDoubleActionAttackSkill'
      )
    )
  );
  assert.equal(actor.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 1);

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_ASSAULT_CLAW_SKILL_ID, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 2);
  assert.deepEqual(preview.actions.map((entry) => entry.castIndex), [0, 1]);
  assert.equal(preview.actions[0].doubleActionStatusType, 'ByakkoDoubleActionAttackSkill');
  assert.equal(preview.actions[0].spCost, 6);
  assert.equal(preview.actions[1].spCost, 0);

  const { nextState, committedRecord } = commitTurn(state, preview);
  const actorAfter = nextState.party[0];
  assert.equal(committedRecord.actions.length, 2);
  assert.equal(actorAfter.getSkillUseCountByLabel('ByakkoSkill06'), 2);
  assert.equal(
    actorAfter.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length,
    1,
    'DP100%以上を維持しているため次ターン開始時にラッシュ状態を再取得する'
  );
});

test('ByakkoDoubleActionAttackSkill: DP100%未満ではラッシュ状態を得ない', () => {
  const store = getStore();
  const BYAKKO_ASSAULT_CLAW_SKILL_ID = 46002609;
  const party = buildByakko06RealDataParty(store, [BYAKKO_ASSAULT_CLAW_SKILL_ID], {
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 69, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  applyPassiveTiming(state, 'OnPlayerTurnStart');

  assert.equal(actor.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 0);
  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_ASSAULT_CLAW_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions.length, 1);
});

test('ByakkoDoubleActionAttackSkill: 夏色ハイテンションでDPを消費された次ターンはラッシュ状態を得ない', () => {
  const store = getStore();
  const BYAKKO_STYLE_ID = 1002606;
  const MIZUHARA_SUMMER_STYLE_ID = 1005607;
  const BYAKKO_ASSAULT_CLAW_SKILL_ID = 46002609;
  const MIZUHARA_SUMMER_SKILL_ID = 46005619;
  const FILLER_STYLE_IDS = getSixUsableStyleIds(store).filter(
    (id) => Number(id) !== BYAKKO_STYLE_ID && Number(id) !== MIZUHARA_SUMMER_STYLE_ID
  );
  const party = store.buildPartyFromStyleIds(
    [BYAKKO_STYLE_ID, MIZUHARA_SUMMER_STYLE_ID, ...FILLER_STYLE_IDS.slice(0, 4)],
    {
      initialSP: 30,
      skillSetsByPartyIndex: {
        0: [BYAKKO_ASSAULT_CLAW_SKILL_ID],
        1: [MIZUHARA_SUMMER_SKILL_ID],
      },
      initialDpStateByPartyIndex: {
        0: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
      },
    }
  );
  const state = createBattleStateFromParty(party);
  applyPassiveTiming(state, 'OnPlayerTurnStart');

  const preview = previewTurn(state, {
    1: { characterId: 'AMizuhara', skillId: MIZUHARA_SUMMER_SKILL_ID, targetCharacterId: 'Byakko' },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const byakkoAfter = nextState.party.find((member) => member.characterId === 'Byakko');

  assert.ok((committedRecord.dpEvents ?? []).some((event) =>
    event.characterId === 'Byakko' &&
    event.source === 'dp_skill' &&
    Number(event.delta) < 0
  ));
  assert.equal(Number(byakkoAfter?.dpState?.currentDp ?? 0) < Number(byakkoAfter?.dpState?.effectiveDpCap ?? 0), true);
  assert.equal(byakkoAfter.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 0);
});

test('ByakkoDoubleActionAttackSkill: DP100%未満へ落ちたまま追加ターンへ入るとラッシュ状態は残らない', () => {
  const RUSH_SELF_DAMAGE_EXTRA_SKILL_ID = 26001;
  const RUSH_ATTACK_SKILL_ID = 26002;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'Byakko',
          characterName: 'ビャッコ',
          dpState: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
          skills: [
            {
              id: RUSH_SELF_DAMAGE_EXTRA_SKILL_ID,
              name: 'DP消費追加ターン',
              label: 'ByakkoRushSelfDamageExtra',
              sp_cost: 0,
              additionalTurnRule: {
                skillUsableInExtraTurn: true,
                additionalTurnGrantInExtraTurn: false,
                conditions: {
                  requiresOverDrive: false,
                  requiresReinforcedMode: false,
                  excludesExtraTurnForSkillUse: false,
                  excludesExtraTurnForAdditionalTurnGrant: true,
                },
                additionalTurnTargetTypes: ['Self'],
              },
              parts: [
                { skill_type: 'SelfDamage', target_type: 'Self', power: [0.5, 0] },
                { skill_type: 'AdditionalTurn', target_type: 'Self' },
              ],
            },
            {
              id: RUSH_ATTACK_SKILL_ID,
              name: 'ラッシュ対象攻撃',
              label: 'ByakkoRushAttack',
              sp_cost: 0,
              hit_count: 1,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {}
  );
  let state = createBattleStateFromParty(party);
  const actor = state.party.find((member) => member.characterId === 'Byakko');
  actor.addStatusEffect({
    statusType: 'ByakkoDoubleActionAttackSkill',
    limitType: 'None',
    exitCond: 'PlayerTurnEnd',
    remaining: 1,
  });

  const preview = previewTurn(state, {
    0: { characterId: 'Byakko', skillId: RUSH_SELF_DAMAGE_EXTRA_SKILL_ID },
  });
  state = commitTurn(state, preview).nextState;
  const byakkoAfter = state.party.find((member) => member.characterId === 'Byakko');
  assert.equal(state.turnState.turnType, 'extra');
  assert.equal(byakkoAfter.dpState.currentDp, 35);
  assert.equal(byakkoAfter.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 0);

  const extraPreview = previewTurn(state, {
    0: { characterId: 'Byakko', skillId: RUSH_ATTACK_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(extraPreview.actions.filter((action) => action.characterId === 'Byakko').length, 1);
});

test('ByakkoDoubleActionAttackSkill: 簡易被弾でDPが1減ると次ターンはラッシュ状態を得ない', () => {
  const store = getStore();
  const BYAKKO_ASSAULT_CLAW_SKILL_ID = 46002609;
  const party = buildByakko06RealDataParty(store, [BYAKKO_ASSAULT_CLAW_SKILL_ID], {
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  applyPassiveTiming(state, 'OnPlayerTurnStart');
  const preview = previewTurn(state, {
    0: { characterId: 'Byakko', skillId: BYAKKO_ASSAULT_CLAW_SKILL_ID, targetEnemyIndex: 0 },
  });

  const { nextState, committedRecord } = commitTurn(state, preview, [], {
    enemyAttackTargetCharacterIds: ['Byakko'],
  });
  const byakkoAfter = nextState.party.find((member) => member.characterId === 'Byakko');

  assert.equal(byakkoAfter?.dpState?.currentDp, 69);
  assert.equal(byakkoAfter.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 0);
  assert.ok((committedRecord.dpEvents ?? []).some((event) =>
    event.characterId === 'Byakko' &&
    event.source === 'enemy_attack' &&
    event.triggerType === 'EnemyAttackDpDamage' &&
    event.delta === -1
  ));
});

test('ByakkoDoubleActionAttackSkill: 通常攻撃はラッシュ二連対象外', () => {
  const store = getStore();
  const BYAKKO_NORMAL_ATTACK_SKILL_ID = 46002601;
  const party = buildByakko06RealDataParty(store, [BYAKKO_NORMAL_ATTACK_SKILL_ID], {
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  applyPassiveTiming(state, 'OnPlayerTurnStart');
  assert.equal(actor.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length, 1);

  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_NORMAL_ATTACK_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions.length, 1);
});

test('ByakkoDoubleActionAttackSkill: EX攻撃スキルは残回数2以上のときだけ二連になる', () => {
  const store = getStore();
  const BYAKKO_EX_SKILL_ID = 46002611;
  const party = buildByakko06RealDataParty(store, [BYAKKO_EX_SKILL_ID], {
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 70, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  applyPassiveTiming(state, 'OnPlayerTurnStart');
  let preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_EX_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions.length, 2);

  const maxUses = Number(actor.getSkill(BYAKKO_EX_SKILL_ID)?.usage?.maxUses ?? 0);
  for (let i = 0; i < Math.max(0, maxUses - 1); i += 1) {
    actor.incrementSkillUseByLabel('ByakkoSkill53');
  }
  preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_EX_SKILL_ID, targetEnemyIndex: 0 },
  });
  assert.equal(preview.actions.length, 1);
});

test('ByakkoDoubleActionAttackSkill: シャドウ・ランペイジ二連はマスター連撃と3T連撃を両方OD計算に乗せる', () => {
  const store = getStore();
  const BYAKKO_STYLE_ID = 1002606;
  const NIKAIDO_ADMIRAL_STYLE_ID = 1005107;
  const YAMAWAKI_STYLE_ID = 1003108;
  const FILLER_STYLE_IDS = [1001101, 1001201, 1001301];
  const BYAKKO_EX_SKILL_ID = 46002611;
  const BYAKKO_MASTER_SKILL_ID = 46512601;
  const NIKAIDO_COMMAND_SKILL_ID = 46005122;
  const YAMAWAKI_SP_SKILL_ID = 46003109;
  const EXPECTED_FUNNEL_HIT_BONUS = 5;
  const EXPECTED_HIT_COUNT = 10;
  const EXPECTED_OD_PER_CAST = 25;

  const party = store.buildPartyFromStyleIds(
    [BYAKKO_STYLE_ID, NIKAIDO_ADMIRAL_STYLE_ID, YAMAWAKI_STYLE_ID, ...FILLER_STYLE_IDS],
    {
      initialSP: 30,
      limitBreakLevelsByPartyIndex: {
        0: 2,
        1: 2,
        2: 4,
      },
      skillSetsByPartyIndex: {
        0: [BYAKKO_EX_SKILL_ID, BYAKKO_MASTER_SKILL_ID],
        1: [NIKAIDO_COMMAND_SKILL_ID],
        2: [YAMAWAKI_SP_SKILL_ID],
      },
    }
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  state.turnState.transcendence = null;
  const byakko = state.party.find((member) => member.characterId === 'Byakko');
  assert.ok(byakko, 'ビャッコが存在すること');

  applyPassiveTiming(state, 'OnPlayerTurnStart');
  const preview = previewTurn(state, {
    0: { characterId: 'Byakko', skillId: BYAKKO_EX_SKILL_ID, targetEnemyIndex: 0 },
    1: { characterId: 'MNikaido', skillId: NIKAIDO_COMMAND_SKILL_ID },
    2: { characterId: 'BIYamawaki', skillId: YAMAWAKI_SP_SKILL_ID, targetCharacterId: 'Byakko' },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const byakkoActions = committedRecord.actions.filter((action) => action.characterId === 'Byakko');

  assert.equal(byakkoActions.length, 2);
  assert.deepEqual(byakkoActions.map((action) => action.castIndex), [0, 1]);
  assert.deepEqual(
    byakkoActions.map((action) => action.skillFunnelHitBonus),
    [EXPECTED_FUNNEL_HIT_BONUS, EXPECTED_FUNNEL_HIT_BONUS]
  );
  assert.deepEqual(
    byakkoActions.map((action) => action.skillHitCount),
    [EXPECTED_HIT_COUNT, EXPECTED_HIT_COUNT]
  );
  assert.deepEqual(
    byakkoActions.map((action) => action.odGaugeGain),
    [EXPECTED_OD_PER_CAST, EXPECTED_OD_PER_CAST]
  );
  assert.equal(nextState.turnState.odGauge, EXPECTED_OD_PER_CAST * 2);
  assert.ok(
    byakkoActions.every((action) => {
      const funnelEffects = action.damageContext?.funnelEffects ?? [];
      return (
        funnelEffects.some((effect) => effect.power === 2 && effect.exitCond === 'Eternal') &&
        funnelEffects.some((effect) => effect.power === 3 && effect.exitCond === 'PlayerTurnEnd')
      );
    })
  );
});

test('Byakko06 獅子奮迅: EX使用後に自身以外へSP+2をSP30上限で付与する', () => {
  const store = getStore();
  const BYAKKO_EX_SKILL_ID = 46002611;
  const party = buildByakko06RealDataParty(store, [BYAKKO_EX_SKILL_ID], {
    initialSP: 20,
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 69, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  applyPassiveTiming(state, 'OnPlayerTurnStart');
  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_EX_SKILL_ID, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);
  const allySpValues = nextState.party
    .filter((member) => member.characterId !== actor.characterId)
    .map((member) => Number(member.sp.current ?? 0));

  assert.equal(preview.actions.length, 1);
  assert.ok(allySpValues.length >= 2);
  assert.ok(allySpValues.every((sp) => sp === 22));
});

test('Byakko06 獅子奮迅: 専用通常スキルのディスラプトでは発動しない', () => {
  const store = getStore();
  const BYAKKO_DISRUPT_SKILL_ID = 46002610;
  const party = buildByakko06RealDataParty(store, [BYAKKO_DISRUPT_SKILL_ID], {
    initialSP: 20,
    initialDpStateByPartyIndex: {
      0: { baseMaxDp: 70, currentDp: 69, effectiveDpCap: 70 },
    },
  });
  const state = createBattleStateFromParty(party);
  const actor = state.party[0];

  applyPassiveTiming(state, 'OnPlayerTurnStart');
  const preview = previewTurn(state, {
    0: { characterId: actor.characterId, skillId: BYAKKO_DISRUPT_SKILL_ID, targetEnemyIndex: 0 },
  });
  const { nextState, committedRecord } = commitTurn(state, preview);
  const allySpValues = nextState.party
    .filter((member) => member.characterId !== actor.characterId)
    .map((member) => Number(member.sp.current ?? 0));

  assert.equal(preview.actions.length, 1);
  assert.equal(
    committedRecord.passiveEvents.some((event) => event.passiveName === '獅子奮迅'),
    false,
    'Skill07 の専用通常スキルは AdditionalHitOnExtraSkill の対象外'
  );
  assert.ok(allySpValues.length >= 2);
  assert.ok(allySpValues.every((sp) => sp === 20));
});

test('Byakko06 獅子奮迅: EXスキルとスキル進化EXで発動する', () => {
  const store = getStore();
  const BYAKKO_BEAST_PRISON_SKILL_ID = 46002605;
  const BYAKKO_BEAST_PRISON_PLUS_SKILL_ID = 46002661;

  for (const skillId of [BYAKKO_BEAST_PRISON_SKILL_ID, BYAKKO_BEAST_PRISON_PLUS_SKILL_ID]) {
    const party = buildByakko06RealDataParty(store, [skillId], {
      initialSP: 20,
      initialDpStateByPartyIndex: {
        0: { baseMaxDp: 70, currentDp: 69, effectiveDpCap: 70 },
      },
    });
    const state = createBattleStateFromParty(party);
    const actor = state.party[0];

    applyPassiveTiming(state, 'OnPlayerTurnStart');
    const preview = previewTurn(state, {
      0: { characterId: actor.characterId, skillId, targetEnemyIndex: 0 },
    });
    const { committedRecord } = commitTurn(state, preview);

    assert.equal(
      committedRecord.passiveEvents.some((event) => event.passiveName === '獅子奮迅'),
      true,
      `${skillId} should trigger 獅子奮迅 as an EX skill`
    );
  }
});

test('桐生美也マスタースキル 希望を拓く一矢: EXスキルで発動し専用通常スキルでは発動しない', () => {
  const store = getStore();
  const MKIRYU_EX_STYLE_ID = 1004307;
  const MKIRYU_NORMAL_STYLE_ID = 1004306;
  const MKIRYU_EX_SKILL_ID = 46004311;
  const MKIRYU_NORMAL_SKILL_ID = 46004310;
  const MKIRYU_MASTER_PASSIVE_SKILL_ID = 46514301;
  const fillerStyleIds = getSixUsableStyleIds(store)
    .filter((styleId) => ![MKIRYU_EX_STYLE_ID, MKIRYU_NORMAL_STYLE_ID].includes(Number(styleId)))
    .slice(0, 5);

  const exParty = store.buildPartyFromStyleIds([MKIRYU_EX_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [MKIRYU_EX_SKILL_ID, MKIRYU_MASTER_PASSIVE_SKILL_ID],
    },
  });
  const exState = createBattleStateFromParty(exParty);
  const exActor = exState.party[0];
  const exPreview = previewTurn(exState, {
    0: { characterId: exActor.characterId, skillId: MKIRYU_EX_SKILL_ID, targetEnemyIndex: 0 },
  });
  const exCommit = commitTurn(exState, exPreview);
  assert.equal(
    exCommit.committedRecord.passiveEvents.some((event) => event.passiveName === '希望を拓く一矢'),
    true,
    'Master passive should trigger after an EX skill'
  );

  const normalParty = store.buildPartyFromStyleIds([MKIRYU_NORMAL_STYLE_ID, ...fillerStyleIds], {
    initialSP: 20,
    skillSetsByPartyIndex: {
      0: [MKIRYU_NORMAL_SKILL_ID, MKIRYU_MASTER_PASSIVE_SKILL_ID],
    },
  });
  const normalState = createBattleStateFromParty(normalParty);
  const normalActor = normalState.party[0];
  const normalPreview = previewTurn(normalState, {
    0: { characterId: normalActor.characterId, skillId: MKIRYU_NORMAL_SKILL_ID, targetEnemyIndex: 0 },
  });
  const normalCommit = commitTurn(normalState, normalPreview);
  assert.equal(
    normalCommit.committedRecord.passiveEvents.some((event) => event.passiveName === '希望を拓く一矢'),
    false,
    'Master passive should not trigger after a non-EX style-locked skill'
  );
});

test('DoubleActionExtraSkill: 李映夏Funnel付きフグリングクラッシュは1発目だけFunnelを消費し各castで全体バフを付与する', () => {
  const store = getStore();
  const LI_STYLE_ID = 1008203;
  const KAREN_STYLE_ID = 1001507;
  const FILLER_STYLE_ID = 1001101;
  const FILLER_BACK_STYLE_IDS = [1001201, 1001301, 1001401];
  const PROTECTION_SKILL_ID = 46300004;
  const LI_FUNNEL_SKILL_ID = 46008205;
  const KAREN_DOUBLE_ACTION_SKILL_ID = 46001511;
  const KAREN_EX_SKILL_ID = 46001512;
  const LI_CHARACTER_ID = 'LShanhua';
  const KAREN_CHARACTER_ID = 'KAsakura';
  const FUNNEL_POWER = 5;
  const ATTACK_UP_POWER = 1.1686248;
  const EX_SP_COST = 14;
  const PARTY_MEMBER_COUNT = 6;
  const REAL_DATA_TEST_INITIAL_SP = 30;

  const party = store.buildPartyFromStyleIds(
    [LI_STYLE_ID, KAREN_STYLE_ID, FILLER_STYLE_ID, ...FILLER_BACK_STYLE_IDS],
    {
      initialSP: REAL_DATA_TEST_INITIAL_SP,
      skillSetsByPartyIndex: {
        0: [LI_FUNNEL_SKILL_ID, PROTECTION_SKILL_ID],
        1: [KAREN_DOUBLE_ACTION_SKILL_ID, KAREN_EX_SKILL_ID, PROTECTION_SKILL_ID],
        2: [PROTECTION_SKILL_ID],
      },
    }
  );
  const initialState = createBattleStateFromParty(party);
  const lee = initialState.party.find((member) => member.characterId === LI_CHARACTER_ID);
  const karen = initialState.party.find((member) => member.characterId === KAREN_CHARACTER_ID);
  const filler = initialState.party[2];

  assert.ok(lee, '李映夏が前衛に存在すること');
  assert.ok(karen, '朝倉可憐が前衛に存在すること');
  assert.ok(filler, 'フィラーが前衛に存在すること');

  const turn1Preview = previewTurn(initialState, {
    0: { characterId: lee.characterId, skillId: LI_FUNNEL_SKILL_ID, targetCharacterId: karen.characterId },
    1: { characterId: karen.characterId, skillId: PROTECTION_SKILL_ID },
    2: { characterId: filler.characterId, skillId: PROTECTION_SKILL_ID },
  });
  const { nextState: turn1State } = commitTurn(initialState, turn1Preview);
  const karenAfterTurn1 = turn1State.party.find((member) => member.characterId === KAREN_CHARACTER_ID);
  const turn1FunnelEffects = karenAfterTurn1.resolveEffectiveFunnelEffects();
  const turn1AttackUpEffects = karenAfterTurn1
    .resolveEffectiveStatusEffects('AttackUp')
    .filter((effect) => Number(effect?.sourceSkillId ?? 0) === LI_FUNNEL_SKILL_ID);

  assert.equal(turn1FunnelEffects.length, 1);
  assert.equal(turn1FunnelEffects[0].power, FUNNEL_POWER);
  assert.equal(turn1FunnelEffects[0].exitCond, 'Count');
  assert.equal(turn1FunnelEffects[0].sourceSkillId, LI_FUNNEL_SKILL_ID);
  assert.equal(turn1AttackUpEffects.length, 1);
  assert.equal(turn1AttackUpEffects[0].power, ATTACK_UP_POWER);
  assert.equal(turn1AttackUpEffects[0].sourceSkillId, LI_FUNNEL_SKILL_ID);

  const turn2Lee = turn1State.party.find((member) => member.characterId === LI_CHARACTER_ID);
  const turn2Karen = turn1State.party.find((member) => member.characterId === KAREN_CHARACTER_ID);
  const turn2Filler = turn1State.party[2];
  const turn2Preview = previewTurn(turn1State, {
    0: { characterId: turn2Lee.characterId, skillId: PROTECTION_SKILL_ID },
    1: { characterId: turn2Karen.characterId, skillId: KAREN_DOUBLE_ACTION_SKILL_ID },
    2: { characterId: turn2Filler.characterId, skillId: PROTECTION_SKILL_ID },
  });
  const { nextState: turn2State } = commitTurn(turn1State, turn2Preview);
  const karenAfterTurn2 = turn2State.party.find((member) => member.characterId === KAREN_CHARACTER_ID);

  assert.equal(karenAfterTurn2.resolveEffectiveDoubleActionExtraSkillEffects().length, 1);
  assert.equal(karenAfterTurn2.resolveEffectiveFunnelEffects().length, 1);
  assert.equal(
    karenAfterTurn2
      .resolveEffectiveStatusEffects('AttackUp')
      .filter((effect) => Number(effect?.sourceSkillId ?? 0) === LI_FUNNEL_SKILL_ID).length,
    1
  );

  const turn3Lee = turn2State.party.find((member) => member.characterId === LI_CHARACTER_ID);
  const turn3Karen = turn2State.party.find((member) => member.characterId === KAREN_CHARACTER_ID);
  const turn3Filler = turn2State.party[2];
  const turn3Preview = previewTurn(turn2State, {
    0: { characterId: turn3Lee.characterId, skillId: PROTECTION_SKILL_ID },
    1: { characterId: turn3Karen.characterId, skillId: KAREN_EX_SKILL_ID, targetEnemyIndex: 0 },
    2: { characterId: turn3Filler.characterId, skillId: PROTECTION_SKILL_ID },
  });
  const karenPreviewActions = turn3Preview.actions.filter(
    (action) => action.characterId === KAREN_CHARACTER_ID
  );

  assert.equal(karenPreviewActions.length, 2);
  assert.deepEqual(karenPreviewActions.map((action) => action.castIndex), [0, 1]);
  assert.equal(karenPreviewActions[0].skillFunnelHitBonus, FUNNEL_POWER);
  assert.equal(karenPreviewActions[1].skillFunnelHitBonus, 0);
  assert.ok(
    karenPreviewActions[0].activeStatusEffects.some(
      (effect) => effect.statusType === 'AttackUp' && Number(effect.sourceSkillId ?? 0) === LI_FUNNEL_SKILL_ID
    )
  );
  assert.ok(
    !karenPreviewActions[1].activeStatusEffects.some(
      (effect) => effect.statusType === 'AttackUp' && Number(effect.sourceSkillId ?? 0) === LI_FUNNEL_SKILL_ID
    )
  );
  assert.equal(karenPreviewActions[0].spCost, EX_SP_COST);
  assert.equal(karenPreviewActions[1].spCost, 0);

  const { committedRecord: turn3Record } = commitTurn(turn2State, turn3Preview);
  const karenCommittedActions = turn3Record.actions.filter(
    (action) => action.characterId === KAREN_CHARACTER_ID
  );

  assert.equal(karenCommittedActions.length, 2);
  assert.equal(karenCommittedActions[0].consumedFunnelEffects.length, 1);
  assert.equal(karenCommittedActions[1].consumedFunnelEffects.length, 0);

  for (const action of karenCommittedActions) {
    const criticalRateUpEvents = action.statusEffectsApplied.filter(
      (event) => event.statusType === 'CriticalRateUp'
    );
    const criticalDamageUpEvents = action.statusEffectsApplied.filter(
      (event) => event.statusType === 'CriticalDamageUp'
    );

    assert.equal(criticalRateUpEvents.length, PARTY_MEMBER_COUNT);
    assert.equal(criticalDamageUpEvents.length, PARTY_MEMBER_COUNT);
    assert.ok(
      criticalRateUpEvents.every((event) => String(event?.actionInstanceId ?? '') === action.actionInstanceId)
    );
    assert.ok(
      criticalDamageUpEvents.every((event) => String(event?.actionInstanceId ?? '') === action.actionInstanceId)
    );
  }
});

test('DoubleActionExtraSkill: 水瀬すももの二連EXで東城つかさLB3のお裾分けが2回発火する', () => {
  const store = getStore();
  const TOJO_STYLE_ID = 1001408;
  const SUMOMO_STYLE_ID = 1002307;
  const FRONT_FILLER_STYLE_ID = 1001101;
  const BACK_FILLER_STYLE_IDS = [1001201, 1001301, 1001501];
  const PROTECTION_SKILL_ID = 46300004;
  const SUMOMO_EX_SKILL_ID = 46002310;
  const TOJO_CHARACTER_ID = 'TTojo';
  const SUMOMO_CHARACTER_ID = 'SMinase';
  const FRONT_FILLER_CHARACTER_ID = 'RKayamori';
  const PASSIVE_TRIGGER_CEILING = 30;
  const PASSIVE_TRIGGER_COUNT = 2;
  const TOJO_SELF_HEAL_DELTA = 3;
  const TOJO_PARTY_HEAL_DELTA = 2;
  const INITIAL_SUMOMO_SP = 30;
  const INITIAL_OTHER_SP = 10;
  const EXPECTED_BACKLINE_SP_AFTER_DOUBLE_EX = 20;

  const party = store.buildPartyFromStyleIds(
    [TOJO_STYLE_ID, SUMOMO_STYLE_ID, FRONT_FILLER_STYLE_ID, ...BACK_FILLER_STYLE_IDS],
    {
      initialSP: INITIAL_OTHER_SP,
      initialSpByPartyIndex: {
        1: INITIAL_SUMOMO_SP,
      },
      limitBreakLevelsByPartyIndex: {
        0: 3,
        1: 3,
      },
      skillSetsByPartyIndex: {
        0: [PROTECTION_SKILL_ID],
        1: [SUMOMO_EX_SKILL_ID, PROTECTION_SKILL_ID],
        2: [PROTECTION_SKILL_ID],
      },
    }
  );
  const state = applyInitialPassiveState(createBattleStateFromParty(party));
  const tojo = state.party.find((member) => member.characterId === TOJO_CHARACTER_ID);
  const sumomo = state.party.find((member) => member.characterId === SUMOMO_CHARACTER_ID);
  const frontFiller = state.party.find((member) => member.characterId === FRONT_FILLER_CHARACTER_ID);

  assert.ok(tojo, '東城つかさが前衛に存在すること');
  assert.ok(sumomo, '水瀬すももが前衛に存在すること');
  assert.ok(frontFiller, '前衛フィラーが存在すること');

  const preview = previewTurn(state, {
    0: { characterId: tojo.characterId, skillId: PROTECTION_SKILL_ID },
    1: { characterId: sumomo.characterId, skillId: SUMOMO_EX_SKILL_ID, targetEnemyIndex: 0 },
    2: { characterId: frontFiller.characterId, skillId: PROTECTION_SKILL_ID },
  });
  const sumomoPreviewActions = preview.actions.filter(
    (action) => action.characterId === SUMOMO_CHARACTER_ID
  );

  assert.equal(sumomoPreviewActions.length, 2);
  assert.deepEqual(sumomoPreviewActions.map((action) => action.castIndex), [0, 1]);
  assert.notEqual(
    sumomoPreviewActions[0].actionInstanceId,
    sumomoPreviewActions[1].actionInstanceId,
    '二連EXの各castは別actionInstanceIdを持つこと'
  );

  const { committedRecord, nextState } = commitTurn(state, preview);
  const committedSumomoActions = committedRecord.actions.filter(
    (action) => action.characterId === SUMOMO_CHARACTER_ID
  );
  const tojoAction = committedRecord.actions.find((action) => action.characterId === TOJO_CHARACTER_ID);
  const frontFillerAction = committedRecord.actions.find(
    (action) => action.characterId === FRONT_FILLER_CHARACTER_ID
  );

  assert.equal(committedSumomoActions.length, 2);
  assert.ok(tojoAction, '東城つかさのaction recordが存在すること');
  assert.ok(frontFillerAction, '前衛フィラーのaction recordが存在すること');

  const oshusowakeEvents = (committedRecord.passiveEvents ?? []).filter(
    (event) => event.passiveName === 'お裾分け'
  );
  const aikyoEvents = (committedRecord.passiveEvents ?? []).filter(
    (event) => event.passiveName === '愛嬌'
  );

  assert.equal(oshusowakeEvents.length, PASSIVE_TRIGGER_COUNT);
  assert.equal(aikyoEvents.length, PASSIVE_TRIGGER_COUNT);
  assert.deepEqual(oshusowakeEvents.map((event) => event.castIndex), [0, 1]);
  assert.deepEqual(aikyoEvents.map((event) => event.castIndex), [0, 1]);
  assert.deepEqual(
    oshusowakeEvents.map((event) => event.actionInstanceId),
    committedSumomoActions.map((action) => action.actionInstanceId)
  );
  assert.deepEqual(
    aikyoEvents.map((event) => event.actionInstanceId),
    committedSumomoActions.map((action) => action.actionInstanceId)
  );
  assert.ok(
    oshusowakeEvents.every((event) => Number(event.triggerSkillId ?? 0) === SUMOMO_EX_SKILL_ID)
  );
  assert.ok(
    aikyoEvents.every((event) => Number(event.triggerSkillId ?? 0) === SUMOMO_EX_SKILL_ID)
  );

  const tojoPassiveSpChanges = (tojoAction.spChanges ?? []).filter(
    (change) => change.source === 'sp_passive'
  );
  const tojoSelfHealChanges = tojoPassiveSpChanges.filter(
    (change) =>
      change.delta === TOJO_SELF_HEAL_DELTA &&
      Number(change.eventCeiling ?? 0) === PASSIVE_TRIGGER_CEILING
  );
  const tojoPartyHealChanges = tojoPassiveSpChanges.filter(
    (change) =>
      change.delta === TOJO_PARTY_HEAL_DELTA &&
      Number(change.eventCeiling ?? 0) === PASSIVE_TRIGGER_CEILING
  );
  assert.equal(tojoSelfHealChanges.length, PASSIVE_TRIGGER_COUNT);
  assert.equal(tojoPartyHealChanges.length, PASSIVE_TRIGGER_COUNT);

  const frontFillerPassiveSpChanges = (frontFillerAction.spChanges ?? []).filter(
    (change) =>
      change.source === 'sp_passive' &&
      change.delta === TOJO_PARTY_HEAL_DELTA &&
      Number(change.eventCeiling ?? 0) === PASSIVE_TRIGGER_CEILING
  );
  assert.equal(frontFillerPassiveSpChanges.length, PASSIVE_TRIGGER_COUNT);

  for (const action of committedSumomoActions) {
    const partyHealChanges = (action.spChanges ?? []).filter(
      (change) =>
        change.source === 'sp_passive' &&
        change.delta === TOJO_PARTY_HEAL_DELTA &&
        Number(change.eventCeiling ?? 0) === PASSIVE_TRIGGER_CEILING
    );
    assert.equal(partyHealChanges.length, 1);
  }

  const nextSpByCharacterId = Object.fromEntries(
    nextState.party.map((member) => [member.characterId, member.sp.current])
  );
  for (const backlineCharacterId of ['YIzumi', 'MAikawa', 'KAsakura']) {
    assert.equal(
      nextSpByCharacterId[backlineCharacterId],
      EXPECTED_BACKLINE_SP_AFTER_DOUBLE_EX,
      `${backlineCharacterId} は二連EXとお裾分け2回で SP20 になること`
    );
  }
});

test('DoubleActionExtraSkill: EX残回数が1以下なら二連せず単発のままになる', () => {
  const singleUseState = createDoubleActionManualState({
    skillOptions: {
      usage: {
        mode: 'fixed',
        displayUses: 1,
        maxUses: 1,
        minUses: 1,
        expandable: true,
      },
    },
  });

  const preview = previewTurn(singleUseState, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 1);
  assert.equal(preview.actions[0].castCount, 1);
  assert.equal(preview.actions[0].spCost, 14);
});

test('DoubleActionExtraSkill: Funnelは1発目だけで消費され、2発目には乗らない', () => {
  const state = createDoubleActionManualState({
    statusEffects: [
      {
        statusType: 'Funnel',
        limitType: 'Default',
        exitCond: 'Count',
        remaining: 1,
        power: 3,
      },
    ],
  });

  const preview = previewTurn(state, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 2);
  assert.ok(preview.actions[0].skillFunnelHitBonus > 0);
  assert.equal(preview.actions[1].skillFunnelHitBonus, 0);

  const { committedRecord } = commitTurn(state, preview);
  assert.equal(committedRecord.actions[0].consumedFunnelEffects.length, 1);
  assert.equal(committedRecord.actions[1].consumedFunnelEffects.length, 0);
});

test('DoubleActionExtraSkill: MindEyeは1発目だけで消費され、2発目では消費されない', () => {
  const state = createDoubleActionManualState({
    statusEffects: [
      {
        statusType: 'MindEye',
        limitType: 'Only',
        exitCond: 'Count',
        remaining: 1,
        power: 1,
        metadata: { singleTrigger: true },
      },
    ],
  });

  const preview = previewTurn(state, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });
  const { committedRecord } = commitTurn(state, preview);

  assert.equal(committedRecord.actions.length, 2);
  assert.equal(committedRecord.actions[0].consumedMindEyeEffects.length, 1);
  assert.equal(committedRecord.actions[1].consumedMindEyeEffects.length, 0);
});

test('DoubleActionExtraSkill: Count型AttackUpは1発目で切れ、2発目previewには残らない', () => {
  const state = createDoubleActionManualState({
    statusEffects: [
      {
        statusType: 'AttackUp',
        limitType: 'Default',
        exitCond: 'Count',
        remaining: 1,
        power: 0.5,
        metadata: { activeBuffStatus: true },
      },
    ],
  });

  const preview = previewTurn(state, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 2);
  assert.equal(preview.actions[0].activeStatusEffectModifiers.attackUpRate, 0.5);
  assert.equal(preview.actions[1].activeStatusEffectModifiers.attackUpRate, 0);
});

test('DoubleActionExtraSkill: passive由来のCount型AttackUpはaction消費されず2発目にも残る', () => {
  const state = createDoubleActionManualState({
    statusEffects: [
      {
        statusType: 'AttackUp',
        limitType: 'Default',
        exitCond: 'Count',
        remaining: 1,
        power: 0.5,
        sourceType: 'passive',
      },
    ],
  });

  const preview = previewTurn(state, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });

  assert.equal(preview.actions.length, 2);
  assert.equal(preview.actions[0].activeStatusEffectModifiers.attackUpRate, 0.5);
  assert.equal(preview.actions[1].activeStatusEffectModifiers.attackUpRate, 0.5);
});

test('DoubleActionExtraSkill: self resource gains are allocated to each cast without duplication', () => {
  const state = createDoubleActionManualState({
    skillOptions: {
      parts: [
        { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' },
        { skill_type: 'HealSp', target_type: 'Self', power: [2, 0], value: [0, 0] },
        { skill_type: 'HealEp', target_type: 'Self', power: [3, 0], value: [0, 0] },
        { skill_type: 'TokenSet', target_type: 'Self', power: [1, 0], value: [0, 0] },
      ],
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'DEX1', skillId: 99001, targetEnemyIndex: 0 },
  });
  const { committedRecord } = commitTurn(state, preview);

  assert.equal(committedRecord.actions.length, 2);

  const firstSpSkillChanges = committedRecord.actions[0].spChanges.filter(
    (change) => change.source === 'active' && change.delta === 2
  );
  const secondSpSkillChanges = committedRecord.actions[1].spChanges.filter(
    (change) => change.source === 'active' && change.delta === 2
  );
  assert.equal(firstSpSkillChanges.length, 1);
  assert.equal(secondSpSkillChanges.length, 1);
  assert.equal(firstSpSkillChanges[0].delta, 2);
  assert.equal(secondSpSkillChanges[0].delta, 2);

  const firstEpSkillChanges = committedRecord.actions[0].epChanges.filter(
    (change) => change.source === 'ep_skill'
  );
  const secondEpSkillChanges = committedRecord.actions[1].epChanges.filter(
    (change) => change.source === 'ep_skill'
  );
  assert.equal(firstEpSkillChanges.length, 1);
  assert.equal(secondEpSkillChanges.length, 1);
  assert.equal(firstEpSkillChanges[0].delta, 3);
  assert.equal(secondEpSkillChanges[0].delta, 3);

  const firstTokenSkillChanges = committedRecord.actions[0].tokenChanges.filter(
    (change) => change.source === 'token_skill'
  );
  const secondTokenSkillChanges = committedRecord.actions[1].tokenChanges.filter(
    (change) => change.source === 'token_skill'
  );
  assert.equal(firstTokenSkillChanges.length, 1);
  assert.equal(secondTokenSkillChanges.length, 1);
  assert.equal(firstTokenSkillChanges[0].delta, 1);
  assert.equal(secondTokenSkillChanges[0].delta, 1);
});

// od_rate OD 上昇量補正テスト
test('enemy od_rate scales OD gain by od_rate/10000 multiplier (WIP: rounding position TBD)', () => {
  // 4-hit 単体攻撃: 攻撃 OD = trunc2(2.5 * 4) = 10.00%
  // od_rate=5000 (50%) → effectiveGain = trunc2(10.00 * 0.5) = 5.00%
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODR${idx + 1}`,
      characterName: `ODR${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODRS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15900 + idx,
          name: idx === 0 ? '4hit Single' : 'Protection',
          label: idx === 0 ? 'FourHitSingle' : `ODRSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 4 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }]
              : [],
        },
      ],
    })
  );

  const baseState = createBattleStateFromParty(new Party(members));
  baseState.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Slash: 100 } },
    odRateByEnemy: { '0': 5000 },
  };

  const preview = previewTurn(baseState, {
    0: { characterId: 'ODR1', skillId: 15900 },
  });
  const { nextState } = commitTurn(baseState, preview);

  // 補正後: trunc2(10.00 * 0.5) = 5.00
  assert.equal(nextState.turnState.odGauge, 5);
});

test('enemy od_rate accepts direct multiplier values where 1 means 100 percent', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODM${idx + 1}`,
      characterName: `ODM${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODMS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15940 + idx,
          name: idx === 0 ? '4hit Single' : 'Protection',
          label: idx === 0 ? 'FourHitSingleMultiplier' : `ODMSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 4 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }]
              : [],
        },
      ],
    })
  );

  const baseState = createBattleStateFromParty(new Party(members));
  baseState.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Slash: 100 } },
    odRateByEnemy: { '0': 0.5 },
  };

  const preview = previewTurn(baseState, {
    0: { characterId: 'ODM1', skillId: 15940 },
  });
  const { nextState } = commitTurn(baseState, preview);

  assert.equal(nextState.turnState.odGauge, 5);
});

test('enemy od_rate=0 means no correction: OD gain is unchanged', () => {
  // 4-hit 単体攻撃: OD = 10.00%、od_rate=0 → 補正なし → 10.00%
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `OD0${idx + 1}`,
      characterName: `OD0${idx + 1}`,
      styleId: idx + 1,
      styleName: `OD0S${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15920 + idx,
          name: idx === 0 ? '4hit Single' : 'Protection',
          label: idx === 0 ? 'FourHitSingleNoRate' : `OD0Skill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 4 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }]
              : [],
        },
      ],
    })
  );

  const baseState = createBattleStateFromParty(new Party(members));
  baseState.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Slash: 100 } },
    odRateByEnemy: { '0': 0 },
  };

  const preview = previewTurn(baseState, {
    0: { characterId: 'OD01', skillId: 15920 },
  });
  const { nextState } = commitTurn(baseState, preview);

  // 補正なし: 10.00%
  assert.equal(nextState.turnState.odGauge, 10);
});

test('enemy od_rate applies truncation to fixed 3-hit OD for normal attacks', () => {
  // 通常攻撃 OD は 3hit 相当で固定:
  // 1hit OD = trunc2(2.5 * 0.85) = 2.12、3hit固定で 6.36
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODH${idx + 1}`,
      characterName: `ODH${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODHS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 15960 + idx,
          name: idx === 0 ? '通常攻撃' : 'Protection',
          label: idx === 0 ? 'ODHAttackNormal' : `ODHSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 3 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }]
              : [],
        },
      ],
    })
  );

  const baseState = createBattleStateFromParty(new Party(members));
  baseState.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Slash: 100 } },
    odRateByEnemy: { '0': 0.85 },
  };

  const preview = previewTurn(baseState, {
    0: { characterId: 'ODH1', skillId: 15960 },
  });
  const { nextState } = commitTurn(baseState, preview);

  assert.equal(nextState.turnState.odGauge, 6.36);
});

test('enemy od_rate scales hit-based OD only and leaves OverDrivePointUp unscaled', () => {
  // 5-hit 攻撃 + OverDrivePointUp(30%)、od_rate=0.85:
  // hit OD: trunc2(2.5 * 0.85) * 5 = 10.60
  // OverDrivePointUp: 30.00 (非補正)
  // 合計: 40.60
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `ODP${idx + 1}`,
      characterName: `ODP${idx + 1}`,
      styleId: idx + 1,
      styleName: `ODPS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills: [
        {
          id: 16000 + idx,
          name: idx === 0 ? '5hit + ODUp30' : 'Protection',
          label: idx === 0 ? 'FiveHitWithOdUp' : `ODPSkill${idx + 1}`,
          sp_cost: 0,
          hit_count: idx === 0 ? 5 : 0,
          target_type: 'Single',
          parts:
            idx === 0
              ? [
                  { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' },
                  { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.3, 0], value: [0, 0] },
                ]
              : [],
        },
      ],
    })
  );

  const baseState = createBattleStateFromParty(new Party(members));
  baseState.turnState.enemyState = {
    enemyCount: 1,
    statuses: [],
    damageRatesByEnemy: { '0': { Slash: 100 } },
    odRateByEnemy: { '0': 0.85 },
  };

  const preview = previewTurn(baseState, {
    0: { characterId: 'ODP1', skillId: 16000 },
  });
  const { nextState } = commitTurn(baseState, preview);

  assert.equal(nextState.turnState.odGauge, 40.6);
});

// ─── Multiple passive trigger同時発火のテスト ───

test('Multiple AdditionalHitOnBreaking passives fire simultaneously when breaking (敵をブレイク時に複数パッシブ発火)', () => {
  // 複数のAdditionalHitOnBreakingトリガーを持つパッシブが、
  // 敵ブレイク時に同時に発火することを検証する。
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'MULTI_BREAK1',
          characterName: 'MULTI_BREAK1',
          initialSP: 10,
          passives: [
            {
              id: 100201,
              name: 'ブレイク時OD増加パッシブ1',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.25, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
            {
              id: 100202,
              name: 'ブレイク時OD増加パッシブ2',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.15, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100203,
              name: 'Break Trigger Multi-Passive',
              sp_cost: 3,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [0, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  
  const preview = previewTurn(state, {
    0: { characterId: 'MULTI_BREAK1', skillId: 100203, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  
  const finalOdGauge = Number(nextState.turnState.odGauge ?? 0);
  
  // OD増加: パッシブ1で +25（0.25*100）、パッシブ2で +15（0.15*100）、合計 +40
  assert.ok(
    Math.abs(finalOdGauge - (initialOdGauge + 40)) < 0.1,
    `OD gauge should increase by 40 (25+15) from both AdditionalHitOnBreaking passives: initial=${initialOdGauge}, final=${finalOdGauge}`
  );
});

test('Multiple AdditionalHitOnBreaking passives with different effects on breaking', () => {
  // 複数のパッシブが敵ブレイク時に発火し、それぞれの効果が正しく適用されることを検証
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'MULTI_BREAK2',
          characterName: 'MULTI_BREAK2',
          initialSP: 15,
          passives: [
            {
              id: 100301,
              name: 'ブレイク時OD+30',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.3, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
            {
              id: 100302,
              name: 'ブレイク時OD+20',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'OverDrivePointUp', target_type: 'Self', power: [0.2, 0], value: [0, 0], cond: '', hit_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 100304,
              name: 'Break Trigger Summed OD',
              sp_cost: 5,
              parts: [{ skill_type: 'HealSp', target_type: 'Self', power: [1, 0] }],
            },
          ],
        }
      : {}
  );
  const state = createBattleStateFromParty(party);
  
  const initialOdGauge = Number(state.turnState.odGauge ?? 0);
  
  const preview = previewTurn(state, {
    0: { characterId: 'MULTI_BREAK2', skillId: 100304, breakHitCount: 1 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);
  
  const finalOdGauge = Number(nextState.turnState.odGauge ?? 0);
  
  // OD増加: パッシブ1で +30、パッシブ2で +20、合計 +50
  assert.ok(
    Math.abs(finalOdGauge - (initialOdGauge + 50)) < 0.1,
    `OD gauge should increase by 50 (30+20) from both passives: initial=${initialOdGauge}, final=${finalOdGauge}`
  );
});

// ─── HealSp: previewTurn projections.spAfterActionByPartyIndex ───

test('HealSp AllyAll: projections.spAfterActionByPartyIndex reflects SP+5 for all members', () => {
  const healAmount = 5;
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'HEALER',
        characterName: 'HEALER',
        initialSP: 8,
        skills: [
          {
            id: 90001,
            name: 'HealSp全体',
            sp_cost: 3,
            parts: [
              { skill_type: 'HealSp', target_type: 'AllyAll', power: [healAmount, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
            ],
          },
        ],
      };
    }
    return {
      initialSP: 5,
      skills: [createProtectionSkill(8800 + idx)],
    };
  });
  const state = createBattleStateFromParty(party);

  const preview = previewTurn(state, {
    0: { characterId: 'HEALER', skillId: 90001 },
    1: { characterId: 'M2', skillId: 8801 },
    2: { characterId: 'M3', skillId: 8802 },
  });

  const projectedSp = preview.projections?.spAfterActionByPartyIndex;
  assert.ok(projectedSp, 'projections.spAfterActionByPartyIndex が存在すること');

  // 全6メンバー分のエントリがあること
  assert.equal(Object.keys(projectedSp).length, 6, '全6メンバー分のSP projectionが存在すること');

  // HEALER (idx=0): 8 - 3(cost) + 5(HealSp) = 10
  assert.equal(projectedSp[0], 10, 'HealSp使用者自身もSP+5が反映されること');

  // 前衛 M2, M3 (idx=1,2): 5 - 0(プロテクションcost) + 5(HealSp) = 10
  assert.equal(projectedSp[1], 10, '前衛M2にSP+5が反映されること');
  assert.equal(projectedSp[2], 10, '前衛M3にSP+5が反映されること');

  // 後衛 M4, M5, M6 (idx=3,4,5): 5 + 5(HealSp) = 10
  assert.equal(projectedSp[3], 10, '後衛M4にSP+5が反映されること');
  assert.equal(projectedSp[4], 10, '後衛M5にSP+5が反映されること');
  assert.equal(projectedSp[5], 10, '後衛M6にSP+5が反映されること');
});

test('スペクタクルアート real data: projections.spAfterActionByPartyIndex includes HealSp+5', () => {
  const store = getStore();
  const skillId = 46005222; // スペクタクルアート
  const party = buildSingleSkillRealDataParty(store, skillId);
  const state = createBattleStateFromParty(party);

  // 闇フィールドを設定（スペクタクルアートが無料になる条件）
  state.turnState.zoneState = {
    type: 'Dark',
    sourceSide: 'player',
    remainingTurns: 8,
    powerRate: 1.8,
  };

  const preview = previewActorSkill(state, skillId);
  const projectedSp = preview.projections?.spAfterActionByPartyIndex;
  assert.ok(projectedSp, 'projections.spAfterActionByPartyIndex が存在すること');
  assert.equal(Object.keys(projectedSp).length, 6, '全6メンバー分のSP projectionが存在すること');

  // 全メンバーが初期SP=20 なので、HealSp+5 により max=20 で上限クランプ。
  // actor (idx=0): 20 - 0(cost=0, zone条件充足) + 5 → ただし max=20 なのでクランプ
  // 他メンバー: 20 + 5 → max=20 でクランプ
  // → 全員 20 のはず
  for (const [pi, sp] of Object.entries(projectedSp)) {
    assert.ok(
      Number(sp) >= 20,
      `partyIndex=${pi}: SP should be >=20 after HealSp+5 (actual=${sp})`
    );
  }
});

// ─── 割込OD でSP回復が二重適用されないことの回帰テスト ───

test('interrupt OD1: base SP recovery is applied once (at OD→normal transition only)', () => {
  const party = createSixMemberManualParty(() => ({
    initialSP: 10,
    skills: [createProtectionSkill(9900)],
  }));
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;

  // Turn 1: 通常ターンを割込OD1付きでコミット
  const preview1 = previewTurn(state, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: odState } = commitTurn(state, preview1, [], {
    interruptOdLevel: 1,
  });

  // OD ターンに遷移、OD1 SP回復(+5)のみ。基本回復(+2)は適用されない
  assert.equal(odState.turnState.turnType, 'od');
  for (const m of odState.party) {
    assert.equal(m.sp.current, 15, `${m.characterId}: 10 + 5(OD1) = 15, no base recovery`);
  }

  // Turn 2: OD ターンをコミット → 通常ターンへ戻る
  const preview2 = previewTurn(odState, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: normalState } = commitTurn(odState, preview2);

  // OD→通常遷移で基本回復(+2)が1回だけ適用される
  assert.equal(normalState.turnState.turnType, 'normal');
  for (const m of normalState.party) {
    assert.equal(m.sp.current, 17, `${m.characterId}: 15 + 2(base) = 17, single recovery`);
  }
});

test('preemptive OD1: base SP recovery is not applied at OD→same-turn transition', () => {
  const party = createSixMemberManualParty(() => ({
    initialSP: 10,
    skills: [createProtectionSkill(9900)],
  }));
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 100;

  // 先制OD1 を発動
  const odState = activateOverdrive(state, 1, 'preemptive');
  assert.equal(odState.turnState.turnType, 'od');

  // OD ターンをコミット → 同一ターンの通常文脈へ復帰
  const preview = previewTurn(odState, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: backToNormal } = commitTurn(odState, preview);

  // 同一ターン復帰: 基本回復なし
  assert.equal(backToNormal.turnState.turnType, 'normal');
  for (const m of backToNormal.party) {
    assert.equal(m.sp.current, 15, `${m.characterId}: 10 + 5(OD1) = 15, no recovery on same-turn return`);
  }

  // 通常ターンをコミット → 次ターンで初めて基本回復が適用される
  const preview2 = previewTurn(backToNormal, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: nextNormal } = commitTurn(backToNormal, preview2);

  assert.equal(nextNormal.turnState.turnType, 'normal');
  for (const m of nextNormal.party) {
    assert.equal(m.sp.current, 17, `${m.characterId}: 15 + 2(base) = 17`);
  }
});

test('OD multi-action (OD2): base SP recovery only at final OD→normal transition', () => {
  const party = createSixMemberManualParty(() => ({
    initialSP: 2,
    skills: [createProtectionSkill(9900)],
  }));
  const state = createBattleStateFromParty(party);
  state.turnState.odGauge = 200;

  // 割込OD2 発動
  const preview1 = previewTurn(state, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: od1 } = commitTurn(state, preview1, [], { interruptOdLevel: 2 });

  // OD2 発動: 2 + 12(OD2) = 14, 基本回復なし
  assert.equal(od1.turnState.turnType, 'od');
  assert.equal(od1.turnState.remainingOdActions, 2);
  for (const m of od1.party) {
    assert.equal(m.sp.current, 14, `${m.characterId}: 2 + 12(OD2) = 14, no base recovery`);
  }

  // OD2-1 コミット → まだOD中
  const preview2 = previewTurn(od1, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: od2 } = commitTurn(od1, preview2);

  assert.equal(od2.turnState.turnType, 'od');
  // OD→OD遷移: 基本回復なし、SP=14 維持
  for (const m of od2.party) {
    assert.equal(m.sp.current, 14, `${m.characterId}: still 14, no mid-OD recovery`);
  }

  // OD2-2 コミット → 通常へ
  const preview3 = previewTurn(od2, {
    0: { characterId: 'M1', skillId: 9900 },
    1: { characterId: 'M2', skillId: 9900 },
    2: { characterId: 'M3', skillId: 9900 },
  });
  const { nextState: normal } = commitTurn(od2, preview3);

  assert.equal(normal.turnState.turnType, 'normal');
  // OD→通常: 基本回復 +2 が1回だけ適用される
  for (const m of normal.party) {
    assert.equal(m.sp.current, 16, `${m.characterId}: 14 + 2(base) = 16`);
  }
});

test('interrupt OD1 during EX (odSuspended, all OD consumed) → normal with single base recovery', () => {
  const members = Array.from({ length: 6 }, (_, idx) =>
    new CharacterStyle({
      characterId: `S${idx + 1}`,
      characterName: `S${idx + 1}`,
      styleId: idx + 1,
      styleName: `SS${idx + 1}`,
      partyIndex: idx,
      position: idx,
      initialSP: 10,
      skills:
        idx === 0
          ? [
              {
                id: 16000,
                name: 'Grant Self Extra',
                sp_cost: 0,
                additionalTurnRule: {
                  skillUsableInExtraTurn: true,
                  additionalTurnGrantInExtraTurn: false,
                  conditions: {
                    requiresOverDrive: false,
                    requiresReinforcedMode: false,
                    excludesExtraTurnForSkillUse: false,
                    excludesExtraTurnForAdditionalTurnGrant: true,
                  },
                  additionalTurnTargetTypes: ['Self'],
                },
                parts: [{ skill_type: 'AdditionalTurn', target_type: 'Self' }],
              },
              {
                id: 16001,
                name: 'Normal',
                sp_cost: 0,
                parts: [],
              },
            ]
          : [{ id: 16010 + idx, name: 'Normal', sp_cost: 0, parts: [] }],
    })
  );

  let state = createBattleStateFromParty(new Party(members));
  state.turnState.odGauge = 100;

  // T1: 割込OD1 発動 → OD1-1 へ
  const preview1 = previewTurn(state, {
    0: { characterId: 'S1', skillId: 16000 },
    1: { characterId: 'S2', skillId: 16011 },
    2: { characterId: 'S3', skillId: 16012 },
  });
  const { nextState: odState } = commitTurn(state, preview1, [], { interruptOdLevel: 1 });

  assert.equal(odState.turnState.turnType, 'od');
  assert.equal(odState.turnState.odContext, 'interrupt');
  assert.equal(odState.turnState.remainingOdActions, 1);
  // OD1回復: 10 + 5 = 15, 基本回復なし
  const actor = odState.party.find((m) => m.characterId === 'S1');
  assert.equal(actor.sp.current, 15);

  // OD1-1: 追加ターン付与スキル → EX へ (odSuspended, remainingOdActions=0)
  const previewOd = previewTurn(odState, {
    0: { characterId: 'S1', skillId: 16000 },
    1: { characterId: 'S2', skillId: 16011 },
    2: { characterId: 'S3', skillId: 16012 },
  });
  const { nextState: exState } = commitTurn(odState, previewOd);

  assert.equal(exState.turnState.turnType, 'extra');
  assert.equal(exState.turnState.odSuspended, true);
  assert.equal(exState.turnState.odContext, 'interrupt');
  assert.equal(exState.turnState.remainingOdActions, 0);
  // EX遷移: 基本回復なし → SP=15 維持
  const actorEx = exState.party.find((m) => m.characterId === 'S1');
  assert.equal(actorEx.sp.current, 15);

  // EX コミット → odSuspended + interrupt + OD全消費 → normal (turnIndex+1)
  const previewEx = previewTurn(exState, {
    0: { characterId: 'S1', skillId: 16001 },
  });
  const { nextState: normalState } = commitTurn(exState, previewEx);

  assert.equal(normalState.turnState.turnType, 'normal');
  assert.equal(normalState.turnState.odSuspended, false);
  // interrupt 文脈での復帰: turnIndex が進むため基本回復 +2 が1回適用される
  for (const m of normalState.party) {
    assert.equal(m.sp.current, 17, `${m.characterId}: 15 + 2(base) = 17`);
  }
});

  test('applyRecoveryPipeline applies every-turn SP bonus to all party members', () => {
    const party = createSixMemberManualParty();
    let state = createBattleStateFromParty(party);
    state.stageSetupTurnly = { spAll: 3, spFront: 2, spBack: -1 };
    state.turnState.turnIndex = 1;

    // ターン開始: 基本回復 +2 + 毎ターんSP適用
    const preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: 8000 },
    });
    const { nextState } = commitTurn(state, preview, []);

    // 前衛 (0-2): 10 + 2(base) + 3(all) + 2(front) = 17
    for (let i = 0; i < 3; i += 1) {
      const member = nextState.party[i];
      assert.equal(member.sp.current, 17, `Front M${i + 1}: should be 10 + 2 + 3 + 2 = 17`);
    }

    // 後衛 (3-5): 10 + 2(base) + 3(all) - 1(back) = 14
    for (let i = 3; i < 6; i += 1) {
      const member = nextState.party[i];
      assert.equal(member.sp.current, 14, `Back M${i + 1}: should be 10 + 2 + 3 - 1 = 14`);
    }
  });

  test('applyRecoveryPipeline handles negative every-turn SP (penalty)', () => {
    const party = createSixMemberManualParty();
    let state = createBattleStateFromParty(party);
    state.stageSetupTurnly = { spAll: -2, spFront: 0, spBack: 0 };
    state.turnState.turnIndex = 2;

    const preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: 8000 },
    });
    const { nextState } = commitTurn(state, preview, []);

    // All members: 10 + 2(base) - 2(all) = 10
    for (let i = 0; i < 6; i += 1) {
      const member = nextState.party[i];
      assert.equal(member.sp.current, 10, `M${i + 1}: should be 10 + 2 - 2 = 10`);
    }
  });

  test('applyRecoveryPipeline applies every-turn SP on normal turn transition', () => {
    const party = createSixMemberManualParty();
    let state = createBattleStateFromParty(party);
    state.stageSetupTurnly = { spAll: 0, spFront: 0, spBack: 0 }; // Zero to simplify validation
    state.turnState.turnIndex = 1;

    // Normal turn progression: turnIndex will advance
    const preview = previewTurn(state, {
      0: { characterId: 'M1', skillId: 8000 },
    });
    const { nextState } = commitTurn(state, preview, []);

    // Every-turn SP should NOT be applied (zeroed out) but base recovery +2 should be
    // Before: 10, after base recovery: 12, after turnly (zero): 12
    for (const member of nextState.party) {
      if (member.position <= 2) {
        // Front-line attacker with skill
        assert.equal(member.sp.current, 12, `${member.characterId}: should be 10 + 2(base) + 0(turnly) = 12`);
      } else {
        // Back-line members also got base recovery
        assert.equal(member.sp.current, 12, `${member.characterId}: should be 10 + 2(base) + 0(turnly) = 12`);
      }
    }
  });

test('applyStageSetupTurnStartEffects seeds T1 state without base SP recovery', () => {
  const party = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8900 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupTurnly = { spAll: 3, spFront: 2, spBack: -1, odGauge: 10 };
  state.stageSetupEnchantEffects = [];

  applyStageSetupTurnStartEffects(state);

  for (let i = 0; i < 3; i += 1) {
    assert.equal(state.party[i].sp.current, 15, `Front M${i + 1}: should be 10 + 3 + 2 = 15 on T1`);
  }
  for (let i = 3; i < 6; i += 1) {
    assert.equal(state.party[i].sp.current, 12, `Back M${i + 1}: should be 10 + 3 - 1 = 12 on T1`);
  }
  assert.equal(state.turnState.odGauge, 10);
});

test('applyStageSetupTurnStartEffects emits passive log events for stage setup turn-start SP/OD bonuses', () => {
  const party = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8905 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupTurnly = { spAll: 1, spFront: 1, spBack: 0, odGauge: 10 };
  state.stageSetupEnchantEffects = [
    { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
  ];
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const passiveEvents = [];
  applyStageSetupTurnStartEffects(state, [], passiveEvents);

  assert.equal(
    passiveEvents.some(
      (event) =>
        event.sourceType === 'stage_setup' &&
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === '毎ターンSP+1' &&
        Number(event.spDelta ?? 0) === 6
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.sourceType === 'stage_setup' &&
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === '毎ターン前衛のSP+1' &&
        Number(event.spDelta ?? 0) === 3
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.sourceType === 'stage_setup' &&
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === 'ターン開始時ダウンターン中の敵がいるとSP+2' &&
        Number(event.spDelta ?? 0) === 12
    ),
    true
  );
  assert.equal(
    passiveEvents.some(
      (event) =>
        event.sourceType === 'stage_setup' &&
        event.timing === 'OnEveryTurn' &&
        event.passiveDesc === '毎ターンOD+10%' &&
        Number(event.odGaugeDelta ?? 0) === 10
    ),
    true
  );
});

test('applyRecoveryPipeline applies every-turn OD on normal turn transition', () => {
  const party = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8910 + idx)],
  }));
  const state = createBattleStateFromParty(party);
  state.stageSetupTurnly = { spAll: 0, spFront: 0, spBack: 0, odGauge: 10 };
  state.turnState.turnIndex = 1;

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8910 },
  });
  const { nextState } = commitTurn(state, preview, []);

  assert.equal(nextState.turnState.odGauge, 10);
});

test('applyRecoveryPipeline clamps every-turn OD at max and min bounds', () => {
  const positiveParty = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8930 + idx)],
  }));
  const positiveState = createBattleStateFromParty(positiveParty);
  positiveState.turnState.odGauge = 295;
  positiveState.stageSetupTurnly = { spAll: 0, spFront: 0, spBack: 0, odGauge: 10 };

  const positivePreview = previewTurn(positiveState, {
    0: { characterId: 'M1', skillId: 8930 },
  });
  const { nextState: clampedHighState } = commitTurn(positiveState, positivePreview, []);
  assert.equal(clampedHighState.turnState.odGauge, 300);

  const negativeParty = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8950 + idx)],
  }));
  const negativeState = createBattleStateFromParty(negativeParty);
  negativeState.turnState.odGauge = -995;
  negativeState.stageSetupTurnly = { spAll: 0, spFront: 0, spBack: 0, odGauge: -10 };

  const negativePreview = previewTurn(negativeState, {
    0: { characterId: 'M1', skillId: 8950 },
  });
  const { nextState: clampedLowState } = commitTurn(negativeState, negativePreview, []);
  assert.equal(clampedLowState.turnState.odGauge, -999.99);
});

test('applyRecoveryPipeline grants stage setup SP when any enemy is in DownTurn', () => {
  const party = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8810 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupEnchantEffects = [
    { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
  ];
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8810 },
  });
  const { nextState } = commitTurn(state, preview, []);

  for (const member of nextState.party) {
    assert.equal(member.sp.current, 14, `${member.characterId}: should be 10 + 2(base) + 2(stage) = 14`);
  }
});

test('applyStageSetupTurnStartEffects grants T1 stage setup SP when enemy already starts in DownTurn', () => {
  const party = createSixMemberManualParty((idx) => ({
    skills: [createProtectionSkill(8820 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupEnchantEffects = [
    { effectType: 'turnStartSpIfEnemyDown', scope: 'all', amount: 2 },
  ];
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 1,
    statuses: [{ statusType: 'DownTurn', targetIndex: 0, remainingTurns: 1 }],
  };

  applyStageSetupTurnStartEffects(state);

  for (const member of state.party) {
    assert.equal(member.sp.current, 12, `${member.characterId}: should be 10 + 2(stage) on T1`);
  }
});

test('applyRecoveryPipeline grants stage setup SP to negative-SP front/back members only', () => {
  const party = createSixMemberManualParty((idx) => ({
    initialSP: idx === 0 ? -5 : idx === 3 ? -4 : 10,
    skills: [createProtectionSkill(8830 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupEnchantEffects = [
    { effectType: 'turnStartSpIfNegativeSp', scope: 'front', amount: 2 },
    { effectType: 'turnStartSpIfNegativeSp', scope: 'back', amount: 2 },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8830 },
  });
  const { nextState } = commitTurn(state, preview, []);

  assert.equal(nextState.party[0].sp.current, -1, 'front negative SP member should gain conditional +2 after base recovery');
  assert.equal(nextState.party[3].sp.current, 0, 'back negative SP member should gain conditional +2 after base recovery');

  for (const index of [1, 2, 4, 5]) {
    assert.equal(nextState.party[index].sp.current, 12, `M${index + 1}: should only receive base recovery`);
  }
});

test('stage setup SP on enemy kill is reflected in the same preview turn for one kill', () => {
  const party = createSixMemberManualParty((idx) => ({
    initialSP: idx === 1 ? 0 : 10,
    skills: [createProtectionSkill(8850 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.stageSetupEnchantEffects = [
    { effectType: 'spOnEnemyKill', scope: 'all', amount: 1 },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8850, manualKillEnemyIndexes: [0] },
    1: { characterId: 'M2', skillId: 8851 },
  }, null, 1);

  assert.equal(findActionByCharacterId(preview, 'M1').killCount, 1);
  assert.equal(findActionByCharacterId(preview, 'M2').startSP, 1);
});

test('stage setup SP on enemy kill stacks by killCount in the same preview turn', () => {
  const party = createSixMemberManualParty((idx) => ({
    initialSP: idx === 1 ? 0 : 10,
    skills: [createProtectionSkill(8870 + idx)],
  }));
  const state = createBattleStateFromParty(party, { enemyCount: 2 });
  state.stageSetupEnchantEffects = [
    { effectType: 'spOnEnemyKill', scope: 'all', amount: 1 },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8870, manualKillEnemyIndexes: [0, 1] },
    1: { characterId: 'M2', skillId: 8871 },
  }, null, 2);

  assert.equal(findActionByCharacterId(preview, 'M1').killCount, 2);
  assert.equal(findActionByCharacterId(preview, 'M2').startSP, 2);
});

test('manual Kill override does not erase OD gain from the killing attack', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 8880,
              name: 'Killing 10hit',
              label: 'KillingTenHit',
              sp_cost: 0,
              hit_count: 10,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(8880 + idx)],
        }
  );
  const state = createBattleStateFromParty(party, { enemyCount: 1 });

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8880, targetEnemyIndex: 0, manualKillEnemyIndexes: [0] },
  }, null, 1);
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'M1');

  assert.equal(action?.odGaugeGain, 25);
  assert.equal(action?.killCount, 1);
  assert.equal(nextState.turnState.odGauge, 25);
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Dead' && status.targetIndex === 0
    ),
    true
  );
});

test('stage setup OD bonus is added in the same bucket as drive pierce for action-skill OD gain', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          skills: [
            {
              id: 8890,
              name: '2hit AttackSkill',
              label: 'TwoHitAttackSkill',
              sp_cost: 0,
              hit_count: 2,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(8890 + idx)],
        }
  );
  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  state.party[0].drivePiercePercent = 15;
  state.stageSetupEnchantEffects = [
    { effectType: 'odGaugeGainBonusPercent', amount: 20 },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'M1', skillId: 8890, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 6.3);
});

test('stage setup OD bonus does not affect pursuit OD gain', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'PURSUIT_STAGE_OD',
          characterName: 'PURSUIT_STAGE_OD',
          weaponType: 'Slash',
          skills: [
            {
              id: 8898,
              name: '通常攻撃',
              label: 'PursuitStageOd',
              hit_count: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(8898 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.stageSetupEnchantEffects = [
    { effectType: 'odGaugeGainBonusPercent', amount: 20 },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'PURSUIT_STAGE_OD', skillId: 8898, targetEnemyIndex: 0, pursuedHitCount: 3 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 15);
});

test('stage setup every-turn OD is independent from odGaugeGainBonusPercent drive bonus handling', () => {
  const createStateWithTurnlyOd = (turnlyOdGauge) => {
    const party = createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            skills: [
              {
                id: 8899,
                name: '2hit AttackSkill',
                label: 'TwoHitAttackSkill',
                sp_cost: 0,
                hit_count: 2,
                target_type: 'Single',
                parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash' }],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(8990 + idx)],
          }
    );
    const state = createBattleStateFromParty(party, { enemyCount: 1 });
    state.party[0].drivePiercePercent = 15;
    state.stageSetupTurnly = { spAll: 0, spFront: 0, spBack: 0, odGauge: turnlyOdGauge };
    state.stageSetupEnchantEffects = [
      { effectType: 'odGaugeGainBonusPercent', amount: 20 },
    ];
    return state;
  };

  const baseState = createStateWithTurnlyOd(0);
  const turnlyOdState = createStateWithTurnlyOd(10);

  const basePreview = previewTurn(baseState, {
    0: { characterId: 'M1', skillId: 8899, targetEnemyIndex: 0 },
  });
  const { nextState: baseNextState } = commitTurn(baseState, basePreview);

  const turnlyPreview = previewTurn(turnlyOdState, {
    0: { characterId: 'M1', skillId: 8899, targetEnemyIndex: 0 },
  });
  const { nextState: turnlyNextState } = commitTurn(turnlyOdState, turnlyPreview);

  assert.equal(turnlyNextState.turnState.odGauge - baseNextState.turnState.odGauge, 10);
});

test('battle-start-only stage setup SP/OD bonuses are not replayed on T2+', () => {
  const battleStateManager = new BattleStateManager({ store: getStore() });
  const baseSnapshot = {
    isFrontFilled: true,
    styleIds: [1001509, 1005303, 1004107, 1001109, 1007106, 1003406],
    supportStyleIds: [1003604, 1001708, 1005104, 1002107, 1007104, 1005407],
    limitBreakLevelsByPartyIndex: { 0: 4, 1: 4, 2: 4, 3: 3, 4: 3, 5: 4 },
    supportLimitBreakLevelsByPartyIndex: { 0: 4, 1: 4, 2: 3, 3: 4, 4: 1, 5: 1 },
    drivePierceByPartyIndex: { 0: 15, 1: 15, 2: 15, 3: 15, 4: 15, 5: 15 },
    startSpEquipByPartyIndex: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
    normalAttackElementsByPartyIndex: {
      0: ['Ice'],
      1: ['Ice'],
      2: ['Ice'],
      3: ['Ice'],
      4: ['Ice'],
      5: ['Ice'],
    },
    skillSetsByPartyIndex: {
      0: [46001501],
      1: [46005301],
      2: [46004101],
      3: [46001101],
      4: [46007110],
      5: [46003401],
    },
  };
  const baseState = battleStateManager.buildFromSnapshot(baseSnapshot, { enemyCount: 1 });
  const stagedState = battleStateManager.buildFromSnapshot(
    {
      ...baseSnapshot,
      stageSetup: {
        initialOdGauge: 100,
        initialSpBonusAll: 5,
      },
    },
    { enemyCount: 1 }
  );
  const buildNormalAttackActions = (state) =>
    Object.fromEntries(
      state.party
        .filter((member) => Number(member.position) >= 0 && Number(member.position) <= 2)
        .map((member) => {
          const skillId = Number(member.skills?.[0]?.skillId ?? member.skills?.[0]?.id);
          return [member.position, { characterId: member.characterId, skillId }];
        })
    );

  const basePreview = previewTurn(baseState, buildNormalAttackActions(baseState));
  const { nextState: baseNextState } = commitTurn(baseState, basePreview, []);
  const stagedPreview = previewTurn(stagedState, buildNormalAttackActions(stagedState));
  const { nextState: stagedNextState } = commitTurn(stagedState, stagedPreview, []);

  assert.equal(
    Number(stagedNextState.turnState.odGauge) - Number(baseNextState.turnState.odGauge),
    100,
    'initial OD bonus should remain a one-time T1 offset on T2+'
  );
  for (const index of [0, 1, 2]) {
    assert.equal(
      Number(stagedNextState.party[index].sp.current) - Number(baseNextState.party[index].sp.current),
      5,
      `front partyIndex=${index} should keep only the one-time initial SP bonus on T2+`
    );
  }
  for (const index of [3, 4, 5]) {
    assert.equal(
      Number(stagedNextState.party[index].sp.current) - Number(baseNextState.party[index].sp.current),
      5,
      `back partyIndex=${index} should keep only the one-time initial SP bonus on T2+`
    );
  }
});

// ─── Phase C: enemy status sourceCharacterName が nextState に保持される ───
// normalizeEnemyStatusForClone (cloneTurnState 内) が sourceCharacterName を
// 適切に保持することを確認する。

test('Phase C: enemy status sourceCharacterName persists in nextState after commitTurn', () => {
  // 敵 AttackDown を付与するスキルを持つキャラクターでパーティを構築
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'ENEMY_DEBUFF_ACTOR',
        characterName: '敵デバッファー',
        initialSP: 10,
        skills: [
          {
            id: 311001,
            name: '敵攻撃力ダウン',
            sp_cost: 0,
            parts: [
              {
                skill_type: 'AttackDown',
                target_type: 'EnemySingle',
                power: [0.5, 0],
                effect: { limitType: 'Only', exitCond: 'TurnEnd', exitVal: [2, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });

  let state = createBattleStateFromParty(party, { enemyCount: 1 });
  const preview = previewTurn(state, {
    0: { characterId: 'ENEMY_DEBUFF_ACTOR', skillId: 311001, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  // nextState の enemyState.statuses に AttackDown が付与されていること
  const statuses = nextState.turnState.enemyState?.statuses ?? [];
  const attackDown = statuses.find((s) => String(s?.statusType ?? '') === 'AttackDown');
  assert.ok(attackDown, 'AttackDown が nextState.enemyState.statuses に存在すること');

  // sourceCharacterName が cloneTurnState を経由しても保持されていること
  assert.equal(
    attackDown.sourceCharacterName,
    '敵デバッファー',
    'sourceCharacterName が cloneTurnState (normalizeEnemyStatusForClone) を経由しても保持されること'
  );
});

test('Phase C: enemy status sourceSkillDesc persists in nextState after commitTurn', () => {
  const skillDesc = '敵の攻撃力を50%下げる';
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'ENEMY_DEBUFF_ACTOR_DESC',
        characterName: '敵デバッファー',
        initialSP: 10,
        skills: [
          {
            id: 311002,
            name: '敵攻撃力ダウン説明付き',
            desc: skillDesc,
            sp_cost: 0,
            parts: [
              {
                skill_type: 'AttackDown',
                target_type: 'EnemySingle',
                power: [0.5, 0],
                effect: { limitType: 'Only', exitCond: 'TurnEnd', exitVal: [2, 0] },
              },
            ],
          },
        ],
      };
    }
    return {};
  });

  const state = createBattleStateFromParty(party, { enemyCount: 1 });
  const preview = previewTurn(state, {
    0: { characterId: 'ENEMY_DEBUFF_ACTOR_DESC', skillId: 311002, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  const statuses = nextState.turnState.enemyState?.statuses ?? [];
  const attackDown = statuses.find((status) => String(status?.statusType ?? '') === 'AttackDown');
  assert.ok(attackDown, 'AttackDown が nextState.enemyState.statuses に存在すること');
  assert.equal(
    attackDown.sourceSkillDesc,
    skillDesc,
    'sourceSkillDesc が cloneTurnState (normalizeEnemyStatusForClone) を経由しても保持されること'
  );
});

test('EnemyAll status applies once per alive enemy (no triple stack on E1)', () => {
  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'EA1',
        characterName: 'EA1',
        initialSP: 10,
        skills: [
          {
            id: 311101,
            name: '全体攻撃力ダウン',
            sp_cost: 0,
            parts: [
              {
                skill_type: 'AttackDown',
                target_type: 'EnemyAll',
                power: [0.4, 0],
                effect: { limitType: 'Only', exitCond: 'EnemyTurnEnd', exitVal: [2, 0] },
              },
            ],
          },
        ],
      };
    }
    return {
      skills: [createProtectionSkill(9800 + idx)],
    };
  });

  const state = createBattleStateFromParty(party);
  state.turnState.enemyState = {
    ...(state.turnState.enemyState ?? {}),
    enemyCount: 3,
  };

  const preview = previewTurn(state, {
    0: { characterId: 'EA1', skillId: 311101, targetEnemyIndex: 0 },
    1: { characterId: 'M2', skillId: 9801 },
    2: { characterId: 'M3', skillId: 9802 },
  }, null, 3);
  const { nextState } = commitTurn(state, preview);

  const attackDownTargets = (nextState.turnState.enemyState?.statuses ?? [])
    .filter((status) => String(status?.statusType ?? '') === 'AttackDown')
    .map((status) => Number(status?.targetIndex))
    .sort((left, right) => left - right);

  assert.deepEqual(
    attackDownTargets,
    [0, 1, 2],
    'EnemyAll の状態異常は生存している各敵に1回ずつ付与されること'
  );
});

test('PlayedSkillCount SkillCondition selects correct variant for 3+ variants by use count', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 30,
          skills: [
            {
              id: 99001,
              name: 'MultiVariant',
              label: 'TestMultiVariant',
              sp_cost: 1,
              target_type: 'Self',
              parts: [
                {
                  skill_type: 'SkillCondition',
                  target_type: 'Self',
                  cond: 'PlayedSkillCount(TestMultiVariant)==0',
                  strval: [
                    {
                      id: 99002,
                      name: 'V0',
                      label: 'TestMultiVariantV0',
                      sp_cost: 1,
                      target_type: 'Self',
                      parts: [
                        {
                          skill_type: 'AttackUp',
                          target_type: 'Self',
                          power: [0.1, 0],
                          value: [0, 0],
                          strval: [-1, -1],
                          cond: '',
                          effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                        },
                      ],
                    },
                    {
                      id: 99003,
                      name: 'V1',
                      label: 'TestMultiVariantV1',
                      sp_cost: 2,
                      target_type: 'Self',
                      parts: [
                        {
                          skill_type: 'AttackUp',
                          target_type: 'Self',
                          power: [0.2, 0],
                          value: [0, 0],
                          strval: [-1, -1],
                          cond: '',
                          effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                        },
                      ],
                    },
                    {
                      id: 99004,
                      name: 'V2',
                      label: 'TestMultiVariantV2',
                      sp_cost: 3,
                      target_type: 'Self',
                      parts: [
                        {
                          skill_type: 'AttackUp',
                          target_type: 'Self',
                          power: [0.3, 0],
                          value: [0, 0],
                          strval: [-1, -1],
                          cond: '',
                          effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] },
                        },
                      ],
                    },
                  ],
                  power: [0, 0],
                  value: [0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );

  const actions = {
    0: { characterId: 'M1', skillId: 99001 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  let state = createBattleStateFromParty(party);

  // 1st use (count=0): should select variant[0] with sp_cost=1
  let preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 1, '1回目使用でvariant[0](sp_cost=1)が選択されること');
  let result = commitTurn(state, preview);
  state = result.nextState;

  // 2nd use (count=1): should select variant[1] with sp_cost=2
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 2, '2回目使用でvariant[1](sp_cost=2)が選択されること');
  result = commitTurn(state, preview);
  state = result.nextState;

  // 3rd use (count=2): should select variant[2] with sp_cost=3
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 3, '3回目使用でvariant[2](sp_cost=3)が選択されること');
  result = commitTurn(state, preview);
  state = result.nextState;

  // 4th use (count=3): should clamp to variant[2] with sp_cost=3
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 3, '4回目以降もvariant[2](sp_cost=3)にクランプされること');
});

test('PlayedSkillCount SkillCondition with < 2 condition selects correct variant for 4 variants', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          initialSP: 30,
          skills: [
            {
              id: 99010,
              name: 'FourVariant',
              label: 'TestFourVariant',
              sp_cost: 1,
              target_type: 'Self',
              parts: [
                {
                  skill_type: 'SkillCondition',
                  target_type: 'Self',
                  cond: 'PlayedSkillCount(TestFourVariant) < 2',
                  strval: [
                    {
                      id: 99011, name: 'V0', label: 'V0', sp_cost: 1, target_type: 'Self',
                      parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.1, 0], value: [0, 0], strval: [-1, -1], cond: '', effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] } }],
                    },
                    {
                      id: 99012, name: 'V1', label: 'V1', sp_cost: 2, target_type: 'Self',
                      parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.2, 0], value: [0, 0], strval: [-1, -1], cond: '', effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] } }],
                    },
                    {
                      id: 99013, name: 'V2', label: 'V2', sp_cost: 3, target_type: 'Self',
                      parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.3, 0], value: [0, 0], strval: [-1, -1], cond: '', effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] } }],
                    },
                    {
                      id: 99014, name: 'V3', label: 'V3', sp_cost: 4, target_type: 'Self',
                      parts: [{ skill_type: 'DefenseUp', target_type: 'Self', power: [0.4, 0], value: [0, 0], strval: [-1, -1], cond: '', effect: { limitType: 'Only', exitCond: 'PlayerTurnEnd', exitVal: [1, 0] } }],
                    },
                  ],
                  power: [0, 0],
                  value: [0, 0],
                },
              ],
            },
          ],
        }
      : {}
  );

  const actions = {
    0: { characterId: 'M1', skillId: 99010 },
    1: { characterId: 'M2', skillId: 8001 },
    2: { characterId: 'M3', skillId: 8002 },
  };

  let state = createBattleStateFromParty(party);

  // 1st use (count=0): variant[0] sp_cost=1
  let preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 1, '1回目使用でvariant[0]が選択されること');
  let result = commitTurn(state, preview);
  state = result.nextState;

  // 2nd use (count=1): variant[1] sp_cost=2
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 2, '2回目使用でvariant[1]が選択されること');
  result = commitTurn(state, preview);
  state = result.nextState;

  // 3rd use (count=2): variant[2] sp_cost=3
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 3, '3回目使用でvariant[2]が選択されること');
  result = commitTurn(state, preview);
  state = result.nextState;

  // 4th use (count=3): variant[3] sp_cost=4
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 4, '4回目使用でvariant[3]が選択されること');
  result = commitTurn(state, preview);
  state = result.nextState;

  // 5th use (count=4): clamp to variant[3] sp_cost=4
  preview = previewTurn(state, actions);
  assert.equal(preview.actions[0].spCost, 4, '5回目以降もvariant[3]にクランプされること');
});

test('Eシールド matching hit consumes current and applies Break on the same action', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_BREAK',
          characterName: 'ESH_BREAK',
          skills: [
            {
              id: 99100,
              name: 'Fire Break',
              hitCount: 2,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Fire'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99200 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_BREAK', skillId: 99100, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_BREAK');

  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn' && change.source === 'auto'),
    true
  );
  assert.equal(action?.breakHitCount, 1);
  // 新仕様: 自動ブレイクで付与された DownTurn(remaining=1) は 1 tick で remaining=0 の grace として残り、
  // E シールド復帰は DownTurn が消滅する次ターンまで持ち越される
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 0,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  const downTurnAfter = nextState.turnState.enemyState.statuses.find(
    (status) => status.statusType === 'DownTurn' && status.targetIndex === 0
  );
  assert.ok(downTurnAfter, 'auto-break で付与された DownTurn は remaining=0 で残るはず');
  assert.equal(Number(downTurnAfter.remainingTurns ?? -1), 0);
});

test('通常攻撃はEシールドに対して raw hit_count を使い、OD は 7.5% 固定のまま扱う', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_NORMAL_RAW',
          characterName: 'ESH_NORMAL_RAW',
          weaponType: 'Strike',
          normalAttackElements: ['Fire'],
          skills: [
            {
              id: 99105,
              name: '通常攻撃',
              label: 'ESHNormalAttack',
              hit_count: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackNormal', target_type: 'Single', type: 'Strike' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99250 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_NORMAL_RAW', skillId: 99105, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_NORMAL_RAW');

  assert.equal(action?.skillHitCount, 1);
  assert.equal(nextState.turnState.odGauge, 7.5);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 1,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(action?.breakHitCount ?? 0, 0);
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    false
  );
});

test('通常攻撃の属性ブレスレットが不一致属性なら Eシールドは減らない', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_NORMAL_MISS',
          characterName: 'ESH_NORMAL_MISS',
          weaponType: 'Strike',
          normalAttackElements: ['Thunder'],
          skills: [
            {
              id: 991055,
              name: '通常攻撃',
              label: 'ESHNormalAttackMiss',
              hit_count: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackNormal', target_type: 'Single', type: 'Strike' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99255 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_NORMAL_MISS', skillId: 991055, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.odGauge, 7.5);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 2,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
});

test('闇撃のブレス装備中の通常攻撃は Dark 属性で Eシールドを raw hit 分減らす', () => {
  const NORMAL_ATTACK_SKILL_ID = 991056;
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_NORMAL_DARK_BELT',
          characterName: 'ESH_NORMAL_DARK_BELT',
          weaponType: 'Slash',
          normalAttackElements: ['Dark'],
          skills: [
            {
              id: NORMAL_ATTACK_SKILL_ID,
              name: '通常攻撃',
              label: 'ESHDarkBeltNormalAttack',
              hit_count: 3,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99260 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 5, max: 5, elements: ['Dark'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_NORMAL_DARK_BELT', skillId: NORMAL_ATTACK_SKILL_ID, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_NORMAL_DARK_BELT');

  assert.equal(action?.skillHitCount, 3);
  assert.equal(nextState.turnState.odGauge, 7.5);
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 2,
    max: 5,
    elements: ['Dark'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(action?.breakHitCount ?? 0, 0);
});

for (const { weaponType, hitCount, skillId } of [
  { weaponType: 'Slash', hitCount: 3, skillId: 99130 },
  { weaponType: 'Stab', hitCount: 2, skillId: 99131 },
  { weaponType: 'Strike', hitCount: 1, skillId: 99132 },
]) {
  test(`通常攻撃 × weaponType=${weaponType} (hit_count=${hitCount}) は OD=7.5% 固定 かつ E-shield は raw hit 分減る`, () => {
    const party = createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: `ESH_NORMAL_${weaponType}`,
            characterName: `ESH_NORMAL_${weaponType}`,
            weaponType,
            normalAttackElements: ['Fire'],
            skills: [
              {
                id: skillId,
                name: '通常攻撃',
                label: `ESHNormal${weaponType}`,
                hit_count: hitCount,
                sp_cost: 0,
                target_type: 'Single',
                parts: [
                  { skill_type: 'AttackNormal', target_type: 'Single', type: weaponType },
                ],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(99330 + idx)],
          }
    );
    const initialShield = hitCount + 2;
    const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
      enemyCount: 1,
      eShields: {
        0: createEnemyEShieldState({ current: initialShield, max: initialShield, elements: ['Fire'] }),
      },
    });

    const preview = previewTurn(state, {
      0: { characterId: `ESH_NORMAL_${weaponType}`, skillId, targetEnemyIndex: 0 },
    });
    const { committedRecord, nextState } = commitTurn(state, preview);
    const action = findActionByCharacterId(committedRecord, `ESH_NORMAL_${weaponType}`);

    assert.equal(action?.skillHitCount, hitCount);
    assert.equal(nextState.turnState.odGauge, 7.5);
    assert.equal(
      nextState.turnState.enemyState.eShieldStateByEnemy['0'].current,
      initialShield - hitCount
    );
  });
}

for (const { weaponType, hitCount, skillId } of [
  { weaponType: 'Slash', hitCount: 3, skillId: 99140 },
  { weaponType: 'Stab', hitCount: 2, skillId: 99141 },
  { weaponType: 'Strike', hitCount: 1, skillId: 99142 },
]) {
  test(`通常攻撃 × weaponType=${weaponType} は od_rate=0.85 でも OD=trunc2(2.5*0.85)*3 固定 かつ E-shield は raw hit 分減る`, () => {
    const party = createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: `ESH_OD_RATE_${weaponType}`,
            characterName: `ESH_OD_RATE_${weaponType}`,
            weaponType,
            normalAttackElements: ['Fire'],
            skills: [
              {
                id: skillId,
                name: '通常攻撃',
                label: `ESHOdRate${weaponType}`,
                hit_count: hitCount,
                sp_cost: 0,
                target_type: 'Single',
                parts: [
                  { skill_type: 'AttackNormal', target_type: 'Single', type: weaponType },
                ],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(99350 + idx)],
          }
    );
    const initialShield = hitCount + 2;
    const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
      enemyCount: 1,
      eShields: {
        0: createEnemyEShieldState({ current: initialShield, max: initialShield, elements: ['Fire'] }),
      },
    });
    state.turnState.enemyState.odRateByEnemy = { '0': 0.85 };

    const preview = previewTurn(state, {
      0: { characterId: `ESH_OD_RATE_${weaponType}`, skillId, targetEnemyIndex: 0 },
    });
    const { nextState } = commitTurn(state, preview);

    // trunc2(2.5 * 0.85) * 3 = 6.36（武器種ヒット数に依らず常に 3hit 相当）
    assert.equal(nextState.turnState.odGauge, 6.36);
    assert.equal(
      nextState.turnState.enemyState.eShieldStateByEnemy['0'].current,
      initialShield - hitCount
    );
  });
}

test('weapon_type の列挙が styles.json と乖離していないことを検出するメタテスト', async () => {
  // 将来 Gun 等の新武器種が styles.json に追加されたときに、
  // 上記の武器種別カバレッジテストを拡張する必要があることを気付けるようにする。
  const { readFileSync } = await import('node:fs');
  const rawStyles = JSON.parse(readFileSync(new URL('../json/styles.json', import.meta.url), 'utf8'));
  const styles = Array.isArray(rawStyles) ? rawStyles : Object.values(rawStyles);
  const weaponTypes = new Set(
    styles
      .map((style) => String(style?.type ?? '').trim())
      .filter(Boolean)
  );
  const expected = new Set(['Slash', 'Stab', 'Strike']);

  const unexpected = [...weaponTypes].filter((t) => !expected.has(t));
  const missing = [...expected].filter((t) => !weaponTypes.has(t));

  assert.deepEqual(
    unexpected,
    [],
    `styles.json に未知の weapon_type が追加されています: ${unexpected.join(', ')}。武器種別カバレッジテスト（通常攻撃 OD 7.5% 保証 / E-shield 減算）を拡張してください。`
  );
  assert.deepEqual(
    missing,
    [],
    `styles.json から既知の weapon_type が消えています: ${missing.join(', ')}。`
  );
});

for (const { weaponType, pursuedHitCount, skillId } of [
  { weaponType: 'Slash', pursuedHitCount: 1, skillId: 99160 },
  { weaponType: 'Stab', pursuedHitCount: 2, skillId: 99161 },
  { weaponType: 'Strike', pursuedHitCount: 3, skillId: 99162 },
]) {
  test(`追撃 OD は pursuedHitCount に比例する (weaponType=${weaponType}, pursuedHitCount=${pursuedHitCount})`, () => {
    // 通常攻撃 OD は 3hit 固定 (7.5) だが、追撃 OD は pursuedHitCount × 2.5 で算出される。
    // 武器種は OD 計算に影響しないが、通常攻撃と追撃の経路差を武器種ごとに固定する。
    const party = createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: `PURSUIT_OD_${weaponType}`,
            characterName: `PURSUIT_OD_${weaponType}`,
            weaponType,
            normalAttackElements: ['Fire'],
            skills: [
              {
                id: skillId,
                name: '通常攻撃',
                label: `Pursuit${weaponType}`,
                hit_count: 1,
                sp_cost: 0,
                target_type: 'Single',
                parts: [
                  { skill_type: 'AttackNormal', target_type: 'Single', type: weaponType },
                ],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(99370 + idx)],
          }
    );
    const state = createBattleStateFromParty(party);
    state.turnState.enemyState.enemyCount = 1;

    const preview = previewTurn(state, {
      0: { characterId: `PURSUIT_OD_${weaponType}`, skillId, targetEnemyIndex: 0, pursuedHitCount },
    });
    const { nextState } = commitTurn(state, preview);

    // 通常攻撃 OD: 7.5 (hit 固定 3)
    // 追撃 OD: trunc2(pursuedHitCount × trunc2(2.5 × 1.0)) = pursuedHitCount × 2.5
    const expectedOd = 7.5 + pursuedHitCount * 2.5;
    assert.equal(nextState.turnState.odGauge, expectedOd);
  });
}

test('追撃は属性ベルト効果を受けない無属性扱いで、通常攻撃の hit のみが E-shield を減らす', () => {
  // 属性ベルト Fire + E-shield Fire 一致 → 通常攻撃の hit 数だけ E-shield が減る。
  // 追撃は無属性扱いで属性ベルトが乗らないため、pursuedHitCount は E-shield を減らさない。
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'PURSUIT_ESH_MATCH',
          characterName: 'PURSUIT_ESH_MATCH',
          weaponType: 'Slash',
          normalAttackElements: ['Fire'],
          skills: [
            {
              id: 99170,
              name: '通常攻撃',
              label: 'PursuitEShieldMatch',
              hit_count: 2,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99390 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 5, max: 5, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'PURSUIT_ESH_MATCH', skillId: 99170, targetEnemyIndex: 0, pursuedHitCount: 3 },
  });
  const { nextState } = commitTurn(state, preview);

  // 通常攻撃 2 hit (Fire 一致で減算) + 追撃 3 hit (無属性なので減らない) → current 5 - 2 = 3
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 3);
  // OD: 通常攻撃 7.5 + 追撃 3 × 2.5 = 15.0
  assert.equal(nextState.turnState.odGauge, 15);
});

test('追撃 hit は属性ベルトが不一致のときも E-shield を減らさない（通常攻撃 hit も同じく減らない）', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'PURSUIT_ESH_MISS',
          characterName: 'PURSUIT_ESH_MISS',
          weaponType: 'Slash',
          normalAttackElements: ['Thunder'],
          skills: [
            {
              id: 99175,
              name: '通常攻撃',
              label: 'PursuitEShieldMiss',
              hit_count: 2,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99410 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 5, max: 5, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'PURSUIT_ESH_MISS', skillId: 99175, targetEnemyIndex: 0, pursuedHitCount: 3 },
  });
  const { nextState } = commitTurn(state, preview);

  // 通常攻撃も追撃も E-shield の Fire と不一致 → current 変化なし
  assert.equal(nextState.turnState.enemyState.eShieldStateByEnemy['0'].current, 5);
  // OD は通常攻撃 7.5 + 追撃 3 × 2.5 = 15.0（両方とも加算される）
  assert.equal(nextState.turnState.odGauge, 15);
});

test('HealEShield restores enemy Eシールド current up to max', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_HEAL',
          characterName: 'ESH_HEAL',
          skills: [
            {
              id: 99106,
              name: 'E Shield Heal',
              label: 'ESHHeal',
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'HealEShield', target_type: 'Single', power: [3, 0] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99260 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 4, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_HEAL', skillId: 99106, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 4,
    max: 4,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
});

test('ReviveEShield restores depleted enemy Eシールド current', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_REVIVE',
          characterName: 'ESH_REVIVE',
          skills: [
            {
              id: 99107,
              name: 'E Shield Revive',
              label: 'ESHRevive',
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'ReviveEShield', target_type: 'Single', power: [3, 0] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99270 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 0, max: 5, elements: ['Fire', 'Ice'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_REVIVE', skillId: 99107, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 3,
    max: 5,
    elements: ['Fire', 'Ice'],
    defUpRate: 0,
    damageLimit: 0,
  });
});

test('Eシールド ignores non-matching elements unless IgnoreEShieldElement is active', () => {
  const createParty = (withIgnorePassive) =>
    createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: withIgnorePassive ? 'ESH_IGNORE' : 'ESH_MISS',
            characterName: withIgnorePassive ? 'ESH_IGNORE' : 'ESH_MISS',
            passives: withIgnorePassive
              ? [
                  {
                    id: 99110,
                    name: 'Ignore E Shield',
                    timing: 'OnPlayerTurnStart',
                    parts: [
                      {
                        skill_type: 'IgnoreEShieldElement',
                        target_type: 'Self',
                        power: [0, 0],
                        value: [0, 0],
                        cond: '',
                        hit_condition: '',
                        target_condition: '',
                      },
                    ],
                  },
                ]
              : [],
            skills: [
              {
                id: 99111,
                name: 'Thunder Hit',
                hitCount: 2,
                sp_cost: 0,
                target_type: 'Single',
                parts: [
                  { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Thunder'] },
                ],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(99300 + idx)],
          }
    );

  const missState = applyEnemyEShieldTestSetup(createBattleStateFromParty(createParty(false)), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });
  const missPreview = previewTurn(missState, {
    0: { characterId: 'ESH_MISS', skillId: 99111, targetEnemyIndex: 0 },
  });
  const missCommit = commitTurn(missState, missPreview);

  assert.deepEqual(missCommit.nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 2,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(
    missCommit.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    false
  );

  const ignoreState = applyEnemyEShieldTestSetup(createBattleStateFromParty(createParty(true)), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });
  const ignorePreview = previewTurn(ignoreState, {
    0: { characterId: 'ESH_IGNORE', skillId: 99111, targetEnemyIndex: 0 },
  });
  const ignoreCommit = commitTurn(ignoreState, ignorePreview);
  const ignoreAction = findActionByCharacterId(ignoreCommit.committedRecord, 'ESH_IGNORE');

  assert.equal(ignoreAction?.breakHitCount, 1);
  assert.equal(
    (ignoreAction?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn' && change.source === 'auto'),
    true
  );
  assert.equal(
    ignoreCommit.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
});

for (const mockTiming of ['OnHit', 'OnEnemyTurnStart', 'OnOverdriveStart', 'OnAdditionalTurnStart']) {
  test(`IgnoreEShieldElement は timing=${mockTiming} でも属性不一致攻撃で Eシールドを減らす`, () => {
    // IgnoreEShieldElement は action-time の恒常フラグとして扱うため、
    // passive の timing が OnPlayerTurnStart 以外でも同じく E-shield 属性を無視すること。
    const party = createSixMemberManualParty((idx) =>
      idx === 0
        ? {
            characterId: `ESH_IGNORE_${mockTiming}`,
            characterName: `ESH_IGNORE_${mockTiming}`,
            passives: [
              {
                id: 99190,
                name: `Ignore E Shield (${mockTiming})`,
                timing: mockTiming,
                parts: [
                  {
                    skill_type: 'IgnoreEShieldElement',
                    target_type: 'Self',
                    power: [0, 0],
                    value: [0, 0],
                    cond: '',
                    hit_condition: '',
                    target_condition: '',
                  },
                ],
              },
            ],
            skills: [
              {
                id: 99191,
                name: 'Thunder Hit',
                hitCount: 2,
                sp_cost: 0,
                target_type: 'Single',
                parts: [
                  { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Thunder'] },
                ],
              },
            ],
          }
        : {
            skills: [createProtectionSkill(99290 + idx)],
          }
    );
    const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
      enemyCount: 1,
      eShields: {
        0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
      },
    });

    const preview = previewTurn(state, {
      0: { characterId: `ESH_IGNORE_${mockTiming}`, skillId: 99191, targetEnemyIndex: 0 },
    });
    const { nextState } = commitTurn(state, preview);

    // 新仕様: 自動ブレイクで付与された DownTurn(remaining=1) は 1 tick で remaining=0 grace として残り、
    // E シールド復帰は DownTurn 消滅の次ターンまで持ち越される（current=0 を維持）
    assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
      current: 0,
      max: 2,
      elements: ['Fire'],
      defUpRate: 0,
      damageLimit: 0,
    });
    assert.equal(
      nextState.turnState.enemyState.statuses.some(
        (status) => status.statusType === 'Break' && status.targetIndex === 0
      ),
      true
    );
  });
}

test('IgnoreEShieldElement は既存の OnPlayerTurnStart passive と他 timing passive が共存してもどちらも動作する', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_IGNORE_MULTI',
          characterName: 'ESH_IGNORE_MULTI',
          passives: [
            {
              id: 99192,
              name: 'Ignore E Shield (OnPlayerTurnStart)',
              timing: 'OnPlayerTurnStart',
              parts: [
                {
                  skill_type: 'IgnoreEShieldElement',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  target_condition: '',
                },
              ],
            },
            {
              id: 99193,
              name: 'Ignore E Shield (OnHit)',
              timing: 'OnHit',
              parts: [
                {
                  skill_type: 'IgnoreEShieldElement',
                  target_type: 'Self',
                  power: [0, 0],
                  value: [0, 0],
                  cond: '',
                  hit_condition: '',
                  target_condition: '',
                },
              ],
            },
          ],
          skills: [
            {
              id: 99194,
              name: 'Thunder Hit',
              hitCount: 2,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Thunder'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99310 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_IGNORE_MULTI', skillId: 99194, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_IGNORE_MULTI');

  // 両 passive が ignoreEShieldElement フラグに寄与し、action 自体は 1 回だけ減算する
  // 新仕様: auto-break で付与された DownTurn(remaining=1) は grace として残るため E シールドは current=0 のまま
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 0,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(action?.breakHitCount, 1);
});

test('dp > 0 併存時でも Eシールド減算が優先されブレイク経路へ接続する', () => {
  // ゲーム仕様上 base_param.dp > 0 と extra_gauge.eshield は併存しないが、
  // 異常データ混入時は E-shield を優先し DP ルートへ落とさないことを固定する。
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_DP_COEXIST',
          characterName: 'ESH_DP_COEXIST',
          skills: [
            {
              id: 99180,
              name: 'Fire Hit',
              hit_count: 2,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Fire'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99280 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 2, max: 2, elements: ['Fire'] }),
    },
    // 異常データを想定: 敵側に DP 相当の破壊率 cap を 100（DP 有効相当）で設定するが、
    // E-shield active な間は本来 destruction rate が上がらない仕様。
    damageRatesByEnemy: { 0: { dp: 1, hp: 1, dr: 1 } },
  });
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 100 };

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_DP_COEXIST', skillId: 99180, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_DP_COEXIST');

  // E-shield は 2 hit で 0 まで削られ、same-action BREAK が成立
  // 新仕様: auto-break で付与された DownTurn(remaining=1) は grace として残るため E シールドは current=0 のまま
  assert.deepEqual(nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 0,
    max: 2,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn' && change.source === 'auto'),
    true
  );
  assert.equal(
    nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'Break' && status.targetIndex === 0
    ),
    true
  );
  // E-shield 破壊まで destructionRate は更新されない（DP ルートへ落ちていないことの表明）
  const destructionRate = Number(nextState.turnState.enemyState.destructionRateByEnemy?.[0] ?? 0);
  assert.equal(destructionRate, 0);
});

test('攻撃時に既にBREAK中の敵は破壊率が上昇し cap でクランプされる', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'DEST_BROKEN',
          characterName: 'DEST_BROKEN',
          skills: [
            {
              id: 99182,
              name: 'Destruction Hit',
              hitCount: 2,
              sp_cost: 10,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 1 } },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99282 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
  ];
  state.turnState.enemyState.destructionRateByEnemy = { 0: 299.75 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };

  const preview = previewTurn(state, {
    0: { characterId: 'DEST_BROKEN', skillId: 99182, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 300);
});

test('Count Funnel消費後のmetadata.damageBonusで破壊率上昇倍率を解決する', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'DEST_FUNNEL',
          characterName: 'DEST_FUNNEL',
          statusEffects: [
            {
              effectId: 99190,
              statusType: 'Funnel',
              limitType: 'Default',
              exitCond: 'Count',
              remaining: 1,
              power: 3,
              metadata: { damageBonus: 0.25 },
            },
          ],
          skills: [
            {
              id: 99190,
              name: 'Funnel Destruction Hit',
              hit_count: 8,
              hitCount: 8,
              sp_cost: 10,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 20.25 } },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99290 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 0 },
  ];
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 1000 };
  state.turnState.enemyState.destructionMultiplierByEnemy = { 0: 10 };

  const preview = previewTurn(state, {
    0: { characterId: 'DEST_FUNNEL', skillId: 99190, targetEnemyIndex: 0 },
  });
  const { committedRecord, nextState } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'DEST_FUNNEL');

  assert.equal(action.consumedFunnelEffects?.[0]?.metadata?.damageBonus, 0.25);
  assert.equal(nextState.party[0].getFunnelEffects({ activeOnly: true }).length, 0);
  assert.ok(
    Math.abs(nextState.turnState.enemyState.destructionRateByEnemy['0'] - 454.375) < 1e-9,
    `Funnel大の破壊率上昇がmetadata.damageBonus由来で計算されること（DR=${nextState.turnState.enemyState.destructionRateByEnemy['0']}）`
  );
});

test('same-action SuperBreak 後の破壊率上昇は拡張後 cap を使用する', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'DEST_SUPER',
          characterName: 'DEST_SUPER',
          skills: [
            {
              id: 99183,
              name: 'Destruction SuperBreak',
              hitCount: 2,
              sp_cost: 10,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 1 } },
                { skill_type: 'SuperBreak', target_type: 'Single' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99283 + idx)],
        }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Slash: 150 } };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 590 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 300 };
  state.turnState.enemyState.destructionMultiplierByEnemy = { 0: 1 };

  const preview = previewTurn(state, {
    0: { characterId: 'DEST_SUPER', skillId: 99183, targetEnemyIndex: 0, manualBreakEnemyIndexes: [0] },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.enemyState.destructionRateCapByEnemy['0'], 600);
  assert.equal(nextState.turnState.enemyState.destructionRateByEnemy['0'], 591);
});

// 通常攻撃の破壊率はスキルと別式（実機実測で確定）: ブレイク中の通常攻撃は
// enemy raw d_rate と等しい % だけ破壊率を上げる（d_rate=5→+5%, 10→+10%）。
// 共鳴・装備・武器種などは通常攻撃には乗らない（超越ゲージ100%の×1.10のみ別途）。
function runNormalAttackOnBrokenEnemy(dRateRaw) {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'NORM_ATK',
          characterName: 'NORM_ATK',
          skills: [
            {
              id: 99190,
              name: '通常攻撃',
              label: 'TestAttackNormal',
              hitCount: 3,
              sp_cost: 0,
              target_type: 'Single',
              parts: [{ skill_type: 'AttackNormal', target_type: 'Single', type: 'Slash' }],
            },
          ],
        }
      : { skills: [createProtectionSkill(99290 + idx)] }
  );
  const state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.damageRatesByEnemy = { 0: { Slash: 150 } };
  state.turnState.enemyState.destructionRateByEnemy = { 0: 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { 0: 999 };
  state.turnState.enemyState.destructionMultiplierByEnemy = { 0: dRateRaw };
  // 敵をブレイク状態にして通常攻撃が破壊率を加算する状態にする
  state.turnState.enemyState.statuses = [
    { statusType: 'Break', targetIndex: 0, remainingTurns: 3 },
  ];
  const preview = previewTurn(state, {
    0: { characterId: 'NORM_ATK', skillId: 99190, targetEnemyIndex: 0 },
  });
  const { nextState } = commitTurn(state, preview);
  return nextState.turnState.enemyState.destructionRateByEnemy['0'];
}

test('通常攻撃の破壊率上昇は enemy raw d_rate と等しい（ヒット数非依存・共鳴非適用）', () => {
  // d_rate=5（標準敵）→ +5.0%（100→105）
  assert.ok(Math.abs(runNormalAttackOnBrokenEnemy(5) - 105) < 1e-9, 'd_rate=5 → +5%');
  // d_rate=10（強敵）→ +10.0%（100→110）
  assert.ok(Math.abs(runNormalAttackOnBrokenEnemy(10) - 110) < 1e-9, 'd_rate=10 → +10%');
  // d_rate=7 → +7.0%
  assert.ok(Math.abs(runNormalAttackOnBrokenEnemy(7) - 107) < 1e-9, 'd_rate=7 → +7%');
});

test('Eシールド auto-break on all-target action updates breakHitCount and triggers AdditionalHitOnBreaking', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_ALL',
          characterName: 'ESH_ALL',
          initialSP: 5,
          passives: [
            {
              id: 99120,
              name: 'E Shield Break Trigger',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'Self', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'HealSp', target_type: 'Self', power: [8, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99121,
              name: 'Fire Sweep',
              hitCount: 1,
              sp_cost: 0,
              target_type: 'All',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'All', type: 'Strike', elements: ['Fire'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99400 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 2,
    eShields: {
      0: createEnemyEShieldState({ current: 1, max: 1, elements: ['Fire'] }),
      1: createEnemyEShieldState({ current: 1, max: 1, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_ALL', skillId: 99121 },
  });
  const { committedRecord } = commitTurn(state, preview);
  const action = findActionByCharacterId(committedRecord, 'ESH_ALL');
  const spChange = (action?.spChanges ?? []).find((change) => change.source === 'sp_passive');

  assert.equal(action?.breakHitCount, 2);
  assert.ok(spChange, 'spChanges should include sp_passive after two auto breaks');
  assert.equal(spChange.delta, 8);
});

test('Eシールド auto-break upgrades same-action SuperBreak to canonical state', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_SUPER',
          characterName: 'ESH_SUPER',
          skills: [
            {
              id: 99130,
              name: 'Auto SuperBreak',
              hitCount: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Stab', elements: ['Fire'] },
                { skill_type: 'SuperBreak', target_type: 'Single', elements: ['Fire'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99500 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 1, max: 1, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_SUPER', skillId: 99130, targetEnemyIndex: 0 },
  });
  const committed = commitTurn(state, preview);
  const action = findActionByCharacterId(committed.committedRecord, 'ESH_SUPER');

  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'SuperBreak' && change.targetIndex === 0),
    true
  );
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn'),
    false
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreak' && status.targetIndex === 0
    ),
    true
  );
});

test('Eシールド auto-break upgrades same-action SuperBreakDown and drives BreakDownTurnUp', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_SUPERDOWN',
          characterName: 'ESH_SUPERDOWN',
          passives: [
            {
              id: 99140,
              name: 'BreakDownTurnUp Trigger',
              timing: 'OnFirstBattleStart',
              parts: [
                { skill_type: 'AdditionalHitOnBreaking', target_type: 'AllyAll', power: [0, 0], value: [0, 0], cond: '', hit_condition: '' },
                { skill_type: 'BreakDownTurnUp', target_type: 'None', power: [1, 0], value: [0, 0], cond: '', hit_condition: '', target_condition: '' },
              ],
            },
          ],
          skills: [
            {
              id: 99141,
              name: 'Auto SuperBreakDown',
              hitCount: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', elements: ['Fire'] },
                { skill_type: 'SuperBreakDown', target_type: 'Single' },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99600 + idx)],
        }
  );
  const state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 1, max: 1, elements: ['Fire'] }),
    },
  });

  const preview = previewTurn(state, {
    0: { characterId: 'ESH_SUPERDOWN', skillId: 99141, targetEnemyIndex: 0 },
  });
  const committed = commitTurn(state, preview);
  const action = findActionByCharacterId(committed.committedRecord, 'ESH_SUPERDOWN');

  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'SuperBreakDown'),
    true
  );
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'BreakDownTurnUp'),
    true
  );
  assert.equal(
    (action?.enemyStatusChanges ?? []).some((change) => change.mode === 'DownTurn'),
    false
  );
  assert.equal(
    committed.nextState.turnState.enemyState.statuses.some(
      (status) => status.statusType === 'SuperBreakDown' && status.targetIndex === 0
    ),
    true
  );
});

test('Eシールド state persists across PlayerTurnEnd and EnemyTurnEnd while still active', () => {
  const party = createSixMemberManualParty((idx) =>
    idx === 0
      ? {
          characterId: 'ESH_PERSIST',
          characterName: 'ESH_PERSIST',
          skills: [
            {
              id: 99150,
              name: 'Thunder Miss',
              hitCount: 1,
              sp_cost: 0,
              target_type: 'Single',
              parts: [
                { skill_type: 'AttackSkill', target_type: 'Single', type: 'Strike', elements: ['Thunder'] },
              ],
            },
          ],
        }
      : {
          skills: [createProtectionSkill(99700 + idx)],
        }
  );
  let state = applyEnemyEShieldTestSetup(createBattleStateFromParty(party), {
    enemyCount: 1,
    eShields: {
      0: createEnemyEShieldState({ current: 3, max: 3, elements: ['Fire'] }),
    },
  });

  let preview = previewTurn(state, {
    0: { characterId: 'ESH_PERSIST', skillId: 99150, targetEnemyIndex: 0 },
  });
  let committed = commitTurn(state, preview);
  state = committed.nextState;

  assert.deepEqual(state.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 3,
    max: 3,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });

  preview = previewTurn(state, {
    0: { characterId: 'ESH_PERSIST', skillId: 99150, targetEnemyIndex: 0 },
  });
  committed = commitTurn(state, preview);

  assert.deepEqual(committed.nextState.turnState.enemyState.eShieldStateByEnemy['0'], {
    current: 3,
    max: 3,
    elements: ['Fire'],
    defUpRate: 0,
    damageLimit: 0,
  });
});

function createHoldUpTestParty() {
  return new Party(Array.from({ length: 6 }, (_, index) =>
    new CharacterStyle({
      characterId: `HU${index + 1}`,
      characterName: `HU${index + 1}`,
      styleId: 9700 + index,
      styleName: `HUS${index + 1}`,
      partyIndex: index,
      position: index,
      initialSP: 10,
      roleAbility: index === 0 ? { name: '総攻撃' } : null,
      skills: [
        {
          id: 9800 + index,
          name: `プロテクション${index + 1}`,
          sp_cost: 0,
          target_type: 'Self',
          parts: [{ skill_type: 'Protection', target_type: 'Self' }],
        },
      ],
    })
  ));
}

test('HOLD UP becomes active when all alive enemies newly enter DownTurn in one turn', () => {
  const state = createBattleStateFromParty(createHoldUpTestParty());
  state.turnState.enemyState.enemyCount = 2;

  const preview = previewTurn(state, {
    0: { characterId: 'HU1', skillId: 9800, manualBreakEnemyIndexes: [0] },
    1: { characterId: 'HU2', skillId: 9801, manualBreakEnemyIndexes: [1] },
    2: { characterId: 'HU3', skillId: 9802 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.holdUpActive, true);
  assert.equal(
    nextState.turnState.enemyState.statuses.filter((status) => status.statusType === 'DownTurn').length,
    2
  );
});

test('HOLD UP is cleared when DownTurn expires', () => {
  const state = createBattleStateFromParty(createHoldUpTestParty());
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.holdUpActive = true;
  state.turnState.enemyState.statuses = [
    { statusType: 'DownTurn', targetIndex: 0, remainingTurns: 0, exitCond: 'PlayerTurnEnd' },
  ];

  const preview = previewTurn(state, {
    0: { characterId: 'HU1', skillId: 9800 },
    1: { characterId: 'HU2', skillId: 9801 },
    2: { characterId: 'HU3', skillId: 9802 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(nextState.turnState.holdUpActive, false);
  assert.equal(
    nextState.turnState.enemyState.statuses.some((status) => status.statusType === 'DownTurn'),
    false
  );
});

test('perHitDpDamageByEnemy: DPダメージがアクション間・ターン間で累積されブレイクを自動判定する', () => {
  // シナリオ:
  //   敵DP = 200万、破壊率初期100%、上限500%
  //   T1: M1(500k DP) + M2(100万 DP) → 残り500k、ブレイクなし
  //   T2: M1(500k DP) → 残り0、自動ブレイク発生
  //       M2: ブレイク済みとして DR加算が走る

  const party = createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return {
        characterId: 'DP_A',
        characterName: 'DP_A',
        skills: [
          {
            id: 99500,
            name: 'DP Attack A',
            sp_cost: 10,
            hit_count: 1,
            hitCount: 1,
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 10 } }],
          },
        ],
      };
    }
    if (idx === 1) {
      return {
        characterId: 'DP_B',
        characterName: 'DP_B',
        skills: [
          {
            id: 99501,
            name: 'DP Attack B',
            sp_cost: 10,
            hit_count: 1,
            hitCount: 1,
            target_type: 'Single',
            parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 10 } }],
          },
        ],
      };
    }
    return {};
  });

  let state = createBattleStateFromParty(party);
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { '0': 2000000 };
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };

  // T1: M1(500k) + M2(100万) → 残り500k、ブレイクなし
  const t1Preview = previewTurn(state, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 500000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 1000000 } },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateAfterT1 } = commitTurn(state, t1Preview);

  // T1終了後: ブレイクなし、残りDP=500k
  assert.equal(
    stateAfterT1.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    false,
    'T1終了時点でブレイクしていないこと'
  );
  assert.equal(
    stateAfterT1.turnState.enemyState.remainingDpByEnemy?.['0'],
    500000,
    'T1後の残りDP=500k'
  );

  // T2: M1(500k) → DP枯渇・自動ブレイク、M2はブレイク後として DR加算
  const t1Dr = stateAfterT1.turnState.enemyState.destructionRateByEnemy['0'];
  const t2Preview = previewTurn(stateAfterT1, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 500000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateAfterT2 } = commitTurn(stateAfterT1, t2Preview);

  // T2終了後: 自動ブレイク発生、残りDP=0
  assert.equal(
    stateAfterT2.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    true,
    'T2でM1がDPを枯渇させ自動ブレイク発生すること'
  );
  assert.equal(
    stateAfterT2.turnState.enemyState.remainingDpByEnemy?.['0'],
    0,
    'T2後の残りDP=0'
  );

  // T2終了後: M2はブレイク後として DR加算が実行される
  const t2Dr = stateAfterT2.turnState.enemyState.destructionRateByEnemy['0'];
  assert.ok(
    t2Dr > t1Dr,
    `T2後のDR(${t2Dr})がT1後のDR(${t1Dr})より増加していること（M2のブレイク後DR加算）`
  );
});

function createDpTrackingTestParty() {
  const dpAttackSkill = (id, name) => ({
    id,
    name,
    sp_cost: 10,
    hit_count: 1,
    hitCount: 1,
    target_type: 'Single',
    parts: [{ skill_type: 'AttackSkill', target_type: 'Single', type: 'Slash', multipliers: { dr: 10 } }],
  });
  return createSixMemberManualParty((idx) => {
    if (idx === 0) {
      return { characterId: 'DP_A', characterName: 'DP_A', skills: [dpAttackSkill(99500, 'DP Attack A')] };
    }
    if (idx === 1) {
      return { characterId: 'DP_B', characterName: 'DP_B', skills: [dpAttackSkill(99501, 'DP Attack B')] };
    }
    return {};
  });
}

test('手動ブレイク指定はperHitDpDamageのDP残量より優先され、DRが加算されDPが0になる', () => {
  // DP=200万に対して1ヒット50万（枯渇しない）でも、手動ブレイク指定があれば
  // ブレイク扱いでDR加算が走り、DP残量も0として扱われる。
  let state = createBattleStateFromParty(createDpTrackingTestParty());
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { '0': 2000000 };
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };
  state.turnState.enemyState.destructionMultiplierByEnemy = { '0': 1 };

  const preview = previewTurn(state, {
    0: {
      characterId: 'DP_A',
      skillId: 99500,
      targetEnemyIndex: 0,
      perHitDpDamageByEnemy: { '0': 500000 },
      manualBreakEnemyIndexes: [0],
    },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    true,
    '手動ブレイク指定によりブレイクすること'
  );
  assert.equal(
    nextState.turnState.enemyState.remainingDpByEnemy?.['0'],
    0,
    '手動ブレイク指定によりDP残量が0になること'
  );
  const dr = nextState.turnState.enemyState.destructionRateByEnemy['0'];
  // 新式: d_rate=1, 1hit, dr=10 の加算が各10%。DP_A(手動ブレイク)+DP_B(ブレイク後) = +20%
  assert.ok(
    Math.abs(dr - 120.0) < 1e-6,
    `手動ブレイクのDR加算が反映されること（DR=${dr}）`
  );
});

test('DPゲージ未設定の敵はperHitDpDamageがあっても自動ブレイクしない', () => {
  // DP0で行動する敵（DPゲージなし）は自動ブレイクの対象外。
  let state = createBattleStateFromParty(createDpTrackingTestParty());
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };

  const preview = previewTurn(state, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 500000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState } = commitTurn(state, preview);

  assert.equal(
    nextState.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    false,
    'DPゲージ未設定の敵が自動ブレイクしないこと'
  );
  assert.equal(
    nextState.turnState.enemyState.destructionRateByEnemy['0'],
    100,
    'ブレイクしていないのでDRが加算されないこと'
  );
});

test('ブレイク解除後はDPゲージが最大値まで全回復する', () => {
  // T1でDP枯渇→自動ブレイク。ブレイク解除（ユーザー操作相当）後の
  // T2ではDPが最大値から再消費され、即再ブレイクしないこと。
  let state = createBattleStateFromParty(createDpTrackingTestParty());
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { '0': 2000000 };
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };

  const t1Preview = previewTurn(state, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 2000000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateAfterT1 } = commitTurn(state, t1Preview);
  assert.equal(
    stateAfterT1.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    true,
    'T1でDP枯渇により自動ブレイクすること'
  );
  assert.equal(stateAfterT1.turnState.enemyState.remainingDpByEnemy?.['0'], 0, 'T1後の残りDP=0');

  // ユーザー操作によるブレイク解除を模擬
  stateAfterT1.turnState.enemyState.statuses = stateAfterT1.turnState.enemyState.statuses.filter(
    (s) => s.statusType !== 'Break' && s.statusType !== 'DownTurn'
  );

  const t1Dr = stateAfterT1.turnState.enemyState.destructionRateByEnemy['0'];
  const t2Preview = previewTurn(stateAfterT1, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 500000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateAfterT2 } = commitTurn(stateAfterT1, t2Preview);

  assert.equal(
    stateAfterT2.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    false,
    'ブレイク解除後のT2で即再ブレイクしないこと'
  );
  assert.equal(
    stateAfterT2.turnState.enemyState.remainingDpByEnemy?.['0'],
    1500000,
    'T2は最大DP(200万)から50万消費した150万が残ること'
  );
  assert.equal(
    stateAfterT2.turnState.enemyState.destructionRateByEnemy['0'],
    t1Dr,
    'ブレイクしていないT2ではDRが増加しないこと'
  );
});

test('DP枯渇による自動ブレイクがDownTurnイベントとして記録される', () => {
  let state = createBattleStateFromParty(createDpTrackingTestParty());
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { '0': 500000 };
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };

  const preview = previewTurn(state, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 500000 } },
    1: { characterId: 'DP_B', skillId: 99501, targetEnemyIndex: 0 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const committed = commitTurn(state, preview);

  const action = committed.committedRecord.actions.find((entry) => entry.characterId === 'DP_A');
  assert.ok(action, 'DP_Aのアクションが記録されること');
  const event = (action.enemyStatusChanges ?? []).find(
    (item) => item.statusType === 'DownTurn' && item.source === 'auto'
  );
  assert.ok(event, 'DP枯渇による自動ブレイクがDownTurnイベント(source=auto)として記録されること');
  assert.equal(event.targetIndex, 0);
  assert.equal(event.mode, 'DownTurn');
});

test('複数DPゲージは同一バトルターン中に1本だけ破壊し、次ゲージは残DP1で止まる', () => {
  let state = createBattleStateFromParty(createDpTrackingTestParty());
  state.turnState.turnIndex = 1;
  state.turnState.enemyState.enemyCount = 1;
  state.turnState.enemyState.enemyDpByEnemy = { '0': 100 };
  state.turnState.enemyState.extraDpGaugeStateByEnemy = {
    '0': { total: 3, remaining: 3, values: [100, 100, 100] },
  };
  state.turnState.enemyState.destructionRateByEnemy = { '0': 100 };
  state.turnState.enemyState.destructionRateCapByEnemy = { '0': 500 };

  const t1Preview = previewTurn(state, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 250 } },
    1: { characterId: 'DP_B', skillId: 99501 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: stateAfterT1 } = commitTurn(state, t1Preview);

  assert.equal(stateAfterT1.turnState.enemyState.remainingDpByEnemy?.['0'], 1);
  assert.equal(stateAfterT1.turnState.enemyState.enemyDpByEnemy?.['0'], 100);
  assert.deepEqual(stateAfterT1.turnState.enemyState.extraDpGaugeStateByEnemy?.['0'], {
    total: 3,
    remaining: 2,
    values: [100, 100, 100],
  });
  assert.equal(stateAfterT1.turnState.enemyState.dpGaugeBreakTurnByEnemy?.['0'], 1);
  assert.equal(
    stateAfterT1.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    false,
    '非最終DPゲージ破壊ではBreak状態にしないこと'
  );

  stateAfterT1.turnState.turnIndex = 1;
  const sameBattleTurnPreview = previewTurn(stateAfterT1, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 250 } },
    1: { characterId: 'DP_B', skillId: 99501 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: sameBattleTurnState } = commitTurn(stateAfterT1, sameBattleTurnPreview);

  assert.equal(
    sameBattleTurnState.turnState.enemyState.remainingDpByEnemy?.['0'],
    1,
    '追加ターン/OD相当の同一turnIndex中は2本目を割らず残DP1で止まること'
  );
  assert.deepEqual(sameBattleTurnState.turnState.enemyState.extraDpGaugeStateByEnemy?.['0'], {
    total: 3,
    remaining: 2,
    values: [100, 100, 100],
  });
  assert.equal(
    sameBattleTurnState.turnState.enemyState.statuses.some((s) => s.statusType === 'Break' && s.targetIndex === 0),
    false
  );

  sameBattleTurnState.turnState.turnIndex = 2;
  const nextBattleTurnPreview = previewTurn(sameBattleTurnState, {
    0: { characterId: 'DP_A', skillId: 99500, targetEnemyIndex: 0, perHitDpDamageByEnemy: { '0': 250 } },
    1: { characterId: 'DP_B', skillId: 99501 },
    2: { characterId: 'M3', skillId: 8002 },
  });
  const { nextState: nextBattleTurnState } = commitTurn(sameBattleTurnState, nextBattleTurnPreview);

  assert.equal(nextBattleTurnState.turnState.enemyState.remainingDpByEnemy?.['0'], 1);
  assert.deepEqual(nextBattleTurnState.turnState.enemyState.extraDpGaugeStateByEnemy?.['0'], {
    total: 3,
    remaining: 1,
    values: [100, 100, 100],
  });
  assert.equal(nextBattleTurnState.turnState.enemyState.dpGaugeBreakTurnByEnemy?.['0'], 2);
});
