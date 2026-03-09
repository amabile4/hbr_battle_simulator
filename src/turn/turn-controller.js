import {
  createBattleState,
  cloneTurnState,
  snapshotPartyByPartyIndex,
  buildPositionMap,
} from '../contracts/interfaces.js';
import { fromSnapshot, commitRecord, buildTurnContext } from '../records/record-assembler.js';
import { buildDamageCalculationContext } from '../domain/damage-calculation-context.js';
import { cloneDpState, getDpRate } from '../domain/dp-state.js';
import { isNormalAttackSkill } from '../domain/skill-classifiers.js';
import {
  OD_RECOVERY_BY_LEVEL,
  OD_COST_BY_LEVEL,
  OD_GAUGE_PER_HIT_PERCENT,
  OD_GAUGE_MIN_PERCENT,
  OD_GAUGE_MAX_PERCENT,
  DEFAULT_ENEMY_COUNT,
  DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
  DEFAULT_DESTRUCTION_RATE_PERCENT,
  DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
  SPECIAL_BREAK_CAP_BONUS_PERCENT,
  OD_LEVELS,
  DRIVE_PIERCE_OPTION_VALUES,
  DRIVE_PIERCE_BASE_BONUS_AT_HIT_1,
  DRIVE_PIERCE_MAX_REFERENCE_HIT,
  INTRINSIC_MARK_EFFECTS_BY_ELEMENT,
  getOdGaugeRequirement,
  clampEnemyCount,
} from '../config/battle-defaults.js';

export const BASE_SP_RECOVERY = 2;
const TEZUKA_CHARACTER_ID = 'STezuka';
const OD_DAMAGE_PART_TYPES = new Set([
  'AttackNormal',
  'AttackSkill',
  'DamageRateChangeAttackSkill',
  'PenetrationCriticalAttack',
  'AttackByOwnDpRate',
  'AttackBySp',
  'TokenAttack',
  'FixedHpDamageRateAttack',
]);
const ENEMY_STATUS_DOWN_TURN = 'DownTurn';
const ENEMY_STATUS_BREAK = 'Break';
const ENEMY_STATUS_STRONG_BREAK = 'StrongBreak';
const ENEMY_STATUS_SUPER_DOWN = 'SuperDown';
const ENEMY_STATUS_DEAD = 'Dead';
const DIRECT_DP_HEAL_SKILL_TYPES = Object.freeze(new Set(['HealDp', 'HealDpRate', 'ReviveDp', 'ReviveDpRate']));
const DP_SELF_DAMAGE_SKILL_TYPES = Object.freeze(new Set(['SelfDamage']));
const DP_HEAL_SKILL_TYPES = Object.freeze(
  new Set([...DIRECT_DP_HEAL_SKILL_TYPES, 'RegenerationDp', 'HealDpByDamage'])
);
const DP_STATE_CHANGE_SKILL_TYPES = Object.freeze(
  new Set([...DP_HEAL_SKILL_TYPES, ...DP_SELF_DAMAGE_SKILL_TYPES])
);
const DP_EVENT_KINDS = Object.freeze({
  DIRECT_HEAL: 'DirectDpHeal',
  REGENERATION_GRANT: 'RegenerationDpGrant',
  REGENERATION_TICK: 'RegenerationDpTick',
  DAMAGE_BASED_HEAL: 'HealDpByDamage',
  SELF_DAMAGE: 'SelfDpDamage',
});
const DP_EVENT_SOURCE_SKILL = 'dp_skill';
const DP_EVENT_SOURCE_REGENERATION = 'dp_regeneration';
const DEFAULT_STATUS_EFFECT_REMAINING = 1;
const DEFAULT_REVIVE_DP_FLOOR = 1;
const DEFAULT_REVIVE_TERRITORY_HEAL_RATE = 0.5;
const MOTIVATION_DAMAGE_TAKEN_DELTA = -1;
const MOTIVATION_DAMAGE_TAKEN_TRIGGER_TYPE = 'MotivationDamage';
const MOTIVATION_DAMAGE_TAKEN_PASSIVE_NAME = 'Motivation';
const MOTIVATION_DAMAGE_TAKEN_PASSIVE_DESC = 'Motivation decreases when taking enemy damage';
const AUTO_DP_CONSUMPTION_FLOOR = 1;
const DEFAULT_AUTO_DOWN_TURN_REMAINING = 1;
const DP_RATE_REFERENCE_MIN = 0;
const DP_RATE_REFERENCE_MAX = 1;
const REVIVE_TERRITORY_TYPE = 'ReviveTerritory';
const MARK_LEVEL_CONDITION_TO_ELEMENT = Object.freeze({
  FireMarkLevel: 'Fire',
  IceMarkLevel: 'Ice',
  ThunderMarkLevel: 'Thunder',
  DarkMarkLevel: 'Dark',
  LightMarkLevel: 'Light',
});
const MARK_SKILL_TYPE_TO_ELEMENT = Object.freeze({
  FireMark: 'Fire',
  IceMark: 'Ice',
  ThunderMark: 'Thunder',
  DarkMark: 'Dark',
  LightMark: 'Light',
});
const INTRINSIC_MARK_ELEMENTS = Object.freeze([...new Set(Object.values(MARK_LEVEL_CONDITION_TO_ELEMENT))]);
const TURN_START_PASSIVE_TIMINGS = Object.freeze(['OnEveryTurn', 'OnPlayerTurnStart']);
const BATTLE_START_PASSIVE_TIMINGS = Object.freeze(['OnBattleStart', 'OnFirstBattleStart']);
const EXTRA_ACTIVATION_STATUS_TYPE = 20;
const CONDITION_WHITESPACE_RE = /\s+/g;
const PASSIVE_VARIANT_THRESHOLD_RE = /[:：]\s*(\d+)人/;
const CONDITION_COMPARISON_OP_PATTERN = String.raw`(==|!=|>=|<=|>|<)`;
const CONDITION_INTEGER_PATTERN = String.raw`(-?\d+)`;
const CONDITION_NUMERIC_PATTERN = String.raw`(-?\d+(?:\.\d+)?)`;
const CONDITION_IDENTIFIER_PATTERN = String.raw`([A-Za-z_][A-Za-z0-9_]*)`;
const DAMAGE_RATE_CONDITION_RE = new RegExp(
  String.raw`^DamageRate\(\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_NUMERIC_PATTERN}$`
);
const IS_WEAK_ELEMENT_CLAUSE_RE = /^IsWeakElement\(([^)]+)\)/;
const IS_WEAK_ELEMENT_PREDICATE_RE = /^IsWeakElement\([^)]+\)(==1)?$/;
const PLAYED_SKILL_COUNT_CONDITION_RE = new RegExp(
  String.raw`^PlayedSkillCount\(([^)]*)\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_INTEGER_PATTERN}$`
);
const SPECIAL_STATUS_COUNT_BY_TYPE_CONDITION_RE = new RegExp(
  String.raw`^SpecialStatusCountByType\(${EXTRA_ACTIVATION_STATUS_TYPE}\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_INTEGER_PATTERN}$`
);
const COUNT_BC_CONDITION_RE = new RegExp(
  String.raw`^CountBC\((.+)\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_INTEGER_PATTERN}$`
);
const FUNCTION_COMPARISON_CONDITION_RE = new RegExp(
  String.raw`^${CONDITION_IDENTIFIER_PATTERN}\(([^)]*)\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_NUMERIC_PATTERN}$`
);
const REVERSE_FUNCTION_COMPARISON_CONDITION_RE = new RegExp(
  String.raw`^${CONDITION_NUMERIC_PATTERN}\s*${CONDITION_COMPARISON_OP_PATTERN}\s*${CONDITION_IDENTIFIER_PATTERN}\(([^)]*)\)$`
);
const BARE_FUNCTION_CALL_CONDITION_RE = new RegExp(
  String.raw`^${CONDITION_IDENTIFIER_PATTERN}\(([^)]*)\)$`
);
const IS_CHARACTER_TARGET_CONDITION_RE = new RegExp(
  String.raw`^IsCharacter\(([^)]+)\)\s*${CONDITION_COMPARISON_OP_PATTERN}\s*([01])$`
);
const EXTRA_ACTIVE_COUNT_BC_GT_ZERO = `IsPlayer()==1&&SpecialStatusCountByType(${EXTRA_ACTIVATION_STATUS_TYPE})>0`;
const EXTRA_ACTIVE_COUNT_BC_GE_ONE = `IsPlayer()==1&&SpecialStatusCountByType(${EXTRA_ACTIVATION_STATUS_TYPE})>=1`;
const EXTRA_ACTIVE_COUNT_BC_EQ_ZERO = `IsPlayer()==1&&SpecialStatusCountByType(${EXTRA_ACTIVATION_STATUS_TYPE})==0`;
export const SUPPORTED_PASSIVE_TIMINGS = Object.freeze([
  'OnOverdriveStart',
  'OnBattleStart',
  'OnFirstBattleStart',
  'OnEveryTurn',
  'OnPlayerTurnStart',
  'OnAdditionalTurnStart',
  'OnEnemyTurnStart',
  'OnBattleWin',
]);
export const CONDITION_SUPPORT_MATRIX = Object.freeze({
  PlayedSkillCount: Object.freeze({ tier: 'implemented', note: 'skill use count is tracked now' }),
  BreakHitCount: Object.freeze({ tier: 'implemented', note: 'action context is tracked now' }),
  SpecialStatusCountByType: Object.freeze({ tier: 'implemented', note: 'tracked special states only' }),
  OverDriveGauge: Object.freeze({ tier: 'implemented', note: 'turn state gauge is tracked now' }),
  Sp: Object.freeze({ tier: 'implemented', note: 'current SP is tracked now' }),
  Ep: Object.freeze({ tier: 'implemented', note: 'current EP is tracked now' }),
  CountBC: Object.freeze({ tier: 'implemented', note: 'implemented only for supported nested predicates' }),
  IsOverDrive: Object.freeze({ tier: 'implemented', note: 'turn type is tracked now' }),
  IsReinforcedMode: Object.freeze({ tier: 'implemented', note: 'character state is tracked now' }),
  IsFront: Object.freeze({ tier: 'implemented', note: 'position is tracked now' }),
  IsDead: Object.freeze({ tier: 'implemented', note: 'alive state is tracked now' }),
  BreakDownTurn: Object.freeze({ tier: 'implemented', note: 'enemy DownTurn is tracked now' }),
  ConsumeSp: Object.freeze({ tier: 'implemented', note: 'selected skill cost is tracked now' }),
  IsAttackNormal: Object.freeze({ tier: 'implemented', note: 'selected action can be checked now' }),
  IsBroken: Object.freeze({ tier: 'implemented', note: 'self flag and enemy manual Break status are tracked now' }),
  IsNatureElement: Object.freeze({ tier: 'ready_now', note: 'can be derived from style elements without new state' }),
  IsCharacter: Object.freeze({ tier: 'ready_now', note: 'target member identity is available without new state' }),
  ConquestBikeLevel: Object.freeze({ tier: 'implemented', note: 'currently fixed at 160; UI override is future work' }),
  DamageRate: Object.freeze({
    tier: 'implemented',
    note: 'manual enemy destruction-rate state only; distinct from enemy resistance coefficients',
  }),
  IsWeakElement: Object.freeze({ tier: 'manual_state', note: 'manual enemy damage-rate state' }),
  IsHitWeak: Object.freeze({ tier: 'implemented', note: 'selected target + current skill element can be checked now' }),
  Random: Object.freeze({ tier: 'implemented', note: 'A/S succeed by default; future UI override' }),
  DpRate: Object.freeze({ tier: 'implemented', note: 'current/base/cap DP state is tracked now' }),
  Token: Object.freeze({ tier: 'implemented', note: 'current token state is tracked now' }),
  MoraleLevel: Object.freeze({ tier: 'implemented', note: 'current morale state is tracked now' }),
  MotivationLevel: Object.freeze({ tier: 'implemented', note: 'current motivation state is tracked now' }),
  FireMarkLevel: Object.freeze({ tier: 'implemented', note: 'current fire mark level state is tracked now' }),
  IceMarkLevel: Object.freeze({ tier: 'implemented', note: 'current ice mark level state is tracked now' }),
  ThunderMarkLevel: Object.freeze({ tier: 'implemented', note: 'current thunder mark level state is tracked now' }),
  DarkMarkLevel: Object.freeze({ tier: 'implemented', note: 'current dark mark level state is tracked now' }),
  LightMarkLevel: Object.freeze({ tier: 'implemented', note: 'current light mark level state is tracked now' }),
  IsZone: Object.freeze({ tier: 'implemented', note: 'turn state zone state is tracked now' }),
  IsTerritory: Object.freeze({ tier: 'implemented', note: 'turn state territory state is tracked now' }),
});
const DEFAULT_RANDOM_CONDITION_VALUE_BY_TIER = Object.freeze({
  A: 0,
  S: 0,
  SS: 0,
  SSR: 0,
});
const CONDITION_FUNCTION_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

export function analyzePassiveTimingCoverage(passives = []) {
  const countsByTiming = new Map();
  for (const passive of Array.isArray(passives) ? passives : []) {
    const timing = String(passive?.timing ?? '');
    countsByTiming.set(timing, (countsByTiming.get(timing) ?? 0) + 1);
  }

  const supportedTimings = [];
  const unsupportedTimings = [];
  for (const timing of [...countsByTiming.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    if (SUPPORTED_PASSIVE_TIMINGS.includes(timing)) {
      supportedTimings.push({ timing, count: countsByTiming.get(timing) ?? 0 });
    } else {
      unsupportedTimings.push({ timing, count: countsByTiming.get(timing) ?? 0 });
    }
  }

  return {
    supportedTimings,
    unsupportedTimings,
    countsByTiming: Object.fromEntries(countsByTiming.entries()),
  };
}

export function extractConditionFunctionNames(text) {
  const out = new Set();
  for (const match of String(text ?? '').matchAll(CONDITION_FUNCTION_PATTERN)) {
    out.add(String(match[1] ?? ''));
  }
  return [...out].sort((a, b) => a.localeCompare(b, 'en'));
}

export function analyzePassiveConditionSupport(passives = []) {
  const perPassive = [];
  const summary = {
    implemented: new Set(),
    ready_now: new Set(),
    manual_state: new Set(),
    stateful_future: new Set(),
    unknown: new Set(),
  };

  for (const passive of Array.isArray(passives) ? passives : []) {
    const expressions = [];
    const pushExpr = (location, text) => {
      const value = String(text ?? '').trim();
      if (value) {
        expressions.push({ location, expression: value });
      }
    };

    pushExpr('condition', passive?.condition);
    for (const [partIndex, part] of (passive?.parts ?? []).entries()) {
      pushExpr(`parts[${partIndex}].cond`, part?.cond);
      pushExpr(`parts[${partIndex}].hit_condition`, part?.hit_condition);
      pushExpr(`parts[${partIndex}].target_condition`, part?.target_condition);
    }

    const functions = [...new Set(expressions.flatMap((item) => extractConditionFunctionNames(item.expression)))];
    const support = functions.map((name) => ({
      name,
      ...(CONDITION_SUPPORT_MATRIX[name] ?? { tier: 'unknown', note: 'not classified yet' }),
    }));

    for (const item of support) {
      if (!summary[item.tier]) {
        summary.unknown.add(item.name);
      } else {
        summary[item.tier].add(item.name);
      }
    }

    perPassive.push({
      passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
      passiveName: String(passive?.name ?? ''),
      expressions,
      functions: support,
      requiresReview: support.some((item) => item.tier !== 'implemented'),
    });
  }

  return {
    perPassive,
    summary: Object.fromEntries(
      Object.entries(summary).map(([tier, values]) => [tier, [...values].sort((a, b) => a.localeCompare(b, 'en'))])
    ),
  };
}

function clampOdGauge(value) {
  return Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, value));
}

function createPassiveTriggerEvent(turnState, member, passive, details = {}) {
  return {
    turnLabel: String(turnState?.turnLabel ?? ''),
    turnType: String(turnState?.turnType ?? ''),
    timing: String(passive?.timing ?? ''),
    characterId: String(member?.characterId ?? ''),
    characterName: String(member?.characterName ?? ''),
    passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
    passiveName: String(passive?.name ?? ''),
    passiveDesc: String(passive?.desc ?? ''),
    ...details,
  };
}

function isOverDriveActive(turnState) {
  const type = String(turnState?.turnType ?? '');
  if (type === 'od') {
    return true;
  }
  if (type !== 'extra') {
    return false;
  }
  return Boolean(turnState?.odSuspended) && Number(turnState?.remainingOdActions ?? 0) > 0;
}

function getTranscendenceState(turnState) {
  const state = turnState?.transcendence;
  return state && typeof state === 'object' ? state : null;
}

function hasElement(member, element) {
  if (!member || !Array.isArray(member.elements)) {
    return false;
  }
  return member.elements.some((item) => String(item) === String(element));
}

function buildInitialTranscendenceStateFromParty(party) {
  if (!Array.isArray(party) || party.length === 0) {
    return null;
  }

  const source =
    party.find((member) => member?.transcendenceRule && typeof member.transcendenceRule === 'object') ??
    null;
  if (!source) {
    return null;
  }

  const rule = source.transcendenceRule;
  const gaugeElement = String(rule?.gaugeElement ?? '');
  const initialPerMember = Number(rule?.initialGaugePercentPerMatchingElementMember ?? 0);
  const gainPerAction = Number(rule?.gaugeGainPercentOnMatchingElementAction ?? 0);
  const maxGaugePercent = Number(rule?.maxGaugePercent ?? 100);
  const odBonusOnMax = Number(rule?.triggerOnReachMax?.odGaugeDeltaPercent ?? 0);

  if (!gaugeElement || !Number.isFinite(maxGaugePercent) || maxGaugePercent <= 0) {
    return null;
  }

  const matchingCount = party.reduce(
    (count, member) => count + (hasElement(member, gaugeElement) ? 1 : 0),
    0
  );
  const initialGauge = truncateToTwoDecimals(
    Math.max(0, Math.min(maxGaugePercent, matchingCount * Math.max(0, initialPerMember)))
  );

  return {
    active: true,
    sourceCharacterId: String(source.characterId ?? ''),
    sourceStyleId: Number(source.styleId ?? 0),
    gaugeElement,
    gaugePercent: initialGauge,
    maxGaugePercent: maxGaugePercent,
    gainPercentPerAction: Math.max(0, gainPerAction),
    odBonusOnMax: Math.max(0, odBonusOnMax),
    burstTriggered: false,
  };
}

function computeTranscendenceTurnSummary(state, previewRecord) {
  const transcendence = getTranscendenceState(state?.turnState);
  if (!transcendence || !transcendence.active) {
    return {
      active: false,
      startGaugePercent: 0,
      endGaugePercent: 0,
      gainPercent: 0,
      matchingActionCount: 0,
      reachedMaxThisTurn: false,
      odGaugeBonusPercent: 0,
    };
  }

  const gaugeElement = String(transcendence.gaugeElement ?? '');
  const maxGaugePercent = Math.max(0, Number(transcendence.maxGaugePercent ?? 100));
  const gainPerAction = Math.max(0, Number(transcendence.gainPercentPerAction ?? 0));
  const startGaugePercent = truncateToTwoDecimals(Number(transcendence.gaugePercent ?? 0));
  const matchingActionCount = (previewRecord?.actions ?? []).reduce((count, actionEntry) => {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    return count + (hasElement(actor, gaugeElement) ? 1 : 0);
  }, 0);
  const gainPercent = truncateToTwoDecimals(matchingActionCount * gainPerAction);
  const endGaugePercent = truncateToTwoDecimals(
    Math.max(0, Math.min(maxGaugePercent, startGaugePercent + gainPercent))
  );
  const reachedMaxThisTurn =
    !Boolean(transcendence.burstTriggered) &&
    startGaugePercent < maxGaugePercent &&
    endGaugePercent >= maxGaugePercent;
  const odGaugeBonusPercent = reachedMaxThisTurn
    ? truncateToTwoDecimals(Math.max(0, Number(transcendence.odBonusOnMax ?? 0)))
    : 0;

  return {
    active: true,
    startGaugePercent,
    endGaugePercent,
    gainPercent,
    matchingActionCount,
    reachedMaxThisTurn,
    odGaugeBonusPercent,
  };
}

function applyTranscendenceTurnSummary(state, summary) {
  if (!summary?.active) {
    return summary;
  }

  const transcendence = getTranscendenceState(state?.turnState);
  if (!transcendence) {
    return summary;
  }

  transcendence.gaugePercent = truncateToTwoDecimals(Number(summary.endGaugePercent ?? 0));
  if (summary.reachedMaxThisTurn) {
    transcendence.burstTriggered = true;
    const currentOdGauge = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));
    state.turnState.odGauge = truncateToTwoDecimals(
      clampOdGauge(currentOdGauge + Number(summary.odGaugeBonusPercent ?? 0))
    );
  }

  return summary;
}

function resolveSkillHitCount(skill) {
  const direct = Number(skill?.hitCount ?? 0);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const hitsArrayCount = Array.isArray(skill?.hits) ? skill.hits.length : 0;
  return Number.isFinite(hitsArrayCount) && hitsArrayCount > 0 ? hitsArrayCount : 0;
}

