import {
  createBattleState,
  cloneTurnState,
  snapshotPartyByPartyIndex,
  buildPositionMap,
} from '../contracts/interfaces.js';
import { fromSnapshot, commitRecord, buildTurnContext } from '../records/record-assembler.js';
import { buildDamageCalculationContext } from '../domain/damage-calculation-context.js';
import {
  OD_RECOVERY_BY_LEVEL,
  OD_COST_BY_LEVEL,
  OD_GAUGE_PER_HIT_PERCENT,
  OD_GAUGE_MIN_PERCENT,
  OD_GAUGE_MAX_PERCENT,
  DEFAULT_ENEMY_COUNT,
  OD_LEVELS,
  DRIVE_PIERCE_OPTION_VALUES,
  DRIVE_PIERCE_BASE_BONUS_AT_HIT_1,
  DRIVE_PIERCE_MAX_REFERENCE_HIT,
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
const TURN_START_PASSIVE_TIMINGS = Object.freeze(['OnEveryTurn']);
const BATTLE_START_PASSIVE_TIMINGS = Object.freeze(['OnBattleStart']);
export const SUPPORTED_PASSIVE_TIMINGS = Object.freeze(['OnOverdriveStart']);
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
  IsCharacter: Object.freeze({ tier: 'ready_now', note: 'can be derived from party membership without new state' }),
  ConquestBikeLevel: Object.freeze({ tier: 'manual_state', note: 'manual external setting' }),
  DamageRate: Object.freeze({ tier: 'manual_state', note: 'manual enemy state until damage sim exists' }),
  Random: Object.freeze({ tier: 'manual_state', note: 'manual / debug random policy' }),
  DpRate: Object.freeze({ tier: 'stateful_future', note: 'needs DP current/max state and updates' }),
  Token: Object.freeze({ tier: 'stateful_future', note: 'needs token current state and updates' }),
  MoraleLevel: Object.freeze({ tier: 'stateful_future', note: 'needs morale state and updates' }),
  MotivationLevel: Object.freeze({ tier: 'stateful_future', note: 'needs motivation state and updates' }),
  FireMarkLevel: Object.freeze({ tier: 'stateful_future', note: 'needs fire mark level state and updates' }),
  IceMarkLevel: Object.freeze({ tier: 'stateful_future', note: 'needs ice mark level state and updates' }),
  IsZone: Object.freeze({ tier: 'stateful_future', note: 'needs field zone state' }),
  IsTerritory: Object.freeze({ tier: 'stateful_future', note: 'needs territory state' }),
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

function isNormalAttackSkill(skill) {
  const name = String(skill?.name ?? '');
  const label = String(skill?.label ?? '');
  return name === '通常攻撃' || label.endsWith('AttackNormal');
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

function hasOverDrivePointUpPartInParts(parts) {
  for (const part of parts ?? []) {
    if (String(part?.skill_type ?? '') === 'OverDrivePointUp') {
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
    default:
      return {
        known: false,
        value: true,
      };
  }
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
    return { enemyCount: DEFAULT_ENEMY_COUNT, statuses: [] };
  }
  const enemyCount = clampEnemyCount(state.enemyCount ?? DEFAULT_ENEMY_COUNT);
  return {
    enemyCount,
    statuses: Array.isArray(state.statuses) ? state.statuses : [],
  };
}

function isEnemyStatusPersistent(status) {
  return String(status?.statusType ?? '') === ENEMY_STATUS_BREAK;
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

function tickEnemyStatuses(turnState) {
  const enemyState = getEnemyState(turnState);
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
  };
}

function evaluateCountBCPredicate(innerExpression, state, member) {
  const inner = String(innerExpression ?? '').replace(/\s+/g, '');
  if (!inner) {
    return { known: false, value: true };
  }

  if (inner === 'IsPlayer()') {
    return { known: true, value: state.party.length };
  }

  if (inner === 'IsFront()==0&&IsPlayer()') {
    const backlineCount = state.party.filter((item) => item.position >= 3).length;
    return { known: true, value: backlineCount };
  }

  if (inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)>0') {
    const count = state.party.filter((item) => item.isExtraActive).length;
    return { known: true, value: count };
  }

  if (inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)>=1') {
    const count = state.party.filter((item) => item.isExtraActive).length;
    return { known: true, value: count };
  }

  if (inner === 'IsPlayer()==1&&SpecialStatusCountByType(20)==0') {
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
        if (!clause) {
          return true;
        }
        if (clause === 'IsFront()==0') {
          return Number(candidate?.position ?? -1) >= 3;
        }
        if (clause === 'IsFront()==1') {
          return Number(candidate?.position ?? 99) <= 2;
        }
        let m = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]+)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
        if (m) {
          const resolved = resolveSingleArgConditionValue(m[1], m[2], state, candidate);
          if (!resolved.known) {
            return false;
          }
          return compareNumbers(Number(resolved.value), m[3], Number(m[4]));
        }
        m = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]+)\)$/);
        if (m) {
          const resolved = resolveSingleArgConditionValue(m[1], m[2], state, candidate);
          if (!resolved.known) {
            return false;
          }
          return Boolean(Number(resolved.value));
        }
        return false;
      });
      if (matched) {
        count += 1;
      }
    }
    return { known: true, value: count };
  }

  const clauses = inner.split('&&').filter(Boolean);
  const hasAllBrokenEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('IsBroken()==1');
  if (hasAllBrokenEnemyClauses) {
    const count = countEnemiesWithStatus(state?.turnState, ENEMY_STATUS_BREAK);
    return { known: true, value: count };
  }

  const hasBrokenAndHighDamageEnemyClauses =
    clauses.length === 4 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('IsBroken()==1') &&
    clauses.some((clause) => clause.startsWith('DamageRate()'));
  if (hasBrokenAndHighDamageEnemyClauses) {
    return { known: false, value: true };
  }

  const hasAllDownTurnEnemyClauses =
    clauses.length === 3 &&
    clauses.includes('IsPlayer()==0') &&
    clauses.includes('IsDead()==0') &&
    clauses.includes('BreakDownTurn()>0');
  if (hasAllDownTurnEnemyClauses) {
    const count = countEnemiesWithStatus(state?.turnState, ENEMY_STATUS_DOWN_TURN);
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
    const m = text.match(/^PlayedSkillCount\(([^)]*)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
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
    const m = text.match(/^SpecialStatusCountByType\(20\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
    if (m) {
      const active = member?.isExtraActive ? 1 : 0;
      return { known: true, value: compareNumbers(active, m[1], Number(m[2])) };
    }
  }

  {
    const m = text.match(/^CountBC\((.+)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
    if (m) {
      const evaluated = evaluateCountBCPredicate(m[1], state, member);
      if (!evaluated.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(evaluated.value), m[2], Number(m[3])) };
    }
  }

  {
    const m = text.match(
      /^([A-Za-z_][A-Za-z0-9_]*)\(([^)]+)\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/
    );
    if (m) {
      const resolved = resolveSingleArgConditionValue(m[1], m[2], state, member);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(resolved.value), m[3], Number(m[4])) };
    }
  }

  {
    const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]+)\)$/);
    if (m) {
      const resolved = resolveSingleArgConditionValue(m[1], m[2], state, member);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: Boolean(Number(resolved.value)) };
    }
  }

  {
    const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\(\)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const resolved = resolveZeroArgConditionValue(m[1], state, member, skill, actionEntry);
      if (!resolved.known) {
        return { known: false, value: true };
      }
      return { known: true, value: compareNumbers(Number(resolved.value), m[2], Number(m[3])) };
    }
  }
  {
    const m = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\(\)$/);
    if (m) {
      const resolved = resolveZeroArgConditionValue(m[1], state, member, skill, actionEntry);
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

function resolveSkillScalarField(skillLike, candidates, fallback = null) {
  for (const key of candidates) {
    if (skillLike?.[key] !== undefined && skillLike?.[key] !== null) {
      return skillLike[key];
    }
  }
  return fallback;
}

function resolveEffectiveSkillVariant(skill, state, member) {
  const recurse = (skillLike) => {
    const fallbackParts = Array.isArray(skillLike?.parts) ? skillLike.parts : [];
    let resolved = {
      spCost: Number(resolveSkillScalarField(skillLike, ['spCost', 'sp_cost'], 0)),
      consumeType: String(resolveSkillScalarField(skillLike, ['consumeType', 'consume_type'], 'Sp')),
      targetType: String(resolveSkillScalarField(skillLike, ['targetType', 'target_type'], '')),
      hitCount: Number(resolveSkillScalarField(skillLike, ['hitCount', 'hit_count'], 0)),
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
      resolved = {
        ...resolved,
        spCost: nested.spCost,
        consumeType: nested.consumeType,
        targetType: nested.targetType,
        hitCount: nested.hitCount,
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
    parts: effective.parts,
  };
}

export function resolveEffectiveSkillForAction(state, member, skill) {
  if (!skill || !member || !state) {
    return skill;
  }
  return resolveEffectiveSkillVariant(skill, state, member);
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
    if (String(part?.skill_type ?? '') !== 'OverDrivePointUp') {
      continue;
    }
    if (!evaluateOdGaugePartCondition(part, state, member, skill, actionEntry)) {
      continue;
    }

    const partPercent = resolveOverDrivePointUpPowerPercent(part);
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
  let hitCount = hitCountPerEnemy * (isAllTarget ? numericEnemyCount : 1);
  if (isNormalAttackSkill(skill)) {
    // 通常攻撃はヒット数に関わらず最低3hit(=7.5%)保証。
    hitCount = Math.max(3, hitCount);
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

    const skill = member.getSkill(actionEntry.skillId);
    if (!skill) {
      continue;
    }

    const effectiveParts = resolveEffectiveSkillParts(skill, state, member);
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
      baseHitCount,
      funnelHitBonus,
      effectiveHitCountPerEnemy,
      effectiveHitCountTotal: effectiveHitCount,
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
      if (!evaluateOdGaugePartCondition(part, state, actor, skill, actionEntry)) {
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
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition)) {
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

function isTargetConditionSatisfiedByMember(targetMember, expression) {
  const expr = String(expression ?? '').replace(/\s+/g, '');
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
    const m = expr.match(/^IsCharacter\(([^)]+)\)==1$/);
    if (m) {
      return String(targetMember?.characterId ?? '') === String(m[1] ?? '').trim();
    }
  }
  {
    const m = expr.match(/^IsCharacter\(([^)]+)\)==0$/);
    if (m) {
      return String(targetMember?.characterId ?? '') !== String(m[1] ?? '').trim();
    }
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
      if (isTargetConditionSatisfiedByMember(actorMember, targetCondition)) {
        ids.add(actorMember.characterId);
      }
      continue;
    }

    if (targetType === 'AllyFront') {
      for (const member of frontline) {
        if (isTargetConditionSatisfiedByMember(member, targetCondition)) {
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
      if (target && isTargetConditionSatisfiedByMember(target, targetCondition)) {
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
      if (target && isTargetConditionSatisfiedByMember(target, targetCondition)) {
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

    if (!skipSkillConditions) {
      const skillConditions = [
        { label: 'cond', expression: skill.cond },
        { label: 'iuc_cond', expression: skill.iucCond },
      ];
      for (const condition of skillConditions) {
        const expr = String(condition.expression ?? '').trim();
        if (!expr) {
          continue;
        }
        const evaluated = evaluateConditionExpression(expr, state, member, skill, action);
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
      breakHitCount: Number(action?.breakHitCount ?? 0),
      targetCharacterId: String(action?.targetCharacterId ?? ''),
      _baseRevision: preview.baseRevision,
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
  return conditions.every((expr) => evaluateConditionExpression(expr, state, member, null).result);
}

function applyPassiveSpByTiming(state, timings = [], options = {}) {
  const timingSet = new Set((Array.isArray(timings) ? timings : [timings]).map((value) => String(value)));
  const events = [];
  const passiveEvents = [];
  const turnState = state?.turnState ?? {};

  for (const member of state?.party ?? []) {
    for (const passive of member.passives ?? []) {
      if (!timingSet.has(String(passive?.timing ?? ''))) {
        continue;
      }

      let matched = false;
      let totalDelta = 0;
      const effectTypes = new Set();
      for (const part of passive.parts ?? []) {
        if (String(part?.skill_type ?? '') !== 'HealSp') {
          continue;
        }
        if (!evaluatePassiveSelfConditions(passive, part, state, member)) {
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
          if (!isTargetConditionSatisfiedByMember(target, part?.target_condition)) {
            continue;
          }
          const change = target.applySpDelta(amount, 'passive');
          events.push({
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
          effectTypes.add('HealSp');
        }
      }

      if (matched) {
        passiveEvents.push(
          createPassiveTriggerEvent(turnState, member, passive, {
            source: 'passive',
            effectTypes: [...effectTypes],
            spDelta: totalDelta,
          })
        );
      }
    }
  }

  return { spEvents: events, passiveEvents };
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
      const condTexts = [part.cond, part.hit_condition, part.target_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, member, skill, actionEntry).result
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

      const condTexts = [part?.cond, part?.hit_condition]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const condSatisfied = condTexts.every((expr) =>
        evaluateConditionExpression(expr, state, actor, skill, actionEntry).result
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
        if (!isTargetConditionSatisfiedByMember(target, part?.target_condition)) {
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

function applyRecoveryPipeline(party, turnState) {
  const recoveryEvents = [];
  const epEvents = [];
  const passiveEvents = [];

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

  const passiveSpResult = applyPassiveSpByTiming(
    {
      party,
      turnState,
    },
    TURN_START_PASSIVE_TIMINGS
  );
  if (passiveSpResult.spEvents.length > 0) {
    recoveryEvents.push(...passiveSpResult.spEvents);
  }
  if (passiveSpResult.passiveEvents.length > 0) {
    passiveEvents.push(...passiveSpResult.passiveEvents);
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
      baseRevision: entry._baseRevision,
    });
  }

  const epSkillEvents = applySkillSelfEpGains(state, previewRecord);
  const skillSpEvents = applySkillSpGains(state, previewRecord);
  const funnelEvents = applyFunnelEffectsFromActions(state, previewRecord);
  const odGaugeGain = applyOdGaugeFromActions(state, previewRecord);
  const transcendenceSummary = applyTranscendenceTurnSummary(
    state,
    computeTranscendenceTurnSummary(state, previewRecord)
  );
  const recovery = applyRecoveryPipeline(state.party, state.turnState);
  const recoveryEvents = [...skillSpEvents, ...recovery.spEvents];
  const epEvents = [...epSkillEvents, ...recovery.epEvents];

  for (const entry of previewRecord.actions) {
    const member = findMemberByCharacterId(state, entry.characterId);
    entry.endSP = member.sp.current;
    entry.endEP = member.ep.current;

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
    const odEvent = odGaugeGain.events.find(
      (ev) => ev.characterId === entry.characterId && ev.skillId === entry.skillId
    );
    entry.odGaugeGain = Number(odEvent?.odGaugeGain ?? 0);
    entry.funnelApplied = funnelEvents.filter(
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

  const snapAfter = snapshotPartyByPartyIndex(state.party);
  const committed = commitRecord(previewRecord, snapAfter, swapEvents);
  committed.transcendence = transcendenceSummary;
  const nextTurnState = computeNextTurnState(state.turnState, grantedExtraCharacterIds);
  nextTurnState.passiveEventsLastApplied = Array.isArray(recovery.passiveEvents)
    ? structuredClone(recovery.passiveEvents)
    : [];
  committed.passiveEvents = Array.isArray(recovery.passiveEvents)
    ? structuredClone(recovery.passiveEvents)
    : [];
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
    tickEnemyStatuses(nextTurnState);
  }
  syncExtraActiveFlags(state.party, nextTurnState.extraTurnState?.allowedCharacterIds ?? []);

  let nextState = {
    ...state,
    party: [...state.party],
    positionMap: buildPositionMap(state.party),
    turnState: nextTurnState,
  };

  if (shouldActivateInterruptOd) {
    nextState = activateOverdrive(nextState, interruptOdLevel, 'interrupt', {
      forceActivation: forceOdActivation,
      forceConsumeGauge: forceResourceDeficit,
    });
    committed.passiveEvents = Array.isArray(nextState.turnState?.passiveEventsLastApplied)
      ? structuredClone(nextState.turnState.passiveEventsLastApplied)
      : [];
  }

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

  const battleStartResult = applyPassiveSpByTiming(state, BATTLE_START_PASSIVE_TIMINGS);
  const turnStartResult = applyPassiveSpByTiming(state, TURN_START_PASSIVE_TIMINGS);
  state.turnState.passiveEventsLastApplied = [
    ...battleStartResult.passiveEvents,
    ...turnStartResult.passiveEvents,
  ];
  return state;
}

export function grantExtraTurn(state, allowedCharacterIds) {
  const ids = [...new Set(allowedCharacterIds ?? [])];
  const nextTurnState = {
    ...cloneTurnState(state.turnState),
    turnType: 'extra',
    turnLabel: 'EX',
    extraTurnState: {
      active: true,
      remainingActions: 1,
      allowedCharacterIds: ids,
      grantTurnIndex: state.turnState.turnIndex,
    },
  };

  return {
    ...state,
    party: state.party.map((member) => {
      member.setExtraActive(ids.includes(member.characterId));
      return member;
    }),
    turnState: nextTurnState,
  };
}
