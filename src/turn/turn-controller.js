import {
  createBattleState,
  cloneTurnState,
  snapshotPartyByPartyIndex,
  buildPositionMap,
  normalizeActionCastMetadata,
} from '../contracts/interfaces.js';
import { evaluateConditionExpression as evaluateConditionExpressionAdapter } from '../engine/condition-context-adapter.js';
import { fromSnapshot, commitRecord, buildTurnContext } from '../records/record-assembler.js';
import { buildDamageCalculationContext } from '../domain/damage-calculation-context.js';
import { buildCriticalRateBreakdown, buildDamageBreakdown } from '../domain/damage-breakdown.js';
import { cloneDpState, getDpRate } from '../domain/dp-state.js';
import {
  cloneEnemyEShieldState,
  isEnemyEShieldActive,
  normalizeEnemyEShieldElements,
  restoreEShieldStateToMax,
  restoreEShieldStateToStageMax,
} from '../domain/enemy-e-shield.js';
import {
  canEnemyHpBreak,
  cloneEnemyExtraHpGaugeState,
  decrementEnemyExtraHpGaugeState,
} from '../domain/enemy-extra-hp-gauge.js';
import {
  ENEMY_STATUS_BREAK,
  ENEMY_STATUS_SUPER_BREAK,
  ENEMY_STATUS_SUPER_BREAK_DOWN,
  ENEMY_STATUS_DEAD,
  isPersistentEnemyStatusType,
  normalizeEnemyStatusType,
} from '../domain/enemy-status.js';
import { isExSkillByLabel, isNormalAttackSkill, isPursuitOnlySkill } from '../domain/skill-classifiers.js';
import { SHREDDING_SP_MIN, shouldConsume, validateBuffMetadata } from '../domain/character-style.js';
import { isFormEntryActive } from '../domain/form-change.js';
import {
  STAGE_SETUP_ENCHANT_EFFECT_SCOPES,
  STAGE_SETUP_ENCHANT_EFFECT_TYPES,
  buildStageSetupEnchantEffectLabel,
} from '../domain/stage-setup-enchants.js';
import { compareTurnActionExecutionOrder } from './action-execution-order.js';
import {
  OD_RECOVERY_BY_LEVEL,
  OD_COST_BY_LEVEL,
  OD_GAUGE_PER_HIT_PERCENT,
  OD_GAUGE_MIN_PERCENT,
  OD_GAUGE_MAX_PERCENT,
  DEFAULT_ENEMY_COUNT,
  DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT,
  ENEMY_OD_RATE_UNIT,
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
const NORMAL_ATTACK_OD_HIT_COUNT = 3;
const TEZUKA_CHARACTER_ID = 'STezuka';
const TALISMAN_MAX_LEVEL = 10;
const TALISMAN_PENALTY_PER_LEVEL = 10;
const DISASTER_MAX_LEVEL = 10;
const DISASTER_PENALTY_PER_LEVEL = 7;
const TALISMAN_STATE_DEFAULT = Object.freeze({
  active: false,
  level: 0,
  maxLevel: TALISMAN_MAX_LEVEL,
  penaltyPerLevel: TALISMAN_PENALTY_PER_LEVEL,
});
const DISASTER_STATE_DEFAULT = Object.freeze({
  active: false,
  level: 0,
  maxLevel: DISASTER_MAX_LEVEL,
  penaltyPerLevel: DISASTER_PENALTY_PER_LEVEL,
});
const HIGH_BOOST_STATUS_TYPE = 'HighBoost';
const HIGH_BOOST_ONLY_GROUP_KEY = 'HighBoost';
const HIGH_BOOST_SP_COST_INCREASE = 2;
const HIGH_BOOST_SKILL_ATK_RATE = 1.8;
const HIGH_BOOST_ATTACK_BUFF_MULTIPLIER = 1.2;
const HIGH_BOOST_DEBUFF_MULTIPLIER = 1.2;
const HIGH_BOOST_DP_HEAL_MULTIPLIER = 1.5;
const SPRIGHTLY_STATUS_TYPE = 'Sprightly';
const SPRIGHTLY_MIN_SP_COST = 1;
const SPRIGHTLY_CONSUME_TRIGGER = 'SkillUse';
const MOCKTAIL_STATUS_TYPE = 'Mocktail';
const MOCKTAIL_BASE_HEAL_MULTIPLIER = 1;
const MOCKTAIL_DEFAULT_EXIT_COND = 'Eternal';
const MOCKTAIL_NONE_EXIT_COND = 'None';
const FOOD_BUFF_HEAL_DP_BY_DAMAGE_TRIGGER = 'HealDpByDamage';
const DP_EVENT_SOURCE_FOOD_BUFF = 'food_buff';
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
// WIP: 印Lv3の破壊率上昇量（+10%）を持つスキルの検出用。
// 現在のゲームデータに 破壊率上昇量系 skill_type は存在せず、markDestructionRateGainBonusRate の
// 威力詳細表示も未実装。将来の破壊率追跡機能追加時に有効化する想定。
const DESTRUCTION_RATE_GAIN_SKILL_TYPE_PATTERN = /DestructionRateGain/i;
const DAMAGE_AFFINITY_REFERENCE_LABELS = Object.freeze({
  Slash: '斬相性',
  Stab: '突相性',
  Strike: '打相性',
  Fire: '火属性相性',
  Ice: '氷属性相性',
  Thunder: '雷属性相性',
  Light: '光属性相性',
  Dark: '闇属性相性',
});
const DAMAGE_AFFINITY_REFERENCE_ICON_TYPES = Object.freeze({
  Slash: 'Slash',
  Stab: 'Stab',
  Strike: 'Strike',
  Fire: 'Fire',
  Ice: 'Ice',
  Thunder: 'Thunder',
  Light: 'Light',
  Dark: 'Dark',
});
const ENEMY_STATUS_DOWN_TURN = 'DownTurn';
const ENEMY_STATUS_STRONG_BREAK = ENEMY_STATUS_SUPER_BREAK;
const ENEMY_STATUS_SUPER_DOWN = ENEMY_STATUS_SUPER_BREAK_DOWN;
const ENEMY_STATUS_PROVOKE = 'Provoke';
const ENEMY_STATUS_ATTENTION = 'Attention';
const SPECIAL_BREAK_HIT_TIMING_BEFORE = 'Before';
const SPECIAL_BREAK_HIT_TIMING_AFTER = 'After';
const ENEMY_SPECIAL_STATUS_TYPE_DEFENSE_DOWN = 3;
const ENEMY_SPECIAL_STATUS_TYPE_PROVOKE = 12;
const ENEMY_SPECIAL_STATUS_TYPE_FRAGILE = 22;
const ENEMY_SPECIAL_STATUS_TYPE_ATTENTION = 57;
const ENEMY_SPECIAL_STATUS_TYPE_SUPER_DOWN = 172;
const ENEMY_SPECIAL_STATUS_TYPE_TO_NAME = Object.freeze({
  [ENEMY_SPECIAL_STATUS_TYPE_DEFENSE_DOWN]: 'DefenseDown',
  [ENEMY_SPECIAL_STATUS_TYPE_PROVOKE]: ENEMY_STATUS_PROVOKE,
  [ENEMY_SPECIAL_STATUS_TYPE_FRAGILE]: 'Fragile',
  [ENEMY_SPECIAL_STATUS_TYPE_ATTENTION]: ENEMY_STATUS_ATTENTION,
  [ENEMY_SPECIAL_STATUS_TYPE_SUPER_DOWN]: ENEMY_STATUS_SUPER_DOWN,
});
const ENEMY_STATUS_SKILL_TYPES = Object.freeze(
  new Set([
    'DefenseDown',
    'Fragile',
    'Undermine',
    'AttackDown',
    'ResistDown',
    'ResistDownOverwrite',
    'StunRandom',
    'ConfusionRandom',
    'ImprisonRandom',
    'Misfortune',
    'HealDown',
    'Hacking',
    'Cover',
    'AttackUp',
    'DefenseUp',
    ENEMY_STATUS_PROVOKE,
    ENEMY_STATUS_ATTENTION,
  ])
);
const ENEMY_STATUS_POWER_DURATION_SKILL_TYPES = Object.freeze(
  new Set([ENEMY_STATUS_PROVOKE, ENEMY_STATUS_ATTENTION, 'Misfortune', 'Cover'])
);
const HIGH_BOOST_ENEMY_DEBUFF_SKILL_TYPES = Object.freeze(
  new Set([
    'DefenseDown',
    'Fragile',
    'Undermine',
    'AttackDown',
    'ResistDown',
    'ResistDownOverwrite',
    'StunRandom',
    'ConfusionRandom',
    'ImprisonRandom',
    'Misfortune',
    'HealDown',
    'Hacking',
  ])
);
const SUPPORTED_ACTION_ENEMY_STATUS_SKILL_TYPES_FOR_REPORT = Object.freeze(
  new Set([...ENEMY_STATUS_SKILL_TYPES, 'SuperBreak', 'SuperBreakDown', 'Disaster'])
);
const SUPPORTED_PASSIVE_ENEMY_STATUS_SKILL_TYPES_FOR_REPORT = Object.freeze(
  new Set([...ENEMY_STATUS_SKILL_TYPES, 'Talisman'])
);
const ENEMY_STATUS_TARGET_TYPES = Object.freeze(new Set(['Single', 'All', 'EnemySingle', 'EnemyAll']));
const ENEMY_STATUS_REPORT_KEYWORD_RE =
  /(Down|Fragile|Undermine|Stun|Confusion|Imprison|Misfortune|Hacking|Talisman|Disaster|Cover|Poison|Paralyze|Seal|Curse|Burn|Freeze|Sleep|Bind|Silence)/i;
const ACTIVE_BUFF_STATUS_SKILL_TYPE_TO_STATUS_TYPE = Object.freeze({
  AttackUp: 'AttackUp',
  AttackUpIncludeNormal: 'AttackUp',
  DefenseUp: 'DefenseUp',
  CriticalRateUp: 'CriticalRateUp',
  CriticalDamageUp: 'CriticalDamageUp',
});
const ACTIVE_BUFF_STATUS_SKILL_TYPES = Object.freeze(
  new Set(Object.keys(ACTIVE_BUFF_STATUS_SKILL_TYPE_TO_STATUS_TYPE))
);
const SPECIAL_STATUS_TYPE_NEGATIVE_STATE = 146;
const REMOVABLE_PLAYER_DEBUFF_STATUS_TYPES = Object.freeze(
  new Set([
    'AttackDown',
    'DefenseDown',
    'CriticalRateDown',
    'CriticalDamageDown',
    'FireAttackDown',
    'IceAttackDown',
    'ThunderAttackDown',
    'LightAttackDown',
    'DarkAttackDown',
    'FireDefenseDown',
    'IceDefenseDown',
    'ThunderDefenseDown',
    'LightDefenseDown',
    'DarkDefenseDown',
    'Virus',
    'Misfortune',
    'NegativeMind',
    'NegativeState',
    `SpecialStatus_${SPECIAL_STATUS_TYPE_NEGATIVE_STATE}`,
  ])
);
const ACTIVE_BUFF_STATUS_NORMAL_ATTACK_EFFECTS = Object.freeze(new Set(['NormalBuff_Up']));
const DIRECT_DP_HEAL_SKILL_TYPES = Object.freeze(new Set(['HealDp', 'HealDpRate', 'ReviveDp', 'ReviveDpRate']));
const DIRECT_ENEMY_E_SHIELD_CHANGE_SKILL_TYPES = Object.freeze(new Set(['HealEShield', 'ReviveEShield']));
const DP_HEAL_OUTPUT_SCALED_SKILL_TYPES = Object.freeze(new Set(['HealDpRate', 'RegenerationDp']));
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
const DEFAULT_REVIVE_E_SHIELD_FLOOR = 1;
const DEFAULT_REVIVE_TERRITORY_HEAL_RATE = 0.5;
const DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE = 'DoubleActionExtraSkill';
const BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE = 'ByakkoDoubleActionAttackSkill';
const PLAYER_TURN_END_STATUS_EXPIRY_EXCLUDED_STATUS_TYPES = new Set([
  BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE,
]);
const DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING = 1;
const DOUBLE_ACTION_EXTRA_SKILL_CAST_COUNT = 2;
const DOUBLE_ACTION_EXTRA_SKILL_REQUIRED_USES = 2;
const PURSUIT_TRANSFORMED_SKILL_NAME = 'ネコジェット・シャテキ';
const PURSUIT_TRANSFORMED_SKILL_SP_COST = 10;
const PURSUIT_HIT_COUNT_BY_WEAPON_TYPE = Object.freeze({
  DoubleSword: 2,
  LargeSword: 2,
  Cannon: 3,
  Shield: 3,
  Claw: 3,
  Sword: 4,
  Gun: 1,
  Scythe: 4,
});
const PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID = Object.freeze({
  IMinase: 2,
  BIYamawaki: 3,
});
const PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY = 'pursuitTransformUsedCharacterIds';
const DOUBLE_ACTION_STATUS_TYPES = Object.freeze(
  new Set([DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE, BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE])
);
const MOTIVATION_DAMAGE_TAKEN_DELTA = -1;
const MOTIVATION_DAMAGE_TAKEN_TRIGGER_TYPE = 'MotivationDamage';
const MOTIVATION_DAMAGE_TAKEN_PASSIVE_NAME = 'Motivation';
const MOTIVATION_DAMAGE_TAKEN_PASSIVE_DESC = 'Motivation decreases when taking enemy damage';
const MOTIVATION_DP_HEAL_DELTA = 1;
const MOTIVATION_DP_HEAL_TRIGGER_TYPE = 'MotivationDpHeal';
const MOTIVATION_DP_HEAL_PASSIVE_NAME = 'Motivation';
const MOTIVATION_DP_HEAL_PASSIVE_DESC = 'Motivation increases when receiving DP heal from active skill';
const AUTO_DP_CONSUMPTION_FLOOR = 1;
const ENEMY_ATTACK_DP_DAMAGE_AMOUNT = 1;
const ENEMY_ATTACK_DP_DAMAGE_TRIGGER_TYPE = 'EnemyAttackDpDamage';
const DEFAULT_AUTO_DOWN_TURN_REMAINING = 1;
const SAME_ACTION_SUPER_BREAK_DOWN_INITIAL_REMAINING = DEFAULT_AUTO_DOWN_TURN_REMAINING;
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
const STAGE_SETUP_PASSIVE_CHARACTER_ID = 'StageSetup';
const STAGE_SETUP_PASSIVE_CHARACTER_NAME = 'Stage Setup';
const STAGE_SETUP_PASSIVE_NAME = 'Stage Setup';
const STAGE_SETUP_PASSIVE_SOURCE = 'stage_setup';
const STAGE_SETUP_PASSIVE_SOURCE_TYPE = 'stage_setup';
// パーティーメンバーのパッシブ評価順序（ゲーム内行動順: partyIndex 1 が最初に行動）
const PASSIVE_ACTION_ORDER = Object.freeze([1, 0, 2, 3, 4, 5]);
const EXTRA_ACTIVATION_STATUS_TYPE = 20;
const CONDITION_WHITESPACE_RE = /\s+/g;
const PASSIVE_VARIANT_THRESHOLD_RE = /(?:[:：]\s*)?(?:下僕|しもべ)?\s*(\d+)人/;
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
  IsShredding: Object.freeze({ tier: 'implemented', note: 'shreddingTurnsRemaining is tracked now' }),
  IsCharging: Object.freeze({ tier: 'implemented', note: 'BuffCharge special status is tracked now' }),
  IsFront: Object.freeze({ tier: 'implemented', note: 'position is tracked now' }),
  IsDead: Object.freeze({ tier: 'implemented', note: 'alive state is tracked now' }),
  IsTeam: Object.freeze({ tier: 'implemented', note: 'member team is carried from style data now' }),
  HasSkill: Object.freeze({ tier: 'implemented', note: 'member skill and triggered skill labels are tracked now' }),
  BreakDownTurn: Object.freeze({ tier: 'implemented', note: 'enemy DownTurn is tracked now' }),
  TargetBreakDownTurn: Object.freeze({
    tier: 'implemented',
    note: 'selected target enemy DownTurn is tracked now',
  }),
  RemoveDebuffCount: Object.freeze({
    tier: 'implemented',
    note: 'RemoveDebuff action result is tracked in action context now',
  }),
  ConsumeSp: Object.freeze({ tier: 'implemented', note: 'selected skill cost is tracked now' }),
  IsAttackNormal: Object.freeze({ tier: 'implemented', note: 'selected action can be checked now' }),
  IsBroken: Object.freeze({ tier: 'implemented', note: 'self flag and enemy manual Break status are tracked now' }),
  IsTalisman: Object.freeze({ tier: 'implemented', note: 'enemy talisman active state is tracked in enemyState.talismanState' }),
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
const BABIED_STATUS_TYPE = 'Babied';
const DIVA_STATUS_TYPE = 'Diva';
const SPECIAL_STATUS_TYPE_BUFF_CHARGE = 25;
const SPECIAL_STATUS_TYPE_DIVA = 144;
const SPECIAL_STATUS_TYPE_BABIED = 258;
const SPECIAL_STATUS_TYPE_CURRY = 303;
const SPECIAL_STATUS_TYPE_SHCHI = 304;
const SPECIAL_STATUS_TYPE_MOCKTAIL = 313;
const SPECIAL_STATUS_TYPE_STEAK = 330;
const SPECIAL_STATUS_TYPE_GELATO = 331;
const FOOD_BUFF_STATUS_TYPE_BY_SKILL_TYPE = Object.freeze({
  Curry: SPECIAL_STATUS_TYPE_CURRY,
  Shchi: SPECIAL_STATUS_TYPE_SHCHI,
  Steak: SPECIAL_STATUS_TYPE_STEAK,
  Gelato: SPECIAL_STATUS_TYPE_GELATO,
});
const FOOD_BUFF_SKILL_TYPES = Object.freeze(
  new Set(Object.keys(FOOD_BUFF_STATUS_TYPE_BY_SKILL_TYPE))
);
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

function isSupportedPlayerConditionFunctionSyntax(name, argRaw) {
  const key = String(name ?? '').trim();
  const arg = String(argRaw ?? '').trim();
  if (MARK_LEVEL_CONDITION_TO_ELEMENT[key]) {
    return !arg;
  }

  if (!arg) {
    return (
      key === 'BreakHitCount' ||
      key === 'OverDriveGauge' ||
      key === 'Sp' ||
      key === 'Ep' ||
      key === 'ConquestBikeLevel' ||
      key === 'Random' ||
      key === 'Token' ||
      key === 'MoraleLevel' ||
      key === 'MotivationLevel' ||
      key === 'DpRate' ||
      key === 'IsOverDrive' ||
      key === 'IsReinforcedMode' ||
      key === 'IsShredding' ||
      key === 'IsCharging' ||
      key === 'IsFront' ||
      key === 'IsDead' ||
      key === 'IsBroken' ||
      key === 'IsTalisman' ||
      key === 'IsHitWeak' ||
      key === 'IsAttackNormal' ||
      key === 'ConsumeSp' ||
      key === 'Turn' ||
      key === 'TargetBreakDownTurn' ||
      key === 'RemoveDebuffCount'
    );
  }

  if (
    key === 'IsNatureElement' ||
    key === 'IsCharacter' ||
    key === 'IsTeam' ||
    key === 'IsWeakElement' ||
    key === 'IsZone' ||
    key === 'IsTerritory' ||
    key === 'HasSkill'
  ) {
    return true;
  }

  if (key === 'SpecialStatusCountByType') {
    const typeId = Number(arg);
    return typeId === EXTRA_ACTIVATION_STATUS_TYPE || IMPLEMENTED_SPECIAL_STATUS_TYPES.has(typeId);
  }

  return false;
}

function isSupportedEnemyConditionFunctionSyntax(name, argRaw) {
  const key = String(name ?? '').trim();
  const arg = String(argRaw ?? '').trim();
  if (!arg) {
    return (
      key === 'IsPlayer' ||
      key === 'IsDead' ||
      key === 'IsBroken' ||
      key === 'BreakDownTurn' ||
      key === 'DamageRate'
    );
  }
  if (key === 'IsWeakElement') {
    return true;
  }
  if (key === 'SpecialStatusCountByType') {
    return Boolean(getEnemySpecialStatusNameByType(arg));
  }
  return false;
}

function isSupportedCountBcPlayerClauseSyntax(clause) {
  const text = String(clause ?? '').trim();
  const compact = text.replace(CONDITION_WHITESPACE_RE, '');
  if (!text) {
    return true;
  }
  if (compact === 'IsPlayer()' || compact === 'IsPlayer()==1') {
    return true;
  }
  return isSupportedConditionClauseByRuntimeSupport(text);
}

function isSupportedCountBcEnemyClauseSyntax(clause) {
  const text = String(clause ?? '').trim();
  if (!text) {
    return true;
  }

  {
    const m = text.match(FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      return isSupportedEnemyConditionFunctionSyntax(m[1], m[2]);
    }
  }

  {
    const m = text.match(REVERSE_FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      return isSupportedEnemyConditionFunctionSyntax(m[3], m[4]);
    }
  }

  {
    const m = text.match(BARE_FUNCTION_CALL_CONDITION_RE);
    if (m) {
      return isSupportedEnemyConditionFunctionSyntax(m[1], m[2]);
    }
  }

  return false;
}

function isSupportedCountBcPredicateByRuntimeSupport(innerExpression) {
  const inner = String(innerExpression ?? '').trim();
  if (!inner) {
    return false;
  }
  if (splitTopLevel(inner, '||').length > 1) {
    return false;
  }

  const clauses = splitTopLevel(inner, '&&');
  const compactClauses = clauses.map((clause) => String(clause ?? '').replace(CONDITION_WHITESPACE_RE, ''));
  if (clauses.length === 0) {
    return false;
  }

  if (compactClauses.includes('IsPlayer()==0')) {
    return clauses.every((clause) => isSupportedCountBcEnemyClauseSyntax(clause));
  }

  return clauses.every((clause) => isSupportedCountBcPlayerClauseSyntax(clause));
}

function isSupportedConditionClauseByRuntimeSupport(clause) {
  const text = String(clause ?? '').trim();
  if (!text) {
    return true;
  }

  if (text.match(PLAYED_SKILL_COUNT_CONDITION_RE)) {
    return true;
  }

  if (text.match(SPECIAL_STATUS_COUNT_BY_TYPE_CONDITION_RE)) {
    return true;
  }

  {
    const m = text.match(COUNT_BC_CONDITION_RE);
    if (m) {
      return isSupportedCountBcPredicateByRuntimeSupport(m[1]);
    }
  }

  {
    const m = text.match(FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      return isSupportedPlayerConditionFunctionSyntax(m[1], m[2]);
    }
  }

  {
    const m = text.match(REVERSE_FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      return isSupportedPlayerConditionFunctionSyntax(m[3], m[4]);
    }
  }

  {
    const m = text.match(BARE_FUNCTION_CALL_CONDITION_RE);
    if (m) {
      return isSupportedPlayerConditionFunctionSyntax(m[1], m[2]);
    }
  }

  return false;
}

export function listUnsupportedConditionClausesByRuntimeSupport(expression) {
  const text = String(expression ?? '').trim();
  if (!text) {
    return [];
  }

  const unsupported = new Set();
  const orClauses = splitTopLevel(text, '||');
  for (const orClause of orClauses) {
    const andClauses = splitTopLevel(orClause, '&&');
    for (const clause of andClauses) {
      const normalized = String(clause ?? '').trim();
      if (!normalized) {
        continue;
      }
      if (!isSupportedConditionClauseByRuntimeSupport(normalized)) {
        unsupported.add(normalized);
      }
    }
  }
  return [...unsupported];
}

export function classifyEnemyStatusPartRuntimeSupport(part, options = {}) {
  const skillType = String(part?.skill_type ?? '').trim();
  const targetType = String(part?.target_type ?? '').trim();
  const exitCond = String(part?.effect?.exitCond ?? '').trim();
  const limitType = String(part?.effect?.limitType ?? '').trim();
  const isPassiveSource = options?.isPassiveSource === true;
  const hasTimedEffect = (exitCond && exitCond !== 'None') || (limitType && limitType !== 'None');
  const hasStatusKeyword =
    ENEMY_STATUS_REPORT_KEYWORD_RE.test(skillType) || skillType === 'SuperBreak' || skillType === 'SuperBreakDown';
  const isEnemyStatusCandidate =
    Boolean(skillType) && ENEMY_STATUS_TARGET_TYPES.has(targetType) && (hasTimedEffect || hasStatusKeyword);
  if (!isEnemyStatusCandidate) {
    return {
      isEnemyStatusCandidate: false,
      supported: false,
      skillType,
      targetType,
      exitCond,
      limitType,
      sourceKind: isPassiveSource ? 'passive' : 'action',
    };
  }

  const supported = isPassiveSource
    ? SUPPORTED_PASSIVE_ENEMY_STATUS_SKILL_TYPES_FOR_REPORT.has(skillType)
    : SUPPORTED_ACTION_ENEMY_STATUS_SKILL_TYPES_FOR_REPORT.has(skillType);

  return {
    isEnemyStatusCandidate: true,
    supported,
    skillType,
    targetType,
    exitCond,
    limitType,
    sourceKind: isPassiveSource ? 'passive' : 'action',
  };
}

function isEnemyStatusTargetType(targetType) {
  return ENEMY_STATUS_TARGET_TYPES.has(String(targetType ?? '').trim());
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
    shortCharacterName: String(member?.shortName ?? member?.characterName ?? ''),
    passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
    passiveName: String(passive?.name ?? ''),
    passiveDesc: String(passive?.desc ?? ''),
    // passive 自体の sourceType/sourceMeta を継承（details で上書き可）
    sourceType: String(passive?.sourceType ?? 'style'),
    sourceMeta: passive?.sourceMeta && typeof passive.sourceMeta === 'object'
      ? structuredClone(passive.sourceMeta)
      : {},
    ...details,
  };
}

function formatStageSetupSignedNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '+0';
  }
  return numeric >= 0 ? `+${numeric}` : String(numeric);
}

function formatStageSetupSignedPercent(value) {
  return `${formatStageSetupSignedNumber(value)}%`;
}

function buildStageSetupInitialSpLabel(amount) {
  return `戦闘開始時SP${formatStageSetupSignedNumber(amount)}`;
}

function buildStageSetupInitialOdLabel(amount) {
  return `戦闘開始時ODゲージ${formatStageSetupSignedPercent(amount)}`;
}

function buildStageSetupTurnlySpLabel(scope, amount) {
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT) {
    return `毎ターン前衛のSP${formatStageSetupSignedNumber(amount)}`;
  }
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK) {
    return `毎ターン後衛のSP${formatStageSetupSignedNumber(amount)}`;
  }
  return `毎ターンSP${formatStageSetupSignedNumber(amount)}`;
}

function buildStageSetupTurnlyOdLabel(amount) {
  return `毎ターンOD${formatStageSetupSignedPercent(amount)}`;
}

function createStageSetupPassiveEvent(turnState, {
  timing,
  label,
  effectType = '',
  effectTypes = [],
  spDelta = 0,
  odGaugeDelta = 0,
} = {}) {
  return {
    turnLabel: String(turnState?.turnLabel ?? ''),
    turnType: String(turnState?.turnType ?? ''),
    timing: String(timing ?? ''),
    characterId: STAGE_SETUP_PASSIVE_CHARACTER_ID,
    characterName: STAGE_SETUP_PASSIVE_CHARACTER_NAME,
    shortCharacterName: STAGE_SETUP_PASSIVE_CHARACTER_NAME,
    passiveId: 0,
    passiveName: STAGE_SETUP_PASSIVE_NAME,
    passiveDesc: String(label ?? '').trim(),
    source: STAGE_SETUP_PASSIVE_SOURCE,
    sourceType: STAGE_SETUP_PASSIVE_SOURCE_TYPE,
    effectType: String(effectType ?? ''),
    effectTypes: Array.isArray(effectTypes) ? effectTypes.map((type) => String(type ?? '')).filter(Boolean) : [],
    spDelta: Number(spDelta ?? 0),
    odGaugeDelta: Number(odGaugeDelta ?? 0),
  };
}

export function buildStageSetupBattleStartPassiveEvents(turnState, stageSetup = {}, party = []) {
  const events = [];
  const partySize = Array.isArray(party) ? party.length : 0;
  const initialSpBonusAll = Number(stageSetup?.initialSpBonusAll ?? 0);
  if (Number.isFinite(initialSpBonusAll) && initialSpBonusAll !== 0 && partySize > 0) {
    events.push(
      createStageSetupPassiveEvent(turnState, {
        timing: 'OnBattleStart',
        label: buildStageSetupInitialSpLabel(initialSpBonusAll),
        effectType: 'initialSpBonusAll',
        effectTypes: ['HealSp'],
        spDelta: initialSpBonusAll * partySize,
      })
    );
  }

  const initialOdGauge = Number(stageSetup?.initialOdGauge ?? 0);
  if (Number.isFinite(initialOdGauge) && initialOdGauge !== 0) {
    events.push(
      createStageSetupPassiveEvent(turnState, {
        timing: 'OnBattleStart',
        label: buildStageSetupInitialOdLabel(initialOdGauge),
        effectType: 'initialOdGauge',
        effectTypes: ['OverDrivePointUp'],
        odGaugeDelta: initialOdGauge,
      })
    );
  }

  return events;
}

function buildActionEventMetadata(actionEntry) {
  if (!actionEntry || typeof actionEntry !== 'object') {
    return normalizeActionCastMetadata({});
  }
  return normalizeActionCastMetadata(actionEntry);
}

function isLastMatchingActionEntry(actionEntry, actionEntries, options = {}) {
  if (!actionEntry || !Array.isArray(actionEntries) || actionEntries.length === 0) {
    return true;
  }

  const actionCharacterId = String(actionEntry?.characterId ?? '');
  const actionSkillId = Number(actionEntry?.skillId ?? Number.NaN);
  const matchSkill = options.matchSkill === true;
  let lastMatchingEntry = null;

  for (const candidate of actionEntries) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    if (String(candidate?.characterId ?? '') !== actionCharacterId) {
      continue;
    }
    if (matchSkill && Number(candidate?.skillId ?? Number.NaN) !== actionSkillId) {
      continue;
    }
    lastMatchingEntry = candidate;
  }

  if (!lastMatchingEntry) {
    return true;
  }

  const lastActionInstanceId = String(lastMatchingEntry?.actionInstanceId ?? '');
  const actionInstanceId = String(actionEntry?.actionInstanceId ?? '');
  if (lastActionInstanceId && actionInstanceId) {
    return lastActionInstanceId === actionInstanceId;
  }
  return lastMatchingEntry === actionEntry;
}

function listMatchingActionEntries(actionEntries, options = {}) {
  if (!Array.isArray(actionEntries) || actionEntries.length === 0) {
    return [];
  }

  const characterId = String(options.characterId ?? '');
  const matchSkill = options.matchSkill === true;
  const skillId = Number(options.skillId ?? Number.NaN);

  return actionEntries.filter((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    if (String(candidate?.characterId ?? '') !== characterId) {
      return false;
    }
    if (matchSkill && Number(candidate?.skillId ?? Number.NaN) !== skillId) {
      return false;
    }
    return true;
  });
}

function resolveRecipientAllocatedActionEntry(event, actionEntries, options = {}) {
  const candidates = listMatchingActionEntries(actionEntries, options);
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const triggerActionInstanceId = String(event?.actionInstanceId ?? '');
  if (triggerActionInstanceId) {
    const triggerIndex = actionEntries.findIndex(
      (candidate) => String(candidate?.actionInstanceId ?? '') === triggerActionInstanceId
    );
    if (triggerIndex >= 0) {
      for (const candidate of candidates) {
        const candidateIndex = actionEntries.indexOf(candidate);
        if (candidateIndex >= triggerIndex) {
          return candidate;
        }
      }
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

function buildActionScopedEvent(actionEntry, event) {
  return {
    ...buildActionEventMetadata(actionEntry),
    ...event,
  };
}

function buildActionInstanceId(characterId, sequence) {
  return `${String(characterId ?? '')}:${Math.max(0, Number(sequence) || 0)}`;
}

function eventBelongsToActionEntry(actionEntry, event, options = {}) {
  if (!actionEntry || !event || typeof event !== 'object') {
    return false;
  }
  const actorKey = options.actorKey;
  const characterKey = options.characterKey;
  const skillKey = options.skillKey;
  const actionInstanceId = String(actionEntry?.actionInstanceId ?? '');
  const eventActionInstanceId = String(event?.actionInstanceId ?? '');
  if (actorKey) {
    if (String(event?.[actorKey] ?? '') !== String(actionEntry.characterId ?? '')) {
      return false;
    }
  }
  if (characterKey) {
    if (String(event?.[characterKey] ?? '') !== String(actionEntry.characterId ?? '')) {
      return false;
    }
  }
  if (skillKey) {
    if (Number(event?.[skillKey] ?? Number.NaN) !== Number(actionEntry.skillId ?? Number.NaN)) {
      return false;
    }
  }
  if (characterKey && String(event?.recordAllocation ?? '') === 'recipient') {
    const allocatedEntry = resolveRecipientAllocatedActionEntry(event, options.actionEntries, {
      characterId: String(actionEntry?.characterId ?? ''),
      skillId: Number(actionEntry?.skillId ?? Number.NaN),
      matchSkill: Boolean(skillKey),
    });
    if (!allocatedEntry) {
      return true;
    }
    const allocatedActionInstanceId = String(allocatedEntry?.actionInstanceId ?? '');
    if (allocatedActionInstanceId && actionInstanceId) {
      return allocatedActionInstanceId === actionInstanceId;
    }
    return allocatedEntry === actionEntry;
  }
  const matchedCharacterId = actorKey
    ? String(event?.[actorKey] ?? '')
    : characterKey
      ? String(event?.[characterKey] ?? '')
      : '';
  const eventActorCharacterId = String(event?.actorCharacterId ?? '');
  const isRecipientScopedCharacterEvent = Boolean(
    characterKey &&
      matchedCharacterId &&
      eventActorCharacterId &&
      eventActorCharacterId !== matchedCharacterId
  );
  const shouldGateByActionInstance = Boolean(actorKey || (characterKey && !isRecipientScopedCharacterEvent));

  if (shouldGateByActionInstance && actionInstanceId && eventActionInstanceId) {
    return actionInstanceId === eventActionInstanceId;
  }

  if (shouldGateByActionInstance && actionInstanceId && !eventActionInstanceId) {
    return isLastMatchingActionEntry(actionEntry, options.actionEntries, {
      matchSkill: Boolean(skillKey),
    });
  }

  return true;
}

function resolveHighBoostModifiersForMember(member) {
  const effect =
    typeof member?.resolveEffectiveStatusEffects === 'function'
      ? member.resolveEffectiveStatusEffects(HIGH_BOOST_STATUS_TYPE)[0] ?? null
      : null;
  if (!effect) {
    return {
      active: false,
      spCostIncrease: 0,
      skillAtkRate: 0,
      attackBuffMultiplier: 1,
      debuffMultiplier: 1,
      dpHealMultiplier: 1,
    };
  }
  return {
    active: true,
    spCostIncrease: Number(effect?.metadata?.spCostIncrease ?? HIGH_BOOST_SP_COST_INCREASE),
    skillAtkRate: Number(effect?.metadata?.skillAtkRate ?? effect?.power ?? HIGH_BOOST_SKILL_ATK_RATE),
    attackBuffMultiplier: Number(
      effect?.metadata?.attackBuffMultiplier ?? HIGH_BOOST_ATTACK_BUFF_MULTIPLIER
    ),
    debuffMultiplier: Number(effect?.metadata?.debuffMultiplier ?? HIGH_BOOST_DEBUFF_MULTIPLIER),
    dpHealMultiplier: Number(
      effect?.metadata?.dpHealMultiplier ?? effect?.metadata?.healMultiplier ?? HIGH_BOOST_DP_HEAL_MULTIPLIER
    ),
  };
}

function resolveMocktailModifiersForMember(member) {
  const effects =
    typeof member?.resolveEffectiveStatusEffects === 'function'
      ? member.resolveEffectiveStatusEffects(MOCKTAIL_STATUS_TYPE)
      : [];
  const healUpRate = (effects ?? []).reduce((maxRate, effect) => {
    const rate = Number(effect?.metadata?.healUpRate ?? effect?.power ?? 0);
    return Number.isFinite(rate) ? Math.max(maxRate, rate) : maxRate;
  }, 0);
  if (healUpRate <= 0) {
    return {
      active: false,
      healUpRate: 0,
      dpHealMultiplier: MOCKTAIL_BASE_HEAL_MULTIPLIER,
    };
  }
  return {
    active: true,
    healUpRate,
    dpHealMultiplier: truncateToTwoDecimals(MOCKTAIL_BASE_HEAL_MULTIPLIER + healUpRate),
  };
}

function resolveDpHealOutputModifiersForMember(member) {
  const highBoost = resolveHighBoostModifiersForMember(member);
  const mocktail = resolveMocktailModifiersForMember(member);
  const highBoostMultiplier = highBoost.active
    ? Number(highBoost.dpHealMultiplier ?? MOCKTAIL_BASE_HEAL_MULTIPLIER)
    : MOCKTAIL_BASE_HEAL_MULTIPLIER;
  const mocktailMultiplier = mocktail.active
    ? Number(mocktail.dpHealMultiplier ?? MOCKTAIL_BASE_HEAL_MULTIPLIER)
    : MOCKTAIL_BASE_HEAL_MULTIPLIER;
  const dpHealMultiplier = truncateToTwoDecimals(highBoostMultiplier * mocktailMultiplier);
  return {
    active: highBoost.active || mocktail.active,
    dpHealMultiplier,
    highBoost,
    mocktail,
  };
}

function resolveFoodBuffPartPower(part) {
  const value = Number(part?.power?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function resolveFoodBuffPartHealDpByDamageRate(part) {
  const value = Number(part?.value?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function resolveBabiedPartSkillAttackUpRate(part) {
  const value = Number(part?.power?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function resolveBabiedPartOdGaugeGainUpRate(part) {
  const value = Number(part?.value?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function resolveDivaPartSkillAttackUpRate(part) {
  const value = Number(part?.power?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function isFoodBuffApplicableSkill(skill, state, member) {
  if (!skill || isNormalAttackSkill(skill) || isPursuitOnlySkill(skill)) {
    return false;
  }
  return skillHasDamageParts(skill, state, member);
}

function isBabiedApplicableSkill(skill, state, member) {
  if (!skill || isNormalAttackSkill(skill) || isPursuitOnlySkill(skill)) {
    return false;
  }
  return skillHasDamageParts(skill, state, member);
}

function isDivaApplicableSkill(skill, state, member) {
  if (!skill || isNormalAttackSkill(skill) || isPursuitOnlySkill(skill)) {
    return false;
  }
  return skillHasDamageParts(skill, state, member);
}

function summarizeFoodBuffStatusEffect(effect) {
  return {
    ...summarizeActiveBuffStatusEffect(effect),
    statusTypeId: Number(effect?.metadata?.specialStatusTypeId ?? FOOD_BUFF_STATUS_TYPE_BY_SKILL_TYPE[String(effect?.statusType ?? '')] ?? 0),
    attackUpRate: Number(effect?.metadata?.attackUpRate ?? effect?.power ?? 0),
    healDpByDamageRate: Number(effect?.metadata?.healDpByDamageRate ?? 0),
  };
}

function summarizeBabiedStatusEffect(effect) {
  return {
    ...summarizeActiveBuffStatusEffect(effect),
    statusTypeId: Number(effect?.metadata?.specialStatusTypeId ?? SPECIAL_STATUS_TYPE_BABIED),
    skillAttackUpRate: Number(effect?.metadata?.skillAttackUpRate ?? effect?.power ?? 0),
    odGaugeGainUpRate: Number(effect?.metadata?.odGaugeGainUpRate ?? 0),
  };
}

function summarizeDivaStatusEffect(effect) {
  return {
    ...summarizeActiveBuffStatusEffect(effect),
    statusTypeId: Number(effect?.metadata?.specialStatusTypeId ?? SPECIAL_STATUS_TYPE_DIVA),
    skillAttackUpRate: Number(effect?.metadata?.skillAttackUpRate ?? effect?.power ?? 0),
  };
}

function resolveFoodBuffModifiersForAction(state, member, skill) {
  if (!state || !member || !isFoodBuffApplicableSkill(skill, state, member)) {
    return {
      active: false,
      attackUpRate: 0,
      healDpByDamageRate: 0,
      matchedEffects: [],
    };
  }

  const matchedEffects = [];
  let attackUpRate = 0;
  let healDpByDamageRate = 0;
  for (const statusType of FOOD_BUFF_SKILL_TYPES) {
    const effects =
      typeof member?.resolveEffectiveStatusEffects === 'function'
        ? member.resolveEffectiveStatusEffects(statusType)
        : [];
    for (const effect of effects ?? []) {
      const effectAttackUpRate = Number(effect?.metadata?.attackUpRate ?? effect?.power ?? 0);
      const effectHealDpByDamageRate = Number(effect?.metadata?.healDpByDamageRate ?? 0);
      if (Number.isFinite(effectAttackUpRate)) {
        attackUpRate += effectAttackUpRate;
      }
      if (Number.isFinite(effectHealDpByDamageRate)) {
        healDpByDamageRate += effectHealDpByDamageRate;
      }
      matchedEffects.push(summarizeFoodBuffStatusEffect(effect));
    }
  }

  return {
    active: matchedEffects.length > 0,
    attackUpRate,
    healDpByDamageRate,
    matchedEffects,
  };
}

function resolveBabiedModifiersForAction(state, member, skill) {
  if (!state || !member || !isBabiedApplicableSkill(skill, state, member)) {
    return {
      active: false,
      skillAttackUpRate: 0,
      odGaugeGainUpRate: 0,
      matchedEffects: [],
    };
  }

  const effects =
    typeof member?.resolveEffectiveStatusEffects === 'function'
      ? member.resolveEffectiveStatusEffects(BABIED_STATUS_TYPE)
      : [];
  const matchedEffects = [];
  let skillAttackUpRate = 0;
  let odGaugeGainUpRate = 0;
  for (const effect of effects ?? []) {
    const effectSkillAttackUpRate = Number(effect?.metadata?.skillAttackUpRate ?? effect?.power ?? 0);
    const effectOdGaugeGainUpRate = Number(effect?.metadata?.odGaugeGainUpRate ?? 0);
    if (Number.isFinite(effectSkillAttackUpRate)) {
      skillAttackUpRate = Math.max(skillAttackUpRate, effectSkillAttackUpRate);
    }
    if (Number.isFinite(effectOdGaugeGainUpRate)) {
      odGaugeGainUpRate = Math.max(odGaugeGainUpRate, effectOdGaugeGainUpRate);
    }
    matchedEffects.push(summarizeBabiedStatusEffect(effect));
  }

  return {
    active: matchedEffects.length > 0,
    skillAttackUpRate,
    odGaugeGainUpRate,
    matchedEffects,
  };
}

function resolveDivaModifiersForAction(state, member, skill) {
  if (!state || !member || !isDivaApplicableSkill(skill, state, member)) {
    return {
      active: false,
      skillAttackUpRate: 0,
      matchedEffects: [],
    };
  }

  const effects =
    typeof member?.resolveEffectiveStatusEffects === 'function'
      ? member.resolveEffectiveStatusEffects(DIVA_STATUS_TYPE)
      : [];
  const matchedEffects = [];
  let skillAttackUpRate = 0;
  for (const effect of effects ?? []) {
    const effectSkillAttackUpRate = Number(effect?.metadata?.skillAttackUpRate ?? effect?.power ?? 0);
    if (Number.isFinite(effectSkillAttackUpRate)) {
      skillAttackUpRate = Math.max(skillAttackUpRate, effectSkillAttackUpRate);
    }
    matchedEffects.push(summarizeDivaStatusEffect(effect));
  }

  return {
    active: matchedEffects.length > 0,
    skillAttackUpRate,
    matchedEffects,
  };
}

function applyHighBoostMultiplier(value, multiplier) {
  const numericValue = Number(value ?? 0);
  const numericMultiplier = Number(multiplier ?? 1);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  if (!Number.isFinite(numericMultiplier) || numericMultiplier === 1) {
    return numericValue;
  }
  return truncateToTwoDecimals(numericValue * numericMultiplier);
}

function scaleHighBoostDpHealAmount(actor, amount) {
  const modifiers = resolveDpHealOutputModifiersForMember(actor);
  if (!modifiers.active) {
    return Number(amount ?? 0);
  }
  return applyHighBoostMultiplier(amount, modifiers.dpHealMultiplier);
}

function resolveHighBoostAdjustedDpAmount(actor, skillType, amount) {
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }
  if (!DP_HEAL_OUTPUT_SCALED_SKILL_TYPES.has(String(skillType ?? '').trim())) {
    return numericAmount;
  }
  return scaleHighBoostDpHealAmount(actor, numericAmount);
}

function resolveNextCurrentDpForDirectChange(startDpState, skillType, amount) {
  const startCurrentDp = Number(startDpState?.currentDp ?? 0);
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(startCurrentDp)) {
    return 0;
  }
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return startCurrentDp;
  }
  if (String(skillType ?? '') === 'ReviveDp' || String(skillType ?? '') === 'ReviveDpRate') {
    return Math.max(startCurrentDp, numericAmount);
  }
  return startCurrentDp + numericAmount;
}

function resolveEnemyEShieldDirectChangeAmount(skillType, part) {
  const numericAmount = Math.max(0, Math.floor(Number(part?.power?.[0] ?? 0) || 0));
  if (String(skillType ?? '') === 'ReviveEShield') {
    return Math.max(DEFAULT_REVIVE_E_SHIELD_FLOOR, numericAmount);
  }
  return numericAmount;
}

function resolveNextEnemyEShieldCurrentForDirectChange(startEShieldState, skillType, amount) {
  const startCurrent = Math.max(0, Math.floor(Number(startEShieldState?.current ?? 0) || 0));
  const max = Math.max(0, Math.floor(Number(startEShieldState?.max ?? startCurrent) || 0));
  const numericAmount = Math.max(0, Math.floor(Number(amount ?? 0) || 0));
  if (max <= 0 || numericAmount <= 0) {
    return startCurrent;
  }
  if (String(skillType ?? '') === 'ReviveEShield') {
    return Math.min(max, Math.max(startCurrent, numericAmount));
  }
  return Math.min(max, startCurrent + numericAmount);
}

function scaleHighBoostAttackBuffPower(actor, skillType, power) {
  if (String(skillType ?? '') !== 'AttackUp' && String(skillType ?? '') !== 'AttackUpIncludeNormal') {
    return Number(power ?? 0);
  }
  const modifiers = resolveHighBoostModifiersForMember(actor);
  if (!modifiers.active) {
    return Number(power ?? 0);
  }
  return applyHighBoostMultiplier(power, modifiers.attackBuffMultiplier);
}

function scaleHighBoostEnemyDebuffPower(actor, skillType, power) {
  if (!HIGH_BOOST_ENEMY_DEBUFF_SKILL_TYPES.has(String(skillType ?? ''))) {
    return Number(power ?? 0);
  }
  const modifiers = resolveHighBoostModifiersForMember(actor);
  if (!modifiers.active) {
    return Number(power ?? 0);
  }
  return applyHighBoostMultiplier(power, modifiers.debuffMultiplier);
}

function isOverDriveActive(turnState) {
  const type = String(turnState?.turnType ?? '');
  if (type === 'od') {
    return true;
  }
  if (type !== 'extra') {
    return false;
  }
  // 割り込みOD中のEXは、残OD行動数が0でもOD文脈を維持する。
  return Boolean(turnState?.odSuspended);
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

function actionMatchesTranscendenceElement(state, actionEntry, gaugeElement) {
  const actor = findMemberByCharacterId(state, actionEntry?.characterId);
  return hasElement(actor, gaugeElement);
}

function pursuitMatchesTranscendenceElement(state, actionEntry, gaugeElement) {
  const pursuedHitCount = Math.max(0, Number(actionEntry?.pursuedHitCount ?? 0));
  if (pursuedHitCount <= 0) {
    return false;
  }
  const sourceCharacterId = String(actionEntry?.pursuitSourceCharacterId ?? '');
  if (!sourceCharacterId) {
    return false;
  }
  const pursuitActor = findMemberByCharacterId(state, sourceCharacterId);
  return hasElement(pursuitActor, gaugeElement);
}

function resolveTranscendenceMatchingUnitCount(state, previewRecord, transcendence) {
  const gaugeElement = String(transcendence?.gaugeElement ?? '');
  return (previewRecord?.actions ?? []).reduce((count, actionEntry) => {
    return (
      count +
      (actionMatchesTranscendenceElement(state, actionEntry, gaugeElement) ? 1 : 0) +
      (pursuitMatchesTranscendenceElement(state, actionEntry, gaugeElement) ? 1 : 0)
    );
  }, 0);
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
      matchingUnitCount: 0,
      reachedMaxThisTurn: false,
      odGaugeBonusPercent: 0,
    };
  }

  const gaugeElement = String(transcendence.gaugeElement ?? '');
  const maxGaugePercent = Math.max(0, Number(transcendence.maxGaugePercent ?? 100));
  const gainPerAction = Math.max(0, Number(transcendence.gainPercentPerAction ?? 0));
  const startGaugePercent = truncateToTwoDecimals(Number(transcendence.gaugePercent ?? 0));
  const matchingUnitCount = resolveTranscendenceMatchingUnitCount(state, previewRecord, transcendence);
  const gainPercent = truncateToTwoDecimals(matchingUnitCount * gainPerAction);
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
    matchingActionCount: matchingUnitCount,
    matchingUnitCount,
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

function resolveActionBaseHitCount(skill, options = {}) {
  const rawHitCount = Math.max(0, Number(resolveSkillHitCount(skill) ?? 0));
  if (!isNormalAttackSkill(skill)) {
    return rawHitCount;
  }
  if (options.forOd === true) {
    return rawHitCount > 0 ? NORMAL_ATTACK_OD_HIT_COUNT : 0;
  }
  return rawHitCount;
}

function resolveActionHitCount(skill, options = {}) {
  const baseHitCount = resolveActionBaseHitCount(skill, options);
  const funnelHitBonus = Math.max(0, Number(options?.funnelHitBonus ?? 0));
  return Math.max(0, baseHitCount + funnelHitBonus);
}

function resolveActionEShieldHitCount(actionEntry, skill) {
  const fallbackBaseHitCount = resolveActionBaseHitCount(skill);
  const baseHitCount = Math.max(
    0,
    Number.isFinite(Number(actionEntry?.skillBaseHitCount))
      ? Number(actionEntry.skillBaseHitCount)
      : fallbackBaseHitCount
  );
  const funnelHitBonus = Math.max(0, Number(actionEntry?.skillFunnelHitBonus ?? 0));
  if (isNormalAttackSkill(skill)) {
    return Math.max(0, baseHitCount + funnelHitBonus);
  }
  const resolvedSkillHitCount = Number(actionEntry?.skillHitCount ?? 0);
  if (Number.isFinite(resolvedSkillHitCount) && resolvedSkillHitCount > 0) {
    return Math.max(0, resolvedSkillHitCount);
  }
  return Math.max(0, baseHitCount + funnelHitBonus);
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

// WIP: 破壊率上昇スキル判定。現時点では常に false を返す（データに 破壊率上昇量型なし）。
function hasDestructionRateGainPartInParts(parts) {
  for (const part of parts ?? []) {
    const skillType = String(part?.skill_type ?? '').trim();
    if (DESTRUCTION_RATE_GAIN_SKILL_TYPE_PATTERN.test(skillType)) {
      return true;
    }

    if (Array.isArray(part?.strval)) {
      for (const nested of part.strval) {
        if (nested && typeof nested === 'object' && Array.isArray(nested.parts)) {
          if (hasDestructionRateGainPartInParts(nested.parts)) {
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

function resolveBestDamagePartAffinityForEnemy(state, member, skill, targetIndex) {
  const normalAttackElements =
    isNormalAttackSkill(skill) && Array.isArray(member?.normalAttackElements) ? member.normalAttackElements : [];
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member).filter((part) =>
    OD_DAMAGE_PART_TYPES.has(String(part?.skill_type ?? ''))
  );
  let bestPart = null;
  let bestRate = Number.NEGATIVE_INFINITY;
  for (const part of effectiveParts) {
    const partRate = computeEnemyEffectiveDamageRatePercentForPart(state?.turnState, targetIndex, part, {
      normalAttackElements,
    });
    if (partRate > bestRate) {
      bestRate = partRate;
      bestPart = part;
    }
  }
  const references = getDamagePartReferences(bestPart, { normalAttackElements });
  const contributions = references.map((reference) => {
    const multiplier = getEnemyResistanceRatePercent(state?.turnState, targetIndex, reference) / 100;
    return {
      reference,
      label: DAMAGE_AFFINITY_REFERENCE_LABELS[reference] ?? `${reference}相性`,
      multiplier: Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1,
      iconStatusType: DAMAGE_AFFINITY_REFERENCE_ICON_TYPES[reference] ?? '',
    };
  });
  return {
    references,
    contributions,
  };
}

function buildDamageAffinityMapsForAction(state, member, skill, effectiveDamageRatesByEnemy = {}) {
  const attackReferencesByEnemy = {};
  const affinityContributionsByEnemy = {};
  for (const targetKey of Object.keys(effectiveDamageRatesByEnemy ?? {})) {
    const targetIndex = Number(targetKey);
    if (!Number.isInteger(targetIndex) || targetIndex < 0) {
      continue;
    }
    const affinity = resolveBestDamagePartAffinityForEnemy(state, member, skill, targetIndex);
    attackReferencesByEnemy[String(targetIndex)] = affinity.references;
    affinityContributionsByEnemy[String(targetIndex)] = affinity.contributions;
  }
  return {
    attackReferencesByEnemy,
    affinityContributionsByEnemy,
  };
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
  const targetType = String(skill?.targetType ?? skill?.target_type ?? '');
  const isAllTarget = targetType === 'All' || targetType === 'EnemyAll';
  const effectiveDamageRatesByEnemy = {};
  const eligibleEnemyIndexes = [];
  let targetEnemyIndex = null;
  if (!isAllTarget) {
    targetEnemyIndex = Number.isFinite(Number(skill?.targetEnemyIndex))
      ? Number(skill.targetEnemyIndex)
      : 0;
    if (!isEnemyAlive(state?.turnState, targetEnemyIndex, numericEnemyCount)) {
      return {
        targetEnemyIndex,
        eligibleEnemyIndexes,
        effectiveDamageRatesByEnemy,
        eligibleEnemyCount: 0,
      };
    }
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
    if (!isEnemyAlive(state?.turnState, i, numericEnemyCount)) {
      continue;
    }
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
    case 'RemoveDebuffCount':
      return {
        known: true,
        value: Number(actionEntry?.removeDebuffCount ?? 0),
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
    case 'IsShredding':
      return {
        known: true,
        value: member?.isShredding ? 1 : 0,
      };
    case 'IsCharging':
      return {
        known: true,
        value: hasSpecialStatus(member, SPECIAL_STATUS_TYPE_BUFF_CHARGE) ? 1 : 0,
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
    case 'IsTalisman':
      return {
        known: true,
        value: getTalismanState(state?.turnState).active ? 1 : 0,
      };
    case 'IsHitWeak':
      return isHitWeakBySkillContext(state, member, skill, actionEntry);
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
    case 'TargetBreakDownTurn': {
      const targetIndex = getConditionTargetEnemyIndex(state, skill, actionEntry);
      if (!Number.isFinite(targetIndex) || targetIndex < 0) {
        return {
          known: false,
          value: true,
        };
      }
      return {
        known: true,
        value: isEnemyAlive(state?.turnState, targetIndex)
          ? getEnemyStatusRemainingTurns(state?.turnState, targetIndex, ENEMY_STATUS_DOWN_TURN)
          : 0,
      };
    }
    case 'Turn':
      return {
        known: true,
        value: Number(state?.turnState?.turnIndex ?? 1),
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
    case 'IsTeam':
      return {
        known: true,
        value: String(member?.team ?? '') === arg ? 1 : 0,
      };
    case 'HasSkill':
      return {
        known: true,
        value: typeof member?.hasSkillReference === 'function' && member.hasSkillReference(arg) ? 1 : 0,
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
      if (arg === 'None') {
        return {
          known: true,
          value: isFieldStateActive(getZoneState(state?.turnState)) ? 0 : 1,
        };
      }
      return {
        known: true,
        value:
          isFieldStateActive(getZoneState(state?.turnState)) &&
          String(getZoneState(state?.turnState)?.type ?? '') === arg
            ? 1
            : 0,
      };
    case 'IsTerritory':
      if (arg === 'None') {
        return {
          known: true,
          value: isFieldStateActive(getTerritoryState(state?.turnState)) ? 0 : 1,
        };
      }
      return {
        known: true,
        value:
          isFieldStateActive(getTerritoryState(state?.turnState)) &&
          String(getTerritoryState(state?.turnState)?.type ?? '') === arg
            ? 1
            : 0,
      };
    case 'SpecialStatusCountByType': {
      const typeId = Number(arg);
      if (typeId === 20) {
        return {
          known: true,
          value: member?.isExtraActive ? 1 : 0,
        };
      }
      if (IMPLEMENTED_SPECIAL_STATUS_TYPES.has(typeId)) {
        return {
          known: true,
          value: hasSpecialStatus(member, typeId) ? 1 : 0,
        };
      }
      return {
        known: false,
        value: true,
      };
    }
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

function normalizeEnemyStatusElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return [...new Set(elements.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function resolvePreferredNonDamageRangeValue(rawValue) {
  if (!Array.isArray(rawValue)) {
    const scalar = Number(rawValue);
    return Number.isFinite(scalar) ? scalar : null;
  }
  const values = rawValue
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  const nonZeroValues = values.filter((value) => value !== 0);
  if (nonZeroValues.length === 0) {
    return values[0];
  }
  return nonZeroValues.reduce((best, candidate) => {
    if (!Number.isFinite(best)) {
      return candidate;
    }
    const bestAbs = Math.abs(best);
    const candidateAbs = Math.abs(candidate);
    if (candidateAbs !== bestAbs) {
      return candidateAbs > bestAbs ? candidate : best;
    }
    return candidate;
  }, Number.NaN);
}

function isDamageLikeSkillType(skillType) {
  const normalized = String(skillType ?? '').trim().toLowerCase();
  return (
    normalized.includes('attack') ||
    normalized.includes('damage') ||
    normalized.includes('break')
  );
}

function normalizeRuntimeNonDamagePart(part) {
  if (!part || typeof part !== 'object') {
    return part;
  }

  const skillType = String(part?.skill_type ?? '').trim();
  const nestedVariants = Array.isArray(part?.strval)
    ? part.strval.map((value) =>
        value && typeof value === 'object' && Array.isArray(value.parts)
          ? {
              ...structuredClone(value),
              parts: value.parts.map((nestedPart) => normalizeRuntimeNonDamagePart(nestedPart)),
            }
          : structuredClone(value)
      )
    : part?.strval;

  if (skillType === 'SkillCondition' || skillType === 'SkillSwitch' || skillType === 'SkillRandom') {
    return {
      ...structuredClone(part),
      ...(Array.isArray(part?.strval) ? { strval: nestedVariants } : {}),
    };
  }

  if (isDamageLikeSkillType(skillType)) {
    return {
      ...structuredClone(part),
      ...(Array.isArray(part?.strval) ? { strval: nestedVariants } : {}),
    };
  }

  const normalized = {
    ...structuredClone(part),
    ...(Array.isArray(part?.strval) ? { strval: nestedVariants } : {}),
  };
  const resolvedPower = resolvePreferredNonDamageRangeValue(part?.power);
  if (Array.isArray(part?.power) && Number.isFinite(resolvedPower)) {
    normalized.power = [resolvedPower, resolvedPower];
  }
  return normalized;
}

function getEnemyStatusPowerValue(status) {
  const numeric = resolvePreferredNonDamageRangeValue(status?.power);
  return Number.isFinite(numeric) ? numeric : null;
}

function getEnemyStatusDefaultRemainingTurns(statusType, status) {
  if (ENEMY_STATUS_POWER_DURATION_SKILL_TYPES.has(String(statusType ?? ''))) {
    const fromPower = getEnemyStatusPowerValue(status);
    if (Number.isFinite(fromPower) && fromPower > 0) {
      return fromPower;
    }
  }
  return 1;
}

function normalizeEnemyStatus(status, enemyCount = null) {
  if (!status || typeof status !== 'object') {
    return null;
  }
  const statusType = normalizeEnemyStatusType(status?.statusType ?? status?.skill_type ?? '');
  if (!statusType) {
    return null;
  }
  const targetRaw = status?.targetIndex ?? status?.target ?? 0;
  const targetLowerClamped = Number.isFinite(Number(targetRaw))
    ? Math.max(0, Number(targetRaw))
    : 0;
  // enemyCount が明示的に渡された場合のみ上限クランプを適用。
  // getEnemyStatusIdentityKey / mergeEnemyStatuses 等の内部ヘルパーからは
  // enemyCount なしで呼ばれるため、既に正規化済みの targetIndex を破壊しない。
  const targetIndex = enemyCount !== null && Number.isFinite(enemyCount) && enemyCount > 0
    ? Math.min(Math.max(0, enemyCount - 1), targetLowerClamped)
    : targetLowerClamped;
  const exitCond = String(status?.exitCond ?? status?.effect?.exitCond ?? '').trim();
  const limitType = String(status?.limitType ?? status?.effect?.limitType ?? '').trim();
  const rawRemaining =
    status?.remainingTurns ??
    status?.remaining ??
    (Array.isArray(status?.effect?.exitVal) ? status.effect.exitVal[0] : undefined);
  const isAlwaysActive = exitCond === 'Eternal' || isPersistentEnemyStatusType(statusType);
  const remainingTurns = isAlwaysActive
    ? Number.isFinite(Number(rawRemaining))
      ? Number(rawRemaining)
      : 0
    : Number.isFinite(Number(rawRemaining)) && Number(rawRemaining) > 0
      ? Number(rawRemaining)
      : statusType === ENEMY_STATUS_DOWN_TURN && Number.isFinite(Number(rawRemaining)) && Number(rawRemaining) === 0
        ? 0
        : getEnemyStatusDefaultRemainingTurns(statusType, status);
  const power = getEnemyStatusPowerValue(status);
  const normalized = {
    statusType,
    targetIndex,
    remainingTurns,
  };
  if (power !== null) {
    normalized.power = power;
  }
  const elements = normalizeEnemyStatusElements(status?.elements);
  if (elements.length > 0) {
    normalized.elements = elements;
  }
  if (limitType) {
    normalized.limitType = limitType;
  }
  if (exitCond) {
    normalized.exitCond = exitCond;
  }
  const sourceSkillId =
    status?.sourceSkillId === undefined || status?.sourceSkillId === null
      ? null
      : Number(status.sourceSkillId);
  if (Number.isFinite(sourceSkillId)) {
    normalized.sourceSkillId = sourceSkillId;
  }
  const sourceSkillName = String(status?.sourceSkillName ?? '').trim();
  if (sourceSkillName) {
    normalized.sourceSkillName = sourceSkillName;
  }
  const sourceSkillLabel = String(status?.sourceSkillLabel ?? '').trim();
  if (sourceSkillLabel) {
    normalized.sourceSkillLabel = sourceSkillLabel;
  }
  const sourceCharacterName = String(status?.sourceCharacterName ?? '').trim();
  if (sourceCharacterName) {
    normalized.sourceCharacterName = sourceCharacterName;
  }
  const sourceSkillDesc = String(status?.sourceSkillDesc ?? '').trim();
  if (sourceSkillDesc) {
    normalized.sourceSkillDesc = sourceSkillDesc;
  }
  if (status?.metadata && typeof status.metadata === 'object') {
    normalized.metadata = structuredClone(status.metadata);
  }
  return normalized;
}

function getEnemyStatusIdentityKey(status) {
  const normalized = normalizeEnemyStatus(status);
  if (!normalized) {
    return '';
  }
  const elements = normalizeEnemyStatusElements(normalized.elements);
  return `${normalized.statusType}|${elements.join(',')}`;
}

function mergeEnemyStatuses(current, next) {
  const normalizedCurrent = normalizeEnemyStatus(current);
  const normalizedNext = normalizeEnemyStatus(next);
  if (!normalizedCurrent) {
    return normalizedNext;
  }
  if (!normalizedNext) {
    return normalizedCurrent;
  }
  const merged = {
    ...normalizedCurrent,
    ...normalizedNext,
    statusType: normalizedNext.statusType,
    targetIndex: normalizedNext.targetIndex,
    remainingTurns:
      Number.isFinite(Number(normalizedCurrent.remainingTurns)) && Number.isFinite(Number(normalizedNext.remainingTurns))
        ? Math.max(Number(normalizedCurrent.remainingTurns), Number(normalizedNext.remainingTurns))
        : Number(normalizedNext.remainingTurns ?? normalizedCurrent.remainingTurns ?? 0),
  };
  const currentPower = getEnemyStatusPowerValue(normalizedCurrent);
  const nextPower = getEnemyStatusPowerValue(normalizedNext);
  if (currentPower !== null || nextPower !== null) {
    merged.power =
      currentPower !== null && nextPower !== null
        ? Math.max(currentPower, nextPower)
        : nextPower ?? currentPower;
  }
  const elements = normalizeEnemyStatusElements(
    normalizedNext.elements?.length > 0 ? normalizedNext.elements : normalizedCurrent.elements
  );
  if (elements.length > 0) {
    merged.elements = elements;
  } else {
    delete merged.elements;
  }
  if (!merged.limitType) {
    delete merged.limitType;
  }
  if (!merged.exitCond) {
    delete merged.exitCond;
  }
  if (!Number.isFinite(Number(merged.sourceSkillId ?? NaN))) {
    delete merged.sourceSkillId;
  }
  if (!String(merged.sourceSkillName ?? '').trim()) {
    delete merged.sourceSkillName;
  }
  if (!String(merged.sourceSkillLabel ?? '').trim()) {
    delete merged.sourceSkillLabel;
  }
  if (!String(merged.sourceSkillDesc ?? '').trim()) {
    delete merged.sourceSkillDesc;
  }
  if (!merged.metadata) {
    delete merged.metadata;
  }
  return merged;
}

function hasOwnEnemyOverrideField(snapshot, key) {
  return Boolean(snapshot) && Object.prototype.hasOwnProperty.call(snapshot, key);
}

function cloneEnemySlotObjectMap(value, fallback = {}) {
  if (!value || typeof value !== 'object') {
    return structuredClone(fallback);
  }
  return structuredClone(value);
}

function normalizeEnemyEShieldStateEntry(value) {
  return cloneEnemyEShieldState(value);
}

function resolveEnemyEShieldStageIndex(extraHpGaugeState = null) {
  const total = Number(extraHpGaugeState?.total ?? 0);
  const remaining = Number(extraHpGaugeState?.remaining ?? 0);
  return Number.isFinite(total) && Number.isFinite(remaining) ? total - remaining : 0;
}

function resolveEnemyEShieldStageMax(maxByStage = null, stageIndex = null) {
  if (!Array.isArray(maxByStage)) {
    return null;
  }
  const index = Number(stageIndex);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  const stagedMax = Number(maxByStage[index]);
  return Number.isFinite(stagedMax) && stagedMax > 0 ? Math.floor(stagedMax) : null;
}

function normalizeEnemyEShieldStateEntryForOverride(value, currentValue = null, extraHpGaugeState = null) {
  const current = cloneEnemyEShieldState(currentValue);
  const incoming = cloneEnemyEShieldState(value);
  const currentMaxByStage = Array.isArray(current?.maxByStage) ? current.maxByStage : [];
  const incomingMaxByStage = Array.isArray(incoming?.maxByStage) ? incoming.maxByStage : [];
  const maxByStage = currentMaxByStage.length > 0 ? currentMaxByStage : incomingMaxByStage;
  const stageMax = resolveEnemyEShieldStageMax(maxByStage, resolveEnemyEShieldStageIndex(extraHpGaugeState));
  return cloneEnemyEShieldState(value, {
    ...(maxByStage.length > 0 ? { maxByStage } : {}),
    ...(stageMax !== null ? { max: stageMax } : {}),
  });
}

export function getEnemyState(turnState) {
  const state = turnState?.enemyState;
  if (!state || typeof state !== 'object') {
    return {
      enemyCount: DEFAULT_ENEMY_COUNT,
      statuses: [],
      damageRatesByEnemy: {},
      destructionRateByEnemy: {},
      destructionRateCapByEnemy: {},
      absorbElementsByEnemy: {},
      odRateByEnemy: {},
      eShieldStateByEnemy: {},
      extraHpGaugeStateByEnemy: {},
      breakStateByEnemy: {},
      enemyNamesByEnemy: {},
      paramBorderByEnemy: {},
      zoneConfigByEnemy: {},
      talismanState: structuredClone(TALISMAN_STATE_DEFAULT),
      disasterState: structuredClone(DISASTER_STATE_DEFAULT),
    };
  }
  const enemyCount = clampEnemyCount(state.enemyCount ?? DEFAULT_ENEMY_COUNT);
  return {
    enemyCount,
    statuses: Array.isArray(state.statuses)
      ? state.statuses.map((status) => normalizeEnemyStatus(status, enemyCount)).filter(Boolean)
      : [],
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
    absorbElementsByEnemy:
      state.absorbElementsByEnemy && typeof state.absorbElementsByEnemy === 'object'
        ? state.absorbElementsByEnemy
        : {},
    odRateByEnemy:
      state.odRateByEnemy && typeof state.odRateByEnemy === 'object' ? state.odRateByEnemy : {},
    eShieldStateByEnemy:
      state.eShieldStateByEnemy && typeof state.eShieldStateByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(state.eShieldStateByEnemy)
              .map(([targetIndex, shieldState]) => [String(targetIndex), normalizeEnemyEShieldStateEntry(shieldState)])
              .filter(([, shieldState]) => Boolean(shieldState))
          )
        : {},
    extraHpGaugeStateByEnemy:
      state.extraHpGaugeStateByEnemy && typeof state.extraHpGaugeStateByEnemy === 'object'
        ? Object.fromEntries(
            Object.entries(state.extraHpGaugeStateByEnemy)
              .map(([targetIndex, gaugeState]) => [String(targetIndex), cloneEnemyExtraHpGaugeState(gaugeState)])
              .filter(([, gaugeState]) => Boolean(gaugeState))
          )
        : {},
    breakStateByEnemy:
      state.breakStateByEnemy && typeof state.breakStateByEnemy === 'object' ? state.breakStateByEnemy : {},
    enemyNamesByEnemy:
      state.enemyNamesByEnemy && typeof state.enemyNamesByEnemy === 'object' ? state.enemyNamesByEnemy : {},
    paramBorderByEnemy:
      state.paramBorderByEnemy && typeof state.paramBorderByEnemy === 'object' ? state.paramBorderByEnemy : {},
    zoneConfigByEnemy:
      state.zoneConfigByEnemy && typeof state.zoneConfigByEnemy === 'object' ? state.zoneConfigByEnemy : {},
    talismanState:
      state.talismanState && typeof state.talismanState === 'object'
        ? {
            active: Boolean(state.talismanState.active),
            level: Number(state.talismanState.level ?? 0),
            maxLevel: Number(state.talismanState.maxLevel ?? TALISMAN_MAX_LEVEL),
            penaltyPerLevel: Number(state.talismanState.penaltyPerLevel ?? TALISMAN_PENALTY_PER_LEVEL),
          }
        : structuredClone(TALISMAN_STATE_DEFAULT),
    disasterState:
      state.disasterState && typeof state.disasterState === 'object'
        ? {
            active: Boolean(state.disasterState.active),
            level: Number(state.disasterState.level ?? 0),
            maxLevel: Number(state.disasterState.maxLevel ?? DISASTER_MAX_LEVEL),
            penaltyPerLevel: Number(state.disasterState.penaltyPerLevel ?? DISASTER_PENALTY_PER_LEVEL),
          }
        : structuredClone(DISASTER_STATE_DEFAULT),
  };
}

export function buildEnemyStateOverrideSnapshot(turnState) {
  const enemyState = getEnemyState(turnState);
  return {
    enemyCount: enemyState.enemyCount,
    enemyNames: structuredClone(enemyState.enemyNamesByEnemy),
    enemyParamBorders: structuredClone(enemyState.paramBorderByEnemy),
    enemyDamageRates: structuredClone(enemyState.damageRatesByEnemy),
    enemyDestructionRates: structuredClone(enemyState.destructionRateByEnemy),
    enemyDestructionRateCaps: structuredClone(enemyState.destructionRateCapByEnemy),
    enemyOdRates: structuredClone(enemyState.odRateByEnemy),
    enemyEShields: structuredClone(enemyState.eShieldStateByEnemy),
    enemyExtraHpGauges: structuredClone(enemyState.extraHpGaugeStateByEnemy),
    enemyAbsorbElements: structuredClone(enemyState.absorbElementsByEnemy),
    enemyBreakStates: structuredClone(enemyState.breakStateByEnemy),
    enemyStatuses: structuredClone(enemyState.statuses),
  };
}

export function applyEnemyStateOverrideSnapshot(turnState, snapshot = {}) {
  if (!turnState || typeof turnState !== 'object') {
    return turnState;
  }
  const current = getEnemyState(turnState);
  const nextEnemyCount = hasOwnEnemyOverrideField(snapshot, 'enemyCount')
    ? clampEnemyCount(snapshot.enemyCount)
    : current.enemyCount;
  const nextExtraHpGaugeStateByEnemy = hasOwnEnemyOverrideField(snapshot, 'enemyExtraHpGauges')
    ? Object.fromEntries(
        Object.entries(snapshot.enemyExtraHpGauges ?? {})
          .map(([targetIndex, gaugeState]) => [String(targetIndex), cloneEnemyExtraHpGaugeState(gaugeState)])
          .filter(([, gaugeState]) => Boolean(gaugeState))
      )
    : structuredClone(current.extraHpGaugeStateByEnemy);
  const nextEnemyState = {
    ...current,
    enemyCount: nextEnemyCount,
    enemyNamesByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyNames')
      ? cloneEnemySlotObjectMap(snapshot.enemyNames)
      : structuredClone(current.enemyNamesByEnemy),
    paramBorderByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyParamBorders')
      ? cloneEnemySlotObjectMap(snapshot.enemyParamBorders)
      : structuredClone(current.paramBorderByEnemy),
    damageRatesByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyDamageRates')
      ? cloneEnemySlotObjectMap(snapshot.enemyDamageRates)
      : structuredClone(current.damageRatesByEnemy),
    destructionRateByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyDestructionRates')
      ? cloneEnemySlotObjectMap(snapshot.enemyDestructionRates)
      : structuredClone(current.destructionRateByEnemy),
    destructionRateCapByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyDestructionRateCaps')
      ? cloneEnemySlotObjectMap(snapshot.enemyDestructionRateCaps)
      : structuredClone(current.destructionRateCapByEnemy),
    odRateByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyOdRates')
      ? cloneEnemySlotObjectMap(snapshot.enemyOdRates)
      : structuredClone(current.odRateByEnemy),
    eShieldStateByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyEShields')
      ? Object.fromEntries(
          Object.entries(snapshot.enemyEShields ?? {})
            .map(([targetIndex, shieldState]) => {
              const key = String(targetIndex);
              return [
                key,
                normalizeEnemyEShieldStateEntryForOverride(
                  shieldState,
                  current.eShieldStateByEnemy?.[key],
                  nextExtraHpGaugeStateByEnemy?.[key]
                ),
              ];
            })
            .filter(([, shieldState]) => Boolean(shieldState))
        )
      : structuredClone(current.eShieldStateByEnemy),
    extraHpGaugeStateByEnemy: nextExtraHpGaugeStateByEnemy,
    absorbElementsByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyAbsorbElements')
      ? cloneEnemySlotObjectMap(snapshot.enemyAbsorbElements)
      : structuredClone(current.absorbElementsByEnemy),
    breakStateByEnemy: hasOwnEnemyOverrideField(snapshot, 'enemyBreakStates')
      ? cloneEnemySlotObjectMap(snapshot.enemyBreakStates)
      : structuredClone(current.breakStateByEnemy),
    statuses: hasOwnEnemyOverrideField(snapshot, 'enemyStatuses')
      ? (Array.isArray(snapshot.enemyStatuses)
          ? snapshot.enemyStatuses.map((status) => normalizeEnemyStatus(status, nextEnemyCount)).filter(Boolean)
          : [])
      : current.statuses.map((status) => normalizeEnemyStatus(status, nextEnemyCount)).filter(Boolean),
  };
  turnState.enemyState = {
    ...(turnState.enemyState && typeof turnState.enemyState === 'object' ? turnState.enemyState : {}),
    ...nextEnemyState,
  };
  turnState.enemyState.allEnemiesDefeated =
    nextEnemyCount > 0 && countAliveEnemies({ enemyState: turnState.enemyState }) === 0;
  return turnState;
}

function syncTurnStateEnemyCount(turnState, enemyCount) {
  if (!turnState || typeof turnState !== 'object') {
    return turnState;
  }
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  const currentEnemyState =
    turnState.enemyState && typeof turnState.enemyState === 'object' ? turnState.enemyState : {};
  if (Number(currentEnemyState.enemyCount ?? DEFAULT_ENEMY_COUNT) === normalizedEnemyCount) {
    return turnState;
  }
  turnState.enemyState = {
    ...currentEnemyState,
    enemyCount: normalizedEnemyCount,
  };
  turnState.enemyState.allEnemiesDefeated =
    normalizedEnemyCount > 0 && countAliveEnemies({ enemyState: turnState.enemyState }, normalizedEnemyCount) === 0;
  return turnState;
}

function getEnemyLeveledFieldState(turnState, stateKey, fallbackState) {
  const raw = turnState?.enemyState?.[stateKey];
  if (!raw || typeof raw !== 'object') {
    return { ...fallbackState };
  }
  return {
    active: Boolean(raw.active),
    level: Math.max(0, Number(raw.level ?? 0)),
    maxLevel: Math.max(1, Number(raw.maxLevel ?? fallbackState.maxLevel)),
    penaltyPerLevel: Math.max(0, Number(raw.penaltyPerLevel ?? fallbackState.penaltyPerLevel)),
  };
}

function setEnemyLeveledFieldState(turnState, stateKey, next, fallbackState) {
  if (!turnState.enemyState || typeof turnState.enemyState !== 'object') {
    turnState.enemyState = {};
  }
  const maxLevel = Math.max(1, Number(next.maxLevel ?? fallbackState.maxLevel));
  turnState.enemyState[stateKey] = {
    active: Boolean(next.active),
    level: Math.max(0, Math.min(maxLevel, Number(next.level ?? 0))),
    maxLevel,
    penaltyPerLevel: Math.max(0, Number(next.penaltyPerLevel ?? fallbackState.penaltyPerLevel)),
  };
}

function createEnemyLeveledFieldEvent(kind, change, options = {}) {
  if (!change) {
    return null;
  }
  return {
    kind: String(kind ?? ''),
    source: String(options.source ?? ''),
    activeBefore: Boolean(change.before?.active),
    activeAfter: Boolean(change.after?.active),
    levelBefore: Number(change.before?.level ?? 0),
    levelAfter: Number(change.after?.level ?? 0),
    levelDelta: Number(change.levelDelta ?? 0),
    maxLevel: Number(change.after?.maxLevel ?? change.before?.maxLevel ?? 0),
  };
}

function applyEnemyLeveledFieldChange(turnState, stateKey, fallbackState, options = {}) {
  const currentState = getEnemyLeveledFieldState(turnState, stateKey, fallbackState);
  const requiresActive = Boolean(options.requiresActive);
  if (requiresActive && !currentState.active) {
    return null;
  }

  const activateOnApply = Boolean(options.activateOnApply);
  const levelDelta = Math.max(0, Number(options.levelDelta ?? 0));
  const nextActive = activateOnApply ? true : currentState.active;
  const baseLevel = currentState.active ? currentState.level : 0;
  const nextLevel = nextActive ? Math.min(currentState.maxLevel, baseLevel + levelDelta) : 0;

  if (nextActive === currentState.active && nextLevel === currentState.level) {
    return null;
  }

  const nextState = {
    ...currentState,
    active: nextActive,
    level: nextLevel,
  };
  setEnemyLeveledFieldState(turnState, stateKey, nextState, fallbackState);
  return {
    before: currentState,
    after: getEnemyLeveledFieldState(turnState, stateKey, fallbackState),
    levelDelta: nextLevel - currentState.level,
  };
}

function buildEnemyLeveledPenaltyMaps(turnState, enemyCount, stateKey, fallbackState, levelMapKey) {
  const fieldState = getEnemyLeveledFieldState(turnState, stateKey, fallbackState);
  const numericEnemyCount = clampEnemyCount(enemyCount);
  const levelMap = {};
  const penaltyMap = {};
  if (!fieldState.active || fieldState.level <= 0) {
    return { [levelMapKey]: levelMap, enemyAllAbilityDownByEnemy: penaltyMap };
  }
  const penalty = fieldState.level * fieldState.penaltyPerLevel;
  for (let index = 0; index < numericEnemyCount; index += 1) {
    if (!isEnemyAlive(turnState, index, numericEnemyCount)) {
      continue;
    }
    levelMap[String(index)] = fieldState.level;
    penaltyMap[String(index)] = penalty;
  }
  return { [levelMapKey]: levelMap, enemyAllAbilityDownByEnemy: penaltyMap };
}

function getTalismanState(turnState) {
  return getEnemyLeveledFieldState(turnState, 'talismanState', TALISMAN_STATE_DEFAULT);
}

function setTalismanState(turnState, next) {
  setEnemyLeveledFieldState(turnState, 'talismanState', next, TALISMAN_STATE_DEFAULT);
}

function createTalismanFieldEvent(change, options = {}) {
  return createEnemyLeveledFieldEvent('talisman', change, options);
}

function applyTalismanChange(turnState, options = {}) {
  return applyEnemyLeveledFieldChange(turnState, 'talismanState', TALISMAN_STATE_DEFAULT, {
    ...options,
    activateOnApply: Boolean(options.activateOnApply),
  });
}

function buildEnemyTalismanMaps(turnState, enemyCount = DEFAULT_ENEMY_COUNT) {
  return buildEnemyLeveledPenaltyMaps(
    turnState,
    enemyCount,
    'talismanState',
    TALISMAN_STATE_DEFAULT,
    'enemyTalismanLevelByEnemy'
  );
}

function getDisasterState(turnState) {
  return getEnemyLeveledFieldState(turnState, 'disasterState', DISASTER_STATE_DEFAULT);
}

function setDisasterState(turnState, next) {
  setEnemyLeveledFieldState(turnState, 'disasterState', next, DISASTER_STATE_DEFAULT);
}

function createDisasterFieldEvent(change, options = {}) {
  return createEnemyLeveledFieldEvent('disaster', change, options);
}

function applyDisasterChange(turnState, options = {}) {
  return applyEnemyLeveledFieldChange(turnState, 'disasterState', DISASTER_STATE_DEFAULT, {
    ...options,
    activateOnApply: options.activateOnApply !== false,
  });
}

function buildEnemyDisasterMaps(turnState, enemyCount = DEFAULT_ENEMY_COUNT) {
  return buildEnemyLeveledPenaltyMaps(
    turnState,
    enemyCount,
    'disasterState',
    DISASTER_STATE_DEFAULT,
    'enemyDisasterLevelByEnemy'
  );
}

function buildEnemyAllAbilityPenaltyMaps(turnState, enemyCount = DEFAULT_ENEMY_COUNT) {
  const talismanMaps = buildEnemyTalismanMaps(turnState, enemyCount);
  const disasterMaps = buildEnemyDisasterMaps(turnState, enemyCount);
  const enemyAllAbilityDownByEnemy = { ...disasterMaps.enemyAllAbilityDownByEnemy };
  for (const [targetIndex, penalty] of Object.entries(talismanMaps.enemyAllAbilityDownByEnemy)) {
    const currentPenalty = Number(enemyAllAbilityDownByEnemy[targetIndex] ?? 0);
    enemyAllAbilityDownByEnemy[targetIndex] = Math.max(currentPenalty, Number(penalty ?? 0));
  }
  return {
    enemyTalismanLevelByEnemy: talismanMaps.enemyTalismanLevelByEnemy,
    enemyDisasterLevelByEnemy: disasterMaps.enemyDisasterLevelByEnemy,
    enemyAllAbilityDownByEnemy,
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
  // RiceFieldZone は専用 skill_type による稲穂フィールド
  if (String(part?.skill_type ?? '').trim() === 'RiceFieldZone') {
    return 'RiceField';
  }
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
  const power = resolvePreferredNonDamageRangeValue(part?.power);
  return Number.isFinite(power) ? power : null;
}

function resolveTerritoryPowerRate(part) {
  const power = resolvePreferredNonDamageRangeValue(part?.power);
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
    isTriggeredSkillPassive: true,
    cardForm: String(skill.cardForm ?? skill.card_form ?? ''),
    sourceMeta:
      skill.sourceMeta && typeof skill.sourceMeta === 'object' ? structuredClone(skill.sourceMeta) : null,
    labels: null,
    parts: Array.isArray(skill.parts) ? skill.parts : [],
  };
}

function getConfiguredPassivesForMember(member) {
  return (Array.isArray(member?.passives) ? member.passives : []).filter((passive) =>
    isFormEntryActive(member, passive)
  );
}

function getPassiveEntriesForMember(member) {
  const entries = [...getConfiguredPassivesForMember(member)];
  for (const skill of member?.triggeredSkills ?? []) {
    const passiveLike = toPassiveLikeEntryFromTriggeredSkill(skill);
    if (passiveLike && isFormEntryActive(member, passiveLike)) {
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

function resolveZoneUpEternalModifier(state, member, skill = null, actionEntry = null) {
  let powerBonusRate = 0;
  const sourceParts = [];
  for (const { passive, part } of resolveZoneUpEternalParts(member)) {
    const timing = String(passive?.timing ?? '').trim();
    // ZoneUpEternal applies at battle-start timings (always active) or player-turn timings
    // (condition evaluated at zone-deployment time, e.g. MoraleLevel()>=6 on OnPlayerTurnStart)
    const isValidTiming =
      timing === 'OnBattleStart' ||
      timing === 'OnFirstBattleStart' ||
      timing === 'OnPlayerTurnStart' ||
      timing === 'OnEveryTurn';
    if (!isValidTiming) {
      continue;
    }
    if (!evaluatePassiveSelfConditions(passive, part, state, member, skill, actionEntry)) {
      continue;
    }
    const partPower = Number(part?.power?.[0] ?? 0);
    powerBonusRate += Number.isFinite(partPower) ? partPower : 0;
    sourceParts.push({ passive, part });
  }
  return {
    active: sourceParts.length > 0,
    powerBonusRate,
    makesFiniteZoneEternal: sourceParts.length > 0,
    sourceParts,
  };
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
  const normalizedElement = String(element ?? '').trim().toLowerCase();
  const absorbElements = enemyState.absorbElementsByEnemy?.[enemyKey];
  if (normalizedElement && Array.isArray(absorbElements) && absorbElements.includes(normalizedElement)) {
    return 0;
  }
  const rates = enemyState.damageRatesByEnemy?.[enemyKey];
  if (!rates || typeof rates !== 'object') {
    return DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
  }
  const matchedEntry = Object.entries(rates).find(
    ([key]) => String(key ?? '').trim().toLowerCase() === normalizedElement
  );
  const value = Number(matchedEntry?.[1]);
  return Number.isFinite(value) ? value : DEFAULT_ENEMY_RESISTANCE_RATE_PERCENT;
}

export function isEnemyWeakToElement(turnState, targetIndex, element) {
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

export function getConditionTargetEnemyIndex(state, skill, actionEntry) {
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

function getConditionSkillElements(skill, member = null) {
  const explicit = Array.isArray(skill?.__conditionElements) ? skill.__conditionElements : null;
  if (explicit && explicit.length > 0) {
    return [...new Set(explicit.map((element) => String(element ?? '').trim()).filter(Boolean))];
  }
  const part = skill?.__conditionPart;
  const partElements = Array.isArray(part?.elements) ? part.elements : null;
  if (partElements && partElements.length > 0) {
    return [...new Set(partElements.map((element) => String(element ?? '').trim()).filter(Boolean))];
  }
  if (isNormalAttackSkill(skill)) {
    return normalizeStatusEffectElements(member?.normalAttackElements);
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

export function isHitWeakBySkillContext(state, member, skill, actionEntry) {
  const targetIndex = getConditionTargetEnemyIndex(state, skill, actionEntry);
  if (!Number.isFinite(targetIndex) || targetIndex < 0) {
    return { known: false, value: true };
  }
  if (actionTreatsEShieldAsWeakHit(state, member, skill, actionEntry, [targetIndex])) {
    return { known: true, value: 1 };
  }
  const elements = getConditionSkillElements(skill, member).filter((element) => element && element !== 'None');
  if (elements.length === 0) {
    return { known: true, value: 0 };
  }
  return {
    known: true,
    value: elements.some((element) => isEnemyWeakToElement(state?.turnState, targetIndex, element)) ? 1 : 0,
  };
}

function resolveWeakHitTargetEnemyIndexes(state, skill, actionEntry) {
  const actionTarget = Number(actionEntry?.targetEnemyIndex);
  if (Number.isInteger(actionTarget) && actionTarget >= 0) {
    return [actionTarget];
  }

  const targetType = String(skill?.targetType ?? skill?.target_type ?? '').trim();
  if (targetType !== 'All' && targetType !== 'EnemyAll') {
    return [];
  }

  const enemyState = getEnemyState(state?.turnState);
  const targetIndexes = [];
  for (let index = 0; index < enemyState.enemyCount; index += 1) {
    if (!isEnemyDead(state?.turnState, index)) {
      targetIndexes.push(index);
    }
  }
  return targetIndexes;
}

function actionHitsEnemyWeakness(state, actor, skill, actionEntry) {
  if (!state || !actor || !skill) {
    return false;
  }
  const effectiveSkill =
    actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
      ? actionEntry._effectiveSkillSnapshot
      : resolveEffectiveSkillForAction(state, actor, skill);
  const targetEnemyIndexes = resolveWeakHitTargetEnemyIndexes(state, effectiveSkill ?? skill, actionEntry);
  if (targetEnemyIndexes.length === 0) {
    return false;
  }
  if (actionTreatsEShieldAsWeakHit(state, actor, effectiveSkill ?? skill, actionEntry, targetEnemyIndexes)) {
    return true;
  }

  const normalAttackElements =
    isNormalAttackSkill(effectiveSkill ?? skill) && Array.isArray(actor?.normalAttackElements)
      ? actor.normalAttackElements
      : [];
  for (const part of Array.isArray(effectiveSkill?.parts) ? effectiveSkill.parts : []) {
    const skillType = String(part?.skill_type ?? '').trim();
    if (!OD_DAMAGE_PART_TYPES.has(skillType)) {
      continue;
    }
    const references = getDamagePartReferences(part, { normalAttackElements })
      .map((reference) => String(reference ?? '').trim())
      .filter((reference) => reference && reference !== 'None');
    if (references.length === 0) {
      continue;
    }
    for (const targetIndex of targetEnemyIndexes) {
      if (references.some((reference) => isEnemyWeakToElement(state.turnState, targetIndex, reference))) {
        return true;
      }
    }
  }
  return false;
}

function normalizeActionElementReferences(skill, member, state) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
  const normalAttackElements =
    isNormalAttackSkill(skill) && Array.isArray(member?.normalAttackElements) ? member.normalAttackElements : [];
  const references = [];
  for (const part of effectiveParts) {
    const skillType = String(part?.skill_type ?? '').trim();
    if (!OD_DAMAGE_PART_TYPES.has(skillType)) {
      continue;
    }
    for (const reference of getDamagePartReferences(part, { normalAttackElements })) {
      const normalized = String(reference ?? '').trim().toLowerCase();
      if (normalized) {
        references.push(normalized);
      }
    }
  }
  return [...new Set(references)];
}

function actionMatchesEnemyEShield(actionElementReferences, eShieldState) {
  const shieldElements = new Set(
    normalizeEnemyEShieldElements(eShieldState?.elements).map((element) => String(element).toLowerCase())
  );
  if (shieldElements.size === 0) {
    return false;
  }
  return actionElementReferences.some((element) => shieldElements.has(element));
}

function skillHasIgnoreEShieldElementPart(skill, state = null, actor = null) {
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  return effectiveParts.some(
    (part) => String(part?.skill_type ?? '').trim() === 'IgnoreEShieldElement'
  );
}

function actionTreatsEShieldAsWeakHit(state, actor, skill, actionEntry, targetEnemyIndexes = []) {
  if (!state || !actor || !skill || !Array.isArray(targetEnemyIndexes) || targetEnemyIndexes.length === 0) {
    return false;
  }
  const effectiveSkill =
    actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
      ? actionEntry._effectiveSkillSnapshot
      : resolveEffectiveSkillForAction(state, actor, skill);
  if (!skillHasIgnoreEShieldElementPart(effectiveSkill ?? skill, state, actor)) {
    return false;
  }
  return targetEnemyIndexes.some((targetIndex) =>
    isEnemyEShieldActive(getEnemyEShieldStateByTarget(state.turnState, targetIndex))
  );
}

export function getEnemyDestructionRatePercent(turnState, targetIndex) {
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

function getEnemyEShieldStateByTarget(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  return cloneEnemyEShieldState(enemyState.eShieldStateByEnemy?.[String(Number(targetIndex))]);
}

function getEnemyExtraHpGaugeStateByTarget(turnState, targetIndex) {
  const enemyState = getEnemyState(turnState);
  return cloneEnemyExtraHpGaugeState(enemyState.extraHpGaugeStateByEnemy?.[String(Number(targetIndex))]);
}

function setEnemyEShieldStateByTarget(turnState, targetIndex, state) {
  const enemyState = getEnemyState(turnState);
  const next = { ...(enemyState.eShieldStateByEnemy ?? {}) };
  const key = String(Number(targetIndex));
  const normalized = cloneEnemyEShieldState(state);
  if (normalized) {
    next[key] = normalized;
  } else {
    delete next[key];
  }
  turnState.enemyState = {
    ...enemyState,
    eShieldStateByEnemy: next,
  };
}

function setEnemyExtraHpGaugeStateByTarget(turnState, targetIndex, state) {
  const enemyState = getEnemyState(turnState);
  const next = { ...(enemyState.extraHpGaugeStateByEnemy ?? {}) };
  const key = String(Number(targetIndex));
  const normalized = cloneEnemyExtraHpGaugeState(state);
  if (normalized) {
    next[key] = normalized;
  } else {
    delete next[key];
  }
  turnState.enemyState = {
    ...enemyState,
    extraHpGaugeStateByEnemy: next,
  };
}

function restoreEnemyEShieldToMax(turnState, targetIndex) {
  const current = getEnemyEShieldStateByTarget(turnState, targetIndex);
  const extraHpGaugeState = getEnemyExtraHpGaugeStateByTarget(turnState, targetIndex);
  const restored = restoreEShieldStateToStageMax(
    current,
    resolveEnemyEShieldStageIndex(extraHpGaugeState)
  ) ?? restoreEShieldStateToMax(current);
  if (!restored) {
    return false;
  }
  if (Number(current?.current ?? 0) === restored.current) {
    return false;
  }
  setEnemyEShieldStateByTarget(turnState, targetIndex, restored);
  return true;
}

function restoreEnemyEShieldAfterHpBreak(turnState, targetIndex) {
  const current = getEnemyEShieldStateByTarget(turnState, targetIndex);
  if (!current) {
    return null;
  }
  const extraHpGaugeState = getEnemyExtraHpGaugeStateByTarget(turnState, targetIndex);
  const stageIndex = resolveEnemyEShieldStageIndex(extraHpGaugeState);
  const restored = restoreEShieldStateToStageMax(current, stageIndex);
  setEnemyEShieldStateByTarget(turnState, targetIndex, restored);
  return restored;
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

function upsertEnemyStatus(turnState, status, enemyCountOverride = null) {
  const enemyState = getEnemyState(turnState);
  const normalizedEnemyCount = clampEnemyCount(
    enemyCountOverride ?? enemyState.enemyCount
  );
  const normalized = normalizeEnemyStatus(status, normalizedEnemyCount);
  if (!normalized) {
    return;
  }
  const normalizedLimitType = String(normalized?.limitType ?? '').trim();
  if (normalizedLimitType === 'Default') {
    turnState.enemyState = {
      ...enemyState,
      enemyCount: normalizedEnemyCount,
      statuses: [...enemyState.statuses, normalized],
    };
    return;
  }
  const targetIndex = Number(normalized.targetIndex ?? 0);
  const identityKey = getEnemyStatusIdentityKey(normalized);
  const matched = enemyState.statuses.find(
    (current) =>
      Number(current?.targetIndex ?? -1) === targetIndex && getEnemyStatusIdentityKey(current) === identityKey
  );
  const nextStatuses = enemyState.statuses.filter(
    (current) =>
      Number(current?.targetIndex ?? -1) !== targetIndex || getEnemyStatusIdentityKey(current) !== identityKey
  );
  nextStatuses.push(mergeEnemyStatuses(matched, normalized));
  turnState.enemyState = {
    ...enemyState,
    enemyCount: normalizedEnemyCount,
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

function resetEnemyHpBreakPhaseState(turnState, targetIndex) {
  setEnemyDestructionRatePercent(turnState, targetIndex, DEFAULT_DESTRUCTION_RATE_PERCENT);
  deleteEnemyDestructionRateCapPercent(turnState, targetIndex);
  setEnemyBreakStateByTarget(turnState, targetIndex, null);
  removeEnemyStatuses(turnState, targetIndex, [
    ENEMY_STATUS_BREAK,
    ENEMY_STATUS_DOWN_TURN,
    ENEMY_STATUS_STRONG_BREAK,
    ENEMY_STATUS_SUPER_DOWN,
  ]);
}

function applyEnemyStrongBreakState(turnState, targetIndex, options = {}) {
  if (!hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_BREAK) || hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_STRONG_BREAK)) {
    return null;
  }
  const elements = normalizeEnemyStatusElements(options?.elements);
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
    ...(elements.length > 0 ? { elements } : {}),
  });
  return {
    targetIndex,
    statusType: ENEMY_STATUS_STRONG_BREAK,
    destructionRateCap: getEnemyDestructionRateCapPercent(turnState, targetIndex),
    ...(elements.length > 0 ? { elements } : {}),
  };
}

function applyEnemySuperDownState(turnState, targetIndex, options = {}) {
  if (hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_SUPER_DOWN)) {
    return null;
  }
  const elements = normalizeEnemyStatusElements(options?.elements);
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
    ...(elements.length > 0 ? { elements } : {}),
  });
  return {
    targetIndex,
    statusType: ENEMY_STATUS_SUPER_DOWN,
    destructionRateBefore: currentRate,
    destructionRateAfter: getEnemyDestructionRatePercent(turnState, targetIndex),
    destructionRateCap: getEnemyDestructionRateCapPercent(turnState, targetIndex),
    ...(elements.length > 0 ? { elements } : {}),
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
  const statusType = normalizeEnemyStatusType(status?.statusType);
  const exitCond = String(status?.exitCond ?? '');
  return exitCond === 'Eternal' || isPersistentEnemyStatusType(statusType);
}

function isEnemyStatusActive(status) {
  if (isEnemyStatusPersistent(status)) {
    return true;
  }
  const remaining = Number(status?.remainingTurns ?? 0);
  // DownTurn は remaining=0 も 1 ターン保持（ダウン状態の最終ターン）
  if (normalizeEnemyStatusType(status?.statusType) === ENEMY_STATUS_DOWN_TURN) {
    return remaining >= 0;
  }
  return remaining > 0;
}

function getActiveEnemyStatuses(turnState, statusType) {
  const key = normalizeEnemyStatusType(statusType);
  if (!key) {
    return [];
  }
  return getEnemyState(turnState).statuses.filter(
    (status) => normalizeEnemyStatusType(status?.statusType) === key && isEnemyStatusActive(status)
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

function resolveEffectiveEnemyCount(turnState, enemyCountOverride = null) {
  return clampEnemyCount(enemyCountOverride ?? getEnemyState(turnState).enemyCount);
}

function getDeadEnemyTargetIndexesWithOverride(turnState, enemyCountOverride = null) {
  const enemyState = getEnemyState(turnState);
  const effectiveEnemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  const targets = new Set();
  for (const status of getActiveEnemyStatuses(turnState, ENEMY_STATUS_DEAD)) {
    const idx = Number(status?.targetIndex ?? -1);
    if (!Number.isFinite(idx) || idx < 0 || idx >= enemyState.enemyCount || idx >= effectiveEnemyCount) {
      continue;
    }
    targets.add(idx);
  }
  return targets;
}

export function isEnemyDead(turnState, targetIndex, enemyCountOverride = null) {
  const idx = Number(targetIndex);
  const effectiveEnemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  if (!Number.isFinite(idx) || idx < 0 || idx >= effectiveEnemyCount) {
    return false;
  }
  return getDeadEnemyTargetIndexesWithOverride(turnState, effectiveEnemyCount).has(idx);
}

export function isEnemyAlive(turnState, targetIndex, enemyCountOverride = null) {
  const idx = Number(targetIndex);
  const effectiveEnemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  if (!Number.isFinite(idx) || idx < 0 || idx >= effectiveEnemyCount) {
    return false;
  }
  return !isEnemyDead(turnState, idx, effectiveEnemyCount);
}

export function isEnemyBroken(turnState, targetIndex, enemyCountOverride = null) {
  const idx = Number(targetIndex);
  const effectiveEnemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  if (!Number.isFinite(idx) || idx < 0 || idx >= effectiveEnemyCount) {
    return false;
  }
  if (!isEnemyAlive(turnState, idx, effectiveEnemyCount)) {
    return false;
  }
  return hasEnemyStatus(turnState, idx, ENEMY_STATUS_BREAK);
}

export function countAliveEnemies(turnState, enemyCountOverride = null) {
  const enemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  const deadTargets = getDeadEnemyTargetIndexesWithOverride(turnState, enemyCount);
  let count = 0;
  for (let i = 0; i < enemyCount; i += 1) {
    if (!deadTargets.has(i)) {
      count += 1;
    }
  }
  return count;
}

export function getAliveEnemyIndexes(turnState, enemyCountOverride = null) {
  const enemyCount = resolveEffectiveEnemyCount(turnState, enemyCountOverride);
  const indexes = [];
  for (let i = 0; i < enemyCount; i += 1) {
    if (isEnemyAlive(turnState, i, enemyCount)) {
      indexes.push(i);
    }
  }
  return indexes;
}

export function areAllAliveEnemiesDownTurn(turnState, enemyCountOverride = null) {
  const aliveIndexes = getAliveEnemyIndexes(turnState, enemyCountOverride);
  if (aliveIndexes.length === 0) {
    return false;
  }
  return aliveIndexes.every((idx) => hasEnemyStatus(turnState, idx, ENEMY_STATUS_DOWN_TURN));
}

function clearHoldUpIfAllDownConditionLost(turnState) {
  if (turnState?.holdUpActive && !areAllAliveEnemiesDownTurn(turnState)) {
    turnState.holdUpActive = false;
  }
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

export function getEnemyStatusRemainingTurns(turnState, targetIndex, statusType) {
  const target = Number(targetIndex);
  let remainingTurns = 0;
  for (const status of getActiveEnemyStatuses(turnState, statusType)) {
    if (Number(status?.targetIndex ?? -1) !== target) {
      continue;
    }
    remainingTurns = Math.max(remainingTurns, Number(status?.remainingTurns ?? 0));
  }
  return remainingTurns;
}

function getEnemySpecialStatusNameByType(typeId) {
  return ENEMY_SPECIAL_STATUS_TYPE_TO_NAME[Number(typeId)] ?? null;
}

export function hasEnemySpecialStatusByType(turnState, targetIndex, typeId) {
  const numericTypeId = Number(typeId);
  const statusType = getEnemySpecialStatusNameByType(numericTypeId);
  if (!statusType) {
    return false;
  }
  if (hasEnemyStatus(turnState, targetIndex, statusType)) {
    return true;
  }
  if (numericTypeId === ENEMY_SPECIAL_STATUS_TYPE_SUPER_DOWN) {
    return Boolean(getEnemyBreakStateByTarget(turnState, targetIndex)?.superDown);
  }
  return false;
}

function getAliveEnemyTargetIndexes(state, enemyCountOverride = null) {
  const enemyCount = clampEnemyCount(
    enemyCountOverride ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  const targets = [];
  for (let i = 0; i < enemyCount; i += 1) {
    if (isEnemyAlive(state?.turnState, i, enemyCount)) {
      targets.push(i);
    }
  }
  return targets;
}

function getFirstAliveEnemyTargetIndex(state, preferredTargetIndex = 0) {
  const preferred = Number(preferredTargetIndex);
  if (
    Number.isFinite(preferred) &&
    isEnemyAlive(state?.turnState, preferred, state?.turnState?.enemyState?.enemyCount)
  ) {
    return preferred;
  }
  return getAliveEnemyTargetIndexes(state)[0] ?? null;
}

function getActionTargetEnemyIndexes(state, actionEntry, skill) {
  const targetType = String(skill?.targetType ?? skill?.target_type ?? actionEntry?.skillTargetType ?? '');
  const enemyCount = clampEnemyCount(
    state?.turnState?.enemyState?.enemyCount ?? actionEntry?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  if (targetType === 'All' || targetType === 'EnemyAll') {
    return getAliveEnemyTargetIndexes(state, enemyCount);
  }
  const targetEnemyIndex = Number.isFinite(Number(actionEntry?.targetEnemyIndex))
    ? Number(actionEntry.targetEnemyIndex)
    : 0;
  return isEnemyAlive(state?.turnState, targetEnemyIndex) ? [targetEnemyIndex] : [];
}

function getPassiveTargetEnemyIndexes(state, part, preferredTargetEnemyIndex = 0) {
  const targetType = String(part?.target_type ?? '').trim();
  if (!isEnemyStatusTargetType(targetType)) {
    return [];
  }
  if (targetType === 'All' || targetType === 'EnemyAll') {
    return getAliveEnemyTargetIndexes(state);
  }
  const targetIndex = getFirstAliveEnemyTargetIndex(state, preferredTargetEnemyIndex);
  return targetIndex === null ? [] : [targetIndex];
}

function getNestedSkillVariants(part) {
  return Array.isArray(part?.strval)
    ? part.strval.filter((value) => value && typeof value === 'object' && Array.isArray(value.parts))
    : [];
}

function selectDeterministicEnemyStatusVariant(part, variants) {
  if (variants.length === 0) {
    return null;
  }
  const skillType = String(part?.skill_type ?? '').trim();
  if (skillType === 'SkillSwitch') {
    return variants[0];
  }
  if (skillType === 'SkillRandom') {
    const successRate = Number(part?.power?.[0] ?? 0);
    if (Number.isFinite(successRate) && successRate >= 0.5) {
      return variants[0];
    }
    return variants[1] ?? variants[0];
  }
  return null;
}

function collectEnemyStatusActionParts(skill, state, actor) {
  const resolvedSkill = resolveEffectiveSkillForAction(state, actor, skill) ?? skill;
  const collected = [];

  const visitPart = (part) => {
    if (!part || typeof part !== 'object') {
      return;
    }
    const skillType = String(part?.skill_type ?? '').trim();
    const targetType = String(part?.target_type ?? '').trim();
    if (ENEMY_STATUS_SKILL_TYPES.has(skillType) && isEnemyStatusTargetType(targetType)) {
      collected.push(part);
      return;
    }
    const selectedVariant = selectDeterministicEnemyStatusVariant(part, getNestedSkillVariants(part));
    if (!selectedVariant) {
      return;
    }
    const resolvedVariant = resolveEffectiveSkillForAction(state, actor, selectedVariant) ?? selectedVariant;
    for (const nestedPart of resolvedVariant.parts ?? []) {
      visitPart(nestedPart);
    }
  };

  for (const part of resolvedSkill?.parts ?? []) {
    visitPart(part);
  }
  return collected;
}

function getTokenSetAmount(part) {
  const amount =
    resolvePreferredNonDamageRangeValue(part?.power) ??
    Number(part?.value?.[0] ?? 0);
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
  const rate = resolvePreferredNonDamageRangeValue(part?.power);
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

function createEnemyAttackDpEvent(target, startDpState, endDpState) {
  const startState = cloneDpState(startDpState ?? target?.dpState ?? {});
  const endState = cloneDpState(endDpState ?? target?.dpState ?? {});
  return {
    actorCharacterId: null,
    characterId: target.characterId,
    source: 'enemy_attack',
    skillId: 0,
    skillName: '',
    skillType: ENEMY_ATTACK_DP_DAMAGE_TRIGGER_TYPE,
    triggerType: ENEMY_ATTACK_DP_DAMAGE_TRIGGER_TYPE,
    delta: Number(endState.currentDp ?? 0) - Number(startState.currentDp ?? 0),
    startDpState: startState,
    endDpState: endState,
    startDpRate: getDpRate(startState),
    endDpRate: getDpRate(endState),
    eventCeiling: Number(endState.effectiveDpCap ?? endState.baseMaxDp ?? 0),
    isAmountResolved: true,
    targetType: 'AllySingle',
    targetCondition: '',
  };
}

function createFoodBuffDamageHealEvent(actor, skill, actionEntry, foodBuffModifiers) {
  const startDpState = cloneDpState(actor?.dpState ?? {});
  const endDpState = cloneDpState(startDpState);
  return buildActionScopedEvent(actionEntry, {
    actorCharacterId: actor.characterId,
    characterId: actor.characterId,
    source: DP_EVENT_SOURCE_FOOD_BUFF,
    skillId: Number(skill?.skillId ?? skill?.id ?? 0),
    skillName: String(skill?.name ?? ''),
    skillType: FOOD_BUFF_HEAL_DP_BY_DAMAGE_TRIGGER,
    triggerType: DP_EVENT_KINDS.DAMAGE_BASED_HEAL,
    delta: 0,
    startDpState,
    endDpState,
    startDpRate: getDpRate(startDpState),
    endDpRate: getDpRate(endDpState),
    eventCeiling: Number(endDpState.effectiveDpCap ?? endDpState.baseMaxDp ?? 0),
    isAmountResolved: false,
    targetType: 'Self',
    targetCondition: '',
    healDpByDamageRate: Number(foodBuffModifiers?.healDpByDamageRate ?? 0),
    foodBuffAttackUpRate: Number(foodBuffModifiers?.attackUpRate ?? 0),
    foodBuffStatusEffects: structuredClone(foodBuffModifiers?.matchedEffects ?? []),
  });
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
    ...(Number.isFinite(Number(event.healDpByDamageRate))
      ? { healDpByDamageRate: Number(event.healDpByDamageRate) }
      : {}),
    ...(Number.isFinite(Number(event.foodBuffAttackUpRate))
      ? { foodBuffAttackUpRate: Number(event.foodBuffAttackUpRate) }
      : {}),
    ...(Array.isArray(event.foodBuffStatusEffects)
      ? { foodBuffStatusEffects: structuredClone(event.foodBuffStatusEffects) }
      : {}),
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

        if (skillType === 'HealDpRate' || skillType === 'ReviveDpRate') {
          const rate = Number(part?.power?.[0] ?? 0);
          const amount = Number.isFinite(rate) && rate > 0 ? Number(startDpState.baseMaxDp ?? 0) * rate : 0;
          const healedAmount = resolveHighBoostAdjustedDpAmount(actor, skillType, amount);
          const change = target.setDpState({
            currentDp: resolveNextCurrentDpForDirectChange(startDpState, skillType, healedAmount),
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
          const healedAmount = resolveHighBoostAdjustedDpAmount(actor, skillType, DEFAULT_REVIVE_DP_FLOOR);
          const change = target.setDpState({
            currentDp: resolveNextCurrentDpForDirectChange(startDpState, skillType, healedAmount),
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
            power: resolveHighBoostAdjustedDpAmount(actor, skillType, Number(part?.power?.[0] ?? 0)),
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
          buildActionScopedEvent(
            actionEntry,
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
          )
        );
      }
    }

    const foodBuffModifiers = resolveFoodBuffModifiersForAction(state, actor, skill);
    const hasFoodBuffDamageHeal =
      foodBuffModifiers.active && Number(foodBuffModifiers.healDpByDamageRate ?? 0) > 0;
    if (hasFoodBuffDamageHeal && getActionTargetEnemyIndexes(state, actionEntry, skill).length > 0) {
      events.push(createFoodBuffDamageHealEvent(actor, skill, actionEntry, foodBuffModifiers));
    }
  }

  return events;
}

function applyEnemyTurnEndDpEffects(party = []) {
  const events = [];
  const actionContext = buildActionContext('TurnEnd', null, { turnPhase: 'EnemyTurnEnd' });

  for (const member of party) {
    const regenEffects = member
      .resolveEffectiveStatusEffects('RegenerationDp')
      .filter((effect) => String(effect?.exitCond ?? '') === 'EnemyTurnEnd');
    const regenEffectById = new Map(
      regenEffects.map((effect) => [Number(effect.effectId ?? 0), structuredClone(effect)])
    );
    const tickedEffects = member.tickStatusEffectsWhere(
      (effect) => shouldConsume(effect, actionContext).shouldConsume
    );
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
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'token_skill',
            skillId: skill.skillId,
            skillName: skill.name,
            triggerType: 'TokenSet',
            ...change,
          })
        );
      }
    }

    if (skillHasDamageParts(skill, state, actor)) {
      const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, skill);
      const hitEnemyCount = targetEnemyIndexes.length;
      if (hitEnemyCount > 0) {
        for (const passive of getConfiguredPassivesForMember(actor)) {
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
            events.push(
              buildActionScopedEvent(actionEntry, {
                actorCharacterId: actor.characterId,
                characterId: actor.characterId,
                source: 'token_passive',
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                passiveName: String(passive?.name ?? ''),
                triggerType: 'TokenSetByAttacking',
                hitEnemyCount,
                ...change,
              })
            );
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
      for (const passive of getConfiguredPassivesForMember(target)) {
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
          events.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              characterId: target.characterId,
              source: 'token_passive',
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              triggerType: 'TokenSetByHealedDp',
              skillId: skill.skillId,
              skillName: skill.name,
              ...change,
            })
          );
        }
      }
    }
  }

  return events;
}

function getMoraleAmount(part) {
  const value =
    resolvePreferredNonDamageRangeValue(part?.power) ??
    Number(part?.value?.[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getMotivationTargetLevel(part) {
  const candidates = [part?.value?.[0], resolvePreferredNonDamageRangeValue(part?.power)];
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
  const enabledElements = resolveIntrinsicMarkEnabledElementsFromParty(party);
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
      if (!markState || !memberElements.has(element) || !enabledElements.has(element)) {
        continue;
      }
      if (Number(markState.current ?? 0) > 0) {
        continue;
      }
      markState.current = Number(elementCounts[element] ?? 0);
    }
  }
}

function resolveIntrinsicMarkEnabledElementsFromParty(party = []) {
  const enabledElements = new Set();
  for (const member of party ?? []) {
    for (const passive of getPassiveEntriesForMember(member)) {
      const timing = String(passive?.timing ?? '').trim();
      if (!BATTLE_START_PASSIVE_TIMINGS.includes(timing)) {
        continue;
      }
      for (const part of passive?.parts ?? []) {
        const element = MARK_SKILL_TYPE_TO_ELEMENT[String(part?.skill_type ?? '').trim()];
        if (element) {
          enabledElements.add(element);
        }
      }
    }
  }
  return enabledElements;
}

function resolveIntrinsicMarkModifiersForMember(member) {
  if (!member) {
    return {
      attackUpRate: 0,
      damageTakenDownRate: 0,
      destructionRateGainBonusRate: 0,
      criticalRateUp: 0,
      criticalDamageUp: 0,
      matchedElements: [],
    };
  }

  let attackUpRate = 0;
  let damageTakenDownRate = 0;
  let destructionRateGainBonusRate = 0;
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
      destructionRateGainBonusRate += Number(config.destructionRateGainBonusRateAtLevel3 ?? 0);
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
    destructionRateGainBonusRate,
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

// RECEIVER基準のSP回復トリガーパッシブを処理する。
// 「お裾分け」「愛嬌」等: 自身以外の味方スキルで自身のSPが上昇したとき発動するパッシブ。
// applyMoralePassiveTriggerEffects がACTOR基準なのに対し、こちらはターゲット側から走査する。
function applyReceiverSpHealPassiveTriggers(state, actor, skill, actionEntry) {
  const spEvents = [];
  const passiveTriggerEvents = [];

  // アクターのスキルに HealSp (non-Self) parts があるか先に確認（なければ早期リターン）
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  const healSpParts = effectiveParts.filter(
    (ep) => String(ep?.skill_type ?? '') === 'HealSp' && String(ep?.target_type ?? '') !== 'Self'
  );
  if (healSpParts.length === 0) {
    return { spEvents, passiveTriggerEvents };
  }

  // 全パーティメンバー（actor 除く）を走査
  for (const member of state?.party ?? []) {
    if (member.characterId === actor.characterId) {
      continue; // 自身スキルによる自身SP上昇は「お裾分け」の対象外
    }

    // このメンバーがアクターのスキルの SP 回復ターゲットに含まれるか確認
    const isSpTarget = healSpParts.some((ep) => {
      const targets = resolveSupportTargetCharacterIds(
        state,
        actor,
        ep?.target_type,
        actionEntry?.targetCharacterId
      );
      return targets.includes(member.characterId);
    });
    if (!isSpTarget) {
      continue;
    }

    // このメンバーが AdditionalHitOnHealedSpWithoutSelfHeal パッシブを持つか確認
    for (const passive of getConfiguredPassivesForMember(member)) {
      const timing = String(passive?.timing ?? '').trim();
      if (
        timing !== 'OnFirstBattleStart' &&
        timing !== 'OnBattleStart' &&
        timing !== 'OnPlayerTurnStart'
      ) {
        continue;
      }
      const parts = Array.isArray(passive?.parts) ? passive.parts : [];
      const hasTrigger = parts.some(
        (p) => String(p?.skill_type ?? '') === 'AdditionalHitOnHealedSpWithoutSelfHeal'
      );
      if (!hasTrigger) {
        continue;
      }

      // パッシブ条件評価
      const conditions = [passive?.condition]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);
      const condSatisfied = conditions.every((expr) => {
        const evaluated = evaluateConditionExpression(expr, state, member, null, actionEntry);
        return evaluated.unknownCount === 0 && evaluated.result;
      });
      if (!condSatisfied) {
        continue;
      }

      // 効果パートを適用（HealSp / OverDrivePointUp）
      let fired = false;
      const firedEffectTypes = [];
      for (const part of parts) {
        const partType = String(part?.skill_type ?? '');

        if (partType === 'HealSp') {
          const amount = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          // SP上限突破対応: value[0] をイベント上限として使用（例: SP30まで上限突破可）
          const spCeiling = Number(part?.value?.[0] ?? 0);
          const skillCeiling = Number.isFinite(spCeiling) && spCeiling > 0 ? spCeiling : null;
          const targetIds = resolveSupportTargetCharacterIds(state, member, part?.target_type, null);
          for (const targetId of targetIds) {
            const target = findMemberByCharacterId(state, targetId);
            if (!target) {
              continue;
            }
            // source='active' + skillCeiling でイベント上限を制御し、返り値の source は sp_passive で上書き
            const change = target.applySpDelta(amount, 'active', skillCeiling);
            spEvents.push(
              buildActionScopedEvent(actionEntry, {
                actorCharacterId: member.characterId,
                characterId: target.characterId,
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                passiveName: String(passive?.name ?? ''),
                recordAllocation: 'recipient',
                triggerType: 'SpPassiveTrigger',
                skillId: skill.skillId,
                skillName: skill.name,
                ...change,
                source: 'sp_passive',
              })
            );
          }
          if (!firedEffectTypes.includes('HealSp')) firedEffectTypes.push('HealSp');
          fired = true;
          continue;
        }

        if (partType === 'OverDrivePointUp') {
          const amount = resolveOverDrivePointUpPowerPercent(part);
          if (!Number.isFinite(amount) || amount === 0) {
            continue;
          }
          const targetIds = resolveSupportTargetCharacterIds(state, member, part?.target_type, null);
          if (targetIds.includes(member.characterId)) {
            state.turnState.odGauge = clampOdGauge(
              truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0) + Number(amount))
            );
            if (!firedEffectTypes.includes('OverDrivePointUp')) firedEffectTypes.push('OverDrivePointUp');
            fired = true;
          }
          continue;
        }
      }

      if (fired) {
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, member, passive, {
              source: 'passive_trigger',
              effectTypes: firedEffectTypes,
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
            })
          )
        );
      }
    }
  }

  return { spEvents, passiveTriggerEvents };
}

// Zone展開スキル使用時に AdditionalHitOnZone パッシブを全メンバーに適用する。
// 「味方がフィールドを展開した時」= RECEIVER-based（applyReceiverSpHealPassiveTriggers と同構造）。
// actor 自身も対象（自分がZone展開しても自分のパッシブが発動する）。
function applyReceiverZonePassiveTriggers(state, actor, skill, actionEntry) {
  const spEvents = [];
  const passiveTriggerEvents = [];

  // アクターのスキルに Zone 系 parts があるか先に確認（なければ早期リターン）
  const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
  const ZONE_SKILL_TYPES = new Set(['Zone', 'ZoneUpEternal', 'RiceFieldZone']);
  const hasZonePart = effectiveParts.some((ep) => ZONE_SKILL_TYPES.has(String(ep?.skill_type ?? '')));
  if (!hasZonePart) {
    return { spEvents, passiveTriggerEvents };
  }

  // 全パーティメンバー（actor 含む）を走査
  for (const member of state?.party ?? []) {
    // このメンバーが AdditionalHitOnZone パッシブを持つか確認
    for (const passive of getConfiguredPassivesForMember(member)) {
      const timing = String(passive?.timing ?? '').trim();
      if (
        timing !== 'OnFirstBattleStart' &&
        timing !== 'OnBattleStart' &&
        timing !== 'OnPlayerTurnStart'
      ) {
        continue;
      }
      const parts = Array.isArray(passive?.parts) ? passive.parts : [];
      const hasTrigger = parts.some(
        (p) => String(p?.skill_type ?? '') === 'AdditionalHitOnZone'
      );
      if (!hasTrigger) {
        continue;
      }

      // パッシブ条件評価
      const conditions = [passive?.condition]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean);
      const condSatisfied = conditions.every((expr) => {
        const evaluated = evaluateConditionExpression(expr, state, member, null, actionEntry);
        return evaluated.unknownCount === 0 && evaluated.result;
      });
      if (!condSatisfied) {
        continue;
      }

      // HealSp 効果パートを適用
      let fired = false;
      for (const part of parts) {
        if (String(part?.skill_type ?? '') !== 'HealSp') {
          continue;
        }
        const amount = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        // SP上限突破対応: value[0] をイベント上限として使用
        const spCeiling = Number(part?.value?.[0] ?? 0);
        const skillCeiling = Number.isFinite(spCeiling) && spCeiling > 0 ? spCeiling : null;
        const targetIds = resolveSupportTargetCharacterIds(state, member, part?.target_type, null);
        for (const targetId of targetIds) {
          const target = findMemberByCharacterId(state, targetId);
          if (!target) {
            continue;
          }
          const change = target.applySpDelta(amount, 'active', skillCeiling);
          spEvents.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: member.characterId,
              characterId: target.characterId,
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              recordAllocation: 'recipient',
              triggerType: 'SpPassiveTrigger',
              skillId: skill.skillId,
              skillName: skill.name,
              ...change,
              source: 'sp_passive',
            })
          );
        }
        fired = true;
      }

      if (fired) {
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, member, passive, {
              source: 'passive_trigger',
              effectTypes: ['HealSp'],
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
            })
          )
        );
      }
    }
  }

  return { spEvents, passiveTriggerEvents };
}

function applyMoralePassiveTriggerEffects(state, actor, skill, actionEntry) {
  const moraleEvents = [];
  const spEvents = [];
  const additionalTurnGrantedIds = [];
  const dpEvents = [];
  const passiveTriggerEvents = [];
  const fieldStateEvents = [];

  for (const passive of getConfiguredPassivesForMember(actor)) {
    const timing = String(passive?.timing ?? '').trim();
    if (
      timing !== 'OnFirstBattleStart' &&
      timing !== 'OnBattleStart' &&
      timing !== 'OnPlayerTurnStart'
    ) {
      continue;
    }

    const parts = Array.isArray(passive?.parts) ? passive.parts : [];

    // P3: exitCond チェック（Count=バトル中N回上限 / PlayerTurnEnd=同一プレイヤーターン内1回）
    const triggerPartForExit = parts.find((p) => String(p?.skill_type ?? '').startsWith('AdditionalHit'));
    const exitCond = String(triggerPartForExit?.effect?.exitCond ?? '').trim();
    const exitVal = Number(triggerPartForExit?.effect?.exitVal?.[0] ?? 0);
    const usageKey = (exitCond === 'Count' || exitCond === 'PlayerTurnEnd')
      ? getPassiveUsageKey(actor, passive)
      : null;
    if (exitCond === 'Count' && exitVal > 0 && usageKey) {
      if (Number(state.turnState.passiveUsageCounts?.[usageKey] ?? 0) >= exitVal) continue;
    }
    if (exitCond === 'PlayerTurnEnd' && usageKey) {
      if ((state.turnState.passiveTurnFiredKeys ?? []).includes(usageKey)) continue;
    }

    let triggerMultiplier = 0;
    let killCountMultiplier = 0; // HealSp に適用する倍率（OnKillCount のみ）。desc「敵1体につき」が根拠。
    const triggerMatched = parts.some((part) => {
      const skillType = String(part?.skill_type ?? '').trim();
      const conditions = [passive?.condition, part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const conditionSkill = createConditionSkillContext(skill, part);
      const matchedConditions = conditions.every((expr) => {
        const evaluated = evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry);
        // 未実装条件が含まれる場合はパッシブを発動させない
        return evaluated.unknownCount === 0 && evaluated.result;
      });
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
        return isExtraSkillTriggerSkill(skill);
      }
      if (skillType === 'AdditionalHitOnKillCount') {
        const killCount = Math.max(0, Number(actionEntry?.killCount ?? 0));
        if (killCount > 0) {
          triggerMultiplier = killCount;
          killCountMultiplier = killCount; // HealSp にも倍率を伝搬（破竹/激震は対象外）
          return true;
        }
        return false;
      }
      if (skillType === 'AdditionalHitOnBreaking') {
        const breakHitCount = resolveActionBreakTriggerCount(actionEntry);
        if (breakHitCount > 0) {
          triggerMultiplier = breakHitCount;
          // killCountMultiplier は設定しない（「ブレイクしたとき」は単発発動）
          return true;
        }
        return false;
      }
      if (skillType === 'AdditionalHitOnWeak') {
        triggerMultiplier = 1;
        return actionHitsEnemyWeakness(state, actor, skill, actionEntry);
      }
      if (skillType === 'AdditionalHitOnRemovingBuff') {
        // Fires when the actor uses a skill that removes buffs from enemies (RemoveBuff part).
        return (skill.parts ?? []).some((ep) => String(ep?.skill_type ?? '') === 'RemoveBuff');
      }
      if (skillType === 'AdditionalHitOnOverDrivePointDownSkill') {
        // Fires when the actor uses a skill that contains an OverDrivePointDown part.
        triggerMultiplier = 1;
        return (skill.parts ?? []).some((ep) => String(ep?.skill_type ?? '') === 'OverDrivePointDown');
      }
      if (skillType === 'AdditionalHitOnPursuit') {
        // Fires when the actor's pursuit attack was triggered this action.
        const pursuedHitCount = Math.max(0, Number(actionEntry?.pursuedHitCount ?? 0));
        if (pursuedHitCount > 0) {
          triggerMultiplier = 1;
          return true;
        }
        return false;
      }
      return false;
    });

    if (!triggerMatched) {
      continue;
    }

    // P3: 発火後カウント・フラグを更新
    if (exitCond === 'Count' && exitVal > 0 && usageKey) {
      state.turnState.passiveUsageCounts[usageKey] =
        Number(state.turnState.passiveUsageCounts[usageKey] ?? 0) + 1;
    }
    if (exitCond === 'PlayerTurnEnd' && usageKey) {
      if (!state.turnState.passiveTurnFiredKeys.includes(usageKey)) {
        state.turnState.passiveTurnFiredKeys.push(usageKey);
      }
    }

    for (const part of parts) {
      const effectType = String(part?.skill_type ?? '').trim();

      if (effectType === 'Morale') {
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
          moraleEvents.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              characterId: target.characterId,
              source: 'morale_passive',
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              triggerType: 'MoralePassiveTrigger',
              skillId: skill.skillId,
              skillName: skill.name,
              ...change,
            })
          );
        }
        continue;
      }

      if (effectType === 'HealSp') {
        // killCountMultiplier: OnKillCount トリガーのみ適用（「敵1体につき」仕様）
        const amount = Number(part?.power?.[0] ?? 0) * Math.max(1, killCountMultiplier || 1);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        // SP上限突破対応: value[0] をイベント上限として使用（例: リバーブレーション SP30）
        const spCeiling = Number(part?.value?.[0] ?? 0);
        const skillCeiling = Number.isFinite(spCeiling) && spCeiling > 0 ? spCeiling : null;
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          actionEntry?.targetCharacterId
        );
        let affectedTargetCount = 0;
        let totalSpDelta = 0;
        for (const targetCharacterId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetCharacterId);
          if (!target) {
            continue;
          }
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
            continue;
          }
          const change = target.applySpDelta(amount, skillCeiling ? 'active' : 'passive', skillCeiling);
          spEvents.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              characterId: target.characterId,
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              triggerType: 'SpPassiveTrigger',
              skillId: skill.skillId,
              skillName: skill.name,
              ...change,
              source: 'sp_passive',
            })
          );
          affectedTargetCount += 1;
          totalSpDelta += Number(change?.delta ?? 0);
        }
        if (affectedTargetCount > 0) {
          const signedAmount = amount >= 0 ? `+${amount}` : String(amount);
          passiveTriggerEvents.push(
            buildActionScopedEvent(
              actionEntry,
              createPassiveTriggerEvent(state.turnState, actor, passive, {
                source: 'passive_trigger',
                effectTypes: ['HealSp'],
                triggerType: 'SpPassiveTrigger',
                triggerSkillId: Number(skill?.skillId ?? 0),
                triggerSkillName: String(skill?.name ?? ''),
                passiveDesc: String(passive?.desc ?? '').trim() || `追撃発生時、前衛のSP${signedAmount}`,
                spDelta: totalSpDelta,
                affectedTargetCount,
              })
            )
          );
        }
        continue;
      }

      if (effectType === 'OverDrivePointUp') {
        const amount = resolveOverDrivePointUpPowerPercent(part);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          actionEntry?.targetCharacterId
        );
        if (targetCharacterIds.includes(actor.characterId)) {
          state.turnState.odGauge = clampOdGauge(
            truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0) + Number(amount))
          );
        }
        continue;
      }

      if (effectType === 'AdditionalTurn') {
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
          additionalTurnGrantedIds.push(targetCharacterId);
        }
        continue;
      }

      if (effectType === 'HealDpRate' || effectType === 'ReviveDpRate') {
        const rate = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(rate) || rate <= 0) {
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
          const amount = resolveHighBoostAdjustedDpAmount(
            actor,
            effectType,
            Number(startDpState.baseMaxDp ?? 0) * rate
          );
          const change = target.setDpState({
            currentDp: resolveNextCurrentDpForDirectChange(startDpState, effectType, amount),
            effectiveDpCap: getDpHealCapForPart(target, part),
          });
          const endDpState = cloneDpState(change.endDpState);
          dpEvents.push(
            buildActionScopedEvent(
              actionEntry,
              createPassiveDpEvent({
                actor,
                target,
                passive,
                part,
                triggerType: DP_EVENT_KINDS.DIRECT_HEAL,
                source: 'dp_passive',
                startDpState,
                endDpState,
                isAmountResolved: true,
              })
            )
          );
        }
        continue;
      }

      if (DOUBLE_ACTION_STATUS_TYPES.has(effectType)) {
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          actionEntry?.targetCharacterId
        );
        let applied = false;
        for (const targetCharacterId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetCharacterId);
          if (!target) {
            continue;
          }
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
            continue;
          }
          const added = addDoubleActionStatusEffect(
            effectType,
            target,
            {
              sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourceSkillLabel: String(passive?.label ?? ''),
              sourceSkillName: String(passive?.name ?? ''),
              sourceCharacterId: String(actor?.characterId ?? ''),
              sourceCharacterName: String(actor?.characterName ?? ''),
              sourceSkillDesc: String(passive?.desc ?? ''),
              metadata: {
                targetType: String(part?.target_type ?? ''),
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              },
            },
            {
              sourceType: 'passive',
              limitType: String(part?.effect?.limitType ?? 'Only'),
              exitCond: String(part?.effect?.exitCond ?? 'Count'),
              remaining: Number(part?.effect?.exitVal?.[0] ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING),
            }
          );
          passiveTriggerEvents.push(
            buildActionScopedEvent(
              actionEntry,
              createPassiveTriggerEvent(state.turnState, actor, passive, {
                source: 'passive_trigger',
                effectTypes: [effectType],
                appliedStatusEffects: [added],
                triggerSkillId: Number(skill?.skillId ?? 0),
                triggerSkillName: String(skill?.name ?? ''),
              })
            )
          );
          applied = true;
        }
        if (applied) {
          continue;
        }
      }

      if (effectType === 'AttackUp') {
        const amount = Number(part?.power?.[0] ?? 0);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        const remaining = Number(part?.effect?.exitVal?.[0] ?? 1);
        const exitCond = String(part?.effect?.exitCond ?? 'Count');
        const limitType = String(part?.effect?.limitType ?? 'Default');
        const elements = Array.isArray(part?.elements) ? [...part.elements] : [];
        const category = String(part?.effect?.category ?? '');

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
          target.addStatusEffect({
            statusType: 'AttackUp',
            exitCond,
            limitType,
            remaining,
            power: amount,
            elements,
            sourceType: 'passive',
            sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
            sourceSkillLabel: String(passive?.label ?? ''),
            sourceSkillName: String(passive?.name ?? ''),
            sourceCharacterId: String(actor?.characterId ?? ''),
            sourceCharacterName: String(actor?.characterName ?? ''),
            sourceSkillDesc: String(passive?.desc ?? ''),
            metadata: category ? { onlyGroupKey: category } : null,
          });
        }
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, actor, passive, {
              source: 'passive_trigger',
              effectTypes: ['AttackUp'],
              attackUpRate: amount,
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
            })
          )
        );
        continue;
      }

      if (effectType === 'DebuffGuard' || effectType === 'BreakGuard') {
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          actionEntry?.targetCharacterId
        );
        const appliedStatusEffects = [];
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
            sourceSkillLabel: String(passive?.label ?? ''),
            sourceSkillName: String(passive?.name ?? ''),
            metadata: {
              sourceType: 'passive_trigger',
              actorCharacterId: actor.characterId,
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
              targetType: String(part?.target_type ?? ''),
            },
          });
          if (!added) {
            continue;
          }
          appliedStatusEffects.push(added);
        }
        if (appliedStatusEffects.length > 0) {
          passiveTriggerEvents.push(
            buildActionScopedEvent(
              actionEntry,
              createPassiveTriggerEvent(state.turnState, actor, passive, {
                source: 'passive_trigger',
                effectTypes: [effectType],
                appliedStatusEffects,
                triggerSkillId: Number(skill?.skillId ?? 0),
                triggerSkillName: String(skill?.name ?? ''),
              })
            )
          );
        }
        continue;
      }

      if (effectType === 'BuffCharge') {
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          actionEntry?.targetCharacterId
        );
        const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID.BuffCharge;
        const exitCond = String(part?.effect?.exitCond ?? 'Count');
        const remaining = Number(part?.effect?.exitVal?.[0] ?? 1);
        const power = resolvePreferredNonDamageRangeValue(part?.power);
        const sourceSkill = {
          skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
          label: String(passive?.label ?? ''),
          name: String(passive?.name ?? ''),
          desc: String(passive?.desc ?? ''),
        };
        const appliedStatusEffects = [];
        for (const targetCharacterId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetCharacterId);
          if (!target) {
            continue;
          }
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
            continue;
          }
          target.applySpecialStatus(statusTypeId, remaining, exitCond, {
            skill: sourceSkill,
            actor,
            ...(Number.isFinite(power) ? { power } : {}),
          });
          const activeEffects = target.getStatusEffectsByType('BuffCharge', { activeOnly: true });
          const latest = activeEffects.at(-1);
          appliedStatusEffects.push({
            characterId: target.characterId,
            statusType: 'BuffCharge',
            effectId: Number(latest?.effectId ?? 0),
            exitCond: String(latest?.exitCond ?? exitCond),
            remaining: Number(latest?.remaining ?? remaining),
          });
        }
        if (appliedStatusEffects.length > 0) {
          passiveTriggerEvents.push(
            buildActionScopedEvent(
              actionEntry,
              createPassiveTriggerEvent(state.turnState, actor, passive, {
                source: 'passive_trigger',
                effectTypes: ['BuffCharge'],
                appliedStatusEffects,
                triggerSkillId: Number(skill?.skillId ?? 0),
                triggerSkillName: String(skill?.name ?? ''),
              })
            )
          );
        }
        continue;
      }

      if (effectType === 'Talisman') {
        const levelDelta = Number(part?.power?.[0] ?? 0);
        const requiresActive = Number(part?.value?.[0] ?? 0) === 1;
        const change = applyTalismanChange(state.turnState, {
          requiresActive,
          activateOnApply: levelDelta === 0,
          levelDelta,
        });
        if (!change) {
          continue;
        }
        const talismanFieldEvent = createTalismanFieldEvent(change, {
          source: 'passive_trigger',
        });
        if (talismanFieldEvent) {
          fieldStateEvents.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              skillId: Number(skill?.skillId ?? 0),
              skillName: String(skill?.name ?? ''),
              ...talismanFieldEvent,
            })
          );
        }
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, actor, passive, {
              source: 'passive_trigger',
              effectTypes: ['Talisman'],
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
              fieldEvents: talismanFieldEvent ? [talismanFieldEvent] : [],
              talismanChange: talismanFieldEvent,
            })
          )
        );
        continue;
      }

      if (effectType === 'Disaster') {
        const levelDelta = Number(part?.power?.[0] ?? 0);
        const change = applyDisasterChange(state.turnState, {
          levelDelta,
        });
        if (!change) {
          continue;
        }
        const disasterFieldEvent = createDisasterFieldEvent(change, {
          source: 'passive_trigger',
        });
        if (disasterFieldEvent) {
          fieldStateEvents.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              skillId: Number(skill?.skillId ?? 0),
              skillName: String(skill?.name ?? ''),
              ...disasterFieldEvent,
            })
          );
        }
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, actor, passive, {
              source: 'passive_trigger',
              effectTypes: ['Disaster'],
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
              fieldEvents: disasterFieldEvent ? [disasterFieldEvent] : [],
              disasterChange: disasterFieldEvent,
            })
          )
        );
        continue;
      }
    }
  }

  return { moraleEvents, spEvents, additionalTurnGrantedIds, dpEvents, passiveTriggerEvents, fieldStateEvents };
}

function passiveHasAdditionalHitOnWeakTrigger(passive) {
  return (Array.isArray(passive?.parts) ? passive.parts : []).some(
    (part) => String(part?.skill_type ?? '').trim() === 'AdditionalHitOnWeak'
  );
}

function clearAdditionalHitOnWeakPassiveTurnFiredKeys(turnState, party = []) {
  if (!turnState || !Array.isArray(turnState.passiveTurnFiredKeys)) {
    return;
  }
  const weakTriggerKeys = new Set();
  for (const member of Array.isArray(party) ? party : []) {
    for (const passive of getConfiguredPassivesForMember(member)) {
      if (passiveHasAdditionalHitOnWeakTrigger(passive)) {
        weakTriggerKeys.add(getPassiveUsageKey(member, passive));
      }
    }
  }
  if (weakTriggerKeys.size === 0) {
    return;
  }
  turnState.passiveTurnFiredKeys = turnState.passiveTurnFiredKeys.filter(
    (key) => !weakTriggerKeys.has(String(key))
  );
}

function applyMoraleEffectsFromActions(state, previewRecord) {
  const moraleEvents = [];
  const spPassiveEvents = [];
  const additionalTurnPassiveGrantedIds = [];
  const dpPassiveEvents = [];
  const passiveTriggerEvents = [];
  const fieldStateEvents = [];

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
        moraleEvents.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'morale_skill',
            skillId: skill.skillId,
            skillName: skill.name,
            triggerType: 'Morale',
            ...change,
          })
        );
      }
    }

    const triggerResult = applyMoralePassiveTriggerEffects(state, actor, skill, actionEntry);
    moraleEvents.push(...triggerResult.moraleEvents);
    spPassiveEvents.push(...triggerResult.spEvents);
    additionalTurnPassiveGrantedIds.push(...triggerResult.additionalTurnGrantedIds);
    dpPassiveEvents.push(...triggerResult.dpEvents);
    passiveTriggerEvents.push(...triggerResult.passiveTriggerEvents);
    fieldStateEvents.push(...triggerResult.fieldStateEvents);

    const pursuitSourceCharacterId = String(actionEntry?.pursuitSourceCharacterId ?? '');
    if (pursuitSourceCharacterId && pursuitSourceCharacterId !== actor.characterId) {
      const pursuitActor = findMemberByCharacterId(state, pursuitSourceCharacterId);
      if (pursuitActor) {
        const pursuitSkill =
          Number.isFinite(Number(actionEntry?.pursuitSourceSkillId)) &&
          Number(actionEntry.pursuitSourceSkillId) > 0
            ? pursuitActor.getSkill(Number(actionEntry.pursuitSourceSkillId)) ?? skill
            : skill;
        const pursuitTriggerResult = applyMoralePassiveTriggerEffects(
          state,
          pursuitActor,
          pursuitSkill,
          actionEntry
        );
        moraleEvents.push(...pursuitTriggerResult.moraleEvents);
        spPassiveEvents.push(...pursuitTriggerResult.spEvents);
        additionalTurnPassiveGrantedIds.push(...pursuitTriggerResult.additionalTurnGrantedIds);
        dpPassiveEvents.push(...pursuitTriggerResult.dpEvents);
        passiveTriggerEvents.push(...pursuitTriggerResult.passiveTriggerEvents);
        fieldStateEvents.push(...pursuitTriggerResult.fieldStateEvents);
      }
    }

    // RECEIVER基準のSP回復トリガーパッシブ（お裾分け・愛嬌等）を処理
    const receiverResult = applyReceiverSpHealPassiveTriggers(state, actor, skill, actionEntry);
    spPassiveEvents.push(...receiverResult.spEvents);
    passiveTriggerEvents.push(...receiverResult.passiveTriggerEvents);

    // Zone展開トリガーパッシブ（オーバーレイ等）を処理（RECEIVER-based）
    const zoneResult = applyReceiverZonePassiveTriggers(state, actor, skill, actionEntry);
    spPassiveEvents.push(...zoneResult.spEvents);
    passiveTriggerEvents.push(...zoneResult.passiveTriggerEvents);
  }

  return {
    moraleEvents,
    spPassiveEvents,
    additionalTurnPassiveGrantedIds,
    dpPassiveEvents,
    passiveTriggerEvents,
    fieldStateEvents,
  };
}

function applyTalismanLevelIncrementsFromActions(state, previewRecord) {
  // 霊符仕様: 霊符状態の敵がプレイヤーの攻撃を受けるごとに霊符レベル+1（Hit数不問、1攻撃=+1）
  const currentTalisman = getTalismanState(state.turnState);
  if (!currentTalisman.active) {
    return [];
  }

  let attackCount = 0;
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
    if (hasDamagePartInParts(effectiveParts)) {
      attackCount += 1;
    }
  }

  if (attackCount === 0) {
    return [];
  }

  const change = applyTalismanChange(state.turnState, {
    requiresActive: true,
    levelDelta: attackCount,
  });
  if (!change) {
    return [];
  }
  const talismanFieldEvent = createTalismanFieldEvent(change, {
    source: 'attacked_by_player_action',
  });
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
    if (!hasDamagePartInParts(effectiveParts) || !talismanFieldEvent) {
      continue;
    }
    events.push(
      buildActionScopedEvent(actionEntry, {
        actorCharacterId: actor.characterId,
        skillId: Number(skill?.skillId ?? 0),
        skillName: String(skill?.name ?? ''),
        ...talismanFieldEvent,
      })
    );
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
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'motivation_skill',
            skillId: skill.skillId,
            skillName: skill.name,
            triggerType: 'Motivation',
            ...change,
          })
        );
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
    for (const passive of getConfiguredPassivesForMember(target)) {
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

function applyEnemyAttackDpDamage(state, targetCharacterIds = []) {
  const events = [];
  const ids = normalizeEnemyAttackTargetCharacterIds(targetCharacterIds);

  for (const characterId of ids) {
    const target = findMemberByCharacterId(state, characterId);
    if (!target) {
      continue;
    }
    const startDpState = cloneDpState(target.dpState ?? {});
    const nextCurrentDp = resolveAutoDpConsumptionCurrentDp(
      startDpState,
      ENEMY_ATTACK_DP_DAMAGE_AMOUNT
    );
    if (Number(nextCurrentDp) === Number(startDpState.currentDp ?? 0)) {
      continue;
    }
    const change = target.setDpState({
      currentDp: nextCurrentDp,
      effectiveDpCap: Number(startDpState.effectiveDpCap ?? startDpState.baseMaxDp ?? 0),
    });
    events.push(createEnemyAttackDpEvent(target, startDpState, cloneDpState(change.endDpState)));
  }

  return events;
}

// やる気仕様: 「味方のアクティブスキルでDP回復効果を受けると1段階上昇」
// DIRECT_DP_HEAL_SKILL_TYPES (HealDp, HealDpRate, ReviveDp, ReviveDpRate) によるDP増加時にトリガー
// RegenerationDpTick / HealDpByDamage は対象外
function applyMotivationFromDpHealEvents(state, dpEvents) {
  const events = [];
  const healedCharacterIds = new Set();
  for (const event of dpEvents ?? []) {
    if (String(event?.triggerType ?? '') !== DP_EVENT_KINDS.DIRECT_HEAL) {
      continue;
    }
    // 実際にDPが増加した場合のみ（上限等で変化なしのケースを除外）
    const startDp = Number(event?.startDpState?.currentDp ?? 0);
    const endDp = Number(event?.endDpState?.currentDp ?? 0);
    if (endDp <= startDp) {
      continue;
    }
    const characterId = String(event?.characterId ?? '');
    if (!characterId || healedCharacterIds.has(characterId)) {
      continue;
    }
    const target = findMemberByCharacterId(state, characterId);
    if (!target) {
      continue;
    }
    const currentMotivation = Number(target.motivationState?.current ?? 0);
    if (!Number.isFinite(currentMotivation) || currentMotivation <= 0) {
      continue;
    }
    const maxMotivation = Number(target.motivationState?.max ?? 5);
    if (currentMotivation >= maxMotivation) {
      continue;
    }
    const change = target.setMotivationLevel(Math.min(maxMotivation, currentMotivation + MOTIVATION_DP_HEAL_DELTA));
    if (Number(change?.delta ?? 0) === 0) {
      continue;
    }
    healedCharacterIds.add(characterId);
    events.push({
      actorCharacterId: String(event?.actorCharacterId ?? characterId),
      characterId,
      source: 'motivation_status',
      passiveId: 0,
      passiveName: MOTIVATION_DP_HEAL_PASSIVE_NAME,
      passiveDesc: MOTIVATION_DP_HEAL_PASSIVE_DESC,
      triggerType: MOTIVATION_DP_HEAL_TRIGGER_TYPE,
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

function shouldTickEnemyStatusOnTiming(status, timing) {
  if (isEnemyStatusPersistent(status)) {
    return false;
  }

  const normalizedTiming = String(timing ?? '').trim();
  const actionContext = buildActionContext('TurnEnd', null, {
    turnPhase: normalizedTiming === 'PlayerTurnEnd' ? 'PlayerTurnEnd' : 'EnemyTurnEnd',
  });
  const consumeResult = shouldConsume(
    {
      statusType: String(status?.statusType ?? 'EnemyStatus'),
      limitType: 'Default',
      exitCond: String(status?.exitCond ?? ''),
      remaining: Number(status?.remainingTurns ?? 0),
      metadata: {},
    },
    actionContext
  );
  if (consumeResult.shouldConsume) {
    return true;
  }

  // Unknown/legacy exitCond は既存挙動を維持する（PlayerTurnEnd 以外は enemy timing で減算）。
  // ここでは remaining<=0 の known exitCond でも fallback が true になる可能性があるが、
  // 実際の削除可否は tickEnemyStatusDurations 側の remainingTurns 判定で従来どおり決定される。
  const exitCond = String(status?.exitCond ?? '').trim();
  if (normalizedTiming === 'PlayerTurnEnd') {
    return exitCond === 'PlayerTurnEnd';
  }
  return exitCond !== 'PlayerTurnEnd';
}

function tickEnemyStatusDurations(turnState, timing = 'EnemyTurnEnd') {
  const enemyState = getEnemyState(turnState);
  const downTurnTargetsBefore = new Set(
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_DOWN_TURN).map((status) => Number(status?.targetIndex ?? -1))
  );
  const nextStatuses = enemyState.statuses
    .map((status) => {
      if (isEnemyStatusPersistent(status) || !shouldTickEnemyStatusOnTiming(status, timing)) {
        return normalizeEnemyStatus(status, enemyState.enemyCount);
      }
      const remainingTurns = Number(status?.remainingTurns ?? 0);
      if (!Number.isFinite(remainingTurns)) {
        return null;
      }
      // DownTurn は remaining=0 を 1 ターン grace として保持し、次 tick で削除する
      const isDownTurn = normalizeEnemyStatusType(status?.statusType) === ENEMY_STATUS_DOWN_TURN;
      if (isDownTurn) {
        if (remainingTurns <= 0) {
          return null;
        }
        const nextTurns = remainingTurns - 1;
        return normalizeEnemyStatus({ ...status, remainingTurns: nextTurns }, enemyState.enemyCount);
      }
      if (remainingTurns <= 0) {
        return null;
      }
      const nextTurns = remainingTurns - 1;
      if (nextTurns <= 0) {
        return null;
      }
      return normalizeEnemyStatus({ ...status, remainingTurns: nextTurns }, enemyState.enemyCount);
    })
    .filter(Boolean);
  turnState.enemyState = {
    enemyCount: enemyState.enemyCount,
    statuses: nextStatuses,
    damageRatesByEnemy: enemyState.damageRatesByEnemy,
    destructionRateByEnemy: enemyState.destructionRateByEnemy,
    destructionRateCapByEnemy: enemyState.destructionRateCapByEnemy,
    absorbElementsByEnemy: enemyState.absorbElementsByEnemy,
    odRateByEnemy: enemyState.odRateByEnemy,
    eShieldStateByEnemy: enemyState.eShieldStateByEnemy,
    extraHpGaugeStateByEnemy: enemyState.extraHpGaugeStateByEnemy,
    breakStateByEnemy: enemyState.breakStateByEnemy,
    enemyNamesByEnemy: enemyState.enemyNamesByEnemy,
    paramBorderByEnemy: enemyState.paramBorderByEnemy,
    zoneConfigByEnemy: enemyState.zoneConfigByEnemy,
    talismanState: enemyState.talismanState ?? structuredClone(TALISMAN_STATE_DEFAULT),
    disasterState: enemyState.disasterState ?? structuredClone(DISASTER_STATE_DEFAULT),
  };
  const downTurnTargetsAfter = new Set(
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_DOWN_TURN).map((status) => Number(status?.targetIndex ?? -1))
  );
  for (const targetIndex of downTurnTargetsBefore) {
    if (!Number.isFinite(targetIndex) || downTurnTargetsAfter.has(targetIndex)) {
      continue;
    }
    removeEnemySuperDownState(turnState, targetIndex);
    // DownTurn が明けた enemy の Eシールドを max まで自動復帰
    restoreEnemyEShieldToMax(turnState, targetIndex);
  }
  clearHoldUpIfAllDownConditionLost(turnState);
}

function tickEnemyStatuses(turnState) {
  tickEnemyStatusDurations(turnState, 'EnemyTurnEnd');
  turnState.zoneState = tickFieldState(turnState.zoneState);
  turnState.territoryState = tickFieldState(turnState.territoryState);
}

function resolveEnemyConditionFunctionValue(name, argRaw, state, targetIndex) {
  const arg = String(argRaw ?? '').trim();
  const dead = isEnemyDead(state?.turnState, targetIndex);
  switch (name) {
    case 'IsPlayer':
      return { known: true, value: 0 };
    case 'IsDead':
      return {
        known: true,
        value: dead ? 1 : 0,
      };
    case 'IsBroken':
      return {
        known: true,
        value: dead ? 0 : (hasEnemyStatus(state?.turnState, targetIndex, ENEMY_STATUS_BREAK) ? 1 : 0),
      };
    case 'BreakDownTurn':
      return {
        known: true,
        value: dead ? 0 : getEnemyStatusRemainingTurns(state?.turnState, targetIndex, ENEMY_STATUS_DOWN_TURN),
      };
    case 'DamageRate':
      return {
        known: true,
        value: getEnemyDestructionRatePercent(state?.turnState, targetIndex),
      };
    case 'IsWeakElement':
      if (!arg) {
        return { known: false, value: true };
      }
      return {
        known: true,
        value: dead ? 0 : (isEnemyWeakToElement(state?.turnState, targetIndex, arg) ? 1 : 0),
      };
    case 'SpecialStatusCountByType': {
      if (!getEnemySpecialStatusNameByType(arg)) {
        return { known: false, value: true };
      }
      return {
        known: true,
        value: dead ? 0 : (hasEnemySpecialStatusByType(state?.turnState, targetIndex, arg) ? 1 : 0),
      };
    }
    default:
      return { known: false, value: true };
  }
}

function evaluateEnemyCountBcClause(clause, state, targetIndex) {
  const text = String(clause ?? '').trim();
  if (!text) {
    return { known: true, value: true };
  }

  {
    const m = text.match(FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      const resolved = resolveEnemyConditionFunctionValue(m[1], m[2], state, targetIndex);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return {
        known: true,
        value: compareNumbers(Number(resolved.value), m[3], Number(m[4])),
      };
    }
  }

  {
    const m = text.match(REVERSE_FUNCTION_COMPARISON_CONDITION_RE);
    if (m) {
      const resolved = resolveEnemyConditionFunctionValue(m[3], m[4], state, targetIndex);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return {
        known: true,
        value: compareNumbers(Number(m[1]), m[2], Number(resolved.value)),
      };
    }
  }

  {
    const m = text.match(BARE_FUNCTION_CALL_CONDITION_RE);
    if (m) {
      const resolved = resolveEnemyConditionFunctionValue(m[1], m[2], state, targetIndex);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return {
        known: true,
        value: Boolean(Number(resolved.value)),
      };
    }
  }

  return { known: false, value: true };
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

  if (clauses.includes('IsPlayer()==0')) {
    let count = 0;
    const enemyCount = getEnemyState(state?.turnState).enemyCount;
    const countsDeadTargets = clauses.some((clause) => /\bIsDead\s*\(/.test(String(clause)));
    for (let targetIndex = 0; targetIndex < enemyCount; targetIndex += 1) {
      if (!countsDeadTargets && isEnemyDead(state?.turnState, targetIndex)) {
        continue;
      }
      let matched = true;
      for (const clause of clauses) {
        const evaluated = evaluateEnemyCountBcClause(clause, state, targetIndex);
        if (!evaluated.known) {
          return { known: false, value: true };
        }
        if (!evaluated.value) {
          matched = false;
          break;
        }
      }
      if (matched) {
        count += 1;
      }
    }
    return { known: true, value: count };
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

export function evaluateConditionExpression(expression, state, member, skill, actionEntry = null) {
  return evaluateConditionExpressionAdapter(expression, state, member, skill, actionEntry);
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
      resolved.push(normalizeRuntimeNonDamagePart(part));
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

function extractPlayedSkillCountValue(condExpression, member, skill) {
  const text = String(condExpression ?? '').trim();
  if (!text) {
    return null;
  }
  const m = text.match(PLAYED_SKILL_COUNT_CONDITION_RE);
  if (!m) {
    return null;
  }
  const refRaw = String(m[1] ?? '').trim();
  const ref = refRaw || String(skill?.label ?? '');
  return Number(member?.getSkillUseCountByLabel(ref) ?? 0);
}

function isBeforeSelfFunnelPart(part) {
  if (String(part?.skill_type ?? '') !== 'Funnel') {
    return false;
  }
  if (String(part?.target_type ?? '') !== 'Self') {
    return false;
  }
  return (part?.hits ?? []).some((hit) => String(hit?.type ?? '') === 'Before');
}

function resolveImmediateSelfFunnelHitBonus(skill) {
  return (skill?.parts ?? []).reduce((sum, part) => {
    if (!isBeforeSelfFunnelPart(part)) {
      return sum;
    }
    const hitBonus = Number(part?.power?.[0] ?? 0);
    return sum + (Number.isFinite(hitBonus) && hitBonus > 0 ? hitBonus : 0);
  }, 0);
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
      overwrite: resolveSkillScalarField(skillLike, ['overwrite'], null),
      effect: String(resolveSkillScalarField(skillLike, ['effect'], '')),
      isRestricted: Number(resolveSkillScalarField(skillLike, ['isRestricted', 'is_restricted'], 0)) === 1,
      parts: [],
    };

    for (const part of fallbackParts) {
      const skillType = String(part?.skill_type ?? '');
      if (skillType !== 'SkillCondition') {
        resolved.parts.push(normalizeRuntimeNonDamagePart(part));
        continue;
      }

      const variants = Array.isArray(part?.strval)
        ? part.strval.filter((v) => v && typeof v === 'object' && Array.isArray(v.parts))
        : [];
      if (variants.length === 0) {
        continue;
      }

      let selected;
      const playedCount = extractPlayedSkillCountValue(part?.cond, member, skill);
      if (playedCount !== null && variants.length > 2) {
        selected = variants[Math.min(playedCount, variants.length - 1)];
      } else {
        const countBc = evaluateCountBcValue(part?.cond, state, member);
        const thresholded = countBc.known
          ? variants
              .map((variant) => ({
                variant,
                threshold: inferPassiveVariantThreshold(variant),
              }))
              .filter((entry) => Number.isFinite(entry.threshold))
          : [];
        if (thresholded.length > 0) {
          thresholded.sort((a, b) => Number(b.threshold) - Number(a.threshold));
          selected =
            thresholded.find((entry) => Number(countBc.value) >= Number(entry.threshold))
              ?.variant ?? variants[0];
        } else {
          const conditionMatched = evaluateSkillConditionExpression(part?.cond, state, member, skill);
          selected = conditionMatched ? variants[0] : variants[1] ?? variants[0];
        }
      }
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
        overwriteCond: mergeConditionExpressions(resolved.overwriteCond, nested.overwriteCond),
        overwrite: String(nested.overwriteCond ?? '').trim() ? nested.overwrite ?? resolved.overwrite : resolved.overwrite,
        effect: String(nested.effect ?? resolved.effect ?? ''),
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
    overwrite: effective.overwrite == null ? null : Number(effective.overwrite),
    effect: String(effective.effect ?? skill?.effect ?? ''),
    isRestricted: Boolean(effective.isRestricted),
    parts: effective.parts,
  };
}

function resolveOverwriteSpCostIfSatisfied(effectiveSkill, state, member) {
  const overwriteCond = String(effectiveSkill?.overwriteCond ?? '').trim();
  if (!overwriteCond) {
    return null;
  }
  const consumeType = String(effectiveSkill?.consumeType ?? effectiveSkill?.consume_type ?? 'Sp');
  if (consumeType !== 'Sp') {
    return null;
  }
  const rawOverwrite = effectiveSkill?.overwrite;
  if (rawOverwrite === null || rawOverwrite === undefined || rawOverwrite === '') {
    return null;
  }
  const overwriteValue = Number(rawOverwrite);
  if (!Number.isFinite(overwriteValue)) {
    return null;
  }
  const evaluation = evaluateConditionExpression(overwriteCond, state, member, effectiveSkill, null);
  if (evaluation.unknownCount > 0 || !evaluation.result) {
    return null;
  }
  return overwriteValue;
}

function resolvePassiveReduceSpForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { amount: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let maxReduction = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of getPassiveEntriesForMember(actor)) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
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
        const amount = resolvePreferredNonDamageRangeValue(part?.power);
        if (!Number.isFinite(amount) || amount <= 0) {
          continue;
        }
        matchedPassives.push({
          characterId: String(actor?.characterId ?? ''),
          characterName: String(actor?.characterName ?? ''),
          shortCharacterName: String(actor?.shortCharacterName ?? actor?.characterName ?? ''),
          styleId: Number(actor?.styleId ?? 0),
          styleName: String(actor?.styleName ?? ''),
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          passiveDesc: String(passive?.desc ?? ''),
          timing: String(passive?.timing ?? ''),
          source: 'action_selection',
          targetCharacterId: String(targetMember?.characterId ?? ''),
          targetCharacterName: String(targetMember?.characterName ?? ''),
          effectType: 'ReduceSp',
          reduceSp: amount,
        });
        maxReduction = Math.max(maxReduction, amount);
      }
    }
  }

  return { amount: maxReduction, matchedPassives };
}

function resolvePassiveAttackUpForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { totalRate: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalRate = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of getPassiveEntriesForMember(actor)) {
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
          characterId: String(actor?.characterId ?? ''),
          characterName: String(actor?.characterName ?? ''),
          shortCharacterName: String(actor?.shortCharacterName ?? actor?.characterName ?? ''),
          styleId: Number(actor?.styleId ?? 0),
          styleName: String(actor?.styleName ?? ''),
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          passiveDesc: String(passive?.desc ?? ''),
          timing: String(passive?.timing ?? ''),
          source: 'action_selection',
          targetCharacterId: String(targetMember?.characterId ?? ''),
          targetCharacterName: String(targetMember?.characterName ?? ''),
          effectType: 'AttackUp',
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
    for (const passive of getConfiguredPassivesForMember(actor)) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let passiveRate = 0;
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
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
        const perTokenRate = resolvePreferredNonDamageRangeValue(part?.power);
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

function resolvePassiveAttackUpPerTokenForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { totalRate: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalRate = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of getConfiguredPassivesForMember(actor)) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let passiveRate = 0;
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
        if (String(part?.skill_type ?? '') !== 'AttackUpPerToken') {
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
          attackUpRate: passiveRate,
        });
      }
    }
  }

  return { totalRate, matchedPassives };
}

function resolvePassiveDefenseUpPerTokenForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { totalRate: 0, matchedPassives: [] };
  }
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  let totalRate = 0;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of getConfiguredPassivesForMember(actor)) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let passiveRate = 0;
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
        if (String(part?.skill_type ?? '') !== 'DefenseUpPerToken') {
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
          defenseUpPerTokenRate: passiveRate,
        });
      }
    }
  }

  return { totalRate, matchedPassives };
}

function resolvePassiveIgnoreEShieldElementForMember(state, targetMember, timings = []) {
  if (!state || !targetMember) {
    return { active: false, matchedPassives: [] };
  }
  // IgnoreEShieldElement は action-time に恒常フラグとして展開する性質なので
  // timing 別の発火タイミングを持たない。`timings` が空または未指定のときは全 timing を通過させる。
  const timingList = Array.isArray(timings) ? timings : [timings];
  const filterByTiming = timingList.length > 0;
  const timingSet = filterByTiming
    ? new Set(timingList.map((value) => String(value)))
    : null;
  const matchedPassives = [];

  for (const actor of state.party ?? []) {
    for (const passive of getPassiveEntriesForMember(actor)) {
      if (filterByTiming && !timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }
      let matched = false;
      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
        if (String(part?.skill_type ?? '') !== 'IgnoreEShieldElement') {
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
        matched = true;
        break;
      }
      if (matched) {
        matchedPassives.push({
          passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
          passiveName: String(passive?.name ?? ''),
          timing: String(passive?.timing ?? ''),
        });
      }
    }
  }

  return {
    active: matchedPassives.length > 0,
    matchedPassives,
  };
}

function normalizeStatusEffectElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }
  return [...new Set(elements.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function resolveActiveBuffStatusType(skillTypeRaw) {
  const skillType = String(skillTypeRaw ?? '').trim();
  return ACTIVE_BUFF_STATUS_SKILL_TYPE_TO_STATUS_TYPE[skillType] ?? '';
}

function collectSkillElementsForPreview(state, member, skill) {
  if (isNormalAttackSkill(skill)) {
    return normalizeStatusEffectElements(member?.normalAttackElements);
  }
  const elements = new Set();
  for (const part of resolveEffectiveSkillParts(skill, state, member)) {
    for (const element of normalizeStatusEffectElements(part?.elements)) {
      elements.add(element);
    }
  }
  return [...elements];
}

function doesActiveBuffStatusEffectMatchSkill(effect, state, member, skill, skillElements) {
  const effectElements = normalizeStatusEffectElements(effect?.elements);
  if (effectElements.length > 0) {
    return effectElements.some((element) => skillElements.includes(element));
  }
  if (
    String(effect?.statusType ?? '') === 'AttackUp' &&
    isNormalAttackSkill(skill) &&
    effect?.metadata?.includeNormalAttack !== true &&
    !ACTIVE_BUFF_STATUS_NORMAL_ATTACK_EFFECTS.has(String(effect?.metadata?.effectName ?? ''))
  ) {
    return false;
  }
  return true;
}

function summarizeActiveBuffStatusEffect(effect) {
  return {
    effectId: Number(effect?.effectId ?? 0),
    statusType: String(effect?.statusType ?? ''),
    power: Number(effect?.power ?? 0),
    limitType: String(effect?.limitType ?? ''),
    exitCond: String(effect?.exitCond ?? ''),
    remaining: Number(effect?.remaining ?? 0),
    elements: normalizeStatusEffectElements(effect?.elements),
    effectName: String(effect?.metadata?.effectName ?? ''),
    sourceSkillId: Number(effect?.sourceSkillId ?? 0),
    sourceSkillLabel: String(effect?.sourceSkillLabel ?? ''),
    sourceSkillName: String(effect?.sourceSkillName ?? ''),
  };
}

function compareStatusEffectsByPowerDesc(a, b) {
  const powerA = Number(a?.power ?? 0);
  const powerB = Number(b?.power ?? 0);
  if (powerA !== powerB) {
    return powerB - powerA;
  }
  const remainingA = Number(a?.remaining ?? 0);
  const remainingB = Number(b?.remaining ?? 0);
  if (remainingA !== remainingB) {
    return remainingB - remainingA;
  }
  const idA = Number(a?.effectId ?? 0);
  const idB = Number(b?.effectId ?? 0);
  return idA - idB;
}

function pickTopStatusEffectsByPower(effects, limit) {
  const max = Math.max(0, Number(limit) || 0);
  if (max <= 0) {
    return [];
  }
  return effects
    .slice()
    .sort(compareStatusEffectsByPowerDesc)
    .slice(0, max);
}

function resolveUpFamilyModifiersForStatusType(state, member, skill, skillElements, statusType) {
  const activeEffects = member.getStatusEffectsByType(statusType, { activeOnly: true });
  const matched = activeEffects
    .filter((effect) => doesActiveBuffStatusEffectMatchSkill(effect, state, member, skill, skillElements))
    .filter((effect) => Number.isFinite(Number(effect?.power ?? 0)) && Number(effect?.power ?? 0) !== 0);

  const persistentDefaults = matched.filter(
    (effect) => String(effect?.limitType ?? '') !== 'Only' && String(effect?.exitCond ?? '') !== 'Count'
  );
  const onlyCandidates = matched.filter((effect) => String(effect?.limitType ?? '') === 'Only');
  const countCandidates = matched.filter(
    (effect) => String(effect?.limitType ?? '') !== 'Only' && String(effect?.exitCond ?? '') === 'Count'
  );

  const bestOnly = pickTopStatusEffectsByPower(onlyCandidates, 1)[0] ?? null;
  const topCount = pickTopStatusEffectsByPower(countCandidates, 2);
  const onlyPower = bestOnly ? Number(bestOnly.power ?? 0) : 0;
  const countPower = topCount.reduce((sum, effect) => sum + Number(effect?.power ?? 0), 0);
  const adopted = countPower >= onlyPower ? topCount : bestOnly ? [bestOnly] : [];

  const matchedEffects = [
    ...persistentDefaults.map((effect) => summarizeActiveBuffStatusEffect(effect)),
    ...adopted.map((effect) => summarizeActiveBuffStatusEffect(effect)),
  ];
  const rate =
    persistentDefaults.reduce((sum, effect) => sum + Number(effect?.power ?? 0), 0) +
    adopted.reduce((sum, effect) => sum + Number(effect?.power ?? 0), 0);
  const consumedCountEffectIds = adopted
    .filter((effect) => String(effect?.exitCond ?? '') === 'Count')
    .map((effect) => Number(effect.effectId));

  return {
    rate,
    matchedEffects,
    consumedCountEffectIds,
  };
}

function resolveActiveBuffStatusModifiersForAction(state, member, skill) {
  if (!state || !member || !skill) {
    return {
      attackUpRate: 0,
      defenseUpRate: 0,
      criticalRateUpRate: 0,
      criticalDamageUpRate: 0,
      matchedEffects: [],
    };
  }

  const skillElements = collectSkillElementsForPreview(state, member, skill);
  const statusTypes = [
    'AttackUp',
    'DefenseUp',
    'CriticalRateUp',
    'CriticalDamageUp',
  ];
  const matchedEffects = [];
  let attackUpRate = 0;
  let defenseUpRate = 0;
  let criticalRateUpRate = 0;
  let criticalDamageUpRate = 0;
  const consumedCountEffectIds = new Set();

  for (const statusType of statusTypes) {
    if (
      statusType === 'AttackUp' ||
      statusType === 'DefenseUp' ||
      statusType === 'CriticalRateUp' ||
      statusType === 'CriticalDamageUp'
    ) {
      const resolved = resolveUpFamilyModifiersForStatusType(state, member, skill, skillElements, statusType);
      const amount = Number(resolved.rate ?? 0);
      if (amount !== 0) {
        if (statusType === 'AttackUp') attackUpRate += amount;
        else if (statusType === 'DefenseUp') defenseUpRate += amount;
        else if (statusType === 'CriticalRateUp') criticalRateUpRate += amount;
        else if (statusType === 'CriticalDamageUp') criticalDamageUpRate += amount;
      }
      for (const effect of resolved.matchedEffects) {
        matchedEffects.push(effect);
      }
      for (const effectId of resolved.consumedCountEffectIds) {
        consumedCountEffectIds.add(Number(effectId));
      }
      continue;
    }

    for (const effect of member.resolveEffectiveStatusEffects(statusType)) {
      if (!doesActiveBuffStatusEffectMatchSkill(effect, state, member, skill, skillElements)) {
        continue;
      }
      const amount = Number(effect?.power ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      matchedEffects.push(summarizeActiveBuffStatusEffect(effect));
      if (statusType === 'DefenseUp') defenseUpRate += amount;
    }
  }

  return {
    attackUpRate,
    defenseUpRate,
    criticalRateUpRate,
    criticalDamageUpRate,
    matchedEffects,
    consumedCountEffectIds: [...consumedCountEffectIds],
  };
}

function isCountConsumableActiveBuffStatusEffect(effect) {
  return (
    ACTIVE_BUFF_STATUS_SKILL_TYPES.has(String(effect?.statusType ?? '')) &&
    String(effect?.exitCond ?? '') === 'Count' &&
    effect?.metadata?.activeBuffStatus === true
  );
}

export function resolveEffectiveSkillForAction(state, member, skill) {
  if (!skill || !member || !state) {
    return skill;
  }
  const variantResolved = resolveEffectiveSkillVariant(skill, state, member);
  const overwriteSpCost = resolveOverwriteSpCostIfSatisfied(variantResolved, state, member);
  const effective =
    overwriteSpCost === null
      ? variantResolved
      : {
          ...variantResolved,
          spCost: overwriteSpCost,
        };
  const consumeType = String(effective?.consumeType ?? 'Sp');
  const baseSpCost = Number(effective?.spCost ?? 0);
  if (consumeType !== 'Sp' || !Number.isFinite(baseSpCost) || baseSpCost <= 0) {
    return effective;
  }
  const reduceSpTimings = ['OnFirstBattleStart', 'OnBattleStart', 'OnEveryTurnIncludeSpecial'];
  if (String(state?.turnState?.turnType ?? '') === 'extra') {
    reduceSpTimings.push('OnAdditionalTurnStart');
  }
  if (isOverDriveActive(state?.turnState)) {
    reduceSpTimings.push('OnOverdriveStart');
  }
  const reduceSp = resolvePassiveReduceSpForMember(state, member, reduceSpTimings);
  const resolvedSpCost =
    Number.isFinite(reduceSp.amount) && reduceSp.amount > 0
      ? Math.max(0, baseSpCost - reduceSp.amount)
      : baseSpCost;
  const highBoostModifiers = resolveHighBoostModifiersForMember(member);
  const highBoostAdjustedSpCost =
    highBoostModifiers.active && Number(highBoostModifiers.spCostIncrease ?? 0) > 0
      ? truncateToTwoDecimals(resolvedSpCost + Number(highBoostModifiers.spCostIncrease))
      : resolvedSpCost;

  // 鬼神化中 STezuka: Ep/Morale/Motivation/-1 以外のSP消費を強制0に
  // （consumeType === 'Sp' かつ baseSpCost > 0 はL4655の早期returnで保証済み）
  if (
    String(member?.characterId) === TEZUKA_CHARACTER_ID &&
    Boolean(member?.isReinforcedMode)
  ) {
    return { ...effective, spCost: 0, actionSelectionPassiveEvents: [] };
  }

  const sprightlyCostAdjustment = resolveSprightlyCostAdjustment(
    member,
    effective,
    highBoostAdjustedSpCost
  );
  if (sprightlyCostAdjustment) {
    return {
      ...effective,
      spCost: sprightlyCostAdjustment.spCostAfter,
      actionSelectionPassiveEvents: structuredClone(reduceSp.matchedPassives ?? []),
      sprightlyCostAdjustment,
    };
  }

  if (highBoostAdjustedSpCost === baseSpCost && (reduceSp.matchedPassives?.length ?? 0) === 0) {
    return effective;
  }
  return {
    ...effective,
    spCost: highBoostAdjustedSpCost,
    actionSelectionPassiveEvents: structuredClone(reduceSp.matchedPassives ?? []),
  };
}

function resolveSprightlyCostAdjustment(member, effectiveSkill, spCostBefore) {
  const parts = Array.isArray(effectiveSkill?.parts) ? effectiveSkill.parts : [];
  if (parts.some((part) => String(part?.skill_type ?? '') === SPRIGHTLY_STATUS_TYPE)) {
    return null;
  }
  const numericSpCost = Number(spCostBefore);
  if (!Number.isFinite(numericSpCost) || numericSpCost <= 0) {
    return null;
  }
  const effects = typeof member?.resolveEffectiveStatusEffects === 'function'
    ? member.resolveEffectiveStatusEffects(SPRIGHTLY_STATUS_TYPE)
    : [];
  const selected = effects.find(
    (effect) =>
      String(effect?.exitCond ?? '') === 'Count' &&
      Number.isFinite(Number(effect?.power)) &&
      Number(effect.power) > 0
  );
  if (!selected) {
    return null;
  }
  const reductionRate = Math.min(1, Number(selected.power));
  const spCostAfter = Math.max(
    SPRIGHTLY_MIN_SP_COST,
    Math.ceil(numericSpCost * (1 - reductionRate))
  );
  return {
    effectId: Number(selected.effectId),
    reductionRate,
    spCostBefore: numericSpCost,
    spCostAfter,
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

function getStageSetupEnchantEffects(state) {
  return Array.isArray(state?.stageSetupEnchantEffects) ? state.stageSetupEnchantEffects : [];
}

function resolveStageSetupOdGaugeGainBonusPercent(state) {
  return getStageSetupEnchantEffects(state).reduce((sum, effect) => {
    if (String(effect?.effectType ?? '') !== STAGE_SETUP_ENCHANT_EFFECT_TYPES.OD_GAUGE_GAIN_BONUS_PERCENT) {
      return sum;
    }
    const amount = Number(effect?.amount ?? 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

function resolveCombinedDrivePierceOdBonusPercent(state, effectiveHitCount, drivePiercePercent) {
  return truncateToTwoDecimals(
    resolveDrivePierceBonusPercent(effectiveHitCount, drivePiercePercent) +
      resolveStageSetupOdGaugeGainBonusPercent(state)
  );
}

function resolveBabiedOdGaugeGainBonusPercent(actionEntry) {
  return truncateToTwoDecimals(
    Number(actionEntry?.specialPassiveModifiers?.babiedOdGaugeGainUpRate ?? 0) * 100
  );
}

function isFrontlinePosition(position) {
  return Number.isInteger(position) && position >= 0 && position <= 2;
}

function isBacklinePosition(position) {
  return Number.isInteger(position) && position >= 3 && position <= 5;
}

function shouldApplyStageSetupConditionalSpEffect(effect, member, turnState) {
  const effectType = String(effect?.effectType ?? '');
  if (effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN) {
    return countEnemiesWithStatus(turnState, ENEMY_STATUS_DOWN_TURN) > 0;
  }
  if (effectType !== STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP) {
    return false;
  }

  const memberSp = Number(member?.sp?.current ?? 0);
  if (!(memberSp < 0)) {
    return false;
  }

  const scope = String(effect?.scope ?? '');
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT) {
    return isFrontlinePosition(Number(member?.position));
  }
  if (scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK) {
    return isBacklinePosition(Number(member?.position));
  }
  return false;
}

function applyStageSetupTurnStartEnchantEffects(state, party, recoveryEvents, passiveEvents) {
  const enchantEffects = getStageSetupEnchantEffects(state).filter((effect) => {
    const effectType = String(effect?.effectType ?? '');
    return (
      effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_ENEMY_DOWN ||
      effectType === STAGE_SETUP_ENCHANT_EFFECT_TYPES.TURN_START_SP_IF_NEGATIVE_SP
    );
  });
  if (enchantEffects.length === 0) {
    return;
  }

  for (const effect of enchantEffects) {
    let totalSpDelta = 0;
    for (const member of party) {
      if (!shouldApplyStageSetupConditionalSpEffect(effect, member, state?.turnState)) {
        continue;
      }
      const amount = Number(effect?.amount ?? 0);
      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }
      const spChangeEvent = member.applySpDelta(amount, 'passive');
      if (spChangeEvent) {
        recoveryEvents.push(spChangeEvent);
        totalSpDelta += Number(spChangeEvent?.delta ?? 0);
      }
    }
    if (totalSpDelta !== 0 && Array.isArray(passiveEvents)) {
      passiveEvents.push(
        createStageSetupPassiveEvent(state?.turnState, {
          timing: 'OnEveryTurn',
          label: buildStageSetupEnchantEffectLabel(effect),
          effectType: String(effect?.effectType ?? ''),
          effectTypes: ['HealSp'],
          spDelta: totalSpDelta,
        })
      );
    }
  }
}

export function applyStageSetupTurnStartEffects(state, recoveryEvents = [], passiveEvents = []) {
  const party = Array.isArray(state?.party) ? state.party : [];
  const turnState = state?.turnState ?? null;
  const stageSetupTurnly = state?.stageSetupTurnly ?? null;
  const events = Array.isArray(recoveryEvents) ? recoveryEvents : [];
  const passiveLogEvents = Array.isArray(passiveEvents) ? passiveEvents : [];

  if (stageSetupTurnly) {
    const spEffects = [
      {
        amount: Number(stageSetupTurnly.spAll ?? 0),
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL,
      },
      {
        amount: Number(stageSetupTurnly.spFront ?? 0),
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT,
      },
      {
        amount: Number(stageSetupTurnly.spBack ?? 0),
        scope: STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK,
      },
    ];
    for (const effect of spEffects) {
      if (!Number.isFinite(effect.amount) || effect.amount === 0) {
        continue;
      }
      let totalSpDelta = 0;
      for (const member of party) {
        const position = Number(member?.position);
        const appliesToFront = effect.scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT && position >= 0 && position <= 2;
        const appliesToBack = effect.scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.BACK && position >= 3 && position <= 5;
        const appliesToAll = effect.scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL;
        if (!appliesToAll && !appliesToFront && !appliesToBack) {
          continue;
        }
        const spChangeEvent = member.applySpDelta(effect.amount, 'passive');
        if (spChangeEvent) {
          events.push(spChangeEvent);
          totalSpDelta += Number(spChangeEvent?.delta ?? 0);
        }
      }
      if (totalSpDelta !== 0) {
        passiveLogEvents.push(
          createStageSetupPassiveEvent(turnState, {
            timing: 'OnEveryTurn',
            label: buildStageSetupTurnlySpLabel(effect.scope, effect.amount),
            effectType:
              effect.scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.ALL
                ? 'turnlySpAll'
                : effect.scope === STAGE_SETUP_ENCHANT_EFFECT_SCOPES.FRONT
                  ? 'turnlySpFront'
                  : 'turnlySpBack',
            effectTypes: ['HealSp'],
            spDelta: totalSpDelta,
          })
        );
      }
    }
  }

  applyStageSetupTurnStartEnchantEffects(state, party, events, passiveLogEvents);

  if (stageSetupTurnly && turnState) {
    const odGaugeDelta = Number(stageSetupTurnly.odGauge ?? 0);
    if (Number.isFinite(odGaugeDelta) && odGaugeDelta !== 0) {
      const startOdGauge = Number(turnState.odGauge ?? 0);
      turnState.odGauge = clampOdGauge(
        truncateToTwoDecimals(Number(turnState.odGauge ?? 0) + odGaugeDelta)
      );
      const appliedOdGaugeDelta = truncateToTwoDecimals(Number(turnState.odGauge ?? 0) - startOdGauge);
      if (appliedOdGaugeDelta !== 0) {
        passiveLogEvents.push(
          createStageSetupPassiveEvent(turnState, {
            timing: 'OnEveryTurn',
            label: buildStageSetupTurnlyOdLabel(odGaugeDelta),
            effectType: 'turnlyOdGauge',
            effectTypes: ['OverDrivePointUp'],
            odGaugeDelta: appliedOdGaugeDelta,
          })
        );
      }
    }
  }

  return events;
}

function resolveStageSetupSpOnEnemyKillAmount(state) {
  return getStageSetupEnchantEffects(state).reduce((sum, effect) => {
    if (String(effect?.effectType ?? '') !== STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL) {
      return sum;
    }
    const amount = Number(effect?.amount ?? 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

function applyStageSetupSpOnEnemyKill(state, actionEntry, killCount) {
  const normalizedKillCount = Math.max(0, Math.trunc(Number(killCount ?? 0)));
  if (normalizedKillCount <= 0) {
    return [];
  }
  const amountPerKill = resolveStageSetupSpOnEnemyKillAmount(state);
  if (!Number.isFinite(amountPerKill) || amountPerKill === 0) {
    return [];
  }

  const totalDelta = amountPerKill * normalizedKillCount;
  const events = [];
  for (const target of state?.party ?? []) {
    const change = target.applySpDelta(totalDelta, 'passive');
    if (!change) {
      continue;
    }
    events.push(
      buildActionScopedEvent(actionEntry, {
        ...change,
        source: 'passive',
        sourceType: 'stage_setup_enchant',
        effectType: STAGE_SETUP_ENCHANT_EFFECT_TYPES.SP_ON_ENEMY_KILL,
      })
    );
  }
  return events;
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

  const driveBonusPercent = resolveCombinedDrivePierceOdBonusPercent(
    state,
    baseHitCount,
    member?.drivePiercePercent ?? 0
  );
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
  const targetType = String(skill?.targetType ?? skill?.target_type ?? '');
  const isAllTarget = targetType === 'All' || targetType === 'EnemyAll';

  const baseHitCount = resolveSkillHitCount(skill);
  const funnelHitBonus = Number(options?.funnelHitBonus ?? 0);
  const hitCountPerEnemy = resolveActionHitCount(skill, {
    forOd: true,
    funnelHitBonus,
  });
  const odEnemyAnalysis = hasDamage
    ? analyzeEnemiesEligibleForOdGain(state, member, skillWithTarget, numericEnemyCount)
    : null;
  const targetEnemyIndexes = isAllTarget
    ? [...(odEnemyAnalysis?.eligibleEnemyIndexes ?? [])]
    : (odEnemyAnalysis?.eligibleEnemyIndexes?.slice?.(0, 1) ?? []);

  let attackGain = 0;
  if (hasDamage && targetEnemyIndexes.length > 0) {
    if (isNormalAttackSkill(skill)) {
      attackGain = truncateToTwoDecimals(
        targetEnemyIndexes.reduce((sum, targetEnemyIndex) => {
          const perHitGain = truncateToTwoDecimals(
            OD_GAUGE_PER_HIT_PERCENT * resolveEnemyOdRateMultiplier(state?.turnState, targetEnemyIndex)
          );
          return sum + truncateToTwoDecimals(perHitGain * hitCountPerEnemy);
        }, 0)
      );
    } else {
      const bonusPercent = truncateToTwoDecimals(
        resolveCombinedDrivePierceOdBonusPercent(
          state,
          baseHitCount,
          member?.drivePiercePercent ?? 0
        ) + resolveBabiedOdGaugeGainBonusPercent(actionEntry)
      );
      const multiplier = 1 + bonusPercent / 100;
      attackGain = truncateToTwoDecimals(
        targetEnemyIndexes.reduce((sum, targetEnemyIndex) => {
          const perHitGain = truncateToTwoDecimals(
            OD_GAUGE_PER_HIT_PERCENT *
              multiplier *
              resolveEnemyOdRateMultiplier(state?.turnState, targetEnemyIndex)
          );
          return sum + truncateToTwoDecimals(perHitGain * hitCountPerEnemy);
        }, 0)
      );
    }
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

/**
 * 敵の od_rate に基づく OD 上昇量補正係数を返す。
 * - od_rate=0 は補正なし（係数 1.0）。
 * - 0 以外は od_rate / ENEMY_OD_RATE_UNIT（例: 8500 → 0.85）。
 * - 直接倍率表現（例: 0.5, 1, 2）も受け入れる。
 */
function resolveEnemyOdRateMultiplier(turnState, targetEnemyIndex) {
  const enemyState = getEnemyState(turnState);
  const rawRate = Number(enemyState.odRateByEnemy?.[String(Number(targetEnemyIndex))] ?? 0);
  if (!Number.isFinite(rawRate) || rawRate === 0) {
    return 1;
  }
  if (Math.abs(rawRate) <= 10) {
    return rawRate;
  }
  return rawRate / ENEMY_OD_RATE_UNIT;
}

function applyOdGaugeFromActions(state, previewRecord, options = {}) {
  const consumeStatusEffects = options.consumeStatusEffects !== false;
  const buffMetadataValidation = resolveBuffMetadataValidationOptions(options);
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
    const actionType = resolveActionContextTypeForSkill(skill);
    const actionContext = buildActionContext(actionType, skill, {
      hasDamage,
      turnPhase: 'PlayerTurn',
      isNormalAttack: actionType === 'NormalAttack',
      isPursuit: actionType === 'Pursuit',
      actorCharacterId: member.characterId,
    });
    const funnelResolution = hasDamage
      ? resolveFunnelCompetitionForAction(member, actionContext, { buffMetadataValidation })
      : { selectedEffects: [], selectedCountEffectIds: [] };
    const mindEyeResolution = hasDamage
      ? resolveMindEyeCompetitionForAction(member, actionContext, { buffMetadataValidation })
      : { selectedEffects: [], selectedCountEffectIds: [] };
    const funnelEffects = funnelResolution.selectedEffects.slice(0, 2);
    const resolvedFunnelHitBonus = funnelEffects.reduce(
      (sum, effect) => sum + Math.max(0, Number(effect?.power ?? 0)),
      0
    );
    const actionFunnelHitBonus = Number(actionEntry?.skillFunnelHitBonus ?? NaN);
    const recomputedFunnelHitBonus = resolvedFunnelHitBonus + resolveImmediateSelfFunnelHitBonus(skill);
    const funnelHitBonus = Number.isFinite(actionFunnelHitBonus)
      ? Math.max(0, actionFunnelHitBonus, recomputedFunnelHitBonus)
      : recomputedFunnelHitBonus;
    const baseHitCount = resolveSkillHitCount(skill);
    const effectiveHitCountPerEnemy = resolveActionHitCount(skill, {
      forOd: true,
      funnelHitBonus,
    });
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
    const eligibleEnemyCount = Number(odEnemyAnalysis?.eligibleEnemyCount ?? 0);
    const effectiveHitCount =
      String(skill?.targetType ?? skill?.target_type ?? '') === 'All' ||
      String(skill?.targetType ?? skill?.target_type ?? '') === 'EnemyAll'
        ? effectiveHitCountPerEnemy * eligibleEnemyCount
        : effectiveHitCountPerEnemy * Math.min(1, eligibleEnemyCount);
    const odGaugeGain = computeOdGaugeGainPercentBySkill(
      skill,
      state,
      enemyCount,
      member,
      actionEntry,
      {
        funnelHitBonus,
      }
    );
    // 追撃ヒットの OD 寄与を前衛のスキル属性・バフ状態から完全に独立して計算する。
    // 追撃はバフ/デバフの効果を受けない無属性攻撃であり、ドライブピアス・Funnel・
    // 全体攻撃の敵数倍・通常攻撃の固定OD 1hit相当は適用しない。
    const pursuedHitCount = Math.max(0, Number(actionEntry?.pursuedHitCount ?? 0));
    const pursuedTargetEnemyIndex = Number.isFinite(Number(actionEntry?.pursuedTargetEnemyIndex))
      ? Number(actionEntry.pursuedTargetEnemyIndex)
      : (Number.isFinite(Number(actionEntry?.targetEnemyIndex)) ? Number(actionEntry.targetEnemyIndex) : null);
    const pursuitPerHitGain =
      Number.isInteger(pursuedTargetEnemyIndex) && isEnemyAlive(state?.turnState, pursuedTargetEnemyIndex)
        ? truncateToTwoDecimals(
            OD_GAUGE_PER_HIT_PERCENT * resolveEnemyOdRateMultiplier(state.turnState, pursuedTargetEnemyIndex)
          )
        : 0;
    const pursuitOdGain =
      pursuedHitCount > 0 && pursuitPerHitGain > 0
        ? truncateToTwoDecimals(pursuedHitCount * pursuitPerHitGain)
        : 0;
    const odGaugeDown = computeOverDrivePointDownPercent(
      effectiveParts,
      state,
      member,
      skill,
      actionEntry
    );
    const effectiveOdGaugeGain = truncateToTwoDecimals(odGaugeGain + pursuitOdGain);
    const delta = truncateToTwoDecimals(Number(effectiveOdGaugeGain ?? 0) - Number(odGaugeDown ?? 0));
    const effectiveDelta = Number.isFinite(delta) ? delta : 0;
    const shouldApplyOdDelta = effectiveDelta !== 0;
    if (!hasDamage && !shouldApplyOdDelta) {
      continue;
    }

    const beforeOdGauge = currentOdGauge;
    if (shouldApplyOdDelta) {
      currentOdGauge = truncateToTwoDecimals(beforeOdGauge + effectiveDelta);
      currentOdGauge = Math.max(OD_GAUGE_MIN_PERCENT, Math.min(OD_GAUGE_MAX_PERCENT, currentOdGauge));
    }

    let consumedFunnels = [];
    let consumedMindEyes = [];
    if (
      hasDamage &&
      consumeStatusEffects &&
      !isNormalAttackSkill(skill) &&
      !isPursuitOnlySkill(skill)
    ) {
      consumedFunnels = consumeSelectedCountStatusEffectsWithOrchestrator(
        member,
        'Funnel',
        funnelResolution.selectedCountEffectIds,
        actionContext
      );
      consumedMindEyes = consumeSelectedCountStatusEffectsWithOrchestrator(
        member,
        'MindEye',
        mindEyeResolution.selectedCountEffectIds,
        actionContext
      );
    }

    let damageContext = null;
    if (hasDamage || shouldApplyOdDelta) {
      const allAbilityDownMaps = buildEnemyAllAbilityPenaltyMaps(state.turnState, enemyCount);
      const selectedMindEyeEffects = (mindEyeResolution.selectedEffects ?? []).map((effect) =>
        summarizeActiveBuffStatusEffect(effect)
      );
      const chargeEffects =
        typeof member?.resolveEffectiveStatusEffects === 'function'
          ? member
              .resolveEffectiveStatusEffects('BuffCharge')
              .map((effect) => summarizeActiveBuffStatusEffect(effect))
          : [];
      const affinityMaps = buildDamageAffinityMapsForAction(
        state,
        member,
        skillWithTarget,
        odEnemyAnalysis?.effectiveDamageRatesByEnemy
      );
      const zoneMatchForDamageContext = skillMatchesActiveZone(state, skill, member);
      const hasPenetrationCritical = effectiveParts.some(
        (part) => String(part?.skill_type ?? '') === 'PenetrationCriticalAttack'
      );
      const isNormalAttack = isNormalAttackSkill(skill);
      // WIP: 将来の破壊率追跡実装時に damageBreakdownInput / damageContext へ渡す
      const isDestructionRateGainSkill = hasDestructionRateGainPartInParts(effectiveParts); // eslint-disable-line no-unused-vars
      const damageBreakdownInput = hasDamage ? {
        targetEnemyIndex: odEnemyAnalysis?.targetEnemyIndex,
        isNormalAttack,
        effectiveDamageRatesByEnemy: odEnemyAnalysis?.effectiveDamageRatesByEnemy,
        activeStatusEffects: actionEntry?.activeStatusEffects ?? [],
        chargeEffects,
        selectedMindEyeEffects,
        funnelEffects,
        enemyStatusEffects: getEnemyState(state.turnState).statuses,
        attackReferencesByEnemy: affinityMaps.attackReferencesByEnemy,
        affinityContributionsByEnemy: affinityMaps.affinityContributionsByEnemy,
        tokenAttackTokenCount: Number(actionEntry?.tokenAttackContext?.tokenCount ?? actionEntry?.startToken ?? 0),
        tokenAttackRatePerToken: Number(actionEntry?.tokenAttackContext?.ratePerToken ?? 0),
        tokenAttackTotalRate: Number(actionEntry?.tokenAttackContext?.totalRate ?? 0),
        attackByOwnDpRateResolvedMultiplier: Number(
          actionEntry?.attackByOwnDpRateContext?.resolvedMultiplier ?? 0
        ),
        highBoostSkillAtkRate: Number(actionEntry?.specialPassiveModifiers?.highBoostSkillAtkRate ?? 0),
        criticalRateUpRate: Number(actionEntry?.specialPassiveModifiers?.criticalRateUpRate ?? 0),
        criticalDamageUpRate: Number(actionEntry?.specialPassiveModifiers?.criticalDamageUpRate ?? 0),
        damageRateUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.damageRateUpRate ?? 0),
        babiedSkillAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.babiedSkillAttackUpRate ?? 0),
        divaSkillAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.divaSkillAttackUpRate ?? 0),
        foodBuffAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.foodBuffAttackUpRate ?? 0),
        markAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.markAttackUpRate ?? 0),
        markCriticalRateUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalRateUp ?? 0),
        markCriticalDamageUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalDamageUp ?? 0),
        attackUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.attackUpPerTokenRate ?? 0),
        zoneType: zoneMatchForDamageContext.zoneState?.type ?? '',
        zonePowerRate: zoneMatchForDamageContext.matched
          ? Number(zoneMatchForDamageContext.zoneState?.powerRate ?? 0)
          : 0,
        hasPenetrationCritical,
      } : null;
      const criticalRateBreakdown = damageBreakdownInput ? buildCriticalRateBreakdown(damageBreakdownInput) : null;
      const damageBreakdown = damageBreakdownInput ? buildDamageBreakdown(damageBreakdownInput) : null;
      damageContext = buildDamageCalculationContext({
        actorCharacterId: member.characterId,
        actorStyleId: member.styleId,
        skillId: skill.skillId,
        skillLabel: skill.label,
        skillName: skill.name,
        targetType: skill.targetType,
        isNormalAttack,
        enemyCount,
        targetEnemyIndex: odEnemyAnalysis?.targetEnemyIndex,
        baseHitCount,
        funnelHitBonus,
        effectiveHitCountPerEnemy,
        effectiveHitCountTotal: effectiveHitCount,
        eligibleEnemyIndexes: odEnemyAnalysis?.eligibleEnemyIndexes,
        effectiveDamageRatesByEnemy: odEnemyAnalysis?.effectiveDamageRatesByEnemy,
        enemyParamBorderByEnemy: getEnemyState(state.turnState).paramBorderByEnemy,
        activeStatusEffects: actionEntry?.activeStatusEffects ?? [],
        chargeEffects,
        enemyStatusEffects: getEnemyState(state.turnState).statuses,
        attackReferencesByEnemy: affinityMaps.attackReferencesByEnemy,
        affinityContributionsByEnemy: affinityMaps.affinityContributionsByEnemy,
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
        highBoostSkillAtkRate: Number(actionEntry?.specialPassiveModifiers?.highBoostSkillAtkRate ?? 0),
        attackUpRate: Number(actionEntry?.specialPassiveModifiers?.attackUpRate ?? 0),
        defenseUpRate: Number(actionEntry?.specialPassiveModifiers?.defenseUpRate ?? 0),
        criticalRateUpRate: Number(actionEntry?.specialPassiveModifiers?.criticalRateUpRate ?? 0),
        criticalDamageUpRate: Number(actionEntry?.specialPassiveModifiers?.criticalDamageUpRate ?? 0),
        damageRateUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.damageRateUpRate ?? 0),
        babiedSkillAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.babiedSkillAttackUpRate ?? 0),
        babiedOdGaugeGainUpRate: Number(actionEntry?.specialPassiveModifiers?.babiedOdGaugeGainUpRate ?? 0),
        divaSkillAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.divaSkillAttackUpRate ?? 0),
        foodBuffAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.foodBuffAttackUpRate ?? 0),
        foodBuffHealDpByDamageRate: Number(actionEntry?.specialPassiveModifiers?.foodBuffHealDpByDamageRate ?? 0),
        attackUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.attackUpPerTokenRate ?? 0),
        defenseUpPerTokenRate: Number(actionEntry?.specialPassiveModifiers?.defenseUpPerTokenRate ?? 0),
        markAttackUpRate: Number(actionEntry?.specialPassiveModifiers?.markAttackUpRate ?? 0),
        markDamageTakenDownRate: Number(actionEntry?.specialPassiveModifiers?.markDamageTakenDownRate ?? 0),
        markDestructionRateGainBonusRate: Number(actionEntry?.specialPassiveModifiers?.markDestructionRateGainBonusRate ?? 0),
        markCriticalRateUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalRateUp ?? 0),
        markCriticalDamageUp: Number(actionEntry?.specialPassiveModifiers?.markCriticalDamageUp ?? 0),
        accessoryAttackUpRate: 0,
        accessoryContributions: [],
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
        zoneType: zoneMatchForDamageContext.zoneState?.type ?? '',
        zonePowerRate: zoneMatchForDamageContext.matched
          ? Number(zoneMatchForDamageContext.zoneState?.powerRate ?? 0)
          : 0,
        hasPenetrationCritical,
        // WIP: 全能力ダウン（タリスマン/霊符・禍）は敵の防御ステータスを-N引き下げる効果。
        // ダメージ計算には自身の攻撃ステータスと敵の防御ステータスの差分が必要なため、
        // 現時点では威力詳細への表示対象外。将来の絶対ステータス追跡実装時に有効化する。
        enemyTalismanLevelByEnemy: allAbilityDownMaps.enemyTalismanLevelByEnemy,
        enemyDisasterLevelByEnemy: allAbilityDownMaps.enemyDisasterLevelByEnemy,
        enemyAllAbilityDownByEnemy: allAbilityDownMaps.enemyAllAbilityDownByEnemy,
        selectedMindEyeEffects,
        criticalRateBreakdown,
        damageBreakdown,
        funnelEffects,
      });
    }

    events.push(
      buildActionScopedEvent(actionEntry, {
        characterId: member.characterId,
        skillId: skill.skillId,
        skillName: skill.name,
        hitCount: effectiveHitCount,
        baseHitCount,
        funnelHitBonus,
        consumedFunnelEffects: consumedFunnels,
        consumedMindEyeEffects: consumedMindEyes,
        damageContext,
        odGaugeGain: effectiveDelta,
        odGaugeRawGain: truncateToTwoDecimals(Number(effectiveOdGaugeGain ?? 0)),
        odGaugeRawDown: truncateToTwoDecimals(Number(odGaugeDown ?? 0)),
        odGaugeBefore: beforeOdGauge,
        odGaugeAfter: currentOdGauge,
      })
    );
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

function resolveCountOnlyCompetitionForEffects(effects, options = {}) {
  const countLimit = Math.max(0, Number(options.countLimit ?? 0));
  const groupOnlyByOnlyGroup = Boolean(options.groupOnlyByOnlyGroup);
  const normalized = Array.isArray(effects) ? effects : [];
  const active = normalized.filter(
    (effect) => Number(effect?.remaining ?? 0) > 0 || String(effect?.exitCond ?? '') === 'Eternal'
  );

  const persistentDefaults = active.filter(
    (effect) => String(effect?.limitType ?? '') !== 'Only' && String(effect?.exitCond ?? '') !== 'Count'
  );
  const onlyCandidates = active.filter((effect) => String(effect?.limitType ?? '') === 'Only');
  const countCandidates = active.filter(
    (effect) => String(effect?.limitType ?? '') !== 'Only' && String(effect?.exitCond ?? '') === 'Count'
  );

  const onlyWinners = groupOnlyByOnlyGroup
    ? pickTopOnlyStatusEffectsByOnlyGroup(onlyCandidates)
    : pickTopStatusEffectsByPower(onlyCandidates, 1);
  const bestOnly = onlyWinners[0] ?? null;
  const topCount = pickTopStatusEffectsByPower(countCandidates, countLimit);
  const onlyPower = groupOnlyByOnlyGroup
    ? onlyWinners.reduce((sum, effect) => sum + Number(effect?.power ?? 0), 0)
    : bestOnly ? Number(bestOnly?.power ?? 0) : 0;
  const countPower = topCount.reduce((sum, effect) => sum + Number(effect?.power ?? 0), 0);
  const adopted = countPower >= onlyPower ? topCount : onlyWinners;
  const selectedEffects = [...persistentDefaults, ...adopted].sort(compareStatusEffectsByPowerDesc);
  const selectedCountEffectIds = adopted
    .filter((effect) => String(effect?.exitCond ?? '') === 'Count')
    .map((effect) => Number(effect?.effectId ?? 0));

  return {
    selectedEffects,
    selectedCountEffectIds,
  };
}

function pickTopOnlyStatusEffectsByOnlyGroup(effects) {
  const winnersByOnlyGroup = new Map();
  for (const effect of Array.isArray(effects) ? effects : []) {
    const onlyGroupKey = createStatusEffectOnlyCompetitionKey(effect);
    const current = winnersByOnlyGroup.get(onlyGroupKey);
    if (!current || compareStatusEffectsByPowerDesc(effect, current) < 0) {
      winnersByOnlyGroup.set(onlyGroupKey, effect);
    }
  }
  return [...winnersByOnlyGroup.values()].sort(compareStatusEffectsByPowerDesc);
}

function createStatusEffectOnlyCompetitionKey(effect) {
  const sourceType = String(effect?.sourceType ?? 'skill') === 'passive' ? 'passive' : 'skill';
  const explicit = String(effect?.metadata?.onlyGroupKey ?? '').trim();
  if (explicit) {
    return `${sourceType}|${explicit}`;
  }
  const effectName = String(effect?.metadata?.effectName ?? '').trim();
  const elements = Array.isArray(effect?.elements)
    ? [...new Set(effect.elements.map((value) => String(value ?? '').trim()).filter(Boolean))].sort()
    : [];
  return `${sourceType}|${effectName}|${elements.join(',')}`;
}

function resolveActionContextTypeForSkill(skill) {
  if (isNormalAttackSkill(skill)) {
    return 'NormalAttack';
  }
  if (isPursuitOnlySkill(skill)) {
    return 'Pursuit';
  }
  return 'Skill';
}

function resolveBuffMetadataValidationOptions(options = {}) {
  const raw = options?.buffMetadataValidation ?? options?.validateBuffMetadata;
  if (raw === true) {
    return {
      enabled: true,
      mode: 'warning',
      onWarning: null,
    };
  }
  if (!raw || raw === false) {
    return {
      enabled: false,
      mode: 'warning',
      onWarning: null,
    };
  }

  const mode = String(raw?.mode ?? 'warning').toLowerCase() === 'strict' ? 'strict' : 'warning';
  const onWarning = typeof raw?.onWarning === 'function' ? raw.onWarning : null;
  return {
    enabled: true,
    mode,
    onWarning,
  };
}

function shouldAllowEffectByMetadataValidation(effect, validationOptions, context = {}) {
  if (!validationOptions?.enabled) {
    return true;
  }
  const errors = validateBuffMetadata(effect);
  if (!Array.isArray(errors) || errors.length <= 0) {
    return true;
  }

  const statusType = String(effect?.statusType ?? context?.statusType ?? 'Unknown');
  const effectId = Number(effect?.effectId ?? 0);
  const characterId = String(context?.characterId ?? 'Unknown');
  const phase = String(context?.phase ?? 'BuffMetadataValidation');
  const skillId = Number(context?.skillId ?? 0);
  const warningMessage = `[${phase}] invalid buff metadata: characterId=${characterId}, skillId=${skillId}, statusType=${statusType}, effectId=${effectId}, errors=${errors.join(' | ')}`;

  if (validationOptions.onWarning) {
    validationOptions.onWarning(warningMessage);
  }

  return validationOptions.mode !== 'strict';
}

export function evaluateCompetitiveConsumption(effects, actionContext, options = {}) {
  const resolution = resolveCountOnlyCompetitionForEffects(effects, options);
  if (!actionContext || typeof actionContext !== 'object') {
    return resolution;
  }

  const validationOptions = resolveBuffMetadataValidationOptions(options);

  const selectedCountEffectIds = resolution.selectedEffects
    .filter((effect) => String(effect?.exitCond ?? '') === 'Count')
    .filter((effect) =>
      shouldAllowEffectByMetadataValidation(effect, validationOptions, {
        phase: 'CompetitiveConsumption',
        characterId: String(actionContext?.actorCharacterId ?? ''),
        skillId: Number(actionContext?.skill?.skillId ?? actionContext?.skill?.id ?? 0),
      })
    )
    .filter((effect) => shouldConsume(effect, actionContext).shouldConsume)
    .map((effect) => Number(effect?.effectId ?? 0))
    .filter((effectId) => Number.isFinite(effectId) && effectId > 0);

  return {
    ...resolution,
    selectedCountEffectIds,
  };
}

function resolveFunnelCompetitionForAction(member, actionContext = null, options = {}) {
  if (!member || typeof member.getFunnelEffects !== 'function') {
    return { selectedEffects: [], selectedCountEffectIds: [] };
  }
  return evaluateCompetitiveConsumption(member.getFunnelEffects({ activeOnly: true }), actionContext, {
    countLimit: 2,
    groupOnlyByOnlyGroup: true,
    ...options,
  });
}

function resolveMindEyeCompetitionForAction(member, actionContext = null, options = {}) {
  if (!member || typeof member.getMindEyeEffects !== 'function') {
    return { selectedEffects: [], selectedCountEffectIds: [] };
  }
  return evaluateCompetitiveConsumption(member.getMindEyeEffects({ activeOnly: true }), actionContext, {
    countLimit: 2,
    ...options,
  });
}

function consumeSelectedCountStatusEffects(member, statusType, selectedCountEffectIds) {
  if (!member || typeof member.tickStatusEffectsWhere !== 'function') {
    return [];
  }
  const idSet = new Set(
    (selectedCountEffectIds ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  if (idSet.size <= 0) {
    return [];
  }
  return member.tickStatusEffectsWhere(
    (effect) =>
      String(effect?.statusType ?? '') === String(statusType ?? '') &&
      String(effect?.exitCond ?? '') === 'Count' &&
      idSet.has(Number(effect?.effectId ?? 0))
  );
}

/**
 * Phase 3.1 Integration: orchestrator-based consumption evaluation
 *
 * This function is active in the Funnel/MindEye consumption path and
 * falls back to legacy consumption when actionContext is not provided.
 * 
 * @param {Object} member - Character member
 * @param {string} statusType - Status effect type (e.g., 'Funnel', 'MindEye')
 * @param {Array} selectedCountEffectIds - Effect IDs to potentially consume
 * @param {Object} actionContext - Action context for orchestrator evaluation
 * @returns {Array} Consumed effects
 */
function consumeSelectedCountStatusEffectsWithOrchestrator(
  member,
  statusType,
  selectedCountEffectIds,
  actionContext
) {
  if (!member || typeof member.tickStatusEffectsWhere !== 'function') {
    return [];
  }
  const idSet = new Set(
    (selectedCountEffectIds ?? [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  if (idSet.size <= 0) {
    return [];
  }
  if (!actionContext || typeof actionContext !== 'object') {
    return consumeSelectedCountStatusEffects(member, statusType, selectedCountEffectIds);
  }
  return member.tickStatusEffectsWhere(
    (effect) =>
      String(effect?.statusType ?? '') === String(statusType ?? '') &&
      String(effect?.exitCond ?? '') === 'Count' &&
      idSet.has(Number(effect?.effectId ?? 0)) &&
      shouldConsume(effect, actionContext).shouldConsume
  );
}

function resolveFunnelHitBonusForMember(member, maxStacks = 2) {
  if (!member) {
    return 0;
  }
  const effects = resolveFunnelCompetitionForAction(member).selectedEffects.slice(
    0,
    Math.max(0, Number(maxStacks) || 0)
  );
  return effects.reduce((sum, effect) => sum + Math.max(0, Number(effect?.power ?? 0)), 0);
}

function resolveEffectivePreviewHitCount(skill, state, member) {
  const baseHitCount = resolveSkillHitCount(skill);
  const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
  const hasDamage = hasDamagePartInParts(effectiveParts);
  const immediateSelfFunnelHitBonus = resolveImmediateSelfFunnelHitBonus(skill);
  if (!hasDamage) {
    return {
      baseHitCount,
      funnelHitBonus: immediateSelfFunnelHitBonus,
      effectiveHitCount: baseHitCount + immediateSelfFunnelHitBonus,
    };
  }

  const funnelHitBonus = resolveFunnelHitBonusForMember(member, 2) + immediateSelfFunnelHitBonus;
  return {
    baseHitCount,
    funnelHitBonus,
    effectiveHitCount: resolveActionHitCount(skill, { funnelHitBonus }),
  };
}

function isTimedActiveBuffPart(part) {
  if (!part || typeof part !== 'object') {
    return false;
  }
  const skillType = String(part?.skill_type ?? '').trim();
  if (!ACTIVE_BUFF_STATUS_SKILL_TYPES.has(skillType)) {
    return false;
  }
  const exitCond = String(part?.effect?.exitCond ?? '').trim();
  const limitType = String(part?.effect?.limitType ?? '').trim();
  return (exitCond && exitCond !== 'None') || (limitType && limitType !== 'None');
}

function addActiveBuffStatusEffect(actor, target, skill, part) {
  const skillType = String(part?.skill_type ?? '').trim();
  const statusType = resolveActiveBuffStatusType(skillType);
  if (!statusType) {
    return null;
  }
  const power = scaleHighBoostAttackBuffPower(actor, skillType, Number(part?.power?.[0] ?? 0));
  if (!Number.isFinite(power) || power === 0) {
    return null;
  }
  const effectName = String(skill?.effect ?? '').trim();
  const added = target.addStatusEffect({
    statusType,
    power,
    elements: normalizeStatusEffectElements(part?.elements),
    limitType: String(part?.effect?.limitType ?? 'Default'),
    exitCond: String(part?.effect?.exitCond ?? 'Count'),
    effect: {
      exitVal: Array.isArray(part?.effect?.exitVal) ? part.effect.exitVal : [1, 0],
    },
    sourceSkillId: Number(skill?.skillId ?? skill?.id ?? 0),
    sourceSkillLabel: String(skill?.label ?? ''),
    sourceSkillName: String(skill?.name ?? ''),
    sourceCharacterId: String(actor?.characterId ?? ''),
    sourceCharacterName: String(actor?.characterName ?? ''),
    sourceSkillDesc: String(skill?.desc ?? ''),
    metadata: {
      activeBuffStatus: true,
      effectName,
      includeNormalAttack: skillType === 'AttackUpIncludeNormal',
      onlyGroupKey: `${statusType}|${effectName}|${normalizeStatusEffectElements(part?.elements).join(',')}`,
      targetType: String(part?.target_type ?? ''),
      sourceSkillType: skillType,
    },
  });
  return {
    characterId: target.characterId,
    effectId: Number(added?.effectId ?? 0),
    statusType: String(added?.statusType ?? statusType),
    power: Number(added?.power ?? power),
    limitType: String(added?.limitType ?? ''),
    exitCond: String(added?.exitCond ?? ''),
    remaining: Number(added?.remaining ?? 0),
    elements: normalizeStatusEffectElements(added?.elements),
    effectName,
  };
}

function applyActiveBuffStatusEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts) {
      if (!isTimedActiveBuffPart(part)) {
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
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const added = addActiveBuffStatusEffect(actor, target, skill, part);
        if (!added) {
          continue;
        }
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            targetCharacterId,
            skillId: Number(skill?.skillId ?? skill?.id ?? 0),
            skillName: String(skill?.name ?? ''),
            sourceSkillLabel: String(skill?.label ?? ''),
            ...added,
          })
        );
      }
    }
  }
  return events;
}

function addDoubleActionStatusEffect(statusType, target, source, options = {}) {
  const normalizedStatusType = DOUBLE_ACTION_STATUS_TYPES.has(String(statusType ?? '').trim())
    ? String(statusType).trim()
    : DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE;
  const remaining = Number(options.remaining ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING);
  if (typeof target?.removeStatusEffectsWhere === 'function') {
    target.removeStatusEffectsWhere(
      (effect) => String(effect?.statusType ?? '') === normalizedStatusType
    );
  }
  const effect = target.addStatusEffect({
    statusType: normalizedStatusType,
    limitType: String(options.limitType ?? 'Only'),
    exitCond: String(options.exitCond ?? 'Count'),
    remaining: Number.isFinite(remaining) && remaining > 0 ? remaining : DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING,
    power: 1,
    sourceType: String(options.sourceType ?? 'skill'),
    sourceSkillId: Number(source?.sourceSkillId ?? 0),
    sourceSkillLabel: String(source?.sourceSkillLabel ?? ''),
    sourceSkillName: String(source?.sourceSkillName ?? ''),
    sourceCharacterId: String(source?.sourceCharacterId ?? ''),
    sourceCharacterName: String(source?.sourceCharacterName ?? ''),
    sourceSkillDesc: String(source?.sourceSkillDesc ?? ''),
    metadata: source?.metadata && typeof source.metadata === 'object' ? structuredClone(source.metadata) : null,
  });
  return {
    characterId: target.characterId,
    effectId: Number(effect?.effectId ?? 0),
    statusType: String(effect?.statusType ?? normalizedStatusType),
    limitType: String(effect?.limitType ?? 'Only'),
    exitCond: String(effect?.exitCond ?? 'Count'),
    remaining: Number(effect?.remaining ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING),
  };
}

function addDoubleActionExtraSkillStatusEffect(target, source, options = {}) {
  return addDoubleActionStatusEffect(DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE, target, source, options);
}

function applyDoubleActionExtraSkillEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '').trim() !== DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE) {
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
        const added = addDoubleActionExtraSkillStatusEffect(
          target,
          {
            sourceSkillId: Number(skill.skillId ?? 0),
            sourceSkillLabel: String(skill.label ?? ''),
            sourceSkillName: String(skill.name ?? ''),
            sourceCharacterId: String(actor.characterId ?? ''),
            sourceCharacterName: String(actor.characterName ?? ''),
            metadata: {
              targetType: String(part?.target_type ?? ''),
            },
          },
          {
            sourceType: 'skill',
            limitType: String(part?.effect?.limitType ?? 'Only'),
            exitCond: String(part?.effect?.exitCond ?? 'Count'),
            remaining: Number(part?.effect?.exitVal?.[0] ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING),
          }
        );
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            skillId: Number(skill.skillId ?? 0),
            skillName: String(skill.name ?? ''),
            ...added,
          })
        );
      }
    }
  }
  return events;
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
      if (String(part?.skill_type ?? '') !== 'Funnel' || isBeforeSelfFunnelPart(part)) {
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

        events.push(
          buildActionScopedEvent(actionEntry, {
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
          })
        );
      }
    }
  }
  return events;
}

function addSprightlyStatusEffect(target, part, source = {}) {
  const power = Number(part?.power?.[0] ?? 0);
  if (!target || !Number.isFinite(power) || power <= 0) {
    return null;
  }
  return target.addStatusEffect({
    statusType: SPRIGHTLY_STATUS_TYPE,
    limitType: String(part?.effect?.limitType ?? 'Once'),
    exitCond: String(part?.effect?.exitCond ?? 'Count'),
    remaining: Number(part?.effect?.exitVal?.[0] ?? 1),
    power,
    sourceType: String(source.sourceType ?? 'skill'),
    sourceSkillId: Number(source.sourceSkillId ?? 0),
    sourceSkillLabel: String(source.sourceSkillLabel ?? ''),
    sourceSkillName: String(source.sourceSkillName ?? ''),
    sourceCharacterId: String(source.sourceCharacterId ?? ''),
    sourceCharacterName: String(source.sourceCharacterName ?? ''),
    sourceSkillDesc: String(source.sourceSkillDesc ?? ''),
    metadata: {
      consumeTrigger: SPRIGHTLY_CONSUME_TRIGGER,
      consumeAmount: 1,
      targetType: String(part?.target_type ?? ''),
    },
  });
}

function applySprightlyEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? actionEntry._effectiveSkillSnapshot
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    for (const part of skill.parts ?? []) {
      if (String(part?.skill_type ?? '') !== SPRIGHTLY_STATUS_TYPE) {
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
        if (!target || !isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }
        const effect = addSprightlyStatusEffect(target, part, {
          sourceSkillId: Number(skill.skillId ?? skill.id ?? 0),
          sourceSkillLabel: String(skill.label ?? ''),
          sourceSkillName: String(skill.name ?? ''),
          sourceCharacterId: String(actor.characterId ?? ''),
          sourceCharacterName: String(actor.characterName ?? ''),
          sourceSkillDesc: String(skill.desc ?? ''),
        });
        if (!effect) continue;
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            targetCharacterId,
            skillId: Number(skill.skillId ?? skill.id ?? 0),
            skillName: String(skill.name ?? ''),
            effectId: effect.effectId,
            statusType: SPRIGHTLY_STATUS_TYPE,
            power: effect.power,
            limitType: effect.limitType,
            exitCond: effect.exitCond,
            remaining: effect.remaining,
            sourceSkillId: effect.sourceSkillId,
            sourceSkillLabel: effect.sourceSkillLabel,
            sourceSkillName: effect.sourceSkillName,
            sourceCharacterId: effect.sourceCharacterId,
            sourceCharacterName: effect.sourceCharacterName,
          })
        );
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
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            skillId: Number(skill.skillId ?? 0),
            skillName: String(skill.name ?? ''),
            ...added,
          })
        );
      }
    }
  }
  return events;
}

// T02: SpecialStatusCountByType 状態保持チェックヘルパー
const IMPLEMENTED_SPECIAL_STATUS_TYPES = new Set([
  25,
  78,
  79,
  122,
  124,
  125,
  SPECIAL_STATUS_TYPE_DIVA,
  146,
  155,
  164,
  SPECIAL_STATUS_TYPE_BABIED,
  SPECIAL_STATUS_TYPE_CURRY,
  SPECIAL_STATUS_TYPE_SHCHI,
  SPECIAL_STATUS_TYPE_MOCKTAIL,
  SPECIAL_STATUS_TYPE_STEAK,
  SPECIAL_STATUS_TYPE_GELATO,
]);

function hasSpecialStatus(member, typeId) {
  if (!Array.isArray(member?.statusEffects)) return false;
  const id = Number(typeId);
  return member.statusEffects.some((e) => {
    if (Number(e.metadata?.specialStatusTypeId) !== id) return false;
    // Eternal 状態は remaining=0 でも有効
    if (String(e.exitCond ?? '') === 'Eternal') return true;
    return Number(e.remaining ?? 0) > 0;
  });
}

function applyShreddingEffectsFromActions(state, previewRecord) {
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
      if (skillType !== 'Shredding') {
        continue;
      }
      const turns = Number(part?.effect?.exitVal?.[0] ?? 1);
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
        target.applyShredding(turns);
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            skillId: Number(skill.skillId ?? 0),
            skillName: String(skill.name ?? ''),
            turns,
          })
        );
      }
    }
  }
  return events;
}

// T04: バフ系特殊状態の付与（SpecialStatusCountByType 対応）
const BUFF_SKILL_TYPE_TO_STATUS_ID = Object.freeze({
  BuffCharge: 25,
  MindEye: 78,
  Dodge: 122,
  ShadowClone: 125,
  Diva: SPECIAL_STATUS_TYPE_DIVA,
  NegativeMind: 146,
  Makeup: 164,
  Babied: SPECIAL_STATUS_TYPE_BABIED,
  Curry: SPECIAL_STATUS_TYPE_CURRY,
  Shchi: SPECIAL_STATUS_TYPE_SHCHI,
  Mocktail: SPECIAL_STATUS_TYPE_MOCKTAIL,
  Steak: SPECIAL_STATUS_TYPE_STEAK,
  Gelato: SPECIAL_STATUS_TYPE_GELATO,
  EternalOath: 124,
  BIYamawakiServant: 155,
});
const DEFAULT_BUFF_CHARGE_EXIT_COND = 'Count';
const DEFAULT_BUFF_CHARGE_REMAINING = 1;

function applyBuffStatusEffectsFromActions(state, previewRecord) {
  const events = [];
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      const skillType = String(part?.skill_type ?? '').trim();
      const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID[skillType];
      if (statusTypeId == null) {
        continue;
      }
      const exitCond = String(part?.effect?.exitCond ?? 'Count');
      const remaining = Number(part?.effect?.exitVal?.[0] ?? 1);
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
        const partPower = resolvePreferredNonDamageRangeValue(part?.power);
        let context = {
          skill,
          actor,
          ...(Number.isFinite(partPower) ? { power: partPower } : {}),
          metadata: {
            sourceSkillType: skillType,
            targetType: String(part?.target_type ?? ''),
          },
        };
        if (FOOD_BUFF_SKILL_TYPES.has(skillType)) {
          context = {
            skill,
            actor,
            power: resolveFoodBuffPartPower(part),
            metadata: {
              foodBuff: true,
              sourceSkillType: skillType,
              attackUpRate: resolveFoodBuffPartPower(part),
              healDpByDamageRate: resolveFoodBuffPartHealDpByDamageRate(part),
              targetType: String(part?.target_type ?? ''),
            },
          };
        } else if (skillType === BABIED_STATUS_TYPE) {
          context = {
            skill,
            actor,
            power: resolveBabiedPartSkillAttackUpRate(part),
            metadata: {
              babied: true,
              sourceSkillType: skillType,
              skillAttackUpRate: resolveBabiedPartSkillAttackUpRate(part),
              odGaugeGainUpRate: resolveBabiedPartOdGaugeGainUpRate(part),
              targetType: String(part?.target_type ?? ''),
            },
          };
        } else if (skillType === DIVA_STATUS_TYPE) {
          context = {
            skill,
            actor,
            power: resolveDivaPartSkillAttackUpRate(part),
            metadata: {
              diva: true,
              sourceSkillType: skillType,
              skillAttackUpRate: resolveDivaPartSkillAttackUpRate(part),
              targetType: String(part?.target_type ?? ''),
            },
          };
        }
        target.applySpecialStatus(statusTypeId, remaining, exitCond, context);
        const activeEffects =
          typeof target?.getStatusEffectsByType === 'function'
            ? target.getStatusEffectsByType(skillType, { activeOnly: true })
            : [];
        const latest = activeEffects.at(-1);
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            targetCharacterId: target.characterId,
            statusType: skillType,
            statusTypeId,
            effectId: Number(latest?.effectId ?? 0),
            power: Number(latest?.power ?? context?.power ?? 0),
            healDpByDamageRate: Number(latest?.metadata?.healDpByDamageRate ?? 0),
            odGaugeGainUpRate: Number(latest?.metadata?.odGaugeGainUpRate ?? 0),
            remaining,
            exitCond,
            skillId: Number(skill.skillId ?? skill.id ?? 0),
            skillName: String(skill.name ?? ''),
          })
        );
      }
    }
  }
  return events;
}

function getEnemyStatusRemainingTurnsFromPart(skillType, part) {
  const exitCond = String(part?.effect?.exitCond ?? '').trim();
  if (exitCond === 'Eternal') {
    return 0;
  }
  const exitTurns = Array.isArray(part?.effect?.exitVal) ? Number(part.effect.exitVal[0] ?? 0) : 0;
  if (Number.isFinite(exitTurns) && exitTurns > 0) {
    return exitTurns;
  }
  if (ENEMY_STATUS_POWER_DURATION_SKILL_TYPES.has(String(skillType ?? ''))) {
    const turns = Number(part?.power?.[0] ?? 0);
    if (Number.isFinite(turns) && turns > 0) {
      return turns;
    }
  }
  return 1;
}

function applyEnemyStatusEffectsFromActions(state, previewRecord) {
  const events = [];
  const enemyCountForApplication = clampEnemyCount(
    previewRecord?.enemyCount ?? getEnemyState(state?.turnState).enemyCount
  );
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    for (const part of collectEnemyStatusActionParts(skill, state, actor)) {
      const skillType = String(part?.skill_type ?? '').trim();
      const targetType = String(part?.target_type ?? '').trim();
      if (!ENEMY_STATUS_SKILL_TYPES.has(skillType) || !isEnemyStatusTargetType(targetType)) {
        continue;
      }
      const targetingSkill = {
        ...skill,
        targetType,
      };
      const baseConditionSkill = createConditionSkillContext(targetingSkill, part);
      const conditionTexts = [part?.cond, part?.hit_condition, part?.target_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, targetingSkill);
      for (const targetIndex of targetEnemyIndexes) {
        const conditionSkill = {
          ...baseConditionSkill,
          targetEnemyIndex: Number(targetIndex),
        };
        const targetActionEntry = {
          ...actionEntry,
          targetEnemyIndex: Number(targetIndex),
        };
        const condSatisfied = conditionTexts.every((expr) =>
          evaluateConditionExpression(expr, state, actor, conditionSkill, targetActionEntry).result
        );
        if (!condSatisfied) {
          continue;
        }
        const appliedStatus = normalizeEnemyStatus(
          {
            statusType: skillType,
            targetIndex,
            remainingTurns: getEnemyStatusRemainingTurnsFromPart(skillType, part),
            power: scaleHighBoostEnemyDebuffPower(actor, skillType, getEnemyStatusPowerValue(part)),
            elements: normalizeEnemyStatusElements(part?.elements),
            limitType: String(part?.effect?.limitType ?? ''),
            exitCond: String(part?.effect?.exitCond ?? ''),
            sourceSkillId: Number(skill.skillId ?? 0),
            sourceSkillName: String(skill.name ?? ''),
            sourceSkillLabel: String(skill.label ?? ''),
            sourceSkillDesc: String(skill?.desc ?? ''),
            sourceCharacterName: String(actor?.characterName ?? ''),
            metadata: {
              targetType: String(part?.target_type ?? ''),
            },
          },
          enemyCountForApplication
        );
        if (!appliedStatus) {
          continue;
        }
        upsertEnemyStatus(state.turnState, appliedStatus, enemyCountForApplication);
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            skillId: Number(skill.skillId ?? skill.id ?? 0),
            skillName: String(skill.name ?? ''),
            mode: 'EnemyStatus',
            ...appliedStatus,
          })
        );
      }
    }
  }
  return events;
}

function resolveSpecialBreakHitTiming(part) {
  const hitTypes = new Set(
    (Array.isArray(part?.hits) ? part.hits : [])
      .map((hit) => String(hit?.type ?? '').trim())
      .filter(Boolean)
  );
  const hasBefore = hitTypes.has(SPECIAL_BREAK_HIT_TIMING_BEFORE);
  const hasAfter = hitTypes.has(SPECIAL_BREAK_HIT_TIMING_AFTER);
  if (hasBefore && !hasAfter) {
    return SPECIAL_BREAK_HIT_TIMING_BEFORE;
  }
  if (hasAfter && !hasBefore) {
    return SPECIAL_BREAK_HIT_TIMING_AFTER;
  }
  return '';
}

function resolveSuperBreakReferenceTurnState(currentTurnState, preActionTurnState, part) {
  const hitTiming = resolveSpecialBreakHitTiming(part);
  if (hitTiming === SPECIAL_BREAK_HIT_TIMING_BEFORE && preActionTurnState) {
    return preActionTurnState;
  }
  return currentTurnState;
}

function isSameActionBreakTarget(breakEnemyIndexes, targetIndex) {
  return breakEnemyIndexes.includes(Number(targetIndex));
}

function normalizeAutoBreakEnemyIndexes(actionEntry, enemyCount = DEFAULT_ENEMY_COUNT) {
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  return [...new Set(
    (Array.isArray(actionEntry?.autoBreakEnemyIndexes) ? actionEntry.autoBreakEnemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < normalizedEnemyCount)
  )].sort((left, right) => left - right);
}

function applyEnemyEShieldEffectsFromActions(state, previewRecord) {
  const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = resolveEffectiveSkillParts(skill, state, actor);
    const eShieldRecoveryParts = (effectiveParts ?? []).filter((part) =>
      DIRECT_ENEMY_E_SHIELD_CHANGE_SKILL_TYPES.has(String(part?.skill_type ?? '').trim())
    );
    if (!hasDamagePartInParts(effectiveParts) && eShieldRecoveryParts.length === 0) {
      actionEntry.autoBreakEnemyIndexes = [];
      continue;
    }
    const nextAutoBreakEnemyIndexes = [];

    if (hasDamagePartInParts(effectiveParts)) {
      const skillHitCount = resolveActionEShieldHitCount(actionEntry, skill);
      if (skillHitCount > 0) {
        const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, skill);
        const ignoreEShieldElement =
          Boolean(actionEntry?.specialPassiveModifiers?.ignoreEShieldElement) ||
          skillHasIgnoreEShieldElementPart(skill, state, actor);
        const actionElementReferences = normalizeActionElementReferences(skill, actor, state);
        // ゲーム仕様上 enemy `base_param.dp > 0` と `extra_gauge.eshield` は併存しないが、
        // 異常データ混入時も E-shield が active なら本ブロックが先に処理されるため、
        // E-shield を優先し DP 側の減算ルートへは落とさない（docs/active/e_shield_preparation_plan.md 参照）。
        for (const targetIndex of targetEnemyIndexes) {
          const eShieldState = getEnemyEShieldStateByTarget(state.turnState, targetIndex);
          if (!isEnemyEShieldActive(eShieldState)) {
            continue;
          }
          if (!ignoreEShieldElement && !actionMatchesEnemyEShield(actionElementReferences, eShieldState)) {
            continue;
          }
          const nextState = {
            ...eShieldState,
            current: Math.max(0, Number(eShieldState.current ?? 0) - skillHitCount),
          };
          setEnemyEShieldStateByTarget(state.turnState, targetIndex, nextState);
          if (Number(eShieldState.current ?? 0) > 0 && nextState.current === 0) {
            nextAutoBreakEnemyIndexes.push(targetIndex);
            applyManualEnemyBreak(state.turnState, targetIndex);
          }
        }
      }
    }

    for (const part of eShieldRecoveryParts) {
      const skillType = String(part?.skill_type ?? '').trim();
      const amount = resolveEnemyEShieldDirectChangeAmount(skillType, part);
      if (amount <= 0) {
        continue;
      }
      const targetType = String(part?.target_type ?? '').trim();
      if (!isEnemyStatusTargetType(targetType)) {
        continue;
      }
      const targetingSkill = {
        ...skill,
        targetType,
      };
      const baseConditionSkill = createConditionSkillContext(targetingSkill, part);
      const conditionTexts = [part?.cond, part?.hit_condition, part?.target_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const targetEnemyIndexes = getActionTargetEnemyIndexes(state, actionEntry, targetingSkill);
      for (const targetIndex of targetEnemyIndexes) {
        const eShieldState = getEnemyEShieldStateByTarget(state.turnState, targetIndex);
        if (!eShieldState) {
          continue;
        }
        const conditionSkill = {
          ...baseConditionSkill,
          targetEnemyIndex: Number(targetIndex),
        };
        const targetActionEntry = {
          ...actionEntry,
          targetEnemyIndex: Number(targetIndex),
        };
        const condSatisfied = conditionTexts.every((expr) =>
          evaluateConditionExpression(expr, state, actor, conditionSkill, targetActionEntry).result
        );
        if (!condSatisfied) {
          continue;
        }
        setEnemyEShieldStateByTarget(state.turnState, targetIndex, {
          ...eShieldState,
          current: resolveNextEnemyEShieldCurrentForDirectChange(eShieldState, skillType, amount),
        });
      }
    }
    actionEntry.autoBreakEnemyIndexes = [...new Set(nextAutoBreakEnemyIndexes)].sort((left, right) => left - right);
    if (nextAutoBreakEnemyIndexes.length > 0) {
      const manualBreakEnemyIndexes = normalizeManualBreakEnemyIndexes(actionEntry, enemyCount);
      const breakCount = new Set([...manualBreakEnemyIndexes, ...nextAutoBreakEnemyIndexes]).size;
      actionEntry.breakHitCount = Math.max(Math.max(0, Number(actionEntry?.breakHitCount ?? 0)), breakCount);
    }
  }
}

function buildAutoBreakEventsFromActions(previewRecord, existingEnemyBreakEvents = []) {
  const events = [];
  const enemyCount = clampEnemyCount(previewRecord?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const autoBreakEnemyIndexes = normalizeAutoBreakEnemyIndexes(actionEntry, enemyCount);
    if (autoBreakEnemyIndexes.length === 0) {
      continue;
    }
    const handledTargets = new Set(
      existingEnemyBreakEvents
        .filter(
          (event) =>
            String(event?.actorCharacterId ?? '') === String(actionEntry.characterId ?? '') &&
            Number(event?.skillId ?? 0) === Number(actionEntry.skillId ?? 0)
        )
        .map((event) => Number(event?.targetIndex))
        .filter((targetIndex) => Number.isInteger(targetIndex) && targetIndex >= 0)
    );
    for (const targetIndex of autoBreakEnemyIndexes) {
      if (handledTargets.has(targetIndex)) {
        continue;
      }
      events.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: String(actionEntry.characterId ?? ''),
          skillId: Number(actionEntry.skillId ?? 0),
          skillName: String(actionEntry.skillName ?? ''),
          mode: 'DownTurn',
          targetIndex,
          statusType: ENEMY_STATUS_DOWN_TURN,
          remainingTurns: DEFAULT_AUTO_DOWN_TURN_REMAINING,
          source: 'auto',
        })
      );
    }
  }
  return events;
}

function applyEnemyBreakEffectsFromActions(state, previewRecord, options = {}) {
  const events = [];
  const preActionTurnState = options?.preActionTurnState ?? null;
  const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const manualBreakEnemyIndexes = normalizeManualBreakEnemyIndexes(actionEntry, enemyCount);
    const autoBreakEnemyIndexes = normalizeAutoBreakEnemyIndexes(actionEntry, enemyCount);
    const sameActionBreakEnemyIndexes = [...new Set([...manualBreakEnemyIndexes, ...autoBreakEnemyIndexes])];
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }
    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
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
          const hitTiming = resolveSpecialBreakHitTiming(part);
          const referenceTurnState = resolveSuperBreakReferenceTurnState(
            state.turnState,
            preActionTurnState,
            part
          );
          const allowsSameActionBreak =
            hitTiming !== SPECIAL_BREAK_HIT_TIMING_BEFORE &&
            isSameActionBreakTarget(sameActionBreakEnemyIndexes, targetIndex);
          if (!hasEnemyStatus(referenceTurnState, targetIndex, ENEMY_STATUS_BREAK) && !allowsSameActionBreak) {
            continue;
          }
          if (allowsSameActionBreak && !hasEnemyStatus(state.turnState, targetIndex, ENEMY_STATUS_BREAK)) {
            applyManualEnemyBreak(state.turnState, targetIndex);
          }
          const applied = applyEnemyStrongBreakState(state.turnState, targetIndex, {
            elements: part?.elements,
          });
          if (applied) {
            events.push(
              buildActionScopedEvent(actionEntry, {
                actorCharacterId: actor.characterId,
                skillId: Number(skill.skillId ?? 0),
                skillName: String(skill.name ?? ''),
                mode: ENEMY_STATUS_SUPER_BREAK,
                ...applied,
              })
            );
          }
          continue;
        }

        const allowsSameActionBreak = isSameActionBreakTarget(
          sameActionBreakEnemyIndexes,
          targetIndex
        );
        if (allowsSameActionBreak && !hasEnemyStatus(state.turnState, targetIndex, ENEMY_STATUS_BREAK)) {
          applyManualEnemyBreak(state.turnState, targetIndex);
          if (
            getEnemyStatusRemainingTurns(state.turnState, targetIndex, ENEMY_STATUS_DOWN_TURN) <
            SAME_ACTION_SUPER_BREAK_DOWN_INITIAL_REMAINING
          ) {
            upsertEnemyStatus(state.turnState, {
              statusType: ENEMY_STATUS_DOWN_TURN,
              targetIndex,
              remainingTurns: SAME_ACTION_SUPER_BREAK_DOWN_INITIAL_REMAINING,
            });
          }
        }

        const isAlreadyBroken = hasEnemyStatus(state.turnState, targetIndex, ENEMY_STATUS_BREAK);
        const hasDownTurn = hasEnemyStatus(state.turnState, targetIndex, ENEMY_STATUS_DOWN_TURN);
        if (isAlreadyBroken && !hasDownTurn) {
          continue;
        }

        if (hasDownTurn) {
          const applied = applyEnemySuperDownState(state.turnState, targetIndex, {
            elements: part?.elements,
          });
          if (applied) {
            events.push(
              buildActionScopedEvent(actionEntry, {
                actorCharacterId: actor.characterId,
                skillId: Number(skill.skillId ?? 0),
                skillName: String(skill.name ?? ''),
                mode: ENEMY_STATUS_SUPER_BREAK_DOWN,
                ...applied,
              })
            );
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
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            skillId: Number(skill.skillId ?? 0),
            skillName: String(skill.name ?? ''),
            mode: 'DownTurn',
            targetIndex,
            statusType: ENEMY_STATUS_DOWN_TURN,
            remainingTurns: DEFAULT_AUTO_DOWN_TURN_REMAINING,
          })
        );
      }
    }
  }
  return events;
}

function normalizeManualBreakEnemyIndexes(actionEntry, enemyCount = DEFAULT_ENEMY_COUNT) {
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  return [...new Set(
    (Array.isArray(actionEntry?.manualBreakEnemyIndexes) ? actionEntry.manualBreakEnemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < normalizedEnemyCount)
  )].sort((left, right) => left - right);
}

function normalizeManualKillEnemyIndexes(actionEntry, enemyCount = DEFAULT_ENEMY_COUNT) {
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  return [...new Set(
    (Array.isArray(actionEntry?.manualKillEnemyIndexes) ? actionEntry.manualKillEnemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < normalizedEnemyCount)
  )].sort((left, right) => left - right);
}

function normalizeManualHpBreakEnemyIndexes(actionEntry, enemyCount = DEFAULT_ENEMY_COUNT) {
  const normalizedEnemyCount = clampEnemyCount(enemyCount);
  return [...new Set(
    (Array.isArray(actionEntry?.manualHpBreakEnemyIndexes) ? actionEntry.manualHpBreakEnemyIndexes : [])
      .map((enemyIndex) => Number(enemyIndex))
      .filter((enemyIndex) => Number.isInteger(enemyIndex) && enemyIndex >= 0 && enemyIndex < normalizedEnemyCount)
  )].sort((left, right) => left - right);
}

export function applyManualEnemyBreak(turnState, targetIndex) {
  if (!turnState || !isEnemyAlive(turnState, targetIndex)) {
    return null;
  }
  if (hasEnemyStatus(turnState, targetIndex, ENEMY_STATUS_BREAK)) {
    return null;
  }
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_BREAK,
    targetIndex,
    remainingTurns: 0,
  });
  const existingDownTurn =
    getActiveEnemyStatuses(turnState, ENEMY_STATUS_DOWN_TURN).find(
      (status) => Number(status?.targetIndex) === Number(targetIndex)
    ) ?? null;
  if (!existingDownTurn) {
    upsertEnemyStatus(turnState, {
      statusType: ENEMY_STATUS_DOWN_TURN,
      targetIndex,
      remainingTurns: DEFAULT_AUTO_DOWN_TURN_REMAINING,
    });
  }
  return {
    targetIndex: Number(targetIndex),
    statusType: ENEMY_STATUS_BREAK,
    downTurnRemainingTurns: Number(existingDownTurn?.remainingTurns ?? DEFAULT_AUTO_DOWN_TURN_REMAINING),
  };
}

export function applyManualEnemyKill(turnState, targetIndex) {
  if (!turnState || !isEnemyAlive(turnState, targetIndex)) {
    return null;
  }
  upsertEnemyStatus(turnState, {
    statusType: ENEMY_STATUS_DEAD,
    targetIndex,
    remainingTurns: 0,
  });
  return {
    targetIndex: Number(targetIndex),
    statusType: ENEMY_STATUS_DEAD,
  };
}

export function applyManualEnemyHpBreak(turnState, targetIndex) {
  if (!turnState || !isEnemyAlive(turnState, targetIndex)) {
    return null;
  }
  const currentExtraHpGaugeState = getEnemyExtraHpGaugeStateByTarget(turnState, targetIndex);
  if (!canEnemyHpBreak(currentExtraHpGaugeState)) {
    return null;
  }
  const nextExtraHpGaugeState = decrementEnemyExtraHpGaugeState(currentExtraHpGaugeState);
  setEnemyExtraHpGaugeStateByTarget(turnState, targetIndex, nextExtraHpGaugeState);
  resetEnemyHpBreakPhaseState(turnState, targetIndex);
  const restoredEShieldState = restoreEnemyEShieldAfterHpBreak(turnState, targetIndex);
  return {
    targetIndex: Number(targetIndex),
    statusType: 'HpBreak',
    remainingExtraHpGaugeCount: Number(nextExtraHpGaugeState?.remaining ?? 0),
    eShieldState: restoredEShieldState ? cloneEnemyEShieldState(restoredEShieldState) : null,
  };
}

function applyManualBreakEffectsFromActions(state, previewRecord) {
  const events = [];
  const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const manualBreakEnemyIndexes = normalizeManualBreakEnemyIndexes(actionEntry, enemyCount);
    if (manualBreakEnemyIndexes.length === 0) {
      continue;
    }
    for (const targetIndex of manualBreakEnemyIndexes) {
      const applied = applyManualEnemyBreak(state.turnState, targetIndex);
      if (!applied) {
        continue;
      }
      events.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: String(actionEntry.characterId ?? ''),
          skillId: Number(actionEntry.skillId ?? 0),
          skillName: String(actionEntry.skillName ?? ''),
          mode: 'DownTurn',
          targetIndex,
          statusType: ENEMY_STATUS_DOWN_TURN,
          remainingTurns: Number(applied.downTurnRemainingTurns ?? DEFAULT_AUTO_DOWN_TURN_REMAINING),
          source: 'manual',
        })
      );
    }
  }
  return events;
}

function applyManualHpBreakEffectsFromActions(state, previewRecord) {
  const events = [];
  const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const manualHpBreakEnemyIndexes = normalizeManualHpBreakEnemyIndexes(actionEntry, enemyCount);
    if (manualHpBreakEnemyIndexes.length === 0) {
      continue;
    }
    for (const targetIndex of manualHpBreakEnemyIndexes) {
      const applied = applyManualEnemyHpBreak(state.turnState, targetIndex);
      if (!applied) {
        continue;
      }
      events.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: String(actionEntry.characterId ?? ''),
          skillId: Number(actionEntry.skillId ?? 0),
          skillName: String(actionEntry.skillName ?? ''),
          mode: 'HpBreak',
          targetIndex: Number(applied.targetIndex),
          statusType: String(applied.statusType ?? 'HpBreak'),
          remainingExtraHpGaugeCount: Number(applied.remainingExtraHpGaugeCount ?? 0),
          source: 'manual',
        })
      );
    }
  }
  return events;
}

function applyManualKillEffectsFromActions(state, previewRecord) {
  const events = [];
  const enemyCount = clampEnemyCount(state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT);
  for (const actionEntry of previewRecord.actions ?? []) {
    const manualKillEnemyIndexes = normalizeManualKillEnemyIndexes(actionEntry, enemyCount);
    if (manualKillEnemyIndexes.length === 0) {
      continue;
    }
    for (const targetIndex of manualKillEnemyIndexes) {
      const applied = applyManualEnemyKill(state.turnState, targetIndex);
      if (!applied) {
        continue;
      }
      events.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: String(actionEntry.characterId ?? ''),
          skillId: Number(actionEntry.skillId ?? 0),
          skillName: String(actionEntry.skillName ?? ''),
          mode: 'Dead',
          targetIndex: Number(applied.targetIndex),
          statusType: String(applied.statusType ?? ENEMY_STATUS_DEAD),
          source: 'manual',
        })
      );
    }
  }
  return events;
}

function findMemberByCharacterId(state, characterId) {
  return state.party.find((member) => member.characterId === characterId) ?? null;
}

function resolveActionBreakTriggerCount(actionEntry) {
  const breakHitCount = Math.max(0, Number(actionEntry?.breakHitCount ?? 0));
  const manualBreakCount = normalizeManualBreakEnemyIndexes(actionEntry).length;
  const autoBreakCount = normalizeAutoBreakEnemyIndexes(actionEntry).length;
  return Math.max(breakHitCount, manualBreakCount, autoBreakCount);
}

// ブレイク時にダウンターンを延長するパッシブ（ひれ伏すでゲス！など）を処理する。
// applyEnemyBreakEffectsFromActions の後に呼ぶことで、同ターン付与のDownTurnも対象にできる。
// 戻り値の events は breakDownTurnUpEvents 用、passiveTriggerEvents は Passive Log 表示用。
function applyBreakDownTurnUpFromActions(state, previewRecord) {
  const events = [];
  const passiveTriggerEvents = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const breakHitCount = resolveActionBreakTriggerCount(actionEntry);
    if (breakHitCount === 0) {
      continue;
    }
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }
    const skill = actor.getSkill(actionEntry.skillId) ?? null;

    for (const passive of getPassiveEntriesForMember(actor)) {
      const timing = String(passive?.timing ?? '').trim();
      if (
        timing !== 'OnFirstBattleStart' &&
        timing !== 'OnBattleStart' &&
        timing !== 'OnPlayerTurnStart'
      ) {
        continue;
      }

      const parts = Array.isArray(passive?.parts) ? passive.parts : [];

      // Check AdditionalHitOnBreaking trigger
      const hasTrigger = parts.some((part) => {
        if (String(part?.skill_type ?? '') !== 'AdditionalHitOnBreaking') {
          return false;
        }
        const conditions = [passive?.condition, part?.cond, part?.hit_condition]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean);
        const conditionSkill = createConditionSkillContext(skill ?? { parts: [] }, part);
        return conditions.every((expr) =>
          evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry).result
        );
      });

      if (!hasTrigger) {
        continue;
      }

      let passiveFiredForActor = false;
      const firedEffectTypes = [];
      for (const part of parts) {
        if (String(part?.skill_type ?? '') !== 'BreakDownTurnUp') {
          continue;
        }
        const extension = Math.max(0, Number(part?.power?.[0] ?? 0));
        if (extension === 0) {
          continue;
        }
        // Extend all currently active DownTurn statuses
        const activeDownTurns = getActiveEnemyStatuses(state.turnState, ENEMY_STATUS_DOWN_TURN);
        for (const status of activeDownTurns) {
          const targetIndex = Number(status?.targetIndex ?? -1);
          if (targetIndex < 0) {
            continue;
          }
          const currentRemaining = Number(status?.remainingTurns ?? 0);
          const newRemaining = currentRemaining + extension;
          upsertEnemyStatus(state.turnState, {
            statusType: ENEMY_STATUS_DOWN_TURN,
            targetIndex,
            remainingTurns: newRemaining,
          });
          events.push(
            buildActionScopedEvent(actionEntry, {
              actorCharacterId: actor.characterId,
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              mode: 'BreakDownTurnUp',
              targetIndex,
              statusType: ENEMY_STATUS_DOWN_TURN,
              extension,
              remainingTurns: newRemaining,
            })
          );
          passiveFiredForActor = true;
          if (!firedEffectTypes.includes('BreakDownTurnUp')) {
            firedEffectTypes.push('BreakDownTurnUp');
          }
        }
      }

      if (passiveFiredForActor) {
        passiveTriggerEvents.push(
          buildActionScopedEvent(
            actionEntry,
            createPassiveTriggerEvent(state.turnState, actor, passive, {
              source: 'passive_trigger',
              effectTypes: firedEffectTypes,
              triggerSkillId: Number(skill?.skillId ?? 0),
              triggerSkillName: String(skill?.name ?? ''),
            })
          )
        );
      }
    }
  }

  return { events, passiveTriggerEvents };
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

function applyTurnBasedStatusExpiry(state, turnState) {
  const processed = new Set();
  const events = [];
  const actionContext = buildActionContext('TurnEnd', null, { turnPhase: 'PlayerTurnEnd' });
  for (const member of resolvePlayerTurnEndStatusExpiryMembers(state, turnState)) {
    const characterId = String(member?.characterId ?? '');
    if (!characterId || processed.has(characterId)) {
      continue;
    }
    processed.add(characterId);
    const ticked = member.tickStatusEffectsWhere(
      (effect) =>
        !PLAYER_TURN_END_STATUS_EXPIRY_EXCLUDED_STATUS_TYPES.has(String(effect?.statusType ?? '')) &&
        shouldConsume(effect, actionContext).shouldConsume
    );
    for (const item of ticked) {
      events.push({ characterId, ...item });
    }
  }
  return events;
}

function resolvePlayerTurnEndStatusExpiryMembers(state, turnState = state?.turnState) {
  const turnType = String(turnState?.turnType ?? '');
  if (turnType === 'od') {
    return state.party ?? [];
  }
  if (turnType === 'extra') {
    const allowedSet = getExtraAllowedSet(turnState);
    if (!allowedSet) {
      return [];
    }
    return (state.party ?? []).filter((member) => allowedSet.has(member.characterId));
  }
  return state.party ?? [];
}

function removeByakkoRushStateWhenDpBelowCondition(state) {
  for (const member of state?.party ?? []) {
    if (getDpRate(member?.dpState) >= DP_RATE_REFERENCE_MAX) {
      continue;
    }
    member.removeStatusEffectsWhere?.(
      (effect) => String(effect?.statusType ?? '') === BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE
    );
  }
}

function tickShreddingTurns(state, previewRecord, skipCharacterIds = new Set()) {
  const processed = new Set();
  for (const actionEntry of previewRecord.actions ?? []) {
    const characterId = String(actionEntry?.characterId ?? '');
    if (!characterId || processed.has(characterId)) {
      continue;
    }
    processed.add(characterId);
    // 今ターンで速弾きが付与されたメンバーは同ターン内でカウントダウンしない
    if (skipCharacterIds.has(characterId)) {
      continue;
    }
    const member = findMemberByCharacterId(state, characterId);
    if (!member || !member.isShredding) {
      continue;
    }
    member.shreddingTurnsRemaining -= 1;
    if (member.shreddingTurnsRemaining <= 0) {
      member.shreddingTurnsRemaining = 0;
      if (member.sp.min <= SHREDDING_SP_MIN) {
        member.sp.min = 0;
      }
    }
    member._revision += 1;
  }
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
  const allowUseCountOverflow = Boolean(options.allowUseCountOverflow);
  const allowSkillConditionMismatch = Boolean(options.allowSkillConditionMismatch);
  const onWarning = typeof options.onWarning === 'function' ? options.onWarning : null;

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
      // iuc_cond is a discount/consumption condition, not a skill usability guard.
      const skillConditions = [
        { label: 'cond', expression: effectiveSkill?.cond ?? skill.cond },
      ];
      for (const condition of skillConditions) {
        const expr = String(condition.expression ?? '').trim();
        if (!expr) {
          continue;
        }
        const evaluated = evaluateConditionExpression(expr, state, member, effectiveSkill, action);
        if (evaluated.knownCount > 0 && !evaluated.result) {
          const warningMessage =
            `Skill ${skill.skillId} cannot be used because ${condition.label} is not satisfied.`;
          const isUseCountCondition = expr.includes('PlayedSkillCount(');
          if (isUseCountCondition && allowUseCountOverflow) {
            onWarning?.(`use count overflow allowed: ${warningMessage}`);
            continue;
          }
          if (allowSkillConditionMismatch) {
            onWarning?.(`skill condition mismatch allowed: ${warningMessage}`);
            continue;
          }
          throw new Error(warningMessage);
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

  // 非ダメージ先 / ダメージ後 の phase 優先を保った上で前衛 position 順に並べる。
  entries.sort(compareTurnActionExecutionOrder);

  return entries;
}

function isRemovablePlayerDebuffStatusEffect(effect) {
  if (!effect || typeof effect !== 'object') {
    return false;
  }
  if (String(effect.exitCond ?? '') !== 'Eternal' && Number(effect.remaining ?? 0) <= 0) {
    return false;
  }
  if (effect.metadata?.isDebuff === true) {
    return true;
  }
  if (Number(effect.metadata?.specialStatusTypeId) === SPECIAL_STATUS_TYPE_NEGATIVE_STATE) {
    return true;
  }
  return REMOVABLE_PLAYER_DEBUFF_STATUS_TYPES.has(String(effect.statusType ?? '').trim());
}

function countRemovablePlayerDebuffStatuses(member) {
  if (!Array.isArray(member?.statusEffects)) {
    return 0;
  }
  return member.statusEffects.filter((effect) => isRemovablePlayerDebuffStatusEffect(effect)).length;
}

function resolveRemoveDebuffCountForAction(state, actor, skill, actionEntry) {
  if (!actor || !skill) {
    return 0;
  }

  let total = 0;
  const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
  for (const part of effectiveParts ?? []) {
    if (String(part?.skill_type ?? '').trim() !== 'RemoveDebuff') {
      continue;
    }
    const amount = Math.max(0, Number(part?.power?.[0] ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
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
    for (const targetCharacterId of targetCharacterIds) {
      const target = findMemberByCharacterId(state, targetCharacterId);
      if (!target) {
        continue;
      }
      if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
        continue;
      }
      total += Math.min(amount, countRemovablePlayerDebuffStatuses(target));
    }
  }
  return total;
}

function resolveRemainingSkillUsesForMember(member, skill) {
  const usage = skill?.usage && typeof skill.usage === 'object' ? skill.usage : null;
  if (!usage || usage.mode === 'unlimited' || usage.maxUses == null) {
    return Number.POSITIVE_INFINITY;
  }
  const maxUses = Number(usage.maxUses);
  if (!Number.isFinite(maxUses) || maxUses < 0) {
    return Number.POSITIVE_INFINITY;
  }
  const used = Number(member?.getSkillUseCountByLabel?.(skill?.label) ?? 0);
  return Math.max(0, maxUses - used);
}

function isRepeatableAttackSkillForByakkoDoubleAction(skill) {
  if (!skill || isNormalAttackSkill(skill) || isPursuitOnlySkill(skill)) {
    return false;
  }
  return hasDamagePartInParts(resolveEffectiveSkillParts(skill));
}

function resolveDoubleActionRepeatStatusType(member, skill, actionMetadata = {}) {
  if (!member || !skill || actionMetadata?.isDerivedRepeat) {
    return '';
  }
  if (Boolean(skill?.isRestricted)) {
    const extraSkillEffects =
      typeof member.resolveEffectiveDoubleActionExtraSkillEffects === 'function'
        ? member.resolveEffectiveDoubleActionExtraSkillEffects()
        : [];
    if (Array.isArray(extraSkillEffects) && extraSkillEffects.length > 0) {
      return DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE;
    }
  }
  if (isRepeatableAttackSkillForByakkoDoubleAction(skill)) {
    const attackSkillEffects =
      typeof member.resolveEffectiveByakkoDoubleActionAttackSkillEffects === 'function'
        ? member.resolveEffectiveByakkoDoubleActionAttackSkillEffects()
        : [];
    if (Array.isArray(attackSkillEffects) && attackSkillEffects.length > 0) {
      return BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE;
    }
  }
  return '';
}

function shouldRepeatWithDoubleActionExtraSkill(member, skill, actionMetadata = {}) {
  const statusType = resolveDoubleActionRepeatStatusType(member, skill, actionMetadata);
  if (!statusType) {
    return false;
  }
  return resolveRemainingSkillUsesForMember(member, skill) >= DOUBLE_ACTION_EXTRA_SKILL_REQUIRED_USES;
}

function consumeDoubleActionRepeatStatus(member, statusType, consumeCount = 1) {
  const normalizedStatusType = String(statusType ?? '').trim();
  if (normalizedStatusType === BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE) {
    return [];
  }
  if (normalizedStatusType === DOUBLE_ACTION_EXTRA_SKILL_STATUS_TYPE) {
    return typeof member?.consumeDoubleActionExtraSkillEffects === 'function'
      ? member.consumeDoubleActionExtraSkillEffects(consumeCount)
      : [];
  }
  return [];
}

function resolvePursuitSkillCandidatesForMember(member) {
  return [
    ...(member?.getActionSkills?.() ?? []),
    ...(Array.isArray(member?.triggeredSkills) ? member.triggeredSkills : []),
    ...(member?.getSupportSkills?.() ?? []),
  ];
}

function getPursuitTransformUsedCharacterIds(turnState) {
  return (Array.isArray(turnState?.[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY])
    ? turnState[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY]
    : []
  ).map((id) => String(id ?? '')).filter(Boolean);
}

function markPursuitTransformUsed(turnState, characterId) {
  const id = String(characterId ?? '');
  if (!id || !turnState) {
    return;
  }
  const used = new Set(getPursuitTransformUsedCharacterIds(turnState));
  used.add(id);
  turnState[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY] = [...used];
}

function resolvePursuitSourceForMember(member, state = null) {
  const candidates = resolvePursuitSkillCandidatesForMember(member);
  const transformed = candidates.find((skill) => String(skill?.name ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME);
  const turnState = state?.turnState ?? state ?? null;
  const transformUsed = new Set(getPursuitTransformUsedCharacterIds(turnState));
  const transformedEffective =
    transformed && state?.turnState
      ? resolveEffectiveSkillForAction(state, member, transformed) ?? transformed
      : transformed;
  const rawTransformedSpCost = Number(
    transformedEffective?.spCost ??
      transformedEffective?.sp_cost ??
      transformed?.spCost ??
      transformed?.sp_cost ??
      PURSUIT_TRANSFORMED_SKILL_SP_COST
  );
  const transformedSpCost =
    Number.isFinite(rawTransformedSpCost) && rawTransformedSpCost > 0
      ? rawTransformedSpCost
      : PURSUIT_TRANSFORMED_SKILL_SP_COST;
  if (
    transformed &&
    !transformUsed.has(String(member?.characterId ?? '')) &&
    Number(member?.sp?.current ?? 0) >= transformedSpCost
  ) {
    const hitCount = Number(transformed?.hitCount ?? transformed?.hit_count ?? 0);
    return {
      skill: transformedEffective,
      hitCount: Number.isFinite(hitCount) && hitCount > 0 ? hitCount : 5,
      spCost: transformedSpCost,
    };
  }
  const pursuitSkill = candidates.find((skill) => isPursuitOnlySkill(skill)) ?? null;
  const hitCount = Number(pursuitSkill?.hitCount ?? pursuitSkill?.hit_count ?? 0);
  if (Number.isFinite(hitCount) && hitCount > 0) {
    return {
      skill: pursuitSkill,
      hitCount,
      spCost: 0,
    };
  }
  const characterId = String(member?.characterId ?? '');
  if (Object.hasOwn(PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID, characterId)) {
    return {
      skill: pursuitSkill,
      hitCount: Number(PURSUIT_HIT_COUNT_EXCEPTIONS_BY_CHARACTER_ID[characterId]),
      spCost: 0,
    };
  }
  const weaponType = String(member?.weaponType ?? '');
  if (Object.hasOwn(PURSUIT_HIT_COUNT_BY_WEAPON_TYPE, weaponType)) {
    return {
      skill: pursuitSkill,
      hitCount: Number(PURSUIT_HIT_COUNT_BY_WEAPON_TYPE[weaponType]),
      spCost: 0,
    };
  }
  return {
    skill: pursuitSkill,
    hitCount: Math.max(1, Number(member?.normalAttackHitCount ?? 1) || 1),
    spCost: 0,
  };
}

function refreshAutomaticPursuitActionForState(action, state) {
  if (String(action?.pursuitTriggerSource ?? '') !== 'auto') {
    return action;
  }
  const sourceCharacterId = String(action?.pursuitSourceCharacterId ?? '');
  const source = sourceCharacterId ? findMemberByCharacterId(state, sourceCharacterId) : null;
  if (!source) {
    return action;
  }
  const pursuitSource = resolvePursuitSourceForMember(source, state);
  const skill = pursuitSource.skill ?? null;
  return {
    ...(action && typeof action === 'object' ? action : {}),
    pursuedHitCount: Math.max(1, Number(pursuitSource.hitCount ?? action?.pursuedHitCount ?? 1)),
    pursuitSourceSkillId: Number(skill?.skillId ?? skill?.id ?? 0),
    pursuitSourceSkillName: String(skill?.name ?? '追撃'),
    pursuitSourceSpCost: Math.max(0, Number(pursuitSource.spCost ?? 0)),
  };
}

function buildDerivedRepeatAction(action) {
  const shouldKeepAutomaticPursuit = String(action?.pursuitTriggerSource ?? '') === 'auto';
  return {
    ...(action && typeof action === 'object' ? structuredClone(action) : {}),
    breakHitCount: 0,
    killCount: 0,
    pursuedHitCount: shouldKeepAutomaticPursuit ? Math.max(0, Number(action?.pursuedHitCount ?? 0)) : 0,
    pursuedTargetEnemyIndex:
      shouldKeepAutomaticPursuit && Number.isFinite(Number(action?.pursuedTargetEnemyIndex))
        ? Number(action.pursuedTargetEnemyIndex)
        : null,
    pursuitSourceCharacterId: shouldKeepAutomaticPursuit ? String(action?.pursuitSourceCharacterId ?? '') : '',
    pursuitSourcePosition:
      shouldKeepAutomaticPursuit && Number.isFinite(Number(action?.pursuitSourcePosition))
        ? Number(action.pursuitSourcePosition)
        : null,
    pursuitSourceSkillId:
      shouldKeepAutomaticPursuit && Number.isFinite(Number(action?.pursuitSourceSkillId))
        ? Number(action.pursuitSourceSkillId)
        : 0,
    pursuitSourceSkillName: shouldKeepAutomaticPursuit ? String(action?.pursuitSourceSkillName ?? '') : '',
    pursuitSourceSpCost: shouldKeepAutomaticPursuit ? Math.max(0, Number(action?.pursuitSourceSpCost ?? 0)) : 0,
    pursuitTriggerSource: shouldKeepAutomaticPursuit ? 'auto' : '',
    manualBreakEnemyIndexes: [],
    autoBreakEnemyIndexes: [],
    manualHpBreakEnemyIndexes: [],
    hpBreakCount: 0,
    manualKillEnemyIndexes: [],
  };
}

function buildPreviewActionEntry(state, member, position, effectiveSkill, action, actionMetadata = {}) {
  const preview = member.previewSkillUseResolved(effectiveSkill);
  const hitInfo = resolveEffectivePreviewHitCount(effectiveSkill, state, member);
  const attackUpTimings = ['OnEveryTurnIncludeSpecial'];
  if (isOverDriveActive(state?.turnState)) {
    attackUpTimings.push('OnOverdriveStart');
  }
  const specialAttackUp = resolvePassiveAttackUpForMember(state, member, attackUpTimings);
  const damageRateUpPerToken = resolvePassiveDamageRateUpPerTokenForMember(
    state,
    member,
    'OnPlayerTurnStart'
  );
  const attackUpPerToken = resolvePassiveAttackUpPerTokenForMember(
    state,
    member,
    'OnPlayerTurnStart'
  );
  const defenseUpPerToken = resolvePassiveDefenseUpPerTokenForMember(
    state,
    member,
    'OnEnemyTurnStart'
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
  const activeBuffStatusModifiers = resolveActiveBuffStatusModifiersForAction(
    state,
    member,
    effectiveSkill
  );
  const foodBuffModifiers = resolveFoodBuffModifiersForAction(state, member, effectiveSkill);
  const babiedModifiers = resolveBabiedModifiersForAction(state, member, effectiveSkill);
  const divaModifiers = resolveDivaModifiersForAction(state, member, effectiveSkill);
  const highBoostModifiers = resolveHighBoostModifiersForMember(member);
  const dpHealOutputModifiers = resolveDpHealOutputModifiersForMember(member);
  // IgnoreEShieldElement は action-time に恒常フラグとして展開する性質のため
  // timing に依存せず全 passive を検査対象にする。
  const ignoreEShieldElement = resolvePassiveIgnoreEShieldElementForMember(
    state,
    member
  );

  return {
    characterId: member.characterId,
    characterName: member.characterName,
    styleId: Number(member.styleId ?? 0),
    styleName: String(member.styleName ?? ''),
    partyIndex: member.partyIndex,
    positionIndex: position,
    actionInstanceId: String(actionMetadata.actionInstanceId ?? ''),
    castIndex: Math.max(0, Number(actionMetadata.castIndex ?? 0)),
    castCount: Math.max(1, Number(actionMetadata.castCount ?? 1)),
    doubleActionStatusType: String(actionMetadata.doubleActionStatusType ?? ''),
    isDerivedRepeat: Boolean(actionMetadata.isDerivedRepeat),
    isExtraAction: state.turnState.turnType === 'extra',
    skillId: effectiveSkill.skillId,
    skillName: effectiveSkill.name,
    skillLabel: effectiveSkill.label,
    skillTargetType: String(effectiveSkill.targetType ?? effectiveSkill.target_type ?? ''),
    skillHitCount: hitInfo.effectiveHitCount,
    skillBaseHitCount: hitInfo.baseHitCount,
    skillFunnelHitBonus: hitInfo.funnelHitBonus,
    spCost: effectiveSkill.spCost,
    sprightlyCostAdjustment: effectiveSkill?.sprightlyCostAdjustment
      ? structuredClone(effectiveSkill.sprightlyCostAdjustment)
      : null,
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
    activeStatusEffectModifiers: {
      attackUpRate: Number(activeBuffStatusModifiers.attackUpRate ?? 0),
      defenseUpRate: Number(activeBuffStatusModifiers.defenseUpRate ?? 0),
      criticalRateUpRate: Number(activeBuffStatusModifiers.criticalRateUpRate ?? 0),
      criticalDamageUpRate: Number(activeBuffStatusModifiers.criticalDamageUpRate ?? 0),
    },
    activeStatusEffects: [
      ...structuredClone(activeBuffStatusModifiers.matchedEffects ?? []),
      ...structuredClone(babiedModifiers.matchedEffects ?? []),
      ...structuredClone(divaModifiers.matchedEffects ?? []),
      ...structuredClone(foodBuffModifiers.matchedEffects ?? []),
    ],
    specialPassiveModifiers: {
      highBoostSkillAtkRate: Number(highBoostModifiers.skillAtkRate ?? 0),
      consumedCountEffectIds: [...(activeBuffStatusModifiers.consumedCountEffectIds ?? [])],
      attackUpRate:
        Number(activeBuffStatusModifiers.attackUpRate ?? 0) +
        Number(specialAttackUp.totalRate ?? 0) +
        Number(intrinsicMarkModifiers.attackUpRate ?? 0) +
        Number(attackUpPerToken.totalRate ?? 0) +
        Number(babiedModifiers.skillAttackUpRate ?? 0) +
        Number(divaModifiers.skillAttackUpRate ?? 0) +
        Number(foodBuffModifiers.attackUpRate ?? 0),
      defenseUpRate: Number(activeBuffStatusModifiers.defenseUpRate ?? 0),
      criticalRateUpRate: Number(activeBuffStatusModifiers.criticalRateUpRate ?? 0),
      criticalDamageUpRate: Number(activeBuffStatusModifiers.criticalDamageUpRate ?? 0),
      markAttackUpRate: Number(intrinsicMarkModifiers.attackUpRate ?? 0),
      attackUpPerTokenRate: Number(attackUpPerToken.totalRate ?? 0),
      damageRateUpRate: Number(damageRateUpPerToken.totalRate ?? 0),
      babiedSkillAttackUpRate: Number(babiedModifiers.skillAttackUpRate ?? 0),
      babiedOdGaugeGainUpRate: Number(babiedModifiers.odGaugeGainUpRate ?? 0),
      divaSkillAttackUpRate: Number(divaModifiers.skillAttackUpRate ?? 0),
      foodBuffAttackUpRate: Number(foodBuffModifiers.attackUpRate ?? 0),
      foodBuffHealDpByDamageRate: Number(foodBuffModifiers.healDpByDamageRate ?? 0),
      defenseUpPerTokenRate: Number(defenseUpPerToken.totalRate ?? 0),
      zonePowerRate,
      giveAttackBuffUpRate: highBoostModifiers.active
        ? truncateToTwoDecimals(Number(highBoostModifiers.attackBuffMultiplier ?? 1) - 1)
        : 0,
      giveDefenseDebuffUpRate: highBoostModifiers.active
        ? truncateToTwoDecimals(Number(highBoostModifiers.debuffMultiplier ?? 1) - 1)
        : 0,
      giveHealUpRate: dpHealOutputModifiers.active
        ? truncateToTwoDecimals(Number(dpHealOutputModifiers.dpHealMultiplier ?? 1) - 1)
        : 0,
      ignoreEShieldElement: ignoreEShieldElement.active,
      markDamageTakenDownRate: Number(intrinsicMarkModifiers.damageTakenDownRate ?? 0),
      markDestructionRateGainBonusRate: Number(intrinsicMarkModifiers.destructionRateGainBonusRate ?? 0),
      markCriticalRateUp: Number(intrinsicMarkModifiers.criticalRateUp ?? 0),
      markCriticalDamageUp: Number(intrinsicMarkModifiers.criticalDamageUp ?? 0),
    },
    tokenAttackContext,
    specialPassiveEvents: [
      ...structuredClone(effectiveSkill?.actionSelectionPassiveEvents ?? []),
      ...specialAttackUp.matchedPassives,
      ...attackUpPerToken.matchedPassives,
      ...defenseUpPerToken.matchedPassives,
      ...damageRateUpPerToken.matchedPassives,
    ],
    breakHitCount:
      Number.isFinite(Number(action?.breakHitCount))
        ? Number(action.breakHitCount)
        : normalizeManualBreakEnemyIndexes(action, state?.turnState?.enemyState?.enemyCount).length,
    hpBreakCount:
      Number.isFinite(Number(action?.hpBreakCount))
        ? Number(action.hpBreakCount)
        : normalizeManualHpBreakEnemyIndexes(action, state?.turnState?.enemyState?.enemyCount).length,
    killCount: Number(action?.killCount ?? 0),
    pursuedHitCount: Math.max(0, Number(action?.pursuedHitCount ?? 0)),
    pursuedTargetEnemyIndex:
      Number.isFinite(Number(action?.pursuedTargetEnemyIndex)) ? Number(action.pursuedTargetEnemyIndex) : null,
    pursuitSourceCharacterId: String(action?.pursuitSourceCharacterId ?? ''),
    pursuitSourcePosition:
      Number.isFinite(Number(action?.pursuitSourcePosition)) ? Number(action.pursuitSourcePosition) : null,
    pursuitSourceSkillId:
      Number.isFinite(Number(action?.pursuitSourceSkillId)) ? Number(action.pursuitSourceSkillId) : 0,
    pursuitSourceSkillName: String(action?.pursuitSourceSkillName ?? ''),
    pursuitSourceSpCost: Math.max(0, Number(action?.pursuitSourceSpCost ?? 0)),
    pursuitTriggerSource: String(action?.pursuitTriggerSource ?? ''),
    removeDebuffCount: resolveRemoveDebuffCountForAction(state, member, effectiveSkill, action),
    targetCharacterId: String(action?.targetCharacterId ?? ''),
    targetEnemyIndex:
      Number.isFinite(Number(action?.targetEnemyIndex)) ? Number(action.targetEnemyIndex) : null,
    manualBreakEnemyIndexes: normalizeManualBreakEnemyIndexes(
      action,
      state?.turnState?.enemyState?.enemyCount
    ),
    autoBreakEnemyIndexes: [],
    manualHpBreakEnemyIndexes: normalizeManualHpBreakEnemyIndexes(
      action,
      state?.turnState?.enemyState?.enemyCount
    ),
    manualKillEnemyIndexes: normalizeManualKillEnemyIndexes(
      action,
      state?.turnState?.enemyState?.enemyCount
    ),
    insufficientSpWarning: String(preview.insufficientSpWarning ?? ''),
    // skill cond に "Sp()>=0" が含まれるか記録（warning 生成時の判定に使用）
    hasSpGreaterOrEqualZeroCondition: /(^|&&)\s*Sp\(\)\s*>=\s*0(\s*|&&|$)/.test(String(effectiveSkill?.cond ?? '')),
    _baseRevision: preview.baseRevision,
    _effectiveSkillSnapshot: structuredClone(effectiveSkill),
  };
}

function createSingleActionPreviewRecord(actionEntry, options = {}) {
  return {
    enemyCount: Number(options.enemyCount ?? DEFAULT_ENEMY_COUNT),
    actions: [actionEntry],
  };
}

function computeSupportBreakOdBonusEvents(state, actor, skill, actionEntry) {
  if (!actor) {
    return [];
  }
  const breakCount = resolveActionBreakTriggerCount(actionEntry);
  if (breakCount <= 0) {
    return [];
  }

  const events = [];
  const baseHitCount = resolveSkillHitCount(skill);
  const driveBonusPercent = resolveCombinedDrivePierceOdBonusPercent(
    state,
    baseHitCount,
    actor?.drivePiercePercent ?? 0
  );
  const driveMultiplier = 1 + driveBonusPercent / 100;
  for (const passive of getConfiguredPassivesForMember(actor)) {
    if (String(passive?.sourceType ?? '') !== 'support') {
      continue;
    }
    const timing = String(passive?.timing ?? '').trim();
    if (
      timing !== 'OnFirstBattleStart' &&
      timing !== 'OnBattleStart' &&
      timing !== 'OnPlayerTurnStart'
    ) {
      continue;
    }

    const parts = Array.isArray(passive?.parts) ? passive.parts : [];
    const hasBreakTrigger = parts.some((part) => {
      if (String(part?.skill_type ?? '').trim() !== 'AdditionalHitOnBreaking') {
        return false;
      }
      const conditions = [passive?.condition, part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const conditionSkill = createConditionSkillContext(skill, part);
      return conditions.every((expr) => {
        const evaluated = evaluateConditionExpression(expr, state, actor, conditionSkill, actionEntry);
        return evaluated.unknownCount === 0 && evaluated.result;
      });
    });
    if (!hasBreakTrigger) {
      continue;
    }

    for (const part of parts) {
      if (String(part?.skill_type ?? '').trim() !== 'OverDrivePointUp') {
        continue;
      }
      if (!evaluatePassiveSelfConditions(passive, part, state, actor)) {
        continue;
      }
      const targetCharacterIds = resolveSupportTargetCharacterIds(
        state,
        actor,
        part?.target_type,
        actionEntry?.targetCharacterId
      );
      if (!targetCharacterIds.includes(actor.characterId)) {
        continue;
      }
      if (!isTargetConditionSatisfiedByMember(actor, part?.target_condition, state)) {
        continue;
      }

      const amount = resolveOverDrivePointUpPowerPercent(part);
      if (!Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      // 実機照合: ブレイク時トリガーOD(共鳴含む)は od_rate 非適用だが、
      // 行動スキルの hit 数に基づくドライブピアス補正は適用する。
      const adjustedAmount = truncateToTwoDecimals(amount * driveMultiplier);
      events.push(
        buildActionScopedEvent(
          actionEntry,
          createPassiveTriggerEvent(state.turnState, actor, passive, {
            source: 'od_passive_breaking',
            effectTypes: ['AdditionalHitOnBreaking', 'OverDrivePointUp'],
            triggerType: 'OdPassiveTriggerOnBreaking',
            skillId: Number(skill?.skillId ?? 0),
            skillName: String(skill?.name ?? ''),
            odGaugeDelta: adjustedAmount,
            metadata: {
              baseOverDrivePointUpPercent: amount,
              drivePierceBonusPercent: driveBonusPercent,
              driveMultiplier,
              breakCount,
            },
          })
        )
      );
    }
  }

  return events;
}

function applyCommittedActionSideEffects(state, actionEntry, options = {}) {
  const validatePreview = options.validatePreview !== false;
  const buffMetadataValidation = resolveBuffMetadataValidationOptions(options);
  const member = findMemberByCharacterId(state, actionEntry?.characterId);
  if (!member) {
    throw new Error(`Member not found: ${actionEntry?.characterId}`);
  }
  if (validatePreview && member.revision !== actionEntry._baseRevision) {
    throw new Error(`State changed after preview for character ${actionEntry.characterId}`);
  }

  member.commitSkillPreview({
    characterId: actionEntry.characterId,
    skillId: actionEntry.skillId,
    startSP: actionEntry.startSP,
    endSP: actionEntry.endSP,
    startEP: actionEntry.startEP,
    endEP: actionEntry.endEP,
    startToken: actionEntry.startToken,
    endToken: actionEntry.endToken,
    startMorale: actionEntry.startMorale,
    endMorale: actionEntry.endMorale,
    startMotivation: actionEntry.startMotivation,
    endMotivation: actionEntry.endMotivation,
    baseRevision: actionEntry._baseRevision,
  });

  const sprightlySkill =
    actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
      ? actionEntry._effectiveSkillSnapshot
      : member.getSkill(actionEntry.skillId);
  const sprightlyEffectId = Number(actionEntry?.sprightlyCostAdjustment?.effectId ?? 0);
  const consumedSprightlyEffects = sprightlyEffectId > 0
    ? consumeSelectedCountStatusEffectsWithOrchestrator(
        member,
        SPRIGHTLY_STATUS_TYPE,
        [sprightlyEffectId],
        buildActionContext('Skill', sprightlySkill, {
          actorCharacterId: member.characterId,
          hasDamage: hasDamagePartInParts(sprightlySkill?.parts ?? []),
          turnPhase: 'PlayerTurn',
        })
      )
    : [];
  actionEntry.consumedSprightlyEffects = structuredClone(consumedSprightlyEffects);

  const pursuitSkillSpEvents = [];
  const pursuitSourceSpCost = Math.max(0, Number(actionEntry?.pursuitSourceSpCost ?? 0));
  const pursuitSourceCharacterId = String(actionEntry?.pursuitSourceCharacterId ?? '');
  if (pursuitSourceSpCost > 0 && pursuitSourceCharacterId) {
    const pursuitActor = findMemberByCharacterId(state, pursuitSourceCharacterId);
    if (pursuitActor) {
      const change = pursuitActor.applySpDelta(-pursuitSourceSpCost, 'cost');
      if (String(actionEntry?.pursuitSourceSkillName ?? '') === PURSUIT_TRANSFORMED_SKILL_NAME) {
        markPursuitTransformUsed(state.turnState, pursuitActor.characterId);
      }
      pursuitSkillSpEvents.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: String(actionEntry?.characterId ?? ''),
          characterId: pursuitActor.characterId,
          source: 'pursuit_cost',
          triggerType: 'PursuitSkillCost',
          skillId: Number(actionEntry?.pursuitSourceSkillId ?? 0),
          skillName: String(actionEntry?.pursuitSourceSkillName ?? PURSUIT_TRANSFORMED_SKILL_NAME),
          recordAllocation: 'recipient',
          ...change,
        })
      );
    }
  }

  if (!actionEntry.isDerivedRepeat && Number(actionEntry.castCount ?? 1) > 1 && Number(actionEntry.castIndex ?? 0) === 0) {
    consumeDoubleActionRepeatStatus(member, actionEntry.doubleActionStatusType, 1);
  }

  const skillForCount =
    actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
      ? actionEntry._effectiveSkillSnapshot
      : member.getSkill(actionEntry.skillId);
  const hasDamageForCount = skillForCount ? hasDamagePartInParts(skillForCount.parts ?? []) : false;
  const isNormalOrPursuitForCount =
    !skillForCount ||
    isNormalAttackSkill(skillForCount) ||
    isPursuitOnlySkill(skillForCount);
  if (hasDamageForCount && !isNormalOrPursuitForCount) {
    member.tickSpecialStatusCountEffects();
  }
  const consumedCountEffectIds = new Set(
    (actionEntry?.specialPassiveModifiers?.consumedCountEffectIds ?? []).map((value) => Number(value))
  );
  if (hasDamageForCount && consumedCountEffectIds.size > 0) {
    const canConsumeNonNormal = !isNormalOrPursuitForCount;
    const strictBlockedEffectIds = new Set();
    if (buffMetadataValidation.enabled && buffMetadataValidation.mode === 'strict') {
      for (const effect of member.statusEffects ?? []) {
        const effectId = Number(effect?.effectId ?? 0);
        if (!consumedCountEffectIds.has(effectId)) {
          continue;
        }
        if (!isCountConsumableActiveBuffStatusEffect(effect)) {
          continue;
        }
        const allowed = shouldAllowEffectByMetadataValidation(effect, buffMetadataValidation, {
          phase: 'CommittedActionCountConsumption',
          characterId: member.characterId,
          skillId: Number(actionEntry?.skillId ?? 0),
        });
        if (!allowed) {
          strictBlockedEffectIds.add(effectId);
        }
      }
    }
    const shouldConsume = (effect) => {
      if (!isCountConsumableActiveBuffStatusEffect(effect)) {
        return false;
      }
      const effectId = Number(effect?.effectId ?? 0);
      if (!consumedCountEffectIds.has(effectId)) {
        return false;
      }
      if (strictBlockedEffectIds.has(effectId)) {
        return false;
      }
      if (effect?.metadata?.includeNormalAttack === true) {
        return true;
      }
      return canConsumeNonNormal;
    };
    // Up系の確定仕様に合わせて Count は1 actionあたり2消費。
    member.tickStatusEffectsWhere(shouldConsume);
    member.tickStatusEffectsWhere(shouldConsume);
  }

  const singleRecord = createSingleActionPreviewRecord(actionEntry, {
    enemyCount: Number(
      options.enemyCount ??
        state?.turnState?.enemyState?.enemyCount ??
        DEFAULT_ENEMY_COUNT
    ),
  });
  const preActionTurnState = cloneTurnState(state.turnState);
  applyEnemyEShieldEffectsFromActions(state, singleRecord);
  const removeDebuffEvents = applyRemoveDebuffEffectsFromActions(state, singleRecord);
  const epSkillEvents = applySkillSelfEpGains(state, singleRecord);
  const skillSpEvents = [...applySkillSpGains(state, singleRecord), ...pursuitSkillSpEvents];
  const actionDpEvents = applyDpEffectsFromActions(state, singleRecord);
  const dpHealMotivationEvents = applyMotivationFromDpHealEvents(state, actionDpEvents);
  const tokenEvents = applyTokenEffectsFromActions(state, singleRecord, actionDpEvents);
  const odGaugeBeforeMorale = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));
  const moraleResult = applyMoraleEffectsFromActions(state, singleRecord);
  const odGaugeAfterMorale = truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0));
  const supportBreakOdEvents = computeSupportBreakOdBonusEvents(
    state,
    member,
    skillForCount,
    actionEntry
  );
  const supportBreakOdBonus = truncateToTwoDecimals(
    supportBreakOdEvents.reduce((sum, event) => sum + Number(event?.odGaugeDelta ?? 0), 0)
  );
  if (supportBreakOdBonus > 0) {
    const appliedMoraleOdDelta = truncateToTwoDecimals(odGaugeAfterMorale - odGaugeBeforeMorale);
    if (appliedMoraleOdDelta + 1e-9 < supportBreakOdBonus) {
      const shortfall = truncateToTwoDecimals(supportBreakOdBonus - appliedMoraleOdDelta);
      state.turnState.odGauge = clampOdGauge(
        truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0) + shortfall)
      );
    }
  }
  const talismanFieldEvents = applyTalismanLevelIncrementsFromActions(state, singleRecord);
  const motivationEvents = applyMotivationEffectsFromActions(state, singleRecord);
  const markEvents = applyMarkEffectsFromActions(state, singleRecord);
  const fieldStateEvents = applyFieldStateFromActions(state, singleRecord);
  const doubleActionStatusEvents = applyDoubleActionExtraSkillEffectsFromActions(state, singleRecord);
  const funnelEvents = applyFunnelEffectsFromActions(state, singleRecord);
  const sprightlyEvents = applySprightlyEffectsFromActions(state, singleRecord);
  const activeBuffStatusEvents = applyActiveBuffStatusEffectsFromActions(state, singleRecord);
  const guardEvents = applyGuardEffectsFromActions(state, singleRecord);
  const shreddingEvents = applyShreddingEffectsFromActions(state, singleRecord);
  const buffStatusEvents = applyBuffStatusEffectsFromActions(state, singleRecord);
  const enemyStatusEvents = applyEnemyStatusEffectsFromActions(state, singleRecord);
  const specialEnemyBreakEvents = applyEnemyBreakEffectsFromActions(state, singleRecord, { preActionTurnState });
  const autoEshieldBreakEvents = buildAutoBreakEventsFromActions(singleRecord, specialEnemyBreakEvents);
  const enemyBreakEvents = [
    ...specialEnemyBreakEvents,
    ...autoEshieldBreakEvents,
    ...applyManualBreakEffectsFromActions(state, singleRecord),
  ];
  const enemyHpBreakEvents = applyManualHpBreakEffectsFromActions(state, singleRecord);
  const derivedHpBreakEnemyIndexes = enemyHpBreakEvents
    .map((event) => Number(event?.targetIndex))
    .filter((targetIndex) => Number.isInteger(targetIndex) && targetIndex >= 0);
  if (derivedHpBreakEnemyIndexes.length > 0) {
    if (!Number.isFinite(Number(actionEntry?.hpBreakCount)) || Number(actionEntry.hpBreakCount) <= 0) {
      actionEntry.hpBreakCount = derivedHpBreakEnemyIndexes.length;
    }
    if (normalizeManualHpBreakEnemyIndexes(actionEntry).length === 0) {
      actionEntry.manualHpBreakEnemyIndexes = [...new Set(derivedHpBreakEnemyIndexes)];
    }
  }
  const derivedBreakEnemyIndexes = enemyBreakEvents
    .filter(
      (event) =>
        String(event?.mode ?? '') === 'DownTurn' &&
        String(event?.source ?? '') === 'manual'
    )
    .map((event) => Number(event?.targetIndex))
    .filter((targetIndex) => Number.isInteger(targetIndex) && targetIndex >= 0);
  if (derivedBreakEnemyIndexes.length > 0) {
    if (!Number.isFinite(Number(actionEntry?.breakHitCount)) || Number(actionEntry.breakHitCount) <= 0) {
      actionEntry.breakHitCount = derivedBreakEnemyIndexes.length;
    }
    if (normalizeManualBreakEnemyIndexes(actionEntry).length === 0) {
      actionEntry.manualBreakEnemyIndexes = [...new Set(derivedBreakEnemyIndexes)];
    }
  }
  const breakDownTurnUpResult = applyBreakDownTurnUpFromActions(state, singleRecord);
  const breakDownTurnUpEvents = breakDownTurnUpResult.events;
  const breakDownTurnUpPassiveTriggerEvents = breakDownTurnUpResult.passiveTriggerEvents;
  // 討伐した攻撃自体はODを獲得するため、Dead付与より前の敵状態で攻撃ODを解決する。
  const odGaugeGain = applyOdGaugeFromActions(state, singleRecord, {
    buffMetadataValidation,
  });
  const enemyKillEvents = applyManualKillEffectsFromActions(state, singleRecord);
  const derivedKillEnemyIndexes = enemyKillEvents
    .map((event) => Number(event?.targetIndex))
    .filter((targetIndex) => Number.isInteger(targetIndex) && targetIndex >= 0);
  if (derivedKillEnemyIndexes.length > 0) {
    if (!Number.isFinite(Number(actionEntry?.killCount)) || Number(actionEntry.killCount) <= 0) {
      actionEntry.killCount = derivedKillEnemyIndexes.length;
    }
    if (normalizeManualKillEnemyIndexes(actionEntry).length === 0) {
      actionEntry.manualKillEnemyIndexes = [...new Set(derivedKillEnemyIndexes)];
    }
  }
  const stageSetupKillSpEvents = applyStageSetupSpOnEnemyKill(
    state,
    actionEntry,
    Number(actionEntry?.killCount ?? derivedKillEnemyIndexes.length)
  );
  member.incrementSkillUseById(actionEntry.skillId);

  return {
    removeDebuffEvents,
    epSkillEvents,
    skillSpEvents,
    actionDpEvents,
    dpHealMotivationEvents,
    tokenEvents,
    moraleEvents: moraleResult.moraleEvents,
    spPassiveEvents: [...moraleResult.spPassiveEvents, ...stageSetupKillSpEvents],
    additionalTurnPassiveGrantedIds: moraleResult.additionalTurnPassiveGrantedIds,
    dpPassiveEvents: moraleResult.dpPassiveEvents,
    dpPassiveMotivationEvents: applyMotivationFromDpHealEvents(state, moraleResult.dpPassiveEvents),
    passiveTriggerEvents: [
      ...moraleResult.passiveTriggerEvents,
      ...supportBreakOdEvents,
      ...breakDownTurnUpPassiveTriggerEvents,
    ],
    motivationEvents,
    markEvents,
    fieldStateEvents: [...fieldStateEvents, ...moraleResult.fieldStateEvents, ...talismanFieldEvents],
    doubleActionStatusEvents,
    funnelEvents,
    sprightlyEvents,
    activeBuffStatusEvents,
    buffStatusEvents,
    guardEvents,
    shreddingEvents,
    enemyStatusEvents,
    enemyBreakEvents,
    enemyHpBreakEvents,
    enemyKillEvents,
    breakDownTurnUpEvents,
    odGaugeGain,
  };
}

function isExtraSkillTriggerSkill(skill) {
  if (!skill || typeof skill !== 'object') {
    return false;
  }
  return isExSkillByLabel(skill);
}

function previewActionEntries(state, sortedActions, enemyCount = DEFAULT_ENEMY_COUNT, options = {}) {
  const projectedState = {
    ...state,
    party: state.party.map((member) => member.clone()),
    turnState: cloneTurnState(state.turnState),
  };
  syncTurnStateEnemyCount(projectedState.turnState, enemyCount);
  const actionEntries = [];
  let actionSequence = 0;

  outer: for (const { member, position, skill, action } of sortedActions) {
    const projectedMember = findMemberByCharacterId(projectedState, member.characterId);
    if (!projectedMember) {
      throw new Error(`Member not found: ${member.characterId}`);
    }
    const projectedSkill = projectedMember.getSkill(skill.skillId) ?? skill;
    const effectiveSkill = resolveEffectiveSkillForAction(projectedState, projectedMember, projectedSkill);
    const projectedAction = refreshAutomaticPursuitActionForState(action, projectedState);
    const doubleActionStatusType = resolveDoubleActionRepeatStatusType(projectedMember, effectiveSkill);
    const shouldRepeat =
      Boolean(doubleActionStatusType) &&
      resolveRemainingSkillUsesForMember(projectedMember, effectiveSkill) >= DOUBLE_ACTION_EXTRA_SKILL_REQUIRED_USES;
    const castCount = shouldRepeat ? DOUBLE_ACTION_EXTRA_SKILL_CAST_COUNT : 1;
    const primaryEntry = buildPreviewActionEntry(
      projectedState,
      projectedMember,
      position,
      effectiveSkill,
      projectedAction,
      {
        actionInstanceId: buildActionInstanceId(projectedMember.characterId, actionSequence),
        castIndex: 0,
        castCount,
        doubleActionStatusType,
        isDerivedRepeat: false,
      }
    );
    actionSequence += 1;
    actionEntries.push(primaryEntry);
    const primaryResult = applyCommittedActionSideEffects(projectedState, primaryEntry, {
      ...options,
      validatePreview: false,
      enemyCount,
    });
    if ((primaryResult.enemyHpBreakEvents?.length ?? 0) > 0) {
      break outer;
    }

    if (!shouldRepeat) {
      continue;
    }

    const repeatMember = findMemberByCharacterId(projectedState, member.characterId);
    if (!repeatMember) {
      throw new Error(`Member not found: ${member.characterId}`);
    }
    const repeatBaseSkill = repeatMember.getSkill(skill.skillId) ?? skill;
    const repeatSkill = {
      ...resolveEffectiveSkillForAction(projectedState, repeatMember, repeatBaseSkill),
      spCost: 0,
      actionSelectionPassiveEvents: [],
    };
    const repeatAction = refreshAutomaticPursuitActionForState(
      buildDerivedRepeatAction(projectedAction),
      projectedState
    );
    const repeatEntry = buildPreviewActionEntry(
      projectedState,
      repeatMember,
      position,
      repeatSkill,
      repeatAction,
      {
        actionInstanceId: buildActionInstanceId(repeatMember.characterId, actionSequence),
        castIndex: 1,
        castCount,
        doubleActionStatusType,
        isDerivedRepeat: true,
      }
    );
    actionSequence += 1;
    actionEntries.push(repeatEntry);
    const repeatResult = applyCommittedActionSideEffects(projectedState, repeatEntry, {
      ...options,
      validatePreview: false,
      enemyCount,
    });
    if ((repeatResult.enemyHpBreakEvents?.length ?? 0) > 0) {
      break;
    }
  }

  return {
    actionEntries,
    projectedState,
  };
}

function getEpRule(member) {
  return member?.epRule && typeof member.epRule === 'object' ? member.epRule : null;
}

function getPassiveOverdriveEpLimit(member) {
  let limit = null;
  for (const passive of getConfiguredPassivesForMember(member)) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    for (const part of passive.parts ?? []) {
      if (String(part.skill_type ?? '') !== 'EpLimitOverwrite') {
        continue;
      }
      const value = resolvePreferredNonDamageRangeValue(part?.power);
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
      const amount = resolvePreferredNonDamageRangeValue(part?.power);
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
  for (const passive of getConfiguredPassivesForMember(member)) {
    if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
      continue;
    }
    const effectTypes = new Set();
    const effectiveParts = resolvePassiveEffectiveParts(passive, { party: [member] }, member);
    for (const part of effectiveParts) {
      const skillType = String(part?.skill_type ?? '').trim();
      if (skillType) {
        effectTypes.add(skillType);
      }
    }
    let totalDelta = 0;
    let matched = false;
    for (const part of effectiveParts) {
      const skillType = String(part.skill_type ?? '');
      if (skillType === 'EpLimitOverwrite') {
        const limit = resolvePreferredNonDamageRangeValue(part?.power);
        if (Number.isFinite(limit) && limit > 0) {
          matched = true;
          effectTypes.add(skillType);
        }
        continue;
      }
      if (skillType !== 'HealEp' || String(part.target_type ?? '') !== 'Self') {
        continue;
      }
      const amount = resolvePreferredNonDamageRangeValue(part?.power);
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

function applyPassiveSpOnOverdriveStart(state) {
  const spEvents = [];
  const passiveEvents = [];

  for (const actor of state.party ?? []) {
    for (const passive of getConfiguredPassivesForMember(actor)) {
      if (String(passive.timing ?? '') !== 'OnOverdriveStart') {
        continue;
      }
      const effectTypes = new Set();
      let totalSpDelta = 0;
      let matched = false;

      for (const part of resolvePassiveEffectiveParts(passive, state, actor)) {
        const skillType = String(part.skill_type ?? '');
        if (skillType !== 'HealSp') {
          continue;
        }
        const amount = resolvePreferredNonDamageRangeValue(part?.power);
        if (!Number.isFinite(amount) || amount === 0) {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, actor)) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          actor,
          part?.target_type,
          null
        );
        for (const targetId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetId);
          if (!target) {
            continue;
          }
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
            continue;
          }
          const change = target.applySpDelta(amount, 'passive');
          spEvents.push({
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'sp_passive',
            passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
            passiveName: String(passive?.name ?? ''),
            targetType: String(part?.target_type ?? ''),
            ...change,
          });
          matched = true;
          totalSpDelta += Number(change?.delta ?? 0);
          effectTypes.add(skillType);
        }
      }

      if (matched) {
        passiveEvents.push(
          createPassiveTriggerEvent(state.turnState, actor, passive, {
            source: 'passive',
            effectTypes: [...effectTypes],
            spDelta: totalSpDelta,
          })
        );
      }
    }
  }

  return { spEvents, passiveEvents };
}

function applyOverdriveStartSpRecovery(state, turnState) {
  const spEvents = [];
  const odAmount = OD_RECOVERY_BY_LEVEL[Number(turnState?.odLevel ?? 0)] ?? 0;
  if (!Number.isFinite(odAmount) || odAmount === 0) {
    return { spEvents };
  }

  for (const member of state.party ?? []) {
    const od = member.applySpDelta(odAmount, 'od');
    spEvents.push({
      characterId: member.characterId,
      source: 'od',
      ...od,
    });
  }

  return { spEvents };
}

function evaluatePassiveSelfConditions(passive, part, state, member) {
  const conditions = [passive?.condition, part?.cond, part?.hit_condition]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const conditionSkill = createConditionSkillContext(passive, part);
  return conditions.every((expr) => {
    const evaluated = evaluateConditionExpression(expr, state, member, conditionSkill);
    // 未実装条件が含まれる場合はパッシブを発動させない
    return evaluated.unknownCount === 0 && evaluated.result;
  });
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

  if (timingSet.has('OnPlayerTurnStart')) {
    for (const member of state?.party ?? []) {
      if (typeof member?.removeStatusEffectsWhere !== 'function') {
        continue;
      }
      if (getDpRate(member.dpState) >= DP_RATE_REFERENCE_MAX) {
        continue;
      }
      member.removeStatusEffectsWhere(
        (effect) => String(effect?.statusType ?? '') === BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE
      );
    }
  }

  const sortedParty = [...(state?.party ?? [])].sort((a, b) => {
    const ai = PASSIVE_ACTION_ORDER.indexOf(Number(a.partyIndex ?? 99));
    const bi = PASSIVE_ACTION_ORDER.indexOf(Number(b.partyIndex ?? 99));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const requiresExtraActive = timingSet.has('OnAdditionalTurnStart');
  for (const member of sortedParty) {
    // OnAdditionalTurnStart は「自身が追加ターン開始時」に発火するため、
    // isExtraActive でないメンバーのパッシブはスキップする。
    if (requiresExtraActive && !member.isExtraActive) {
      continue;
    }
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
      const enemyStatusChanges = [];
      let unsupportedMatched = false;
      const effectiveParts = resolvePassiveEffectiveParts(passive, state, member);
      // AdditionalHit* parts are trigger conditions for action-time effects, not passive-timing effects.
      const hasAdditionalHitTrigger = effectiveParts.some((p) =>
        String(p?.skill_type ?? '').startsWith('AdditionalHit')
      );
      if (hasAdditionalHitTrigger) {
        if (passive?.isTriggeredSkillPassive !== true) {
          // Regular passive: skip entirely (action-conditional, handled at action time)
          continue;
        }
        // Triggered skill passive: register in passive log without applying conditional effects
        matched = true;
      }
      for (const part of hasAdditionalHitTrigger ? [] : effectiveParts) {
        const skillType = String(part?.skill_type ?? '');
        if (skillType) {
          effectTypes.add(skillType);
        }
        if (skillType === 'Zone' || skillType === 'RiceFieldZone') {
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
        if (ENEMY_STATUS_SKILL_TYPES.has(skillType) && isEnemyStatusTargetType(part?.target_type)) {
          if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
            continue;
          }
          const conditionSkill = createConditionSkillContext(passive, part);
          const targetEnemyIndexes = getPassiveTargetEnemyIndexes(
            state,
            part,
            options.targetEnemyIndex ?? 0
          );
          if (targetEnemyIndexes.length === 0) {
            continue;
          }
          for (const targetIndex of targetEnemyIndexes) {
            const targetCondition = String(part?.target_condition ?? '').trim();
            if (targetCondition) {
              const evaluated = evaluateConditionExpression(
                targetCondition,
                state,
                member,
                conditionSkill,
                { targetEnemyIndex: Number(targetIndex) }
              );
              if (evaluated.unknownCount > 0 || !evaluated.result) {
                continue;
              }
            }
            const appliedStatus = normalizeEnemyStatus(
              {
              statusType: skillType,
              targetIndex,
              remainingTurns: getEnemyStatusRemainingTurnsFromPart(skillType, part),
              power: scaleHighBoostEnemyDebuffPower(member, skillType, getEnemyStatusPowerValue(part)),
              elements: normalizeEnemyStatusElements(part?.elements),
              limitType: String(part?.effect?.limitType ?? ''),
                exitCond: String(part?.effect?.exitCond ?? ''),
                sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                sourceSkillName: String(passive?.name ?? ''),
                sourceSkillLabel: String(passive?.label ?? ''),
                sourceSkillDesc: String(passive?.desc ?? ''),
                sourceCharacterName: String(member?.characterName ?? ''),
                metadata: {
                  targetType: String(part?.target_type ?? ''),
                  timing: String(passive?.timing ?? ''),
                  passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                  sourceKind: 'passive',
                },
              },
              getEnemyState(turnState).enemyCount
            );
            if (!appliedStatus) {
              continue;
            }
            upsertEnemyStatus(turnState, appliedStatus);
            enemyStatusChanges.push({
              actorCharacterId: member.characterId,
              passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              passiveName: String(passive?.name ?? ''),
              mode: 'EnemyStatusPassive',
              ...appliedStatus,
            });
            matched = true;
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
          skillType !== 'Funnel' &&
          skillType !== SPRIGHTLY_STATUS_TYPE &&
          skillType !== 'HighBoost' &&
          skillType !== 'Talisman' &&
          skillType !== 'AdditionalTurn' &&
          skillType !== 'HealSkillUsedCount' &&
          skillType !== 'ReplaceNormalSkill' &&
          skillType !== 'ReplacePursuit' &&
          skillType !== 'BuffCharge' &&
          skillType !== 'BreakDownTurnUp' &&
          skillType !== 'HealSpRandom' &&
          skillType !== 'OverDrivePointUpRandom' &&
          skillType !== 'TokenSetByAttacking' &&
          skillType !== 'TokenSetByAttacked' &&
          skillType !== 'TokenSetByHealedDp' &&
          skillType !== 'BIYamawakiServant' &&
          skillType !== 'DamageRateUpPerToken' &&
          skillType !== 'AttackUpPerToken' &&
          skillType !== 'DefenseUpPerToken' &&
          skillType !== 'AdditionalHitOnExtraSkill' &&
          skillType !== 'AdditionalHitOnBreaking' &&
          skillType !== 'AdditionalHitOnWeak' &&
          skillType !== 'AdditionalHitOnKillCount' &&
          skillType !== 'AdditionalHitOnHealedSpWithoutSelfHeal' &&
          skillType !== 'AdditionalHitOnSpecifiedSkill' &&
          skillType !== 'AdditionalHitOnRemovingBuff' &&
          skillType !== 'AdditionalHitOnKill' &&
          skillType !== 'AdditionalHitOnZone' &&
          skillType !== 'AdditionalHitOnOverDrivePointDownSkill' &&
          skillType !== 'AdditionalHitOnPursuit' &&
          skillType !== 'ZoneUpEternal' &&
          skillType !== 'DoubleActionExtraSkill' &&
          skillType !== BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE &&
          skillType !== 'ShadowClone' &&
          skillType !== 'BorderRefPDownByAdmiral' &&
          skillType !== 'ExecuteSkillOnPreTurn' &&
          skillType !== 'RemoveSpecialStatus' &&
          skillType !== 'ArrowCherryBlossoms' &&
          skillType !== 'NegativeMind' &&
          skillType !== 'Makeup' &&
          skillType !== 'Mocktail' &&
          skillType !== 'SpecialCommandCountUp' &&
          skillType !== 'StunRandom' &&
          skillType !== 'GiveDebuffTurnUp' &&
          skillType !== 'SkillCondition' &&
          skillType !== 'IgnoreEShieldElement' &&
          skillType !== 'Dodge' &&
          skillType !== 'SkillLimitCountUp' &&
          skillType !== 'Misfortune' &&
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
            const amount = resolveHighBoostAdjustedDpAmount(member, skillType, baseMaxDp * rate);
            if (!Number.isFinite(amount) || amount <= 0) {
              continue;
            }
            const nextCurrentDp = resolveNextCurrentDpForDirectChange(startDpState, skillType, amount);
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
            // For triggered skills (isTriggeredSkillPassive===true), log the passive event even though
            // mark state is managed by initializeIntrinsicMarkStatesFromParty.
            // For regular passives (database/style), skip silently.
            if (passive?.isTriggeredSkillPassive === true) {
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

        if (skillType === 'ReduceSp') {
          // ReduceSp is consumed by skill-cost resolution only.
          // It must not modify current SP during passive timing application.
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
            matched = true;
            break;
          }
          continue;
        }

        if (skillType === 'OverwriteSp') {
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
            const delta = power - Number(target.sp.current ?? 0);
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

        if (skillType === 'Funnel') {
          const hitBonus = Number(part?.power?.[0] ?? 0);
          const damageBonus = Number(part?.value?.[0] ?? 0);
          if (!Number.isFinite(hitBonus) || hitBonus <= 0) {
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
          const limitType = String(part?.effect?.limitType ?? 'Default');
          const exitCond = String(part?.effect?.exitCond ?? 'Count');
          const exitValArr = Array.isArray(part?.effect?.exitVal) ? part.effect.exitVal : [];
          const remaining = Number.isFinite(Number(exitValArr[0])) ? Number(exitValArr[0]) : 1;
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            target.addStatusEffect({
              statusType: 'Funnel',
              limitType,
              exitCond,
              remaining,
              power: hitBonus,
              // 単独発動仕様: パッシブ由来として明示（スキル由来と別枠で共存可能）
              sourceType: 'passive',
              sourcePassiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourcePassiveName: String(passive?.name ?? ''),
              metadata: {
                damageBonus: Number.isFinite(damageBonus) ? damageBonus : 0,
                targetType: String(part?.target_type ?? ''),
              },
            });
            matched = true;
          }
          continue;
        }

        if (skillType === SPRIGHTLY_STATUS_TYPE) {
          const reductionRate = Number(part?.power?.[0] ?? 0);
          if (!Number.isFinite(reductionRate) || reductionRate <= 0) {
            continue;
          }
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target || !isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const appliedStatus = addSprightlyStatusEffect(target, part, {
              sourceType: 'passive',
              sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourceSkillLabel: String(passive?.label ?? ''),
              sourceSkillName: String(passive?.name ?? ''),
              sourceCharacterId: String(member?.characterId ?? ''),
              sourceCharacterName: String(member?.characterName ?? ''),
              sourceSkillDesc: String(passive?.desc ?? ''),
            });
            if (!appliedStatus) continue;
            appliedStatusEffects.push({
              characterId: target.characterId,
              effectId: Number(appliedStatus.effectId),
              statusType: SPRIGHTLY_STATUS_TYPE,
              power: Number(appliedStatus.power),
              limitType: String(appliedStatus.limitType),
              exitCond: String(appliedStatus.exitCond),
              remaining: Number(appliedStatus.remaining),
            });
            matched = true;
          }
          continue;
        }

        if (DOUBLE_ACTION_STATUS_TYPES.has(skillType)) {
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
            const appliedStatus = addDoubleActionStatusEffect(
              skillType,
              target,
              {
                sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                sourceSkillLabel: String(passive?.label ?? ''),
                sourceSkillName: String(passive?.name ?? ''),
                sourceCharacterId: String(member?.characterId ?? ''),
                sourceCharacterName: String(member?.characterName ?? ''),
                sourceSkillDesc: String(passive?.desc ?? ''),
                metadata: {
                  targetType: String(part?.target_type ?? ''),
                },
              },
              {
                sourceType: 'passive',
                limitType: String(part?.effect?.limitType ?? 'Only'),
                exitCond: String(part?.effect?.exitCond ?? 'Count'),
                remaining: Number(part?.effect?.exitVal?.[0] ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING),
              }
            );
            appliedStatusEffects.push(appliedStatus);
            matched = true;
          }
          continue;
        }

        if (skillType === 'HighBoost') {
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const appliedStatus = target.addStatusEffect({
              statusType: HIGH_BOOST_STATUS_TYPE,
              limitType: 'Only',
              exitCond: 'Eternal',
              remaining: 0,
              power: HIGH_BOOST_SKILL_ATK_RATE,
              sourceType: 'passive',
              sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourceSkillLabel: String(passive?.label ?? passive?.name ?? ''),
              sourceSkillName: String(passive?.name ?? ''),
              metadata: {
                onlyGroupKey: HIGH_BOOST_ONLY_GROUP_KEY,
                effectName: HIGH_BOOST_STATUS_TYPE,
                spCostIncrease: HIGH_BOOST_SP_COST_INCREASE,
                skillAtkRate: HIGH_BOOST_SKILL_ATK_RATE,
                attackBuffMultiplier: HIGH_BOOST_ATTACK_BUFF_MULTIPLIER,
                debuffMultiplier: HIGH_BOOST_DEBUFF_MULTIPLIER,
                dpHealMultiplier: HIGH_BOOST_DP_HEAL_MULTIPLIER,
                targetType: String(part?.target_type ?? ''),
              },
            });
            appliedStatusEffects.push({
              characterId: target.characterId,
              effectId: Number(appliedStatus?.effectId ?? 0),
              statusType: String(appliedStatus?.statusType ?? HIGH_BOOST_STATUS_TYPE),
              power: Number(appliedStatus?.power ?? HIGH_BOOST_SKILL_ATK_RATE),
              limitType: String(appliedStatus?.limitType ?? 'Only'),
              exitCond: String(appliedStatus?.exitCond ?? 'Eternal'),
              remaining: Number(appliedStatus?.remaining ?? 0),
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'Talisman') {
          const levelDelta = Number(part?.power?.[0] ?? 0);
          const requiresActive = Number(part?.value?.[0] ?? 0) === 1;
          const change = applyTalismanChange(turnState, {
            requiresActive,
            activateOnApply: levelDelta === 0,
            levelDelta,
          });
          if (change) {
            const talismanFieldEvent = createTalismanFieldEvent(change, {
              source: 'passive_timing',
            });
            if (talismanFieldEvent) {
              fieldEvents.push(talismanFieldEvent);
            }
            matched = true;
          }
          continue;
        }

        if (skillType === 'Disaster') {
          const levelDelta = Number(part?.power?.[0] ?? 0);
          const change = applyDisasterChange(turnState, {
            levelDelta,
          });
          if (change) {
            const disasterFieldEvent = createDisasterFieldEvent(change, {
              source: 'passive_timing',
            });
            if (disasterFieldEvent) {
              fieldEvents.push(disasterFieldEvent);
            }
            matched = true;
          }
          continue;
        }

        if (skillType === 'BuffCharge') {
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID.BuffCharge;
          const exitCond = String(part?.effect?.exitCond ?? DEFAULT_BUFF_CHARGE_EXIT_COND);
          const remaining = Number(part?.effect?.exitVal?.[0] ?? DEFAULT_BUFF_CHARGE_REMAINING);
          const power = resolvePreferredNonDamageRangeValue(part?.power);
          const sourceSkill = {
            skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
            label: String(passive?.label ?? ''),
            name: String(passive?.name ?? ''),
            desc: String(passive?.desc ?? ''),
          };
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            target.applySpecialStatus(statusTypeId, remaining, exitCond, {
              skill: sourceSkill,
              actor: member,
              ...(Number.isFinite(power) ? { power } : {}),
            });
            const activeEffects = target.getStatusEffectsByType('BuffCharge', { activeOnly: true });
            const latest = activeEffects.at(-1);
            appliedStatusEffects.push({
              characterId: target.characterId,
              statusType: 'BuffCharge',
              effectId: Number(latest?.effectId ?? 0),
              exitCond: String(latest?.exitCond ?? exitCond),
              remaining: Number(latest?.remaining ?? remaining),
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'HealSpRandom') {
          // 確率でSP回復: power[0] = probability (always succeeds in simulator), value[0] = SP amount
          const amount = Number(part?.value?.[0] ?? 0);
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
          continue;
        }

        if (skillType === 'OverDrivePointUpRandom') {
          // 確率でODゲージ増加: power[0] = probability (always succeeds), value[0] = gauge% (e.g. 0.1 → 10%)
          const amount = truncateToTwoDecimals(Number(part?.value?.[0] ?? 0) * 100);
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
            truncateToTwoDecimals(Number(turnState.odGauge ?? 0) + amount)
          );
          matched = true;
          totalOdGaugeDelta += amount;
          continue;
        }

        if (skillType === 'HealSp') {
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
          const spSource = String(passive?.timing ?? '') === 'OnOverdriveStart' ? 'od' : 'passive';
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            const change = target.applySpDelta(amount, spSource);
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

        if (skillType === 'BIYamawakiServant') {
          const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID.BIYamawakiServant;
          const exitCond = String(part?.effect?.exitCond ?? 'Count');
          const remaining = Number(part?.effect?.exitVal?.[0] ?? 1);
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
            target.applySpecialStatus(statusTypeId, remaining, exitCond, {
              skill: {
                skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                label: String(passive?.label ?? ''),
                name: String(passive?.name ?? ''),
                desc: String(passive?.desc ?? ''),
              },
              actor: member,
            });
            appliedStatusEffects.push({
              characterId: String(target.characterId),
              statusType: 'BIYamawakiServant',
              exitCond,
              remaining,
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'NegativeMind') {
          const statusTypeId = SPECIAL_STATUS_TYPE_NEGATIVE_STATE;
          const exitCond = String(part?.effect?.exitCond ?? 'Count');
          const remaining = Number(part?.effect?.exitVal?.[0] ?? DEFAULT_STATUS_EFFECT_REMAINING);
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
            target.applySpecialStatus(statusTypeId, remaining, exitCond, {
              skill: {
                skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                label: String(passive?.label ?? ''),
                name: String(passive?.name ?? ''),
                desc: String(passive?.desc ?? ''),
              },
              actor: member,
            });
            const activeEffects = target.getStatusEffectsByType('NegativeState', { activeOnly: true });
            const latest = activeEffects.at(-1);
            appliedStatusEffects.push({
              characterId: String(target.characterId),
              statusType: 'NegativeState',
              sourceSkillType: skillType,
              statusTypeId,
              effectId: Number(latest?.effectId ?? 0),
              exitCond: String(latest?.exitCond ?? exitCond),
              remaining: Number(latest?.remaining ?? remaining),
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'Makeup') {
          const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID.Makeup;
          const exitCond = String(part?.effect?.exitCond ?? 'Eternal');
          const remaining = Number(part?.effect?.exitVal?.[0] ?? DEFAULT_STATUS_EFFECT_REMAINING);
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
            target.applySpecialStatus(statusTypeId, remaining, exitCond, {
              skill: {
                skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                label: String(passive?.label ?? ''),
                name: String(passive?.name ?? ''),
                desc: String(passive?.desc ?? ''),
              },
              actor: member,
            });
            const activeEffects = target.getStatusEffectsByType('Makeup', { activeOnly: true });
            const latest = activeEffects.at(-1);
            appliedStatusEffects.push({
              characterId: String(target.characterId),
              statusType: 'Makeup',
              sourceSkillType: skillType,
              statusTypeId,
              effectId: Number(latest?.effectId ?? 0),
              exitCond: String(latest?.exitCond ?? exitCond),
              remaining: Number(latest?.remaining ?? remaining),
            });
            matched = true;
          }
          continue;
        }

        if (skillType === 'Mocktail') {
          const statusTypeId = BUFF_SKILL_TYPE_TO_STATUS_ID.Mocktail;
          const healUpRate = Number(part?.power?.[0] ?? 0);
          const rawExitCond = String(part?.effect?.exitCond ?? '').trim();
          const exitCond =
            rawExitCond && rawExitCond !== MOCKTAIL_NONE_EXIT_COND
              ? rawExitCond
              : MOCKTAIL_DEFAULT_EXIT_COND;
          const remaining =
            exitCond === MOCKTAIL_DEFAULT_EXIT_COND
              ? 0
              : Number(part?.effect?.exitVal?.[0] ?? DEFAULT_STATUS_EFFECT_REMAINING);
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
            target.applySpecialStatus(statusTypeId, remaining, exitCond, {
              skill: {
                skillId: Number(passive?.passiveId ?? passive?.id ?? 0),
                label: String(passive?.label ?? ''),
                name: String(passive?.name ?? ''),
                desc: String(passive?.desc ?? ''),
              },
              actor: member,
              power: healUpRate,
              metadata: {
                healUpRate,
                dpHealMultiplier: truncateToTwoDecimals(MOCKTAIL_BASE_HEAL_MULTIPLIER + healUpRate),
                timing: String(passive?.timing ?? ''),
                passiveId: Number(passive?.passiveId ?? passive?.id ?? 0),
                sourceKind: String(passive?.sourceType ?? '') === 'support' ? 'support' : 'passive',
                targetType: String(part?.target_type ?? ''),
              },
            });
            const activeEffects = target.getStatusEffectsByType(MOCKTAIL_STATUS_TYPE, { activeOnly: true });
            const latest = activeEffects.at(-1);
            appliedStatusEffects.push({
              characterId: String(target.characterId),
              statusType: MOCKTAIL_STATUS_TYPE,
              sourceSkillType: skillType,
              statusTypeId,
              effectId: Number(latest?.effectId ?? 0),
              power: Number(latest?.power ?? healUpRate),
              exitCond: String(latest?.exitCond ?? exitCond),
              remaining: Number(latest?.remaining ?? remaining),
            });
            matched = true;
          }
          continue;
        }

        if (
          skillType === 'TokenSetByAttacking' ||
          skillType === 'TokenSetByAttacked' ||
          skillType === 'TokenSetByHealedDp'
        ) {
          // Action-time or character-specific triggers; handled outside the timing pipeline.
          continue;
        }

        if (
          skillType === 'DamageRateUpPerToken' ||
          skillType === 'AttackUpPerToken' ||
          skillType === 'DefenseUpPerToken'
        ) {
          // Per-token rate modifiers; resolved at action/preview time via dedicated resolvers.
          // Log the passive event (matched=true) so the user sees the passive is active.
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            matched = true;
            break;
          }
          continue;
        }

        if (
          skillType === 'AdditionalTurn' ||
          skillType === 'BreakDownTurnUp' ||
          skillType === 'HealSkillUsedCount' ||
          skillType === 'ReplaceNormalSkill' ||
          skillType === 'ReplacePursuit'
        ) {
          // These effects are handled at action time or are out of scope for passive timing.
          continue;
        }

        if (
          skillType === 'AdditionalHitOnExtraSkill' ||
          skillType === 'AdditionalHitOnBreaking' ||
          skillType === 'AdditionalHitOnWeak' ||
          skillType === 'AdditionalHitOnKillCount' ||
          skillType === 'AdditionalHitOnHealedSpWithoutSelfHeal' ||
          skillType === 'AdditionalHitOnSpecifiedSkill' ||
          skillType === 'AdditionalHitOnRemovingBuff' ||
          skillType === 'AdditionalHitOnKill' ||
          skillType === 'AdditionalHitOnZone' ||
          skillType === 'AdditionalHitOnOverDrivePointDownSkill' ||
          skillType === 'AdditionalHitOnPursuit' ||
          skillType === 'ZoneUpEternal' ||
          skillType === 'DoubleActionExtraSkill' ||
          skillType === BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE ||
          skillType === 'ShadowClone' ||
          skillType === 'BorderRefPDownByAdmiral' ||
          skillType === 'ExecuteSkillOnPreTurn' ||
          skillType === 'RemoveSpecialStatus' ||
          skillType === 'ArrowCherryBlossoms' ||
          skillType === 'NegativeMind' ||
          skillType === 'SpecialCommandCountUp'
        ) {
          // Action-time attack modifiers or character-specific mechanics; silent-skip at timing boundary.
          continue;
        }

        if (
          skillType === 'StunRandom' ||
          skillType === 'GiveDebuffTurnUp' ||
          skillType === 'SkillCondition' ||
          skillType === 'IgnoreEShieldElement' ||
          skillType === 'Dodge' ||
          skillType === 'SkillLimitCountUp' ||
          skillType === 'Misfortune'
        ) {
          // Effects that modify combat behaviour without changing tracked state.
          // Log the passive event so users see the passive is active.
          const targetCharacterIds = resolveSupportTargetCharacterIds(
            state,
            member,
            part?.target_type,
            options.targetCharacterId ?? null
          );
          for (const targetCharacterId of targetCharacterIds) {
            const target = findMemberByCharacterId(state, targetCharacterId);
            if (!target) {
              continue;
            }
            if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
              continue;
            }
            matched = true;
            break;
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
            enemyStatusChanges,
            fieldEvents,
            unsupportedEffectTypes: [...unsupportedEffectTypes],
          })
        );
      }
    }
  }

  return { spEvents, epEvents, dpEvents, passiveEvents };
}

export function syncByakkoRushStateWithDpCondition(state) {
  // Keep this in sync with the OnPlayerTurnStart passive status application path.
  // DP overrides use the same passive condition semantics without running the full turn-start timing.
  for (const member of state?.party ?? []) {
    if (typeof member?.removeStatusEffectsWhere !== 'function') {
      continue;
    }
    const dpRate = getDpRate(member.dpState);
    if (dpRate < DP_RATE_REFERENCE_MAX) {
      member.removeStatusEffectsWhere(
        (effect) => String(effect?.statusType ?? '') === BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE
      );
      continue;
    }
    if (
      typeof member.resolveEffectiveByakkoDoubleActionAttackSkillEffects === 'function' &&
      member.resolveEffectiveByakkoDoubleActionAttackSkillEffects().length > 0
    ) {
      continue;
    }
    for (const passive of getPassiveEntriesForMember(member)) {
      let applied = false;
      for (const part of resolvePassiveEffectiveParts(passive, state, member)) {
        const skillType = String(part?.skill_type ?? '');
        if (skillType !== BYAKKO_DOUBLE_ACTION_ATTACK_SKILL_STATUS_TYPE) {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
          continue;
        }
        const targetCharacterIds = resolveSupportTargetCharacterIds(
          state,
          member,
          part?.target_type,
          null
        );
        for (const targetCharacterId of targetCharacterIds) {
          const target = findMemberByCharacterId(state, targetCharacterId);
          if (!target) {
            continue;
          }
          addDoubleActionStatusEffect(
            skillType,
            target,
            {
              sourceSkillId: Number(passive?.passiveId ?? passive?.id ?? 0),
              sourceSkillLabel: String(passive?.label ?? ''),
              sourceSkillName: String(passive?.name ?? ''),
              sourceCharacterId: String(member?.characterId ?? ''),
              sourceCharacterName: String(member?.characterName ?? ''),
              sourceSkillDesc: String(passive?.desc ?? ''),
              metadata: {
                targetType: String(part?.target_type ?? ''),
              },
            },
            {
              sourceType: 'passive',
              limitType: String(part?.effect?.limitType ?? 'Only'),
              exitCond: String(part?.effect?.exitCond ?? 'Count'),
              remaining: Number(part?.effect?.exitVal?.[0] ?? DOUBLE_ACTION_EXTRA_SKILL_DEFAULT_REMAINING),
            }
          );
          applied = true;
        }
        if (applied) {
          break;
        }
      }
      if (applied) {
        break;
      }
    }
  }
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
      events.push(
        buildActionScopedEvent(actionEntry, {
          characterId: member.characterId,
          source: 'ep_skill',
          skillId: skill.skillId,
          ...change,
        })
      );
    }
  }
  return events;
}

function applyRemoveDebuffEffectsFromActions(state, previewRecord) {
  const events = [];

  for (const actionEntry of previewRecord.actions ?? []) {
    const actor = findMemberByCharacterId(state, actionEntry.characterId);
    if (!actor) {
      continue;
    }

    const skill =
      actionEntry?._effectiveSkillSnapshot && typeof actionEntry._effectiveSkillSnapshot === 'object'
        ? structuredClone(actionEntry._effectiveSkillSnapshot)
        : actor.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = Array.isArray(skill.parts) ? skill.parts : resolveEffectiveSkillParts(skill, state, actor);
    for (const part of effectiveParts ?? []) {
      if (String(part?.skill_type ?? '').trim() !== 'RemoveDebuff') {
        continue;
      }

      const amount = Math.max(0, Number(part?.power?.[0] ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) {
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
      for (const targetCharacterId of targetCharacterIds) {
        const target = findMemberByCharacterId(state, targetCharacterId);
        if (!target) {
          continue;
        }
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition, state)) {
          continue;
        }

        const removed = typeof target.removeStatusEffectsWhere === 'function'
          ? target.removeStatusEffectsWhere(isRemovablePlayerDebuffStatusEffect, amount)
          : [];
        if (removed.length === 0) {
          continue;
        }

        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            skillId: Number(skill.skillId ?? 0),
            skillName: String(skill.name ?? ''),
            removedCount: removed.length,
            removedStatusTypes: removed.map((effect) => String(effect?.statusType ?? '')).filter(Boolean),
          })
        );
      }
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
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            characterId: target.characterId,
            source: 'sp_skill',
            skillId: skill.skillId,
            skillName: skill.name,
            targetType: String(part?.target_type ?? ''),
            ...change,
          })
        );
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
      if (
        skillType !== 'Zone' &&
        skillType !== 'RiceFieldZone' &&
        skillType !== 'Disaster' &&
        !/Territory$/i.test(skillType)
      ) {
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

      if (skillType === 'Disaster') {
        const change = applyDisasterChange(state.turnState, {
          levelDelta: Number(part?.power?.[0] ?? 0),
        });
        if (!change) {
          continue;
        }
        const disasterFieldEvent = createDisasterFieldEvent(change, {
          source: 'active_skill',
        });
        if (!disasterFieldEvent) {
          continue;
        }
        events.push(
          buildActionScopedEvent(actionEntry, {
            actorCharacterId: actor.characterId,
            skillId: skill.skillId,
            skillName: skill.name,
            ...disasterFieldEvent,
          })
        );
        continue;
      }

      const applied =
        skillType === 'Zone' || skillType === 'RiceFieldZone'
          ? applyZonePartToTurnState(state.turnState, part, 'player')
          : applyTerritoryPartToTurnState(state.turnState, part, 'player');
      if (!applied) {
        continue;
      }
      if (skillType === 'Zone' || skillType === 'RiceFieldZone') {
        const zoneUpEternalModifier = resolveZoneUpEternalModifier(state, actor, skill, actionEntry);
        if (zoneUpEternalModifier.active) {
          const basePowerRate = Number(applied.powerRate ?? state.turnState.zoneState?.powerRate ?? 0);
          const nextPowerRate = basePowerRate + Number(zoneUpEternalModifier.powerBonusRate ?? 0);
          if (Number.isFinite(nextPowerRate) && nextPowerRate > 0) {
            applied.powerRate = nextPowerRate;
          }
          if (zoneUpEternalModifier.makesFiniteZoneEternal && applied.remainingTurns !== null) {
            applied.remainingTurns = null;
          }
          state.turnState.zoneState = {
            ...state.turnState.zoneState,
            ...(Number.isFinite(nextPowerRate) && nextPowerRate > 0 ? { powerRate: nextPowerRate } : {}),
            ...(zoneUpEternalModifier.makesFiniteZoneEternal && applied.remainingTurns === null
              ? { remainingTurns: null }
              : {}),
          };
        }
      }
      events.push(
        buildActionScopedEvent(actionEntry, {
          actorCharacterId: actor.characterId,
          skillId: skill.skillId,
          skillName: skill.name,
          kind: (skillType === 'Zone' || skillType === 'RiceFieldZone') ? 'zone' : 'territory',
          ...applied,
        })
      );
    }
  }

  return events;
}

function applyRecoveryPipeline(
  party,
  turnState,
  { skipTurnStartRecovery = false, stageSetupTurnly = null, stageSetupEnchantEffects = null } = {}
) {
  // extra turn のコミット時（T1EX→T2遷移）は skipTurnStartRecovery=false で呼ばれるため
  // T2のターン開始回復・OnEveryTurnを正常に計算する。
  // T1→T1EX遷移時の回避は skipTurnStartRecovery: true（行8634）で制御済み。

  const recoveryEvents = [];
  const epEvents = [];
  const dpEvents = [];
  const passiveEvents = [];

  // skipTurnStartRecovery=true の場合はターン開始時の基本回復・EP回復・パッシブをスキップする。
  // （次のターンが EX ターンになる場合：EX ターンは独立したターン開始処理を持たないため）
  // OD 発動ボーナス（isFirstOdAction）は「ターン開始」ではなく「OD 起動時の一回限りのボーナス」
  // であるため、EX 遷移時でも適用される。
  if (!skipTurnStartRecovery) {
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
  }

  if (!skipTurnStartRecovery) {
    applyStageSetupTurnStartEffects(
      {
        party,
        turnState,
        stageSetupTurnly,
        stageSetupEnchantEffects,
      },
      recoveryEvents,
      passiveEvents
    );
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

function computeNextTurnState(current, grantedExtraCharacterIds = [], options = {}) {
  const next = cloneTurnState(current);
  next.sequenceId += 1;
  if (options.forceNextBaseTurn) {
    next.turnType = 'normal';
    next.turnIndex = Number(current.turnIndex ?? 1) + 1;
    next.turnLabel = `T${next.turnIndex}`;
    next.odLevel = 0;
    next.remainingOdActions = 0;
    next.odContext = null;
    next.odSuspended = false;
    next.odPending = false;
    next.extraTurnState = null;
    return next;
  }
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

export function previewTurn(state, actions, enemyAction = null, enemyCount = null, options = {}) {
  const resolvedEnemyCount = clampEnemyCount(
    enemyCount ?? state?.turnState?.enemyState?.enemyCount ?? DEFAULT_ENEMY_COUNT
  );
  const sortedActions = validateActionDict(state, actions, options);
  const { actionEntries, projectedState } = previewActionEntries(state, sortedActions, resolvedEnemyCount, {
    buffMetadataValidation: options?.buffMetadataValidation ?? options?.validateBuffMetadata,
  });
  const snapBefore = snapshotPartyByPartyIndex(state.party);

  const record = fromSnapshot(
    snapBefore,
    buildTurnContext(state.turnState, enemyAction, resolvedEnemyCount),
    actionEntries,
    [],
    state.turnState.sequenceId
  );

  const transcendenceSummary = applyTranscendenceTurnSummary(
    projectedState,
    computeTranscendenceTurnSummary(projectedState, record)
  );
  const spAfterActionByPartyIndex = {};
  for (const member of projectedState.party) {
    const pi = Number(member.partyIndex);
    if (Number.isInteger(pi)) {
      spAfterActionByPartyIndex[pi] = member.sp.current;
    }
  }

  record.projections = {
    odGaugeAtEnd: Number(projectedState.turnState.odGauge ?? 0),
    transcendence: transcendenceSummary,
    spAfterActionByPartyIndex,
  };

  return record;
}

function buildActionSelectionPassiveEvents(previewRecord) {
  const turnLabel = String(previewRecord?.turnLabel ?? '');
  const events = [];
  for (const entry of previewRecord?.actions ?? []) {
    for (const event of entry?.specialPassiveEvents ?? []) {
      if (String(event?.timing ?? '') !== 'OnEveryTurnIncludeSpecial') {
        continue;
      }
      events.push({
        ...structuredClone(event),
        source: 'action_selection',
        timing: 'OnEveryTurnIncludeSpecial',
        turnLabel,
        actionInstanceId: String(entry?.actionInstanceId ?? ''),
        skillId: Number(entry?.skillId ?? 0),
        skillName: String(entry?.skillName ?? entry?.skillLabel ?? ''),
        actingCharacterId: String(entry?.characterId ?? ''),
        actingCharacterName: String(entry?.characterName ?? ''),
      });
    }
  }
  return events;
}

export function commitTurn(state, previewRecord, swapEvents = [], options = {}) {
  if (!previewRecord || previewRecord.recordStatus !== 'preview') {
    throw new Error('commitTurn requires preview TurnRecord.');
  }
  if (!Array.isArray(state.turnState?.[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY])) {
    state.turnState[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY] = [];
  }
  syncTurnStateEnemyCount(state?.turnState, Number(previewRecord.enemyCount ?? DEFAULT_ENEMY_COUNT));
  const allAliveEnemiesDownAtTurnStart = areAllAliveEnemiesDownTurn(state.turnState);
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
  const boundarySpEvents = [];
  const enemyAttackEvents = [];
  const removeDebuffEvents = [];
  const epSkillEvents = [];
  const skillSpEvents = [];
  const actionDpEvents = [];
  const dpHealMotivationEvents = [];
  const tokenEvents = [];
  const moraleEvents = [];
  const spPassiveEvents = [];
  const actionSelectionPassiveEvents = buildActionSelectionPassiveEvents(previewRecord);
  const additionalTurnPassiveGrantedIds = [];
  const dpPassiveEvents = [];
  const dpPassiveMotivationEvents = [];
  const passiveTriggerEvents = [];
  const motivationEvents = [];
  const markEvents = [];
  const fieldStateEvents = [];
  const doubleActionStatusEvents = [];
  const funnelEvents = [];
  const sprightlyEvents = [];
  const activeBuffStatusEvents = [];
  const buffStatusEvents = [];
  const guardEvents = [];
  const shreddingEvents = [];
  const enemyStatusEvents = [];
  const enemyBreakEvents = [];
  const enemyHpBreakEvents = [];
  const enemyKillEvents = [];
  const breakDownTurnUpEvents = [];
  let forceNextBaseTurn = false;
  let odGaugeGain = {
    startOdGauge: truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0)),
    endOdGauge: truncateToTwoDecimals(Number(state.turnState.odGauge ?? 0)),
    events: [],
  };

  for (const entry of previewRecord.actions) {
    const actionResult = applyCommittedActionSideEffects(state, entry, {
      buffMetadataValidation: options?.buffMetadataValidation ?? options?.validateBuffMetadata,
      validatePreview: true,
      enemyCount: Number(previewRecord.enemyCount ?? DEFAULT_ENEMY_COUNT),
    });
    removeDebuffEvents.push(...actionResult.removeDebuffEvents);
    epSkillEvents.push(...actionResult.epSkillEvents);
    skillSpEvents.push(...actionResult.skillSpEvents);
    actionDpEvents.push(...actionResult.actionDpEvents);
    dpHealMotivationEvents.push(...actionResult.dpHealMotivationEvents);
    tokenEvents.push(...actionResult.tokenEvents);
    moraleEvents.push(...actionResult.moraleEvents);
    spPassiveEvents.push(...actionResult.spPassiveEvents);
    additionalTurnPassiveGrantedIds.push(...actionResult.additionalTurnPassiveGrantedIds);
    dpPassiveEvents.push(...actionResult.dpPassiveEvents);
    dpPassiveMotivationEvents.push(...actionResult.dpPassiveMotivationEvents);
    passiveTriggerEvents.push(...actionResult.passiveTriggerEvents);
    motivationEvents.push(...actionResult.motivationEvents);
    markEvents.push(...actionResult.markEvents);
    fieldStateEvents.push(...actionResult.fieldStateEvents);
    doubleActionStatusEvents.push(...actionResult.doubleActionStatusEvents);
    funnelEvents.push(...actionResult.funnelEvents);
    sprightlyEvents.push(...actionResult.sprightlyEvents);
    activeBuffStatusEvents.push(...actionResult.activeBuffStatusEvents);
    buffStatusEvents.push(...actionResult.buffStatusEvents);
    guardEvents.push(...actionResult.guardEvents);
    shreddingEvents.push(...actionResult.shreddingEvents);
    enemyStatusEvents.push(...actionResult.enemyStatusEvents);
    enemyBreakEvents.push(...actionResult.enemyBreakEvents);
    enemyHpBreakEvents.push(...actionResult.enemyHpBreakEvents);
    enemyKillEvents.push(...actionResult.enemyKillEvents);
    breakDownTurnUpEvents.push(...actionResult.breakDownTurnUpEvents);
    odGaugeGain = {
      startOdGauge: Number(odGaugeGain.startOdGauge ?? 0),
      endOdGauge: Number(actionResult.odGaugeGain?.endOdGauge ?? odGaugeGain.endOdGauge ?? 0),
      events: [...(odGaugeGain.events ?? []), ...(actionResult.odGaugeGain?.events ?? [])],
    };
    if ((actionResult.enemyHpBreakEvents?.length ?? 0) > 0) {
      forceNextBaseTurn = true;
      break;
    }
  }
  // EXターン遷移判定を applyRecoveryPipeline より前に確定させる
  // （normal/od → extra 遷移時にSP回復が実行されるバグを防ぐため）
  const battleEndedAfterActions =
    Number(getEnemyState(state.turnState).enemyCount ?? 0) > 0 &&
    countAliveEnemies(state.turnState) === 0;
  const shouldForceNextBaseTurn = forceNextBaseTurn || battleEndedAfterActions;
  const shouldActivateInterruptOdAfterActions =
    shouldActivateInterruptOd && !shouldForceNextBaseTurn;
  const grantedExtraCharacterIdsForNextTurn = battleEndedAfterActions ? [] : [
    ...deriveGrantedExtraTurnCharacterIds(state, previewRecord),
    ...additionalTurnPassiveGrantedIds,
  ];
  const newlyShreddedIds = new Set(shreddingEvents.map((ev) => String(ev.characterId)));
  const transcendenceSummary = applyTranscendenceTurnSummary(
    state,
    computeTranscendenceTurnSummary(state, previewRecord)
  );
  const playerTurnContinuesAfterActions =
    !shouldForceNextBaseTurn &&
    (
      grantedExtraCharacterIdsForNextTurn.length > 0 ||
      shouldActivateInterruptOdAfterActions ||
      (String(state.turnState?.turnType ?? '') === 'od' && Number(state.turnState?.remainingOdActions ?? 0) > 1) ||
      (
        String(state.turnState?.turnType ?? '') === 'extra' &&
        (
          Number(state.turnState?.extraTurnState?.remainingActions ?? 0) > 1 ||
          Boolean(state.turnState?.odSuspended)
        )
      )
    );
  // ─── ② ターンフェーズ: プレイヤーターン終了後処理 ───
  if (!playerTurnContinuesAfterActions) {
    tickEnemyStatusDurations(state.turnState, 'PlayerTurnEnd');
  }
  updateReinforcedModeStateAfterTurn(state);
  tickShreddingTurns(state, previewRecord, newlyShreddedIds);

  if (applySwapOnCommit) {
    applySwapEvents(state, swapEvents);
  }

  // ─── 次ターン状態の確定 ───
  const nextTurnState = computeNextTurnState(state.turnState, grantedExtraCharacterIdsForNextTurn, {
    forceNextBaseTurn: shouldForceNextBaseTurn,
  });
  const nextTurnLabel = nextTurnState.turnLabel;
  const nextBaseTurnAdvances =
    !shouldActivateInterruptOdAfterActions &&
    Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0);
  const leavesAdditionalTurnContext =
    String(state.turnState?.turnType ?? '') === 'extra' &&
    String(nextTurnState?.turnType ?? '') !== 'extra';
  nextTurnState.passiveEventsLastApplied = [];
  nextTurnState[PURSUIT_TRANSFORM_USED_CHARACTER_IDS_KEY] = [];
  // P3-B: PlayerTurnEnd パッシブの発火フラグをリセット（新プレイヤーターン開始時、または追加ターン終了後のOD復帰時）
  if (nextBaseTurnAdvances || leavesAdditionalTurnContext) {
    nextTurnState.passiveTurnFiredKeys = [];
  }
  if (
    String(state.turnState?.turnType ?? '') !== 'extra' &&
    String(nextTurnState?.turnType ?? '') === 'extra'
  ) {
    clearAdditionalHitOnWeakPassiveTurnFiredKeys(nextTurnState, state.party);
  }
  if (Number.isFinite(previewRecord.enemyCount)) {
    if (!nextTurnState.enemyState) {
      nextTurnState.enemyState = { enemyCount: previewRecord.enemyCount, statuses: [] };
    } else {
      nextTurnState.enemyState.enemyCount = previewRecord.enemyCount;
    }
  }
  if (battleEndedAfterActions && nextTurnState.enemyState) {
    nextTurnState.enemyState.allEnemiesDefeated = true;
  }

  // ─── ② ターンフェーズ: ▽敵行動開始 (OnEnemyTurnStart) ───
  if (nextBaseTurnAdvances && !battleEndedAfterActions) {
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
    boundarySpEvents.push(...(enemyTurnStartResult.spEvents ?? []));
    nextTurnState.passiveEventsLastApplied = [...(nextTurnState.passiveEventsLastApplied ?? []), ...passiveEvents];
  }

  // ─── ③ 終了フェーズ: バトル勝利 (OnBattleWin) ───
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

  // ─── 割込OD turnIndex 補正 ───
  if (shouldActivateInterruptOdAfterActions) {
    // 割込ODは「現在通常ターンの後段」に差し込まれるため、
    // ODが終わるまで base turn index を進めない。
    nextTurnState.turnIndex = Number(state.turnState.turnIndex ?? nextTurnState.turnIndex ?? 1);
    if (String(nextTurnState.turnType ?? '') === 'normal') {
      nextTurnState.turnLabel = `T${nextTurnState.turnIndex}`;
    }
  }

  // ─── ② ターンフェーズ: ▽敵が行動後処理 ───
  // Enemy statuses tick on enemy-turn consumption only.
  // In this simulator, enemy turn is consumed when base turn index advances (Tn -> Tn+1).
  if (
    !battleEndedAfterActions &&
    Number(nextTurnState.turnIndex ?? 0) > Number(state.turnState.turnIndex ?? 0)
  ) {
    const enemyAttackDpEvents = applyEnemyAttackDpDamage(state, enemyAttackTargetCharacterIds);
    if (enemyAttackDpEvents.length > 0) {
      boundaryDpEvents.push(...enemyAttackDpEvents);
    }
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
    // 霊符仕様: 敵の行動終了時に霊符レベルを0にリセット
    const talismanAtEnemyTurnEnd = getTalismanState(nextTurnState);
    if (talismanAtEnemyTurnEnd.active && talismanAtEnemyTurnEnd.level > 0) {
      setTalismanState(nextTurnState, { ...talismanAtEnemyTurnEnd, level: 0 });
    }
  }

  // ─── ② 次ターン ターン開始 (applyRecoveryPipeline) ───
  // turnIndex が実際に進む場合のみターン開始回復を適用する。
  // 以下のケースでは turnIndex が進まないためスキップされる:
  //   - 追加ターン付与（→EX）: turnIndex 据え置き
  //   - 割込OD 発動: turnIndex 補正で据え置き
  //   - OD 連続アクション: turnIndex 不変
  //   - 先制OD 終了→同一ターン復帰: turnIndex 不変
  // nextTurnState を渡すことで ReviveTerritory 消費・ゾーン状態更新が次ターンの状態に正しく反映される
  // turnIndex が有限数でない場合（テスト等でのデフォルト turnState）は
  // フォールバックとして回復ありとする
  const currentTurnIndex = Number(state.turnState?.turnIndex);
  const nextTurnIndex = Number(nextTurnState?.turnIndex);
  const nextTurnIndexAdvances =
    Number.isFinite(currentTurnIndex) && Number.isFinite(nextTurnIndex)
      ? nextTurnIndex > currentTurnIndex
      : true;
  const recovery = applyRecoveryPipeline(state.party, nextTurnState, {
    skipTurnStartRecovery: !nextTurnIndexAdvances,
    stageSetupTurnly: state.stageSetupTurnly,
    stageSetupEnchantEffects: state.stageSetupEnchantEffects,
  });
  const recoveryEvents = [...skillSpEvents, ...recovery.spEvents, ...spPassiveEvents];
  const epEvents = [...epSkillEvents, ...recovery.epEvents];
  const recoveryDpEvents = Array.isArray(recovery.dpEvents) ? [...recovery.dpEvents] : [];
  // recovery.passiveEvents のターンラベルを nextTurnLabel で付与し、passiveEventsLastApplied に追記
  // （OnEnemyTurnStart・OnBattleWin の後に続くことで turn_timing.md の発火順に準拠する）
  if (Array.isArray(recovery.passiveEvents) && recovery.passiveEvents.length > 0) {
    nextTurnState.passiveEventsLastApplied = [
      ...(nextTurnState.passiveEventsLastApplied ?? []),
      ...structuredClone(recovery.passiveEvents).map((e) => ({ ...e, turnLabel: nextTurnLabel })),
    ];
  }

  // ─── record entry 更新（recovery 後のため endSP が次ターン開始後の正確な値）───
  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    entry.endSP = member.sp.current;
    entry.endEP = member.ep.current;
    entry.endToken = Number(member.tokenState?.current ?? entry.endToken ?? 0);
    entry.endMorale = Number(member.moraleState?.current ?? entry.endMorale ?? 0);
    entry.endMotivation = Number(member.motivationState?.current ?? entry.endMotivation ?? 0);
    entry.endMarkStates = structuredClone(member.markStates ?? {});

    const extraChanges = recoveryEvents
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preSP: ev.startSP,
        postSP: ev.endSP,
        eventCeiling: ev.eventCeiling,
      }));

    entry.spChanges = [...entry.spChanges, ...extraChanges];
    entry.epChanges = epEvents
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => ({
        source: ev.source,
        delta: ev.delta,
        preEP: ev.startEP,
        postEP: ev.endEP,
        eventCeiling: ev.eventCeiling,
      }));
    const extraTokenChanges = tokenEvents
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
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
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => ({
        source: ev.source,
        triggerType: ev.triggerType,
        delta: ev.delta,
        preMorale: ev.startMorale,
        postMorale: ev.endMorale,
        eventCeiling: ev.eventCeiling,
      }));
    entry.moraleChanges = [...(entry.moraleChanges ?? []), ...extraMoraleChanges];
    const extraMotivationChanges = [...motivationEvents, ...dpHealMotivationEvents, ...dpPassiveMotivationEvents]
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
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
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
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
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => mapDpEventToRecordChange(ev));
    const recoveryDpChanges = recoveryDpEvents
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          characterKey: 'characterId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => mapDpEventToRecordChange(ev));
    const passiveDpChanges = dpPassiveEvents
      .filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          actionEntries: previewRecord.actions,
        })
      )
      .map((ev) => mapDpEventToRecordChange(ev));
    entry.dpChanges = [...actionDpChanges, ...recoveryDpChanges, ...passiveDpChanges];
    const odEvent = odGaugeGain.events.find((ev) =>
      eventBelongsToActionEntry(entry, ev, {
        characterKey: 'characterId',
        skillKey: 'skillId',
        actionEntries: previewRecord.actions,
      })
    );
    entry.odGaugeGain = Number(odEvent?.odGaugeGain ?? 0);
    entry.damageContext = odEvent?.damageContext ? structuredClone(odEvent.damageContext) : null;
    if (entry.damageContext) {
      const contextFunnelHitBonus = Number(entry.damageContext.funnelHitBonus ?? 0);
      const previewFunnelHitBonus = Number(entry.skillFunnelHitBonus ?? 0);
      if (
        Number.isFinite(contextFunnelHitBonus) &&
        contextFunnelHitBonus !== previewFunnelHitBonus
      ) {
        entry.skillFunnelHitBonus = contextFunnelHitBonus;
        entry.skillHitCount = Number(
          entry.damageContext.effectiveHitCountPerEnemy ?? entry.skillHitCount ?? 0
        );
        entry.skillBaseHitCount = Number(entry.damageContext.baseHitCount ?? entry.skillBaseHitCount ?? 0);
      }
    }
    entry.consumedFunnelEffects = structuredClone(odEvent?.consumedFunnelEffects ?? []);
    entry.consumedMindEyeEffects = structuredClone(odEvent?.consumedMindEyeEffects ?? []);
    entry.funnelApplied = funnelEvents.filter((ev) =>
      eventBelongsToActionEntry(entry, ev, {
        actorKey: 'actorCharacterId',
        skillKey: 'skillId',
        actionEntries: previewRecord.actions,
      })
    );
    entry.statusEffectsApplied = [
      ...doubleActionStatusEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...sprightlyEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...activeBuffStatusEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...buffStatusEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...guardEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
    ];
    entry.statusEffectsRemoved = removeDebuffEvents.filter((ev) =>
      eventBelongsToActionEntry(entry, ev, {
        actorKey: 'actorCharacterId',
        skillKey: 'skillId',
        actionEntries: previewRecord.actions,
      })
    );
    entry.fieldStateApplied = fieldStateEvents.filter((ev) =>
      eventBelongsToActionEntry(entry, ev, {
        actorKey: 'actorCharacterId',
        skillKey: 'skillId',
        actionEntries: previewRecord.actions,
      })
    );
    entry.enemyStatusChanges = [
      ...enemyStatusEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...enemyKillEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...enemyBreakEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          skillKey: 'skillId',
          actionEntries: previewRecord.actions,
        })
      ),
      ...breakDownTurnUpEvents.filter((ev) =>
        eventBelongsToActionEntry(entry, ev, {
          actorKey: 'actorCharacterId',
          actionEntries: previewRecord.actions,
        })
      ),
    ];
  }
  syncExtraActiveFlags(state.party, nextTurnState.extraTurnState?.allowedCharacterIds ?? []);

  let nextState = {
    ...state,
    party: state.party.map((m) => m.clone()),
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
    boundarySpEvents.push(...(additionalTurnStartResult.spEvents ?? []));
    nextState.turnState.passiveEventsLastApplied = [
      ...(nextState.turnState.passiveEventsLastApplied ?? []),
      ...passiveEvents,
    ];
  }

  if (shouldActivateInterruptOdAfterActions) {
    nextState = activateOverdrive(nextState, interruptOdLevel, 'interrupt', {
      forceActivation: forceOdActivation,
      forceConsumeGauge: forceResourceDeficit,
    });
    if (Array.isArray(nextState.turnState?.passiveEventsLastApplied)) {
      boundaryPassiveEvents.push(...structuredClone(nextState.turnState.passiveEventsLastApplied));
    }
  }
  applyTurnBasedStatusExpiry(nextState, nextState.turnState);
  removeByakkoRushStateWhenDpBelowCondition(nextState);
  const allAliveEnemiesDownAtTurnEnd = areAllAliveEnemiesDownTurn(nextState.turnState);
  if (allAliveEnemiesDownAtTurnEnd && !allAliveEnemiesDownAtTurnStart) {
    nextState.turnState.holdUpActive = true;
  } else if (!allAliveEnemiesDownAtTurnEnd) {
    nextState.turnState.holdUpActive = false;
  }

  const snapAfter = snapshotPartyByPartyIndex(nextState.party);
  const committed = commitRecord(previewRecord, snapAfter, swapEvents);
  committed.transcendence = transcendenceSummary;
  committed.skillSpEvents = structuredClone(skillSpEvents);
  committed.passiveSpEvents = structuredClone([...recovery.spEvents, ...boundarySpEvents]);
  committed.passiveEvents = structuredClone([
    ...currentTurnPassiveEvents,
    ...actionSelectionPassiveEvents,
    ...passiveTriggerEvents,
    ...boundaryPassiveEvents,
  ]);
  committed.dpEvents = structuredClone([...actionDpEvents, ...dpPassiveEvents, ...recoveryDpEvents, ...boundaryDpEvents]);
  committed.enemyAttackEvents = structuredClone(enemyAttackEvents);
  committed.enemyAttackTargetCharacterIds = structuredClone(enemyAttackTargetCharacterIds);
  committed.stateSnapshot = {
    markStateByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, structuredClone(m.markStates ?? {})])
    ),
    statusEffectsByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, structuredClone(m.statusEffects ?? [])])
    ),
    zoneState: structuredClone(nextState.turnState.zoneState ?? null),
    territoryState: structuredClone(nextState.turnState.territoryState ?? null),
    tokenStateByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, structuredClone(m.tokenState ?? { current: 0, min: 0, max: 10 })])
    ),
    shreddingTurnsRemainingByPartyIndex: Object.fromEntries(
      nextState.party.map((m) => [m.partyIndex, Number(m.shreddingTurnsRemaining ?? 0)])
    ),
    enemyStatusSnapshot: structuredClone(nextState.turnState.enemyState?.statuses ?? []),
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
  applyOverdriveStartSpRecovery(nextState, nextTurnState);

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
  }
  const odPassiveResult = applyPassiveTimingInternal(nextState, ['OnOverdriveStart']);
  nextState.turnState.passiveEventsLastApplied = odPassiveResult.passiveEvents;

  return nextState;
}

export function applyInitialPassiveState(state) {
  if (!state || !Array.isArray(state.party) || !state.turnState) {
    return state;
  }
  // ─── ① 開始フェーズ: バトル開始 / 初戦開始 ───
  initializeIntrinsicMarkStatesFromParty(state.party);
  const battleStartResult = applyPassiveTimingInternal(state, BATTLE_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [...battleStartResult.passiveEvents];
  // ─── ② T1 ターン開始 ───
  applyIntrinsicMarkTurnStartRecovery(state.party);
  const turnStartResult = applyPassiveTimingInternal(state, TURN_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [
    ...state.turnState.passiveEventsLastApplied,
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

/**
 * Constructs an ActionContext object for use with shouldConsume().
 * Maps action type, skill info, and turn state into a unified context.
 * 
 * @param {string} actionType - One of: 'NormalAttack', 'Skill', 'Pursuit', 'TurnEnd', 'Manual', 'System', 'SpecialStatus', 'AdditionalTurn'
 * @param {Object} skill - Skill object (optional, null for non-skill actions)
 * @param {Object} options - Additional context options
 * @param {boolean} [options.isNormalAttack] - True if action is normal attack
 * @param {boolean} [options.isPursuit] - True if action is pursuit attack
 * @param {string} [options.turnPhase] - Turn phase ('PlayerTurn', 'EnemyTurn', 'OverdriveTurn', etc.)
 * @param {boolean} [options.hasDamage] - True if action/skill contains damage parts (default: inferred from skill)
 * @returns {Object} ActionContext object with actionType, skill, hasDamage, turnPhase, and judgment flags
 */
export function buildActionContext(actionType, skill = null, options = {}) {
  const normalizedActionType = String(actionType ?? '').trim();

  // Determine if action has damage (from options or skill parts)
  let hasDamage = Boolean(options.hasDamage);
  if (!hasDamage && skill && typeof skill === 'object') {
    const parts = Array.isArray(skill.parts) ? skill.parts : [];
    hasDamage = parts.some((part) => {
      const skillType = String(part?.skill_type ?? '').trim();
      return OD_DAMAGE_PART_TYPES.has(skillType);
    });
  }

  // Build context based on actionType
  const context = {
    actionType: normalizedActionType,
    skill: skill && typeof skill === 'object' ? skill : null,
    hasDamage: Boolean(hasDamage),
    turnPhase: String(options.turnPhase ?? 'Unknown'),
    actorCharacterId: String(options.actorCharacterId ?? ''),

    // Judgment flags (populated by shouldConsume logic)
    isNormalAttack: Boolean(options.isNormalAttack || normalizedActionType === 'NormalAttack'),
    isPursuit: Boolean(options.isPursuit || normalizedActionType === 'Pursuit'),
    isManualAction: normalizedActionType === 'Manual',
    isTurnEndAction:
      normalizedActionType === 'TurnEnd' ||
      normalizedActionType === 'PlayerTurnEnd' ||
      normalizedActionType === 'EnemyTurnEnd',
    isSystemAction: normalizedActionType === 'System' || normalizedActionType === 'SpecialStatus',
  };

  return context;
}