function hasDamagePartInParts(parts) {
  for (const part of parts ?? []) {
    const skillType = String(part?.skill_type ?? '');
    if (OD_DAMAGE_PART_TYPES.has(skillType)) {
      return true;
    }

    if (Array.isArray(part?.strval)) {
      for (const nested of part.strval) {
        if (nested && typeof nested === 'object' && Array.isArray(nested.parts)) {
          if (hasDamagePartInParts(nested.parts)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function skillMatchesActiveZone(state, skill, member = null) {
  const zoneState = getZoneState(state?.turnState);
  if (!isFieldStateActive(zoneState)) {
    return { matched: false, zoneState };
  }
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
  for (const part of effectiveParts ?? []) {
    const skillType = String(part?.skill_type ?? '').trim();
    if (!OD_DAMAGE_PART_TYPES.has(skillType)) {
      continue;
    }
    const elements = Array.isArray(part?.elements) ? part.elements.map((value) => String(value ?? '').trim()) : [];
    if (elements.includes(String(zoneState.type ?? ''))) {
      return { matched: true, zoneState };
    }
  }
  return { matched: false, zoneState };
}

function getDamagePartReferences(part, options = {}) {
  if (!part || typeof part !== 'object') {
    return [];
  }
  const out = [];
  const attackType = String(part?.type ?? '').trim();
  if (attackType) {
    out.push(attackType);
  }
  const attackElements =
    Array.isArray(options.normalAttackElements) && options.normalAttackElements.length > 0
      ? options.normalAttackElements
      : Array.isArray(part?.elements)
        ? part.elements
        : [];
  for (const element of attackElements) {
    const normalized = String(element ?? '').trim();
    if (normalized) {
      out.push(normalized);
    }
  }
  return [...new Set(out)];
}

function computeEnemyEffectiveDamageRatePercentForPart(turnState, targetIndex, part, options = {}) {
  const references = getDamagePartReferences(part, options);
  if (references.length === 0) {
    return DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
  }
  let rate = 1;
  for (const reference of references) {
    rate *= getEnemyResistanceRatePercent(turnState, targetIndex, reference) / 100;
  }
  return truncateToTwoDecimals(rate * 100);
}

function computeEnemyEffectiveDamageRatePercentForSkill(state, member, skill, targetIndex) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member).filter((part) =>
    OD_DAMAGE_PART_TYPES.has(String(part?.skill_type ?? ''))
  );
  if (effectiveParts.length === 0) {
    return DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
  }

  const normalAttackElements =
    isNormalAttackSkill(skill) && Array.isArray(member?.normalAttackElements) ? member.normalAttackElements : [];
  let bestRate = Number.NEGATIVE_INFINITY;
  for (const part of effectiveParts) {
    const partRate = computeEnemyEffectiveDamageRatePercentForPart(state?.turnState, targetIndex, part, {
      normalAttackElements,
    });
    if (partRate > bestRate) {
      bestRate = partRate;
    }
  }
  return Number.isFinite(bestRate) ? bestRate : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

function analyzeEnemiesEligibleForOdGain(state, member, skill, enemyCount) {
  const numericEnemyCount = clampEnemyCount(enemyCount);
  const targetType = String(skill?.targetType ?? '');
  const isAllTarget = targetType === 'All';
  const effectiveDamageRatesByEnemy = {};
  const eligibleEnemyIndexes = [];
  let targetEnemyIndex = null;
  if (!isAllTarget) {
    targetEnemyIndex = Number.isFinite(Number(skill?.targetEnemyIndex))
      ? Number(skill.targetEnemyIndex)
      : 0;
    const rate = computeEnemyEffectiveDamageRatePercentForSkill(state, member, skill, targetEnemyIndex);
    effectiveDamageRatesByEnemy[String(targetEnemyIndex)] = rate;
    if (rate >= DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT) {
      eligibleEnemyIndexes.push(targetEnemyIndex);
    }
    return {
      targetEnemyIndex,
      eligibleEnemyIndexes,
      effectiveDamageRatesByEnemy,
      eligibleEnemyCount: eligibleEnemyIndexes.length,
    };
  }

  for (let i = 0; i < numericEnemyCount; i += 1) {
    const rate = computeEnemyEffectiveDamageRatePercentForSkill(state, member, skill, i);
    effectiveDamageRatesByEnemy[String(i)] = rate;
    if (rate >= DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT) {
      eligibleEnemyIndexes.push(i);
    }
  }
  return {
    targetEnemyIndex,
    eligibleEnemyIndexes,
    effectiveDamageRatesByEnemy,
    eligibleEnemyCount: eligibleEnemyIndexes.length,
  };
}

function hasOverDrivePointUpPartInParts(parts) {
  for (const part of parts ?? []) {
    const skillType = String(part?.skill_type ?? '');
    if (skillType === 'OverDrivePointUp' || skillType === 'OverDrivePointUpByToken') {
      return true;
    }
    if (Array.isArray(part?.strval)) {
      for (const nested of part.strval) {
        if (nested && typeof nested === 'object' && Array.isArray(nested.parts)) {
          if (hasOverDrivePointUpPartInParts(nested.parts)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function compareNumbers(left, op, right) {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    default:
      return false;
  }
}

function resolveZeroArgConditionValue(name, state, member, skill, actionEntry) {
  const key = String(name ?? '').trim();
  const markElement = MARK_LEVEL_CONDITION_TO_ELEMENT[key];
  if (markElement) {
    return {
      known: true,
      value: Number(member?.markStates?.[markElement]?.current ?? 0),
    };
  }
  switch (key) {
    case 'BreakHitCount':
      return {
        known: true,
        value: Number(actionEntry?.breakHitCount ?? 0),
      };
    case 'OverDriveGauge':
      return {
        known: true,
        value: Number(state?.turnState?.odGauge ?? 0),
      };
    case 'Sp':
      return {
        known: true,
        value: Number(member?.sp?.current ?? 0),
      };
    case 'Ep':
      return {
        known: true,
        value: Number(member?.ep?.current ?? 0),
      };
    case 'ConquestBikeLevel':
      return {
        known: true,
        value: 160,
      };
    case 'Random': {
      const tier = String(skill?.tier ?? skill?.ct ?? '').trim().toUpperCase();
      if (Object.hasOwn(DEFAULT_RANDOM_CONDITION_VALUE_BY_TIER, tier)) {
        return {
          known: true,
          value: DEFAULT_RANDOM_CONDITION_VALUE_BY_TIER[tier],
        };
      }
      return {
        known: true,
        value: 1,
      };
    }
    case 'Token':
      return {
        known: true,
        value: Number(member?.tokenState?.current ?? 0),
      };
    case 'MoraleLevel':
      return {
        known: true,
        value: Number(member?.moraleState?.current ?? 0),
      };
    case 'MotivationLevel':
      return {
        known: true,
        value: Number(member?.motivationState?.current ?? 0),
      };
    case 'DpRate':
      return {
        known: true,
        value: getDpRate(member?.dpState),
      };
    case 'IsOverDrive':
      return {
        known: true,
        value: isOverDriveActive(state?.turnState) ? 1 : 0,
      };
    case 'IsReinforcedMode':
      return {
        known: true,
        value: hasReinforcedMode(member) ? 1 : 0,
      };
    case 'IsFront':
      return {
        known: true,
        value: Number(member?.position ?? 99) <= 2 ? 1 : 0,
      };
    case 'IsDead':
      return {
        known: true,
        value: member?.isAlive === false ? 1 : 0,
      };
    case 'IsBroken':
      return {
        known: true,
        value: member?.isBreak ? 1 : 0,
      };
    case 'IsHitWeak':
      return isHitWeakBySkillContext(state, skill, actionEntry);
    case 'IsAttackNormal':
      return {
        known: true,
        value: isNormalAttackSkill(skill) ? 1 : 0,
      };
    case 'ConsumeSp':
      return {
        known: true,
        value: Number(skill?.spCost ?? skill?.sp_cost ?? 0),
      };
    default:
      return {
        known: false,
        value: true,
      };
  }
}

function resolveSingleArgConditionValue(name, argRaw, state, member) {
  const key = String(name ?? '').trim();
  const arg = String(argRaw ?? '').trim();
  switch (key) {
    case 'IsNatureElement':
      return {
        known: true,
        value: Array.isArray(member?.elements) && member.elements.some((element) => String(element) === arg) ? 1 : 0,
      };
    case 'IsCharacter':
      return {
        known: true,
        value: String(member?.characterId ?? '') === arg ? 1 : 0,
      };
    case 'IsWeakElement': {
      const targetIndex = Number(member?.__enemyTargetIndex ?? Number.NaN);
      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        return {
          known: false,
          value: true,
        };
      }
      return {
        known: true,
        value: isEnemyWeakToElement(state?.turnState, targetIndex, arg) ? 1 : 0,
      };
    }
    case 'IsZone':
      return {
        known: true,
        value:
          isFieldStateActive(getZoneState(state?.turnState)) &&
          String(getZoneState(state?.turnState)?.type ?? '') === arg
            ? 1
            : 0,
      };
    case 'IsTerritory':
      return {
        known: true,
        value:
          isFieldStateActive(getTerritoryState(state?.turnState)) &&
          String(getTerritoryState(state?.turnState)?.type ?? '') === arg
            ? 1
            : 0,
      };
    case 'SpecialStatusCountByType':
      if (arg === '20') {
        return {
          known: true,
          value: member?.isExtraActive ? 1 : 0,
        };
      }
      return {
        known: false,
        value: true,
      };
    default:
      return {
        known: false,
        value: true,
      };
  }
}

function resolveConditionFunctionValue(name, argRaw, state, member, skill, actionEntry) {
  const arg = String(argRaw ?? '').trim();
  if (!arg) {
    return resolveZeroArgConditionValue(name, state, member, skill, actionEntry);
  }
  return resolveSingleArgConditionValue(name, arg, state, member);
}

function createConditionSkillContext(skill, part = null) {
  if (!skill || !part) {
    return skill;
  }
  return {
    ...skill,
    __conditionPart: part,
    __conditionElements: Array.isArray(part?.elements) ? [...part.elements] : [],
  };
}

function splitTopLevel(expression, separator) {
  const text = String(expression ?? '');
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    if (text.slice(i, i + separator.length) === separator) {
      out.push(text.slice(start, i).trim());
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

function getEnemyState(turnState) {
  const state = turnState?.enemyState;
  if (!state || typeof state !== 'object') {
    return {
      enemyCount: DEFAULT_ENEMY_COUNT,
      statuses: [],
      damageRatesByEnemy: {},
      destructionRateByEnemy: {},
      destructionRateCapByEnemy: {},
      breakStateByEnemy: {},
      enemyNamesByEnemy: {},
      zoneConfigByEnemy: {},
    };
  }
  const enemyCount = clampEnemyCount(state.enemyCount ?? DEFAULT_ENEMY_COUNT);
  return {
    enemyCount,
    statuses: Array.isArray(state.statuses) ? state.statuses : [],
    damageRatesByEnemy:
      state.damageRatesByEnemy && typeof state.damageRatesByEnemy === 'object' ? state.damageRatesByEnemy : {},
    destructionRateByEnemy:
      state.destructionRateByEnemy && typeof state.destructionRateByEnemy === 'object'
        ? state.destructionRateByEnemy
        : {},
    destructionRateCapByEnemy:
      state.destructionRateCapByEnemy && typeof state.destructionRateCapByEnemy === 'object'
        ? state.destructionRateCapByEnemy
        : {},
    breakStateByEnemy:
      state.breakStateByEnemy && typeof state.breakStateByEnemy === 'object' ? state.breakStateByEnemy : {},
    enemyNamesByEnemy:
      state.enemyNamesByEnemy && typeof state.enemyNamesByEnemy === 'object' ? state.enemyNamesByEnemy : {},
    zoneConfigByEnemy:
      state.zoneConfigByEnemy && typeof state.zoneConfigByEnemy === 'object' ? state.zoneConfigByEnemy : {},
  };
}

function normalizeFieldState(fieldState) {
  if (!fieldState || typeof fieldState !== 'object') {
    return null;
  }
  const type = String(fieldState.type ?? '').trim();
  if (!type) {
    return null;
  }
  const rawRemaining = fieldState.remainingTurns;
  return {
    type,
    sourceSide: String(fieldState.sourceSide ?? ''),
    remainingTurns:
      rawRemaining === null || rawRemaining === undefined
        ? null
        : Number.isFinite(Number(rawRemaining))
          ? Number(rawRemaining)
          : null,
    ...(Number.isFinite(Number(fieldState.powerRate)) ? { powerRate: Number(fieldState.powerRate) } : {}),
  };
}

function getZoneState(turnState) {
  return normalizeFieldState(turnState?.zoneState);
}

function getTerritoryState(turnState) {
  return normalizeFieldState(turnState?.territoryState);
}

function isFieldStateActive(fieldState) {
  if (!fieldState) {
    return false;
  }
  if (fieldState.remainingTurns === null) {
    return true;
  }
  return Number(fieldState.remainingTurns ?? 0) > 0;
}

function tickFieldState(fieldState) {
  const normalized = normalizeFieldState(fieldState);
  if (!normalized) {
    return null;
  }
  if (normalized.remainingTurns === null) {
    return normalized;
  }
  const nextTurns = Number(normalized.remainingTurns ?? 0) - 1;
  if (nextTurns <= 0) {
    return null;
  }
  return {
    ...normalized,
    remainingTurns: nextTurns,
  };
}

function resolveFieldDuration(part) {
  const exitCond = String(part?.effect?.exitCond ?? '');
  const turns = Number(part?.effect?.exitVal?.[0] ?? 0);
  if (exitCond === 'Eternal' || exitCond === 'None') {
    return null;
  }
  if (!Number.isFinite(turns) || turns <= 0) {
    return null;
  }
  return turns;
}

function deriveZoneTypeFromPart(part) {
  const explicit = String(part?.strval?.[0] ?? '').trim();
  if (explicit && explicit !== '-1') {
    return explicit;
  }
  const element = Array.isArray(part?.elements) ? String(part.elements[0] ?? '').trim() : '';
  if (element) {
    return element;
  }
  return '';
}

function resolveZonePowerRate(part) {
  const power = Number(part?.power?.[0] ?? NaN);
  return Number.isFinite(power) ? power : null;
}

function resolveTerritoryPowerRate(part) {
  const power = Number(part?.power?.[0] ?? NaN);
  return Number.isFinite(power) ? power : null;
}

function deriveTerritoryTypeFromPart(part) {
  const skillType = String(part?.skill_type ?? '').trim();
  if (skillType && skillType !== '-1') {
    return skillType;
  }
  const explicit = String(part?.strval?.[0] ?? '').trim();
  if (explicit && explicit !== '-1') {
    return explicit;
  }
  return '';
}

function applyZonePartToTurnState(turnState, part, sourceSide = 'player') {
  const type = deriveZoneTypeFromPart(part);
  if (!type) {
    return null;
  }
  const next = {
    type,
    sourceSide: String(sourceSide ?? ''),
    remainingTurns: resolveFieldDuration(part),
    ...(Number.isFinite(resolveZonePowerRate(part)) ? { powerRate: resolveZonePowerRate(part) } : {}),
  };
  turnState.zoneState = next;
  return next;
}

function toPassiveLikeEntryFromTriggeredSkill(skill) {
  if (!skill?.passive || typeof skill.passive !== 'object') {
    return null;
  }
  return {
    passiveId: Number(skill.skillId ?? skill.id ?? 0),
    label: String(skill.label ?? ''),
    name: String(skill.name ?? ''),
    desc: String(skill.desc ?? ''),
    info: String(skill.info ?? ''),
    timing: String(skill.passive.timing ?? ''),
    condition: String(skill.passive.condition ?? ''),
    effect: String(skill.passive.effect ?? ''),
    activRate: Number(skill.passive.activ_rate ?? skill.passive.activRate ?? 0),
    autoType: String(skill.passive.auto_type ?? skill.passive.autoType ?? ''),
    limit: Number(skill.passive.limit ?? 0),
    requiredLimitBreakLevel: 0,
    sourceType: String(skill.sourceType ?? 'triggeredSkill'),
    sourceMeta:
      skill.sourceMeta && typeof skill.sourceMeta === 'object' ? structuredClone(skill.sourceMeta) : null,
    labels: null,
    parts: Array.isArray(skill.parts) ? skill.parts : [],
  };
}

function getPassiveEntriesForMember(member) {
  const entries = Array.isArray(member?.passives) ? [...member.passives] : [];
  for (const skill of member?.triggeredSkills ?? []) {
    const passiveLike = toPassiveLikeEntryFromTriggeredSkill(skill);
    if (passiveLike) {
      entries.push(passiveLike);
    }
  }
  return entries;
}

function getPassiveUsageKey(member, passive) {
  const characterId = String(member?.characterId ?? '').trim();
  const passiveId = Number(passive?.passiveId ?? passive?.id ?? 0);
  const passiveName = String(passive?.name ?? '').trim();
  return `${characterId}:${Number.isFinite(passiveId) ? passiveId : 0}:${passiveName}`;
}

function resolveZoneUpEternalParts(member) {
  return getPassiveEntriesForMember(member).flatMap((passive) =>
    (passive?.parts ?? [])
      .filter((part) => String(part?.skill_type ?? '').trim() === 'ZoneUpEternal')
      .map((part) => ({ passive, part }))
  );
}

function hasActiveZoneUpEternalModifier(state, member, skill = null, actionEntry = null) {
  for (const { passive, part } of resolveZoneUpEternalParts(member)) {
    const timing = String(passive?.timing ?? '').trim();
    if (timing !== 'OnBattleStart' && timing !== 'OnFirstBattleStart') {
      continue;
    }
    if (!evaluatePassiveSelfConditions(passive, part, state, member, skill, actionEntry)) {
      continue;
    }
    return true;
  }
  return false;
}

function applyTerritoryPartToTurnState(turnState, part, sourceSide = 'player') {
  const type = deriveTerritoryTypeFromPart(part);
  if (!type) {
    return null;
  }
  const next = {
    type,
    sourceSide: String(sourceSide ?? ''),
    remainingTurns: resolveFieldDuration(part),
    ...(Number.isFinite(resolveTerritoryPowerRate(part))
      ? { powerRate: resolveTerritoryPowerRate(part) }
      : {}),
  };
  turnState.territoryState = next;
  return next;
}

function isBrokenDpState(dpState) {
  const normalized = cloneDpState(dpState);
  return Number(normalized.baseMaxDp ?? 0) > 0 && Number(normalized.currentDp ?? 0) <= 0;
}

function captureReviveTerritoryTurnStartTrigger(party, turnState) {
  const territoryState = getTerritoryState(turnState);
  if (!isFieldStateActive(territoryState) || String(territoryState?.type ?? '') !== REVIVE_TERRITORY_TYPE) {
    return null;
  }
  const brokenTargetCharacterIds = (Array.isArray(party) ? party : [])
    .filter((member) => isBrokenDpState(member?.dpState))
    .map((member) => String(member?.characterId ?? '').trim())
    .filter(Boolean);
  if (brokenTargetCharacterIds.length === 0) {
    return null;
  }
  return {
    territoryState,
    brokenTargetCharacterIds,
  };
}

function createTerritoryDpEvent(turnState, territoryState, target, startDpState, endDpState) {
  const startState = cloneDpState(startDpState ?? target?.dpState ?? {});
  const endState = cloneDpState(endDpState ?? target?.dpState ?? {});
  return {
    actorCharacterId: null,
    characterId: target.characterId,
    source: 'territory',
    territoryType: String(territoryState?.type ?? ''),
    skillType: String(territoryState?.type ?? ''),
    triggerType: String(territoryState?.type ?? ''),
    delta: Number(endState.currentDp ?? 0) - Number(startState.currentDp ?? 0),
    startDpState: startState,
    endDpState: endState,
    startDpRate: getDpRate(startState),
    endDpRate: getDpRate(endState),
    eventCeiling: Number(endState.effectiveDpCap ?? endState.baseMaxDp ?? 0),
    isAmountResolved: true,
    targetType: 'AllyAll',
    targetCondition: '',
  };
}

function applyReviveTerritoryTurnStartEffect(party, turnState, trigger) {
  const territoryState = normalizeFieldState(trigger?.territoryState);
  if (!territoryState || String(territoryState?.type ?? '') !== REVIVE_TERRITORY_TYPE) {
    return { dpEvents: [], passiveEvents: [] };
  }

  const powerRate = Number(territoryState?.powerRate ?? DEFAULT_REVIVE_TERRITORY_HEAL_RATE);
  const resolvedPowerRate =
    Number.isFinite(powerRate) && powerRate > 0 ? powerRate : DEFAULT_REVIVE_TERRITORY_HEAL_RATE;
  const dpEvents = [];

  for (const target of party ?? []) {
    const startDpState = cloneDpState(target?.dpState ?? {});
    const baseMaxDp = Number(startDpState.baseMaxDp ?? 0);
    if (!Number.isFinite(baseMaxDp) || baseMaxDp <= 0) {
      continue;
    }
    const amount = baseMaxDp * resolvedPowerRate;
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const change = target.setDpState({
      currentDp: Number(startDpState.currentDp ?? 0) + amount,
      effectiveDpCap: Number(startDpState.effectiveDpCap ?? baseMaxDp),
    });
    dpEvents.push(
      createTerritoryDpEvent(
        turnState,
        territoryState,
        target,
        startDpState,
        cloneDpState(change.endDpState)
      )
    );
  }

  turnState.territoryState = null;

  return {
    dpEvents,
    passiveEvents: [
      {
        turnLabel: String(turnState?.turnLabel ?? ''),
        turnType: String(turnState?.turnType ?? ''),
        timing: 'OnEveryTurn',
        characterId: '',
        characterName: '',
        passiveId: 0,
        passiveName: REVIVE_TERRITORY_TYPE,
        passiveDesc: 'Turn-start territory activation',
        source: 'territory',
        territoryType: REVIVE_TERRITORY_TYPE,
        effectTypes: [REVIVE_TERRITORY_TYPE],
        dpDelta: dpEvents.reduce((sum, event) => sum + Number(event?.delta ?? 0), 0),
        brokenTargetCharacterIds: [...(trigger?.brokenTargetCharacterIds ?? [])],
        consumed: true,
      },
    ],
  };
}

function getEnemyResistanceRatePercent(turnState, targetIndex, element) {
  const enemyState = getEnemyState(turnState);
  const enemyKey = String(Number(targetIndex));
  const rates = enemyState.damageRatesByEnemy?.[enemyKey];
  if (!rates || typeof rates !== 'object') {
    return DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
  }
  const value = Number(rates[String(element ?? '').trim()]);
  return Number.isFinite(value) ? value : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

function isEnemyWeakToElement(turnState, targetIndex, element) {
  return getEnemyResistanceRatePercent(turnState, targetIndex, element) > DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

function countEnemiesWeakToElement(turnState, element) {
  const enemyState = getEnemyState(turnState);
  let count = 0;
  for (let i = 0; i < enemyState.enemyCount; i += 1) {
    if (!isEnemyDead(turnState, i) && isEnemyWeakToElement(turnState, i, element)) {
      count += 1;
    }
  }
  return count;
}

function getConditionTargetEnemyIndex(state, skill, actionEntry) {
  const skillTarget = Number(skill?.targetEnemyIndex);
  if (Number.isFinite(skillTarget) && skillTarget >= 0) {
    return skillTarget;
  }
  const actionTarget = Number(actionEntry?.targetEnemyIndex);
  if (Number.isFinite(actionTarget) && actionTarget >= 0) {
    return actionTarget;
  }
  return Number.NaN;
}

function getConditionSkillElements(skill) {
  const explicit = Array.isArray(skill?.__conditionElements) ? skill.__conditionElements : null;
  if (explicit) {
    return [...new Set(explicit.map((element) => String(element ?? '').trim()).filter(Boolean))];
  }
  const part = skill?.__conditionPart;
  const partElements = Array.isArray(part?.elements) ? part.elements : null;
  if (partElements) {
    return [...new Set(partElements.map((element) => String(element ?? '').trim()).filter(Boolean))];
  }
  const elements = [];
  for (const candidatePart of Array.isArray(skill?.parts) ? skill.parts : []) {
    for (const element of Array.isArray(candidatePart?.elements) ? candidatePart.elements : []) {
      const value = String(element ?? '').trim();
      if (value && value !== 'None') {
        elements.push(value);
      }
    }
  }
  return [...new Set(elements)];
}

function isHitWeakBySkillContext(state, skill, actionEntry) {
  const targetIndex = getConditionTargetEnemyIndex(state, skill, actionEntry);
  if (!Number.isFinite(targetIndex) || targetIndex < 0) {
    return { known: false, value: true };
  }
  const elements = getConditionSkillElements(skill).filter((element) => element && element !== 'None');
  if (elements.length === 0) {
    return { known: true, value: 0 };
  }
  return {
    known: true,
    value: elements.some((element) => isEnemyWeakToElement(state?.turnState, targetIndex, element)) ? 1 : 0,
  };
}

function getEnemyDestructionRatePercent(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  const value = Number(enemyState.destructionRateByEnemy?.[String(Number(targetIndex))]);
  return Number.isFinite(value) ? value : DEFAULT_DESTRUCTION_RATE_PERCENT;
}

function getEnemyDestructionRateCapPercent(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  const key = String(Number(targetIndex));
  const explicit = Number(enemyState.destructionRateCapByEnemy?.[key]);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return Math.max(DEFAULT_DESTRUCTION_RATE_CAP_PERCENT, getEnemyDestructionRatePercent(turnState, targetIndex));
}

function getEnemyBreakStateByTarget(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  const raw = enemyState.breakStateByEnemy?.[String(Number(targetIndex))];
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    baseCap: Number.isFinite(Number(raw.baseCap)) ? Number(raw.baseCap) : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
    strongBreakActive: Boolean(raw.strongBreakActive),
    superDown:
      raw.superDown && typeof raw.superDown === 'object'
        ? {
            preRate: Number.isFinite(Number(raw.superDown.preRate))
              ? Number(raw.superDown.preRate)
              : DEFAULT_DESTRUCTION_RATE_PERCENT,
            preCap: Number.isFinite(Number(raw.superDown.preCap))
              ? Number(raw.superDown.preCap)
              : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
          }
        : null,
  };
}

function setEnemyDestructionRatePercent(turnState, targetIndex, value) {
  const enemyState = getEnemyState(turnState);
  const next = {
    ...(enemyState.destructionRateByEnemy ?? {}),
    [String(Number(targetIndex))]: Number(value),
  };
  turnState.enemyState = {
    ...enemyState,
    destructionRateByEnemy: next,
  };
}

function setEnemyDestructionRateCapPercent(turnState, targetIndex, value) {
  const enemyState = getEnemyState(turnState);
  const next = {
    ...(enemyState.destructionRateCapByEnemy ?? {}),
    [String(Number(targetIndex))]: Number(value),
  };
  turnState.enemyState = {
    ...enemyState,
    destructionRateCapByEnemy: next,
  };
}

function deleteEnemyDestructionRateCapPercent(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  const next = { ...(enemyState.destructionRateCapByEnemy ?? {}) };
  delete next[String(Number(targetIndex))];
  turnState.enemyState = {
    ...enemyState,
    destructionRateCapByEnemy: next,
  };
}

function setEnemyBreakStateByTarget(turnState, targetIndex, state) {
  const enemyState = getEnemyState(turnState);
  const next = { ...(enemyState.breakStateByEnemy ?? {}) };
  if (state && typeof state === 'object') {
    next[String(Number(targetIndex))] = {
      baseCap: Number.isFinite(Number(state.baseCap)) ? Number(state.baseCap) : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
      strongBreakActive: Boolean(state.strongBreakActive),
      superDown:
        state.superDown && typeof state.superDown === 'object'
          ? {
              preRate: Number.isFinite(Number(state.superDown.preRate))
                ? Number(state.superDown.preRate)
                : DEFAULT_DESTRUCTION_RATE_PERCENT,
              preCap: Number.isFinite(Number(state.superDown.preCap))
                ? Number(state.superDown.preCap)
                : DEFAULT_DESTRUCTION_RATE_CAP_PERCENT,
            }
          : null,
    };
  } else {
    delete next[String(Number(targetIndex))];
  }
  turnState.enemyState = {
    ...enemyState,
    breakStateByEnemy: next,
  };
}

function computeEnemySpecialBreakCapPercent(breakState) {
  if (!breakState) {
    return DEFAULT_DESTRUCTION_RATE_CAP_PERCENT;
  }
  let cap = Number(breakState.baseCap ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT);
  if (breakState.strongBreakActive) {
    cap += SPECIAL_BREAK_CAP_BONUS_PERCENT;
  }
  if (breakState.superDown) {
    cap += SPECIAL_BREAK_CAP_BONUS_PERCENT;
  }
  return cap;
}

function deriveBaseCapForEnemy(turnState, targetIndex) {
  const currentCap = getEnemyDestructionRateCapPercent(turnState, targetIndex);
  const currentBreakState = getEnemyBreakStateByTarget(turnState, targetIndex);
  if (!currentBreakState) {
    return currentCap;
  }
  let cap = currentCap;
  if (currentBreakState.superDown) {
    cap -= SPECIAL_BREAK_CAP_BONUS_PERCENT;
  }
  if (currentBreakState.strongBreakActive) {
    cap -= SPECIAL_BREAK_CAP_BONUS_PERCENT;
  }
  return Math.max(DEFAULT_DESTRUCTION_RATE_CAP_PERCENT, cap);
}

function hasEnemyStatus(turnState, targetIndex, statusType) {
  return getActiveEnemyStatuses(turnState, statusType).some(
    (status) => Number(status?.targetIndex ?? -1) === Number(targetIndex)
  );
}

function removeEnemyStatuses(turnState, targetIndex, statusTypes = []) {
  const enemyState = getEnemyState(turnState);
  const target = Number(targetIndex);
  const removeSet = new Set((Array.isArray(statusTypes) ? statusTypes : [statusTypes]).map((value) => String(value)));
  turnState.enemyState = {
    ...enemyState,
    statuses: enemyState.statuses.filter((status) => {
      if (Number(status?.targetIndex ?? -1) !== target) {
        return true;
      }
      return !removeSet.has(String(status?.statusType ?? ''));
    }),
  };
}

function upsertEnemyStatus(turnState, status) {
  const enemyState = getEnemyState(turnState);
  const targetIndex = Number(status?.targetIndex ?? 0);
  const statusType = String(status?.statusType ?? '');
  const remainingTurns = Number(status?.remainingTurns ?? 0);
  const nextStatuses = enemyState.statuses.filter(
    (current) =>
      Number(current?.targetIndex ?? -1) !== targetIndex || String(current?.statusType ?? '') !== statusType
  );
  nextStatuses.push({ statusType, targetIndex, remainingTurns });
  turnState.enemyState = {
    ...enemyState,
    statuses: nextStatuses,
  };
}

function clearEnemySpecialBreakState(turnState, targetIndex) {
  const breakState = getEnemyBreakStateByTarget(turnState, targetIndex);
  if (!breakState) {
    removeEnemyStatuses(turnState, targetIndex, [ENEMY_STATUS_STRONG_BREAK, ENEMY_STATUS_SUPER_DOWN]);
    deleteEnemyDestructionRateCapPercent(turnState, targetIndex);
    return;
  }
  let currentRate = getEnemyDestructionRatePercent(turnState, targetIndex);
  if (breakState.superDown) {
    const gainedDuringSuperDown = Math.max(0, currentRate - Number(breakState.superDown.preCap ?? 0));
    const capAfterSuperDown = breakState.strongBreakActive
      ? Number(breakState.baseCap ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT) + SPECIAL_BREAK_CAP_BONUS_PERCENT
      : Number(breakState.baseCap ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT);
    currentRate = Math.min(
      capAfterSuperDown,
      Number(breakState.superDown.preRate ?? DEFAULT_DESTRUCTION_RATE_PERCENT) + gainedDuringSuperDown
    );
  }
  const finalCap = Number(breakState.baseCap ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT);
  setEnemyDestructionRatePercent(turnState, targetIndex, Math.min(finalCap, currentRate));
  deleteEnemyDestructionRateCapPercent(turnState, targetIndex);
  setEnemyBreakStateByTarget(turnState, targetIndex, null);
  removeEnemyStatuses(turnState, targetIndex, [ENEMY_STATUS_STRONG_BREAK, ENEMY_STATUS_SUPER_DOWN]);
}

function applyEnemyStrongBreakState(turnState, targetIndex) {
  if (!hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_BREAK) || hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_STRONG_BREAK)) {
    return null;
  }
  const current = getEnemyBreakStateByTarget(turnState, targetIndex);
  const nextState = {
    baseCap: current?.baseCap ?? deriveBaseCapForEnemy(turnState, targetIndex),
    strongBreakActive: true,
    superDown: current?.superDown ?? null,
  };
  setEnemyBreakStateByTarget(turnState, targetIndex, nextState);
  setEnemyDestructionRateCapPercent(turnState, targetIndex, computeEnemySpecialBreakCapPercent(nextState));
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_BREAK,
    targetIndex,
    remainingTurns: 0,
  });
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_STRONG_BREAK,
    targetIndex,
    remainingTurns: 0,
  });
  return {
    targetIndex,
    statusType: ENEMY_STATUS_STRONG_BREAK,
    destructionRateCap: getEnemyDestructionRateCapPercent(turnState, targetIndex),
  };
}

function applyEnemySuperDownState(turnState, targetIndex) {
  if (hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_SUPER_DOWN)) {
    return null;
  }
  const currentRate = getEnemyDestructionRatePercent(turnState, targetIndex);
  const currentCap = getEnemyDestructionRateCapPercent(turnState, targetIndex);
  const current = getEnemyBreakStateByTarget(turnState, targetIndex);
  const nextState = {
    baseCap: current?.baseCap ?? deriveBaseCapForEnemy(turnState, targetIndex),
    strongBreakActive: Boolean(current?.strongBreakActive),
    superDown: {
      preRate: currentRate,
      preCap: currentCap,
    },
  };
  setEnemyBreakStateByTarget(turnState, targetIndex, nextState);
  setEnemyDestructionRateCapPercent(turnState, targetIndex, computeEnemySpecialBreakCapPercent(nextState));
  setEnemyDestructionRatePercent(turnState, targetIndex, currentCap);
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_BREAK,
    targetIndex,
    remainingTurns: 0,
  });
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_SUPER_DOWN,
    targetIndex,
    remainingTurns: 0,
  });
  return {
    targetIndex,
    statusType: ENEMY_STATUS_SUPER_DOWN,
    destructionRateBefore: currentRate,
    destructionRateAfter: getEnemyDestructionRatePercent(turnState, targetIndex),
    destructionRateCap: getEnemyDestructionRateCapPercent(turnState, targetIndex),
  };
}

function removeEnemySuperDownState(turnState, targetIndex) {
  const current = getEnemyBreakStateByTarget(turnState, targetIndex);
  if (!current?.superDown) {
    removeEnemyStatuses(turnState, targetIndex, ENEMY_STATUS_SUPER_DOWN);
    return null;
  }
  const currentRate = getEnemyDestructionRatePercent(turnState, targetIndex);
  const gainedDuringSuperDown = Math.max(0, currentRate - Number(current.superDown.preCap ?? 0));
  const nextState = {
    baseCap: Number(current.baseCap ?? DEFAULT_DESTRUCTION_RATE_CAP_PERCENT),
    strongBreakActive: Boolean(current.strongBreakActive),
    superDown: null,
  };
  const nextCap = computeEnemySpecialBreakCapPercent(nextState);
  const restoredRate = Math.min(
    nextCap,
    Number(current.superDown.preRate ?? DEFAULT_DESTRUCTION_RATE_PERCENT) + gainedDuringSuperDown
  );
  setEnemyDestructionRatePercent(turnState, targetIndex, restoredRate);
  if (nextState.strongBreakActive) {
    setEnemyDestructionRateCapPercent(turnState, targetIndex, nextCap);
  } else {
    deleteEnemyDestructionRateCapPercent(turnState, targetIndex);
  }
  if (nextState.strongBreakActive) {
    setEnemyBreakStateByTarget(turnState, targetIndex, nextState);
  } else {
    setEnemyBreakStateByTarget(turnState, targetIndex, null);
  }
  removeEnemyStatuses(turnState, targetIndex, ENEMY_STATUS_SUPER_DOWN);
  return {
    targetIndex,
    statusType: ENEMY_STATUS_SUPER_DOWN,
    destructionRateAfter: restoredRate,
    destructionRateCap: nextState.strongBreakActive ? nextCap : getEnemyDestructionRateCapPercent(turnState, targetIndex),
  };
}

function countAliveBrokenEnemiesWithMinDestructionRate(turnState, minRatePercent) {
  const enemyState = getEnemyState(turnState);
  const deadTargets = getDeadEnemyTargetIndexes(turnState);
  const brokenTargets = new Set(
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_BREAK)
      .map((status) => Number(status?.targetIndex ?? -1))
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < enemyState.enemyCount && !deadTargets.has(idx))
  );
  let count = 0;
  for (const idx of brokenTargets) {
    if (getEnemyDestructionRatePercent(turnState, idx) >= Number(minRatePercent)) {
      count += 1;
    }
  }
  return count;
}

function isEnemyStatusPersistent(status) {
  const statusType = String(status?.statusType ?? '');
  return (
    statusType === ENEMY_STATUS_BREAK ||
    statusType === ENEMY_STATUS_STRONG_BREAK ||
    statusType === ENEMY_STATUS_SUPER_DOWN ||
    statusType === ENEMY_STATUS_DEAD
  );
}

function isEnemyStatusActive(status) {
  if (isEnemyStatusPersistent(status)) {
    return true;
  }
  return Number(status?.remainingTurns ?? 0) > 0;
}

function getActiveEnemyStatuses(turnState, statusType) {
  const key = String(statusType ?? '');
  return getEnemyState(turnState).statuses.filter(
    (status) => String(status?.statusType ?? '') === key && isEnemyStatusActive(status)
  );
}

function countEnemiesWithStatus(turnState, statusType) {
  const enemyState = getEnemyState(turnState);
  const targets = new Set();
  for (const status of getActiveEnemyStatuses(turnState, statusType)) {
    const idx = Number(status?.targetIndex ?? -1);
    if (!Number.isFinite(idx) || idx < 0 || idx >= enemyState.enemyCount) {
      continue;
    }
    targets.add(idx);
  }
  return targets.size;
}

function getDeadEnemyTargetIndexes(turnState) {
  const enemyState = getEnemyState(turnState);
  const targets = new Set();
  for (const status of getActiveEnemyStatuses(turnState, ENEMY_STATUS_DEAD)) {
    const idx = Number(status?.targetIndex ?? -1);
    if (!Number.isFinite(idx) || idx < 0 || idx >= enemyState.enemyCount) {
      continue;
    }
    targets.add(idx);
  }
  return targets;
}

function isEnemyDead(turnState, targetIndex) {
  return getDeadEnemyTargetIndexes(turnState).has(Number(targetIndex));
}

function isEnemyAlive(turnState, targetIndex) {
  const idx = Number(targetIndex);
  if (!Number.isFinite(idx) || idx < 0 || idx >= getEnemyState(turnState).enemyCount) {
    return false;
  }
  return !isEnemyDead(turnState, idx);
}

function countAliveEnemies(turnState) {
  const enemyState = getEnemyState(turnState);
  const deadTargets = getDeadEnemyTargetIndexes(turnState);
  let count = 0;
  for (let i = 0; i < enemyState.enemyCount; i += 1) {
    if (!deadTargets.has(i)) {
      count += 1;
    }
  }
  return count;
}

function countDeadEnemies(turnState) {
  return getDeadEnemyTargetIndexes(turnState).size;
}

function countAliveEnemiesWithStatus(turnState, statusType) {
  const enemyState = getEnemyState(turnState);
  const deadTargets = getDeadEnemyTargetIndexes(turnState);
  const targets = new Set();
  for (const status of getActiveEnemyStatuses(turnState, statusType)) {
    const idx = Number(status?.targetIndex ?? -1);
    if (!Number.isFinite(idx) || idx < 0 || idx >= enemyState.enemyCount || deadTargets.has(idx)) {
      continue;
    }
    targets.add(idx);
  }
  return targets.size;
}

function getActionTargetEnemyIndexes(state, actionEntry, skill) {
  const targetType = String(skill?.targetType ?? actionEntry?.skillTargetType ?? '');
  const enemyCount = clampEnemyCount(
    state?.turnState?.enemyState?.enemyCount ?? actionEntry?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  if (targetType === 'All') {
    const targets = [];
    for (let i = 0; i < enemyCount; i += 1) {
      if (isEnemyAlive(state?.turnState, i)) {
        targets.push(i);
      }
    }
    return targets;
  }
  const targetEnemyIndex = Number.isFinite(Number(actionEntry?.targetEnemyIndex))
    ? Number(actionEntry.targetEnemyIndex)
    : 0;
  return isEnemyAlive(state?.turnState, targetEnemyIndex) ? [targetEnemyIndex] : [];
}

function getTokenSetAmount(part) {
  const amount = Number(part?.power?.[0] ?? part?.value?.[0] ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function resolveTokenAttackContext(skill, state, actor, tokenCountOverride = null) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  const tokenAttackPart = effectiveParts.find((part) => String(part?.skill_type ?? '') === 'TokenAttack');
  if (!tokenAttackPart) {
    return null;
  }
  const tokenCount = Number.isFinite(Number(tokenCountOverride))
    ? Number(tokenCountOverride)
    : Number(actor?.tokenState?.current ?? 0);
  const ratePerToken = Number(tokenAttackPart?.value?.[0] ?? 0);
  return {
    tokenCount,
    ratePerToken: Number.isFinite(ratePerToken) ? ratePerToken : 0,
    totalRate:
      Number.isFinite(ratePerToken) && Number.isFinite(tokenCount) ? ratePerToken * tokenCount : 0,
    targetType: String(tokenAttackPart?.target_type ?? ''),
  };
}

function clampAttackByOwnDpRateReference(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DP_RATE_REFERENCE_MIN;
  }
  return Math.max(DP_RATE_REFERENCE_MIN, Math.min(DP_RATE_REFERENCE_MAX, numeric));
}

function resolveAttackByOwnDpRateContext(skill, state, actor, dpStateOverride = null) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  const attackByOwnDpRatePart = effectiveParts.find(
    (part) => String(part?.skill_type ?? '') === 'AttackByOwnDpRate'
  );
  if (!attackByOwnDpRatePart) {
    return null;
  }
  const dpState = cloneDpState(dpStateOverride ?? actor?.dpState ?? {});
  const startDpRate = getDpRate(dpState);
  const referenceDpRate = clampAttackByOwnDpRateReference(startDpRate);
  const lowDpMultiplier = Number(attackByOwnDpRatePart?.value?.[0] ?? 0);
  const highDpMultiplier = Number(attackByOwnDpRatePart?.value?.[1] ?? 0);
  const normalizedLowDpMultiplier = Number.isFinite(lowDpMultiplier) ? lowDpMultiplier : 0;
  const normalizedHighDpMultiplier = Number.isFinite(highDpMultiplier)
    ? highDpMultiplier
    : normalizedLowDpMultiplier;
  return {
    startDpRate,
    referenceDpRate,
    lowDpMultiplier: normalizedLowDpMultiplier,
    highDpMultiplier: normalizedHighDpMultiplier,
    resolvedMultiplier:
      normalizedLowDpMultiplier +
      (normalizedHighDpMultiplier - normalizedLowDpMultiplier) * referenceDpRate,
    targetType: String(attackByOwnDpRatePart?.target_type ?? ''),
  };
}

function skillHasDamageParts(skill, state, actor) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  return effectiveParts.some((part) => OD_DAMAGE_PART_TYPES.has(String(part?.skill_type ?? '').trim()));
}

function getDpEventKind(skillType) {
  const normalized = String(skillType ?? '').trim();
  if (DIRECT_DP_HEAL_SKILL_TYPES.has(normalized)) {
    return DP_EVENT_KINDS.DIRECT_HEAL;
  }
  if (normalized === 'RegenerationDp') {
    return DP_EVENT_KINDS.REGENERATION_GRANT;
  }
  if (normalized === 'HealDpByDamage') {
    return DP_EVENT_KINDS.DAMAGE_BASED_HEAL;
  }
  if (DP_SELF_DAMAGE_SKILL_TYPES.has(normalized)) {
    return DP_EVENT_KINDS.SELF_DAMAGE;
  }
  return normalized;
}

function getDpHealCapForPart(target, part) {
  const baseMaxDp = Number(target?.dpState?.baseMaxDp ?? 0);
  const currentCap = Number(target?.dpState?.effectiveDpCap ?? baseMaxDp);
  const capMultiplier = Number(part?.value?.[0] ?? 0);
  if (!Number.isFinite(capMultiplier) || capMultiplier <= 0 || baseMaxDp <= 0) {
    return currentCap;
  }
  return Math.max(currentCap, baseMaxDp * capMultiplier);
}

function getDpSelfDamageAmount(target, part) {
  const baseMaxDp = Number(target?.dpState?.baseMaxDp ?? 0);
  const rate = Number(part?.power?.[0] ?? 0);
  if (!Number.isFinite(baseMaxDp) || baseMaxDp <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  return baseMaxDp * rate;
}

function resolveAutoDpConsumptionCurrentDp(startDpState, amount) {
  const startCurrentDp = Number(startDpState?.currentDp ?? 0);
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(startCurrentDp) || startCurrentDp <= 0) {
    return startCurrentDp;
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return startCurrentDp;
  }
  return Math.max(AUTO_DP_CONSUMPTION_FLOOR, startCurrentDp - numericAmount);
}

function createDpEvent({
  actor,
  target,
  skill,
  part,
  triggerType,
  source,
  startDpState,
  endDpState,
  statusEffect = null,
  isAmountResolved = false,
}) {
  const startState = cloneDpState(startDpState ?? target?.dpState ?? {});
  const endState = cloneDpState(endDpState ?? target?.dpState ?? {});
  return {
    actorCharacterId: actor?.characterId ?? null,
    characterId: target.characterId,
    source,
    skillId: Number(skill?.skillId ?? 0),
    skillName: String(skill?.name ?? ''),
    skillType: String(part?.skill_type ?? ''),
    triggerType: String(triggerType ?? ''),
    delta: Number(endState.currentDp ?? 0) - Number(startState.currentDp ?? 0),
    startDpState: startState,
    endDpState: endState,
    startDpRate: getDpRate(startState),
    endDpRate: getDpRate(endState),
    eventCeiling: Number(endState.effectiveDpCap ?? endState.baseMaxDp ?? 0),
    isAmountResolved: Boolean(isAmountResolved),
    targetType: String(part?.target_type ?? ''),
    targetCondition: String(part?.target_condition ?? ''),
    ...(statusEffect
      ? {
          effectId: Number(statusEffect.effectId ?? 0),
          limitType: String(statusEffect.limitType ?? ''),
          exitCond: String(statusEffect.exitCond ?? ''),
          remaining: Number(statusEffect.remaining ?? 0),
        }
      : {}),
  };
}

function createPassiveDpEvent({
  actor,
  target,
  passive,
  part,
  triggerType,
  source,
  startDpState,
  endDpState,
  isAmountResolved = false,
}) {
  const startState = cloneDpState(startDpState ?? target?.dpState ?? {});
  const endState = cloneDpState(endDpState ?? target?.dpState ?? {});
  return {
    actorCharacterId: actor?.characterId ?? null,
    characterId: target.characterId,
    source,
    passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
    passiveName: String(passive?.name ?? ''),
    skillType: String(part?.skill_type ?? ''),
    triggerType: String(triggerType ?? ''),
    delta: Number(endState.currentDp ?? 0) - Number(startState.currentDp ?? 0),
    startDpState: startState,
    endDpState: endState,
    startDpRate: getDpRate(startState),
    endDpRate: getDpRate(endState),
    eventCeiling: Number(endState.effectiveDpCap ?? endState.baseMaxDp ?? 0),
    isAmountResolved: Boolean(isAmountResolved),
    targetType: String(part?.target_type ?? ''),
    targetCondition: String(part?.target_condition ?? ''),
  };
}

function mapDpEventToRecordChange(event) {
  return {
    source: event.source,
    triggerType: event.triggerType,
    skillType: event.skillType,
    targetCharacterId: event.characterId,
    delta: event.delta,
    preDp: Number(event.startDpState?.currentDp ?? 0),
    postDp: Number(event.endDpState?.currentDp ?? 0),
    preDpCap: Number(event.startDpState?.effectiveDpCap ?? event.startDpState?.baseMaxDp ?? 0),
    postDpCap: Number(event.endDpState?.effectiveDpCap ?? event.endDpState?.baseMaxDp ?? 0),
    isAmountResolved: Boolean(event.isAmountResolved),
    ...(Number.isFinite(Number(event.effectId)) ? { effectId: Number(event.effectId) } : {}),
    ...(Number.isFinite(Number(event.remaining)) ? { remaining: Number(event.remaining) } : {}),
    ...(String(event.exitCond ?? '') ? { exitCond: String(event.exitCond) } : {}),
  };
}

function applyDpEffectsFromActions(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (!DP_STATE_CHANGE_SKILL_TYPES.has(skillType)) {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }

        const startDpState = cloneDpState(target.dpState ?? {});
        let endDpState = cloneDpState(startDpState);
        let statusEffect = null;
        let isAmountResolved = false;

        if (skillType === 'HealDpRate') {
          const rate = Number(part?.power?.[0] ?? 0);
          const amount = Number.isFinite(rate) && rate > 0 ? Number(startDpState.baseMaxDp ?? 0) * rate : 0;
          const change = target.setDpState({
            currentDp: Number(startDpState.currentDp ?? 0) + amount,
            effectiveDpCap: getDpHealCapForPart(target, part),
          });
          endDpState = cloneDpState(change.endDpState);
          isAmountResolved = true;
        } else if (skillType === 'SelfDamage') {
          const amount = getDpSelfDamageAmount(target, part);
          const change = target.setDpState({
            currentDp: resolveAutoDpConsumptionCurrentDp(startDpState, amount),
          });
          endDpState = cloneDpState(change.endDpState);
          isAmountResolved = true;
        } else if (skillType === 'ReviveDp') {
          const change = target.setDpState({
            currentDp: Math.max(Number(startDpState.currentDp ?? 0), DEFAULT_REVIVE_DP_FLOOR),
            effectiveDpCap: getDpHealCapForPart(target, part),
          });
          endDpState = cloneDpState(change.endDpState);
          isAmountResolved = true;
        } else if (skillType === 'RegenerationDp') {
          const remaining = Number(part?.effect?.exitVal?.[0] ?? DEFAULT_STATUS_EFFECT_REMAINING);
          statusEffect = target.addStatusEffect({
            statusType: 'RegenerationDp',
            limitType: String(part?.effect?.limitType ?? 'Default'),
            exitCond: String(part?.effect?.exitCond ?? 'EnemyTurnEnd'),
            remaining:
              Number.isFinite(remaining) && remaining > 0 ? remaining : DEFAULT_STATUS_EFFECT_REMAINING,
            power: Number(part?.power?.[0] ?? 0),
            sourceSkillId: Number(skill.skillId),
            sourceSkillLabel: String(skill.label ?? ''),
            sourceSkillName: String(skill.name ?? ''),
            metadata: {
              capMultiplier: Number(part?.value?.[0] ?? 0),
              targetType: String(part?.target_type ?? ''),
            },
          });
        }

        events.push(
          createDpEvent({
            actor,
            target,
            skill,
            part,
            triggerType: getDpEventKind(skillType),
            source: DP_EVENT_SOURCE_SKILL,
            startDpState,
            endDpState,
            statusEffect,
            isAmountResolved,
          })
        );
      }
    }
  }

  return events;
}

function applyEnemyTurnEndDpEffects(party = []) {
  const events = [];

  for (const member of party) {
    const regenEffects = member
      .resolveEffectiveStatusEffects('RegenerationDp')
      .filter((effect) => String(effect?.exitCond ?? '') === 'EnemyTurnEnd');
    const regenEffectById = new Map(
      regenEffects.map((effect) => [Number(effect.effectId ?? 0), structuredClone(effect)])
    );
    const tickedEffects = member.tickStatusEffectsByExitCond('EnemyTurnEnd');
    if (regenEffectById.size === 0) {
      continue;
    }
    for (const ticked of tickedEffects) {
      const effect = regenEffectById.get(Number(ticked.effectId ?? 0));
      if (!effect) {
        continue;
      }
      const startDpState = cloneDpState(member.dpState ?? {});
      const endDpState = cloneDpState(member.dpState ?? {});
      events.push({
        actorCharacterId: null,
        characterId: member.characterId,
        source: DP_EVENT_SOURCE_REGENERATION,
        skillId: Number(effect.sourceSkillId ?? 0),
        skillName: String(effect.sourceSkillName ?? ''),
        skillType: 'RegenerationDp',
        triggerType: DP_EVENT_KINDS.REGENERATION_TICK,
        delta: 0,
        startDpState,
        endDpState,
        startDpRate: getDpRate(startDpState),
        endDpRate: getDpRate(endDpState),
        eventCeiling: Number(endDpState.effectiveDpCap ?? endDpState.baseMaxDp ?? 0),
        isAmountResolved: false,
        effectId: Number(effect.effectId ?? 0),
        limitType: String(effect.limitType ?? ''),
        exitCond: String(effect.exitCond ?? ''),
        remainingBefore: Number(ticked.remainingBefore ?? effect.remaining ?? 0),
        remainingAfter: Number(ticked.remainingAfter ?? 0),
      });
    }
  }

  return events;
}

function applyTokenEffectsFromActions(state, previewRecord, dpEvents = []) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '') !== 'TokenSet') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const amount = getTokenSetAmount(part);
      if (!amount) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const change = target.applyTokenDelta(amount);
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          source: 'token_skill',
          skillId: skill.skillId,
          skillName: skill.name,
          triggerType: 'TokenSet',
          ...change,
        });
      }
    }

    if (skillHasDamageParts(skill, state, actor)) {
      const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, skill);
      const hitEnemyCount = targetEnemyIndexes.length;
      if (hitEnemyCount > 0) {
        for (const passive of actor.passives ?? []) {
          for (const part of passive.parts ?? []) {
            if (String(part?.skill_type ?? '') !== 'TokenSetByAttacking') {
              continue;
            }
            const conditions = [passive?.condition, part?.cond, part?.hit_condition]
              .map((value) => String(value ?? '').trim())
              .filter(Boolean);
            const conditionSkill = createConditionSkillContext(skill, part);
            const matched = conditions.every((expr) =>
              evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
            );
            if (!matched) {
              continue;
            }
            const amountPerEnemy = getTokenSetAmount(part) || 1;
            const change = actor.applyTokenDelta(amountPerEnemy * hitEnemyCount);
            events.push({
              actorCharacterId: actor.characterId,
              characterId: actor.characterId,
              source: 'token_passive',
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              triggerType: 'TokenSetByAttacking',
              hitEnemyCount,
              ...change,
            });
          }
        }
      }
    }

    const directDpEvents = dpEvents.filter(
      (event) =>
        event?.actorCharacterId === actor.characterId &&
        Number(event?.skillId ?? 0) === Number(skill.skillId) &&
        String(event?.triggerType ?? '') === DP_EVENT_KINDS.DIRECT_HEAL
    );
    for (const dpEvent of directDpEvents) {
      const target = findMemberByCharacterId(state, dpEvent.characterId);
      if (!target) {
        continue;
      }
      for (const passive of target.passives ?? []) {
        for (const passivePart of passive.parts ?? []) {
          if (String(passivePart?.skill_type ?? '') !== 'TokenSetByHealedDp') {
            continue;
          }
          const conditions = [passive?.condition, passivePart?.cond, passivePart?.hit_condition]
            .map((value) => String(value ?? '').trim())
            .filter(Boolean);
          const conditionSkill = createConditionSkillContext(skill, passivePart);
          const matched = conditions.every((expr) =>
            evaluateConditionExpression(expr, state, target, conditionSkill, actionEntry).result
          );
          if (!matched) {
            continue;
          }
          const amount = getTokenSetAmount(passivePart) || 1;
          const change = target.applyTokenDelta(amount);
          events.push({
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'token_passive',
            passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
            passiveName: String(passive?.name ?? ''),
            triggerType: 'TokenSetByHealedDp',
            skillId: skill.skillId,
            skillName: skill.name,
            ...change,
          });
        }
      }
    }
  }

  return events;
}

function getMoraleAmount(part) {
  const value = Number(part?.power?.[0] ?? part?.value?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getMotivationTargetLevel(part) {
  const candidates = [part?.value?.[0], part?.power?.[0]];
  for (const raw of candidates) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function initializeIntrinsicMarkStatesFromParty(party = []) {
  const elementCounts = Object.fromEntries(INTRINSIC_MARK_ELEMENTS.map((element) => [element, 0]));
  for (const member of party) {
    for (const element of member?.elements ?? []) {
      const key = String(element ?? '').trim();
      if (Object.prototype.hasOwnProperty.call(elementCounts, key)) {
        elementCounts[key] += 1;
      }
    }
  }

  for (const member of party) {
    const memberElements = new Set((member?.elements ?? []).map((element) => String(element ?? '').trim()));
    for (const element of INTRINSIC_MARK_ELEMENTS) {
      const markState = member?.markStates?.[element];
      if (!markState || !memberElements.has(element)) {
        continue;
      }
      if (Number(markState.current ?? 0) > 0) {
        continue;
      }
      markState.current = Number(elementCounts[element] ?? 0);
    }
  }
}

function resolveIntrinsicMarkModifiersForMember(member) {
  if (!member) {
    return {
      attackUpRate: 0,
      damageTakenDownRate: 0,
      devastationRateUp: 0,
      criticalRateUp: 0,
      criticalDamageUp: 0,
      matchedElements: [],
    };
  }

  let attackUpRate = 0;
  let damageTakenDownRate = 0;
  let devastationRateUp = 0;
  let criticalRateUp = 0;
  let criticalDamageUp = 0;
  const matchedElements = [];

  for (const element of member.elements ?? []) {
    const config = INTRINSIC_MARK_EFFECTS_BY_ELEMENT[String(element ?? '').trim()];
    if (!config) {
      continue;
    }
    const level = Number(member.markStates?.[element]?.current ?? 0);
    if (level <= 0) {
      continue;
    }
    matchedElements.push({ element, level });
    if (level >= 1) {
      attackUpRate += Number(config.skillDamageUpRateAtLevel1 ?? 0);
    }
    if (level >= 2) {
      damageTakenDownRate += Number(config.damageTakenDownRateAtLevel2 ?? 0);
    }
    if (level >= 3) {
      devastationRateUp += Number(config.devastationRateUpAtLevel3 ?? 0);
    }
    if (level >= 4) {
      criticalRateUp += Number(config.criticalRateUpAtLevel4 ?? 0);
    }
    if (level >= 5) {
      criticalDamageUp += Number(config.criticalDamageUpAtLevel5 ?? 0);
    }
  }

  return {
    attackUpRate,
    damageTakenDownRate,
    devastationRateUp,
    criticalRateUp,
    criticalDamageUp,
    matchedElements,
  };
}

function applyIntrinsicMarkTurnStartRecovery(party) {
  const recoveryEvents = [];

  for (const member of party ?? []) {
    if (!member?.isFront()) {
      continue;
    }
    for (const { element, level } of resolveIntrinsicMarkModifiersForMember(member).matchedElements) {
      const config = INTRINSIC_MARK_EFFECTS_BY_ELEMENT[String(element ?? '').trim()];
      const amount = Number(config?.extraFrontSpAtTurnStartAtLevel6 ?? 0);
      if (level < 6 || !Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const change = member.applySpDelta(amount, 'passive');
      recoveryEvents.push({
        characterId: member.characterId,
        source: 'intrinsic_mark',
        triggerType: `${element}Mark`,
        ...change,
      });
    }
  }

  return recoveryEvents;
}

function applyMarkEffectsFromActions() {
  return [];
}

function applyMoralePassiveTriggerEffects(state, actor, skill, actionEntry) {
  const events = [];

  for (const passive of actor.passives ?? []) {
    const timing = String(passive?.timing ?? '').trim();
    if (timing !== 'OnFirstBattleStart' && timing !== 'OnBattleStart') {
      continue;
    }

    const parts = Array.isArray(passive?.parts) ? passive.parts : [];
    let triggerMultiplier = 0;
    const triggerMatched = parts.some((part) => {
      const skillType = String(part?.skill_type ?? '').trim();
      const conditions = [passive?.condition, part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const conditionSkill = createConditionSkillContext(skill, part);
      const matchedConditions = conditions.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!matchedConditions) {
        return false;
      }
      if (skillType === 'AdditionalHitOnSpecifiedSkill') {
        const targetSkill = part?.strval?.find?.((item) => item && typeof item === 'object') ?? null;
        const targetSkillId = Number(targetSkill?.id ?? NaN);
        const targetSkillLabel = String(targetSkill?.label ?? '').trim();
        return (
          (Number.isFinite(targetSkillId) && Number(skill?.skillId ?? 0) === targetSkillId) ||
          (targetSkillLabel && String(skill?.label ?? '') === targetSkillLabel)
        );
      }
      if (skillType === 'AdditionalHitOnExtraSkill') {
        triggerMultiplier = 1;
        return Boolean(skill?.isRestricted);
      }
      if (skillType === 'AdditionalHitOnKillCount') {
        const killCount = Math.max(0, Number(actionEntry?.killCount ?? 0));
        if (killCount > 0) {
          triggerMultiplier = killCount;
          return true;
        }
        return false;
      }
      return false;
    });

    if (!triggerMatched) {
      continue;
    }

    for (const part of parts) {
      if (String(part?.skill_type ?? '').trim() !== 'Morale') {
        continue;
      }
      const amount = getMoraleAmount(part) * Math.max(1, triggerMultiplier || 1);
      if (!amount) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const change = target.applyMoraleDelta(amount);
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          source: 'morale_passive',
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          triggerType: 'MoralePassiveTrigger',
          skillId: skill.skillId,
          skillName: skill.name,
          ...change,
        });
      }
    }
  }

  return events;
}

function applyMoraleEffectsFromActions(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '').trim() !== 'Morale') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const amount = getMoraleAmount(part);
      if (!amount) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      if (targetCharacterIds.length === 0) {
        continue;
      }
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const change = target.applyMoraleDelta(amount);
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          source: 'morale_skill',
          skillId: skill.skillId,
          skillName: skill.name,
          triggerType: 'Morale',
          ...change,
        });
      }
    }

    events.push(...applyMoralePassiveTriggerEffects(state, actor, skill, actionEntry));
  }

  return events;
}

function applyMotivationEffectsFromActions(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '').trim() !== 'Motivation') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const targetLevel = getMotivationTargetLevel(part);
      if (!targetLevel) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      if (targetCharacterIds.length === 0) {
        continue;
      }
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const change = target.setMotivationLevel(targetLevel);
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          source: 'motivation_skill',
          skillId: skill.skillId,
          skillName: skill.name,
          triggerType: 'Motivation',
          ...change,
        });
      }
    }
  }

  return events;
}

export function applyEnemyAttackTokenTriggers(state, targetCharacterIds = []) {
  const events = [];
  const ids = normalizeEnemyAttackTargetCharacterIds(targetCharacterIds);

  for (const characterId of ids) {
    const target = findMemberByCharacterId(state, characterId);
    if (!target) {
      continue;
    }
    for (const passive of target.passives ?? []) {
      for (const part of passive.parts ?? []) {
        if (String(part?.skill_type ?? '') !== 'TokenSetByAttacked') {
          continue;
        }
        const conditions = [passive?.condition, part?.cond, part?.hit_condition]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean);
        const matched = conditions.every((expr) =>
          evaluateConditionExpression(expr, state, target, null, null).result
        );
        if (!matched) {
          continue;
        }
        const amount = getTokenSetAmount(part) || 1;
        const change = target.applyTokenDelta(amount);
        events.push({
          actorCharacterId: target.characterId,
          characterId: target.characterId,
          source: 'token_passive',
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          triggerType: 'TokenSetByAttacked',
          ...change,
        });
      }
    }
  }

  return events;
}

function normalizeEnemyAttackTargetCharacterIds(targetCharacterIds = []) {
  return [...new Set(
    (Array.isArray(targetCharacterIds) ? targetCharacterIds : [targetCharacterIds])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean)
  )];
}

export function applyEnemyAttackMotivationTriggers(state, targetCharacterIds = []) {
  const events = [];
  const ids = normalizeEnemyAttackTargetCharacterIds(targetCharacterIds);

  for (const characterId of ids) {
    const target = findMemberByCharacterId(state, characterId);
    if (!target) {
      continue;
    }
    const currentMotivation = Number(target.motivationState?.current ?? 0);
    if (!Number.isFinite(currentMotivation) || currentMotivation <= 0) {
      continue;
    }
    const change = target.setMotivationLevel(Math.max(1, currentMotivation + MOTIVATION_DAMAGE_TAKEN_DELTA));
    if (Number(change?.delta ?? 0) === 0) {
      continue;
    }
    events.push({
      actorCharacterId: target.characterId,
      characterId: target.characterId,
      source: 'motivation_status',
      passiveId: 0,
      passiveName: MOTIVATION_DAMAGE_TAKEN_PASSIVE_NAME,
      passiveDesc: MOTIVATION_DAMAGE_TAKEN_PASSIVE_DESC,
      triggerType: MOTIVATION_DAMAGE_TAKEN_TRIGGER_TYPE,
      ...change,
    });
  }

  return events;
}

function createEnemyAttackPassiveEvents(turnState, state, enemyAttackEvents = []) {
  return (Array.isArray(enemyAttackEvents) ? enemyAttackEvents : [])
    .filter((event) => event && typeof event === 'object')
    .map((event) => {
      const member = findMemberByCharacterId(state, event.characterId);
      const passiveName = String(event.passiveName ?? event.triggerType ?? '');
      return {
        turnLabel: String(turnState?.turnLabel ?? ''),
        timing: 'EnemyAttack',
        source: 'enemy_attack',
        actorCharacterId: String(event.actorCharacterId ?? event.characterId ?? ''),
        characterId: String(event.characterId ?? ''),
        characterName: String(member?.characterName ?? event.characterId ?? ''),
        passiveId: Number(event.passiveId ?? 0),
        passiveName,
        passiveDesc: String(event.passiveDesc ?? '').trim() || `${passiveName} (Enemy Attack)`,
        triggerType: String(event.triggerType ?? ''),
        effectTypes: [String(event.triggerType ?? '')].filter(Boolean),
        unsupportedEffectTypes: [],
        ...(String(event.triggerType ?? '') === 'TokenSetByAttacked'
          ? { tokenDelta: Number(event.delta ?? 0) }
          : {}),
        ...(String(event.triggerType ?? '') === MOTIVATION_DAMAGE_TAKEN_TRIGGER_TYPE
          ? { motivationDelta: Number(event.delta ?? 0) }
          : {}),
      };
    });
}

function tickEnemyStatuses(turnState) {
  const enemyState = getEnemyState(turnState);
  const downTurnTargetsBefore = new Set(
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_DOWN_TURN).map((status) => Number(status?.targetIndex ?? -1))
  );
  const nextStatuses = enemyState.statuses
    .map((status) => {
      if (isEnemyStatusPersistent(status)) {
        return {
          statusType: String(status?.statusType ?? ''),
          targetIndex: Number(status?.targetIndex ?? 0),
          remainingTurns: Number(status?.remainingTurns ?? 0),
        };
      }
      const remainingTurns = Number(status?.remainingTurns ?? 0);
      if (!Number.isFinite(remainingTurns) || remainingTurns <= 0) {
        return null;
      }
      const nextTurns = remainingTurns - 1;
      if (nextTurns <= 0) {
        return null;
      }
      return {
        statusType: String(status?.statusType ?? ''),
        targetIndex: Number(status?.targetIndex ?? 0),
        remainingTurns: nextTurns,
      };
    })
    .filter(Boolean);
  turnState.enemyState = {
    enemyCount: enemyState.enemyCount,
    statuses: nextStatuses,
    damageRatesByEnemy: enemyState.damageRatesByEnemy,
    destructionRateByEnemy: enemyState.destructionRateByEnemy,
    destructionRateCapByEnemy: enemyState.destructionRateCapByEnemy,
    breakStateByEnemy: enemyState.breakStateByEnemy,
    enemyNamesByEnemy: enemyState.enemyNamesByEnemy,
    zoneConfigByEnemy: enemyState.zoneConfigByEnemy,
  };
  const downTurnTargetsAfter = new Set(
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_DOWN_TURN).map((status) => Number(status?.targetIndex ?? -1))
  );
  for (const targetIndex of downTurnTargetsBefore) {
    if (!Number.isFinite(targetIndex) || downTurnTargetsAfter.has(targetIndex)) {
      continue;
    }
    removeEnemySuperDownState(turnState, targetIndex);
  }
  turnState.zoneState = tickFieldState(turnState.zoneState);
  turnState.territoryState = tickFieldState(turnState.territoryState);
}

function evaluateCountBCPredicate(innerExpression, state, member) {
  const inner = String(innerExpression ?? '').replace(/\s+/g, '');
  if (!inner) {
    return { known: false, value: true };
  }

  const clauses = inner.split('&&').filter(Boolean);

  if (inner === 'IsPlayer()') {
    return { known: true, value: state.party.length };
  }

  if (inner === 'IsFront()==0&&IsPlayer()') {
    const backlineCount = state.party.filter((item) => item.position >= 3).length;
    return { known: true, value: backlineCount };
  }

  if (inner === EXTRA_ACTIVE_COUNT_BC_GT_ZERO) {
    const count = state.party.filter((item) => item.isExtraActive).length;
    return { known: true, value: count };
  }

  if (inner === EXTRA_ACTIVE_COUNT_BC_GE_ONE) {
    const count = state.party.filter((item) => item.isExtraActive).length;
    return { known: true, value: count };
  }

  if (inner === EXTRA_ACTIVE_COUNT_BC_EQ_ZERO) {
    const count = state.party.filter((item) => item.isExtraActive).length;
    return { known: true, value: count === 0 ? 1 : 0 };
  }

  if (inner === 'PlayedSkillCount(FMikotoSkill04)>0') {
    const lhs = Number(member?.getSkillUseCountByLabel('FMikotoSkill04') ?? 0);
    return { known: true, value: lhs > 0 ? 1 : 0 };
  }

  if (inner.includes('IsPlayer()') && !inner.includes('IsPlayer()==0')) {
    const clauses = inner.split('&&').map((clause) => clause.trim()).filter(Boolean);
    const playerClauses = clauses.filter((clause) => clause !== 'IsPlayer()' && clause !== 'IsPlayer()==1');
    let count = 0;
    for (const candidate of state.party ?? []) {
      const matched = playerClauses.every((clause) => {
        const evaluated = evaluateSingleConditionClause(clause, state, candidate, null, null);
        return evaluated.known && Boolean(evaluated.value);
      });
      if (matched) {
        count += 1;
      }
    }
    return { known: true, value: count };
  }

  if (!clauses.includes('IsPlayer()==0') && !clauses.includes('IsPlayer()') && !clauses.includes('IsPlayer()==1')) {
    let count = 0;
    for (const candidate of state.party ?? []) {
      const matched = clauses.every((clause) => {
        const evaluated = evaluateSingleConditionClause(clause, state, candidate, null, null);
        return evaluated.known && Boolean(evaluated.value);
      });
      if (matched) {
        count += 1;
      }
    }
    return { known: true, value: count };
  }

  const hasAllBrokenEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('IsBroken()==1');
  if (hasAllBrokenEnemyClauses) {
    const count = countAliveEnemiesWithStatus(state?.turnState, ENEMY_STATUS_BREAK);
    return { known: true, value: count };
  }

  const hasBrokenAndHighDamageEnemyClauses =
    clauses.length === 4 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('IsBroken()==1') &&
    clauses.some((clause) => clause.startsWith('DamageRate()'));
  if (hasBrokenAndHighDamageEnemyClauses) {
    const damageRateClause = clauses.find((clause) => clause.startsWith('DamageRate()')) ?? '';
    const match = damageRateClause.match(DAMAGE_RATE_CONDITION_RE);
    if (!match || match[1] !== '>=') {
      return { known: false, value: true };
    }
    return {
      known: true,
      value: countAliveBrokenEnemiesWithMinDestructionRate(state?.turnState, Number(match[2])),
    };
  }

  const hasAllDownTurnEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('BreakDownTurn()>0');
  if (hasAllDownTurnEnemyClauses) {
    const count = countAliveEnemiesWithStatus(state?.turnState, ENEMY_STATUS_DOWN_TURN);
    return { known: true, value: count };
  }

  const hasAllDeadEnemyClauses =
    clauses.length === 2 && clauses.includes('IsPlayer()==0') && clauses.includes('IsDead()==1');
  if (hasAllDeadEnemyClauses) {
    return { known: true, value: countDeadEnemies(state?.turnState) };
  }

  const weakElementClause = clauses.find((clause) => IS_WEAK_ELEMENT_PREDICATE_RE.test(clause));
  const hasAllWeakElementEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    Boolean(weakElementClause);
  if (hasAllWeakElementEnemyClauses) {
    const match = weakElementClause.match(IS_WEAK_ELEMENT_CLAUSE_RE);
    const element = String(match?.[1] ?? '').trim();
    return {
      known: true,
      value: countEnemiesWeakToElement(state?.turnState, element),
    };
  }

  return { known: false, value: true };
}

function evaluateSingleConditionClause(clause, state, member, skill, actionEntry) {
  const text = String(clause ?? '').trim();
  if (!text) {
    return { known: true, value: true };
  }

  const defaultRef = String(skill?.label ?? '');
  const breakHitCount = Number(actionEntry?.breakHitCount ?? 0);

  {
    const m = text.match(PLAYED_SKILL_COUNT_CONDITION_RE);
    if (m) {
      const refRaw = String(m[1] ?? '').trim();
      const ref = refRaw || defaultRef;
      const op = m[2];
      const rhs = Number(m[3]);
      const lhs = Number(member?.getSkillUseCountByLabel(ref) ?? 0);
      return { known: true, value: compareNumbers(lhs, op, rhs) };
    }
  }

  {
    const m = text.match(SPECIAL_STATUS_COUNT_BY_TYPE_CONDITION_RE);
    if (m) {
      const active = member?.isExtraActive ? 1 : 0;
      return { known: true, value: compareNumbers(active, m[1], Number(m[2])) };
    }
  }

  {
    const m = text.match(COUNT_BC_CONDITION_RE);
    if (m) {
      const evaluated = evaluateCountBCPredicate(m[1], state, member);
      if (!evaluated.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(evaluated.value), m[2], Number(m[3])) };
    }
  }

  {
    const m = text.match(FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      const resolved = resolveConditionFunctionValue(m[1], m[2], state, member, skill, actionEntry);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(resolved.value), m[3], Number(m[4])) };
    }
  }

  {
    const m = text.match(REVERSE_FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      const resolved = resolveConditionFunctionValue(m[3], m[4], state, member, skill, actionEntry);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(m[1]), m[2], Number(resolved.value)) };
    }
  }

  {
    const m = text.match(BARE_FUNCTION_CALL_CONDITION_RE);
    if (m) {
      const resolved = resolveConditionFunctionValue(m[1], m[2], state, member, skill, actionEntry);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: Boolean(Number(resolved.value)) };
    }
  }

  return { known: false, value: true };
}

function evaluateConditionExpression(expression, state, member, skill, actionEntry = null) {
  const text = String(expression ?? '').trim();
  if (!text) {
    return { result: true, knownCount: 0 };
  }

  let knownCount = 0;
  const orClauses = splitTopLevel(text, '||');
  let orResult = false;

  for (const orClause of orClauses) {
    const andClauses = splitTopLevel(orClause, '&&');
    let andResult = true;
    for (const clause of andClauses) {
      const evaluated = evaluateSingleConditionClause(clause, state, member, skill, actionEntry);
      if (evaluated.known) {
        knownCount += 1;
      }
      if (!evaluated.value) {
        andResult = false;
        break;
      }
    }
    if (andResult) {
      orResult = true;
      break;
    }
  }

  return { result: orResult, knownCount };
}

function evaluateSkillConditionExpression(expression, state, member, skill) {
  const evaluation = evaluateConditionExpression(expression, state, member, skill);
  return evaluation.result;
}

function evaluateCountBcValue(expression, state, member) {
  const text = String(expression ?? '').trim();
  const match = text.match(COUNT_BC_CONDITION_RE);
  if (!match) {
    return { known: false, value: 0 };
  }
  const evaluated = evaluateCountBCPredicate(match[1], state, member);
  if (!evaluated.known) {
    return { known: false, value: 0 };
  }
  return { known: true, value: Number(evaluated.value ?? 0) };
}

function inferPassiveVariantThreshold(variant) {
  const texts = [variant?.desc, variant?.info, variant?.name]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  for (const text of texts) {
    const match = text.match(PASSIVE_VARIANT_THRESHOLD_RE);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function resolvePassiveVariantForSkillConditionPart(part, state, member) {
  const variants = Array.isArray(part?.strval)
    ? part.strval.filter((value) => value && typeof value === 'object' && Array.isArray(value.parts))
    : [];
  if (variants.length === 0) {
    return null;
  }

  for (const variant of variants) {
    const variantCond = String(variant?.condition ?? variant?.cond ?? '').trim();
    if (!variantCond) {
      continue;
    }
    if (evaluateConditionExpression(variantCond, state, member, null).result) {
      return variant;
    }
  }

  const countBc = evaluateCountBcValue(part?.cond, state, member);
  if (countBc.known) {
    const thresholded = variants
      .map((variant) => ({
        variant,
        threshold: inferPassiveVariantThreshold(variant),
      }))
      .filter((entry) => Number.isFinite(entry.threshold));
    if (thresholded.length > 0) {
      thresholded.sort((a, b) => Number(b.threshold) - Number(a.threshold));
      const matched = thresholded.find((entry) => Number(countBc.value) >= Number(entry.threshold));
      if (matched) {
        return matched.variant;
      }
    }
  }

  const conditionMatched = evaluateConditionExpression(part?.cond, state, member, null).result;
  if (conditionMatched) {
    return variants[0];
  }
  return variants[1] ?? variants[0];
}

function resolvePassiveEffectiveParts(passive, state, member) {
  const resolved = [];
  const sourceParts = Array.isArray(passive?.parts) ? passive.parts : [];
  for (const part of sourceParts) {
    const skillType = String(part?.skill_type ?? '');
    if (skillType !== 'SkillCondition') {
      resolved.push(part);
      continue;
    }

    const variant = resolvePassiveVariantForSkillConditionPart(part, state, member);
    if (!variant) {
      continue;
    }
    resolved.push(...resolvePassiveEffectiveParts(variant, state, member));
  }
  return resolved;
}

function resolveSkillScalarField(skillLike, candidates, fallback = null) {
  for (const key of candidates) {
    if (skillLike?.[key] !== undefined && skillLike?.[key] !== null) {
      return skillLike[key];
    }
  }
  return fallback;
}

function mergeConditionExpressions(baseExpression, nestedExpression) {
  const base = String(baseExpression ?? '').trim();
  const nested = String(nestedExpression ?? '').trim();
  if (!base) {
    return nested;
  }
  if (!nested) {
    return base;
  }
  return `(${base}) && (${nested})`;
}

function resolveEffectiveSkillVariant(skill, state, member) {
  const recurse = (skillLike) => {
    const fallbackParts = Array.isArray(skillLike?.parts) ? skillLike.parts : [];
    let resolved = {
      spCost: Number(resolveSkillScalarField(skillLike, ['spCost', 'sp_cost'], 0)),
      consumeType: String(resolveSkillScalarField(skillLike, ['consumeType', 'consume_type'], 'Sp')),
      targetType: String(resolveSkillScalarField(skillLike, ['targetType', 'target_type'], '')),
      hitCount: Number(resolveSkillScalarField(skillLike, ['hitCount', 'hit_count'], 0)),
      cond: String(resolveSkillScalarField(skillLike, ['cond'], '')),
      iucCond: String(resolveSkillScalarField(skillLike, ['iucCond', 'iuc_cond'], '')),
      overwriteCond: String(resolveSkillScalarField(skillLike, ['overwriteCond', 'overwrite_cond'], '')),
      isRestricted: Number(resolveSkillScalarField(skillLike, ['isRestricted', 'is_restricted'], 0)) === 1,
      parts: [],
    };

    for (const part of fallbackParts) {
      const skillType = String(part?.skill_type ?? '');
      if (skillType !== 'SkillCondition') {
        resolved.parts.push(part);
        continue;
      }

      const variants = Array.isArray(part?.strval)
        ? part.strval.filter((v) => v && typeof v === 'object' && Array.isArray(v.parts))
        : [];
      if (variants.length === 0) {
        continue;
      }

      const conditionMatched = evaluateSkillConditionExpression(part?.cond, state, member, skill);
      const selected = conditionMatched ? variants[0] : variants[1] ?? variants[0];
      const nested = recurse(selected);
      const inheritedConsumeType =
        String(nested.consumeType) === 'Sp' && String(resolved.consumeType) !== 'Sp'
          ? String(resolved.consumeType)
          : String(nested.consumeType);
      resolved = {
        ...resolved,
        spCost: nested.spCost,
        consumeType: inheritedConsumeType,
        targetType: nested.targetType,
        hitCount: nested.hitCount,
        cond: mergeConditionExpressions(resolved.cond, nested.cond),
        iucCond: nested.iucCond,
        overwriteCond: nested.overwriteCond,
        isRestricted: nested.isRestricted,
      };
      resolved.parts.push(...nested.parts);
    }

    return resolved;
  };

  const effective = recurse(skill);
  return {
    ...skill,
    spCost: Number(effective.spCost),
    consumeType: String(effective.consumeType),
    targetType: String(effective.targetType),
    hitCount: Number(effective.hitCount),
    cond: String(effective.cond),
    iucCond: String(effective.iucCond),
    overwriteCond: String(effective.overwriteCond),
    isRestricted: Boolean(effective.isRestricted),
    parts: effective.parts,
  };
}

function resolvePassiveReduceSpForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return 0;
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalReduction = 0;

  for (const actor of state.party ?? []) {
    for (const passive of actor.passives ?? []) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      for (const part of passive.parts ?? []) {
        if (String(part?.skill_type ?? '') !== 'ReduceSp') {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, actor)) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          targetMember.characterId
        );
        if (!targetCharacterIds.includes(targetMember.characterId)) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(targetMember, part?.target_condition, state)) {
          continue;
        }
        const amount = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          continue;
        }
        totalReduction += amount;
      }
    }
  }

  return totalReduction;
}

function resolvePassiveAttackUpForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { totalRate: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalRate = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of actor.passives ?? []) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let passiveRate = 0;
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
        if (String(part?.skill_type ?? '') !== 'AttackUp') {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, actor)) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          targetMember.characterId
        );
        if (!targetCharacterIds.includes(targetMember.characterId)) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(targetMember, part?.target_condition, state)) {
          continue;
        }
        const amount = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        passiveRate += amount;
        totalRate += amount;
      }
      if (passiveRate !== 0) {
        matchedPassives.push({
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          passiveDesc: String(passive?.desc ?? ''),
          timing: String(passive?.timing ?? ''),
          attackUpRate: passiveRate,
        });
      }
    }
  }

  return { totalRate, matchedPassives };
}

function resolvePassiveDamageRateUpPerTokenForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { totalRate: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalRate = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of actor.passives ?? []) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let passiveRate = 0;
      for (const part of passive.parts ?? []) {
        if (String(part?.skill_type ?? '') !== 'DamageRateUpPerToken') {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, actor)) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          targetMember.characterId
        );
        if (!targetCharacterIds.includes(targetMember.characterId)) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(targetMember, part?.target_condition, state)) {
          continue;
        }
        const tokenCount = Number(actor?.tokenState?.current ?? 0);
        const perTokenRate = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(tokenCount) || !Number.isFinite(perTokenRate) || perTokenRate === 0) {
          continue;
        }
        const amount = tokenCount * perTokenRate;
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        passiveRate += amount;
        totalRate += amount;
      }
      if (passiveRate !== 0) {
        matchedPassives.push({
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          passiveDesc: String(passive?.desc ?? ''),
          timing: String(passive?.timing ?? ''),
          damageRateUpRate: passiveRate,
        });
      }
    }
  }

  return { totalRate, matchedPassives };
}

export function resolveEffectiveSkillForAction(state, member, skill) {
  if (!skill || !member || !state) {
    return skill;
  }
  const effective = resolveEffectiveSkillVariant(skill, state, member);
  const consumeType = String(effective?.consumeType ?? 'Sp');
  const baseSpCost = Number(effective?.spCost ?? 0);
  if (consumeType !== 'Sp' || !Number.isFinite(baseSpCost) || baseSpCost <= 0) {
    return effective;
  }
  const reduceSp = resolvePassiveReduceSpForMember(state, member, 'OnEveryTurnIncludeSpecial');
  if (!Number.isFinite(reduceSp) || reduceSp <= 0) {
    return effective;
  }
  return {
    ...effective,
    spCost: Math.max(0, baseSpCost - reduceSp),
  };
}

function resolveEffectiveSkillParts(skill, state, member) {
  return resolveEffectiveSkillForAction(state, member, skill)?.parts ?? [];
}

function resolveDrivePierceBonusPercent(effectiveHitCount, drivePiercePercent) {
  const p = Number(drivePiercePercent ?? 0);
  if (!DRIVE_PIERCE_OPTION_VALUES.includes(p) || p === 0) {
    return 0;
  }

  const hit = Math.max(1, Number(effectiveHitCount ?? 1));
  const clamped = Math.min(DRIVE_PIERCE_MAX_REFERENCE_HIT, hit);

  // 今回仕様: 役割で分岐せず、ドライブピアス列のみを使用する。
  const step = (p - DRIVE_PIERCE_BASE_BONUS_AT_HIT_1) / (DRIVE_PIERCE_MAX_REFERENCE_HIT - 1);
  const bonus = DRIVE_PIERCE_BASE_BONUS_AT_HIT_1 + step * (clamped - 1);
  return Number(bonus.toFixed(4));
}

function truncateToTwoDecimals(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n >= 0) {
    return Math.floor((n + 1e-9) * 100) / 100;
  }
  return Math.ceil((n - 1e-9) * 100) / 100;
}

function resolveOverDrivePointUpPowerPercent(part) {
  const power0 = Number(part?.power?.[0] ?? 0);
  const power1 = Number(part?.power?.[1] ?? 0);
  const maxPower = Math.max(power0, power1, 0);
  // 実機検証結果に合わせ、power(0.1 / 0.5 / 1.5 など)は百分率へ拡大して扱う。
  return maxPower * 100;
}

function evaluateOdGaugePartCondition(part, state, member, skill, actionEntry) {
  const condTexts = [
    String(part?.cond ?? ''),
    String(part?.hit_condition ?? ''),
    String(part?.target_condition ?? ''),
  ].filter((text) => String(text).trim());
  if (condTexts.length === 0) {
    return true;
  }

  return condTexts.every((condText) =>
    evaluateConditionExpression(condText, state, member, skill, actionEntry).result
  );
}

function computeOverDrivePointUpGainPercent(
  effectiveParts,
  state,
  member,
  skill,
  actionEntry,
  baseHitCount
) {
  const hasOdPoint = hasOverDrivePointUpPartInParts(effectiveParts ?? []);
  if (!hasOdPoint) {
    return 0;
  }

  const driveBonusPercent = resolveDrivePierceBonusPercent(baseHitCount, member?.drivePiercePercent ?? 0);
  const driveMultiplier = 1 + driveBonusPercent / 100;

  let total = 0;
  for (const part of effectiveParts ?? []) {
    const skillType = String(part?.skill_type ?? '');
    if (skillType !== 'OverDrivePointUp' && skillType !== 'OverDrivePointUpByToken') {
      continue;
    }
    if (!evaluateOdGaugePartCondition(part, state, member, skill, actionEntry)) {
      continue;
    }

    let partPercent = resolveOverDrivePointUpPowerPercent(part);
    if (skillType === 'OverDrivePointUpByToken') {
      const tokenCount = Number(actionEntry?.startToken ?? member?.tokenState?.current ?? 0);
      partPercent = truncateToTwoDecimals(partPercent * tokenCount);
    }
    if (!Number.isFinite(partPercent) || partPercent <= 0) {
      continue;
    }

    total = truncateToTwoDecimals(total + truncateToTwoDecimals(partPercent * driveMultiplier));
  }

  return total;
}

function resolveOverDrivePointDownPowerPercent(part) {
  const power0 = Number(part?.power?.[0] ?? 0);
  const power1 = Number(part?.power?.[1] ?? 0);
  const maxPower = Math.max(power0, power1, 0);
  return maxPower * 100;
}

function computeOverDrivePointDownPercent(effectiveParts, state, member, skill, actionEntry) {
  let total = 0;
  for (const part of effectiveParts ?? []) {
    if (String(part?.skill_type ?? '') !== 'OverDrivePointDown') {
      continue;
    }
    if (!evaluateOdGaugePartCondition(part, state, member, skill, actionEntry)) {
      continue;
    }

    const partPercent = resolveOverDrivePointDownPowerPercent(part);
    if (!Number.isFinite(partPercent) || partPercent <= 0) {
      continue;
    }
    total = truncateToTwoDecimals(total + partPercent);
  }
  return total;
}

function computeOdGaugeGainPercentBySkill(
  skill,
  state,
  enemyCount = 1,
  member = null,
  actionEntry = null,
  options = {}
) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
  const skillWithTarget =
    actionEntry && typeof actionEntry === 'object'
      ? { ...skill, targetEnemyIndex: Number.isFinite(Number(actionEntry.targetEnemyIndex)) ? Number(actionEntry.targetEnemyIndex) : undefined }
      : skill;
  const hasDamage = hasDamagePartInParts(effectiveParts);
  const hasOdPoint = hasOverDrivePointUpPartInParts(effectiveParts);
  if (!hasDamage && !hasOdPoint) {
    return 0;
  }

  const numericEnemyCount = clampEnemyCount(enemyCount);
  const targetType = String(skill?.targetType ?? '');
  const isAllTarget = targetType === 'All';

  const baseHitCount = resolveSkillHitCount(skill);
  const funnelHitBonus = Number(options?.funnelHitBonus ?? 0);
  const hitCountPerEnemyBase = isNormalAttackSkill(skill) ? Math.max(3, baseHitCount) : baseHitCount;
  const hitCountPerEnemy = hitCountPerEnemyBase + Math.max(0, funnelHitBonus);
  const odEnemyAnalysis = hasDamage
    ? analyzeEnemiesEligibleForOdGain(state, member, skillWithTarget, numericEnemyCount)
    : null;
  const odEligibleEnemyCount = Number(odEnemyAnalysis?.eligibleEnemyCount ?? 0);
  let hitCount = hitCountPerEnemy * (isAllTarget ? odEligibleEnemyCount : Math.min(1, odEligibleEnemyCount));
  if (isNormalAttackSkill(skill)) {
    // 通常攻撃はヒット数に関わらず最低3hit(=7.5%)保証。
    hitCount = odEligibleEnemyCount > 0 ? Math.max(3, hitCount) : 0;
  }

  if (hasDamage && (!Number.isFinite(hitCount) || hitCount <= 0)) {
    return 0;
  }

  const baseGain = hitCount * OD_GAUGE_PER_HIT_PERCENT;
  let attackGain = 0;
  if (!hasDamage) {
    attackGain = 0;
  } else if (isNormalAttackSkill(skill)) {
    attackGain = truncateToTwoDecimals(baseGain);
  } else {
    // ピアス補正テーブルの hit 数は、敵数を掛けた後ではなく「スキル本来の hit 数」を使う。
    const bonusPercent = resolveDrivePierceBonusPercent(baseHitCount, member?.drivePiercePercent ?? 0);
    const multiplier = 1 + bonusPercent / 100;
    // 仕様更新:
    // 攻撃ぶんODは「1hitごと」に算出し、小数第2位で切り捨ててから総hitへ乗算する。
    // (全体攻撃は totalHits = baseHitCount * enemyCount, 単体攻撃は totalHits = baseHitCount)
    const perHitGain = truncateToTwoDecimals(OD_GAUGE_PER_HIT_PERCENT * multiplier);
    attackGain = truncateToTwoDecimals(perHitGain * hitCount);
  }

  const overDrivePointUpGain = computeOverDrivePointUpGainPercent(
    effectiveParts,
    state,
    member,
    skill,
    actionEntry,
    baseHitCount
  );

  return truncateToTwoDecimals(attackGain + overDrivePointUpGain);
}

function applyOdGaugeFromActions(state, previewRecord, options = {}) {
  const consumeStatusEffects = options.consumeStatusEffects !== false;
  const events = [];
  const enemyCount = clampEnemyCount(previewRecord?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  let currentOdGauge = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));

  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : member.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, member);
    const hasDamage = hasDamagePartInParts(effectiveParts);
    const funnelEffects = hasDamage ? member.resolveEffectiveFunnelEffects().slice(0, 2) : [];
    const funnelHitBonus = funnelEffects.reduce(
      (sum, effect) => sum + Math.max(0, Number(effect?.power ?? 0)),
      0
    );
    const baseHitCount = resolveSkillHitCount(skill);
    const effectiveHitCountPerEnemy = Math.max(
      0,
      (isNormalAttackSkill(skill) ? Math.max(3, baseHitCount) : baseHitCount) + funnelHitBonus
    );
    const effectiveHitCount =
      String(skill?.targetType ?? '') === 'All'
        ? effectiveHitCountPerEnemy * enemyCount
        : effectiveHitCountPerEnemy;
    const skillWithTarget =
      actionEntry && typeof actionEntry === 'object'
        ? {
            ...skill,
            targetEnemyIndex:
              Number.isFinite(Number(actionEntry.targetEnemyIndex)) ? Number(actionEntry.targetEnemyIndex) : undefined,
          }
        : skill;
    const odEnemyAnalysis = hasDamage
      ? analyzeEnemiesEligibleForOdGain(state, member, skillWithTarget, enemyCount)
      : null;
    const odGaugeGain = computeOdGaugeGainPercentBySkill(
      skill,
      state,
      enemyCount,
      member,
      actionEntry,
      { funnelHitBonus }
    );
    const odGaugeDown = computeOverDrivePointDownPercent(
      effectiveParts,
      state,
      member,
      skill,
      actionEntry
    );
    const delta = truncateToTwoDecimals(Number(odGaugeGain ?? 0) - Number(odGaugeDown ?? 0));
    if (!Number.isFinite(delta) || delta === 0) {
      continue;
    }

    const beforeOdGauge = currentOdGauge;
    currentOdGauge = truncateToTwoDecimals(beforeOdGauge + delta);
    currentOdGauge = Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, currentOdGauge));

    let consumedFunnels = [];
    let consumedMindEyes = [];
    if (hasDamage && consumeStatusEffects) {
      consumedFunnels = member.consumeFunnelEffects(2);
      consumedMindEyes = member.consumeMindEyeEffects(1);
    }

    const damageContext = buildDamageCalculationContext({
      actorCharacterId: member.characterId,
      actorStyleId: member.styleId,
      skillId: skill.skillId,
      skillLabel: skill.label,
      skillName: skill.name,
      targetType: skill.targetType,
      enemyCount,
      targetEnemyIndex: odEnemyAnalysis?.targetEnemyIndex,
      baseHitCount,
      funnelHitBonus,
      effectiveHitCountPerEnemy,
      effectiveHitCountTotal: effectiveHitCount,
      eligibleEnemyIndexes: odEnemyAnalysis?.eligibleEnemyIndexes,
      effectiveDamageRatesByEnemy: odEnemyAnalysis?.effectiveDamageRatesByEnemy,
      tokenAttackTokenCount: Number(actionEntry?.tokenAttackContext?.tokenCount ?? actionEntry?.startToken ?? 0),
      tokenAttackRatePerToken: Number(actionEntry?.tokenAttackContext?.ratePerToken ?? 0),
      tokenAttackTotalRate: Number(actionEntry?.tokenAttackContext?.totalRate ?? 0),
      attackByOwnDpRateStartDpRate: Number(actionEntry?.attackByOwnDpRateContext?.startDpRate ?? 0),
      attackByOwnDpRateReferenceDpRate: Number(actionEntry?.attackByOwnDpRateContext?.referenceDpRate ?? 0),
      attackByOwnDpRateLowDpMultiplier: Number(actionEntry?.attackByOwnDpRateContext?.lowDpMultiplier ?? 0),
      attackByOwnDpRateHighDpMultiplier: Number(actionEntry?.attackByOwnDpRateContext?.highDpMultiplier ?? 0),
      attackByOwnDpRateResolvedMultiplier: Number(
        actionEntry?.attackByOwnDpRateContext?.resolvedMultiplier ?? 0
      ),
      damageRateUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.damageRateUpRate ?? 0),
      markAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.markAttackUpRate ?? 0),
      markDamageTakenDownRate: Number(actionEntry?.specialPassiveModifiers?.markDamageTakenDownRate ?? 0),
      markDevastationRateUp: Number(actionEntry?.specialPassiveModifiers?.markDevastationRateUp ?? 0),
      markCriticalRateUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalRateUp ?? 0),
      markCriticalDamageUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalDamageUp ?? 0),
      overDrivePointUpByTokenPerToken: effectiveParts
        .filter((part) => String(part?.skill_type ?? '') === 'OverDrivePointUpByToken')
        .reduce((sum, part) => sum + Number(part?.power?.[0] ?? 0), 0),
      overDrivePointUpByTokenTokenCount: Number(actionEntry?.startToken ?? member?.tokenState?.current ?? 0),
      overDrivePointUpByTokenTotalPercent: effectiveParts
        .filter((part) => String(part?.skill_type ?? '') === 'OverDrivePointUpByToken')
        .reduce(
          (sum, part) =>
            sum +
            truncateToTwoDecimals(
              resolveOverDrivePointUpPowerPercent(part) *
                Number(actionEntry?.startToken ?? member?.tokenState?.current ?? 0)
            ),
          0
        ),
      zoneType: skillMatchesActiveZone(state, skill, member).zoneState?.type ?? '',
      zonePowerRate: skillMatchesActiveZone(state, skill, member).matched
        ? Number(skillMatchesActiveZone(state, skill, member).zoneState?.powerRate ?? 0)
        : 0,
      funnelEffects,
    });

    events.push({
      characterId: member.characterId,
      skillId: skill.skillId,
      skillName: skill.name,
      hitCount: effectiveHitCount,
      baseHitCount,
      funnelHitBonus,
      consumedFunnelEffects: consumedFunnels,
      consumedMindEyeEffects: consumedMindEyes,
      damageContext,
      odGaugeGain: delta,
      odGaugeRawGain: truncateToTwoDecimals(Number(odGaugeGain ?? 0)),
      odGaugeRawDown: truncateToTwoDecimals(Number(odGaugeDown ?? 0)),
      odGaugeBefore: beforeOdGauge,
      odGaugeAfter: currentOdGauge,
    });
  }

  const startOdGauge = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));
  const endOdGauge = currentOdGauge;
  state.turnState.odGauge = endOdGauge;

  return {
    startOdGauge,
    endOdGauge,
    totalGain: truncateToTwoDecimals(endOdGauge - startOdGauge),
    events,
  };
}

function resolveSupportTargetCharacterIds(
  state,
  actorMember,
  targetTypeRaw,
  preferredTargetCharacterId = null
) {
  const targetType = String(targetTypeRaw ?? '');
  const frontline = getFrontlineMembers(state);
  const allies = state.party.slice().sort((a, b) => a.position - b.position);
  const backline = state.party
    .filter((member) => member.position >= 3)
    .slice()
    .sort((a, b) => a.position - b.position);
  const out = new Set();

  if (targetType === 'Self') {
    out.add(actorMember.characterId);
  } else if (targetType === 'AllyAll') {
    for (const member of state.party) {
      out.add(member.characterId);
    }
  } else if (targetType === 'AllyAllWithoutSelf') {
    for (const member of state.party) {
      if (member.characterId !== actorMember.characterId) {
        out.add(member.characterId);
      }
    }
  } else if (targetType === 'AllyFront') {
    for (const member of frontline) {
      out.add(member.characterId);
    }
  } else if (targetType === 'AllyFrontWithoutSelf') {
    for (const member of frontline) {
      if (member.characterId !== actorMember.characterId) {
        out.add(member.characterId);
      }
    }
  } else if (targetType === 'AllySub') {
    for (const member of backline) {
      out.add(member.characterId);
    }
  } else if (targetType === 'AllySingle') {
    let target =
      preferredTargetCharacterId
        ? allies.find((member) => member.characterId === preferredTargetCharacterId) ?? null
        : null;
    if (!target) {
      target = allies[0] ?? actorMember;
    }
    if (target) {
      out.add(target.characterId);
    }
  } else if (targetType === 'AllySingleWithoutSelf') {
    let target = null;
    if (preferredTargetCharacterId) {
      target =
        allies.find(
          (member) =>
            member.characterId === preferredTargetCharacterId &&
            member.characterId !== actorMember.characterId
        ) ?? null;
    }
    if (!target) {
      target = allies.find((member) => member.characterId !== actorMember.characterId) ?? null;
    }
    if (target) {
      out.add(target.characterId);
    }
  }

  return [...out];
}

function resolveFunnelHitBonusForMember(member, maxStacks = 2) {
  if (!member || typeof member.resolveEffectiveFunnelEffects !== 'function') {
    return 0;
  }
  const effects = member.resolveEffectiveFunnelEffects().slice(0, Math.max(0, Number(maxStacks) || 0));
  return effects.reduce((sum, effect) => sum + Math.max(0, Number(effect?.power ?? 0)), 0);
}

function resolveEffectivePreviewHitCount(skill, state, member) {
  const baseHitCount = resolveSkillHitCount(skill);
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
  const hasDamage = hasDamagePartInParts(effectiveParts);
  if (!hasDamage) {
    return {
      baseHitCount,
      funnelHitBonus: 0,
      effectiveHitCount: baseHitCount,
    };
  }

  const normalizedBase = isNormalAttackSkill(skill) ? Math.max(3, baseHitCount) : baseHitCount;
  const funnelHitBonus = resolveFunnelHitBonusForMember(member, 2);
  return {
    baseHitCount,
    funnelHitBonus,
    effectiveHitCount: Math.max(0, normalizedBase + funnelHitBonus),
  };
}

function applyFunnelEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts) {
      if (String(part?.skill_type ?? '') !== 'Funnel') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      if (!evaluateOdGaugePartCondition(part, state, actor, conditionSkill, actionEntry)) {
        continue;
      }

      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      if (targetCharacterIds.length === 0) {
        continue;
      }

      const limitType = String(part?.effect?.limitType ?? 'Default');
      const exitCond = String(part?.effect?.exitCond ?? 'Count');
      const remaining = Number(part?.effect?.exitVal?.[0] ?? 1);
      const hitBonus = Number(part?.power?.[0] ?? 0);
      const damageBonus = Number(part?.value?.[0] ?? 0);

      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }

        const effect = target.addStatusEffect({
          statusType: 'Funnel',
          limitType,
          exitCond,
          remaining: Number.isFinite(remaining) ? remaining : 1,
          power: Number.isFinite(hitBonus) ? hitBonus : 0,
          sourceSkillId: Number(skill.skillId),
          sourceSkillLabel: String(skill.label ?? ''),
          sourceSkillName: String(skill.name ?? ''),
          metadata: {
            damageBonus: Number.isFinite(damageBonus) ? damageBonus : 0,
            targetType: String(part?.target_type ?? ''),
          },
        });

        events.push({
          actorCharacterId: actor.characterId,
          targetCharacterId,
          skillId: skill.skillId,
          skillName: skill.name,
          effectId: effect.effectId,
          hitBonus: effect.power,
          damageBonus: effect.metadata?.damageBonus ?? 0,
          limitType: effect.limitType,
          exitCond: effect.exitCond,
          remaining: effect.remaining,
        });
      }
    }
  }
  return events;
}

function addGuardStatusEffect(target, part, source) {
  const statusType = String(part?.skill_type ?? '').trim();
  if (statusType !== 'DebuffGuard' && statusType !== 'BreakGuard') {
    return null;
  }
  const added = target.addStatusEffect({
    statusType,
    power: Number(part?.power?.[0] ?? 0),
    limitType: String(part?.effect?.limitType ?? 'None'),
    exitCond: String(part?.effect?.exitCond ?? 'EnemyTurnEnd'),
    effect: { exitVal: Array.isArray(part?.effect?.exitVal) ? part.effect.exitVal : [1, 0] },
    sourceSkillId: Number(source?.sourceSkillId ?? 0),
    sourceSkillLabel: String(source?.sourceSkillLabel ?? ''),
    sourceSkillName: String(source?.sourceSkillName ?? ''),
    metadata: source?.metadata && typeof source.metadata === 'object' ? structuredClone(source.metadata) : null,
  });
  return {
    characterId: target.characterId,
    statusType: String(added?.statusType ?? statusType),
    exitCond: String(added?.exitCond ?? ''),
    remaining: Number(added?.remaining ?? 0),
    effectId: Number(added?.effectId ?? 0),
  };
}

function applyGuardEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (skillType !== 'DebuffGuard' && skillType !== 'BreakGuard') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const added = addGuardStatusEffect(target, part, {
          sourceSkillId: Number(skill.skillId ?? 0),
          sourceSkillLabel: String(skill.label ?? ''),
          sourceSkillName: String(skill.name ?? ''),
          metadata: {
            actorCharacterId: actor.characterId,
            targetType: String(part?.target_type ?? ''),
          },
        });
        if (!added) {
          continue;
        }
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          skillId: Number(skill.skillId ?? 0),
          skillName: String(skill.name ?? ''),
          ...added,
        });
      }
    }
  }
  return events;
}

function applyEnemyBreakEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (skillType !== 'SuperBreak' && skillType !== 'SuperBreakDown') {
        continue;
      }
      const baseConditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, skill);
      for (const targetIndex of targetEnemyIndexes) {
        const conditionSkill = {
          ...baseConditionSkill,
          targetEnemyIndex: Number(targetIndex),
        };
        const targetActionEntry = {
          ...actionEntry,
          targetEnemyIndex: Number(targetIndex),
        };
        const condSatisfied = condTexts.every((expr) =>
          evaluateConditionExpression(expr, state, actor, conditionSkill, targetActionEntry).result
        );
        if (!condSatisfied) {
          continue;
        }
        if (skillType === 'SuperBreak') {
          const applied = applyEnemyStrongBreakState(state.turnState, targetIndex);
          if (applied) {
            events.push({
              actorCharacterId: actor.characterId,
              skillId: Number(skill.skillId ?? 0),
              skillName: String(skill.name ?? ''),
              mode: 'StrongBreak',
              ...applied,
            });
          }
          continue;
        }

        if (hasEnemyStatus(state.turnState, targetIndex, ENEMY_STATUS_DOWN_TURN)) {
          const applied = applyEnemySuperDownState(state.turnState, targetIndex);
          if (applied) {
            events.push({
              actorCharacterId: actor.characterId,
              skillId: Number(skill.skillId ?? 0),
              skillName: String(skill.name ?? ''),
              mode: 'SuperDown',
              ...applied,
            });
          }
          continue;
        }

        upsertEnemyStatus(state.turnState, {
          statusType: ENEMY_STATUS_BREAK,
          targetIndex,
          remainingTurns: 0,
        });
        upsertEnemyStatus(state.turnState, {
          statusType: ENEMY_STATUS_DOWN_TURN,
          targetIndex,
          remainingTurns: DEFAULT_AUTO_DOWN_TURN_REMAINING,
        });
        events.push({
          actorCharacterId: actor.characterId,
          skillId: Number(skill.skillId ?? 0),
          skillName: String(skill.name ?? ''),
          mode: 'DownTurn',
          targetIndex,
          statusType: ENEMY_STATUS_DOWN_TURN,
          remainingTurns: DEFAULT_AUTO_DOWN_TURN_REMAINING,
        });
      }
    }
  }
  return events;
}

function findMemberByCharacterId(state, characterId) {
  return state.party.find((member) => member.characterId === characterId) ?? null;
}

function hasReinforcedMode(member) {
  if (member.isReinforcedMode) {
    return true;
  }

  if (!Array.isArray(member.effects)) {
    return false;
  }

  return member.effects.some((effect) => {
    const type = String(effect?.type ?? effect?.effectType ?? effect?.kind ?? '');
    const tag = String(effect?.tag ?? effect?.label ?? effect?.name ?? '');
    return (
      type === 'ReinforcedMode' ||
      type === 'Kishin' ||
      tag.includes('鬼神') ||
      tag.includes('Reinforced')
    );
  });
}

function getFrontlineMembers(state) {
  return state.party
    .filter((member) => member.position <= 2)
    .slice()
    .sort((a, b) => a.position - b.position);
}

function getExtraAllowedSet(turnState) {
  if (turnState.turnType !== 'extra' || !turnState.extraTurnState) {
    return null;
  }
  return new Set(turnState.extraTurnState.allowedCharacterIds ?? []);
}

function isMemberActionableInCurrentTurn(state, member) {
  if (!member || member.position > 2) {
    return false;
  }
  if (state.turnState.turnType !== 'extra') {
    return true;
  }
  const allowedSet = getExtraAllowedSet(state.turnState);
  if (!allowedSet) {
    return false;
  }
  return allowedSet.has(member.characterId);
}

function updateReinforcedModeStateAfterTurn(state) {
  const tezuka = state.party.find((member) => member.characterId === TEZUKA_CHARACTER_ID) ?? null;
  if (!tezuka) {
    return;
  }
  const actionable =
    isMemberActionableInCurrentTurn(state, tezuka) || state.turnState.turnType === 'extra';
  // PlayerTurnEnd 系状態の減算は turn-controller 側で一括処理する。
  tezuka.tickReinforcedModeTurnIfActionable(actionable, { tickPlayerTurnEndStatuses: false });
}

function applyTurnBasedStatusExpiry(state, previewRecord) {
  const processed = new Set();
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const characterId = String(actionEntry?.characterId ?? '');
    if (!characterId || processed.has(characterId)) {
      continue;
    }
    processed.add(characterId);

    const member = findMemberByCharacterId(state, characterId);
    if (!member) {
      continue;
    }
    const ticked = member.tickStatusEffectsByExitCond('PlayerTurnEnd');
    for (const item of ticked) {
      events.push({ characterId, ...item });
    }
  }
  return events;
}

function syncExtraActiveFlags(party, allowedCharacterIds = []) {
  const allowed = new Set(allowedCharacterIds);
  for (const member of party) {
    member.setExtraActive(allowed.has(member.characterId));
  }
}

function isTargetConditionSatisfiedByMember(targetMember, expression, state = null) {
  const expr = String(expression ?? '').replace(CONDITION_WHITESPACE_RE, '');
  if (!expr) {
    return true;
  }
  if (expr === 'IsFront()==1') {
    return Number(targetMember?.position ?? 99) <= 2;
  }
  if (expr === 'IsFront()==0') {
    return Number(targetMember?.position ?? -1) >= 3;
  }
  {
    const m = expr.match(IS_CHARACTER_TARGET_CONDITION_RE);
    if (m) {
      const characterId = String(m[1] ?? '').trim();
      const op = String(m[2] ?? '');
      const rhs = Number(m[3] ?? 0);
      const lhs = String(targetMember?.characterId ?? '') === characterId ? 1 : 0;
      return compareNumbers(lhs, op, rhs);
    }
  }
  if (state && targetMember) {
    return evaluateConditionExpression(expr, state, targetMember, null).result;
  }
  return true;
}

function resolveAdditionalTurnTargets(
  state,
  actorMember,
  targetSpecs,
  preferredTargetCharacterId = null
) {
  const ids = new Set();
  const frontline = getFrontlineMembers(state);
  const allies = state.party.slice().sort((a, b) => a.position - b.position);

  for (const spec of targetSpecs ?? []) {
    const targetType = String(spec?.targetType ?? spec ?? '');
    const targetCondition = String(spec?.targetCondition ?? '');
    if (!targetType) {
      continue;
    }

    if (targetType === 'Self') {
      if (isTargetConditionSatisfiedByMember(actorMember, targetCondition, state)) {
        ids.add(actorMember.characterId);
      }
      continue;
    }

    if (targetType === 'AllyFront') {
      for (const member of frontline) {
        if (isTargetConditionSatisfiedByMember(member, targetCondition, state)) {
          ids.add(member.characterId);
        }
      }
      continue;
    }

    if (targetType === 'AllySingleWithoutSelf') {
      let target = null;
      if (preferredTargetCharacterId) {
        target =
          allies.find(
            (member) =>
              member.characterId === preferredTargetCharacterId &&
              member.characterId !== actorMember.characterId
          ) ?? null;
      }
      if (!target) {
        target = allies.find((member) => member.characterId !== actorMember.characterId) ?? null;
      }
      if (target && isTargetConditionSatisfiedByMember(target, targetCondition, state)) {
        ids.add(target.characterId);
      }
      continue;
    }

    if (targetType === 'AllySingle') {
      let target = null;
      if (preferredTargetCharacterId) {
        target =
          allies.find((member) => member.characterId === preferredTargetCharacterId) ?? null;
      }
      if (!target) {
        target = allies[0] ?? null;
      }
      if (target && isTargetConditionSatisfiedByMember(target, targetCondition, state)) {
        ids.add(target.characterId);
      }
      continue;
    }
  }

  return [...ids];
}

function deriveGrantedExtraTurnCharacterIds(state, previewRecord) {
  const granted = new Set();

  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill?.additionalTurnRule) {
      continue;
    }

    const rule = skill.additionalTurnRule;
    if (!rule.additionalTurnGrantInExtraTurn && state.turnState.turnType === 'extra') {
      continue;
    }

    const conditions = rule.conditions ?? {};
    if (conditions.requiresOverDrive && !isOverDriveActive(state.turnState)) {
      continue;
    }
    if (conditions.requiresReinforcedMode && !hasReinforcedMode(member)) {
      continue;
    }

    const targetSpecs = Array.isArray(rule.additionalTurnTargets)
      ? rule.additionalTurnTargets
      : Array.isArray(rule.additionalTurnTargetTypes)
        ? rule.additionalTurnTargetTypes.map((targetType) => ({ targetType, targetCondition: '' }))
        : [];
    const targets = resolveAdditionalTurnTargets(
      state,
      member,
      targetSpecs,
      actionEntry?.targetCharacterId
    ).filter((characterId) => {
      const target = findMemberByCharacterId(state, characterId);
      return Number(target?.position ?? 99) <= 2;
    });
    for (const characterId of targets) {
      granted.add(characterId);
    }
  }

  return [...granted];
}

function validateActionDict(state, actions, options = {}) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) {
    throw new Error('actions must be an object keyed by position index.');
  }
  const skipSkillConditions = Boolean(options.skipSkillConditions);

  const allowedInExtra = getExtraAllowedSet(state.turnState);
  const entries = Object.entries(actions).map(([positionKey, action]) => {
    const position = Number(positionKey);
    const member = state.party.find((item) => item.position === position) ?? null;

    if (!member) {
      throw new Error(`No member at position ${position}.`);
    }

    if (member.position > 2) {
      throw new Error(`Action is allowed only for front positions (0..2). got=${position}`);
    }

    if (action.characterId && action.characterId !== member.characterId) {
      throw new Error(`characterId mismatch at position ${position}`);
    }

    if (allowedInExtra && !allowedInExtra.has(member.characterId)) {
      throw new Error(`Character ${member.characterId} is not allowed to act in extra turn.`);
    }

    const skill = member.getSkill(action.skillId);
    if (!skill) {
      throw new Error(`Skill ${action.skillId} is not available for ${member.characterId}`);
    }

    if (state.turnState.turnType === 'extra' && skill.additionalTurnRule?.skillUsableInExtraTurn === false) {
      throw new Error(`Skill ${skill.skillId} is not usable in extra turn.`);
    }

    const effectiveSkill = resolveEffectiveSkillForAction(state, member, skill);

    if (!skipSkillConditions) {
      const skillConditions = [
        { label: 'cond', expression: effectiveSkill?.cond ?? skill.cond },
        { label: 'iuc_cond', expression: effectiveSkill?.iucCond ?? skill.iucCond },
      ];
      for (const condition of skillConditions) {
        const expr = String(condition.expression ?? '').trim();
        if (!expr) {
          continue;
        }
        const evaluated = evaluateConditionExpression(expr, state, member, effectiveSkill, action);
        if (evaluated.knownCount > 0 && !evaluated.result) {
          throw new Error(
            `Skill ${skill.skillId} cannot be used because ${condition.label} is not satisfied.`
          );
        }
      }
    }

    return {
      position,
      member,
      skill,
      action,
    };
  });

  const phaseOf = (skillType) => (skillType === 'non_damage' ? 0 : 1);
  entries.sort((a, b) => {
    const p = phaseOf(a.skill.type) - phaseOf(b.skill.type);
    if (p !== 0) {
      return p;
    }

    return a.position - b.position;
  });

  return entries;
}

function previewActionEntries(state, sortedActions) {
  return sortedActions.map(({ member, position, skill, action }) => {
    const effectiveSkill = resolveEffectiveSkillForAction(state, member, skill);
    const preview = member.previewSkillUseResolved(effectiveSkill);
    const hitInfo = resolveEffectivePreviewHitCount(effectiveSkill, state, member);
    const specialAttackUp = resolvePassiveAttackUpForMember(state, member, 'OnEveryTurnIncludeSpecial');
    const damageRateUpPerToken = resolvePassiveDamageRateUpPerTokenForMember(
      state,
      member,
      'OnPlayerTurnStart'
    );
    const zoneMatch = skillMatchesActiveZone(state, effectiveSkill, member);
    const zonePowerRate = zoneMatch.matched ? Number(zoneMatch.zoneState?.powerRate ?? 0) : 0;
    const tokenAttackContext = resolveTokenAttackContext(
      effectiveSkill,
      state,
      member,
      preview.startToken
    );
    const attackByOwnDpRateContext = resolveAttackByOwnDpRateContext(
      effectiveSkill,
      state,
      member,
      member.dpState
    );
    const intrinsicMarkModifiers = resolveIntrinsicMarkModifiersForMember(member);

    return {
      characterId: member.characterId,
      characterName: member.characterName,
      styleId: Number(member.styleId ?? 0),
      styleName: String(member.styleName ?? ''),
      partyIndex: member.partyIndex,
      positionIndex: position,
      isExtraAction: state.turnState.turnType === 'extra',
      skillId: effectiveSkill.skillId,
      skillName: effectiveSkill.name,
      skillLabel: effectiveSkill.label,
      skillTargetType: String(effectiveSkill.targetType ?? ''),
      skillHitCount: hitInfo.effectiveHitCount,
      skillBaseHitCount: hitInfo.baseHitCount,
      skillFunnelHitBonus: hitInfo.funnelHitBonus,
      spCost: effectiveSkill.spCost,
      consumeType: String(effectiveSkill.consumeType ?? 'Sp'),
      spChanges: [
        {
          source: 'cost',
          delta: preview.spDelta,
          preSP: preview.startSP,
          postSP: preview.endSP,
          eventCeiling: Number.POSITIVE_INFINITY,
        },
      ],
      startSP: preview.startSP,
      endSP: preview.endSP,
      startEP: preview.startEP,
      endEP: preview.endEP,
      startToken: preview.startToken,
      endToken: preview.endToken,
      startMorale: preview.startMorale,
      endMorale: preview.endMorale,
      startMotivation: preview.startMotivation,
      endMotivation: preview.endMotivation,
      attackByOwnDpRateContext,
      tokenChanges:
        Number(preview.tokenDelta ?? 0) !== 0
          ? [
              {
                source: 'cost',
                delta: preview.tokenDelta,
                preToken: preview.startToken,
                postToken: preview.endToken,
                eventCeiling: Number.POSITIVE_INFINITY,
              },
            ]
          : [],
      moraleChanges:
        Number(preview.moraleDelta ?? 0) !== 0
          ? [
              {
                source: 'cost',
                delta: preview.moraleDelta,
                preMorale: preview.startMorale,
                postMorale: preview.endMorale,
                eventCeiling: Number.POSITIVE_INFINITY,
              },
            ]
          : [],
      motivationChanges:
        Number(preview.motivationDelta ?? 0) !== 0
          ? [
              {
                source: 'cost',
                delta: preview.motivationDelta,
                preMotivation: preview.startMotivation,
                postMotivation: preview.endMotivation,
                eventCeiling: Number.POSITIVE_INFINITY,
              },
            ]
          : [],
      dpChanges: [],
      specialPassiveModifiers: {
        attackUpRate:
          Number(specialAttackUp.totalRate ?? 0) + Number(intrinsicMarkModifiers.attackUpRate ?? 0),
        markAttackUpRate: Number(intrinsicMarkModifiers.attackUpRate ?? 0),
        damageRateUpRate: Number(damageRateUpPerToken.totalRate ?? 0),
        zonePowerRate,
        markDamageTakenDownRate: Number(intrinsicMarkModifiers.damageTakenDownRate ?? 0),
        markDevastationRateUp: Number(intrinsicMarkModifiers.devastationRateUp ?? 0),
        markCriticalRateUp: Number(intrinsicMarkModifiers.criticalRateUp ?? 0),
        markCriticalDamageUp: Number(intrinsicMarkModifiers.criticalDamageUp ?? 0),
      },
      tokenAttackContext,
      specialPassiveEvents: [
        ...specialAttackUp.matchedPassives,
        ...damageRateUpPerToken.matchedPassives,
      ],
      breakHitCount: Number(action?.breakHitCount ?? 0),
      killCount: Number(action?.killCount ?? 0),
      targetCharacterId: String(action?.targetCharacterId ?? ''),
      targetEnemyIndex:
        Number.isFinite(Number(action?.targetEnemyIndex)) ? Number(action.targetEnemyIndex) : null,
      _baseRevision: preview.baseRevision,
      _effectiveSkillSnapshot: structuredClone(effectiveSkill),
    };
  });
}

function getEpRule(member) {
  return member?.epRule && typeof member.epRule === 'object' ? member.epRule : null;
}

function getPassiveOverdriveEpLimit(member) {
  let limit = null;
  for (const passive of member.passives ?? []) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    for (const part of passive.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'EpLimitOverwrite') {
        continue;
      }
      const value = Number(part?.power?.[0] ?? 0);
      if (Number.isFinite(value) && value > 0) {
        limit = limit === null ? value : Math.max(limit, value);
      }
    }
  }
  return limit;
}

function getEpCeilingForTurn(member, turnState, options = {}) {
  const rule = getEpRule(member);
  if (turnState.turnType === 'od') {
    const passiveLimit = Number.isFinite(Number(options.passiveOverdriveEpLimit))
      ? Number(options.passiveOverdriveEpLimit)
      : getPassiveOverdriveEpLimit(member);
    if (Number.isFinite(passiveLimit)) {
      return Number(passiveLimit);
    }
    if (Number.isFinite(Number(rule?.ep?.odMax))) {
      return Number(rule.ep.odMax);
    }
    return Number(member.ep.odMax ?? member.ep.max ?? 0);
  }
  if (Number.isFinite(Number(rule?.ep?.max))) {
    return Number(rule.ep.max);
  }
  return Number(member.ep.max ?? 0);
}

function applyRoleEpGain(member, turnState) {
  const rule = getEpRule(member);
  const delta = Number(rule?.turnStartEpDelta ?? 0);
  if (!Number.isFinite(delta) || delta === 0) {
    return null;
  }

  const source = String(rule?.turnStartSource ?? 'ep_rule');
  const change = member.applyEpDelta(delta, getEpCeilingForTurn(member, turnState));
  return { characterId: member.characterId, source, ...change };
}

function applyPassiveSkillEpTurnStart(member, turnState) {
  const events = [];
  for (const skill of member.skills ?? []) {
    if (!skill.isPassive) {
      continue;
    }
    if (String(skill?.passive?.timing ?? '') !== 'OnEveryTurn') {
      continue;
    }
    for (const part of skill.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, turnState));
      events.push({
        characterId: member.characterId,
        source: 'ep_passive_skill',
        skillId: skill.skillId,
        ...change,
      });
    }
  }
  return events;
}

function applyPassiveEpOnOverdriveStart(member, turnState, options = {}) {
  const events = [];
  const passiveEvents = [];
  const passiveOverdriveEpLimit = Number.isFinite(Number(options.passiveOverdriveEpLimit))
    ? Number(options.passiveOverdriveEpLimit)
    : null;
  for (const passive of member.passives ?? []) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    const effectTypes = new Set();
    for (const part of passive.parts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (skillType) {
        effectTypes.add(skillType);
      }
    }
    let totalDelta = 0;
    let matched = false;
    for (const part of passive.parts ?? []) {
      const skillType = String(part.skill_type ?? '');
      if (skillType === 'EpLimitOverwrite') {
        const limit = Number(part?.power?.[0] ?? 0);
        if (Number.isFinite(limit) && limit > 0) {
          matched = true;
          effectTypes.add(skillType);
        }
        continue;
      }
      if (skillType !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const change = member.applyEpDelta(
        amount,
        getEpCeilingForTurn(member, turnState, { passiveOverdriveEpLimit })
      );
      events.push({
        characterId: member.characterId,
        source: 'ep_passive',
        passiveName: passive.name,
        ...change,
      });
      matched = true;
      totalDelta += Number(change?.delta ?? 0);
      effectTypes.add(skillType);
    }
    if (matched) {
      passiveEvents.push(
        createPassiveTriggerEvent(turnState, member, passive, {
          source: 'passive',
          effectTypes: [...effectTypes],
          epDelta: totalDelta,
          epLimit: passiveOverdriveEpLimit,
        })
      );
    } else if (effectTypes.size > 0 || String(passive.effect ?? '').trim()) {
      passiveEvents.push(
        createPassiveTriggerEvent(turnState, member, passive, {
          source: 'passive',
          effectTypes: [...effectTypes],
          epDelta: totalDelta,
          epLimit: passiveOverdriveEpLimit,
        })
      );
    }
  }
  return { epEvents: events, passiveEvents };
}

function evaluatePassiveSelfConditions(passive, part, state, member) {
  const conditions = [passive?.condition, part?.cond, part?.hit_condition]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const conditionSkill = createConditionSkillContext(passive, part);
  return conditions.every((expr) => evaluateConditionExpression(expr, state, member, conditionSkill).result);
}

function resolvePassiveTargetMembers(state, actorMember, part, preferredTargetCharacterId = null) {
  const targetCharacterIds = resolveSupportTargetCharacterIds(
    state,
    actorMember,
    part?.target_type,
    preferredTargetCharacterId
  );
  const targets = [];
  for (const targetCharacterId of targetCharacterIds) {
    const target = findMemberByCharacterId(state, targetCharacterId);
    if (!target) {
      continue;
    }
    if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
      continue;
    }
    targets.push(target);
  }
  return targets;
}

function passivePartCanMatchWithoutPartyTarget(part) {
  const targetType = String(part?.target_type ?? '').trim();
  return ![
    'Self',
    'AllyAll',
    'AllyAllWithoutSelf',
    'AllyFront',
    'AllyFrontWithoutSelf',
    'AllySub',
    'AllySingle',
    'AllySingleWithoutSelf',
  ].includes(targetType);
}

function applyPassiveTimingInternal(state, timings = [], options = {}) {
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  const spEvents = [];
  const epEvents = [];
  const dpEvents = [];
  const passiveEvents = [];
  const turnState = state?.turnState ?? {};
  const passiveUsageCounts =
    turnState.passiveUsageCounts && typeof turnState.passiveUsageCounts === 'object'
      ? turnState.passiveUsageCounts
      : {};

  for (const member of state?.party ?? []) {
    for (const passive of getPassiveEntriesForMember(member)) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      const passiveLimit = Number(passive?.limit ?? 0);
      const usageKey = getPassiveUsageKey(member, passive);
      const currentUsageCount = Number(passiveUsageCounts[usageKey] ?? 0);
      if (passiveLimit > 0 && currentUsageCount >= passiveLimit) {
        continue;
      }

      let matched = false;
      let totalDelta = 0;
      let totalEpDelta = 0;
      let totalDpDelta = 0;
      let totalMotivationDelta = 0;
      let totalAttackUpRate = 0;
      let totalOdGaugeDelta = 0;
      let totalMoraleDelta = 0;
      let totalDamageRateUpRate = 0;
      let totalDefenseDownRate = 0;
      let totalDefenseUpRate = 0;
      let totalCriticalRateUpRate = 0;
      let totalCriticalDamageUpRate = 0;
      let totalGiveDefenseDebuffUpRate = 0;
      let totalDamageUpByOverDriveRate = 0;
      let totalGiveAttackBuffUpRate = 0;
      let totalGiveHealUpRate = 0;
      const appliedStatusEffects = [];
      const effectTypes = new Set();
      const unsupportedEffectTypes = new Set();
      const fieldEvents = [];
      let unsupportedMatched = false;
      for (const part of resolvePassiveEffectiveParts(passive, state, member)) {
        const skillType = String(part?.skill_type ?? '');
        if (skillType) {
          effectTypes.add(skillType);
        }
        if (skillType === 'Zone') {
          if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
            continue;
          }
          const applied = applyZonePartToTurnState(turnState, part, 'player');
          if (applied) {
            matched = true;
            fieldEvents.push({ kind: 'zone', ...applied });
          }
          continue;
        }
        if (/Territory$/i.test(skillType)) {
          if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
            continue;
          }
          const applied = applyTerritoryPartToTurnState(turnState, part, 'player');
          if (applied) {
            matched = true;
            fieldEvents.push({ kind: 'territory', ...applied });
          }
          continue;
        }
        if (
          skillType !== 'HealSp' &&
          skillType !== 'HealEp' &&
          skillType !== 'HealDpRate' &&
          skillType !== 'ReviveDpRate' &&
          skillType !== 'Motivation' &&
          skillType !== 'Morale' &&
          skillType !== 'AttackUp' &&
          skillType !== 'DamageRateUp' &&
          skillType !== 'DefenseDown' &&
          skillType !== 'DefenseUp' &&
          skillType !== 'CriticalRateUp' &&
          skillType !== 'CriticalDamageUp' &&
          skillType !== 'GiveDefenseDebuffUp' &&
          skillType !== 'DamageUpByOverDrive' &&
          skillType !== 'GiveAttackBuffUp' &&
          skillType !== 'GiveHealUp' &&
          skillType !== 'ReduceSp' &&
          skillType !== 'OverwriteSp' &&
          skillType !== 'SpLimitOverwrite' &&
          skillType !== 'EpLimitOverwrite' &&
          skillType !== 'TokenSet' &&
          skillType !== 'OverDrivePointUp' &&
          skillType !== 'DebuffGuard' &&
          skillType !== 'BreakGuard' &&
          !MARK_SKILL_TYPE_TO_ELEMENT[skillType]
        ) {
          if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
            continue;
          }
          const targets = resolvePassiveTargetMembers(state, member, part, options.targetCharacterId ?? null);
          if (targets.length === 0 && !passivePartCanMatchWithoutPartyTarget(part)) {
            continue;
          }
          if (skillType) {
            unsupportedEffectTypes.add(skillType);
            unsupportedMatched = true;
          }
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
          continue;
        }

        if (skillType === 'HealEp') {
          const amount = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          if (String(part?.target_type ?? '') !== 'Self') {
            unsupportedEffectTypes.add(skillType);
            continue;
          }
          const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, turnState));
          epEvents.push({
            actorCharacterId: member.characterId,
            characterId: member.characterId,
            source: 'ep_passive',
            passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
            passiveName: String(passive?.name ?? ''),
            targetType: 'Self',
            ...change,
          });
          matched = true;
          totalEpDelta += Number(change?.delta ?? 0);
          continue;
        }

        if (skillType === 'HealDpRate' || skillType === 'ReviveDpRate') {
          const rate = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(rate) || rate <= 0) {
            continue;
          }
          const targets = resolvePassiveTargetMembers(state, member, part, options.targetCharacterId ?? null);
          if (targets.length === 0) {
            continue;
          }
          for (const target of targets) {
            const startDpState = cloneDpState(target.dpState ?? {});
            const baseMaxDp = Number(startDpState.baseMaxDp ?? 0);
            if (!Number.isFinite(baseMaxDp) || baseMaxDp <= 0) {
              continue;
            }
            const amount = baseMaxDp * rate;
            if (!Number.isFinite(amount) || amount <= 0) {
              continue;
            }
            const nextCurrentDp =
              skillType === 'ReviveDpRate'
                ? Math.max(Number(startDpState.currentDp ?? 0), amount)
                : Number(startDpState.currentDp ?? 0) + amount;
            const change = target.setDpState({
              currentDp: nextCurrentDp,
              effectiveDpCap: getDpHealCapForPart(target, part),
            });
            const endDpState = cloneDpState(change.endDpState);
            const event = createPassiveDpEvent({
              actor: member,
              target,
              passive,
              part,
              triggerType: getDpEventKind(skillType),
              source: 'dp_passive',
              startDpState,
              endDpState,
              isAmountResolved: true,
            });
            dpEvents.push(event);
            matched = true;
            totalDpDelta += Number(event.delta ?? 0);
          }
          continue;
        }

        if (skillType === 'Motivation') {
          const targetLevel = getMotivationTargetLevel(part);
          if (!targetLevel) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const change = target.setMotivationLevel(targetLevel);
            matched = true;
            totalMotivationDelta += Number(change?.delta ?? 0);
          }
          continue;
        }

        {
          if (MARK_SKILL_TYPE_TO_ELEMENT[skillType]) {
            // For triggered skills (sourceType==='triggered'), log the passive event even though
            // mark state is managed by initializeIntrinsicMarkStatesFromParty.
            // For regular passives (database/style), skip silently.
            if (String(passive?.sourceType ?? '') === 'triggered') {
              const targets = resolvePassiveTargetMembers(
                state,
                member,
                part,
                options.targetCharacterId ?? null
              );
              for (const target of targets) {
                if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
                  continue;
                }
                matched = true;
                break;
              }
            }
            continue;
          }
        }

        if (skillType === 'AttackUp') {
          const amount = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          let matchedTarget = false;
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            matchedTarget = true;
          }
          if (matchedTarget) {
            matched = true;
            totalAttackUpRate += amount;
          }
          continue;
        }

        if (skillType === 'OverDrivePointUp') {
          const amount = resolveOverDrivePointUpPowerPercent(part);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (!targetCharacterIds.includes(member.characterId)) {
            continue;
          }
          turnState.odGauge = clampOdGauge(
            truncateToTwoDecimals(Number(turnState.odGauge ?? 0) + Number(amount))
          );
          matched = true;
          totalOdGaugeDelta += Number(amount);
          continue;
        }

        if (skillType === 'DebuffGuard' || skillType === 'BreakGuard') {
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const added = addGuardStatusEffect(target, part, {
              sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourceSkillName: String(passive?.name ?? ''),
              metadata: {
                timing: String(passive?.timing ?? ''),
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              },
            });
            if (!added) {
              continue;
            }
            appliedStatusEffects.push({
              characterId: String(added?.characterId ?? target.characterId),
              statusType: String(added?.statusType ?? skillType),
              exitCond: String(added?.exitCond ?? ''),
              remaining: Number(added?.remaining ?? 0),
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'Morale') {
          const amount = getMoraleAmount(part);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const change = target.applyMoraleDelta(amount);
            matched = true;
            totalMoraleDelta += Number(change?.delta ?? 0);
          }
          continue;
        }

        if (
          skillType === 'DamageRateUp' ||
          skillType === 'DefenseDown' ||
          skillType === 'DefenseUp' ||
          skillType === 'CriticalRateUp' ||
          skillType === 'CriticalDamageUp' ||
          skillType === 'GiveDefenseDebuffUp' ||
          skillType === 'DamageUpByOverDrive' ||
          skillType === 'GiveAttackBuffUp' ||
          skillType === 'GiveHealUp'
        ) {
          const amount = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          let matchedTarget = false;
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            matchedTarget = true;
          }
          if (matchedTarget) {
            matched = true;
            if (skillType === 'DamageRateUp') totalDamageRateUpRate += amount;
            else if (skillType === 'DefenseDown') totalDefenseDownRate += amount;
            else if (skillType === 'DefenseUp') totalDefenseUpRate += amount;
            else if (skillType === 'CriticalRateUp') totalCriticalRateUpRate += amount;
            else if (skillType === 'CriticalDamageUp') totalCriticalDamageUpRate += amount;
            else if (skillType === 'GiveDefenseDebuffUp') totalGiveDefenseDebuffUpRate += amount;
            else if (skillType === 'DamageUpByOverDrive') totalDamageUpByOverDriveRate += amount;
            else if (skillType === 'GiveAttackBuffUp') totalGiveAttackBuffUpRate += amount;
            else if (skillType === 'GiveHealUp') totalGiveHealUpRate += amount;
          }
          continue;
        }

        if (skillType === 'ReduceSp' || skillType === 'OverwriteSp') {
          const power = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(power) || power === 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            // ReduceSp: power[0] is the reduction amount (positive → negate)
            // OverwriteSp: power[0] is the target value → delta = target - current
            const delta =
              skillType === 'ReduceSp' ? -power : power - Number(target.sp.current ?? 0);
            const change = target.applySpDelta(delta, 'passive');
            spEvents.push({
              actorCharacterId: member.characterId,
              characterId: target.characterId,
              source: 'sp_passive',
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              targetType: String(part?.target_type ?? ''),
              ...change,
            });
            matched = true;
            totalDelta += Number(change?.delta ?? 0);
          }
          continue;
        }

        if (skillType === 'SpLimitOverwrite' || skillType === 'EpLimitOverwrite') {
          const newMax = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(newMax) || newMax <= 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const isEp = skillType === 'EpLimitOverwrite';
            const pool = isEp ? target.ep : target.sp;
            const startCurrent = Number(pool.current ?? 0);
            pool.max = newMax;
            if (pool.current > newMax) {
              pool.current = newMax;
            }
            target._revision += 1;
            const currentChange = pool.current - startCurrent;
            if (isEp) {
              epEvents.push({
                actorCharacterId: member.characterId,
                characterId: target.characterId,
                source: 'ep_passive',
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                passiveName: String(passive?.name ?? ''),
                targetType: String(part?.target_type ?? ''),
                delta: currentChange,
                startEP: startCurrent,
                endEP: pool.current,
                eventCeiling: newMax,
                epMaxChanged: newMax,
              });
              totalEpDelta += currentChange;
            } else {
              spEvents.push({
                actorCharacterId: member.characterId,
                characterId: target.characterId,
                source: 'sp_passive',
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                passiveName: String(passive?.name ?? ''),
                targetType: String(part?.target_type ?? ''),
                delta: currentChange,
                startSP: startCurrent,
                endSP: pool.current,
                eventCeiling: newMax,
                spMaxChanged: newMax,
              });
              totalDelta += currentChange;
            }
            matched = true;
          }
          continue;
        }

        if (skillType === 'TokenSet') {
          const delta = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(delta) || delta <= 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          if (targetCharacterIds.length === 0) {
            continue;
          }
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            target.applyTokenDelta(delta);
            matched = true;
          }
          continue;
        }

        const amount = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }

        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          member,
          part?.target_type,
          options.targetCharacterId ?? null
        );
        if (targetCharacterIds.length === 0) {
          continue;
        }

        for (const targetCharacterId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetCharacterId);
          if (!target) {
            continue;
          }
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
            continue;
          }
          const change = target.applySpDelta(amount, 'passive');
          spEvents.push({
            actorCharacterId: member.characterId,
            characterId: target.characterId,
            source: 'sp_passive',
            passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
            passiveName: String(passive?.name ?? ''),
            targetType: String(part?.target_type ?? ''),
            ...change,
          });
          matched = true;
          totalDelta += Number(change?.delta ?? 0);
        }
      }

      if (matched || unsupportedMatched) {
        if ((matched || unsupportedMatched) && passiveLimit > 0) {
          passiveUsageCounts[usageKey] = currentUsageCount + 1;
        }
        passiveEvents.push(
          createPassiveTriggerEvent(turnState, member, passive, {
            source: 'passive',
            effectTypes: [...effectTypes],
            spDelta: totalDelta,
            epDelta: totalEpDelta,
            dpDelta: totalDpDelta,
            motivationDelta: totalMotivationDelta,
            moraleDelta: totalMoraleDelta,
            attackUpRate: totalAttackUpRate,
            damageRateUpRate: totalDamageRateUpRate,
            defenseDownRate: totalDefenseDownRate,
            defenseUpRate: totalDefenseUpRate,
            criticalRateUpRate: totalCriticalRateUpRate,
            criticalDamageUpRate: totalCriticalDamageUpRate,
            giveDefenseDebuffUpRate: totalGiveDefenseDebuffUpRate,
            damageUpByOverDriveRate: totalDamageUpByOverDriveRate,
            giveAttackBuffUpRate: totalGiveAttackBuffUpRate,
            giveHealUpRate: totalGiveHealUpRate,
            odGaugeDelta: totalOdGaugeDelta,
            appliedStatusEffects,
            fieldEvents,
            unsupportedEffectTypes: [...unsupportedEffectTypes],
          })
        );
      }
    }
  }

  return { spEvents, epEvents, dpEvents, passiveEvents };
}

function applySkillSelfEpGains(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const member = findMemberByCharacterId(state, actionEntry.characterId);
    if (!member) {
      continue;
    }

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    for (const part of skill.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part.cond, part.hit_condition, part.target_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, member, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }
      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }

      const change = member.applyEpDelta(amount, getEpCeilingForTurn(member, state.turnState));
      events.push({
        characterId: member.characterId,
        source: 'ep_skill',
        skillId: skill.skillId,
        ...change,
      });
    }
  }
  return events;
}

function applySkillSpGains(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }

    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '') !== 'HealSp') {
        continue;
      }

      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }

      const amount = Number(part?.power?.[0] ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }

      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      if (targetCharacterIds.length === 0) {
        continue;
      }

      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const change = target.applySpDelta(amount, 'active', skill.spRecoveryCeiling);
        events.push({
          actorCharacterId: actor.characterId,
          characterId: target.characterId,
          source: 'sp_skill',
          skillId: skill.skillId,
          skillName: skill.name,
          targetType: String(part?.target_type ?? ''),
          ...change,
        });
      }
    }
  }

  return events;
}

function applyFieldStateFromActions(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }

    const skill = actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (!skillType) {
        continue;
      }
      if (skillType !== 'Zone' && !/Territory$/i.test(skillType)) {
        continue;
      }
      const conditionSkill = createConditionSkillContext(skill, part);
      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
      );
      if (!condSatisfied) {
        continue;
      }

      const applied =
        skillType === 'Zone'
          ? applyZonePartToTurnState(state.turnState, part, 'player')
          : applyTerritoryPartToTurnState(state.turnState, part, 'player');
      if (!applied) {
        continue;
      }
      if (skillType === 'Zone' && hasActiveZoneUpEternalModifier(state, actor, skill, actionEntry)) {
        const nextPowerRate = Number(applied.powerRate ?? state.turnState.zoneState?.powerRate ?? 0) + 0.15;
        applied.remainingTurns = null;
        applied.powerRate = nextPowerRate;
        state.turnState.zoneState = {
          ...state.turnState.zoneState,
          remainingTurns: null,
          powerRate: nextPowerRate,
        };
      }
      events.push({
        actorCharacterId: actor.characterId,
        skillId: skill.skillId,
        skillName: skill.name,
        kind: skillType === 'Zone' ? 'zone' : 'territory',
        ...applied,
      });
    }
  }

  return events;
}

function applyRecoveryPipeline(party, turnState) {
  const recoveryEvents = [];
  const epEvents = [];
  const dpEvents = [];
  const passiveEvents = [];
  const reviveTerritoryTrigger = captureReviveTerritoryTurnStartTrigger(party, turnState);

  for (const member of party) {
    const base = member.recoverBaseSP(BASE_SP_RECOVERY);
    recoveryEvents.push({
      characterId: member.characterId,
      source: 'base',
      ...base,
    });

    const epRole = applyRoleEpGain(member, turnState);
    if (epRole) {
      epEvents.push(epRole);
    }

    const passiveSkillEvents = applyPassiveSkillEpTurnStart(member, turnState);
    if (passiveSkillEvents.length > 0) {
      epEvents.push(...passiveSkillEvents);
    }
  }

  const intrinsicMarkRecoveryEvents = applyIntrinsicMarkTurnStartRecovery(party);
  if (intrinsicMarkRecoveryEvents.length > 0) {
    recoveryEvents.push(...intrinsicMarkRecoveryEvents);
  }

  const passiveResult = applyPassiveTimingInternal(
    {
      party,
      turnState,
    },
    TURN_START_PASSIVE_TIMINGS
  );
  if (passiveResult.spEvents.length > 0) {
    recoveryEvents.push(...passiveResult.spEvents);
  }
  if (passiveResult.epEvents.length > 0) {
    epEvents.push(...passiveResult.epEvents);
  }
  if (passiveResult.dpEvents.length > 0) {
    dpEvents.push(...passiveResult.dpEvents);
  }
  if (passiveResult.passiveEvents.length > 0) {
    passiveEvents.push(...passiveResult.passiveEvents);
  }

  if (reviveTerritoryTrigger) {
    const territoryResult = applyReviveTerritoryTurnStartEffect(party, turnState, reviveTerritoryTrigger);
    if (territoryResult.dpEvents.length > 0) {
      dpEvents.push(...territoryResult.dpEvents);
    }
    if (territoryResult.passiveEvents.length > 0) {
      passiveEvents.push(...territoryResult.passiveEvents);
    }
  }

  const isFirstOdAction =
    turnState.turnType === 'od' &&
    turnState.odLevel > 0 &&
    Number(turnState.remainingOdActions ?? 0) === Number(turnState.odLevel);
  if (isFirstOdAction) {
    const odAmount = OD_RECOVERY_BY_LEVEL[turnState.odLevel] ?? 0;
    for (const member of party) {
      const od = member.applySpDelta(odAmount, 'od');
      recoveryEvents.push({
        characterId: member.characterId,
        source: 'od',
        ...od,
      });
    }
  }

  return {
    spEvents: recoveryEvents,
    epEvents,
    dpEvents,
    passiveEvents,
  };
}

function applySwapEvents(state, swapEvents) {
  for (const swap of swapEvents) {
    const from = state.party.find((member) => member.position === swap.fromPositionIndex) ?? null;
    const to = state.party.find((member) => member.position === swap.toPositionIndex) ?? null;

    if (!from || !to) {
      throw new Error('Invalid swap event target positions.');
    }

    const fromPos = from.position;
    const toPos = to.position;
    from.setPosition(toPos);
    to.setPosition(fromPos);
  }
}

function computeNextTurnState(current, grantedExtraCharacterIds = []) {
  const next = cloneTurnState(current);
  next.sequenceId += 1;
  const hasGrantedExtra = grantedExtraCharacterIds.length > 0;
  const grantedSet = new Set(grantedExtraCharacterIds);

  if (current.turnType === 'od') {
    const remainingOdActions = Math.max(0, Number(current.remainingOdActions) - 1);
    next.remainingOdActions = remainingOdActions;

    if (hasGrantedExtra) {
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      next.odSuspended = true;
      next.extraTurnState = {
        active: true,
        remainingActions: 1,
        allowedCharacterIds: [...grantedSet],
        grantTurnIndex: current.turnIndex,
      };
      return next;
    }

    if (current.remainingOdActions > 1) {
      next.turnType = 'od';
      next.turnLabel = `OD${current.odLevel}-${current.odLevel - next.remainingOdActions + 1}`;
      return next;
    }

    next.turnType = 'normal';
    // OD終了後:
    // - preemptive は同一ターン文脈へ復帰
    // - interrupt は直前ターン処理後の割込なので次ターンへ進む
    const shouldAdvanceBaseTurn = String(current.odContext ?? '') === 'interrupt';
    next.turnIndex = Number(current.turnIndex ?? 1) + (shouldAdvanceBaseTurn ? 1 : 0);
    next.turnLabel = `T${next.turnIndex}`;
    next.odLevel = 0;
    next.remainingOdActions = 0;
    next.odContext = null;
    next.odSuspended = false;
    next.odPending = false;
    return next;
  }

  if (current.turnType === 'extra') {
    if (hasGrantedExtra) {
      // 追加ターン中にさらに追加ターンが発生した場合は、
      // 新たに付与対象となったメンバーのみを次の追加ターン対象とする。
      // (例: Self追加なら自分のみ継続)
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      next.extraTurnState = {
        active: true,
        remainingActions: 1,
        allowedCharacterIds: [...grantedSet],
        grantTurnIndex: current.turnIndex,
      };
      return next;
    }

    const extraState = current.extraTurnState;
    if (extraState && extraState.remainingActions > 1) {
      next.extraTurnState = {
        ...extraState,
        remainingActions: extraState.remainingActions - 1,
      };
      next.turnType = 'extra';
      next.turnLabel = 'EX';
      return next;
    }

    if (current.odSuspended) {
      if (Number(current.remainingOdActions) > 0) {
        const level = Number(current.odLevel > 0 ? current.odLevel : 1);
        const odStep = level - Number(current.remainingOdActions) + 1;
        next.turnType = 'od';
        next.turnLabel = `OD${level}-${odStep}`;
        next.odContext = current.odContext ?? 'preemptive';
        next.odSuspended = false;
        next.extraTurnState = null;
        return next;
      }

      // ODアクションを使い切った状態でEXが終わった場合は、
      // OD突入元の通常ターン文脈へ復帰する。
      // interrupt 文脈なら次ターンへ進む。
      next.turnType = 'normal';
      const shouldAdvanceBaseTurn = String(current.odContext ?? '') === 'interrupt';
      next.turnIndex = Number(current.turnIndex ?? 1) + (shouldAdvanceBaseTurn ? 1 : 0);
      next.turnLabel = `T${next.turnIndex}`;
      next.odLevel = 0;
      next.remainingOdActions = 0;
      next.odContext = null;
      next.odSuspended = false;
      next.odPending = false;
      next.extraTurnState = null;
      return next;
    }

    if (current.odPending) {
      const level = current.odLevel > 0 ? current.odLevel : 1;
      next.turnType = 'od';
      next.turnLabel = `OD${level}-1`;
      next.odContext = 'interrupt';
      next.odLevel = level;
      next.remainingOdActions = level;
      next.odPending = false;
      next.extraTurnState = null;
      next.odSuspended = false;
      return next;
    }

    next.turnType = 'normal';
    next.turnIndex = current.turnIndex + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.extraTurnState = null;
    next.odSuspended = false;
    return next;
  }

  if (hasGrantedExtra) {
    next.turnType = 'extra';
    next.turnLabel = 'EX';
    next.extraTurnState = {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: [...grantedSet],
      grantTurnIndex: current.turnIndex,
    };
    return next;
  }

  next.turnType = 'normal';
  next.turnIndex = current.turnIndex + 1;
  next.turnLabel = `T${next.turnIndex}`;
  return next;
}

export function createBattleStateFromParty(party, turnState) {
  const members = Array.isArray(party) ? party : party.members;
  const next = createBattleState(members, turnState);
  initializeIntrinsicMarkStatesFromParty(next.party);
  if (!next.turnState.transcendence) {
    next.turnState.transcendence = buildInitialTranscendenceStateFromParty(next.party);
  }
  const allowed = next.turnState.extraTurnState?.allowedCharacterIds ?? [];
  syncExtraActiveFlags(next.party, allowed);
  return next;
}

export function previewTurn(state, actions, enemyAction = null, enemyCount = 1, options = {}) {
  const sortedActions = validateActionDict(state, actions, options);
  const actionEntries = previewActionEntries(state, sortedActions);
  const snapBefore = snapshotPartyByPartyIndex(state.party);

  const record = fromSnapshot(
    snapBefore,
    buildTurnContext(state.turnState, enemyAction, enemyCount),
    actionEntries,
    [],
    state.turnState.sequenceId
  );

  const projectedState = {
    ...state,
    party: state.party,
    turnState: cloneTurnState(state.turnState),
  };
  const odProjection = applyOdGaugeFromActions(projectedState, record, {
    consumeStatusEffects: false,
  });
  const transcendenceSummary = applyTranscendenceTurnSummary(
    projectedState,
    computeTranscendenceTurnSummary(projectedState, record)
  );
  record.projections = {
    odGaugeAtEnd: Number(projectedState.turnState.odGauge ?? odProjection.endOdGauge ?? 0),
    transcendence: transcendenceSummary,
  };

  return record;
}

export function commitTurn(state, previewRecord, swapEvents = [], options = {}) {
  if (!previewRecord || previewRecord.recordStatus !== 'preview') {
    throw new Error('commitTurn requires preview TurnRecord.');
  }
  const applySwapOnCommit = options.applySwapOnCommit !== false;
  const interruptOdLevel = Number(options.interruptOdLevel ?? 0);
  const shouldActivateInterruptOd =
    Number.isFinite(interruptOdLevel) && interruptOdLevel >= 1 && interruptOdLevel <= 3;
  const forceOdActivation = Boolean(options.forceOdActivation ?? false);
  const forceResourceDeficit = Boolean(options.forceResourceDeficit ?? false);
  const enemyAttackTargetCharacterIds = [...new Set(
    (Array.isArray(options.enemyAttackTargetCharacterIds)
      ? options.enemyAttackTargetCharacterIds
      : [options.enemyAttackTargetCharacterIds]
    )
      .map((characterId) => String(characterId ?? '').trim())
      .filter(Boolean)
  )];
  const currentTurnPassiveEvents = Array.isArray(state.turnState?.passiveEventsLastApplied)
    ? structuredClone(state.turnState.passiveEventsLastApplied)
    : [];
  const boundaryPassiveEvents = [];
  const boundaryDpEvents = [];
  const enemyAttackEvents = [];

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    if (!member) {
      throw new Error(`Member not found: ${entry.characterId}`);
    }

    if (member.revision !== entry._baseRevision) {
      throw new Error(`State changed after preview for character ${entry.characterId}`);
    }
  }

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    member.commitSkillPreview({
      characterId: entry.characterId,
      skillId: entry.skillId,
      startSP: entry.startSP,
      endSP: entry.endSP,
      startEP: entry.startEP,
      endEP: entry.endEP,
      startToken: entry.startToken,
      endToken: entry.endToken,
      startMorale: entry.startMorale,
      endMorale: entry.endMorale,
      startMotivation: entry.startMotivation,
      endMotivation: entry.endMotivation,
      baseRevision: entry._baseRevision,
    });
  }

  const epSkillEvents = applySkillSelfEpGains(state, previewRecord);
  const skillSpEvents = applySkillSpGains(state, previewRecord);
  const actionDpEvents = applyDpEffectsFromActions(state, previewRecord);
  const tokenEvents = applyTokenEffectsFromActions(state, previewRecord, actionDpEvents);
  const moraleEvents = applyMoraleEffectsFromActions(state, previewRecord);
  const motivationEvents = applyMotivationEffectsFromActions(state, previewRecord);
  const markEvents = applyMarkEffectsFromActions(state, previewRecord);
  const fieldStateEvents = applyFieldStateFromActions(state, previewRecord);
  const funnelEvents = applyFunnelEffectsFromActions(state, previewRecord);
  const guardEvents = applyGuardEffectsFromActions(state, previewRecord);
  const enemyBreakEvents = applyEnemyBreakEffectsFromActions(state, previewRecord);
  const odGaugeGain = applyOdGaugeFromActions(state, previewRecord);
  const transcendenceSummary = applyTranscendenceTurnSummary(
    state,
    computeTranscendenceTurnSummary(state, previewRecord)
  );
  const recovery = applyRecoveryPipeline(state.party, state.turnState);
  const recoveryEvents = [...skillSpEvents, ...recovery.spEvents];
  const epEvents = [...epSkillEvents, ...recovery.epEvents];
  const recoveryDpEvents = Array.isArray(recovery.dpEvents) ? [...recovery.dpEvents] : [];

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    entry.endSP = member.sp.current;
    entry.endEP = member.ep.current;
    entry.endToken = Number(member.tokenState?.current ?? entry.endToken ?? 0);
    entry.endMorale = Number(member.moraleState?.current ?? entry.endMorale ?? 0);
    entry.endMotivation = Number(member.motivationState?.current ?? entry.endMotivation ?? 0);
    entry.endMarkStates = structuredClone(member.markStates ?? {});

    const extraChanges = recoveryEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preSP: ev.startSP,
        postSP: ev.endSP,
        eventCeiling: ev.eventCeiling,
      }));

    entry.spChanges = [...entry.spChanges, ...extraChanges];
    entry.epChanges = epEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preEP: ev.startEP,
        postEP: ev.endEP,
        eventCeiling: ev.eventCeiling,
      }));
    const extraTokenChanges = tokenEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        triggerType: ev.triggerType,
        delta: ev.delta,
        preToken: ev.startToken,
        postToken: ev.endToken,
        eventCeiling: ev.eventCeiling,
      }));
    entry.tokenChanges = [...(entry.tokenChanges ?? []), ...extraTokenChanges];
    const extraMoraleChanges = moraleEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        triggerType: ev.triggerType,
        delta: ev.delta,
        preMorale: ev.startMorale,
        postMorale: ev.endMorale,
        eventCeiling: ev.eventCeiling,
      }));
    entry.moraleChanges = [...(entry.moraleChanges ?? []), ...extraMoraleChanges];
    const extraMotivationChanges = motivationEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        triggerType: ev.triggerType,
        delta: ev.delta,
        preMotivation: ev.startMotivation,
        postMotivation: ev.endMotivation,
        eventCeiling: ev.eventCeiling,
      }));
    entry.motivationChanges = [...(entry.motivationChanges ?? []), ...extraMotivationChanges];
    const extraMarkChanges = markEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => ({
        source: ev.source,
        triggerType: ev.triggerType,
        element: ev.element,
        delta: ev.delta,
        preMark: ev.startMark,
        postMark: ev.endMark,
        eventCeiling: ev.eventCeiling,
      }));
    entry.markChanges = [...(entry.markChanges ?? []), ...extraMarkChanges];
    const actionDpChanges = actionDpEvents
      .filter((ev) => ev.actorCharacterId === entry.characterId && Number(ev.skillId ?? 0) === Number(entry.skillId))
      .map((ev) => mapDpEventToRecordChange(ev));
    const recoveryDpChanges = recoveryDpEvents
      .filter((ev) => ev.characterId === entry.characterId)
      .map((ev) => mapDpEventToRecordChange(ev));
    entry.dpChanges = [...actionDpChanges, ...recoveryDpChanges];
    const odEvent = odGaugeGain.events.find(
      (ev) => ev.characterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.odGaugeGain = Number(odEvent?.odGaugeGain ?? 0);
    entry.damageContext = odEvent?.damageContext ? structuredClone(odEvent.damageContext) : null;
    entry.funnelApplied = funnelEvents.filter(
      (ev) => ev.actorCharacterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.statusEffectsApplied = guardEvents.filter(
      (ev) => ev.actorCharacterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.fieldStateApplied = fieldStateEvents.filter(
      (ev) => ev.actorCharacterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.enemyStatusChanges = enemyBreakEvents.filter(
      (ev) => ev.actorCharacterId === entry.characterId && ev.skillId === entry.skillId
    );
    member.incrementSkillUseById(entry.skillId);
  }

  const grantedExtraCharacterIds = deriveGrantedExtraTurnCharacterIds(state, previewRecord);
  updateReinforcedModeStateAfterTurn(state);
  applyTurnBasedStatusExpiry(state, previewRecord);

  if (applySwapOnCommit) {
    applySwapEvents(state, swapEvents);
  }

  const nextTurnState = computeNextTurnState(state.turnState, grantedExtraCharacterIds);
  nextTurnState.passiveEventsLastApplied = Array.isArray(recovery.passiveEvents)
    ? structuredClone(recovery.passiveEvents)
    : [];
  if (Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0)) {
    const enemyTurnStartResult = applyPassiveTimingInternal(
      {
        ...state,
        party: state.party,
        turnState: nextTurnState,
      },
      'OnEnemyTurnStart'
    );
    const passiveEvents = Array.isArray(enemyTurnStartResult.passiveEvents)
      ? structuredClone(enemyTurnStartResult.passiveEvents)
      : [];
    const dpEvents = Array.isArray(enemyTurnStartResult.dpEvents) ? structuredClone(enemyTurnStartResult.dpEvents) : [];
    boundaryPassiveEvents.push(...passiveEvents);
    boundaryDpEvents.push(...dpEvents);
    nextTurnState.passiveEventsLastApplied = [...(nextTurnState.passiveEventsLastApplied ?? []), ...passiveEvents];
  }
  if (Number(getEnemyState(nextTurnState).enemyCount ?? 0) > 0 && countAliveEnemies(nextTurnState) === 0) {
    const battleWinResult = applyPassiveTimingInternal(
      {
        ...state,
        party: state.party,
        turnState: nextTurnState,
      },
      'OnBattleWin'
    );
    const passiveEvents = Array.isArray(battleWinResult.passiveEvents)
      ? structuredClone(battleWinResult.passiveEvents)
      : [];
    const dpEvents = Array.isArray(battleWinResult.dpEvents) ? structuredClone(battleWinResult.dpEvents) : [];
    boundaryPassiveEvents.push(...passiveEvents);
    boundaryDpEvents.push(...dpEvents);
    nextTurnState.passiveEventsLastApplied = [...(nextTurnState.passiveEventsLastApplied ?? []), ...passiveEvents];
  }

  if (shouldActivateInterruptOd) {
    // 割込ODは「現在通常ターンの後段」に差し込まれるため、
    // ODが終わるまで base turn index を進めない。
    nextTurnState.turnIndex = Number(state.turnState.turnIndex ?? nextTurnState.turnIndex ?? 1);
    if (String(nextTurnState.turnType ?? '') === 'normal') {
      nextTurnState.turnLabel = `T${nextTurnState.turnIndex}`;
    }
  }
  // Enemy statuses tick on enemy-turn consumption only.
  // In this simulator, enemy turn is consumed when base turn index advances (Tn -> Tn+1).
  if (Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0)) {
    const attackEvents = [
      ...applyEnemyAttackTokenTriggers(state, enemyAttackTargetCharacterIds),
      ...applyEnemyAttackMotivationTriggers(state, enemyAttackTargetCharacterIds),
    ];
    if (attackEvents.length > 0) {
      enemyAttackEvents.push(...attackEvents);
      boundaryPassiveEvents.push(...createEnemyAttackPassiveEvents(nextTurnState, state, attackEvents));
    }
    tickEnemyStatuses(nextTurnState);
    boundaryDpEvents.push(...applyEnemyTurnEndDpEffects(state.party));
  }
  syncExtraActiveFlags(state.party, nextTurnState.extraTurnState?.allowedCharacterIds ?? []);

  let nextState = {
    ...state,
    party: [...state.party],
    positionMap: buildPositionMap(state.party),
    turnState: nextTurnState,
  };

  if (String(nextTurnState.turnType ?? '') === 'extra') {
    const additionalTurnStartResult = applyPassiveTimingInternal(nextState, 'OnAdditionalTurnStart');
    const passiveEvents = Array.isArray(additionalTurnStartResult.passiveEvents)
      ? structuredClone(additionalTurnStartResult.passiveEvents)
      : [];
    const dpEvents = Array.isArray(additionalTurnStartResult.dpEvents)
      ? structuredClone(additionalTurnStartResult.dpEvents)
      : [];
    boundaryPassiveEvents.push(...passiveEvents);
    boundaryDpEvents.push(...dpEvents);
    nextState.turnState.passiveEventsLastApplied = [
      ...(nextState.turnState.passiveEventsLastApplied ?? []),
      ...passiveEvents,
    ];
  }

  if (shouldActivateInterruptOd) {
    nextState = activateOverdrive(nextState, interruptOdLevel, 'interrupt', {
      forceActivation: forceOdActivation,
      forceConsumeGauge: forceResourceDeficit,
    });
    if (Array.isArray(nextState.turnState?.passiveEventsLastApplied)) {
      boundaryPassiveEvents.push(...structuredClone(nextState.turnState.passiveEventsLastApplied));
    }
  }

  const snapAfter = snapshotPartyByPartyIndex(nextState.party);
  const committed = commitRecord(previewRecord, snapAfter, swapEvents);
  committed.transcendence = transcendenceSummary;
  committed.passiveEvents = structuredClone([...currentTurnPassiveEvents, ...boundaryPassiveEvents]);
  committed.dpEvents = structuredClone([...actionDpEvents, ...recoveryDpEvents, ...boundaryDpEvents]);
  committed.enemyAttackEvents = structuredClone(enemyAttackEvents);
  committed.enemyAttackTargetCharacterIds = structuredClone(enemyAttackTargetCharacterIds);
  committed.stateSnapshot = {
    markStateByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, structuredClone(m.markStates ?? {})])
    ),
    zoneState: structuredClone(nextState.turnState.zoneState ?? null),
    territoryState: structuredClone(nextState.turnState.territoryState ?? null),
    tokenStateByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, structuredClone(m.tokenState ?? { current: 0, min: 0, max: 10 })])
    ),
  };

  return {
    nextState,
    committedRecord: committed,
  };
}

export function activateOverdrive(state, level, context = 'preemptive', options = {}) {
  const numericLevel = Number(level);
  if (!OD_LEVELS.includes(numericLevel)) {
    throw new Error(`OD level must be one of ${OD_LEVELS.join(', ')}`);
  }
  const requiredGauge = getOdGaugeRequirement(numericLevel);
  const forceActivation = Boolean(options.forceActivation ?? false);
  const forceConsumeGauge = Boolean(options.forceConsumeGauge ?? false);
  const currentGauge = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));
  if (!forceActivation && currentGauge < requiredGauge) {
    throw new Error(
      `OD${numericLevel} requires ${requiredGauge}% gauge. current=${currentGauge.toFixed(2)}%`
    );
  }

  const nextGauge = forceActivation
    ? forceConsumeGauge
      ? truncateToTwoDecimals(currentGauge - requiredGauge)
      : currentGauge
    : truncateToTwoDecimals(currentGauge - requiredGauge);

  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'od',
    turnLabel: `OD${numericLevel}-1`,
    odLevel: numericLevel,
    remainingOdActions: numericLevel,
    odContext: context,
    odSuspended: false,
    odPending: false,
    odGauge: Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, nextGauge)),
  };

  const nextState = {
    ...state,
    turnState: nextTurnState,
  };
  const passiveEvents = [];

  for (const member of nextState.party) {
    const rule = getEpRule(member);
    const passiveOverdriveEpLimit = getPassiveOverdriveEpLimit(member);
    const delta = Number(rule?.onOverdriveStartEpDelta ?? 0);
    if (Number.isFinite(delta) && delta !== 0) {
      member.applyEpDelta(
        delta,
        getEpCeilingForTurn(member, nextTurnState, { passiveOverdriveEpLimit })
      );
    }
    const passiveResult = applyPassiveEpOnOverdriveStart(member, nextTurnState, {
      passiveOverdriveEpLimit,
    });
    passiveEvents.push(...passiveResult.passiveEvents);
  }
  nextState.turnState.passiveEventsLastApplied = passiveEvents;

  return nextState;
}

export function applyInitialPassiveState(state) {
  if (!state || !Array.isArray(state.party) || !state.turnState) {
    return state;
  }

  initializeIntrinsicMarkStatesFromParty(state.party);
  const battleStartResult = applyPassiveTimingInternal(state, BATTLE_START_PASSIVE_TIMINGS);
  applyIntrinsicMarkTurnStartRecovery(state.party);
  const turnStartResult = applyPassiveTimingInternal(state, TURN_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [
    ...battleStartResult.passiveEvents,
    ...turnStartResult.passiveEvents,
  ];
  return state;
}

export function applyPassiveTiming(state, timing, context = {}) {
  const timings = Array.isArray(timing) ? timing : [timing];
  const targetCharacterId =
    context && typeof context === 'object' ? String(context.targetCharacterId ?? '').trim() || null : null;
  const result = applyPassiveTimingInternal(state, timings, { targetCharacterId });
  if (state?.turnState) {
    state.turnState.passiveEventsLastApplied = Array.isArray(result.passiveEvents)
      ? structuredClone(result.passiveEvents)
      : [];
  }
  return result;
}

export function grantExtraTurn(state, allowedCharacterIds) {
  const ids = [...new Set(allowedCharacterIds ?? [])];
  const nextState = {
    ...state,
    party: state.party.map((member) => {
      member.setExtraActive(ids.includes(member.characterId));
      return member;
    }),
    turnState: {
      ...cloneTurnState(state.turnState),
      turnType: 'extra',
      turnLabel: 'EX',
      extraTurnState: {
        active: true,
        remainingActions: 1,
        allowedCharacterIds: ids,
        grantTurnIndex: state.turnState.turnIndex,
      },
    },
  };
  const additionalTurnStartResult = applyPassiveTimingInternal(nextState, 'OnAdditionalTurnStart');
  nextState.turnState.passiveEventsLastApplied = Array.isArray(additionalTurnStartResult.passiveEvents)
    ? structuredClone(additionalTurnStartResult.passiveEvents)
    : [];
  return nextState;
}
